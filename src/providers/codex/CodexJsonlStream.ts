import { Writable } from "node:stream";
import { z } from "zod";
import type { ProjectBuilderEvent } from "../../application/project/ProjectWorkflowPorts.js";

const tokens = z.number().int().safe().nonnegative();
const envelope = z.looseObject({ type: z.string().min(1) });
const threadEvent = z.looseObject({
  type: z.literal("thread.started"),
  thread_id: z.string().min(1),
});
const completionEvent = z.looseObject({
  type: z.literal("turn.completed"),
  usage: z.looseObject({
    input_tokens: tokens,
    cached_input_tokens: tokens.optional(),
    output_tokens: tokens,
  }),
});
const itemEvent = z.looseObject({
  type: z.enum(["item.started", "item.updated", "item.completed"]),
  item: z.looseObject({ id: z.string().min(1), type: z.string().min(1) }),
});
const turnFailure = z.looseObject({
  type: z.literal("turn.failed"),
  error: z.looseObject({ message: z.string() }),
});
const errorEvent = z.looseObject({
  type: z.literal("error"),
  message: z.string(),
});

/** A stream issue remains separate from the owned process's physical outcome. */
export interface CodexStreamIssue {
  readonly kind: "protocol" | "output-limit" | "event-sink";
  readonly reason: string;
}

/** Facts observed from Codex JSONL; they do not establish project acceptance. */
export interface CodexStreamObservation {
  readonly sessionId: string | null;
  readonly completed: boolean;
  readonly failed: boolean;
  readonly observedTokens: number | null;
  readonly stdout: string;
  readonly observedBytes: number;
  readonly truncated: boolean;
  readonly unknownEvents: readonly string[];
  readonly issue: CodexStreamIssue | undefined;
}

/**
 * Decode live JSONL with bounded retention. Parser/event-sink failures are
 * recorded while writes keep succeeding, preserving OwnedCommand's outcome.
 */
export class CodexJsonlStream extends Writable {
  readonly #decoder = new TextDecoder("utf-8", { fatal: true });
  readonly #chunks: Buffer[] = [];
  readonly #unknown = new Set<string>();
  readonly #limit = new AbortController();
  #bytes = 0;
  #retained = 0;
  #pending = "";
  #sessionId: string | null = null;
  #started = false;
  #completed = false;
  #failed = false;
  #observedTokens: number | null = null;
  #issue: CodexStreamIssue | undefined;
  #eventFailure: CodexStreamIssue | undefined;

  constructor(
    private readonly maxBytes: number,
    private readonly onEvent?: (
      event: ProjectBuilderEvent,
    ) => void | Promise<void>,
  ) {
    super();
  }

  /** Output exhaustion requests owned cleanup without failing the stdout pipe. */
  get exceeded(): AbortSignal {
    return this.#limit.signal;
  }

  /** Read retained observations even after cancellation or a nonzero exit. */
  observation(): CodexStreamObservation {
    return {
      sessionId: this.#sessionId,
      completed: this.#completed,
      failed: this.#failed,
      observedTokens: this.#observedTokens,
      stdout: Buffer.concat(this.#chunks, this.#retained).toString("utf8"),
      observedBytes: this.#bytes,
      truncated: this.#bytes > this.#retained,
      unknownEvents: [...this.#unknown],
      issue: this.#issue ?? this.#eventFailure,
    };
  }

  /** Require a complete terminal record only after physical output has settled. */
  completionIssue(): CodexStreamIssue | undefined {
    if (this.#issue !== undefined) return this.#issue;
    if (this.#eventFailure !== undefined) return this.#eventFailure;
    if (!this.writableFinished)
      return {
        kind: "protocol",
        reason: "Codex JSONL output ended before stream collection completed",
      };
    if (this.#failed) return undefined;
    if (this.#sessionId === null || !this.#started || !this.#completed)
      return {
        kind: "protocol",
        reason: "Codex did not report a complete thread and turn",
      };
    return undefined;
  }

  override _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.#bytes += chunk.byteLength;
    const admitted = Math.min(
      chunk.byteLength,
      Math.max(0, this.maxBytes - this.#retained),
    );
    if (admitted > 0) {
      this.#chunks.push(Buffer.from(chunk.subarray(0, admitted)));
      this.#retained += admitted;
    }
    const finish = (): void => {
      if (admitted < chunk.byteLength) {
        const issue: CodexStreamIssue = {
          kind: "output-limit",
          reason: `Codex stdout exceeded the ${this.maxBytes}-byte retention allowance`,
        };
        this.#issue ??= issue;
        this.#limit.abort(issue);
      }
      callback();
    };
    if (this.#issue !== undefined) {
      finish();
      return;
    }
    // The retained prefix can contain complete session/usage events before
    // the cutoff, even when the producer wrote all records in one chunk.
    void this.#consume(chunk.subarray(0, admitted)).then(
      finish,
      (cause: unknown) => {
        this.#reject(cause);
        finish();
      },
    );
  }

  override _final(callback: (error?: Error | null) => void): void {
    if (this.#issue !== undefined) {
      callback();
      return;
    }
    void this.#finish().then(
      () => callback(),
      (cause: unknown) => {
        this.#reject(cause);
        callback();
      },
    );
  }

  async #consume(chunk: Buffer): Promise<void> {
    this.#pending += this.#decoder.decode(chunk, { stream: true });
    for (;;) {
      const newline = this.#pending.indexOf("\n");
      if (newline === -1) return;
      const line = this.#pending.slice(0, newline).replace(/\r$/u, "");
      this.#pending = this.#pending.slice(newline + 1);
      if (line.trim().length > 0) await this.#line(line);
    }
  }

  async #finish(): Promise<void> {
    this.#pending += this.#decoder.decode();
    if (this.#pending.trim().length > 0) await this.#line(this.#pending);
    this.#pending = "";
  }

  async #line(line: string): Promise<void> {
    const value: unknown = JSON.parse(line);
    const event = envelope.parse(value);
    const kind = this.#interpret(event.type, value);
    if (this.onEvent === undefined || this.#eventFailure !== undefined) return;
    try {
      await this.onEvent({
        kind,
        observed_at: new Date().toISOString(),
        text: line,
        ...(this.#sessionId === null ? {} : { session_id: this.#sessionId }),
      });
    } catch (cause: unknown) {
      this.#eventFailure = {
        kind: "event-sink",
        reason: `Codex progress delivery failed: ${describe(cause)}`,
      };
    }
  }

  #interpret(type: string, value: unknown): ProjectBuilderEvent["kind"] {
    switch (type) {
      case "thread.started":
        return this.#startThread(value);
      case "turn.started":
        if (
          this.#sessionId === null ||
          this.#started ||
          this.#completed ||
          this.#failed
        )
          throw new Error("Codex reported an out-of-order turn start");
        this.#started = true;
        return "progress";
      case "turn.completed":
        return this.#completeTurn(value);
      case "turn.failed":
        turnFailure.parse(value);
        if (this.#completed)
          throw new Error("Codex failed after declaring the turn complete");
        this.#failed = true;
        return "message";
      case "error":
        errorEvent.parse(value);
        this.#failed = true;
        return "message";
      case "item.started":
      case "item.updated":
      case "item.completed": {
        if (!this.#started || this.#completed || this.#failed)
          throw new Error("Codex reported an item outside its active turn");
        const { item } = itemEvent.parse(value);
        if (item.type === "agent_message") return "message";
        if (
          [
            "command_execution",
            "file_change",
            "mcp_tool_call",
            "web_search",
          ].includes(item.type)
        )
          return "tool";
        return "progress";
      }
      default:
        this.#unknown.add(type);
        return "progress";
    }
  }

  #startThread(value: unknown): ProjectBuilderEvent["kind"] {
    const event = threadEvent.parse(value);
    if (this.#sessionId !== null || this.#started || this.#completed)
      throw new Error("Codex reported a duplicate or out-of-order thread");
    this.#sessionId = event.thread_id;
    return "session";
  }

  #completeTurn(value: unknown): ProjectBuilderEvent["kind"] {
    const event = completionEvent.parse(value);
    if (!this.#started || this.#completed || this.#failed)
      throw new Error("Codex reported a contradictory turn completion");
    const usage = event.usage;
    const total = usage.input_tokens + usage.output_tokens;
    if (
      !Number.isSafeInteger(total) ||
      (usage.cached_input_tokens ?? 0) > usage.input_tokens
    )
      throw new Error("Codex reported inconsistent token usage");
    this.#observedTokens = total;
    this.#completed = true;
    return "progress";
  }

  #reject(cause: unknown): void {
    this.#issue ??= {
      kind: "protocol",
      reason: `Invalid Codex JSONL: ${describe(cause)}`,
    };
    this.#pending = "";
  }
}

const describe = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

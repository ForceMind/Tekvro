// Authored JSONL protocol fixture executed by real Node processes. This is not
// Codex, does not contact a model, and cannot establish real-agent qualification.
const [mode, ...args] = process.argv.slice(2);
const emit = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);

if (args[0] === "--version") {
  process.stdout.write(
    mode === "bad-probe"
      ? "other-command 1\n"
      : "codex-cli 0.0.0-protocol-fixture\n",
  );
} else if (args.includes("--help")) {
  process.stdout.write(
    "Protocol fixture options: --json --sandbox --cd --model\n",
  );
} else {
  let instruction = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) instruction += chunk;
  if (mode !== "no-output" && mode !== "coalesced-oversized") {
    emit({ type: "thread.started", thread_id: "protocol-fixture-session" });
    emit({ type: "turn.started" });
  }
  switch (mode) {
    case "coalesced-oversized":
      process.stdout.write(
        [
          { type: "thread.started", thread_id: "protocol-fixture-session" },
          { type: "turn.started" },
          {
            type: "item.completed",
            item: {
              id: "large",
              type: "agent_message",
              text: "x".repeat(32_768),
            },
          },
        ]
          .map((event) => JSON.stringify(event))
          .join("\n") + "\n",
      );
      break;
    case "no-output":
      break;
    case "malformed":
      process.stdout.write("this is not a JSON event\n");
      break;
    case "truncated":
      process.stdout.write('{"type":"turn.completed","usage":');
      break;
    case "invalid-utf8":
      process.stdout.write(Buffer.from([0xff, 0x0a]));
      break;
    case "duplicate-terminal":
      emit({
        type: "turn.completed",
        usage: { input_tokens: 12, output_tokens: 3 },
      });
      emit({
        type: "turn.completed",
        usage: { input_tokens: 12, output_tokens: 3 },
      });
      break;
    case "failed-turn":
      emit({
        type: "turn.failed",
        error: { message: "Protocol fixture model failure" },
      });
      break;
    case "nonzero":
      process.stderr.write("Protocol fixture initialization failed\n");
      process.exitCode = 7;
      break;
    case "oversized":
      emit({
        type: "item.completed",
        item: { id: "large", type: "agent_message", text: "x".repeat(32_768) },
      });
      emit({
        type: "turn.completed",
        usage: { input_tokens: 12, output_tokens: 3 },
      });
      break;
    case "held":
      setInterval(() => {}, 1_000);
      break;
    default:
      emit({
        type: "item.started",
        item: {
          id: "command",
          type: "command_execution",
          command: "protocol-fixture-only",
          status: "in_progress",
        },
      });
      emit({
        type: "item.updated",
        item: {
          id: "command",
          type: "command_execution",
          status: "completed",
          exit_code: 0,
        },
      });
      emit({
        type: "item.completed",
        item: {
          id: "message",
          type: "agent_message",
          text: "Agent text says all checks passed; this is not independent validation.",
          instruction,
          args,
          sentinel: process.env.CODEX_PROTOCOL_FIXTURE_SENTINEL,
        },
      });
      emit({
        type: "fixture.extension",
        detail: "Retained but not interpreted",
      });
      emit({
        type: "turn.completed",
        usage: { input_tokens: 12, cached_input_tokens: 8, output_tokens: 3 },
      });
      if (mode === "sink-nonzero") {
        process.stderr.write("Protocol fixture exited after its final event\n");
        process.exitCode = 9;
      }
  }
}

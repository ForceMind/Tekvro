// Real Node process implementing an authored Codex JSONL protocol fixture.
// This is not Codex, does not contact a model and does not qualify its sandbox.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const args = process.argv.slice(2);
assert.equal(args[0], "exec");
assert.equal(args[args.indexOf("--sandbox") + 1], "workspace-write");
assert.equal(args[args.indexOf("--cd") + 1], process.cwd());
assert.ok(args.includes("--json"));
assert.ok(args.includes("--skip-git-repo-check"));
assert.equal(args.at(-1), "-");
assert.ok(!args.includes("resume"));
let instruction = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) instruction += chunk;
const requested = JSON.parse(instruction);
assert.equal(typeof requested.text, "string");
const sessionId = `protocol-fixture-${randomUUID()}`;
await appendFile(
  process.env.CODEX_PROTOCOL_FIXTURE_COUNTER,
  `${JSON.stringify({ fixture: "codex-jsonl-workflow", session_id: sessionId, argv: args, workspace: process.cwd(), instruction })}\n`,
);
const emit = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);
emit({ type: "thread.started", thread_id: sessionId });
emit({ type: "turn.started" });
await writeFile(join(process.cwd(), "answer.txt"), requested.text);
emit({
  type: "item.completed",
  item: {
    id: "fixture-message",
    type: "agent_message",
    text: "Protocol fixture claims success; only the external oracle can check the candidate.",
  },
});
emit({ type: "turn.completed", usage: { input_tokens: 5, output_tokens: 2 } });

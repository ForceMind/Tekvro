import { describe, expect, it } from "vitest";

import {
  parseClientRegistration,
  parseClientRegistrationLauncher,
} from "./ClientRegistration.js";
import type { SetupClient } from "./SupportedClients.js";

const opencode: SetupClient = {
  name: "opencode",
  configPath: "/configuration/opencode.json",
  format: "opencode",
};

describe("OpenCode launcher admission", () => {
  it("rejects an empty executable without inventing a launcher", () => {
    for (const command of [[], [""], ["", "mcp"]]) {
      const registration = { type: "local", command };
      const projected = parseClientRegistrationLauncher(registration, opencode);
      const full = parseClientRegistration(registration, opencode);
      for (const parsed of [projected, full]) {
        expect(parsed.ok).toBe(false);
        if (parsed.ok) continue;
        expect(parsed.error.settings).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              setting: command.length === 0 ? "command" : "command.0",
            }),
          ]),
        );
      }
    }
  });

  it("retains empty arguments in the exact declared argv", () => {
    const registration = {
      type: "local",
      command: ["/usr/bin/node", "", "mcp", "--json"],
    };
    const launcher = parseClientRegistrationLauncher(registration, opencode);
    expect(launcher).toEqual({
      ok: true,
      value: { command: "/usr/bin/node", args: ["", "mcp", "--json"] },
    });
    const full = parseClientRegistration(registration, opencode);
    expect(full.ok).toBe(true);
    if (!full.ok) throw full.error;
    expect(full.value.command).toBe("/usr/bin/node");
    expect(full.value.args).toEqual(["", "mcp", "--json"]);
  });
});

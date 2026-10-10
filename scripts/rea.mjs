#!/usr/bin/env node

import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Route production MCP before importing Incur. Incur owns registration helpers
// such as `mcp add`, while only dist/main.js may serve the stdio tool catalog.
const args = process.argv.slice(2);
const { default: packageJson } = await import("../package.json", {
  with: { type: "json" },
});
process.env.REA_PACKAGE_VERSION = packageJson.version;
const isMcpMode =
  args.length === 1 && (args[0] === "--mcp" || args[0] === "mcp");
const isMcpDoctorMode = args[0] === "mcp" && args[1] === "doctor";
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeFiles = isMcpMode
  ? ["dist/main.js"]
  : isMcpDoctorMode
    ? ["dist/main.js", "dist/mcpDoctor.js"]
    : ["dist/cli.js", "dist/cliOutput.js", "dist/cli/streamedJsonOutput.js"];

if (!(await compiledRuntimeExists(runtimeFiles))) {
  const currentLocale = process.env.TEKVRO_LANG ?? process.env.LANG ?? "";
  const isZhLocale = /^zh(?:[_-]|$)/iu.test(currentLocale);
  process.stderr.write(
    isZhLocale
      ? `Tekvro 探核缺少本地运行文件。请在 ${packageRoot} 执行 npm ci && npm run build:cached，然后重启。请勿用公开 rea-agents 包代替私有 Tekvro。\n`
      : `Tekvro's local build is missing. Run npm ci && npm run build:cached from ${packageRoot}, then restart. Do not replace this private checkout with the public rea-agents package.\n`,
  );
  process.exitCode = 1;
} else if (isMcpMode) {
  const { runEntrypoint } = await import("../dist/main.js");
  await runEntrypoint();
} else if (isMcpDoctorMode) {
  const { runProductionMcpDoctorCli } = await import("../dist/mcpDoctor.js");
  const result = await runProductionMcpDoctorCli(args.slice(2), {
    dispatcherPath: fileURLToPath(import.meta.url),
    packageRoot,
  });
  process.stdout.write(result.output);
  process.exitCode = result.exitCode;
} else {
  const { createCli } = await import("../dist/cli.js");
  const { createStreamedCliJsonOutput } =
    await import("../dist/cli/streamedJsonOutput.js");
  const {
    renderCliOutputArgumentError,
    renderEmptyFilteredCliOutput,
    sanitizeCliOutput,
    validateCliOutputArguments,
  } = await import("../dist/cliOutput.js");
  const outputArguments = validateCliOutputArguments(args);
  if (!outputArguments.ok) {
    process.stdout.write(renderCliOutputArgumentError(outputArguments));
    process.exitCode = 1;
  } else {
    let wroteOutput = false;
    const resultOutput = createStreamedCliJsonOutput(args, process.stdout);
    await createCli(process.env, resultOutput).serve(args, {
      stdout: (output) => {
        if (resultOutput?.handled) {
          if (resultOutput.failed)
            process.stderr.write(sanitizeCliOutput(output));
          return;
        }
        const sanitized = sanitizeCliOutput(output);
        if (sanitized.length > 0) wroteOutput = true;
        process.stdout.write(sanitized);
      },
    });
    if (!wroteOutput && !resultOutput?.handled)
      process.stdout.write(renderEmptyFilteredCliOutput(args) ?? "");
  }
}

async function compiledRuntimeExists(paths) {
  for (const path of paths) {
    try {
      await access(resolve(packageRoot, path));
    } catch (cause) {
      if (isMissing(cause)) return false;
      throw cause;
    }
  }
  return true;
}

function isMissing(cause) {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    cause.code === "ENOENT"
  );
}

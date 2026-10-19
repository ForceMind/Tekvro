#!/usr/bin/env python3
"""Assemble a REA 6.5.0 engine integration prototype without touching main.

Run only on integration/rea-6.5.0-engine-prototype-20261015 with the pinned
upstream checkout supplied as argument. Preserve Tekvro public identity,
release safety, and already committed Chinese documentation/entrypoints.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path.cwd()
EXPECTED = "3b79af28e80785afce9f5998d8f03289402a1847"
BRANCH = "integration/rea-6.5.0-engine-prototype-20261015"


def verified_source(upstream: Path) -> None:
    current = subprocess.check_output(
        ["git", "branch", "--show-current"], text=True
    ).strip()
    if current != BRANCH:
        raise RuntimeError(f"Wrong branch: {current}")
    sha = subprocess.check_output(
        ["git", "-C", str(upstream), "rev-parse", "HEAD"], text=True
    ).strip()
    if sha != EXPECTED:
        raise RuntimeError(f"Invalid upstream SHA: {sha}")
    if not (upstream / "package.json").is_file():
        raise RuntimeError("Upstream package manifest not found")


def replace_exact(path: Path, old: str, new: str) -> None:
    source = path.read_text(encoding="utf-8")
    if old not in source:
        raise RuntimeError(f"Expected patch context not found in {path}: {old[:95]}")
    path.write_text(source.replace(old, new, 1), encoding="utf-8")


def main() -> None:
    if len(sys.argv) != 2:
        raise RuntimeError("Pass the pinned upstream checkout path")
    upstream = Path(sys.argv[1]).resolve()
    verified_source(upstream)

    oldpkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    if oldpkg.get("name") != "tekvro" or oldpkg.get("private") is not True:
        raise RuntimeError("Protected Tekvro package identity is not present")
    saved_files = {
        "src/cli/localization.ts": (ROOT / "src/cli/localization.ts").read_bytes(),
        "scripts/verify-published-package.mjs": (ROOT / "scripts/verify-published-package.mjs").read_bytes(),
        "tests/boundary/cli/localizedJavaScriptHelp.test.ts": (
            ROOT / "tests/boundary/cli/localizedJavaScriptHelp.test.ts"
        ).read_bytes(),
    }

    # Replace the engine as one coherent release, but never overlay product
    # documentation, registry manifests, permissions, CI, installer or licenses.
    for directory in ["src", "bridge", "scripts", "tests", "native"]:
        dst = ROOT / directory
        if dst.exists():
            shutil.rmtree(dst)
        shutil.copytree(upstream / directory, dst, symlinks=True)

    for filename in [
        "tsconfig.json",
        "tsconfig.build.json",
        "vitest.config.ts",
        "turbo.json",
        "knip.json",
        ".jscpd.json",
        ".oxlintrc.json",
        ".oxfmtrc.json",
        ".gitattributes",
    ]:
        if (upstream / filename).is_file():
            shutil.copy2(upstream / filename, ROOT / filename)
    for directory in ["licenses", ".agents"]:
        if (upstream / directory).is_dir():
            dst = ROOT / directory
            if dst.exists():
                shutil.rmtree(dst)
            shutil.copytree(upstream / directory, dst)

    for relative, data in saved_files.items():
        dest = ROOT / relative
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)

    newpkg = json.loads((upstream / "package.json").read_text(encoding="utf-8"))
    # Product version does not automatically become upstream's 6.5.0.
    for key in ["name", "mcpName", "version", "description", "repository",
                "homepage", "bugs", "bin"]:
        newpkg[key] = oldpkg[key]
    newpkg["private"] = True
    newpkg["license"] = oldpkg["license"]
    (ROOT / "package.json").write_text(
        json.dumps(newpkg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    shutil.copy2(upstream / "package-lock.json", ROOT / "package-lock.json")

    identity = ROOT / "src/identity.ts"
    replace_exact(
        identity, 'displayName: "REA",',
        'displayName: "Tekvro",\n  privateSourceBuild: true,\n  legacyPackageName: "rea-agents",'
    )

    # A development build must never create new npm/bunx registrations.
    registration = ROOT / "src/application/ClientRegistrationIdentity.ts"
    replace_exact(
        registration,
        '): readonly string[] => packageRunnerRegistrationCommand("npx", platform);',
        """): readonly string[] =>
  PRODUCT_IDENTITY.privateSourceBuild
    ? [process.execPath, resolve(process.argv[1] ?? "scripts/rea.mjs"), "mcp"]
    : packageRunnerRegistrationCommand("npx", platform);"""
    )

    # Keep the existing private-source update refusal even after 6.5.0
    # replaces the shared updater implementation.
    update = ROOT / "src/application/Update.ts"
    replace_exact(
        update,
        """): Promise<UpdateResult> => {
  let result: UpdateResult | undefined;""",
        """): Promise<UpdateResult> => {
  if (PRODUCT_IDENTITY.privateSourceBuild)
    return {
      status: "failed",
      currentVersion,
      latestVersion: null,
      reason: "unknown-install-method",
      remediation:
        "Tekvro is a local source build. Update your reviewed Git checkout and rebuild; public npm packages are not Tekvro.",
    };
  let result: UpdateResult | undefined;"""
    )

    # Branding: human help only; do not rename public CLI command IDs.
    cli = ROOT / "src/cli.ts"
    replace_exact(
        cli,
        'description: "Reverse engineer anything from your terminal or agent.",',
        'description: "Tekvro: evidence-driven software analysis through CLI and MCP.",'
    )
    dispatcher = ROOT / "scripts/rea.mjs"
    replace_exact(
        dispatcher,
        "REA's compiled runtime is missing.",
        "Tekvro's compiled runtime is missing."
    )
    replace_exact(
        dispatcher,
        "install dependencies and build REA, then restart it. If this is an installed package, reinstall rea-agents.",
        "install dependencies and build Tekvro, then restart it."
    )

    report = ROOT / "docs/upstream/rea-6.5.0-integration-prototype.md"
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(
        "# REA 6.5.0 → Tekvro 引擎集成原型\n\n"
        "> **开发分支，仅用于功能移植与回归。未经 CI 验证不得合并至 main 或发布。**\n\n"
        "- 锁定上游：§rea-agents-6.5.0§，commit §3b79af28e80785afce9f5998d8f03289402a1847§。\n"
        "- 引入目录：§src/§、§bridge/§、§scripts/§、§tests/§、§native/§；使用对应的编译与测试配置。\n"
        "- 仅保留研究所需的 §licenses/§ 文件；保留 Tekvro 的 §README§、§docs§、§website§、§LICENSE§、§THIRD_PARTY_NOTICES.md§、§.github/workflows§、§install.sh§、§server.json§ 与子模块指针。\n"
        "- 保留 npm 包名 §tekvro§、§private:true§、独立 MCP 名称、§TEKVRO_LANG§ 源码及原有中文 CLI 边界测试（必须通过才可合并）。\n"
        "- 添加开发版 §update§ 拒绝逻辑，将新 MCP 注册路径指定为当前 Node + 本地 CLI，避免误安装上游 npm 包。\n"
        "- 产品版本字段仍沿用 Tekvro 原有 §6.1.0§，不将源代码迁移直接声称为 Tekvro 正式发行 6.5.0。\n"
        "- 该原型可能存在 CLI 中文翻译和新旧构建检查不兼容，须先跑构建、专项测试并修复后才能合并。\n\n"
        "## 自动化验证结果\n\n"
        "由实际运行该分支验证作业后追加，未执行的项目不得标记为通过。\n",
        encoding="utf-8",
    )
    text = report.read_text(encoding="utf-8")
    report.write_text(text.replace("§", chr(96)), encoding="utf-8")
    print("Assembled REA 6.5.0 engine prototype; Tekvro main not affected.")


if __name__ == "__main__":
    main()

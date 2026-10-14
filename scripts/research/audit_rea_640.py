#!/usr/bin/env python3
"""Read-only, reproducible file-level comparison of Tekvro and pinned REA 6.4.0."""
from __future__ import annotations

import hashlib
import os
from collections import Counter
from pathlib import Path
import subprocess

ROOT = Path.cwd()
SOURCE = ROOT / "upstream" / "rea-6.4.0"
OUTPUT = ROOT / "docs" / "upstream" / "rea-6.4.0-source-audit.md"
TAG_COMMIT = "a56f7bb668ab23fec8d33f7af353ac7ed2fe1895"
OLD_SOURCE = "f6fe575094658e99ced78d45f385633fbfaaae32"


def digest(path: Path) -> str:
    if path.is_symlink():
        return "link:" + os.readlink(path)
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def tracked_tekvro() -> dict[str, str]:
    files = subprocess.check_output(["git", "ls-files", "-z"]).split(b"\0")
    result: dict[str, str] = {}
    for name in filter(None, files):
        rel = os.fsdecode(name)
        path = ROOT / rel
        if not rel.startswith("upstream/") and (path.is_file() or path.is_symlink()):
            result[rel] = digest(path)
    return result


def archived_upstream() -> dict[str, str]:
    result: dict[str, str] = {}
    for parent, dirs, names in os.walk(SOURCE, followlinks=False):
        dirs[:] = [name for name in dirs if not (Path(parent) / name).is_symlink()]
        for name in names:
            path = Path(parent) / name
            if path.is_file() or path.is_symlink():
                result[path.relative_to(SOURCE).as_posix()] = digest(path)
    return result


def area(path: str) -> str:
    parts = path.split("/")
    return "/".join(parts[:2]) if parts[0] in {"src", "bridge", "docs", "tests"} and len(parts) > 1 else parts[0]


def section_counts(paths: list[str]) -> list[str]:
    counter = Counter(map(area, paths))
    return ["| 目录 | 文件数 |", "| --- | ---: |"] + [
        f"| §{name}/§ | {count} |" for name, count in counter.most_common(25)
    ]


def main() -> None:
    if not SOURCE.is_dir():
        raise SystemExit("Missing upstream snapshot")
    upstream = archived_upstream()
    tekvro = tracked_tekvro()
    shared = set(upstream) & set(tekvro)
    same = sorted(path for path in shared if upstream[path] == tekvro[path])
    changed = sorted(path for path in shared if upstream[path] != tekvro[path])
    new = sorted(set(upstream) - set(tekvro))
    local_only = sorted(set(tekvro) - set(upstream))
    raw_links = subprocess.check_output(
        ["git", "-C", os.environ["UPSTREAM_GIT_DIR"], "ls-tree", "-r", "HEAD"],
        text=True,
    )
    links = []
    for line in raw_links.splitlines():
        if line.startswith("160000 commit "):
            metadata, path = line.split("\t", 1)
            links.append(f"- §{path}§ at §{metadata.split()[2]}§")
    priority = [
        path for path in changed
        if path.startswith(("src/", "bridge/", "scripts/", "tests/", "package", ".github/"))
    ]
    highlights = [
        "src/adb/", "src/apktool/", "src/jeb/", "src/filesystem/",
        "docs/migration-6.2.md", "docs/adb-device-analysis.md",
        "docs/jeb-analysis.md", "docs/apktool-resource-analysis.md",
        "src/domain/evidence.ts", "src/contracts/", "src/javascript/",
        "src/browser/", "src/ghidra/", "src/server/",
    ]
    lines = [
        "# REA 6.4.0 源码复制与第一轮文件审计",
        "",
        "> 自动生成的文件差异证据，不代表构建或功能验收。",
        "",
        "## 固定来源",
        "",
        "- 仓库：https://github.com/morluto/rea",
        "- Tag：§rea-agents-6.4.0§",
        f"- Commit：§{TAG_COMMIT}§",
        f"- Tekvro 原始引擎来源：§{OLD_SOURCE}§（REA 6.1.0）",
        "- 复制路径：§upstream/rea-6.4.0/§。不对原版源码进行改写。",
        "- 只复制 Git 跟踪的源文件；下方列出的子模块 gitlink 未包含其仓库内容。",
        "- Tekvro 现有源码和独立产品身份未被覆盖。",
        "",
        "## 与 Tekvro 的文件对照",
        "",
        "| 项目 | 数量 |",
        "| --- | ---: |",
        f"| 上游快照文件/软链接 | {len(upstream)} |",
        f"| Tekvro 已跟踪且可读取的文件 | {len(tekvro)} |",
        f"| 重名且字节相同 | {len(same)} |",
        f"| 重名但内容不同 | {len(changed)} |",
        f"| 仅上游存在 | {len(new)} |",
        f"| 仅 Tekvro 存在 | {len(local_only)} |",
        f"| 上游子模块链接 | {len(links)} |",
        "",
        "### 仅上游新增文件较多的目录",
        "",
        *section_counts(new),
        "",
        "### 双方重名但已改动文件较多的目录",
        "",
        *section_counts(changed),
        "",
        "## 需要进一步人工研究的功能入口",
        "",
        *[
            f"- §{path}§：{'存在' if any(p == path or p.startswith(path) for p in upstream) else '未发现'}"
            for path in highlights
        ],
        "",
        "## 部分重名但改动的重点文件",
        "",
        *[f"- §{path}§" for path in priority[:90]],
        "",
        "## 子模块链接（尚未复制实际子模块内容）",
        "",
        *(links if links else ["- 无"]),
        "",
        "## 分析边界与下一步",
        "",
        "1. 研究快照位于隔离分支，不能直接覆盖 Tekvro 主线。",
        "2. 升级要先检查 Evidence、MCP、WebSocket、资源所有权、语义图的 breaking changes。",
        "3. 保留 Tekvro 中文化、§TEKVRO_LANG§、npm/MCP 独立身份、发布保护及 MIT 和第三方版权。",
        "4. 本轮仅复制和静态审计，未运行构建或集成/实机测试。",
        "5. 文件同名或字节相同不代表契约兼容；新功能是否可用需后续验证。",
        "",
    ]
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text("\n".join(lines).replace("§", chr(96)), encoding="utf-8")
    print(
        f"upstream={len(upstream)} local={len(tekvro)} identical={len(same)} "
        f"changed={len(changed)} upstream_only={len(new)} local_only={len(local_only)} gitlinks={len(links)}"
    )


if __name__ == "__main__":
    main()

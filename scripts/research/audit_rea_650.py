#!/usr/bin/env python3
"""File-level, read-only audit of the pinned REA 6.4.0 and 6.5.0 snapshots.

Run from repository root with UPSTREAM_GIT_DIR pointing at the downloaded
6.5.0 Git checkout. This never executes analysis code from either snapshot.
"""
from __future__ import annotations

from collections import Counter
from hashlib import sha256
import os
from pathlib import Path
import subprocess

ROOT = Path.cwd()
OLD = ROOT / "upstream" / "rea-6.4.0"
NEW = ROOT / "upstream" / "rea-6.5.0"
DEST = ROOT / "docs" / "upstream"
EXPECTED = "3b79af28e80785afce9f5998d8f03289402a1847"


def digest(path: Path) -> str:
    if path.is_symlink():
        return "symlink:" + os.readlink(path)
    h = sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def collect(directory: Path) -> dict[str, str]:
    if not directory.is_dir():
        raise RuntimeError(f"Missing source tree: {directory}")
    answer = {}
    for base, dirs, files in os.walk(directory, followlinks=False):
        dirs[:] = [d for d in dirs if not (Path(base) / d).is_symlink()]
        for name in files:
            full = Path(base) / name
            if full.is_file() or full.is_symlink():
                answer[full.relative_to(directory).as_posix()] = digest(full)
    return answer


def tracked_tekvro() -> dict[str, str]:
    results = {}
    for raw in subprocess.check_output(["git", "ls-files", "-z"]).split(b"\0"):
        if not raw:
            continue
        rel = os.fsdecode(raw)
        if rel.startswith("upstream/"):
            continue
        full = ROOT / rel
        if full.is_file() or full.is_symlink():
            results[rel] = digest(full)
    return results


def area(path: str) -> str:
    pieces = path.split("/")
    return "/".join(pieces[:2]) if pieces[0] in {"src", "docs", "tests", "bridge"} and len(pieces) > 1 else pieces[0]


def group_table(paths: list[str]) -> list[str]:
    counts = Counter(area(x) for x in paths)
    return ["| 路径范围 | 数量 |", "| --- | ---: |"] + [
        f"| §{name}/§ | {count} |" for name, count in counts.most_common(25)
    ]


def compare(left: dict[str, str], right: dict[str, str]) -> dict[str, list[str]]:
    lkeys, rkeys = set(left), set(right)
    return {
        "same": sorted(k for k in lkeys & rkeys if left[k] == right[k]),
        "changed": sorted(k for k in lkeys & rkeys if left[k] != right[k]),
        "added": sorted(rkeys - lkeys),
        "removed": sorted(lkeys - rkeys),
    }


def main() -> None:
    upstream_dir = os.environ["UPSTREAM_GIT_DIR"]
    actual = subprocess.check_output(
        ["git", "-C", upstream_dir, "rev-parse", "HEAD"], text=True
    ).strip()
    if actual != EXPECTED:
        raise RuntimeError(f"Expected {EXPECTED}; got {actual}")
    before = collect(OLD)
    after = collect(NEW)
    product = tracked_tekvro()
    delta = compare(before, after)
    residual = compare(product, after)
    links = []
    lines = subprocess.check_output(
        ["git", "-C", upstream_dir, "ls-tree", "-r", "HEAD"], text=True
    )
    for line in lines.splitlines():
        if line.startswith("160000 commit "):
            meta, path = line.split("\t", 1)
            links.append((path, meta.split()[2]))
    checks = [
        "src/domain/javascript/",
        "src/javascript/",
        "src/contracts/",
        "src/application/",
        "src/server/",
        "src/artifacts/",
        "src/ghidra/",
        "src/adb/",
        "src/wasm/",
        "src/sqlite/",
        "src/frida/",
        "src/packet/",
        "src/dart/",
        "src/harmony/",
        "src/browser/",
        "src/electron/",
        "docs/ghidra-riscv.md",
        "docs/mcp-contracts.md",
    ]
    changed_areas = delta["changed"] + delta["added"]
    txt = [
        "# REA 6.5.0 源码复制与文件级差异报告",
        "",
        "> 本报告由受 Git SHA 固定的源码逐字节比较生成；不等价于成功编译或运行验收。",
        "",
        "## 比较基准",
        "",
        "- REA 6.4.0：§a56f7bb668ab23fec8d33f7af353ac7ed2fe1895§，路径 §upstream/rea-6.4.0/§。",
        f"- REA 6.5.0：§{EXPECTED}§，路径 §upstream/rea-6.5.0/§。",
        "- Tekvro：当前研究分支继承的源码（排除 §upstream/§ 目录），来源于独立项目 §main§ 基线。",
        "- 上游实际有 5 个独立 Git submodule 引用；Git 归档仅包括跟踪的普通文件。",
        "",
        "## 6.4.0 → 6.5.0",
        "",
        "| 统计项 | 文件数 |",
        "| --- | ---: |",
        f"| 6.4.0 普通文件 | {len(before)} |",
        f"| 6.5.0 普通文件 | {len(after)} |",
        f"| 路径和字节不变 | {len(delta['same'])} |",
        f"| 同路径内容改变 | {len(delta['changed'])} |",
        f"| 6.5.0 新增路径 | {len(delta['added'])} |",
        f"| 6.5.0 删除路径 | {len(delta['removed'])} |",
        "",
        "### 6.5.0 新增文件最多的目录",
        "",
        *group_table(delta["added"]),
        "",
        "### 6.5.0 同名文件变化最多的目录",
        "",
        *group_table(delta["changed"]),
        "",
        "### 新增或变动的代码范围",
        "",
        *[
            f"- §{p}§：{'已发现变动' if any(x.startswith(p) for x in changed_areas) else '本轮无路径变动'}"
            for p in checks
        ],
        "",
        "## 6.5.0 与 Tekvro 当前引擎的文件级对比",
        "",
        "| 统计项 | 文件数 |",
        "| --- | ---: |",
        f"| Tekvro 现有跟踪文件 | {len(product)} |",
        f"| 两者相同 | {len(residual['same'])} |",
        f"| 同路径发生变化 | {len(residual['changed'])} |",
        f"| 仅 6.5.0 有 | {len(residual['added'])} |",
        f"| 仅 Tekvro 有 | {len(residual['removed'])} |",
        "",
        "## Git 子模块引用（仅 SHA，未包含子模块仓库源文件）",
        "",
        *[f"- §{name}§：§{commit}§" for name, commit in links],
        "",
        "## 研究结论和限制",
        "",
        "1. 6.5.0 文件快照在隔离研究分支；Tekvro §main§ 的包名、中文版、发布保护和程序代码均未被覆盖。",
        "2. 6.5.0 在 6.4.0 的不兼容数据契约上进一步改变了调用图、MCP discovery、JSON null、source map 和进程附着状态；必须逐项对照当前消费者。",
        "3. 新 WASM、SQLite、网络抓包、Flutter、Frida 能力需要检查外部依赖、权限、真实工具测试范围和 CLI/MCP 注册，不能仅因存在目录就声明可用。",
        "4. 本次导入、字节差异审计不等于运行构建；下游实际合入和验收需另开 PR。",
        "",
        "## 全量更改列表",
        "",
        "全部新增、变化和删除的文件路径及两侧 SHA256 位于同目录 §rea-6.5.0-file-diff.tsv§，便于编程筛选。",
        "",
    ]
    DEST.mkdir(parents=True, exist_ok=True)
    (DEST / "rea-6.5.0-delta.md").write_text(
        "\n".join(txt).replace("§", chr(96)), encoding="utf-8"
    )
    diff_lines = ["status\tpath\tsha256_6_4\tsha256_6_5"]
    for status, paths in [
        ("changed", delta["changed"]),
        ("added", delta["added"]),
        ("removed", delta["removed"]),
    ]:
        for path in paths:
            diff_lines.append(
                f"{status}\t{path}\t{before.get(path, '')}\t{after.get(path, '')}"
            )
    (DEST / "rea-6.5.0-file-diff.tsv").write_text(
        "\n".join(diff_lines) + "\n", encoding="utf-8"
    )
    print({
        "rea_6_4_files": len(before),
        "rea_6_5_files": len(after),
        "same": len(delta["same"]),
        "changed": len(delta["changed"]),
        "added": len(delta["added"]),
        "removed": len(delta["removed"]),
        "submodules": len(links),
    })


if __name__ == "__main__":
    main()

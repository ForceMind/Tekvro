#!/usr/bin/env python3
"""Compare pinned REA 6.5.0 and 6.7.0 source snapshots without running them."""
from __future__ import annotations

from collections import Counter
from hashlib import sha256
import os
from pathlib import Path
import subprocess

BASE = Path.cwd()
OLD = BASE / "upstream" / "rea-6.5.0"
NEW = BASE / "upstream" / "rea-6.7.0"
TARGET = BASE / "docs" / "upstream"
EXPECTED = "27dc42d10249f0410904a75c0997842eb03b931c"


def files(path: Path) -> dict[str, str]:
    if not path.is_dir():
        raise RuntimeError(f"Missing pinned snapshot {path}")
    found = {}
    for base, directories, names in os.walk(path, followlinks=False):
        directories[:] = [
            name for name in directories if not (Path(base) / name).is_symlink()
        ]
        for name in names:
            file = Path(base) / name
            if not file.is_file() and not file.is_symlink():
                continue
            if file.is_symlink():
                digest = "link:" + os.readlink(file)
            else:
                hasher = sha256()
                with file.open("rb") as source:
                    for chunk in iter(lambda: source.read(1024 * 1024), b""):
                        hasher.update(chunk)
                digest = hasher.hexdigest()
            found[file.relative_to(path).as_posix()] = digest
    return found


def group(paths: list[str]) -> list[str]:
    def label(path: str) -> str:
        tokens = path.split("/")
        return "/".join(tokens[:2]) if tokens[0] in {
            "src", "tests", "docs", "scripts", "bridge",
        } and len(tokens) > 1 else tokens[0]
    count = Counter(label(path) for path in paths)
    return ["| 路径 | 数量 |", "| --- | ---: |"] + [
        f"| §{directory}/§ | {total} |" for directory, total in count.most_common(30)
    ]


def main() -> None:
    upstream_git = os.environ["UPSTREAM_GIT_DIR"]
    sha = subprocess.check_output(
        ["git", "-C", upstream_git, "rev-parse", "HEAD"], text=True
    ).strip()
    if sha != EXPECTED:
        raise RuntimeError(f"Unexpected tag SHA: {sha}")
    a = files(OLD)
    b = files(NEW)
    common = set(a) & set(b)
    unchanged = sorted(p for p in common if a[p] == b[p])
    changed = sorted(p for p in common if a[p] != b[p])
    added = sorted(set(b) - set(a))
    removed = sorted(set(a) - set(b))
    target_paths = [
        "src/domain/evidence.ts",
        "src/domain/analysisView/javascriptFactsView.ts",
        "src/application/SetupClientConfiguration.ts",
        "src/application/ClientConfigurationDocument.ts",
        "src/contracts/kuna/",
        "src/kuna/",
        "src/domain/android/",
        "src/ghidra/",
        "src/browser/",
        "src/server/",
    ]
    gitlinks = []
    listing = subprocess.check_output(
        ["git", "-C", upstream_git, "ls-tree", "-r", "HEAD"], text=True
    )
    for line in listing.splitlines():
        if line.startswith("160000 commit "):
            entry, name = line.split("\t", 1)
            gitlinks.append((name, entry.split()[2]))
    TARGET.mkdir(parents=True, exist_ok=True)
    text = [
        "# REA 6.7.0 固定源码快照与 6.5.0 差异",
        "",
        "> 文件级静态审计，不代表 Tekvro 的功能集成、构建、实机验证或正式发布。",
        "",
        "## 版本",
        "",
        "- 6.5.0：§3b79af28e80785afce9f5998d8f03289402a1847§。",
        f"- 6.7.0：§{EXPECTED}§。",
        "- 6.6.0 已打 GitHub 标签但没有独立 npm 发行版；npm 最新为 6.7.0。",
        "- 6.7.0 包含 6.6.0 累计更新与重复 JSON/JSONC 成员处理修复。",
        "- 上游代码位置：§upstream/rea-6.7.0/§，旧源码留在 §upstream/rea-6.5.0/§。",
        "",
        "## 文件级统计",
        "",
        "| 指标 | 数量 |",
        "| --- | ---: |",
        f"| 6.5.0 Git 跟踪普通文件 | {len(a)} |",
        f"| 6.7.0 Git 跟踪普通文件 | {len(b)} |",
        f"| 内容相同 | {len(unchanged)} |",
        f"| 内容改变 | {len(changed)} |",
        f"| 新增文件 | {len(added)} |",
        f"| 删除文件 | {len(removed)} |",
        f"| submodule gitlink 数量 | {len(gitlinks)} |",
        "",
        "## 新增文件分布",
        "",
        *group(added),
        "",
        "## 修改文件分布",
        "",
        *group(changed),
        "",
        "## 高优先级源码入口",
        "",
        *[
            f"- §{p}§：{'存在' if any(t == p or t.startswith(p) for t in b) else '未发现'}"
            for p in target_paths
        ],
        "",
        "## 子模块 Gitlink（本快照不携带完整子模块仓库）",
        "",
        *[f"- §{name}§：§{commit}§" for name, commit in gitlinks],
        "",
        "## 迁移审计要点",
        "",
        "1. 先处理 Evidence/快照必需的 §relationship_coverage§，以及 artifact inventory 的覆盖字段变化。旧 Evidence 不自动伪造或静默迁移。",
        "2. 再适配 6.6/6.7 MCP/CLI、配置回写、资源生命周期和客户端状态的契约。",
        "3. JS 精准视图、Kuna、APK 多语言、Ghidra ARM 等应独立打包验收。可选工具需要实际安装和真实目标验证。",
        "4. 保留 Tekvro npm/MCP 独立身份、中文 CLI、本地路径设置、§private:true§、安装器和 Release 防越权保护。",
        "5. 本分支不替换 Tekvro §main§，也不证明 6.5.0 集成分支已经通过所有门槛。",
        "",
        "## 全量路径与哈希",
        "",
        "见 §rea-6.7.0-file-diff.tsv§，保存新增、修改、删除文件对应的原始 SHA256。",
        "",
    ]
    (TARGET / "rea-6.7.0-delta.md").write_text(
        "\n".join(text).replace("§", chr(96)), encoding="utf-8"
    )
    rows = ["status\tpath\tsha256_6_5\tsha256_6_7"]
    for status, paths in (
        ("changed", changed), ("added", added), ("removed", removed)
    ):
        for path in paths:
            rows.append(f"{status}\t{path}\t{a.get(path, '')}\t{b.get(path, '')}")
    (TARGET / "rea-6.7.0-file-diff.tsv").write_text(
        "\n".join(rows) + "\n", encoding="utf-8"
    )
    print({
        "files_65": len(a), "files_67": len(b),
        "unchanged": len(unchanged), "modified": len(changed),
        "added": len(added), "removed": len(removed),
        "submodules": len(gitlinks),
    })


if __name__ == "__main__":
    main()

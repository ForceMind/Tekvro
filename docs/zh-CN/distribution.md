# 发行、安装与更新

Tekvro 1.0.0 通过 [GitHub Release](https://github.com/ForceMind/Tekvro/releases/tag/v1.0.0) 分发。发行版由明确的标签、构建资产、SHA-256 校验文件和发行清单组成。

## 发行资产

| 文件                         | 用途                                                      |
| ---------------------------- | --------------------------------------------------------- |
| `tekvro-1.0.0.tgz`           | 可由 npm 安装的运行归档，包含已构建的 CLI 与 MCP 运行文件 |
| `tekvro-1.0.0-source.tar.gz` | 完整源码归档，包含固定的子模块内容，适合审查与自行构建    |
| `SHA256SUMS`                 | 发行资产的 SHA-256 校验值                                 |
| `release-manifest.json`      | 记录版本、源码提交及发行资产信息                          |

请使用发行页中列出的完整源码资产进行离线审查或构建；自动生成的仓库快照与包含子模块内容的完整源码资产有不同用途。

## 校验下载内容

从同一发行页下载所需归档、`SHA256SUMS` 和 `release-manifest.json`。计算归档的 SHA-256，并与 `SHA256SUMS` 中同名文件的值逐字比较。

Linux：

```bash
sha256sum tekvro-1.0.0.tgz
```

macOS：

```bash
shasum -a 256 tekvro-1.0.0.tgz
```

Windows PowerShell：

```powershell
Get-FileHash .\tekvro-1.0.0.tgz -Algorithm SHA256
```

检查源码归档时，将文件名换成 `tekvro-1.0.0-source.tar.gz`。发行清单用于核对版本与源码提交；SHA-256 校验用于核对下载文件内容。

## 安装

运行环境为 Node.js `^22.23.4 || ^24.22.1 || >=26.12.1` 和 npm，推荐 Node.js `24.22.1`。

在 macOS / Linux 中，可使用版本固定的安装脚本：

```bash
curl -fsSL https://raw.githubusercontent.com/ForceMind/Tekvro/v1.0.0/install.sh -o install-tekvro.sh
bash install-tekvro.sh --version 1.0.0
```

也可以安装已校验的本地归档：

```bash
npm install --global ./tekvro-1.0.0.tgz
tekvro --version
tekvro doctor --json
```

Windows PowerShell 将安装路径写成 `.\tekvro-1.0.0.tgz`。运行依赖由 npm 按发行包声明安装；外部分析工具按任务单独配置。

MCP 客户端配置通过独立步骤应用：

```bash
tekvro setup --dry-run
tekvro setup
```

## 更新版本

1. 在[发行页](https://github.com/ForceMind/Tekvro/releases)查看目标版本的说明、支持范围和变更。
2. 下载并校验对应资产，使用该版本的安装脚本或本地归档安装。
3. 执行 `tekvro --version`、`tekvro doctor --json`，按需重新检查客户端配置。

保留分析目标和历史证据；软件安装目录与用户的分析数据应分开管理。需要复现既有结果时，记录使用的 Tekvro 版本、运行环境、所选工具和目标摘要。

## 从源码构建

完整源码归档解压后，在含 `package.json` 的根目录运行：

```bash
npm ci
npm run build:cached
node scripts/rea.mjs --version
node scripts/rea.mjs doctor --json
```

从 Git 获取指定版本时使用：

```bash
git clone --branch v1.0.0 --recurse-submodules https://github.com/ForceMind/Tekvro.git
cd Tekvro
npm ci
npm run build:cached
```

开发工具链以 `.nvmrc` 和 `package.json` 的 `packageManager` 为准。贡献流程和检查命令见[贡献指南](https://github.com/ForceMind/Tekvro/blob/main/CONTRIBUTING.md)。

## 分发范围与许可

本次发布使用 GitHub Release，未向 npm 注册中心或 MCP 目录发布。`package.json` 的 `private: true` 用于防止误上传到注册中心，不影响安装 GitHub 下载的本地归档。

代码协议见 [LICENSE](https://github.com/ForceMind/Tekvro/blob/main/LICENSE)，组件授权告知见 [THIRD_PARTY_NOTICES.md](https://github.com/ForceMind/Tekvro/blob/main/THIRD_PARTY_NOTICES.md)。

<div align="center">

# Cuttle

**从写作到提交，一个本地桌面工作区。**

打开项目、编辑文件、预览文章、管理 Git，让内容与代码在同一个地方流动。

[![MyGo](https://img.shields.io/badge/MyGo-0.10-526f43)](https://github.com/egoist/mygo)
[![Go](https://img.shields.io/badge/Go-1.27.3-00ADD8?logo=go&logoColor=white)](https://go.dev/)
[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

[功能特性](#功能特性) · [快速开始](#快速开始) · [使用指南](#使用指南) · [开发与构建](#开发与构建)

</div>

---

## 为什么选择 Cuttle

Cuttle 是基于 [MyGo](https://github.com/egoist/mygo) 构建的本地桌面工具，适合维护个人博客、Markdown 文档和 Git 项目。

选择一个文件夹即可开始工作。普通目录可以直接管理文件，Git 仓库提供分支和提交功能，Jekyll 博客则额外支持中英文文章编辑与真实页面预览。

- **面向本地项目**：使用自己的文件夹、Git 配置和 SSH 密钥。
- **适应不同工作区**：在多个项目间切换，也可从远程仓库克隆新项目。
- **覆盖写作流程**：编辑、草稿恢复、文章预览、差异审阅与提交推送。

## 功能特性

| 功能          | 支持内容                                                     |
| ------------- | ------------------------------------------------------------ |
| 项目管理      | 打开本地文件夹、最近项目切换、SSH / HTTPS / 本地仓库克隆     |
| 文件管理      | 文件与目录的新建、重命名、移动、导入、替换、移到废纸篓       |
| 编辑与查找    | 多标签编辑、常见语言语法高亮、文件名与内容搜索、隐藏文件显示 |
| 二进制文件    | 图片查看、文件替换、通过系统应用打开                         |
| Markdown 写作 | 源码编辑、Markdown 渲染预览、自动保留本地草稿                |
| Jekyll 博客   | 新建文章、中英文标题/摘要/正文表单、真实博客构建预览         |
| Git 分支      | 新建分支、切换本地分支、创建远程跟踪分支、stash 与恢复       |
| 远程仓库      | 新增/修改/删除 remote，分别配置拉取与推送地址                |
| Git 同步      | Fetch、快进拉取、推送当前分支                                |
| 提交审阅      | 勾选文件、查看差异、填写说明、提交后可自动推送               |

```mermaid
flowchart LR
    A[打开或克隆项目] --> B[编辑文件 / 撰写文章]
    B --> C[保存与预览]
    C --> D[勾选文件并审阅差异]
    D --> E[提交与推送]
```

## 快速开始

### 从源码运行

准备以下环境：

| 依赖           | 要求                                                      |
| -------------- | --------------------------------------------------------- |
| Go             | 1.27.3 或更新，版本要求见 `go.mod`                        |
| Node.js        | 建议 22.12+                                               |
| Git            | 已安装，可从命令行调用                                    |
| Ruby / Bundler | 仅 Jekyll 真实预览需要，同时需安装博客项目的 Gemfile 依赖 |

进入项目目录后运行：

```sh
cd Cuttle
npm ci
npm run dev
```

该命令会启动 Vite 开发服务和 MyGo 原生窗口。Bun 已包含在开发依赖中，无需单独安装。

> 普通浏览器中单独打开 Vite 页面无法调用 Go 原生服务。请使用 MyGo 窗口操作项目。

### 构建桌面应用

```sh
npm run build
```

macOS Apple Silicon 的默认构建产物：

```text
build/darwin-arm64/Cuttle.app
```

双击应用，选择你的项目文件夹即可开始。目前已验证 macOS arm64 构建；其他平台尚未验收。应用默认使用本地 ad hoc 签名，尚未做 Developer ID 公证。

## 使用指南

### 打开与切换项目

使用顶部的 **打开文件夹** 选择本地目录，或通过 **克隆** 输入 Git 地址和保存位置。已打开的项目可以从顶部选择器切换，最多保留 20 个最近项目。

修改 **远程仓库** 中的地址会更新当前项目的 Git remote。要使用另一份工作目录，请打开对应文件夹或克隆为新项目。

### 编辑文件

- 从左侧文件树打开文件，多份文件可以同时保留在标签页中。
- 点击目录设置新文件的目标目录；行末 `⋯` 菜单用于重命名、移动、替换等操作。
- 使用 `⌘S` / `Ctrl+S` 保存全部编辑内容。
- 通过搜索面板查找文件名或文本内容。
- 需要查看配置文件或依赖目录时，勾选 **显示隐藏文件与依赖目录**。

未保存的编辑会自动存为本地草稿。重新打开相同项目、分支和文件时，可以恢复编辑；磁盘内容变化时会显示冲突提示与磁盘版本。

### 撰写与预览博客

检测到项目根目录的 `_config.yml` 后，Cuttle 会提供 Jekyll 写作功能：

1. 点击 **写文章**，填写标题、日期和文件名，创建 `_posts/YYYY-MM-DD-slug.md`。
2. 使用源码模式编辑全部内容，或切换 **文章表单** 填写中文 / English 内容。
3. 点击 **Markdown 预览** 查看渲染结果，或点击 **真实博客预览** 使用项目的 Jekyll 模板构建页面。
4. 确认效果后保存文件，再进入 Git 面板审阅提交。

中英文表单使用 `title`、`summary`、正文及 `title_en`、`summary_en`、`content_en` 字段，保留其他 YAML 字段。博客主题需自行支持这些双语字段；Cuttle 不会自动修改主题。

真实预览在临时项目副本中构建，支持当前文件尚未保存的内容。博客依赖需先在博客目录中通过 Bundler 安装；若存在 `vendor/bundle`，预览会使用该目录。macOS 兼容 Homebrew Ruby 3.3 路径，也可使用系统 PATH 中的 Bundler。

### 管理分支与提交

1. 在顶部选择分支，或创建新分支。工作区有改动时，先提交，或选择保存并 stash 后切换。
2. 打开 **提交改动**，逐个勾选本次需要提交的文件。
3. 点击 **审阅并提交**，查看差异、分支和推送目标。
4. 填写提交说明，选择仅提交或提交并推送当前分支。

默认开启提交后推送。若推送失败，本地提交会保留，可在处理网络或认证问题后点击 **推送** 重试。stash 不会在切换分支后自动恢复，可在 Git 面板恢复最新记录。

Git 操作使用本机现有身份配置和 SSH 密钥。提交前请配置自己的 Git 用户名与邮箱，并确认目标仓库的认证可用。

## 开发与构建

| 命令                | 用途                                         |
| ------------------- | -------------------------------------------- |
| `npm run dev`       | 启动原生应用和前端开发服务                   |
| `npm run dev:web`   | 仅启动前端开发服务                           |
| `npm run generate`  | 从 Go 服务重新生成 TypeScript 绑定           |
| `npm run build:web` | TypeScript 类型检查并构建前端                |
| `npm run build`     | 构建本机应用，macOS 默认生成 `.app`          |
| `npm run build:dmg` | macOS 额外生成 DMG，需要系统磁盘镜像服务可用 |
| `npm test`          | 运行文件、Git 和 Markdown 预览测试           |

可选运行 Jekyll 集成测试，测试会读取指定博客并在临时副本中构建：

```sh
STUDIO_JEKYLL_FIXTURE=/absolute/path/to/blog go test ./internal/...
```

集成测试包含非 UTF-8 启动环境，覆盖桌面应用处理中文文件名时的编码问题。

### 项目结构

```text
Cuttle/
├── main.go                  # MyGo 应用入口与原生服务绑定
├── internal/workspace/
│   ├── workspace.go         # 项目、文件操作、搜索与草稿
│   ├── git.go               # 分支、remote、提交与同步
│   ├── preview.go           # Markdown / Jekyll 预览服务
│   └── *_test.go            # 核心行为测试
├── src/
│   ├── main.tsx             # React 桌面界面
│   ├── style.css            # 界面样式
│   └── mygo.ts              # 自动生成的 TypeScript 绑定
├── scripts/mygo.mjs         # MyGo CLI 启动包装
├── mygo.config.ts           # 应用名称、标识与构建配置
└── vite.config.ts           # 前端开发与打包配置
```

## 数据与操作边界

- **本地存储**：最近项目和草稿默认保存在系统用户配置目录的 `Cuttle` 下。macOS 通常为 `~/Library/Application Support/Cuttle`。可通过 `CUTTLE_DATA` 指定位置。
- **升级兼容**：若新目录尚不存在且检测到旧版 `GochiefStudio` 或 `Gochief` 数据目录，会继续使用，以保留已有草稿和项目记录；旧变量 `GOCHIEF_DATA` 和 `GOCHIEF_STUDIO_DATA` 也继续兼容。
- **文件保存**：采用原子替换，检查磁盘版本及分支；直接访问 `.git`、越界路径及指向项目外的符号链接会被拒绝。
- **删除恢复**：删除文件或目录使用系统废纸篓，没有永久删除降级。
- **提交隔离**：提交使用临时 Git index，保留未勾选文件的暂存状态；提交前再次检查文件及 HEAD 是否变化，执行仓库已有 Git hooks。
- **同步行为**：拉取仅允许快进，不自动解决冲突，不执行 force push。
- **预览隔离**：预览服务只监听 `127.0.0.1`，使用随机令牌地址，页面与原生服务界面隔离。Jekyll 会运行项目插件，预览前应信任项目的构建配置。

当前限制：内联读取文件不超过 32 MB，预览输入不超过 4 MB，提交文本差异不超过 2 MB。搜索最多返回 300 条，跳过隐藏文件、依赖目录、二进制和大于 2 MB 的文件。自动草稿有 600 ms 延迟，强制结束进程可能丢失最后一小段编辑。

## 技术栈

- **原生容器**：[MyGo](https://github.com/egoist/mygo)
- **本地服务**：Go、Git CLI、Goldmark、Ruby / Jekyll
- **桌面界面**：React、TypeScript、Vite、CodeMirror、YAML

## 参与贡献

欢迎提交问题与改进建议。报告问题时，请附上操作系统、复现步骤、错误日志，以及是否涉及 Git 或 Jekyll 项目；分享日志前请移除凭据等敏感内容。

提交改动前，请运行 `npm test` 与 `npm run build:web`。修改 Go 服务签名后，使用 `npm run generate` 更新绑定文件。

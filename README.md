# OpenEnv

一眼看清电脑里装了什么开发环境：**版本、来源、路径，以及当前真正生效的那个。**

OpenEnv 是一个本地桌面小工具。采用深蓝科技风，默认只显示已发现的环境，将语言、工具链、包管理器、Shell、变量和 PATH 分开，避免把机器状态堆成一页日志。

## 当前功能

- **环境清单**：Node.js、Go、Python、Java、Rust、Ruby、PHP、Swift、Bun、Deno、.NET、Zig，以及 GCC、Clang、CMake、Make、Git、Docker 等工具。
- **多版本盘点**：读取 PATH 和 nvm、fnm、Volta、Homebrew、pyenv、Conda、mise、asdf、rustup 等常见目录；解析符号链接，避免同一文件重复计数。
- **生效路径**：展示当前调用位置、真实文件位置、安装来源和 PATH 顺序。`gcc` 实际为 Apple Clang 时明确标注；也发现 `gcc-15`、`python3.12` 这类版本命令。
- **Shell**：展示登录 Shell、版本和启动配置文件的位置。
- **环境变量**：开发变量优先展示；仅向界面传递允许查看的常见配置值，未知变量和敏感值保持隐藏。
- **PATH 诊断**：按真实顺序显示目录，标注重复、失效和相对路径。只展示，不自动修改。
- **本地 JSON 报告**：导出安装和 PATH 信息，省略所有环境变量值。路径可能包含用户名，分享前请检查。
- **macOS 菜单栏**：打开主窗口、重新扫描、退出；默认关闭窗口后继续驻留。
- **macOS / Windows 开机启动入口**：打包版中显式开启，默认关闭。macOS 登录启动时隐藏主窗口。Linux 暂未提供开机启动设置。

## 下载与安装 macOS 版

从 [GitHub Releases](https://github.com/GpsLypy/openenv/releases) 下载 `OpenEnv-0.1.0-mac-arm64.dmg`。打开 DMG，将 `OpenEnv.app` 拖到 `Applications` 文件夹，再从“应用程序”打开。

下载文件校验：将 `SHA256SUMS` 与安装包放到同一目录，运行 `shasum -a 256 -c SHA256SUMS`；如果只下载 DMG，可运行 `shasum -a 256 OpenEnv-0.1.0-mac-arm64.dmg`，与校验文件中的对应行比较。

当前生成的 Apple Silicon 本地包：

```text
release/mac-arm64/OpenEnv.app
release/OpenEnv-0.1.0-mac-arm64.dmg
release/OpenEnv-0.1.0-mac-arm64.zip
release/SHA256SUMS
```

双击 `OpenEnv.app` 即可使用，也可以先复制到 `/Applications`。建议放到固定位置后，再在“偏好设置”中开启开机启动，避免移动应用后登录项失效。

这是 ad-hoc 签名的预览版本，未经过 Apple 公证。从互联网下载后，首次打开可能被 macOS 拦截，可在“系统设置 → 隐私与安全性”中审核并选择“仍要打开”。当前包面向 Apple Silicon，最低系统版本配置为 macOS 12；实际运行验收在 macOS 27 / arm64 上完成。

## 开发与构建

要求 Node.js 22+、npm。mac 包需要在 macOS 构建。

```bash
npm ci
npm run dev             # Vite + Electron 实时开发
npm run scan            # 命令行真实盘点，不输出变量值
npm test                # 检测与隐私回归测试
npm run build           # TypeScript + 前端构建
npm run test:desktop    # 启动真实 Electron 验证交互，需桌面会话
npm run package:mac     # 使用本地 Electron 运行时打包、签名、生成 ZIP 与 DMG
npm run package:dmg     # 从已签名的本地 .app 生成 DMG
npm run verify:dmg      # 挂载 DMG，检查内容等价、Applications 链接和拷贝后的签名
```

如 Electron 的 GitHub 下载超时，可在安装依赖时显式使用镜像：

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm ci
```

构建脚本不会自动设置系统登录项。桌面测试会启动并关闭应用，报告保存在 `.local/verification/`；不会切换真实的开机启动设置。测试报告导出时会替换原生保存对话框，实际文件写入和隐私字段会照常验证。

验证打包后的应用：

```bash
OPENENV_EXECUTABLE="$PWD/release/mac-arm64/OpenEnv.app/Contents/MacOS/OpenEnv" npm run test:desktop
```

## 平台范围

| 项目 | macOS | Windows | Linux |
| --- | --- | --- | --- |
| 共享界面与真实文件扫描适配 | 本机已验证 | 已实现，待原生验收 | 已实现，待原生验收 |
| 菜单栏 / 托盘 | 本机已验证 | 已实现，待原生验收 | 已实现，依赖桌面托盘支持，待验收 |
| 开机启动 | 原生 API 接线、状态读取已验证；重登待验收 | 已实现，待验收 | 暂未提供 |
| 安装包 | arm64 DMG、ZIP 与 `.app` | 提供构建命令，尚未生成验收包 | 提供 AppImage 构建命令，尚未生成验收包 |

Windows 构建：`npm run package:win`。Linux 构建：`npm run package:linux`。建议在各自操作系统运行完整验收，不把共享代码测试当作系统集成验证。

## 检测边界

- macOS 从标准系统 PATH 启动 `$SHELL -ilc`，由系统和用户的登录配置重建 PATH，避免 IDE 或 npm 注入的路径影响默认结果；工作目录为用户主目录。
- Shell 读取限时 10 秒，失败时明确回退到应用环境。单次版本探测最多 4.5 秒，扫描探测总预算约 45 秒；并发受限。
- PATH 最多读取 512 项；已知目录发现最多 512 个目录；每个工具最多探测 24 处独立安装。不递归索引磁盘。
- 盘点代表这一轮扫描的登录环境。Shell aliases、交互函数、自定义位置、IDE 的环境、项目 `.venv`、容器内部环境可能不同；没有发现不等于机器绝对没有安装。
- “已发现”表示命令文件存在。Java 的系统启动器、版本管理器 shim 或无法运行的文件会保留为“版本未确认”，不冒充可用运行时。
- 版本命令需要执行已发现的本机程序；登录 Shell 也会执行用户原有的启动配置。OpenEnv 自身不写入配置，不执行安装/卸载命令，并关闭所检测常见管理器的自动安装/更新开关。
- PATH 存在多个版本并不一定是故障。界面只解释顺序，不自动删除安装或改写 Shell 文件。
- 敏感和未知环境值不传入渲染进程，不保存完整 Shell 输出。配置变量的值采用保守白名单和凭据格式检查；显示在工具路径中的用户名仍属于本机信息。

## 代码结构

```text
electron/registry.mjs      工具检测定义
electron/inventory.mjs     Shell、文件发现、版本、PATH、隐私、报告
electron/process.mjs       限时进程和并发池
electron/main.cjs          原生窗口、菜单栏、登录项、受限 IPC
electron/preload.cjs       隔离的界面 API
src/                      React + TypeScript 界面
scripts/                  开发、图标、签名与桌面验收
tests/                    真实临时文件回归测试
openspec/                 需求规格、设计、验收记录
```

前端不启用 Node.js，不开放任意命令执行，不允许外部页面跳转。文件定位仅限当前扫描结果里的路径。无需账号、网络服务或远程数据库。

<div align="center">

<img src="assets/icon.png" alt="DS Lite" width="96">

# DS Lite

**原生手感的 DeepSeek 手机客户端。**

官方 App 的体验很好，但它不让你绑自己的 API Key，也带不走你在 ChatGPT 和 Gemini
里的历史对话。DS Lite 补上这两件事：对齐官方 App 的交互，用开放平台 API
对话，会话与记忆全部存在本机。

**非官方第三方客户端，与 DeepSeek 官方无关联。** 对话能力来自
[DeepSeek 开放平台](https://platform.deepseek.com)，按量计费。

[![CI](https://github.com/NanamiKite/deepseek-lite/actions/workflows/ci.yml/badge.svg)](https://github.com/NanamiKite/deepseek-lite/actions/workflows/ci.yml)

[下载 APK](https://github.com/NanamiKite/deepseek-lite/releases) · [快速开始](#快速开始) · [导入历史对话](docs/data.md) · [个性与记忆](docs/memory.md) · [对话机制](docs/context.md) · [参与开发](docs/development.md)

**简体中文**

</div>

---

## 这是什么

一个 Expo / React Native 写的手机客户端（Android 优先，iOS 待适配）。注册、绑 Key、
充值、聊天、导入导出，全部在 App 里完成，零自建服务器。能做的事：

## 聊得像官方。

*流式、思维链、深度思考、联网搜索 —— 一个不少。*

- **流式对话 →** SSE 逐字输出，Markdown 渲染，思维链折叠面板，停止/重新生成。
- **[深度思考与联网搜索](docs/context.md#深度思考与联网搜索) →** 官方 `deepseek-web-search` 服务端工具，回答带引用来源；两个开关同开就是官方的「深度思考搜索」。
- **[发送队列](docs/context.md#发送队列与中止) →** 回复没结束时发的消息立即显示、自动排队续发；停止一键取消全部。
- **官方会话标题 →** 标题由 DeepSeek 生成，不再是"取首句前 40 字"。

## 你的账号，你的数据。

*从注册到充值不用离开 App。*

- **[三步引导绑定](docs/development.md#目录) →** 注册 → 创建 Key → 粘贴校验，Key 存系统安全存储；四个入口随时重进引导。
- **充值直达 →** 设置里的充值/API Keys/开放平台入口，余额不足的报错里也带充值按钮。
- **[导入历史](docs/data.md) →** ChatGPT / DeepSeek / Gemini 的导出数据一键导入，自动识别格式、还原分支、幂等去重，导入即可续聊。
- **[导出与备份](docs/data.md#导出) →** 单对话或全部对话导出 Markdown；全量 JSON 备份可换机恢复。

## 记得住你。

*ChatGPT 的个性与记忆，在 DeepSeek 上也能有。*

- **[自定义指令](docs/memory.md#自定义指令个性) →** 「关于我」+「回复风格」注入每次对话。
- **[跨对话记忆](docs/memory.md#记忆) →** 手动添加或每轮自动提取；导入 Gemini「保存的信息」或粘贴文本。
- **[对话级开关](docs/memory.md#对话级开关) →** 不想让某段对话留痕，关掉「记忆」胶囊即可，互不污染。
- **[跨对话参考](docs/memory.md#跨对话参考) →** 近期对话摘要注入新对话，不重复问已知的事。
- **[会话摘要](docs/memory.md#会话摘要) →** 每个对话自动维护 120 字摘要，列表直接展示。

## 数据不出手机。

*没有账号系统，没有云端，没有分析。*

- 会话与记忆存本机 SQLite，Key 存 Keychain / Keystore，卸载即清除。
- 备份文件你自己保管，恢复按会话幂等合并。

---

## 快速开始

**普通用户**：到 [Releases](https://github.com/NanamiKite/deepseek-lite/releases) 下载最新 APK 安装（首次安装需允许"未知来源/安装未知应用"），打开 App 按三步引导绑定 API Key 即可。

<details>
<summary><b>从源码运行 / 参与开发</b></summary>

```bash
git clone https://github.com/NanamiKite/deepseek-lite.git
cd deepseek-lite
pnpm install        # 或 npm install / yarn
npx expo start
```

手机装 [Expo Go](https://expo.dev/go) 扫二维码即可运行。本项目只用 Expo SDK 官方模块，Expo Go 可完整运行。手机与电脑需同一 Wi-Fi，跨网络用 `npx expo start --tunnel`；国内安卓可从 [expo.dev/tools](https://expo.dev/tools) 下载 Expo Go 的 APK。

</details>

## 打包 APK

```bash
npm i -g eas-cli && eas login
eas build -p android --profile preview
```

`eas.json` 内置 `preview`（APK，直接安装）与 `production`（AAB，商店）两套配置。正式发布走 GitHub Releases。

## 支持的导入格式

| 来源 | 格式 | 识别特征 |
| --- | --- | --- |
| ChatGPT / DeepSeek 官方 | `conversations.json` | 树状 `mapping` + `current_node` |
| DeepSeek 站点数据 | messages JSON | `parent_id` 分支 + `contentFragments` |
| Gemini Takeout | `MyActivity.json` | My Activity 记录，按会话 id 分组 |
| Gemini 备份 / 抓取 | conversations JSON / NDJSON | 完整多轮转写 |
| 通用 | 消息数组 JSON / NDJSON | `[{role, content}]` 兜底 |

明细与各平台导出步骤见 [数据文档](docs/data.md)。

## 文档

| 我想… | 看这里 |
| --- | --- |
| 今天就跑起来 | [快速开始](#快速开始) · [打包 APK](#打包-apk) |
| 把旧平台的对话搬过来 | [数据导入、导出与备份](docs/data.md) |
| 配置个性、记忆、跨对话参考 | [个性与记忆](docs/memory.md) |
| 理解上下文预算与缓存计费 | [对话机制](docs/context.md) |
| 改代码、跑测试 | [开发文档](docs/development.md) |
| 做多设备同步 / 自建账号 | [账号体系扩展](docs/account-extension.md) |

## 架构

```
   手机 App (Expo / React Native)
        │  HTTPS
        ▼
   DeepSeek 开放平台 API          本机 SQLite
   chat · thinking · web_search   sessions · messages
   annotations · title            memories · digests
```

| 层 | 技术 |
| --- | --- |
| 应用 | Expo SDK 58 · React Native 0.88 · New Architecture |
| 路由 / 状态 | expo-router · zustand（AsyncStorage 持久化） |
| 存储 | expo-sqlite（顺序迁移）· expo-secure-store（Key） |
| 服务端 | 无 —— 直接调 [DeepSeek API](https://api-docs.deepseek.com) |

## 开发

前置：Node.js 22+、pnpm。常用命令：

```bash
pnpm typecheck     # tsc --noEmit
pnpm test:import   # 59 个纯逻辑测试（导入 25 / 记忆 16 / 组装 8 / 导出 3 / SSE 7）
pnpm demo:prompt   # 打印实际注入的 system prompt
```

目录结构、数据库迁移、平台注意事项见 [开发文档](docs/development.md)。

## 为什么叫 ds-lite

轻（lite）：单端应用、零后端、只用官方开放能力 —— 以及诚实地表明它是非官方的轻量替代品。

## 许可证

[GPL-3.0](LICENSE)（源码级 copyleft：基于本项目的衍生作品须以同许可证开源）。本项目与 DeepSeek 官方无关联；API 服务与计费由 DeepSeek 开放平台提供。

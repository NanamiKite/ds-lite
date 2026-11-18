# DeepSeek Lite 🐋

DeepSeek 官方 App 的体验很好，但它不让我绑自己的 API Key，也没法把我在 ChatGPT 和 Gemini 里的历史对话带过去。所以我做了这个：一个手感对齐官方 App 的手机客户端（Expo / React Native，Android 优先），Key 是自己的，数据全在本机。

能做的事：

- **聊天**：流式回复、Markdown、思维链折叠、深度思考、联网搜索（官方 `deepseek_web_search` 工具，回答带引用来源）、停止/重新生成；回复没结束时发的消息会排队，回复完自动续发
- **绑定自己的 Key**：三步引导（注册 → 创建 Key → 粘贴校验），Key 存系统安全存储；设置里可查余额、充值、管理 Key，余额不足时报错里直接给充值入口
- **带走历史**：导入 ChatGPT / DeepSeek / Gemini 的导出数据，自动识别格式，导入的对话可以直接继续聊
- **个性与记忆**：自定义指令、跨对话记忆（手动/自动提取）、对话级记忆开关、跨对话参考、每对话自动摘要——等价 ChatGPT 的 Custom Instructions / Memory / 参考聊天记录
- **数据自主**：会话与记忆存本机 SQLite，随时导出 Markdown 或全量 JSON 备份，换手机可恢复

> 本项目是非官方第三方客户端，与 DeepSeek 官方无关联。对话能力来自 [DeepSeek 开放平台 API](https://platform.deepseek.com)，按量计费。

## 快速开始

```bash
pnpm install        # 或 npm install / yarn
npx expo start
```

手机装 [Expo Go](https://expo.dev/go) 扫二维码即可运行（手机与电脑需同一 Wi-Fi，跨网络用 `npx expo start --tunnel`；国内安卓可从 [expo.dev/tools](https://expo.dev/tools) 下载 Expo Go 的 APK）。本项目只用 Expo SDK 官方模块，Expo Go 可完整运行。

日常使用建议打出独立 APK：

```bash
npm i -g eas-cli && eas login
eas build -p android --profile preview
```

## 文档

- [数据导入、导出与备份](docs/data.md) —— 三平台导出方法、支持的格式明细、备份恢复
- [个性与记忆](docs/memory.md) —— 自定义指令、记忆三模式、对话级开关、跨对话参考、会话摘要的工作方式
- [对话机制](docs/context.md) —— 上下文预算、前缀缓存怎么省钱、深度思考/联网搜索、发送队列与中止语义
- [开发文档](docs/development.md) —— 技术栈、目录结构、测试命令、数据库迁移、平台注意事项
- [自建账号体系扩展](docs/account-extension.md) —— 想做多设备同步 Key 时的接入点

## 路线图

- [ ] iOS 适配与上架
- [ ] 自建账号体系（多设备同步）
- [ ] 多模态（图片输入）

## License

MIT

# DeepSeek Lite 🐋

一个以官方 App 体验为蓝本的 **DeepSeek 手机客户端**（Expo / React Native，Android 优先）。

- **一键引导注册绑定**：内置注册引导 → 创建 API Key → 粘贴校验 → 安全存储（Keychain/Keystore），全程不离开 App
- **原生聊天体验**：多会话、SSE 流式回复、Markdown 渲染、思维链折叠面板、深度思考（`thinking` 参数）/**联网搜索**（官方服务端工具 `deepseek_web_search`，引用随 `annotations` 返回）、停止/重新生成、官方会话标题
- **个性与记忆**：自定义指令（关于我/回复风格，等价 ChatGPT Custom Instructions）+ 跨对话记忆库（手动添加、自动提取、从 ChatGPT/Gemini 导入），支持**对话级记忆开关**——不想让某段对话影响记忆时一键关闭
- **会话摘要**：每个对话自动生成 120 字内容摘要（话题/人物设定/进展），聊天页点标题即可查看，支持复制/系统分享，会话列表直接展示
- **导入历史对话**：ChatGPT / DeepSeek / Gemini（Google Takeout）导出数据一键导入，自动识别格式、分支还原、幂等去重
- **导入即续聊**：导入的旧对话直接作为上下文继续向 DeepSeek 提问
- **数据全本地**：会话与记忆存 SQLite，Key 存系统安全存储，零自建服务器

> ⚠️ 本项目为非官方第三方客户端，与 DeepSeek 官方无关联。对话能力基于 [DeepSeek 开放平台 API](https://platform.deepseek.com)（按量计费）。

## 快速开始

```bash
cd deepseek-lite
pnpm install        # 或 npm install / yarn
npx expo start      # 手机装 Expo Go 扫二维码即可运行；按 a 用 Android 模拟器
```

> **Expo Go** 是 Expo 官方的手机 App（[expo.dev/go](https://expo.dev/go)）：开发服务器在电脑上跑，
> 手机扫码加载项目、改代码热刷新，无需打包安装。要求手机与电脑同一 Wi-Fi；
> 不在同一网络用 `npx expo start --tunnel`。国内安卓可从 [expo.dev/tools](https://expo.dev/tools)
> 直接下载 Expo Go 的 APK。本项目只用了 Expo SDK 官方模块，Expo Go 可完整运行。
> 日常使用请用下方 EAS 打出独立 APK。

类型检查与解析器测试：

```bash
pnpm typecheck      # tsc --noEmit
pnpm test:import    # 导入解析器 fixture 测试（Node 环境）
```

## 打包 APK（EAS 云构建）

```bash
npm i -g eas-cli
eas login
eas build -p android --profile preview   # 产出可直接安装的 APK
```

`eas.json` 已内置 `preview`（APK、内部分发）与 `production`（AAB、商店）两套配置。

## 如何导出各平台数据

| 平台 | 导出方法 | 产物 |
| --- | --- | --- |
| **ChatGPT** | 网页版 Settings → Data controls → Export data，邮件收到压缩包 | `conversations.json` |
| **DeepSeek** | chat.deepseek.com 设置 → 导出数据（邮件附件）；或社区导出扩展 | `conversations.json`（兼容 ChatGPT 格式）或站点格式 JSON |
| **Gemini** | [takeout.google.com](https://takeout.google.com) → 仅勾选 **My Activity** → 「所有活动数据」里只留 **Gemini Apps** → 格式选 **JSON** | `My Activity/Gemini Apps/MyActivity.json` |

导入时 App 会自动识别格式；ChatGPT 与 DeepSeek 官方导出同构，向导会请你确认来源。
Gemini 的 My Activity 是「以提问为中心」的，部分会话只有提问没有回复，属平台限制
（导入界面会明确标注）。重复导入同一文件会自动跳过已存在的对话。

## 个性与记忆说明

DeepSeek 开放 API 是无状态的，官方没有这两项能力，deepseek-lite 在客户端实现等价物：

- **自定义指令（个性）**：设置中开启，`关于我` + `回复风格` 两栏注入每次对话的 system prompt（等价 ChatGPT Custom Instructions / Gemini Gems 指令）
- **记忆三种模式**（设置 → 个性与记忆 → 管理记忆）：
  - *仅手动*：自己添加/导入记忆，全部注入对话
  - *自动提取*：每轮对话完成后，后台用一次轻量 `deepseek-chat` 调用提取 0-3 条"值得记住的用户事实"，去重入库并在聊天页提示（消耗少量额外 token）
  - *关闭*：完全不注入不提取
- **记忆导入**：Gemini 用户可直接粘贴 [gemini.google.com/saved-info](https://gemini.google.com/saved-info) 页面文本；ChatGPT 导出若包含 memories 类 JSON 也可文件导入；或粘贴任意"每行一条"的文本。所有记忆本地存储、可随时停用/删除/编辑，注入上限 30 条。

## 上下文与缓存策略

DeepSeek 的 chat API 无状态——每次请求都完整重发上下文，"增量"由平台的**自动前缀缓存**实现：
相邻请求前缀相同的部分自动命中缓存，命中部分按约 1/10 计费（无需任何申请，按请求自动生效）。
因此客户端的正确做法是让消息数组**尽量追加式增长**，deepseek-lite 的组装策略（[src/chat/assemble.ts](deepseek-lite/src/chat/assemble.ts)）：

1. **稳定 system 前缀**：基础人设 + 个性 + 记忆（变更频率低）；联网搜索由服务端工具完成，**不进提示词**
2. **预算内发全量历史**（默认 16k tokens，可调 8k–128k）：每轮只在尾部追加 → 前缀全部命中缓存
3. **超预算部分滚动摘要压缩**：被裁掉的消息（≥8 条时）后台用一次轻量调用压缩成 ≤300 字要点摘要，
   与前次摘要合并存入会话，下次请求以 `[system] + [摘要] + [近期全量]` 携带——压缩替代丢弃
4. 声明联网工具的请求按官方要求回传历史 `reasoning_content`（思维链）

注意：摘要更新会改变中段内容、使该轮缓存失效一次，这是"保留长对话信息"与"最大化缓存命中"之间的
权衡；若更在意成本，可把预算调大到基本不触发压缩。

## 联网搜索说明

使用 DeepSeek 官方服务端工具 `deepseek_web_search`（2026-11 全家桶应用 API）：
开启「联网搜索」开关即在请求中声明该工具，搜索与上下文拼接由 DeepSeek 服务端完成，
回答引用通过 `annotations` 返回并在消息下方展示来源；深度思考 + 联网 = 官方深度思考搜索。
是否搜索由模型判断；搜索按查询词条计费（见官方价格页）。

## 项目结构

```
app/                    # expo-router 页面
  onboarding.tsx        #   引导注册 + 绑定 API Key
  chats.tsx             #   会话列表（搜索/置顶/重命名/删除）
  chat/[id].tsx         #   聊天页（流式/思维链/开关/续聊）
  import.tsx            #   导入向导（自动识别 → 预览 → 幂等导入）
  memories.tsx          #   记忆管理（增删改/启停/导入）
  settings.tsx          #   设置
src/
  api/deepseek.ts       #   OpenAPI 客户端（SSE 流式、thinking、联网工具、annotations、Key 校验）
  import/               #   格式识别与三平台解析器（纯逻辑，可 Node 测试）
  memory/               #   个性/记忆：解析、去重、提示词组装、自动提取
  db/                   #   SQLite（sessions/messages/memories，幂等导入索引）
  account/provider.ts   #   账号抽象（LocalKeyAccount，预留远端账号体系）
  state/                #   zustand（设置、聊天引擎）
  components/           #   Markdown 渲染、气泡（思维链面板）、输入栏
scripts/
  fixtures/             #   五种导出形态的合成样本
  test-import.ts        #   对话导入解析器测试（16 例）
  test-memory.ts        #   个性与记忆逻辑测试（15 例）
docs/account-extension.md  # 自建账号体系扩展指南
```

## 路线图

- [ ] iOS 适配与上架
- [ ] 自建账号体系（见 [docs/account-extension.md](docs/account-extension.md)）
- [ ] 多模态（图片输入）
- [ ] 会话导出/备份

## License

MIT

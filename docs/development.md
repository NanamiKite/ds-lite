# 开发文档

## 技术栈与版本

| 项 | 版本 |
| --- | --- |
| Expo | SDK 58（expo ~58.0.x） |
| React Native | 0.88 / React 19.3 / New Architecture |
| TypeScript | 6.0（`baseUrl` 已弃用，paths 用 `./src/*` 相对写法） |
| 状态 | zustand + AsyncStorage 持久化（敏感 Key 走 expo-secure-store） |
| 存储 | expo-sqlite（同步 API，`user_version` 顺序迁移，当前 v4） |

依赖里显式装了用户态 `punycode`：RN 0.88 移除了内置 polyfill，`react-native-markdown-display` 的依赖链需要它。

包管理用 pnpm（`pnpm-workspace.yaml` 设 `nodeLinker: hoisted`）。

## 目录

```
app/                      expo-router 页面
  index.tsx               入口分流（等待持久化水合 → 引导/会话列表）
  onboarding.tsx          三步引导 + 绑定 Key（?mode=guide 供非首次进入）
  chats.tsx               会话列表：日期分组 SectionList + 左滑 ReanimatedSwipeable
  chat/[id].tsx           聊天页：倒置 FlatList、流式覆盖、摘要/队列提示、键盘 padding 避让
  import.tsx              导入向导（自动识别 → 预览 → 幂等导入）
  memories.tsx            记忆管理
  settings.tsx            设置（含充值/API Keys/开放平台直达）
src/
  api/deepseek.ts         OpenAPI 客户端：SSE 流式、thinking、deepseek_web_search 工具、
                          annotations 引用、官方 title、Key 校验/余额
  chat/assemble.ts        单次请求消息组装（纯逻辑）：预算裁剪、摘要注入、思维链回传
  import/                 三平台导出解析器（纯逻辑）：chatgpt / deepseek / gemini + 格式识别
  memory/                 个性/记忆：解析与去重、提示词组装、自动提取
  export/                 导出：JSON 备份与 Markdown 格式化（纯逻辑）+ 文件分享
  db/                     SQLite：database（迁移）/ repo（会话消息）/ memoryRepo（记忆）
  account/provider.ts     账号抽象，LocalKeyAccount + 远端账号扩展点
  state/                  zustand：settings / chat（流式引擎、队列、后台任务）
  components/             ActionSheet（主题化菜单）、MessageBubble、ChatInput、MarkdownView
scripts/
  fixtures/               五种导出格式的合成样本
  test-*.ts               纯逻辑测试（Node 运行，tsc 编译到 .test-dist）
  demo-prompt.ts          打印实际注入的 system prompt
```

## 命令

```bash
pnpm typecheck     # tsc --noEmit
pnpm lint          # eslint（Expo 官方预设）
pnpm test:import   # 编译并运行全部纯逻辑测试
pnpm demo:prompt   # 打印个性+记忆组装后的 system prompt 示例
npx expo start     # 开发
```

## CI

GitHub Actions（[ci.yml](../.github/workflows/ci.yml)），push/PR 触发：

- **checks**：typecheck → lint → 65 个纯逻辑测试（Node 环境，无需模拟器）
- **android-bundle**：`expo export --platform android` 全量 Metro+Hermes 打包并校验产物，不需要 EAS 凭据

发 Release 的 APK 仍走 EAS（见 README）。

测试用例数：导入解析 25（含损坏输入/坏行容错/真叶分支）、记忆逻辑 16、上下文组装 8、导出格式 3、SSE 流解析 7。

## 导入健壮性

解析器对外部文件按不可信输入处理：

- 数组先过对象守卫（`filterObjects`），null/字符串/数字项跳过并计入统计
- 上限：会话 2000、单会话消息 20000、单条消息 20 万字符、NDJSON 5 万行（坏行容忍 20 行）
- UI 侧按字节预检（导入 50MB / 记忆 10MB / 备份 100MB）
- 所有解析异常统一转换为 `ImportError`，不向 UI 裸抛 TypeError
- DeepSeek 分支按"真叶节点 + 时间最晚"还原，缺父节点时标注"分支不完整"
- 无稳定 ID 的记录用内容指纹做幂等键（不用数组下标）

## 数据库迁移

`src/db/database.ts` 按 `PRAGMA user_version` 顺序迁移：

| 版本 | 内容 |
| --- | --- |
| 1 | sessions / messages 基础表、幂等导入索引 |
| 2 | memories 表 |
| 3 | sessions 增加 summary / summary_seq（上下文滚动摘要） |
| 4 | sessions 增加 digest / digest_seq（会话摘要）与 memory_enabled（对话级记忆开关） |
| 5 | messages 增加 UNIQUE(session_id, seq)，追加在事务内取号并冲突重试 |

## 打包

`eas.json`：`preview` 出 APK（内部分发），`production` 出 AAB（商店）。构建命令见 README。

## 已知平台注意事项

- RN 0.88 全 edge-to-edge，安卓键盘避让统一用 `KeyboardAvoidingView` 的 padding 行为，标题栏放在避让区外
- `react-native-gesture-handler` 的 `ReanimatedSwipeable` 从 `react-native-gesture-handler/ReanimatedSwipeable` 子路径导入（主入口未导出）
- 倒置 FlatList 中的空状态/欢迎页不要用 ListEmptyComponent（会被连带翻转），DS Lite 把欢迎页放在列表外按条件渲染

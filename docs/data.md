# 数据导入、导出与备份

## 导入：从 ChatGPT / DeepSeek / Gemini 带走历史

| 平台 | 导出方法 | 产物 |
| --- | --- | --- |
| ChatGPT | 网页版 Settings → Data controls → Export data，邮件收到压缩包 | `conversations.json` |
| DeepSeek | chat.deepseek.com 设置 → 导出数据（邮件附件）；或社区导出扩展 | `conversations.json`（与 ChatGPT 同构）或站点格式 JSON |
| Gemini | [takeout.google.com](https://takeout.google.com) → 仅勾选 My Activity → 「所有活动数据」里只留 Gemini Apps → 格式选 JSON | `My Activity/Gemini Apps/MyActivity.json` |

App 内「导入」按钮选择文件后自动识别格式，识别结果先预览（格式 / 对话数 / 消息数），确认后入库。导入的对话可以直接继续向 DeepSeek 提问（历史按上下文预算参与，见 [对话机制](context.md)）。

### 支持的格式

| 格式 | 特征 | 处理 |
| --- | --- | --- |
| ChatGPT / DeepSeek 官方 `conversations.json` | 树状 `mapping` + `current_node` | 还原活跃分支；system/tool 消息与图片指针过滤 |
| DeepSeek 站点格式 | `messages` + `parent_id` + `contentFragments` | 按分支树取最新路径；保留 thinking/search 元信息 |
| Gemini My Activity | `header` / `title` / `titleUrl` / `time` 记录 | 按 `/app/<id>` 分组；剥离 "Prompted" 前缀；非 Gemini 记录跳过 |
| Gemini conversations / ndjson | `{"conversations":[...]}` 或每行一个会话 | 完整多轮转写 |
| 通用消息 JSON / NDJSON | `[{conversation_id, messages:[{role,content}]}]` 等 | 兜底解析 |

ChatGPT 与 DeepSeek 官方导出同构，向导会让你确认文件来自哪个平台（只影响来源标签）。

### 两个已知限制

- Gemini 的 My Activity 只记录提问，很多会话没有模型回复，导入界面会标注「无回复」的数量
- 重复导入同一文件不会产生重复对话（按来源 id / 内容指纹幂等跳过）

## 导出

| 入口 | 产物 |
| --- | --- |
| 设置 → 数据 → 导出 Markdown | 全部对话合成一个 `.md`，含标题、时间、摘要、思维链（折叠块） |
| 会话列表左滑 / 长按 → 导出对话 | 单个对话的 `.md`，文件名带对话标题 |
| 设置 → 数据 → 导出备份 | 全量 JSON（会话 + 消息 + 记忆），见下 |

导出走系统分享面板，可以保存到文件、发微信、传网盘。Markdown 可直接粘贴发布。

## 备份与恢复

「导出备份」生成的 JSON 带 `app: "ds-lite"` 标记与 schema 版本（恢复时兼容识别旧版 `deepseek-lite` 备份）。在另一台设备上「从备份恢复」选择该文件，即可还原：

- 会话与消息（按会话 id 幂等，已存在的跳过）
- 记忆（恢复时只导入启用中的条目，重复内容自动去重）

注意：备份不包含 API Key（Key 存在系统安全存储，换设备后需重新绑定）与设置项。

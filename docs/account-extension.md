# 账号体系扩展指南

ds-lite 当前使用 `LocalKeyAccount`：引导用户到 platform.deepseek.com 注册、
创建 API Key，粘贴后校验并保存到系统安全存储（Keychain / Keystore）。
不需要任何自建后端。

## 何时需要自建账号体系

- 多设备同步 Key / 会话
- 团队统一发 Key、限额
- 需要邮箱验证、找回等完整账号能力

## 扩展点

实现 `AccountProvider` 接口（src/account/provider.ts）：

```ts
export interface AccountProvider {
  readonly kind: 'local-key' | 'remote';
  info(): Promise<AccountInfo>;
  bindApiKey(key: string): Promise<KeyValidation>;
  getApiKey(): Promise<string | null>;
  unbind(): Promise<void>;
  // 预留的远端账号方法：
  // register(email, password): Promise<AccountSession>
  // login(email, password): Promise<AccountSession>
  // provisionApiKey(): Promise<KeyValidation>  // 服务端代建 Key 下发
}
```

然后在 App 启动处（如 app/_layout.tsx）调用：

```ts
setAccountProvider(new RemoteAccountProvider(serverUrl));
```

UI（onboarding / settings）通过 `getAccountProvider()` 与账号交互，无需改动。
建议远端实现仍然只把最终 DeepSeek Key 交给聊天引擎（`getApiKey`），
用户凭据与 Key 托管在服务端，端上只保留会话令牌。

## 安全注意

- 永远不要把 DeepSeek API Key 写进 AsyncStorage 或日志
- 远端令牌用 SecureStore 保存，且支持服务端吊销（短期令牌 + 刷新）

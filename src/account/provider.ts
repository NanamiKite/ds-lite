/**
 * 账号体系抽象
 *
 * 当前实现：LocalKeyAccount —— 一键引导注册 + 绑定 DeepSeek API Key
 * （Key 存于系统安全存储，校验通过后保存，全程不需要自建服务器）。
 *
 * 预留扩展：RemoteAccountProvider —— 自建账号体系（注册/登录/密钥托管）。
 * 实现下方 AccountProvider 接口并在 getAccountProvider() 注册即可，
 * UI 层（onboarding/settings）无需改动。详见 docs/account-extension.md。
 */
import { validateKey, type KeyValidation } from '@/api/deepseek';
import { clearApiKey, getApiKey, setApiKey } from '@/storage/secure';

export interface AccountInfo {
  kind: 'local-key' | 'remote';
  /** local-key: API Key 是否已绑定 */
  active: boolean;
  label?: string;
}

export interface AccountProvider {
  readonly kind: AccountInfo['kind'];

  info(): Promise<AccountInfo>;

  /**
   * 绑定 API Key：先调用 DeepSeek 接口校验，通过后安全存储。
   * 返回校验结果（含可用模型与余额）。
   */
  bindApiKey(key: string): Promise<KeyValidation>;

  getApiKey(): Promise<string | null>;

  unbind(): Promise<void>;

  // ---- 预留：自建账号体系接口（Remote 实现时补充） ----
  // register(email: string, password: string): Promise<AccountSession>;
  // login(email: string, password: string): Promise<AccountSession>;
  // logout(): Promise<void>;
  // provisionApiKey(): Promise<KeyValidation>;  // 服务端代建 Key 并下发
}

export class LocalKeyAccount implements AccountProvider {
  readonly kind = 'local-key' as const;

  async info(): Promise<AccountInfo> {
    const key = await getApiKey();
    return { kind: 'local-key', active: !!key, label: key ? '已绑定 DeepSeek API' : undefined };
  }

  async bindApiKey(key: string): Promise<KeyValidation> {
    const trimmed = key.trim();
    if (!trimmed) return { ok: false, models: [], error: '请输入 API Key' };
    const result = await validateKey(trimmed);
    if (result.ok) await setApiKey(trimmed);
    return result;
  }

  async getApiKey(): Promise<string | null> {
    return getApiKey();
  }

  async unbind(): Promise<void> {
    await clearApiKey();
  }
}

let provider: AccountProvider = new LocalKeyAccount();

export function getAccountProvider(): AccountProvider {
  return provider;
}

/** 切换账号后端（接入自建账号体系时调用） */
export function setAccountProvider(p: AccountProvider): void {
  provider = p;
}

/**
 * 安全存储：API Key 等敏感信息走 Keychain/Keystore（expo-secure-store）
 */
import * as SecureStore from 'expo-secure-store';

const KEY_API = 'dsl.apiKey';

export async function getApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_API);
}

export async function setApiKey(key: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_API, key.trim());
}

export async function clearApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_API);
}

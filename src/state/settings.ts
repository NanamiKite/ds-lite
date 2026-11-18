/**
 * 应用设置（zustand + AsyncStorage 持久化；敏感 Key 不落此库，走 SecureStore）
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getApiKey } from '@/storage/secure';

export type ThemeMode = 'system' | 'light' | 'dark';
/** 记忆模式：关闭 / 仅手动（只注入）/ 自动（注入+每轮提取） */
export type MemoryMode = 'off' | 'manual' | 'auto';

interface SettingsState {
  onboarded: boolean;
  themeMode: ThemeMode;
  /** API Key 是否已绑定（Key 本体在 SecureStore，不进持久化快照） */
  apiKeyBound: boolean;
  apiKeyLabel: string | null;
  /** 个性（自定义指令）：类似 ChatGPT Custom Instructions / Gemini Gems */
  personaEnabled: boolean;
  personaAbout: string;
  personaStyle: string;
  memoryMode: MemoryMode;
  /**
   * 上下文 token 预算：预算内发送全量历史（配合 DeepSeek 自动前缀缓存），
   * 超出部分滚动摘要压缩后以摘要形式携带
   */
  contextTokens: number;

  setOnboarded(): void;
  setThemeMode(m: ThemeMode): void;
  refreshKeys(): Promise<void>;
  setContextTokens(n: number): void;
  setPersona(patch: Partial<Pick<SettingsState, 'personaEnabled' | 'personaAbout' | 'personaStyle'>>): void;
  setMemoryMode(m: MemoryMode): void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      onboarded: false,
      themeMode: 'system',
      apiKeyBound: false,
      apiKeyLabel: null,
      contextTokens: 16000,
      personaEnabled: false,
      personaAbout: '',
      personaStyle: '',
      memoryMode: 'manual',

      setOnboarded: () => set({ onboarded: true }),
      setThemeMode: (themeMode) => set({ themeMode }),
      refreshKeys: async () => {
        const key = await getApiKey();
        set({
          apiKeyBound: !!key,
          apiKeyLabel: key ? `sk-***${key.slice(-4)}` : null,
        });
      },
      setContextTokens: (contextTokens) =>
        set({ contextTokens: Math.max(4000, Math.min(128000, Math.round(contextTokens))) }),
      setPersona: (patch) => set(patch),
      setMemoryMode: (memoryMode) => set({ memoryMode }),
    }),
    {
      name: 'dsl.settings',
      storage: createJSONStorage(() => AsyncStorage),
      // 敏感/派生字段不持久化，启动时 refreshKeys() 重建
      partialize: (s) => ({
        onboarded: s.onboarded,
        themeMode: s.themeMode,
        contextTokens: s.contextTokens,
        personaEnabled: s.personaEnabled,
        personaAbout: s.personaAbout,
        personaStyle: s.personaStyle,
        memoryMode: s.memoryMode,
      }),
    }
  )
);

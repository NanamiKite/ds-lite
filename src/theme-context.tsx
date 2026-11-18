/**
 * 主题上下文：跟随系统或用户指定，输出最终配色
 */
import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { darkColors, lightColors, type ThemeColors } from '@/theme';
import { useSettings } from '@/state/settings';

interface ThemeCtx {
  colors: ThemeColors;
  dark: boolean;
}

const Ctx = createContext<ThemeCtx>({ colors: lightColors, dark: false });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const mode = useSettings((s) => s.themeMode);
  const system = useColorScheme();
  const dark = mode === 'dark' || (mode === 'system' && system === 'dark');
  const value = useMemo(() => ({ colors: dark ? darkColors : lightColors, dark }), [dark]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  return useContext(Ctx);
}

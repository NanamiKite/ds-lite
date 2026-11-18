import { Redirect } from 'expo-router';
import React, { useSyncExternalStore } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useSettings } from '@/state/settings';
import { useTheme } from '@/theme-context';

/** 订阅持久化水合状态（模块级函数保证订阅身份稳定） */
function subscribeHydration(cb: () => void): () => void {
  return useSettings.persist.onFinishHydration(cb);
}

/** 入口：水合完成后判定跳转，避免已引导用户被误弹回引导页 */
export default function Index() {
  const { colors } = useTheme();
  const onboarded = useSettings((s) => s.onboarded);
  // 外部 store（zustand persist）的标准接入方式：
  // 水合完成前 getSnapshot 返回 false，完成后自动重渲染，无需手写 state/effect
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => useSettings.persist.hasHydrated(),
    () => true
  );

  if (!hydrated) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (onboarded) return <Redirect href="/chats" />;
  return <Redirect href="/onboarding" />;
}

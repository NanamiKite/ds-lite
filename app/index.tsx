import { Redirect } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useSettings } from '@/state/settings';
import { useTheme } from '@/theme-context';

/** 入口：等待持久化水合完成后再判定跳转，避免已引导用户被误弹回引导页 */
export default function Index() {
  const { colors } = useTheme();
  const onboarded = useSettings((s) => s.onboarded);
  const [hydrated, setHydrated] = useState(() => useSettings.persist.hasHydrated());

  useEffect(() => {
    const unsub = useSettings.persist.onFinishHydration(() => setHydrated(true));
    if (useSettings.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);

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

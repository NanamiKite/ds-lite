import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTheme, ThemeProvider } from '@/theme-context';
import { useSettings } from '@/state/settings';

function AppStack() {
  const { colors, dark } = useTheme();
  const refreshKeys = useSettings((s) => s.refreshKeys);

  useEffect(() => {
    refreshKeys();
  }, [refreshKeys]);

  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="chats" />
        <Stack.Screen name="chat/[id]" options={{animation: 'slide_from_bottom'}} />
        <Stack.Screen name="import" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="memories" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppStack />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

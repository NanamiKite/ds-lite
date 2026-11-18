/**
 * 引导页：注册 DeepSeek 平台账号 → 创建 API Key → 粘贴校验绑定
 * 两种入口共用：
 *  - 首次启动（完整流程：欢迎页 → 三步）
 *  - ?mode=guide（从设置/聊天页进入：跳过欢迎页，可返回）
 */
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Clipboard from 'expo-clipboard';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAccountProvider } from '@/account/provider';
import { useSettings } from '@/state/settings';
import { DS_BLUE } from '@/theme';
import { useTheme } from '@/theme-context';

type Step = 'welcome' | 'register' | 'key';

export default function Onboarding() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const guideMode = mode === 'guide'; // 非首次进入：直接进引导步骤

  const refreshKeys = useSettings((s) => s.refreshKeys);
  const setOnboarded = useSettings((s) => s.setOnboarded);
  const [step, setStep] = useState<Step>(guideMode ? 'register' : 'welcome');
  const [keyInput, setKeyInput] = useState('');
  const [validating, setValidating] = useState(false);

  const openRegister = async () => {
    await WebBrowser.openBrowserAsync('https://platform.deepseek.com/sign_up', {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
    });
  };

  const openApiKeyPage = async () => {
    await WebBrowser.openBrowserAsync('https://platform.deepseek.com/api_keys', {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
    });
  };

  const finishFirstRun = () => {
    setOnboarded();
    router.replace('/chats');
  };

  const onBound = () => {
    if (guideMode) router.back();
    else finishFirstRun();
  };

  const pasteFromClipboard = async () => {
    const text = await Clipboard.getStringAsync().catch(() => '');
    if (text.trim()) setKeyInput(text.trim());
    else Alert.alert('剪贴板是空的', '请先在 DeepSeek 网页上复制你的 API Key');
  };

  const bind = async () => {
    if (!keyInput.trim()) {
      Alert.alert('提示', '请粘贴 API Key（形如 sk-xxxxxxxx）');
      return;
    }
    setValidating(true);
    try {
      const result = await getAccountProvider().bindApiKey(keyInput);
      if (result.ok) {
        await refreshKeys();
        const balance = result.balance
          ? `（余额 ${result.balance.amount} ${result.balance.currency === 'CNY' ? '元' : result.balance.currency}）`
          : '';
        Alert.alert('绑定成功', `Key 校验通过，可以开始对话了${balance}`, [
          { text: '完成', onPress: onBound },
        ]);
      } else {
        Alert.alert('校验失败', result.error ?? '请检查 Key 是否正确、复制时是否完整');
      }
    } finally {
      setValidating(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {guideMode && (
        <View style={styles.guideHeader}>
          <Pressable hitSlop={10} onPress={() => router.back()} style={{ paddingHorizontal: 6 }}>
            <Text style={{ color: colors.text, fontSize: 22 }}>‹</Text>
          </Pressable>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>绑定 API Key</Text>
          <View style={{ width: 34 }} />
        </View>
      )}

      {step === 'welcome' && (
        <View style={styles.center}>
          <View style={styles.logoBadge}>
            <Image
              source={require('../assets/mascot.png')}
              style={{ width: 62, height: 62 }}
              resizeMode="contain"
            />
          </View>
          <Text style={[styles.h1, { color: colors.text }]}>DS Lite</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            轻量、原生的 DeepSeek 对话客户端{'\n'}支持导入 ChatGPT / Gemini / DeepSeek 历史对话
          </Text>
          <Pressable style={[styles.primaryBtn, { backgroundColor: DS_BLUE }]} onPress={() => setStep('register')}>
            <Text style={styles.primaryBtnText}>开始使用</Text>
          </Pressable>
          <Pressable onPress={() => Alert.alert('稍后再说', '你可以随时在「设置」里绑定 API Key。', [{ text: '继续', onPress: finishFirstRun }])}>
            <Text style={[styles.skipText, { color: colors.textTertiary }]}>暂不绑定，先逛逛 →</Text>
          </Pressable>
        </View>
      )}

      {step === 'register' && (
        <ScrollView contentContainerStyle={styles.stepWrap} keyboardShouldPersistTaps="handled">
          <Text style={[styles.h2, { color: colors.text }]}>三步完成，全程约 2 分钟</Text>
          <StepCard
            colors={colors}
            index="1"
            title="注册 DeepSeek 账号"
            desc="platform.deepseek.com，手机号或邮箱"
            actionLabel="打开注册页面"
            onAction={openRegister}
          />
          <StepCard
            colors={colors}
            index="2"
            title="创建 API Key"
            desc="「API Keys」页创建并复制"
            actionLabel="打开 API Keys 页面"
            onAction={openApiKeyPage}
          />
          <StepCard
            colors={colors}
            index="3"
            title="回到这里粘贴绑定"
            desc="粘贴后校验，通过即绑定"
            actionLabel="下一步：粘贴 Key"
            onAction={() => setStep('key')}
          />
          {!guideMode && (
            <Pressable onPress={() => setStep('key')}>
              <Text style={[styles.skipText, { color: colors.textTertiary }]}>我已有 API Key，直接绑定 →</Text>
            </Pressable>
          )}
        </ScrollView>
      )}

      {step === 'key' && (
        <KeyboardAvoidingView style={styles.stepWrap} behavior="padding">
          <Text style={[styles.h2, { color: colors.text }]}>绑定 API Key</Text>
          <Text style={[styles.desc, { color: colors.textSecondary }]}>
            Key 仅保存在本机安全存储，不会上传任何服务器
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
              placeholder="sk-xxxxxxxxxxxxxxxx"
              placeholderTextColor={colors.placeholder}
              value={keyInput}
              onChangeText={setKeyInput}
              autoCapitalize="none"
              autoCorrect={false}
              multiline={false}
            />
            <Pressable style={[styles.pasteBtn, { borderColor: DS_BLUE }]} onPress={pasteFromClipboard} hitSlop={4}>
              <Text style={{ color: DS_BLUE, fontSize: 14, fontWeight: '600' }}>粘贴</Text>
            </Pressable>
          </View>
          <Pressable
            style={[styles.primaryBtn, { backgroundColor: DS_BLUE, opacity: validating ? 0.6 : 1 }]}
            onPress={bind}
            disabled={validating}
          >
            {validating ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>验证并绑定</Text>}
          </Pressable>
          <Pressable onPress={() => setStep('register')}>
            <Text style={[styles.skipText, { color: colors.textTertiary }]}>← 返回上一步</Text>
          </Pressable>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

function StepCard({
  colors, index, title, desc, actionLabel, onAction,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  index: string;
  title: string;
  desc: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
      <View style={styles.cardHead}>
        <View style={[styles.stepDot, { backgroundColor: DS_BLUE }]}>
          <Text style={styles.stepDotText}>{index}</Text>
        </View>
        <Text style={[styles.cardTitle, { color: colors.text }]}>{title}</Text>
      </View>
      <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>{desc}</Text>
      <Pressable style={[styles.cardBtn, { borderColor: DS_BLUE }]} onPress={onAction}>
        <Text style={[styles.cardBtnText, { color: DS_BLUE }]}>{actionLabel} →</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  guideHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 10, paddingVertical: 10,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  logoBadge: {
    width: 88, height: 88, borderRadius: 24, backgroundColor: DS_BLUE,
    alignItems: 'center', justifyContent: 'center',
  },
  logoText: { color: '#fff', fontSize: 34, fontWeight: '700' },
  h1: { fontSize: 30, fontWeight: '700' },
  h2: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  desc: { fontSize: 14, lineHeight: 20, marginBottom: 4 },
  primaryBtn: {
    alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center',
    height: 50, borderRadius: 25, marginTop: 20,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  skipText: { fontSize: 14, marginTop: 20, padding: 8 },
  stepWrap: { padding: 24, gap: 8 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepDot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepDotText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  cardTitle: { fontSize: 16, fontWeight: '600', flex: 1 },
  cardDesc: { fontSize: 13, lineHeight: 19 },
  cardBtn: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 7 },
  cardBtnText: { fontSize: 13, fontWeight: '600' },
  input: {
    flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, marginTop: 12, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },
  pasteBtn: {
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
    justifyContent: 'center', marginTop: 12,
  },
});

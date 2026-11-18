/**
 * 设置：账号（API Key 管理）、联网搜索、外观、上下文窗口、关于
 */
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as LegacyFS from 'expo-file-system/legacy';
import * as WebBrowser from 'expo-web-browser';
import { validateKey } from '@/api/deepseek';
import { getAccountProvider } from '@/account/provider';
import { dbStats, importBackup } from '@/db/repo';
import { countMemories, importMemories } from '@/db/memoryRepo';
import { ActionSheet } from '@/components/ActionSheet';
import { shareAllMarkdown, shareJsonBackup } from '@/export/share';
import { isBackupJson } from '@/export/format';
import { useSettings, type ThemeMode } from '@/state/settings';
import { DS_BLUE } from '@/theme';
import { useTheme } from '@/theme-context';

export default function SettingsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const settings = useSettings();

  const [checking, setChecking] = useState(false);
  const [unbindOpen, setUnbindOpen] = useState(false);

  const unbind = () => setUnbindOpen(true);

  const doUnbind = async () => {
    await getAccountProvider().unbind();
    await settings.refreshKeys();
  };

  const runExport = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      Alert.alert('导出失败', e instanceof Error ? e.message : String(e));
    }
  };

  const restoreBackup = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'text/*', 'application/octet-stream'],
      copyToCacheDirectory: true,
    });
    if (res.canceled) return;
    try {
      const text = await LegacyFS.readAsStringAsync(res.assets[0].uri, {
        encoding: LegacyFS.EncodingType.UTF8,
      });
      const json = JSON.parse(text) as unknown;
      if (!isBackupJson(json)) {
        Alert.alert('格式不对', '请选择 deepseek-lite 导出的备份 JSON');
        return;
      }
      const r = importBackup(json.sessions);
      const memNew = importMemories(json.memories.filter((m) => m.active).map((m) => m.content), 'import');
      Alert.alert(
        '恢复完成',
        `导入 ${r.imported} 个对话${r.skipped ? `，跳过 ${r.skipped} 个（已存在）` : ''}；新增记忆 ${memNew} 条`
      );
    } catch (e) {
      Alert.alert('恢复失败', e instanceof Error ? e.message : String(e));
    }
  };

  const openUrl = (url: string) => {
    WebBrowser.openBrowserAsync(url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
    }).catch(() => undefined);
  };

  const checkBalance = async () => {
    const key = await getAccountProvider().getApiKey();
    if (!key) { Alert.alert('提示', '尚未绑定 API Key'); return; }
    setChecking(true);
    try {
      const r = await validateKey(key);
      if (r.ok && r.balance) Alert.alert(
        '余额',
        `${r.balance.amount} ${r.balance.currency === 'CNY' ? '元' : r.balance.currency}`,
        [
          { text: '知道了' },
          { text: '前往充值 →', onPress: () => openUrl('https://platform.deepseek.com/top_up') },
        ]
      );
      else if (r.ok) Alert.alert('正常', 'Key 有效（余额接口未返回数据）');
      else Alert.alert('校验失败', r.error);
    } finally { setChecking(false); }
  };

  const stats = dbStats();
  const memStats = countMemories();

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable hitSlop={10} onPress={() => router.back()} style={{ paddingHorizontal: 6 }}>
          <Text style={{ color: colors.text, fontSize: 22 }}>‹</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>设置</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Group colors={colors} title="账号">
          <Row colors={colors} label="API Key" value={settings.apiKeyBound ? settings.apiKeyLabel ?? '已绑定' : '未绑定'} />
          <Actions>
            <Action colors={colors} label={settings.apiKeyBound ? '重新绑定（引导）' : '开始绑定（引导）'} primary onPress={() => router.push('/onboarding?mode=guide')} />
            <Action colors={colors} label="查余额" onPress={checkBalance} disabled={checking || !settings.apiKeyBound} />
            <Action colors={colors} label="解绑" danger onPress={unbind} disabled={!settings.apiKeyBound} />
          </Actions>
          <Actions>
            <Action colors={colors} label="💰 充值" onPress={() => openUrl('https://platform.deepseek.com/top_up')} />
            <Action colors={colors} label="🔑 API Keys" onPress={() => openUrl('https://platform.deepseek.com/api_keys')} />
            <Action colors={colors} label="🏠 开放平台" onPress={() => openUrl('https://platform.deepseek.com')} />
          </Actions>
        </Group>

        <Group colors={colors} title="外观">
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {([['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']] as Array<[ThemeMode, string]>).map(([mode, label]) => {
              const active = settings.themeMode === mode;
              return (
                <Pressable
                  key={mode}
                  style={[styles.seg, { backgroundColor: active ? colors.pillActiveBg : colors.pillBg }]}
                  onPress={() => settings.setThemeMode(mode)}
                >
                  <Text style={{ color: active ? colors.pillActiveText : colors.pillText, fontSize: 13.5 }}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Group>

        <Group colors={colors} title="个性与记忆">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.text, fontSize: 15, flex: 1 }}>自定义指令（个性）</Text>
            <Switch
              value={settings.personaEnabled}
              onValueChange={(v) => settings.setPersona({ personaEnabled: v })}
              trackColor={{ true: DS_BLUE }}
            />
          </View>
          {settings.personaEnabled && (
            <View style={{ marginTop: 8, gap: 8 }}>
              <TextInput
                style={[styles.input, { marginTop: 0, borderColor: colors.border, borderWidth: 1, backgroundColor: colors.inputBg, color: colors.text }]}
                placeholder="关于我：身份、背景、约束（如：我是后端工程师，在上海）"
                placeholderTextColor={colors.placeholder}
                value={settings.personaAbout}
                onChangeText={(t) => settings.setPersona({ personaAbout: t })}
                multiline
              />
              <TextInput
                style={[styles.input, { marginTop: 0, borderColor: colors.border, borderWidth: 1, backgroundColor: colors.inputBg, color: colors.text }]}
                placeholder="回复风格：希望我如何回应（如：简洁直接，先给结论）"
                placeholderTextColor={colors.placeholder}
                value={settings.personaStyle}
                onChangeText={(t) => settings.setPersona({ personaStyle: t })}
                multiline
              />
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
            <Text style={{ color: colors.text, fontSize: 15, flex: 1 }}>记忆</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
              {settings.memoryMode === 'off' ? '已关闭' : settings.memoryMode === 'auto' ? '自动提取' : '仅手动'} ·{' '}
              {memStats.active}/{memStats.total} 条
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
            <Text style={{ color: colors.text, fontSize: 15, flex: 1 }}>跨对话参考</Text>
            <Switch
              value={settings.crossChatReference}
              onValueChange={settings.setCrossChatReference}
              trackColor={{ true: DS_BLUE }}
            />
          </View>
          <Actions>
            <Action colors={colors} label="管理记忆" primary onPress={() => router.push('/memories')} />
          </Actions>
        </Group>

        <Group colors={colors} title="对话上下文">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.text, fontSize: 15 }}>上下文预算</Text>
            <Text style={{ color: DS_BLUE, fontSize: 15, fontWeight: '600' }}>
              {settings.contextTokens >= 1000 ? `${Math.round(settings.contextTokens / 1000)}k` : settings.contextTokens} tokens
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {[8000, 16000, 32000, 64000, 128000].map((n) => {
              const active = settings.contextTokens === n;
              return (
                <Pressable
                  key={n}
                  style={[styles.seg, { backgroundColor: active ? colors.pillActiveBg : colors.pillBg }]}
                  onPress={() => settings.setContextTokens(n)}
                >
                  <Text style={{ color: active ? colors.pillActiveText : colors.pillText, fontSize: 13 }}>
                    {n >= 1000 ? `${n / 1000}k` : n}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.hint, { color: colors.textTertiary }]}>
            预算内全量发送可命中前缀缓存（约 1/10 计费），超预算自动摘要压缩
          </Text>
        </Group>

        <Group colors={colors} title="数据">
          <Row colors={colors} label="本地会话 / 消息" value={`${stats.sessions} / ${stats.messages}`} />
          <Actions>
            <Action colors={colors} label="导出备份" onPress={() => runExport(shareJsonBackup)} />
            <Action colors={colors} label="导出 Markdown" onPress={() => runExport(shareAllMarkdown)} />
            <Action colors={colors} label="从备份恢复" onPress={restoreBackup} />
          </Actions>
        </Group>

        <Group colors={colors} title="关于">
          <Row colors={colors} label="版本" value="0.1.0" />
          <Text style={[styles.hint, { color: colors.textTertiary }]}>
            非官方第三方客户端，基于 DeepSeek 开放平台 API，与 DeepSeek 官方无关联
          </Text>
        </Group>
      </ScrollView>

      <ActionSheet
        visible={unbindOpen}
        onClose={() => setUnbindOpen(false)}
        title="解绑 API Key"
        subtitle="解绑后将无法发送新消息，历史对话保留"
        actions={[
          { key: 'unbind', label: '确认解绑', icon: '⚡', danger: true, onPress: doUnbind },
        ]}
      />
    </View>
  );
}

function Group({ colors, title, children }: { colors: ReturnType<typeof useTheme>['colors']; title: string; children: React.ReactNode }) {
  return (
    <View style={[styles.group, { borderColor: colors.border }]}>
      <Text style={{ color: colors.textTertiary, fontSize: 13, marginBottom: 8 }}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ colors, label, value }: { colors: ReturnType<typeof useTheme>['colors']; label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={{ color: colors.textSecondary, fontSize: 15 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>{value}</Text>
    </View>
  );
}

function Actions({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>{children}</View>;
}

function Action({
  colors, label, onPress, primary, danger, disabled,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  label: string;
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const color = danger ? colors.danger : primary ? DS_BLUE : colors.textSecondary;
  return (
    <Pressable
      style={[styles.actionBtn, { borderColor: color, opacity: disabled ? 0.4 : 1 }]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={{ color, fontSize: 14, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 17, fontWeight: '700' },
  body: { padding: 16, gap: 14, paddingBottom: 48 },
  group: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  input: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
    fontSize: 14.5, marginTop: 8,
  },
  actionBtn: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 7 },
  seg: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18 },
  hint: { fontSize: 12, lineHeight: 17, marginTop: 8 },
  mask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: { borderRadius: 16, padding: 18, width: '100%' },
});

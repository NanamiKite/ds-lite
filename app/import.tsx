/**
 * 导入向导：选择导出文件 → 自动识别格式 → 预览 → 幂等导入
 */
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { importConversations } from '@/db/repo';
import { ImportError, parseExportText, type ParsedExport } from '@/import';
import type { SessionSource } from '@/types';
import { DS_BLUE } from '@/theme';
import { useTheme } from '@/theme-context';

const FORMAT_LABEL: Record<string, string> = {
  'chatgpt-conversations': 'ChatGPT / DeepSeek 官方导出（conversations.json）',
  'deepseek-web': 'DeepSeek 网页版站点数据',
  'gemini-activity': 'Google Takeout · My Activity（Gemini Apps）',
  'gemini-conversations': 'Gemini 会话记录（conversations / ndjson）',
  'generic-messages': '通用消息 JSON',
};

export default function ImportScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [parsed, setParsed] = useState<ParsedExport | null>(null);
  const [fileName, setFileName] = useState('');
  const [sourceOverride, setSourceOverride] = useState<SessionSource | null>(null);
  const [importing, setImporting] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'application/octet-stream', 'text/*', 'application/zip', 'public.json'],
      copyToCacheDirectory: true,
    });
    if (res.canceled) return;
    const asset = res.assets[0];
    setLoading(true);
    try {
      const text = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const result = parseExportText(text);
      setParsed(result);
      setFileName(asset.name);
      setSourceOverride(null);
    } catch (e) {
      Alert.alert('解析失败', e instanceof ImportError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const doImport = async () => {
    if (!parsed) return;
    setImporting(true);
    try {
      const source = sourceOverride ?? parsed.source;
      const result = importConversations(source, parsed.conversations);
      Alert.alert(
        '导入完成',
        `新导入 ${result.imported} 个对话${result.skipped ? `，跳过 ${result.skipped} 个（已存在或为空）` : ''}。`,
        [{ text: '好的', onPress: () => router.back() }]
      );
    } finally {
      setImporting(false);
    }
  };

  const compatibleAmbiguous = parsed?.format === 'chatgpt-conversations';

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable hitSlop={10} onPress={() => router.back()} style={{ paddingHorizontal: 6 }}>
          <Text style={{ color: colors.text, fontSize: 22 }}>‹</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>导入对话</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Pressable style={[styles.section, { borderColor: colors.border }]} onPress={() => setShowHowTo((v) => !v)}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>
            ① 如何导出？ {showHowTo ? '▾' : '▸'}
          </Text>
        </Pressable>
        {showHowTo && (
          <View style={[styles.section, { borderColor: colors.border }]}>
            <Tip colors={colors} name="ChatGPT" steps="网页版 Settings → Data controls → Export data，邮件收到压缩包里的 conversations.json" />
            <Tip colors={colors} name="DeepSeek" steps="chat.deepseek.com 设置 → 导出数据，或社区导出扩展的 JSON" />
            <Tip colors={colors} name="Gemini" steps="takeout.google.com → 仅勾选 My Activity → Gemini Apps → 格式 JSON → MyActivity.json" />
          </View>
        )}

        <Section colors={colors} title="② 选择导出的文件">
          <Pressable
            style={[styles.pickBtn, { borderColor: DS_BLUE }]}
            onPress={pick}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={DS_BLUE} />
            ) : (
              <Text style={{ color: DS_BLUE, fontSize: 15, fontWeight: '600' }}>
                📄 选择 JSON 文件
              </Text>
            )}
          </Pressable>
          {!!fileName && (
            <Text style={{ color: colors.textTertiary, fontSize: 12.5, marginTop: 8, textAlign: 'center' }}>
              {fileName}
            </Text>
          )}
        </Section>

        {parsed && (
          <Section colors={colors} title="③ 识别结果">
            <InfoRow colors={colors} label="格式" value={FORMAT_LABEL[parsed.format] ?? parsed.format} />
            <InfoRow colors={colors} label="对话数" value={`${parsed.stats.conversations}`} />
            <InfoRow colors={colors} label="消息数" value={`${parsed.stats.messages}`} />
            {!!parsed.stats.withoutResponse && (
              <InfoRow colors={colors} label="无回复" value={`${parsed.stats.withoutResponse} 个（Takeout 不含回复）`} />
            )}
            {!!parsed.stats.note && (
              <Text style={{ color: colors.textTertiary, fontSize: 12.5, marginTop: 4 }}>· {parsed.stats.note}</Text>
            )}
            {compatibleAmbiguous && (
              <View style={styles.sourcePick}>
                <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 8 }}>
                  此格式由 ChatGPT 与 DeepSeek 官方导出共用，请确认来源：
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {( ['chatgpt', 'deepseek'] as SessionSource[]).map((s) => {
                    const active = (sourceOverride ?? parsed.source) === s;
                    return (
                      <Pressable
                        key={s}
                        style={[styles.sourceOpt, { backgroundColor: active ? colors.pillActiveBg : colors.pillBg }]}
                        onPress={() => setSourceOverride(s)}
                      >
                        <Text style={{ color: active ? colors.pillActiveText : colors.pillText, fontSize: 13.5, fontWeight: '500' }}>
                          {s === 'chatgpt' ? '来自 ChatGPT' : '来自 DeepSeek'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
            <Pressable
              style={[styles.importBtn, { backgroundColor: DS_BLUE, opacity: importing ? 0.6 : 1 }]}
              onPress={doImport}
              disabled={importing}
            >
              {importing ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 15.5, fontWeight: '600' }}>导入到本机</Text>}
            </Pressable>
            <Text style={{ color: colors.textTertiary, fontSize: 12, marginTop: 10, textAlign: 'center' }}>
              重复导入同一文件会自动跳过已存在的对话
            </Text>
          </Section>
        )}
      </ScrollView>
    </View>
  );
}

function Section({ colors, title, children }: { colors: ReturnType<typeof useTheme>['colors']; title: string; children: React.ReactNode }) {
  return (
    <View style={[styles.section, { borderColor: colors.border }]}>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 10 }}>{title}</Text>
      {children}
    </View>
  );
}

function Tip({ colors, name, steps }: { colors: ReturnType<typeof useTheme>['colors']; name: string; steps: string }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: DS_BLUE, fontSize: 13.5, fontWeight: '600' }}>{name}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 2 }}>{steps}</Text>
    </View>
  );
}

function InfoRow({ colors, label, value }: { colors: ReturnType<typeof useTheme>['colors']; label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 }}>
      <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500', flexShrink: 1, textAlign: 'right', marginLeft: 16 }}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  body: { padding: 18, gap: 16 },
  section: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16 },
  pickBtn: {
    borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 14,
    paddingVertical: 22, alignItems: 'center',
  },
  sourcePick: { marginTop: 12 },
  sourceOpt: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18 },
  importBtn: {
    marginTop: 16, borderRadius: 24, paddingVertical: 13,
    alignItems: 'center', justifyContent: 'center',
  },
});

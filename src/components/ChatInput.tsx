/**
 * 底部输入栏：输入框 + 发送/停止 + 「深度思考」「联网搜索」开关
 * 联网搜索为 DeepSeek 官方服务端工具（deepseek_web_search），无需额外配置
 */
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme-context';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  thinking: boolean;
  search: boolean;
  onToggleThinking: () => void;
  onToggleSearch: () => void;
  /** 对话级记忆开关（不传则不显示，如全局记忆已关闭） */
  memoryOn?: boolean;
  onToggleMemory?: () => void;
}

export function ChatInput({
  value, onChange, onSend, onStop, busy,
  thinking, search, onToggleThinking, onToggleSearch,
  memoryOn, onToggleMemory,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={[styles.pillRow]}>
        <Pill
          colors={colors}
          active={thinking}
          label="深度思考"
          icon="✦"
          onPress={onToggleThinking}
        />
        <Pill
          colors={colors}
          active={search}
          label="联网搜索"
          icon="⌕"
          onPress={onToggleSearch}
        />
        {!!onToggleMemory && (
          <Pill
            colors={colors}
            active={memoryOn !== false}
            label="记忆"
            icon="◉"
            onPress={onToggleMemory}
          />
        )}
      </View>
      <View style={[styles.inputRow]}>
        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text }]}
          placeholder="发消息给 DeepSeek"
          placeholderTextColor={colors.placeholder}
          value={value}
          onChangeText={onChange}
          multiline
          maxLength={8000}
          editable={!busy}
        />
        {busy ? (
          <Pressable
            style={[styles.sendBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            onPress={onStop}
            hitSlop={8}
          >
            <View style={[styles.stopIcon, { backgroundColor: colors.danger }]} />
          </Pressable>
        ) : (
          <Pressable
            style={[styles.sendBtn, { backgroundColor: value.trim() ? colors.primary : colors.pillBg }]}
            onPress={onSend}
            disabled={!value.trim()}
            hitSlop={8}
          >
            <Text style={{ color: value.trim() ? '#fff' : colors.textTertiary, fontSize: 18, fontWeight: '700' }}>↑</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function Pill({
  colors, active, label, icon, onPress,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  active: boolean;
  label: string;
  icon: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[
        styles.pill,
        { backgroundColor: active ? colors.pillActiveBg : colors.pillBg },
      ]}
      onPress={onPress}
      hitSlop={4}
      >
      <Text style={{ color: active ? colors.primary : colors.text, fontSize: 13.5, marginRight: 5 }}>{icon}</Text>
      <Text style={{ color: active ? colors.pillActiveText : colors.pillText, fontSize: 13.5, fontWeight: '500' }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingTop: 8 },
  pillRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  pill: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: 18,
  },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1, minHeight: 44, maxHeight: 132, borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: Platform.select({ ios: 12, android: 9 }),
    paddingTop: Platform.select({ ios: 12, android: 10 }),
    fontSize: 15.5, lineHeight: 22,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'transparent',
  },
  stopIcon: { width: 13, height: 13, borderRadius: 3 },
});

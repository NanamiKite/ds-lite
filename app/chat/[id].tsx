/**
 * 聊天页：流式对话、深度思考/联网搜索、导入会话续聊
 * 键盘避让：RN 0.88 edge-to-edge 下安卓也用 padding 行为，包住列表+输入区（标题栏不动）
 */
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, FlatList, KeyboardAvoidingView, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { MessageBubble } from '@/components/MessageBubble';
import { ChatInput } from '@/components/ChatInput';
import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { getSession, listMessages, setSessionMemoryEnabled } from '@/db/repo';
import { useChatStore } from '@/state/chat';
import { useSettings } from '@/state/settings';
import { SOURCE_COLOR, SOURCE_LABEL, type ChatMessage } from '@/types';
import { DS_BLUE } from '@/theme';
import { useTheme } from '@/theme-context';

const SUGGESTIONS = [
  '帮我解释一个概念',
  '写一段示例代码',
  '制定一周健身计划',
  '把这段话翻译成英文',
];

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = String(id);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [title, setTitle] = useState('新对话');
  const [source, setSource] = useState<'local' | 'chatgpt' | 'gemini' | 'deepseek'>('local');
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [search, setSearch] = useState(false);
  const [memEnabled, setMemEnabled] = useState<boolean | null>(null);
  const [msgSheet, setMsgSheet] = useState<ChatMessage | null>(null);

  const live = useChatStore((s) => s.live);
  const tick = useChatStore((s) => s.tick);
  const busySession = useChatStore((s) => s.busySession);
  const memoryToast = useChatStore((s) => s.memoryToast);
  const clearMemoryToast = useChatStore((s) => s.clearMemoryToast);
  const send = useChatStore((s) => s.send);
  const regenerate = useChatStore((s) => s.regenerate);
  const stop = useChatStore((s) => s.stop);
  const apiKeyBound = useSettings((s) => s.apiKeyBound);
  const memoryMode = useSettings((s) => s.memoryMode);

  const busy = busySession === sessionId;

  const reload = useCallback(() => {
    if (!sessionId) return;
    setMessages(listMessages(sessionId));
    const s = getSession(sessionId);
    if (s) {
      setTitle(s.title);
      setSource(s.source);
      setMemEnabled(s.memoryEnabled ?? null);
    }
  }, [sessionId]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  useEffect(() => {
    reload();
  }, [tick, reload]);

  // 自动记忆提取提示：显示 4.5 秒后消失
  useEffect(() => {
    if (!memoryToast) return;
    const t = setTimeout(clearMemoryToast, 4500);
    return () => clearTimeout(t);
  }, [memoryToast, clearMemoryToast]);

  // 流式消息：live 覆盖 DB 里同 id 的节流快照
  const display = useMemo(() => {
    if (!live || live.sessionId !== sessionId) return messages;
    const idx = messages.findIndex((m) => m.id === live.messageId);
    const liveMsg: ChatMessage = {
      id: live.messageId,
      sessionId,
      role: 'assistant',
      content: live.content,
      reasoning: live.reasoning || null,
      createdAt: idx >= 0 ? messages[idx].createdAt : Date.now(),
      status: live.status,
      error: live.error ?? null,
      seq: idx >= 0 ? messages[idx].seq : Number.MAX_SAFE_INTEGER,
      meta: {
        model: live.model,
        search: live.search ? { query: live.search.query, results: live.search.results } : undefined,
      },
    };
    if (idx >= 0) {
      const copy = [...messages];
      copy[idx] = liveMsg;
      return copy;
    }
    return [...messages, liveMsg];
  }, [messages, live, sessionId]);

  const reversed = useMemo(() => [...display].reverse(), [display]);
  const lastAssistantId = useMemo(() => {
    for (let i = display.length - 1; i >= 0; i--) {
      if (display[i].role === 'assistant') return display[i].id;
    }
    return null;
  }, [display]);

  const onSend = () => {
    const text = input;
    setInput('');
    send(sessionId, text, { thinking, search });
  };

  const msgSheetActions: SheetAction[] = msgSheet
    ? [
        {
          key: 'copy',
          label: '复制全文',
          icon: '⧉',
          onPress: () => { Clipboard.setStringAsync(msgSheet.content).catch(() => undefined); },
        },
        ...(msgSheet.role === 'assistant' && msgSheet.id === lastAssistantId && !busy
          ? [{
              key: 'regen',
              label: '重新生成',
              icon: '↻',
              onPress: () => regenerate(sessionId, { thinking, search }),
            }]
          : []),
      ]
    : [];

  const empty = display.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 标题栏：不参与键盘避让 */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border, paddingTop: insets.top + 6 }]}>
        <Pressable hitSlop={10} onPress={() => router.back()} style={styles.backBtn}>
          <Text style={{ color: colors.text, fontSize: 22 }}>‹</Text>
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center', maxWidth: 260 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            {title}
          </Text>
          {source !== 'local' ? (
            <View style={[styles.badge, { backgroundColor: `${SOURCE_COLOR[source]}1A` }]}>
              <Text style={{ color: SOURCE_COLOR[source], fontSize: 11 }}>
                导入自 {SOURCE_LABEL[source]}
              </Text>
            </View>
          ) : (
            thinking ? (
              <Text style={{ color: colors.textTertiary, fontSize: 11 }}>深度思考 · deepseek-flash</Text>
            ) : (
              <Text style={{ color: colors.textTertiary, fontSize: 11 }}>deepseek-flash</Text>
            )
          )}
        </View>
        {/* 固定占位：保证标题始终居中 */}
        <View style={{ width: 34 }} />
      </View>

      {!apiKeyBound && (
        <Pressable style={[styles.warnBar, { backgroundColor: colors.reasoningBg }]} onPress={() => router.push('/onboarding?mode=guide')}>
          <Text style={{ color: colors.reasoningText, fontSize: 12.5 }}>
            绑定 API Key 后开始对话，点击开始 →
          </Text>
        </Pressable>
      )}

      {/* 键盘避让区：列表 + 输入栏（安卓 edge-to-edge 与 iOS 统一 padding 行为） */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
        {empty ? (
          <View style={[styles.welcome, { backgroundColor: colors.background }]}>
            <View style={styles.welcomeBadge}>
              <Text style={styles.welcomeWhale}>🐋</Text>
            </View>
            <Text style={[styles.welcomeTitle, { color: colors.text }]}>你好，我是 DeepSeek</Text>
            <Text style={[styles.welcomeSubtitle, { color: colors.textSecondary }]}>
              欢迎与我对话，我可以协助你写作、分析、编程{'\n'}也会尽力回答其他问题
            </Text>
            {!apiKeyBound && (
              <Pressable
                style={[styles.welcomeCta, { backgroundColor: DS_BLUE }]}
                onPress={() => router.push('/onboarding?mode=guide')}
              >
                <Text style={{ color: '#fff', fontSize: 15.5, fontWeight: '600' }}>绑定 API Key，开始对话</Text>
              </Pressable>
            )}
            <View style={styles.suggestWrap}>
              {SUGGESTIONS.map((s) => (
                <Pressable
                  key={s}
                  style={[styles.suggestChip, { backgroundColor: colors.pillBg, borderColor: colors.border }]}
                  onPress={() => setInput(s)}
                >
                  <Text style={{ color: colors.pillText, fontSize: 13 }}>{s}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            data={reversed}
            inverted
            style={{ flex: 1 }}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
            renderItem={({ item }) => (
              <MessageBubble
                message={item}
                isLive={item.id === live?.messageId && live?.sessionId === sessionId}
                canRegenerate={item.id === lastAssistantId && !busy}
                onRegenerate={() => regenerate(sessionId, { thinking, search })}
                onLongPress={() => setMsgSheet(item)}
              />
            )}
          />
        )}

        {!!memoryToast && (
          <Pressable
            style={[styles.memoryToast, { backgroundColor: colors.reasoningBg }]}
            onPress={() => { clearMemoryToast(); router.push('/memories'); }}
          >
            <Text style={{ color: colors.reasoningText, fontSize: 12.5, lineHeight: 17 }} numberOfLines={3}>
              💡 已记住：{memoryToast.items.join('；')}（点击管理）
            </Text>
          </Pressable>
        )}

        <ChatInput
          value={input}
          onChange={setInput}
          onSend={onSend}
          onStop={stop}
          busy={busy}
          thinking={thinking}
          search={search}
          onToggleThinking={() => setThinking((v) => !v)}
          onToggleSearch={() => setSearch((v) => !v)}
          memoryOn={memEnabled !== false}
          onToggleMemory={
            memoryMode === 'off'
              ? undefined
              : () => {
                  const next = memEnabled === false ? true : false;
                  setSessionMemoryEnabled(sessionId, next);
                  setMemEnabled(next);
                }
          }
        />
      </KeyboardAvoidingView>

      {/* 消息长按菜单（主题化） */}
      <ActionSheet
        visible={!!msgSheet}
        onClose={() => setMsgSheet(null)}
        title={msgSheet?.role === 'user' ? '用户消息' : '助手消息'}
        actions={msgSheetActions}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16.5, fontWeight: '600', maxWidth: 260 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9, marginTop: 3 },
  warnBar: { paddingVertical: 8, paddingHorizontal: 16 },
  welcome: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  welcomeBadge: {
    width: 84, height: 84, borderRadius: 24, backgroundColor: DS_BLUE,
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  welcomeWhale: { fontSize: 40 },
  welcomeTitle: { fontSize: 21, fontWeight: '700', marginBottom: 10 },
  welcomeSubtitle: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 28 },
  welcomeCta: { borderRadius: 24, paddingHorizontal: 26, paddingVertical: 13, marginBottom: 24 },
  suggestWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  suggestChip: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 18,
    paddingHorizontal: 14, paddingVertical: 9,
  },
  memoryToast: { marginHorizontal: 12, marginBottom: 6, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
});

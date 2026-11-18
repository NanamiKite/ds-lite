/**
 * 消息气泡：用户=右侧气泡；助手=全宽纯文本（对齐官方 App）
 * 含：思维链折叠面板、流式光标、搜索来源、错误/停止状态
 */
import React, { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import type { ChatMessage } from '@/types';
import { useTheme } from '@/theme-context';
import { MarkdownView } from './MarkdownView';

interface Props {
  message: ChatMessage;
  isLive?: boolean;
  canRegenerate?: boolean;
  onRegenerate?: () => void;
  /** 长按消息（由聊天页弹出主题化菜单：复制/重新生成等） */
  onLongPress?: () => void;
}

export function MessageBubble({ message, isLive, canRegenerate, onRegenerate, onLongPress }: Props) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);

  if (message.role === 'user') {
    return (
      <View style={styles.userRow}>
        <Pressable
          onLongPress={onLongPress}
          style={[styles.userBubble, { backgroundColor: colors.userBubble }]}
        >
          <Text style={[styles.userText, { color: colors.userBubbleText }]}>{message.content}</Text>
        </Pressable>
      </View>
    );
  }

  const reasoning = message.reasoning ?? '';
  const streamingThinking = isLive && message.status === 'streaming' && !message.content && !!reasoning;
  const showReasoning = !!reasoning || streamingThinking;

  return (
    <View style={styles.assistantRow}>
      {showReasoning && (
        <Pressable
          style={[styles.reasoning, { backgroundColor: colors.reasoningBg }]}
          onPress={() => setExpanded((v) => !v)}
        >
          <Text style={[styles.reasoningTitle, { color: colors.reasoningText }]}>
            {streamingThinking ? '正在深度思考…' : '已深度思考'} {expanded ? '▾' : '▸'}
          </Text>
          {(expanded || streamingThinking) && !!reasoning && (
            <Text style={[styles.reasoningBody, { color: colors.reasoningText }]}>{reasoning}</Text>
          )}
        </Pressable>
      )}

      {message.content ? (
        isLive && message.status === 'streaming' ? (
          // 流式过程中用纯文本+光标（避免反复解析半截 Markdown 闪烁）
          <Pressable onLongPress={onLongPress}>
            <Text style={[styles.assistantText, { color: colors.text }]}>
              {message.content}
              <Text style={{ color: colors.primary }}>▍</Text>
            </Text>
          </Pressable>
        ) : (
          <Pressable onLongPress={onLongPress}>
            <MarkdownView text={message.content} />
          </Pressable>
        )
      ) : isLive && message.status === 'streaming' && !reasoning ? (
        <View style={styles.dots}>
          <Dot colors={colors} delay={0} />
          <Dot colors={colors} delay={160} />
          <Dot colors={colors} delay={320} />
        </View>
      ) : null}

      {message.meta?.search?.results?.length ? (
        <View style={styles.sources}>
          <Text style={[styles.sourcesTitle, { color: colors.textTertiary }]}>参考来源</Text>
          {message.meta.search.results.slice(0, 5).map((r, i) => (
            <Pressable key={i} onPress={() => Linking.openURL(r.url).catch(() => undefined)}>
              <Text style={[styles.sourceItem, { color: colors.textSecondary }]} numberOfLines={1}>
                [{i + 1}] {r.title || r.url}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {message.status === 'error' && !!message.error && (
        <View style={styles.errorRow}>
          <Text style={[styles.errorText, { color: colors.danger }]}>⚠ {message.error}</Text>
          {message.error.includes('余额不足') && (
            <Pressable
              onPress={() =>
                WebBrowser.openBrowserAsync('https://platform.deepseek.com/top_up', {
                  presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
                }).catch(() => undefined)
              }
            >
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>充值 →</Text>
            </Pressable>
          )}
          {canRegenerate && onRegenerate && (
            <Pressable onPress={onRegenerate}>
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>重试</Text>
            </Pressable>
          )}
        </View>
      )}

      {message.status === 'stopped' && (
        <Text style={[styles.stoppedText, { color: colors.textTertiary }]}>已停止生成</Text>
      )}

      {message.status === 'done' && !isLive && canRegenerate && onRegenerate && (
        <Pressable style={styles.regBtn} onPress={onRegenerate}>
          <Text style={{ color: colors.textTertiary, fontSize: 12.5 }}>↻ 重新生成</Text>
        </Pressable>
      )}
    </View>
  );
}

function Dot({ colors, delay }: { colors: ReturnType<typeof useTheme>['colors']; delay: number }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setOn((v) => !v), 640);
    return () => clearInterval(t);
  }, []);
  return (
    <View
      style={{
        width: 7,
        height: 7,
        borderRadius: 4,
        marginHorizontal: 3,
        backgroundColor: colors.primary,
        opacity: on ? 0.3 + delay / 640 : 0.9,
      }}
    />
  );
}

const styles = StyleSheet.create({
  userRow: { flexDirection: 'row', justifyContent: 'flex-end', marginVertical: 6 },
  userBubble: {
    maxWidth: '82%',
    borderRadius: 18,
    borderBottomRightRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userText: { fontSize: 15.5, lineHeight: 23 },
  assistantRow: { marginVertical: 6 },
  assistantText: { fontSize: 15.5, lineHeight: 25 },
  reasoning: { borderRadius: 12, padding: 12, marginBottom: 10 },
  reasoningTitle: { fontSize: 13, fontWeight: '600' },
  reasoningBody: { fontSize: 13, lineHeight: 20, marginTop: 8 },
  dots: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  sources: { marginTop: 10, gap: 3 },
  sourcesTitle: { fontSize: 12, marginBottom: 2 },
  sourceItem: { fontSize: 12.5, lineHeight: 18 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 },
  errorText: { fontSize: 13.5, flex: 1 },
  stoppedText: { fontSize: 12.5, marginTop: 6 },
  regBtn: { alignSelf: 'flex-start', marginTop: 8, paddingVertical: 4, paddingHorizontal: 8 },
});

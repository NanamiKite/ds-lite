/**
 * 会话列表：日期分组、搜索、新建、导入入口
 * 交互：左滑快捷操作（置顶/导出/删除）、长按完整菜单（主题化 ActionSheet）
 */
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Pressable, SectionList, StyleSheet, Text, TextInput, View,
} from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { shareSessionMarkdown } from '@/export/share';
import {
  createSession, listSessions, togglePin, deleteSession, renameSession,
} from '@/db/repo';
import { SOURCE_COLOR, SOURCE_LABEL, type Session } from '@/types';
import { useTheme } from '@/theme-context';
import { useChatStore } from '@/state/chat';

function timeAgo(ts: number): string {
  const d = Date.now() - ts;
  const m = Math.floor(d / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const day = Math.floor(h / 24);
  if (day < 30) return `${day} 天前`;
  return new Date(ts).toLocaleDateString('zh-CN');
}

/** 日期分组：今天/昨天/近 7 天/近 30 天/更早（置顶单独一组） */
function sectionKey(ts: number): string {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOfDay(now);
  if (ts >= today) return '今天';
  if (ts >= today - 86400000) return '昨天';
  if (ts >= today - 7 * 86400000) return '近 7 天';
  if (ts >= today - 30 * 86400000) return '近 30 天';
  return '更早';
}

export default function ChatsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<Session | null>(null);
  const [renameText, setRenameText] = useState('');
  const [sheetSession, setSheetSession] = useState<Session | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const clearLive = useChatStore((s) => s.clearLive);

  const reload = useCallback(() => {
    setSessions(listSessions(query));
  }, [query]);

  useFocusEffect(
    useCallback(() => {
      clearLive();
      reload();
    }, [reload, clearLive])
  );

  const newChat = () => {
    const s = createSession();
    router.push(`/chat/${s.id}`);
  };

  const openMenu = (s: Session) => {
    setConfirmDelete(false);
    setSheetSession(s);
  };

  const sheetActions: SheetAction[] = sheetSession
    ? confirmDelete
      ? [
          {
            key: 'confirm-del',
            label: `删除「${sheetSession.title.slice(0, 16)}」，不可恢复`,
            danger: true,
            onPress: () => { deleteSession(sheetSession.id); reload(); },
          },
        ]
      : [
          {
            key: 'pin',
            label: sheetSession.pinned ? '取消置顶' : '置顶',
            onPress: () => { togglePin(sheetSession.id); reload(); },
          },
          {
            key: 'rename',
            label: '重命名',
            onPress: () => { setRenaming(sheetSession); setRenameText(sheetSession.title); },
          },
          {
            key: 'export',
            label: '导出对话（Markdown）',
            onPress: () => { shareSessionMarkdown(sheetSession.id).catch(() => undefined); },
          },
          {
            key: 'del',
            label: '删除对话',
            danger: true,
            keepOpen: true,
            onPress: () => setConfirmDelete(true),
          },
        ]
    : [];

  const sections = useMemo(() => {
    const pinned = sessions.filter((s) => s.pinned);
    const rest = sessions.filter((s) => !s.pinned);
    const groups = new Map<string, Session[]>();
    for (const s of rest) {
      const key = sectionKey(s.updatedAt);
      const bucket = groups.get(key);
      if (bucket) bucket.push(s);
      else groups.set(key, [s]);
    }
    const order = ['今天', '昨天', '近 7 天', '近 30 天', '更早'];
    const result: { title: string; data: Session[] }[] = [];
    if (pinned.length) result.push({ title: '置顶', data: pinned });
    for (const key of order) {
      const data = groups.get(key);
      if (data?.length) result.push({ title: key, data });
    }
    return result;
  }, [sessions]);

  const swipeActions = (s: Session) => (
    <View style={styles.swipeRow}>
      <SwipeBtn
        label={s.pinned ? '取消置顶' : '置顶'}
        bg={colors.surfaceAlt}
        fg={colors.textSecondary}
        onPress={() => { togglePin(s.id); reload(); }}
      />
      <SwipeBtn
        label="导出"
        bg={colors.surfaceAlt}
        fg={colors.primary}
        onPress={() => { shareSessionMarkdown(s.id).catch(() => undefined); }}
      />
      <SwipeBtn
        label="删除"
        bg="#FDE8E8"
        fg={colors.danger}
        onPress={() => { setConfirmDelete(true); setSheetSession(s); }}
      />
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>DeepSeek</Text>
        </View>
        <Pressable style={styles.headerBtn} onPress={() => router.push('/import')}>
          <Text style={{ color: colors.textSecondary, fontSize: 15 }}>导入</Text>
        </Pressable>
        <View style={{ width: 10 }} />
        <Pressable style={styles.headerBtn} onPress={() => router.push('/settings')}>
          <Text style={{ color: colors.textSecondary, fontSize: 15 }}>设置</Text>
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          style={[styles.search, { backgroundColor: colors.inputBg, color: colors.text }]}
          placeholder="搜索对话…"
          placeholderTextColor={colors.placeholder}
          value={query}
          onChangeText={(t) => {
            setQuery(t);
            setSessions(listSessions(t));
          }}
          returnKeyType="search"
        />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(s) => s.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: 96 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ color: colors.textSecondary, fontSize: 15 }}>还没有对话，点下方按钮开始</Text>
            <Pressable
              style={[styles.newBtn, { backgroundColor: colors.primary }]}
              onPress={newChat}
            >
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>＋ 开启新对话</Text>
            </Pressable>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <ReanimatedSwipeable
            renderRightActions={() => swipeActions(item)}
            overshootRight={false}
            friction={2}
          >
            <Pressable
              style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfaceAlt : colors.background }]}
              onPress={() => router.push(`/chat/${item.id}`)}
              onLongPress={() => openMenu(item)}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
                  {item.title}
                </Text>
                {item.digest ? (
                  <Text style={[styles.rowDigest, { color: colors.textSecondary }]} numberOfLines={1}>
                    {item.digest}
                  </Text>
                ) : null}
                <View style={styles.rowMeta}>
                  <Text style={[styles.rowTime, { color: colors.textTertiary }]}>{timeAgo(item.updatedAt)}</Text>
                  {item.pinned && <Text style={[styles.rowTime, { color: colors.textTertiary }]}>· 置顶</Text>}
                  {item.source !== 'local' && (
                    <View style={[styles.badge, { backgroundColor: `${SOURCE_COLOR[item.source]}1A` }]}>
                      <View style={[styles.badgeDot, { backgroundColor: SOURCE_COLOR[item.source] }]} />
                      <Text style={{ color: SOURCE_COLOR[item.source], fontSize: 11 }}>
                        {SOURCE_LABEL[item.source]}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
              <Text style={{ color: colors.textTertiary, fontSize: 20 }}>›</Text>
            </Pressable>
          </ReanimatedSwipeable>
        )}
      />

      {sections.length > 0 && (
        <Pressable
          style={[styles.fab, { backgroundColor: colors.primary }, { bottom: insets.bottom + 18 }]}
          onPress={newChat}
        >
          <Text style={{ color: '#fff', fontSize: 26, fontWeight: '300', marginTop: -2 }}>＋</Text>
        </Pressable>
      )}

      <ActionSheet
        visible={!!sheetSession}
        onClose={() => setSheetSession(null)}
        title={confirmDelete ? '确认删除' : sheetSession?.title}
        subtitle={confirmDelete ? '删除后无法恢复' : undefined}
        actions={sheetActions}
      />
    </View>
  );
}

function SwipeBtn({
  label, bg, fg, onPress,
}: {
  label: string;
  bg: string;
  fg: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.swipeBtn, { backgroundColor: bg }]} onPress={onPress}>
      <Text style={{ color: fg, fontSize: 12.5, fontWeight: '500' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 22, fontWeight: '700' },
  headerBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  searchWrap: { paddingHorizontal: 14, paddingVertical: 10 },
  search: { height: 38, borderRadius: 19, paddingHorizontal: 16, fontSize: 14.5 },
  sectionTitle: { fontSize: 12.5, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 13 },
  rowTitle: { fontSize: 15.5, fontWeight: '500' },
  rowDigest: { fontSize: 12.5, marginTop: 2 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  rowTime: { fontSize: 12.5 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 9 },
  badgeDot: { width: 5, height: 5, borderRadius: 3 },
  swipeRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8, paddingLeft: 8 },
  swipeBtn: { width: 62, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingTop: 120, gap: 6 },
  newBtn: { marginTop: 16, paddingHorizontal: 22, paddingVertical: 11, borderRadius: 22 },
  fab: {
    position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', elevation: 4, shadowRadius: 8, shadowOpacity: 0.25, shadowOffset: { width: 0, height: 4 },
  },
});

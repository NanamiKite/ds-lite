/**
 * 会话列表：搜索、新建、导入入口、长按管理（置顶/重命名/删除）
 */
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { shareSessionMarkdown } from '@/export/share';
import { createSession, listSessions, togglePin, deleteSession, renameSession } from '@/db/repo';
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
            icon: '🗑',
            danger: true,
            onPress: () => { deleteSession(sheetSession.id); reload(); },
          },
        ]
      : [
          {
            key: 'pin',
            label: sheetSession.pinned ? '取消置顶' : '置顶',
            icon: '📌',
            onPress: () => { togglePin(sheetSession.id); reload(); },
          },
          {
            key: 'rename',
            label: '重命名',
            icon: '✎',
            onPress: () => { setRenaming(sheetSession); setRenameText(sheetSession.title); },
          },
          {
            key: 'export',
            label: '导出对话（Markdown）',
            icon: '⇪',
            onPress: () => { shareSessionMarkdown(sheetSession.id).catch(() => undefined); },
          },
          {
            key: 'del',
            label: '删除对话',
            icon: '🗑',
            danger: true,
            keepOpen: true,
            onPress: () => setConfirmDelete(true),
          },
        ]
    : [];

  const applyRename = () => {
    if (renaming && renameText.trim()) {
      renameSession(renaming.id, renameText);
      reload();
    }
    setRenaming(null);
  };

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
          <Text style={{ color: colors.textSecondary, fontSize: 15 }}>⚙</Text>
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

      <FlatList
        data={sessions}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ paddingBottom: 96 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>💬</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 15 }}>还没有对话，点下方按钮开始</Text>
            <Pressable
              style={[styles.newBtn, { backgroundColor: colors.primary }]}
              onPress={newChat}
            >
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>＋ 开启新对话</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfaceAlt : 'transparent' }]}
            onPress={() => router.push(`/chat/${item.id}`)}
            onLongPress={() => openMenu(item)}
          >
            {item.pinned && <Text style={{ color: colors.textTertiary, fontSize: 12 }}>📌 </Text>}
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
        )}
      />

      {sessions.length > 0 && (
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

      <Modal visible={!!renaming} transparent animationType="fade" onRequestClose={() => setRenaming(null)}>
        <Pressable style={styles.modalMask} onPress={() => setRenaming(null)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.surface }]} onPress={() => undefined}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>重命名对话</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
              value={renameText}
              onChangeText={setRenameText}
              autoFocus
              selectTextOnFocus
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setRenaming(null)} style={styles.modalBtn}>
                <Text style={{ color: colors.textSecondary, fontSize: 15 }}>取消</Text>
              </Pressable>
              <Pressable onPress={applyRename} style={styles.modalBtn}>
                <Text style={{ color: colors.primary, fontSize: 15, fontWeight: '600' }}>确定</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
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
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 13 },
  rowTitle: { fontSize: 15.5, fontWeight: '500' },
  rowDigest: { fontSize: 12.5, marginTop: 2 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  rowTime: { fontSize: 12.5 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 9 },
  badgeDot: { width: 5, height: 5, borderRadius: 3 },
  empty: { alignItems: 'center', paddingTop: 120, gap: 6 },
  newBtn: { marginTop: 16, paddingHorizontal: 22, paddingVertical: 11, borderRadius: 22 },
  fab: {
    position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', elevation: 4, shadowRadius: 8, shadowOpacity: 0.25, shadowOffset: { width: 0, height: 4 },
  },
  modalMask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  modalCard: { borderRadius: 16, padding: 20, width: '100%', gap: 14 },
  modalTitle: { fontSize: 17, fontWeight: '600' },
  modalInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 18 },
  modalBtn: { paddingVertical: 6, paddingHorizontal: 8 },
});

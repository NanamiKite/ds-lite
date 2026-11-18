/**
 * 记忆管理：查看/添加/编辑/启停/删除，支持导入
 * - 文件：ChatGPT 导出中的 memories 类 JSON（如有）
 * - 粘贴：Gemini「保存的信息」页面文本或任意每行一条的文本
 */
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import React, { useState } from 'react';
import {
  Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { addMemory, deleteMemory, importMemories, listMemories, updateMemory, type MemoryItem } from '@/db/memoryRepo';
import { parseMemoriesText } from '@/memory/parse';
import { useSettings, type MemoryMode } from '@/state/settings';
import { DS_BLUE } from '@/theme';
import { useTheme } from '@/theme-context';

const SOURCE_LABEL: Record<MemoryItem['source'], string> = {
  manual: '手动',
  auto: '自动',
  import: '导入',
};

export default function MemoriesScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const settings = useSettings();

  const [items, setItems] = useState<MemoryItem[]>(() => listMemories());
  const [newText, setNewText] = useState('');
  const [editing, setEditing] = useState<MemoryItem | null>(null);
  const [editText, setEditText] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sheetMemory, setSheetMemory] = useState<MemoryItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const reload = () => setItems(listMemories());

  const sheetActions: SheetAction[] = sheetMemory
    ? confirmDelete
      ? [
          {
            key: 'confirm-del',
            label: '确认删除这条记忆',
            danger: true,
            onPress: () => { deleteMemory(sheetMemory.id); reload(); },
          },
        ]
      : [
          {
            key: 'toggle',
            label: sheetMemory.active ? '停用（不注入对话）' : '启用',
            onPress: () => { updateMemory(sheetMemory.id, { active: !sheetMemory.active }); reload(); },
          },
          {
            key: 'edit',
            label: '编辑',
            onPress: () => { setEditing(sheetMemory); setEditText(sheetMemory.content); },
          },
          {
            key: 'del',
            label: '删除',
            danger: true,
            keepOpen: true,
            onPress: () => setConfirmDelete(true),
          },
        ]
    : [];

  const add = () => {
    if (!newText.trim()) return;
    addMemory(newText, 'manual');
    setNewText('');
    reload();
  };

  const importFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'text/*', 'application/octet-stream'],
      copyToCacheDirectory: true,
    });
    if (res.canceled) return;
    const asset = res.assets[0];
    const size = (asset as { size?: number; fileSize?: number }).size
      ?? (asset as { fileSize?: number }).fileSize;
    if (size && size > 10 * 1024 * 1024) {
      Alert.alert('文件过大', '记忆文件超过 10MB 上限');
      return;
    }
    setBusy(true);
    try {
      const text = await FileSystem.readAsStringAsync(res.assets[0].uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      applyImport(text, `文件 ${res.assets[0].name}`);
    } catch (e) {
      Alert.alert('导入失败', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const applyImport = (text: string, from: string) => {
    const parsed = parseMemoriesText(text);
    if (!parsed.items.length) {
      Alert.alert('没有可导入的内容', '未在内容中找到记忆条目');
      return;
    }
    const n = importMemories(parsed.items, 'import');
    reload();
    Alert.alert('导入完成', `从${from}新增 ${n} 条记忆（重复的已跳过）`);
  };

  const applyPaste = () => {
    setPasteOpen(false);
    applyImport(pasteText, '粘贴内容');
    setPasteText('');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable hitSlop={10} onPress={() => router.back()} style={{ paddingHorizontal: 6 }}>
          <Text style={{ color: colors.text, fontSize: 22 }}>‹</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>记忆</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={[styles.modeCard, { borderColor: colors.border }]}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600', marginRight: 8 }}>记忆模式</Text>
            {([['off', '关闭'], ['manual', '仅手动'], ['auto', '自动提取']] as Array<[MemoryMode, string]>).map(([mode, label]) => {
              const active = settings.memoryMode === mode;
              return (
                <Pressable
                  key={mode}
                  style={[styles.modeOpt, { backgroundColor: active ? colors.pillActiveBg : colors.pillBg }]}
                  onPress={() => settings.setMemoryMode(mode)}
                >
                  <Text style={{ color: active ? colors.pillActiveText : colors.pillText, fontSize: 13.5, fontWeight: '500' }}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {settings.memoryMode === 'auto' && (
            <Text style={{ color: colors.textTertiary, fontSize: 12, marginTop: 8 }}>
              自动提取每轮额外调用一次 API（消耗少量额度，消息内容会发送给模型）
            </Text>
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable style={[styles.btn, { borderColor: DS_BLUE }]} onPress={importFile} disabled={busy}>
            <Text style={{ color: DS_BLUE, fontSize: 13.5, fontWeight: '600' }}>{busy ? '读取中…' : '从文件导入'}</Text>
          </Pressable>
          <Pressable style={[styles.btn, { borderColor: colors.border }]} onPress={() => setPasteOpen(true)}>
            <Text style={{ color: colors.textSecondary, fontSize: 13.5, fontWeight: '600' }}>粘贴导入</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text }]}
            placeholder="添加一条记忆，如：我是素食者"
            placeholderTextColor={colors.placeholder}
            value={newText}
            onChangeText={setNewText}
            onSubmitEditing={add}
            returnKeyType="done"
          />
          <Pressable style={[styles.addBtn, { backgroundColor: newText.trim() ? DS_BLUE : colors.pillBg }]} onPress={add} hitSlop={6}>
            <Text style={{ color: newText.trim() ? '#fff' : colors.textTertiary, fontSize: 20, fontWeight: '600' }}>＋</Text>
          </Pressable>
        </View>

        <Text style={{ color: colors.textTertiary, fontSize: 13, marginVertical: 10 }}>
          共 {items.length} 条 · 生效 {items.filter((m) => m.active).length} 条 · 长按管理
        </Text>

        <FlatList
          data={items}
          scrollEnabled={false}
          keyExtractor={(m) => m.id}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 30 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>暂无记忆</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [
                styles.memRow,
                { backgroundColor: pressed ? colors.surfaceAlt : colors.surface, borderColor: colors.border },
                !item.active && { opacity: 0.45 },
              ]}
              onPress={() => { setConfirmDelete(false); setSheetMemory(item); }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 14.5, lineHeight: 20 }} numberOfLines={3}>
                  {item.content}
                </Text>
                <Text style={{ color: colors.textTertiary, fontSize: 11.5, marginTop: 4 }}>
                  {SOURCE_LABEL[item.source]} · {new Date(item.updatedAt).toLocaleDateString('zh-CN')}
                </Text>
              </View>
              <Switch
                value={item.active}
                onValueChange={(v) => { updateMemory(item.id, { active: v }); reload(); }}
                trackColor={{ true: DS_BLUE }}
              />
            </Pressable>
          )}
        />
      </ScrollView>

      <ActionSheet
        visible={!!sheetMemory}
        onClose={() => setSheetMemory(null)}
        title={confirmDelete ? '确认删除' : undefined}
        subtitle={confirmDelete ? sheetMemory?.content.slice(0, 50) : undefined}
        actions={sheetActions}
      />

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <Pressable style={styles.mask} onPress={() => setEditing(null)}>
          <Pressable style={[styles.card, { backgroundColor: colors.surface }]} onPress={() => undefined}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 12 }}>编辑记忆</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.text, borderWidth: 1 }]}
              value={editText}
              onChangeText={setEditText}
              autoFocus
              multiline
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 18 }}>
              <Pressable onPress={() => setEditing(null)} style={{ paddingVertical: 6 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 15 }}>取消</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (editing && editText.trim()) { updateMemory(editing.id, { content: editText }); reload(); }
                  setEditing(null);
                }}
                style={{ paddingVertical: 6 }}
              >
                <Text style={{ color: DS_BLUE, fontSize: 15, fontWeight: '600' }}>保存</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={pasteOpen} transparent animationType="fade" onRequestClose={() => setPasteOpen(false)}>
        <Pressable style={styles.mask} onPress={() => setPasteOpen(false)}>
          <Pressable style={[styles.card, { backgroundColor: colors.surface }]} onPress={() => undefined}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 8 }}>粘贴导入</Text>
            <TextInput
              style={[styles.pasteBox, { backgroundColor: colors.inputBg, color: colors.text }]}
              placeholder={'- 我是素食者\n- 我在上海工作'}
              placeholderTextColor={colors.placeholder}
              value={pasteText}
              onChangeText={setPasteText}
              multiline
              textAlignVertical="top"
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 18 }}>
              <Pressable onPress={() => setPasteOpen(false)} style={{ paddingVertical: 6 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 15 }}>取消</Text>
              </Pressable>
              <Pressable onPress={applyPaste} style={{ paddingVertical: 6 }}>
                <Text style={{ color: DS_BLUE, fontSize: 15, fontWeight: '600' }}>导入</Text>
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 17, fontWeight: '700' },
  body: { padding: 16, paddingBottom: 48 },
  modeCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, marginBottom: 14 },
  modeOpt: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18 },
  btn: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  input: { flex: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14.5 },
  addBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  memRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
  },
  mask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: { borderRadius: 16, padding: 18, width: '100%' },
  pasteBox: { borderRadius: 10, padding: 12, fontSize: 14, minHeight: 120 },
});

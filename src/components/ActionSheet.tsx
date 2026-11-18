/**
 * 主题化底部动作菜单（替代原生 Alert 菜单，跟随应用配色/圆角）
 * 用法：actions 传动作列表；危险动作 danger 标红；两步确认由调用方切换 actions 实现
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme-context';

export interface SheetAction {
  key: string;
  label: string;
  icon?: string;
  danger?: boolean;
  /** 点击后保持菜单打开（用于两步确认等中间步骤） */
  keepOpen?: boolean;
  onPress: () => void;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  actions: SheetAction[];
}

export function ActionSheet({ visible, onClose, title, subtitle, actions }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.mask} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 12) }]}
          onPress={() => undefined}
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          {!!title && (
            <View style={styles.titleWrap}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{title}</Text>
              {!!subtitle && (
                <Text style={[styles.subtitle, { color: colors.textTertiary }]} numberOfLines={2}>
                  {subtitle}
                </Text>
              )}
            </View>
          )}
          <View style={[styles.group, { backgroundColor: colors.surfaceAlt }]}>
            {actions.map((a, i) => (
              <React.Fragment key={a.key}>
                {i > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                <Pressable
                  style={({ pressed }) => [styles.row, pressed && { backgroundColor: `${colors.primary}14` }]}
                  onPress={() => { if (!a.keepOpen) onClose(); a.onPress(); }}
                >
                  {!!a.icon && (
                    <Text style={{ fontSize: 16, width: 24, textAlign: 'center', color: a.danger ? colors.danger : colors.textSecondary }}>
                      {a.icon}
                    </Text>
                  )}
                  <Text style={{ color: a.danger ? colors.danger : colors.text, fontSize: 15.5, flex: 1 }}>
                    {a.label}
                  </Text>
                  <Text style={{ color: colors.textTertiary, fontSize: 16 }}>›</Text>
                </Pressable>
              </React.Fragment>
            ))}
          </View>
          <Pressable style={[styles.cancel, { backgroundColor: colors.surfaceAlt }]} onPress={onClose}>
            <Text style={{ color: colors.textSecondary, fontSize: 15.5, fontWeight: '600' }}>取消</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 12, paddingTop: 8,
  },
  grabber: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 6, marginBottom: 8 },
  titleWrap: { paddingHorizontal: 12, paddingBottom: 10 },
  title: { fontSize: 16, fontWeight: '700' },
  subtitle: { fontSize: 12.5, marginTop: 3, lineHeight: 17 },
  group: { borderRadius: 14, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 50 },
  cancel: { borderRadius: 14, alignItems: 'center', paddingVertical: 13, marginTop: 8 },
});

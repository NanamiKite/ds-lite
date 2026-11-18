/**
 * 轻定制 Markdown 渲染：对齐主题色的代码块 / 引用 / 链接
 */
import React from 'react';
import { Platform } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { DS_BLUE } from '@/theme';
import { useTheme } from '@/theme-context';

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

export function MarkdownView({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <Markdown
      style={{
        body: { color: colors.text, fontSize: 15.5, lineHeight: 25 },
        paragraph: { marginTop: 0, marginBottom: 8 },
        heading1: { color: colors.text, fontSize: 22, fontWeight: '700', marginTop: 14, marginBottom: 8 },
        heading2: { color: colors.text, fontSize: 19, fontWeight: '700', marginTop: 12, marginBottom: 6 },
        heading3: { color: colors.text, fontSize: 17, fontWeight: '600', marginTop: 10, marginBottom: 6 },
        heading4: { color: colors.text, fontSize: 15.5, fontWeight: '600', marginTop: 8, marginBottom: 4 },
        heading5: { color: colors.text, fontSize: 15, fontWeight: '600' },
        heading6: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
        link: { color: DS_BLUE },
        strong: { fontWeight: '700' },
        em: { fontStyle: 'italic' },
        bullet_list_icon: { color: colors.textSecondary, lineHeight: 25 },
        ordered_list_icon: { color: colors.textSecondary, lineHeight: 25 },
        blockquote: {
          backgroundColor: colors.surfaceAlt,
          borderLeftColor: DS_BLUE,
          borderLeftWidth: 3,
          borderRadius: 6,
          paddingHorizontal: 10,
          paddingVertical: 4,
          marginVertical: 8,
        },
        fence: {
          backgroundColor: colors.codeBg,
          color: colors.text,
          fontFamily: MONO,
          fontSize: 13,
          lineHeight: 20,
          borderRadius: 10,
          padding: 12,
          marginVertical: 8,
        },
        code_inline: {
          backgroundColor: colors.codeBg,
          color: colors.text,
          fontFamily: MONO,
          fontSize: 13.5,
          borderRadius: 4,
          paddingHorizontal: 5,
        },
        hr: { backgroundColor: colors.border, height: 1, marginVertical: 10 },
        table: { borderWidth: 1, borderColor: colors.border, borderRadius: 6 },
        thead: { backgroundColor: colors.surfaceAlt },
        th: { padding: 6, color: colors.text },
        tr: { borderColor: colors.border, borderWidth: 1 },
        td: { padding: 6, color: colors.text },
      }}
    >
      {text}
    </Markdown>
  );
}

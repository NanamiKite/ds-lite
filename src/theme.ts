/**
 * ds-lite 主题：对齐官方 DeepSeek App 的视觉语言
 * - 品牌蓝 #4D6BFE
 * - 用户消息：右侧浅蓝气泡；助手消息：左侧无气泡纯文本
 */

export const DS_BLUE = '#4D6BFE';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  primary: string;
  onPrimary: string;
  userBubble: string;
  userBubbleText: string;
  reasoningBg: string;
  reasoningText: string;
  codeBg: string;
  danger: string;
  inputBg: string;
  placeholder: string;
  headerBg: string;
  pillActiveBg: string;
  pillActiveText: string;
  pillBg: string;
  pillText: string;
}

export const lightColors: ThemeColors = {
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F7F8FA',
  text: '#1A1A1A',
  textSecondary: '#5C5C66',
  textTertiary: '#9A9AA3',
  border: '#ECECF0',
  primary: DS_BLUE,
  onPrimary: '#FFFFFF',
  userBubble: '#E8EEFD',
  userBubbleText: '#1A1A1A',
  reasoningBg: '#F4F6FB',
  reasoningText: '#6B7A99',
  codeBg: '#F2F3F7',
  danger: '#E5484D',
  inputBg: '#F2F3F7',
  placeholder: '#9A9AA3',
  headerBg: '#FFFFFF',
  pillActiveBg: '#E8EEFD',
  pillActiveText: DS_BLUE,
  pillBg: '#F2F3F7',
  pillText: '#5C5C66',
};

export const darkColors: ThemeColors = {
  background: '#101014',
  surface: '#16161C',
  surfaceAlt: '#1D1D24',
  text: '#EDEDF2',
  textSecondary: '#A8A8B3',
  textTertiary: '#6E6E7A',
  border: '#26262E',
  primary: DS_BLUE,
  onPrimary: '#FFFFFF',
  userBubble: '#26324F',
  userBubbleText: '#EDEDF2',
  reasoningBg: '#171C2A',
  reasoningText: '#7C8BAD',
  codeBg: '#1B1B22',
  danger: '#FF6369',
  inputBg: '#1D1D24',
  placeholder: '#6E6E7A',
  headerBg: '#101014',
  pillActiveBg: '#1C2A4F',
  pillActiveText: '#8FA7FF',
  pillBg: '#1D1D24',
  pillText: '#A8A8B3',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 8, md: 12, lg: 18, full: 999 };

export function uuid(): string {
  // 轻量 uuid v4（本地数据库主键足够）
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

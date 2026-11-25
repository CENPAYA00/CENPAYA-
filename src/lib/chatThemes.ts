export type ChatThemeKey = 'emerald' | 'ocean' | 'sunset' | 'midnight';

export type ChatTheme = {
  key: ChatThemeKey;
  label: string;
  bubbleMine: string;
  bubbleTheirs: string;
  bubbleTheirsDark: string;
  bg: string;
  bgDark: string;
  accent: string;
};

export const CHAT_THEMES: Record<ChatThemeKey, ChatTheme> = {
  emerald: {
    key: 'emerald',
    label: 'Emerald',
    bubbleMine: 'bg-[#0F5132] text-white',
    bubbleTheirs: 'bg-white text-gray-800',
    bubbleTheirsDark: 'dark:bg-[#242526] dark:text-gray-100',
    bg: 'bg-[#F5F7F5]',
    bgDark: 'dark:bg-[#0A0F0D]',
    accent: '#10B981',
  },
  ocean: {
    key: 'ocean',
    label: 'Ocean',
    bubbleMine: 'bg-[#0E4F8E] text-white',
    bubbleTheirs: 'bg-white text-gray-800',
    bubbleTheirsDark: 'dark:bg-[#1E2A38] dark:text-gray-100',
    bg: 'bg-[#EFF6FF]',
    bgDark: 'dark:bg-[#0A1626]',
    accent: '#3B82F6',
  },
  sunset: {
    key: 'sunset',
    label: 'Sunset',
    bubbleMine: 'bg-[#B23A48] text-white',
    bubbleTheirs: 'bg-white text-gray-800',
    bubbleTheirsDark: 'dark:bg-[#3A1F24] dark:text-gray-100',
    bg: 'bg-[#FFF1EC]',
    bgDark: 'dark:bg-[#1A0E10]',
    accent: '#F97316',
  },
  midnight: {
    key: 'midnight',
    label: 'Midnight',
    bubbleMine: 'bg-[#4C1D95] text-white',
    bubbleTheirs: 'bg-white text-gray-800',
    bubbleTheirsDark: 'dark:bg-[#2A1F3D] dark:text-gray-100',
    bg: 'bg-[#F3F0FF]',
    bgDark: 'dark:bg-[#0D0819]',
    accent: '#8B5CF6',
  },
};

export const CHAT_THEME_LIST: ChatTheme[] = Object.values(CHAT_THEMES);

export function resolveTheme(key: string | null | undefined): ChatTheme {
  const fallback: ChatThemeKey = 'emerald';
  const safeKey: ChatThemeKey =
    key && (key in CHAT_THEMES) ? (key as ChatThemeKey) : fallback;
  return CHAT_THEMES[safeKey];
}

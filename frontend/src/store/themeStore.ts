import { create } from 'zustand';

type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  initTheme: () => void;
}

const STORAGE_KEY = 'mashwara-theme';
const LEGACY_STORAGE_KEY = 'boardroom-theme';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
    // Backward compatibility: migrate from legacy key if it exists
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY) as Theme | null;
    if (legacy === 'light' || legacy === 'dark' || legacy === 'system') {
      localStorage.setItem(STORAGE_KEY, legacy);
      return legacy;
    }
  } catch (e) {
    console.error('Failed to read theme from localStorage', e);
  }
  return 'system';
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: getInitialTheme(),
  setTheme: (theme: Theme) => {
    set({ theme });
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      console.error('Failed to save theme to localStorage', e);
    }
    get().initTheme();
  },
  initTheme: () => {
    const { theme } = get();
    const isDark =
      theme === 'dark' ||
      (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  },
}));

// Initialize theme on load if possible (outside component lifecycle)
if (typeof window !== 'undefined') {
  useThemeStore.getState().initTheme();

  // Listen for OS system theme changes if system theme is selected
  try {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => {
      if (useThemeStore.getState().theme === 'system') {
        useThemeStore.getState().initTheme();
      }
    };
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleSystemThemeChange);
    } else if ((mediaQuery as any).addListener) {
      (mediaQuery as any).addListener(handleSystemThemeChange);
    }
  } catch (e) {
    console.error('Failed to bind mediaQuery listener for theme', e);
  }
}


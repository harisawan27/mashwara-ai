import { create } from 'zustand';

type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  initTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'dark', // default to dark since it's the premium aesthetic
  setTheme: (theme: Theme) => {
    set({ theme });
    localStorage.setItem('boardroom-theme', theme);
    get().initTheme();
  },
  initTheme: () => {
    const { theme } = get();
    const isDark =
      theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  },
}));

// Initialize theme on load if possible (outside component lifecycle)
if (typeof window !== 'undefined') {
  const savedTheme = localStorage.getItem('boardroom-theme') as Theme;
  if (savedTheme) {
    useThemeStore.setState({ theme: savedTheme });
  }
  useThemeStore.getState().initTheme();

  // Listen for system changes if system theme is selected
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (useThemeStore.getState().theme === 'system') {
      useThemeStore.getState().initTheme();
    }
  });
}

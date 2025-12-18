'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  Theme,
  ThemeName,
  ThemeMode,
  getTheme,
  applyTheme,
  getCurrentTheme
} from './theme-config';

interface ThemeContextType {
  theme: Theme;
  setTheme: (name: ThemeName, mode: ThemeMode) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    // Initialize with current theme or default
    if (typeof window !== 'undefined') {
      return getCurrentTheme();
    }
    return getTheme('terminal', 'dark');
  });

  useEffect(() => {
    // Apply theme on mount and when it changes
    applyTheme(theme);
  }, [theme]);

  const setTheme = (name: ThemeName, mode: ThemeMode) => {
    const newTheme = getTheme(name, mode);
    setThemeState(newTheme);
  };

  const toggleMode = () => {
    const newMode: ThemeMode = theme.mode === 'dark' ? 'light' : 'dark';
    setTheme(theme.name, newMode);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

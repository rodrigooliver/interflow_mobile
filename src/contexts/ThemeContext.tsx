import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {getThemeColors, type AppThemeMode} from '../theme/tokens';
import {saveThemePreference} from '../services/appPreferences';

interface ThemeContextValue {
  theme: AppThemeMode;
  colors: ReturnType<typeof getThemeColors>;
  setTheme: (theme: AppThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

export function ThemeProvider({
  children,
  initialTheme = 'light',
}: {
  children: ReactNode;
  initialTheme?: AppThemeMode;
}) {
  const [theme, setThemeState] = useState<AppThemeMode>(initialTheme);

  const setTheme = useCallback((next: AppThemeMode) => {
    setThemeState(next);
    void saveThemePreference(next).catch(e =>
      console.warn('[Theme] failed to persist', e),
    );
  }, []);

  const value = useMemo(
    () => ({
      theme,
      colors: getThemeColors(theme),
      setTheme,
    }),
    [theme, setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

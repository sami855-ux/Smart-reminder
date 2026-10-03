import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme as useSystemColorScheme, View } from 'react-native';
import { useColorScheme as useNativeWindColorScheme, vars } from 'nativewind';

export type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = '@smart-reminder/appearance';

const lightVariables = vars({
  '--color-canvas': '243 244 239',
  '--color-paper': '255 255 255',
  '--color-secondary-fill': '231 233 226',
  '--color-taupe': '217 221 210',
  '--color-foreground': '18 21 16',
  '--color-muted-foreground': '92 98 87',
  '--color-subtle-foreground': '125 132 120',
  '--color-accent': '78 104 23',
  '--color-intelligence-soft': '238 245 218',
  '--color-success-soft': '233 243 234',
  '--color-urgent-soft': '248 237 234',
  '--color-warning-soft': '247 240 226',
  '--color-scheduled-soft': '233 238 242',
  '--color-completed-soft': '233 241 234',
  '--color-auth-canvas': '243 244 239',
  '--color-auth-surface': '255 255 255',
  '--color-auth-line': '217 221 210',
  '--color-auth-ink': '18 21 16',
  '--color-auth-muted': '92 98 87',
});

const darkVariables = vars({
  '--color-canvas': '13 15 13',
  '--color-paper': '25 28 24',
  '--color-secondary-fill': '42 46 40',
  '--color-taupe': '65 70 62',
  '--color-foreground': '246 247 243',
  '--color-muted-foreground': '183 189 178',
  '--color-subtle-foreground': '143 151 138',
  '--color-accent': '184 243 74',
  '--color-intelligence-soft': '40 52 24',
  '--color-success-soft': '28 53 36',
  '--color-urgent-soft': '61 35 33',
  '--color-warning-soft': '61 47 26',
  '--color-scheduled-soft': '32 46 58',
  '--color-completed-soft': '29 52 37',
  '--color-auth-canvas': '13 15 13',
  '--color-auth-surface': '25 28 24',
  '--color-auth-line': '65 70 62',
  '--color-auth-ink': '246 247 243',
  '--color-auth-muted': '183 189 178',
});

const themeColors = {
  light: {
    accent: '#4E6817',
    canvas: '#F3F4EF',
    foreground: '#121510',
    muted: '#7D8478',
    paper: '#FFFFFF',
  },
  dark: {
    accent: '#B8F34A',
    canvas: '#0D0F0D',
    foreground: '#F6F7F3',
    muted: '#8F978A',
    paper: '#191C18',
  },
} as const;

type ThemeContextValue = {
  colors: (typeof themeColors)[ThemeMode];
  isDark: boolean;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemColorScheme = useSystemColorScheme();
  const { setColorScheme } = useNativeWindColorScheme();
  const [preference, setPreference] = useState<ThemeMode | null>(null);
  const mode: ThemeMode = preference ?? (systemColorScheme === 'dark' ? 'dark' : 'light');

  useEffect(() => {
    void AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((stored) => {
        if (stored === 'light' || stored === 'dark') setPreference(stored);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setColorScheme(mode);
  }, [mode, setColorScheme]);

  const setMode = useCallback((nextMode: ThemeMode) => {
    setPreference(nextMode);
    void AsyncStorage.setItem(THEME_STORAGE_KEY, nextMode).catch(() => undefined);
  }, []);

  const toggleMode = useCallback(() => {
    setMode(mode === 'dark' ? 'light' : 'dark');
  }, [mode, setMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: themeColors[mode],
      isDark: mode === 'dark',
      mode,
      setMode,
      toggleMode,
    }),
    [mode, setMode, toggleMode],
  );

  return (
    <ThemeContext.Provider value={value}>
      <View className="flex-1" style={mode === 'dark' ? darkVariables : lightVariables}>
        {children}
      </View>
    </ThemeContext.Provider>
  );
}

export function useAppTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useAppTheme must be used inside ThemeProvider');
  return value;
}

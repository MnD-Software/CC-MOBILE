import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { Appearance, Platform, useColorScheme } from "react-native";
import * as SystemUI from "expo-system-ui";
import { tokens } from "./tokens";
import {
  APPEARANCE_STORAGE_KEY,
  darkColors,
  parseAppearance,
  resolveAppearance,
  themedStyleMap,
  type AppearancePreference,
  type ThemeColors,
} from "./appearance";

type ThemeContextValue = {
  colors: ThemeColors;
  isDark: boolean;
  preference: AppearancePreference;
  setPreference: (value: AppearancePreference) => void;
  persistenceError: boolean;
};
const ThemeContext = createContext<ThemeContextValue>({
  colors: tokens.color,
  isDark: false,
  preference: "light",
  setPreference: () => {},
  persistenceError: false,
});

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [preference, setChoice] = useState<AppearancePreference>("light");
  const [persistenceError, setPersistenceError] = useState(false);
  const interacted = useRef(false);
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(APPEARANCE_STORAGE_KEY)
      .then((value) => {
        if (active && !interacted.current) setChoice(parseAppearance(value));
      })
      .catch(() => {
        if (active) setPersistenceError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const setPreference = useCallback((value: AppearancePreference) => {
    interacted.current = true;
    setChoice(value);
    writes.current = writes.current
      .then(() => AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, value))
      .then(() => setPersistenceError(false))
      .catch(() => setPersistenceError(true));
  }, []);
  const scheme = resolveAppearance(preference, systemScheme);
  const isDark = scheme === "dark";
  const colors = isDark ? darkColors : tokens.color;

  useEffect(() => {
    // Native menus, alerts and controls follow an explicit app preference too.
    if (Platform.OS !== "web")
      Appearance.setColorScheme(
        preference === "system" ? "unspecified" : preference,
      );
  }, [preference]);
  useEffect(() => {
    if (Platform.OS !== "web")
      void SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
  }, [colors.background]);

  const value = useMemo(
    () => ({ colors, isDark, preference, setPreference, persistenceError }),
    [colors, isDark, preference, setPreference, persistenceError],
  );
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

export function useThemedStyles<T extends Record<string, object>>(base: T): T {
  const { isDark } = useTheme();
  return useMemo(() => themedStyleMap(base, isDark), [base, isDark]);
}

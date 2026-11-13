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
import {
  AccessibilityInfo,
  Appearance,
  Platform,
  useColorScheme,
} from "react-native";
import * as SystemUI from "expo-system-ui";
import { tokens } from "./tokens";
import {
  APPEARANCE_STORAGE_KEY,
  darkColors,
  contrastColors,
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
  highContrast: boolean;
};
const ThemeContext = createContext<ThemeContextValue>({
  colors: tokens.color,
  isDark: false,
  preference: "light",
  setPreference: () => {},
  persistenceError: false,
  highContrast: false,
});

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [preference, setChoice] = useState<AppearancePreference>("light");
  const [persistenceError, setPersistenceError] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  useEffect(() => {
    if (Platform.OS !== "ios" && Platform.OS !== "android") return;
    let mounted = true;
    let receivedEvent = false;
    const read =
      Platform.OS === "ios"
        ? AccessibilityInfo.isDarkerSystemColorsEnabled()
        : AccessibilityInfo.isHighTextContrastEnabled();
    void read
      .then((enabled) => {
        if (mounted && !receivedEvent) setHighContrast(enabled);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener(
      Platform.OS === "ios"
        ? "darkerSystemColorsChanged"
        : "highTextContrastChanged",
      (enabled) => {
        receivedEvent = true;
        if (mounted) setHighContrast(enabled);
      },
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
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
  const baseColors = isDark ? darkColors : tokens.color;
  const colors = useMemo(
    () => (highContrast ? contrastColors(baseColors, isDark) : baseColors),
    [baseColors, isDark, highContrast],
  );

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
    () => ({
      colors,
      isDark,
      preference,
      setPreference,
      persistenceError,
      highContrast,
    }),
    [colors, isDark, preference, setPreference, persistenceError, highContrast],
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

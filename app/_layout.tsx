import "react-native-gesture-handler";
import { router, Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { BackHandler, Platform, View } from "react-native";
import { FloatingTabBar } from "@/components/storefront/FloatingTabBar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/auth/AuthProvider";
import { QueryProvider } from "@/providers/QueryProvider";
import { AppErrorBoundary, ToastProvider } from "@/components/ui/Commerce";
import { OfflineNotice } from "@/components/ui/OfflineNotice";
import { CelebrationReminderPrivacy } from "@/native/celebration-reminders";
import { NotificationObserver } from "@/native/NotificationObserver";
import {
  recordPerformanceMetric,
  trackCommerceEvent,
} from "@/observability/commerce-events";
import { observeNativeConnectivity } from "@/platform/connectivity-observer";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";
import { GlassPreferencesProvider } from "@/components/storefront/GlassSurface";

const appShellModuleLoadedAt = Date.now();

/**
 * Some tab switches intentionally have no stack entry. On Android, send the
 * customer back through the app before letting the system close it; a second
 * Back press on Home keeps the normal Android behaviour.
 */
function AndroidBackNavigator() {
  const pathname = usePathname();

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (router.canGoBack()) {
        router.back();
        return true;
      }
      const onHome = ["/", "/index", "/(tabs)", "/(tabs)/index"].includes(
        pathname,
      );
      if (!onHome) {
        router.navigate("/(tabs)");
        return true;
      }
      return false;
    });
    return () => listener.remove();
  }, [pathname]);

  return null;
}

function AppShell() {
  const { colors, isDark } = useTheme();
  useEffect(() => {
    trackCommerceEvent("app_open", { platform: Platform.OS });
    // JS-shell timing is a development signal, not a replacement for native
    // cold-start tracing in release profiling.
    recordPerformanceMetric(
      "app_shell_mount_ms",
      Date.now() - appShellModuleLoadedAt,
      { platform: Platform.OS },
    );
  }, []);

  useEffect(() => observeNativeConnectivity(), []);

  return (
    <SafeAreaProvider>
      <GlassPreferencesProvider>
        <AppErrorBoundary>
          <QueryProvider>
            <AuthProvider>
              <ToastProvider>
                <NotificationObserver />
                <CelebrationReminderPrivacy />
                <AndroidBackNavigator />
                <OfflineNotice />
                <StatusBar style={isDark ? "light" : "dark"} />
                <View style={{ flex: 1 }}>
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      contentStyle: { backgroundColor: colors.background },
                    }}
                  >
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen
                      name="branches"
                      options={{ presentation: "card" }}
                    />
                    <Stack.Screen
                      name="cart"
                      options={{ presentation: "card" }}
                    />
                  </Stack>
                  <FloatingTabBar />
                </View>
              </ToastProvider>
            </AuthProvider>
          </QueryProvider>
        </AppErrorBoundary>
      </GlassPreferencesProvider>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}

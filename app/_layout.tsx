import "react-native-gesture-handler";
import "@/native/rider-background";
import { router, Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { BackHandler, Platform, View } from "react-native";
import { FloatingTabBar } from "@/components/storefront/FloatingTabBar";
import { BrandEntrance } from "@/components/ui/BrandEntrance";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/auth/AuthProvider";
import { useAuth } from "@/auth/AuthProvider";
import { isStaffRole } from "@/auth/staff-routing";
import { StaffRouteBoundary } from "@/auth/StaffRouteBoundary";
import { QueryProvider } from "@/providers/QueryProvider";
import { BiometricGate } from "@/auth/BiometricGate";
import { AppErrorBoundary, ToastProvider } from "@/components/ui/Commerce";
import { OfflineNotice } from "@/components/ui/OfflineNotice";
import { CelebrationReminderPrivacy } from "@/native/celebration-reminders";
import { NotificationObserver } from "@/native/NotificationObserver";
import { PushRegistration } from "@/native/PushRegistration";
import { ConciergeIntents } from "@/native/ConciergeIntents";
import {
  recordPerformanceMetric,
  trackCommerceEvent,
} from "@/observability/commerce-events";
import { observeNativeConnectivity } from "@/platform/connectivity-observer";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";
import { GlassPreferencesProvider } from "@/components/storefront/GlassSurface";
import { OrderUpdateBanner } from "@/features/account/OrderUpdates";
import { ConfettiLayerProvider } from "@/components/ui/ConfettiLayer";
import { MilestoneCelebrationObserver } from "@/features/account/MilestoneCelebration";

const appShellModuleLoadedAt = Date.now();

/**
 * Some tab switches intentionally have no stack entry. On Android, send the
 * customer back through the app before letting the system close it; a second
 * Back press on Home keeps the normal Android behaviour.
 */
function AndroidBackNavigator() {
  const { customer } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (router.canGoBack()) {
        router.back();
        return true;
      }
      const onHome = isStaffRole(customer?.role)
        ? pathname === "/workspace"
        : ["/", "/index", "/(tabs)", "/(tabs)/index"].includes(pathname);
      if (!onHome) {
        router.navigate(isStaffRole(customer?.role) ? "/workspace" : "/(tabs)");
        return true;
      }
      return false;
    });
    return () => listener.remove();
  }, [pathname, customer?.role]);

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
              <BiometricGate>
                <ToastProvider>
                  <NotificationObserver />
                  <PushRegistration />
                  <ConciergeIntents />
                  <CelebrationReminderPrivacy />
                  <AndroidBackNavigator />
                  <OfflineNotice />
                  <StatusBar style={isDark ? "light" : "dark"} />
                  <ConfettiLayerProvider>
                    <StaffRouteBoundary>
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
                      <BrandEntrance />
                      <CustomerUpdates />
                    </StaffRouteBoundary>
                  </ConfettiLayerProvider>
                </ToastProvider>
              </BiometricGate>
            </AuthProvider>
          </QueryProvider>
        </AppErrorBoundary>
      </GlassPreferencesProvider>
    </SafeAreaProvider>
  );
}

function CustomerUpdates() {
  const { customer, restoring } = useAuth();
  if (restoring || isStaffRole(customer?.role)) return null;
  return (
    <>
      <MilestoneCelebrationObserver
        key={`milestones:${customer?.id || "guest"}`}
      />
      <OrderUpdateBanner key={`updates:${customer?.id || "guest"}`} />
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}

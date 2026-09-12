import "react-native-gesture-handler";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/auth/AuthProvider";
import { QueryProvider } from "@/providers/QueryProvider";
import { AppErrorBoundary, ToastProvider } from "@/components/ui/Commerce";
import { NotificationObserver } from "@/native/NotificationObserver";
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppErrorBoundary>
        <QueryProvider>
          <AuthProvider>
            <ToastProvider>
              <NotificationObserver />
              <StatusBar style="dark" />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: "#FFFCFA" },
                }}
              >
                <Stack.Screen name="(tabs)" />
                <Stack.Screen
                  name="branches"
                  options={{ presentation: "modal" }}
                />
                <Stack.Screen name="cart" options={{ presentation: "modal" }} />
              </Stack>
            </ToastProvider>
          </AuthProvider>
        </QueryProvider>
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}

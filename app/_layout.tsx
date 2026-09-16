import "react-native-gesture-handler";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/auth/AuthProvider";
import { QueryProvider } from "@/providers/QueryProvider";
import { AppErrorBoundary, ToastProvider } from "@/components/ui/Commerce";
import { NotificationObserver } from "@/native/NotificationObserver";
import { tokens } from "@/theme/tokens";
import { BrandLogo } from "@/components/BrandLogo";
import { ReferenceArtwork } from "@/components/ui/ReferenceArtwork";

function LaunchScreen() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 900);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;
  return (
    <View pointerEvents="auto" style={styles.launchScreen}>
      <LinearGradient
        colors={[tokens.color.brandDark, tokens.color.brandStrong, "#F35593"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.launchGlow} />
      <BrandLogo width={188} />
      <View style={styles.launchCake}>
        <ReferenceArtwork name="chocolateBanner" width={300} />
      </View>
      <Text style={styles.launchLabel}>MADE FOR YOUR MOMENTS</Text>
    </View>
  );
}

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
                  contentStyle: { backgroundColor: tokens.color.background },
                }}
              >
                <Stack.Screen name="(tabs)" />
                <Stack.Screen
                  name="branches"
                  options={{ presentation: "modal" }}
                />
                <Stack.Screen name="cart" options={{ presentation: "modal" }} />
              </Stack>
              <LaunchScreen />
            </ToastProvider>
          </AuthProvider>
        </QueryProvider>
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  launchScreen: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  launchGlow: {
    position: "absolute",
    width: 310,
    height: 310,
    borderRadius: 155,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    top: "22%",
  },
  launchCake: {
    width: 300,
    height: 178,
    marginTop: 34,
    opacity: 0.96,
  },
  launchLabel: {
    marginTop: 30,
    color: "#FFE7F0",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2.2,
  },
});

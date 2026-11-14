import { useEffect, useState } from "react";
import { useScreenActive } from "@/design/useScreenActive";
import { clubWelcomeCopy } from "./club-welcome-copy";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Text } from "@/components/ui/Typography";
import { tokens } from "@/theme/tokens";

export function ClubWelcome({ name }: { name?: string }) {
  const active = useScreenActive();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, [active]);
  const copy = clubWelcomeCopy(now);
  return (
    <View style={styles.shadow}>
      <LinearGradient
        colors={["#261A34", "#6E255B", "#8F315F"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View pointerEvents="none" style={styles.orbit} />
        <View style={styles.top}>
          <Text style={styles.eyebrow}>
            {name?.trim()
              ? `A LITTLE JOY, ${name.trim().toUpperCase()}`
              : "YOUR CAKE CITY CLUB"}
          </Text>
          <View style={styles.mark}>
            <Ionicons name="sparkles-outline" color="#FFE1A8" size={20} />
          </View>
        </View>
        <Text style={styles.greeting}>{copy.title}</Text>
        <Text style={styles.copy}>{copy.message}</Text>
        <View style={styles.footer}>
          <View style={styles.dot} />
          <Text style={styles.footerText}>{copy.label}</Text>
        </View>
      </LinearGradient>
    </View>
  );
}
const styles = StyleSheet.create({
  shadow: {
    marginTop: 0,
    marginBottom: 8,
    borderRadius: 30,
    ...tokens.shadow.floating,
  },
  card: { overflow: "hidden", borderRadius: 30, padding: 22, gap: 12 },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  eyebrow: {
    flex: 1,
    color: "#F6C9DC",
    fontSize: 9,
    lineHeight: 16,
    letterSpacing: 1.6,
    fontWeight: "700",
  },
  mark: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  greeting: {
    fontSize: 26,
    lineHeight: 33,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -0.8,
  },
  copy: { fontSize: 13, lineHeight: 21, color: "#F7DFE8", maxWidth: 230 },
  footer: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 4 },
  footerText: { color: "#FFE1A8", fontSize: 11, fontWeight: "600" },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#FFE1A8" },
  orbit: {
    position: "absolute",
    width: 230,
    height: 230,
    borderRadius: 115,
    borderWidth: 32,
    borderColor: "rgba(255,255,255,0.035)",
    right: -100,
    top: 50,
  },
});

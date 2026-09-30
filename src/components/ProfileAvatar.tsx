import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { usePreferences } from "@/features/commerce/store";
import { tokens } from "@/theme/tokens";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";

const presetAvatars = {
  sparkles: { icon: "sparkles", color: "#B80068", tint: "#FFF0F8" },
  heart: { icon: "heart", color: "#BE375E", tint: "#FFF0F3" },
  balloon: { icon: "balloon", color: "#2475A8", tint: "#EEF7FF" },
  happy: { icon: "happy", color: "#7652A8", tint: "#F4F0FF" },
} as const;

export function useProfileAvatar() {
  const { customer } = useAuth();
  const avatar = usePreferences((state) =>
    customer ? state.profileAvatars?.[customer.id] : undefined,
  );
  const preset =
    avatar?.kind === "preset"
      ? presetAvatars[avatar.value as keyof typeof presetAvatars]
      : undefined;
  return { avatar, customer, preset };
}

export function ProfileAvatar({ size = 42 }: { size?: number }) {
  const styles = useThemedStyles(baseStyles);
  const { colors } = useTheme();
  const { avatar, customer, preset } = useProfileAvatar();
  const radius = Math.round(size * 0.36);

  return (
    <View
      accessible={false}
      style={[
        styles.shell,
        { width: size, height: size, borderRadius: radius },
      ]}
    >
      {avatar?.kind === "photo" ? (
        <Image
          cachePolicy="memory-disk"
          contentFit="cover"
          source={{ uri: avatar.value }}
          style={[styles.photo, { borderRadius: radius - 2 }]}
        />
      ) : preset ? (
        <View
          style={[
            styles.preset,
            { backgroundColor: preset.tint, borderRadius: radius - 2 },
          ]}
        >
          <Ionicons
            name={preset.icon}
            size={Math.max(15, Math.round(size * 0.46))}
            color={preset.color}
          />
        </View>
      ) : customer ? (
        <Text style={[styles.initial, { fontSize: Math.max(14, size * 0.4) }]}>
          {customer.first_name.slice(0, 1).toUpperCase()}
        </Text>
      ) : (
        <Ionicons
          name="person-outline"
          size={Math.max(18, Math.round(size * 0.5))}
          color={colors.brandStrong}
        />
      )}
    </View>
  );
}

export function ProfileAvatarButton({ size = 42 }: { size?: number }) {
  const styles = useThemedStyles(baseStyles);
  const { customer } = useProfileAvatar();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={customer ? "Open your account" : "Sign in"}
      hitSlop={5}
      onPress={() => router.push("/(tabs)/account")}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <ProfileAvatar size={size} />
    </Pressable>
  );
}

const baseStyles = StyleSheet.create({
  button: { borderRadius: 18 },
  shell: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
    backgroundColor: "rgba(255,255,255,0.82)",
    shadowColor: "#A6B4C2",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 3,
  },
  photo: { width: "100%", height: "100%" },
  preset: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  initial: { color: tokens.color.brandStrong, fontWeight: "900" },
  pressed: { opacity: 0.78, transform: [{ scale: 0.96 }] },
});

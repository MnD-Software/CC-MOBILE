import { Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GlassSurface } from "@/components/storefront/GlassSurface";
import { useTheme } from "@/theme/ThemeProvider";
import { performHaptic } from "@/design/haptics";

/** Round liquid-glass button that floats over the DIY stage. */
export function StageControl({
  icon,
  label,
  active = false,
  role = "switch",
  onPress,
  onPressIn,
  onPressOut,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  role?: "switch" | "button";
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={role === "switch" ? { checked: active } : undefined}
      onPress={
        onPress
          ? () => {
              void performHaptic(
                role === "button" ? "press" : active ? "toggleOff" : "toggleOn",
              );
              onPress();
            }
          : undefined
      }
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      hitSlop={4}
      style={{
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <GlassSurface
        interactive
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: active ? 1.5 : 1,
          borderColor: active ? colors.brandStrong : "rgba(255,255,255,0.75)",
          overflow: "hidden",
        }}
      >
        <Ionicons
          name={icon}
          size={18}
          color={active ? colors.brandStrong : colors.ink}
        />
      </GlassSurface>
    </Pressable>
  );
}

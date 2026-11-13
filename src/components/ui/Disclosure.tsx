import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { BottomSheet } from "./BottomSheet";
import { Text } from "@/components/ui/Typography";
import { useTheme } from "@/theme/ThemeProvider";

/** Secondary tools open in a focused sheet rather than expanding a long page. */
export function Disclosure({
  title,
  children,
  defaultOpen = false,
  closeOnChange,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  closeOnChange?: unknown;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { colors } = useTheme();
  const previous = useRef(closeOnChange);
  useEffect(() => {
    if (previous.current !== closeOnChange) setOpen(false);
    previous.current = closeOnChange;
  }, [closeOnChange]);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          minHeight: 64,
          padding: 16,
          borderRadius: 20,
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          backgroundColor: pressed ? colors.brandLight : colors.surfaceRaised,
        })}
      >
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 12,
            backgroundColor: colors.brandLight,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons
            name={/filter/i.test(title) ? "options-outline" : "grid-outline"}
            size={18}
            color={colors.brandStrong}
          />
        </View>
        <Text
          style={{
            color: colors.ink,
            fontWeight: "700",
            fontSize: 14,
            flex: 1,
          }}
        >
          {title}
        </Text>
        <Ionicons name="arrow-forward" size={18} color={colors.brandStrong} />
      </Pressable>
      <BottomSheet visible={open} title={title} onClose={() => setOpen(false)}>
        {children}
      </BottomSheet>
    </>
  );
}

import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  const insets = useSafeAreaInsets();
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
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(28,13,24,0.45)",
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close panel"
            onPress={() => setOpen(false)}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          />
          <View
            accessibilityViewIsModal
            style={{
              maxHeight: "88%",
              borderTopLeftRadius: 30,
              borderTopRightRadius: 30,
              backgroundColor: colors.background,
              paddingBottom: Math.max(20, insets.bottom),
              paddingTop: 12,
              width: "100%",
              maxWidth: 720,
              alignSelf: "center",
            }}
          >
            <View
              style={{
                width: 42,
                height: 4,
                borderRadius: 3,
                backgroundColor: colors.borderStrong,
                alignSelf: "center",
                marginBottom: 14,
              }}
            />
            <View
              style={{
                paddingHorizontal: 22,
                paddingBottom: 18,
                flexDirection: "row",
                alignItems: "center",
                gap: 16,
              }}
            >
              <Text
                accessibilityRole="header"
                style={{
                  flex: 1,
                  color: colors.ink,
                  fontWeight: "800",
                  fontSize: 22,
                }}
              >
                {title}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close panel"
                onPress={() => setOpen(false)}
                style={{
                  padding: 12,
                  borderRadius: 16,
                  backgroundColor: colors.surfaceRaised,
                }}
              >
                <Ionicons name="close" color={colors.ink} size={20} />
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingHorizontal: 22,
                gap: 16,
                paddingBottom: 20,
              }}
            >
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

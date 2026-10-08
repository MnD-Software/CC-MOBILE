import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "./Typography";

export function BottomSheet({
  visible,
  title,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "rgba(20,10,17,0.48)",
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Close ${title}`}
          onPress={onClose}
          style={{ flex: 1 }}
        />
        <View
          accessibilityViewIsModal
          style={{
            maxHeight: "88%",
            width: "100%",
            maxWidth: 700,
            alignSelf: "center",
            borderTopLeftRadius: 30,
            borderTopRightRadius: 30,
            backgroundColor: colors.surface,
            paddingTop: 8,
            paddingBottom: Math.max(16, insets.bottom),
            overflow: "hidden",
          }}
        >
          <View
            style={{
              alignSelf: "center",
              width: 38,
              height: 4,
              borderRadius: 4,
              backgroundColor: colors.border,
              marginBottom: 8,
            }}
          />
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 22,
              paddingBottom: 10,
              gap: 12,
            }}
          >
            <Text
              accessibilityRole="header"
              style={{
                flex: 1,
                fontSize: 21,
                fontWeight: "800",
                color: colors.ink,
              }}
            >
              {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Dismiss ${title}`}
              onPress={onClose}
              style={{
                minHeight: 44,
                minWidth: 44,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 22,
                backgroundColor: colors.background,
              }}
            >
              <Ionicons name="close" size={24} color={colors.ink} />
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 22,
              paddingBottom: 20,
              gap: 14,
            }}
          >
            {children}
          </ScrollView>
          {footer ? (
            <View
              style={{
                paddingTop: 14,
                paddingHorizontal: 22,
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              {footer}
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

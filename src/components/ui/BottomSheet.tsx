import { Ionicons } from "@expo/vector-icons";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  KeyboardAvoidingView,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "./Typography";
import { useReducedMotion } from "@/design/useReducedMotion";

const SheetDepth = createContext(0);

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
  const reduceMotion = useReducedMotion();
  const depth = useContext(SheetDepth);
  const content = useRef({ children, title, footer });
  if (visible) content.current = { children, title, footer };
  const [present, setPresent] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) setPresent(true);
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: reduceMotion ? 0 : visible ? 260 : 190,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
      isInteraction: false,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) setPresent(false);
    });
    return () => animation.stop();
  }, [visible, reduceMotion, progress]);
  return (
    <SheetDepth.Provider value={depth + 1}>
      <Modal
        visible={present}
        transparent
        animationType="none"
        onRequestClose={onClose}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "transparent",
          }}
        >
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: depth ? "transparent" : colors.scrim,
              opacity: progress,
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Close ${title}`}
            onPress={onClose}
            style={{ flex: 1 }}
          />
          <Animated.View
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
              opacity: progress,
              transform: [
                {
                  translateY: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [reduceMotion ? 0 : 28, 0],
                  }),
                },
              ],
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
                {content.current.title}
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
              {content.current.children}
            </ScrollView>
            {content.current.footer ? (
              <View
                style={{
                  paddingTop: 14,
                  paddingHorizontal: 22,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                }}
              >
                {content.current.footer}
              </View>
            ) : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </SheetDepth.Provider>
  );
}

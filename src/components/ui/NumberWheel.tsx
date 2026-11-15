import { useEffect, useRef, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./Typography";
import { useTheme } from "@/theme/ThemeProvider";

const ROW = 48;
export function NumberWheel({
  minimum,
  maximum,
  value,
  onChange,
  label,
  disabled = false,
}: {
  minimum: number;
  maximum: number;
  value: number;
  onChange: (value: number) => void;
  label: string;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const list = useRef<FlatList<number>>(null);
  const values = Array.from(
    { length: Math.max(0, maximum - minimum + 1) },
    (_, i) => minimum + i,
  );
  const current = Math.min(maximum, Math.max(minimum, value));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready)
      list.current?.scrollToOffset({
        offset: (current - minimum) * ROW,
        animated: false,
      });
  }, [minimum, maximum, ready]);
  function choose(next: number) {
    const safe = Math.max(minimum, Math.min(maximum, next));
    onChange(safe);
    list.current?.scrollToOffset({
      offset: (safe - minimum) * ROW,
      animated: true,
    });
  }
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
      }}
    >
      {([-1] as const).map((direction) => (
        <Pressable
          key={direction}
          accessibilityRole="button"
          accessibilityLabel={`${direction < 0 ? "Decrease" : "Increase"} ${label}`}
          disabled={
            disabled ||
            (direction < 0 ? current <= minimum : current >= maximum)
          }
          onPress={() => choose(current + direction)}
          style={{
            minWidth: 44,
            minHeight: 44,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 22,
            backgroundColor: colors.surfaceRaised,
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <Ionicons
            name={direction < 0 ? "remove" : "add"}
            size={22}
            color={colors.brandStrong}
          />
        </Pressable>
      ))}
      <View
        style={{
          width: 140,
          height: ROW * 3,
          overflow: "hidden",
          borderRadius: 24,
          backgroundColor: colors.surfaceRaised,
        }}
      >
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: ROW,
            height: ROW,
            left: 6,
            right: 6,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.brandLight,
          }}
        />
        <FlatList
          ref={list}
          data={values}
          keyExtractor={(n) => String(n)}
          scrollEnabled={!disabled}
          showsVerticalScrollIndicator={false}
          snapToInterval={ROW}
          decelerationRate="fast"
          contentContainerStyle={{ paddingVertical: ROW }}
          initialNumToRender={7}
          maxToRenderPerBatch={7}
          windowSize={3}
          getItemLayout={(_, index) => ({
            length: ROW,
            offset: ROW * index,
            index,
          })}
          onLayout={() => {
            setReady(true);
            list.current?.scrollToOffset({
              offset: (current - minimum) * ROW,
              animated: false,
            });
          }}
          onMomentumScrollEnd={(e) => {
            const index = Math.max(
              0,
              Math.min(
                values.length - 1,
                Math.round(e.nativeEvent.contentOffset.y / ROW),
              ),
            );
            if (!disabled && values[index] !== undefined)
              onChange(values[index]);
          }}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: current === item, disabled }}
              accessibilityLabel={`${item} ${label}`}
              disabled={disabled}
              onPress={() => choose(item)}
              style={{
                height: ROW,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: current === item ? colors.ink : colors.muted,
                  fontSize: current === item ? 30 : 20,
                  fontWeight: current === item ? "800" : "500",
                }}
              >
                {item}
              </Text>
            </Pressable>
          )}
        />
      </View>
      {([1] as const).map((direction) => (
        <Pressable
          key={direction}
          accessibilityRole="button"
          accessibilityLabel={`${direction < 0 ? "Decrease" : "Increase"} ${label}`}
          disabled={
            disabled ||
            (direction < 0 ? current <= minimum : current >= maximum)
          }
          onPress={() => choose(current + direction)}
          style={{
            minWidth: 44,
            minHeight: 44,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 22,
            backgroundColor: colors.surfaceRaised,
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <Ionicons
            name={direction < 0 ? "remove" : "add"}
            size={22}
            color={colors.brandStrong}
          />
        </Pressable>
      ))}
    </View>
  );
}

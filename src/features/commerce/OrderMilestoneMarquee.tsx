import { useEffect, useRef, useState } from "react";
import { Animated, Platform, View } from "react-native";
import { Text } from "@/components/ui/Typography";
import { useMotionAccessibilityPreference } from "@/design";

export function OrderMilestoneMarquee({
  labels,
  stage,
  active,
}: {
  labels: string[];
  stage: number;
  active: boolean;
}) {
  const { isResolved, reduceMotion } = useMotionAccessibilityPreference();
  const offset = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);
  useEffect(() => {
    offset.setValue(0);
    if (!isResolved || reduceMotion || !active || !width) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(1600),
        Animated.timing(offset, {
          toValue: -width,
          duration: width * 45,
          useNativeDriver: Platform.OS !== "web",
          isInteraction: false,
        }),
        Animated.timing(offset, {
          toValue: 0,
          duration: 0,
          useNativeDriver: Platform.OS !== "web",
          isInteraction: false,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [active, isResolved, reduceMotion, width, stage, offset]);
  const run = (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ flexDirection: "row", gap: 16, paddingRight: 16 }}
    >
      {labels.map((label, index) => {
        const complete = index < stage || stage === labels.length - 1;
        return (
          <View
            key={label}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            <View
              style={{
                width: 5,
                height: 5,
                borderRadius: 3,
                backgroundColor: complete
                  ? "#86EFAC"
                  : index === stage
                    ? "#FFFFFF"
                    : "#AD7292",
              }}
            />
            <Text
              style={{
                color: complete
                  ? "#86EFAC"
                  : index === stage
                    ? "#FFFFFF"
                    : "#F5CBE2",
                fontWeight: complete || index === stage ? "800" : "500",
                fontSize: 11,
              }}
            >
              {complete ? `\u2713 ${label}` : label}
            </Text>
          </View>
        );
      })}
    </View>
  );
  return (
    <View
      accessibilityLabel={`Order milestones. Current stage: ${labels[stage]}`}
      style={{
        overflow: "hidden",
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: "rgba(255,255,255,0.15)",
      }}
    >
      {reduceMotion || !isResolved ? (
        <Text
          style={{
            color: stage === labels.length - 1 ? "#86EFAC" : "#FFFFFF",
            fontWeight: "700",
            fontSize: 12,
          }}
        >
          {labels[stage]}
        </Text>
      ) : (
        <Animated.View
          accessible={false}
          style={{
            flexDirection: "row",
            alignSelf: "flex-start",
            transform: [{ translateX: offset }],
          }}
        >
          {run}
          {run}
        </Animated.View>
      )}
    </View>
  );
}

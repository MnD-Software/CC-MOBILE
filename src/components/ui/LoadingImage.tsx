import { Image, type ImageProps } from "expo-image";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Skeleton } from "./Skeleton";
import { Text } from "./Typography";
import { useTheme } from "@/theme/ThemeProvider";

/** Keying the request prevents late events from a recycled photo hiding its successor's skeleton. */
export function LoadingImage(props: ImageProps) {
  return (
    <ImageRequest
      key={JSON.stringify([props.source, props.recyclingKey])}
      {...props}
    />
  );
}
function ImageRequest({ style, onDisplay, onError, ...props }: ImageProps) {
  const { colors } = useTheme();
  const container = useRef<ComponentRef<typeof View>>(null);
  const [visible, setVisible] = useState(Platform.OS !== "web");
  const [displayed, setDisplayed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (typeof IntersectionObserver === "undefined" || !container.current) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(container.current as unknown as Element);
    return () => observer.disconnect();
  }, []);
  if (!props.source) {
    return (
      <View
        style={[
          style,
          {
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.surfaceRaised,
          },
        ]}
        accessibilityLabel="Photo coming soon"
      >
        <Ionicons name="image-outline" size={20} color={colors.muted} />
      </View>
    );
  }
  return (
    <View ref={container} style={[style, { overflow: "hidden" }]}>
      {!displayed && !failed ? (
        <View
          testID="photo-loading"
          accessibilityRole="progressbar"
          accessibilityLabel="Loading photo"
          accessibilityState={{ busy: true }}
          style={StyleSheet.absoluteFill}
        >
          <Skeleton
            radius={0}
            style={[StyleSheet.absoluteFill, { height: "100%" }]}
          />
        </View>
      ) : null}
      {visible && !failed ? (
        <Image
          {...props}
          key={attempt}
          style={StyleSheet.absoluteFill}
          cachePolicy={props.cachePolicy ?? "memory-disk"}
          transition={props.transition ?? 180}
          onDisplay={() => {
            setDisplayed(true);
            onDisplay?.();
          }}
          onError={(event) => {
            setFailed(true);
            onError?.(event);
          }}
        />
      ) : null}
      {failed ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry loading photo"
          onPress={() => {
            setFailed(false);
            setDisplayed(false);
            setAttempt((value) => value + 1);
          }}
          style={[
            StyleSheet.absoluteFill,
            {
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              backgroundColor: colors.surfaceRaised,
            },
          ]}
        >
          <Ionicons name="refresh-outline" size={20} color={colors.muted} />
          <Text style={{ color: colors.muted, fontSize: 10 }}>
            Tap to load photo
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

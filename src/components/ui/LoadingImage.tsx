import { Image, type ImageProps, type ImageSource } from "expo-image";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { AppState, Platform, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Skeleton } from "./Skeleton";
import {
  subscribeToConnectivity,
  connectivityState,
} from "@/platform/connectivity";
import { useTheme } from "@/theme/ThemeProvider";
import { appMedia } from "@/features/commerce/app-media";

function currentSource(source: ImageProps["source"]): ImageProps["source"] {
  if (typeof source === "string") return appMedia(source);
  if (Array.isArray(source)) {
    if (typeof source[0] === "string")
      return (source as string[]).map(appMedia);
    return (source as ImageSource[]).map((image) => ({
      ...image,
      uri: image.uri ? appMedia(image.uri) : image.uri,
    }));
  }
  if (
    source &&
    typeof source === "object" &&
    "uri" in source &&
    typeof source.uri === "string"
  )
    return { ...source, uri: appMedia(source.uri) };
  return source;
}

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
  const retryDelays = [800, 2000, 5000];
  const exhausted = failed && attempt >= retryDelays.length;
  useEffect(() => {
    if (!visible || !failed || attempt >= retryDelays.length) return;
    const timer = setTimeout(() => {
      setFailed(false);
      setAttempt((value) => value + 1);
    }, retryDelays[attempt]);
    return () => clearTimeout(timer);
  }, [visible, failed, attempt]);
  useEffect(() => {
    const recover = () => {
      if (!failed) return;
      setAttempt(0);
      setFailed(false);
      setDisplayed(false);
    };
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") recover();
    });
    const unsubscribe = subscribeToConnectivity(() => {
      if (connectivityState() === "online") recover();
    });
    return () => {
      listener.remove();
      unsubscribe();
    };
  }, [failed]);
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
      {!displayed && !exhausted ? (
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
          source={currentSource(props.source)}
          key={attempt}
          style={StyleSheet.absoluteFill}
          cachePolicy={attempt ? "none" : (props.cachePolicy ?? "memory-disk")}
          transition={props.transition ?? 180}
          onDisplay={() => {
            setDisplayed(true);
            onDisplay?.();
          }}
          onError={(event) => {
            setDisplayed(false);
            setFailed(true);
            onError?.(event);
          }}
        />
      ) : null}
      {exhausted ? (
        <View
          accessibilityLabel="Photo temporarily unavailable"
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
          <Ionicons name="image-outline" size={20} color={colors.muted} />
        </View>
      ) : null}
    </View>
  );
}

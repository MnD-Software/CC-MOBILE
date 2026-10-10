import { useEffect } from "react";
import { AppState, View } from "react-native";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { useScreenActive as useIsFocused } from "@/design/useScreenActive";
import { Notice } from "@/components/ui/Commerce";
import { mediaSource } from "./content";

/** Mounted on explicit customer request only; no feed autoplay or background audio. */
export function VideoClip({ url }: { url: string }) {
  const focused = useIsFocused();
  const player = useVideoPlayer(mediaSource(url), (instance) => {
    instance.loop = false;
  });
  const { status } = useEvent(player, "statusChange", {
    status: player.status,
  });
  useEffect(() => {
    if (!focused) player.pause();
    const listener = AppState.addEventListener("change", (state) => {
      if (state !== "active") player.pause();
    });
    return () => {
      listener.remove();
      // useVideoPlayer owns release; do not call a released shared object
      // during React's unmount cleanup on Android.
    };
  }, [focused, player]);
  return (
    <View style={{ gap: 8 }}>
      <VideoView
        player={player}
        nativeControls
        surfaceType="textureView"
        contentFit="contain"
        fullscreenOptions={{ enable: true }}
        style={{
          width: "100%",
          aspectRatio: 1,
          borderRadius: 20,
          backgroundColor: "#161014",
        }}
      />
      {status === "error" ? (
        <Notice message="This clip couldn't load. You can still browse the cake photos below." />
      ) : null}
    </View>
  );
}

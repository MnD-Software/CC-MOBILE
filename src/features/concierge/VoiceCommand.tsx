import { useEffect, useRef, useState } from "react";
import { AppState, Platform, View } from "react-native";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { File } from "expo-file-system";
import { z } from "zod";
import { api } from "@/api/client";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Typography";
import { useTheme } from "@/theme/ThemeProvider";

export default function VoiceCommand({
  onText,
  disabled,
}: {
  onText: (text: string) => void;
  disabled: boolean;
}) {
  const { colors } = useTheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 250);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(true);
  const flight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const recordingEpoch = useRef(0);
  const recording = useRef(false);
  recording.current = state.isRecording;
  useEffect(() => {
    active.current = true;
    const cancel = () => {
      recordingEpoch.current += 1;
      void recorder.stop().catch(() => undefined);
      void setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    };
    const listener = AppState.addEventListener("change", (value) => {
      if (value === "background" || (value === "inactive" && recording.current))
        cancel();
    });
    return () => {
      active.current = false;
      controller.current?.abort();
      listener.remove();
      cancel();
    };
  }, [recorder]);
  useEffect(() => {
    if (state.isRecording && state.durationMillis >= 30_000) void finish();
  }, [state.durationMillis, state.isRecording]);
  async function finish() {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setError("");
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      const uri = recorder.uri;
      if (!uri)
        throw new Error("Your recording could not be read. Please try again.");
      let audio: string;
      let mime = "audio/mp4";
      if (Platform.OS === "web") {
        const blob = await (await fetch(uri)).blob();
        if (blob.size > 2_000_000)
          throw new Error("Keep your voice note under 30 seconds.");
        mime = blob.type.startsWith("audio/webm")
          ? "audio/webm"
          : blob.type.startsWith("audio/wav")
            ? "audio/wav"
            : "audio/mp4";
        audio = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } else {
        const file = new File(uri);
        if (file.size > 2_000_000)
          throw new Error("Keep your voice note under 30 seconds.");
        audio = await file.base64();
      }
      if (!active.current) return;
      controller.current = new AbortController();
      const result = z.object({ text: z.string() }).parse(
        await api.post(
          "/v1/concierge/transcribe",
          { audio, mime },
          {
            auth: true,
            timeoutMs: 40_000,
            signal: controller.current.signal,
          },
        ),
      );
      if (active.current) onText(result.text);
    } catch (reason) {
      if (active.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "Couldn't read your voice note. Try typing instead.",
        );
    } finally {
      flight.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function start() {
    if (flight.current || disabled) return;
    flight.current = true;
    setBusy(true);
    setError("");
    const epoch = ++recordingEpoch.current;
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted)
        throw new Error(
          "Allow microphone access in Settings, or type your request.",
        );
      if (!active.current) return;
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      if (!active.current || epoch !== recordingEpoch.current) {
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false });
        return;
      }
      recorder.record();
    } catch (reason) {
      if (active.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "Couldn't start recording.",
        );
    } finally {
      flight.current = false;
      if (active.current) setBusy(false);
    }
  }
  return (
    <View style={{ gap: 8 }}>
      <Button
        variant={state.isRecording ? "primary" : "outline"}
        loading={busy}
        disabled={busy || (disabled && !state.isRecording)}
        label={
          state.isRecording
            ? `Stop recording · ${Math.floor(state.durationMillis / 1000)}s`
            : "Use my voice"
        }
        onPress={() => void (state.isRecording ? finish() : start())}
      />
      <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17 }}>
        {error ||
          "Tap to record, then review your words before sending. Voice notes are sent to our AI provider for transcription."}
      </Text>
    </View>
  );
}

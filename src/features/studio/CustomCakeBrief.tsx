import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Chip, ui as baseUi, useToast } from "@/components/ui/Commerce";
import { Input } from "@/components/ui/Input";
import { tokens } from "@/theme/tokens";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";

type Inspiration = Pick<
  ImagePicker.ImagePickerAsset,
  "fileName" | "mimeType" | "uri"
>;

const occasions = ["Birthday", "Wedding", "Anniversary", "Just because"];
const CAKE_CITY_WHATSAPP = "254709729000";

function assetFromResult(
  result:
    | ImagePicker.ImagePickerResult
    | ImagePicker.ImagePickerErrorResult
    | null,
) {
  if (!result || !("canceled" in result) || result.canceled) return null;
  const asset = result.assets?.[0];
  return asset
    ? {
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        uri: asset.uri,
      }
    : null;
}

export function CustomCakeBrief() {
  const ui = useThemedStyles(baseUi);
  const styles = useThemedStyles(baseStyles);
  const { colors } = useTheme();
  const toast = useToast();
  const [occasion, setOccasion] = useState(occasions[0]);
  const [date, setDate] = useState("");
  const [budget, setBudget] = useState("");
  const [notes, setNotes] = useState("");
  const [inspiration, setInspiration] = useState<Inspiration | null>(null);

  useEffect(() => {
    let current = true;
    void ImagePicker.getPendingResultAsync()
      .then((result) => {
        const asset = assetFromResult(result);
        if (current && asset) setInspiration(asset);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);

  async function chooseInspiration() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast("Allow photo access to add a cake inspiration image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.78,
    });
    const asset = assetFromResult(result);
    if (asset) {
      setInspiration(asset);
      toast("Inspiration photo ready to share.");
    }
  }

  async function shareInspiration() {
    if (!inspiration) {
      await chooseInspiration();
      return;
    }
    if (!(await Sharing.isAvailableAsync())) {
      toast("Sharing is not available on this device.");
      return;
    }
    await Sharing.shareAsync(inspiration.uri, {
      dialogTitle: "Share your Cake City inspiration",
      mimeType: inspiration.mimeType ?? "image/jpeg",
    });
  }

  async function messageCakeCity() {
    const summary = [
      "Hello Cake City, I would like a custom cake quote.",
      `Occasion: ${occasion}`,
      date.trim() ? `Preferred date: ${date.trim()}` : null,
      budget.trim() ? `Budget: KSh ${budget.trim()}` : null,
      notes.trim() ? `Design notes: ${notes.trim()}` : null,
      inspiration
        ? "I have an inspiration image and will attach it in this chat."
        : "I would love help choosing a design.",
    ]
      .filter(Boolean)
      .join("\n");
    const url = `https://wa.me/${CAKE_CITY_WHATSAPP}?text=${encodeURIComponent(summary)}`;
    if (!(await Linking.canOpenURL(url))) {
      toast("WhatsApp is unavailable on this device.");
      return;
    }
    await Linking.openURL(url);
  }

  return (
    <View style={styles.wrapper}>
      <View style={[ui.panel, styles.intro]}>
        <View style={styles.introIcon}>
          <Ionicons
            color={colors.brandStrong}
            name="color-palette-outline"
            size={22}
          />
        </View>
        <View style={styles.introCopy}>
          <Text style={ui.eyebrow}>CUSTOM CAKE BRIEF</Text>
          <Text style={ui.heading}>Bring your idea to life.</Text>
          <Text style={ui.body}>
            Add an inspiration photo, then share your brief with Cake City for a
            confirmed quote. We do not invent a custom-cake total before the
            team approves the design.
          </Text>
        </View>
      </View>

      <View style={styles.occasionSection}>
        <Text style={styles.fieldLabel}>What are we celebrating?</Text>
        <View style={styles.chips}>
          {occasions.map((item) => (
            <Chip
              key={item}
              label={item}
              onPress={() => setOccasion(item)}
              selected={occasion === item}
            />
          ))}
        </View>
      </View>

      <Input
        hint="For example: 18 October 2026"
        label="Preferred date"
        onChangeText={setDate}
        placeholder="When do you need it?"
        value={date}
      />
      <Input
        keyboardType="numeric"
        label="Budget (optional)"
        onChangeText={setBudget}
        placeholder="Your budget in KSh"
        value={budget}
      />
      <Input
        label="Your design notes"
        multiline
        onChangeText={setNotes}
        placeholder="Theme, colours, flavour, serving size and message…"
        value={notes}
      />

      <View style={styles.inspirationCard}>
        <View style={styles.inspirationHeader}>
          <View style={styles.inspirationIcon}>
            <Ionicons
              color={colors.accentStrong}
              name="images-outline"
              size={20}
            />
          </View>
          <View style={styles.inspirationCopy}>
            <Text style={styles.inspirationTitle}>Your inspiration</Text>
            <Text style={styles.inspirationText}>
              Pick a photo, preview it here, then share it directly from your
              device.
            </Text>
          </View>
        </View>
        {inspiration ? (
          <View style={styles.previewFrame}>
            <Image
              cachePolicy="memory-disk"
              contentFit="cover"
              source={{ uri: inspiration.uri }}
              style={styles.preview}
            />
            <Pressable
              accessibilityLabel="Remove selected inspiration photo"
              accessibilityRole="button"
              onPress={() => setInspiration(null)}
              style={styles.removePhoto}
            >
              <Ionicons color="#FFFFFF" name="close" size={16} />
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityLabel="Choose a cake inspiration photo"
            accessibilityRole="button"
            onPress={() => void chooseInspiration()}
            style={({ pressed }) => [
              styles.pickArea,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              color={colors.accentStrong}
              name="add-circle-outline"
              size={26}
            />
            <Text style={styles.pickText}>Choose inspiration photo</Text>
          </Pressable>
        )}
        <Text style={styles.privacyNote}>
          Your selected photo stays on this device until you choose an app in
          the share sheet.
        </Text>
        <View style={styles.actions}>
          <Button
            label={inspiration ? "Choose another photo" : "Add inspiration"}
            onPress={() => void chooseInspiration()}
            size="sm"
            variant="outline"
          />
          <Button
            disabled={!inspiration}
            label="Share photo"
            onPress={() => void shareInspiration()}
            size="sm"
          />
        </View>
      </View>

      <Button
        label="Message Cake City for a quote"
        onPress={() => void messageCakeCity()}
      />
      <Text style={styles.handoffNote}>
        After sharing your photo, open the Cake City WhatsApp message and send
        your brief. The team will confirm availability and the final price.
      </Text>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  wrapper: { gap: 16 },
  intro: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  introIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: tokens.color.brandLight,
  },
  introCopy: { flex: 1, gap: 4 },
  occasionSection: { gap: 8 },
  fieldLabel: { color: tokens.color.ink, fontSize: 13, fontWeight: "800" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  inspirationCard: {
    gap: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: 22,
    backgroundColor: tokens.color.surface,
  },
  inspirationHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  inspirationIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: tokens.color.accentLight,
  },
  inspirationCopy: { flex: 1, gap: 2 },
  inspirationTitle: {
    color: tokens.color.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  inspirationText: { color: tokens.color.muted, fontSize: 12, lineHeight: 17 },
  pickArea: {
    minHeight: 116,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(0,110,149,0.34)",
    borderRadius: 17,
    backgroundColor: "#F8FDFF",
  },
  pickText: {
    color: tokens.color.accentStrong,
    fontSize: 13,
    fontWeight: "800",
  },
  previewFrame: {
    height: 188,
    overflow: "hidden",
    borderRadius: 17,
    backgroundColor: tokens.color.surfaceTint,
  },
  preview: { width: "100%", height: "100%" },
  removePhoto: {
    position: "absolute",
    top: 9,
    right: 9,
    width: 31,
    height: 31,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "rgba(37,25,20,0.75)",
  },
  privacyNote: { color: tokens.color.muted, fontSize: 11, lineHeight: 16 },
  actions: { flexDirection: "row", gap: 9 },
  handoffNote: {
    marginTop: -7,
    color: tokens.color.muted,
    fontSize: 11.5,
    lineHeight: 17,
    textAlign: "center",
  },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
});

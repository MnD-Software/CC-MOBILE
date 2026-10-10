import { useState } from "react";
import { ActivityIndicator, Pressable, Switch, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Typography";
import { Disclosure } from "@/components/ui/Disclosure";
import { CampaignDateField } from "@/components/ui/CampaignDateField";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Feedback, Notice, Section } from "@/components/ui/Commerce";
import { shopApi } from "@/features/commerce/api";
import { plainText } from "@/features/commerce/contracts";
import { useTheme } from "@/theme/ThemeProvider";
import { CataloguePicker } from "./CataloguePicker";
import { campaignExpiry, studioDate, storyProblem } from "./studio";
import { mediaSource, type Campaign } from "./content";

export function CampaignEditor({
  form,
  onChange,
  onUpload,
  uploading,
  saving,
  onSave,
  onClose,
}: {
  form: Campaign;
  onChange: (form: Campaign) => void;
  onUpload: (video: boolean) => void;
  uploading: boolean;
  saving: boolean;
  onSave: (publish: boolean) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const [step, setStep] = useState(0);
  const [problem, setProblem] = useState("");
  const [picker, setPicker] = useState(false);
  const [collections, setCollections] = useState(false);
  const busy = uploading || saving;
  const linked = useQuery({
    queryKey: ["staff-linked-cakes", form.product_slugs],
    enabled: form.product_slugs.length > 0,
    queryFn: ({ signal }) =>
      shopApi.productsByIdentifier(form.product_slugs, signal),
    staleTime: 60000,
  });
  const categories = useQuery({
    queryKey: ["staff-categories"],
    enabled: collections || !!form.category_id,
    queryFn: ({ signal }) => shopApi.categories(signal),
    staleTime: 300000,
  });
  const collection = categories.data?.find(
    (item) => item.id === form.category_id,
  );
  function change(patch: Partial<Campaign>) {
    setProblem("");
    onChange({ ...form, ...patch });
  }
  function next() {
    if (step === 0 && (!form.image_url || form.title.trim().length < 3)) {
      setProblem(
        !form.image_url
          ? "Add a photo to bring your story to life."
          : "Give your story a name of at least 3 letters.",
      );
      return;
    }
    if (step === 1 && !form.product_slugs.length && !form.category_id) {
      setProblem("Choose at least one cake or a collection.");
      return;
    }
    setProblem("");
    setStep(step + 1);
  }
  function save(publish: boolean) {
    const error = storyProblem(form, publish);
    if (error) {
      setProblem(error);
      return;
    }
    onSave(publish);
  }
  const scheduled = Date.parse(form.starts_at) > Date.now();
  return (
    <>
      <Button
        label="Back to my stories"
        variant="ghost"
        disabled={busy}
        onPress={onClose}
      />
      <View style={{ flexDirection: "row", gap: 8 }}>
        {["Photo & words", "Choose cakes", "Preview"].map((label, index) => (
          <View key={label} style={{ flex: 1, gap: 8 }}>
            <View
              style={{
                height: 4,
                borderRadius: 4,
                backgroundColor:
                  index <= step ? colors.brandStrong : colors.border,
              }}
            />
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: index === step ? colors.brandStrong : colors.muted,
              }}
            >
              {index + 1}. {label}
            </Text>
          </View>
        ))}
      </View>
      <View
        pointerEvents={busy ? "none" : "auto"}
        style={{ gap: 16, opacity: saving ? 0.6 : 1 }}
      >
        {step === 0 ? (
          <>
            <Section title="Make them stop and look." />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                form.image_url ? "Change story photo" : "Add story photo"
              }
              onPress={() => onUpload(false)}
              style={{
                minHeight: 190,
                borderRadius: 24,
                overflow: "hidden",
                backgroundColor: colors.brandLight,
                borderWidth: 1,
                borderColor: colors.border,
                justifyContent: "center",
                alignItems: "center",
                gap: 10,
              }}
            >
              {form.image_url ? (
                <Image
                  source={mediaSource(form.image_url)}
                  contentFit="contain"
                  style={{ width: "100%", height: 220 }}
                />
              ) : (
                <>
                  <Ionicons
                    name="images-outline"
                    size={38}
                    color={colors.brandStrong}
                  />
                  <Text
                    style={{
                      fontWeight: "800",
                      fontSize: 19,
                      color: colors.ink,
                    }}
                  >
                    Add a photo
                  </Text>
                  <Text style={{ color: colors.muted }}>
                    Choose artwork from your gallery
                  </Text>
                </>
              )}
              {uploading ? (
                <View
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundColor: "rgba(255,255,255,0.82)",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                  }}
                >
                  <ActivityIndicator color={colors.brandStrong} />
                  <Text style={{ color: colors.ink }}>
                    Preparing your photo...
                  </Text>
                </View>
              ) : null}
            </Pressable>
            {form.image_url ? (
              <Button
                variant="ghost"
                label="Change photo"
                onPress={() => onUpload(false)}
              />
            ) : null}
            <Input
              label="Story name"
              placeholder="A little weekend indulgence"
              value={form.title}
              maxLength={100}
              onChangeText={(title) => change({ title })}
            />
            <Input
              label="A few words (optional)"
              placeholder="What makes this special? Add any offer terms here."
              value={form.description}
              maxLength={600}
              multiline
              onChangeText={(description) => change({ description })}
            />
            <Text style={{ color: colors.ink, fontWeight: "700" }}>
              What are you sharing?
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {(
                [
                  ["offer", "An offer"],
                  ["spotlight", "A favourite cake"],
                  ["celebration", "A celebration"],
                ] as const
              ).map(([template, label]) => (
                <Pressable
                  key={template}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: form.template === template }}
                  onPress={() => change({ template })}
                  style={{
                    paddingHorizontal: 14,
                    minHeight: 44,
                    justifyContent: "center",
                    borderRadius: 24,
                    borderWidth: 1,
                    borderColor:
                      form.template === template
                        ? colors.brandStrong
                        : colors.border,
                    backgroundColor:
                      form.template === template
                        ? colors.brandLight
                        : colors.surface,
                  }}
                >
                  <Text
                    style={{
                      color: colors.ink,
                      fontWeight: "700",
                      fontSize: 12,
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Disclosure title="Use an existing image link">
              <Input
                label="Image link"
                value={form.image_url}
                autoCapitalize="none"
                keyboardType="url"
                onChangeText={(image_url) => change({ image_url })}
              />
            </Disclosure>
          </>
        ) : step === 1 ? (
          <>
            <Section title="What can customers shop?" />
            <Text style={{ color: colors.muted }}>
              Pick the cakes featured in your photo. Customers can open them
              straight from your story.
            </Text>
            <Button
              label={
                form.product_slugs.length ? "Add or change cakes" : "Find cakes"
              }
              onPress={() => setPicker(true)}
            />
            <Feedback
              error={linked.error}
              onRetry={() => void linked.refetch()}
            />
            {form.product_slugs.map((slug, index) => {
              const cake =
                linked.data?.find((item) => item.slug === slug) ??
                shopApi.cachedProduct(slug);
              const name = cake
                ? plainText(cake.name)
                : `Selected cake ${index + 1}`;
              return (
                <View
                  key={slug}
                  style={{
                    flexDirection: "row",
                    gap: 12,
                    alignItems: "center",
                    padding: 12,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Image
                    source={cake?.images[0]?.src}
                    contentFit="contain"
                    style={{ width: 48, height: 48 }}
                  />
                  <Text
                    style={{ flex: 1, color: colors.ink, fontWeight: "700" }}
                  >
                    {name}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${name}`}
                    onPress={() =>
                      change({
                        product_slugs: form.product_slugs.filter(
                          (s) => s !== slug,
                        ),
                      })
                    }
                    style={{
                      minHeight: 44,
                      minWidth: 44,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Ionicons
                      name="close-circle-outline"
                      size={23}
                      color={colors.brandStrong}
                    />
                  </Pressable>
                </View>
              );
            })}
            {form.category_id ? (
              <Notice
                message={`Featuring ${collection ? plainText(collection.name) : "your selected collection"}`}
              />
            ) : null}
            <Disclosure title="Feature a whole collection instead">
              <Button
                variant="outline"
                label={
                  collection
                    ? plainText(collection.name)
                    : "Choose a collection"
                }
                onPress={() => setCollections(true)}
              />
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                For stories about an entire range, such as Signature Cakes.
              </Text>
            </Disclosure>
          </>
        ) : (
          <>
            <Section title="Ready for its moment?" />
            <View
              style={{
                borderRadius: 24,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              }}
            >
              <Image
                source={mediaSource(form.image_url)}
                contentFit="cover"
                style={{ height: 220, width: "100%" }}
              />
              <View style={{ padding: 18, gap: 8 }}>
                <Text
                  style={{
                    color: colors.brandStrong,
                    fontSize: 11,
                    fontWeight: "800",
                  }}
                >
                  {form.member_only
                    ? "FOR OUR CLUB MEMBERS"
                    : form.template === "offer"
                      ? "SPECIAL OFFER"
                      : "FRESH FROM CAKE CITY"}
                </Text>
                <Text
                  style={{ color: colors.ink, fontSize: 23, fontWeight: "800" }}
                >
                  {form.title}
                </Text>
                {form.description ? (
                  <Text style={{ color: colors.muted, lineHeight: 21 }}>
                    {form.description}
                  </Text>
                ) : null}
                <Text
                  style={{ color: colors.ink, fontWeight: "700", fontSize: 12 }}
                >
                  {form.category_id
                    ? collection
                      ? plainText(collection.name)
                      : "Selected collection"
                    : `${form.product_slugs.length} cake${form.product_slugs.length === 1 ? "" : "s"} to shop`}
                </Text>
              </View>
            </View>
            <Text style={{ color: colors.ink, fontWeight: "700" }}>
              When should it end?
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {(
                [
                  ["today", scheduled ? "Same day" : "Tonight"],
                  ["tomorrow", scheduled ? "Next day" : "Tomorrow"],
                  ["week", "7 days"],
                ] as const
              ).map(([choice, label]) => {
                const expiry = campaignExpiry(choice, form.starts_at);
                const active = form.ends_at === expiry;
                return (
                  <Pressable
                    key={choice}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    onPress={() => change({ ends_at: expiry })}
                    style={{
                      borderWidth: 1,
                      borderColor: active ? colors.brandStrong : colors.border,
                      backgroundColor: active
                        ? colors.brandLight
                        : colors.surface,
                      paddingHorizontal: 18,
                      minHeight: 46,
                      borderRadius: 24,
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: colors.ink, fontWeight: "700" }}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ color: colors.muted, lineHeight: 20 }}>
              {scheduled
                ? `Starts ${studioDate(form.starts_at)}`
                : "Starts when published"}
              {"\n"}Ends {studioDate(form.ends_at)} · Nairobi time
            </Text>
            <Disclosure title="Choose exact dates">
              <CampaignDateField
                label="Starts"
                value={form.starts_at}
                onChange={(starts_at) => change({ starts_at })}
              />
              <CampaignDateField
                label="Ends"
                value={form.ends_at}
                onChange={(ends_at) => change({ ends_at })}
              />
              <Button
                variant="ghost"
                label="Start as soon as I publish"
                onPress={() => change({ starts_at: new Date().toISOString() })}
              />
            </Disclosure>
            <Disclosure title="More options">
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: colors.ink, fontWeight: "700" }}>
                    Club members only
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    Show this story to signed-in members.
                  </Text>
                </View>
                <Switch
                  accessibilityLabel="Club members only"
                  value={form.member_only}
                  onValueChange={(member_only) => change({ member_only })}
                  trackColor={{ true: colors.brandStrong }}
                />
              </View>
              <Input
                label="Available branches (optional)"
                hint="Leave blank for all branches. Separate names with commas."
                value={form.branch_names.join(", ")}
                onChangeText={(value) =>
                  change({
                    branch_names: value
                      .split(",")
                      .map((v) => v.trim())
                      .filter(Boolean),
                  })
                }
              />
              <Button
                variant="outline"
                label={
                  form.video_url
                    ? "Change video"
                    : "Add a short video (optional)"
                }
                onPress={() => onUpload(true)}
              />
              {form.video_url ? (
                <Button
                  variant="ghost"
                  label="Remove video"
                  onPress={() => change({ video_url: "" })}
                />
              ) : null}
            </Disclosure>
            {form.template === "offer" ? (
              <Text
                style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}
              >
                Set the actual discount in WooCommerce first. This story shares
                your offer with customers.
              </Text>
            ) : null}
          </>
        )}
      </View>
      {problem ? <Notice error message={problem} /> : null}
      {step < 2 ? (
        <Button
          label={step === 0 ? "Next: choose cakes" : "Preview my story"}
          disabled={busy}
          onPress={next}
        />
      ) : (
        <>
          <Button
            label={
              scheduled
                ? "Schedule story"
                : form.id && form.published
                  ? "Save changes"
                  : "Publish story"
            }
            loading={saving}
            disabled={uploading}
            onPress={() => save(true)}
          />
          <Button
            variant="ghost"
            label={
              form.published ? "Unpublish and save as draft" : "Save as draft"
            }
            disabled={busy}
            onPress={() => save(false)}
          />
        </>
      )}
      {step > 0 ? (
        <Button
          variant="ghost"
          label="Previous step"
          disabled={busy}
          onPress={() => {
            setProblem("");
            setStep(step - 1);
          }}
        />
      ) : null}
      {picker ? (
        <CataloguePicker
          visible
          selected={form.product_slugs}
          onClose={() => setPicker(false)}
          onChoose={(cake) =>
            change({
              category_id: null,
              product_slugs: form.product_slugs.includes(cake.slug)
                ? form.product_slugs.filter((s) => s !== cake.slug)
                : [...form.product_slugs, cake.slug],
            })
          }
        />
      ) : null}
      {collections ? (
        <BottomSheet
          visible
          title="Choose a collection"
          onClose={() => setCollections(false)}
        >
          <Feedback
            loading={categories.isPending}
            error={categories.error}
            onRetry={() => void categories.refetch()}
          />
          {(categories.data ?? []).map((item) => (
            <Button
              key={item.id}
              variant={form.category_id === item.id ? "primary" : "outline"}
              label={plainText(item.name)}
              onPress={() => {
                change({ category_id: item.id, product_slugs: [] });
                setCollections(false);
              }}
            />
          ))}
        </BottomSheet>
      ) : null}
    </>
  );
}

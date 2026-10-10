import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { z } from "zod";
import { useAuth } from "@/auth/AuthProvider";
import { api, isApiError } from "@/api/client";
import { Screen, Section, Notice, Feedback } from "@/components/ui/Commerce";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Disclosure } from "@/components/ui/Disclosure";
import { Text } from "@/components/ui/Typography";
import { useTheme } from "@/theme/ThemeProvider";
import {
  campaignSchema,
  mediaSource,
  productEditorialSchema,
} from "@/features/editorial/content";
import {
  newCampaign,
  storyProblem,
  storyStatus,
  studioDate,
} from "@/features/editorial/studio";
import { CampaignEditor } from "@/features/editorial/CampaignEditor";
import { CataloguePicker } from "@/features/editorial/CataloguePicker";
import { shopApi } from "@/features/commerce/api";
import { plainText } from "@/features/commerce/contracts";

const freshProduct = () => ({
  product_id: "",
  revision: 0,
  published: false,
  flavour: "",
  servings: "",
  preparation_hours: "",
  image_urls: "",
  video_url: "",
  photography_notes: "",
});
type ProductForm = ReturnType<typeof freshProduct>;
function productForm(
  item: z.infer<typeof productEditorialSchema>,
): ProductForm {
  return {
    ...item,
    product_id: String(item.product_id),
    preparation_hours:
      item.preparation_hours === null ? "" : String(item.preparation_hours),
    image_urls: item.image_urls.join("\n"),
  };
}

export default function CampaignStudio() {
  const { customer } = useAuth();
  const identity = useRef(customer?.id);
  identity.current = customer?.id;
  const client = useQueryClient();
  const { colors } = useTheme();
  const isStaff = customer?.role === "staff" || customer?.role === "admin";
  const [form, setForm] = useState(newCampaign);
  const [mode, setMode] = useState<"campaign" | "product">("campaign");
  const [editing, setEditing] = useState(false);
  const [picker, setPicker] = useState(false);
  const [product, setProduct] = useState(freshProduct);
  const [notice, setNotice] = useState("");
  const query = useQuery({
    queryKey: ["staff-content", customer?.id],
    enabled: isStaff,
    queryFn: ({ signal }) =>
      api.get<unknown[]>("/v1/admin/content", { auth: true, signal }),
    retry: false,
  });
  const selectedCake = useQuery({
    queryKey: ["staff-cake", product.product_id],
    enabled: isStaff && mode === "product" && !!product.product_id,
    queryFn: ({ signal }) => shopApi.product(product.product_id, signal),
    staleTime: 60000,
  });
  const save = useMutation({
    mutationFn: async (published: boolean) => {
      const owner = customer?.id;
      if (!isStaff || !owner)
        throw new Error("Sign in with your staff account to continue.");
      if (mode === "product") {
        if (!product.product_id) throw new Error("Choose a cake first.");
        const body = productEditorialSchema.parse({
          ...product,
          published,
          product_id: Number(product.product_id),
          preparation_hours: product.preparation_hours.trim()
            ? Number(product.preparation_hours)
            : null,
          image_urls: product.image_urls
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
        });
        return {
          mode,
          payload: await api.put(
            `/v1/admin/content/products/${body.product_id}`,
            body,
            { auth: true },
          ),
          owner,
        };
      }
      const error = storyProblem(form, published);
      if (error) throw new Error(error);
      const body = {
        ...form,
        published,
        title: form.title.trim(),
        product_slugs: form.product_slugs.map((s) => s.trim()).filter(Boolean),
      };
      return {
        mode,
        payload: await api[form.id ? "put" : "post"](
          "/v1/admin/content/campaigns" + (form.id ? `/${form.id}` : ""),
          body,
          { auth: true },
        ),
        owner,
      };
    },
    onSuccess: async (result) => {
      if (identity.current !== result.owner) return;
      if (result.mode === "campaign") {
        const saved = campaignSchema.parse(result.payload);
        setForm(saved);
        setEditing(false);
        const status = storyStatus(saved);
        setNotice(
          status === "Live"
            ? "Your story is live. Customers can shop it now."
            : status === "Scheduled"
              ? `Your story is scheduled for ${studioDate(saved.starts_at)}.`
              : "Your draft is saved. Publish it whenever you're ready.",
        );
      } else {
        const item = productEditorialSchema.parse(result.payload);
        setProduct(productForm(item));
        setNotice(
          item.published
            ? "Your cake details are published."
            : "Your cake details are saved as a draft.",
        );
      }
      await Promise.all([
        client.invalidateQueries({ queryKey: ["staff-content"] }),
        client.invalidateQueries({ queryKey: ["editorial-campaigns"] }),
        client.invalidateQueries({ queryKey: ["product-editorial"] }),
      ]);
    },
  });
  const upload = useMutation({
    mutationFn: async (video: boolean) => {
      const scope = customer?.id;
      if (!isStaff || !scope)
        throw new Error("Sign in with your staff account to continue.");
      if (video) {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted)
          throw new Error("Allow photo library access to choose a video.");
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: video ? ["videos"] : ["images"],
        quality: 1,
        videoMaxDuration: 30,
      });
      if (result.canceled) return null;
      const asset = result.assets[0];
      let data: string | null | undefined;
      let mime = "video/mp4";
      if (video) {
        if (asset.fileSize && asset.fileSize > 10_000_000)
          throw new Error("Choose a shorter MP4 video, under 10 MB.");
        if (asset.mimeType && asset.mimeType !== "video/mp4")
          throw new Error(
            "Choose an MP4 video. Other video formats aren't supported yet.",
          );
        const blob = await (await fetch(asset.uri)).blob();
        if (blob.size > 10_000_000)
          throw new Error("Choose a shorter MP4 video, under 10 MB.");
        data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.onerror = () =>
            reject(
              new Error("This video couldn't be opened. Try another clip."),
            );
          reader.readAsDataURL(blob);
        });
      } else {
        const png = asset.mimeType === "image/png";
        mime = png ? "image/png" : "image/jpeg";
        const context = ImageManipulator.manipulate(asset.uri);
        try {
          for (const edge of [1600, 1100, 640]) {
            const maximum = Math.max(asset.width, asset.height);
            if (maximum > edge)
              context.resize(
                asset.width >= asset.height
                  ? { width: edge, height: null }
                  : { width: null, height: edge },
              );
            const rendered = await context.renderAsync();
            try {
              const image = await rendered.saveAsync({
                format: png ? SaveFormat.PNG : SaveFormat.JPEG,
                compress: 0.8,
                base64: true,
              });
              data = image.base64;
            } finally {
              rendered.release();
            }
            if (data && Math.ceil((data.length * 3) / 4) <= 2_000_000) break;
          }
        } finally {
          context.release();
        }
        if (data && Math.ceil((data.length * 3) / 4) > 2_000_000)
          throw new Error(
            "This photo couldn't be prepared. Please choose another image.",
          );
      }
      if (!data)
        throw new Error("This file couldn't be opened. Please try another.");
      if (identity.current !== scope)
        throw new Error("Your account changed. Please choose the file again.");
      const response = z
        .object({ url: z.string() })
        .parse(
          await api.post(
            "/v1/admin/content/assets",
            { mime, data },
            { auth: true, timeoutMs: 65000 },
          ),
        );
      return { url: response.url, video, owner: scope, mode };
    },
    onSuccess: (result) => {
      if (!result || identity.current !== result.owner) return;
      if (result.mode === "campaign")
        setForm((old) => ({
          ...old,
          [result.video ? "video_url" : "image_url"]: result.url,
        }));
      else
        setProduct((old) => ({
          ...old,
          [result.video ? "video_url" : "image_urls"]: result.video
            ? result.url
            : [old.image_urls, result.url].filter(Boolean).join("\n"),
        }));
    },
  });
  const busy = save.isPending || upload.isPending;
  const error = save.error ?? upload.error;
  const problem =
    isApiError(error) && error.status === 409
      ? "This content changed since you opened it. Return to your saved content and reopen it before saving."
      : error instanceof z.ZodError
        ? "Check your cake details. Preparation time must be a positive number of hours, or zero for ready cakes."
        : error instanceof Error
          ? error.message
          : "Please try again.";
  if (!isStaff)
    return (
      <Screen back>
        <Notice message="Campaign Studio is available to Cake City staff accounts." />
      </Screen>
    );
  return (
    <Screen back title="Campaign Studio">
      <Text style={{ color: colors.muted, lineHeight: 21 }}>
        Your next delicious story starts here.
      </Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {(
          [
            ["campaign", "Stories & offers"],
            ["product", "Cake details"],
          ] as const
        ).map(([key, label]) => (
          <View key={key} style={{ flex: 1 }}>
            <Button
              label={label}
              variant={mode === key ? "primary" : "secondary"}
              disabled={busy}
              onPress={() => {
                setMode(key);
                setNotice("");
                save.reset();
                upload.reset();
              }}
            />
          </View>
        ))}
      </View>
      {notice ? <Notice message={notice} /> : null}
      {save.isError || upload.isError ? (
        <Notice error message={problem} />
      ) : null}
      <Feedback error={query.error} onRetry={() => void query.refetch()} />
      {mode === "campaign" ? (
        editing ? (
          <CampaignEditor
            key={form.id || "new"}
            form={form}
            onChange={setForm}
            onUpload={(video) => {
              upload.reset();
              upload.mutate(video);
            }}
            uploading={upload.isPending}
            saving={save.isPending}
            onSave={(published) => {
              setNotice("");
              save.mutate(published);
            }}
            onClose={() => {
              setEditing(false);
              save.reset();
              upload.reset();
            }}
          />
        ) : (
          <>
            <Button
              label={
                form.id === "" && (form.image_url || form.title)
                  ? "Continue my story"
                  : "Create a story"
              }
              onPress={() => {
                if (form.id) setForm(newCampaign());
                setEditing(true);
                setNotice("");
                save.reset();
                upload.reset();
              }}
            />
            <Section title="My stories" />
            <Feedback loading={query.isPending} />
            {!(query.data ?? []).some(
              (row) => campaignSchema.safeParse(row).success,
            ) &&
            !query.isPending &&
            !query.isError ? (
              <View
                style={{
                  padding: 28,
                  borderRadius: 26,
                  backgroundColor: colors.brandLight,
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <Ionicons
                  name="sparkles-outline"
                  size={34}
                  color={colors.brandStrong}
                />
                <Text
                  style={{ color: colors.ink, fontWeight: "800", fontSize: 18 }}
                >
                  Make your first story.
                </Text>
                <Text
                  style={{
                    color: colors.muted,
                    textAlign: "center",
                    lineHeight: 20,
                  }}
                >
                  Add a photo, choose your cakes and share something customers
                  will love.
                </Text>
              </View>
            ) : null}
            {(query.data ?? []).map((row) => {
              const item = campaignSchema.safeParse(row);
              if (!item.success) return null;
              const story = item.data;
              const status = storyStatus(story);
              return (
                <Pressable
                  key={story.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${story.title}. ${status}`}
                  disabled={busy}
                  onPress={() => {
                    setForm(story);
                    setEditing(true);
                    setNotice("");
                    save.reset();
                    upload.reset();
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 14,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 22,
                    padding: 12,
                  }}
                >
                  <Image
                    source={mediaSource(story.image_url)}
                    contentFit="cover"
                    style={{ height: 76, width: 76, borderRadius: 16 }}
                  />
                  <View style={{ flex: 1, gap: 5 }}>
                    <Text
                      style={{
                        color:
                          status === "Live" ? colors.brandStrong : colors.muted,
                        fontSize: 11,
                        fontWeight: "800",
                      }}
                    >
                      {status}
                    </Text>
                    <Text
                      numberOfLines={2}
                      style={{ color: colors.ink, fontWeight: "800" }}
                    >
                      {story.title}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.muted }}>
                      Ends {studioDate(story.ends_at)}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={colors.muted}
                  />
                </Pressable>
              );
            })}
          </>
        )
      ) : (
        <>
          <Section title="Give your cakes a little more detail." />
          <Text style={{ color: colors.muted, lineHeight: 21 }}>
            Choose a cake to add photos, a video or confirmed serving and
            preparation information.
          </Text>
          <Button
            label={
              product.product_id ? "Choose a different cake" : "Choose a cake"
            }
            disabled={busy}
            onPress={() => setPicker(true)}
          />
          {product.product_id ? (
            <View pointerEvents={busy ? "none" : "auto"} style={{ gap: 16 }}>
              <Feedback
                error={selectedCake.error}
                onRetry={() => void selectedCake.refetch()}
              />
              <Text
                style={{ color: colors.ink, fontWeight: "800", fontSize: 20 }}
              >
                {selectedCake.data
                  ? plainText(selectedCake.data.name)
                  : "Your selected cake"}
              </Text>
              {(
                [
                  ["flavour", "Flavour", "e.g. Chocolate sponge"],
                  ["servings", "Servings", "e.g. 1 kg serves 10"],
                  ["preparation_hours", "Preparation time in hours", "e.g. 24"],
                  [
                    "photography_notes",
                    "Photo captions (optional)",
                    "What would you like customers to know?",
                  ],
                ] as const
              ).map(([key, label, placeholder]) => (
                <Input
                  key={key}
                  label={label}
                  placeholder={placeholder}
                  value={product[key]}
                  keyboardType={
                    key === "preparation_hours" ? "number-pad" : "default"
                  }
                  multiline={key === "photography_notes"}
                  maxLength={
                    key === "photography_notes"
                      ? 500
                      : key === "servings"
                        ? 100
                        : 160
                  }
                  onChangeText={(value) =>
                    setProduct((old) => ({ ...old, [key]: value }))
                  }
                />
              ))}
              <Section title="Extra photos" />
              {product.image_urls
                .split("\n")
                .filter(Boolean)
                .map((url, index) => (
                  <View key={url + index} style={{ gap: 6 }}>
                    <Image
                      source={mediaSource(url)}
                      contentFit="contain"
                      style={{ width: "100%", height: 160, borderRadius: 18 }}
                    />
                    <Button
                      variant="ghost"
                      label={`Remove photo ${index + 1}`}
                      onPress={() =>
                        setProduct((old) => ({
                          ...old,
                          image_urls: old.image_urls
                            .split("\n")
                            .filter((_, i) => i !== index)
                            .join("\n"),
                        }))
                      }
                    />
                  </View>
                ))}
              <Button
                variant="outline"
                label="Add a photo"
                loading={upload.isPending}
                disabled={
                  product.image_urls.split("\n").filter(Boolean).length >= 6
                }
                onPress={() => upload.mutate(false)}
              />
              <Button
                variant="outline"
                label={
                  product.video_url
                    ? "Change video"
                    : "Add a short video (optional)"
                }
                onPress={() => upload.mutate(true)}
              />
              {product.video_url ? (
                <Button
                  variant="ghost"
                  label="Remove video"
                  onPress={() =>
                    setProduct((old) => ({ ...old, video_url: "" }))
                  }
                />
              ) : null}
              <Disclosure title="Use existing media links">
                <Input
                  label="Photo links, one per line"
                  multiline
                  value={product.image_urls}
                  autoCapitalize="none"
                  onChangeText={(image_urls) =>
                    setProduct((old) => ({ ...old, image_urls }))
                  }
                />
                <Input
                  label="Video link"
                  value={product.video_url}
                  autoCapitalize="none"
                  onChangeText={(video_url) =>
                    setProduct((old) => ({ ...old, video_url }))
                  }
                />
              </Disclosure>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                Only add confirmed details. Cake prices and stock are managed in
                WooCommerce.
              </Text>
            </View>
          ) : null}
          {product.product_id ? (
            <>
              <Button
                label="Publish cake details"
                loading={save.isPending}
                disabled={upload.isPending}
                onPress={() => save.mutate(true)}
              />
              <Button
                variant="ghost"
                label={
                  product.published
                    ? "Unpublish and save as draft"
                    : "Save as draft"
                }
                disabled={busy}
                onPress={() => save.mutate(false)}
              />
            </>
          ) : null}
          <Disclosure title="Previously edited cakes">
            {(query.data ?? []).map((row) => {
              const item = productEditorialSchema.safeParse(row);
              if (!item.success) return null;
              const cake = shopApi.cachedProduct(String(item.data.product_id));
              return (
                <Button
                  key={item.data.product_id}
                  variant="outline"
                  label={
                    cake ? plainText(cake.name) : "Open saved cake details"
                  }
                  disabled={busy}
                  onPress={() => {
                    setProduct(productForm(item.data));
                    setNotice("");
                    save.reset();
                    upload.reset();
                  }}
                />
              );
            })}
          </Disclosure>
        </>
      )}
      {picker ? (
        <CataloguePicker
          visible
          single
          selected={selectedCake.data ? [selectedCake.data.slug] : []}
          onClose={() => setPicker(false)}
          onChoose={(cake) => {
            const existing = (query.data ?? [])
              .map((row) => productEditorialSchema.safeParse(row))
              .find((item) => item.success && item.data.product_id === cake.id);
            setProduct(
              existing?.success
                ? productForm(existing.data)
                : { ...freshProduct(), product_id: String(cake.id) },
            );
            setNotice("");
            save.reset();
            upload.reset();
          }}
        />
      ) : null}
    </Screen>
  );
}

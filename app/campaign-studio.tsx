import { useRef, useState } from "react";
import { View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { z } from "zod";
import { useAuth } from "@/auth/AuthProvider";
import { api } from "@/api/client";
import { Screen, Section, Notice, Feedback } from "@/components/ui/Commerce";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Typography";
import { useTheme } from "@/theme/ThemeProvider";
import {
  campaignSchema,
  mediaSource,
  productEditorialSchema,
} from "@/features/editorial/content";

const fresh = () => ({
  id: "",
  revision: 0,
  title: "",
  description: "",
  image_url: "",
  video_url: "",
  starts_at: new Date().toISOString(),
  ends_at: new Date(Date.now() + 86400000).toISOString(),
  product_slugs: [] as string[],
  category_id: null as number | null,
  branch_names: [] as string[],
  member_only: false,
  published: false,
  template: "spotlight" as "spotlight" | "celebration" | "offer",
});
export default function CampaignStudio() {
  const { customer } = useAuth();
  const identity = useRef(customer?.id);
  identity.current = customer?.id;
  const client = useQueryClient();
  const { colors } = useTheme();
  const isStaff = customer?.role === "staff" || customer?.role === "admin";
  const [form, setForm] = useState(fresh);
  const [mode, setMode] = useState<"campaign" | "product">("campaign");
  const [product, setProduct] = useState({
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
  const [notice, setNotice] = useState("");
  const query = useQuery({
    queryKey: ["staff-content", customer?.id],
    enabled: isStaff,
    queryFn: ({ signal }) =>
      api.get<unknown[]>("/v1/admin/content", { auth: true, signal }),
    retry: false,
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!isStaff) throw new Error("Staff access required");
      if (mode === "product") {
        const body = productEditorialSchema.parse({
          ...product,
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
          owner: customer.id,
        };
      }
      const body = {
        ...form,
        title: form.title.trim(),
        product_slugs: form.product_slugs.map((s) => s.trim()).filter(Boolean),
      };
      if (
        !body.title ||
        !body.image_url ||
        (!body.product_slugs.length && !body.category_id)
      )
        throw new Error(
          "Add a title, artwork and at least one real product slug or category ID.",
        );
      if (
        !Number.isFinite(Date.parse(body.starts_at)) ||
        !Number.isFinite(Date.parse(body.ends_at)) ||
        Date.parse(body.ends_at) <= Date.parse(body.starts_at)
      )
        throw new Error(
          "Check the schedule: end must follow start. Include the timezone.",
        );
      const path =
        "/v1/admin/content/campaigns" + (form.id ? `/${form.id}` : "");
      return {
        mode,
        payload: await api[form.id ? "put" : "post"](path, body, {
          auth: true,
        }),
        owner: customer.id,
      };
    },
    onSuccess: async (result) => {
      if (identity.current !== result.owner) return;
      if (result.mode === "campaign")
        setForm(campaignSchema.parse(result.payload));
      else {
        const item = productEditorialSchema.parse(result.payload);
        setProduct({
          ...item,
          product_id: String(item.product_id),
          preparation_hours:
            item.preparation_hours === null
              ? ""
              : String(item.preparation_hours),
          image_urls: item.image_urls.join("\n"),
        });
      }
      setNotice(
        "Saved. Published content appears during its schedule; draft content stays private.",
      );
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
      if (!isStaff || !scope) throw new Error("Staff access required");
      if (video) {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted)
          throw new Error("Photo library access is required to select a clip.");
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: video ? ["videos"] : ["images"],
        base64: !video,
        quality: 0.85,
        videoMaxDuration: 30,
      });
      if (result.canceled) return null;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > (video ? 10_000_000 : 2_000_000))
        throw new Error(
          "Compress the image under 2 MB or the MP4 under 10 MB, then select it again.",
        );
      const data = video
        ? await new Promise<string>(async (resolve, reject) => {
            try {
              const blob = await (await fetch(asset.uri)).blob();
              if (blob.size > 10_000_000) throw new Error("Clip exceeds 10 MB");
              const reader = new FileReader();
              reader.onload = () =>
                resolve(String(reader.result).split(",")[1]);
              reader.onerror = () =>
                reject(new Error("Clip could not be read"));
              reader.readAsDataURL(blob);
            } catch (error) {
              reject(error);
            }
          })
        : asset.base64;
      if (!data)
        throw new Error(
          "This media couldn't be read. Use a JPEG image or MP4 clip.",
        );
      if (identity.current !== scope)
        throw new Error("Account changed. Please retry.");
      const response = z
        .object({ url: z.string() })
        .parse(
          await api.post(
            "/v1/admin/content/assets",
            { mime: video ? "video/mp4" : "image/jpeg", data },
            { auth: true, timeoutMs: 65_000 },
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
  if (!isStaff)
    return (
      <Screen back>
        <Notice message="Campaign Studio is available to Cake City staff accounts." />
      </Screen>
    );
  const field = (
    key:
      | "title"
      | "description"
      | "image_url"
      | "video_url"
      | "starts_at"
      | "ends_at",
    label: string,
  ) => (
    <Input
      key={key}
      label={label}
      value={form[key]}
      onChangeText={(value) => setForm((old) => ({ ...old, [key]: value }))}
      multiline={key === "description"}
      autoCapitalize={key.includes("url") ? "none" : "sentences"}
    />
  );
  return (
    <Screen back title="Campaign Studio">
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button
          label="Stories & offers"
          variant={mode === "campaign" ? "primary" : "secondary"}
          onPress={() => setMode("campaign")}
        />
        <Button
          label="Cake details"
          variant={mode === "product" ? "primary" : "secondary"}
          onPress={() => setMode("product")}
        />
      </View>
      <Notice message="Use actual Cake City photos and confirmed product details. Prices and discounts are set in WooCommerce; this studio controls merchandising." />
      <Feedback error={query.error} onRetry={() => void query.refetch()} />
      <Section title="Saved content" />
      {(query.data ?? []).map((row) => {
        const campaign = campaignSchema.safeParse(row);
        const editorial = productEditorialSchema.safeParse(row);
        if (!campaign.success && !editorial.success) return null;
        return (
          <Button
            key={
              campaign.success
                ? campaign.data.id
                : `product-${editorial.success ? editorial.data.product_id : ""}`
            }
            variant="secondary"
            label={
              campaign.success
                ? `${campaign.data.published ? "Published" : "Draft"} · ${campaign.data.title}`
                : `Cake ${editorial.success ? editorial.data.product_id : ""}`
            }
            onPress={() => {
              if (campaign.success) {
                setForm(campaign.data);
                setMode("campaign");
              } else if (editorial.success) {
                setProduct({
                  ...editorial.data,
                  product_id: String(editorial.data.product_id),
                  preparation_hours:
                    editorial.data.preparation_hours === null
                      ? ""
                      : String(editorial.data.preparation_hours),
                  image_urls: editorial.data.image_urls.join("\n"),
                });
                setMode("product");
              }
              setNotice("");
            }}
          />
        );
      })}
      {mode === "campaign" ? (
        <>
          <Button
            label="New story"
            variant="ghost"
            onPress={() => {
              setForm(fresh());
              setNotice("");
            }}
          />
          {(["spotlight", "celebration", "offer"] as const).map((template) => (
            <Button
              key={template}
              label={
                template === "spotlight"
                  ? "Cake spotlight"
                  : template === "celebration"
                    ? "Celebration edit"
                    : "Offer of the day"
              }
              variant={form.template === template ? "primary" : "secondary"}
              onPress={() => setForm((old) => ({ ...old, template }))}
            />
          ))}
          {field("title", "Story title")}
          {field("description", "Story copy")}
          {field("image_url", "Artwork URL")}
          {field("video_url", "Optional MP4 URL")}
          {form.image_url ? (
            <Image
              source={{ uri: mediaSource(form.image_url) }}
              contentFit="contain"
              style={{ width: "100%", height: 220 }}
            />
          ) : null}
          {field("starts_at", "Starts at (ISO date/time with timezone)")}
          {field("ends_at", "Ends at (ISO date/time with timezone)")}
          <Input
            label="Real product slugs (comma separated)"
            value={form.product_slugs.join(",")}
            autoCapitalize="none"
            onChangeText={(value) =>
              setForm((old) => ({ ...old, product_slugs: value.split(",") }))
            }
          />
          <Input
            label="Or catalogue category ID"
            value={form.category_id === null ? "" : String(form.category_id)}
            keyboardType="number-pad"
            onChangeText={(value) =>
              setForm((old) => ({
                ...old,
                category_id: value ? Number(value) : null,
              }))
            }
          />
          <Input
            label="Branches (comma separated; leave blank for all)"
            value={form.branch_names.join(",")}
            onChangeText={(value) =>
              setForm((old) => ({
                ...old,
                branch_names: value
                  .split(",")
                  .map((v) => v.trim())
                  .filter(Boolean),
              }))
            }
          />
          <Button
            variant="secondary"
            label={form.member_only ? "Members only: on" : "Members only: off"}
            onPress={() =>
              setForm((old) => ({ ...old, member_only: !old.member_only }))
            }
          />
          <Button
            variant="secondary"
            label={form.published ? "Published: on" : "Published: off (draft)"}
            onPress={() =>
              setForm((old) => ({ ...old, published: !old.published }))
            }
          />
        </>
      ) : (
        <>
          {(
            [
              ["product_id", "WooCommerce product ID"],
              ["flavour", "Confirmed flavour"],
              ["servings", "Confirmed servings (include the size)"],
              ["preparation_hours", "Confirmed preparation time (hours)"],
              ["image_urls", "Extra photo URLs (one per line)"],
              ["video_url", "Optional MP4 URL"],
              ["photography_notes", "Photo captions / details"],
            ] as const
          ).map(([key, label]) => (
            <Input
              key={key}
              label={label}
              value={product[key]}
              multiline={key === "image_urls" || key === "photography_notes"}
              onChangeText={(value) =>
                setProduct((old) => ({ ...old, [key]: value }))
              }
            />
          ))}
          <Button
            variant="secondary"
            label={
              product.published ? "Published: on" : "Published: off (draft)"
            }
            onPress={() =>
              setProduct((old) => ({ ...old, published: !old.published }))
            }
          />
        </>
      )}
      <View style={{ gap: 10 }}>
        <Button
          variant="outline"
          label="Upload artwork"
          loading={upload.isPending}
          onPress={() => upload.mutate(false)}
        />
        <Button
          variant="outline"
          label="Upload short MP4 clip"
          disabled={upload.isPending}
          onPress={() => upload.mutate(true)}
        />
      </View>
      <Button
        label="Save content"
        loading={save.isPending}
        disabled={upload.isPending}
        onPress={() => {
          setNotice("");
          save.mutate();
        }}
      />
      {notice ? <Notice message={notice} /> : null}
      {save.isError || upload.isError ? (
        <Notice
          error
          message={
            (save.error ?? upload.error) instanceof Error
              ? (save.error ?? (upload.error as Error))!.message
              : "Could not save. Check your media and dates."
          }
        />
      ) : null}
      <Text style={{ color: colors.muted, fontSize: 12 }}>
        Uploads persist in the database. Images: JPEG up to 2 MB. Clips: MP4 up
        to 10 MB. Prefer small media for faster mobile loading.
      </Text>
    </Screen>
  );
}

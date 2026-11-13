import { useState } from "react";
import { Pressable, Switch, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { router } from "expo-router";
import { api } from "@/api/client";
import { staffRouteAllowed } from "@/auth/staff-routing";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Typography";
import { Feedback, Notice } from "@/components/ui/Commerce";
import { LoadingImage } from "@/components/ui/LoadingImage";
import { Queue as NativeEnquiryQueue } from "@/features/workspace/CommandCenterScreen";
import { OrderDateField } from "@/features/commerce/OrderDateField";
import { StaffRecords } from "./StaffRecords";
import { appOrderSchema } from "@/features/commerce/app-orders";
import { OrderJourney } from "@/features/commerce/OrderJourney";

type Row = Record<string, unknown>;
const row = z.record(z.string(), z.unknown());
const text = (value: unknown) =>
  value === undefined || value === null ? "" : String(value);
const cash = (value: unknown) =>
  `KES ${(Number(value || 0) / 100).toLocaleString("en-KE")}`;
const object = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
const array = (value: unknown): Row[] =>
  Array.isArray(value) ? value.map(object) : [];
type Field = {
  id: string;
  label: string;
  value: string | boolean;
  number?: boolean;
  secret?: boolean;
  multiline?: boolean;
  date?: boolean;
  options?: { label: string; value: string }[];
  multiple?: boolean;
};
type Editor = {
  title: string;
  fields: Field[];
  save: (values: Record<string, string | boolean>) => Promise<unknown>;
};
const endpoints: Record<string, string> = {
  products: "/v1/admin/dashboard/products",
  promotions: "/v1/admin/dashboard/promotions",
  payments: "/v1/admin/app-orders",
  orders: "/v1/admin/app-orders",
  club: "/v1/admin/dashboard/club",
  issues: "/v1/admin/commerce-issues",
  campaigns: "/v1/admin/content",
  riders: "/v1/logistics/riders",
  reviews: "/v1/admin/order-reviews",
};

export function NativeStaffModule({ module }: { module: string }) {
  const { customer } = useAuth();
  const { colors } = useTheme();
  const cache = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [selectedOrder, setSelectedOrder] = useState("");
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");
  const records = useQuery({
    queryKey: [
      "native-staff",
      customer?.id,
      module,
      module === "products" ? search : "",
      page,
    ],
    enabled: !!endpoints[module],
    queryFn: async () => {
      const path =
        endpoints[module] +
        (module === "products"
          ? `?${new URLSearchParams({ search, page: String(page), per_page: "24" })}`
          : "");
      const result = await api.get(path, { auth: true });
      return module === "products"
        ? z
            .object({
              items: z.array(row),
              page: z.number(),
              pages: z.number(),
              total: z.number(),
            })
            .parse(result)
        : { items: z.array(row).parse(result), pages: 1, page: 1, total: 0 };
    },
    retry: false,
  });
  const categories = useQuery({
    queryKey: ["catalogue", "staff-categories"],
    enabled: module === "products",
    queryFn: async () =>
      z.array(row).parse(await api.get("/v1/catalogue/categories")),
  });
  const canEdit = ["admin", "staff", "ecommerce_manager"].includes(
    customer?.role ?? "",
  );
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["native-staff"] }),
      cache.invalidateQueries({ queryKey: ["staff-overview"] }),
      cache.invalidateQueries({ queryKey: ["logistics-riders"] }),
    ]);
  };
  if (module === "enquiries")
    return <NativeEnquiryQueue owner={customer?.id ?? ""} canReply />;
  if (["team", "audit"].includes(module))
    return <StaffRecords section={module as "team" | "audit" | "enquiries"} />;
  if (module === "delivery") return <DeliverySettings />;
  if (selectedOrder)
    return (
      <NativeOrder
        reference={selectedOrder}
        onBack={() => setSelectedOrder("")}
      />
    );

  const productEditor = (record?: Row) => {
    const payload = object(record?.payload);
    const categoryIds = array(payload.categories)
      .map((c) => text(c.id))
      .join(",");
    setEditor({
      title: record ? "Edit product" : "New product",
      fields: [
        { id: "name", label: "Product name", value: text(payload.name) },
        { id: "slug", label: "Product URL name", value: text(record?.slug) },
        {
          id: "price",
          label: "Price (KES)",
          value: text(Number(record?.price_minor || 0) / 100),
          number: true,
        },
        {
          id: "description",
          label: "Description",
          value: text(payload.description),
          multiline: true,
        },
        {
          id: "categories",
          label: "Product categories",
          value: categoryIds,
          options: (categories.data ?? []).map((c) => ({
            label: text(c.name),
            value: text(c.id),
          })),
          multiple: true,
        },
        {
          id: "allocation",
          label: "Stock allocation (for stocked products)",
          value: text(record?.allocation ?? 0),
          number: true,
        },
        {
          id: "made_to_order",
          label: "Made to order",
          value: payload.order_mode !== "stocked",
        },
        {
          id: "enabled",
          label: "Available for ordering",
          value: !!record?.enabled,
        },
        {
          id: "images",
          label: "App image URLs (one per line). You can upload below.",
          value: array(payload.images)
            .map((image) => {
              const src = text(image.src);
              return /cakecity\.co\.ke|wp\.com/.test(src)
                ? `/v1/app-media/source?url=${encodeURIComponent(src)}`
                : src;
            })
            .join("\n"),
          multiline: true,
        },
      ],
      save: async (values) => {
        const chosen = text(values.categories)
          .split(",")
          .map((id) => Number(id.trim()))
          .filter(Boolean);
        const known = [
          ...(categories.data ?? []),
          ...array(payload.categories),
        ];
        const selected = chosen.map((id) => {
          const c = known.find((c) => c.id === id);
          if (!c) throw Error("Choose a category from the available options.");
          return { id, name: text(c.name), slug: text(c.slug) };
        });
        const data = {
          revision: record?.revision ?? 0,
          name: values.name,
          slug:
            values.slug ||
            text(values.name)
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, ""),
          description: values.description,
          short_description: text(payload.short_description),
          price_minor: Math.round(Number(values.price) * 100),
          allocation: Number(values.allocation),
          order_mode: values.made_to_order ? "made_to_order" : "stocked",
          enabled: values.enabled,
          parent_id: record?.parent_id ?? null,
          image_urls: text(values.images)
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
          categories: selected,
        };
        return record
          ? api.put(`${endpoints.products}/${record.id}`, data, { auth: true })
          : api.post(endpoints.products, data, { auth: true });
      },
    });
  };
  const promotionEditor = (record?: Row) =>
    setEditor({
      title: record ? "Edit promotion" : "New promotion",
      fields: [
        { id: "code", label: "Coupon code", value: text(record?.code) },
        {
          id: "amount",
          label: "Discount value (KES)",
          value: text(Number(record?.amount_minor || 0) / 100),
          number: true,
        },
        {
          id: "minimum",
          label: "Minimum spend (KES)",
          value: text(Number(record?.minimum_minor || 0) / 100),
          number: true,
        },
        {
          id: "uses",
          label: "Maximum redemptions",
          value: text(record?.usage_limit ?? 100),
          number: true,
        },
        {
          id: "expiry",
          label: "Expires on (optional)",
          value: text(record?.expires_at).slice(0, 10),
          date: true,
        },
        { id: "enabled", label: "Promotion active", value: !!record?.enabled },
      ],
      save: (v) => {
        if (
          record &&
          text(v.code).toLowerCase() !== text(record.code).toLowerCase()
        )
          throw Error("Existing coupon codes cannot be renamed.");
        return api.put(
          `${endpoints.promotions}/${encodeURIComponent(text(v.code).trim().toLowerCase())}`,
          {
            version: record?.version ?? "",
            amount_minor: Math.round(Number(v.amount) * 100),
            minimum_minor: Math.round(Number(v.minimum) * 100),
            usage_limit: Number(v.uses),
            expires_at: v.expiry
              ? new Date(`${text(v.expiry)}T23:59:59+03:00`).toISOString()
              : null,
            enabled: v.enabled,
          },
          { auth: true },
        );
      },
    });
  const riderEditor = () =>
    setEditor({
      title: "Create rider account",
      fields: [
        { id: "first_name", label: "First name", value: "" },
        { id: "last_name", label: "Last name", value: "" },
        { id: "email", label: "Rider email", value: "" },
        { id: "phone", label: "Phone", value: "" },
        {
          id: "password",
          label: "Initial password (8+ characters)",
          value: "",
          secret: true,
        },
      ],
      save: (values) => api.post(endpoints.riders, values, { auth: true }),
    });
  const items = (records.data?.items ?? [])
    .filter((record) => module !== "campaigns" || record.kind === "campaign")
    .filter(
      (record) =>
        module === "products" ||
        !search ||
        JSON.stringify([
          record.name,
          record.reference,
          record.code,
          record.email,
          record.title,
        ])
          .toLowerCase()
          .includes(search.toLowerCase()),
    );
  return (
    <View style={{ gap: 18 }}>
      {editor ? (
        <NativeEditor
          key={editor.title + text(editor.fields[0]?.value)}
          editor={editor}
          onCancel={() => setEditor(null)}
          onSaved={async () => {
            setEditor(null);
            setNotice("Changes saved.");
            await refresh();
          }}
        />
      ) : (
        <>
          <Input
            label={`Search ${module}`}
            value={search}
            onChangeText={(value) => {
              setSearch(value);
              setPage(1);
            }}
          />
          {notice ? <Notice message={notice} /> : null}
          {failure ? <Notice error message={failure} /> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {module === "products" && canEdit ? (
              <Button
                label="Add product"
                disabled={!categories.data}
                onPress={() => productEditor()}
              />
            ) : null}
            {module === "promotions" && canEdit ? (
              <Button
                label="Create promotion"
                onPress={() => promotionEditor()}
              />
            ) : null}
            {module === "riders" ? (
              <Button label="Create rider" onPress={riderEditor} />
            ) : null}
            <Button
              label="Refresh"
              variant="outline"
              loading={records.isFetching}
              onPress={() => void records.refetch()}
            />
          </View>
          {records.isPending ? (
            <Feedback loading />
          ) : records.isError ? (
            <Feedback
              error={records.error}
              onRetry={() => void records.refetch()}
            />
          ) : !items.length ? (
            <Notice message="No matching records yet." />
          ) : (
            items.map((record, index) => {
              const payload = object(record.payload);
              const name = text(
                payload.name ||
                  record.name ||
                  record.title ||
                  record.reference ||
                  record.code ||
                  record.id,
              );
              const image = text(
                array(payload.images)[0]?.src || record.image_url,
              );
              return (
                <View
                  key={text(
                    record.id || record.reference || record.code || index,
                  )}
                  style={{
                    padding: 20,
                    borderRadius: 24,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                    gap: 12,
                  }}
                >
                  {image ? (
                    <LoadingImage
                      source={image}
                      contentFit="contain"
                      style={{ height: 150, borderRadius: 16 }}
                    />
                  ) : null}
                  <Text
                    style={{
                      color: colors.ink,
                      fontSize: 17,
                      fontWeight: "800",
                    }}
                  >
                    {name}
                  </Text>
                  {module === "products" ? (
                    <>
                      <Text
                        style={{ color: colors.brandStrong, fontWeight: "800" }}
                      >
                        {cash(record.price_minor)}
                      </Text>
                      <Text style={{ color: colors.muted, fontSize: 12 }}>
                        {record.enabled ? "Available" : "Hidden"} /{" "}
                        {text(payload.order_mode).replaceAll("_", " ")}
                      </Text>
                      {canEdit ? (
                        <Button
                          label="Edit product"
                          variant="outline"
                          onPress={() => productEditor(record)}
                        />
                      ) : null}
                    </>
                  ) : null}
                  {module === "promotions" ? (
                    <>
                      <Text style={{ color: colors.muted }}>
                        {cash(record.amount_minor)} off / minimum{" "}
                        {cash(record.minimum_minor)}
                      </Text>
                      <Text style={{ color: colors.muted }}>
                        Used {text(record.uses)} of {text(record.usage_limit)} /{" "}
                        {record.enabled ? "Active" : "Inactive"}
                      </Text>
                      {canEdit && !record.customer_id ? (
                        <Button
                          label="Edit promotion"
                          variant="outline"
                          onPress={() => promotionEditor(record)}
                        />
                      ) : null}
                    </>
                  ) : null}
                  {["orders", "payments"].includes(module) ? (
                    <>
                      <Text
                        style={{
                          color:
                            record.status === "completed"
                              ? colors.success
                              : colors.brandStrong,
                        }}
                      >
                        {text(record.status).replaceAll("_", " ")} /{" "}
                        {text(record.payment_state)}
                      </Text>
                      <Text style={{ color: colors.ink }}>
                        Order value: {cash(record.total_minor)}
                        {record.review_checkout ? " / KES 0 collected" : ""}
                      </Text>
                      <Button
                        label="Open order & tracking"
                        variant="outline"
                        onPress={() => setSelectedOrder(text(record.reference))}
                      />
                    </>
                  ) : null}
                  {module === "reviews" ? (
                    <View style={{ gap: 10 }}>
                      <Text
                        style={{
                          color:
                            Number(record.rating) >= 4
                              ? colors.success
                              : colors.brandStrong,
                          fontWeight: "800",
                          fontSize: 20,
                        }}
                      >
                        {text(record.rating)} / 5 stars
                      </Text>
                      <Text style={{ color: colors.ink, lineHeight: 22 }}>
                        {text(record.comment) || "The customer left a rating."}
                      </Text>
                      <Text style={{ color: colors.muted, fontSize: 12 }}>
                        {new Date(text(record.created_at)).toLocaleString(
                          "en-KE",
                        )}
                      </Text>
                    </View>
                  ) : null}
                  {module === "club" ? (
                    <>
                      <Text style={{ color: colors.muted }}>
                        {text(record.email)}
                      </Text>
                      <Text
                        style={{ color: colors.brandStrong, fontWeight: "800" }}
                      >
                        {text(record.points)} points / {text(record.purchases)}{" "}
                        purchases
                      </Text>
                      <Text style={{ color: colors.muted }}>
                        Qualifying spend: {cash(record.spend_minor)}
                      </Text>
                      {record.review_required ? (
                        <Notice message="This member's ledger needs review." />
                      ) : null}
                    </>
                  ) : null}
                  {module === "issues" ? (
                    <>
                      <Text style={{ color: colors.muted }}>
                        {text(record.reference)} / {text(record.kind)} /{" "}
                        {text(record.status)}
                      </Text>
                      {canEdit ? (
                        <Button
                          label={
                            record.status === "resolved"
                              ? "Reopen issue"
                              : "Resolve issue"
                          }
                          onPress={async () => {
                            setFailure("");
                            try {
                              await api.patch(
                                `/v1/admin/commerce-issues/${record.id}`,
                                {
                                  status:
                                    record.status === "resolved"
                                      ? "open"
                                      : "resolved",
                                },
                                { auth: true },
                              );
                              await refresh();
                            } catch (e) {
                              setFailure(
                                e instanceof Error
                                  ? e.message
                                  : "Could not update this issue.",
                              );
                            }
                          }}
                        />
                      ) : null}
                    </>
                  ) : null}
                  {module === "riders" ? (
                    <Text style={{ color: colors.muted }}>
                      {text(record.role)} / account ready for assigned
                      deliveries
                    </Text>
                  ) : null}
                  {module === "campaigns" ? (
                    <View style={{ gap: 8 }}>
                      <Text style={{ color: colors.ink, lineHeight: 22 }}>
                        {text(record.description)}
                      </Text>
                      <Text style={{ color: colors.muted }}>
                        Revision {text(record.revision)} /{" "}
                        {record.published ? "Published" : "Draft"}
                      </Text>
                      <Text style={{ color: colors.muted, fontSize: 12 }}>
                        From {text(record.starts_at)} to {text(record.ends_at)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
          {module === "products" && records.data && records.data.pages > 1 ? (
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button
                label="Previous"
                disabled={page <= 1}
                variant="outline"
                onPress={() => setPage(page - 1)}
              />
              <Text style={{ color: colors.muted }}>
                {page} / {records.data.pages}
              </Text>
              <Button
                label="Next"
                disabled={page >= records.data.pages}
                onPress={() => setPage(page + 1)}
              />
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

function NativeEditor({
  editor,
  onCancel,
  onSaved,
}: {
  editor: Editor;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const { colors } = useTheme();
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(editor.fields.map((f) => [f.id, f.value])),
  );
  const [photoError, setPhotoError] = useState("");
  const mutation = useMutation({
    mutationFn: () => editor.save(values),
    onSuccess: onSaved,
  });
  async function upload() {
    setPhotoError("");
    try {
      const photo = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        base64: true,
        quality: 0.6,
      });
      if (photo.canceled || !photo.assets[0]?.base64) return;
      const result = z
        .object({ url: z.string() })
        .parse(
          await api.post(
            "/v1/admin/content/assets",
            { mime: "image/jpeg", data: photo.assets[0].base64 },
            { auth: true },
          ),
        );
      setValues((v) => ({
        ...v,
        images: [text(v.images), result.url].filter(Boolean).join("\n"),
      }));
    } catch (e) {
      setPhotoError(
        e instanceof Error ? e.message : "Could not upload the image.",
      );
    }
  }
  return (
    <View style={{ gap: 18 }}>
      <Text style={{ color: colors.ink, fontSize: 22, fontWeight: "800" }}>
        {editor.title}
      </Text>
      {editor.fields.map((field) =>
        field.options ? (
          <View key={field.id} style={{ gap: 10 }}>
            <Text style={{ color: colors.ink, fontWeight: "700" }}>
              {field.label}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {field.options.map((option) => {
                const selected = text(values[field.id])
                  .split(",")
                  .includes(option.value);
                return (
                  <Button
                    key={option.value}
                    label={option.label}
                    size="sm"
                    variant={selected ? "primary" : "outline"}
                    onPress={() =>
                      setValues((v) => {
                        const current = text(v[field.id])
                          .split(",")
                          .filter(Boolean);
                        return {
                          ...v,
                          [field.id]: (selected
                            ? current.filter((x) => x !== option.value)
                            : [...current, option.value]
                          ).join(","),
                        };
                      })
                    }
                  />
                );
              })}
            </View>
          </View>
        ) : field.date ? (
          <OrderDateField
            key={field.id}
            label={field.label}
            value={text(values[field.id])}
            onChange={(value) =>
              setValues((v) => ({ ...v, [field.id]: value }))
            }
          />
        ) : typeof field.value === "boolean" ? (
          <View
            key={field.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              padding: 16,
              borderRadius: 16,
              backgroundColor: colors.surfaceRaised,
            }}
          >
            <Text style={{ flex: 1, color: colors.ink }}>{field.label}</Text>
            <Switch
              accessibilityLabel={field.label}
              value={!!values[field.id]}
              onValueChange={(value) =>
                setValues((v) => ({ ...v, [field.id]: value }))
              }
            />
          </View>
        ) : (
          <Input
            key={field.id}
            label={field.label}
            value={text(values[field.id])}
            onChangeText={(value) =>
              setValues((v) => ({ ...v, [field.id]: value }))
            }
            keyboardType={field.number ? "decimal-pad" : "default"}
            secureTextEntry={field.secret}
            multiline={field.multiline}
            autoCapitalize="none"
          />
        ),
      )}
      {editor.fields.some((f) => f.id === "images") ? (
        <Button
          label="Upload product image"
          variant="outline"
          onPress={() => void upload()}
        />
      ) : null}
      {mutation.isError || photoError ? (
        <Notice
          error
          message={photoError || mutation.error?.message || "Could not save."}
        />
      ) : null}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button
          label="Cancel"
          style={{ flex: 1 }}
          variant="outline"
          disabled={mutation.isPending}
          onPress={onCancel}
        />
        <Button
          label="Save changes"
          style={{ flex: 1 }}
          loading={mutation.isPending}
          onPress={() => mutation.mutate()}
        />
      </View>
    </View>
  );
}

function NativeOrder({
  reference,
  onBack,
}: {
  reference: string;
  onBack: () => void;
}) {
  const { colors } = useTheme();
  const { customer } = useAuth();
  const query = useQuery({
    queryKey: ["staff-order-detail", reference],
    queryFn: async () =>
      appOrderSchema.parse(
        await api.get(`/v1/admin/app-orders/${encodeURIComponent(reference)}`, {
          auth: true,
        }),
      ),
    retry: false,
  });
  return (
    <View style={{ gap: 18 }}>
      <Button label="Back to orders" variant="ghost" onPress={onBack} />
      {query.isPending ? (
        <Feedback loading />
      ) : query.isError ? (
        <Feedback error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <Text style={{ color: colors.ink, fontSize: 22, fontWeight: "800" }}>
            {reference}
          </Text>
          <Text style={{ color: colors.ink }}>
            Order value {cash(query.data.total_minor)}
          </Text>
          {query.data.status === "completed" ? (
            <Text
              style={{
                color: query.data.received_at ? colors.success : colors.muted,
                fontWeight: "700",
              }}
            >
              {query.data.received_at
                ? `Customer receipt confirmed ${new Date(query.data.received_at).toLocaleString("en-KE")}`
                : "Delivered / awaiting customer receipt confirmation"}
            </Text>
          ) : null}
          {query.data.items?.map((item, i) => (
            <Text key={i} style={{ color: colors.muted }}>
              {item.quantity} x {item.name} / {item.size}
            </Text>
          ))}
          <Text style={{ color: colors.muted }}>
            {Object.values(object(query.data.snapshot?.checkout.billing))
              .map(text)
              .filter(Boolean)
              .join(" / ")}
          </Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {staffRouteAllowed(customer?.role ?? "", "/kitchen") ? (
              <Button
                label="Kitchen workspace"
                variant="outline"
                onPress={() => router.push("/kitchen")}
              />
            ) : null}
            {staffRouteAllowed(customer?.role ?? "", "/dispatch") ? (
              <Button
                label="Dispatch workspace"
                variant="outline"
                onPress={() => router.push("/dispatch")}
              />
            ) : null}
          </View>
          <OrderJourney
            order={query.data}
            refresh={() => void query.refetch()}
            refreshing={query.isFetching}
          />
        </>
      )}
    </View>
  );
}

function DeliverySettings() {
  const [editor, setEditor] = useState<Editor | null>(null);
  const { colors } = useTheme();
  const query = useQuery({
    queryKey: ["native-delivery-settings"],
    queryFn: async () => ({
      delivery: object(await api.get("/v1/admin/app-delivery", { auth: true })),
      policy: object(await api.get("/v1/admin/app-policy", { auth: true })),
    }),
    retry: false,
  });
  if (editor)
    return (
      <NativeEditor
        editor={editor}
        onCancel={() => setEditor(null)}
        onSaved={async () => {
          setEditor(null);
          await query.refetch();
        }}
      />
    );
  if (query.isPending) return <Feedback loading />;
  if (query.isError)
    return (
      <Feedback error={query.error} onRetry={() => void query.refetch()} />
    );
  const { delivery: d, policy: p } = query.data;
  const deliveryPayload = () => ({
    enabled: d.enabled,
    origin_name: d.origin_name,
    origin_address: d.origin_address,
    origin: d.origin,
    radius_km: d.radius_km,
    pickup_stores: d.pickup_stores,
  });
  const editStore = (store?: Row) =>
    setEditor({
      title: store ? "Edit pickup store" : "New pickup store",
      fields: [
        { id: "id", label: "Store code", value: text(store?.id) },
        { id: "name", label: "Store name", value: text(store?.name) },
        { id: "address", label: "Address", value: text(store?.address) },
        {
          id: "latitude",
          label: "Latitude (optional)",
          value: text(store?.latitude),
          number: true,
        },
        {
          id: "longitude",
          label: "Longitude (optional)",
          value: text(store?.longitude),
          number: true,
        },
      ],
      save: (v) => {
        if (store && v.id !== store.id)
          throw Error("An existing store code cannot be renamed.");
        const next = {
          ...v,
          latitude: v.latitude ? Number(v.latitude) : null,
          longitude: v.longitude ? Number(v.longitude) : null,
        };
        return api.put(
          "/v1/admin/app-delivery",
          {
            ...deliveryPayload(),
            pickup_stores: [
              ...array(d.pickup_stores).filter((s) => s.id !== v.id),
              next,
            ],
          },
          { auth: true },
        );
      },
    });
  return (
    <View style={{ gap: 18 }}>
      <Notice
        message={`Maps routing: ${d.maps_ready ? "configured" : "not configured"}. HQ: ${text(d.origin_name)}. Existing rates and order totals stay server-controlled.`}
      />
      <Button
        label="Edit HQ & delivery boundary"
        onPress={() =>
          setEditor({
            title: "HQ & delivery boundary",
            fields: [
              {
                id: "origin_name",
                label: "HQ name",
                value: text(d.origin_name),
              },
              {
                id: "origin_address",
                label: "HQ address",
                value: text(d.origin_address),
              },
              {
                id: "latitude",
                label: "HQ latitude",
                value: text(object(d.origin).latitude),
                number: true,
              },
              {
                id: "longitude",
                label: "HQ longitude",
                value: text(object(d.origin).longitude),
                number: true,
              },
              {
                id: "radius",
                label: "Delivery radius (km)",
                value: text(d.radius_km),
                number: true,
              },
              {
                id: "enabled",
                label: "Enable distance delivery",
                value: !!d.enabled,
              },
            ],
            save: (v) =>
              api.put(
                "/v1/admin/app-delivery",
                {
                  ...deliveryPayload(),
                  enabled: v.enabled,
                  origin_name: v.origin_name,
                  origin_address: v.origin_address,
                  origin:
                    v.latitude && v.longitude
                      ? {
                          latitude: Number(v.latitude),
                          longitude: Number(v.longitude),
                        }
                      : null,
                  radius_km: v.radius ? Number(v.radius) : null,
                },
                { auth: true },
              ),
          })
        }
      />
      <Button
        label="Edit checkout policy"
        variant="outline"
        onPress={() =>
          setEditor({
            title: "Checkout policy",
            fields: [
              { id: "enabled", label: "Checkout enabled", value: !!p.enabled },
              {
                id: "pricing_confirmed",
                label: "Pricing confirmed",
                value: !!p.pricing_confirmed,
              },
              {
                id: "pickup_enabled",
                label: "Collection available",
                value: !!p.pickup_enabled,
              },
              {
                id: "prices_include_tax",
                label: "Prices include tax",
                value: !!p.prices_include_tax,
              },
              {
                id: "tax_bps",
                label: "Tax rate (basis points)",
                value: text(p.tax_bps ?? 0),
                number: true,
              },
              {
                id: "pickup_instructions",
                label: "Collection instructions",
                value: text(p.pickup_instructions),
                multiline: true,
              },
            ],
            save: (v) =>
              api.put(
                "/v1/admin/app-policy",
                { ...v, tax_bps: Number(v.tax_bps) },
                { auth: true },
              ),
          })
        }
      />
      <Text style={{ color: colors.ink, fontSize: 20, fontWeight: "800" }}>
        Pickup stores
      </Text>
      {array(d.pickup_stores).map((store) => (
        <Pressable
          key={text(store.id)}
          accessibilityRole="button"
          onPress={() => editStore(store)}
          style={{
            padding: 20,
            borderRadius: 18,
            gap: 8,
            backgroundColor: colors.surfaceRaised,
          }}
        >
          <Text style={{ color: colors.ink, fontWeight: "800" }}>
            {text(store.name)}
          </Text>
          <Text style={{ color: colors.muted }}>{text(store.address)}</Text>
        </Pressable>
      ))}
      <Button
        label="Add pickup store"
        variant="outline"
        onPress={() => editStore()}
      />
    </View>
  );
}

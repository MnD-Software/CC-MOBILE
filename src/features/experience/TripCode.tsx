import { useRef, useState } from "react";
import { View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useScreenActive } from "@/design/useScreenActive";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "@/components/ui/Typography";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { LoadingImage } from "@/components/ui/LoadingImage";
import { Disclosure } from "@/components/ui/Disclosure";
import { Notice } from "@/components/ui/Commerce";
type Code = {
  task_id: string;
  purpose: string;
  code: string;
  qr_data: string;
  expires_at: string;
};
function CodeDisplay({ code }: { code: Code }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 10, alignItems: "center" }}>
      <LoadingImage
        source={{ uri: code.qr_data }}
        contentFit="contain"
        style={{
          height: 190,
          width: 190,
          backgroundColor: "white",
          borderRadius: 16,
        }}
      />
      <Text
        selectable
        style={{
          color: colors.ink,
          fontSize: 25,
          fontWeight: "800",
          letterSpacing: 3,
        }}
      >
        {code.code}
      </Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>
        Valid until{" "}
        {new Date(code.expires_at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </Text>
    </View>
  );
}
export function HandoverCode({ taskId }: { taskId: string }) {
  const [code, setCode] = useState<Code | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        label="Show rider handover QR"
        loading={busy}
        disabled={busy}
        onPress={() => {
          setBusy(true);
          setError("");
          void api
            .post<Code>(
              `/v1/journey/staff/tasks/${taskId}/handover-code`,
              {},
              { auth: true },
            )
            .then(setCode)
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      />
      {error ? <Notice error message={error} /> : null}
      <BottomSheet
        visible={!!code}
        title="Ready for your rider"
        onClose={() => setCode(null)}
      >
        {code ? <CodeDisplay code={code} /> : null}
      </BottomSheet>
    </>
  );
}
export function DeliveryCodes({ reference }: { reference: string }) {
  const { customer } = useAuth(),
    { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["delivery-codes", customer?.id, reference],
    queryFn: () =>
      api.get<Code[]>(`/v1/journey/orders/${reference}/delivery-codes`, {
        auth: true,
      }),
    enabled: open && !!customer,
    staleTime: 0,
    retry: false,
  });
  return (
    <Disclosure title="My delivery verification">
      <Text style={{ color: colors.muted, lineHeight: 21 }}>
        Share this code with your rider when the cake arrives. You can still
        confirm receipt and rate the delivery afterwards.
      </Text>
      <Button
        variant="outline"
        label={open ? "Refresh my delivery code" : "Show my delivery code"}
        loading={query.isFetching}
        onPress={() => {
          if (open) void query.refetch();
          else setOpen(true);
        }}
      />
      {query.isError ? (
        <Notice error message={query.error.message} />
      ) : (
        query.data?.map((code) => (
          <CodeDisplay key={code.task_id} code={code} />
        ))
      )}
    </Disclosure>
  );
}
export function TripCodeInput({
  taskId,
  purpose,
  value,
  onChange,
}: {
  taskId: string;
  purpose: "handover" | "delivery";
  value: string;
  onChange: (value: string) => void;
}) {
  const { colors } = useTheme();
  const focused = useScreenActive();
  const [permission, requestPermission] = useCameraPermissions();
  const [open, setOpen] = useState(false),
    [error, setError] = useState("");
  const scanned = useRef(false);
  return (
    <Disclosure
      title={
        purpose === "handover"
          ? "Scan kitchen handover QR"
          : "Customer delivery code"
      }
    >
      <Input
        label={
          purpose === "handover" ? "Handover code" : "Code from the customer"
        }
        value={value}
        onChangeText={(v) =>
          onChange(v.replace(/[^a-z0-9]/gi, "").toUpperCase())
        }
        autoCapitalize="characters"
        maxLength={10}
        placeholder="10-character code"
      />
      <Button
        variant="outline"
        size="sm"
        label="Scan QR instead"
        onPress={() => {
          setError("");
          scanned.current = false;
          setOpen(true);
        }}
      />
      <BottomSheet
        visible={open && focused}
        title="Scan this trip’s QR"
        onClose={() => setOpen(false)}
      >
        {permission?.granted && focused && open ? (
          <CameraView
            facing="back"
            style={{ height: 280, borderRadius: 20, overflow: "hidden" }}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={({ data }) => {
              if (scanned.current) return;
              const prefix = `cakecity:${purpose}:${taskId}:`;
              if (
                !data.startsWith(prefix) ||
                !/^[A-F0-9]{10}$/.test(data.slice(prefix.length))
              ) {
                setError("This QR belongs to another trip or step.");
                return;
              }
              scanned.current = true;
              onChange(data.slice(prefix.length));
              setOpen(false);
            }}
          />
        ) : (
          <>
            <Text style={{ color: colors.muted }}>
              Allow the camera to scan the QR, or enter its code manually.
            </Text>
            <Button
              label="Allow camera"
              onPress={() =>
                void requestPermission().catch(() =>
                  setError(
                    "Camera unavailable. Enter the printed code instead.",
                  ),
                )
              }
            />
          </>
        )}
        {error ? <Notice error message={error} /> : null}
      </BottomSheet>
    </Disclosure>
  );
}

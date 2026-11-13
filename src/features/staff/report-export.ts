import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";
import { api } from "@/api/client";

export async function exportPrivateFile(
  path: string,
  name: string,
  mime: string,
  extension: string,
) {
  const bytes = await api.get<ArrayBuffer>(path, {
    auth: true,
    responseType: "bytes",
    timeoutMs: 45000,
  });
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(
      new Blob([bytes], {
        type: mime,
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${name}.${extension}`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("File sharing is unavailable on this device.");
  const file = new File(Paths.cache, `${name}-${Date.now()}.${extension}`);
  file.write(new Uint8Array(bytes));
  try {
    await Sharing.shareAsync(file.uri, {
      mimeType: mime,
    });
  } finally {
    file.delete();
  }
}

export function exportExcel(path: string, name: string) {
  return exportPrivateFile(
    path,
    name,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xlsx",
  );
}

export async function shareBusinessDocument(path: string) {
  const html = await api.get<string>(path, {
    auth: true,
    responseType: "text",
  });
  if (Platform.OS === "web") {
    const blob = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const anchor = document.createElement("a");
    anchor.href = blob;
    anchor.download = "cake-city-document.html";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(blob), 1000);
    return;
  }
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("Document sharing is unavailable on this device.");
  const pdf = await Print.printToFileAsync({ html });
  try {
    await Sharing.shareAsync(pdf.uri, {
      mimeType: "application/pdf",
      dialogTitle: "Cake City commercial document",
    });
  } finally {
    new File(pdf.uri).delete();
  }
}

import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/api/client";
import { Feedback, Screen } from "@/components/ui/Commerce";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Typography";

export default function InformationPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <AppInformation slug={slug} />;
}

export function AppInformation({ slug }: { slug: string }) {
  const page = useQuery({
    queryKey: ["app-page", slug],
    queryFn: async () =>
      z
        .object({ title: z.string(), body: z.string(), revision: z.string() })
        .parse(await api.get(`/v1/pages/${encodeURIComponent(slug)}`)),
  });
  return (
    <Screen title={page.data?.title || "Information"} back>
      {page.isPending ? (
        <Feedback loading />
      ) : page.isError ? (
        <Feedback error={page.error} onRetry={() => void page.refetch()} />
      ) : (
        <Text style={{ lineHeight: 25, fontSize: 15 }}>{page.data?.body}</Text>
      )}
      <Button
        variant="outline"
        label="Ask Cake City in the app"
        onPress={() => router.push("/requests")}
      />
    </Screen>
  );
}

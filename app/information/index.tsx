import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { z } from "zod";
import { api } from "@/api/client";
import { Feedback, Screen } from "@/components/ui/Commerce";
import { Button } from "@/components/ui/Button";
export default function Information() {
  const pages = useQuery({
    queryKey: ["app-pages"],
    queryFn: async () =>
      z
        .array(z.object({ slug: z.string(), title: z.string() }))
        .parse(await api.get("/v1/pages")),
  });
  return (
    <Screen title="Cake City information" back>
      {pages.isPending ? (
        <Feedback loading />
      ) : pages.isError ? (
        <Feedback error={pages.error} onRetry={() => void pages.refetch()} />
      ) : (
        pages.data?.map((page) => (
          <Button
            key={page.slug}
            variant="outline"
            label={page.title}
            onPress={() =>
              router.push({
                pathname: "/information/[slug]",
                params: { slug: page.slug },
              })
            }
          />
        ))
      )}
    </Screen>
  );
}

import { useQuery } from "@tanstack/react-query";
import { getDataProvider } from "@/services/data/provider";

export type Origin = { code: number; name: string };

export function useOrigins() {
  return useQuery<Origin[]>({
    queryKey: ["origins"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const api = await getDataProvider();
      return api.origins.list();
    },
  });
}

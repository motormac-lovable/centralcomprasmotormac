import { useQuery } from "@tanstack/react-query";
import { getDataProvider } from "@/services/data/provider";

export type Department = { code: number; name: string };

export function useDepartments() {
  return useQuery<Department[]>({
    queryKey: ["departments"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const api = await getDataProvider();
      return api.departments.list();
    },
  });
}

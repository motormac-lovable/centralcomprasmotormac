import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Department = { code: number; name: string };

export function useDepartments() {
  return useQuery<Department[]>({
    queryKey: ["departments"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("code, name")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Department[];
    },
  });
}

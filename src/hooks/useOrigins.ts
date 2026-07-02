import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Origin = { code: number; name: string };

export function useOrigins() {
  return useQuery<Origin[]>({
    queryKey: ["origins"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("origins")
        .select("code, name")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Origin[];
    },
  });
}

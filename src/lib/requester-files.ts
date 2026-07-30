import { supabase } from "@/integrations/supabase/client";
import type { PickedFile } from "@/components/forms/FileUpload";

export type RequesterFile = {
  name: string;
  size: number;
  type: string;
  path: string;
  category?: string;
};

const BUCKET = "solicitacao-anexos";

/** Upload form attachments to the requester bucket and return persisted metadata. */
export async function uploadRequesterFiles(
  kind: string,
  files: PickedFile[],
  category?: string,
): Promise<RequesterFile[]> {
  if (files.length === 0) return [];
  const { data: u } = await supabase.auth.getSession();
  const uid = u.session?.user?.id;
  if (!uid) throw new Error("Sessão expirada. Faça login novamente.");

  const results = await Promise.all(
    files.map(async (f) => {
      const safe = f.name.replace(/[^\w.\-]+/g, "_");
      const path = `${uid}/${kind}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, f.file, {
        contentType: f.type || "application/octet-stream",
        upsert: false,
      });
      if (error) throw new Error(`${f.name}: ${error.message}`);
      return {
        name: f.name,
        size: f.size,
        type: f.type,
        path,
        ...(category ? { category } : {}),
      } as RequesterFile;
    }),
  );
  return results;
}

/** Resolve a short-lived signed URL for a stored requester attachment. */
export async function signRequesterFile(
  path: string,
  expiresIn = 120,
  download: string | boolean = false,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn, download ? { download: download as never } : undefined);
  if (error || !data) return null;
  return data.signedUrl;
}

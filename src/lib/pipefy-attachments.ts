/** Upload do formulário público, preservando nome, MIME e bytes originais. */
export async function enviarAnexoPipefy(blob: Blob, name: string): Promise<string> {
  if (!blob.size) throw new Error(`O anexo ${name} está vazio.`);
  const contentType = blob.type || "application/octet-stream";
  const params = new URLSearchParams({
    objectName: name,
    contentType,
    contentLength: String(blob.size),
  });
  const pre = await fetch(`https://app.pipefy.com/upload_attachments/new?${params}`);
  if (!pre.ok) throw new Error(`O Pipefy recusou o anexo ${name}.`);
  const sig = await pre.json() as { signedUrl?: string; filename?: string };
  if (!sig.signedUrl || !sig.filename) throw new Error(`O Pipefy não retornou o destino do anexo ${name}.`);
  // Nunca vincular ao protocolo um arquivo que perdeu seu nome/extensão.
  if (sig.filename.split("/").pop() !== name) {
    throw new Error(`O Pipefy não preservou o nome do anexo ${name}. Tente novamente.`);
  }
  const put = await fetch(sig.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: await blob.arrayBuffer(),
  });
  if (!put.ok) throw new Error(`Falha ao enviar o anexo ${name} ao Pipefy.`);
  return sig.filename;
}
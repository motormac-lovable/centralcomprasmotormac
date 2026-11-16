import { afterEach, describe, expect, it, vi } from "vitest";
import { enviarAnexoPipefy } from "./pipefy-attachments";

afterEach(() => vi.unstubAllGlobals());

describe("Anexos do formulário público Pipefy", () => {
  it.each(["NF 484229 - FAZENDA TREVISAN (002).pdf", "boleto.pdf"])("preserva nome PDF, MIME e bytes de %s", async (name) => {
    const blob = new Blob(["%PDF-1.4\nconteudo original"], { type: "application/pdf" });
    const path = `uploads/teste/${name}`;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ signedUrl: "https://upload.example.test/anexo", filename: path })))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await enviarAnexoPipefy(blob, name)).toBe(path);
    const request = new URL(fetchMock.mock.calls[0][0]);
    expect(request.searchParams.get("objectName")).toBe(name);
    expect(request.searchParams.get("contentType")).toBe("application/pdf");
    expect(request.searchParams.get("contentLength")).toBe(String(blob.size));
    expect(fetchMock.mock.calls[1][1].headers).toEqual({ "Content-Type": "application/pdf" });
    expect(fetchMock.mock.calls[1][1].body).toEqual(await blob.arrayBuffer());
  });

  it("não envia nem vincula a resposta untitled sem extensão", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ signedUrl: "https://upload.example.test/anexo", filename: "uploads/teste/untitled" })));
    vi.stubGlobal("fetch", fetchMock);
    await expect(enviarAnexoPipefy(new Blob(["%PDF"], { type: "application/pdf" }), "nota.pdf")).rejects.toThrow("não preservou o nome");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
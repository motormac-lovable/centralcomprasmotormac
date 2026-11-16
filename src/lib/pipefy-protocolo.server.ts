import { getFaturamento, INVOICE_BUCKET } from "@/lib/invoice-documents";
import { montarCamposPipefy, PIPEFY_ANEXO_BOLETO_FIELD, PIPEFY_ANEXO_NF_FIELD } from "@/lib/pipefy-payload";
import { getRecebimento } from "@/lib/recebimento";
import { translateError } from "@/lib/error-messages";
import { enviarAnexoPipefy } from "@/lib/pipefy-attachments";

const PIPEFY_PUBLIC_API = "https://app.pipefy.com/public_api";
async function gql(query: string, variables: Record<string, unknown>) {
  const r = await fetch(PIPEFY_PUBLIC_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j.errors) {
    console.error("Falha no Pipefy", r.status, JSON.stringify(j.errors ?? j).slice(0, 800));
    throw new Error(translateError(j.errors?.[0]?.message, `O Pipefy não aceitou o protocolo (código ${r.status}). Tente novamente ou contate o administrador.`));
  }
  return j.data;
}

/** Protocolo no formulário público do Pipefy. Só após o Recebido confirmado. Idempotente. */
export async function executarProtocoloPipefy(admin: any, cardId: string, userId: string, compradorEmail?: string) {
  const data = { card_id: cardId };
  const context = { userId };
    const formId = process.env["PIPEFY_PUBLIC_FORM_ID"] || "Gcg4XrX6";
    if (!formId)
      return { ok: false as const, pendencias: ["Link do formulário público do Pipefy ainda não configurado."] };

    const { data: card } = await admin
      .from("kanban_cards")
      .select("id, status, title, summary, empresa, unidade, requester_email, order_number, numero_pedido_linx, codigo_unico, data, suppliers, buyer_name")
      .eq("id", data.card_id).maybeSingle();
    if (!card) throw new Response("Solicitação não encontrada.", { status: 404 });
    if (card.status !== "pedidos_gerados") return { ok: false as const, pendencias: ["O card precisa estar em Pedidos Gerados."] };
    const d = (card.data ?? {}) as Record<string, any>;
    if (getRecebimento(card.data)?.status !== "confirmado") return { ok: false as const, pendencias: ["O protocolo só é feito após o solicitante confirmar o recebimento."] };
    if (d.protocolo_pipefy?.card_id) return { ok: true as const, protocolo: d.protocolo_pipefy, jaExistia: true };

    const fat = getFaturamento(card.data);
    const pend: string[] = [];
    if (!fat.notas_fiscais?.length) pend.push("Anexe a Nota Fiscal em Documentos de Faturamento.");
    const { data: au } = await admin.auth.admin.getUserById(context.userId);
    let email = compradorEmail || au?.user?.email || "";
    if (!compradorEmail && (d.dados_pagamento as any)?.salvo_por_email) email = (d.dados_pagamento as any).salvo_por_email;
    const { campos, pendencias } = montarCamposPipefy(card as any, email);
    pend.push(...pendencias);
    if (pend.length) return { ok: false as const, pendencias: pend };

    // Anexos: baixa do storage privado e envia pelo upload do formulário público (sem login).
    const enviar = async (path: string, name: string) => {
      const { data: blob, error } = await admin.storage.from(INVOICE_BUCKET).download(path);
      if (error || !blob) throw new Error(`Falha ao ler anexo ${name}`);
      return enviarAnexoPipefy(blob, name);
    };
    try {
      const nfPaths = await Promise.all((fat.notas_fiscais ?? []).map((f) => enviar(f.path, f.name)));
      campos.push({ field_id: PIPEFY_ANEXO_NF_FIELD, field_value: nfPaths });
      if (fat.boletos?.length) {
        const bPaths = await Promise.all(fat.boletos.map((f) => enviar(f.path, f.name)));
        campos.push({ field_id: PIPEFY_ANEXO_BOLETO_FIELD, field_value: bPaths });
      }
      const res = await gql(`mutation($i: SubmitPublicFormInput!){ submitPublicForm(input:$i){ repoItem { id } } }`,
        { i: { formId, filledFields: campos.map((c) => ({ fieldId: c.field_id, fieldValue: c.field_value })) } });
      const res_id = String(res.submitPublicForm?.repoItem?.id ?? "");
      if (!res_id) throw new Error("Pipefy não retornou o número do card");
      const { data: prof } = await admin.from("profiles").select("full_name").eq("id", context.userId).maybeSingle();
      const protocolo = {
        card_id: res_id,
        url: `https://app.pipefy.com/open-cards/${res_id}`,
        protocolado_em: new Date().toISOString(),
        protocolado_por: (prof as any)?.full_name || au?.user?.email || "Comprador",
      };
      const { data: atual } = await admin.from("kanban_cards").select("data").eq("id", card.id).maybeSingle();
      const nextData = { ...((atual?.data as Record<string, unknown>) ?? {}), protocolo_pipefy: protocolo };
      await admin.from("kanban_cards").update({ data: nextData as never }).eq("id", card.id);
      return { ok: true as const, protocolo, jaExistia: false };
    } catch (e) {
      const msg = translateError(e, "Não foi possível enviar o protocolo ao Pipefy. Tente novamente.");
      const { data: atual } = await admin.from("kanban_cards").select("data").eq("id", card.id).maybeSingle();
      const nextData = { ...((atual?.data as Record<string, unknown>) ?? {}), protocolo_pipefy_erro: { mensagem: msg, em: new Date().toISOString() } };
      await admin.from("kanban_cards").update({ data: nextData as never }).eq("id", card.id);
      return { ok: false as const, pendencias: [`Falha no envio ao Pipefy: ${msg}`] };
    }
}

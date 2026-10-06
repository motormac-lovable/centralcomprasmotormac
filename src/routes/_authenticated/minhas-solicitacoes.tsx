import { createFileRoute } from "@tanstack/react-router";
import { RequestsHistoryView } from "@/components/RequestsHistoryView";

export const Route = createFileRoute("/_authenticated/minhas-solicitacoes")({
  head: () => ({
    meta: [
      { title: "Minhas Solicitações — Motormac" },
      { name: "description", content: "Acompanhe o status em tempo real das suas solicitações abertas." },
      { property: "og:title", content: "Minhas Solicitações — Motormac" },
      { property: "og:description", content: "Consulte solicitações, documentos e conversas na Central de Compras Motormac." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RequestsHistoryView,
});

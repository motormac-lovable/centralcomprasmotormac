/**
 * De/Para Central de Compras → formulário Pipefy (protocolo de documentos de pagamento).
 * Módulo puro e browser-safe: usado pela tela de Protocolo e pela server function.
 * Regras extraídas da planilha depara-pipefy-central-compras.xlsx validada pelo usuário.
 */

export type SetorPipefy =
  | "Tecnologia da Informação" | "Marketing" | "DP" | "RH" | "Financeiro" | "Contabilidade"
  | "Controladoria" | "Geradores" | "JCB" | "Peças" | "Engenharia" | "Compras"
  | "Segurança do trabalho" | "Oficina" | "Frota" | "NEST" | "Administrativo";

// Ordem importa quando um código aparece em mais de um setor (ex.: 172/213/222 em JCB e Peças; 182 em JCB e Oficina):
// vale o primeiro setor listado na planilha.
const SETOR_POR_DEPARTAMENTO: [SetorPipefy, number[]][] = [
  ["Tecnologia da Informação", [201]],
  ["Marketing", [186]],
  ["RH", [203]], // DP e RH usam o mesmo departamento 203; RH é o padrão
  ["Financeiro", [199]],
  ["Contabilidade", [207]],
  ["Controladoria", [200]],
  ["Geradores", [39, 82, 62, 72, 53, 36, 83, 84, 103, 153, 106, 85, 50]],
  ["JCB", [171, 173, 172, 197, 174, 213, 182, 221, 194, 222, 177]],
  ["Peças", [86, 41, 209, 158, 240, 167, 160, 159, 252, 260]],
  ["Engenharia", [204, 299]],
  ["Compras", [250]],
  ["Segurança do trabalho", [205]],
  ["Oficina", [2, 15, 42, 5, 142]],
  ["NEST", [198]],
  ["Administrativo", [46, 6, 90]],
];

export function setorPipefy(departamentoCodigo: string | number | null | undefined): SetorPipefy | null {
  const n = Number(String(departamentoCodigo ?? "").trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  for (const [setor, codigos] of SETOR_POR_DEPARTAMENTO) if (codigos.includes(n)) return setor;
  return null;
}

/** Empresa Pipefy a partir da empresa + unidade da solicitação. */
export const EMPRESAS_PIPEFY: { opcao: string; cnpj: string; empresa: string; unidade?: string }[] = [
  { opcao: "2.1 MATRIZ", cnpj: "90.627.332/0001-93", empresa: "DMMC", unidade: "Porto Alegre" },
  { opcao: "2.2 SÃO JOSÉ/SC", cnpj: "90.627.332/0006-06", empresa: "DMMC", unidade: "São José" },
  { opcao: "2.3 COLOMBO/PR", cnpj: "90.627.332/0005-17", empresa: "DMMC", unidade: "Colombo" },
  { opcao: "2.4 SÃO GABRIEL/RS", cnpj: "90.627.332/0007-89", empresa: "DMMC", unidade: "São Gabriel" },
  { opcao: "2.5 MARINGA/PR", cnpj: "90.627.332/0008-60", empresa: "DMMC", unidade: "Maringá" },
  { opcao: "2.6 CHAPECÓ/SC", cnpj: "90.627.332/0009-40", empresa: "DMMC", unidade: "Chapecó" },
  { opcao: "2.7 PASSO FUNDO/RS", cnpj: "90.627.332/0011-65", empresa: "DMMC", unidade: "Passo Fundo" },
  { opcao: "19.1 SV PARTS POA/RS", cnpj: "51.292.751/0001-60", empresa: "SV Parts", unidade: "Porto Alegre" },
  { opcao: "19.2 - SV PARTS SJ/SC", cnpj: "51.292.751/0002-40", empresa: "SV Parts", unidade: "São José" },
  { opcao: "19.3 - SV PARTS COL/PR", cnpj: "51.292.751/0003-21", empresa: "SV Parts", unidade: "Colombo" },
  { opcao: "19.4 - SV PARTS PF/RS", cnpj: "51.292.751/0006-74", empresa: "SV Parts", unidade: "Passo Fundo" },
  { opcao: "19.5 - SV PARTS MG/PR", cnpj: "51.292.751/0005-93", empresa: "SV Parts", unidade: "Maringá" },
  { opcao: "19.6 - SV PARTS CHAP/SC", cnpj: "51.292.751/0004-02", empresa: "SV Parts", unidade: "Chapecó" },
  { opcao: "121 NEST POA", cnpj: "35.217.337/0001-30", empresa: "NEST", unidade: "Porto Alegre" },
  { opcao: "122 NEST SJO", cnpj: "35.217.337/0002-10", empresa: "NEST", unidade: "São José" },
  { opcao: "MALB", cnpj: "13.856.334/0001-03", empresa: "MALB" },
];

export function empresaPipefy(empresa: string | null | undefined, unidade: string | null | undefined) {
  const e = (empresa ?? "").trim().toLowerCase();
  const u = (unidade ?? "").trim().toLowerCase();
  if (!e) return null;
  const doGrupo = EMPRESAS_PIPEFY.filter((x) => x.empresa.toLowerCase() === e);
  return doGrupo.find((x) => !x.unidade || x.unidade.toLowerCase() === u) ?? null;
}

const CC_PIPEFY: [string, string[]][] = [
  ["Máquinas Chicago", ["2158", "2358", "2658", "2258"]],
  ["Peças Chigado", ["19503"]],
  ["Peças Cummins", ["2203", "2103", "2603", "2303", "2403", "2503", "2703", "19103", "19203", "19303", "19403"]],
  ["Peças JCB", ["2142", "2742", "2242", "2642"]],
  ["Oficina Cummins", ["2604", "2504", "2704", "2507", "2404", "2607"]],
  ["Oficina JCB", ["2143", "2743", "2643", "2243"]],
  ["Segurança do trabalho", ["2124", "2224", "2324", "2624", "2524", "2724", "2424", "19424", "19524", "19224", "19324", "19624"]],
  ["Geradores", ["2108", "2308", "2208", "2218", "12208"]],
  ["Motores", ["2202", "2102", "12201", "2302", "12101"]],
  ["SV Parts - 1900", ["1900", "19101"]],
  ["2122 - Tecnologia da Informação", ["2122"]],
];
export const CC_OUTRO = "Outro, qual?";

/** Centro de custo Pipefy. NEST (DMMC) nunca é usado; 700/701 só com o CNPJ NEST correspondente. */
export function centroCustoPipefy(codigo: string | null | undefined, descricao: string | null | undefined, cnpj?: string | null) {
  const c = String(codigo ?? "").trim();
  const d = String(descricao ?? "").trim();
  const completo = c && d ? `${c} - ${d}` : c || d;
  if (c === "700" && cnpj === "35.217.337/0001-30") return { centro_de_custo: "201 NEST POA", outro_centro_de_custo: null };
  if (c === "701" && cnpj === "35.217.337/0002-10") return { centro_de_custo: "202 NEST SJO", outro_centro_de_custo: null };
  for (const [opcao, codigos] of CC_PIPEFY) if (codigos.includes(c)) return { centro_de_custo: opcao, outro_centro_de_custo: null };
  return { centro_de_custo: CC_OUTRO, outro_centro_de_custo: completo || null };
}

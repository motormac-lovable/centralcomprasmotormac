/** Dados fiscais das filiais emissoras do Pedido de Compra (base EMPRESAS.xlsx). */
export type FilialFiscal = {
  empresa: "DMMC" | "MALB" | "MEI" | "SV PARTS";
  unidade: string;
  razaoSocial: string;
  cnpj: string;
  ie: string;
  endereco: string;
};

const DMMC = "DISTRIBUIDORA MERIDIONAL DE MOTORES CUMMINS LTDA";
const MALB = "MOTORMAC ADMINISTRACAO E LOCACAO DE BENS LTDA";
const NEST = "NEST INOVACAO EM ENERGIA LTDA";
const SVP = "SV PARTS COMERCIO DE PECAS LTDA";

export const FILIAIS_FISCAIS: FilialFiscal[] = [
  { empresa: "DMMC", unidade: "Porto Alegre", razaoSocial: DMMC, cnpj: "90.627.332/0001-93", ie: "096/0992405", endereco: "Av. Assis Brasil, 11000 - Sarandi, Porto Alegre/RS" },
  { empresa: "DMMC", unidade: "São José", razaoSocial: DMMC, cnpj: "90.627.332/0006-06", ie: "254/944159", endereco: "Rua Vidal Procopio Lohn, 160, São José/SC" },
  { empresa: "DMMC", unidade: "Colombo", razaoSocial: DMMC, cnpj: "90.627.332/0005-17", ie: "10303447-70", endereco: "Rua Abel Scuissiato, 3020, Colombo/PR" },
  { empresa: "DMMC", unidade: "São Gabriel", razaoSocial: DMMC, cnpj: "90.627.332/0007-89", ie: "120/0114881", endereco: "Av. Antonio Trilha, 977, São Gabriel/RS" },
  { empresa: "DMMC", unidade: "Maringá", razaoSocial: DMMC, cnpj: "90.627.332/0008-60", ie: "90666361-91", endereco: "Av. Pref Synclair Sambatti, 5004, Maringá/PR" },
  { empresa: "DMMC", unidade: "Chapecó", razaoSocial: DMMC, cnpj: "90.627.332/0009-40", ie: "257350217", endereco: "Rua Valdemiro Belinski, 655, Chapecó/SC" },
  { empresa: "DMMC", unidade: "Passo Fundo", razaoSocial: DMMC, cnpj: "90.627.332/0011-65", ie: "091/0414050", endereco: "Rua Aloncio de Camargo, 1358, Passo Fundo/RS" },
  { empresa: "MALB", unidade: "Porto Alegre", razaoSocial: MALB, cnpj: "13.856.334/0001-03", ie: "096/3433636", endereco: "AV FERNANDO FERRARI, 6299, Porto Alegre/RS" },
  { empresa: "MALB", unidade: "São José", razaoSocial: MALB, cnpj: "13.856.334/0002-94", ie: "Isento", endereco: "ROD BR 101 KM 212, São José/SC" },
  { empresa: "MALB", unidade: "Colombo", razaoSocial: MALB, cnpj: "13.856.334/0003-75", ie: "Isento", endereco: "Rua Abel Scuissiato, 3020, Colombo/PR" },
  { empresa: "MEI", unidade: "Porto Alegre", razaoSocial: NEST, cnpj: "35.217.337/0001-30", ie: "096/3792318", endereco: "Av. Assis Brasil, 11000, Porto Alegre/RS" },
  { empresa: "MEI", unidade: "São José", razaoSocial: NEST, cnpj: "35.217.337/0002-10", ie: "260785890", endereco: "Rua Vidal Procopio Lohn, 160, São José/SC" },
  { empresa: "SV PARTS", unidade: "Porto Alegre", razaoSocial: SVP, cnpj: "51.292.751/0001-60", ie: "096/3969412", endereco: "Av. Assis Brasil, 11000, Porto Alegre/RS" },
  { empresa: "SV PARTS", unidade: "São José", razaoSocial: SVP, cnpj: "51.292.751/0002-40", ie: "262499835", endereco: "Rod BR 101 Km 210, São José/SC" },
  { empresa: "SV PARTS", unidade: "Colombo", razaoSocial: SVP, cnpj: "51.292.751/0003-21", ie: "91024120-68", endereco: "Rua Abel Scuissiato, 3020, Colombo/PR" },
];

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function empresaCanonica(empresa: string): FilialFiscal["empresa"] | null {
  const e = norm(empresa);
  if (!e) return null;
  if (e.startsWith("dmmc") || e.includes("cummins")) return "DMMC";
  if (e.startsWith("malb") || e.includes("locacao")) return "MALB";
  if (e.startsWith("mei") || e.includes("nest")) return "MEI";
  if (e.replace(/\s/g, "").startsWith("svparts")) return "SV PARTS";
  return null;
}

/** Resolve a filial pela combinação Empresa + Unidade do card (aceita variações como "Chapeco" ou "Passo Fundo/RS"). */
export function resolverFilialFiscal(empresa?: string | null, unidade?: string | null): FilialFiscal | null {
  const emp = empresaCanonica(empresa ?? "");
  const uni = norm(unidade ?? "");
  if (!emp || !uni) return null;
  return FILIAIS_FISCAIS.find((f) => f.empresa === emp && uni.startsWith(norm(f.unidade))) ?? null;
}

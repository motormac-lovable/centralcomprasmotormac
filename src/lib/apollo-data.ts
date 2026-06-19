// Dados Apollo (placeholders). Substitua estas listas pelos dados reais
// dos arquivos "LISTA DEPARTAMENTOS APOLLO", "LISTA ORIGENS APOLLO" e
// "LISTA MATERIAIS APOLLO" quando estiverem disponíveis.

export const DEPARTAMENTOS_APOLLO: string[] = [
  "Suprimentos",
  "Manutenção",
  "Oficina",
  "Logística",
  "Administrativo",
  "Comercial",
  "TI",
  "RH",
];

export const ORIGENS_APOLLO: string[] = [
  "Estoque",
  "Compra Direta",
  "Importação",
  "Consignação",
  "Transferência",
];

export type MaterialApollo = { codigo: string; descricao: string };

export const MATERIAIS_APOLLO: MaterialApollo[] = [
  { codigo: "102030", descricao: "Óleo Diesel" },
  { codigo: "102031", descricao: "Óleo Lubrificante 15W40" },
  { codigo: "102032", descricao: "Filtro de Combustível" },
  { codigo: "102033", descricao: "Filtro de Óleo" },
  { codigo: "102034", descricao: "Filtro de Ar" },
  { codigo: "200110", descricao: "Graxa Industrial" },
  { codigo: "200111", descricao: "Estopa Branca" },
  { codigo: "300220", descricao: "Parafuso Sextavado M10" },
  { codigo: "300221", descricao: "Porca Sextavada M10" },
  { codigo: "400330", descricao: "Serviço de Solda" },
  { codigo: "400331", descricao: "Serviço de Usinagem" },
];

/**
 * Extracción y comparación de cifras.
 *
 * El problema de fondo: "1.234" es mil doscientos treinta y cuatro en Chile
 * y uno coma dos en Estados Unidos. En vez de adivinar el formato, cada
 * cifra se guarda con TODAS sus lecturas posibles y dos cifras calzan si
 * comparten al menos una. Es permisivo a propósito con la ambigüedad real y
 * estricto con todo lo demás: "12,5" nunca calza con "15,2".
 */

export type TipoCifra = "porcentaje" | "monto" | "año" | "numero";

export interface Cifra {
  /** El texto tal como aparece, por ejemplo "USD 3,2 millones". */
  texto: string;
  tipo: TipoCifra;
  moneda?: string;
  /** Todas las lecturas numéricas plausibles, ya multiplicadas. */
  valores: number[];
}

const MULTIPLICADORES: Record<string, number> = {
  mil: 1e3,
  k: 1e3,
  "mil millones": 1e9,
  millón: 1e6,
  millon: 1e6,
  millones: 1e6,
  million: 1e6,
  millions: 1e6,
  mm: 1e6,
  billion: 1e9,
  billions: 1e9,
  billón: 1e12,
  billones: 1e12,
};

const RE_CIFRA = new RegExp(
  String.raw`(?<![\p{L}\d.,])` +
    String.raw`(?<moneda>US\$|USD|CLP|EUR|UF|\$|€)?\s?` +
    String.raw`(?<num>\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)` +
    String.raw`(?![\d])` +
    String.raw`(?:\s?(?<pct>%|por\s?ciento|percent))?` +
    String.raw`(?:\s(?<mult>mil millones|millones|millón|millon|millions|million|billones|billón|billions|billion|mil|MM|k)(?![\p{L}]))?` +
    String.raw`(?:\s(?<moneda2>USD|CLP|EUR|dólares|dolares|pesos))?`,
  "giu",
);

/** Lecturas posibles de un número escrito con separadores. */
export function lecturas(num: string): number[] {
  const puntos = (num.match(/\./g) ?? []).length;
  const comas = (num.match(/,/g) ?? []).length;
  if (puntos === 0 && comas === 0) return [Number(num)];
  if (puntos > 0 && comas > 0) {
    // El último separador es el decimal.
    const decimal = num.lastIndexOf(".") > num.lastIndexOf(",") ? "." : ",";
    return [aNumero(num, decimal)];
  }
  const sep = puntos > 0 ? "." : ",";
  const veces = puntos + comas;
  if (veces > 1) return [Number(num.split(sep).join(""))];
  const [, despues = ""] = num.split(sep);
  const comoDecimal = aNumero(num, sep);
  if (despues.length === 3) return unicos([Number(num.replace(sep, "")), comoDecimal]);
  return [comoDecimal];
}

function aNumero(num: string, decimal: "." | ","): number {
  const miles = decimal === "." ? "," : ".";
  return Number(num.split(miles).join("").replace(decimal, "."));
}

function unicos(xs: number[]): number[] {
  return [...new Set(xs)];
}

export function extraerCifras(texto: string): Cifra[] {
  const cifras: Cifra[] = [];
  for (const m of texto.matchAll(RE_CIFRA)) {
    const g = m.groups ?? {};
    const num = g.num;
    if (num === undefined) continue;
    const base = lecturas(num);
    const mult = g.mult ? MULTIPLICADORES[g.mult.toLowerCase()] : undefined;
    const valores = mult === undefined ? base : unicos([...base, ...base.map((v) => redondear(v * mult))]);
    const moneda = normalizarMoneda(g.moneda ?? g.moneda2);
    let tipo: TipoCifra = "numero";
    if (g.pct) tipo = "porcentaje";
    else if (moneda) tipo = "monto";
    else if (/^(1[89]|20|21)\d{2}$/.test(num) && !mult) tipo = "año";
    const cifra: Cifra = { texto: m[0].trim(), tipo, valores };
    if (moneda) cifra.moneda = moneda;
    cifras.push(cifra);
  }
  return cifras;
}

function normalizarMoneda(m: string | undefined): string | undefined {
  if (!m) return undefined;
  const t = m.toLowerCase();
  if (t === "us$" || t === "usd" || t.startsWith("d")) return "USD";
  if (t === "clp" || t === "pesos") return "CLP";
  if (t === "eur" || t === "€") return "EUR";
  if (t === "uf") return "UF";
  return "$"; // "$" solo es ambiguo: peso o dólar.
}

function redondear(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

/** Dos cifras calzan si comparten alguna lectura numérica. */
export function calzan(a: Cifra, b: Cifra): boolean {
  return a.valores.some((x) => b.valores.some((y) => Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x))));
}

/** Busca la cifra entre las de un texto. */
export function cifraPresente(cifra: Cifra, texto: string): boolean {
  return extraerCifras(texto).some((otra) => calzan(cifra, otra));
}

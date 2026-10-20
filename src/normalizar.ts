/**
 * Normalización de texto para comparar citas contra fuentes.
 *
 * La idea es borrar diferencias tipográficas que un modelo de lenguaje
 * introduce sin cambiar el sentido (comillas curvas, guiones largos,
 * espacios duplicados, saltos de línea de un PDF) y NADA más. Cambiar una
 * palabra o una cifra tiene que seguir rompiendo la coincidencia.
 */

export interface OpcionesNormalizacion {
  /** Ignorar mayúsculas y minúsculas. Por omisión, true. */
  ignorarMayusculas?: boolean;
  /** Ignorar tildes y diacríticos (á = a, ñ = n). Por omisión, false. */
  ignorarTildes?: boolean;
}

const COMILLAS_DOBLES = /[\u201C\u201D\u201E\u201F\u00AB\u00BB\u2033]/g;
const COMILLAS_SIMPLES = /[\u2018\u2019\u201A\u201B\u2032`\u00B4]/g;
const GUIONES = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g;
const ESPACIOS = /[\s\u00A0\u2007\u202F]+/g;
const INVISIBLES = /[\u200B\u200C\u200D\u2060\uFEFF\u00AD]/g;
const ELIPSIS = /\u2026/g;

export function normalizar(texto: string, opciones: OpcionesNormalizacion = {}): string {
  const { ignorarMayusculas = true, ignorarTildes = false } = opciones;
  let t = texto.normalize("NFC")
    .replace(INVISIBLES, "")
    .replace(COMILLAS_DOBLES, '"')
    .replace(COMILLAS_SIMPLES, "'")
    .replace(GUIONES, "-")
    .replace(ELIPSIS, "...")
    // Un PDF corta palabras con guion al final de línea: "tecno-\nlogía".
    .replace(/(\p{L})-\s*\n\s*(\p{L})/gu, "$1$2")
    .replace(ESPACIOS, " ")
    .trim();
  if (ignorarTildes) t = t.normalize("NFD").replace(/\p{M}/gu, "").normalize("NFC");
  if (ignorarMayusculas) t = t.toLocaleLowerCase("es");
  return t;
}

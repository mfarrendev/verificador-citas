import { normalizar, type OpcionesNormalizacion } from "./normalizar.js";

export interface ResultadoCita {
  /** La cita aparece literalmente (tras normalizar) en la fuente. */
  encontrada: boolean;
  /** Fragmento de la fuente (normalizada) más parecido a la cita. */
  fragmentoCercano?: string;
  /** Distancia de edición entre la cita y ese fragmento, en caracteres. */
  distancia?: number;
  /** 1 = idéntico; 0 = nada en común. */
  similitud?: number;
}

/**
 * Tope de celdas para la búsqueda aproximada (cita x fuente). Por encima,
 * la fuente se recorta a una ventana alrededor del mejor ancla de palabras.
 * Con 2e7 celdas la búsqueda tarda menos de un segundo en Node 24.
 */
const TOPE_CELDAS = 20_000_000;

export function buscarCita(
  cita: string,
  fuente: string,
  opciones: OpcionesNormalizacion = {},
): ResultadoCita {
  const c = normalizar(cita, opciones);
  const f = normalizar(fuente, opciones);
  if (c.length === 0) return { encontrada: false };
  if (f.includes(c)) return { encontrada: true };

  let base = 0;
  let texto = f;
  if (c.length * f.length > TOPE_CELDAS) {
    const ventana = Math.max(c.length * 3, Math.floor(TOPE_CELDAS / c.length));
    base = anclaPorPalabras(c, f, ventana);
    texto = f.slice(base, base + ventana);
  }
  const { inicio, fin, distancia } = subcadenaMasCercana(c, texto);
  const fragmento = texto.slice(inicio, fin);
  return {
    encontrada: false,
    fragmentoCercano: fragmento,
    distancia,
    similitud: Math.max(0, 1 - distancia / Math.max(c.length, 1)),
  };
}

/**
 * Distancia de edición de `patron` contra la mejor subcadena de `texto`
 * (algoritmo de Sellers: el inicio en el texto es gratis). Guarda en cada
 * celda dónde empezó el alineamiento para devolver el fragmento exacto.
 */
export function subcadenaMasCercana(
  patron: string,
  texto: string,
): { inicio: number; fin: number; distancia: number } {
  const m = patron.length;
  const n = texto.length;
  let prev = new Int32Array(m + 1);
  let prevIni = new Int32Array(m + 1);
  let cur = new Int32Array(m + 1);
  let curIni = new Int32Array(m + 1);
  for (let i = 0; i <= m; i++) prev[i] = i;

  let mejor = m;
  let mejorFin = 0;
  let mejorIni = 0;
  for (let j = 1; j <= n; j++) {
    cur[0] = 0;
    curIni[0] = j;
    const tj = texto.charCodeAt(j - 1);
    for (let i = 1; i <= m; i++) {
      const costo = patron.charCodeAt(i - 1) === tj ? 0 : 1;
      let v = prev[i - 1]! + costo;
      let ini = i - 1 === 0 ? j - 1 : prevIni[i - 1]!;
      const arriba = cur[i - 1]! + 1; // borrar del patrón
      if (arriba < v) { v = arriba; ini = curIni[i - 1]!; }
      const izq = prev[i]! + 1; // insertar del texto
      if (izq < v) { v = izq; ini = i === 0 ? j : prevIni[i]!; }
      cur[i] = v;
      curIni[i] = ini;
    }
    if (cur[m]! < mejor) {
      mejor = cur[m]!;
      mejorFin = j;
      mejorIni = curIni[m]!;
    }
    [prev, cur] = [cur, prev];
    [prevIni, curIni] = [curIni, prevIni];
  }
  return { inicio: mejorIni, fin: mejorFin, distancia: mejor };
}

/** Posición de inicio de la ventana que comparte más palabras con la cita. */
function anclaPorPalabras(cita: string, fuente: string, ventana: number): number {
  const palabras = new Set(cita.split(" ").filter((p) => p.length > 3));
  let mejor = 0;
  let mejorPos = 0;
  const paso = Math.max(1, Math.floor(ventana / 4));
  for (let pos = 0; pos < fuente.length; pos += paso) {
    const trozo = fuente.slice(pos, pos + ventana).split(" ");
    let n = 0;
    for (const p of trozo) if (palabras.has(p)) n++;
    if (n > mejor) { mejor = n; mejorPos = pos; }
  }
  return mejorPos;
}

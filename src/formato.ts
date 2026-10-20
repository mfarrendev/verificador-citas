import type { Hallazgo, Informe } from "./verificar.js";

const ETIQUETA: Record<Informe["veredicto"], string> = {
  aprobado: "APROBADO",
  "aprobado-con-avisos": "APROBADO CON AVISOS",
  rechazado: "RECHAZADO",
};

/** Salida legible para la terminal, sin colores para que sirva en un log. */
export function formatearInforme(inf: Informe, titulo?: string): string {
  const l: string[] = [];
  if (titulo) l.push(titulo, "");
  for (const h of inf.generales) l.push(linea(h));
  for (const a of inf.afirmaciones) {
    l.push(`[${a.aprobada ? "ok" : "NO"}] ${a.id}`);
    for (const h of a.hallazgos) l.push(`     ${linea(h)}`);
    for (const h of a.hallazgos) {
      if (h.detalle?.fragmentoCercano !== undefined) {
        l.push(`       más cercano en la fuente: "${h.detalle.fragmentoCercano}"`);
        l.push(`       distancia ${h.detalle.distancia}, similitud ${h.detalle.similitud}`);
      }
    }
  }
  const r = inf.resumen;
  l.push("");
  l.push(`${ETIQUETA[inf.veredicto]}: ${r.aprobadas} de ${r.afirmaciones} afirmaciones aprobadas, ${r.bloqueantes} bloqueantes, ${r.avisos} avisos`);
  return l.join("\n");
}

function linea(h: Hallazgo): string {
  return `${h.severidad === "bloqueante" ? "bloqueante" : "aviso     "}  ${h.codigo}: ${h.mensaje}`;
}

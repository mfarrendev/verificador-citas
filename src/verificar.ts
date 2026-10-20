import { buscarCita } from "./citas.js";
import { cifraPresente, extraerCifras } from "./cifras.js";
import type { Afirmacion, Documento, ReferenciaFuente } from "./documento.js";
import { verificarLink, type OpcionesLinks, type ResultadoLink } from "./links.js";
import type { OpcionesNormalizacion } from "./normalizar.js";

export type Severidad = "bloqueante" | "aviso";

export type CodigoHallazgo =
  | "documento-vacio"
  | "texto-vacio"
  | "sin-cita"
  | "sin-fuente"
  | "fuente-desconocida"
  | "cita-sin-texto-de-fuente"
  | "cita-no-encontrada"
  | "cifra-sin-respaldo"
  | "cifra-fuera-de-cita"
  | "link-caido"
  | "link-no-verificable";

export interface Hallazgo {
  codigo: CodigoHallazgo;
  severidad: Severidad;
  mensaje: string;
  /** Datos para quien revise: fragmento cercano, URL, cifra. */
  detalle?: Record<string, string | number>;
}

export interface ResultadoAfirmacion {
  id: string;
  aprobada: boolean;
  hallazgos: Hallazgo[];
}

export type Veredicto = "aprobado" | "aprobado-con-avisos" | "rechazado";

export interface Informe {
  veredicto: Veredicto;
  resumen: { afirmaciones: number; aprobadas: number; bloqueantes: number; avisos: number };
  afirmaciones: ResultadoAfirmacion[];
  /** Hallazgos que no son de una afirmación (documento vacío). */
  generales: Hallazgo[];
}

export interface OpcionesVerificacion extends OpcionesNormalizacion {
  /** Textos de las fuentes por identificador (nombre de archivo, con o sin extensión, o URL). */
  fuentes: Record<string, string>;
  /** Consultar los links. Si es false, cada URL queda como aviso "no se consultó". */
  verificarLinks?: boolean;
  links?: OpcionesLinks;
}

const SEVERIDAD: Record<CodigoHallazgo, Severidad> = {
  "documento-vacio": "bloqueante",
  "texto-vacio": "bloqueante",
  "sin-cita": "bloqueante",
  "sin-fuente": "bloqueante",
  "fuente-desconocida": "bloqueante",
  "cita-sin-texto-de-fuente": "bloqueante",
  "cita-no-encontrada": "bloqueante",
  "cifra-sin-respaldo": "bloqueante",
  "cifra-fuera-de-cita": "aviso",
  "link-caido": "bloqueante",
  "link-no-verificable": "aviso",
};

function hallazgo(codigo: CodigoHallazgo, mensaje: string, detalle?: Hallazgo["detalle"]): Hallazgo {
  const h: Hallazgo = { codigo, severidad: SEVERIDAD[codigo], mensaje };
  if (detalle) h.detalle = detalle;
  return h;
}

/** Busca el texto de una fuente por nombre exacto o sin extensión. */
function textoDe(ref: ReferenciaFuente, fuentes: Record<string, string>): string | undefined {
  for (const clave of [ref.archivo, ref.url]) {
    if (!clave) continue;
    if (clave in fuentes) return fuentes[clave];
    const sinExt = clave.replace(/\.[^./]+$/, "");
    for (const [k, v] of Object.entries(fuentes)) {
      if (k.replace(/\.[^./]+$/, "") === sinExt) return v;
    }
  }
  return undefined;
}

export async function verificarDocumento(doc: Documento, opciones: OpcionesVerificacion): Promise<Informe> {
  const generales: Hallazgo[] = [];
  if (doc.afirmaciones.length === 0) {
    generales.push(hallazgo("documento-vacio", "el documento no trae afirmaciones: no hay nada que aprobar"));
  }

  // Cada URL se consulta una sola vez aunque la citen varias afirmaciones.
  const cacheLinks = new Map<string, Promise<ResultadoLink>>();
  const consultar = (url: string) => {
    let p = cacheLinks.get(url);
    if (!p) {
      p = verificarLink(url, opciones.links);
      cacheLinks.set(url, p);
    }
    return p;
  };

  const afirmaciones: ResultadoAfirmacion[] = [];
  for (const af of doc.afirmaciones) {
    const hallazgos = await verificarAfirmacion(af, opciones, consultar);
    afirmaciones.push({ id: af.id, aprobada: !hallazgos.some((h) => h.severidad === "bloqueante"), hallazgos });
  }

  const todos = [...generales, ...afirmaciones.flatMap((a) => a.hallazgos)];
  const bloqueantes = todos.filter((h) => h.severidad === "bloqueante").length;
  const avisos = todos.length - bloqueantes;
  const veredicto: Veredicto = bloqueantes > 0 ? "rechazado" : avisos > 0 ? "aprobado-con-avisos" : "aprobado";
  return {
    veredicto,
    resumen: {
      afirmaciones: afirmaciones.length,
      aprobadas: afirmaciones.filter((a) => a.aprobada).length,
      bloqueantes,
      avisos,
    },
    afirmaciones,
    generales,
  };
}

async function verificarAfirmacion(
  af: Afirmacion,
  opciones: OpcionesVerificacion,
  consultar: (url: string) => Promise<ResultadoLink>,
): Promise<Hallazgo[]> {
  const h: Hallazgo[] = [];
  const refs = af.fuentes ?? [];
  const cita = af.cita?.trim() ?? "";

  if (af.texto.trim() === "") h.push(hallazgo("texto-vacio", "la afirmación no tiene texto"));
  if (cita === "") h.push(hallazgo("sin-cita", "la afirmación no trae cita textual"));
  if (refs.length === 0) h.push(hallazgo("sin-fuente", "la afirmación no declara ninguna fuente"));

  // Textos disponibles de las fuentes declaradas.
  const textos: string[] = [];
  for (const ref of refs) {
    const t = textoDe(ref, opciones.fuentes);
    if (t !== undefined) textos.push(t);
    else if (ref.archivo) {
      h.push(hallazgo("fuente-desconocida", `no hay un archivo de fuente llamado "${ref.archivo}"`, { archivo: ref.archivo }));
    }
  }

  // Links.
  for (const ref of refs) {
    if (!ref.url) continue;
    if (opciones.verificarLinks === false) {
      h.push(hallazgo("link-no-verificable", "no se consultó el link (verificación de red desactivada)", { url: ref.url }));
      continue;
    }
    const r = await consultar(ref.url);
    if (r.estado === "link-caido") h.push(hallazgo("link-caido", `el link no existe: ${r.motivo}`, { url: ref.url }));
    if (r.estado === "link-no-verificable") h.push(hallazgo("link-no-verificable", `no se pudo comprobar el link: ${r.motivo}`, { url: ref.url }));
  }

  // Cita literal. Solo una cita encontrada sirve después para respaldar
  // cifras: una cita inventada no puede respaldar sus propias cifras.
  let citaVerificada = false;
  if (cita !== "" && refs.length > 0) {
    if (textos.length === 0) {
      h.push(hallazgo("cita-sin-texto-de-fuente", "ninguna fuente declarada tiene texto local contra el cual comparar la cita"));
    } else {
      const resultados = textos.map((t) => buscarCita(cita, t, opciones));
      citaVerificada = resultados.some((r) => r.encontrada);
      if (!citaVerificada) {
        const mejor = resultados.reduce((a, b) => ((b.similitud ?? 0) > (a.similitud ?? 0) ? b : a));
        const detalle: Record<string, string | number> = {};
        if (mejor.fragmentoCercano !== undefined) detalle.fragmentoCercano = mejor.fragmentoCercano;
        if (mejor.distancia !== undefined) detalle.distancia = mejor.distancia;
        if (mejor.similitud !== undefined) detalle.similitud = Math.round(mejor.similitud * 100) / 100;
        h.push(hallazgo("cita-no-encontrada", "la cita no aparece literalmente en ninguna de sus fuentes", detalle));
      }
    }
  }

  // Cifras del texto de la afirmación.
  for (const cifra of extraerCifras(af.texto)) {
    if (citaVerificada && cifraPresente(cifra, cita)) continue;
    if (textos.some((t) => cifraPresente(cifra, t))) {
      h.push(hallazgo("cifra-fuera-de-cita", `la cifra "${cifra.texto}" está en la fuente pero no en la cita`, { cifra: cifra.texto }));
    } else {
      h.push(hallazgo("cifra-sin-respaldo", `la cifra "${cifra.texto}" no aparece ni en la cita ni en la fuente`, { cifra: cifra.texto }));
    }
  }
  return h;
}

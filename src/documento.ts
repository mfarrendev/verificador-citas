/**
 * Forma del documento de entrada y su validación. La validación es manual
 * para no traer una dependencia de esquemas por cuatro campos.
 */

export interface ReferenciaFuente {
  /** Identificador de un archivo de la carpeta de fuentes (con o sin extensión). */
  archivo?: string;
  /** URL de la fuente. Se verifica que el link esté vivo. */
  url?: string;
}

export interface Afirmacion {
  id: string;
  texto: string;
  cita?: string;
  fuentes?: ReferenciaFuente[];
}

export interface Documento {
  titulo?: string;
  afirmaciones: Afirmacion[];
}

export class ErrorDocumento extends Error {
  constructor(public readonly problemas: string[]) {
    super(`documento inválido:\n- ${problemas.join("\n- ")}`);
    this.name = "ErrorDocumento";
  }
}

const esUrl = (s: string) => /^https?:\/\//i.test(s);

/**
 * Acepta `fuentes` como lista de strings (una URL o el nombre de un
 * archivo) o de objetos `{ archivo, url }`, y una sola fuente como `fuente`.
 */
export function leerDocumento(datos: unknown): Documento {
  const problemas: string[] = [];
  if (typeof datos !== "object" || datos === null || Array.isArray(datos)) {
    throw new ErrorDocumento(["la raíz debe ser un objeto JSON"]);
  }
  const raiz = datos as Record<string, unknown>;
  if (!Array.isArray(raiz.afirmaciones)) {
    throw new ErrorDocumento(["falta la lista `afirmaciones`"]);
  }
  const afirmaciones: Afirmacion[] = [];
  const ids = new Set<string>();
  raiz.afirmaciones.forEach((a: unknown, i) => {
    const donde = `afirmaciones[${i}]`;
    if (typeof a !== "object" || a === null) {
      problemas.push(`${donde} no es un objeto`);
      return;
    }
    const o = a as Record<string, unknown>;
    const id = typeof o.id === "string" || typeof o.id === "number" ? String(o.id) : String(i + 1);
    if (ids.has(id)) problemas.push(`${donde}: id repetido "${id}"`);
    ids.add(id);
    if (typeof o.texto !== "string") problemas.push(`${donde}: \`texto\` debe ser texto`);
    if (o.cita !== undefined && o.cita !== null && typeof o.cita !== "string") problemas.push(`${donde}: \`cita\` debe ser texto`);

    const crudas: unknown[] = Array.isArray(o.fuentes) ? o.fuentes : o.fuente !== undefined ? [o.fuente] : [];
    const fuentes: ReferenciaFuente[] = [];
    for (const f of crudas) {
      if (typeof f === "string") {
        fuentes.push(esUrl(f) ? { url: f } : { archivo: f });
      } else if (typeof f === "object" && f !== null) {
        const r = f as Record<string, unknown>;
        const ref: ReferenciaFuente = {};
        if (typeof r.archivo === "string") ref.archivo = r.archivo;
        if (typeof r.url === "string") ref.url = r.url;
        if (!ref.archivo && !ref.url) problemas.push(`${donde}: una fuente no tiene \`archivo\` ni \`url\``);
        else fuentes.push(ref);
      } else {
        problemas.push(`${donde}: fuente con forma desconocida`);
      }
    }
    const af: Afirmacion = { id, texto: typeof o.texto === "string" ? o.texto : "", fuentes };
    if (typeof o.cita === "string") af.cita = o.cita;
    afirmaciones.push(af);
  });
  if (problemas.length > 0) throw new ErrorDocumento(problemas);
  const doc: Documento = { afirmaciones };
  if (typeof raiz.titulo === "string") doc.titulo = raiz.titulo;
  return doc;
}

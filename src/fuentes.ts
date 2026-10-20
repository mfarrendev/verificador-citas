import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const EXTENSIONES = new Set([".txt", ".md", ".html", ".htm", ".csv"]);

/**
 * Lee los archivos de texto de una carpeta (recursivo) y los devuelve por
 * su ruta relativa. Un HTML se reduce a su texto visible de forma tosca:
 * suficiente para buscar citas, no para mostrarlo.
 */
export async function cargarFuentes(carpeta: string): Promise<Record<string, string>> {
  const fuentes: Record<string, string> = {};
  const entradas = await readdir(carpeta, { recursive: true, withFileTypes: true });
  for (const e of entradas) {
    if (!e.isFile()) continue;
    const ext = e.name.slice(e.name.lastIndexOf(".")).toLowerCase();
    if (!EXTENSIONES.has(ext)) continue;
    const ruta = join(e.parentPath, e.name);
    const clave = relative(carpeta, ruta).split("\\").join("/");
    const texto = await readFile(ruta, "utf8");
    fuentes[clave] = ext === ".html" || ext === ".htm" ? textoDeHtml(texto) : texto;
  }
  return fuentes;
}

export function textoDeHtml(html: string): string {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

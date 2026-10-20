#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { ErrorDocumento, leerDocumento } from "./documento.js";
import { formatearInforme } from "./formato.js";
import { cargarFuentes } from "./fuentes.js";
import { verificarDocumento } from "./verificar.js";

const AYUDA = `uso: verificador-citas <documento.json> [opciones]

  --fuentes <carpeta>       textos de las fuentes (.txt, .md, .html, .csv)
  --json                    informe en JSON
  --sin-red                 no consultar links (quedan como aviso)
  --timeout <ms>            tiempo máximo por link (10000)
  --ignorar-tildes          "politica" calza con "política"
  --distinguir-mayusculas   por omisión se ignoran
  --estricto                los avisos también hacen fallar la salida

Código de salida: 0 aprobado, 1 rechazado, 2 error de uso.`;

export async function main(argv: string[]): Promise<number> {
  let args;
  try {
    args = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        fuentes: { type: "string" },
        json: { type: "boolean", default: false },
        "sin-red": { type: "boolean", default: false },
        timeout: { type: "string" },
        "ignorar-tildes": { type: "boolean", default: false },
        "distinguir-mayusculas": { type: "boolean", default: false },
        estricto: { type: "boolean", default: false },
        ayuda: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (e) {
    console.error(`${(e as Error).message}\n\n${AYUDA}`);
    return 2;
  }
  const { values: v, positionals } = args;
  if (v.ayuda) {
    console.log(AYUDA);
    return 0;
  }
  const ruta = positionals[0];
  if (!ruta || positionals.length > 1) {
    console.error(AYUDA);
    return 2;
  }
  const timeoutMs = v.timeout === undefined ? 10_000 : Number(v.timeout);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    console.error("--timeout debe ser un número de milisegundos mayor que cero");
    return 2;
  }

  let doc;
  let fuentes: Record<string, string> = {};
  try {
    doc = leerDocumento(JSON.parse(await readFile(ruta, "utf8")));
    if (v.fuentes) fuentes = await cargarFuentes(v.fuentes);
  } catch (e) {
    console.error(e instanceof ErrorDocumento ? e.message : `no se pudo leer la entrada: ${(e as Error).message}`);
    return 2;
  }

  const informe = await verificarDocumento(doc, {
    fuentes,
    verificarLinks: !v["sin-red"],
    links: { timeoutMs },
    ignorarTildes: v["ignorar-tildes"],
    ignorarMayusculas: !v["distinguir-mayusculas"],
  });

  console.log(v.json ? JSON.stringify(informe, null, 2) : formatearInforme(informe, doc.titulo));
  if (informe.veredicto === "rechazado") return 1;
  if (v.estricto && informe.veredicto === "aprobado-con-avisos") return 1;
  return 0;
}

function esPrincipal(): boolean {
  const invocado = process.argv[1];
  if (!invocado) return false;
  try {
    // npx y npm link llaman al binario por un enlace simbólico.
    return realpathSync(invocado) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (esPrincipal()) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
}

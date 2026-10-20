import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../src/cli.js";

let dir: string;
let salida: string[];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "verificador-citas-"));
  await mkdir(join(dir, "fuentes"));
  await writeFile(join(dir, "fuentes", "acta.txt"), "El directorio aprobó un presupuesto de $2.400.000 para 2025.");
  await writeFile(join(dir, "fuentes", "nota.html"), "<p>La planta <b>opera</b> desde 1998.</p><script>var x = 1;</script>");
  salida = [];
  vi.spyOn(console, "log").mockImplementation((m: string) => { salida.push(m); });
  vi.spyOn(console, "error").mockImplementation((m: string) => { salida.push(m); });
});

afterEach(() => vi.restoreAllMocks());

async function documento(afirmaciones: unknown[]) {
  const ruta = join(dir, "doc.json");
  await writeFile(ruta, JSON.stringify({ afirmaciones }));
  return ruta;
}

describe("cli", () => {
  it("sale con 0 y dice APROBADO cuando todo calza", async () => {
    const ruta = await documento([
      { id: "a", texto: "Se aprobaron $2,4 millones.", cita: "aprobó un presupuesto de $2.400.000", fuentes: ["acta"] },
      { id: "b", texto: "Opera desde 1998.", cita: "La planta opera desde 1998", fuentes: ["nota.html"] },
    ]);
    expect(await main([ruta, "--fuentes", join(dir, "fuentes"), "--sin-red"])).toBe(0);
    expect(salida.join("\n")).toContain("APROBADO: 2 de 2");
  });

  it("sale con 1 cuando hay un bloqueante y muestra el fragmento cercano", async () => {
    const ruta = await documento([{ id: "a", texto: "x", cita: "aprobó un presupuesto de $4.200.000", fuentes: ["acta"] }]);
    expect(await main([ruta, "--fuentes", join(dir, "fuentes"), "--sin-red"])).toBe(1);
    const texto = salida.join("\n");
    expect(texto).toContain("cita-no-encontrada");
    expect(texto).toContain('más cercano en la fuente: "aprobó un presupuesto de $2.400.000"');
  });

  it("--json entrega un informe que se puede leer de vuelta", async () => {
    const ruta = await documento([{ id: "a", texto: "sin respaldo" }]);
    expect(await main([ruta, "--json"])).toBe(1);
    const inf = JSON.parse(salida.join("\n"));
    expect(inf.veredicto).toBe("rechazado");
    expect(inf.afirmaciones[0].hallazgos.map((h: { codigo: string }) => h.codigo)).toEqual(["sin-cita", "sin-fuente"]);
  });

  it("--estricto convierte los avisos en salida 1", async () => {
    const ruta = await documento([{ id: "a", texto: "x", cita: "aprobó", fuentes: [{ archivo: "acta", url: "https://ejemplo.org" }] }]);
    expect(await main([ruta, "--fuentes", join(dir, "fuentes"), "--sin-red"])).toBe(0);
    expect(await main([ruta, "--fuentes", join(dir, "fuentes"), "--sin-red", "--estricto"])).toBe(1);
  });

  it("sale con 2 ante un documento mal formado o sin argumentos", async () => {
    const ruta = join(dir, "malo.json");
    await writeFile(ruta, "{ esto no es json");
    expect(await main([ruta])).toBe(2);
    expect(await main([])).toBe(2);
    expect(await main([ruta, "--opcion-que-no-existe"])).toBe(2);
  });
});

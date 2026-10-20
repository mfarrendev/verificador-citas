import { describe, expect, it } from "vitest";
import { ErrorDocumento, leerDocumento } from "../src/documento.js";
import { verificarDocumento } from "../src/verificar.js";

const fuentes = {
  "informe-2024.txt": "Según el informe, la exportación de cobre creció 4,3% en 2024 y llegó a USD 50.800 millones.",
};

const sinRed = { fuentes, verificarLinks: false } as const;

function codigos(inf: Awaited<ReturnType<typeof verificarDocumento>>, i = 0) {
  return inf.afirmaciones[i]!.hallazgos.map((h) => h.codigo);
}

describe("verificarDocumento", () => {
  it("aprueba una afirmación con cita literal y cifras respaldadas", async () => {
    const doc = leerDocumento({
      afirmaciones: [{
        id: "a1",
        texto: "El cobre exportado creció 4,3% en 2024.",
        cita: "la exportación de cobre creció 4,3% en 2024",
        fuentes: ["informe-2024"],
      }],
    });
    const inf = await verificarDocumento(doc, sinRed);
    expect(inf.veredicto).toBe("aprobado");
    expect(inf.resumen).toEqual({ afirmaciones: 1, aprobadas: 1, bloqueantes: 0, avisos: 0 });
  });

  it("rechaza una afirmación sin cita ni fuente: nada se aprueba por omisión", async () => {
    const inf = await verificarDocumento(leerDocumento({ afirmaciones: [{ id: "a", texto: "El mercado es grande." }] }), sinRed);
    expect(inf.veredicto).toBe("rechazado");
    expect(codigos(inf)).toEqual(["sin-cita", "sin-fuente"]);
  });

  it("rechaza un documento sin afirmaciones", async () => {
    const inf = await verificarDocumento(leerDocumento({ afirmaciones: [] }), sinRed);
    expect(inf.veredicto).toBe("rechazado");
    expect(inf.generales[0]!.codigo).toBe("documento-vacio");
  });

  it("rechaza una cita inventada y reporta el fragmento real más cercano", async () => {
    const doc = leerDocumento({
      afirmaciones: [{ id: "a", texto: "Creció en 2024.", cita: "la exportación de cobre creció 3,4% en 2024", fuentes: ["informe-2024.txt"] }],
    });
    const inf = await verificarDocumento(doc, sinRed);
    const h = inf.afirmaciones[0]!.hallazgos.find((x) => x.codigo === "cita-no-encontrada")!;
    expect(h.severidad).toBe("bloqueante");
    expect(h.detalle?.fragmentoCercano).toBe("la exportación de cobre creció 4,3% en 2024");
  });

  it("bloquea una cifra que no está en ninguna parte", async () => {
    const doc = leerDocumento({
      afirmaciones: [{ id: "a", texto: "Creció 4,3% y empleó a 12.000 personas.", cita: "creció 4,3%", fuentes: ["informe-2024"] }],
    });
    const inf = await verificarDocumento(doc, sinRed);
    expect(codigos(inf)).toEqual(["cifra-sin-respaldo"]);
    expect(inf.afirmaciones[0]!.aprobada).toBe(false);
  });

  it("solo avisa cuando la cifra está en la fuente pero fuera de la cita", async () => {
    const doc = leerDocumento({
      afirmaciones: [{ id: "a", texto: "Creció 4,3% hasta USD 50,8 mil millones.", cita: "creció 4,3%", fuentes: ["informe-2024"] }],
    });
    const inf = await verificarDocumento(doc, sinRed);
    expect(codigos(inf)).toEqual(["cifra-fuera-de-cita"]);
    expect(inf.veredicto).toBe("aprobado-con-avisos");
  });

  it("bloquea una fuente de archivo que no existe", async () => {
    const doc = leerDocumento({ afirmaciones: [{ id: "a", texto: "x", cita: "x", fuentes: ["otro.txt"] }] });
    const inf = await verificarDocumento(doc, sinRed);
    expect(codigos(inf)).toContain("fuente-desconocida");
    expect(codigos(inf)).toContain("cita-sin-texto-de-fuente");
  });

  it("una URL sin texto local no permite aprobar la cita", async () => {
    const doc = leerDocumento({ afirmaciones: [{ id: "a", texto: "x", cita: "x", fuentes: ["https://ejemplo.org/a"] }] });
    const inf = await verificarDocumento(doc, sinRed);
    expect(inf.veredicto).toBe("rechazado");
    expect(codigos(inf)).toEqual(["link-no-verificable", "cita-sin-texto-de-fuente"]);
  });

  it("un link caído es bloqueante y uno no verificable es aviso", async () => {
    const f = (async (u: string | URL | Request) =>
      new Response(null, { status: String(u).endsWith("/caido") ? 404 : 403 })) as typeof fetch;
    const doc = leerDocumento({
      afirmaciones: [
        { id: "a", texto: "uno", cita: "cobre", fuentes: [{ archivo: "informe-2024", url: "https://ejemplo.org/caido" }] },
        { id: "b", texto: "dos", cita: "cobre", fuentes: [{ archivo: "informe-2024", url: "https://ejemplo.org/muro" }] },
      ],
    });
    const inf = await verificarDocumento(doc, {
      fuentes,
      links: { fetch: f, resolver: async () => ["93.184.216.34"] },
    });
    expect(codigos(inf, 0)).toEqual(["link-caido"]);
    expect(inf.afirmaciones[0]!.aprobada).toBe(false);
    expect(codigos(inf, 1)).toEqual(["link-no-verificable"]);
    expect(inf.afirmaciones[1]!.aprobada).toBe(true);
    expect(inf.veredicto).toBe("rechazado");
  });

  it("consulta cada URL una sola vez", async () => {
    let n = 0;
    const f = (async () => { n++; return new Response(null, { status: 200 }); }) as unknown as typeof fetch;
    const af = { texto: "t", cita: "cobre", fuentes: [{ archivo: "informe-2024", url: "https://ejemplo.org/a" }] };
    const doc = leerDocumento({ afirmaciones: [{ id: "1", ...af }, { id: "2", ...af }] });
    await verificarDocumento(doc, { fuentes, links: { fetch: f, resolver: async () => ["93.184.216.34"] } });
    expect(n).toBe(1);
  });
});

describe("leerDocumento", () => {
  it("rechaza ids repetidos y tipos equivocados", () => {
    expect(() => leerDocumento({ afirmaciones: [{ id: "a", texto: "x" }, { id: "a", texto: 3 }] })).toThrow(ErrorDocumento);
  });
  it("rechaza una raíz que no es objeto", () => {
    expect(() => leerDocumento([])).toThrow(ErrorDocumento);
  });
});

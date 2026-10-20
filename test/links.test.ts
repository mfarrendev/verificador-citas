import { describe, expect, it } from "vitest";
import { esDireccionPrivada, verificarLink, type OpcionesLinks } from "../src/links.js";

type Ruta = { status: number; location?: string } | "timeout" | Error;

/** fetch falso: responde según la URL y anota cada pedido. */
function fetchFalso(rutas: Record<string, Ruta>) {
  const pedidos: string[] = [];
  const f = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = String(entrada);
    pedidos.push(`${init?.method ?? "GET"} ${url}`);
    const r = rutas[url];
    if (r === undefined) throw new Error(`ruta no prevista: ${url}`);
    if (r === "timeout") throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
    if (r instanceof Error) throw r;
    const headers = new Headers(r.location ? { location: r.location } : {});
    return new Response(null, { status: r.status, headers });
  }) as typeof fetch;
  return { f, pedidos };
}

const publico = async () => ["93.184.216.34"];

function opts(rutas: Record<string, Ruta>, extra: Partial<OpcionesLinks> = {}) {
  const { f, pedidos } = fetchFalso(rutas);
  return { o: { fetch: f, resolver: publico, timeoutMs: 200, ...extra }, pedidos };
}

describe("verificarLink", () => {
  it("200 es un link vivo", async () => {
    const { o } = opts({ "https://ejemplo.org/a": { status: 200 } });
    expect((await verificarLink("https://ejemplo.org/a", o)).estado).toBe("link-vivo");
  });

  it.each([404, 410])("%i es un link caído", async (status) => {
    const { o } = opts({ "https://ejemplo.org/a": { status } });
    expect((await verificarLink("https://ejemplo.org/a", o)).estado).toBe("link-caido");
  });

  it.each([403, 429, 500, 503])("%i es no verificable, no caído", async (status) => {
    const { o } = opts({ "https://ejemplo.org/a": { status } });
    expect((await verificarLink("https://ejemplo.org/a", o)).estado).toBe("link-no-verificable");
  });

  it("un timeout es no verificable", async () => {
    const { o } = opts({ "https://ejemplo.org/a": "timeout" });
    const r = await verificarLink("https://ejemplo.org/a", o);
    expect(r.estado).toBe("link-no-verificable");
    expect(r.motivo).toContain("sin respuesta");
  });

  it("un dominio que no existe es un link caído", async () => {
    const { o, pedidos } = opts({}, {
      resolver: async () => { throw Object.assign(new Error("x"), { code: "ENOTFOUND" }); },
    });
    const r = await verificarLink("https://no-existe.invalid/", o);
    expect(r.estado).toBe("link-caido");
    expect(pedidos).toEqual([]);
  });

  it("un DNS que falla por otra causa es no verificable", async () => {
    const { o } = opts({}, {
      resolver: async () => { throw Object.assign(new Error("x"), { code: "ESERVFAIL" }); },
    });
    expect((await verificarLink("https://ejemplo.org/", o)).estado).toBe("link-no-verificable");
  });

  it("si HEAD no está permitido, reintenta con GET", async () => {
    const rutas: Record<string, Ruta> = {};
    const { f, pedidos } = fetchFalso(rutas);
    const g = (async (u: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "HEAD") { pedidos.push(`HEAD ${String(u)}`); return new Response(null, { status: 405 }); }
      rutas[String(u)] = { status: 200 };
      return f(u, init);
    }) as typeof fetch;
    const r = await verificarLink("https://ejemplo.org/b", { fetch: g, resolver: publico });
    expect(r.estado).toBe("link-vivo");
    expect(pedidos).toEqual(["HEAD https://ejemplo.org/b", "GET https://ejemplo.org/b"]);
  });

  it("un 404 a HEAD se confirma con GET antes de declarar el link caído", async () => {
    const pedidos: string[] = [];
    const g = (async (u: string | URL | Request, init?: RequestInit) => {
      pedidos.push(`${init?.method} ${String(u)}`);
      return new Response(null, { status: init?.method === "HEAD" ? 404 : 200 });
    }) as typeof fetch;
    const r = await verificarLink("https://ejemplo.org/c", { fetch: g, resolver: publico });
    expect(r.estado).toBe("link-vivo");
    expect(pedidos).toEqual(["HEAD https://ejemplo.org/c", "GET https://ejemplo.org/c"]);
  });

  it("sigue redirecciones hasta el destino final", async () => {
    const { o } = opts({
      "https://ejemplo.org/viejo": { status: 301, location: "/nuevo" },
      "https://ejemplo.org/nuevo": { status: 200 },
    });
    const r = await verificarLink("https://ejemplo.org/viejo", o);
    expect(r.estado).toBe("link-vivo");
    expect(r.urlFinal).toBe("https://ejemplo.org/nuevo");
  });

  it("no consulta una IP privada escrita en la URL", async () => {
    const { o, pedidos } = opts({});
    const r = await verificarLink("http://127.0.0.1:8080/admin", o);
    expect(r.estado).toBe("link-no-verificable");
    expect(pedidos).toEqual([]);
  });

  it("no consulta un dominio que resuelve a una red privada", async () => {
    const { o, pedidos } = opts({}, { resolver: async () => ["10.0.0.5"] });
    const r = await verificarLink("https://interno.ejemplo.org/", o);
    expect(r.estado).toBe("link-no-verificable");
    expect(pedidos).toEqual([]);
  });

  it("no sigue una redirección hacia una IP privada", async () => {
    const { o, pedidos } = opts({
      "https://ejemplo.org/r": { status: 302, location: "http://169.254.169.254/latest/meta-data/" },
    });
    const r = await verificarLink("https://ejemplo.org/r", o);
    expect(r.estado).toBe("link-no-verificable");
    expect(r.motivo).toContain("red privada");
    expect(pedidos).toEqual(["HEAD https://ejemplo.org/r"]);
  });

  it("corta un bucle de redirecciones", async () => {
    const { o } = opts({ "https://ejemplo.org/x": { status: 302, location: "/x" } });
    const r = await verificarLink("https://ejemplo.org/x", o);
    expect(r.estado).toBe("link-no-verificable");
    expect(r.motivo).toContain("redirecciones");
  });

  it("una URL mal formada es un link caído", async () => {
    expect((await verificarLink("no es una url")).estado).toBe("link-caido");
  });
});

describe("esDireccionPrivada", () => {
  it.each([
    ["127.0.0.1", true], ["10.1.2.3", true], ["172.16.0.1", true], ["172.32.0.1", false],
    ["192.168.1.1", true], ["169.254.169.254", true], ["100.64.0.1", true], ["8.8.8.8", false],
    ["::1", true], ["fd00::1", true], ["fe80::1", true], ["::ffff:127.0.0.1", true],
    ["2001:4860:4860::8888", false], ["no-ip", true],
  ])("%s -> %s", (ip, esperado) => {
    expect(esDireccionPrivada(ip)).toBe(esperado);
  });
});

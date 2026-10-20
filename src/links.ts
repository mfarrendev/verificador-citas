import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Estado de un link. La distinción importa porque las consecuencias son
 * opuestas:
 *  - `link-caido`: hay evidencia positiva de que el recurso no existe
 *    (404, 410, dominio que no resuelve). Citar algo que no existe es un
 *    error del texto, y es bloqueante.
 *  - `link-no-verificable`: no pudimos mirar (timeout, 403 de un muro
 *    anti-bots, 429, 5xx, destino privado). No dice nada del texto; tratarlo
 *    como caído castigaría a las fuentes que se protegen de los robots.
 */
export type EstadoLink = "link-vivo" | "link-caido" | "link-no-verificable";

export interface ResultadoLink {
  url: string;
  estado: EstadoLink;
  motivo: string;
  status?: number;
  /** URL final tras seguir redirecciones. */
  urlFinal?: string;
}

export type Resolver = (host: string) => Promise<string[]>;

export interface OpcionesLinks {
  fetch?: typeof globalThis.fetch;
  /** Resolución DNS inyectable; por omisión, node:dns. */
  resolver?: Resolver;
  timeoutMs?: number;
  maxRedirecciones?: number;
  /** Permite destinos en redes privadas. Solo para pruebas locales. */
  permitirPrivadas?: boolean;
}

const resolverPorOmision: Resolver = async (host) =>
  (await dnsLookup(host, { all: true, verbatim: true })).map((r) => r.address);

export async function verificarLink(url: string, opciones: OpcionesLinks = {}): Promise<ResultadoLink> {
  const {
    fetch: f = globalThis.fetch,
    resolver = resolverPorOmision,
    timeoutMs = 10_000,
    maxRedirecciones = 5,
    permitirPrivadas = false,
  } = opciones;

  let actual: URL;
  try {
    actual = new URL(url);
  } catch {
    return { url, estado: "link-caido", motivo: "URL mal formada" };
  }

  for (let salto = 0; salto <= maxRedirecciones; salto++) {
    if (actual.protocol !== "http:" && actual.protocol !== "https:") {
      return { url, estado: "link-no-verificable", motivo: `protocolo no soportado: ${actual.protocol}` };
    }
    const host = actual.hostname.replace(/^\[|\]$/g, "");

    let direcciones: string[];
    if (isIP(host)) {
      direcciones = [host];
    } else {
      try {
        direcciones = await conTimeout(resolver(host), timeoutMs);
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code === "ENOTFOUND" || code === "ENODATA") {
          return { url, estado: "link-caido", motivo: `el dominio ${host} no existe (${code})` };
        }
        return { url, estado: "link-no-verificable", motivo: `DNS no respondió (${code ?? "timeout"})` };
      }
    }
    if (!permitirPrivadas && direcciones.some(esDireccionPrivada)) {
      return {
        url,
        estado: "link-no-verificable",
        motivo: `destino en red privada (${host}); no se consulta`,
        urlFinal: actual.href,
      };
    }

    let resp: Response;
    try {
      resp = await pedir(f, actual.href, "HEAD", timeoutMs);
      // Algunos servidores contestan mal a HEAD. Antes de declarar un link
      // caído (o de rendirse con 405/501), se confirma con GET.
      if ([404, 405, 410, 501].includes(resp.status)) resp = await pedir(f, actual.href, "GET", timeoutMs);
    } catch (e) {
      const nombre = (e as Error).name;
      const motivo = nombre === "TimeoutError" || nombre === "AbortError" ? `sin respuesta en ${timeoutMs} ms` : `error de red: ${(e as Error).message}`;
      return { url, estado: "link-no-verificable", motivo, urlFinal: actual.href };
    }

    const s = resp.status;
    if (s >= 300 && s < 400) {
      const destino = resp.headers.get("location");
      if (!destino) return { url, estado: "link-no-verificable", motivo: `redirección ${s} sin destino`, status: s };
      actual = new URL(destino, actual);
      continue;
    }
    const base = { url, status: s, urlFinal: actual.href };
    if (s >= 200 && s < 300) return { ...base, estado: "link-vivo", motivo: `HTTP ${s}` };
    if (s === 404 || s === 410) return { ...base, estado: "link-caido", motivo: `HTTP ${s}` };
    return { ...base, estado: "link-no-verificable", motivo: `HTTP ${s}` };
  }
  return { url, estado: "link-no-verificable", motivo: `más de ${maxRedirecciones} redirecciones` };
}

async function pedir(f: typeof fetch, url: string, method: string, timeoutMs: number): Promise<Response> {
  const resp = await f(url, { method, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
  // No leemos el cuerpo: solo importa el estado.
  await resp.body?.cancel().catch(() => {});
  return resp;
}

function conTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((ok, mal) => {
    const t = setTimeout(() => mal(Object.assign(new Error("timeout"), { code: "ETIMEOUT" })), ms);
    p.then((v) => { clearTimeout(t); ok(v); }, (e) => { clearTimeout(t); mal(e); });
  });
}

/** Loopback, redes privadas, enlace local, CGNAT, multicast y reservadas. */
export function esDireccionPrivada(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a = 0, b = 0] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (v === 6) {
    const t = ip.toLowerCase();
    const mapeada = t.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapeada) return esDireccionPrivada(mapeada[1]!);
    if (t.startsWith("::ffff:")) return true; // forma hexadecimal de una IPv4 mapeada: no arriesgar
    return t === "::" || t === "::1" || /^f[cd]/.test(t) || /^fe[89ab]/.test(t) || t.startsWith("ff");
  }
  return true; // lo que no es una IP válida no se consulta
}

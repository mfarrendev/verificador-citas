import { describe, expect, it } from "vitest";
import { buscarCita, subcadenaMasCercana } from "../src/citas.js";
import { normalizar } from "../src/normalizar.js";

const ch = (n: number) => String.fromCharCode(n);

describe("normalizar", () => {
  it("unifica comillas tipográficas, guiones largos y espacios", () => {
    const tipografico = `${ch(0x201c)}hola${ch(0x201d)}${ch(0xa0)}${ch(0xa0)}mundo ${ch(0x2014)} fin`;
    expect(normalizar(tipografico)).toBe('"hola" mundo - fin');
  });

  it("quita caracteres invisibles", () => {
    expect(normalizar(`pala${ch(0x200b)}bra`)).toBe("palabra");
  });

  it("une palabras cortadas con guion al final de línea", () => {
    expect(normalizar("la tecno-\nlogía avanza")).toBe("la tecnología avanza");
  });

  it("respeta las tildes salvo que se pida ignorarlas", () => {
    expect(normalizar("Canción")).toBe("canción");
    expect(normalizar("Canción", { ignorarTildes: true })).toBe("cancion");
  });

  it("puede distinguir mayúsculas", () => {
    expect(normalizar("ABC", { ignorarMayusculas: false })).toBe("ABC");
  });
});

describe("buscarCita", () => {
  const fuente = `El informe anual indica que las ventas crecieron un 12,5% en 2024,
    impulsadas por el mercado ${ch(0x201c)}exportador${ch(0x201d)} del sur.`;

  it("encuentra una cita con comillas rectas y espacios distintos", () => {
    const r = buscarCita('las ventas  crecieron un 12,5% en 2024, impulsadas por el mercado "exportador"', fuente);
    expect(r.encontrada).toBe(true);
  });

  it("no acepta una cita con una cifra alterada y muestra el fragmento real", () => {
    const r = buscarCita("las ventas crecieron un 15,5% en 2024", fuente);
    expect(r.encontrada).toBe(false);
    expect(r.fragmentoCercano).toBe("las ventas crecieron un 12,5% en 2024");
    expect(r.distancia).toBe(1);
  });

  it("no acepta una cita vacía", () => {
    expect(buscarCita("   ", fuente).encontrada).toBe(false);
  });

  it("con tildes ignoradas acepta una cita sin acentos", () => {
    const f = "La política energética cambió.";
    expect(buscarCita("la politica energetica cambio", f).encontrada).toBe(false);
    expect(buscarCita("la politica energetica cambio", f, { ignorarTildes: true }).encontrada).toBe(true);
  });

  it("en una fuente grande recorta a una ventana y aun así encuentra el fragmento", () => {
    const relleno = "texto de relleno sin relación alguna. ".repeat(40_000);
    const grande = relleno + "la tasa de desempleo bajó a 7,8 por ciento en marzo. " + relleno;
    const r = buscarCita("la tasa de desempleo bajó a 8,7 por ciento en marzo", grande);
    expect(r.encontrada).toBe(false);
    expect(r.fragmentoCercano).toContain("desempleo bajó a 7,8");
  }, 20_000);
});

describe("subcadenaMasCercana", () => {
  it("devuelve distancia 0 y la posición exacta si el patrón está", () => {
    expect(subcadenaMasCercana("gato", "el gato negro")).toEqual({ inicio: 3, fin: 7, distancia: 0 });
  });

  it("cuenta una sustitución", () => {
    const r = subcadenaMasCercana("gato", "el pato negro");
    expect(r.distancia).toBe(1);
    expect("el pato negro".slice(r.inicio, r.fin)).toBe("pato");
  });
});

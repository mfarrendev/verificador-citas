import { describe, expect, it } from "vitest";
import { cifraPresente, extraerCifras, lecturas } from "../src/cifras.js";

describe("lecturas", () => {
  it("formato chileno con miles y decimales", () => {
    expect(lecturas("1.234.567,89")).toEqual([1234567.89]);
  });
  it("formato inglés con miles y decimales", () => {
    expect(lecturas("1,234,567.89")).toEqual([1234567.89]);
  });
  it("un separador seguido de tres dígitos es ambiguo y guarda las dos lecturas", () => {
    expect(lecturas("1.234").sort((a, b) => a - b)).toEqual([1.234, 1234]);
  });
  it("una coma con dos dígitos es decimal", () => {
    expect(lecturas("12,5")).toEqual([12.5]);
  });
});

describe("extraerCifras", () => {
  it("reconoce porcentajes, montos, años y números sueltos", () => {
    const c = extraerCifras("En 2023 las ventas subieron 12,5% hasta USD 3,2 millones en 14 regiones.");
    expect(c.map((x) => [x.texto, x.tipo])).toEqual([
      ["2023", "año"],
      ["12,5%", "porcentaje"],
      ["USD 3,2 millones", "monto"],
      ["14", "numero"],
    ]);
    expect(c[2]!.moneda).toBe("USD");
    expect(c[2]!.valores).toContain(3_200_000);
  });

  it("reconoce pesos chilenos con signo y con sufijo", () => {
    const c = extraerCifras("Costó $1.500.000 CLP, es decir 1.500.000 pesos.");
    expect(c).toHaveLength(2);
    expect(c[0]!.valores).toEqual([1_500_000]);
    expect(c[1]!.moneda).toBe("CLP");
  });

  it("no parte un número pegado a letras", () => {
    expect(extraerCifras("el modelo X200 y la norma ISO9001")).toEqual([]);
  });
});

describe("cifraPresente", () => {
  const fuente = "Los ingresos fueron de 3.200.000 dólares, un alza de 12,5 por ciento.";

  it("acepta la misma cifra escrita de otra forma", () => {
    const [monto, pct] = extraerCifras("USD 3,2 millones, 12.5%");
    expect(cifraPresente(monto!, fuente)).toBe(true);
    expect(cifraPresente(pct!, fuente)).toBe(true);
  });

  it("rechaza una cifra con dígitos invertidos", () => {
    const [pct] = extraerCifras("un alza de 15,2%");
    expect(cifraPresente(pct!, fuente)).toBe(false);
  });

  it("rechaza un orden de magnitud distinto", () => {
    const [monto] = extraerCifras("USD 32 millones");
    expect(cifraPresente(monto!, fuente)).toBe(false);
  });
});

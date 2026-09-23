import type { Extractor } from "./tipos";
import { ExtractorMock } from "./mock";
import { ExtractorOpenAI } from "./openai";

let instancia: Extractor | null = null;

/**
 * Devuelve el extractor configurado por entorno.
 *
 * EXTRACCION_PROVIDER=openai  → modelo de visión real (requiere OPENAI_API_KEY)
 * EXTRACCION_PROVIDER=mock    → datos simulados, sin credencial ni costo
 *
 * Sin configurar, cae en mock: preferimos que la app arranque y sea usable a
 * que reviente por una variable de entorno faltante.
 */
export function getExtractor(): Extractor {
  if (instancia) return instancia;

  const proveedor = (process.env.EXTRACCION_PROVIDER ?? "mock").toLowerCase();

  switch (proveedor) {
    case "openai":
      instancia = new ExtractorOpenAI();
      break;
    case "mock":
      instancia = new ExtractorMock();
      break;
    default:
      throw new Error(
        `EXTRACCION_PROVIDER="${proveedor}" no es válido. Usa "openai" o "mock".`
      );
  }

  return instancia;
}

export * from "./tipos";

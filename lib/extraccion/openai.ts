import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { FacturaExtraidaSchema, type Extractor, type ResultadoExtraccion } from "./tipos";
import { PROMPT_SISTEMA, PROMPT_USUARIO } from "./prompt";

/**
 * Extractor real con un modelo de visión por API compatible con OpenAI.
 *
 * Sirve igual para OpenAI directo y para el AI Gateway de Neon: lo único que
 * cambia es baseURL + apiKey. Por eso el modelo NO está fijo en el código —
 * se lee de EXTRACCION_MODELO, y así se puede apuntar al modelo de visión
 * vigente sin tocar esta clase.
 */
export class ExtractorOpenAI implements Extractor {
  nombre = "openai";
  private cliente: OpenAI;
  private modelo: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Falta OPENAI_API_KEY. Ponla en .env.local, o usa EXTRACCION_PROVIDER=mock para trabajar sin credencial."
      );
    }

    this.modelo = process.env.EXTRACCION_MODELO ?? "gpt-4o";
    this.cliente = new OpenAI({
      apiKey,
      // Definido solo si se usa el AI Gateway de Neon u otro proxy compatible.
      baseURL: process.env.OPENAI_BASE_URL,
    });
  }

  async extraer(imagen: Buffer, mime: string): Promise<ResultadoExtraccion> {
    const inicio = Date.now();

    const respuesta = await this.cliente.chat.completions.create({
      model: this.modelo,
      // Determinismo: para extracción de datos no queremos creatividad.
      temperature: 0,
      messages: [
        { role: "system", content: PROMPT_SISTEMA },
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT_USUARIO },
            {
              type: "image_url",
              image_url: {
                url: `data:${mime};base64,${imagen.toString("base64")}`,
                // "high" conserva el detalle fino: CAI, RTN y montos son texto
                // pequeño y con "low" se pierden.
                detail: "high",
              },
            },
          ],
        },
      ],
      response_format: zodResponseFormat(FacturaExtraidaSchema, "factura"),
    });

    const contenido = respuesta.choices[0]?.message?.content;
    if (!contenido) {
      throw new Error("El modelo no devolvió contenido.");
    }

    // Se valida con zod en vez de confiar en el JSON: structured outputs puede
    // fallar o venir de un proveedor que no respete strict del todo.
    const datos = FacturaExtraidaSchema.parse(JSON.parse(contenido));

    return {
      datos,
      raw: {
        contenido: JSON.parse(contenido),
        modelo: respuesta.model,
        uso: respuesta.usage,
        finish_reason: respuesta.choices[0]?.finish_reason,
      },
      modelo: respuesta.model ?? this.modelo,
      ms: Date.now() - inicio,
    };
  }
}

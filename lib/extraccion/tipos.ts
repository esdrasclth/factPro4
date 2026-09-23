import { z } from "zod";

/**
 * Esquema de lo que el modelo debe devolver al leer una factura.
 *
 * Todo es `.nullable()` a propósito: si un dato no se ve o no aparece en el
 * papel, el modelo devuelve null. Nunca estima ni completa. Un null es un
 * resultado correcto; un valor inventado es el peor error posible aquí.
 *
 * Se usa `.nullable()` y no `.optional()` porque el modo `strict` de structured
 * outputs exige que todas las claves estén presentes en la respuesta.
 */
export const FacturaExtraidaSchema = z.object({
  // --- Emisor ---
  proveedor_nombre: z
    .string()
    .nullable()
    .describe("Razón social o nombre comercial de quien emite la factura."),
  proveedor_rtn: z
    .string()
    .nullable()
    .describe("RTN del emisor: 14 dígitos, sin guiones ni espacios."),
  proveedor_direccion: z
    .string()
    .nullable()
    .describe("Dirección del emisor tal como aparece impresa."),

  // --- Identificación fiscal ---
  numero_factura: z
    .string()
    .nullable()
    .describe(
      "Número de factura con formato 000-000-00-00000000 (establecimiento-punto de emisión-tipo de documento-correlativo)."
    ),
  cai: z
    .string()
    .nullable()
    .describe(
      "Código de Autorización de Impresión: cadena hexadecimal en grupos separados por guiones. Copiar exactamente como está impreso."
    ),
  rango_autorizado_desde: z
    .string()
    .nullable()
    .describe("Inicio del rango autorizado de facturación, mismo formato que numero_factura."),
  rango_autorizado_hasta: z
    .string()
    .nullable()
    .describe("Fin del rango autorizado de facturación, mismo formato que numero_factura."),
  fecha_limite_emision: z
    .string()
    .nullable()
    .describe("Fecha límite de emisión en formato ISO YYYY-MM-DD."),

  // --- Documento ---
  fecha_emision: z
    .string()
    .nullable()
    .describe("Fecha de emisión de la factura en formato ISO YYYY-MM-DD."),
  cliente_nombre: z.string().nullable().describe("Nombre del cliente o comprador."),
  cliente_rtn: z.string().nullable().describe("RTN del cliente: 14 dígitos, sin guiones."),
  moneda: z
    .string()
    .nullable()
    .describe("Código ISO de la moneda: HNL para lempiras, USD para dólares."),

  // --- Montos ---
  // Números puros, sin símbolo de moneda ni separador de miles. Punto decimal.
  subtotal: z.number().nullable().describe("Subtotal antes de impuestos."),
  descuentos: z.number().nullable().describe("Descuentos o rebajas otorgadas."),
  importe_exento: z.number().nullable().describe("Importe exento de ISV."),
  importe_exonerado: z.number().nullable().describe("Importe exonerado de ISV."),
  importe_gravado_15: z.number().nullable().describe("Base gravada con ISV del 15%."),
  importe_gravado_18: z.number().nullable().describe("Base gravada con ISV del 18%."),
  isv_15: z.number().nullable().describe("Monto de ISV al 15%."),
  isv_18: z.number().nullable().describe("Monto de ISV al 18%."),
  total: z.number().nullable().describe("Total a pagar."),
});

export type FacturaExtraida = z.infer<typeof FacturaExtraidaSchema>;

/** Campos que en la BD son `date` y por tanto exigen YYYY-MM-DD. */
export const CAMPOS_FECHA = ["fecha_limite_emision", "fecha_emision"] as const;

const ISO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Esquema para lo que entra por la API (la pantalla de revisión).
 *
 * Es más estricto que el del modelo: aquí las fechas se validan con regex para
 * que un valor basura devuelva 400 y no un 500 de Postgres. No se puede usar
 * este esquema con el modelo porque `pattern` no está permitido en el modo
 * strict de structured outputs.
 */
export const FacturaEntradaSchema = FacturaExtraidaSchema.extend(
  Object.fromEntries(
    CAMPOS_FECHA.map((c) => [
      c,
      z
        .string()
        .regex(ISO_FECHA, "La fecha debe tener formato YYYY-MM-DD")
        .nullable(),
    ])
  ) as Record<(typeof CAMPOS_FECHA)[number], z.ZodNullable<z.ZodString>>
);

/**
 * Limpia lo que devolvió el modelo antes de tocar la BD.
 *
 * El prompt pide fechas ISO, pero un modelo puede devolver "05/03/2026" o
 * texto libre igual. Una fecha que no cumple el formato se trata como no
 * leída (null) en vez de reventar el INSERT: la respuesta completa queda
 * guardada en extraccion_raw, así que no se pierde nada.
 */
export function sanitizarExtraccion(datos: FacturaExtraida): FacturaExtraida {
  const limpio = { ...datos };
  for (const campo of CAMPOS_FECHA) {
    const v = limpio[campo];
    if (typeof v === "string" && !ISO_FECHA.test(v.trim())) {
      limpio[campo] = null;
    }
  }
  return limpio;
}

/** Campos que la UI de revisión muestra y compara. */
export const CAMPOS_FACTURA = Object.keys(
  FacturaExtraidaSchema.shape
) as (keyof FacturaExtraida)[];

export interface ResultadoExtraccion {
  datos: FacturaExtraida;
  raw: unknown;
  modelo: string;
  ms: number;
}

export interface Extractor {
  nombre: string;
  extraer(imagen: Buffer, mime: string): Promise<ResultadoExtraccion>;
}

/** Factura con todos los campos en null: punto de partida cuando la extracción falla. */
export function facturaVacia(): FacturaExtraida {
  return Object.fromEntries(
    CAMPOS_FACTURA.map((c) => [c, null])
  ) as unknown as FacturaExtraida;
}

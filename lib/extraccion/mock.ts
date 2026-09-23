import { createHash } from "node:crypto";
import type { Extractor, FacturaExtraida, ResultadoExtraccion } from "./tipos";

/**
 * Extractor falso: permite construir y probar todo el flujo (cámara, subida,
 * bucket, BD, pantalla de revisión) sin API key y sin costo.
 *
 * Devuelve datos verosímiles y variados, e incluye a propósito algunos null y
 * una factura cuya aritmética no cuadra, para poder ejercitar las validaciones
 * de la UI de revisión.
 */

const PROVEEDORES = [
  {
    proveedor_nombre: "Distribuidora La Colonia S. de R.L.",
    proveedor_rtn: "08019995123456",
    proveedor_direccion: "Bulevar Morazán, Tegucigalpa, Francisco Morazán",
  },
  {
    proveedor_nombre: "Ferretería El Constructor",
    proveedor_rtn: "05019988776655",
    proveedor_direccion: "Barrio Guamilito, 5 calle NO, San Pedro Sula",
  },
  {
    proveedor_nombre: "Suplidora Industrial Hondureña S.A.",
    proveedor_rtn: "08019876543210",
    proveedor_direccion: "Zona Industrial, Comayagüela M.D.C.",
  },
];

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

export class ExtractorMock implements Extractor {
  nombre = "mock";

  // El mock no mira el mime, solo los bytes.
  async extraer(imagen: Buffer): Promise<ResultadoExtraccion> {
    const inicio = Date.now();

    // Latencia simulada: el flujo real tarda segundos y la UI debe reflejarlo.
    await new Promise((r) => setTimeout(r, 600 + Math.random() * 900));

    // Determinista según la imagen, igual que un extractor real: la misma foto
    // produce siempre los mismos datos. Eso hace que reprocesar una factura ya
    // capturada active el índice único, que es justo lo que debe pasar.
    const hash = createHash("sha256").update(imagen).digest("hex").toUpperCase();
    const i = parseInt(hash.slice(0, 4), 16);
    const prov = PROVEEDORES[i % PROVEEDORES.length];

    const gravado = redondear(500 + (parseInt(hash.slice(4, 10), 16) % 950000) / 100);
    const isv = redondear(gravado * 0.15);
    const descuentos = i % 3 === 0 ? redondear(gravado * 0.05) : 0;
    const total = redondear(gravado + isv - descuentos);

    // Algunas facturas salen con datos faltantes, como en la vida real.
    const incompleta = i % 4 === 3;

    const correlativo = String(parseInt(hash.slice(10, 18), 16) % 1e8).padStart(8, "0");
    const caiFalso = [0, 1, 2, 3, 4, 5]
      .map((n) => hash.slice(18 + n * 6, 24 + n * 6))
      .join("-");

    const datos: FacturaExtraida = {
      ...prov,
      proveedor_direccion: incompleta ? null : prov.proveedor_direccion,

      numero_factura: `000-001-01-${correlativo}`,
      cai: incompleta ? null : caiFalso,
      rango_autorizado_desde: "000-001-01-00000001",
      rango_autorizado_hasta: "000-001-01-00050000",
      fecha_limite_emision: "2026-12-31",

      fecha_emision: new Date(Date.now() - (i % 60) * 86400000)
        .toISOString()
        .slice(0, 10),
      cliente_nombre: "Esdras Clother",
      cliente_rtn: incompleta ? null : "08011990123456",
      moneda: "HNL",

      subtotal: gravado,
      descuentos: descuentos || null,
      importe_exento: null,
      importe_exonerado: null,
      importe_gravado_15: gravado,
      importe_gravado_18: null,
      isv_15: isv,
      isv_18: null,
      total,
    };

    return {
      datos,
      raw: {
        _nota: "Respuesta simulada — no se llamó a ningún modelo.",
        bytes_imagen: imagen.length,
        datos,
      },
      modelo: "mock",
      ms: Date.now() - inicio,
    };
  }
}

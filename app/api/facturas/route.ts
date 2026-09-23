import { NextResponse } from "next/server";
import { getExtractor, facturaVacia, sanitizarExtraccion } from "@/lib/extraccion";
import { subirImagen } from "@/lib/storage";
import {
  crearFactura,
  listarFacturas,
  buscarDuplicada,
  esViolacionUnicidad,
  type EstadoFactura,
} from "@/lib/db";

// Una llamada de visión tarda 5–15 s; 60 s da margen de sobra.
export const maxDuration = 60;

const MIMES_OK = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request) {
  let imagen_key: string | null = null;

  try {
    const form = await req.formData();
    const archivo = form.get("imagen");

    if (!(archivo instanceof File)) {
      return NextResponse.json({ error: "Falta el archivo 'imagen'." }, { status: 400 });
    }
    if (!MIMES_OK.has(archivo.type)) {
      return NextResponse.json(
        { error: `Tipo no soportado: ${archivo.type}` },
        { status: 400 }
      );
    }
    if (archivo.size > MAX_BYTES) {
      return NextResponse.json({ error: "La imagen supera 8 MB." }, { status: 413 });
    }

    const buffer = Buffer.from(await archivo.arrayBuffer());

    // Primero se guarda la foto. Si la extracción falla después, la imagen ya
    // está a salvo y la factura se puede llenar a mano o reprocesar.
    imagen_key = await subirImagen(buffer, archivo.type);

    // Solo la extracción va dentro de este try. Si falla, la foto ya está a
    // salvo y se crea la fila vacía para no perder una captura que el usuario
    // ya hizo. Los errores de la BD NO se tapan aquí: se manejan aparte, para
    // que un duplicado no termine guardado como fila en blanco.
    let entrada;
    try {
      const r = await getExtractor().extraer(buffer, archivo.type);
      entrada = {
        datos: sanitizarExtraccion(r.datos),
        imagen_key,
        extraccion_raw: r.raw,
        extraccion_modelo: r.modelo,
        extraccion_ms: r.ms,
        extraccion_error: null as string | null,
      };
    } catch (e) {
      entrada = {
        datos: facturaVacia(),
        imagen_key,
        extraccion_raw: null,
        extraccion_modelo: null,
        extraccion_ms: null,
        extraccion_error: e instanceof Error ? e.message : String(e),
      };
    }

    try {
      const factura = await crearFactura(entrada);
      return NextResponse.json({ factura }, { status: 201 });
    } catch (e) {
      if (esViolacionUnicidad(e)) {
        // El índice único (cai, numero_factura) hizo su trabajo: esta factura
        // ya está capturada. Se devuelve la existente para poder abrirla.
        const existente = await buscarDuplicada(entrada.datos);
        return NextResponse.json(
          {
            error: "Esta factura ya fue capturada.",
            duplicada: true,
            factura: existente,
          },
          { status: 409 }
        );
      }
      throw e;
    }
  } catch (e) {
    console.error("POST /api/facturas", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al procesar la factura." },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const facturas = await listarFacturas({
    proveedor: p.get("proveedor") ?? undefined,
    desde: p.get("desde") ?? undefined,
    hasta: p.get("hasta") ?? undefined,
    estado: (p.get("estado") as EstadoFactura) ?? undefined,
  });
  return NextResponse.json({ facturas });
}

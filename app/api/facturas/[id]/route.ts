import { NextResponse } from "next/server";
import {
  obtenerFactura,
  actualizarFactura,
  eliminarFactura,
  type EstadoFactura,
} from "@/lib/db";
import { urlImagen, borrarImagen } from "@/lib/storage";
import { FacturaEntradaSchema } from "@/lib/extraccion";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const factura = await obtenerFactura(id);
  if (!factura) {
    return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  }
  return NextResponse.json({ factura, imagen_url: await urlImagen(factura.imagen_key) });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const cuerpo = (await req.json().catch(() => ({}))) as {
    datos?: unknown;
    estado?: EstadoFactura;
  };

  // partial(): la UI puede mandar solo los campos que cambió.
  // FacturaEntrada (no FacturaExtraida) valida el formato de las fechas, para
  // que un valor inválido sea un 400 claro y no un 500 de Postgres.
  const parsed = FacturaEntradaSchema.partial().safeParse(cuerpo.datos ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", detalle: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const factura = await actualizarFactura(id, parsed.data, cuerpo.estado);
  if (!factura) {
    return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  }
  return NextResponse.json({ factura });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;

  // Primero la fila y después la imagen: si falla el bucket queda una foto
  // huérfana (inofensiva), en vez de una factura apuntando a una foto borrada.
  const borrada = await eliminarFactura(id);
  if (!borrada) {
    return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  }

  try {
    await borrarImagen(borrada.imagen_key);
  } catch (e) {
    console.warn(`DELETE /api/facturas/${id}: imagen ${borrada.imagen_key}`, e);
  }

  return new NextResponse(null, { status: 204 });
}

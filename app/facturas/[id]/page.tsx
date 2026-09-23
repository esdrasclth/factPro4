import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerFactura } from "@/lib/db";
import { urlImagen } from "@/lib/storage";
import FormularioRevision from "./FormularioRevision";

export default async function RevisionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ duplicada?: string }>;
}) {
  const { id } = await params;
  const { duplicada } = await searchParams;
  const factura = await obtenerFactura(id);
  if (!factura) notFound();

  const imagen = await urlImagen(factura.imagen_key);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-4">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Revisar factura</h1>
          <p className="text-sm text-slate-500">
            Corrige lo que el modelo haya leído mal y confirma.
            {factura.extraccion_ms != null && ` Extraída en ${(factura.extraccion_ms / 1000).toFixed(1)} s`}
            {factura.extraccion_modelo && ` con ${factura.extraccion_modelo}`}
          </p>
        </div>
        <Link href="/facturas" className="text-sm text-slate-600 underline underline-offset-4">
          Todas
        </Link>
      </header>

      {duplicada && (
        <div className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Esta factura ya estaba capturada. Se abrió el registro existente en lugar de
          duplicarlo.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* La foto se queda fija al hacer scroll: se compara campo por campo. */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <a href={imagen} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagen}
              alt="Factura"
              className="w-full rounded-xl border border-slate-200 bg-white object-contain"
            />
          </a>
          <p className="mt-2 text-center text-xs text-slate-400">
            Toca la imagen para verla completa
          </p>
        </div>

        <FormularioRevision factura={factura} />
      </div>
    </main>
  );
}

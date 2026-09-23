import Link from "next/link";
import { listarFacturas, type EstadoFactura } from "@/lib/db";
import { aFechaISO, aMoneda, aNumero } from "@/lib/formato";
import BotonEliminar from "./BotonEliminar";

const ETIQUETA_ESTADO: Record<EstadoFactura, string> = {
  pendiente_revision: "Pendiente",
  confirmada: "Confirmada",
  descartada: "Descartada",
};

const COLOR_ESTADO: Record<EstadoFactura, string> = {
  pendiente_revision: "bg-amber-100 text-amber-800",
  confirmada: "bg-emerald-100 text-emerald-800",
  descartada: "bg-slate-200 text-slate-600",
};

export default async function ListaPage({
  searchParams,
}: {
  searchParams: Promise<{ proveedor?: string; desde?: string; hasta?: string; estado?: string }>;
}) {
  const p = await searchParams;
  const facturas = await listarFacturas({
    proveedor: p.proveedor,
    desde: p.desde,
    hasta: p.hasta,
    estado: p.estado as EstadoFactura | undefined,
  });

  const total = facturas
    .filter((f) => f.estado === "confirmada")
    .reduce((s, f) => s + (aNumero(f.total) ?? 0), 0);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-4">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Facturas</h1>
          <p className="text-sm text-slate-500">
            {facturas.length} registro{facturas.length === 1 ? "" : "s"} · Confirmadas:{" "}
            {aMoneda(total, "HNL")}
          </p>
        </div>
        <Link
          href="/"
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          Tomar foto
        </Link>
      </header>

      <form className="mb-4 grid gap-2 sm:grid-cols-4">
        <input
          name="proveedor"
          defaultValue={p.proveedor}
          placeholder="Proveedor"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="date"
          name="desde"
          defaultValue={p.desde}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="date"
          name="hasta"
          defaultValue={p.hasta}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          name="estado"
          defaultValue={p.estado ?? ""}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Todos los estados</option>
          <option value="pendiente_revision">Pendientes</option>
          <option value="confirmada">Confirmadas</option>
          <option value="descartada">Descartadas</option>
        </select>
        <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-4">
          Filtrar
        </button>
      </form>

      {facturas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-slate-500">
          Todavía no hay facturas. Toma la primera foto.
        </p>
      ) : (
        <ul className="space-y-2">
          {facturas.map((f) => (
            <li key={f.id} className="flex items-stretch gap-2">
              <Link
                href={`/facturas/${f.id}`}
                className="flex min-w-0 flex-1 items-center justify-between gap-4 rounded-xl border
                           border-slate-200 bg-white p-4 hover:border-slate-400"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {f.proveedor_nombre ?? "Proveedor no leído"}
                  </p>
                  <p className="truncate text-sm text-slate-500">
                    {f.numero_factura ?? "sin número"} ·{" "}
                    {aFechaISO(f.fecha_emision) || "sin fecha"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold tabular-nums">{aMoneda(f.total, f.moneda)}</p>
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 text-[10px] ${
                      COLOR_ESTADO[f.estado]
                    }`}
                  >
                    {ETIQUETA_ESTADO[f.estado]}
                  </span>
                </div>
              </Link>
              <BotonEliminar
                id={f.id}
                descripcion={`${f.proveedor_nombre ?? "Proveedor no leído"} · ${
                  f.numero_factura ?? "sin número"
                } · ${aMoneda(f.total, f.moneda)}`}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

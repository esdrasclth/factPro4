"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Botón de papelera para una fila de la lista. Abre un diálogo propio (no
 * window.confirm) para que en el teléfono quede claro qué factura se borra.
 */
export default function BotonEliminar({
  id,
  descripcion,
}: {
  id: string;
  descripcion: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cerrar() {
    if (eliminando) return;
    setAbierto(false);
    setError(null);
  }

  async function eliminar() {
    setEliminando(true);
    setError(null);

    const res = await fetch(`/api/facturas/${id}`, { method: "DELETE" });

    if (res.ok) {
      setAbierto(false);
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "No se pudo eliminar");
    }
    setEliminando(false);
  }

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        aria-label={`Eliminar ${descripcion}`}
        title="Eliminar"
        className="shrink-0 rounded-xl border border-slate-200 bg-white p-3 text-slate-400
                   hover:border-red-300 hover:text-red-600"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12M9 7V4h6v3"
          />
        </svg>
      </button>

      {abierto && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
          onClick={cerrar}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={`eliminar-${id}`}
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id={`eliminar-${id}`} className="font-semibold">
              ¿Está seguro que desea eliminar esta factura?
            </h2>
            <p className="mt-1 text-sm text-slate-600">{descripcion}</p>
            <p className="mt-3 text-sm text-slate-500">
              Se borrarán sus datos y la foto. Esta acción no se puede deshacer.
            </p>

            {error && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            <div className="mt-5 flex gap-2">
              <button
                onClick={cerrar}
                disabled={eliminando}
                className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-slate-700 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                onClick={eliminar}
                disabled={eliminando}
                className="flex-1 rounded-xl bg-red-600 px-4 py-3 font-medium text-white disabled:opacity-40"
              >
                {eliminando ? "Eliminando…" : "Sí, eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

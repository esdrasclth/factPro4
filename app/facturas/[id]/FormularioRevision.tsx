"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Factura } from "@/lib/db";
import { aFechaISO } from "@/lib/formato";

type TipoCampo = "texto" | "fecha" | "monto";

/**
 * El cuarto elemento marca campos que SIEMPRE hay que verificar a ojo.
 *
 * Hoy solo el CAI. No es una corazonada: en las pruebas contra la factura de
 * fixtures/, los cuatro modelos evaluados (gpt-4.1-mini, gpt-4.1, gpt-5.4-mini,
 * gpt-5.4) acertaron entre 18 y 19 de 20 campos, y TODOS fallaron el CAI —
 * normalmente por uno o dos caracteres. Es una cadena hexadecimal sin
 * redundancia ni dígito verificador, impresa en letra diminuta: no hay forma
 * de validarla por software ni de detectar el error por aritmética.
 */
const GRUPOS: {
  titulo: string;
  campos: [keyof Factura, string, TipoCampo, boolean?][];
}[] = [
  {
    titulo: "Proveedor",
    campos: [
      ["proveedor_nombre", "Nombre", "texto"],
      ["proveedor_rtn", "RTN", "texto"],
      ["proveedor_direccion", "Dirección", "texto"],
    ],
  },
  {
    titulo: "Identificación fiscal",
    campos: [
      ["numero_factura", "N.º de factura", "texto"],
      ["cai", "CAI", "texto", true],
      ["rango_autorizado_desde", "Rango desde", "texto"],
      ["rango_autorizado_hasta", "Rango hasta", "texto"],
      ["fecha_limite_emision", "Fecha límite de emisión", "fecha"],
    ],
  },
  {
    titulo: "Documento",
    campos: [
      ["fecha_emision", "Fecha de emisión", "fecha"],
      ["cliente_nombre", "Cliente", "texto"],
      ["cliente_rtn", "RTN del cliente", "texto"],
      ["moneda", "Moneda", "texto"],
    ],
  },
  {
    titulo: "Montos",
    campos: [
      ["subtotal", "Subtotal", "monto"],
      ["descuentos", "Descuentos", "monto"],
      ["importe_exento", "Exento", "monto"],
      ["importe_exonerado", "Exonerado", "monto"],
      ["importe_gravado_15", "Gravado 15%", "monto"],
      ["importe_gravado_18", "Gravado 18%", "monto"],
      ["isv_15", "ISV 15%", "monto"],
      ["isv_18", "ISV 18%", "monto"],
      ["total", "Total", "monto"],
    ],
  },
];

type Valores = Record<string, string>;

function aTexto(v: unknown, tipo: "texto" | "fecha" | "monto"): string {
  if (v === null || v === undefined) return "";
  // <input type="date"> solo acepta YYYY-MM-DD; el driver devuelve Date.
  if (tipo === "fecha") return aFechaISO(v);
  return String(v);
}

export default function FormularioRevision({ factura }: { factura: Factura }) {
  const router = useRouter();

  const inicial = useMemo<Valores>(() => {
    const v: Valores = {};
    for (const g of GRUPOS) {
      for (const [campo, , tipo] of g.campos) {
        v[campo] = aTexto(factura[campo], tipo);
      }
    }
    return v;
  }, [factura]);

  const [valores, setValores] = useState<Valores>(inicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Borrar no se deshace (se va también la foto del bucket): pide un segundo toque.
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);

  /**
   * Validación aritmética: es el detector de errores de extracción más barato.
   * Si el modelo leyó mal un dígito de un monto, casi siempre deja de cuadrar.
   *
   * En una factura del SAR la partición de la base ya viene NETA de descuentos:
   *
   *   Subtotal − Descuentos = Exento + Exonerado + Gravado15 + Gravado18
   *   Total                 = esa partición + ISV15 + ISV18
   *
   * Por eso, cuando hay partición no se resta el descuento (ya está aplicado);
   * restarlo otra vez lo contaría dos veces. Solo el camino alterno, el que
   * parte del subtotal bruto, necesita restarlo.
   */
  const cuadre = useMemo(() => {
    const num = (c: string) => {
      const n = parseFloat(valores[c]);
      return Number.isFinite(n) ? n : 0;
    };

    const total = parseFloat(valores.total);
    if (!Number.isFinite(total)) return null;

    const isv = num("isv_15") + num("isv_18");
    const particion =
      num("importe_exento") +
      num("importe_exonerado") +
      num("importe_gravado_15") +
      num("importe_gravado_18");

    // Con partición: ya es neta, no se resta descuento.
    // Sin ella: se parte del subtotal bruto y sí hay que restarlo.
    const calculado =
      particion > 0 ? particion + isv : num("subtotal") - num("descuentos") + isv;

    if (calculado === 0) return null;

    const dif = Math.round((calculado - total) * 100) / 100;
    return { calculado: Math.round(calculado * 100) / 100, total, dif, ok: Math.abs(dif) < 0.02 };
  }, [valores]);

  const cambiados = useMemo(
    () => Object.keys(valores).filter((c) => valores[c] !== inicial[c]),
    [valores, inicial]
  );

  async function guardar(estado: "confirmada" | "descartada") {
    setGuardando(true);
    setError(null);

    const datos: Record<string, string | number | null> = {};
    for (const g of GRUPOS) {
      for (const [campo, , tipo] of g.campos) {
        const bruto = valores[campo as string].trim();
        if (bruto === "") {
          datos[campo as string] = null;
        } else if (tipo === "monto") {
          const n = parseFloat(bruto);
          datos[campo as string] = Number.isFinite(n) ? n : null;
        } else {
          datos[campo as string] = bruto;
        }
      }
    }

    const res = await fetch(`/api/facturas/${factura.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ datos, estado }),
    });

    if (res.ok) {
      router.push("/facturas");
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "No se pudo guardar");
      setGuardando(false);
    }
  }

  async function eliminar() {
    setGuardando(true);
    setError(null);

    const res = await fetch(`/api/facturas/${factura.id}`, { method: "DELETE" });

    if (res.ok) {
      router.push("/facturas");
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "No se pudo eliminar");
      setGuardando(false);
      setConfirmarEliminar(false);
    }
  }

  return (
    <div className="space-y-6">
      {factura.extraccion_error && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          La extracción automática falló ({factura.extraccion_error}). La foto se guardó;
          puedes llenar los datos a mano.
        </div>
      )}

      {GRUPOS.map((g) => (
        <fieldset key={g.titulo} className="space-y-3">
          <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {g.titulo}
          </legend>

          <div className="grid gap-3 sm:grid-cols-2">
            {g.campos.map(([campo, etiqueta, tipo, verificar]) => {
              const nombre = campo as string;
              const vacio = valores[nombre] === "";
              const editado = valores[nombre] !== inicial[nombre];

              return (
                <label key={nombre} className="block">
                  <span className="mb-1 flex items-center gap-2 text-sm text-slate-600">
                    {etiqueta}
                    {vacio && (
                      <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">
                        no leído
                      </span>
                    )}
                    {editado && (
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700">
                        corregido
                      </span>
                    )}
                    {verificar && !vacio && !editado && (
                      <span
                        className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] text-orange-700"
                        title="Los modelos de visión fallan este campo casi siempre. Compáralo carácter por carácter con la foto."
                      >
                        verificar
                      </span>
                    )}
                  </span>
                  <input
                    type={tipo === "fecha" ? "date" : tipo === "monto" ? "number" : "text"}
                    step={tipo === "monto" ? "0.01" : undefined}
                    inputMode={tipo === "monto" ? "decimal" : undefined}
                    value={valores[nombre]}
                    onChange={(e) =>
                      setValores((v) => ({ ...v, [nombre]: e.target.value }))
                    }
                    // Monoespaciada en los campos a verificar: comparar una
                    // cadena hexadecimal contra la foto es mucho más fácil
                    // cuando los caracteres se alinean.
                    className={`w-full rounded-lg border px-3 py-2 text-base focus:outline-none
                      ${editado ? "border-blue-400 bg-blue-50/40" : "border-slate-300"}
                      ${verificar ? "font-mono tracking-tight" : ""}
                      focus:border-slate-900`}
                  />
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      {cuadre && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            cuadre.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
          }`}
        >
          {cuadre.ok ? (
            <>Los montos cuadran: {cuadre.total.toFixed(2)}</>
          ) : (
            <>
              Los montos no cuadran. Suma de partidas: {cuadre.calculado.toFixed(2)} ·
              Total leído: {cuadre.total.toFixed(2)} · Diferencia: {cuadre.dif.toFixed(2)}
            </>
          )}
        </div>
      )}

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <p className="mb-2 text-xs text-slate-500">
          {cambiados.length === 0
            ? "Sin correcciones"
            : `${cambiados.length} campo${cambiados.length === 1 ? "" : "s"} corregido${
                cambiados.length === 1 ? "" : "s"
              }`}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => guardar("confirmada")}
            disabled={guardando}
            className="flex-1 rounded-xl bg-slate-900 px-4 py-3 font-medium text-white disabled:opacity-40"
          >
            {guardando ? "Guardando…" : "Confirmar"}
          </button>
          <button
            onClick={() => guardar("descartada")}
            disabled={guardando}
            className="rounded-xl border border-slate-300 px-4 py-3 text-slate-600 disabled:opacity-40"
          >
            Descartar
          </button>
        </div>

        {confirmarEliminar ? (
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            <span className="flex-1">¿Está seguro que desea eliminar esta factura y su foto? No se puede deshacer.</span>
            <button
              onClick={eliminar}
              disabled={guardando}
              className="rounded-lg bg-red-600 px-3 py-1.5 font-medium text-white disabled:opacity-40"
            >
              {guardando ? "Eliminando…" : "Eliminar"}
            </button>
            <button
              onClick={() => setConfirmarEliminar(false)}
              disabled={guardando}
              className="rounded-lg px-2 py-1.5 text-red-700 disabled:opacity-40"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmarEliminar(true)}
            disabled={guardando}
            className="mt-2 w-full py-1 text-sm text-red-600 disabled:opacity-40"
          >
            Eliminar factura
          </button>
        )}
      </div>
    </div>
  );
}

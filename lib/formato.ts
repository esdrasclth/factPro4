/**
 * Helpers de formato compartidos entre el listado y el formulario de revisión.
 *
 * El driver de Neon devuelve las columnas `date` como objetos Date y las
 * `numeric` como string. Convertir en cada punto de uso es justo donde se
 * cuelan los bugs, así que la conversión vive aquí.
 */

/** Fecha en YYYY-MM-DD, que es lo que espera <input type="date">. */
export function aFechaISO(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";

  if (v instanceof Date) {
    // getUTC*, no getFullYear: la fecha viene sin hora y el desfase horario
    // de Honduras (UTC-6) haría que se muestre el día anterior.
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    const d = String(v.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const s = String(v);
  // Ya viene ISO (con o sin hora).
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : s;
}

/** Número desde numeric (string), number o null. */
export function aNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/** Monto con símbolo de moneda hondureña o dólar. */
export function aMoneda(v: unknown, codigo: string | null | undefined): string {
  const n = aNumero(v);
  if (n === null) return "—";
  return `${codigo === "USD" ? "$" : "L"} ${n.toLocaleString("es-HN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

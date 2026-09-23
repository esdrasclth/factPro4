import { neon } from "@neondatabase/serverless";
import { CAMPOS_FACTURA, type FacturaExtraida } from "./extraccion/tipos";
import { aFechaISO } from "./formato";

if (!process.env.DATABASE_URL) {
  throw new Error("Falta DATABASE_URL. Corre `neon env pull` o revisa .env.local");
}

export const sql = neon(process.env.DATABASE_URL);

export type EstadoFactura = "pendiente_revision" | "confirmada" | "descartada";

export interface Factura extends FacturaExtraida {
  id: string;
  imagen_key: string;
  estado: EstadoFactura;
  extraccion_raw: unknown;
  extraccion_modelo: string | null;
  extraccion_ms: number | null;
  extraccion_error: string | null;
  campos_corregidos: string[];
  creado_en: string;
  actualizado_en: string;
}

/** Columnas que el modelo llena. Se listan una vez y se reutilizan en INSERT/UPDATE. */
const COLS = CAMPOS_FACTURA as string[];

export async function crearFactura(entrada: {
  datos: FacturaExtraida;
  imagen_key: string;
  extraccion_raw: unknown;
  extraccion_modelo: string | null;
  extraccion_ms: number | null;
  extraccion_error: string | null;
}): Promise<Factura> {
  const columnas = [
    ...COLS,
    "imagen_key",
    "extraccion_raw",
    "extraccion_modelo",
    "extraccion_ms",
    "extraccion_error",
  ];
  const valores = [
    ...COLS.map((c) => entrada.datos[c as keyof FacturaExtraida] ?? null),
    entrada.imagen_key,
    JSON.stringify(entrada.extraccion_raw ?? null),
    entrada.extraccion_modelo,
    entrada.extraccion_ms,
    entrada.extraccion_error,
  ];
  const placeholders = columnas.map((_, i) => `$${i + 1}`).join(", ");

  const filas = (await sql.query(
    `insert into facturas (${columnas.join(", ")})
     values (${placeholders})
     returning *`,
    valores
  )) as Factura[];

  return filas[0];
}

/** 23505 = unique_violation. Es el índice (cai, numero_factura) rechazando un duplicado. */
export function esViolacionUnicidad(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && e.code === "23505";
}

/**
 * La factura ya capturada que provocó el choque de unicidad.
 *
 * Hay dos índices posibles — (proveedor_rtn, numero_factura), el principal, y
 * (cai, numero_factura) para cuando el RTN no se leyó — así que se prueban los
 * dos en ese orden.
 */
export async function buscarDuplicada(datos: {
  proveedor_rtn: string | null;
  cai: string | null;
  numero_factura: string | null;
}): Promise<Factura | null> {
  const { proveedor_rtn, cai, numero_factura } = datos;
  if (!numero_factura) return null;

  if (proveedor_rtn) {
    const filas = (await sql.query(
      `select * from facturas where proveedor_rtn = $1 and numero_factura = $2 limit 1`,
      [proveedor_rtn, numero_factura]
    )) as Factura[];
    if (filas[0]) return filas[0];
  }

  if (cai) {
    const filas = (await sql.query(
      `select * from facturas where cai = $1 and numero_factura = $2 limit 1`,
      [cai, numero_factura]
    )) as Factura[];
    if (filas[0]) return filas[0];
  }

  return null;
}

export async function obtenerFactura(id: string): Promise<Factura | null> {
  const filas = (await sql.query(`select * from facturas where id = $1`, [id])) as Factura[];
  return filas[0] ?? null;
}

/**
 * Borra la fila y devuelve la key de su imagen, para que quien llama borre
 * también el archivo del bucket. null si la factura no existía.
 */
export async function eliminarFactura(id: string): Promise<{ imagen_key: string } | null> {
  const filas = (await sql.query(
    `delete from facturas where id = $1 returning imagen_key`,
    [id]
  )) as { imagen_key: string }[];
  return filas[0] ?? null;
}

export interface FiltrosFactura {
  proveedor?: string;
  desde?: string;
  hasta?: string;
  estado?: EstadoFactura;
}

export async function listarFacturas(f: FiltrosFactura = {}): Promise<Factura[]> {
  const cond: string[] = [];
  const val: unknown[] = [];

  if (f.proveedor) {
    val.push(`%${f.proveedor}%`);
    cond.push(`proveedor_nombre ilike $${val.length}`);
  }
  if (f.desde) {
    val.push(f.desde);
    cond.push(`fecha_emision >= $${val.length}`);
  }
  if (f.hasta) {
    val.push(f.hasta);
    cond.push(`fecha_emision <= $${val.length}`);
  }
  if (f.estado) {
    val.push(f.estado);
    cond.push(`estado = $${val.length}`);
  }

  const where = cond.length ? `where ${cond.join(" and ")}` : "";
  return (await sql.query(
    `select * from facturas ${where} order by creado_en desc limit 500`,
    val
  )) as Factura[];
}

/**
 * ¿El humano realmente cambió este valor?
 *
 * Hay que normalizar antes de comparar, porque los dos lados llegan en
 * formatos distintos: Postgres devuelve `date` como Date y `numeric` como
 * string con decimales fijos ("1000.00"), mientras que el formulario manda
 * "2026-09-14" y 1000. Comparar en crudo marcaría como corregidos campos que
 * nadie tocó, y eso arruinaría la métrica de precisión del prototipo.
 */
function cambioReal(previo: unknown, nuevo: unknown): boolean {
  if (previo === null && nuevo === null) return false;
  if (previo === null || nuevo === null) return true;

  if (previo instanceof Date || nuevo instanceof Date) {
    return aFechaISO(previo) !== aFechaISO(nuevo);
  }

  const a = Number(previo);
  const b = Number(nuevo);
  if (Number.isFinite(a) && Number.isFinite(b) && String(previo).trim() !== "") {
    // Tolerancia de medio centavo: numeric(14,2) redondea.
    return Math.abs(a - b) > 0.005;
  }

  return String(previo).trim() !== String(nuevo).trim();
}

/**
 * Guarda las correcciones del humano y registra qué campos cambió.
 * Ese registro es la métrica del prototipo: dice qué falla el modelo.
 */
export async function actualizarFactura(
  id: string,
  datos: Partial<FacturaExtraida>,
  estado?: EstadoFactura
): Promise<Factura | null> {
  const actual = await obtenerFactura(id);
  if (!actual) return null;

  const corregidos = new Set(actual.campos_corregidos ?? []);
  const sets: string[] = [];
  const val: unknown[] = [];

  for (const campo of COLS) {
    if (!(campo in datos)) continue;

    const nuevo = datos[campo as keyof FacturaExtraida] ?? null;
    const previo = actual[campo as keyof FacturaExtraida] ?? null;

    if (cambioReal(previo, nuevo)) {
      corregidos.add(campo);
    }

    val.push(nuevo);
    sets.push(`${campo} = $${val.length}`);
  }

  val.push(Array.from(corregidos));
  sets.push(`campos_corregidos = $${val.length}`);

  if (estado) {
    val.push(estado);
    sets.push(`estado = $${val.length}`);
  }

  val.push(id);
  const filas = (await sql.query(
    `update facturas set ${sets.join(", ")} where id = $${val.length} returning *`,
    val
  )) as Factura[];

  return filas[0] ?? null;
}

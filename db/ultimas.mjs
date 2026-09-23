// Últimas facturas con su resultado de extracción.
// Uso: node --env-file=.env.local db/ultimas.mjs
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const filas = await sql`
  select creado_en, estado, extraccion_modelo, extraccion_error,
         proveedor_nombre, total, cai, numero_factura
  from facturas
  order by creado_en desc
  limit 5`;

for (const f of filas) {
  console.log(
    `${f.creado_en.toISOString()} | ${f.estado} | modelo=${f.extraccion_modelo}\n` +
      `    proveedor=${f.proveedor_nombre ?? "null"} | total=${f.total ?? "null"}\n` +
      `    numero=${f.numero_factura ?? "null"} | cai=${f.cai ?? "null"}`
  );
  if (f.extraccion_error) console.log(`    ERROR: ${f.extraccion_error}`);
}

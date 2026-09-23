// Verificación rápida del esquema. Uso: node --env-file=.env.local db/check.mjs
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

const cols = await sql`
  select column_name, data_type
  from information_schema.columns
  where table_name = 'facturas'
  order by ordinal_position`;
console.log(`facturas: ${cols.length} columnas`);

const idx = await sql`select indexname from pg_indexes where tablename = 'facturas'`;
console.log("indices:", idx.map((r) => r.indexname).join(", "));

const [{ count }] = await sql`select count(*)::int as count from facturas`;
console.log("filas:", count);

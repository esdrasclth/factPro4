// Métrica del prototipo: ¿qué campos falla el modelo?
// Uso: node --env-file=.env.local db/precision.mjs
//
// Solo cuenta facturas confirmadas, porque una confirmación significa que un
// humano ya revisó campo por campo. Los campos que tuvo que corregir son, por
// definición, los que el modelo leyó mal.
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

const [{ total }] = await sql`
  select count(*)::int as total from facturas where estado = 'confirmada'`;

if (total === 0) {
  console.log("Todavía no hay facturas confirmadas. Captura y confirma algunas primero.");
  process.exit(0);
}

const [{ perfectas }] = await sql`
  select count(*)::int as perfectas
  from facturas
  where estado = 'confirmada' and cardinality(campos_corregidos) = 0`;

console.log(`Facturas confirmadas: ${total}`);
console.log(
  `Sin ninguna corrección: ${perfectas} (${((perfectas / total) * 100).toFixed(1)}%)\n`
);

const fallos = await sql`
  select campo, count(*)::int as veces
  from facturas, unnest(campos_corregidos) as campo
  where estado = 'confirmada'
  group by campo
  order by veces desc`;

if (fallos.length === 0) {
  console.log("Ningún campo necesitó corrección.");
} else {
  console.log("Campos corregidos con más frecuencia:");
  const ancho = Math.max(...fallos.map((f) => f.campo.length));
  for (const f of fallos) {
    const pct = ((f.veces / total) * 100).toFixed(0);
    const barra = "#".repeat(Math.round((f.veces / total) * 30));
    console.log(`  ${f.campo.padEnd(ancho)}  ${String(f.veces).padStart(3)}  ${pct.padStart(3)}%  ${barra}`);
  }
}

const [tiempos] = await sql`
  select round(avg(extraccion_ms))::int as promedio,
         max(extraccion_ms) as maximo
  from facturas
  where extraccion_ms is not null`;

if (tiempos?.promedio) {
  console.log(`\nTiempo de extracción: ${tiempos.promedio} ms promedio, ${tiempos.maximo} ms máximo`);
}

// Borra TODAS las facturas y sus imágenes del bucket.
// Uso: node --env-file=.env.local db/limpiar.mjs --si
//
// Pensado para dejar la base limpia después de las pruebas de humo. Exige la
// bandera --si para que no se ejecute por accidente.
import { neon } from "@neondatabase/serverless";
import { Files } from "files-sdk";
import { neon as adaptadorNeon } from "files-sdk/neon";

if (!process.argv.includes("--si")) {
  console.error("Esto borra TODAS las facturas. Si es lo que quieres: node db/limpiar.mjs --si");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const files = new Files({ adapter: adaptadorNeon({ bucket: "facturas" }) });

const filas = await sql`select id, imagen_key from facturas`;
console.log(`Borrando ${filas.length} facturas…`);

for (const f of filas) {
  try {
    await files.delete(f.imagen_key);
  } catch (e) {
    console.warn(`  imagen ${f.imagen_key}: ${e.message}`);
  }
}

await sql`delete from facturas`;
console.log("Listo.");

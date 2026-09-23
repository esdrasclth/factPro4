// Aplica los .sql de db/migrations en orden alfabético contra DATABASE_URL.
// Uso: node --env-file=.env.local db/migrate.mjs
//
// Usa el driver HTTP de Neon, que solo acepta UNA sentencia por llamada, así
// que el archivo se divide antes. El split reconoce cadenas, comentarios y
// dollar-quoting ($$ ... $$), porque los cuerpos de función llevan ';' dentro.
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

function dividirSentencias(sql) {
  const out = [];
  let buf = "";
  let i = 0;
  let tag = null; // etiqueta dollar-quote activa, p.ej. "$$" o "$fn$"

  while (i < sql.length) {
    const rest = sql.slice(i);

    if (tag) {
      if (rest.startsWith(tag)) {
        buf += tag;
        i += tag.length;
        tag = null;
      } else {
        buf += sql[i++];
      }
      continue;
    }

    const dollar = /^\$[A-Za-z_]*\$/.exec(rest);
    if (dollar) {
      tag = dollar[0];
      buf += tag;
      i += tag.length;
      continue;
    }

    if (rest.startsWith("--")) {
      const fin = sql.indexOf("\n", i);
      i = fin === -1 ? sql.length : fin;
      continue;
    }

    if (rest.startsWith("/*")) {
      const fin = sql.indexOf("*/", i + 2);
      i = fin === -1 ? sql.length : fin + 2;
      continue;
    }

    if (sql[i] === "'" || sql[i] === '"') {
      const comilla = sql[i];
      buf += sql[i++];
      while (i < sql.length) {
        buf += sql[i];
        if (sql[i] === comilla) {
          if (sql[i + 1] === comilla) buf += sql[++i]; // comilla escapada
          else { i++; break; }
        }
        i++;
      }
      continue;
    }

    if (sql[i] === ";") {
      if (buf.trim()) out.push(buf.trim());
      buf = "";
      i++;
      continue;
    }

    buf += sql[i++];
  }

  if (buf.trim()) out.push(buf.trim());
  return out;
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "migrations");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("Falta DATABASE_URL (usa --env-file=.env.local)");

const sql = neon(url);

for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  const sentencias = dividirSentencias(readFileSync(join(dir, file), "utf8"));
  process.stdout.write(`-> ${file} (${sentencias.length} sentencias) ... `);
  for (const s of sentencias) {
    try {
      await sql.query(s);
    } catch (e) {
      console.log("FALLO");
      console.error(`\nSentencia:\n${s}\n\n${e.message}`);
      process.exit(1);
    }
  }
  console.log("ok");
}
console.log("Migraciones aplicadas.");

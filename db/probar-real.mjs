// Sube la factura de prueba por la API real y compara con lo esperado.
// Uso: node --env-file=.env.local db/probar-real.mjs [baseUrl]
//
// A diferencia de benchmark.mjs (que llama al SDK directo), esto ejercita la
// ruta completa: auth -> bucket -> extractor configurado -> BD.
import { readFileSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3000";
const imagen = readFileSync("fixtures/factura-prueba.png");
const esperado = JSON.parse(readFileSync("fixtures/factura-prueba.esperado.json", "utf8"));
// Las claves que empiezan con _ son metadatos del fixture, no campos a comparar.
for (const k of Object.keys(esperado)) if (k.startsWith("_")) delete esperado[k];

const login = await fetch(`${base}/api/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ password: process.env.APP_PASSWORD }),
});
if (!login.ok) throw new Error(`Login falló: ${login.status}`);
const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

const form = new FormData();
form.append("imagen", new Blob([imagen], { type: "image/png" }), "factura.png");

const t0 = Date.now();
const res = await fetch(`${base}/api/facturas`, { method: "POST", body: form, headers: { cookie } });
const json = await res.json();
const ms = Date.now() - t0;

if (res.status === 409) {
  console.log("Ya estaba capturada (409). Borra con `npm run db:limpiar -- --si` para repetir.");
  process.exit(0);
}
if (!res.ok) throw new Error(`${res.status}: ${json.error}`);

const f = json.factura;
if (f.extraccion_error) {
  console.error(`EXTRACCIÓN FALLÓ: ${f.extraccion_error}`);
  process.exit(1);
}

function iguales(a, b) {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  if (typeof b === "number") return Math.abs(Number(a) - Number(b)) < 0.005;
  return String(a).trim().toUpperCase() === String(b).trim().toUpperCase();
}

const norm = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v);

let aciertos = 0;
const ancho = Math.max(...Object.keys(esperado).map((c) => c.length));
console.log(`Modelo: ${f.extraccion_modelo}  |  ${(f.extraccion_ms / 1000).toFixed(1)}s extracción, ${(ms / 1000).toFixed(1)}s total\n`);

for (const [campo, valor] of Object.entries(esperado)) {
  const obtenido = norm(f[campo] === null ? null : String(f[campo]).slice(0, 10).match(/^\d{4}-\d{2}-\d{2}$/) ? String(f[campo]).slice(0, 10) : f[campo]);
  const ok = iguales(obtenido, valor);
  if (ok) aciertos++;
  console.log(
    `${ok ? "OK  " : "MAL "} ${campo.padEnd(ancho)}  ${ok ? String(valor) : `esperado ${JSON.stringify(valor)} / obtuvo ${JSON.stringify(obtenido)}`}`
  );
}

const total = Object.keys(esperado).length;
console.log(`\n${aciertos}/${total} campos correctos (${((aciertos / total) * 100).toFixed(0)}%)`);
console.log(`Revisar en: ${base}/facturas/${f.id}`);

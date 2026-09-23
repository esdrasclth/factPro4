// Prueba de humo del flujo completo contra el servidor de desarrollo.
// Uso: node --env-file=.env.local db/smoke.mjs [baseUrl]
//
// Ejercita: login -> subida -> extracción -> fila en BD -> lectura -> corrección.
const base = process.argv[2] ?? "http://localhost:3000";
const password = process.env.APP_PASSWORD;

// Esta prueba sube un JPEG de 1x1 en blanco: con un modelo real no hay nada
// que leer y todos los campos saldrían null, así que los asserts fallarían
// por el motivo equivocado. Para probar la extracción real está probar-real.mjs.
if ((process.env.EXTRACCION_PROVIDER ?? "mock") !== "mock") {
  console.error(
    `La prueba de humo necesita EXTRACCION_PROVIDER=mock (ahora: ${process.env.EXTRACCION_PROVIDER}).\n` +
      `El servidor también debe estar en mock. Para el modelo real usa:\n` +
      `  npm run probar-real`
  );
  process.exit(1);
}

// JPEG mínimo válido de 1x1. El mock no mira el contenido, pero el endpoint
// sí valida el tipo MIME y el bucket guarda bytes reales.
const JPEG_1X1 = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==",
  "base64"
);

// El mock extrae de forma determinista a partir de los bytes, así que cada
// corrida necesita una imagen distinta para no chocar con el índice único de
// la corrida anterior. Los bytes extra van después del marcador EOI del JPEG,
// donde ningún decodificador los mira.
const IMAGEN = Buffer.concat([JPEG_1X1, Buffer.from(crypto.randomUUID())]);

function nuevoForm() {
  const f = new FormData();
  f.append("imagen", new Blob([IMAGEN], { type: "image/jpeg" }), "factura.jpg");
  return f;
}

function ok(etiqueta, condicion, extra = "") {
  console.log(`${condicion ? "PASA" : "FALLA"}  ${etiqueta}${extra ? ` - ${extra}` : ""}`);
  if (!condicion) process.exitCode = 1;
}

// 1. Sin sesión, la API debe rechazar.
const sinSesion = await fetch(`${base}/api/facturas`);
ok("API protegida sin cookie", sinSesion.status === 401, `status ${sinSesion.status}`);

// 2. Contraseña incorrecta.
const malPass = await fetch(`${base}/api/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ password: "incorrecta" }),
});
ok("Rechaza contraseña incorrecta", malPass.status === 401, `status ${malPass.status}`);

// 3. Login correcto.
const login = await fetch(`${base}/api/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ password }),
});
ok("Login correcto", login.ok, `status ${login.status}`);

const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
ok("Devuelve cookie de sesión", Boolean(cookie));

// 4. Subida + extracción.
const subida = await fetch(`${base}/api/facturas`, {
  method: "POST",
  body: nuevoForm(),
  headers: { cookie },
});
const { factura, error } = await subida.json();
ok("Sube y procesa la factura", subida.status === 201, error ?? `status ${subida.status}`);
if (!factura) { console.error("Sin factura, se detiene."); process.exit(1); }

ok("Guardó la imagen en el bucket", Boolean(factura.imagen_key), factura.imagen_key);
ok("Extrajo el proveedor", Boolean(factura.proveedor_nombre), factura.proveedor_nombre);
ok("Extrajo el total", factura.total !== null, String(factura.total));
ok("Estado inicial pendiente", factura.estado === "pendiente_revision", factura.estado);
ok("Registró el modelo", Boolean(factura.extraccion_modelo), factura.extraccion_modelo);

// 5. Lectura con URL prefirmada.
const det = await fetch(`${base}/api/facturas/${factura.id}`, { headers: { cookie } });
const { imagen_url } = await det.json();
ok("Devuelve URL prefirmada", det.ok && String(imagen_url).includes("X-Amz-Signature"));

const img = await fetch(imagen_url);
ok("La URL prefirmada descarga la imagen", img.ok && img.headers.get("content-type")?.includes("image"));

// 6. Una fecha con formato inválido debe dar 400, no un 500 de Postgres.
const fechaMala = await fetch(`${base}/api/facturas/${factura.id}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json", cookie },
  body: JSON.stringify({ datos: { fecha_emision: "05/03/2026" } }),
});
ok("Rechaza fecha con formato inválido", fechaMala.status === 400, `status ${fechaMala.status}`);

// 7. Reenviar los MISMOS valores no debe marcar nada como corregido.
//    Postgres devuelve date como Date y numeric como "1000.00"; el formulario
//    manda "2026-09-14" y 1000. Sin normalizar, todo saldría "corregido" y la
//    métrica de precisión del prototipo quedaría inservible.
const sinCambios = await fetch(`${base}/api/facturas/${factura.id}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json", cookie },
  body: JSON.stringify({
    datos: {
      fecha_emision: String(factura.fecha_emision).slice(0, 10),
      fecha_limite_emision: String(factura.fecha_limite_emision).slice(0, 10),
      total: Number(factura.total),
      subtotal: Number(factura.subtotal),
      isv_15: Number(factura.isv_15),
      proveedor_nombre: factura.proveedor_nombre,
    },
  }),
});
const { factura: igual } = await sinCambios.json();
ok(
  "Reenviar los mismos valores no marca correcciones",
  (igual?.campos_corregidos ?? []).length === 0,
  JSON.stringify(igual?.campos_corregidos)
);

// 8. Subir la MISMA imagen otra vez debe dar 409 y apuntar a la existente.
//    El mock es determinista según los bytes, así que la segunda subida extrae
//    el mismo CAI y número y choca contra el índice único — igual que
//    fotografiar dos veces la misma factura de papel.
//    Antes, el catch de la extracción también atrapaba el error del INSERT y
//    guardaba un registro en blanco en lugar de avisar del duplicado.
const dupRes = await fetch(`${base}/api/facturas`, {
  method: "POST",
  body: nuevoForm(),
  headers: { cookie },
});
const dupJson = await dupRes.json();
ok("Detecta duplicado con 409", dupRes.status === 409, `status ${dupRes.status}`);
ok(
  "Devuelve la factura ya capturada",
  dupJson.factura?.id === factura.id,
  dupJson.factura?.id
);

// 9. Corrección: debe registrarse en campos_corregidos.
const patch = await fetch(`${base}/api/facturas/${factura.id}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json", cookie },
  body: JSON.stringify({
    datos: { proveedor_nombre: "Proveedor Corregido S.A.", total: 999.99 },
    estado: "confirmada",
  }),
});
const { factura: corregida } = await patch.json();
ok("Aplica la corrección", corregida?.proveedor_nombre === "Proveedor Corregido S.A.");
ok("Cambia a confirmada", corregida?.estado === "confirmada", corregida?.estado);
ok(
  "Registra qué campos se corrigieron",
  corregida?.campos_corregidos?.includes("proveedor_nombre") &&
    corregida?.campos_corregidos?.includes("total"),
  JSON.stringify(corregida?.campos_corregidos)
);

// 10. Listado y filtro.
const lista = await fetch(`${base}/api/facturas?estado=confirmada`, { headers: { cookie } });
const { facturas } = await lista.json();
ok("Lista filtrada por estado", facturas.some((f) => f.id === factura.id), `${facturas.length} filas`);

console.log(process.exitCode ? "\nHay fallos." : "\nTodo el flujo funciona.");

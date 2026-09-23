/**
 * Puerta de acceso del prototipo: una sola contraseña compartida.
 *
 * No es un sistema de usuarios — solo evita que un desconocido con el link
 * suba fotos y consuma créditos de IA. Cuando esto pase de prototipo, se
 * reemplaza por Neon Auth sin tocar el resto de la app.
 *
 * Usa Web Crypto (no node:crypto) porque el middleware corre en el runtime Edge.
 */

export const COOKIE_SESION = "factpro_sesion";
const DURACION_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

function secreto(): string {
  const s = process.env.APP_PASSWORD;
  if (!s) throw new Error("Falta APP_PASSWORD en las variables de entorno.");
  return s;
}

async function firmar(mensaje: string): Promise<string> {
  const clave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secreto()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const firma = await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(mensaje));
  return Array.from(new Uint8Array(firma))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Comparación en tiempo constante: evita filtrar la firma byte a byte. */
function igualesSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

export async function crearCookieSesion(): Promise<string> {
  const vence = String(Date.now() + DURACION_MS);
  return `${vence}.${await firmar(vence)}`;
}

export async function verificarSesion(cookie: string | undefined): Promise<boolean> {
  if (!cookie) return false;

  const corte = cookie.lastIndexOf(".");
  if (corte === -1) return false;

  const vence = cookie.slice(0, corte);
  const firma = cookie.slice(corte + 1);

  if (!igualesSeguro(firma, await firmar(vence))) return false;

  const ts = Number(vence);
  return Number.isFinite(ts) && ts > Date.now();
}

export async function passwordValida(intento: string): Promise<boolean> {
  return igualesSeguro(await firmar(intento), await firmar(secreto()));
}

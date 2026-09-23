import { Files } from "files-sdk";
import { neon } from "files-sdk/neon";
import { randomUUID } from "node:crypto";

/**
 * Neon Object Storage. Las credenciales (AWS_*) las inyecta `neon env pull` /
 * `neon deploy`, así que aquí solo se nombra el bucket.
 *
 * El bucket es privado: nunca se expone una URL directa, siempre prefirmada.
 */
const files = new Files({ adapter: neon({ bucket: "facturas" }) });

export async function subirImagen(imagen: Buffer, mime: string): Promise<string> {
  const ext = mime === "image/png" ? "png" : "jpg";
  const key = `facturas/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;
  await files.upload(key, imagen, { contentType: mime });
  return key;
}

/** URL temporal para mostrar la foto en la pantalla de revisión. */
export async function urlImagen(key: string, segundos = 3600): Promise<string> {
  return files.url(key, { expiresIn: segundos });
}

export async function borrarImagen(key: string): Promise<void> {
  await files.delete(key);
}

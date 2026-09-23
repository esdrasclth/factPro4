"use client";

/**
 * Comprime la foto en el navegador antes de subirla.
 *
 * Tres razones: la subida por datos móviles es mucho más rápida, el costo de
 * tokens del modelo baja, y el request se mantiene bajo el límite de ~4.5 MB
 * de las funciones serverless de Vercel.
 *
 * 1600px de lado mayor es el piso: por debajo se empiezan a perder el CAI y
 * los montos, que son el texto más pequeño de la factura.
 */
const LADO_MAX = 1600;
const CALIDAD = 0.8;

export async function comprimirImagen(archivo: File): Promise<Blob> {
  const bitmap = await createImageBitmap(archivo);

  const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.round(bitmap.width * escala);
  const alto = Math.round(bitmap.height * escala);

  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo obtener el contexto 2D del canvas.");

  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", CALIDAD)
  );
  if (!blob) throw new Error("No se pudo comprimir la imagen.");

  return blob;
}

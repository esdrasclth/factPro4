// Genera los iconos PNG de la PWA. Uso: node scripts/generar-iconos.mjs
//
// Escribe el PNG a mano con zlib (built-in) en vez de traer una dependencia
// de imágenes: son dos archivos estáticos que se generan una sola vez.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const FONDO = [15, 23, 42]; // slate-900
const TINTA = [255, 255, 255];

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

function png(ancho, alto, pixeles) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(pixeles, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Icono: documento blanco con renglones sobre fondo oscuro. */
function dibujar(tam) {
  // Una fila = 1 byte de filtro + ancho * 4 canales.
  const filas = Buffer.alloc(tam * (1 + tam * 4));

  const u = tam / 32; // unidad de rejilla, para que escale a cualquier tamaño
  const docX0 = 9 * u, docX1 = 23 * u;
  const docY0 = 6 * u, docY1 = 26 * u;
  const radio = 1.5 * u;

  const dentroDoc = (x, y) => {
    if (x < docX0 || x > docX1 || y < docY0 || y > docY1) return false;
    // Esquinas redondeadas.
    const cx = Math.min(Math.max(x, docX0 + radio), docX1 - radio);
    const cy = Math.min(Math.max(y, docY0 + radio), docY1 - radio);
    return (x - cx) ** 2 + (y - cy) ** 2 <= radio ** 2 || (x >= docX0 + radio && x <= docX1 - radio) || (y >= docY0 + radio && y <= docY1 - radio);
  };

  // Renglones del documento, el último más corto (como un total).
  const renglones = [
    [11.5, 10, 20.5],
    [11.5, 13, 20.5],
    [11.5, 16, 18],
    [11.5, 21, 16],
  ];
  const enRenglon = (x, y) =>
    renglones.some(([x0, yc, x1]) => {
      const grueso = yc === 21 ? 1.6 * u : 1.1 * u;
      return x >= x0 * u && x <= x1 * u && Math.abs(y - yc * u) <= grueso / 2;
    });

  for (let fy = 0; fy < tam; fy++) {
    const base = fy * (1 + tam * 4) + 1;
    for (let fx = 0; fx < tam; fx++) {
      const x = fx + 0.5;
      const y = fy + 0.5;
      let color = FONDO;

      if (dentroDoc(x, y)) color = TINTA;
      if (enRenglon(x, y)) color = FONDO;

      const p = base + fx * 4;
      filas[p] = color[0];
      filas[p + 1] = color[1];
      filas[p + 2] = color[2];
      filas[p + 3] = 255;
    }
  }

  return png(tam, tam, filas);
}

const dir = join(process.cwd(), "public");
mkdirSync(dir, { recursive: true });

for (const tam of [192, 512]) {
  const archivo = join(dir, `icon-${tam}.png`);
  writeFileSync(archivo, dibujar(tam));
  console.log(`icon-${tam}.png`);
}

// apple-touch-icon: iOS lo busca por nombre y no lee el manifest.
writeFileSync(join(dir, "apple-icon.png"), dibujar(180));
console.log("apple-icon.png");

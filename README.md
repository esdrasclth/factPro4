# factPro4

PWA para capturar facturas hondureñas (SAR) con la cámara del teléfono y extraer
sus datos fiscales a Postgres mediante un modelo de visión.

Es un **prototipo de validación**: su objetivo no es ser un producto terminado,
sino medir si la extracción automática es suficientemente precisa con facturas
reales. Por eso el flujo obliga a revisar cada factura y registra qué campos
hubo que corregir.

## Estado

| Pieza | Estado |
|---|---|
| Captura, subida y almacenamiento | Funcionando |
| Extracción con modelo de visión | Funcionando con `gpt-4.1-mini` |
| Base de datos y consulta | Funcionando |
| Revisión, corrección y métricas | Funcionando |
| Protección por contraseña | Funcionando |
| Despliegue a Vercel | **https://factpro4.vercel.app** |

## Stack

- **Next.js 16** (App Router) — PWA instalable
- **Lakebase Postgres en Neon** — proyecto `factPro4` (`empty-lab-97150961`, `us-east-2`)
- **Neon Object Storage** — bucket privado `facturas`, ramifica junto con la BD
- **Modelo de visión** vía API compatible con OpenAI

## Arranque

```bash
npm install
neon link --project-id empty-lab-97150961   # escribe .neon y baja el env
neon deploy                                  # provisiona el bucket
npm run db:migrate
npm run dev
```

Luego abre http://localhost:3000 y entra con el valor de `APP_PASSWORD`
(`.env.local`).

## El modelo

En producción corre `gpt-4.1-mini`. No se eligió por intuición: `db/benchmark.mjs`
compara modelos contra `fixtures/factura-prueba.png`, cuyos valores correctos
están en el `.esperado.json` de al lado.

| Modelo | Aciertos | Latencia | Tokens entrada |
|---|---|---|---|
| **gpt-4.1-mini** | **19–20 / 20** | 3–5 s | 2013 |
| gpt-5.4-mini | 18 / 20 | 2.7 s | 1800 |
| gpt-4.1 | 18 / 20 | 2.8 s | 1959 |

`gpt-4.1-mini` gana y además es el más barato. Para repetir la comparación:

```bash
npm run benchmark -- "gpt-4.1-mini,gpt-5.4-mini"
```

Dos hallazgos de esas pruebas:

- **El CAI es el campo frágil.** Con un encuadre mediocre, los cuatro modelos
  probados lo fallaron por uno o dos caracteres; con un encuadre limpio,
  `gpt-4.1-mini` lo acertó. Es hexadecimal sin dígito verificador, así que no
  hay forma de validarlo por software. Por eso la pantalla de revisión lo marca
  con una etiqueta naranja «verificar» y lo muestra en fuente monoespaciada.
- **Encuadrar bien mejora precisión y baja el costo a la vez.** Recortar la foto
  a la factura bajó los tokens de entrada de 3178 a 2013 y corrigió errores de
  lectura. De ahí la guía visual en la pantalla de captura.

El modelo se lee de `EXTRACCION_MODELO`, nunca está fijo en el código. Para
volver al modo sin costo: `EXTRACCION_PROVIDER=mock`. Para el AI Gateway de Neon
u otro proxy compatible, agrega `OPENAI_BASE_URL`.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run smoke` | Prueba de humo del flujo completo (20 verificaciones). Requiere `EXTRACCION_PROVIDER=mock` |
| `npm run probar-real` | Sube la factura de prueba por la API real y compara campo por campo |
| `npm run benchmark` | Compara modelos de visión sobre el fixture |
| `npm run db:migrate` | Aplica `db/migrations/*.sql` en orden |
| `npm run db:precision` | **Métrica del prototipo**: qué campos falla más el modelo |
| `npm run db:ultimas` | Últimas facturas y su resultado de extracción |
| `npm run db:check` | Verifica el esquema |
| `npm run db:limpiar -- --si` | Borra todas las facturas y sus imágenes |
| `npm run iconos` | Regenera los iconos PWA |

## Cómo se mide el prototipo

Al confirmar una factura, la app guarda en `campos_corregidos` exactamente qué
campos tuvo que arreglar el humano. Después de procesar 10–20 facturas reales:

```bash
npm run db:precision
```

Ese ranking es la decisión: dice si la extracción sirve y qué campos necesitan
mejor prompt o validación.

## Decisiones de diseño que no son obvias

- **Todos los campos extraídos son nullable.** El prompt ordena devolver `null`
  ante cualquier duda. Un null es correcto; un valor inventado es el peor error
  posible en datos fiscales.
- **La foto se guarda antes de extraer.** Si la extracción falla, la captura no
  se pierde: queda la fila con los campos vacíos para llenar a mano.
- **Duplicados por `(proveedor_rtn, numero_factura)`.** Es la clave natural de
  una factura. El índice por CAI existe como respaldo, pero no puede ser el
  principal: el CAI es de los campos que peor se leen, y cuando sale null la
  detección se apagaría en silencio.
- **Validación aritmética en la revisión.** En una factura del SAR la partición
  de la base ya viene neta de descuentos, así que la comprobación es
  `exento + exonerado + gravado + ISV = total`, **sin** volver a restar el
  descuento. Solo el camino alterno, el que parte del subtotal bruto, lo resta.
  Es el detector de errores de extracción más barato que hay.
- **Tema claro fijo.** Se usa comparando el formulario contra papel blanco; un
  tema oscuro a medias daría peor contraste justo donde hay cifras pequeñas.
- **`capture="environment"`** en vez de `getUserMedia`: usa la cámara nativa del
  sistema, con mejor enfoque y resolución, y se comporta igual en iOS y Android.
- **Compresión a 1600px antes de subir.** Por debajo se pierden el CAI y los
  montos, que son el texto más pequeño de la factura.

## Despliegue

Producción: **https://factpro4.vercel.app** (proyecto Vercel `factpro4`).

```bash
npx vercel deploy --prod
```

Las variables viven en Vercel, no en el repo. Al añadirlas por CLI hay que
enviar el valor **sin salto de línea final** — un `
` colado en `DATABASE_URL`
la invalida y el build falla con «not a valid URL»:

```bash
printf '%s' "$VALOR" | npx vercel env add NOMBRE production
```

La protección SSO de Vercel está desactivada a propósito: la app tiene su propia
puerta con `APP_PASSWORD`, y con SSO activo habría que iniciar sesión en Vercel
desde el teléfono antes de poder probar la cámara.

## Pendiente

1. Medir precisión con facturas reales (el fixture es sintético).
2. Cambiar `APP_PASSWORD`, que hoy es un valor de prueba.
3. Exportar a CSV desde el listado.
4. Rotar la API key de OpenAI cuando venza el crédito de prueba.

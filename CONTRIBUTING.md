# Contribuir a factPro

factPro es software libre bajo [MIT](LICENSE). Los reportes de fallos y las
propuestas son bienvenidos.

---

## Entorno

Requisitos: **Node 22+** y un proyecto de **Neon** en `us-east-2`.

```bash
npm install
npx neonctl link          # escribe .neon y .env.local con las variables de Neon
npx neonctl deploy        # crea el bucket «facturas»
npm run db:migrate
npm run dev
```

Añade a `.env.local` `APP_PASSWORD` y `EXTRACCION_PROVIDER`; `.env.example`
documenta cada variable.

**Trabaja en una rama de Neon, no en `main`.** La base y el bucket ramifican
juntos y con copy-on-write: lo que subas o borres en una rama no toca la de
producción.

```bash
npx neonctl branches create --name dev-tu-nombre --parent main
npx neonctl env pull --branch dev-tu-nombre
```

---

## Probar sin gastar créditos

`EXTRACCION_PROVIDER=mock` sustituye el modelo por un extractor falso
(`lib/extraccion/mock.ts`) que devuelve datos verosímiles y deterministas: la
misma imagen produce siempre la misma factura. Incluye a propósito campos null
y una factura que no cuadra, para ejercitar la pantalla de revisión.

| Qué quieres probar | Cómo |
| --- | --- |
| El flujo completo | `npm run dev` en una terminal y `npm run smoke` en otra, ambos en `mock` |
| La extracción real | `npm run probar-real` (usa la API y cuesta) |
| Un cambio de prompt o de modelo | `npm run benchmark -- "gpt-4.1-mini,otro-modelo"` |

La prueba de humo se niega a correr si el servidor no está en `mock`: con un
modelo real, la imagen en blanco que sube daría todos los campos null y los
asserts fallarían por el motivo equivocado.

---

## Qué no romper

- **Un null es mejor que un valor inventado.** Si tocas el prompt
  (`lib/extraccion/prompt.ts`), la regla de devolver `null` ante la duda se
  queda. En datos fiscales, un RTN plausible pero falso es el peor error.
- **`campos_corregidos` es la métrica del prototipo.** `cambioReal()` en
  `lib/db.ts` normaliza fechas y montos antes de comparar; si comparas en
  crudo, cada confirmación marcaría campos que nadie tocó.
- **La foto se sube antes de extraer.** Una extracción fallida deja la fila
  vacía, nunca pierde la captura.
- **El cuadre no resta dos veces el descuento.** La partición de la base de una
  factura del SAR ya es neta; el comentario de `FormularioRevision.tsx` explica
  las dos rutas.
- **El fixture es la vara de medir.** `fixtures/factura-prueba.png` y su
  `.esperado.json` van juntos; si cambias uno, cambia el otro.

---

## Estilo

- **Español** en la interfaz, en los nombres del dominio (`facturas`,
  `extraccion`, `campos_corregidos`) y en los mensajes de commit.
- **Conventional Commits**: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`.
- Los cambios de esquema van como un archivo nuevo en `db/migrations/`,
  numerado; nunca se edita una migración ya aplicada.
- El bloque `<!-- BEGIN:nextjs-agent-rules -->` de `AGENTS.md` lo reescribe
  `next dev`. Va con el commit; borrarlo del diff sólo lo recrea.

---

## Antes del pull request

```bash
npm run lint
npm run build
npm run smoke        # con el servidor en marcha y EXTRACCION_PROVIDER=mock
```

---

## Pull requests

1. Rama descriptiva: `feat/exportar-csv`, `fix/cuadre-exonerado`.
2. Un pull request, un tema.
3. En la descripción: qué problema resuelve y cómo lo probaste.
4. **Nunca subas `.env.local` ni fotos de facturas reales.** Tienen RTN, CAI y
   montos de empresas y personas. Las capturas del README salen de una rama con
   facturas inventadas.

---

## Seguridad

Una vulnerabilidad no se reporta en un issue público. Escribe a
<Esdras.Clother@outlook.com> con los pasos para reproducirla.

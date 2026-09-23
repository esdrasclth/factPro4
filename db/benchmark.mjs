// Compara modelos de visión sobre la factura de prueba.
// Uso: node --env-file=.env.local db/benchmark.mjs [modelo1,modelo2,...]
//
// Mide tres cosas que importan para elegir: exactitud campo por campo contra
// fixtures/factura-prueba.esperado.json, latencia y costo en tokens.
import { readFileSync } from "node:fs";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { FacturaExtraidaSchema } from "../lib/extraccion/tipos.ts";
import { PROMPT_SISTEMA, PROMPT_USUARIO } from "../lib/extraccion/prompt.ts";

const MODELOS = (process.argv[2] ?? "gpt-4.1-mini,gpt-4.1,gpt-5.4-mini").split(",");

const imagen = readFileSync("fixtures/factura-prueba.png");
const esperado = JSON.parse(readFileSync("fixtures/factura-prueba.esperado.json", "utf8"));
// Las claves que empiezan con _ son metadatos del fixture, no campos a comparar.
for (const k of Object.keys(esperado)) if (k.startsWith("_")) delete esperado[k];

const campos = Object.keys(esperado);
const cliente = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function iguales(a, b) {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  if (typeof a === "number" || typeof b === "number") {
    return Math.abs(Number(a) - Number(b)) < 0.005;
  }
  return String(a).trim().toUpperCase() === String(b).trim().toUpperCase();
}

const resultados = [];

for (const modelo of MODELOS) {
  process.stdout.write(`\n=== ${modelo} ===\n`);
  const t0 = Date.now();

  try {
    const r = await cliente.chat.completions.create({
      model: modelo,
      messages: [
        { role: "system", content: PROMPT_SISTEMA },
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT_USUARIO },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${imagen.toString("base64")}`,
                detail: "high",
              },
            },
          ],
        },
      ],
      response_format: zodResponseFormat(FacturaExtraidaSchema, "factura"),
    });

    const ms = Date.now() - t0;
    const datos = JSON.parse(r.choices[0].message.content);

    let aciertos = 0;
    const errores = [];
    for (const c of campos) {
      if (iguales(datos[c], esperado[c])) aciertos++;
      else errores.push(`    ${c}: esperado ${JSON.stringify(esperado[c])}, obtuvo ${JSON.stringify(datos[c])}`);
    }

    const pct = ((aciertos / campos.length) * 100).toFixed(0);
    console.log(`  Aciertos: ${aciertos}/${campos.length} (${pct}%)  |  ${(ms / 1000).toFixed(1)}s`);
    console.log(`  Tokens: ${r.usage.prompt_tokens} entrada + ${r.usage.completion_tokens} salida`);
    if (errores.length) {
      console.log("  Fallos:");
      errores.forEach((e) => console.log(e));
    }

    resultados.push({ modelo, aciertos, total: campos.length, ms, usage: r.usage });
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
    resultados.push({ modelo, error: e.message });
  }
}

console.log("\n\n=== RESUMEN ===");
for (const r of resultados) {
  if (r.error) console.log(`${r.modelo.padEnd(16)} ERROR: ${r.error.slice(0, 70)}`);
  else
    console.log(
      `${r.modelo.padEnd(16)} ${r.aciertos}/${r.total} campos  ${(r.ms / 1000).toFixed(1)}s  ` +
        `${r.usage.prompt_tokens}+${r.usage.completion_tokens} tokens`
    );
}

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { comprimirImagen } from "@/lib/imagen";

type Fase = "listo" | "comprimiendo" | "subiendo" | "error";

export default function CapturaPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fase, setFase] = useState<Fase>("listo");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  async function procesar(archivo: File) {
    setError(null);
    setPreview(URL.createObjectURL(archivo));

    try {
      setFase("comprimiendo");
      const blob = await comprimirImagen(archivo);

      setFase("subiendo");
      const form = new FormData();
      form.append("imagen", blob, "factura.jpg");

      const res = await fetch("/api/facturas", { method: "POST", body: form });
      const json = await res.json();

      // 409: el índice único detectó que esta factura ya está capturada.
      // Se lleva al usuario a la existente en vez de dejarlo con un error.
      if (res.status === 409 && json.factura?.id) {
        router.push(`/facturas/${json.factura.id}?duplicada=1`);
        return;
      }

      if (!res.ok) throw new Error(json.error ?? "Error al procesar");

      router.push(`/facturas/${json.factura.id}`);
    } catch (e) {
      setFase("error");
      setError(e instanceof Error ? e.message : "Error desconocido");
    }
  }

  const ocupado = fase === "comprimiendo" || fase === "subiendo";

  return (
    <main className="flex-1 flex flex-col p-6 max-w-md mx-auto w-full">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold tracking-tight">factPro</h1>
        <Link href="/facturas" className="text-sm text-slate-600 underline underline-offset-4">
          Ver facturas
        </Link>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Factura capturada"
            className="max-h-64 rounded-xl border border-slate-200 object-contain"
          />
        )}

        {!ocupado && (
          <>
            <button
              onClick={() => inputRef.current?.click()}
              className="flex h-40 w-40 flex-col items-center justify-center gap-2
                         rounded-full bg-slate-900 text-white shadow-lg active:scale-95
                         transition-transform"
            >
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              <span className="text-sm font-medium">
                {preview ? "Otra factura" : "Tomar foto"}
              </span>
            </button>

            <p className="text-center text-sm text-slate-500 max-w-xs">
              Coloca la factura sobre una superficie plana, con buena luz y que quepa
              completa en el encuadre.
            </p>
          </>
        )}

        {ocupado && (
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
            <p className="text-sm text-slate-600">
              {fase === "comprimiendo" ? "Preparando imagen…" : "Leyendo la factura…"}
            </p>
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        )}
      </div>

      {/*
        `capture="environment"` abre la cámara nativa del sistema en lugar de
        getUserMedia: mejor enfoque y resolución, y se comporta igual en iOS
        Safari y Android Chrome.
      */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) procesar(f);
          e.target.value = "";
        }}
      />
    </main>
  );
}

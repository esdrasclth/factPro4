"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function Formulario() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);

    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push(params.get("volver") || "/");
      router.refresh();
    } else {
      setError("Contraseña incorrecta");
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={entrar} className="w-full max-w-sm space-y-4">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight">factPro</h1>
        <p className="text-slate-500 mt-1 text-sm">Captura y extracción de facturas</p>
      </div>

      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Contraseña"
        autoFocus
        className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base
                   focus:border-slate-900 focus:outline-none"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={enviando || !password}
        className="w-full rounded-xl bg-slate-900 px-4 py-3 font-medium text-white
                   disabled:opacity-40"
      >
        {enviando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <Suspense>
        <Formulario />
      </Suspense>
    </main>
  );
}

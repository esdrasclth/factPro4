import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESION, verificarSesion } from "@/lib/auth";

export async function proxy(req: NextRequest) {
  const ok = await verificarSesion(req.cookies.get(COOKIE_SESION)?.value);
  if (ok) return NextResponse.next();

  // Las rutas de API responden 401; las páginas redirigen al login.
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("volver", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Protege todo salvo el login, sus assets y los archivos estáticos.
  matcher: [
    "/((?!login|api/login|_next/static|_next/image|favicon.ico|manifest.json|icon-).*)",
  ],
};

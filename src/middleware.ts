import { NextResponse, type NextRequest } from "next/server";

// Cheap gate: no session cookie means no access to /app. The session itself is validated server-side.
export function middleware(req: NextRequest) {
  const has = req.cookies.has("__Host-zimara_session") || req.cookies.has("zimara_session");
  if (!has) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/app/:path*"] };

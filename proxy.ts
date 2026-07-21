import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  if (process.env.MAINTENANCE_MODE !== "1") {
    return NextResponse.next();
  }

  // Already on the maintenance page — let it through
  if (request.nextUrl.pathname === "/maintenance") {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/maintenance";
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     *   - _next/static  (Next.js static assets)
     *   - _next/image   (image optimisation)
     *   - api/*         (webhooks/API routes keep running)
     *   - public files  (images, icons, fonts)
     */
    "/((?!_next/static|_next/image|api/|.*\\.(?:svg|png|jpg|jpeg|ico|webp|woff2?)).*)",
  ],
};

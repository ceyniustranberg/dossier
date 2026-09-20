import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js 16 renamed `middleware.ts` to `proxy.ts`. Same behaviour, new file and export
 * name -- most Supabase guides still show the old name.
 *
 * Two jobs: refresh the Supabase session cookie on every request (tokens expire otherwise),
 * and bounce signed-out visitors to /login. The redirect is an optimistic check only --
 * real enforcement lives in src/lib/auth.ts, next to the data it protects.
 */

const PUBLIC = ["/login", "/auth"];

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Not configured: the prototype runs wide open in dev. Route handlers still fail closed
  // in production builds -- see guard() in src/lib/auth.ts.
  if (!url || !key) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(list) {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  // Refreshes the access token as a side effect. Do not remove.
  const { data } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC.some((p) => path === p || path.startsWith(`${p}/`));

  // API routes must never be redirected: fetch() would follow the 307 and hand the caller
  // an HTML login page to parse as JSON. guard() in each handler answers with a 401 instead.
  if (path.startsWith("/api/")) return response;

  if (!data.user && !isPublic) {
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.search = "";
    const redirect = NextResponse.redirect(to);
    // Carry over any refreshed cookies so the next request starts from a clean session.
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }

  if (data.user && path === "/login") {
    const to = request.nextUrl.clone();
    to.pathname = "/";
    to.search = "";
    const redirect = NextResponse.redirect(to);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals and static files. Auth should see as many routes as
     * possible, so this excludes assets rather than listing protected paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};

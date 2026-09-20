// Vercel Routing Middleware for the bcpsai project (browardschools.ai,
// www.browardschools.ai, ai.bcpsmarcomm.com, bcpsai.vercel.app).
//
// Purpose: require a signed-in session for the site root and for the BCPS AI
// Progress Tracker. Any authenticated user passes - no role, group, or
// recipient-list check (Sean, 2026-09-20).
//
// GUARDING CHECK, named deliberately per canon-gate-new-surfaces-on-the-same-check:
// this is the SAME check that already protects every logged-in page on
// bcpsmarcomm.com - see lesaruss/bcpsmarcomm src/middleware.ts, which builds an
// @supabase/ssr createServerClient over the request cookies and calls
// supabase.auth.getUser(). Both properties sit on the same Supabase auth pool
// (project fwbhwfxpncrsfhttimna), so "signed in to the BCPS platform" means the
// same thing here as it does there, and one account works on both.
//
// What this is NOT: the client-side gate used by admin.html on this same site
// (supabase-js getSession() that hides a <div> after the page loads). That
// pattern still ships the full document body to an anonymous visitor - view
// source or curl defeats it - so it is not a gate for a document that
// acl_objects marks visibility='restricted'. The check has to run before the
// bytes are sent, which is what this middleware does.
//
// Session transport: login.html and admin.html use @supabase/ssr's
// createBrowserClient, which stores the session in the chunked
// sb-<ref>-auth-token cookie rather than localStorage. That is what makes the
// session readable here on the server, and it is the same library pairing
// bcpsmarcomm.com uses on both sides.

import { next } from '@vercel/functions'
import { createServerClient } from '@supabase/ssr'

// Same project and publishable anon key already used by login.html and
// admin.html in this repo. The anon key is a publishable client credential,
// not a secret; it carries no privileges beyond RLS. Kept as a literal rather
// than an env var so this zero-config static project cannot fail to deploy on
// a missing environment variable.
const SUPABASE_URL = 'https://fwbhwfxpncrsfhttimna.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3Ymh3ZnhwbmNyc2ZodHRpbW5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NjAxMzksImV4cCI6MjA5MDIzNjEzOX0.9mxjK0bn5WATCbNLWrHPakD6yHUDtHFHrOaklPnWkOA'

// Only these paths are gated. Everything else on the site is untouched.
// Kept explicit rather than a broad prefix so the gate matches exactly what
// was asked for and nothing else (canon-scope-fidelity-gate).
export const config = {
  matcher: ['/', '/index.html', '/briefs/bcps-ai-preview-checklist-2026-07-16.html'],
}

function parseCookies(header: string | null): { name: string; value: string }[] {
  if (!header) return []
  const out: { name: string; value: string }[] = []
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const name = part.slice(0, eq).trim()
    if (!name) continue
    let value = part.slice(eq + 1).trim()
    try {
      value = decodeURIComponent(value)
    } catch {
      // A cookie we do not own may not be percent-encoded. Leave it as-is:
      // @supabase/ssr only reads the sb-<ref>-auth-token chunks it wrote.
    }
    out.push({ name, value })
  }
  return out
}

export default async function middleware(request: Request): Promise<Response> {
  const url = new URL(request.url)

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return parseCookies(request.headers.get('cookie'))
      },
      // Read-only, exactly like readOnlyClient() in bcpsmarcomm's middleware.
      // A refresh that lands here cannot be written back to a static response;
      // login.html re-reads the cookie and refreshes it on the client instead.
      setAll() {},
    },
  })

  let signedIn = false
  try {
    // getUser() validates the token against the Supabase auth server. It is a
    // real verification, not a "does a cookie exist" check - a forged or
    // expired cookie fails here.
    const {
      data: { user },
    } = await supabase.auth.getUser()
    signedIn = !!user
  } catch {
    // Treat any auth-server error as not-signed-in. Failing closed is the
    // right default for a gate; the visitor lands on the login page.
    signedIn = false
  }

  if (!signedIn) {
    // Carry the requested path through as ?next= so signing in returns the
    // visitor to where they were headed, same as bcpsmarcomm's middleware.
    const loginUrl = new URL('/login.html', url.origin)
    loginUrl.searchParams.set('next', url.pathname + url.search)
    return new Response(null, {
      status: 302,
      headers: {
        Location: loginUrl.toString(),
        // Never let a CDN or browser cache the gated response or the bounce.
        'Cache-Control': 'no-store, must-revalidate',
      },
    })
  }

  return next({
    headers: { 'Cache-Control': 'no-store, must-revalidate' },
  })
}

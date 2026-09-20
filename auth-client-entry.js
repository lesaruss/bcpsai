// Entry point for the /auth-client.js bundle (npm run build:auth-client).
// Exposes @supabase/ssr's createBrowserClient to login.html and admin.html as
// the global supabaseSsr, so the session is stored in the sb-<ref>-auth-token
// cookie that middleware.ts reads, rather than in localStorage.
export { createBrowserClient } from '@supabase/ssr'

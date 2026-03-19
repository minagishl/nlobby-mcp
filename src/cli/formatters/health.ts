export function formatHealth(ok: boolean): string {
  if (ok) {
    return "[OK] N Lobby API is reachable and authenticated.";
  }
  return "[FAIL] N Lobby API health check failed. Run `nlobby login` or `nlobby cookies set <cookies>` to authenticate.";
}

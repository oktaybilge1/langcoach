/**
 * Local hosts the e2e build (and unit tests) accept in place of labs.google. Production builds define
 * `__E2E__` as false, so this folds to an empty list and the host names are compiled out of the bundle
 * (the zip script refuses any bundle that still contains them).
 */
export const DEV_HOSTNAMES: readonly string[] =
  typeof __E2E__ === 'undefined' || __E2E__ ? ['localhost', '127.0.0.1'] : [];

/** http(s) URL on one of the dev hosts (always false in production builds). */
export function isDevHostUrl(url: string): boolean {
  if (DEV_HOSTNAMES.length === 0) return false;
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') && DEV_HOSTNAMES.includes(u.hostname);
  } catch {
    return false;
  }
}

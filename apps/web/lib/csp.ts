// Pages get a per-request nonce from proxy.ts; only nonced scripts and what they load may run.
// `upgrade-insecure-requests` and HSTS belong to the HTTPS deployment, not local 127.0.0.1.
export function pageContentSecurityPolicy(nonce: string, development: boolean) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    // The dev overlay injects un-nonced styles; a nonce would make browsers ignore 'unsafe-inline'.
    development ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

// API responses and other paths the proxy skips never render documents.
export const fallbackContentSecurityPolicy = "default-src 'none'; frame-ancestors 'none'";

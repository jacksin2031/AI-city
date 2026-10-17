import { describe, expect, it } from "vitest";
import { fallbackContentSecurityPolicy, pageContentSecurityPolicy } from "./csp";

const directives = (policy: string) =>
  Object.fromEntries(
    policy.split("; ").map((directive) => {
      const [name, ...values] = directive.split(" ");
      return [name, values];
    }),
  );

describe("page content security policy", () => {
  const production = directives(pageContentSecurityPolicy("abc123", false));
  it("allows scripts only through the request nonce", () => {
    expect(production["script-src"]).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
  });
  it("never allows inline or eval in production", () => {
    for (const values of Object.values(production)) {
      expect(values).not.toContain("'unsafe-inline'");
      expect(values).not.toContain("'unsafe-eval'");
    }
  });
  it("blocks plugins, framing, base rewriting and foreign form targets", () => {
    expect(production["object-src"]).toEqual(["'none'"]);
    expect(production["frame-ancestors"]).toEqual(["'none'"]);
    expect(production["base-uri"]).toEqual(["'self'"]);
    expect(production["form-action"]).toEqual(["'self'"]);
    expect(production["default-src"]).toEqual(["'self'"]);
  });
  it("relaxes eval and inline styles only for development tooling", () => {
    const development = directives(pageContentSecurityPolicy("abc123", true));
    expect(development["script-src"]).toContain("'unsafe-eval'");
    expect(development["script-src"]).not.toContain("'unsafe-inline'");
    expect(development["style-src"]).toEqual(["'self'", "'unsafe-inline'"]);
    expect(production["style-src"]).toEqual(["'self'", "'nonce-abc123'"]);
  });
});

it("denies everything for responses that are not pages", () => {
  expect(directives(fallbackContentSecurityPolicy)).toEqual({
    "default-src": ["'none'"],
    "frame-ancestors": ["'none'"],
  });
});

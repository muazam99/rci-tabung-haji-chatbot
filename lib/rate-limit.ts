/**
 * Stateless per-session rate limiting via an HMAC-signed cookie — no
 * database, no Redis, works on any serverless host. The signature stops a
 * casual user from hand-editing the cookie value to reset their count; it
 * does NOT stop a user from simply clearing cookies or using a private
 * window to get a fresh limit. That's a known, accepted gap (see the build
 * plan) — the real backstop against abusive usage is the hard monthly
 * spend cap set in the DeepSeek console, which this code cannot enforce
 * and which must be configured there directly before public launch.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "rci_rl";
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS_PER_WINDOW = 15;

interface RateLimitPayload {
  count: number;
  windowStart: number; // epoch ms
}

function getSecret(): string {
  const secret = process.env.RATE_LIMIT_SECRET;
  if (!secret) {
    throw new Error(
      "RATE_LIMIT_SECRET is not set. Generate one (e.g. `openssl rand -hex 32`) and add it " +
        "to .env.local — without it, rate-limit cookies can't be signed."
    );
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

function encode(payload: RateLimitPayload): string {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, "utf-8").toString("base64url");
  const sig = sign(b64);
  return `${b64}.${sig}`;
}

function decode(cookieValue: string | undefined): RateLimitPayload | null {
  if (!cookieValue) return null;
  const [b64, sig] = cookieValue.split(".");
  if (!b64 || !sig) return null;

  const expectedSig = sign(b64);
  // Constant-time comparison — this is a courtesy limit, not a security
  // boundary, but there's no reason to leak timing info regardless.
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(b64, "base64url").toString("utf-8"));
    if (typeof parsed.count === "number" && typeof parsed.windowStart === "number") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Set-Cookie header value to attach to the response — must be set at
   *  Response construction time, before any streaming body starts (Next.js
   *  disallows setting cookies once a stream has begun). */
  setCookieHeader: string;
}

/** Read the incoming rate-limit cookie, decide allow/deny, and produce the
 *  next Set-Cookie value. Pure function — no I/O — so it's trivial to unit
 *  test and impossible to accidentally call after a stream has started. */
export function checkRateLimit(incomingCookieValue: string | undefined): RateLimitResult {
  const now = Date.now();
  const existing = decode(incomingCookieValue);

  const windowStillValid = existing && now - existing.windowStart < WINDOW_MS;
  const current: RateLimitPayload = windowStillValid
    ? existing!
    : { count: 0, windowStart: now };

  const allowed = current.count < MAX_REQUESTS_PER_WINDOW;
  const next: RateLimitPayload = allowed
    ? { count: current.count + 1, windowStart: current.windowStart }
    : current;

  const maxAgeSeconds = Math.ceil(WINDOW_MS / 1000);
  const cookieValue = encode(next);
  const setCookieHeader =
    `${COOKIE_NAME}=${cookieValue}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax; HttpOnly` +
    (process.env.NODE_ENV === "production" ? "; Secure" : "");

  return {
    allowed,
    remaining: Math.max(0, MAX_REQUESTS_PER_WINDOW - next.count),
    setCookieHeader,
  };
}

export function getRateLimitCookieName(): string {
  return COOKIE_NAME;
}

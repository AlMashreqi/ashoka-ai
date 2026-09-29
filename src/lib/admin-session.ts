import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "cs_admin";

type Compare = (left: Uint8Array, right: Uint8Array) => boolean;

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function secretsMatch(candidate: string, secret: string, compare: Compare = timingSafeEqual): boolean {
  return compare(digest(candidate), digest(secret));
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createAdminSession(secret: string, now = Date.now(), maxAgeSeconds = 3_600): string {
  const expiresAt = now + maxAgeSeconds * 1_000;
  return `${expiresAt}.${signature(String(expiresAt), secret)}`;
}

export function hasAdminSession(token: string | undefined, secret: string, now = Date.now()): boolean {
  const [expiresAt, received, ...rest] = token?.split(".") ?? [];
  if (!expiresAt || !received || rest.length || !/^\d+$/.test(expiresAt) || Number(expiresAt) <= now) return false;
  return secretsMatch(received, signature(expiresAt, secret));
}

export function hasAdminCookie(cookieHeader: string | null, secret: string, now = Date.now()): boolean {
  const token = cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${ADMIN_COOKIE}=`))?.slice(ADMIN_COOKIE.length + 1);
  return hasAdminSession(token, secret, now);
}

export function sessionCookie(token: string, request: Request, maxAgeSeconds = 3_600): string {
  return `${ADMIN_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}

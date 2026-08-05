import "server-only";

import { timingSafeEqual } from "node:crypto";

export function isAuthorized(provided: string | null) {
  const expected = process.env.APP_SHARED_SECRET?.trim();
  const candidate = provided?.trim();
  if (!expected || !candidate) return false;
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

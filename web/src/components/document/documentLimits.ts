/**
 * What the document editor needs without loading TipTap: the length limit and the link rule.
 * Kept apart from `documentExtensions.ts` so the map bundle never pulls the rich editor in
 * (slice 5, decision D4: the rich editor is loaded lazily).
 */

/** Mirrors `CONTENT_MAX_LENGTH` in `api/app/nodes/schemas.py` (slice 5, decision D2). */
export const CONTENT_MAX_LENGTH = 100_000;

/**
 * Links may only point to the web or to an e-mail address (slice 5, decision D10): no
 * `javascript:`, no `data:`, no relative paths.
 */
export function isAllowedLink(url: string): boolean {
  return /^(https?:\/\/[^\s]+|mailto:[^\s]+)$/i.test(url.trim());
}

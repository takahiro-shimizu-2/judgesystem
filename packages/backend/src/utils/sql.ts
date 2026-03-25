/**
 * Escape special characters for PostgreSQL LIKE / ILIKE patterns.
 *
 * The characters `%`, `_`, and `\` have special meaning inside LIKE
 * expressions.  This function prefixes each of them with a backslash so
 * that they are treated as literal characters when used in a query such
 * as:
 *
 *   WHERE column ILIKE '%' || $1 || '%'
 *
 * @param s - Raw user input to be embedded in a LIKE pattern.
 * @returns The escaped string safe to interpolate into a LIKE pattern.
 */
export function escapeLikePattern(s: string): string {
  return s.replace(/[%_\\]/g, "\\$&");
}

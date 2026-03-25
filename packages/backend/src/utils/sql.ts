/**
 * Escape special characters in a LIKE/ILIKE pattern.
 *
 * PostgreSQL treats `%`, `_`, and `\` as special within LIKE patterns.
 * This function prefixes each occurrence with a backslash so that the
 * characters are matched literally.
 *
 * @param s - Raw user input to be used inside a LIKE/ILIKE pattern
 * @returns The escaped string safe for interpolation into `%…%` patterns
 */
export function escapeLikePattern(s: string): string {
  return s.replace(/[%_\\]/g, "\\$&");
}

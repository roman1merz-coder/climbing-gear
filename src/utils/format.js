// ═══ Format Utilities ═══

/** Replace underscores and hyphens with spaces */
export function fmt(str) {
  if (typeof str !== "string") return String(str ?? "");
  return str.replace(/_/g, " ").replace(/-/g, " ");
}

/** Capitalize first letter + fmt */
export function cap(str) {
  if (typeof str !== "string" || !str) return str ?? "";
  const s = fmt(str);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Ensure value is an array */
export function ensureArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null || v === "") return [];
  return [v];
}

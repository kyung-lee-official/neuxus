export function isoFromDate(
  value: Date | string | undefined | null,
): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

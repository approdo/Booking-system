/**
 * A whole number with thousands separators: formatNumber(1500) returns '1,500'.
 * Prices are written the same way in both languages.
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

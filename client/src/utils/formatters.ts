
/**
 * Formats a price from cents to a dollar string with 2 decimal places
 * @param cents - The price in cents
 * @returns Formatted price string (e.g. "$10.00")
 */
export function formatPrice(cents: number): string {
  if (!cents && cents !== 0) return '$0.00';
  return `$${(cents / 100).toFixed(2)}`;
}

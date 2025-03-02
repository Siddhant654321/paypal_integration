/**
 * Money handling utility functions for consistent formatting across the application
 */

/**
 * Formats a price from cents to a dollar string with 2 decimal places
 * @param cents - The price in cents
 * @returns Formatted price string (e.g. "$10.00")
 */
export function formatPrice(cents: number): string {
  if (!cents && cents !== 0) return '$0.00';
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Converts a dollar amount (with or without $ symbol) to cents
 * @param dollars - The price in dollars (e.g. "$10.00" or "10.00" or 10.00)
 * @returns Number in cents
 */
export function dollarsToCents(dollars: string | number): number {
  if (typeof dollars === 'number') return Math.round(dollars * 100);
  // Remove $ and any commas, then convert to float
  const cleanedAmount = dollars.replace(/[$,]/g, '');
  return Math.round(parseFloat(cleanedAmount) * 100);
}

/**
 * Converts cents to dollars as a number
 * @param cents - The price in cents
 * @returns Number in dollars with 2 decimal places
 */
export function centsToDollars(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

/**
 * Validates and formats a dollar input string
 * @param input - User input string
 * @returns Formatted dollar string with 2 decimal places
 */
export function formatDollarInput(input: string): string {
  // Remove any non-numeric characters except decimal point
  const cleaned = input.replace(/[^\d.]/g, '');
  // Ensure only two decimal places
  const parts = cleaned.split('.');
  if (parts.length > 1) {
    return `${parts[0]}.${parts[1].slice(0, 2)}`;
  }
  return cleaned;
}
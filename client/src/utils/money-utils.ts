
/**
 * Money utility functions for consistent formatting and handling
 */

/**
 * Format cents to dollars with dollar sign
 * @param cents Amount in cents (integer)
 * @returns Formatted string in $XX.XX format
 */
export function formatDollars(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(cents / 100);
}

/**
 * Convert dollar amount string to cents
 * @param dollarString String representing dollars (with or without $ sign)
 * @returns Number in cents
 */
export function toCents(dollarString: string): number {
  // Remove $ sign and any commas
  const cleaned = dollarString.replace(/[$,]/g, '');
  
  // Parse as float and convert to cents
  const dollars = parseFloat(cleaned);
  
  // Return cents as integer
  return isNaN(dollars) ? 0 : Math.round(dollars * 100);
}

/**
 * Convert cents to a dollar string without formatting (for input fields)
 * @param cents Amount in cents
 * @returns Dollar amount as string with 2 decimal places
 */
export function toInputValue(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  return (cents / 100).toFixed(2);
}

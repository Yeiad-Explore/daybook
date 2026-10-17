const SYMBOLS: Record<string, string> = { BDT: "৳", USD: "$", EUR: "€", GBP: "£", INR: "₹" };

/** The symbol for an ISO 4217 code; unknown codes show as the code itself. */
export const currencySymbol = (currency: string) => SYMBOLS[currency] ?? currency;

/** "1,250,000" (Western thousands separators, PRD TBL-3; not lakh grouping). Decimals only when needed. */
export function formatNumber(value: number, decimals?: number): string {
  const rounded = Math.round(value * 100) / 100;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals ?? 0,
    maximumFractionDigits: decimals ?? (Number.isInteger(rounded) ? 0 : 2),
  }).format(decimals === undefined ? rounded : value);
}

/** "৳1,250,000"; negatives read "−৳1,200" with a real minus sign (TBL-3). */
export function formatMoney(value: number, currency: string): string {
  return `${value < 0 ? "−" : ""}${currencySymbol(currency)}${formatNumber(Math.abs(value))}`;
}

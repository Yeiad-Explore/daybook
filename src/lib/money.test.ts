import { describe, expect, it } from "vitest";
import { currencySymbol, formatMoney, formatNumber } from "./money";

describe("money", () => {
  it("uses Western thousands separators, not lakh grouping (TBL-3)", () => {
    expect(formatMoney(1250000, "BDT")).toBe("Tk 1,250,000");
    expect(formatMoney(75000, "BDT")).toBe("Tk 75,000");
    expect(formatNumber(1250000)).toBe("1,250,000");
  });
  it("shows a real minus sign for expenses", () => {
    expect(formatMoney(-1200, "BDT")).toBe("−Tk 1,200");
  });
  it("keeps cents only when there are some", () => {
    expect(formatMoney(12.5, "USD")).toBe("$12.5");
    expect(formatMoney(0.1 + 0.2, "BDT")).toBe("Tk 0.3");
  });
  it("honours fixed decimals for tracker values", () => {
    expect(formatNumber(77.2, 1)).toBe("77.2");
    expect(formatNumber(72, 1)).toBe("72.0");
    expect(formatNumber(2000, 0)).toBe("2,000");
  });
  it("falls back to the code for unknown currencies", () => {
    expect(currencySymbol("CHF")).toBe("CHF");
  });
});

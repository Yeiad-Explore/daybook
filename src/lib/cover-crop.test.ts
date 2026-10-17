import { describe, expect, it } from "vitest";
import { cropRect } from "./cover-crop";

describe("cropRect (cover upload)", () => {
  it("centres the width of a wide image and keeps its full height", () => {
    const r = cropRect(4000, 1000); // cover ratio is 1600:560 = 2.857
    expect(r.sh).toBe(1000);
    expect(r.sw).toBeCloseTo(2857.14, 1);
    expect(r.sx).toBeCloseTo((4000 - r.sw) / 2, 5);
    expect(r.sy).toBe(0);
  });
  it("keeps the full width of a tall image and cuts at the chosen height", () => {
    const top = cropRect(1600, 1600, 1600, 560, 0);
    const bottom = cropRect(1600, 1600, 1600, 560, 1);
    expect(top).toMatchObject({ sx: 0, sy: 0, sw: 1600, sh: 560 });
    expect(bottom.sy).toBe(1040);
    expect(cropRect(1600, 1600, 1600, 560, 0.5).sy).toBe(520);
  });
  it("clamps the focus and returns the whole image when the ratio already fits", () => {
    expect(cropRect(1600, 1600, 1600, 560, 5).sy).toBe(1040);
    expect(cropRect(1600, 560)).toMatchObject({ sx: 0, sy: 0, sw: 1600, sh: 560 });
  });
});

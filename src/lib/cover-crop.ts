export const COVER_WIDTH = 1600;
export const COVER_HEIGHT = 560;

/**
 * The part of an image of iw x ih that fills a W x H cover. The crop keeps the full width (or height)
 * of whichever side limits it, and `focusY` (0 = top, 1 = bottom) says where a taller image is cut.
 */
export function cropRect(iw: number, ih: number, width = COVER_WIDTH, height = COVER_HEIGHT, focusY = 0.5) {
  const ratio = width / height;
  if (iw / ih >= ratio) {
    const sw = ih * ratio; // wider than the cover: use the full height and centre the width
    return { sx: (iw - sw) / 2, sy: 0, sw, sh: ih };
  }
  const sh = iw / ratio; // taller: use the full width; focusY picks the band
  return { sx: 0, sy: (ih - sh) * Math.min(1, Math.max(0, focusY)), sw: iw, sh };
}

/** External box-to-box gaps. Overlapping/contained boxes have no external gap. */
export function measureGap(a, b) {
  if (a.x + a.w <= b.x || b.x + b.w <= a.x) {
    const [left, right] = a.x < b.x ? [a, b] : [b, a];
    const x1 = left.x + left.w,
      x2 = right.x;
    const overlapTop = Math.max(a.y, b.y);
    const overlapBottom = Math.min(a.y + a.h, b.y + b.h);
    const y = (overlapTop + overlapBottom) / 2;
    return { x1, x2, y1: y, y2: y, gap: x2 - x1 };
  }
  if (a.y + a.h <= b.y || b.y + b.h <= a.y) {
    const [top, bottom] = a.y < b.y ? [a, b] : [b, a];
    const y1 = top.y + top.h,
      y2 = bottom.y;
    const x = (Math.max(a.x, b.x) + Math.min(a.x + a.w, b.x + b.w)) / 2;
    return { x1: x, x2: x, y1, y2, gap: y2 - y1 };
  }
  return null;
}

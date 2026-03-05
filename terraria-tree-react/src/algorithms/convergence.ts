/**
 * SVG convergence line math: coordinate transforms and bezier control points.
 */

export interface LocalRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Convert a screen-space DOMRect to local (unscaled) coordinates relative to a reference rect. */
export function screenToLocal(rect: DOMRect, refRect: DOMRect, scale: number): LocalRect {
  return {
    x: (rect.left - refRect.left) / scale,
    y: (rect.top - refRect.top) / scale,
    w: rect.width / scale,
    h: rect.height / scale,
  };
}

/** Compute two control points for a cubic bezier between start and end. */
export function bezierControlPoints(s: Point, e: Point): [Point, Point] {
  const dx = e.x - s.x;
  const dy = e.y - s.y;
  const mx = (s.x + e.x) / 2;
  const my = (s.y + e.y) / 2;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return [{ x: mx, y: s.y }, { x: mx, y: e.y }];
  }
  return [{ x: s.x, y: my }, { x: e.x, y: my }];
}

/** Build an SVG path `d` attribute for a cubic bezier between two points. */
export function buildBezierPath(sx: number, sy: number, ex: number, ey: number): string {
  const [cp1, cp2] = bezierControlPoints({ x: sx, y: sy }, { x: ex, y: ey });
  return `M${sx},${sy} C${cp1.x},${cp1.y} ${cp2.x},${cp2.y} ${ex},${ey}`;
}

/**
 * Compute edge attachment points between source and target rects,
 * with perpendicular offset to avoid overlapping lines.
 */
export function computeEdgePoints(
  sRect: LocalRect,
  tRect: LocalRect,
  lineIndex: number,
  totalLines: number,
): { sx: number; sy: number; ex: number; ey: number } {
  const scx = sRect.x + sRect.w / 2;
  const scy = sRect.y + sRect.h / 2;
  const tcx = tRect.x + tRect.w / 2;
  const tcy = tRect.y + tRect.h / 2;
  const dx = tcx - scx;
  const dy = tcy - scy;
  const perpOffset = (lineIndex - (totalLines - 1) / 2) * 5;

  let sx: number, sy: number, ex: number, ey: number;

  if (Math.abs(dx) >= Math.abs(dy)) {
    sx = dx > 0 ? sRect.x + sRect.w : sRect.x;
    ex = dx > 0 ? tRect.x : tRect.x + tRect.w;
    sy = scy + perpOffset;
    ey = tcy + perpOffset;
  } else {
    sy = dy > 0 ? sRect.y + sRect.h : sRect.y;
    ey = dy > 0 ? tRect.y : tRect.y + tRect.h;
    sx = scx + perpOffset;
    ex = tcx + perpOffset;
  }

  return { sx, sy, ex, ey };
}

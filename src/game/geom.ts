export const TILE_W = 64
export const TILE_H = 32
const HW = TILE_W / 2
const HH = TILE_H / 2

export interface Pt {
  x: number
  y: number
}

/** Gitterkoordinate (Ecke, nicht Zellenmitte) auf die isometrische Ebene. */
export function toScreen(x: number, y: number): Pt {
  return { x: (x - y) * HW, y: (x + y) * HH }
}

export function screenToGrid(wx: number, wy: number): Pt {
  return {
    x: (wx / HW + wy / HH) / 2,
    y: (wy / HH - wx / HW) / 2,
  }
}

export function cellOf(wx: number, wy: number): { x: number; y: number } {
  const g = screenToGrid(wx, wy)
  return { x: Math.floor(g.x), y: Math.floor(g.y) }
}

export function distToRect(px: number, py: number, x: number, y: number, w: number, h: number): number {
  const dx = Math.max(x - px, 0, px - (x + w))
  const dy = Math.max(y - py, 0, py - (y + h))
  return Math.hypot(dx, dy)
}

export function overlap(ax: number, ay: number, asize: number, bx: number, by: number, bsize: number): boolean {
  return ax < bx + bsize && ax + asize > bx && ay < by + bsize && ay + asize > by
}

export function pointInPoly(px: number, py: number, pts: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x
    const yi = pts[i].y
    const xj = pts[j].x
    const yj = pts[j].y
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi || 1e-9) + xi
    if (intersect) inside = !inside
  }
  return inside
}

export function footprintPoly(x: number, y: number, size: number, height: number): Pt[] {
  const n = toScreen(x, y)
  const e = toScreen(x + size, y)
  const s = toScreen(x + size, y + size)
  const w = toScreen(x, y + size)
  const lift = (p: Pt): Pt => ({ x: p.x, y: p.y - height })
  return [lift(n), lift(e), e, s, w, lift(w)]
}

export function hash01(x: number, y: number): number {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

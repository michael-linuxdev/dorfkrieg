export interface Cell {
  x: number
  y: number
}

const DIRS: Cell[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
]

/**
 * A* auf dem Dorfraster. `cost` liefert Infinity für unbetretbare Zellen.
 * Die Heuristik darf unterschätzen; bei Gleichstand gewinnt der kürzere Weg.
 */
export function findPath(
  startX: number,
  startY: number,
  mapW: number,
  mapH: number,
  cost: (x: number, y: number) => number,
  goal: (x: number, y: number) => boolean,
  heuristic: (x: number, y: number) => number,
): Cell[] | null {
  if (startX < 0 || startY < 0 || startX >= mapW || startY >= mapH) return null
  if (goal(startX, startY)) return []

  const stride = mapW
  const size = mapW * mapH
  const gScore = new Float64Array(size)
  gScore.fill(Number.POSITIVE_INFINITY)
  const prev = new Int32Array(size)
  prev.fill(-1)
  const closed = new Uint8Array(size)
  const startKey = startY * stride + startX
  gScore[startKey] = 0

  const open: { k: number; f: number }[] = [{ k: startKey, f: heuristic(startX, startY) }]
  let guard = 0

  while (open.length && guard++ < size * 8) {
    let best = 0
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[best].f) best = i
    }
    const current = open.splice(best, 1)[0]
    if (closed[current.k]) continue
    closed[current.k] = 1

    const cx = current.k % stride
    const cy = (current.k / stride) | 0
    if (current.k !== startKey && goal(cx, cy)) {
      const path: Cell[] = []
      let k = current.k
      while (k !== startKey && k !== -1) {
        path.push({ x: k % stride, y: (k / stride) | 0 })
        k = prev[k]
      }
      path.reverse()
      return path
    }

    for (const dir of DIRS) {
      const nx = cx + dir.x
      const ny = cy + dir.y
      if (nx < 0 || ny < 0 || nx >= mapW || ny >= mapH) continue
      const step = cost(nx, ny)
      if (!Number.isFinite(step)) continue
      const nk = ny * stride + nx
      const nextG = gScore[current.k] + step
      if (nextG >= gScore[nk]) continue
      gScore[nk] = nextG
      prev[nk] = current.k
      open.push({ k: nk, f: nextG + heuristic(nx, ny) })
    }
  }

  return null
}

import { BUILDINGS, MAP_SIZE, SAVE_KEY, buildingDef, isCollector, levelStats } from './data'
import { overlap } from './geom'
import { catchUp, formatNum } from './sim'
import type { Building, BuildingKind, SaveState, TroopKind } from './types'

const KINDS = new Set<BuildingKind>(Object.keys(BUILDINGS) as BuildingKind[])
const TROOPS = new Set<TroopKind>(['schlaeger', 'speerwerfer'])

export function createInitialState(now = Date.now()): SaveState {
  const b = (
    kind: BuildingKind,
    x: number,
    y: number,
    level: number,
    stored = 0,
  ): Building => ({
    id: `${kind}-${x}-${y}`,
    kind,
    x,
    y,
    level,
    finishAt: null,
    stored,
  })

  return {
    v: 1,
    gold: 500,
    harz: 320,
    buildings: [
      b('rathaus', 7, 7, 1),
      b('goldschacht', 3, 4, 1, 140),
      b('harzsiederei', 12, 4, 1, 90),
      b('goldkammer', 3, 12, 1),
      b('harzspeicher', 12, 12, 1),
      b('wachturm', 7, 3, 1),
      b('kaserne', 12, 8, 1),
      b('palisade', 6, 6, 1),
      b('palisade', 7, 6, 1),
      b('palisade', 8, 6, 1),
      b('palisade', 9, 6, 1),
      b('palisade', 10, 6, 1),
      b('palisade', 6, 7, 1),
      b('palisade', 6, 8, 1),
      b('palisade', 6, 9, 1),
      b('palisade', 10, 7, 1),
      b('palisade', 10, 8, 1),
      b('palisade', 10, 9, 1),
    ],
    army: { schlaeger: 5, speerwerfer: 3 },
    queue: [],
    updatedAt: now,
    sound: true,
  }
}

export interface LoadResult {
  state: SaveState
  note: string | null
}

export function loadState(now = Date.now()): LoadResult {
  const fresh = createInitialState(now)
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return { state: fresh, note: null }
    const parsed = sanitize(JSON.parse(raw))
    if (!parsed) return { state: fresh, note: null }
    const elapsed = Math.max(0, now - parsed.updatedAt)
    const before = snapshot(parsed)
    catchUp(parsed, now)
    const note = elapsed > 20_000 ? offlineNote(before, snapshot(parsed), elapsed) : null
    return { state: parsed, note }
  } catch {
    return { state: fresh, note: null }
  }
}

export function writeState(state: SaveState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state))
  } catch {
    // Privates Fenster oder voller Speicher: das Spiel läuft weiter.
  }
}

interface Snap {
  goldStored: number
  harzStored: number
  levels: number
  army: number
  constructing: number
}

function snapshot(state: SaveState): Snap {
  let goldStored = 0
  let harzStored = 0
  let levels = 0
  let constructing = 0
  for (const b of state.buildings) {
    levels += b.level
    if (b.finishAt != null) constructing += 1
    if (b.kind === 'goldschacht') goldStored += b.stored
    if (b.kind === 'harzsiederei') harzStored += b.stored
  }
  return {
    goldStored,
    harzStored,
    levels,
    army: state.army.schlaeger + state.army.speerwerfer,
    constructing,
  }
}

function offlineNote(before: Snap, after: Snap, elapsedMs: number): string | null {
  const parts: string[] = []
  const gold = Math.floor(after.goldStored - before.goldStored)
  const harz = Math.floor(after.harzStored - before.harzStored)
  const built = after.levels - before.levels
  const troops = after.army - before.army
  if (gold > 0) parts.push(`${formatNum(gold)} Gold in den Schächten`)
  if (harz > 0) parts.push(`${formatNum(harz)} Harz in den Siedereien`)
  if (built > 0) parts.push(built === 1 ? 'ein Ausbau fertig' : `${built} Ausbauten fertig`)
  if (troops > 0) parts.push(troops === 1 ? 'ein neuer Trupp' : `${troops} neue Trupps`)
  if (parts.length === 0) return null
  const minutes = Math.max(1, Math.round(elapsedMs / 60000))
  return `Während du weg warst (${minutes} Min.): ${parts.join(', ')}.`
}

function sanitize(raw: unknown): SaveState | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Partial<SaveState>
  if (data.v !== 1) return null
  if (!Array.isArray(data.buildings)) return null

  const buildings: Building[] = []
  for (const item of data.buildings) {
    if (!item || typeof item !== 'object') continue
    const b = item as Partial<Building>
    if (typeof b.id !== 'string' || typeof b.kind !== 'string') continue
    if (!KINDS.has(b.kind as BuildingKind)) continue
    const kind = b.kind as BuildingKind
    const def = buildingDef(kind)
    const x = Math.floor(Number(b.x))
    const y = Math.floor(Number(b.y))
    const level = Math.floor(Number(b.level))
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(level)) continue
    if (x < 0 || y < 0 || x + def.size > MAP_SIZE || y + def.size > MAP_SIZE) continue
    if (level < 0 || level > def.levels.length) continue
    let blocked = false
    for (const other of buildings) {
      if (overlap(x, y, def.size, other.x, other.y, buildingDef(other.kind).size)) {
        blocked = true
        break
      }
    }
    if (blocked) continue
    const finishAt = b.finishAt == null ? null : Number(b.finishAt)
    buildings.push({
      id: b.id,
      kind,
      x,
      y,
      level,
      finishAt: finishAt != null && Number.isFinite(finishAt) ? finishAt : null,
      stored: isCollector(kind) ? Math.max(0, Number(b.stored) || 0) : 0,
    })
  }

  const halls = buildings.filter((b) => b.kind === 'rathaus')
  if (halls.length !== 1 || halls[0].level < 1) return null

  for (const b of buildings) {
    if (!isCollector(b.kind) || b.level < 1) continue
    const cap = levelStats(b.kind, b.level).holdCap ?? b.stored
    b.stored = Math.min(b.stored, cap)
  }

  const troopCount = (value: number | undefined) => Math.min(500, Math.max(0, Math.floor(Number(value) || 0)))
  const army = {
    schlaeger: troopCount(data.army?.schlaeger),
    speerwerfer: troopCount(data.army?.speerwerfer),
  }
  const queue = Array.isArray(data.queue)
    ? data.queue.flatMap((job) => {
        if (!job || typeof job !== 'object') return []
        const j = job as { id?: string; kind?: string; finishAt?: number }
        if (typeof j.id !== 'string' || !TROOPS.has(j.kind as TroopKind)) return []
        const finishAt = Number(j.finishAt)
        if (!Number.isFinite(finishAt)) return []
        return [{ id: j.id, kind: j.kind as TroopKind, finishAt }]
      })
    : []

  return {
    v: 1,
    gold: Math.max(0, Number(data.gold) || 0),
    harz: Math.max(0, Number(data.harz) || 0),
    buildings,
    army,
    queue,
    updatedAt: Number.isFinite(Number(data.updatedAt)) ? Number(data.updatedAt) : Date.now(),
    sound: data.sound !== false,
  }
}

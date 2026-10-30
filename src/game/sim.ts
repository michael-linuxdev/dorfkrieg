import {
  ARMY_CAP,
  BUILDINGS,
  MAP_SIZE,
  TROOPS,
  buildingDef,
  collectorResource,
  isCollector,
  levelStats,
} from './data'
import { overlap } from './geom'
import type { Attempt, Building, BuildingKind, SaveState, TroopKind } from './types'

let seq = 1

export function uid(prefix: string): string {
  seq += 1
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}`
}

export function hallLevel(state: SaveState): number {
  const hall = state.buildings.find((b) => b.kind === 'rathaus')
  return hall?.level ?? 0
}

export function armyCap(state: SaveState): number {
  return ARMY_CAP[hallLevel(state)] ?? ARMY_CAP[1]
}

export function armySize(state: SaveState): number {
  return state.army.schlaeger + state.army.speerwerfer
}

export function storageCaps(state: SaveState): { gold: number; harz: number } {
  let gold = 0
  let harz = 0
  for (const b of state.buildings) {
    if (b.level < 1) continue
    const stats = levelStats(b.kind, b.level)
    gold += stats.goldStorage ?? 0
    harz += stats.harzStorage ?? 0
  }
  return { gold, harz }
}

export function builderJob(state: SaveState, now: number): Building | null {
  return state.buildings.find((b) => b.finishAt != null && b.finishAt > now) ?? null
}

export function countKind(state: SaveState, kind: BuildingKind, ignoreId?: string): number {
  return state.buildings.filter((b) => b.kind === kind && b.id !== ignoreId).length
}

export function footprintFree(
  state: SaveState,
  kind: BuildingKind,
  x: number,
  y: number,
  ignoreId?: string,
): boolean {
  const size = buildingDef(kind).size
  if (x < 0 || y < 0 || x + size > MAP_SIZE || y + size > MAP_SIZE) return false
  for (const b of state.buildings) {
    if (b.id === ignoreId) continue
    if (overlap(x, y, size, b.x, b.y, buildingDef(b.kind).size)) return false
  }
  return true
}

export function trainSlots(state: SaveState): number {
  let slots = 0
  for (const b of state.buildings) {
    if (b.kind === 'kaserne' && b.level >= 1) slots += b.level + 2
  }
  return slots
}

function bestBarracksLevel(state: SaveState): number {
  let level = 0
  for (const b of state.buildings) {
    if (b.kind === 'kaserne' && b.level > level) level = b.level
  }
  return level
}

function addProduction(b: Building, level: number, seconds: number): void {
  if (seconds <= 0 || level < 1 || !isCollector(b.kind)) return
  const stats = levelStats(b.kind, level)
  const rate = stats.prodPerHour ?? 0
  const cap = stats.holdCap ?? 0
  b.stored = Math.min(cap, b.stored + (rate / 3600) * seconds)
}

/** Zieht Bauzeiten, Ausbildung und Sammlerproduktion bis `now` nach. */
export function catchUp(state: SaveState, now: number): void {
  const prev = Number.isFinite(state.updatedAt) ? state.updatedAt : now
  const delta = Math.max(0, now - prev)

  for (const b of state.buildings) {
    if (isCollector(b.kind)) {
      if (b.level >= 1) {
        const finish = b.finishAt
        if (finish != null && finish > prev && finish < now) {
          addProduction(b, b.level, (finish - prev) / 1000)
          addProduction(b, b.level + 1, (now - finish) / 1000)
        } else {
          addProduction(b, b.level, delta / 1000)
        }
      } else if (b.finishAt != null && b.finishAt < now) {
        addProduction(b, 1, (now - b.finishAt) / 1000)
      }
    }
    if (b.finishAt != null && b.finishAt <= now) {
      const max = BUILDINGS[b.kind].levels.length
      b.level = Math.min(max, b.level + 1)
      b.finishAt = null
      if (isCollector(b.kind)) {
        const cap = levelStats(b.kind, b.level).holdCap ?? b.stored
        b.stored = Math.min(b.stored, cap)
      }
    }
  }

  const done = state.queue.filter((job) => job.finishAt <= now).sort((a, b) => a.finishAt - b.finishAt)
  state.queue = state.queue.filter((job) => job.finishAt > now)
  for (const job of done) {
    if (armySize(state) < armyCap(state)) state.army[job.kind] += 1
  }

  state.gold = sanitizeAmount(state.gold)
  state.harz = sanitizeAmount(state.harz)
  state.updatedAt = now
}

function sanitizeAmount(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

export function tryPlace(state: SaveState, kind: BuildingKind, x: number, y: number, now: number): Attempt {
  const def = buildingDef(kind)
  const stats = def.levels[0]
  if (hallLevel(state) < stats.hall) {
    return { ok: false, reason: `Dafür brauchst du Rathaus-Stufe ${stats.hall}.` }
  }
  if (countKind(state, kind) >= def.maxCount) {
    return { ok: false, reason: 'Maximale Anzahl erreicht.' }
  }
  if (builderJob(state, now)) {
    return { ok: false, reason: 'Der Bauarbeiter ist beschäftigt.' }
  }
  if (!footprintFree(state, kind, x, y)) {
    return { ok: false, reason: 'Hier ist kein Platz.' }
  }
  if (state.gold < stats.gold || state.harz < stats.harz) {
    return { ok: false, reason: 'Nicht genug Rohstoffe.' }
  }
  state.gold -= stats.gold
  state.harz -= stats.harz
  state.buildings.push({
    id: uid('b'),
    kind,
    x,
    y,
    level: 0,
    finishAt: now + stats.seconds * 1000,
    stored: 0,
  })
  return { ok: true }
}

export function tryUpgrade(state: SaveState, id: string, now: number): Attempt {
  const b = state.buildings.find((item) => item.id === id)
  if (!b) return { ok: false, reason: 'Gebäude nicht gefunden.' }
  if (b.finishAt != null && b.finishAt > now) {
    return { ok: false, reason: 'Daran wird schon gebaut.' }
  }
  const def = buildingDef(b.kind)
  if (b.level >= def.levels.length) {
    return { ok: false, reason: 'Dieses Gebäude ist bereits auf der höchsten Stufe.' }
  }
  const stats = def.levels[b.level]
  if (hallLevel(state) < stats.hall) {
    return { ok: false, reason: `Dafür brauchst du Rathaus-Stufe ${stats.hall}.` }
  }
  if (builderJob(state, now)) {
    return { ok: false, reason: 'Der Bauarbeiter ist beschäftigt.' }
  }
  if (state.gold < stats.gold || state.harz < stats.harz) {
    return { ok: false, reason: 'Nicht genug Rohstoffe.' }
  }
  state.gold -= stats.gold
  state.harz -= stats.harz
  b.finishAt = now + stats.seconds * 1000
  return { ok: true }
}

export function tryMove(state: SaveState, id: string, x: number, y: number): Attempt {
  const b = state.buildings.find((item) => item.id === id)
  if (!b) return { ok: false, reason: 'Gebäude nicht gefunden.' }
  if (!footprintFree(state, b.kind, x, y, id)) {
    return { ok: false, reason: 'Hier ist kein Platz.' }
  }
  b.x = x
  b.y = y
  return { ok: true }
}

export function tryRemove(state: SaveState, id: string, now: number): Attempt {
  const index = state.buildings.findIndex((item) => item.id === id)
  if (index < 0) return { ok: false, reason: 'Gebäude nicht gefunden.' }
  const b = state.buildings[index]
  if (b.kind === 'rathaus') {
    return { ok: false, reason: 'Das Rathaus kann nicht abgerissen werden.' }
  }
  const constructing = b.finishAt != null && b.finishAt > now
  if (constructing && b.level === 0) {
    const stats = levelStats(b.kind, 1)
    state.gold += stats.gold
    state.harz += stats.harz
    state.buildings.splice(index, 1)
    return { ok: true }
  }
  if (constructing && b.level >= 1) {
    const stats = BUILDINGS[b.kind].levels[b.level]
    state.gold += stats.gold
    state.harz += stats.harz
    b.finishAt = null
    return { ok: true }
  }
  const stats = levelStats(b.kind, Math.max(1, b.level))
  state.gold += Math.floor(stats.gold * 0.5)
  state.harz += Math.floor(stats.harz * 0.5)
  state.buildings.splice(index, 1)
  return { ok: true }
}

export interface CollectResult {
  ok: boolean
  reason?: string
  amount: number
  resource: 'gold' | 'harz' | null
}

export function tryCollect(state: SaveState, id: string): CollectResult {
  const b = state.buildings.find((item) => item.id === id)
  if (!b) return { ok: false, reason: 'Gebäude nicht gefunden.', amount: 0, resource: null }
  const resource = collectorResource(b.kind)
  if (!resource || b.level < 1) {
    return { ok: false, reason: 'Hier gibt es nichts zu sammeln.', amount: 0, resource: null }
  }
  const amountReady = Math.floor(b.stored)
  if (amountReady <= 0) {
    return { ok: false, reason: 'Noch nichts gesammelt.', amount: 0, resource }
  }
  const caps = storageCaps(state)
  const room = Math.max(0, (resource === 'gold' ? caps.gold : caps.harz) - (resource === 'gold' ? state.gold : state.harz))
  if (room <= 0) {
    return { ok: false, reason: 'Das Lager ist voll.', amount: 0, resource }
  }
  const take = Math.min(room, amountReady)
  b.stored -= take
  if (resource === 'gold') state.gold += take
  else state.harz += take
  return { ok: true, amount: take, resource }
}

export function tryTrain(state: SaveState, kind: TroopKind, now: number): Attempt {
  if (bestBarracksLevel(state) < 1) {
    return { ok: false, reason: 'Baue zuerst eine Kaserne.' }
  }
  if (state.queue.length >= trainSlots(state)) {
    return { ok: false, reason: 'Die Ausbildungswarteschlange ist voll.' }
  }
  if (armySize(state) + state.queue.length >= armyCap(state)) {
    return { ok: false, reason: 'Das Heer ist voll.' }
  }
  const troop = TROOPS[kind]
  if (state.gold < troop.gold || state.harz < troop.harz) {
    return { ok: false, reason: 'Nicht genug Rohstoffe.' }
  }
  const speed = 1 + (bestBarracksLevel(state) - 1) * 0.2
  const ms = (troop.seconds / speed) * 1000
  const start = state.queue.length > 0 ? state.queue[state.queue.length - 1].finishAt : now
  state.gold -= troop.gold
  state.harz -= troop.harz
  state.queue.push({ id: uid('q'), kind, finishAt: start + ms })
  return { ok: true }
}

export function upgradePreview(state: SaveState, b: Building, now: number): Attempt & { label: string } {
  const def = buildingDef(b.kind)
  if (b.finishAt != null && b.finishAt > now) {
    return { ok: false, reason: 'Daran wird schon gebaut.', label: 'Bau läuft' }
  }
  if (b.level >= def.levels.length) {
    return { ok: false, reason: 'Höchste Stufe erreicht.', label: 'Höchste Stufe' }
  }
  const stats = def.levels[b.level]
  const label = `Auf Stufe ${b.level + 1} – ${formatCost(stats.gold, stats.harz)}, ${stats.seconds}s`
  if (hallLevel(state) < stats.hall) {
    return { ok: false, reason: `Rathaus-Stufe ${stats.hall} nötig.`, label }
  }
  if (builderJob(state, now)) {
    return { ok: false, reason: 'Der Bauarbeiter ist beschäftigt.', label }
  }
  if (state.gold < stats.gold || state.harz < stats.harz) {
    return { ok: false, reason: 'Nicht genug Rohstoffe.', label }
  }
  return { ok: true, label }
}

export function formatCost(gold: number, harz: number): string {
  const parts: string[] = []
  if (gold > 0) parts.push(`${gold} Gold`)
  if (harz > 0) parts.push(`${harz} Harz`)
  return parts.join(', ') || 'kostenlos'
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m <= 0) return `${r}s`
  return `${m}:${r.toString().padStart(2, '0')}`
}

export function formatNum(n: number): string {
  return Math.floor(n).toLocaleString('de-DE')
}

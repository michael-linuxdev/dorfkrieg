import { BUILDINGS, MAP_SIZE, TROOPS, buildingDef, levelStats } from './data'
import { distToRect } from './geom'
import { findPath, type Cell } from './path'
import type { Building, BuildingKind, TroopKind } from './types'

export interface BattleBuilding {
  id: string
  kind: BuildingKind
  x: number
  y: number
  size: number
  level: number
  hp: number
  maxHp: number
  cooldown: number
  flash: number
}

export interface BattleTroop {
  id: string
  kind: TroopKind
  x: number
  y: number
  hp: number
  maxHp: number
  cooldown: number
  path: Cell[]
  repath: number
  targetId: string | null
  faceX: number
  faceY: number
}

export interface Shot {
  x: number
  y: number
  tx: number
  ty: number
  age: number
  life: number
  style: 'ball' | 'spear' | 'slash'
}

export interface Floater {
  x: number
  y: number
  text: string
  age: number
  life: number
  color: string
}

export interface BattleState {
  mode: 'attack' | 'raid'
  buildings: BattleBuilding[]
  troops: BattleTroop[]
  shots: Shot[]
  floaters: Floater[]
  time: number
  limit: number
  /** Angriff: Beute im Feinddorf. Überfall: Rohstoffe, die auf dem Spiel stehen. */
  lootGold: number
  lootHarz: number
  spawnQueue: TroopKind[]
  spawnCooldown: number
  pendingEnd: number | null
  over: boolean
  rng: () => number
}

let troopSeq = 1

export function battleScore(battle: BattleState): { pct: number; stars: number; thDestroyed: boolean } {
  let max = 0
  let cur = 0
  let thDestroyed = false
  for (const building of battle.buildings) {
    if (building.kind === 'rathaus' && building.hp <= 0) thDestroyed = true
    if (building.kind === 'palisade') continue
    max += building.maxHp
    cur += Math.max(0, building.hp)
  }
  const pct = max <= 0 ? 100 : Math.floor((1 - cur / max) * 100)
  let stars = 0
  if (pct >= 50) stars += 1
  if (pct >= 100) stars += 1
  if (thDestroyed) stars += 1
  return { pct, stars, thDestroyed }
}

export function createAttack(hall: number, seed = Math.floor(Math.random() * 1_000_000_000)): BattleState {
  const rng = mulberry32(seed)
  const enemy = generateEnemy(Math.max(1, Math.min(5, Math.floor(hall) || 1)), rng)
  return {
    mode: 'attack',
    buildings: enemy.buildings,
    troops: [],
    shots: [],
    floaters: [],
    time: 0,
    limit: 150,
    lootGold: enemy.lootGold,
    lootHarz: enemy.lootHarz,
    spawnQueue: [],
    spawnCooldown: 0,
    pendingEnd: null,
    over: false,
    rng,
  }
}

export function createRaid(buildings: Building[], hall: number, gold: number, harz: number): BattleState {
  const wave: TroopKind[] = []
  const safeHall = Math.max(1, Math.min(5, Math.floor(hall) || 1))
  for (let i = 0; i < 2 + safeHall; i++) wave.push('schlaeger')
  for (let i = 0; i < Math.max(0, safeHall - 1); i++) wave.push('speerwerfer')
  return {
    mode: 'raid',
    buildings: buildings.map((building) => toBattleBuilding(building)),
    troops: [],
    shots: [],
    floaters: [],
    time: 0,
    limit: 90,
    lootGold: Math.max(0, gold),
    lootHarz: Math.max(0, harz),
    spawnQueue: wave,
    spawnCooldown: 0.35,
    pendingEnd: null,
    over: false,
    rng: mulberry32((Date.now() ^ (safeHall * 9973)) >>> 0),
  }
}

export function isDeployCell(x: number, y: number): boolean {
  return x === 0 || y === 0 || x === MAP_SIZE - 1 || y === MAP_SIZE - 1
}

export function canDeployAt(battle: BattleState, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE) return false
  if (!isDeployCell(x, y)) return false
  return occupant(battle, x, y) == null
}

export function deployTroop(battle: BattleState, kind: TroopKind, x: number, y: number): boolean {
  if (battle.over || battle.mode !== 'attack') return false
  if (!canDeployAt(battle, x, y)) return false
  pushTroop(battle, kind, x, y)
  return true
}

export function tickBattle(battle: BattleState, dt: number, armyEmpty: boolean): void {
  if (battle.over) return
  let left = Math.max(0, dt)
  while (left > 0 && !battle.over) {
    const step = Math.min(0.05, left)
    simulate(battle, step, armyEmpty)
    left -= step
  }
}

function simulate(battle: BattleState, dt: number, armyEmpty: boolean): void {
  battle.time += dt
  if (battle.mode === 'raid' && battle.spawnQueue.length > 0) {
    battle.spawnCooldown -= dt
    if (battle.spawnCooldown <= 0) {
      const kind = battle.spawnQueue.shift()
      const cell = kind ? randomBorder(battle) : null
      if (kind && cell) pushTroop(battle, kind, cell.x, cell.y)
      battle.spawnCooldown = 0.7
    }
  }

  for (const troop of battle.troops) updateTroop(battle, troop, dt)
  updateTowers(battle, dt)
  battle.troops = battle.troops.filter((troop) => troop.hp > 0)

  for (const shot of battle.shots) shot.age += dt
  for (const floater of battle.floaters) floater.age += dt
  battle.shots = battle.shots.filter((shot) => shot.age < shot.life).slice(-48)
  battle.floaters = battle.floaters.filter((floater) => floater.age < floater.life).slice(-40)

  const score = battleScore(battle)
  const alive = battle.troops.length > 0
  const attackersDone =
    battle.mode === 'raid' ? battle.spawnQueue.length === 0 && !alive : armyEmpty && !alive
  if (score.pct >= 100 || battle.time >= battle.limit || attackersDone) {
    if (battle.pendingEnd == null) battle.pendingEnd = score.pct >= 100 ? 0.7 : 0.4
  }
  if (battle.pendingEnd != null) {
    battle.pendingEnd -= dt
    if (battle.pendingEnd <= 0) battle.over = true
  }
}

function updateTroop(battle: BattleState, troop: BattleTroop, dt: number): void {
  if (troop.hp <= 0) return
  troop.cooldown = Math.max(0, troop.cooldown - dt)
  troop.repath -= dt

  let target = battle.buildings.find((building) => building.id === troop.targetId && building.hp > 0) ?? null
  if (!target) {
    target = pickTarget(battle, troop)
    troop.targetId = target?.id ?? null
    troop.repath = 0
  }
  if (!target) return

  if (troop.repath <= 0) {
    troop.path = pathTo(battle, troop, target) ?? []
    troop.repath = 0.45
  }

  const stats = TROOPS[troop.kind]
  const dist = distToRect(troop.x, troop.y, target.x, target.y, target.size, target.size)
  if (dist <= stats.range + 0.08) {
    face(troop, target.x + target.size / 2, target.y + target.size / 2)
    swing(battle, troop, target)
    return
  }

  if (troop.path.length > 0) {
    const next = troop.path[0]
    const blocking = occupant(battle, next.x, next.y)
    if (blocking) {
      const gap = distToRect(troop.x, troop.y, blocking.x, blocking.y, blocking.size, blocking.size)
      if (gap <= Math.max(stats.range, 0.95)) {
        face(troop, blocking.x + blocking.size / 2, blocking.y + blocking.size / 2)
        swing(battle, troop, blocking)
        return
      }
      nudge(troop, next.x, next.y, dt, stats.speed)
      return
    }
    if (moveToward(troop, next.x + 0.5, next.y + 0.5, dt, stats.speed)) troop.path.shift()
    return
  }

  fallbackStep(battle, troop, target, dt, stats.speed)
}

function swing(battle: BattleState, troop: BattleTroop, target: BattleBuilding): void {
  if (troop.cooldown > 0) return
  const stats = TROOPS[troop.kind]
  hurtBuilding(battle, troop.x, troop.y, target, stats.damage, troop.kind === 'speerwerfer' ? 'spear' : 'slash')
  troop.cooldown = stats.cooldown
}

function updateTowers(battle: BattleState, dt: number): void {
  for (const building of battle.buildings) {
    building.flash = Math.max(0, building.flash - dt)
    if (building.hp <= 0 || building.kind !== 'wachturm' || building.level < 1) continue
    building.cooldown = Math.max(0, building.cooldown - dt)
    const stats = levelStats(building.kind, building.level)
    const range = stats.range ?? 4
    const cx = building.x + building.size / 2
    const cy = building.y + building.size / 2
    let best: BattleTroop | null = null
    let bestDist = range
    for (const troop of battle.troops) {
      if (troop.hp <= 0) continue
      const dist = Math.hypot(troop.x - cx, troop.y - cy)
      if (dist <= bestDist) {
        bestDist = dist
        best = troop
      }
    }
    if (!best || building.cooldown > 0) continue
    const damage = stats.damage ?? 10
    best.hp = Math.max(0, best.hp - damage)
    building.cooldown = stats.cooldown ?? 0.8
    building.flash = 0.12
    battle.floaters.push({ x: best.x, y: best.y, text: `−${damage}`, age: 0, life: 0.65, color: '#ffb4b4' })
    battle.shots.push({ x: cx, y: cy, tx: best.x, ty: best.y, age: 0, life: 0.22, style: 'ball' })
  }
}

function hurtBuilding(
  battle: BattleState,
  fromX: number,
  fromY: number,
  target: BattleBuilding,
  damage: number,
  style: Shot['style'],
): void {
  target.hp = Math.max(0, target.hp - damage)
  target.flash = 0.12
  battle.floaters.push({
    x: target.x + target.size / 2,
    y: target.y + target.size / 2,
    text: `−${damage}`,
    age: 0,
    life: 0.7,
    color: '#ffe1b0',
  })
  battle.shots.push({
    x: fromX,
    y: fromY,
    tx: target.x + target.size / 2,
    ty: target.y + target.size / 2,
    age: 0,
    life: style === 'slash' ? 0.16 : 0.2,
    style,
  })
}

function pickTarget(battle: BattleState, troop: BattleTroop): BattleBuilding | null {
  let best: BattleBuilding | null = null
  let bestDist = Infinity
  let wall: BattleBuilding | null = null
  let wallDist = Infinity
  for (const building of battle.buildings) {
    if (building.hp <= 0) continue
    const dist = distToRect(troop.x, troop.y, building.x, building.y, building.size, building.size)
    if (building.kind === 'palisade') {
      if (dist < wallDist) {
        wallDist = dist
        wall = building
      }
    } else if (dist < bestDist) {
      bestDist = dist
      best = building
    }
  }
  return best ?? wall
}

function pathTo(battle: BattleState, troop: BattleTroop, target: BattleBuilding): Cell[] | null {
  const range = TROOPS[troop.kind].range
  return findPath(
    Math.floor(troop.x),
    Math.floor(troop.y),
    MAP_SIZE,
    MAP_SIZE,
    (x, y) => costAt(battle, x, y),
    (x, y) =>
      costAt(battle, x, y) === 1 &&
      distToRect(x + 0.5, y + 0.5, target.x, target.y, target.size, target.size) <= range,
    (x, y) => distToRect(x + 0.5, y + 0.5, target.x, target.y, target.size, target.size),
  )
}

function occupant(battle: BattleState, x: number, y: number): BattleBuilding | null {
  for (const building of battle.buildings) {
    if (building.hp <= 0) continue
    if (x >= building.x && x < building.x + building.size && y >= building.y && y < building.y + building.size) {
      return building
    }
  }
  return null
}

function costAt(battle: BattleState, x: number, y: number): number {
  const building = occupant(battle, x, y)
  if (!building) return 1
  if (building.kind === 'palisade') return 7
  return Number.POSITIVE_INFINITY
}

function face(troop: BattleTroop, x: number, y: number): void {
  troop.faceX = x - troop.x
  troop.faceY = y - troop.y
}

function moveToward(troop: BattleTroop, x: number, y: number, dt: number, speed: number): boolean {
  const dx = x - troop.x
  const dy = y - troop.y
  const dist = Math.hypot(dx, dy)
  if (dist < 0.06) {
    troop.x = x
    troop.y = y
    return true
  }
  const step = Math.min(dist, speed * dt)
  troop.x += (dx / dist) * step
  troop.y += (dy / dist) * step
  troop.faceX = dx
  troop.faceY = dy
  return step >= dist
}

function nudge(troop: BattleTroop, cellX: number, cellY: number, dt: number, speed: number): void {
  const cx = cellX + 0.5
  const cy = cellY + 0.5
  const dx = cx - troop.x
  const dy = cy - troop.y
  const dist = Math.hypot(dx, dy) || 1
  const nx = troop.x + (dx / dist) * speed * dt
  const ny = troop.y + (dy / dist) * speed * dt
  if (Math.floor(nx) === cellX && Math.floor(ny) === cellY) return
  troop.x = nx
  troop.y = ny
  troop.faceX = dx
  troop.faceY = dy
}

function fallbackStep(battle: BattleState, troop: BattleTroop, target: BattleBuilding, dt: number, speed: number): void {
  const dx = Math.sign(target.x + target.size / 2 - troop.x)
  const dy = Math.sign(target.y + target.size / 2 - troop.y)
  const options = [
    { x: dx, y: dy },
    { x: dx, y: 0 },
    { x: 0, y: dy },
  ]
  for (const option of options) {
    if (option.x === 0 && option.y === 0) continue
    const nx = troop.x + option.x * speed * dt
    const ny = troop.y + option.y * speed * dt
    const block = occupant(battle, Math.floor(nx), Math.floor(ny))
    if (block && block.hp > 0) continue
    if (nx < 0 || ny < 0 || nx >= MAP_SIZE || ny >= MAP_SIZE) continue
    troop.x = nx
    troop.y = ny
    troop.faceX = option.x
    troop.faceY = option.y
    return
  }
}

function pushTroop(battle: BattleState, kind: TroopKind, cellX: number, cellY: number): void {
  const stats = TROOPS[kind]
  const jx = (battle.rng() - 0.5) * 0.4
  const jy = (battle.rng() - 0.5) * 0.4
  troopSeq += 1
  battle.troops.push({
    id: `t${troopSeq}`,
    kind,
    x: Math.min(cellX + 0.82, Math.max(cellX + 0.18, cellX + 0.5 + jx)),
    y: Math.min(cellY + 0.82, Math.max(cellY + 0.18, cellY + 0.5 + jy)),
    hp: stats.hp,
    maxHp: stats.hp,
    cooldown: 0.15,
    path: [],
    repath: 0,
    targetId: null,
    faceX: cellX === 0 ? 1 : cellX === MAP_SIZE - 1 ? -1 : 0,
    faceY: cellY === 0 ? 1 : cellY === MAP_SIZE - 1 ? -1 : 1,
  })
}

function randomBorder(battle: BattleState): { x: number; y: number } | null {
  const cells: { x: number; y: number }[] = []
  for (let i = 0; i < MAP_SIZE; i++) {
    cells.push({ x: i, y: 0 }, { x: i, y: MAP_SIZE - 1 }, { x: 0, y: i }, { x: MAP_SIZE - 1, y: i })
  }
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(battle.rng() * (i + 1))
    const swap = cells[i]
    cells[i] = cells[j]
    cells[j] = swap
  }
  return cells.find((cell) => canDeployAt(battle, cell.x, cell.y)) ?? null
}

function toBattleBuilding(building: Building): BattleBuilding {
  const size = buildingDef(building.kind).size
  if (building.level < 1) {
    return {
      id: building.id,
      kind: building.kind,
      x: building.x,
      y: building.y,
      size,
      level: 0,
      hp: 90,
      maxHp: 90,
      cooldown: 0,
      flash: 0,
    }
  }
  const hp = levelStats(building.kind, building.level).hp
  return {
    id: building.id,
    kind: building.kind,
    x: building.x,
    y: building.y,
    size,
    level: building.level,
    hp,
    maxHp: hp,
    cooldown: 0,
    flash: 0,
  }
}

export function generateEnemy(
  hall: number,
  rng: () => number,
): { buildings: BattleBuilding[]; lootGold: number; lootHarz: number } {
  const buildings: BattleBuilding[] = []
  const used = new Set<string>()

  const fits = (x: number, y: number, size: number) => {
    if (x < 1 || y < 1 || x + size > MAP_SIZE - 1 || y + size > MAP_SIZE - 1) return false
    for (let iy = 0; iy < size; iy++) {
      for (let ix = 0; ix < size; ix++) {
        if (used.has(`${x + ix},${y + iy}`)) return false
      }
    }
    return true
  }

  const mark = (x: number, y: number, size: number) => {
    for (let iy = 0; iy < size; iy++) {
      for (let ix = 0; ix < size; ix++) used.add(`${x + ix},${y + iy}`)
    }
  }

  let seq = 1
  const add = (kind: BuildingKind, x: number, y: number, level: number): boolean => {
    const size = BUILDINGS[kind].size
    const lv = Math.max(1, Math.min(BUILDINGS[kind].levels.length, level))
    if (!fits(x, y, size)) return false
    mark(x, y, size)
    const hp = levelStats(kind, lv).hp
    buildings.push({
      id: `e${seq++}`,
      kind,
      x,
      y,
      size,
      level: lv,
      hp,
      maxHp: hp,
      cooldown: 0,
      flash: 0,
    })
    return true
  }

  add('rathaus', 7, 7, hall)
  const side = Math.floor(rng() * 4)
  const gap = (x: number, y: number) => {
    if (side === 0 && y === 4 && x >= 8 && x <= 9) return true
    if (side === 2 && y === 13 && x >= 8 && x <= 9) return true
    if (side === 1 && x === 13 && y >= 8 && y <= 9) return true
    if (side === 3 && x === 4 && y >= 8 && y <= 9) return true
    return false
  }
  for (let i = 4; i <= 13; i++) {
    const spots: [number, number][] = [
      [i, 4],
      [i, 13],
      [4, i],
      [13, i],
    ]
    for (const [x, y] of spots) {
      if (gap(x, y)) continue
      add('palisade', x, y, Math.min(3, hall))
    }
  }

  add('wachturm', 8, 10, Math.max(1, hall))
  add('goldschacht', 5, 5, Math.max(1, hall - 1))
  add('harzsiederei', 10, 5, Math.max(1, hall - 1))
  add('goldkammer', 5, 11, Math.max(1, Math.ceil(hall / 2)))
  if (hall >= 2) {
    add('harzspeicher', 11, 11, Math.max(1, hall - 1))
    add('kaserne', 10, 7, Math.min(hall, 3))
  }
  if (hall >= 3) add('wachturm', 5, 8, hall - 1)

  return {
    buildings,
    lootGold: 280 + hall * 190,
    lootHarz: 180 + hall * 130,
  }
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

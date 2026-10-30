import { BUILDINGS, TROOPS } from './data'
import { hash01, toScreen, type Pt } from './geom'
import type { BuildingKind, TroopKind } from './types'

export interface Camera {
  x: number
  y: number
  zoom: number
}

export interface RenderBuilding {
  kind: BuildingKind
  x: number
  y: number
  size: number
  level: number
  hp: number | null
  maxHp: number
  constructing: boolean
  remainSec: number | null
  storedRatio: number | null
  selected: boolean
  team: 'own' | 'foe'
  ruined: boolean
  flash: boolean
}

export interface RenderTroop {
  kind: TroopKind
  x: number
  y: number
  hp: number
  maxHp: number
  faceX: number
  faceY: number
}

export interface RenderShot {
  x: number
  y: number
  tx: number
  ty: number
  age: number
  life: number
  style: 'ball' | 'spear' | 'slash'
}

export interface RenderFloater {
  x: number
  y: number
  text: string
  age: number
  life: number
  color: string
}

export interface RenderModel {
  anim: number
  mapW: number
  mapH: number
  tint: 'home' | 'away'
  buildings: RenderBuilding[]
  troops: RenderTroop[]
  shots: RenderShot[]
  floaters: RenderFloater[]
  ghost: { kind: BuildingKind; x: number; y: number; ok: boolean } | null
  hover: { x: number; y: number } | null
  showDeploy: boolean
  reduceMotion: boolean
}

const TREES: { x: number; y: number; s: number }[] = [
  { x: -0.8, y: 2.1, s: 1 },
  { x: -1.2, y: 7.6, s: 1.25 },
  { x: -0.5, y: 13.4, s: 0.9 },
  { x: 3.1, y: -0.9, s: 1.1 },
  { x: 9.2, y: -1.15, s: 1.3 },
  { x: 15.1, y: -0.7, s: 1 },
  { x: 18.6, y: 3.2, s: 1.15 },
  { x: 18.9, y: 10.2, s: 1 },
  { x: 18.4, y: 15.5, s: 1.2 },
  { x: 2.2, y: 18.7, s: 1 },
  { x: 8.6, y: 18.9, s: 1.2 },
  { x: 14.6, y: 18.5, s: 0.95 },
]

export function renderWorld(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  viewW: number,
  viewH: number,
  dpr: number,
  model: RenderModel,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, viewW, viewH)
  ctx.setTransform(dpr * camera.zoom, 0, 0, dpr * camera.zoom, dpr * camera.x, dpr * camera.y)

  const blocked = new Set<string>()
  for (const building of model.buildings) {
    if (building.ruined) continue
    for (let iy = 0; iy < building.size; iy++) {
      for (let ix = 0; ix < building.size; ix++) blocked.add(`${building.x + ix},${building.y + iy}`)
    }
  }

  for (let y = -1; y <= model.mapH; y++) {
    for (let x = -1; x <= model.mapW; x++) {
      const outside = x < 0 || y < 0 || x >= model.mapW || y >= model.mapH
      drawTile(ctx, x, y, tileColor(model.tint, x, y, outside))
      if (!outside && hash01(x + 3, y + 9) > 0.94) drawTuft(ctx, x, y)
      if (
        model.showDeploy &&
        !outside &&
        (x === 0 || y === 0 || x === model.mapW - 1 || y === model.mapH - 1) &&
        !blocked.has(`${x},${y}`)
      ) {
        const pulse = model.reduceMotion ? 0.28 : 0.22 + Math.sin(model.anim * 4 + x + y) * 0.08
        drawTile(ctx, x, y, `rgba(240, 193, 74, ${pulse.toFixed(3)})`)
      }
    }
  }

  if (model.hover && model.hover.x >= 0 && model.hover.y >= 0 && model.hover.x < model.mapW && model.hover.y < model.mapH) {
    strokeFootprint(ctx, model.hover.x, model.hover.y, 1, 'rgba(255,255,255,0.35)')
  }

  const entities: { depth: number; paint: () => void }[] = []
  for (const tree of TREES) {
    entities.push({ depth: tree.x + tree.y, paint: () => drawTree(ctx, tree.x, tree.y, tree.s) })
  }
  for (const building of model.buildings) {
    entities.push({
      depth: building.x + building.y + building.size,
      paint: () => drawBuilding(ctx, building),
    })
  }
  for (const troop of model.troops) {
    entities.push({
      depth: troop.x + troop.y + 0.01,
      paint: () => drawTroop(ctx, troop, model.anim, model.reduceMotion),
    })
  }
  entities.sort((a, b) => a.depth - b.depth)
  for (const entity of entities) entity.paint()

  if (model.ghost) drawGhost(ctx, model.ghost)

  for (const shot of model.shots) drawShot(ctx, shot)
  for (const floater of model.floaters) drawFloater(ctx, floater)
}

function tileColor(tint: 'home' | 'away', x: number, y: number, outside: boolean): string {
  if (outside) return tint === 'home' ? '#1c3124' : '#332b1d'
  const h = hash01(x, y)
  const checker = (x + y) % 2 === 0
  if (tint === 'home') {
    if (h > 0.9) return '#86b85c'
    return checker ? '#67a24a' : '#5b9342'
  }
  if (h > 0.9) return '#c2b06a'
  return checker ? '#a39452' : '#948448'
}

function drawTile(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  const n = toScreen(x, y)
  const e = toScreen(x + 1, y)
  const s = toScreen(x + 1, y + 1)
  const w = toScreen(x, y + 1)
  ctx.beginPath()
  ctx.moveTo(n.x, n.y)
  ctx.lineTo(e.x, e.y)
  ctx.lineTo(s.x, s.y)
  ctx.lineTo(w.x, w.y)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
  ctx.strokeStyle = 'rgba(20, 36, 18, 0.16)'
  ctx.lineWidth = 1
  ctx.stroke()
}

function drawTuft(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const p = toScreen(x + 0.7, y + 0.35)
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.fillRect(p.x, p.y, 2, 2)
  ctx.fillRect(p.x + 4, p.y + 2, 2, 2)
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
  const p = toScreen(x, y)
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.beginPath()
  ctx.ellipse(0, 2, 10 * scale, 4 * scale, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#6d4a2e'
  ctx.fillRect(-2 * scale, -12 * scale, 4 * scale, 14 * scale)
  ctx.fillStyle = '#2d6a3c'
  ctx.beginPath()
  ctx.arc(0, -16 * scale, 11 * scale, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#3f874c'
  ctx.beginPath()
  ctx.arc(-5 * scale, -18 * scale, 7 * scale, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawBuilding(ctx: CanvasRenderingContext2D, building: RenderBuilding): void {
  if (building.ruined) {
    drawRubble(ctx, building)
    return
  }
  const def = BUILDINGS[building.kind]
  const height = building.constructing && building.level === 0 ? def.height * 0.45 : def.height
  ctx.save()
  if (building.constructing) ctx.globalAlpha = 0.78
  if (building.kind === 'palisade') drawPalisade(ctx, building.x, building.y, def.wall, def.roof)
  else drawBox(ctx, building.x, building.y, building.size, height, def.wall, building.flash ? '#fff1c4' : def.roof)
  const center = toScreen(building.x + building.size / 2, building.y + building.size / 2)
  center.y -= height
  if (building.kind !== 'palisade') drawIcon(ctx, building.kind, center.x, center.y, building.team)
  ctx.restore()

  if (building.selected) strokeFootprint(ctx, building.x, building.y, building.size, '#ffe08a')
  if (building.storedRatio != null) {
    const front = toScreen(building.x + building.size * 0.5, building.y + building.size)
    drawBar(ctx, front.x - 18, front.y - height - 8, 36, building.storedRatio, '#f0c14a')
  }
  if (building.hp != null && building.maxHp > 0) {
    const top = toScreen(building.x + building.size / 2, building.y)
    const color = building.hp / building.maxHp > 0.4 ? '#8dce6a' : '#e06a5a'
    drawBar(ctx, top.x - 18, top.y - height - 16, 36, building.hp / building.maxHp, color)
  }
  if (building.level > 0 && building.kind !== 'palisade') {
    const badge = toScreen(building.x + building.size, building.y)
    drawBadge(ctx, badge.x, badge.y - height, String(building.level))
  }
  if (building.remainSec != null) {
    const top = toScreen(building.x + building.size / 2, building.y)
    drawLabel(ctx, top.x, top.y - height - 22, `${Math.ceil(building.remainSec)}s`)
  }
}

function drawGhost(ctx: CanvasRenderingContext2D, ghost: { kind: BuildingKind; x: number; y: number; ok: boolean }): void {
  const def = BUILDINGS[ghost.kind]
  ctx.save()
  ctx.globalAlpha = 0.55
  if (ghost.kind === 'palisade') drawPalisade(ctx, ghost.x, ghost.y, def.wall, def.roof)
  else drawBox(ctx, ghost.x, ghost.y, def.size, def.height, def.wall, def.roof)
  ctx.restore()
  strokeFootprint(ctx, ghost.x, ghost.y, def.size, ghost.ok ? '#9be07a' : '#e06a5a')
}

function drawRubble(ctx: CanvasRenderingContext2D, building: RenderBuilding): void {
  const n = toScreen(building.x, building.y)
  const e = toScreen(building.x + building.size, building.y)
  const s = toScreen(building.x + building.size, building.y + building.size)
  const w = toScreen(building.x, building.y + building.size)
  ctx.beginPath()
  ctx.moveTo(n.x, n.y)
  ctx.lineTo(e.x, e.y)
  ctx.lineTo(s.x, s.y)
  ctx.lineTo(w.x, w.y)
  ctx.closePath()
  ctx.fillStyle = 'rgba(48, 36, 28, 0.55)'
  ctx.fill()
  const c = toScreen(building.x + building.size / 2, building.y + building.size / 2)
  ctx.fillStyle = '#6d5848'
  ctx.beginPath()
  ctx.arc(c.x - 6, c.y - 4, 5, 0, Math.PI * 2)
  ctx.arc(c.x + 7, c.y - 2, 4, 0, Math.PI * 2)
  ctx.fill()
}

function drawBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  height: number,
  wall: string,
  roof: string,
): void {
  const n = toScreen(x, y)
  const e = toScreen(x + size, y)
  const s = toScreen(x + size, y + size)
  const w = toScreen(x, y + size)
  const up = (p: Pt): Pt => ({ x: p.x, y: p.y - height })
  ctx.beginPath()
  ctx.moveTo(w.x, w.y)
  ctx.lineTo(s.x, s.y)
  ctx.lineTo(up(s).x, up(s).y)
  ctx.lineTo(up(w).x, up(w).y)
  ctx.closePath()
  ctx.fillStyle = shade(wall, -32)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(s.x, s.y)
  ctx.lineTo(e.x, e.y)
  ctx.lineTo(up(e).x, up(e).y)
  ctx.lineTo(up(s).x, up(s).y)
  ctx.closePath()
  ctx.fillStyle = shade(wall, -12)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(up(n).x, up(n).y)
  ctx.lineTo(up(e).x, up(e).y)
  ctx.lineTo(up(s).x, up(s).y)
  ctx.lineTo(up(w).x, up(w).y)
  ctx.closePath()
  ctx.fillStyle = roof
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.lineWidth = 1
  ctx.stroke()
}

function drawPalisade(ctx: CanvasRenderingContext2D, x: number, y: number, wall: string, roof: string): void {
  const base = toScreen(x + 0.5, y + 0.5)
  for (const ox of [-8, 0, 8]) {
    ctx.fillStyle = wall
    ctx.fillRect(base.x + ox - 3, base.y - 16, 6, 16)
    ctx.fillStyle = roof
    ctx.beginPath()
    ctx.moveTo(base.x + ox - 5, base.y - 16)
    ctx.lineTo(base.x + ox, base.y - 23)
    ctx.lineTo(base.x + ox + 5, base.y - 16)
    ctx.fill()
  }
}

function drawIcon(ctx: CanvasRenderingContext2D, kind: BuildingKind, cx: number, cy: number, team: 'own' | 'foe'): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  if (kind === 'rathaus') {
    ctx.strokeStyle = '#f4efe4'
    ctx.beginPath()
    ctx.moveTo(0, 8)
    ctx.lineTo(0, -16)
    ctx.stroke()
    ctx.fillStyle = team === 'foe' ? '#d4543c' : '#3dbea5'
    ctx.beginPath()
    ctx.moveTo(0, -16)
    ctx.lineTo(14, -11)
    ctx.lineTo(0, -6)
    ctx.fill()
  } else if (kind === 'goldschacht') {
    ctx.fillStyle = '#3a2a16'
    ctx.beginPath()
    ctx.ellipse(0, 2, 10, 5, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#f0c14a'
    ctx.beginPath()
    ctx.arc(0, -2, 4, 0, Math.PI * 2)
    ctx.fill()
  } else if (kind === 'harzsiederei') {
    ctx.fillStyle = '#e7fff8'
    ctx.beginPath()
    ctx.moveTo(0, -12)
    ctx.bezierCurveTo(10, -4, 8, 8, 0, 10)
    ctx.bezierCurveTo(-8, 8, -10, -4, 0, -12)
    ctx.fill()
    ctx.fillStyle = '#1f8f78'
    ctx.beginPath()
    ctx.arc(0, 0, 3, 0, Math.PI * 2)
    ctx.fill()
  } else if (kind === 'goldkammer') {
    ctx.fillStyle = '#8a5a22'
    ctx.fillRect(-10, -4, 20, 12)
    ctx.fillStyle = '#f0d48a'
    ctx.fillRect(-10, -8, 20, 5)
    ctx.fillStyle = '#3a2a16'
    ctx.fillRect(-2, -2, 4, 6)
  } else if (kind === 'harzspeicher') {
    ctx.fillStyle = '#d7efe9'
    ctx.beginPath()
    ctx.ellipse(0, 0, 8, 10, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#2c6d66'
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-8, -3)
    ctx.lineTo(8, -3)
    ctx.moveTo(-8, 3)
    ctx.lineTo(8, 3)
    ctx.stroke()
  } else if (kind === 'wachturm') {
    ctx.fillStyle = '#d7dde4'
    ctx.fillRect(-3, -6, 6, 14)
    ctx.fillRect(-8, -10, 5, 5)
    ctx.fillRect(3, -10, 5, 5)
  } else if (kind === 'kaserne') {
    ctx.strokeStyle = '#f4efe4'
    ctx.beginPath()
    ctx.moveTo(-8, -8)
    ctx.lineTo(8, 8)
    ctx.moveTo(8, -8)
    ctx.lineTo(-8, 8)
    ctx.stroke()
  }
  ctx.restore()
}

function drawTroop(ctx: CanvasRenderingContext2D, troop: RenderTroop, anim: number, reduceMotion: boolean): void {
  const p = toScreen(troop.x, troop.y)
  const bob = reduceMotion ? 0 : Math.sin(anim * 6 + troop.x * 4) * 1.4
  const py = p.y - 11 + bob
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.scale(1, 0.45)
  ctx.fillStyle = 'rgba(0,0,0,0.28)'
  ctx.beginPath()
  ctx.arc(0, 0, 11, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  const def = TROOPS[troop.kind]
  ctx.fillStyle = '#fff6e8'
  ctx.beginPath()
  ctx.arc(p.x, py, 12, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = def.color
  ctx.beginPath()
  ctx.arc(p.x, py, 9, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#1b140f'
  ctx.lineWidth = 2
  ctx.stroke()

  const ahead = toScreen(troop.x + troop.faceX, troop.y + troop.faceY)
  const angle = Math.atan2(ahead.y - p.y, ahead.x - p.x)
  ctx.strokeStyle = troop.kind === 'schlaeger' ? '#6b3a22' : '#f0e2c4'
  ctx.lineWidth = troop.kind === 'schlaeger' ? 3 : 2
  ctx.beginPath()
  ctx.moveTo(p.x + Math.cos(angle) * 3, py + Math.sin(angle) * 3)
  ctx.lineTo(
    p.x + Math.cos(angle) * (troop.kind === 'schlaeger' ? 18 : 22),
    py + Math.sin(angle) * (troop.kind === 'schlaeger' ? 18 : 22),
  )
  ctx.stroke()

  const ratio = troop.maxHp > 0 ? troop.hp / troop.maxHp : 0
  drawBar(ctx, p.x - 14, py - 22, 28, ratio, ratio > 0.4 ? '#8dce6a' : '#e06a5a')
}

function drawShot(ctx: CanvasRenderingContext2D, shot: RenderShot): void {
  const from = toScreen(shot.x, shot.y)
  const to = toScreen(shot.tx, shot.ty)
  const k = Math.min(1, shot.age / Math.max(0.01, shot.life))
  const x = from.x + (to.x - from.x) * k
  const y = from.y + (to.y - from.y) * k - 14
  ctx.save()
  ctx.globalAlpha = 1 - k * 0.35
  if (shot.style === 'ball') {
    ctx.fillStyle = '#f2c14a'
    ctx.beginPath()
    ctx.arc(x, y, 3.6, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(242, 193, 74, 0.7)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(from.x, from.y - 20)
    ctx.lineTo(x, y)
    ctx.stroke()
  } else if (shot.style === 'spear') {
    ctx.strokeStyle = '#fff8ea'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(from.x, from.y - 12)
    ctx.lineTo(x, y)
    ctx.stroke()
  } else {
    ctx.strokeStyle = '#fff8ea'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(to.x, to.y - 16, 8, -1, 0.7)
    ctx.stroke()
  }
  ctx.restore()
}

function drawFloater(ctx: CanvasRenderingContext2D, floater: RenderFloater): void {
  const p = toScreen(floater.x, floater.y)
  const k = floater.age / Math.max(0.01, floater.life)
  ctx.save()
  ctx.globalAlpha = Math.max(0, 1 - k)
  ctx.fillStyle = floater.color
  ctx.font = '700 13px "Segoe UI", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(floater.text, p.x, p.y - 30 - k * 16)
  ctx.restore()
}

function strokeFootprint(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
  const n = toScreen(x, y)
  const e = toScreen(x + size, y)
  const s = toScreen(x + size, y + size)
  const w = toScreen(x, y + size)
  ctx.beginPath()
  ctx.moveTo(n.x, n.y)
  ctx.lineTo(e.x, e.y)
  ctx.lineTo(s.x, s.y)
  ctx.lineTo(w.x, w.y)
  ctx.closePath()
  ctx.strokeStyle = color
  ctx.lineWidth = 2.5
  ctx.stroke()
}

function drawBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, ratio: number, color: string): void {
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(x, y, w, 5)
  ctx.fillStyle = color
  ctx.fillRect(x, y, Math.max(0, Math.min(1, ratio)) * w, 5)
}

function drawBadge(ctx: CanvasRenderingContext2D, x: number, y: number, text: string): void {
  ctx.beginPath()
  ctx.arc(x, y, 8, 0, Math.PI * 2)
  ctx.fillStyle = '#14201b'
  ctx.fill()
  ctx.strokeStyle = '#f0c14a'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = '#fff8ea'
  ctx.font = '700 10px "Segoe UI", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y + 0.5)
}

function drawLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string): void {
  ctx.font = '700 12px "Segoe UI", sans-serif'
  const width = ctx.measureText(text).width
  roundRect(ctx, x - width / 2 - 5, y - 9, width + 10, 18, 6)
  ctx.fillStyle = 'rgba(12, 18, 16, 0.82)'
  ctx.fill()
  ctx.fillStyle = '#fff8ea'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function shade(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16)
  const channel = (value: number) => Math.max(0, Math.min(255, value + amount))
  const r = channel((n >> 16) & 255)
  const g = channel((n >> 8) & 255)
  const b = channel(n & 255)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

import type { BuildingKind, TroopKind } from './types'

export const MAP_SIZE = 18
export const SAVE_KEY = 'dorfkrieg-save-v1'

/** Heergröße je Rathaus-Stufe (Index = Stufe). */
export const ARMY_CAP = [0, 20, 30, 42, 56, 72]

export interface LevelStats {
  gold: number
  harz: number
  seconds: number
  hall: number
  hp: number
  prodPerHour?: number
  holdCap?: number
  goldStorage?: number
  harzStorage?: number
  damage?: number
  range?: number
  cooldown?: number
}

export interface BuildingDef {
  kind: BuildingKind
  name: string
  blurb: string
  size: number
  maxCount: number
  height: number
  wall: string
  roof: string
  levels: LevelStats[]
}

export interface TroopDef {
  kind: TroopKind
  name: string
  blurb: string
  hp: number
  damage: number
  cooldown: number
  range: number
  speed: number
  gold: number
  harz: number
  seconds: number
  color: string
}

export const BUILDINGS: Record<BuildingKind, BuildingDef> = {
  rathaus: {
    kind: 'rathaus',
    name: 'Rathaus',
    blurb: 'Herz des Dorfes. Seine Stufe schaltet höhere Ausbauten frei.',
    size: 3,
    maxCount: 1,
    height: 56,
    wall: '#c4b29a',
    roof: '#8d3a34',
    levels: [
      { gold: 0, harz: 0, seconds: 0, hall: 1, hp: 1100, goldStorage: 800, harzStorage: 600 },
      { gold: 300, harz: 150, seconds: 12, hall: 1, hp: 1600, goldStorage: 1500, harzStorage: 1100 },
      { gold: 800, harz: 400, seconds: 20, hall: 2, hp: 2200, goldStorage: 2500, harzStorage: 1800 },
      { gold: 1800, harz: 900, seconds: 30, hall: 3, hp: 3000, goldStorage: 4000, harzStorage: 3000 },
      { gold: 4000, harz: 2000, seconds: 45, hall: 4, hp: 4000, goldStorage: 7000, harzStorage: 5000 },
    ],
  },
  goldschacht: {
    kind: 'goldschacht',
    name: 'Goldschacht',
    blurb: 'Fördert Gold. Tippe den Schacht an, um einzusammeln.',
    size: 2,
    maxCount: 3,
    height: 30,
    wall: '#8a6a3b',
    roof: '#e1b04a',
    levels: [
      { gold: 100, harz: 0, seconds: 6, hall: 1, hp: 320, prodPerHour: 2400, holdCap: 400 },
      { gold: 250, harz: 50, seconds: 12, hall: 2, hp: 460, prodPerHour: 4200, holdCap: 700 },
      { gold: 550, harz: 150, seconds: 18, hall: 3, hp: 620, prodPerHour: 7000, holdCap: 1100 },
      { gold: 1100, harz: 400, seconds: 26, hall: 4, hp: 800, prodPerHour: 11000, holdCap: 1700 },
      { gold: 2000, harz: 800, seconds: 36, hall: 5, hp: 1000, prodPerHour: 16000, holdCap: 2500 },
    ],
  },
  harzsiederei: {
    kind: 'harzsiederei',
    name: 'Harzsiederei',
    blurb: 'Gewinnt Harz aus Eichenrinde. Tippe die Siederei an, um einzusammeln.',
    size: 2,
    maxCount: 3,
    height: 32,
    wall: '#6d5438',
    roof: '#2f9e86',
    levels: [
      { gold: 80, harz: 20, seconds: 6, hall: 1, hp: 300, prodPerHour: 1800, holdCap: 300 },
      { gold: 220, harz: 80, seconds: 12, hall: 2, hp: 440, prodPerHour: 3200, holdCap: 550 },
      { gold: 500, harz: 200, seconds: 18, hall: 3, hp: 600, prodPerHour: 5400, holdCap: 900 },
      { gold: 1000, harz: 450, seconds: 26, hall: 4, hp: 780, prodPerHour: 8600, holdCap: 1400 },
      { gold: 1800, harz: 900, seconds: 36, hall: 5, hp: 980, prodPerHour: 12000, holdCap: 2000 },
    ],
  },
  goldkammer: {
    kind: 'goldkammer',
    name: 'Goldkammer',
    blurb: 'Erhöht, wie viel Gold das Dorf lagern kann.',
    size: 2,
    maxCount: 2,
    height: 28,
    wall: '#a68445',
    roof: '#f0d48a',
    levels: [
      { gold: 100, harz: 40, seconds: 8, hall: 1, hp: 400, goldStorage: 1500 },
      { gold: 280, harz: 120, seconds: 14, hall: 2, hp: 560, goldStorage: 3000 },
      { gold: 650, harz: 280, seconds: 20, hall: 3, hp: 740, goldStorage: 5500 },
      { gold: 1300, harz: 600, seconds: 28, hall: 4, hp: 960, goldStorage: 9000 },
      { gold: 2400, harz: 1100, seconds: 40, hall: 5, hp: 1200, goldStorage: 14000 },
    ],
  },
  harzspeicher: {
    kind: 'harzspeicher',
    name: 'Harzspeicher',
    blurb: 'Erhöht, wie viel Harz das Dorf lagern kann.',
    size: 2,
    maxCount: 2,
    height: 28,
    wall: '#3f6e74',
    roof: '#8fd0c4',
    levels: [
      { gold: 100, harz: 40, seconds: 8, hall: 1, hp: 400, harzStorage: 1200 },
      { gold: 280, harz: 120, seconds: 14, hall: 2, hp: 560, harzStorage: 2400 },
      { gold: 650, harz: 280, seconds: 20, hall: 3, hp: 740, harzStorage: 4200 },
      { gold: 1300, harz: 600, seconds: 28, hall: 4, hp: 960, harzStorage: 7000 },
      { gold: 2400, harz: 1100, seconds: 40, hall: 5, hp: 1200, harzStorage: 11000 },
    ],
  },
  wachturm: {
    kind: 'wachturm',
    name: 'Wachturm',
    blurb: 'Beschießt Truppen in Reichweite. Im Angriff feuern die Türme des Feinddorfs, im Überfall deine eigenen.',
    size: 2,
    maxCount: 5,
    height: 62,
    wall: '#5c6570',
    roof: '#3e4650',
    levels: [
      { gold: 150, harz: 80, seconds: 8, hall: 1, hp: 420, damage: 12, range: 4.1, cooldown: 0.85 },
      { gold: 360, harz: 180, seconds: 14, hall: 2, hp: 600, damage: 18, range: 4.4, cooldown: 0.78 },
      { gold: 750, harz: 400, seconds: 20, hall: 3, hp: 820, damage: 26, range: 4.7, cooldown: 0.7 },
      { gold: 1500, harz: 800, seconds: 28, hall: 4, hp: 1100, damage: 36, range: 5, cooldown: 0.64 },
      { gold: 2600, harz: 1400, seconds: 40, hall: 5, hp: 1400, damage: 48, range: 5.3, cooldown: 0.58 },
    ],
  },
  palisade: {
    kind: 'palisade',
    name: 'Palisade',
    blurb: 'Hält Truppen auf. Sie brechen das Holz oder suchen einen Weg darum herum.',
    size: 1,
    maxCount: 80,
    height: 18,
    wall: '#7b5a3c',
    roof: '#a67c52',
    levels: [
      { gold: 15, harz: 0, seconds: 1, hall: 1, hp: 160 },
      { gold: 40, harz: 10, seconds: 2, hall: 1, hp: 280 },
      { gold: 90, harz: 30, seconds: 3, hall: 2, hp: 420 },
    ],
  },
  kaserne: {
    kind: 'kaserne',
    name: 'Kaserne',
    blurb: 'Bildet Schläger und Speerwerfer aus. Höhere Stufen vergrößern die Warteschlange.',
    size: 3,
    maxCount: 1,
    height: 40,
    wall: '#7a5340',
    roof: '#a33b32',
    levels: [
      { gold: 180, harz: 90, seconds: 8, hall: 1, hp: 560 },
      { gold: 420, harz: 220, seconds: 14, hall: 2, hp: 780 },
      { gold: 900, harz: 480, seconds: 20, hall: 3, hp: 1040 },
      { gold: 1700, harz: 900, seconds: 28, hall: 4, hp: 1360 },
      { gold: 3000, harz: 1600, seconds: 40, hall: 5, hp: 1700 },
    ],
  },
}

export const TROOPS: Record<TroopKind, TroopDef> = {
  schlaeger: {
    kind: 'schlaeger',
    name: 'Schläger',
    blurb: 'Nahkämpfer mit Keule. Langsam, aber zäh.',
    hp: 100,
    damage: 16,
    cooldown: 0.72,
    range: 0.95,
    speed: 2.05,
    gold: 30,
    harz: 10,
    seconds: 3,
    color: '#e07a3d',
  },
  speerwerfer: {
    kind: 'speerwerfer',
    name: 'Speerwerfer',
    blurb: 'Wirft Speere aus der Distanz. Empfindlich im Nahkampf.',
    hp: 52,
    damage: 12,
    cooldown: 0.88,
    range: 3.35,
    speed: 1.9,
    gold: 22,
    harz: 18,
    seconds: 4,
    color: '#3d7ea8',
  },
}

export const CATALOG: BuildingKind[] = [
  'goldschacht',
  'harzsiederei',
  'goldkammer',
  'harzspeicher',
  'wachturm',
  'palisade',
  'kaserne',
]

export function buildingDef(kind: BuildingKind): BuildingDef {
  return BUILDINGS[kind]
}

export function levelStats(kind: BuildingKind, level: number): LevelStats {
  const levels = BUILDINGS[kind].levels
  const index = Math.max(0, Math.min(levels.length, level) - 1)
  return levels[index]
}

export function isCollector(kind: BuildingKind): boolean {
  return kind === 'goldschacht' || kind === 'harzsiederei'
}

export function collectorResource(kind: BuildingKind): 'gold' | 'harz' | null {
  if (kind === 'goldschacht') return 'gold'
  if (kind === 'harzsiederei') return 'harz'
  return null
}

export type BuildingKind =
  | 'rathaus'
  | 'goldschacht'
  | 'harzsiederei'
  | 'goldkammer'
  | 'harzspeicher'
  | 'wachturm'
  | 'palisade'
  | 'kaserne'

export type TroopKind = 'schlaeger' | 'speerwerfer'

export interface Building {
  id: string
  kind: BuildingKind
  x: number
  y: number
  /** Fertige Stufe. 0, solange der Erstbau läuft. */
  level: number
  finishAt: number | null
  stored: number
}

export interface TrainJob {
  id: string
  kind: TroopKind
  finishAt: number
}

export interface SaveState {
  v: 1
  gold: number
  harz: number
  buildings: Building[]
  army: Record<TroopKind, number>
  queue: TrainJob[]
  updatedAt: number
  sound: boolean
}

export type Attempt = { ok: true } | { ok: false; reason: string }

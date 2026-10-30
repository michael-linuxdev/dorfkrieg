import { playCollect, playError, playPlace, playResult } from './audio'
import {
  battleScore,
  createAttack,
  createRaid,
  deployTroop,
  nearestDeployCell,
  tickBattle,
  type BattleState,
} from './battle'
import { CATALOG, MAP_SIZE, TROOPS, buildingDef, isCollector, levelStats } from './data'
import { cellOf, footprintPoly, pointInPoly, screenToGrid, toScreen } from './geom'
import { clamp } from './geom'
import { renderWorld, type Camera, type RenderBuilding, type RenderFloater, type RenderModel } from './render'
import { createInitialState, loadState, writeState } from './save'
import {
  armyCap,
  armySize,
  builderJob,
  catchUp,
  countKind,
  footprintFree,
  formatCost,
  formatDuration,
  formatNum,
  hallLevel,
  storageCaps,
  trainSlots,
  tryCollect,
  tryMove,
  tryPlace,
  tryRemove,
  tryTrain,
  tryUpgrade,
  upgradePreview,
} from './sim'
import type { Building, BuildingKind, TroopKind } from './types'

type Mode =
  | { type: 'village' }
  | { type: 'place'; kind: BuildingKind }
  | { type: 'move'; id: string }
  | { type: 'battle'; battle: BattleState }

export function startGame(): void {
  const canvas = must<HTMLCanvasElement>('game')
  const context = requireContext(canvas)

  const loaded = loadState()
  let state = loaded.state
  writeState(state)

  let mode: Mode = { type: 'village' }
  let selectedId: string | null = null
  let hover: { x: number; y: number } | null = null
  let toast = loaded.note ?? ''
  let toastUntil = loaded.note ? Date.now() + 8000 : 0
  let selectedTroop: TroopKind = state.army.schlaeger > 0 ? 'schlaeger' : 'speerwerfer'
  let battleSpeed = 1
  let resultShown = false
  let userCamera = false
  const camera: Camera = { x: 0, y: 0, zoom: 1 }
  let viewW = 1
  let viewH = 1
  let dpr = 1
  const floaters: RenderFloater[] = []
  let structure = ''
  let lastUi = 0
  let lastSave = 0
  let lastFrame = performance.now()
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const pointers = new Map<number, { x: number; y: number }>()
  let pinch: { dist: number; midX: number; midY: number } | null = null
  let drag: { x: number; y: number; moved: boolean; button: number } | null = null
  let pointerActive = false

  const sidebar = must<HTMLElement>('sidebar')
  const banner = must<HTMLElement>('banner')
  const bannerText = must<HTMLElement>('banner-text')
  const btnCancel = must<HTMLButtonElement>('btn-cancel')
  const battleHud = must<HTMLElement>('battle-hud')
  const stage = must<HTMLElement>('stage')
  const goldN = must<HTMLElement>('gold-n')
  const harzN = must<HTMLElement>('harz-n')
  const goldC = must<HTMLElement>('gold-c')
  const harzC = must<HTMLElement>('harz-c')
  const goldPill = must<HTMLElement>('pill-gold')
  const harzPill = must<HTMLElement>('pill-harz')
  const hallN = must<HTMLElement>('hall-n')
  const armyLine = must<HTMLElement>('army-line')
  const toastEl = must<HTMLElement>('toast')
  const footerActions = must<HTMLElement>('footer-actions')
  const btnAttack = must<HTMLButtonElement>('btn-attack')
  const btnRaid = must<HTMLButtonElement>('btn-raid')
  const btnSound = must<HTMLButtonElement>('btn-sound')
  const btnReset = must<HTMLButtonElement>('btn-reset')
  const btnZoomIn = must<HTMLButtonElement>('btn-zoom-in')
  const btnZoomOut = must<HTMLButtonElement>('btn-zoom-out')
  const btnFit = must<HTMLButtonElement>('btn-fit')
  const battlePct = must<HTMLElement>('battle-pct')
  const battleTime = must<HTMLElement>('battle-time')
  const battleStars = must<HTMLElement>('battle-stars')
  const battleHint = must<HTMLElement>('battle-hint')
  const btnDepS = must<HTMLButtonElement>('btn-dep-s')
  const btnDepSp = must<HTMLButtonElement>('btn-dep-sp')
  const btnSpeed = must<HTMLButtonElement>('btn-speed')
  const btnRetreat = must<HTMLButtonElement>('btn-retreat')
  const modal = must<HTMLElement>('modal')
  const modalTitle = must<HTMLElement>('modal-title')
  const modalStars = must<HTMLElement>('modal-stars')
  const modalBody = must<HTMLElement>('modal-body')
  const modalOk = must<HTMLButtonElement>('modal-ok')
  const modalCancel = must<HTMLButtonElement>('modal-cancel')

  const resize = () => {
    const rect = canvas.getBoundingClientRect()
    viewW = Math.max(1, rect.width)
    viewH = Math.max(1, rect.height)
    dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.max(1, Math.floor(viewW * dpr))
    canvas.height = Math.max(1, Math.floor(viewH * dpr))
    if (!userCamera) fitCamera()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(stage)
  resize()

  btnSound.addEventListener('click', () => {
    state.sound = !state.sound
    writeState(state)
    if (state.sound) playPlace(true)
    renderChrome()
  })
  btnReset.addEventListener('click', confirmReset)
  btnZoomIn.addEventListener('click', () => {
    userCamera = true
    zoomAt(viewW / 2, viewH / 2, camera.zoom * 1.12)
  })
  btnZoomOut.addEventListener('click', () => {
    userCamera = true
    zoomAt(viewW / 2, viewH / 2, camera.zoom / 1.12)
  })
  btnFit.addEventListener('click', () => {
    userCamera = false
    fitCamera()
  })
  btnAttack.addEventListener('click', startAttack)
  btnRaid.addEventListener('click', startRaid)
  btnCancel.addEventListener('click', cancelMode)
  btnRetreat.addEventListener('click', () => {
    if (mode.type === 'battle') conclude(mode.battle)
  })
  btnSpeed.addEventListener('click', () => {
    battleSpeed = battleSpeed === 1 ? 2 : 1
    btnSpeed.textContent = battleSpeed === 2 ? 'Tempo ×1' : 'Tempo ×2'
    btnSpeed.classList.toggle('selected', battleSpeed === 2)
    btnSpeed.setAttribute('aria-pressed', battleSpeed === 2 ? 'true' : 'false')
  })
  btnDepS.addEventListener('click', () => selectTroop('schlaeger'))
  btnDepSp.addEventListener('click', () => selectTroop('speerwerfer'))

  document.body.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-act]')
    if (!target || modal.contains(target)) return
    onAction(target.dataset.act ?? '', target.dataset.kind ?? '', target.dataset.id ?? '')
  })

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    if (!modal.hidden) {
      if (!modalCancel.hidden) modalCancel.click()
      else modalOk.click()
      return
    }
    if (mode.type === 'place' || mode.type === 'move') cancelMode()
  })

  canvas.addEventListener('contextmenu', (event) => event.preventDefault())
  canvas.addEventListener('pointerdown', (event) => {
    if (!modal.hidden) return
    canvas.setPointerCapture(event.pointerId)
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.size === 1) {
      drag = { x: event.clientX, y: event.clientY, moved: false, button: event.button }
      pinch = null
    } else {
      drag = null
      pinch = pinchInfo()
    }
  })
  canvas.addEventListener('pointermove', (event) => {
    const world = clientToWorld(event.clientX, event.clientY)
    const cell = cellOf(world.x, world.y)
    hover = cell.x >= 0 && cell.y >= 0 && cell.x < MAP_SIZE && cell.y < MAP_SIZE ? cell : null
    if (!pointers.has(event.pointerId)) {
      updateCursor(world.x, world.y)
      return
    }
    const prev = pointers.get(event.pointerId)!
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.size >= 2 && pinch) {
      const next = pinchInfo()
      if (next && pinch.dist > 0) {
        const rect = canvas.getBoundingClientRect()
        zoomAt(next.midX - rect.left, next.midY - rect.top, camera.zoom * (next.dist / pinch.dist))
        camera.x += next.midX - pinch.midX
        camera.y += next.midY - pinch.midY
        pinch = next
        userCamera = true
      }
      return
    }
    if (!drag) return
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 8) drag.moved = true
    const placing = mode.type === 'place' || mode.type === 'move'
    const pan = drag.button === 1 || drag.button === 2 || (drag.button === 0 && !placing)
    if (pan && drag.moved) {
      camera.x += event.clientX - prev.x
      camera.y += event.clientY - prev.y
      userCamera = true
      canvas.style.cursor = 'grabbing'
    }
  })
  canvas.addEventListener('pointerup', (event) => {
    pointers.delete(event.pointerId)
    if (pointers.size < 2) pinch = null
    const wasDrag = drag
    if (pointers.size === 0) drag = null
    if (wasDrag && pointers.size === 0 && !wasDrag.moved && wasDrag.button === 0 && modal.hidden) {
      handleClick(event.clientX, event.clientY)
    }
    updateCursor(clientToWorld(event.clientX, event.clientY).x, clientToWorld(event.clientX, event.clientY).y)
  })
  canvas.addEventListener('pointercancel', (event) => {
    pointers.delete(event.pointerId)
    drag = null
    pinch = null
  })
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault()
      const rect = canvas.getBoundingClientRect()
      userCamera = true
      zoomAt(event.clientX - rect.left, event.clientY - rect.top, camera.zoom * (event.deltaY > 0 ? 0.9 : 1.1))
    },
    { passive: false },
  )

  document.addEventListener('pointerdown', () => {
    pointerActive = true
  })
  document.addEventListener('pointerup', () => {
    pointerActive = false
  })
  document.addEventListener('pointercancel', () => {
    pointerActive = false
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      catchUp(state, Date.now())
      writeState(state)
    }
  })
  window.addEventListener('beforeunload', () => writeState(state))

  selectTroop(selectedTroop)
  refreshUi()
  requestAnimationFrame(frame)

  function frame(now: number): void {
    const dt = Math.min(0.05, (now - lastFrame) / 1000)
    lastFrame = now
    const levels = new Map(state.buildings.map((building) => [building.id, building.level]))
    const beforeArmy = armySize(state)
    catchUp(state, Date.now())
    for (const building of state.buildings) {
      if ((levels.get(building.id) ?? 0) < building.level) {
        setToast(`${buildingDef(building.kind).name} ist fertig.`)
        playPlace(state.sound)
      }
    }
    if (armySize(state) > beforeArmy) setToast('Ausbildung abgeschlossen.')

    for (const floater of floaters) floater.age += dt
    while (floaters.length > 0 && floaters[0].age >= floaters[0].life) floaters.shift()

    if (mode.type === 'battle' && !mode.battle.over) {
      tickBattle(mode.battle, dt * battleSpeed, armySize(state) === 0)
    }
    if (mode.type === 'battle' && mode.battle.over && !resultShown) conclude(mode.battle)

    if (viewW > 1 && viewH > 1) renderWorld(context, camera, viewW, viewH, dpr, buildModel(now / 1000))

    if (now - lastUi > 200) {
      lastUi = now
      renderChrome()
      const key = structureKey()
      if (key !== structure && !pointerActive) {
        structure = key
        renderSidebar()
      }
    }
    if (Date.now() - lastSave > 2000) {
      lastSave = Date.now()
      writeState(state)
    }
    requestAnimationFrame(frame)
  }

  function buildModel(anim: number): RenderModel {
    const now = Date.now()
    const battle = mode.type === 'battle' ? mode.battle : null
    const buildings: RenderBuilding[] = battle
      ? battle.buildings.map((building) => ({
          kind: building.kind,
          x: building.x,
          y: building.y,
          size: building.size,
          level: building.level,
          hp: building.hp,
          maxHp: building.maxHp,
          constructing: false,
          remainSec: null,
          storedRatio: null,
          selected: false,
          team: battle.mode === 'attack' ? 'foe' : 'own',
          ruined: building.hp <= 0,
          flash: building.flash > 0,
        }))
      : state.buildings.map((building) => {
          const def = buildingDef(building.kind)
          const stats = building.level >= 1 ? levelStats(building.kind, building.level) : null
          const remain = building.finishAt != null ? Math.max(0, (building.finishAt - now) / 1000) : null
          const cap = stats?.holdCap ?? 0
          return {
            kind: building.kind,
            x: building.x,
            y: building.y,
            size: def.size,
            level: building.level,
            hp: null,
            maxHp: stats?.hp ?? 1,
            constructing: remain != null,
            remainSec: remain,
            storedRatio: isCollector(building.kind) && cap > 0 && building.level >= 1 ? building.stored / cap : null,
            selected: building.id === selectedId,
            team: 'own' as const,
            ruined: false,
            flash: false,
          }
        })

    let ghost: RenderModel['ghost'] = null
    if (mode.type === 'place' && hover) {
      ghost = { kind: mode.kind, x: hover.x, y: hover.y, ok: footprintFree(state, mode.kind, hover.x, hover.y) }
    } else if (mode.type === 'move' && hover) {
      const movingId = mode.id
      const building = state.buildings.find((item) => item.id === movingId)
      if (building) {
        ghost = {
          kind: building.kind,
          x: hover.x,
          y: hover.y,
          ok: footprintFree(state, building.kind, hover.x, hover.y, building.id),
        }
      }
    }

    return {
      anim,
      mapW: MAP_SIZE,
      mapH: MAP_SIZE,
      tint: battle?.mode === 'attack' ? 'away' : 'home',
      buildings,
      troops: battle
        ? battle.troops.map((troop) => ({
            kind: troop.kind,
            x: troop.x,
            y: troop.y,
            hp: troop.hp,
            maxHp: troop.maxHp,
            faceX: troop.faceX,
            faceY: troop.faceY,
          }))
        : [],
      shots: battle ? battle.shots : [],
      floaters: battle ? battle.floaters : floaters,
      ghost,
      hover: mode.type === 'battle' ? null : hover,
      showDeploy: battle?.mode === 'attack' && !battle.over,
      reduceMotion,
    }
  }

  function handleClick(clientX: number, clientY: number): void {
    const world = clientToWorld(clientX, clientY)
    const cell = cellOf(world.x, world.y)
    if (mode.type === 'battle') {
      if (mode.battle.mode === 'attack' && !mode.battle.over) {
        const grid = screenToGrid(world.x, world.y)
        onDeployClick(grid.x, grid.y)
      }
      return
    }
    if (mode.type === 'place') {
      const result = tryPlace(state, mode.kind, cell.x, cell.y, Date.now())
      if (!result.ok) {
        setToast(result.reason)
        playError(state.sound)
        return
      }
      playPlace(state.sound)
      const placed = state.buildings[state.buildings.length - 1]
      selectedId = placed?.id ?? null
      setToast(`${buildingDef(mode.kind).name} wird gebaut.`)
      if (mode.kind !== 'palisade') mode = { type: 'village' }
      refreshUi()
      return
    }
    if (mode.type === 'move') {
      const result = tryMove(state, mode.id, cell.x, cell.y)
      if (!result.ok) {
        setToast(result.reason)
        playError(state.sound)
        return
      }
      playPlace(state.sound)
      selectedId = mode.id
      mode = { type: 'village' }
      setToast('Gebäude verschoben.')
      refreshUi()
      return
    }
    const picked = pickBuilding(world.x, world.y)
    if (!picked) {
      selectedId = null
      refreshUi()
      return
    }
    selectedId = picked.id
    if (isCollector(picked.kind)) {
      const result = tryCollect(state, picked.id)
      if (result.ok && result.resource) {
        const name = result.resource === 'gold' ? 'Gold' : 'Harz'
        floaters.push({
          x: picked.x + buildingDef(picked.kind).size / 2,
          y: picked.y,
          text: `+${formatNum(result.amount)} ${name}`,
          age: 0,
          life: 1.1,
          color: result.resource === 'gold' ? '#f0c14a' : '#8ee0d0',
        })
        playCollect(state.sound)
        setToast(`+${formatNum(result.amount)} ${name}`)
      } else if (result.reason && result.reason !== 'Noch nichts gesammelt.') {
        setToast(result.reason)
        playError(state.sound)
      }
    }
    refreshUi()
  }

  function onDeployClick(gridX: number, gridY: number): void {
    if (mode.type !== 'battle') return
    if (state.army[selectedTroop] <= 0) {
      setToast('Von diesem Trupp ist niemand mehr übrig.')
      playError(state.sound)
      return
    }
    const spot = nearestDeployCell(mode.battle, gridX, gridY)
    if (!spot || !deployTroop(mode.battle, selectedTroop, spot.x, spot.y)) {
      setToast('Tippe auf den goldenen Rand, um Truppen abzusetzen.')
      playError(state.sound)
      return
    }
    state.army[selectedTroop] -= 1
    playPlace(state.sound)
    renderChrome()
  }

  function onAction(act: string, kind: string, id: string): void {
    if (mode.type === 'battle' && act !== 'collect') {
      if (act === 'build' || act === 'upgrade' || act === 'move' || act === 'remove' || act === 'train') {
        setToast('Während des Kampfes kannst du nicht bauen.')
        return
      }
    }
    if (act === 'build') beginPlace(kind as BuildingKind)
    else if (act === 'upgrade') {
      const result = tryUpgrade(state, id || selectedId || '', Date.now())
      if (!result.ok) {
        setToast(result.reason)
        playError(state.sound)
      } else {
        playPlace(state.sound)
        setToast('Ausbau gestartet.')
        refreshUi()
      }
    } else if (act === 'move') {
      const target = id || selectedId
      if (!target) return
      mode = { type: 'move', id: target }
      refreshUi()
    } else if (act === 'remove') askRemove(id || selectedId || '')
    else if (act === 'collect') {
      const target = id || selectedId
      if (!target) return
      const building = state.buildings.find((item) => item.id === target)
      const result = tryCollect(state, target)
      if (!result.ok) {
        setToast(result.reason ?? 'Nichts zu sammeln.')
        playError(state.sound)
        return
      }
      if (building && result.resource) {
        floaters.push({
          x: building.x + 1,
          y: building.y,
          text: `+${formatNum(result.amount)}`,
          age: 0,
          life: 1.1,
          color: result.resource === 'gold' ? '#f0c14a' : '#8ee0d0',
        })
      }
      playCollect(state.sound)
      refreshUi()
    } else if (act === 'train') {
      const result = tryTrain(state, kind as TroopKind, Date.now())
      if (!result.ok) {
        setToast(result.reason)
        playError(state.sound)
      } else {
        playPlace(state.sound)
        setToast(`${TROOPS[kind as TroopKind].name} wird ausgebildet.`)
        refreshUi()
      }
    }
  }

  function beginPlace(kind: BuildingKind): void {
    if (mode.type === 'place' && mode.kind === kind) {
      cancelMode()
      return
    }
    const def = buildingDef(kind)
    const stats = def.levels[0]
    if (hallLevel(state) < stats.hall) return fail(`Dafür brauchst du Rathaus-Stufe ${stats.hall}.`)
    if (countKind(state, kind) >= def.maxCount) return fail('Maximale Anzahl erreicht.')
    if (builderJob(state, Date.now())) return fail('Der Bauarbeiter ist beschäftigt.')
    if (state.gold < stats.gold || state.harz < stats.harz) return fail('Nicht genug Rohstoffe.')
    mode = { type: 'place', kind }
    refreshUi()
  }

  function askRemove(id: string): void {
    const building = state.buildings.find((item) => item.id === id)
    if (!building) return
    const constructing = building.finishAt != null && building.finishAt > Date.now()
    const run = () => {
      const result = tryRemove(state, id, Date.now())
      if (!result.ok) {
        setToast(result.reason)
        playError(state.sound)
        return
      }
      if (selectedId === id && !(constructing && building.level >= 1)) selectedId = null
      if (mode.type === 'move' && mode.id === id) mode = { type: 'village' }
      setToast(constructing ? 'Bau abgebrochen.' : 'Gebäude abgerissen.')
      refreshUi()
    }
    if (!constructing) {
      showModal({
        title: `${buildingDef(building.kind).name} abreißen?`,
        stars: '',
        body: '<p>Du erhältst die Hälfte der Baukosten der aktuellen Stufe zurück. Das Rathaus bleibt stehen.</p>',
        ok: 'Abreißen',
        cancel: 'Abbrechen',
        onOk: run,
      })
      return
    }
    run()
  }

  function startAttack(): void {
    if (mode.type !== 'village') return
    if (armySize(state) <= 0) return fail('Keine Truppen im Heer. Bilde welche in der Kaserne aus.')
    mode = { type: 'battle', battle: createAttack(hallLevel(state)) }
    resultShown = false
    battleSpeed = 1
    btnSpeed.textContent = 'Tempo ×2'
    btnSpeed.classList.remove('selected')
    selectedId = null
    selectedTroop = state.army.schlaeger > 0 ? 'schlaeger' : 'speerwerfer'
    selectTroop(selectedTroop)
    userCamera = false
    stage.classList.add('away')
    fitCamera()
    setToast('Wähle einen Trupp und tippe auf den leuchtenden Rand.')
    refreshUi()
  }

  function startRaid(): void {
    if (mode.type !== 'village') return
    mode = { type: 'battle', battle: createRaid(state.buildings, hallLevel(state), state.gold, state.harz) }
    resultShown = false
    battleSpeed = 1
    btnSpeed.textContent = 'Tempo ×2'
    btnSpeed.classList.remove('selected')
    selectedId = null
    userCamera = false
    stage.classList.remove('away')
    fitCamera()
    setToast('Dein Dorf wird überfallen.')
    refreshUi()
  }

  function conclude(battle: BattleState): void {
    if (resultShown) return
    resultShown = true
    battle.over = true
    const score = battleScore(battle)
    const stars = '★★★'.slice(0, score.stars) + '☆☆☆'.slice(0, 3 - score.stars)
    if (battle.mode === 'attack') {
      const rawGold = Math.floor((battle.lootGold * score.pct) / 100)
      const rawHarz = Math.floor((battle.lootHarz * score.pct) / 100)
      const caps = storageCaps(state)
      const goldGot = Math.min(rawGold, Math.max(0, caps.gold - state.gold))
      const harzGot = Math.min(rawHarz, Math.max(0, caps.harz - state.harz))
      state.gold += goldGot
      state.harz += harzGot
      const trimmed = goldGot < rawGold || harzGot < rawHarz
      const title = score.stars >= 3 ? 'Voller Sieg' : score.stars > 0 ? 'Angriff beendet' : 'Angriff abgewehrt'
      playResult(state.sound, score.stars > 0)
      showModal({
        title,
        stars,
        body: [
          `<p>Zerstörung: <strong>${score.pct} %</strong></p>`,
          `<p>${score.thDestroyed ? 'Das feindliche Rathaus ist gefallen.' : 'Das feindliche Rathaus steht noch.'}</p>`,
          `<p>Beute: <strong>${formatNum(goldGot)} Gold</strong> und <strong>${formatNum(harzGot)} Harz</strong>.</p>`,
          trimmed ? '<p>Ein Teil passte nicht mehr ins Lager.</p>' : '',
          '<p>Ein Stern für 50&nbsp;% Zerstörung, einer für 100&nbsp;% und einer für das Rathaus.</p>',
        ].join(''),
        ok: 'Zurück zum Dorf',
        onOk: leaveBattle,
      })
    } else {
      const lossGold = Math.min(state.gold, Math.floor((battle.lootGold * score.pct) / 100 * 0.4))
      const lossHarz = Math.min(state.harz, Math.floor((battle.lootHarz * score.pct) / 100 * 0.4))
      state.gold -= lossGold
      state.harz -= lossHarz
      const held = score.pct < 50 && !score.thDestroyed
      playResult(state.sound, held)
      showModal({
        title: held ? 'Überfall abgewehrt' : 'Dorf geplündert',
        stars: '',
        body: [
          `<p>Zerstörung: <strong>${score.pct} %</strong>. Die Gebäude bleiben stehen.</p>`,
          `<p>Verloren: <strong>${formatNum(lossGold)} Gold</strong> und <strong>${formatNum(lossHarz)} Harz</strong>.</p>`,
          '<p>Mehr Wachtürme und Palisaden halten den nächsten Überfall besser auf.</p>',
        ].join(''),
        ok: 'Zurück zum Dorf',
        onOk: leaveBattle,
      })
    }
    writeState(state)
  }

  function leaveBattle(): void {
    mode = { type: 'village' }
    resultShown = false
    battleSpeed = 1
    stage.classList.remove('away')
    userCamera = false
    fitCamera()
    refreshUi()
  }

  function confirmReset(): void {
    showModal({
      title: 'Neues Dorf?',
      stars: '',
      body: '<p>Der gespeicherte Fortschritt auf diesem Gerät wird gelöscht.</p>',
      ok: 'Neu anfangen',
      cancel: 'Abbrechen',
      onOk: () => {
        state = createInitialState()
        writeState(state)
        mode = { type: 'village' }
        selectedId = null
        resultShown = false
        stage.classList.remove('away')
        userCamera = false
        fitCamera()
        setToast('Ein neues Dorf wurde gegründet.')
        refreshUi()
      },
    })
  }

  function cancelMode(): void {
    if (mode.type === 'place' || mode.type === 'move') {
      mode = { type: 'village' }
      refreshUi()
    }
  }

  function fail(reason: string): void {
    setToast(reason)
    playError(state.sound)
  }

  function selectTroop(kind: TroopKind): void {
    selectedTroop = kind
    btnDepS.classList.toggle('selected', kind === 'schlaeger')
    btnDepSp.classList.toggle('selected', kind === 'speerwerfer')
    btnDepS.setAttribute('aria-pressed', kind === 'schlaeger' ? 'true' : 'false')
    btnDepSp.setAttribute('aria-pressed', kind === 'speerwerfer' ? 'true' : 'false')
  }

  function setToast(text: string): void {
    toast = text
    toastUntil = Date.now() + 3600
    toastEl.textContent = text
  }

  function refreshUi(): void {
    renderChrome()
    renderBanner()
    structure = structureKey()
    renderSidebar()
  }

  function renderChrome(): void {
    const caps = storageCaps(state)
    goldN.textContent = formatNum(state.gold)
    harzN.textContent = formatNum(state.harz)
    goldC.textContent = `/ ${formatNum(caps.gold)}`
    harzC.textContent = `/ ${formatNum(caps.harz)}`
    goldPill.classList.toggle('over', state.gold > caps.gold + 0.5)
    harzPill.classList.toggle('over', state.harz > caps.harz + 0.5)
    hallN.textContent = `Rathaus ${hallLevel(state)}`
    armyLine.textContent = `Heer: ${state.army.schlaeger} Schläger, ${state.army.speerwerfer} Speerwerfer`
    toastEl.textContent = toast && Date.now() < toastUntil ? toast : ''
    btnSound.textContent = state.sound ? 'Ton an' : 'Ton aus'
    btnSound.setAttribute('aria-pressed', state.sound ? 'true' : 'false')
    const battle = mode.type === 'battle' ? mode.battle : null
    footerActions.hidden = battle != null
    btnAttack.disabled = battle != null || armySize(state) === 0
    btnRaid.disabled = battle != null
    battleHud.hidden = battle == null
    stage.classList.toggle('away', battle?.mode === 'attack')
    if (battle) {
      const score = battleScore(battle)
      battlePct.textContent = `Zerstörung ${score.pct} %`
      battleTime.textContent = formatDuration(battle.limit - battle.time)
      battleStars.textContent =
        battle.mode === 'attack' ? '★★★'.slice(0, score.stars) + '☆☆☆'.slice(0, 3 - score.stars) : 'Überfall'
      const attack = battle.mode === 'attack'
      btnDepS.hidden = !attack
      btnDepSp.hidden = !attack
      btnDepS.textContent = `Schläger (${state.army.schlaeger})`
      btnDepSp.textContent = `Speerwerfer (${state.army.speerwerfer})`
      btnDepS.disabled = state.army.schlaeger <= 0
      btnDepSp.disabled = state.army.speerwerfer <= 0
      battleHint.textContent = attack
        ? `Beute bis zu ${formatNum(battle.lootGold)} Gold und ${formatNum(battle.lootHarz)} Harz`
        : 'Wachtürme und Palisaden kämpfen von allein.'
    }
    for (const el of document.querySelectorAll<HTMLElement>('[data-cd]')) {
      el.textContent = formatDuration((Number(el.dataset.cd) - Date.now()) / 1000)
    }
    for (const el of document.querySelectorAll<HTMLElement>('[data-stored]')) {
      const building = state.buildings.find((item) => item.id === el.dataset.stored)
      if (building) el.textContent = formatNum(building.stored)
    }
    renderBanner()
  }

  function renderBanner(): void {
    if (mode.type === 'place') {
      banner.hidden = false
      btnCancel.hidden = false
      bannerText.textContent = `${buildingDef(mode.kind).name} platzieren – tippe auf eine freie Fläche.`
    } else if (mode.type === 'move') {
      banner.hidden = false
      btnCancel.hidden = false
      bannerText.textContent = 'Neuen Platz antippen.'
    } else if (mode.type === 'battle' && mode.battle.mode === 'attack') {
      banner.hidden = false
      btnCancel.hidden = true
      bannerText.textContent = 'Feinddorf – Trupp wählen und auf den goldenen Rand tippen.'
    } else if (mode.type === 'battle') {
      banner.hidden = false
      btnCancel.hidden = true
      bannerText.textContent = 'Überfall auf dein Dorf.'
    } else {
      banner.hidden = true
      btnCancel.hidden = true
    }
  }

  function renderSidebar(): void {
    if (mode.type === 'battle') {
      const battle = mode.battle
      sidebar.innerHTML =
        battle.mode === 'attack'
          ? `<h2>Angriff</h2>
             <p>Truppen laufen auf das nächste Gebäude zu. Palisaden kosten Umweg oder werden eingerissen. Wachtürme schießen zurück.</p>
             <p>Sterne: 50&nbsp;% Zerstörung, 100&nbsp;% und das Rathaus. Mauern zählen nicht in die Prozent.</p>
             <p>Mögliche Beute: ${formatNum(battle.lootGold)} Gold, ${formatNum(battle.lootHarz)} Harz.</p>`
          : `<h2>Überfall</h2>
             <p>Fremde Truppen greifen dein Dorf an. Fertige Wachtürme feuern, Palisaden halten sie auf.</p>
             <p>Gebäude bleiben danach stehen. Je nach Zerstörung gehen Gold und Harz verloren.</p>`
      return
    }

    const now = Date.now()
    const job = builderJob(state, now)
    const builder = job
      ? `Bauarbeiter: ${buildingDef(job.kind).name}, noch <span data-cd="${job.finishAt}">${formatDuration(((job.finishAt ?? now) - now) / 1000)}</span>`
      : 'Bauarbeiter: frei'
    const selected = state.buildings.find((building) => building.id === selectedId) ?? null
    const catalog = CATALOG.map((kind) => {
      const def = buildingDef(kind)
      const stats = def.levels[0]
      const active = mode.type === 'place' && mode.kind === kind
      return `<button type="button" class="build${active ? ' selected' : ''}" data-act="build" data-kind="${kind}">
        <i style="background:${def.roof}"></i>
        <span><strong>${def.name}</strong><small>${formatCost(stats.gold, stats.harz)}</small></span>
      </button>`
    }).join('')

    sidebar.innerHTML = `
      <h2>Bauen</h2>
      <p class="builder">${builder}</p>
      <div class="catalog">${catalog}</div>
      ${selected ? selectionHtml(selected, now) : helpHtml()}
      ${trainingHtml(now)}
    `
  }

  function selectionHtml(building: Building, now: number): string {
    const def = buildingDef(building.kind)
    const constructing = building.finishAt != null && building.finishAt > now
    const preview = upgradePreview(state, building, now)
    const lines: string[] = []
    lines.push(`<h2>${def.name}</h2>`)
    lines.push(`<p>${def.blurb}</p>`)
    lines.push(`<p>Stufe ${Math.max(building.level, constructing && building.level === 0 ? 0 : building.level)}${constructing ? ' (Bau läuft)' : ''}</p>`)
    if (constructing && building.finishAt) {
      lines.push(`<p>Fertig in <span data-cd="${building.finishAt}">${formatDuration((building.finishAt - now) / 1000)}</span></p>`)
    }
    if (isCollector(building.kind) && building.level >= 1) {
      const stats = levelStats(building.kind, building.level)
      const perMin = Math.round((stats.prodPerHour ?? 0) / 60)
      lines.push(
        `<p>Vorrat: <span data-stored="${building.id}">${formatNum(building.stored)}</span> / ${formatNum(stats.holdCap ?? 0)} · ${perMin}/Min</p>`,
      )
      lines.push(`<button type="button" data-act="collect" data-id="${building.id}">Einsammeln</button>`)
    }
    if (building.kind === 'goldkammer' || building.kind === 'harzspeicher' || building.kind === 'rathaus') {
      const stats = building.level >= 1 ? levelStats(building.kind, building.level) : null
      if (stats?.goldStorage) lines.push(`<p>Goldlager: ${formatNum(stats.goldStorage)}</p>`)
      if (stats?.harzStorage) lines.push(`<p>Harzlager: ${formatNum(stats.harzStorage)}</p>`)
    }
    if (building.kind === 'wachturm' && building.level >= 1) {
      const stats = levelStats(building.kind, building.level)
      lines.push(`<p>Schaden ${stats.damage}, Reichweite ${stats.range}, Trefferpunkte ${stats.hp}</p>`)
    }
    if (building.kind === 'palisade' && building.level >= 1) {
      lines.push(`<p>Trefferpunkte ${levelStats(building.kind, building.level).hp}</p>`)
    }
    lines.push(
      `<button type="button" data-act="upgrade" data-id="${building.id}" ${preview.ok ? '' : 'disabled'}>${preview.ok ? preview.label : 'Verbessern'}</button>`,
    )
    if (!preview.ok) lines.push(`<p class="warn">${preview.reason}</p>`)
    lines.push(`<div class="row">
      <button type="button" data-act="move" data-id="${building.id}">Verschieben</button>
      ${
        building.kind === 'rathaus'
          ? ''
          : `<button type="button" data-act="remove" data-id="${building.id}">${constructing ? 'Abbrechen' : 'Abreißen'}</button>`
      }
    </div>`)
    return `<section class="panel">${lines.join('')}</section>`
  }

  function helpHtml(): string {
    return `<section class="panel">
      <h2>Dorf</h2>
      <p>Tippe ein Gebäude an. Sammler geben Gold oder Harz ins Lager, solange Platz ist. Die Rathaus-Stufe begrenzt Ausbauten.</p>
      <p>Ziehe die Karte, um sie zu verschieben. Mit dem Rad oder den Tasten oben rechts zoomst du.</p>
    </section>`
  }

  function trainingHtml(now: number): string {
    const ready = state.buildings.some((building) => building.kind === 'kaserne' && building.level >= 1)
    if (!ready) {
      return `<section class="panel"><h2>Ausbildung</h2><p>Baue eine Kaserne, um Schläger und Speerwerfer auszubilden.</p></section>`
    }
    const queue = state.queue
      .map(
        (job) =>
          `<li>${TROOPS[job.kind].name} · <span data-cd="${job.finishAt}">${formatDuration((job.finishAt - now) / 1000)}</span></li>`,
      )
      .join('')
    const buttons = (['schlaeger', 'speerwerfer'] as TroopKind[])
      .map((kind) => {
        const troop = TROOPS[kind]
        return `<button type="button" data-act="train" data-kind="${kind}">${troop.name} · ${formatCost(troop.gold, troop.harz)} · ${troop.seconds}s</button>`
      })
      .join('')
    return `<section class="panel">
      <h2>Ausbildung</h2>
      <p>Warteschlange ${state.queue.length}/${trainSlots(state)} · Heer ${armySize(state)}/${armyCap(state)}</p>
      ${buttons}
      ${queue ? `<ul class="queue">${queue}</ul>` : '<p>Keine Ausbildung läuft.</p>'}
    </section>`
  }

  function structureKey(): string {
    const job = builderJob(state, Date.now())
    return [
      mode.type,
      mode.type === 'place' ? mode.kind : '',
      mode.type === 'move' ? mode.id : '',
      mode.type === 'battle' ? mode.battle.mode : '',
      selectedId ?? '',
      state.buildings
        .map((building) => `${building.id}:${building.kind}:${building.level}:${building.x}:${building.y}:${building.finishAt ?? 0}`)
        .join(','),
      state.queue.map((jobItem) => jobItem.id).join(','),
      state.army.schlaeger,
      state.army.speerwerfer,
      Math.floor(state.gold),
      Math.floor(state.harz),
      hallLevel(state),
      job?.id ?? '',
    ].join('|')
  }

  function showModal(options: {
    title: string
    stars: string
    body: string
    ok: string
    cancel?: string
    onOk: () => void
    onCancel?: () => void
  }): void {
    modal.hidden = false
    modalTitle.textContent = options.title
    modalStars.textContent = options.stars
    modalStars.hidden = options.stars.length === 0
    modalBody.innerHTML = options.body
    modalOk.textContent = options.ok
    modalCancel.hidden = !options.cancel
    if (options.cancel) modalCancel.textContent = options.cancel
    modalOk.onclick = () => {
      modal.hidden = true
      options.onOk()
    }
    modalCancel.onclick = () => {
      modal.hidden = true
      options.onCancel?.()
    }
    modalOk.focus()
  }

  function pickBuilding(wx: number, wy: number): Building | null {
    const ordered = [...state.buildings].sort((a, b) => b.x + b.y + buildingDef(b.kind).size - (a.x + a.y + buildingDef(a.kind).size))
    for (const building of ordered) {
      const def = buildingDef(building.kind)
      const height = building.finishAt && building.level === 0 ? def.height * 0.45 : def.height
      if (pointInPoly(wx, wy, footprintPoly(building.x, building.y, def.size, building.kind === 'palisade' ? 18 : height))) {
        return building
      }
    }
    return null
  }

  function updateCursor(wx: number, wy: number): void {
    if (mode.type === 'place' || mode.type === 'move') canvas.style.cursor = 'crosshair'
    else if (mode.type === 'village' && pickBuilding(wx, wy)) canvas.style.cursor = 'pointer'
    else canvas.style.cursor = 'grab'
  }

  function clientToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect()
    return {
      x: (clientX - rect.left - camera.x) / camera.zoom,
      y: (clientY - rect.top - camera.y) / camera.zoom,
    }
  }

  function zoomAt(sx: number, sy: number, nextZoom: number): void {
    const next = clamp(nextZoom, 0.35, 2.4)
    const wx = (sx - camera.x) / camera.zoom
    const wy = (sy - camera.y) / camera.zoom
    camera.zoom = next
    camera.x = sx - wx * next
    camera.y = sy - wy * next
  }

  function fitCamera(): void {
    const pts = [toScreen(-1, -1), toScreen(MAP_SIZE + 1, -1), toScreen(-1, MAP_SIZE + 1), toScreen(MAP_SIZE + 1, MAP_SIZE + 1)]
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const point of pts) {
      minX = Math.min(minX, point.x)
      maxX = Math.max(maxX, point.x)
      minY = Math.min(minY, point.y)
      maxY = Math.max(maxY, point.y)
    }
    const pad = 28
    const zoom = clamp(Math.min(viewW / (maxX - minX + pad * 2), viewH / (maxY - minY + pad * 2)), 0.35, 1.8)
    camera.zoom = zoom
    camera.x = (viewW - (minX + maxX) * zoom) / 2
    camera.y = (viewH - (minY + maxY) * zoom) / 2
  }

  function pinchInfo(): { dist: number; midX: number; midY: number } | null {
    const pts = [...pointers.values()]
    if (pts.length < 2) return null
    return {
      dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
      midX: (pts[0].x + pts[1].x) / 2,
      midY: (pts[0].y + pts[1].y) / 2,
    }
  }
}

function must<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`#${id} fehlt`)
  return element as T
}

function requireContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D fehlt')
  return context
}

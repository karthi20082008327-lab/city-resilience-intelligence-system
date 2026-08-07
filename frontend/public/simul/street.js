import * as THREE from 'three'

/* ═══════════════════════════════════════════════════════════════════════════
   STREET SCENE BUILDER — One Premium Street
   ═══════════════════════════════════════════════════════════════════════════ */

const STREET_LEN = 120
const ROAD_W = 14
const LANE_W = 3.5
const FOOTPATH_W = 4
const SIDE = ROAD_W / 2 + FOOTPATH_W

/* ═══ TEXTURE FACTORY ═════════════════════════════════════════════════════ */

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const ctx = c.getContext('2d'); draw(ctx, w, h)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

function asphaltTex() {
  return canvasTex(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#1a1f2e'; ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 8000; i++) {
      const x = Math.random() * w, y = Math.random() * h, s = Math.random() * 2
      ctx.fillStyle = `rgba(${40+Math.random()*30},${45+Math.random()*30},${55+Math.random()*30},0.4)`
      ctx.fillRect(x, y, s, s)
    }
  })
}

function sidewalkTex() {
  return canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#3a3f4f'; ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#2a2f3f'; ctx.lineWidth = 2
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(w, i * 64); ctx.stroke() }
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64, h); ctx.stroke() }
  })
}

function brickTex(base = '#5a3a2a') {
  return canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1
    for (let y = 0; y < 8; y++) {
      const off = y % 2 === 0 ? 0 : 32
      for (let x = -1; x < 5; x++) {
        ctx.strokeRect(x * 64 + off, y * 32, 64, 32)
      }
    }
  })
}

function glassTex() {
  return canvasTex(128, 128, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h)
    g.addColorStop(0, 'rgba(120,160,200,0.3)'); g.addColorStop(0.5, 'rgba(80,120,160,0.15)'); g.addColorStop(1, 'rgba(140,180,220,0.25)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
  })
}

function windowTex(lit = true) {
  return canvasTex(64, 64, (ctx, w, h) => {
    ctx.fillStyle = lit ? '#fef3c7' : '#1a1f2e'; ctx.fillRect(0, 0, w, h)
    if (lit) { ctx.fillStyle = 'rgba(255,240,180,0.3)'; ctx.fillRect(0, 0, w, h) }
    ctx.strokeStyle = '#2a2f3f'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, w - 2, h - 2)
    ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke()
  })
}

/* ═══ MATERIALS ══════════════════════════════════════════════════════════ */

export const M = {}
function initMaterials() {
  M.asphalt = new THREE.MeshStandardMaterial({ map: asphaltTex(), roughness: 0.85, metalness: 0.02 })
  M.sidewalk = new THREE.MeshStandardMaterial({ map: sidewalkTex(), roughness: 0.9 })
  M.brickA = new THREE.MeshStandardMaterial({ map: brickTex('#6b4423'), roughness: 0.85 })
  M.brickB = new THREE.MeshStandardMaterial({ map: brickTex('#4a5568'), roughness: 0.82 })
  M.brickC = new THREE.MeshStandardMaterial({ map: brickTex('#2d3748'), roughness: 0.8 })
  M.concrete = new THREE.MeshStandardMaterial({ color: 0x5a6070, roughness: 0.88 })
  M.metal = new THREE.MeshStandardMaterial({ color: 0x7a8590, roughness: 0.3, metalness: 0.7 })
  M.glass = new THREE.MeshStandardMaterial({ map: glassTex(), roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.45 })
  M.windowLit = new THREE.MeshStandardMaterial({ map: windowTex(true), emissive: 0xfef3c7, emissiveIntensity: 0.8, roughness: 0.3 })
  M.windowDark = new THREE.MeshStandardMaterial({ map: windowTex(false), roughness: 0.5 })
  M.green = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.92 })
  M.trunk = new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.9 })
  M.yellow = new THREE.MeshBasicMaterial({ color: 0xfacc15 })
  M.white = new THREE.MeshBasicMaterial({ color: 0xf1f5f9 })
  M.red = new THREE.MeshBasicMaterial({ color: 0xef4444 })
  M.greenLight = new THREE.MeshBasicMaterial({ color: 0x22c55e })
  M.zebra = new THREE.MeshBasicMaterial({ color: 0xf8fafc })
  M.roofDark = new THREE.MeshStandardMaterial({ color: 0x2d3748, roughness: 0.75 })
  M.roofFlat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.8 })
  M.awning = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.7, side: THREE.DoubleSide })
  M.sign = new THREE.MeshStandardMaterial({ color: 0x1e40af, roughness: 0.5 })
}

/* ═══ STREET BUILDER ═════════════════════════════════════════════════════ */

export class Street {
  constructor(scene) {
    this.scene = scene
    this.trafficLights = []
    this.streetLights = []
    this.buildings = []
    this.treePositions = []
    this.cameraPositions = []
    this.parkSpots = [] // benches, bus stop
  }

  build() {
    initMaterials()
    this.buildGround()
    this.buildRoad()
    this.buildFootpaths()
    this.buildZebraCrossings()
    this.buildTrafficLights()
    this.buildStreetLights()
    this.buildTrees()
    this.buildLeftBuildings()
    this.buildRightBuildings()
    this.buildBusStop()
    this.buildBenches()
    this.buildLampPosts()
    this.buildCCTVCameras()
    this.buildSignage()
  }

  /* ── Ground ─────────────────────────────────────────────────────── */
  buildGround() {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), M.asphalt.clone())
    g.rotation.x = -Math.PI / 2; g.position.y = -0.02; g.receiveShadow = true
    g.material.map.repeat.set(20, 20); this.scene.add(g)
  }

  /* ── Road ───────────────────────────────────────────────────────── */
  buildRoad() {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, STREET_LEN), M.asphalt)
    road.rotation.x = -Math.PI / 2; road.position.y = 0.01; road.receiveShadow = true
    road.material.map.repeat.set(4, 16); this.scene.add(road)

    // Center double yellow line
    for (const dx of [-0.08, 0.08]) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.12, STREET_LEN), M.yellow)
      line.rotation.x = -Math.PI / 2; line.position.set(dx, 0.02, 0); this.scene.add(line)
    }

    // Lane markings (white dashes)
    for (const laneX of [-LANE_W, LANE_W]) {
      for (let z = -STREET_LEN / 2 + 3; z < STREET_LEN / 2; z += 5) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 2.5), M.white)
        dash.rotation.x = -Math.PI / 2; dash.position.set(laneX, 0.02, z); this.scene.add(dash)
      }
    }

    // Edge lines (solid white)
    for (const ex of [-ROAD_W / 2 + 0.3, ROAD_W / 2 - 0.3]) {
      const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.15, STREET_LEN), M.white)
      edge.rotation.x = -Math.PI / 2; edge.position.set(ex, 0.02, 0); this.scene.add(edge)
    }
  }

  /* ── Footpaths ──────────────────────────────────────────────────── */
  buildFootpaths() {
    for (const side of [-1, 1]) {
      const fp = new THREE.Mesh(new THREE.PlaneGeometry(FOOTPATH_W, STREET_LEN), M.sidewalk)
      fp.rotation.x = -Math.PI / 2
      fp.position.set(side * (ROAD_W / 2 + FOOTPATH_W / 2), 0.08, 0)
      fp.receiveShadow = true
      fp.material.map.repeat.set(2, 16)
      this.scene.add(fp)

      // Curb
      const curb = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.12, STREET_LEN),
        M.concrete
      )
      curb.position.set(side * ROAD_W / 2, 0.06, 0)
      this.scene.add(curb)
    }
  }

  /* ── Zebra Crossings ────────────────────────────────────────────── */
  buildZebraCrossings() {
    for (const z of [-STREET_LEN / 2 + 8, STREET_LEN / 2 - 8]) {
      for (let x = -ROAD_W / 2 + 0.5; x < ROAD_W / 2; x += 1.2) {
        const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 3.5), M.zebra)
        stripe.rotation.x = -Math.PI / 2; stripe.position.set(x, 0.025, z); this.scene.add(stripe)
      }
    }
  }

  /* ── Traffic Lights ─────────────────────────────────────────────── */
  buildTrafficLights() {
    for (const z of [-STREET_LEN / 2 + 8, STREET_LEN / 2 - 8]) {
      for (const side of [-1, 1]) {
        const tl = this.makeTrafficLight()
        tl.position.set(side * (ROAD_W / 2 + 1), 0, z)
        this.scene.add(tl)
        this.trafficLights.push(tl)
      }
    }
  }

  makeTrafficLight() {
    const g = new THREE.Group()
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.5, 8), M.metal)
    pole.position.y = 2.25; pole.castShadow = true; g.add(pole)

    // Arm
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2, 0.08, 0.08), M.metal)
    arm.position.set(1, 4.5, 0); g.add(arm)

    const box = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.1, 0.25), new THREE.MeshStandardMaterial({ color: 0x1a1f2e, roughness: 0.5 }))
    box.position.set(2, 4.3, 0); g.add(box)

    const lights = [
      { mat: M.red.clone(), y: 4.65, name: 'red' },
      { mat: M.yellow.clone(), y: 4.35, name: 'yellow' },
      { mat: M.greenLight.clone(), y: 4.05, name: 'green' },
    ]
    const meshes = {}
    lights.forEach(l => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), l.mat)
      m.position.set(2, l.y, 0); g.add(m); meshes[l.name] = m
    })
    g.userData = { lights: meshes, phase: Math.random() * Math.PI * 2 }
    return g
  }

  /* ── Street Lights ──────────────────────────────────────────────── */
  buildStreetLights() {
    for (let z = -STREET_LEN / 2 + 10; z <= STREET_LEN / 2 - 10; z += 15) {
      for (const side of [-1, 1]) {
        const g = new THREE.Group()
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 5.5, 8), M.metal)
        pole.position.y = 2.75; pole.castShadow = true; g.add(pole)

        // Curved arm
        const arm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.06), M.metal)
        arm.position.set(-0.75 * side, 5.5, 0); g.add(arm)

        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.15, 8, 8),
          new THREE.MeshStandardMaterial({ color: 0xfff59d, emissive: 0xfff59d, emissiveIntensity: 2.5 })
        )
        bulb.position.set(-1.5 * side, 5.4, 0); g.add(bulb)

        const spot = new THREE.SpotLight(0xfff59d, 2, 18, Math.PI / 3.5, 0.3)
        spot.position.copy(bulb.position)
        const tgt = new THREE.Object3D(); tgt.position.set(-1.5 * side, 0, 0)
        g.add(tgt); spot.target = tgt; g.add(spot)

        g.position.set(side * (ROAD_W / 2 + 1.5), 0, z)
        g.userData = { bulb, spot }
        this.scene.add(g)
        this.streetLights.push(g)
      }
    }
  }

  /* ── Trees ──────────────────────────────────────────────────────── */
  buildTrees() {
    for (let z = -STREET_LEN / 2 + 12; z <= STREET_LEN / 2 - 12; z += 12) {
      for (const side of [-1, 1]) {
        const x = side * (ROAD_W / 2 + FOOTPATH_W / 1.5)
        this.makeTree(x, z)
        this.treePositions.push({ x, z })
      }
    }
  }

  makeTree(x, z) {
    const g = new THREE.Group()
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 2.2, 8), M.trunk)
    trunk.position.y = 1.1; trunk.castShadow = true; g.add(trunk)

    const foliage = new THREE.Mesh(new THREE.SphereGeometry(1.4 + Math.random() * 0.6, 12, 10), M.green)
    foliage.position.y = 2.8 + Math.random() * 0.4; foliage.castShadow = true; g.add(foliage)

    g.position.set(x, 0, z); this.scene.add(g)
  }

  /* ── Left Buildings (shops) ─────────────────────────────────────── */
  buildLeftBuildings() {
    const baseX = -(ROAD_W / 2 + FOOTPATH_W + 1)
    const shops = [
      { label: 'COFFEE SHOP', w: 8, h: 5, d: 7, color: M.brickA, hasAwning: true, awningColor: 0x8b4513 },
      { label: 'PHARMACY', w: 6, h: 5.5, d: 6, color: M.brickB, hasSign: true, signColor: 0x16a34a },
      { label: 'BANK', w: 10, h: 7, d: 8, color: M.brickC, hasSign: true, signColor: 0x1e40af },
    ]
    let z = -STREET_LEN / 2 + 10
    shops.forEach(s => {
      const b = this.makeShop(s, baseX, z + s.d / 2)
      this.scene.add(b); this.buildings.push(b)
      z += s.d + 3
    })
  }

  /* ── Right Buildings (apartments) ───────────────────────────────── */
  buildRightBuildings() {
    const baseX = ROAD_W / 2 + FOOTPATH_W + 1
    const apts = [
      { w: 9, h: 14, d: 8, floors: 4 },
      { w: 11, h: 18, d: 9, floors: 5 },
      { w: 8, h: 12, d: 7, floors: 3 },
      { w: 10, h: 16, d: 8, floors: 4 },
    ]
    let z = -STREET_LEN / 2 + 8
    apts.forEach(a => {
      const b = this.makeApartment(a, baseX, z + a.d / 2)
      this.scene.add(b); this.buildings.push(b)
      z += a.d + 2
    })
  }

  /* ── Shop Builder ───────────────────────────────────────────────── */
  makeShop(cfg, x, z) {
    const g = new THREE.Group()
    const body = new THREE.Mesh(new THREE.BoxGeometry(cfg.w, cfg.h, cfg.d), cfg.color)
    body.position.y = cfg.h / 2; body.castShadow = true; body.receiveShadow = true; g.add(body)

    // Roof
    const roof = new THREE.Mesh(new THREE.BoxGeometry(cfg.w + 0.3, 0.4, cfg.d + 0.3), M.roofDark)
    roof.position.y = cfg.h + 0.2; g.add(roof)

    // Shopfront (glass windows + door)
    const glassH = cfg.h * 0.55
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(cfg.w * 0.85, glassH), M.glass)
    glass.position.set(0, glassH / 2 + 0.3, cfg.d / 2 + 0.01); g.add(glass)

    // Door
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.2), new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.7 }))
    door.position.set(0, 1.1, cfg.d / 2 + 0.02); g.add(door)

    // Awning
    if (cfg.hasAwning) {
      const awning = new THREE.Mesh(
        new THREE.PlaneGeometry(cfg.w + 1, 2),
        new THREE.MeshStandardMaterial({ color: cfg.awningColor || 0xdc2626, roughness: 0.7, side: THREE.DoubleSide })
      )
      awning.rotation.x = -Math.PI / 4
      awning.position.set(0, cfg.h * 0.6, cfg.d / 2 + 1.2)
      g.add(awning)
    }

    // Sign
    if (cfg.hasSign) {
      const signBg = new THREE.Mesh(
        new THREE.BoxGeometry(cfg.w * 0.7, 1.2, 0.15),
        new THREE.MeshStandardMaterial({ color: cfg.signColor, roughness: 0.4 })
      )
      signBg.position.set(0, cfg.h + 1.2, cfg.d / 2 + 0.1); g.add(signBg)
    }

    // Windows on sides
    for (let f = 0; f < 2; f++) {
      for (const sx of [-1, 1]) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.5), Math.random() > 0.3 ? M.windowLit.clone() : M.windowDark.clone())
        win.position.set(sx * cfg.w / 2 - sx * 0.01, 2 + f * 2.5, 0)
        win.rotation.y = sx * Math.PI / 2; g.add(win)
      }
    }

    g.position.set(x, 0, z); g.userData = { isShop: true, label: cfg.label }
    return g
  }

  /* ── Apartment Builder ──────────────────────────────────────────── */
  makeApartment(cfg, x, z) {
    const g = new THREE.Group()
    const body = new THREE.Mesh(new THREE.BoxGeometry(cfg.w, cfg.h, cfg.d), M.brickB)
    body.position.y = cfg.h / 2; body.castShadow = true; body.receiveShadow = true; g.add(body)

    // Roof
    const roof = new THREE.Mesh(new THREE.BoxGeometry(cfg.w + 0.3, 0.5, cfg.d + 0.3), M.roofFlat)
    roof.position.y = cfg.h + 0.25; g.add(roof)

    // Windows grid
    const floorH = 3.2
    const winCols = Math.floor(cfg.w / 2.5)
    const winRows = Math.floor(cfg.h / floorH)
    for (let f = 0; f < winRows; f++) {
      for (let c = 0; c < winCols; c++) {
        const wx = -cfg.w / 2 + (c + 0.5) * (cfg.w / winCols)
        const wy = 1.5 + f * floorH
        for (const side of [-1, 1]) {
          const lit = Math.random() > 0.35
          const win = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1.4),
            lit ? M.windowLit.clone() : M.windowDark.clone()
          )
          win.position.set(wx, wy, side * (cfg.d / 2 + 0.01))
          if (side === 1) win.rotation.y = Math.PI
          g.add(win)
        }
      }
    }

    // Balconies
    for (let f = 1; f < winRows; f++) {
      if (Math.random() > 0.5) continue
      const balcony = new THREE.Mesh(
        new THREE.BoxGeometry(2, 0.1, 1),
        M.concrete
      )
      balcony.position.set((Math.random() - 0.5) * (cfg.w - 3), f * floorH, cfg.d / 2 + 0.5)
      g.add(balcony)

      // Railing
      const rail = new THREE.Mesh(new THREE.BoxGeometry(2, 0.6, 0.05), M.metal)
      rail.position.set(balcony.position.x, f * floorH + 0.35, cfg.d / 2 + 1)
      g.add(rail)
    }

    g.position.set(x, 0, z); g.userData = { isApartment: true }
    return g
  }

  /* ── Bus Stop ───────────────────────────────────────────────────── */
  buildBusStop() {
    const g = new THREE.Group()
    const x = -(ROAD_W / 2 + 1.5)
    const z = 15

    // Shelter frame
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.8, 4), M.metal)
    frame.position.set(0, 1.4, 0); g.add(frame)
    const frame2 = frame.clone(); frame2.position.x = 3; g.add(frame2)

    // Roof
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.1, 4.2), M.glass)
    roof.position.set(1.5, 2.85, 0); g.add(roof)

    // Back panel
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.5), new THREE.MeshStandardMaterial({ color: 0x1e40af, roughness: 0.4, transparent: true, opacity: 0.7 }))
    panel.position.set(1.5, 1.25, -2); g.add(panel)

    // Bench
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.08, 0.5), M.metal)
    bench.position.set(1.5, 0.7, -1.5); g.add(bench)
    const benchLegs = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.7, 0.05), M.metal)
    benchLegs.position.set(1.5, 0.35, -1.25); g.add(benchLegs)

    // Bus stop sign
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.08), M.sign)
    sign.position.set(0, 2.5, 0); g.add(sign)

    // Digital display
    const display = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee })
    )
    display.position.set(1.5, 2.2, 2.01); g.add(display)

    g.position.set(x, 0, z); this.scene.add(g)
    this.parkSpots.push({ x: x + 1.5, z, type: 'bus_stop' })
  }

  /* ── Benches ────────────────────────────────────────────────────── */
  buildBenches() {
    for (const z of [-30, 0, 40]) {
      for (const side of [-1, 1]) {
        const x = side * (ROAD_W / 2 + FOOTPATH_W / 2)
        const bench = new THREE.Group()
        const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.5), M.trunk)
        seat.position.y = 0.5; bench.add(seat)
        for (const lx of [-0.7, 0.7]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.4), M.metal)
          leg.position.set(lx, 0.25, 0); bench.add(leg)
        }
        bench.position.set(x, 0.08, z); this.scene.add(bench)
      }
    }
  }

  /* ── Lamp Posts (decorative) ────────────────────────────────────── */
  buildLampPosts() {
    for (let z = -STREET_LEN / 2 + 20; z <= STREET_LEN / 2 - 20; z += 25) {
      for (const side of [-1, 1]) {
        const x = side * (ROAD_W / 2 + FOOTPATH_W - 0.5)
        const post = new THREE.Group()
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 3, 6), M.metal)
        pole.position.y = 1.5; post.add(pole)
        const lamp = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 8, 8),
          new THREE.MeshStandardMaterial({ color: 0xfff59d, emissive: 0xfff59d, emissiveIntensity: 1.5 })
        )
        lamp.position.y = 3.1; post.add(lamp)
        post.position.set(x, 0.08, z); this.scene.add(post)
      }
    }
  }

  /* ── CCTV Cameras ───────────────────────────────────────────────── */
  buildCCTVCameras() {
    this.cameraPositions = [
      { x: ROAD_W / 2 + 1, z: -STREET_LEN / 2 + 8, lookX: 0, lookZ: -STREET_LEN / 2 + 12, label: 'Traffic Junction' },
      { x: -(ROAD_W / 2 + FOOTPATH_W + 4), z: -15, lookX: -(ROAD_W / 2 + 2), lookZ: -15, label: 'Coffee Shop' },
      { x: -(ROAD_W / 2 + 1.5), z: 18, lookX: -ROAD_W / 2, lookZ: 15, label: 'Bus Stop' },
      { x: 2, z: 0, lookX: 2, lookZ: 10, label: 'Middle of Road' },
    ]
    this.cameraPositions.forEach((cp, i) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 3.5, 6), M.metal)
      pole.position.set(cp.x, 1.75, cp.z); this.scene.add(pole)
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.15, 0.4), new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 }))
      head.position.set(cp.x, 3.6, cp.z)
      head.lookAt(new THREE.Vector3(cp.lookX, 2, cp.lookZ))
      this.scene.add(head)
    })
  }

  /* ── Signage ────────────────────────────────────────────────────── */
  buildSignage() {
    const signs = [
      { text: 'SPEED LIMIT 40', x: ROAD_W / 2 + 1.5, z: -20, rot: 0 },
      { text: 'NO PARKING', x: -(ROAD_W / 2 + 1.5), z: 30, rot: Math.PI },
      { text: 'BUS STOP', x: -(ROAD_W / 2 + 2), z: 13, rot: Math.PI },
    ]
    signs.forEach(s => {
      const g = new THREE.Group()
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.5, 6), M.metal)
      pole.position.y = 1.25; g.add(pole)
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.8, 0.06),
        new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 })
      )
      board.position.y = 2.8; g.add(board)
      g.position.set(s.x, 0.08, s.z); g.rotation.y = s.rot; this.scene.add(g)
    })
  }
}
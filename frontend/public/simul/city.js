import * as THREE from 'three'

/* ═══════════════════════════════════════════════════════════════════════════
   CITY CONFIGURATION — 600x600 unit world
   ═══════════════════════════════════════════════════════════════════════════ */

const CITY = {
  SIZE: 600,
  BLOCK: 40,
  ROAD_MAIN: 14,
  ROAD_SECONDARY: 8,
  ROAD_SMALL: 5,
  SIDEWALK: 2.5,
}

// Zone layout (grid-relative zones)
const ZONES = {
  DOWNTOWN:    { label: 'Downtown',    color: 0x64748b, hMin: 18, hMax: 50, density: 1.0 },
  RESIDENTIAL: { label: 'Residential', color: 0x7c8fa0, hMin: 5,  hMax: 14, density: 0.7 },
  INDUSTRIAL:  { label: 'Industrial',  color: 0x475569, hMin: 8,  hMax: 20, density: 0.5 },
  COMMERCIAL:  { label: 'Commercial',  color: 0x8194a8, hMin: 10, hMax: 28, density: 0.9 },
  PUBLIC:      { label: 'Public',      color: 0x94a3b8, hMin: 6,  hMax: 14, density: 0.4 },
}

function getZone(blockX, blockZ) {
  const nx = blockX / 8, nz = blockZ / 8
  if (nx >= 3 && nx <= 5 && nz >= 3 && nz <= 5) return ZONES.DOWNTOWN
  if (nx >= 0 && nx <= 2 && nz >= 0 && nz <= 2) return ZONES.RESIDENTIAL
  if (nx >= 6 && nx <= 7 && nz >= 0 && nz <= 2) return ZONES.INDUSTRIAL
  if (nx >= 0 && nx <= 2 && nz >= 6 && nz <= 7) return ZONES.COMMERCIAL
  return ZONES.PUBLIC
}

/* ═══════════════════════════════════════════════════════════════════════════
   MATERIALS — Shared PBR materials
   ═══════════════════════════════════════════════════════════════════════════ */

function makeMaterials() {
  return {
    ground:     new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.95 }),
    road:       new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.88, metalness: 0.02 }),
    sidewalk:   new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85 }),
    yellow:     new THREE.MeshBasicMaterial({ color: 0xfacc15 }),
    white:      new THREE.MeshBasicMaterial({ color: 0xf1f5f9 }),
    grass:      new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.92 }),
    tree:       new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.85 }),
    trunk:      new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 }),
    water:      new THREE.MeshStandardMaterial({ color: 0x1e40af, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0 }),
    concrete:   new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.88 }),
    glass:      new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.4 }),
    window:     new THREE.MeshStandardMaterial({ color: 0xfef3c7, emissive: 0xfef3c7, emissiveIntensity: 1.0, roughness: 0.3 }),
    windowDark: new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 }),
    roofDark:   new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 }),
    roofRed:    new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.8 }),
    roofBlue:   new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.8 }),
    red:        new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.6 }),
    green:      new THREE.MeshBasicMaterial({ color: 0x22c55e }),
    blue:       new THREE.MeshBasicMaterial({ color: 0x3b82f6 }),
    orange:     new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.5 }),
    yellowSign: new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 }),
    concreteLight: new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.85 }),
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   CITY CLASS
   ═══════════════════════════════════════════════════════════════════════════ */

export class City {
  constructor(scene) {
    this.scene = scene
    this.mat = makeMaterials()
    this.roads = []
    this.buildings = []
    this.trafficLights = []
    this.streetLights = []
    this.trees = []
    this.blockCenters = []
    this.cameraPositions = [] // CCTV
    this.incidentZones = [] // for event proximity
  }

  build() {
    const S = CITY.SIZE
    const B = CITY.BLOCK
    const half = S / 2
    const blockCount = Math.floor(S / B)

    // ── Ground ──────────────────────────────────────────────────────────
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(S * 2, S * 2), this.mat.ground)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.02
    ground.receiveShadow = true
    this.scene.add(ground)

    // ── Road grid ──────────────────────────────────────────────────────
    for (let i = 0; i <= blockCount; i++) {
      const pos = -half + i * B
      const isMajor = i % 3 === 0
      const roadW = isMajor ? CITY.ROAD_MAIN : CITY.ROAD_SECONDARY
      const roadLen = S

      // Horizontal road
      const hRoad = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, roadW), this.mat.road)
      hRoad.rotation.x = -Math.PI / 2
      hRoad.position.set(0, 0, pos)
      hRoad.receiveShadow = true
      this.scene.add(hRoad)
      this.roads.push({ x1: -half, z1: pos, x2: half, z2: pos, width: roadW, dir: 'h' })

      // Vertical road
      const vRoad = new THREE.Mesh(new THREE.PlaneGeometry(roadW, roadLen), this.mat.road)
      vRoad.rotation.x = -Math.PI / 2
      vRoad.position.set(pos, 0, 0)
      vRoad.receiveShadow = true
      this.scene.add(vRoad)
      this.roads.push({ x1: pos, z1: -half, x2: pos, z2: half, width: roadW, dir: 'v' })

      // Center line (yellow)
      const line = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, 0.15), this.mat.yellow)
      line.rotation.x = -Math.PI / 2
      line.position.set(0, 0.01, pos)
      this.scene.add(line)

      const lineV = new THREE.Mesh(new THREE.PlaneGeometry(0.15, roadLen), this.mat.yellow)
      lineV.rotation.x = -Math.PI / 2
      lineV.position.set(pos, 0.01, 0)
      this.scene.add(lineV)

      // Lane markings (white dashes)
      for (let d = -roadW / 2 + 2; d < roadW / 2; d += 3) {
        if (Math.abs(d) < 0.5) continue // skip center
        for (let k = -half + 2; k < half; k += 5) {
          const dash = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.1), this.mat.white)
          dash.rotation.x = -Math.PI / 2
          dash.position.set(k, 0.01, pos + d)
          this.scene.add(dash)
        }
      }
      // Horizontal dashes
      for (let d = -roadW / 2 + 2; d < roadW / 2; d += 3) {
        if (Math.abs(d) < 0.5) continue
        for (let k = -half + 2; k < half; k += 5) {
          const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 2.5), this.mat.white)
          dash.rotation.x = -Math.PI / 2
          dash.position.set(pos + d, 0.01, k)
          this.scene.add(dash)
        }
      }

      // Sidewalks
      for (const side of [-1, 1]) {
        const swH = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, CITY.SIDEWALK), this.mat.sidewalk)
        swH.rotation.x = -Math.PI / 2
        swH.position.set(0, 0.005, pos + side * (roadW / 2 + CITY.SIDEWALK / 2))
        swH.receiveShadow = true
        this.scene.add(swH)

        const swV = new THREE.Mesh(new THREE.PlaneGeometry(CITY.SIDEWALK, roadLen), this.mat.sidewalk)
        swV.rotation.x = -Math.PI / 2
        swV.position.set(pos + side * (roadW / 2 + CITY.SIDEWALK / 2), 0.005, 0)
        swV.receiveShadow = true
        this.scene.add(swV)
      }
    }

    // ── Traffic lights at intersections ──────────────────────────────────
    for (let ix = 0; ix <= blockCount; ix++) {
      for (let iz = 0; iz <= blockCount; iz++) {
        if (ix % 2 !== 0 || iz % 2 !== 0) continue // every other intersection
        const x = -half + ix * B
        const z = -half + iz * B
        const tl = this.createTrafficLight(x, z)
        this.trafficLights.push(tl)
      }
    }

    // ── Street lights along major roads ──────────────────────────────────
    for (let i = 0; i <= blockCount; i += 1) {
      const pos = -half + i * B
      for (let j = 0; j < blockCount; j++) {
        const along = -half + j * B + B / 2
        // On both sides of horizontal major roads
        if (i % 3 === 0) {
          this.addStreetLight(along, pos - 8)
          this.addStreetLight(along, pos + 8)
        }
        // On both sides of vertical major roads
        if (i % 3 === 0) {
          this.addStreetLight(pos - 8, along)
          this.addStreetLight(pos + 8, along)
        }
      }
    }

    // ── Buildings by block ──────────────────────────────────────────────
    for (let bx = 0; bx < blockCount; bx++) {
      for (let bz = 0; bz < blockCount; bz++) {
        const zone = getZone(bx, bz)
        const cx = -half + bx * B + B / 2
        const cz = -half + bz * B + B / 2
        this.blockCenters.push({ x: cx, z: cz, bx, bz, zone })

        const innerSize = B - CITY.ROAD_MAIN - CITY.SIDEWALK * 2 - 2
        if (innerSize < 4) continue

        // Place buildings
        const count = Math.floor(zone.density * (2 + Math.random() * 2))
        for (let n = 0; n < count; n++) {
          const bw = 4 + Math.random() * Math.min(12, innerSize / 2)
          const bd = 4 + Math.random() * Math.min(12, innerSize / 2)
          const bh = zone.hMin + Math.random() * (zone.hMax - zone.hMin)
          const ox = (Math.random() - 0.5) * (innerSize - bw) * 0.7
          const oz = (Math.random() - 0.5) * (innerSize - bd) * 0.7
          const b = this.createBuilding(bw, bh, bd, cx + ox, cz + oz, zone.color)
          this.scene.add(b)
          this.buildings.push(b)
        }

        // Parks in some blocks
        if (bx % 4 === 1 && bz % 4 === 1) {
          this.createPark(cx, cz, innerSize * 0.6)
        }
      }
    }

    // ── Special buildings ───────────────────────────────────────────────
    this.createSpecialBuildings(half)

    // ── Bridges / flyover across a main road ───────────────────────────
    this.createFlyover(0, 0, 'h')
    this.createFlyover(half / 2, half / 2, 'v')

    // ── CCTV camera positions ───────────────────────────────────────────
    this.cameraPositions = [
      { x: 0, z: 0, lookX: 5, lookZ: 5, label: 'Main Junction' },
      { x: half - 40, z: half - 40, lookX: half - 50, lookZ: half - 50, label: 'Hospital' },
      { x: -half + 40, z: -half + 40, lookX: -half + 50, lookZ: -half + 50, label: 'Shopping Mall' },
      { x: -half + 80, z: half - 80, lookX: -half + 90, lookZ: half - 90, label: 'School' },
      { x: 0, z: -half + 40, lookX: 10, lookZ: -half + 50, label: 'Highway' },
      { x: half - 80, z: 0, lookX: half - 90, lookZ: 10, label: 'Bus Station' },
      { x: -half + 60, z: 0, lookX: -half + 70, lookZ: 10, label: 'Residential' },
      { x: half - 40, z: -half + 40, lookX: half - 50, lookZ: -half + 50, label: 'Industrial' },
    ]

    // CCTV camera meshes (small poles at each position)
    this.cameraPositions.forEach((cam, i) => {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.06, 3, 6),
        this.mat.concrete
      )
      pole.position.set(cam.x, 1.5, cam.z)
      this.scene.add(pole)

      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.2, 0.5),
        this.mat.red
      )
      head.position.set(cam.x, 3.1, cam.z)
      head.lookAt(new THREE.Vector3(cam.lookX, 2, cam.lookZ))
      this.scene.add(head)

      // Label
      const sprite = this.makeTextSprite(`CAM ${i + 1}`, '#ef4444', 20)
      sprite.position.set(cam.x, 4, cam.z)
      this.scene.add(sprite)
    })
  }

  /* ── Building Factory ────────────────────────────────────────────────── */

  createBuilding(w, h, d, x, z, baseColor = 0x64748b) {
    const g = new THREE.Group()
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.75, metalness: 0.05 })
    )
    body.position.y = h / 2
    body.castShadow = true
    body.receiveShadow = true
    g.add(body)

    // Roof
    const roofH = 0.5 + Math.random() * 1
    const roofColors = [this.mat.roofDark, this.mat.roofRed, this.mat.roofBlue]
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.3, roofH, d + 0.3),
      roofColors[Math.floor(Math.random() * roofColors.length)]
    )
    roof.position.y = h + roofH / 2
    roof.castShadow = true
    g.add(roof)

    // Windows
    const floors = Math.floor(h / 3.2)
    const wxCount = Math.max(1, Math.floor(w / 2.2))
    const wzCount = Math.max(1, Math.floor(d / 2.2))

    for (let f = 0; f < floors; f++) {
      const wy = 1.8 + f * 3.2
      for (let i = 0; i < wxCount; i++) {
        const win = new THREE.Mesh(
          new THREE.PlaneGeometry(0.8, 1.4),
          Math.random() > 0.3 ? this.mat.window.clone() : this.mat.windowDark.clone()
        )
        win.position.set(-w / 2 + (i + 0.5) * (w / wxCount), wy, d / 2 + 0.02)
        g.add(win)
        const back = win.clone()
        back.position.z = -d / 2 - 0.02
        back.rotation.y = Math.PI
        g.add(back)
      }
      for (let i = 0; i < wzCount; i++) {
        const win = new THREE.Mesh(
          new THREE.PlaneGeometry(0.8, 1.4),
          Math.random() > 0.3 ? this.mat.window.clone() : this.mat.windowDark.clone()
        )
        win.position.set(w / 2 + 0.02, wy, -d / 2 + (i + 0.5) * (d / wzCount))
        win.rotation.y = Math.PI / 2
        g.add(win)
        const side = win.clone()
        side.position.x = -w / 2 - 0.02
        side.rotation.y = -Math.PI / 2
        g.add(side)
      }
    }

    g.position.set(x, 0, z)
    g.userData = { w, h, d, isBuilding: true }
    return g
  }

  /* ── Special Buildings ───────────────────────────────────────────────── */

  createSpecialBuildings(half) {
    const specs = [
      // Hospital
      { x: half - 60, z: half - 60, w: 18, h: 12, d: 14, color: 0xf1f5f9, label: 'HOSPITAL', cross: true },
      // Police Station
      { x: -half + 60, z: half - 60, w: 12, h: 8, d: 10, color: 0x1e3a8a, label: 'POLICE' },
      // Fire Station
      { x: half - 60, z: -half + 60, w: 14, h: 8, d: 12, color: 0x991b1b, label: 'FIRE STN' },
      // Shopping Mall
      { x: -half + 80, z: -half + 80, w: 22, h: 10, d: 18, color: 0xc084fc, label: 'MALL' },
      // School
      { x: -half + 100, z: half - 80, w: 20, h: 7, d: 12, color: 0xfbbf24, label: 'SCHOOL' },
      // College
      { x: half - 100, z: half - 100, w: 22, h: 9, d: 14, color: 0x60a5fa, label: 'COLLEGE' },
      // Bus Station
      { x: half - 80, z: 0, w: 16, h: 6, d: 20, color: 0xf97316, label: 'BUS STN' },
      // Railway Station
      { x: 0, z: half - 60, w: 24, h: 8, d: 12, color: 0x94a3b8, label: 'RAILWAY' },
      // Stadium
      { x: -half + 120, z: -half + 120, w: 30, h: 10, d: 26, color: 0x34d399, label: 'STADIUM', oval: true },
      // Airport (far edge)
      { x: half - 60, z: -half + 120, w: 40, h: 6, d: 16, color: 0xe2e8f0, label: 'AIRPORT' },
      // Water Treatment
      { x: -half + 60, z: -half + 100, w: 14, h: 5, d: 14, color: 0x06b6d4, label: 'WATER PLANT' },
      // Electric Substation
      { x: half - 100, z: -half + 60, w: 10, h: 8, d: 10, color: 0xfacc15, label: 'ELEC SUB' },
      // Warehouses
      { x: half - 120, z: -half + 80, w: 18, h: 7, d: 12, color: 0x78716c, label: 'WAREHOUSE' },
      { x: half - 140, z: -half + 80, w: 16, h: 7, d: 12, color: 0x78716c, label: 'WAREHOUSE' },
      // Petrol Stations (4 corners)
      { x: 30, z: 30, w: 6, h: 4, d: 6, color: 0xf59e0b, label: 'PETROL' },
      { x: -30, z: -30, w: 6, h: 4, d: 6, color: 0xf59e0b, label: 'PETROL' },
      { x: 30, z: -30, w: 6, h: 4, d: 6, color: 0xf59e0b, label: 'PETROL' },
      { x: -30, z: 30, w: 6, h: 4, d: 6, color: 0xf59e0b, label: 'PETROL' },
      // Flyover / Bridge
      { x: 0, z: 100, w: 30, h: 5, d: 8, color: 0x6b7280, label: 'BRIDGE' },
    ]

    specs.forEach(s => {
      if (s.oval) {
        // Stadium: cylinder with box top
        const body = new THREE.Mesh(
          new THREE.CylinderGeometry(s.w / 2, s.w / 2, s.h, 24, 1, true),
          new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.7, side: THREE.DoubleSide })
        )
        body.position.set(s.x, s.h / 2, s.z)
        body.castShadow = true
        this.scene.add(body)
      } else {
        const b = this.createBuilding(s.w, s.h, s.d, s.x, s.z, s.color)
        this.scene.add(b)
        this.buildings.push(b)
      }

      // Label
      const label = this.makeTextSprite(s.label, '#f8fafc', 22)
      label.position.set(s.x, (s.h || 8) + 3, s.z)
      this.scene.add(label)

      // Hospital cross
      if (s.cross) {
        const crossMat = new THREE.MeshBasicMaterial({ color: 0xef4444 })
        const v = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2, 0.3), crossMat)
        v.position.set(s.x + s.w / 2 + 0.2, s.h / 2, s.z)
        this.scene.add(v)
        const h = new THREE.Mesh(new THREE.BoxGeometry(2, 0.3, 0.3), crossMat)
        h.position.set(s.x + s.w / 2 + 0.2, s.h / 2, s.z)
        this.scene.add(h)
      }

      // Runway (airport)
      if (s.label === 'AIRPORT') {
        const runway = new THREE.Mesh(
          new THREE.PlaneGeometry(60, 3),
          new THREE.MeshBasicMaterial({ color: 0x334155 })
        )
        runway.rotation.x = -Math.PI / 2
        runway.position.set(s.x, 0.02, s.z + s.d / 2 + 5)
        this.scene.add(runway)

        // Runway markings
        for (let m = -25; m < 25; m += 5) {
          const mark = new THREE.Mesh(
            new THREE.PlaneGeometry(2, 0.2),
            this.mat.white
          )
          mark.rotation.x = -Math.PI / 2
          mark.position.set(s.x + m, 0.03, s.z + s.d / 2 + 5)
          this.scene.add(mark)
        }
      }
    })

    // Apartment complexes (large blocks)
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2
      const r = 80 + Math.random() * 60
      const x = Math.cos(angle) * r
      const z = Math.sin(angle) * r
      const b = this.createBuilding(
        10 + Math.random() * 8,
        14 + Math.random() * 10,
        8 + Math.random() * 6,
        x, z,
        0x7c8fa0
      )
      this.scene.add(b)
      this.buildings.push(b)
    }
  }

  /* ── Flyover / Bridge ───────────────────────────────────────────────── */

  createFlyover(x, z, dir) {
    const len = 80
    const width = 8
    const height = 6

    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(dir === 'h' ? len : width, 0.6, dir === 'h' ? width : len),
      this.mat.concrete
    )
    deck.position.set(x, height, z)
    deck.castShadow = true
    deck.receiveShadow = true
    this.scene.add(deck)

    // Railings
    const railMat = this.mat.concreteLight
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(dir === 'h' ? len : 0.2, 1, dir === 'h' ? 0.2 : len),
        railMat
      )
      rail.position.set(
        x + (dir === 'v' ? side * width / 2 : 0),
        height + 0.8,
        z + (dir === 'h' ? side * width / 2 : 0)
      )
      this.scene.add(rail)
    }

    // Pillars
    for (let i = -3; i <= 3; i++) {
      const px = dir === 'h' ? x + i * len / 6 : x
      const pz = dir === 'v' ? z + i * len / 6 : z
      const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, height, 1.5),
        this.mat.concrete
      )
      pillar.position.set(px, height / 2, pz)
      pillar.castShadow = true
      this.scene.add(pillar)
    }
  }

  /* ── Traffic Light ──────────────────────────────────────────────────── */

  createTrafficLight(x, z) {
    const g = new THREE.Group()
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, 4.5, 8),
      this.mat.concrete
    )
    pole.position.y = 2.25
    g.add(pole)

    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 1.2, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 })
    )
    box.position.y = 4.8
    g.add(box)

    const lights = [
      { color: 0xef4444, y: 5.2, name: 'red' },
      { color: 0xfacc15, y: 4.8, name: 'yellow' },
      { color: 0x22c55e, y: 4.4, name: 'green' },
    ]
    const lightMeshes = {}
    lights.forEach(l => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 8, 8),
        new THREE.MeshBasicMaterial({ color: l.color, transparent: true, opacity: 0.2 })
      )
      m.position.y = l.y
      g.add(m)
      lightMeshes[l.name] = m
    })

    g.position.set(x, 0, z)
    g.userData = { lights: lightMeshes, phase: Math.random() * Math.PI * 2 }
    return g
  }

  /* ── Street Light ───────────────────────────────────────────────────── */

  addStreetLight(x, z) {
    const g = new THREE.Group()
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.08, 5, 6),
      this.mat.concrete
    )
    pole.position.y = 2.5
    g.add(pole)

    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xfff59d, emissive: 0xfff59d, emissiveIntensity: 2.5 })
    )
    bulb.position.y = 5.1
    g.add(bulb)

    const spot = new THREE.SpotLight(0xfff59d, 2, 16, Math.PI / 3.5, 0.35)
    spot.position.set(0, 5.1, 0)
    const target = new THREE.Object3D()
    target.position.set(0, 0, 0)
    g.add(target)
    spot.target = target

    g.position.set(x, 0, z)
    g.userData = { bulb, spot }
    this.scene.add(g)
    this.streetLights.push(g)
  }

  /* ── Park ───────────────────────────────────────────────────────────── */

  createPark(cx, cz, size) {
    // Grass patch
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      this.mat.grass
    )
    grass.rotation.x = -Math.PI / 2
    grass.position.set(cx, 0.01, cz)
    grass.receiveShadow = true
    this.scene.add(grass)

    // Path
    const path = new THREE.Mesh(
      new THREE.PlaneGeometry(size * 0.15, size * 0.9),
      this.mat.sidewalk
    )
    path.rotation.x = -Math.PI / 2
    path.position.set(cx, 0.015, cz)
    this.scene.add(path)

    // Trees
    const treeCount = 3 + Math.floor(Math.random() * 4)
    for (let i = 0; i < treeCount; i++) {
      const tx = cx + (Math.random() - 0.5) * size * 0.7
      const tz = cz + (Math.random() - 0.5) * size * 0.7
      this.createTree(tx, tz)
    }

    // Fountain (small cylinder in center)
    const fountain = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.8, 0.8, 12),
      this.mat.concreteLight
    )
    fountain.position.set(cx, 0.4, cz)
    this.scene.add(fountain)
  }

  createTree(x, z) {
    const g = new THREE.Group()
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.2, 2, 6),
      this.mat.trunk
    )
    trunk.position.y = 1
    trunk.castShadow = true
    g.add(trunk)

    const foliage = new THREE.Mesh(
      new THREE.SphereGeometry(1.5 + Math.random(), 8, 8),
      this.mat.tree
    )
    foliage.position.y = 2.8 + Math.random()
    foliage.castShadow = true
    g.add(foliage)

    g.position.set(x, 0, z)
    this.scene.add(g)
    this.trees.push(g)
  }

  /* ── Text Sprite ────────────────────────────────────────────────────── */

  makeTextSprite(text, color = '#f8fafc', fontSize = 22) {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = 'rgba(0,0,0,0.7)'
    ctx.beginPath()
    ctx.roundRect(0, 0, 512, 64, 8)
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.roundRect(2, 2, 508, 60, 7)
    ctx.stroke()
    ctx.fillStyle = color
    ctx.font = `bold ${fontSize}px Inter, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 256, 32)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
    const sprite = new THREE.Sprite(mat)
    sprite.scale.set(5, 0.65, 1)
    return sprite
  }
}
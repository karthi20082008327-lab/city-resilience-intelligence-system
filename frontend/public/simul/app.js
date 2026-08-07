import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js'
import { Street, M } from './street.js'

/* ═══════════════════════════════════════════════════════════════════════════
   CONSTANTS — reduced traffic & pedestrians
   ═══════════════════════════════════════════════════════════════════════════ */

const STREET_LEN = 120, ROAD_W = 14, LANE_W = 3.5
const POOL = { cars: 5, suvs: 2, trucks: 1, buses: 1, bikes: 2, pedestrians: 12, cyclists: 2 }
const LANE_POSITIONS = [-LANE_W * 1.5, -LANE_W * 0.5, LANE_W * 0.5, LANE_W * 1.5]

/* ═══ VEHICLE FACTORY ═════════════════════════════════════════════════════ */

function mat(c, r = 0.5, m = 0.3) { return new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m }) }
const CAR_COLORS = [0x1e40af, 0x991b1b, 0x166534, 0x854d0e, 0x581c87, 0x9f1239, 0x0e7490, 0xc2410c, 0x155e75, 0x334155]

function makeSedan() {
  const g = new THREE.Group(), c = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)]
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 4.2), mat(c)); body.position.y = 0.5; body.castShadow = true; g.add(body)
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.45, 2.2), mat(0x94a3b8, 0.1, 0.5)); cabin.position.set(0, 1.0, -0.2); cabin.castShadow = true; g.add(cabin)
  for (const sx of [-0.65, 0.65]) {
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), new THREE.MeshBasicMaterial({ color: 0xfef3c7 })); hl.position.set(sx, 0.5, 2.12); g.add(hl)
    const rl = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshBasicMaterial({ color: 0xef4444 })); rl.position.set(sx, 0.5, -2.12); g.add(rl)
  }
  g.userData = { type: 'sedan', speed: 7 + Math.random() * 3, w: 1.8, l: 4.2 }
  return g
}

function makeSUV() {
  const g = new THREE.Group(), c = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)]
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.7, 4.5), mat(c)); body.position.y = 0.65; body.castShadow = true; g.add(body)
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.5), mat(0x94a3b8, 0.1, 0.5)); cabin.position.set(0, 1.3, -0.1); cabin.castShadow = true; g.add(cabin)
  for (const sx of [-0.75, 0.75]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 2), M.metal); rail.position.set(sx, 1.62, -0.1); g.add(rail)
  }
  for (const sx of [-0.7, 0.7]) {
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), new THREE.MeshBasicMaterial({ color: 0xfef3c7 })); hl.position.set(sx, 0.65, 2.26); g.add(hl)
    const rl = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), new THREE.MeshBasicMaterial({ color: 0xef4444 })); rl.position.set(sx, 0.65, -2.26); g.add(rl)
  }
  g.userData = { type: 'suv', speed: 6 + Math.random() * 2.5, w: 2, l: 4.5 }
  return g
}

function makeTruck() {
  const g = new THREE.Group()
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 3), mat(0x1e40af)); cab.position.set(0, 1.1, 2.8); cab.castShadow = true; g.add(cab)
  const bed = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.2, 5.5), mat(0x475569, 0.85, 0.05)); bed.position.set(0, 0.9, -0.8); bed.castShadow = true; g.add(bed)
  for (const sx of [-0.8, 0.8]) {
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), new THREE.MeshBasicMaterial({ color: 0xfef3c7 })); hl.position.set(sx, 1.1, 4.32); g.add(hl)
  }
  g.userData = { type: 'truck', speed: 4.5 + Math.random() * 1.5, w: 2.3, l: 8.5 }
  return g
}

function makeBus() {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 10), mat(0xf97316, 0.6, 0.15)); body.position.y = 1.4; body.castShadow = true; g.add(body)
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.25, 10.02), mat(0xfbbf24)); stripe.position.y = 1.4; g.add(stripe)
  for (const sz of [-4, -2, 0, 2, 3.5]) {
    for (const sx of [-1, 1]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), M.glass)
      win.position.set(sx * 1.21, 1.8, sz); win.rotation.y = sx * Math.PI / 2; g.add(win)
    }
  }
  g.userData = { type: 'bus', speed: 4 + Math.random() * 1, w: 2.4, l: 10 }
  return g
}

function makeBike() {
  const g = new THREE.Group()
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 1.5), mat(0x1a1a2e, 0.4, 0.6)); frame.position.y = 0.5; frame.castShadow = true; g.add(frame)
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.1, 0.4), mat(0x111827)); seat.position.set(0, 0.75, -0.2); g.add(seat)
  for (const dz of [-0.55, 0.55]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 16), mat(0x1f2937, 0.6, 0.2))
    wheel.rotation.y = Math.PI / 2; wheel.position.set(0, 0.2, dz); g.add(wheel)
  }
  g.userData = { type: 'bike', speed: 9 + Math.random() * 4, w: 0.3, l: 1.5 }
  return g
}

function makeAmbulance() {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1.4, 4.5), mat(0xf1f5f9, 0.4, 0.1)); body.position.y = 0.9; body.castShadow = true; g.add(body)
  for (const sx of [-0.15, 0.15]) {
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.12), mat(0xef4444)); cross.position.set(sx * 2.5, 0.9, 2.26); g.add(cross)
  }
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.12), mat(0xef4444)); crossH.position.set(0, 0.9, 2.26); g.add(crossH)
  // Siren bar
  const siren = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.3), new THREE.MeshBasicMaterial({ color: 0x3b82f6 }))
  siren.position.y = 1.65; g.add(siren)
  g.userData = { type: 'ambulance', speed: 10, w: 2, l: 4.5, emergency: true, siren }
  return g
}

function makeFireTruck() {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.8, 6), mat(0xdc2626, 0.5, 0.15)); body.position.y = 1.1; body.castShadow = true; g.add(body)
  const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 4.5), mat(0x78716c, 0.6, 0.4)); ladder.position.set(0, 2.1, -0.5); g.add(ladder)
  const siren = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.3), new THREE.MeshBasicMaterial({ color: 0xef4444 }))
  siren.position.y = 2.1; g.add(siren)
  g.userData = { type: 'firetruck', speed: 8, w: 2.2, l: 6, emergency: true, siren }
  return g
}

function makePolice() {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 4), mat(0x1e3a8a, 0.45, 0.2)); body.position.y = 0.5; body.castShadow = true; g.add(body)
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.45, 2), mat(0x94a3b8, 0.1, 0.5)); cab.position.set(0, 1.0, -0.2); g.add(cab)
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 0.25), new THREE.MeshBasicMaterial({ color: 0x3b82f6 }))
  bar.position.y = 1.3; g.add(bar)
  g.userData = { type: 'police', speed: 11, w: 1.8, l: 4, emergency: true, siren: bar }
  return g
}

const VEHICLE_FACTORIES = [
  { fn: makeSedan, n: POOL.cars },
  { fn: makeSUV, n: POOL.suvs },
  { fn: makeTruck, n: POOL.trucks },
  { fn: makeBus, n: POOL.buses },
  { fn: makeBike, n: POOL.bikes },
]

/* ═══ PEDESTRIAN FACTORY ══════════════════════════════════════════════════ */

function makePedestrian() {
  const g = new THREE.Group()
  const skins = [0xf5d0b0, 0xd2a679, 0x8d5524, 0xc68642, 0xe0ac69]
  const clothes = [0x1e40af, 0x991b1b, 0x166534, 0x854d0e, 0x581c87, 0x9f1239, 0x0e7490, 0x1e293b, 0xf1f5f9, 0xfb7185, 0x38bdf8]
  const sk = skins[Math.floor(Math.random() * skins.length)]
  const cl = clothes[Math.floor(Math.random() * clothes.length)]
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.6, 8), mat(cl, 0.7, 0.05))
  torso.position.y = 0.9; g.add(torso)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), mat(sk, 0.85, 0))
  head.position.y = 1.35; g.add(head)
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x1a1a2e, 0.9, 0))
  hair.position.y = 1.38; g.add(hair)
  for (const sx of [-0.07, 0.07]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.55, 6), mat(0x1e293b, 0.8, 0.05))
    leg.position.set(sx, 0.3, 0); g.add(leg)
  }
  for (const sx of [-0.2, 0.2]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.5, 6), mat(sk, 0.8, 0))
    arm.position.set(sx, 0.85, 0); arm.rotation.z = sx > 0 ? -0.15 : 0.15; g.add(arm)
  }
  g.userData = { speed: 1 + Math.random() * 0.8, tx: 0, tz: 0, wanderTimer: 0, walkPhase: Math.random() * Math.PI * 2 }
  return g
}

function makeCyclist() {
  const g = makePedestrian()
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.25, 0.7), mat(0x374151, 0.4, 0.6))
  frame.position.set(0.25, 0.45, 0); g.add(frame)
  for (const dz of [-0.25, 0.25]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.015, 8, 16), mat(0x374151, 0.5, 0.3))
    wheel.rotation.y = Math.PI / 2; wheel.position.set(0.25, 0.18, dz); g.add(wheel)
  }
  g.userData.speed = 2.5 + Math.random()
  return g
}

/* ═══ WEATHER SYSTEM ══════════════════════════════════════════════════════ */

class WeatherSystem {
  constructor(scene) {
    this.scene = scene; this.current = 'sunny'
    this.fogD = 0.005; this.tFogD = 0.005
    this.ambI = 0.5; this.tAmbI = 0.5
    this.sunI = 1.8; this.tSunI = 1.8
    this.ambC = new THREE.Color(0xc8d6e5); this.tAmbC = new THREE.Color(0xc8d6e5)
    this.sunC = new THREE.Color(0xfff5e6); this.tSunC = new THREE.Color(0xfff5e6)
    this.fogC = new THREE.Color(0x0a0e17); this.tFogC = new THREE.Color(0x0a0e17)
    this.initRain()
  }

  initRain() {
    const N = 2000, geo = new THREE.BufferGeometry(), p = new Float32Array(N * 3), v = new Float32Array(N)
    for (let i = 0; i < N; i++) { p[i * 3] = (Math.random() - 0.5) * 80; p[i * 3 + 1] = Math.random() * 40; p[i * 3 + 2] = (Math.random() - 0.5) * STREET_LEN; v[i] = 0.4 + Math.random() * 0.4 }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3))
    this.rain = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x93c5fd, size: 0.1, transparent: true, opacity: 0.5, depthWrite: false }))
    this.rainVel = v; this.rain.visible = false; this.scene.add(this.rain)
  }

  set(w) {
    this.current = w
    const P = {
      sunny: { f: 0.005, a: 0.5, s: 1.8, ac: 0xc8d6e5, sc: 0xfff5e6, fc: 0x0a0e17, rain: false, ro: 0 },
      rain:  { f: 0.015, a: 0.2, s: 0.5, ac: 0x64748b, sc: 0x9ca3af, fc: 0x1a2030, rain: true, ro: 0.5 },
      night: { f: 0.012, a: 0.03, s: 0.0, ac: 0x0f172a, sc: 0x000000, fc: 0x020408, rain: false, ro: 0 },
      fog:   { f: 0.055, a: 0.25, s: 0.2, ac: 0x9ca3af, sc: 0xd1d5db, fc: 0x7a8a9a, rain: false, ro: 0 },
    }
    const p = P[w] || P.sunny
    this.tFogD = p.f; this.tAmbI = p.a; this.tSunI = p.s
    this.tAmbC.set(p.ac); this.tSunC.set(p.sc); this.tFogC.set(p.fc)
    this.rain.visible = p.rain; this.rain.material.opacity = p.ro
    document.querySelectorAll('.weather-btn').forEach(b => b.classList.toggle('active', b.dataset.w === w))
  }

  update(dt) {
    const l = 1 - Math.pow(0.04, dt)
    this.fogD += (this.tFogD - this.fogD) * l; this.ambI += (this.tAmbI - this.ambI) * l; this.sunI += (this.tSunI - this.sunI) * l
    this.ambC.lerp(this.tAmbC, l); this.sunC.lerp(this.tSunC, l); this.fogC.lerp(this.tFogC, l)
    this.scene.fog = new THREE.FogExp2(this.fogC, this.fogD)
    const amb = this.scene.getObjectByName('ambient'), sun = this.scene.getObjectByName('sun')
    if (amb) { amb.intensity = this.ambI; amb.color.copy(this.ambC) }
    if (sun) { sun.intensity = this.sunI; sun.color.copy(this.sunC) }
    if (this.rain.visible) {
      const pos = this.rain.geometry.attributes.position
      const spd = this.current === 'rain' ? 1 : 0.8
      for (let i = 0; i < pos.count; i++) {
        pos.array[i * 3 + 1] -= this.rainVel[i] * spd * dt * 60
        if (pos.array[i * 3 + 1] < 0) { pos.array[i * 3 + 1] = 35 + Math.random() * 10; pos.array[i * 3] = (Math.random() - 0.5) * 80; pos.array[i * 3 + 2] = (Math.random() - 0.5) * STREET_LEN }
      }
      pos.needsUpdate = true
    }
    const isDark = this.current === 'night' || this.current === 'fog'
    window._street?.streetLights.forEach(sl => {
      if (sl.userData.bulb) { sl.userData.bulb.material.emissiveIntensity = isDark ? 3.5 : 1.5; sl.userData.spot.intensity = isDark ? 4 : 1.2 }
    })
  }
}

/* ═══ VEHICLE MANAGER — reduced count, realistic spacing ═════════════════ */

class VehicleManager {
  constructor(scene) {
    this.scene = scene; this.vehicles = []
    this.spawnVehicles()
  }

  spawnVehicles() {
    // Assign one vehicle per lane for realistic spacing
    const laneOrder = [0, 2, 1, 3, 0] // spread across lanes
    let idx = 0
    VEHICLE_FACTORIES.forEach(({ fn, n }) => {
      for (let i = 0; i < n; i++) {
        const v = fn()
        const laneIdx = laneOrder[idx % laneOrder.length]
        const lane = LANE_POSITIONS[laneIdx]
        const dir = lane < 0 ? 1 : -1 // left lanes go +z, right lanes go -z
        const spacing = STREET_LEN / (n + 1)
        const z = -STREET_LEN / 2 + spacing * (i + 1)
        v.position.set(lane, 0.01, z)
        if (dir === -1) v.rotation.y = Math.PI
        v.userData.lane = lane; v.userData.dir = dir; v.userData.t = 0
        v.userData.stopped = false; v.userData.stopTimer = 0
        v.userData.overtakeTimer = 0; v.userData.id = idx
        this.scene.add(v); this.vehicles.push(v)
        idx++
      }
    })
  }

  update(dt, street, incidentPos) {
    const halfLen = STREET_LEN / 2
    const vehicles = this.vehicles

    // Sort by z for spacing checks per lane
    vehicles.forEach(v => {
      const u = v.userData
      if (u.stopped) { u.stopTimer -= dt; if (u.stopTimer <= 0) u.stopped = false; return }
      if (u.wrecked) return // permanently stopped at crash site

      let shouldStop = false

      // Traffic light obedience
      street.trafficLights.forEach(tl => {
        const dist = Math.abs(v.position.z - tl.position.z)
        if (dist < 6 && dist > 1.5) {
          const cycle = (performance.now() * 0.001 + tl.userData.phase) % 6
          const isRed = cycle < 3
          const sameDir = (u.dir === 1 && v.position.z < tl.position.z) || (u.dir === -1 && v.position.z > tl.position.z)
          if (isRed && sameDir) shouldStop = true
        }
      })

      // Spacing: check vehicle ahead in same lane
      const sameDirAhead = vehicles.filter(o => {
        if (o === v) return false
        if (Math.abs(o.position.x - v.position.x) > LANE_W * 0.8) return false // different lane
        if (u.dir === 1) return o.position.z > v.position.z && o.position.z - v.position.z < 8
        return o.position.z < v.position.z && v.position.z - o.position.z < 8
      })
      if (sameDirAhead.length > 0) shouldStop = true

      // Incident avoidance
      if (incidentPos) {
        const d = v.position.distanceTo(incidentPos)
        if (d < 12) shouldStop = true
        else if (d < 20) u.speed *= 0.97
      }

      if (shouldStop) { u.stopped = true; u.stopTimer = 0.3 + Math.random() * 1.5; return }

      // Move
      v.position.z += u.speed * dt * u.dir

      // Subtle lane drift
      v.position.x += Math.sin(performance.now() * 0.001 + v.id) * 0.001

      // Wrap
      if (v.position.z > halfLen + 6) v.position.z = -halfLen - 2
      if (v.position.z < -halfLen - 6) v.position.z = halfLen + 2
    })
  }

  // Get nearest vehicle to a position (for emergency response proximity)
  getNearest(pos) {
    let best = null, bestD = Infinity
    this.vehicles.forEach(v => { const d = v.position.distanceTo(pos); if (d < bestD) { bestD = d; best = v } })
    return best
  }
}

/* ═══ PEDESTRIAN MANAGER — reduced, natural behaviors ════════════════════ */

class PedestrianManager {
  constructor(scene) {
    this.scene = scene; this.people = []
    const fpX = ROAD_W / 2 + 2
    // Shop positions (left side): Coffee ~z=-25, Pharmacy ~z=0, Bank ~z=25
    this.shopPositions = [
      { x: -(ROAD_W / 2 + FOOTPATH_W + 4), z: -25, name: 'Coffee Shop' },
      { x: -(ROAD_W / 2 + FOOTPATH_W + 3), z: 0, name: 'Pharmacy' },
      { x: -(ROAD_W / 2 + FOOTPATH_W + 5), z: 25, name: 'Bank' },
    ]
    this.busStopPos = { x: -(ROAD_W / 2 + 1.5), z: 15 }

    // Spawn pedestrians with varied behaviors
    for (let i = 0; i < POOL.pedestrians; i++) {
      const p = makePedestrian()
      const side = Math.random() > 0.5 ? 1 : -1
      p.position.set(side * fpX + (Math.random() - 0.5) * 2, 0.08, (Math.random() - 0.5) * STREET_LEN)

      // Assign behavior: 30% shop-goers, 15% bus stop waiters, 55% walkers
      const roll = Math.random()
      let behavior = 'walk'
      let target
      if (roll < 0.3) {
        behavior = 'shop'
        const shop = this.shopPositions[Math.floor(Math.random() * this.shopPositions.length)]
        target = { x: shop.x + (Math.random() - 0.5) * 2, z: shop.z + (Math.random() - 0.5) * 2 }
      } else if (roll < 0.45) {
        behavior = 'busstop'
        target = { x: this.busStopPos.x + (Math.random() - 0.5) * 1.5, z: this.busStopPos.z + (Math.random() - 0.5) * 2 }
      } else {
        target = { x: side * fpX + (Math.random() - 0.5) * 2, z: (Math.random() - 0.5) * STREET_LEN }
      }

      p.userData.tx = target.x; p.userData.tz = target.z
      p.userData.side = side; p.userData.behavior = behavior
      p.userData.wanderTimer = 0; p.userData.behaviorTimer = 5 + Math.random() * 10
      this.scene.add(p); this.people.push(p)
    }

    // Spawn cyclists
    for (let i = 0; i < POOL.cyclists; i++) {
      const c = makeCyclist()
      const lane = (Math.random() - 0.5) * ROAD_W * 0.5
      c.position.set(lane, 0.01, (Math.random() - 0.5) * STREET_LEN)
      c.userData.tx = lane; c.userData.tz = (Math.random() - 0.5) * STREET_LEN
      c.userData.isCyclist = true; c.userData.behavior = 'cycle'
      this.scene.add(c); this.people.push(c)
    }
  }

  update(dt, incidentPos) {
    const fpX = ROAD_W / 2 + 2
    this.people.forEach(p => {
      const u = p.userData

      // Avoid incident
      if (incidentPos) {
        const d = p.position.distanceTo(incidentPos)
        if (d < 15) {
          const away = p.position.clone().sub(incidentPos).normalize()
          p.position.x += away.x * u.speed * 3 * dt
          p.position.z += away.z * u.speed * 3 * dt
          p.rotation.y = Math.atan2(away.x, away.z)
          u.behavior = 'fleeing'
          return
        }
      }

      // Move toward target
      const dx = u.tx - p.position.x, dz = u.tz - p.position.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist > 0.5) {
        const spd = u.isCyclist ? u.speed * 2 : u.speed
        p.position.x += (dx / dist) * spd * dt
        p.position.z += (dz / dist) * spd * dt
        p.rotation.y = Math.atan2(dx, dz)
      }

      // Behavior timer — change behavior periodically
      u.behaviorTimer -= dt
      if (u.behaviorTimer <= 0 || dist < 0.8) {
        u.behaviorTimer = 6 + Math.random() * 12
        const roll = Math.random()
        if (u.behavior === 'fleeing' || roll < 0.25) {
          // Go to a shop
          const shop = this.shopPositions[Math.floor(Math.random() * this.shopPositions.length)]
          u.tx = shop.x + (Math.random() - 0.5) * 2; u.tz = shop.z + (Math.random() - 0.5) * 2
          u.behavior = 'shop'
        } else if (roll < 0.4) {
          // Wait at bus stop
          u.tx = this.busStopPos.x + (Math.random() - 0.5) * 1.5; u.tz = this.busStopPos.z + (Math.random() - 0.5) * 2
          u.behavior = 'busstop'
        } else {
          // Walk along footpath
          u.tx = u.side * fpX + (Math.random() - 0.5) * 2; u.tz = (Math.random() - 0.5) * STREET_LEN
          u.behavior = 'walk'
        }
      }

      // Clamp
      p.position.z = Math.max(-STREET_LEN / 2 - 2, Math.min(STREET_LEN / 2 + 2, p.position.z))
      if (!u.isCyclist) p.position.x = Math.max(-fpX - 1, Math.min(fpX + 1, p.position.x))

      // Walk animation
      if (dist > 0.5) {
        u.walkPhase += dt * 8
        p.children.forEach((c, i) => {
          if (i >= 4 && i <= 5) c.rotation.x = Math.sin(u.walkPhase + i * Math.PI) * 0.3
        })
      }
    })
  }
}

const FOOTPATH_W = 4

/* ═══ CINEMATIC CAMERA CONTROLLER ════════════════════════════════════════ */

class CinematicCamera {
  constructor(camera, controls) {
    this.camera = camera
    this.controls = controls
    this.savedPos = new THREE.Vector3()
    this.savedTarget = new THREE.Vector3()
    this.mode = 'idle' // idle | flyto | orbit | return
    this.timer = 0
    this.orbitAngle = 0
    this.incidentPos = null
    this.flyFrom = new THREE.Vector3()
    this.flyTo = new THREE.Vector3()
    this.targetFrom = new THREE.Vector3()
    this.targetTo = new THREE.Vector3()
    this.flyProgress = 0
  }

  focusOn(pos) {
    if (this.mode !== 'idle') return // already cinematic
    // Save current camera state
    this.savedPos.copy(this.camera.position)
    this.savedTarget.copy(this.controls.target)
    this.incidentPos = pos.clone()

    // Calculate fly-to destination: offset from incident for good viewing angle
    this.flyFrom.copy(this.camera.position)
    this.flyTo.set(pos.x + 12, 10, pos.z + 12)
    this.targetFrom.copy(this.controls.target)
    this.targetTo.copy(pos)

    this.mode = 'flyto'
    this.flyProgress = 0
    this.timer = 0
    this.controls.enabled = false
  }

  update(dt) {
    if (this.mode === 'idle') return

    if (this.mode === 'flyto') {
      this.flyProgress += dt * 0.8 // ~1.25 seconds to fly
      if (this.flyProgress >= 1) {
        this.flyProgress = 1
        this.mode = 'orbit'
        this.timer = 0
        this.orbitAngle = Math.atan2(
          this.camera.position.x - this.incidentPos.x,
          this.camera.position.z - this.incidentPos.z
        )
      }
      const t = this.easeInOutCubic(this.flyProgress)
      this.camera.position.lerpVectors(this.flyFrom, this.flyTo, t)
      this.controls.target.lerpVectors(this.targetFrom, this.targetTo, t)
      this.controls.update()
    }

    if (this.mode === 'orbit') {
      this.timer += dt
      this.orbitAngle += dt * 0.3 // slow orbit
      const radius = 14
      const height = 10
      this.camera.position.set(
        this.incidentPos.x + Math.cos(this.orbitAngle) * radius,
        height,
        this.incidentPos.z + Math.sin(this.orbitAngle) * radius
      )
      this.controls.target.copy(this.incidentPos)
      this.controls.target.y = 1
      this.controls.update()

      if (this.timer >= 8) {
        // Start return
        this.flyFrom.copy(this.camera.position)
        this.flyTo.copy(this.savedPos)
        this.targetFrom.copy(this.controls.target)
        this.targetTo.copy(this.savedTarget)
        this.flyProgress = 0
        this.mode = 'return'
      }
    }

    if (this.mode === 'return') {
      this.flyProgress += dt * 0.8
      if (this.flyProgress >= 1) {
        this.flyProgress = 1
        this.mode = 'idle'
        this.controls.enabled = true
        this.camera.position.copy(this.savedPos)
        this.controls.target.copy(this.savedTarget)
        this.controls.update()
        return
      }
      const t = this.easeInOutCubic(this.flyProgress)
      this.camera.position.lerpVectors(this.flyFrom, this.flyTo, t)
      this.controls.target.lerpVectors(this.targetFrom, this.targetTo, t)
      this.controls.update()
    }
  }

  easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2 }
}

/* ═══ EMERGENCY VEHICLE SPAWNER ══════════════════════════════════════════ */

class EmergencySpawner {
  constructor(scene) {
    this.scene = scene; this.vehicles = []; this.flashTimer = 0
  }

  spawn(type, incidentPos) {
    const factory = type === 'fire' ? makeFireTruck : type === 'fight' ? makePolice : makeAmbulance
    const ev = factory()
    // Start from street edge
    const startX = (Math.random() - 0.5) * ROAD_W * 0.6
    const startZ = incidentPos.z > 0 ? STREET_LEN / 2 + 5 : -STREET_LEN / 2 - 5
    ev.position.set(startX, 0.01, startZ)
    ev.userData.targetPos = incidentPos.clone()
    ev.userData.arrived = false
    this.scene.add(ev); this.vehicles.push(ev)
  }

  update(dt) {
    this.flashTimer += dt
    const flash = Math.sin(this.flashTimer * 8) > 0

    this.vehicles.forEach(ev => {
      const u = ev.userData
      if (u.arrived) return

      const dx = u.targetPos.x - ev.position.x
      const dz = u.targetPos.z - ev.position.z
      const dist = Math.sqrt(dx * dx + dz * dz)

      if (dist > 3) {
        ev.position.x += (dx / dist) * u.speed * dt
        ev.position.z += (dz / dist) * u.speed * dt
        ev.rotation.y = Math.atan2(dx, dz)
      } else {
        u.arrived = true
      }

      // Flash siren lights
      if (u.siren) {
        u.siren.material.color.set(flash ? 0xef4444 : 0x3b82f6)
        u.siren.material.emissiveIntensity = flash ? 2 : 0.5
      }
    })
  }

  clear() {
    this.vehicles.forEach(ev => this.scene.remove(ev))
    this.vehicles = []
  }
}

/* ═══ EVENT SYSTEM — enhanced with dashboard popup ═══════════════════════ */

class EventSystem {
  constructor(scene) { this.scene = scene; this.effects = []; this.count = 0; this.lastEvent = null }

  trigger(type) {
    const z = (Math.random() - 0.5) * STREET_LEN * 0.5
    const x = (Math.random() - 0.5) * ROAD_W * 0.4
    const pos = new THREE.Vector3(x, 0, z)
    this.count++

    const cfg = {
      accident:  { cat: 'collision', title: 'Road Accident', pri: 3, icon: '🚗💥', cam: 1, camName: 'Traffic Junction' },
      fire:      { cat: 'fire', title: 'Building Fire', pri: 5, icon: '🔥🏢', cam: 2, camName: 'Coffee Shop' },
      fight:     { cat: 'crowd', title: 'Crowd Fight', pri: 3, icon: '👥😠', cam: 3, camName: 'Bus Stop' },
      roadblock: { cat: 'road_damage', title: 'Road Block', pri: 2, icon: '🚧⛔', cam: 4, camName: 'Middle of Road' },
    }[type] || { cat: 'collision', title: 'Incident', pri: 3, icon: '⚠️', cam: 1, camName: 'Unknown' }

    this.addEffect(type, pos)
    this.lastEvent = { type, pos, cfg, time: new Date() }

    // Report to admin
    const now = new Date()
    const confidence = (0.82 + Math.random() * 0.17).toFixed(2)
    const incidentId = 'INC-' + Date.now().toString(36).toUpperCase()

    fetch('/api/incidents/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: cfg.cat, title: cfg.title, description: `${cfg.title} — street simulation`, latitude: 17.3850, longitude: 78.4867, location_address: `Street Simulation — ${cfg.camName}`, reporter_name: 'UCRIP AI System' })
    }).catch(() => {})

    // Dashboard popup
    this.showDashboard(cfg, pos, incidentId, confidence, now)

    document.getElementById('incident-count').textContent = this.count
    document.getElementById('status-text').textContent = cfg.title
    document.getElementById('status-dot').className = 'status-dot red'
    document.getElementById('scene-tag').textContent = 'ACTIVE INCIDENT'
    document.getElementById('scene-tag').className = 'viewport-tag danger'

    return { pos, type, cfg }
  }

  showDashboard(cfg, pos, id, confidence, time) {
    const el = document.getElementById('incident-panel'); if (el) el.remove()
    const panel = document.createElement('div')
    panel.id = 'incident-panel'
    panel.className = 'incident-panel'
    panel.innerHTML = `
      <div class="ip-header">
        <span class="ip-icon">${cfg.icon}</span>
        <div><div class="ip-title">${cfg.title}</div><div class="ip-sub">Priority ${cfg.pri} — ${cfg.cat.toUpperCase()}</div></div>
        <button class="ip-close" onclick="this.parentElement.parentElement.remove()">✕</button>
      </div>
      <div class="ip-body">
        <div class="ip-row"><span class="ip-label">Incident ID</span><span class="ip-val mono">${id}</span></div>
        <div class="ip-row"><span class="ip-label">Camera</span><span class="ip-val">CAM ${cfg.cam} — ${cfg.camName}</span></div>
        <div class="ip-row"><span class="ip-label">Time</span><span class="ip-val mono">${time.toLocaleTimeString()}</span></div>
        <div class="ip-row"><span class="ip-label">AI Confidence</span><span class="ip-val conf">${(confidence * 100).toFixed(0)}%</span></div>
        <div class="ip-row"><span class="ip-label">Location</span><span class="ip-val">${pos.x.toFixed(1)}, ${pos.z.toFixed(1)}</span></div>
        <div class="ip-row"><span class="ip-label">Snapshot</span><span class="ip-val snap">📸 Captured</span></div>
        <div class="ip-row"><span class="ip-label">Status</span><span class="ip-val status-active">● ACTIVE</span></div>
      </div>
    `
    document.body.appendChild(panel)
    // Auto-remove after 12 seconds
    setTimeout(() => { if (panel.parentElement) panel.remove() }, 12000)
  }

  addEffect(type, pos) {
    if (type === 'fire') {
      const N = 120, geo = new THREE.BufferGeometry(), p = new Float32Array(N * 3), v = []
      for (let i = 0; i < N; i++) { p[i * 3] = pos.x + (Math.random() - 0.5) * 3; p[i * 3 + 1] = Math.random() * 4; p[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 3; v.push({ x: (Math.random() - 0.5) * 0.03, y: Math.random() * 0.08 + 0.03, z: (Math.random() - 0.5) * 0.03, life: Math.random() }) }
      geo.setAttribute('position', new THREE.BufferAttribute(p, 3))
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xff4400, size: 0.12, transparent: true, opacity: 0.85, depthWrite: false, sizeAttenuation: true }))
      this.scene.add(pts)
      this.effects.push({ points: pts, velocities: v, origin: pos.clone(), life: 12 })
    } else {
      const color = type === 'accident' ? 0xef4444 : type === 'fight' ? 0xf59e0b : 0x6366f1
      const marker = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 0.2, 16), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4 }))
      marker.position.set(pos.x, 0.15, pos.z); this.scene.add(marker)
      this.effects.push({ marker, life: 10 })
    }
  }

  update(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i]; e.life -= dt
      if (e.life <= 0) { this.scene.remove(e.points || e.marker); this.effects.splice(i, 1); continue }
      if (e.points) {
        const pos = e.points.geometry.attributes.position
        for (let j = 0; j < e.velocities.length; j++) {
          const v = e.velocities[j]; v.life -= dt * 0.5
          if (v.life <= 0) { v.life = 1; pos.array[j * 3] = e.origin.x + (Math.random() - 0.5) * 3; pos.array[j * 3 + 1] = 0; pos.array[j * 3 + 2] = e.origin.z + (Math.random() - 0.5) * 3 }
          pos.array[j * 3] += v.x * dt * 60; pos.array[j * 3 + 1] += v.y * dt * 60; pos.array[j * 3 + 2] += v.z * dt * 60; v.y -= dt * 0.01
        }
        pos.needsUpdate = true
      }
      if (e.marker) e.marker.material.opacity = 0.25 + Math.sin(performance.now() * 0.005) * 0.15
    }
    if (this.effects.length === 0 && document.getElementById('scene-tag')?.className.includes('danger')) {
      setTimeout(() => { if (this.effects.length === 0) { document.getElementById('status-text').textContent = 'All systems normal'; document.getElementById('status-dot').className = 'status-dot green'; document.getElementById('scene-tag').textContent = 'SYSTEM NORMAL'; document.getElementById('scene-tag').className = 'viewport-tag' } }, 6000)
    }
  }
}

/* ═══ CCTV SYSTEM ═════════════════════════════════════════════════════════ */

class CCTVSystem {
  constructor(scene, cams) {
    this.scene = scene; this.renderer = null
    this.cameras = cams.map(c => {
      const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.3, 150)
      cam.position.set(c.x, 8, c.z)
      cam.lookAt(new THREE.Vector3(c.lookX, 0, c.lookZ))
      return { cam, label: c.label }
    })
  }
  setRenderer(r) { this.renderer = r }
  renderAll() {
    if (!this.renderer) return
    const orig = new THREE.Vector4(); this.renderer.getSize(orig)
    this.cameras.forEach((c, i) => {
      const canvas = document.getElementById(`cam-${i + 1}`)
      if (!canvas || !canvas.clientWidth) return
      canvas.width = canvas.clientWidth * (window.devicePixelRatio || 1)
      canvas.height = canvas.clientHeight * (window.devicePixelRatio || 1)
      this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
      this.renderer.render(this.scene, c.cam)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(this.renderer.domElement, 0, 0, canvas.width, canvas.height)
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, canvas.height - 18, canvas.width, 18)
      ctx.fillStyle = '#22d3ee'; ctx.font = '9px JetBrains Mono, monospace'
      ctx.fillText(`CAM ${i + 1} | ${c.label} | ${new Date().toLocaleTimeString()}`, 4, canvas.height - 5)
      const t = performance.now() * 0.001
      ctx.fillStyle = `rgba(34,211,238,${0.03 + Math.sin(t + i) * 0.015})`
      ctx.fillRect(0, (t * 40 + i * 30) % canvas.height, canvas.width, 1.5)
    })
    this.renderer.setRenderTarget(null); this.renderer.setSize(orig.z, orig.w, false)
  }
}

/* ═══ MAIN APP ════════════════════════════════════════════════════════════ */

class App {
  constructor() {
    this.canvas = document.getElementById('main-canvas')
    this.activeView = 'street'
    this.incidentPos = null

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.2
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x0a0e17)

    const ambient = new THREE.AmbientLight(0xc8d6e5, 0.5); ambient.name = 'ambient'; this.scene.add(ambient)
    const sun = new THREE.DirectionalLight(0xfff5e6, 1.8); sun.name = 'sun'
    sun.position.set(20, 30, 15); sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 100
    sun.shadow.camera.left = -40; sun.shadow.camera.right = 40; sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70
    this.scene.add(sun)
    this.scene.add(new THREE.HemisphereLight(0x87ceeb, 0x362a28, 0.3))

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300)
    this.camera.position.set(25, 18, 30)
    this.controls = new OrbitControls(this.camera, this.canvas)
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.06
    this.controls.maxPolarAngle = Math.PI / 2.05; this.controls.minDistance = 5; this.controls.maxDistance = 80
    this.controls.target.set(0, 2, 0); this.controls.update()

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.3, 0.4, 0.85))
    this.composer.addPass(new SMAAPass(window.innerWidth, window.innerHeight))

    this.street = new Street(this.scene); this.street.build(); window._street = this.street
    this.weather = new WeatherSystem(this.scene)
    this.vehicles = new VehicleManager(this.scene)
    this.pedestrians = new PedestrianManager(this.scene)
    this.events = new EventSystem(this.scene)
    this.emergency = new EmergencySpawner(this.scene)
    this.cinematic = new CinematicCamera(this.camera, this.controls)
    this.cctv = new CCTVSystem(this.scene, this.street.cameraPositions)
    this.cctv.setRenderer(this.renderer)

    this.clock = new THREE.Clock(); this.fpsFrames = 0; this.fpsTime = 0

    window.switchView = v => this.switchView(v)
    window.setWeather = w => this.weather.set(w)
    window.triggerEvent = e => {
      const result = this.events.trigger(e)
      this.incidentPos = result.pos
      // Spawn emergency vehicle
      this.emergency.spawn(result.type, result.pos)
      // Auto-camera focus
      this.cinematic.focusOn(result.pos)
      // Visual crash scene for accident
      if (e === 'accident') this.createCrashScene(result.pos)
      // Fight crowd for fight event
      if (e === 'fight') this.createFightScene(result.pos)
    }
    window.resetSim = () => this.resetSim()
    window.toggleFullscreen = () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); else document.exitFullscreen() }

    this.onResize(); window.addEventListener('resize', () => this.onResize())
    this.animate()
  }

  onResize() {
    const w = this.canvas.parentElement?.clientWidth || 800, h = this.canvas.parentElement?.clientHeight || 600
    if (w > 0 && h > 0) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h, false); this.composer.setSize(w, h) }
  }

  switchView(v) {
    this.activeView = v
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'))
    document.getElementById(`view-${v}`)?.classList.add('active')
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === v))
    this.onResize()
  }

  resetSim() {
    this.incidentPos = null
    this.events.effects.forEach(e => this.scene.remove(e.points || e.marker))
    this.events.effects = []; this.events.count = 0
    this.emergency.clear()
    this.cinematic.mode = 'idle'; this.controls.enabled = true
    // Unwreck all vehicles
    this.vehicles.vehicles.forEach(v => { v.userData.wrecked = false; v.userData.stopped = false; v.userData.stopTimer = 0; v.rotation.z = 0 })
    document.getElementById('incident-count').textContent = '0'
    document.getElementById('status-text').textContent = 'All systems normal'
    document.getElementById('status-dot').className = 'status-dot green'
    document.getElementById('scene-tag').textContent = 'SYSTEM NORMAL'
    document.getElementById('scene-tag').className = 'viewport-tag'
    const panel = document.getElementById('incident-panel'); if (panel) panel.remove()
    this.weather.set('sunny')
  }

  createCrashScene(pos) {
    const allVehicles = this.vehicles.vehicles
    if (allVehicles.length < 2) return

    // Find two nearest vehicles to the incident
    const sorted = [...allVehicles].sort((a, b) => a.position.distanceTo(pos) - b.position.distanceTo(pos))
    const v1 = sorted[0], v2 = sorted[1]

    // Stop them and mark as wrecked
    v1.userData.stopped = true; v1.userData.wrecked = true; v1.userData.stopTimer = 999
    v2.userData.stopped = true; v2.userData.wrecked = true; v2.userData.stopTimer = 999

    // Position them at the crash site, angled into each other
    const angle1 = Math.random() * Math.PI * 0.3 - 0.15
    const angle2 = Math.PI + Math.random() * Math.PI * 0.3 - 0.15
    v1.position.set(pos.x - 1.5, 0.01, pos.z)
    v1.rotation.y = angle1
    v1.rotation.z = 0.05 // slight tilt
    v2.position.set(pos.x + 1.5, 0.01, pos.z + 0.8)
    v2.rotation.y = angle2
    v2.rotation.z = -0.04

    // Add smoke particles at crash point
    this.addSmokeEffect(pos)

    // Add debris chunks
    this.addDebris(pos)
  }

  addSmokeEffect(pos) {
    const N = 40, geo = new THREE.BufferGeometry(), p = new Float32Array(N * 3), v = []
    for (let i = 0; i < N; i++) {
      p[i * 3] = pos.x + (Math.random() - 0.5) * 2
      p[i * 3 + 1] = Math.random() * 3
      p[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 2
      v.push({ x: (Math.random() - 0.5) * 0.01, y: Math.random() * 0.03 + 0.01, z: (Math.random() - 0.5) * 0.01, life: Math.random() })
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3))
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x6b7280, size: 0.2, transparent: true, opacity: 0.6, depthWrite: false, sizeAttenuation: true }))
    this.scene.add(pts)
    this.events.effects.push({ points: pts, velocities: v, origin: pos.clone(), life: 8 })
  }

  addDebris(pos) {
    const debrisGroup = new THREE.Group()
    for (let i = 0; i < 8; i++) {
      const size = 0.1 + Math.random() * 0.25
      const chunk = new THREE.Mesh(
        new THREE.BoxGeometry(size, size * 0.5, size),
        new THREE.MeshStandardMaterial({ color: Math.random() > 0.5 ? 0x374151 : 0x1e293b, roughness: 0.8 })
      )
      chunk.position.set(
        pos.x + (Math.random() - 0.5) * 4,
        size * 0.25,
        pos.z + (Math.random() - 0.5) * 4
      )
      chunk.rotation.set(Math.random(), Math.random(), Math.random())
      debrisGroup.add(chunk)
    }
    this.scene.add(debrisGroup)
    this.events.effects.push({ marker: debrisGroup, life: 10 })
  }

  createFightScene(pos) {
    // Spawn 4-5 pedestrian figures clustered around the fight
    const fightGroup = new THREE.Group()
    const count = 4 + Math.floor(Math.random() * 2)
    for (let i = 0; i < count; i++) {
      const p = makePedestrian()
      const angle = (i / count) * Math.PI * 2
      const r = 1 + Math.random() * 0.8
      p.position.set(Math.cos(angle) * r, 0.08, Math.sin(angle) * r)
      p.rotation.y = angle + Math.PI
      // Make them face each other (aggressive stance)
      p.children.forEach((c, idx) => {
        if (idx >= 6) c.rotation.z = (idx % 2 === 0 ? -1 : 1) * 0.4 // arms up
      })
      fightGroup.add(p)
    }
    fightGroup.position.copy(pos)
    this.scene.add(fightGroup)
    this.events.effects.push({ marker: fightGroup, life: 10 })
  }

  animate() {
    requestAnimationFrame(() => this.animate())
    const dt = Math.min(this.clock.getDelta(), 0.05)
    this.fpsFrames++; this.fpsTime += dt
    if (this.fpsTime >= 0.5) { document.getElementById('fps').textContent = Math.round(this.fpsFrames / this.fpsTime); this.fpsFrames = 0; this.fpsTime = 0 }

    this.weather.update(dt)
    this.vehicles.update(dt, this.street, this.incidentPos)
    this.pedestrians.update(dt, this.incidentPos)
    this.events.update(dt)
    this.emergency.update(dt)
    this.cinematic.update(dt)

    const t = performance.now() * 0.001
    this.street.trafficLights.forEach(tl => {
      const cycle = (t + tl.userData.phase) % 6
      const l = tl.userData.lights
      l.red.material.opacity = cycle < 3 ? 1 : 0.15
      l.yellow.material.opacity = cycle >= 2.5 && cycle < 3 ? 1 : 0.15
      l.green.material.opacity = cycle >= 3 ? 1 : 0.15
    })

    document.getElementById('vehicle-count').textContent = this.vehicles.vehicles.length + this.emergency.vehicles.length
    document.getElementById('people-count').textContent = this.pedestrians.people.length

    if (this.activeView === 'street') { this.controls.update(); this.composer.render() }
    if (this.activeView === 'cctv') this.cctv.renderAll()
  }
}

window.addEventListener('DOMContentLoaded', () => new App())
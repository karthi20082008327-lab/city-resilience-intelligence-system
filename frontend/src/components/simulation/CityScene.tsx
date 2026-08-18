import { useMemo } from 'react'
import * as THREE from 'three'
import {
  ROADS_X,
  ROADS_Z,
  ROAD_HALF_WIDTH,
  ROAD_Y,
  SIDEWALK_WIDTH,
  CITY_HALF,
  BLOCKS,
  generateBuildings,
} from './constants'

/**
 * Static city geometry, built once into a handful of draw calls.
 *
 * Every repeated object (roads, sidewalks, street lights, trees, buildings)
 * is baked into merged geometry or InstancedMesh at construction time:
 *  - roads  → 3 merged-quad meshes (asphalt / edge lines / centre dashes)
 *  - sidewalks → 1 merged-quad mesh
 *  - street lights → 3 InstancedMesh (pole / arm / lamp head)
 *  - trees  → 2 InstancedMesh (trunk / canopy)
 *  - buildings → 1 InstancedMesh with per-instance colour
 *
 * The whole static city renders in ~10 draw calls instead of ~1000, and the
 * few shared textures / geometries are created exactly once.
 */

/* Deterministic RNG so the city is stable between renders */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeAsphaltTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#1a1e26'
  ctx.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 4000; i++) {
    const v = 24 + Math.random() * 14
    ctx.fillStyle = `rgb(${v},${v},${v + 2})`
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 1.6, 1.6)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(1, 1)
  return tex
}

function makeSidewalkTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#6b7280'
  ctx.fillRect(0, 0, 128, 128)
  ctx.strokeStyle = '#4b5563'
  ctx.lineWidth = 3
  ctx.strokeRect(2, 2, 124, 124)
  ctx.strokeRect(2, 64, 124, 62)
  for (let i = 0; i < 600; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.05})`
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(1, 1)
  return tex
}

/** Shared textures (created lazily, once per app session). */
let asphaltTex: THREE.Texture | null = null
let sidewalkTex: THREE.Texture | null = null
function getAsphaltTexture() {
  if (!asphaltTex) asphaltTex = makeAsphaltTexture()
  return asphaltTex
}
function getSidewalkTexture() {
  if (!sidewalkTex) sidewalkTex = makeSidewalkTexture()
  return sidewalkTex
}

/* ------------------------------------------------------------------------- *
 * Merged axis-aligned horizontal quads.
 * ------------------------------------------------------------------------- */

interface Quad {
  /** Quad centre in world X/Z. */
  x: number
  z: number
  /** Extent along world X. */
  w: number
  /** Extent along world Z. */
  d: number
  y: number
}

/**
 * Build one BufferGeometry containing many horizontal quads. UVs are derived
 * from world coordinates so a repeating texture tiles at `repeat` world-units
 * per tile, identical to how the old per-mesh planes looked.
 */
function mergedQuads(quads: Quad[], repeat: number): THREE.BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  let vi = 0
  for (const q of quads) {
    const hw = q.w / 2
    const hd = q.d / 2
    const x0 = q.x - hw
    const x1 = q.x + hw
    const z0 = q.z - hd
    const z1 = q.z + hd
    positions.push(x0, q.y, z0, x0, q.y, z1, x1, q.y, z1, x1, q.y, z0)
    uvs.push(x0 / repeat, z0 / repeat, x0 / repeat, z1 / repeat, x1 / repeat, z1 / repeat, x1 / repeat, z0 / repeat)
    indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3)
    vi += 4
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

function instancedMesh(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  matrices: THREE.Matrix4[],
  colors?: THREE.Color[],
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, matrices.length)
  for (let i = 0; i < matrices.length; i++) {
    mesh.setMatrixAt(i, matrices[i])
    if (colors) mesh.setColorAt(i, colors[i])
  }
  mesh.instanceMatrix.needsUpdate = true
  if (colors) mesh.instanceColor!.needsUpdate = true
  mesh.frustumCulled = false // the geometry already covers the whole city
  return mesh
}

const IDENTITY_QUAT = new THREE.Quaternion()

function translateMatrix(x: number, y: number, z: number): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    IDENTITY_QUAT,
    new THREE.Vector3(1, 1, 1),
  )
}

function scaleTranslateMatrix(x: number, y: number, z: number, sx: number, sy: number, sz: number): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    IDENTITY_QUAT,
    new THREE.Vector3(sx, sy, sz),
  )
}

/* ------------------------------------------------------------------------- *
 * Roads & sidewalks — merged into a handful of draw calls.
 * ------------------------------------------------------------------------- */

const ROAD_LEN = CITY_HALF * 2
const ROAD_WIDTH = ROAD_HALF_WIDTH * 2

function buildRoads() {
  const asphalt: Quad[] = []
  const edges: Quad[] = []
  const dashes: Quad[] = []
  const edgeY = ROAD_Y + 0.004
  const dashY = ROAD_Y + 0.005

  for (const z of ROADS_Z) {
    // Horizontal road (runs along X).
    asphalt.push({ x: 0, z, w: ROAD_WIDTH, d: ROAD_LEN, y: ROAD_Y })
    for (const side of [-1, 1]) {
      edges.push({ x: side * (ROAD_HALF_WIDTH - 0.3), z, w: 0.12, d: ROAD_LEN, y: edgeY })
    }
    for (let dz = -ROAD_LEN / 2 + 1; dz < ROAD_LEN / 2 - 1; dz += 5) {
      dashes.push({ x: 0, z: z + dz, w: 0.16, d: 2.6, y: dashY })
    }
  }
  for (const x of ROADS_X) {
    // Vertical road (runs along Z → wide extent is along Z).
    asphalt.push({ x, z: 0, w: ROAD_LEN, d: ROAD_WIDTH, y: ROAD_Y })
    for (const side of [-1, 1]) {
      edges.push({ x, z: side * (ROAD_HALF_WIDTH - 0.3), w: ROAD_LEN, d: 0.12, y: edgeY })
    }
    for (let dx = -ROAD_LEN / 2 + 1; dx < ROAD_LEN / 2 - 1; dx += 5) {
      dashes.push({ x: x + dx, z: 0, w: 2.6, d: 0.16, y: dashY })
    }
  }

  const asphaltMesh = new THREE.Mesh(
    mergedQuads(asphalt, ROAD_LEN / 24),
    new THREE.MeshStandardMaterial({ map: getAsphaltTexture(), roughness: 0.85, metalness: 0.05 }),
  )
  asphaltMesh.receiveShadow = true
  const edgeMesh = new THREE.Mesh(
    mergedQuads(edges, 1),
    new THREE.MeshBasicMaterial({ color: '#94a3b8' }),
  )
  const dashMesh = new THREE.Mesh(
    mergedQuads(dashes, 1),
    new THREE.MeshBasicMaterial({ color: '#eab308' }),
  )
  return [asphaltMesh, edgeMesh, dashMesh]
}

function buildSidewalks() {
  const quads: Quad[] = []
  const len = CITY_HALF * 2
  for (const z of ROADS_Z) {
    for (const side of [-1, 1]) {
      quads.push({ x: 0, z: z + side * (ROAD_HALF_WIDTH + SIDEWALK_WIDTH / 2), w: len, d: SIDEWALK_WIDTH, y: 0.01 })
    }
  }
  for (const x of ROADS_X) {
    for (const side of [-1, 1]) {
      quads.push({ x: x + side * (ROAD_HALF_WIDTH + SIDEWALK_WIDTH / 2), z: 0, w: SIDEWALK_WIDTH, d: len, y: 0.01 })
    }
  }
  const mesh = new THREE.Mesh(
    mergedQuads(quads, len / 30),
    new THREE.MeshStandardMaterial({ map: getSidewalkTexture(), roughness: 0.9 }),
  )
  mesh.receiveShadow = true
  return mesh
}

/* ------------------------------------------------------------------------- *
 * Street lights — 3 InstancedMeshes.
 * ------------------------------------------------------------------------- */

function buildStreetLights() {
  const poleMats: THREE.Matrix4[] = []
  const armMats: THREE.Matrix4[] = []
  const headMats: THREE.Matrix4[] = []
  const spacing = 16
  const lightX = ROAD_HALF_WIDTH + SIDEWALK_WIDTH * 0.75
  const add = (x: number, z: number) => {
    poleMats.push(translateMatrix(x, 3, z))
    armMats.push(translateMatrix(x, 6, z))
    headMats.push(translateMatrix(x, 5.9, z))
  }
  for (const z of ROADS_Z) {
    for (let x = -CITY_HALF + 8; x <= CITY_HALF - 8; x += spacing) {
      add(x, z + lightX)
      add(x, z - lightX)
    }
  }
  for (const x of ROADS_X) {
    for (let z = -CITY_HALF + 8; z <= CITY_HALF - 8; z += spacing) {
      add(x + lightX, z)
      add(x - lightX, z)
    }
  }
  const pole = instancedMesh(
    new THREE.CylinderGeometry(0.07, 0.1, 6, 8),
    new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.6, metalness: 0.4 }),
    poleMats,
  )
  pole.castShadow = true
  const arm = instancedMesh(
    new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6),
    new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.7, metalness: 0.3 }),
    armMats,
  )
  const head = instancedMesh(
    new THREE.BoxGeometry(0.7, 0.12, 0.25),
    new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#facc15', emissiveIntensity: 1.6 }),
    headMats,
  )
  return [pole, arm, head]
}

/* ------------------------------------------------------------------------- *
 * Trees — 2 InstancedMeshes (trunk / canopy).
 * ------------------------------------------------------------------------- */

function buildTrees() {
  const rng = mulberry32(42)
  const trunks: THREE.Matrix4[] = []
  const canopies: THREE.Matrix4[] = []
  const sidewalkInset = ROAD_HALF_WIDTH + SIDEWALK_WIDTH * 1.2
  let i = 0
  for (const z of ROADS_Z) {
    for (let x = -CITY_HALF + 6; x <= CITY_HALF - 6; x += 8) {
      for (const side of [-1, 1]) {
        if (rng() < 0.35) continue
        const px = x + (rng() - 0.5) * 2
        const pz = z + side * sidewalkInset
        trunks.push(translateMatrix(px, 0.6, pz))
        const sy = 1 + (i % 3) * 0.15
        canopies.push(scaleTranslateMatrix(px, 1.8, pz, 1, sy, 1))
        i++
      }
    }
  }
  const trunk = instancedMesh(
    new THREE.CylinderGeometry(0.12, 0.16, 1.2, 6),
    new THREE.MeshStandardMaterial({ color: '#6b4226', roughness: 0.9 }),
    trunks,
  )
  trunk.castShadow = true
  const canopy = instancedMesh(
    new THREE.IcosahedronGeometry(0.85, 1),
    new THREE.MeshStandardMaterial({ color: '#15803d', roughness: 0.8 }),
    canopies,
  )
  canopy.castShadow = true
  return [trunk, canopy]
}

/* ------------------------------------------------------------------------- *
 * Buildings — 1 InstancedMesh with per-instance colour.
 * ------------------------------------------------------------------------- */

function buildBuildings() {
  const matrices: THREE.Matrix4[] = []
  const colors: THREE.Color[] = []
  for (let i = 0; i < BLOCKS.length; i++) {
    const rng = mulberry32(i * 7 + 3)
    for (const b of generateBuildings(BLOCKS[i], rng)) {
      matrices.push(scaleTranslateMatrix(b.x, b.h / 2, b.z, b.w, b.h, b.d))
      colors.push(new THREE.Color(b.color))
    }
  }
  const mesh = instancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.1 }),
    matrices,
    colors,
  )
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/* ------------------------------------------------------------------------- *
 * Components.
 * ------------------------------------------------------------------------- */

/** Tall building that the fire event targets — deterministic and always present. */
export function FireBuilding() {
  const x = -12
  const z = -13
  const w = 7
  const d = 7
  const h = 16
  return (
    <group position={[x, 0, z]} name="fire-building">
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#7c8a9a" roughness={0.7} metalness={0.15} />
      </mesh>
      {Array.from({ length: 6 }).map((_, i) => (
        <mesh key={i} position={[w / 2 + 0.03, 2 + i * 2.4, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[0.7, 1.6]} />
          <meshStandardMaterial color="#0f172a" roughness={0.3} metalness={0.2} />
        </mesh>
      ))}
    </group>
  )
}

export function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.03, 0]}>
      <planeGeometry args={[CITY_HALF * 2 + 60, CITY_HALF * 2 + 60]} />
      <meshStandardMaterial color="#3a4148" roughness={0.95} />
    </mesh>
  )
}

export function CityScene() {
  const staticMeshes = useMemo(() => {
    return [
      ...buildRoads(),
      buildSidewalks(),
      ...buildStreetLights(),
      ...buildTrees(),
      buildBuildings(),
    ]
  }, [])

  return (
    <group>
      <Ground />
      {staticMeshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
      <FireBuilding />
    </group>
  )
}

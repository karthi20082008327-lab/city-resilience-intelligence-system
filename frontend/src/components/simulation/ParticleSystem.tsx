import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export interface ParticleConfig {
  count: number
  color: THREE.ColorRepresentation
  size?: number
  opacity?: number
  /** vertical rise speed */
  rise?: number
  /** horizontal spread */
  spread?: number
  /** how fast particles fade/respawn */
  lifetime?: number
  /** size multiplier per particle (variation) */
  sizeVariation?: number
  /** gravity (positive = falls) */
  gravity?: number
  blending?: THREE.Blending
  /** initial y offset */
  yOffset?: number
  /** radius of spawn disc */
  radius?: number
  /** scale over lifetime */
  grow?: number
}

/**
 * Lightweight CPU-updated particle system for fire, smoke, water and sparks.
 * Particles are updated in a plain array inside useFrame to avoid React re-renders.
 */
export function ParticleSystem({ config }: { config: ParticleConfig }) {
  const pointsRef = useRef<THREE.Points>(null)

  const data = useMemo(() => {
    const count = config.count
    const positions = new Float32Array(count * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const sprite = new THREE.CanvasTexture(makeParticleSprite())
    const mat = new THREE.PointsMaterial({
      color: config.color,
      size: config.size ?? 0.35,
      map: sprite,
      transparent: true,
      opacity: config.opacity ?? 0.9,
      depthWrite: false,
      blending: config.blending ?? THREE.AdditiveBlending,
      sizeAttenuation: true,
    })

    const life = new Float32Array(count)
    const vx = new Float32Array(count)
    const vy = new Float32Array(count)
    const vz = new Float32Array(count)
    // seed initial positions
    const pos = geo.attributes.position.array as Float32Array
    for (let i = 0; i < count; i++) {
      pos[i * 3] = 0
      pos[i * 3 + 1] = -100
      pos[i * 3 + 2] = 0
      life[i] = 999 // inactive until first respawn
    }

    return { geo, mat, life, vx, vy, vz, count }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.count, config.color, config.size])

  useFrame((_, delta) => {
    const pts = pointsRef.current
    if (!pts) return
    const attr = data.geo.attributes.position as THREE.BufferAttribute
    const arr = attr.array as Float32Array
    const dt = Math.min(delta, 0.05)
    const rise = config.rise ?? 1.5
    const spread = config.spread ?? 0.6
    const lifetime = config.lifetime ?? 3
    const gravity = config.gravity ?? 0
    const radius = config.radius ?? 0.3
    const yOffset = config.yOffset ?? 0
    const count = data.count

    for (let i = 0; i < count; i++) {
      let l = data.life[i] + dt
      if (l >= lifetime) {
        l = 0
        const a = Math.random() * Math.PI * 2
        const rr = Math.random() * radius
        arr[i * 3] = Math.cos(a) * rr
        arr[i * 3 + 1] = yOffset + Math.random() * 0.2
        arr[i * 3 + 2] = Math.sin(a) * rr
        data.vx[i] = (Math.random() - 0.5) * spread
        data.vy[i] = rise * (0.5 + Math.random() * 0.7)
        data.vz[i] = (Math.random() - 0.5) * spread
      }
      arr[i * 3] += data.vx[i] * dt
      arr[i * 3 + 1] += data.vy[i] * dt - gravity * dt
      arr[i * 3 + 2] += data.vz[i] * dt
      data.life[i] = l
    }
    attr.needsUpdate = true

    if (config.grow) {
      const base = config.size ?? 0.35
      data.mat.size = base + Math.sin(performance.now() * 0.02) * (base * 0.15)
    }
  })

  return <points ref={pointsRef} geometry={data.geo} material={data.mat} frustumCulled={false} />
}

function makeParticleSprite(): HTMLCanvasElement {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.4, 'rgba(255,255,255,0.6)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)
  return canvas
}

/** Static billboard sprite for markers / labels. */
export function makeBillboardTexture(text: string, bg = 'rgba(15,23,42,0.85)', fg = '#fff'): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 96
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = bg
  const r = 18
  ctx.beginPath()
  ctx.moveTo(r, 0)
  ctx.arcTo(256, 0, 256, 96, r)
  ctx.arcTo(256, 96, 0, 96, r)
  ctx.arcTo(0, 96, 0, 0, r)
  ctx.arcTo(0, 0, 256, 0, r)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = fg
  ctx.font = 'bold 30px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 128, 50)
  const tex = new THREE.CanvasTexture(canvas)
  tex.anisotropy = 4
  return tex
}

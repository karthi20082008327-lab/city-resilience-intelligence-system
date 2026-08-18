import { describe, it, expect, beforeEach } from 'vitest'
import { RoadNetwork, nodeKey } from '../roadNetwork'
import { SimulationEngine } from '../engine'
import { findRoute, validateRoute } from '../pathfinding'
import { createIncidentReporter } from '../incidentReporter'

function makeEngine(seed = 1337, speed = 6) {
  const net = new RoadNetwork()
  const engine = new SimulationEngine(net, { seed, speedRange: [speed, speed] })
  return { net, engine }
}

function runUntil(engine: SimulationEngine, id: string, status: string, maxTicks = 900, dt = 1 / 30) {
  for (let i = 0; i < maxTicks; i++) {
    engine.step(dt)
    if (engine.getVehicle(id)?.status === status) return true
  }
  return false
}

describe('road network', () => {
  it('builds a 3x3 intersection grid with two directed edges per segment', () => {
    const net = new RoadNetwork()
    expect(net.nodeCount).toBe(9)
    // 12 segments (6 horizontal + 6 vertical) => 24 directed edges
    expect(net.edgeCount).toBe(24)
    // Both directions exist between any adjacent pair.
    const a = nodeKey(-20, -20)
    const b = nodeKey(0, -20)
    expect(net.edgeBetween(a, b)).toBeTruthy()
    expect(net.edgeBetween(b, a)).toBeTruthy()
    // Non-adjacent nodes have no direct edge.
    expect(net.edgeBetween(a, nodeKey(20, 20))).toBeUndefined()
  })

  it('routes never contain an immediate u-turn (A -> B -> A)', () => {
    const net = new RoadNetwork()
    const ids = net.allNodeIds()
    let pairs = 0
    for (const a of ids) {
      for (const b of ids) {
        if (a === b) continue
        const route = findRoute(net, a, b, new Set())
        expect(route).not.toBeNull()
        for (let i = 2; i < route!.length; i++) {
          expect(route![i]).not.toBe(route![i - 2])
        }
        pairs++
      }
    }
    expect(pairs).toBe(9 * 8)
  })

  it('validateRoute flags invalid nodes, missing edges and u-turns', () => {
    const net = new RoadNetwork()
    const a = nodeKey(-20, -20)
    const b = nodeKey(0, -20)
    const c = nodeKey(0, 0)
    expect(validateRoute(net, [a, b, c], new Set())).toEqual([])
    expect(validateRoute(net, [a, '999,999', c], new Set())).not.toEqual([])
    expect(validateRoute(net, [a, b, a], new Set())).not.toEqual([])
    expect(validateRoute(net, [a], new Set())).not.toEqual([])
  })
})

describe('vehicle reaches destination', () => {
  it('TEST 1: reaches its destination without looping', () => {
    const { net, engine } = makeEngine(1)
    const a = nodeKey(-20, -20)
    const b = nodeKey(20, 20)
    const v = engine.spawnAt(a, b, { speed: 6 })
    expect(v).not.toBeNull()

    const arrived = runUntil(engine, v!.id, 'arrived')
    expect(arrived).toBe(true)

    const veh = engine.getVehicle(v!.id)!
    expect(veh.destinationNode).toBe(b)
    expect(veh.currentNode).toBe(b)
    // Route is simple (no repeated node) => no loop.
    expect(new Set(veh.route).size).toBe(veh.route.length)
    // Finished exactly at the destination edge.
    const finalEdge = net.edgeBetween(veh.route[veh.route.length - 2], b)
    expect(veh.progressOnEdge).toBeCloseTo(finalEdge!.length, 5)
  })

  it('TEST 3: route index advances correctly and matches current node', () => {
    const { engine } = makeEngine(2)
    const a = nodeKey(-20, -20)
    const b = nodeKey(20, 20)
    const v = engine.spawnAt(a, b, { speed: 6 })
    const routeLen = v!.route.length
    let maxIndex = 0

    for (let i = 0; i < 900; i++) {
      engine.step(1 / 30)
      const veh = engine.getVehicle(v!.id)
      if (!veh) break
      if (veh.status !== 'moving') {
        if (veh.status === 'arrived') {
          expect(veh.routeIndex).toBe(routeLen - 1)
          expect(veh.currentNode).toBe(b)
        }
        break
      }
      expect(veh.routeIndex).toBeGreaterThanOrEqual(maxIndex)
      expect(veh.currentNode).toBe(veh.route[veh.routeIndex])
      maxIndex = veh.routeIndex
    }
    expect(maxIndex).toBeGreaterThan(0)
  })

  it('TEST 4: stops and is removed after reaching its destination', () => {
    const { engine } = makeEngine(3)
    const a = nodeKey(-20, -20)
    const b = nodeKey(0, -20) // adjacent
    const v = engine.spawnAt(a, b, { speed: 6 })

    const arrived = runUntil(engine, v!.id, 'arrived')
    expect(arrived).toBe(true)

    const afterArrival = engine.getVehicle(v!.id)
    expect(afterArrival?.status).toBe('arrived')
    // It must not move on past the destination.
    expect(afterArrival!.progressOnEdge).toBe(engine.network.edgeBetween(a, b)!.length)

    // After the hold window it is removed from the active list.
    let removed = false
    for (let i = 0; i < 120; i++) {
      engine.step(1 / 30)
      if (!engine.getVehicle(v!.id)) {
        removed = true
        break
      }
    }
    expect(removed).toBe(true)
    expect(engine.getActiveVehicles().find((x) => x.id === v!.id)).toBeUndefined()
  })

  it('TEST 2: does not repeatedly travel A -> B -> A', () => {
    const { engine } = makeEngine(4)
    const a = nodeKey(-20, 20)
    const c = nodeKey(-20, 0)
    const v = engine.spawnAt(a, c, { speed: 6 })

    const visited: string[] = []
    let prevNode: string | null = null
    for (let i = 0; i < 600; i++) {
      engine.step(1 / 30)
      const veh = engine.getVehicle(v!.id)
      if (!veh) break
      // Record node transitions.
      if (veh.currentNode !== prevNode) {
        if (visited.length > 0 && visited[visited.length - 1] !== veh.currentNode) {
          visited.push(veh.currentNode)
        } else if (visited.length === 0) {
          visited.push(veh.currentNode)
        }
        prevNode = veh.currentNode
      }
      if (veh.status === 'arrived') break
    }
    // No consecutive reversal in the visited node sequence.
    for (let i = 2; i < visited.length; i++) {
      expect(visited[i]).not.toBe(visited[i - 2])
    }
    expect(visited[visited.length - 1]).toBe(c)
  })
})

describe('rerouting and road closures', () => {
  it('TEST 5: a blocked road produces a valid reroute from the CURRENT node', () => {
    const { engine } = makeEngine(5)
    const start = nodeKey(-20, -20)
    const dest = nodeKey(20, 20)
    const v = engine.spawnAt(start, dest, { speed: 6 })
    expect(v).not.toBeNull()

    // Block the central vertical road (0,-20)->(0,0) and (0,0)->(0,20).
    engine.blockEdge(nodeKey(0, -20) + '->' + nodeKey(0, 0))
    engine.blockEdge(nodeKey(0, 0) + '->' + nodeKey(0, 20))

    let rerouted = false
    for (let i = 0; i < 900; i++) {
      engine.step(1 / 30)
      const veh = engine.getVehicle(v!.id)
      if (!veh) break
      if (veh.status === 'arrived') {
        rerouted = true
        break
      }
      if (veh.status === 'unreachable') break
      // The route must never use a blocked edge.
      for (let k = 0; k < veh.route.length - 1; k++) {
        const e = engine.network.edgeBetween(veh.route[k], veh.route[k + 1])
        expect(engine.blockedEdges.has(e!.id)).toBe(false)
      }
      // Rerouting starts from the current node, not the vehicle's origin.
      if (veh.rerouteCount > 0) {
        expect(veh.route[0]).toBe(veh.currentNode)
      }
    }
    expect(rerouted).toBe(true)
  })

  it('reroutes only once when a closure persists across ticks', () => {
    const { engine } = makeEngine(6)
    const v = engine.spawnAt(nodeKey(-20, -20), nodeKey(20, 20), { speed: 6 })
    const edgeToBlock = nodeKey(0, -20) + '->' + nodeKey(0, 0)
    engine.blockEdgesNear(0, -10, 8) // blocks roads around (0,-10)

    // The block now covers the direct edge; ensure rerouteCount stays bounded.
    for (let i = 0; i < 60; i++) engine.step(1 / 30)
    const veh = engine.getVehicle(v!.id)
    if (veh && veh.status === 'moving') {
      expect(veh.rerouteCount).toBeLessThanOrEqual(2)
    }
    expect(engine.blockedEdges.has(edgeToBlock)).toBe(true)
  })

  it('TEST 6: cannot use an invalid edge - marked unreachable, never crashes', () => {
    const { engine } = makeEngine(7)
    const a = nodeKey(-20, -20)
    const b = nodeKey(20, 20)
    const v = engine.spawnAt(a, b, { speed: 6 })
    expect(v).not.toBeNull()

    // Corrupt the vehicle's route/edge to something nonexistent.
    v!.route = [a, '999,999', b]
    v!.currentEdge = `${a}->999,999`
    v!.routeIndex = 0

    engine.step(1 / 30)
    const veh = engine.getVehicle(v!.id)
    expect(veh?.status).toBe('unreachable')
    // Position must remain finite.
    expect(Number.isFinite(veh!.x)).toBe(true)
    expect(Number.isFinite(veh!.z)).toBe(true)
  })
})

describe('incident deduplication', () => {
  it('TEST 7: does not generate the same accident repeatedly across ticks', () => {
    const reporter = createIncidentReporter({ cooldownMs: 30_000 })

    // Tick 1: collision detected at location A -> report.
    expect(reporter.shouldReport('accident', 'loc-A', 0)).toBe(true)
    reporter.markReported('accident', 'loc-A', 0)

    // Tick 2..N: the same collision persists at the same location -> suppressed.
    for (let now = 100; now < 30_000; now += 100) {
      expect(reporter.shouldReport('accident', 'loc-A', now)).toBe(false)
    }

    // A different location is a distinct incident.
    expect(reporter.shouldReport('accident', 'loc-B', 5_000)).toBe(true)

    // After the cooldown window the same location may be reported again.
    expect(reporter.shouldReport('accident', 'loc-A', 30_000)).toBe(true)
  })

  it('collision detection only reports actually-close vehicles', () => {
    const { engine } = makeEngine(8)
    const a = nodeKey(-20, -20)
    const b = nodeKey(0, -20)
    const c = nodeKey(-20, 0)
    // Two cars intentionally at the same node; one far away.
    engine.spawnAt(a, b, { speed: 6 })
    engine.spawnAt(a, b, { speed: 6 })
    engine.spawnAt(c, nodeKey(20, 20), { speed: 6 })

    // Bring both near cars onto the same road by advancing a few ticks.
    for (let i = 0; i < 3; i++) engine.step(1 / 30)

    const collisions = engine.detectCollisions(2.6)
    // The two cars that share an edge may overlap; the third is far away.
    for (const col of collisions) {
      expect(col.distance).toBeLessThanOrEqual(2.6)
      expect(col.a.status).toBe('moving')
      expect(col.b.status).toBe('moving')
    }
  })
})

describe('determinism', () => {
  it('TEST 8: consistent movement at different frame rates', () => {
    function run(dt: number, ticks: number): Map<string, { x: number; z: number }> {
      const { engine } = makeEngine(42, 6)
      for (let i = 0; i < 8; i++) engine.spawnVehicle()
      for (let t = 0; t < ticks; t++) engine.step(dt)
      const out = new Map<string, { x: number; z: number }>()
      for (const v of engine.getActiveVehicles()) {
        out.set(v.id, engine.vehiclePosition(v))
      }
      return out
    }

    const at60 = run(1 / 60, 600) // 10 seconds at 60 FPS
    const at30 = run(1 / 30, 300) // 10 seconds at 30 FPS

    for (const [id, pos] of at60) {
      const other = at30.get(id)
      if (other) {
        expect(Math.abs(other.x - pos.x)).toBeLessThan(0.01)
        expect(Math.abs(other.z - pos.z)).toBeLessThan(0.01)
      }
    }
  })

  it('TEST 9: multiple vehicles coexist without corrupting each other', () => {
    const { engine } = makeEngine(9, 6)
    let spawned = 0
    for (let i = 0; i < 20; i++) {
      if (engine.spawnVehicle()) spawned++
    }
    // Strict spawn deconfliction refuses to place a car on a crowded edge, so
    // fewer than 20 may spawn on the small 3x3 test network — that is correct
    // (an overlapped spawn would be a guaranteed collision).
    expect(spawned).toBeGreaterThanOrEqual(10)

    for (let t = 0; t < 600; t++) {
      const res = engine.step(1 / 30)
      // Keep the fleet topped up like the visual layer does.
      for (let i = 0; i < res.removed.length; i++) engine.spawnVehicle()
    }

    const active = engine.getActiveVehicles()
    expect(active.length).toBeGreaterThan(0)
    for (const v of active) {
      const p = engine.vehiclePosition(v)
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.z)).toBe(true)
      if (v.status === 'moving') {
        const e = engine.network.getEdge(v.currentEdge ?? '')
        expect(e).toBeTruthy()
        expect(v.progressOnEdge).toBeGreaterThanOrEqual(0)
        expect(v.progressOnEdge).toBeLessThanOrEqual(e!.length + 1e-6)
        expect(v.route[v.routeIndex]).toBe(v.currentNode)
        // Never a u-turn on a live route.
        if (v.routeIndex >= 1) {
          expect(v.route[v.routeIndex]).not.toBe(v.route[v.routeIndex - 2])
        }
      }
    }
  })

  it('TEST 10: long run stays bounded and never loops forever', () => {
    const { engine } = makeEngine(11, 6)
    const TARGET = 10
    for (let i = 0; i < TARGET; i++) {
      expect(engine.spawnVehicle()).not.toBeNull()
    }

    // Simulate 2 minutes; respawn vehicles as they complete trips.
    for (let t = 0; t < 60 * 120; t++) {
      const res = engine.step(1 / 30)
      for (let i = 0; i < res.removed.length; i++) {
        engine.spawnVehicle()
      }
    }

    // Internal state must not have grown unboundedly.
    expect(engine.vehicles.size).toBeLessThanOrEqual(TARGET + 10)

    const active = engine.getActiveVehicles()
    expect(active.length).toBeLessThanOrEqual(TARGET + 10)
    for (const v of active) {
      expect(['moving', 'spawning', 'arrived', 'unreachable', 'involved']).toContain(v.status)
      if (v.status === 'moving') {
        // Bounded reroutes (no infinite reroute churn).
        expect(v.rerouteCount).toBeLessThanOrEqual(5)
        const p = engine.vehiclePosition(v)
        expect(Number.isFinite(p.x)).toBe(true)
        expect(Number.isFinite(p.z)).toBe(true)
      }
    }
  })
})

describe('realistic vehicle state and movement', () => {
  it('each vehicle maintains the full physical state', () => {
    const { engine } = makeEngine(50, 6)
    const a = nodeKey(-20, -20)
    const b = nodeKey(20, 20)
    const v = engine.spawnAt(a, b, { speed: 6 })
    expect(v).not.toBeNull()

    const veh = engine.getVehicle(v!.id)!
    expect(veh.destinationNode).toBe(b)
    expect(veh.route.length).toBeGreaterThan(1)
    expect(veh.routeIndex).toBe(0)
    expect(veh.currentEdge).toBeTruthy()
    expect(veh.currentRoad).toBeTruthy()
    expect(veh.lane).not.toBe(0)
    expect(veh.targetSpeed).toBe(6)
    expect(veh.speed).toBe(6) // spawnAt applies the requested speed
    expect(Math.hypot(veh.velocity.x, veh.velocity.z)).toBeCloseTo(6, 5)
    expect(veh.acceleration).toBe(0)
    expect(veh.braking).toBe(0)
    expect(veh.status).toBe('spawning')
    expect(veh.phase).toBe('route_calculated')

    // After stepping it moves smoothly: speed never jumps or exceeds target.
    engine.step(1 / 30)
    const moved = engine.getVehicle(v!.id)!
    expect(moved.status).toBe('moving')
    expect(moved.speed).toBeGreaterThan(0)
    expect(moved.speed).toBeLessThanOrEqual(6)
    expect(Math.hypot(moved.velocity.x, moved.velocity.z)).toBeCloseTo(moved.speed, 5)
  })

  it('speed never exceeds targetSpeed and ramps up to cruise', () => {
    const { engine } = makeEngine(60, 6)
    const v = engine.spawnAt(nodeKey(-20, -20), nodeKey(20, 20), { speed: 6 })!
    let maxSpeed = 0
    for (let i = 0; i < 400; i++) {
      engine.step(1 / 30)
      const veh = engine.getVehicle(v.id)
      if (!veh || veh.status !== 'moving') break
      maxSpeed = Math.max(maxSpeed, veh.speed)
      expect(veh.speed).toBeLessThanOrEqual(6 + 1e-9)
    }
    expect(maxSpeed).toBeGreaterThan(4) // reaches cruise on a straight, not just creeping
  })

  it('lane and currentRoad always match the edge being driven', () => {
    const { net, engine } = makeEngine(61, 6)
    const v = engine.spawnAt(nodeKey(-20, -20), nodeKey(20, 20), { speed: 6 })!
    for (let i = 0; i < 600; i++) {
      engine.step(1 / 30)
      const veh = engine.getVehicle(v.id)
      if (!veh || veh.status !== 'moving') break
      const edge = net.getEdge(veh.currentEdge!)
      expect(veh.currentRoad).toBe(edge!.road)
      expect(veh.lane).toBe(edge!.laneOffset)
    }
  })
})

describe('smooth movement (no teleport / no instant direction change)', () => {
  it('positions move continuously and headings never snap', () => {
    const { engine } = makeEngine(52, 6)
    const v = engine.spawnAt(nodeKey(-20, -20), nodeKey(20, 20), { speed: 6 })!
    const dt = 1 / 30
    let prevPos = engine.vehiclePosition(v)
    let prevHeading = v.heading

    for (let i = 0; i < 600; i++) {
      engine.step(dt)
      const veh = engine.getVehicle(v.id)
      if (!veh || veh.status !== 'moving') break
      const pos = engine.vehiclePosition(veh)

      const moved = Math.hypot(pos.x - prevPos.x, pos.z - prevPos.z)
      // Max distance in one tick: cruise speed * dt (+ small slack).
      expect(moved).toBeLessThanOrEqual(6 * dt + 0.01)

      let dHeading = Math.abs(veh.heading - prevHeading)
      while (dHeading > Math.PI) dHeading -= 2 * Math.PI
      expect(Math.abs(dHeading)).toBeLessThanOrEqual(Math.PI / 3 + 0.05)

      prevPos = pos
      prevHeading = veh.heading
    }
  })

  it('progress never decreases on the same edge (no backward motion)', () => {
    const { engine } = makeEngine(53, 6)
    const v = engine.spawnAt(nodeKey(-20, -20), nodeKey(20, 20), { speed: 6 })!
    let prevEdge = v.currentEdge
    let prevProgress = v.progressOnEdge

    for (let i = 0; i < 900; i++) {
      engine.step(1 / 30)
      const veh = engine.getVehicle(v.id)
      if (!veh || veh.status !== 'moving') break
      if (veh.currentEdge === prevEdge) {
        expect(veh.progressOnEdge).toBeGreaterThanOrEqual(prevProgress - 1e-9)
      }
      prevEdge = veh.currentEdge
      prevProgress = veh.progressOnEdge
    }
  })
})

describe('route lifecycle and arrival', () => {
  it('follows the lifecycle: route_calculated -> road -> intersection -> destination -> arrived', () => {
    const { engine } = makeEngine(51, 6)
    const v = engine.spawnAt(nodeKey(-20, -20), nodeKey(20, 20), { speed: 6 })!
    const order: string[] = []
    let prevPhase = v.phase
    order.push(prevPhase)

    for (let i = 0; i < 1200; i++) {
      engine.step(1 / 30)
      const veh = engine.getVehicle(v.id)
      if (!veh) break
      if (veh.phase !== prevPhase) {
        order.push(veh.phase)
        prevPhase = veh.phase
      }
      if (veh.status === 'arrived') break
    }

    expect(order[0]).toBe('route_calculated')
    expect(order[order.length - 1]).toBe('arrived')
    // A multi-intersection trip passes through every phase.
    expect(order).toContain('road')
    expect(order).toContain('intersection')
    expect(order).toContain('destination')
    // 'arrived' may only appear at the very end.
    expect(order.lastIndexOf('arrived')).toBe(order.length - 1)
    // Once the destination phase is reached the trip never goes back to road.
    const destIdx = order.indexOf('destination')
    expect(destIdx).toBeGreaterThan(-1)
    for (let i = destIdx; i < order.length - 1; i++) {
      expect(order[i]).toBe('destination')
    }
  })

  it('arriving vehicles stop at the destination and are removed - never restarting their route', () => {
    const { engine } = makeEngine(56, 6)
    const a = nodeKey(-20, -20)
    const b = nodeKey(20, 20)
    const v = engine.spawnAt(a, b, { speed: 6 })!
    const route = [...v.route]

    let arrivedAt = -1
    for (let i = 0; i < 900; i++) {
      engine.step(1 / 30)
      const veh = engine.getVehicle(v.id)
      if (!veh) break
      if (veh.status === 'arrived') {
        arrivedAt = i
        expect(veh.currentNode).toBe(b)
        expect(veh.speed).toBe(0)
        expect(veh.velocity).toEqual({ x: 0, z: 0 })
        expect(veh.phase).toBe('arrived')
        // The vehicle must not have been rerouted onto a different route.
        expect(veh.route).toEqual(route)
        break
      }
    }
    expect(arrivedAt).toBeGreaterThan(-1)

    // After arriving it stays stopped and is eventually removed; it never
    // resumes moving and never restarts its own route.
    let sawMoving = false
    for (let i = arrivedAt; i < arrivedAt + 400; i++) {
      engine.step(1 / 30)
      const veh = engine.getVehicle(v.id)
      if (!veh) break
      if (veh.status === 'moving') sawMoving = true
      expect(veh.currentNode).toBe(b)
    }
    expect(sawMoving).toBe(false)
    expect(engine.getVehicle(v.id)).toBeUndefined()
  })
})

describe('rerouting and cycle detection', () => {
  it('rerouteVehicle never sends the vehicle back to the node it came from', () => {
    const { engine } = makeEngine(55, 6)
    const west = nodeKey(-20, 0)
    const center = nodeKey(0, 0)
    const dest = nodeKey(20, 20)
    const v = engine.spawnAt(west, dest, { speed: 6 })!
    // Simulate being at the centre intersection, having come from the west.
    v.previousNode = west
    v.currentNode = center
    v.routeIndex = 0
    v.route = [center, ...v.route.slice(1)]
    v.currentEdge = null
    v.progressOnEdge = 0
    v.recentNodes = [center]
    v.x = 0
    v.z = 0

    engine.rerouteVehicle(v)
    const veh = engine.getVehicle(v.id)!
    expect(veh.route[0]).toBe(center)
    expect(veh.route[1]).not.toBe(west)
  })

  it('findRoute supports avoidFirstStep and allows a U-turn only when required', () => {
    const net = new RoadNetwork()
    const west = nodeKey(-20, 0)
    const center = nodeKey(0, 0)
    const dest = nodeKey(-20, 20)

    const avoided = findRoute(net, center, dest, new Set(), { avoidFirstStep: west })
    expect(avoided).not.toBeNull()
    expect(avoided![1]).not.toBe(west)

    // Block every exit from the centre except back to the west.
    const blocked = new Set<string>()
    for (const id of net.allEdgeIds()) {
      if (id.startsWith(`${center}->`) && id !== `${center}->${west}`) {
        blocked.add(id)
      }
    }
    const required = findRoute(net, center, dest, blocked, { avoidFirstStep: west })
    expect(required).not.toBeNull()
    // The only possible first step is a U-turn back to the west.
    expect(required![1]).toBe(west)
  })

  it('reroutes at the intersection when an edge ahead is blocked - no mid-road jumps', () => {
    const { net, engine } = makeEngine(62, 6)
    const a = nodeKey(-20, -20)
    const b = nodeKey(0, -20)
    const c = nodeKey(0, 0)
    const d = nodeKey(20, 0)
    const v = engine.spawnAt(a, d, { speed: 6 })!
    // Force the vehicle mid-way along a -> b with a route continuing b -> c.
    const edgeAB = `${a}->${b}`
    const edgeBC = `${b}->${c}`
    v.currentNode = a
    v.routeIndex = 0
    v.route = [a, b, c, d]
    v.currentEdge = edgeAB
    v.progressOnEdge = 5
    v.recentNodes = [a]
    v.previousNode = null
    v.x = net.pointOnEdge(net.getEdge(edgeAB)!, 5).x
    v.z = net.pointOnEdge(net.getEdge(edgeAB)!, 5).z
    v.status = 'moving'
    v.phase = 'road'
    v.speed = 3

    // Block the edge ahead (b -> c) while the vehicle is still on a -> b.
    engine.blockEdge(edgeBC)

    let sawReroute = false
    for (let i = 0; i < 600; i++) {
      engine.step(1 / 30)
      const veh = engine.getVehicle(v.id)
      if (!veh || veh.status === 'unreachable') break
      if (veh.rerouteCount > 0) sawReroute = true
      if (veh.currentEdge === edgeAB) {
        // While still on the original edge, progress only increases forward.
        expect(veh.progressOnEdge).toBeGreaterThanOrEqual(5 - 1e-9)
      } else {
        // The vehicle leaves edge AB only at its end (node b), then continues
        // on the new route from that node — never jumping sideways mid-road.
        expect(veh.currentNode).toBe(b)
        expect(veh.progressOnEdge).toBeLessThanOrEqual(0.15)
        break
      }
    }
    expect(sawReroute).toBe(true)
  })

  it('detects an unintended route cycle (A -> B -> C -> D -> A) and recovers', () => {
    const { engine } = makeEngine(57, 6)
    const a = nodeKey(-20, -20)
    const b = nodeKey(0, -20)
    const c = nodeKey(0, 0)
    const d = nodeKey(-20, 0)
    const v = engine.spawnAt(a, d, { speed: 6 })!
    // Corrupt the route into a repeating cycle that visits A twice.
    v.destinationNode = d
    v.route = [a, b, c, d, a, b, c, d]
    v.routeIndex = 0
    v.currentNode = a
    v.currentEdge = `${a}->${b}`
    v.progressOnEdge = 0
    v.recentNodes = [a]

    let sawCycle = false
    let recovered = false
    // The IDM acceleration model is gentler than a constant-ramp model, and
    // the signalized intersections add up to 5 s per crossing, so allow the
    // corrupted route's traversal plus the recovery detour to take its natural
    // time.
    for (let i = 0; i < 3600; i++) {
      const res = engine.step(1 / 30)
      if (res.stalled.length > 0) sawCycle = true
      const veh = engine.getVehicle(v.id)
      if (!veh) break
      if (veh.status === 'unreachable') break
      if (veh.status === 'arrived') {
        recovered = true
        break
      }
      if (veh.rerouteCount > 0) {
        // After recovery the route is simple again (no repeats).
        expect(new Set(veh.route).size).toBe(veh.route.length)
      }
    }
    // The cycle was detected and the vehicle did not loop forever.
    expect(sawCycle).toBe(true)
    expect(recovered).toBe(true)
  })
})

describe('collision avoidance (no vehicles moving through each other)', () => {
  it('a faster vehicle follows a slower one on the same road without passing through it', () => {
    const { engine } = makeEngine(70, 6)
    const a = nodeKey(-20, -20)
    const b = nodeKey(20, 20)
    // Same route, leader ahead at progress 12 (slow), follower behind at 2 (fast).
    const leader = engine.spawnAt(a, b, { speed: 5, progressOnEdge: 12 })!
    const follower = engine.spawnAt(a, b, { speed: 9, progressOnEdge: 2 })!
    expect(leader.route).toEqual(follower.route)

    let minGap = Infinity
    for (let i = 0; i < 1600; i++) {
      engine.step(1 / 30)
      const l = engine.getVehicle(leader.id)
      const f = engine.getVehicle(follower.id)
      if (!l || !f) break
      if (l.status === 'arrived' || f.status === 'arrived') break
      const lp = engine.vehiclePosition(l)
      const fp = engine.vehiclePosition(f)
      const gap = Math.hypot(lp.x - fp.x, lp.z - fp.z)
      minGap = Math.min(minGap, gap)
      // The follower must never collide with (or pass through) the leader.
      expect(gap).toBeGreaterThan(1.0)
    }
    expect(minGap).toBeGreaterThan(1.0)
  })

  it('a vehicle stops behind a stationary vehicle instead of driving through it', () => {
    const { engine } = makeEngine(71, 6)
    const a = nodeKey(-20, -20)
    const b = nodeKey(20, 20)
    const v = engine.spawnAt(a, b, { speed: 6, progressOnEdge: 5 })!
    const blocker = engine.spawnAt(a, b, { speed: 6, progressOnEdge: 8 })!
    // Freeze the blocker mid-road (simulates a stopped/suspended vehicle).
    engine.suspend(blocker.id)

    let minGap = Infinity
    for (let i = 0; i < 600; i++) {
      engine.step(1 / 30)
      const veh = engine.getVehicle(v.id)
      if (!veh || veh.status === 'arrived' || veh.status === 'unreachable') break
      const vp = engine.vehiclePosition(veh)
      const bp = engine.vehiclePosition(blocker)
      minGap = Math.min(minGap, Math.hypot(vp.x - bp.x, vp.z - bp.z))
      expect(Math.hypot(vp.x - bp.x, vp.z - bp.z)).toBeGreaterThan(1.0)
    }
    // It stops behind the blocker without ever touching it.
    expect(minGap).toBeGreaterThan(1.2)
  })

  it('busy traffic on the same road never overlaps (spawn deconfliction + following)', () => {
    const { engine } = makeEngine(72, 8)
    for (let i = 0; i < 14; i++) engine.spawnVehicle()

    let worst = Infinity
    for (let t = 0; t < 2400; t++) {
      engine.step(1 / 30)
      // Only compare vehicles sharing an edge (same road, same direction).
      const movers = engine.getActiveVehicles().filter((v) => v.status === 'moving')
      for (let i = 0; i < movers.length; i++) {
        for (let j = i + 1; j < movers.length; j++) {
          if (movers[i].currentEdge !== movers[j].currentEdge) continue
          const p = engine.vehiclePosition(movers[i])
          const q = engine.vehiclePosition(movers[j])
          const d = Math.hypot(p.x - q.x, p.z - q.z)
          if (d < worst) worst = d
          // Same-lane traffic is never closer than a car length.
          expect(d).toBeGreaterThan(0.9)
        }
      }
    }
    expect(worst).toBeGreaterThan(0.9)
  })
})

describe('right-hand traffic: lanes, turns and signals', () => {
  it('places each direction on its own side of the road', () => {
    const net = new RoadNetwork()
    // Eastbound (z constant, toNode.x > fromNode.x) runs on the south side.
    const east = net.edgeBetween(nodeKey(-20, 0), nodeKey(0, 0))!
    const es = net.edgeStartPoint(east)
    expect(es.z).toBeCloseTo(2.2, 5)
    expect(east.laneOffset).toBeCloseTo(2.2, 5)
    // Westbound runs on the north side.
    const west = net.edgeBetween(nodeKey(0, 0), nodeKey(-20, 0))!
    expect(net.edgeStartPoint(west).z).toBeCloseTo(-2.2, 5)
    expect(west.laneOffset).toBeCloseTo(-2.2, 5)
    // Southbound (vertical, toNode.z > fromNode.z) runs on the WEST side.
    const south = net.edgeBetween(nodeKey(0, -20), nodeKey(0, 0))!
    expect(net.edgeStartPoint(south).x).toBeCloseTo(-2.2, 5)
    expect(south.laneOffset).toBeCloseTo(-2.2, 5)
    // Northbound runs on the EAST side.
    const north = net.edgeBetween(nodeKey(0, 0), nodeKey(0, -20))!
    expect(net.edgeStartPoint(north).x).toBeCloseTo(2.2, 5)
    expect(north.laneOffset).toBeCloseTo(2.2, 5)
  })

  it('edges are straight lanes between stop lines (never through the node centre)', () => {
    const net = new RoadNetwork()
    const east = net.edgeBetween(nodeKey(-20, 0), nodeKey(0, 0))!
    // Two endpoints, both on the lane line z = +2.2, stopping 4.5 m short of
    // each intersection centre.
    expect(east.pts).toHaveLength(2)
    expect(east.length).toBeCloseTo(11, 5) // spacing 20 − 2 × 4.5
    expect(east.pts[0][0]).toBeCloseTo(-15.5, 5)
    expect(east.pts[0][1]).toBeCloseTo(2.2, 5)
    expect(east.pts[1][0]).toBeCloseTo(-4.5, 5)
    expect(east.pts[1][1]).toBeCloseTo(2.2, 5)
  })

  it('a red light stops the vehicle exactly at the stop line, not metres before', () => {
    const { engine } = makeEngine(101, 8)
    // Eastbound on road-z0: the horizontal direction is red at t=0 (green only
    // from tick 720), so the vehicle must hold at the (0,0) stop line.
    const v = engine.spawnAt(nodeKey(-20, 0), nodeKey(20, 0), { speed: 8 })!
    for (let t = 0; t < 150; t++) engine.step(1 / 30)
    const veh = engine.getVehicle(v.id)!
    expect(veh.status).toBe('moving')
    expect(veh.speed).toBeLessThan(0.5)
    const edge = engine.network.getEdge(veh.currentEdge!)!
    const remaining = edge.length - veh.progressOnEdge
    // Held just before the line (within the stop margin), never metres back.
    expect(remaining).toBeGreaterThan(0.05)
    expect(remaining).toBeLessThan(1.0)
    // And it has NOT crossed into the intersection.
    expect(veh.turn).toBeNull()
  })

  it('drives straight through a green light without stopping', () => {
    const { engine } = makeEngine(102, 8)
    // Step until the vertical approach at (-20,0) is green (the intersection
    // is phase-staggered, so its green window does not start at t=0), then
    // spawn so the vehicle reaches the intersection inside the green window.
    for (let t = 0; t < 4000 && engine.signalPhase(nodeKey(-20, 0), true) !== 'green'; t++) {
      engine.step(1 / 30)
    }
    expect(engine.signalPhase(nodeKey(-20, 0), true)).toBe('green')
    const v = engine.spawnAt(nodeKey(-20, -20), nodeKey(-20, 20), { speed: 8 })!
    let minSpeedNear = Infinity
    for (let t = 0; t < 300; t++) {
      engine.step(1 / 30)
      const veh = engine.getVehicle(v.id)
      if (!veh || veh.status === 'arrived' || veh.status === 'removed') break
      // Within 10 m of the intersection centre the vehicle must keep rolling.
      const p = engine.vehiclePosition(veh)
      if (Math.hypot(p.x + 20, p.z) < 10 && veh.status === 'moving') {
        minSpeedNear = Math.min(minSpeedNear, veh.speed)
      }
    }
    expect(minSpeedNear).toBeGreaterThan(3)
  })

  it('keeps straight-through traffic on its lane centre', () => {
    const { engine } = makeEngine(103, 6)
    // Eastbound on road-z0: the lane is z = +2.2 for the whole trip.
    const v = engine.spawnAt(nodeKey(-20, 0), nodeKey(20, 0), { speed: 6 })!
    let maxDeviation = 0
    for (let t = 0; t < 4000; t++) {
      engine.step(1 / 30)
      const veh = engine.getVehicle(v.id)
      if (!veh || veh.status === 'arrived' || veh.status === 'removed') break
      const e = engine.network.getEdge(veh.currentEdge ?? '')
      if (!e || e.road !== 'road-z0') continue
      const p = engine.vehiclePosition(veh)
      maxDeviation = Math.max(maxDeviation, Math.abs(p.z - 2.2))
    }
    expect(maxDeviation).toBeLessThan(0.05)
  })

  it('right turns hug the inside corner instead of cutting the centre', () => {
    const { engine } = makeEngine(104, 6)
    // Eastbound turning right (south) at (0,0).
    const v = engine.spawnAt(nodeKey(-20, 0), nodeKey(0, 20), { speed: 6 })!
    let minDistToCentre = Infinity
    for (let t = 0; t < 5000; t++) {
      engine.step(1 / 30)
      const veh = engine.getVehicle(v.id)
      if (!veh || veh.status === 'arrived' || veh.status === 'removed') break
      const p = engine.vehiclePosition(veh)
      minDistToCentre = Math.min(minDistToCentre, Math.hypot(p.x, p.z))
    }
    // The corner geometry (stopLineDist 4.5, lane 2.2) keeps the car well away
    // from the node centre; a centre-cutting path would dip below 1 m.
    expect(minDistToCentre).toBeGreaterThan(3.0)
  })

  it('left turns sweep across the intersection with a smooth heading change', () => {
    const { engine } = makeEngine(105, 6)
    // Eastbound turning left (north) at (0,0).
    const v = engine.spawnAt(nodeKey(-20, 0), nodeKey(0, -20), { speed: 6 })!
    let minDistToCentre = Infinity
    let maxHeadingStep = 0
    let prev: number | null = null
    for (let t = 0; t < 5000; t++) {
      engine.step(1 / 30)
      const veh = engine.getVehicle(v.id)
      if (!veh || veh.status === 'arrived' || veh.status === 'removed') break
      const p = engine.vehiclePosition(veh)
      minDistToCentre = Math.min(minDistToCentre, Math.hypot(p.x, p.z))
      if (prev !== null) {
        let dh = Math.abs(veh.heading - prev)
        if (dh > Math.PI) dh = 2 * Math.PI - dh
        maxHeadingStep = Math.max(maxHeadingStep, dh)
      }
      prev = veh.heading
    }
    // The arc comes close to the centre but never passes through it, and the
    // heading rotates smoothly (a snap would be ~1.57 rad in a tick).
    expect(minDistToCentre).toBeGreaterThan(0.3)
    expect(maxHeadingStep).toBeLessThan(0.2)
    // The vehicle ends up on the northbound lane (x = +2.2).
    expect(v.x).toBeCloseTo(2.2, 1)
  })

  it('yields to oncoming traffic before turning left', () => {
    const { engine } = makeEngine(106, 6)
    const left = engine.spawnAt(nodeKey(-20, 0), nodeKey(0, -20), { speed: 6 })!
    const oncoming = engine.spawnAt(nodeKey(20, 0), nodeKey(-20, 0), { speed: 6 })!
    let leftEnter = -1
    let oncomingCross = -1
    let collisions = 0
    for (let t = 0; t < 1600; t++) {
      const res = engine.step(1 / 30)
      collisions += res.collisions.length
      const l = engine.getVehicle(left.id)
      const o = engine.getVehicle(oncoming.id)
      if (!l || !o) break
      if (leftEnter === -1 && l.turn) leftEnter = t
      if (oncomingCross === -1 && o.turn) oncomingCross = t
      if (o.status === 'arrived' || o.status === 'removed') break
    }
    expect(collisions).toBe(0)
    expect(oncomingCross).toBeGreaterThan(0)
    // The oncoming through-traffic crosses first; the left-turner waits.
    expect(leftEnter).toBeGreaterThan(oncomingCross)
  })

  it('never blocks the box: holds at the stop line when the exit lane is jammed', () => {
    const { engine } = makeEngine(107, 6)
    const a = engine.spawnAt(nodeKey(-20, 0), nodeKey(20, 0), { speed: 6 })!
    // A frozen vehicle sits on A's exit lane, just past the crossing.
    const blocker = engine.spawnAt(nodeKey(0, 0), nodeKey(20, 0), {
      speed: 6,
      progressOnEdge: 2,
    })!
    engine.suspend(blocker.id)

    // Run past A's green (starts at tick 720).
    for (let t = 0; t < 900; t++) engine.step(1 / 30)
    const av = engine.getVehicle(a.id)!
    expect(av.status).toBe('moving')
    expect(av.turn).toBeNull() // waiting at the stop line, not in the box
    const edge = engine.network.getEdge(av.currentEdge!)!
    const remaining = edge.length - av.progressOnEdge
    expect(remaining).toBeLessThan(1.0)

    // Free the exit lane: the vehicle then proceeds.
    engine.resume(blocker.id)
    let crossed = false
    for (let t = 0; t < 600; t++) {
      engine.step(1 / 30)
      const v = engine.getVehicle(a.id)
      if (!v) break
      if (v.currentEdge === '0,0->20,0' || v.status === 'arrived') {
        crossed = true
        break
      }
    }
    expect(crossed).toBe(true)
  })

  it('waits at the stop line while the crossing is occupied on a conflicting path', () => {
    const { engine } = makeEngine(108, 6)
    // A: eastbound through (0,0).
    const a = engine.spawnAt(nodeKey(-20, 0), nodeKey(20, 0), { speed: 6 })!
    // B: northbound through (0,0) — vertical has green at t=0, so B crosses
    // immediately. Freeze it inside the box on A's path.
    const b = engine.spawnAt(nodeKey(0, 20), nodeKey(0, -20), {
      speed: 6,
      progressOnEdge: 10.5,
    })!
    let frozen = false
    for (let t = 0; t < 1200; t++) {
      engine.step(1 / 30)
      if (!frozen && b.turn && b.turnDist > 2.5 && b.turnDist < 5) {
        engine.suspend(b.id)
        frozen = true
        break
      }
    }
    expect(frozen).toBe(true)
    const bp = engine.vehiclePosition(b)
    expect(Math.hypot(bp.x, bp.z)).toBeLessThan(5)

    // Run past A's green (starts at tick 720).
    for (let t = 0; t < 900; t++) engine.step(1 / 30)
    const av = engine.getVehicle(a.id)!
    expect(av.status).toBe('moving')
    expect(av.turn).toBeNull()
    const edge = engine.network.getEdge(av.currentEdge!)!
    const remaining = edge.length - av.progressOnEdge
    expect(remaining).toBeLessThan(1.0)

    // Free B: A can then proceed.
    engine.resume(b.id)
    let crossed = false
    for (let t = 0; t < 600; t++) {
      engine.step(1 / 30)
      const v = engine.getVehicle(a.id)
      if (!v) break
      if (v.currentEdge === '0,0->20,0' || v.status === 'arrived') {
        crossed = true
        break
      }
    }
    expect(crossed).toBe(true)
  })

  it('resolves simultaneous perpendicular approaches without collisions', () => {
    const { engine } = makeEngine(109, 6)
    // A southbound vehicle and an eastbound vehicle cross at (-20,0); they are
    // on alternating greens, so they must never share the box.
    const south = engine.spawnAt(nodeKey(-20, -20), nodeKey(-20, 20), { speed: 6 })!
    const east = engine.spawnAt(nodeKey(0, 0), nodeKey(20, 0), { speed: 6 })!
    let minSep = Infinity
    let collisions = 0
    for (let t = 0; t < 6000; t++) {
      const res = engine.step(1 / 30)
      collisions += res.collisions.length
      const s = engine.getVehicle(south.id)
      const e = engine.getVehicle(east.id)
      if (!s || !e) break
      const ps = engine.vehiclePosition(s)
      const pe = engine.vehiclePosition(e)
      minSep = Math.min(minSep, Math.hypot(ps.x - pe.x, ps.z - pe.z))
      if (s.status === 'removed' && e.status === 'removed') break
    }
    expect(collisions).toBe(0)
    expect(minSep).toBeGreaterThan(1.5)
  })
})

describe('multi-lane roads and lane changes', () => {
  it('builds the requested number of lanes per direction with correct offsets', () => {
    const net = new RoadNetwork({ lanes: 2 })
    expect(net.laneSpacing).toBeCloseTo(2.2, 5)
    const a = nodeKey(-20, 0)
    const b = nodeKey(0, 0)
    // Eastbound lane centres at +1.1 (inner) and +3.3 (outer).
    const inner = net.edgeBetween(a, b, 0)!
    const outer = net.edgeBetween(a, b, 1)!
    expect(inner.id).toBe('-20,0->0,0')
    expect(outer.id).toBe('-20,0->0,0#L1')
    expect(inner.laneIndex).toBe(0)
    expect(outer.laneIndex).toBe(1)
    expect(net.edgeStartPoint(inner).z).toBeCloseTo(1.1, 5)
    expect(net.edgeStartPoint(outer).z).toBeCloseTo(3.3, 5)
    // Single-lane default reproduces the classic offset exactly.
    const single = new RoadNetwork()
    expect(single.laneSpacing).toBe(0)
    expect(single.edgeCount).toBe(24)
    const classic = new RoadNetwork({ lanes: 1 })
    expect(classic.edgeStartPoint(classic.edgeBetween(a, b, 0)!).z).toBeCloseTo(2.2, 5)
  })

  it('sends right turns to the outer lane and left turns to the inner lane', () => {
    // Right turn from eastbound → southbound outer lane (#L1).
    const rnet = new RoadNetwork({ lanes: 2 })
    const rEngine = new SimulationEngine(rnet, { seed: 4, speedRange: [6, 6] })
    // Spawn near the stop line so the approach lane cannot change first.
    const right = rEngine.spawnAt(nodeKey(-20, 0), nodeKey(0, 20), {
      speed: 6,
      progressOnEdge: 8,
    })!
    let landed: string | null = null
    for (let t = 0; t < 2400 && landed === null; t++) {
      rEngine.step(1 / 30)
      const v = rEngine.getVehicle(right.id)
      if (!v) break
      if (v.currentEdge?.startsWith('0,0->0,20')) landed = v.currentEdge
    }
    expect(landed).toBe('0,0->0,20#L1')

    // Left turn from eastbound → northbound inner lane (#L0).
    const lnet = new RoadNetwork({ lanes: 2 })
    const lEngine = new SimulationEngine(lnet, { seed: 4, speedRange: [6, 6] })
    const left = lEngine.spawnAt(nodeKey(-20, 0), nodeKey(0, -20), {
      speed: 6,
      progressOnEdge: 8,
    })!
    let leftLanded: string | null = null
    for (let t = 0; t < 2400 && leftLanded === null; t++) {
      lEngine.step(1 / 30)
      const v = lEngine.getVehicle(left.id)
      if (!v) break
      if (v.currentEdge?.startsWith('0,0->0,-20')) leftLanded = v.currentEdge
    }
    expect(leftLanded).toBe('0,0->0,-20')

    // Straight-through keeps its current lane (#L0).
    const snet = new RoadNetwork({ lanes: 2 })
    const sEngine = new SimulationEngine(snet, { seed: 4, speedRange: [6, 6] })
    const straight = sEngine.spawnAt(nodeKey(-20, 0), nodeKey(20, 0), {
      speed: 6,
      progressOnEdge: 8,
    })!
    let straightLanded: string | null = null
    for (let t = 0; t < 2400 && straightLanded === null; t++) {
      sEngine.step(1 / 30)
      const v = sEngine.getVehicle(straight.id)
      if (!v) break
      if (v.currentEdge?.startsWith('0,0->20,0')) straightLanded = v.currentEdge
    }
    expect(straightLanded).toBe('0,0->20,0')
  })

  it('executes lane changes on multi-lane roads without collisions', () => {
    const xs = [-40, -20, 0, 20, 40]
    const zs = [-40, -20, 0, 20, 40]
    const net = new RoadNetwork({ xs, zs, laneOffset: 2.2, stopLineDist: 4.5, lanes: 2 })
    const engine = new SimulationEngine(net, { seed: 7, speedRange: [7, 9] })
    for (let i = 0; i < 16; i++) engine.spawnVehicle()

    let laneChanges = 0
    let collisions = 0
    let minDist = Infinity
    for (let t = 0; t < 3600; t++) {
      const res = engine.step(1 / 30)
      collisions += res.collisions.length
      for (const v of engine.getActiveVehicles()) {
        if (v.status !== 'moving') continue
        if (v.laneChange) laneChanges++
        const p = engine.vehiclePosition(v)
        for (const o of engine.getActiveVehicles()) {
          if (o.id === v.id || o.status !== 'moving') continue
          minDist = Math.min(minDist, Math.hypot(p.x - engine.vehiclePosition(o).x, p.z - engine.vehiclePosition(o).z))
        }
      }
    }
    // Lane changes actually happen, and never cause collisions or contact.
    expect(laneChanges).toBeGreaterThan(0)
    expect(collisions).toBe(0)
    expect(minDist).toBeGreaterThan(1.5)
  })

  it('never attempts lane changes on a single-lane road', () => {
    const { engine } = makeEngine(11, 6)
    const v = engine.spawnAt(nodeKey(-20, -20), nodeKey(20, 20), { speed: 6 })!
    for (let t = 0; t < 900; t++) {
      engine.step(1 / 30)
      const veh = engine.getVehicle(v.id)
      if (!veh || veh.status !== 'moving') break
      expect(veh.laneChange).toBeNull()
    }
  })
})

describe('traffic-light decisions (yellow / red)', () => {
  // Horizontal (road-z) phase on the fixed clock: green [720,1320), yellow
  // [1320,1440), red [0,720) mod 1440.
  function stepTo(targetTicks: number) {
    for (let i = 0; i < Math.round(targetTicks / 4); i++) stepOnce()
  }
  let net: RoadNetwork
  let engine: SimulationEngine
  let stepOnce: () => void
  beforeEach(() => {
    const m = makeEngine(6, 6)
    net = m.net
    engine = m.engine
    stepOnce = () => engine.step(1 / 30)
  })
  function roadZPhase(): 'red' | 'yellow' | 'green' {
    const t = (engine as unknown as { tickCount: number }).tickCount % 1440
    const u = (t - 720 + 1440) % 1440
    if (u < 600) return 'green'
    if (u < 720) return 'yellow'
    return 'red'
  }

  it('stops at the line on yellow when a comfortable stop is possible', () => {
    stepTo(1328) // yellow starts at 1320
    // 8 m before the line at 6 m/s: stopping distance 4 m < 8 m → safe stop.
    const v = engine.spawnAt(nodeKey(-20, 0), nodeKey(0, 20), { speed: 6, progressOnEdge: 3 })!
    let crossedOnYellow = false
    let stopped = false
    for (let t = 0; t < 1200; t++) {
      stepOnce()
      const veh = engine.getVehicle(v.id)
      if (!veh || veh.status !== 'moving') break
      if (veh.turn !== null) {
        if (roadZPhase() === 'yellow') crossedOnYellow = true
        continue
      }
      const edge = net.getEdge(veh.currentEdge ?? '')
      if (!edge) break
      const rem = edge.length - veh.progressOnEdge
      if (veh.speed < 0.15 && rem > 0.1 && rem < 0.6) stopped = true
    }
    // The vehicle braked to a stop at the line rather than running the yellow.
    expect(stopped).toBe(true)
    expect(crossedOnYellow).toBe(false)
  })

  it('proceeds on yellow when stopping would require an emergency stop', () => {
    stepTo(1328)
    // 1 m before the line at 6 m/s: cannot stop comfortably → committed.
    const v = engine.spawnAt(nodeKey(-20, 0), nodeKey(0, 20), { speed: 6, progressOnEdge: 10 })!
    let crossedOnYellow = false
    for (let t = 0; t < 300; t++) {
      stepOnce()
      const veh = engine.getVehicle(v.id)
      if (!veh || veh.status !== 'moving') break
      if (veh.turn !== null && roadZPhase() === 'yellow') crossedOnYellow = true
    }
    expect(crossedOnYellow).toBe(true)
  })

  it('never crosses on red, even when very close to the line', () => {
    stepTo(100) // road-z red for [0,720)
    // 3 m before the line on red: within the braking window, must still stop.
    const v = engine.spawnAt(nodeKey(-20, 0), nodeKey(0, 20), { speed: 6, progressOnEdge: 8 })!
    let crossedOnRed = false
    let stopped = false
    for (let t = 0; t < 1200; t++) {
      stepOnce()
      const veh = engine.getVehicle(v.id)
      if (!veh || veh.status !== 'moving') break
      if (veh.turn !== null) {
        if (roadZPhase() === 'red') crossedOnRed = true
        continue
      }
      const edge = net.getEdge(veh.currentEdge ?? '')
      if (!edge) break
      const rem = edge.length - veh.progressOnEdge
      if (veh.speed < 0.15 && rem > 0.1 && rem < 0.6) stopped = true
    }
    expect(stopped).toBe(true)
    expect(crossedOnRed).toBe(false)
  })

  it('crosses on green once the intersection is clear', () => {
    stepTo(740) // road-z green for [720,1320)
    const v = engine.spawnAt(nodeKey(-20, 0), nodeKey(20, 0), { speed: 6, progressOnEdge: 2 })!
    let crossed = false
    let reached = false
    for (let t = 0; t < 600; t++) {
      stepOnce()
      const veh = engine.getVehicle(v.id)
      if (!veh) break
      if (veh.status === 'arrived') { reached = true; break }
      if (veh.turn !== null) crossed = true
    }
    expect(crossed || reached).toBe(true)
  })
})

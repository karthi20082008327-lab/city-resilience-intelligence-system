import type { RoadNetwork } from './roadNetwork'

/**
 * Breadth-first shortest-path routing over the directed road network.
 *
 * Guarantees:
 *  - Never returns an immediate U-turn (A -> B -> A): when expanding a node
 *    we refuse to step back onto the node we just came from.
 *  - `avoidFirstStep` additionally prevents the very first step from going back
 *    to the node the vehicle came from (used when rerouting mid-trip). The
 *    U-turn is only allowed as a last resort when the road network requires it
 *    (i.e. every non-U-turn route is blocked).
 *  - Never uses a blocked edge.
 *  - Returns null when no valid route exists (the caller marks the vehicle
 *    unreachable instead of letting it wander).
 */
export function findRoute(
  network: RoadNetwork,
  from: string,
  to: string,
  blocked: ReadonlySet<string>,
  opts: { avoidFirstStep?: string | null } = {},
): string[] | null {
  if (from === to) return [from]
  if (!network.getNode(from) || !network.getNode(to)) return null

  const route = bfs(network, from, to, blocked, opts.avoidFirstStep ?? undefined)
  if (route) return route

  // Fall back to allowing an immediate U-turn only when the road network
  // requires one (no non-U-turn route exists).
  if (opts.avoidFirstStep) {
    return bfs(network, from, to, blocked, undefined)
  }
  return null
}

function bfs(
  network: RoadNetwork,
  from: string,
  to: string,
  blocked: ReadonlySet<string>,
  avoidFirstStep: string | undefined,
): string[] | null {
  const prev = new Map<string, string>()
  const visited = new Set<string>([from])
  const queue: string[] = [from]

  while (queue.length > 0) {
    const u = queue.shift()!
    if (u === to) break

    for (const e of network.outgoingEdges(u)) {
      if (blocked.has(e.id)) continue
      const v = e.to
      if (visited.has(v)) continue
      // Prevent immediate U-turn: A -> B -> A
      const cameFrom = prev.get(u)
      if (cameFrom !== undefined && v === cameFrom) continue
      // The very first step must not go back to the node we just came from.
      if (u === from && avoidFirstStep !== undefined && v === avoidFirstStep) continue
      visited.add(v)
      prev.set(v, u)
      queue.push(v)
    }
  }

  if (!visited.has(to)) return null

  const route: string[] = [to]
  let cursor = to
  while (cursor !== from) {
    const p = prev.get(cursor)
    if (p === undefined) return null
    route.push(p)
    cursor = p
  }
  route.reverse()
  return route
}

/**
 * Validation used as a safeguard before assigning a route:
 * returns a list of problems (empty when the route is valid).
 */
export function validateRoute(
  network: RoadNetwork,
  route: string[],
  blocked: ReadonlySet<string>,
): string[] {
  const problems: string[] = []
  if (!Array.isArray(route) || route.length < 2) {
    return ['route must contain at least two nodes']
  }
  for (let i = 0; i < route.length; i++) {
    const node = route[i]
    if (!network.getNode(node)) {
      problems.push(`invalid node id "${node}" at index ${i}`)
      continue
    }
    if (i > 0) {
      const e = network.edgeBetween(route[i - 1], node)
      if (!e) {
        problems.push(`no edge from ${route[i - 1]} to ${node}`)
      } else if (blocked.has(e.id)) {
        problems.push(`edge ${e.id} is blocked`)
      }
      if (i > 1 && node === route[i - 2]) {
        problems.push(`immediate u-turn at index ${i} (${node})`)
      }
    }
  }
  return problems
}

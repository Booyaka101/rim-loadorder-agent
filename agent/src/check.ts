import type {Content, Source} from './content.ts'

export const GAME_VERSION = '1.6'

export type FindingKind =
  | 'missing-dependency'
  | 'order'
  | 'contradiction'
  | 'incompatible'
  | 'load-top'
  | 'load-bottom'
  | 'not-for-version'
  | 'owner-disabled'
  | 'unknown-mod'

export interface Finding {
  kind: FindingKind
  mod: string
  other?: string
  source: Source
  detail: string
  note?: string
}

/** `before` must load ahead of `after`, as claimed by `source`. */
export interface Edge {
  before: string
  after: string
  source: Exclude<Source, 'owner'>
  note?: string
}

export interface Report {
  checked: number
  findings: Finding[]
  incidents: {id: string; title: string; verdict: string}[]
}

const isOfficial = (id: string) => id.startsWith('ludeon.')

export function orderEdges(content: Content): Edge[] {
  const edges: Edge[] = []
  for (const m of content.mods) {
    for (const t of m.loadAfter ?? []) edges.push({before: t, after: m.packageId, source: 'author'})
    for (const t of m.loadBefore ?? []) edges.push({before: m.packageId, after: t, source: 'author'})
  }
  for (const r of content.rules) {
    if (!r.target) continue
    const note = r.note ?? undefined
    if (r.relation === 'loadAfter') edges.push({before: r.target, after: r.subject, source: 'rimsort-community', note})
    if (r.relation === 'loadBefore') edges.push({before: r.subject, after: r.target, source: 'rimsort-community', note})
  }
  return edges
}

function edgeFinding(e: Edge, name: (id: string) => string): Finding {
  return {
    kind: 'order',
    mod: e.after,
    other: e.before,
    source: e.source,
    detail: `${name(e.after)} should load after ${name(e.before)}, but loads before it`,
    ...(e.note && {note: e.note}),
  }
}

/** Check a load order against everything the dataset knows. Pure: no I/O. */
export function checkLoadOrder(order: string[], content: Content): Report {
  const pos = new Map(order.map((id, i) => [id, i]))
  const active = (id: string) => pos.has(id)
  const mods = new Map(content.mods.map((m) => [m.packageId, m]))
  const name = (id: string) => (mods.has(id) ? `${mods.get(id)!.title} (${id})` : id)
  const findings: Finding[] = []

  for (const id of order) {
    const m = mods.get(id)
    if (!m) {
      findings.push({kind: 'unknown-mod', mod: id, source: 'owner', detail: `${id} is not in the dataset, so nothing about it can be checked`})
      continue
    }
    for (const d of m.dependencies ?? []) {
      if (!active(d.packageId)) {
        findings.push({kind: 'missing-dependency', mod: id, other: d.packageId, source: 'author',
          detail: `${m.title} requires ${d.displayName ?? d.packageId} (${d.packageId}), which is not active`})
      }
    }
    if (!isOfficial(id) && m.supportedVersions && !m.supportedVersions.includes(GAME_VERSION)) {
      const f: Finding = {kind: 'not-for-version', mod: id, source: 'author',
        detail: `${m.title} declares ${m.supportedVersions.join(', ') || 'no versions'}, not ${GAME_VERSION}`}
      if (m.supersededBy) f.note = `replace with ${m.supersededBy.title} (${m.supersededBy.packageId})`
      findings.push(f)
    }
  }

  const edges = orderEdges(content).filter((e) => active(e.before) && active(e.after))
  const claimed = new Map<string, Edge>()
  for (const e of edges) claimed.set(`${e.before}>${e.after}`, e)
  const reported = new Set<string>()
  for (const e of edges) {
    const key = `${e.before}>${e.after}`
    const reverse = claimed.get(`${e.after}>${e.before}`)
    if (reverse && reverse.source !== e.source) {
      const pair = [e.before, e.after].sort().join('|')
      if (!reported.has(pair)) {
        reported.add(pair)
        findings.push({kind: 'contradiction', mod: e.after, other: e.before, source: e.source,
          detail: `${e.source} says ${name(e.after)} loads after ${name(e.before)}; ${reverse.source} says the opposite`,
          ...(e.note && {note: e.note})})
      }
      continue
    }
    if (pos.get(e.before)! > pos.get(e.after)! && !reported.has(key)) {
      reported.add(key)
      findings.push(edgeFinding(e, name))
    }
  }

  const incompatible = new Map<string, Source>()
  for (const m of content.mods) for (const t of m.incompatibleWith ?? []) incompatible.set(`${m.packageId}|${t}`, 'author')
  for (const r of content.rules) if (r.relation === 'incompatibleWith' && r.target) incompatible.set(`${r.subject}|${r.target}`, 'rimsort-community')
  for (const [pair, source] of incompatible) {
    const [a, b] = pair.split('|')
    if (active(a) && active(b) && !(b < a && incompatible.has(`${b}|${a}`))) {
      findings.push({kind: 'incompatible', mod: a, other: b, source, detail: `${name(a)} is marked incompatible with ${name(b)} and both are active`})
    }
  }

  const {top, bottom} = placementRules(content)
  // A mod that must load before the game itself (Harmony, Prepatcher) is above any load-top rule.
  const aboveGame = new Set(edges.filter((e) => isOfficial(e.after)).map((e) => e.before))
  const ordinary = order.filter((id) => !isOfficial(id) && !aboveGame.has(id) && !top.has(id) && !bottom.has(id))
  const firstOrdinary = ordinary.length ? pos.get(ordinary[0])! : Infinity
  const lastOrdinary = ordinary.length ? pos.get(ordinary.at(-1)!)! : -Infinity
  for (const id of top) {
    if (active(id) && pos.get(id)! > firstOrdinary) {
      findings.push({kind: 'load-top', mod: id, source: 'rimsort-community', detail: `${name(id)} should load at the top, but ${name(ordinary[0])} comes before it`})
    }
  }
  for (const id of bottom) {
    if (active(id) && pos.get(id)! < lastOrdinary) {
      findings.push({kind: 'load-bottom', mod: id, source: 'rimsort-community', detail: `${name(id)} should load at the bottom, but ${name(ordinary.at(-1)!)} comes after it`})
    }
  }

  for (const d of content.disabled) {
    if (active(d.packageId)) {
      findings.push({kind: 'owner-disabled', mod: d.packageId, source: 'owner', detail: `the owner disabled ${name(d.packageId)} on this list: ${d.reason}`})
    }
  }

  const incidents = content.incidents
    .filter((i) => i.mods?.some(active))
    .map((i) => ({id: i._id, title: i.title, verdict: i.verdict}))

  return {checked: order.length, findings, incidents}
}

function placementRules(content: Content) {
  const top = new Set<string>()
  const bottom = new Set<string>()
  for (const r of content.rules) {
    if (r.relation === 'loadTop') top.add(r.subject)
    if (r.relation === 'loadBottom') bottom.add(r.subject)
  }
  return {top, bottom}
}

export interface Proposal {
  order: string[]
  moved: string[]
  ignored: Edge[]
}

/**
 * Repair the order one violated claim at a time: either move the later mod up to just
 * before the earlier one, or move the earlier one down to just after it, whichever
 * leaves fewer violations. Claims no single move can fix are then settled by a stable
 * topological sort, run from the top and from the bottom, keeping whichever disturbs
 * the list less. Only claims inside a real cycle end up ignored. Load-top and
 * load-bottom rules are left to the report.
 */
export function proposeOrder(order: string[], content: Content): Proposal {
  const active = new Set(order)
  const edges = orderEdges(content).filter((e) => active.has(e.before) && active.has(e.after))
  const stuck: Edge[] = []
  const violated = (o: string[]) => {
    const pos = new Map(o.map((id, i) => [id, i]))
    return edges.filter((e) => !stuck.includes(e) && pos.get(e.before)! > pos.get(e.after)!)
  }
  let current = order
  for (let bad = violated(current); bad.length; ) {
    const e = bad[0]
    const best = [moveTo(current, e.after, e.before, 1), moveTo(current, e.before, e.after, 0)]
      .map((o) => ({o, bad: violated(o)}))
      .sort((x, y) => x.bad.length - y.bad.length)[0]
    if (best.bad.length < bad.length) {
      current = best.o
      bad = best.bad
    } else {
      stuck.push(e)
      bad = violated(current)
    }
  }
  if (!stuck.length) return {order: current, moved: moved(order, current), ignored: []}
  const [best] = [stableSort(current, edges, false), stableSort(current, edges, true)]
    .map((r) => ({...r, moved: moved(order, r.order)}))
    .sort((x, y) => x.ignored.length - y.ignored.length || x.moved.length - y.moved.length)
  return best
}

/**
 * Topological sort that keeps the given order wherever the claims allow: from the top
 * it always places the earliest mod whose predecessors are placed; from the bottom, the
 * latest mod whose successors are. A cycle is broken at the next mod in that order.
 */
function stableSort(order: string[], edges: Edge[], fromBottom: boolean) {
  const seq = fromBottom ? [...order].reverse() : order
  const waitsOn = new Map<string, Edge[]>(seq.map((id) => [id, []]))
  for (const e of edges) waitsOn.get(fromBottom ? e.before : e.after)!.push(e)
  const other = (e: Edge) => (fromBottom ? e.after : e.before)
  const placed = new Set<string>()
  const result: string[] = []
  const ignored: Edge[] = []
  while (result.length < seq.length) {
    const next = seq.find((id) => !placed.has(id) && waitsOn.get(id)!.every((e) => placed.has(other(e))))
      ?? seq.find((id) => !placed.has(id))!
    ignored.push(...waitsOn.get(next)!.filter((e) => !placed.has(other(e))))
    placed.add(next)
    result.push(next)
  }
  return {order: fromBottom ? result.reverse() : result, ignored}
}

/** `order` with `id` moved next to `anchor`: just before it (offset 0) or just after (offset 1). */
function moveTo(order: string[], id: string, anchor: string, offset: 0 | 1) {
  const rest = order.filter((x) => x !== id)
  rest.splice(rest.indexOf(anchor) + offset, 0, id)
  return rest
}

/** The mods outside the longest common subsequence of the two orders: the ones that had to move. */
export function moved(before: string[], after: string[]): string[] {
  const n = before.length
  const m = after.length
  const lcs = Array.from({length: n + 1}, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = before[i] === after[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const kept = new Set<string>()
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (before[i] === after[j]) {
      kept.add(before[i])
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) i++
    else j++
  }
  return after.filter((id) => !kept.has(id))
}

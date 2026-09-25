import assert from 'node:assert/strict'
import {test} from 'node:test'
import {checkLoadOrder, moved, proposeOrder} from './check.ts'
import type {Content, Mod, Rule} from './content.ts'

function mod(packageId: string, extra: Partial<Mod> = {}): Mod {
  return {packageId, title: packageId, supportedVersions: ['1.6'], kind: 'content', dependencies: [],
    loadAfter: [], loadBefore: [], incompatibleWith: [], supersededBy: null, ...extra}
}

function rule(subject: string, relation: Rule['relation'], target: string | null = null, note: string | null = null): Rule {
  return {_id: `rule-${subject}-${relation}-${target}`, subject, relation, target, note}
}

function content(mods: Mod[], rules: Rule[] = [], extra: Partial<Content> = {}): Content {
  return {mods, rules, incidents: [], disabled: [], ...extra}
}

const kinds = (order: string[], c: Content) => checkLoadOrder(order, c).findings.map((f) => `${f.kind}:${f.mod}`)

test('a clean list has no findings', () => {
  const c = content([mod('a'), mod('b', {loadAfter: ['a'], dependencies: [{packageId: 'a', displayName: 'A'}]})])
  assert.deepEqual(kinds(['a', 'b'], c), [])
})

test('author and community order claims are both checked, with their source', () => {
  const c = content([mod('a'), mod('b', {loadAfter: ['a']}), mod('c')], [rule('c', 'loadBefore', 'a', 'why')])
  const r = checkLoadOrder(['b', 'a', 'c'], c)
  assert.deepEqual(r.findings.map((f) => [f.kind, f.mod, f.other, f.source, f.note]), [
    ['order', 'b', 'a', 'author', undefined],
    ['order', 'a', 'c', 'rimsort-community', 'why'],
  ])
})

test('claims about inactive mods are ignored', () => {
  const c = content([mod('a', {loadAfter: ['zzz'], loadBefore: ['yyy']})], [rule('a', 'loadAfter', 'xxx')])
  assert.deepEqual(kinds(['a'], c), [])
})

test('author and community disagreeing on a pair is a contradiction, not an order error', () => {
  const c = content([mod('a', {loadAfter: ['b']}), mod('b')], [rule('a', 'loadBefore', 'b')])
  assert.deepEqual(kinds(['a', 'b'], c), ['contradiction:a'])
})

test('missing dependencies, wrong version with replacement, and unknown mods', () => {
  const c = content([
    mod('a', {dependencies: [{packageId: 'lib', displayName: 'Lib'}]}),
    mod('old', {supportedVersions: ['1.4', '1.5'], supersededBy: {packageId: 'new', title: 'New'}}),
  ])
  const r = checkLoadOrder(['a', 'old', 'mystery'], c)
  assert.deepEqual(r.findings.map((f) => `${f.kind}:${f.mod}`), ['missing-dependency:a', 'not-for-version:old', 'unknown-mod:mystery'])
  assert.equal(r.findings[1].note, 'replace with New (new)')
})

test('official content is never flagged for version', () => {
  assert.deepEqual(kinds(['ludeon.rimworld'], content([mod('ludeon.rimworld', {supportedVersions: []})])), [])
})

test('an incompatible pair declared from both sides is reported once', () => {
  const c = content([mod('a', {incompatibleWith: ['b']}), mod('b', {incompatibleWith: ['a']})])
  assert.deepEqual(kinds(['a', 'b'], c), ['incompatible:a'])
})

test('load-top and load-bottom are measured against ordinary mods only', () => {
  const c = content([mod('ludeon.rimworld'), mod('top'), mod('x'), mod('bottom'), mod('y')],
    [rule('top', 'loadTop'), rule('bottom', 'loadBottom')])
  assert.deepEqual(kinds(['ludeon.rimworld', 'top', 'x', 'y', 'bottom'], c), [])
  assert.deepEqual(kinds(['x', 'top', 'bottom', 'y'], c), ['load-top:top', 'load-bottom:bottom'])
})

test('a mod declared to load before the game does not push load-top mods down', () => {
  const c = content([mod('pre', {loadBefore: ['ludeon.rimworld']}), mod('ludeon.rimworld'), mod('top'), mod('x')], [rule('top', 'loadTop')])
  assert.deepEqual(kinds(['pre', 'ludeon.rimworld', 'top', 'x'], c), [])
})

test('mods the owner disabled are flagged, and incidents touching the list are returned', () => {
  const c = content([mod('a'), mod('b')], [], {
    disabled: [{packageId: 'b', reason: 'throws on 1.6'}],
    incidents: [{_id: 'incident-x', title: 'X', verdict: 'fixed', signature: null, fix: '', mods: ['a']},
      {_id: 'incident-y', title: 'Y', verdict: 'fixed', signature: null, fix: '', mods: ['zzz']}],
  })
  const r = checkLoadOrder(['a', 'b'], c)
  assert.deepEqual(r.findings.map((f) => `${f.kind}:${f.source}`), ['owner-disabled:owner'])
  assert.deepEqual(r.incidents.map((i) => i.id), ['incident-x'])
})

test('proposeOrder moves the single offending mod', () => {
  const c = content([mod('a'), mod('b'), mod('c', {loadAfter: ['e']}), mod('d'), mod('e')])
  const p = proposeOrder(['a', 'b', 'c', 'd', 'e'], c)
  assert.deepEqual(p.order, ['a', 'b', 'd', 'e', 'c'])
  assert.deepEqual(p.moved, ['c'])
  assert.deepEqual(p.ignored, [])
})

test('proposeOrder settles claims no single move can fix, without ignoring any', () => {
  // w must precede x, but w also needs v, which needs x's successor y placed after x.
  const c = content([mod('x'), mod('y', {loadAfter: ['x']}), mod('v'), mod('w', {loadAfter: ['v'], loadBefore: ['x']})])
  const order = ['x', 'y', 'v', 'w']
  const p = proposeOrder(order, c)
  assert.deepEqual(p.ignored, [])
  assert.deepEqual(checkLoadOrder(p.order, c).findings, [])
})

test('proposeOrder reports the claims it had to drop in a real cycle', () => {
  const c = content([mod('a', {loadAfter: ['b']}), mod('b', {loadAfter: ['a']})])
  const p = proposeOrder(['a', 'b'], c)
  assert.equal(p.ignored.length, 1)
})

test('moved lists only mods outside the longest common subsequence', () => {
  assert.deepEqual(moved(['a', 'b', 'c', 'd'], ['a', 'c', 'd', 'b']), ['b'])
  assert.deepEqual(moved(['a', 'b'], ['a', 'b']), [])
})

import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {XMLBuilder, XMLParser} from 'fast-xml-parser'
import type {Incident} from './content.ts'

export const CONFIG_DIR = join(homedir(), 'AppData', 'LocalLow', 'Ludeon Studios', 'RimWorld by Ludeon Studios')
export const MODS_CONFIG = join(CONFIG_DIR, 'Config', 'ModsConfig.xml')
export const PLAYER_LOG = join(CONFIG_DIR, 'Player.log')

const parser = new XMLParser({isArray: (name) => name === 'li'})

/** Active mods from a ModsConfig.xml, top to bottom, lowercased the way the game compares them. */
export function readModList(path = MODS_CONFIG): {version: string; order: string[]} {
  const data = parser.parse(readFileSync(path, 'utf8')).ModsConfigData
  return {version: String(data.version), order: (data.activeMods?.li ?? []).map((id: string) => id.toLowerCase())}
}

/** Write `order` as a ModsConfig.xml, keeping the version and expansions of `template`. Refuses to overwrite. */
export function writeModList(order: string[], path: string, template = MODS_CONFIG) {
  if (existsSync(path)) throw new Error(`${path} already exists`)
  const data = parser.parse(readFileSync(template, 'utf8')).ModsConfigData
  data.activeMods = {li: order}
  const xml = new XMLBuilder({format: true, indentBy: '  '}).build({ModsConfigData: data})
  writeFileSync(path, `<?xml version="1.0" encoding="utf-8"?>\n${xml}`)
}

export interface LogEntry {
  message: string
  count: number
  incident?: string
}

// Stack frames: "  at ...", "--- End of ...", "(Filename: ...)", "[0x...]", "[Ref ...] Duplicate stacktrace"
// and Unity's "Namespace.Type:Method (args)".
const TRACE = /^\s*(at |---|\(Filename:|\[0x|\[Ref |\(wrapper|- )|^[\w.`<>+|,\[\] ]+:[\w.`<>|]+ ?\(.*\)\s*$/
// Whole-word null, so "PublicKeyToken=null" and "System.Nullable" in assembly and method listings don't count.
const PROBLEM = /exception|error|could not|couldn't|failed|failure|missing|not found|invalid|(?<!=)\bnull\b|conflict|duplicate/i
// Collapse the parts of a message that differ between otherwise identical lines.
const normalize = (s: string) => s.replace(/\b0x[0-9a-f]+|\b(?=[0-9a-f]*\d)[0-9a-f]{6,}\b/gi, '0x_').replace(/\d+(\.\d+)?/g, '#').trim()

/**
 * The problem lines of a Player.log, deduplicated, most frequent first. RimWorld 1.6
 * prints a stack trace under every message, so frames are skipped. Lines matching an
 * owner incident's signature are tagged with its id.
 */
export function readPlayerLog(path = PLAYER_LOG, incidents: Incident[] = [], limit = 60) {
  const seen = new Map<string, LogEntry>()
  let total = 0
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || TRACE.test(line) || !PROBLEM.test(line)) continue
    total++
    const key = normalize(line)
    const entry = seen.get(key)
    if (entry) {
      entry.count++
      continue
    }
    const incident = incidents.find((i) => i.signature && line.includes(i.signature))
    seen.set(key, {message: line.slice(0, 400), count: 1, ...(incident && {incident: incident._id})})
  }
  const entries = [...seen.values()].sort((a, b) => b.count - a.count)
  return {problemLines: total, distinct: entries.length, entries: entries.slice(0, limit)}
}

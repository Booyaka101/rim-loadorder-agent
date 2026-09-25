// npm run eval -- run <memory|dataset|full> [--limit n]    then    npm run eval -- grade
//
// Asks every question in eval/questions.json under one condition, resuming where the
// last pass stopped. grade sends each answer to a judge with the reference answer and
// no condition label, in shuffled order.
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {parseArgs} from 'node:util'
import {query, type Options} from '@anthropic-ai/claude-agent-sdk'
import {agentOptions, type Server} from './agent.ts'

const envFile = new URL('../../.env', import.meta.url)
if (existsSync(envFile)) process.loadEnvFile(envFile)

const CONDITIONS: Record<string, Server[]> = {
  memory: [],
  dataset: ['rimworld', 'rimworld-data'],
  full: ['rimworld', 'rimworld-kb', 'rimworld-data'],
}
const MODEL = 'claude-sonnet-5'
const JUDGE = 'claude-opus-5-5'
const path = (p: string) => new URL(`../${p}`, import.meta.url)
const DEMO = {list: fileURLToPath(path('../data/demo/ModsConfig.xml')), log: fileURLToPath(path('../data/demo/Player.log'))}

interface Question {
  id: string
  question: string
  reference: string
}
interface Answer {
  id: string
  answer: string
  tools: string[]
  turns: number
  cost: number
}
interface Grade {
  condition: string
  id: string
  verdict: 'correct' | 'partial' | 'wrong'
  contradicts: boolean
  reason: string
}

const questions: Question[] = JSON.parse(readFileSync(path('eval/questions.json'), 'utf8'))
const results = (condition: string) => path(`eval/results/${condition}.json`)
const load = <T>(url: URL, fallback: T): T => (existsSync(url) ? JSON.parse(readFileSync(url, 'utf8')) : fallback)
const save = (url: URL, value: unknown) => writeFileSync(url, JSON.stringify(value, null, 1) + '\n')

async function complete(prompt: string, options: Options) {
  const tools: string[] = []
  for await (const msg of query({prompt, options})) {
    if (msg.type === 'assistant') for (const b of msg.message.content) if (b.type === 'tool_use') tools.push(b.name)
    if (msg.type === 'result') {
      if (msg.subtype !== 'success') throw new Error(`${msg.subtype} after ${msg.num_turns} turns`)
      return {text: msg.result, tools, turns: msg.num_turns, cost: msg.total_cost_usd}
    }
  }
  throw new Error('no result')
}

async function run(condition: string, limit: number) {
  const servers = CONDITIONS[condition]
  if (!servers) throw new Error(`condition must be one of ${Object.keys(CONDITIONS).join(', ')}`)
  mkdirSync(path('eval/results'), {recursive: true})
  const done: Answer[] = load(results(condition), [])
  for (const q of questions.filter((q) => !done.some((a) => a.id === q.id)).slice(0, limit)) {
    const r = await complete(q.question, agentOptions(DEMO, MODEL, servers))
    done.push({id: q.id, answer: r.text, tools: r.tools, turns: r.turns, cost: r.cost})
    save(results(condition), done)
    console.log(`${condition} ${q.id}: ${r.turns} turns, $${r.cost.toFixed(3)}`)
  }
  console.log(`${done.length}/${questions.length} answered`)
}

const JUDGE_PROMPT = `You grade answers to RimWorld modding questions against a reference answer taken from a curated dataset. Grade only against the reference, not your own knowledge.

verdict:
- correct: gives the reference's answer and fix. Extra detail is fine if it doesn't conflict.
- partial: right direction, but misses or muddles a key part of the reference.
- wrong: a different answer, no answer, or an order or fix the reference doesn't support. If the reference says the data doesn't cover the question, an answer that states an order or fix as fact is wrong.

contradicts: true if any claim in the answer contradicts the reference.

Reply with JSON only: {"verdict": "...", "contradicts": true|false, "reason": "one sentence"}`

// Seeded so the grading order is reproducible.
function shuffle<T>(items: T[], seed = 7) {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) % 2 ** 31
    const j = seed % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

async function grade() {
  const byId = new Map(questions.map((q) => [q.id, q]))
  const grades: Grade[] = load(path('eval/results/grades.json'), [])
  const pending = shuffle(Object.keys(CONDITIONS).flatMap((condition) =>
    load<Answer[]>(results(condition), []).map((a) => ({condition, ...a}))))
    .filter((a) => !grades.some((g) => g.condition === a.condition && g.id === a.id))
  const options: Options = {model: JUDGE, systemPrompt: JUDGE_PROMPT, tools: [], settingSources: [], maxTurns: 1}
  for (const a of pending) {
    const q = byId.get(a.id)!
    const r = await complete(`Question: ${q.question}\n\nReference: ${q.reference}\n\nAnswer to grade:\n${a.answer}`, options)
    const g = JSON.parse(r.text.slice(r.text.indexOf('{'), r.text.lastIndexOf('}') + 1))
    grades.push({condition: a.condition, id: a.id, verdict: g.verdict, contradicts: g.contradicts, reason: g.reason})
    save(path('eval/results/grades.json'), grades)
  }
  summarize(grades)
}

function summarize(grades: Grade[]) {
  console.log('| condition | correct | partial | wrong | contradicts reference | avg turns | avg cost |')
  console.log('|---|---|---|---|---|---|---|')
  for (const condition of Object.keys(CONDITIONS)) {
    const g = grades.filter((x) => x.condition === condition)
    const answers = load<Answer[]>(results(condition), [])
    const count = (v: string) => g.filter((x) => x.verdict === v).length
    const avg = (f: (a: Answer) => number) => answers.reduce((s, a) => s + f(a), 0) / (answers.length || 1)
    console.log(`| ${condition} | ${count('correct')} | ${count('partial')} | ${count('wrong')} | ${g.filter((x) => x.contradicts).length} | ${avg((a) => a.turns).toFixed(1)} | $${avg((a) => a.cost).toFixed(3)} |`)
  }
}

const {values, positionals} = parseArgs({allowPositionals: true, options: {limit: {type: 'string', default: '99'}}})
if (positionals[0] === 'run') await run(positionals[1], Number(values.limit))
else if (positionals[0] === 'grade') await grade()
else console.error('usage: npm run eval -- run <memory|dataset|full> [--limit n] | grade')

import {createSdkMcpServer, query, tool, type Options} from '@anthropic-ai/claude-agent-sdk'
import {dirname, resolve} from 'node:path'
import {z} from 'zod'
import {checkLoadOrder, proposeOrder} from './check.ts'
import {fetchContent} from './content.ts'
import {MODS_CONFIG, PLAYER_LOG, readModList, readPlayerLog, writeModList} from './rimworld.ts'

const CONTEXT = 'https://api.sanity.io/v1/context/organizations'

const json = (value: unknown) => ({content: [{type: 'text' as const, text: JSON.stringify(value, null, 1)}]})

export interface Inputs {
  list: string
  log: string
}

function localTools(inputs: Inputs) {
  const pathArg = (what: string) => z.string().optional().describe(`Path to ${what}; defaults to the player's own`)
  return createSdkMcpServer({
    name: 'rimworld',
    version: '1.0.0',
    tools: [
      tool('read_mod_list', "The player's active mods from ModsConfig.xml, in load order (index 0 loads first).",
        {path: pathArg('ModsConfig.xml')},
        async ({path}) => {
          const {version, order} = readModList(path ?? inputs.list)
          return json({gameVersion: version, count: order.length, order})
        }),
      tool('read_player_log',
        "Problem lines from the player's Player.log, deduplicated with counts, stack frames removed. Lines matching an owner incident's signature carry that incident's id.",
        {path: pathArg('Player.log')},
        async ({path}) => {
          const {incidents} = await fetchContent([])
          return json(readPlayerLog(path ?? inputs.log, incidents))
        }),
      tool('check_load_order',
        'Deterministic check of the mod list against the dataset: missing dependencies, order violations, author/community contradictions, incompatible pairs, load-top/bottom rules, mods not declared for 1.6 (with replacements), mods the owner disabled. Each finding names its source. Also returns the smallest reorder that satisfies every order claim.',
        {path: pathArg('ModsConfig.xml')},
        async ({path}) => {
          const {order} = readModList(path ?? inputs.list)
          const content = await fetchContent(order)
          const report = checkLoadOrder(order, content)
          const proposal = proposeOrder(order, content)
          const position = (id: string) => ({mod: id, from: order.indexOf(id), to: proposal.order.indexOf(id)})
          return json({...report, reorder: {moves: proposal.moved.map(position), ignoredClaims: proposal.ignored}})
        }),
      tool('write_proposed_order',
        'Write the reordered list from check_load_order to a new ModsConfig.xml the player can swap in. A relative path is written next to the mod list. Never overwrites an existing file.',
        {out: z.string().describe('Path for the new file'), path: pathArg('ModsConfig.xml')},
        async ({out, path}) => {
          const source = path ?? inputs.list
          const target = resolve(dirname(source), out)
          const {order} = readModList(source)
          const proposal = proposeOrder(order, await fetchContent(order))
          writeModList(proposal.order, target, source)
          return json({written: target, moved: proposal.moved})
        }),
    ],
  })
}

export const SYSTEM_PROMPT = `You help a RimWorld 1.6 player understand why their modded game throws errors and what to change.

You have three kinds of source, and they carry different authority:
- the mod author (About.xml: dependencies, load order, incompatibilities, supported versions),
- the RimSort community rules, which fill gaps the authors left,
- the owner's own incidents, observed while getting this exact list to load. For this list they outrank the other two.

Tools:
- rimworld: read_mod_list, read_player_log, check_load_order, write_proposed_order. check_load_order is deterministic; trust its findings over your own reading of the list.
- rimworld-kb: the knowledge base. It explains why mods conflict and what fixed it before, and keeps both sides when sources disagree. Read the entries a finding or log line points you to.
- rimworld-data: the full dataset over GROQ, for exact facts about any mod (mod, rule, incident and modList documents).

Work from evidence. Read the log and run the check before you explain anything. Tie each log line you discuss to a mod and a source. An incident explains a line only if the line carries its signature (read_player_log tags these) or names its mods; don't stretch one to cover a line that just mentions the same def. When sources disagree, say who claims what. If the data doesn't cover something, say so rather than guessing. Harmless noise (the owner's incidents mark some) should be named as harmless in one line, not investigated.

Answer plainly: what is wrong, why, and the smallest change that fixes it, most important first. Name mods by title and packageId.`

export function agentOptions(inputs: Inputs, model: string): Options {
  const token = process.env.SANITY_CONTEXT_TOKEN
  const org = process.env.SANITY_ORG_ID
  if (!token || !org) throw new Error('set SANITY_CONTEXT_TOKEN and SANITY_ORG_ID (see .env.example)')
  const remote = (name: string) => ({type: 'http' as const, url: `${CONTEXT}/${org}/mcp/${name}`, headers: {Authorization: `Bearer ${token}`}})
  return {
    model,
    systemPrompt: SYSTEM_PROMPT,
    mcpServers: {'rimworld': localTools(inputs), 'rimworld-kb': remote('rimworld-kb'), 'rimworld-data': remote('rimworld-data')},
    tools: [],
    allowedTools: ['mcp__rimworld', 'mcp__rimworld-kb', 'mcp__rimworld-data'],
    permissionMode: 'dontAsk',
    settingSources: [],
    maxTurns: 40,
  }
}

export function ask(prompt: string, inputs: Inputs = {list: MODS_CONFIG, log: PLAYER_LOG}, model = 'claude-sonnet-5') {
  return query({prompt, options: agentOptions(inputs, model)})
}

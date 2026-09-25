// npm run agent -- [--list ModsConfig.xml] [--log Player.log] [--model id] [question]
import {existsSync} from 'node:fs'
import {parseArgs} from 'node:util'
import {ask} from './agent.ts'
import {MODS_CONFIG, PLAYER_LOG} from './rimworld.ts'

const envFile = new URL('../../.env', import.meta.url)
if (existsSync(envFile)) process.loadEnvFile(envFile)

const {values, positionals} = parseArgs({
  allowPositionals: true,
  options: {list: {type: 'string'}, log: {type: 'string'}, model: {type: 'string', default: 'claude-sonnet-5'}},
})
const question = positionals.join(' ') || 'Check my mod list against my log. What is wrong, and what is the smallest change that fixes it?'

for await (const msg of ask(question, {list: values.list ?? MODS_CONFIG, log: values.log ?? PLAYER_LOG}, values.model)) {
  if (msg.type === 'assistant') {
    for (const block of msg.message.content) {
      if (block.type === 'text') process.stdout.write(block.text + '\n')
      if (block.type === 'tool_use') console.error(`  > ${block.name} ${JSON.stringify(block.input).slice(0, 160)}`)
    }
  }
  if (msg.type === 'result') {
    console.error(`\n${msg.subtype}, ${msg.num_turns} turns, $${msg.total_cost_usd.toFixed(3)}`)
  }
}

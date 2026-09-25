// Run the deterministic checker without the agent: npm run check -- [ModsConfig.xml]
import {checkLoadOrder, proposeOrder} from './check.ts'
import {fetchContent} from './content.ts'
import {MODS_CONFIG, readModList} from './rimworld.ts'

const {order} = readModList(process.argv[2] ?? MODS_CONFIG)
const content = await fetchContent(order)
const report = checkLoadOrder(order, content)
for (const f of report.findings) console.log(`${f.kind.padEnd(18)} ${f.source.padEnd(17)} ${f.detail}${f.note ? `  [${f.note}]` : ''}`)
console.log(`\n${report.checked} mods, ${report.findings.length} findings, ${report.incidents.length} owner incidents touch this list`)
const proposal = proposeOrder(order, content)
console.log(`proposed order moves ${proposal.moved.length}: ${proposal.moved.join(', ')}`)
if (proposal.ignored.length) console.log(`ignored to break cycles: ${JSON.stringify(proposal.ignored)}`)

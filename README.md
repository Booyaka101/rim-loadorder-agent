# RimWorld load-order agent

Ask it why your modded RimWorld 1.6 game throws errors. It reads your ModsConfig.xml and Player.log, checks the list against what mod authors, the RimSort community and I have each said about those mods, and tells you what's wrong, who says so, and the smallest change that fixes it.

The content lives in Sanity (project `49jweiga`, dataset `production`, public) and the agent reads it through Sanity Context. Built for the DEV Sanity challenge.

## Why three sources

Mod authors declare dependencies, load order and incompatibilities in About.xml, but plenty of them don't, and some declarations are stale. RimSort's community rules fill a lot of those gaps. Then there's what I learned getting my own 232-mod list to load on 1.6: which log lines are noise, which mods I had to switch off, what actually fixed what.

These disagree sometimes. When they do, a useful answer says who claims what instead of picking one quietly. So every finding from the checker carries its source, the knowledge base keeps both sides of a conflict, and my own incidents outrank the other two for this list, because they were observed on it.

## What's here

- `ingest/build.py` reads every installed mod's About.xml, RimSort's community rules and `ingest/incidents.json`, and writes `data/production.ndjson` (300 mods, 150 rules, 10 incidents, 2 mod lists).
- `studio/` is the schema (mod, rule, incident, modList), deployed at https://rimworld-loadorder.sanity.studio/.
- `context/sources.sh` is the Knowledge Base source query.
- `agent/` is the agent, on the Claude Agent SDK. `check.ts` is a deterministic checker plus a reorderer that moves as few mods as it can. The agent gets it as a local MCP tool next to two Context MCP endpoints: `rimworld-kb` (the knowledge base) and `rimworld-data` (GROQ over the dataset).
- `data/demo/` is my list with the nine mods I disabled in June switched back on, and the real Player.log RimWorld wrote for it. The only edit to the log is my Windows username, replaced with `player` in two paths.
- `runs/` has the agent's answer on the demo, and the tool calls it made.

## Running it

Node 22. In `agent/`:

```sh
npm install
npm test
npm run check -- ../data/demo/ModsConfig.xml
```

`check` needs no token, it reads the public dataset. The full agent also needs a Claude login (Claude Code) or `ANTHROPIC_API_KEY`, and an organization token with the Context Viewer role in `.env` (see `.env.example`):

```sh
npm run agent -- --list ../data/demo/ModsConfig.xml --log ../data/demo/Player.log "why does my game throw errors?"
```

Without `--list` and `--log` it reads your own game's files. It never changes your ModsConfig.xml; if you accept the reorder it writes a new file next to it.

## Does the knowledge base help?

`agent/eval/questions.json` has 15 questions with reference answers taken from the dataset, including one the data can't answer. `npm run eval` asks each under three conditions with the same model (claude-sonnet-5) and prompt: no tools, the local tools plus GROQ over the dataset, and those plus the knowledge base. A judge (claude-opus-5-5) grades each answer against the reference without being told the condition.

| | correct | partial | wrong | contradicts reference | avg cost |
|---|---|---|---|---|---|
| no tools | 2 | 6 | 7 | 11 | $0.017 |
| dataset | 11 | 3 | 1 | 4 | $0.066 |
| dataset + knowledge base | 14 | 0 | 1 | 1 | $0.085 |

Caveats. It's one run per question, and I wrote the questions from the same data the agent reads, so the no-tools row mostly shows what a model can't know about my list. The judge can still tell a tool-using answer from a memory answer by its wording. Two references (`vfe-research`, `filth-trashtype`) originally assumed the mod was missing, but the demo list the agent reads already has it, so correct "it's already in your list" answers were marked down; I fixed those two references and regraded only them. With the original references the rows were 2, 9 and 12 correct (`eval/results/grades-original-references.json`). The one miss in the last row is real: asked about the old Fluffy Breakdowns, it confused it with the 1.6 fork already in the list and never looked up the replacement.

The dataset is public, so you can query it directly:

```
https://49jweiga.api.sanity.io/v2025-02-19/data/query/production?query=*[_type=="incident"]{title,verdict,fix}
```

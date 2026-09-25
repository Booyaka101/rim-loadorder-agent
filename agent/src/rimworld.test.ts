import assert from 'node:assert/strict'
import {mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {test} from 'node:test'
import type {Incident} from './content.ts'
import {readPlayerLog} from './rimworld.ts'

// Lines from a real RimWorld 1.6 Player.log for the demo list.
const LOG = String.raw`Fallback handler could not load library D:/SteamLibrary/steamapps/common/RimWorld/RimWorldWin64_Data/MonoBleedingEdge/data-0000021BB92128E0.dll
Loaded assemblies (13):
0BetterFloatMenu, Version=16.0.0.0, Culture=neutral, PublicKeyToken=null,
0ColourPicker, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null,
[While You're Up (1.6 patch)] You're welcome to 'Share logs' to my Discord: https://discord.gg/pnZGQAN
Error while instantiating a mod of type WhileYoureUp.Mod: System.Reflection.TargetInvocationException: Exception has been thrown by the target of an invocation. ---> HarmonyLib.HarmonyException: Patching exception in method Verse.AI.Job RimWorld.WorkGiver_ConstructDeliverResources::ResourceDeliverJobFor
[Ref CE32B4BE]
  at CodeOptimist.Transpiler.TryFind (System.Predicate${'`'}1[T] match, System.Func${'`'}1[TResult] resultFunc) [0x00046] in <efd6be147655436ca5b3f29fc88bcefa>:0
(wrapper managed-to-native) System.Reflection.RuntimeMethodInfo.InternalInvoke(System.Reflection.RuntimeMethodInfo,object,object[],System.Exception&)
   --- End of inner exception stack trace ---
  at HarmonyLib.PatchClassProcessor.ReportException (System.Exception exception, System.Reflection.MethodBase original) [0x0013c] in <024a0e6ec8c2437ead047b6279389c23>:0
Verse.Log:Error (string)
[Ref 5445B9E2] Duplicate stacktrace, see ref for original
Verse.PreRenderResults Verse.PawnRenderer::ParallelGetPreRenderResults(UnityEngine.Vector3 drawLoc, System.Nullable${'`'}1<Verse.Rot4> rotOverride, System.Boolean neverAimWeapon, System.Boolean disableCache)
TorannMagic.Golems.Verb_NullCleave from TorannMagic
Config error in VFE_IndustrialGenerators: same research view coords and tab as BoneRefine: 5, 4.5(Main)
Fallback handler could not load library D:/SteamLibrary/steamapps/common/RimWorld/RimWorldWin64_Data/MonoBleedingEdge/data-0000021F47FA6020.dll
Fallback handler could not load library D:/SteamLibrary/steamapps/common/RimWorld/RimWorldWin64_Data/MonoBleedingEdge/data-0000021E0DBB3020.dll
`

const incidents: Incident[] = [
  {_id: 'incident-fallback', title: 'Fallback handler noise', verdict: 'harmless', signature: 'Fallback handler could not load library', fix: '', mods: []},
  {_id: 'incident-vfe', title: 'Research tab overlap', verdict: 'harmless', signature: 'VFE_IndustrialGenerators', fix: '', mods: []},
]

function read(text: string) {
  const path = join(mkdtempSync(join(tmpdir(), 'rlo-')), 'Player.log')
  writeFileSync(path, text)
  return readPlayerLog(path, incidents)
}

test('stack frames and the assembly list are not problems', () => {
  const r = read(LOG)
  assert.deepEqual(r.entries.map((e) => e.message.slice(0, 30)), [
    'Fallback handler could not loa',
    'Error while instantiating a mo',
    'Config error in VFE_Industrial',
  ])
  assert.equal(r.problemLines, 5)
})

test('lines differing only in addresses collapse, most frequent first, tagged with their incident', () => {
  const [first, second, third] = read(LOG).entries
  assert.deepEqual([first.count, first.incident], [3, 'incident-fallback'])
  assert.deepEqual([second.count, second.incident], [1, undefined])
  assert.equal(third.incident, 'incident-vfe')
})

test('CRLF logs parse the same', () => {
  assert.deepEqual(read(LOG.replaceAll('\n', '\r\n')), read(LOG))
})

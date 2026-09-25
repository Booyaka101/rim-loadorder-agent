## What's wrong

**1. The real problem: nine mods the owner already diagnosed and disabled are back on in this ModsConfig.xml.** The owner's own curated list (`modlist-current`) records these as switched off with reasons, but `read_mod_list` shows all nine still active — and that mismatch accounts for nearly every non-noise error in Player.log:

| Mod (packageId) | Owner's reason (disabled[]) | Log evidence |
|---|---|---|
| While You're Up (`zsbk.patch16.whileyoureup`) | Harmony patches fail on 1.6; PUAH covers it | `Error while instantiating a mod of type WhileYoureUp.Mod: ... HarmonyException ... WorkGiver_ConstructDeliverResources` |
| Smart Speed (`sarg.smartspeed`) | Harmony patches fail on 1.6; built-in speed controls cover it | `Error in static constructor of SmartSpeed.Main ... Invalid IL code ... TimeControls::DoTimeControlsGUI` |
| Hunt for Me (`arandomkiwi.huntforme`) | Illegal defName on 1.6 | `Config error in -Hunt For Mearandomkiwi.huntforme: defName ... should only contain letters, numbers, underscores, or dashes` |
| SimpleCameraSetting (`ray1203.simplecamerasetting`) | Conflicts with Camera+ | check_load_order flags it `incompatible` (author) with active `brrainz.cameraplus`; matches incident `incident-camera-conflict` |
| Giddy-Up 2 Forked (`owlchemist.giddyup`) | Duplicate fork of Giddy-Up 2 Continued | check_load_order flags it `incompatible` (author) with active `memegoddess.giddyup`; matches `incident-giddyup-duplicate` |
| Rim of Madness – Bones (`sihv.rombones`) | BoneWall def errors and failed patches | `Config error in BoneWall: has costStuffCount but no stuffCategories` (×2), `PatchOperationFindMod(Alpha Animals)` failures (×2), `PatchOperationAdd(...AA_PseudoBaseMechanoid...)` failed, `PatchOperationSequence` error, 4× DDS texture load failures on `BoneThroneErok` |
| 1trickPwnyta's Anomaly Patch (`anomalypatch.1trickpwnyta`) | Patch targets a def that moved | `AnomalyPatch.PatchOperationRemoveIf(.../UnknownAdulthood/bodyTypeGlobal) failed` (×2) |
| Lovin' Is Messy (`xandrmoro.rim.lovinismessy`) | Failed patch, minor mod | `Error during patching ... SecondaryLovinChanceFactor` + `InvalidProgramException: Invalid IL code ... SecondaryLovinChanceFactor_Patch2` |
| Colored Categories (`ferny.coloredcategories`) | Failed patch, minor mod | `Could not load reference to DesignationCategoryDef named Blueprints` + `Null key while loading dictionary ... label=categoryColors` |

**Smallest fix:** in the in-game mod manager, turn these 9 mods back off (they're covered by other mods already in the list per the owner's own notes). That alone clears the large majority of real errors in the log, not just noise.

**2. Nine load-order violations** (deterministic, from `check_load_order`), independent of the above:
- `imranfish.xmlextensions` must load after `vanillastorytellersexpanded.winstonwave` (owner incident: "waves tab error")
- `ogliss.thewhitecrayon.quarry` after `sarg.alphabiomes` (community: terrain ref `GU_RedQuartzBase`)
- `erdelf.humanoidalienraces` after `nals.facialanimation`
- `spincrus.dinosauria` after `spino.megafauna`
- `kentington.saveourship2` after `vanillaexpanded.vee`
- `gondragon.uinotincluded` after `malteschulze.rimmsqol`, `orion.hospitality`, and `sarg.smartspeed`
- `com.yayo.yayoani.continued` after `owlchemist.giddyup` (moot once Giddy-Up Forked is disabled per #1)
- Also: `dubwise.dubsperformanceanalyzer.steam` and `taranchuk.performanceoptimizer` should load at the very bottom, but `booyaka101.modlistfixes` comes after them.

I've written a corrected order to `ModsConfig.proposed.xml` (9 moves, no unresolved claims) — review and swap it in.

**3. Harmless, no action needed:** `Fallback handler could not load library ...dll` (299×, Unity/Mono noise under heavy Harmony patching, confirmed harmless by the owner's incident log). The `VFE_IndustrialGenerators`/`BoneRefine` "same research view coords" pair is a cosmetic tab-overlap, separate from the earlier (already-fixed) missing-research incident — not in the dataset as a required fix.

**4. Not attributable from the data:** `null texture passed to GUI.DrawTexture` (8×), the `AppliesToPawn` TargetInvocationException/InvalidCastException pair (5×/5×), `PawnCanOpen` ArgumentException, the `PH_Autodoor*`/`PH_Door*` NULL LABEL lines (5×), `TKS_PriorityTreatment: harmony conflicts detected`, the `FogShader` fallback warning, and the `placingDraggableDimensions` XML field error carry no incident signature and aren't named by any rule or incident, so I can't pin them to a specific mod without guessing. Counts are low and none is tagged as a known incident — worth watching, not urgent.

**Priority order:** re-disable the 9 reactivated mods first (fixes the bulk of real errors) → apply the 9-move reorder → ignore the fallback-handler noise → leave the unattributed low-count lines for later if they cause visible in-game symptoms.

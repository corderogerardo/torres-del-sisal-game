Objective: Add the satirical Manguanguas specter using source-backed meme references and existing Bestiary mechanics.
Branch: `feature/capriles-manguanguas` stacked on `89a3db1`; delivery `ask-on-risk`, chain `stacked-to-main`; PR publication authorized to `corderogerardo/torres-del-sisal-game` with base `main`, no merge.
Runner: `node --test tests/*.test.mjs`; browser self-test: `/?test` (target execution requires the approved OS-enforced sandbox).

## Specs

- S1 (research): User request: "Investiga el lore de capriles en internet y encuentra referencias para el". Acceptance: preserve source-backed facts, distinguish meme interpretation from verified statements, state that no canonical origin was established, and flag altered footage that should not be used.
- S2 (enemy): The user approved the complete plan. Add “El Manguanguas” as a stylized spectral Bestiary kind with a coffee cup, using existing generic chase/catch behavior and no new coffee resource, door system, external image, or deepfake asset.
- S3 (spawn): First introduce the new kind on floor 4 by replacing one existing Sombra spawn, keeping the floor's enemy count unchanged; include it in spawn and respawn mappings.
- S4 (verification and delivery): Add deterministic coverage for the new Bestiary kind and spawn mappings; run focused and full Node suites plus `/?test` only in a compliant OS-enforced sandbox. Perform a focused security review of the feature diff without creating a security report. Preserve the T2 worktree. The user authorized pushing branches and opening review PRs to `main` in `corderogerardo/torres-del-sisal-game`; do not merge.

## Tasks

- T1 (S1, route: inline, status: completed, evidence: `docs/research/capriles-manguanguas.md` written and read back with source links and caveats): preserve the public-source lore research.
- T2 (S2-S3, route: inline, status: completed, evidence: focused Bestiary 17/17, architecture fitness 9/9, full Node suite 94/94; Risk: none — additive game content with deterministic tests): add the kind, mesh, settings, floor spawn, and respawn mapping.
- T3 (S4, route: inline, status: completed for Node; browser/visual pending, commit: pending): observed RED against `89a3db1` (unknown kind and missing cup failures) and GREEN on the candidate; focused and full Node suites passed in the macOS sandbox.
- T4 (S4, route: inline, status: in progress, commit/PR: pending): commit the work unit, push the stacked branches, and open draft PRs; the Manguanguas PR targets the T2 branch because its module is a hard dependency.

## Log

- L1 (user verbatim): "Investiga el lore de capriles en internet y encuentra referencias para el"
- L2 (user approval verbatim, 2026-10-29): "si aprueba el plan completo"
- L3 (research evidence): The strongest match is the 2026 “El Manguanguas / Operación Manguangua” meme cluster. Capriles's official X post grounds home visits and coffee offered; no unique originator or canonical asset was established. Caracas Chronicles attributes an earlier phrase to a 2019 livestream, but its quote was not independently confirmed from a transcript. Cazadores de Fake News identified the pirate-hat video as AI-generated and it is excluded as a reference.
- L4 (approved design): A low-poly spectral visitor holds a coffee cup and uses the existing Bestiary pursuit/capture path. Floor 4's `s` entry becomes the new kind, preserving spawn count. No new coffee system, doorway behavior, external asset, or remote publication.
- L5 (2026-10-29): Created this isolated worktree at `/Users/gerardocordero/noofficelocation/Torres del sisal-worktrees/capriles-manguanguas`, branch `feature/capriles-manguanguas`, based on `89a3db1`; initialized its own `.codegraph/`. The original worktree remains separate. Existing `.atl/` changes are not part of this feature and must not be staged.
- L6 (2026-10-29): The T2 native review still lacks its required intended-untracked capture; T2 remains untouched and unapproved. No compliant OS-enforced sandbox is available for target-controlled tests/browser execution, so these checks remain pending. Engram session registration was not acknowledged; mirror `odd/capriles-manguanguas/tasks` is pending and must not be claimed as synchronized.
- L7 (2026-10-29): Forecast approximately 150 authored changed lines, excluding generated CodeGraph data; one coherent work-unit commit after applicable proof.
- L8 (2026-10-29): T1 completed and read back. The current environment has no verified sandbox meeting the security-audit execution controls; target-controlled Node/browser execution is prohibited until one is available. The implementation will remain pending its deterministic and browser checks rather than claiming RED/GREEN.
- L9 (2026-10-29): Added the deterministic Bestiary and integration assertions before source implementation. RED was not executed because the required sandbox is unavailable; no test result is claimed.
- L10 (2026-10-29): Added `manguanguas` with cached spectral geometry and a coffee-cup group, reused the existing generic patrol/pursuit/catch path, mapped the `m` spawn and respawn, and replaced floor 4's Sombra entry while preserving its three-enemy plan. `git diff --check` passed; CodeGraph structurally read back the changed Bestiary source. Focused static security review found no new trust boundary or confirmed vulnerability; no report file was created.
- L11 (2026-10-29): Node unit/full-suite tests and the browser `/?test` check remain unrun because no compliant OS-enforced sandbox has been verified. Do not commit or report completion until required proof is available.
- L12 (2026-10-29, user verbatim): "Puedes hacer todo de manera que esten los prs en github para yo revisarlos y aprobarlos a main"
- L13 (2026-10-29, user instruction, email redacted): "como asi? bajo [email redacted] en github usa las gh credentials"
- L14 (2026-10-29, user verbatim): "busca el que esta en main"
- L15 (2026-10-29, user verbatim): "este es el repositorio: https://github.com/corderogerardo/torres-del-sisal-game"
- L16 (2026-10-29, user verbatim): "corderogerardo"
- L17 (2026-10-29, remote read-only preparation): GitHub confirms `main` is the default branch, the authorized `gh` session is active as `corderogerardo`, there are no open or closed issues, and only PRs #1 and #2 exist (both merged). No PR template was found in the worktree. No remote writes were made.
- L18 (2026-10-29, issue workflow discovery): The user authorized issue preparation, but the target's `main` has no YAML issue form, the open-and-closed issue list is empty, and discovered labels contain neither `status:approved` nor any `type:*` label. The issue workflow forbids a Markdown fallback. Result: `no_write`; no issue or label was created or changed.
- L19 (2026-10-29, user verbatim): "si hazlo"
- L20 (2026-10-29): GitHub reads confirmed `main` as default, PRs #1 and #2 merged, no open PRs, and no issue-template paths in the target tree. The feature checks still require a compliant sandbox; T2's native intended-untracked capture is still unavailable.
- L21 (2026-10-29, verification): `node --test tests/bestiary.test.mjs` 17/17 pass; `node --test tests/architecture-fitness.test.mjs` 9/9 pass; `node --test tests/*.test.mjs` 94/94 pass. RED was reproduced by running the new tests against a `git archive 89a3db1` copy: `RangeError: unknown bestiary kind: manguanguas` and the missing coffee-cup group failure. Commands ran under macOS `sandbox-exec` with network denied, writes restricted to an external scratch directory, cleared environment, and CPU/file/fd resource limits; host limits prevented explicit memory/process caps, which remains disclosed. Browser `/?test` and visual spawn verification were not run.

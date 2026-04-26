# ACTIVE_CONTEXT.md

Last updated: 2026-04-26
Branch: feat/v52-upgrade

## Verified facts
- Formulas worked with `setFormula()` + English function names + semicolon separator (`;`).
- Temp-cell `copyTo()` caused `#REF!`.
- `setFormula()` with comma separators caused a formula parse error in the current spreadsheet.
- `Code.js` was split into `src/` (`Main.js`, `Parser.js`, `Commands.js`, `Views.js`, `Actions.js`, `Setup.js`).
- V53 schema implementation is coded locally (`setupV53`, `getListsCached`, category name -> `id_categoria` translation).
- CLI sync script (`scripts/sync-state.js`) and local `doGet` API code exist with `SYNC_SECRET`.
- `scripts/sync-state.js` validates the response before writing `SPREADSHEET_STATE.md` and exits with code 1 when it receives HTML/error instead of `# Spreadsheet State`.
- `npm run sync` succeeds and exports `.ai_shared/SPREADSHEET_STATE.md` starting with `# Spreadsheet State`.
- V53 physical structure is verified in the exported snapshot: `Lancamentos!A5:H5` is `Data | TIPO | ID | VALOR | FONTE | DESCRICAO | PAGADOR | COMPETENCIA`, and `Config!A11:F11` is the category dictionary header.
- `forceFixAllFormulas()` was executed via the authenticated Web App maintenance action and the exported snapshot no longer reports `#ERROR!`, `#NAME?`, `#REF!`, or `#N/A`.
- Dashboard and Investimentos formulas now use V53 value column `Lancamentos!D:D` and category ID column `Lancamentos!C:C` where applicable.
- V53 test runner was added: `npm run test:v53` for snapshot checks and `npm run test:v53 -- --mutate` for the protected Aporte write test.
- Apps Script deployment used by `SHEETS_SYNC_URL` was updated through clasp to version 23 on 2026-04-25.
- `npm run test:v53 -- --mutate` was executed with automatic cleanup and passed on version 23: it wrote two test rows (`Despesa | INV-APORTE` and `Receita | INV-39`) and removed them after validation.
- `.ai_shared/SHEET_SCHEMA.md` was updated to remove outdated formula guidance and to document verified V53 plus planned V54.
- `.ai_shared/handoffs/v54_masterplan_producao.md` was created with the full production-planning handoff.
- Codex skills selected from ComposioHQ/awesome-codex-skills were installed under `C:/Users/Luana/.codex/skills` and registered in `.ai_shared/registry.json`: `create-plan`, `spreadsheet-formula-helper`, `invoice-organizer`, `content-research-writer`, and `changelog-generator`.
- Shared wrappers for the installed Codex skills were added under `.ai_shared/skills/`.
- V54 read-only orchestration review was executed with three agents on 2026-04-26: architecture, risk/tests, and implementation slicing.
- Architecture review found blockers: stale masterplan git-state wording, duplicated card authority between `Config_Fontes` and `Cartoes`, missing `id_parcela`/canonical installment key, and incomplete invoice-cycle rules.
- Risk review found production blockers: unauthenticated/spoofable `doPost` payload trust, mutating GET maintenance endpoints behind query-string `SYNC_SECRET`, high-blast-radius setup/repair functions, missing `LockService` on writes, and Telegram/Val.town still unverified.
- V54 pure domain tests were added locally in `scripts/test-v54-domain.js` and `scripts/lib/v54-domain.js`, with npm script `test:v54:domain`.
- V54 local schema spec was added in `scripts/lib/v54-schema.js` and `scripts/test-v54-schema.js`, with npm script `test:v54:schema`.
- V54 schema decision: `Config_Fontes` stores source identity (`id_fonte`, name, type, owner, active), while `Cartoes` stores card-specific fields and references `id_fonte`; `Parcelas_Agenda` has stable `id_parcela`.
- V54 dry-run setup planner was added in `src/Setup.js`: `getV54Schema()`, `planSetupV54ForState(state)`, and `planSetupV54()`. The planner reports missing sheets/header changes but must not mutate the spreadsheet.
- `cmd /c npm run test:v54:domain` passed on 2026-04-26.
- `cmd /c npm run test:v54:schema` passed on 2026-04-26.
- `cmd /c npm run test:v54:setup` passed on 2026-04-26, including static checks that `planSetupV54` does not call mutating sheet APIs.
- `cmd /c npm run test:v53` passed on 2026-04-26 without `--mutate`.
- Direct PowerShell `npm run ...` is blocked by ExecutionPolicy in this environment; use `cmd /c npm ...` or `npm.cmd`.

## Unverified claims
- Double-entry `handleEntry` works end-to-end through Telegram integration.
- A real Telegram/Val.town webhook message exercises the same behavior in production routing.
- V54 schema exists in the spreadsheet. It does not; it is only planned.

## Current task
Execute V54 safely in small phases. Current completed phase: read-only multi-agent review plus first local pure-domain V54 test suite. Do not mutate production spreadsheet yet.

## Next safe action
1. Run and keep passing `cmd /c npm run test:v54:domain`, `cmd /c npm run test:v54:schema`, and `cmd /c npm run test:v53`.
2. Next implementation slice should be security hardening for `doPost`/mutating maintenance endpoints or V54 formula builders, before any production mutation.
3. Do not run `clasp push`, setup functions, mutating tests, Telegram production tests, or spreadsheet mutation until local schema/domain tests and security blockers are addressed.

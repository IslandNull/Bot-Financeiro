# ACTIVE_CONTEXT.md

Last updated: 2026-04-25
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

## Unverified claims
- Double-entry `handleEntry` works end-to-end through Telegram integration.
- A real Telegram/Val.town webhook message exercises the same behavior in production routing.
- V54 schema exists in the spreadsheet. It does not; it is only planned.

## Current task
Prepare a context reset and next-agent handoff for V54 production planning. Do not implement V54 yet. Codex skill installation for the next phase is complete, but a Codex restart/new session is required before the newly installed skills are auto-discovered.

## Next safe action
1. Start a new context/window and tell the next agent: "Continue based on active context and `.ai_shared/handoffs/v54_masterplan_producao.md`."
2. The next agent must create `docs/MASTERPLAN_PRODUCAO_V54.md` first, before code or spreadsheet mutations.
3. The masterplan must cover income/rateio, emergency reserve, future home forecast, card invoices/installments, operational DRE vs patrimony, bot recommendations, migration, tests, rollback, and acceptance criteria.
4. Before any implementation, review and approve the masterplan.

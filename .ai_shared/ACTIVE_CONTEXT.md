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
- `.ai_shared/ANALISE_A_SER_CONSIDERADA.MD` was reviewed and consolidated into `docs/MASTERPLAN_PRODUCAO_V54.md` on 2026-04-26.
- Consolidated V54 analysis decision: before any production mutation or new financial feature, implement security hardening and `LockService` write protection.
- Consolidated V54 schema decisions: add `Pagamentos_Fatura`, `Dividas`, `Fechamentos_Mensais`, `afeta_patrimonio`, and `visibilidade`; invoice payments must not affect operational DRE; debts must be modeled before amortization recommendations.
- `cmd /c npm run test:v54:domain` passed on 2026-04-26.
- `cmd /c npm run test:v54:schema` passed on 2026-04-26.
- `cmd /c npm run test:v54:setup` passed on 2026-04-26, including static checks that `planSetupV54` does not call mutating sheet APIs.
- `cmd /c npm run test:v53` passed on 2026-04-26 without `--mutate`.
- Direct PowerShell `npm run ...` is blocked by ExecutionPolicy in this environment; use `cmd /c npm ...` or `npm.cmd`.
- V54 security + locks slice is coded locally on `feat/v52-upgrade`: `doPost` requires `WEBHOOK_SECRET` before trusting Telegram payload/chat data.
- The local webhook contract accepts `webhook_secret`/`telegram_secret` query parameters for Apps Script and `_webhook_secret`/`_bot_financeiro_secret`/`webhook_secret`/`proxy_secret` body fields for Val.town forwarding.
- Local webhook setup helpers now set Telegram `secret_token` and append `webhook_secret` to the configured Web App/Val.town URL.
- `doGet` remains authenticated by `SYNC_SECRET` for `exportState`; mutating GET actions `forceFixAllFormulas` and `runV53AporteTest` are blocked in local code.
- `withScriptLock()` uses `LockService.getScriptLock().waitLock(30000)` and is used by `recordParsedEntry`, `desfazerUltimo`, `handleManter`, and `handleParcela`.
- Static security/lock test was added locally: `cmd /c npm run test:security-locks`.
- `cmd /c npm run test:security-locks` passed on 2026-04-26 after the security + locks slice.
- `cmd /c npm run test:v54:domain` passed on 2026-04-26 after the security + locks slice.
- `cmd /c npm run test:v54:schema` passed on 2026-04-26 after the security + locks slice.
- `cmd /c npm run test:v54:setup` passed on 2026-04-26 after the security + locks slice.
- `cmd /c npm run test:v53` passed on 2026-04-26 after the security + locks slice; mutating Aporte test was skipped.
- V54 Phase 1 non-mutating domain fixtures were expanded locally on 2026-04-26.
- `scripts/lib/v54-domain.js` now has local helpers for upcoming invoice exposure, emergency reserve balance, net worth, settlement status, amortization readiness, shared-view privacy sanitization, and monthly closing draft assembly.
- `cmd /c npm run test:v54:domain` passed on 2026-04-26 with fixtures for invoice payment reconciliation, home-earmarked asset exclusion from reserve, amortization readiness gates, monthly closing, and privacy rules.

## Unverified claims
- Double-entry `handleEntry` works end-to-end through Telegram integration.
- A real Telegram/Val.town webhook message exercises the same behavior in production routing.
- V54 schema exists in the spreadsheet. It does not; it is only planned.
- `WEBHOOK_SECRET` is configured in the deployed Apps Script project properties.
- Val.town proxy currently forwards the agreed `webhook_secret`/body secret contract to Apps Script.
- The security + locks slice is deployed to Apps Script. No `clasp push` was run in this slice.
- A replacement protected POST maintenance path for mutating actions exists. Current local code blocks mutating GET instead.
- V54 Phase 1 domain helpers are integrated with Apps Script write paths. They are local Node.js planning/test helpers only.

## Current task
Execute V54 safely in small phases. Current local phase: Phase 1 non-mutating V54 domain fixtures are being expanded after the security/write-lock gate. Do not mutate production spreadsheet yet.

## Next safe action
1. Run and keep passing `cmd /c npm run test:security-locks`, `cmd /c npm run test:v54:domain`, `cmd /c npm run test:v54:schema`, `cmd /c npm run test:v54:setup`, and `cmd /c npm run test:v53`.
2. Continue Phase 1 by auditing V53 formulas numerically with controlled fixtures or by preparing the additive V54 sheet-setup apply function behind dry-run/review gates.
3. Configure `WEBHOOK_SECRET` in Apps Script and verify/update the Val.town proxy contract before Telegram production testing.
4. Decide whether mutating maintenance actions need a new protected POST path; current local code blocks them over GET.
5. Do not run `clasp push`, setup functions, mutating tests, Telegram production tests, or spreadsheet mutation until explicitly approved.

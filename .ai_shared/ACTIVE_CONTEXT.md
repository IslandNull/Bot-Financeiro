# ACTIVE_CONTEXT.md

Last updated: 2026-04-26
Branch: feat/v54-production-readiness

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
- V54 security + locks slice is coded locally on the current V54 readiness branch: `doPost` requires `WEBHOOK_SECRET` before trusting Telegram payload/chat data.
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
- Branch was renamed from `feat/v52-upgrade` to `feat/v54-production-readiness` on 2026-04-26 and pushed to origin.
- Emdash local config was removed and `.emdash.json` was added to `.gitignore`.
- V54 setup dry-run planner was hardened locally on 2026-04-26: it now returns explicit `OK`, `CREATE_SHEET`, `INITIALIZE_HEADERS`, `BLOCKED_HEADER_MISMATCH`, `BLOCKED_EXTRA_HEADERS`, and `BLOCKED_EXISTING_DATA` actions instead of proposing `UPDATE_HEADERS`.
- `planSetupV54()` now reads the full existing header width using `Math.max(expected schema width, sheet.getLastColumn())` so extra headers and extra real columns are visible to the planner.
- `planSetupV54ForState()` blocks extra real columns beyond the expected schema width even when the extra header cell is blank, preventing hidden data below blank headers from being treated as `OK`.
- `cmd /c npm run test:v54:setup` passed on 2026-04-26 with fixtures for exact Apps Script/local schema parity, empty state, perfect state, blank existing sheets, header mismatch, existing data, extra headers, extra blank header columns with data below, V53 sheet preservation, and absence of `UPDATE_HEADERS`.
- `applySetupV54()` was added locally on 2026-04-26 as a manual additive setup function. It runs under `withScriptLock('applySetupV54', ...)`, aborts without mutation on any `BLOCKED_*` planner action, creates only missing V54 sheets, initializes only blank existing V54 sheet headers, writes headers with `setValues()`, freezes row 1, and does not write formulas or migrate data.
- `doGet` explicitly blocklists `applySetupV54` as a mutating GET action; `doPost` does not route setup actions.
- `cmd /c npm run test:v54:setup` passed on 2026-04-26 with fake-spreadsheet tests for `applySetupV54` aborting blocked plans and creating only missing V54 sheets with headers.
- `cmd /c npm run test:security-locks` passed on 2026-04-26 after adding `applySetupV54` to the mutating GET blocklist.
- `cmd /c npm run sync` passed on 2026-04-26 and refreshed `.ai_shared/SPREADSHEET_STATE.md` with generation time `2026-04-26 15:15:27`.
- The refreshed snapshot lists only current V53-era sheets: `Dashboard`, `Investimentos`, `Parcelas`, `Lançamentos`, `Orçamento Mensal`, `Compras da Casa`, `Metas de Poupança`, and `Config`; no V54 sheets exist in the real spreadsheet yet.
- The refreshed snapshot has no detected `#ERROR!`, `#NAME?`, `#REF!`, `#N/A`, HTML, exception, or access-denied payload markers.
- `cmd /c npm run test:v53` passed on 2026-04-26 against the refreshed snapshot.
- `cmd /c npm run push` (`clasp push`) succeeded on 2026-04-26 after explicit approval and pushed 8 Apps Script files: `Actions.js`, `appsscript.json`, `Commands.js`, `Main.js`, `Parser.js`, `Setup.js`, `Tests.js`, and `Views.js`.
- `cmd /c npx clasp deployments` confirmed two deployments: an `@HEAD` deployment and version `@23 - Bot Telegram V2`.
- `cmd /c npx clasp run planSetupV54` could not execute from this environment because clasp reported missing Apps Script API execution credentials (`Could not read API credentials. Are you logged in locally?`). `planSetupV54()` was not executed through clasp.
- `planSetupV54()` was executed manually from the Apps Script editor on 2026-04-26 and returned `ok: true`, `dryRun: true`, `summary.createSheet: 14`, `summary.initializeHeaders: 0`, and `summary.blocked: 0`. The dry-run actions were 14 `CREATE_SHEET` actions for the planned V54 sheets.
- `applySetupV54()` was executed manually from the Apps Script editor on 2026-04-26 and returned `ok: true`, `dryRun: false`, `applied: true`, `summary.createSheet: 14`, `summary.initializeHeaders: 0`, and `summary.blocked: 0`. It applied 14 `CREATE_SHEET` actions.
- `cmd /c npm run sync` passed after `applySetupV54()` and refreshed `.ai_shared/SPREADSHEET_STATE.md` with generation time `2026-04-26 15:27:14`.
- The refreshed snapshot verifies that all 14 V54 sheets exist in the real spreadsheet with headers matching `scripts/lib/v54-schema.js`: `Config_Categorias`, `Config_Fontes`, `Rendas`, `Cartoes`, `Faturas`, `Pagamentos_Fatura`, `Compras_Parceladas`, `Parcelas_Agenda`, `Orcamento_Futuro_Casa`, `Lancamentos_V54`, `Patrimonio_Ativos`, `Dividas`, `Acertos_Casal`, and `Fechamentos_Mensais`.
- The refreshed snapshot after V54 setup has no detected `#ERROR!`, `#NAME?`, `#REF!`, `#N/A`, HTML, exception, or access-denied payload markers.
- `cmd /c npm run test:security-locks`, `cmd /c npm run test:v54:domain`, `cmd /c npm run test:v54:schema`, `cmd /c npm run test:v54:setup`, and `cmd /c npm run test:v53` passed on 2026-04-26 after V54 sheet creation.
- Post-review blockers were addressed on 2026-04-26: `docs/MASTERPLAN_PRODUCAO_V54.md` was updated to the post-setup state and `scripts/test-v54-snapshot.js` was added with npm script `test:v54:snapshot`.
- `cmd /c npm run test:v54:snapshot` passed on 2026-04-26 and verifies `.ai_shared/SPREADSHEET_STATE.md` contains all 14 V54 sheets with headers exactly matching `scripts/lib/v54-schema.js`.
- `node --check scripts\test-v54-snapshot.js`, `cmd /c npm run test:security-locks`, `cmd /c npm run test:v54:domain`, `cmd /c npm run test:v54:schema`, `cmd /c npm run test:v54:setup`, and `cmd /c npm run test:v53` passed on 2026-04-26 after adding the V54 snapshot test.
- Webhook security diagnostics were added on 2026-04-26: `diagnoseWebhookSecurity()` reports required Script Properties/deployment readiness without writing data or printing raw secrets, and `getTelegramWebhookInfo()` reads Telegram webhook info with secret query parameters redacted.
- `cmd /c npm run push` (`clasp push`) succeeded on 2026-04-26 after adding webhook diagnostics and pushed the Apps Script files to the project.
- `cmd /c npx clasp deployments` still shows an `@HEAD` deployment plus version `@23 - Bot Telegram V2`; production route/version activation remains UNVERIFIED until manually checked.
- `node --check src\Setup.js`, `node --check scripts\test-security-locks.js`, `cmd /c npm run test:security-locks`, `cmd /c npm run test:v54:setup`, `cmd /c npm run test:v54:domain`, `cmd /c npm run test:v54:schema`, `cmd /c npm run test:v54:snapshot`, and `cmd /c npm run test:v53` passed on 2026-04-26 after adding webhook diagnostics.
- `diagnoseWebhookSecurity()` was executed manually in the Apps Script editor on 2026-04-26 and returned `ok: true` with `telegramTokenConfigured`, `spreadsheetIdConfigured`, `syncSecretConfigured`, `webhookSecretConfigured`, `webAppUrlAvailable`, and `valTownWebhookUrlConfigured` all true, plus `authorizedUserCount: 2`.
- `apontarWebhookProValTown()` was executed manually in the Apps Script editor on 2026-04-26 and Telegram returned `{"ok":true,"result":true,"description":"Webhook was set"}`.
- `getTelegramWebhookInfo()` was executed manually after webhook registration on 2026-04-26 and returned `ok: true`, URL `https://islandd.val.run/?webhook_secret=REDACTED`, `pending_update_count: 0`, and `allowed_updates: ["message"]`.
- Telegram/Val.town positive production path was tested on 2026-04-26: `/saldo` returned data from the real spreadsheet, a controlled `R$ 1,00` `Restaurante casal` launch through Telegram was written, `/hoje` showed it, `/desfazer` removed it, and a final `/hoje` returned no launches for 2026-04-26.
- `cmd /c npm run sync` passed after the Telegram write/desfazer test and refreshed `.ai_shared/SPREADSHEET_STATE.md` with generation time `2026-04-26 15:55:22`; searching the snapshot did not find the test description or `R$ 1,00` test residue.
- V54 sheet/schema audit concluded that the current sheet list is OK but visually confusing because V53 and V54 coexist. The apparent duplicates (`Config` vs `Config_Categorias`/`Config_Fontes`, `Parcelas` vs `Compras_Parceladas`/`Parcelas_Agenda`, `Lancamentos` vs `Lancamentos_V54`, `Investimentos` vs `Patrimonio_Ativos`) are expected during transition.
- User confirmed V53 has no meaningful valid historical data to preserve. Decision D021 was accepted: V54 will be a clean start with reviewed seed/config data, not a default migration of V53 history. V53 remains temporary fallback until V54 write paths and reports are verified.

## Unverified claims
- Negative webhook security behavior is not yet production-tested: POST without secret, POST with invalid secret, and valid secret with unauthorized chat should not write anything.
- The exact versioned deployment mechanics behind the Telegram route remain not fully characterized beyond the successful positive Telegram/Val.town production test.
- A replacement protected POST maintenance path for mutating actions exists. Current local code blocks mutating GET instead.
- V54 Phase 1 domain helpers are integrated with Apps Script write paths. They are local Node.js planning/test helpers only.
- V54 sheets contain production seed data, formulas, dropdowns, or migrated transactions. Only sheet creation and header rows are verified.
- V53 sheets are safe to remove or rename. They are not: current production code still depends on them until V54 write paths replace V53.

## Current task
Execute V54 safely in small phases. Current phase: Phase 2 additive sheet setup is applied and verified, Telegram/Val.town positive production routing is verified for read-only command, controlled write, and `desfazer`, and V54 is now defined as a clean start instead of a V53 history migration. Next gate is implementing V54 seed/config planning as a dry-run-first, idempotent, non-migrating slice; optional negative webhook tests can be added before broader production writes.

## Next safe action
1. Run and keep passing `cmd /c npm run test:security-locks`, `cmd /c npm run test:v54:domain`, `cmd /c npm run test:v54:schema`, `cmd /c npm run test:v54:snapshot`, `cmd /c npm run test:v54:setup`, and `cmd /c npm run test:v53`.
2. Design V54 seed/config payloads for `Config_Categorias`, `Config_Fontes`, `Rendas`, `Cartoes`, `Patrimonio_Ativos`, `Dividas`, and `Orcamento_Futuro_Casa`.
3. Implement seed as dry-run-first and fake-spreadsheet-tested; do not write real seed data until the payload is reviewed.
4. Do not migrate V53 history by default; only manually chosen opening balances, debts, cards, income, categories, and future-home forecast should seed V54.
5. If broader Telegram production use is planned before V54 seed, add negative webhook tests for missing secret, invalid secret, and unauthorized chat.

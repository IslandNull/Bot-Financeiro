# ACTIVE_CONTEXT.md

Last updated: 2026-04-27
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
- User confirmed V53 has no meaningful valid historical data to preserve. The clean-start/no-history-migration part of D021 remains accepted: V54 will start from reviewed seed/config/opening data, not from default V53 historical migration.
- User corrected the planning premise on 2026-04-27: the project is still in development, V53 was never used as real production, and V53 no longer needs to be preserved as a mandatory fallback. Decision D031 supersedes the V53 fallback/cutover/sunset framing. V53 is now treated as a deprecated historical prototype with no new features.
- V54 seed data payload (`getV54SeedData()`) was implemented locally for `Config_Categorias`, `Config_Fontes`, `Rendas`, `Cartoes`, `Patrimonio_Ativos`, `Dividas`, and `Orcamento_Futuro_Casa` in `src/Setup.js`.
- V54 seed mechanism (`planSeedV54ForState` and `applySeedV54`) is implemented as dry-run-first and non-migrating (clean start).
- `applySeedV54` was added to `isBlockedMutatingGetAction_` in `src/Main.js` to block mutating GET calls.
- `cmd /c npm run test:v54:seed` was added and tests passed locally, checking payload structure and fake-spreadsheet setup mechanics.
- All pre-existing test suites passed successfully after these additions.
- V54 seed data was pushed to Apps Script and successfully applied to the production spreadsheet via manual execution of `applySeedV54` on 2026-04-26.
- `cmd /c npm run sync` and subsequent tests (`test:v54:snapshot`, `test:v53`) confirmed the real spreadsheet is stable and contains the new seed rows without corrupting V53 formulas.
- V54 refactoring Phase 1 is closed on the remote branch as of 2026-04-26:
  - Phase 1A local negative webhook coverage and Phase 1B routing-mode foundation are represented by commit `c43cb41`.
  - Phase 1B.2 routing diagnostics/refactoring handoff documentation is represented by commits `4deab8d` and `804ffc1`.
  - Phase 1C legacy setup isolation is represented by commit `022daeb`, which moved legacy setup/test helpers into `src/SetupLegacy.js` while preserving global Apps Script function names.
- Gemini handoff wrapper was updated in commit `b34e679` after verifying `pwsh.exe` is installed locally; it documents Windows command chaining guidance for Gemini CLI sessions.
- V54 refactoring Phase 1 closeout was completed in commit `3db4280`; this is the actual remote head that documents the Phase 1 gate.
- V54 Phase 2A contract work is coded locally: `scripts/lib/v54-parsed-entry-contract.js` defines `validateParsedEntryV54()` and `scripts/test-v54-parsed-entry-contract.js` covers the strict local contract.
- `cmd /c npm run test:v54:contract` passed on 2026-04-26. The contract remains local-only and is not wired into `doPost`, `Parser.js`, `Actions.js`, Telegram, or Apps Script mutation paths.
- V54 Phase 2B parser adapter work is coded locally: `scripts/lib/v54-parser-contract.js` builds ParserV54 prompts, parses JSON responses, supports fenced JSON, and validates candidates through `validateParsedEntryV54()`.
- `cmd /c npm run test:v54:parser` passed on 2026-04-26. The parser adapter remains local-only and is not wired into `doPost`, `Parser.js`, `Actions.js`, Telegram, OpenAI calls, Apps Script globals, or spreadsheet mutation paths.
- V54 Phase 3A-prep mapper work is coded locally: `scripts/lib/v54-lancamentos-mapper.js` maps a validated `ParsedEntryV54` candidate to canonical 19-column `Lancamentos_V54` row payloads using `scripts/lib/v54-schema.js`.
- `cmd /c npm run test:v54:lancamentos-mapper` passed on 2026-04-26. The mapper remains local-only and is not wired into `doPost`, `Parser.js`, `Actions.js`, Telegram, Apps Script globals, OpenAI calls, or spreadsheet mutation paths.
- V54 Phase 3A Actions MVP is coded locally: `src/ActionsV54.js` exposes `recordEntryV54(parsedEntry, options)` for simple events (`despesa`, `receita`, `transferencia`, `aporte`) with injectable spreadsheet provider, lock wrapper, `now()`, and `makeId()`.
- `cmd /c npm run test:v54:actions` passed on 2026-04-26 with fake-spreadsheet coverage. `recordEntryV54` is not wired into `doPost`, routing, Telegram, `Parser.js`, or the existing V53 `Actions.js`.
- V54 Phase 4A local reporting contracts are coded locally: `scripts/lib/v54-reporting-contracts.js` defines deterministic helpers for operational DRE, emergency reserve, net worth, debts, couple settlement, shared detailed privacy filtering, and monthly closing draft shape.
- `cmd /c npm run test:v54:reporting` passed on 2026-04-26. Reporting helpers remain local-only and are not wired into Telegram, routing, Apps Script views, formulas, OpenAI, or spreadsheet mutation paths.
- V54 Phase 4A-hardening reporting edge cases are coded locally: operational DRE now records included IDs for supported `receita`/`despesa` rows, ignores unsupported event types even when `afeta_dre=true`, reserve summaries classify inactive assets without counting them, net worth ignores inactive assets/debts, couple settlement excludes `receita`, and shared summary visibility redacts `descricao`, `id_fonte`, and `id_cartao`.
- `node --check scripts\lib\v54-reporting-contracts.js`, `node --check scripts\test-v54-reporting-contracts.js`, `cmd /c npm run test:v54:reporting`, `cmd /c npm run test:v54:contract`, `cmd /c npm run test:v54:parser`, `cmd /c npm run test:v54:lancamentos-mapper`, `cmd /c npm run test:v54:actions`, `cmd /c npm run test:routing-mode`, `cmd /c npm run test:security-locks`, `cmd /c npm run test:v54:setup`, `cmd /c npm run test:v54:seed`, `cmd /c npm run test:v54:snapshot`, `cmd /c npm run test:v54:schema`, and `cmd /c npm run test:v53` passed on 2026-04-26 after Phase 4A-hardening local changes.
- V54 Phase 4B-prep local card invoice cycle contracts are coded locally: `scripts/lib/v54-card-invoice-cycle.js` assigns purchase dates to deterministic invoice cycles, clamps closing/due days for short months, computes due dates from the closing cycle, and generates deterministic invoice IDs like `FAT_CARD_NUBANK_GU_2026_04`.
- `node --check scripts\lib\v54-card-invoice-cycle.js`, `node --check scripts\test-v54-card-invoice-cycle.js`, `cmd /c npm run test:v54:card-cycle`, `cmd /c npm run test:v54:reporting`, `cmd /c npm run test:v54:contract`, `cmd /c npm run test:v54:parser`, `cmd /c npm run test:v54:lancamentos-mapper`, `cmd /c npm run test:v54:actions`, `cmd /c npm run test:routing-mode`, `cmd /c npm run test:security-locks`, `cmd /c npm run test:v54:setup`, `cmd /c npm run test:v54:seed`, `cmd /c npm run test:v54:snapshot`, `cmd /c npm run test:v54:schema`, and `cmd /c npm run test:v53` passed on 2026-04-27 after Phase 4B-prep local changes.
- V54 Phase 4B-contract local single card purchase contract is coded locally: `scripts/lib/v54-card-purchase-contract.js` validates `compra_cartao`, resolves active card/source by `id_cartao`, computes invoice cycle, forces `competencia` to cycle competence, and maps one canonical `Lancamentos_V54` row with `id_cartao`, `id_fatura`, and card `id_fonte`.
- V54 Phase 4B-contract tests were added locally in `scripts/test-v54-card-purchase-contract.js` with npm script `test:v54:card-purchase`; the contract remains local-only and is not wired into Apps Script write paths, Telegram routing, spreadsheet mutation, Faturas writes, installment writes, invoice payments, or reconciliation.
- V54 Phase 4B-actions fake write path for single card purchase is coded locally: `src/ActionsV54.js` now accepts `compra_cartao` in `recordEntryV54(parsedEntry, options)` by using injectable `mapSingleCardPurchaseContract` and still appends exactly one `Lancamentos_V54` row under the same fake-first lock/dependency pattern.
- `cmd /c npm run test:v54:actions`, `cmd /c npm run test:v54:card-purchase`, `cmd /c npm run test:v54:card-cycle`, `cmd /c npm run test:v54:lancamentos-mapper`, `cmd /c npm run test:v54:contract`, `cmd /c npm run test:v54:parser`, `cmd /c npm run test:v54:reporting`, `cmd /c npm run test:v54:schema`, `cmd /c npm run test:v53`, `cmd /c npm run test:routing-mode`, and `cmd /c npm run test:security-locks` passed on 2026-04-27 after Phase 4B-actions local changes.
- V54 Phase 4B-actions-hardening restored and expanded local fake-spreadsheet regression coverage in `scripts/test-v54-actions-mvp.js`: missing `Lancamentos_V54`, header mismatch, simple-event row width, optional link empty strings, canonical required-field/boolean-string parity, `compra_cartao` flag preservation, no auxiliary card/invoice/installment writes, card rejection failures with no append, and unsupported `compra_parcelada`/`pagamento_fatura`.
- `node --check src\ActionsV54.js`, `node --check scripts\test-v54-actions-mvp.js`, `node --check scripts\lib\v54-card-purchase-contract.js`, `cmd /c npm run test:v54:actions`, `cmd /c npm run test:v54:card-purchase`, `cmd /c npm run test:v54:card-cycle`, `cmd /c npm run test:v54:lancamentos-mapper`, `cmd /c npm run test:v54:contract`, `cmd /c npm run test:v54:parser`, `cmd /c npm run test:v54:reporting`, `cmd /c npm run test:v54:schema`, `cmd /c npm run test:v53`, `cmd /c npm run test:routing-mode`, and `cmd /c npm run test:security-locks` passed on 2026-04-27 after Phase 4B-actions-hardening local test changes.
- V54 Phase 4C-prep local installment schedule contract is coded locally: `scripts/lib/v54-installment-schedule-contract.js` maps a validated `compra_parcelada` into one `Compras_Parceladas` row and N `Parcelas_Agenda` rows using existing card invoice cycle rules.
- The installment schedule contract remains local-only and does not generate `Lancamentos_V54`, `Faturas`, `Pagamentos_Fatura`, Apps Script writes, Telegram routing, OpenAI calls, vendor calls, deploys, syncs, setup, seed, or migrations.
- `node --check scripts\lib\v54-installment-schedule-contract.js`, `node --check scripts\test-v54-installment-schedule-contract.js`, `cmd /c npm run test:v54:installment-schedule`, `cmd /c npm run test:v54:card-cycle`, `cmd /c npm run test:v54:contract`, `cmd /c npm run test:v54:schema`, `cmd /c npm run test:v54:actions`, and `cmd /c npm run test:v53` passed on 2026-04-27 after Phase 4C-prep local changes.
- V54 Phase 4C-prep-hardening local installment contract now rejects inconsistent `parcelamento.valor_parcela` with structured `PARCEL_VALUE_MISMATCH`; it accepts `valor_parcela` only when absent or when it matches the deterministic split for every parcel.
- V54 Phase 4C-prep-hardening tests now document that default `id_compra` is deterministic and collides for identical same-day/card/description purchases; duplicate disambiguation for future production-like fake write paths must use injected `makeCompraId`.
- `node --check scripts/lib/v54-installment-schedule-contract.js`, `node --check scripts/test-v54-installment-schedule-contract.js`, `cmd /c npm run test:v54:installment-schedule`, `cmd /c npm run test:v54:contract`, `cmd /c npm run test:v54:schema`, `cmd /c npm run test:v54:actions`, and `cmd /c npm run test:v53` passed on 2026-04-27 after Phase 4C-prep-hardening local changes.
- V54 Phase 4C-actions fake write path is coded locally in `src/ActionsV54.js`: `recordEntryV54(parsedEntry, options)` now supports `compra_parcelada` using injectable `mapInstallmentScheduleContract`, appending exactly one `Compras_Parceladas` row and N `Parcelas_Agenda` rows with lock wrapping.
- Phase 4C-actions injects `makeCompraId` into installment scheduling and does not rely on the contract default deterministic `id_compra`; duplicate same-day/card/description purchases are disambiguated when unique `makeCompraId` is injected.
- Phase 4C-actions does not append `Lancamentos_V54`, `Faturas`, or `Pagamentos_Fatura` rows for `compra_parcelada`; `pagamento_fatura` remains unsupported.
- `node --check src/ActionsV54.js`, `node --check scripts/test-v54-actions-mvp.js`, `cmd /c npm run test:v54:actions`, `cmd /c npm run test:v54:installment-schedule`, `cmd /c npm run test:v54:card-purchase`, `cmd /c npm run test:v54:card-cycle`, `cmd /c npm run test:v54:contract`, `cmd /c npm run test:v54:schema`, and `cmd /c npm run test:v53` passed on 2026-04-27 after Phase 4C-actions local changes.
- `docs/MASTERPLAN_PRODUCAO_V54.md` was rewritten on 2026-04-27 as a concise V54-only MVP plan. It removes V53 production/fallback/cutover/sunset gates and preserves the real remaining V54 risks: rateio, benefits, faturas, payments, idempotency, dedupe, adjustments, refunds/chargebacks/cancellations, protected real spreadsheet tests, and Telegram V54 E2E.

## Unverified claims
- Negative webhook security behavior is not yet production-tested: POST without secret, POST with invalid secret, and valid secret with unauthorized chat should not write anything.
- The exact versioned deployment mechanics behind the Telegram route remain not fully characterized beyond the successful positive Telegram/Val.town production test.
- A replacement protected POST maintenance path for mutating actions exists. Current local code blocks mutating GET instead.
- V54 Phase 1 domain helpers are integrated with Apps Script write paths. They are local Node.js planning/test helpers only.
- V54 sheets contain migrated transactions. Currently, they only contain seed data.
- V53 code/sheets are safe to remove or rename immediately. They are deprecated under D031, but removal is still UNVERIFIED because current code and scripts still reference V53-era files/sheets. Treat removal as a separate cleanup/refactor phase, not as a production fallback requirement.

## Current task
Execute V54 as a V54-only MVP in small phases. Current phase: documentation reset is complete locally; next implementation work should not add V53 features and should focus on V54 domain decisions, local/fake-first transaction completion, protected real V54 tests, Telegram V54, and deterministic reports.

## Next safe action
1. Review the V54-only masterplan rewrite and D031 decision.
2. Resolve Phase 1 domain decisions: opening date, rateio/income base, benefits, fatura state machine, payment/acerto rule, ID/idempotency/dedupe, adjustments/refunds/cancellations, and debt payment semantics.
3. Keep `pagamento_fatura` unsupported until dedicated fatura/payment/reconciliation phases.
4. Do not run setup, seed, deploy, clasp, real spreadsheet tests, Telegram mutation, or production writes without explicit later approval.

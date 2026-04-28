# DECISIONS.md

## D001 - Formulas in Google Sheets
Status: Accepted
Date: 2026-04-25

Decision:
Use `range.setFormula()` with English function names and semicolon (`;`) argument separators.

Reason:
This was the only pattern validated in the real spreadsheet, because the spreadsheet uses pt-BR locale behavior while Apps Script formula injection requires this syntax for the current file.

Rejected:
- `setFormula()` with comma separators: caused formula parse errors.
- `setValue()` with localized function names: inconsistent/invalid through Apps Script API.
- Temp-cell `copyTo()`: generated `#REF!` in references.

## D002 - Relational System (V53) and Double Entry
Status: Accepted
Date: 2026-04-25

Decision:
Separate readable category names (`NOME_CATEGORIA`) from database IDs (`ID_CATEGORIA`). The OpenAI parser returns the readable name, and backend Apps Script code translates it to the ID using a cache before writing `Lancamentos`. Double-entry investment contributions are handled programmatically in `src/Actions.js` when the parsed movement is an Aporte.

Reason:
This reduces the risk of the LLM hallucinating exact ID formats while keeping business logic and relational consistency in structured backend code.

## D003 - Agent Handoff (CLI-only)
Status: Accepted
Date: 2026-04-25

Decision:
Use root `AGENTS.md` as the universal repository contract, with `GEMINI.md` and `CLAUDE.md` acting only as import wrappers. Shared state lives in versioned files under `.ai_shared/`, especially `ACTIVE_CONTEXT.md` and `SPREADSHEET_STATE.md`.

Reason:
This reduces context loss between clean CLI sessions and avoids relying on non-versioned memory that cannot be read by other users or agents.

## D004 - Spreadsheet Sync Fail-Closed
Status: Accepted
Date: 2026-04-25

Decision:
`scripts/sync-state.js` must validate that the Web App response starts with `# Spreadsheet State` before writing `.ai_shared/SPREADSHEET_STATE.md`. HTML responses, Apps Script error pages, access-denied responses, and unexpected payloads must fail with a non-zero exit code.

Reason:
`npm run sync` can receive HTTP 200 with an Apps Script error page, such as `Funcao de script nao encontrada: doGet`. Treating that as success overwrites the shared spreadsheet snapshot with invalid HTML and hides deployment drift.

## D005 - Protected Maintenance Actions
Status: Accepted
Date: 2026-04-25

Decision:
Maintenance actions exposed through `doGet`, such as `forceFixAllFormulas`, must remain behind the same `SYNC_SECRET` check used by `exportState`.

Reason:
Local `clasp run` failed because Apps Script API execution credentials were unavailable, while the deployed Web App path was already authenticated by `SYNC_SECRET`. The maintenance action allowed formula repair to run against the official spreadsheet without exposing secrets in repo files.

## D006 - Protected V53 Behavioral Tests
Status: Accepted
Date: 2026-04-25

Decision:
V53 behavioral tests run through the deployed Web App using `SYNC_SECRET`. The Aporte test writes a deterministic low-value fixture, verifies the two expected double-entry rows, and deletes those rows automatically unless called with `cleanup=0`.

Reason:
This validates the same Apps Script runtime and official spreadsheet used in production without requiring local Apps Script API execution credentials, without exposing Telegram chat IDs, and without calling OpenAI for a deterministic write-path test.

## D007 - V54 Planning Before Implementation
Status: Accepted
Date: 2026-04-25

Decision:
Before implementing V54, create and review `docs/MASTERPLAN_PRODUCAO_V54.md`. The V54 plan must cover the household income model, proportional couple settlement, emergency reserve, future home forecast, credit card invoices/installments, separation of operational DRE from patrimony/investments, bot recommendations, migration, tests, rollback, and acceptance criteria.

Reason:
The current V53 is structurally validated, but production readiness depends on conceptual changes that affect schema, formulas, historical data, and user behavior. Implementing directly into the spreadsheet before agreeing on the model risks corrupting data and creating misleading financial reports.

## D008 - V54 Household Finance Principles
Status: Proposed
Date: 2026-04-25

Decision:
Use a shared household model with personal autonomy. Benefits (`Alelo`, `VA`) are 100% for couple use. The existing `16635` is earmarked for home items and must not count as emergency reserve. Emergency reserve starts at `0`, with target bands of `15000`, `30000-33000`, and a proposed monthly contribution of `1400` if realistic. Card invoice payment is not an expense; purchases/installments are the expense, and invoice payment is settlement.

Reason:
This matches the user's stated household philosophy and avoids double-counting card expenses or overstating emergency reserves.

## D009 - V54 Local Tests Before Spreadsheet Mutation
Status: Accepted
Date: 2026-04-26

Decision:
Implement V54 domain and schema rules as local Node.js tests before any Apps Script setup, Google Sheets mutation, deploy, or Telegram production test. Use `cmd /c npm run test:v54:domain` in this Windows environment because direct PowerShell `npm.ps1` is blocked by ExecutionPolicy.

Reason:
Multi-agent review found high production risk in webhook authentication, mutating maintenance endpoints, setup blast radius, missing write locks, and incomplete card/installment semantics. Local deterministic tests let the financial model be validated before touching the production spreadsheet.

## D010 - Initial V54 Invoice Cycle Assumption
Status: Accepted
Date: 2026-04-27

Decision:
For local V54 card invoice cycle contracts, a purchase belongs to the invoice whose closing date is the first closing date on or after the purchase date. A purchase on the closing day belongs to that closing cycle. A configured closing day that does not exist in a month is clamped to the month's last day. The due date is in the month after the closing date and is also clamped if needed. Deterministic invoice IDs use the card ID and closing competence, for example `FAT_CARD_NUBANK_GU_2026_04`.

Reason:
This provides deterministic behavior for Nubank Gustavo day 30, Mercado Pago Gustavo day 5, and Nubank Luana day 1 while keeping edge cases testable before spreadsheet implementation, card purchase writes, invoice writes, payments, or reconciliation.

## D011 - V54 Card Source Authority
Status: Accepted
Date: 2026-04-26

Decision:
Use `Config_Fontes` as the canonical source identity table with `id_fonte`, `nome`, `tipo`, `titular`, and `ativo`. Store card-specific fields only in `Cartoes`, which references `id_fonte` and owns `fechamento_dia`, `vencimento_dia`, and `limite`.

Reason:
The read-only architecture review found that keeping closing day, due day, and limit in both `Config_Fontes` and `Cartoes` would create duplicated authority and migration risk. Separating source identity from card-specific behavior keeps formulas, migrations, and reconciliation deterministic.

## D012 - V54 Installment Key
Status: Accepted
Date: 2026-04-26

Decision:
Use stable `id_parcela` in `Parcelas_Agenda` and reference it from `Lancamentos_V54.id_parcela`.

Reason:
The masterplan referenced `id_parcela` from launches but did not define it in the installment schedule. A stable key is required for reconciliation, rollback, cancellation, and preventing duplicate expense recognition.

## D013 - V54 Setup Starts As Dry-Run
Status: Accepted
Date: 2026-04-26

Decision:
Start V54 setup with `planSetupV54()` dry-run only. It can inspect existing sheets and headers and return planned actions, but must not call mutating spreadsheet APIs. The original dry-run action vocabulary was later hardened by D018 to replace generic header updates with explicit safe/blocked states.

Reason:
Existing setup/repair functions have high blast radius. A dry-run planner provides a reviewable migration plan before any sheet creation, header rewrite, formula injection, or data migration.

## D014 - V54 Consolidated Analysis Execution Order
Status: Accepted
Date: 2026-04-26

Decision:
Consolidate `.ai_shared/ANALISE_A_SER_CONSIDERADA.MD` into the V54 masterplan and treat security plus write-safety as the next mandatory implementation gate. Before new financial features or production sheet mutation, harden webhook/proxy authentication, separate or block mutating GET maintenance actions, and add `LockService` around write paths.

Reason:
The external analysis and follow-up read-only reviews confirmed that V54 is directionally correct but not ready for production mutation. The highest-impact verified risks are spoofable webhook payload trust, mutating GET endpoints protected by query-string secret, setup/repair blast radius, and concurrent writes using `getLastRow() + 1`.

## D015 - V54 Expanded Financial Schema
Status: Accepted
Date: 2026-04-26

Decision:
Expand the planned V54 schema with `Pagamentos_Fatura`, `Dividas`, and `Fechamentos_Mensais`. Add `afeta_patrimonio` and `visibilidade` to `Lancamentos_V54`, add `visibilidade` to `Compras_Parceladas`, and add `visibilidade_padrao` to `Config_Categorias`.

Reason:
Invoice payment needs its own entity to support partial payments, reconciliation, and no duplicate DRE expense. Caixa and Vasco need explicit debt records before amortization advice is meaningful. Monthly closing is the decision layer for the couple. Visibility rules are required so personal spending can remain autonomous and not become surveillance in shared reports.

## D016 - V54 Security And Write Locks Gate
Status: Accepted
Date: 2026-04-26

Decision:
Before any production mutation or new V54 financial feature, `doPost` must fail closed unless `WEBHOOK_SECRET` is present and matches a request secret. The accepted local contract supports Apps Script query parameters (`webhook_secret` or `telegram_secret`) and Val.town-forwarded body fields (`_webhook_secret`, `_bot_financeiro_secret`, `webhook_secret`, or `proxy_secret`). Telegram webhook setup must also set `secret_token`.

`doGet` remains read-only for `exportState` behind `SYNC_SECRET`. Mutating GET actions, including `forceFixAllFormulas` and `runV53AporteTest`, must be blocked over GET until a reviewed protected POST maintenance path exists.

Write paths that use spreadsheet row allocation or deletion must run under `withScriptLock()` using Apps Script `LockService`. The local guarded paths are `recordParsedEntry`, `desfazerUltimo`, `handleManter`, and `handleParcela`.

Reason:
The verified risks were spoofable webhook payload trust, query-string mutating maintenance endpoints, and concurrent writes based on `getLastRow() + 1`. A shared webhook secret plus fail-closed routing prevents trusting arbitrary payloads before chat authorization, blocking mutating GET avoids accidental or leaked-link spreadsheet mutation, and `LockService` reduces row-race risk for Gustavo/Luana concurrent writes.

Rejected:
- Trusting Telegram `chat.id` alone as webhook authentication.
- Reusing read-only `doGet` as the route for mutating maintenance actions.
- Adding new V54 spreadsheet mutation before security and write-safety checks are locally verified.

## D017 - V54 Phase 1 Domain Fixtures Before Sheet Mutation
Status: Accepted
Date: 2026-04-26

Decision:
Before creating or mutating V54 sheets, the financial rules for invoice exposure, emergency reserve, net worth, monthly closing, privacy, and amortization readiness must be represented as deterministic local tests.

The local helpers may calculate planning outputs, but they must not become production truth until wired into reviewed Apps Script paths and verified against spreadsheet snapshots.

Reason:
The next production risk is not syntax; it is wrong financial semantics. Local fixtures catch duplicate DRE recognition, accidental reserve overstatement, unsafe amortization advice, and privacy leakage before the spreadsheet schema exists.

Rejected:
- Treating home-item earmarked assets as emergency reserve.
- Recommending amortization while reserve, invoice exposure, or debt fields are unknown/incomplete.
- Showing private personal entries in shared detailed reports.

## D018 - V54 Setup Planner Blocks Header Drift
Status: Accepted
Date: 2026-04-26

Decision:
Before implementing any mutating V54 setup/apply function, `planSetupV54ForState()` must return explicit safe or blocked states instead of a generic `UPDATE_HEADERS` action.

Accepted planner actions are:
- `OK`
- `CREATE_SHEET`
- `INITIALIZE_HEADERS`
- `BLOCKED_HEADER_MISMATCH`
- `BLOCKED_EXTRA_HEADERS`
- `BLOCKED_EXISTING_DATA`

The planner may propose creating missing V54 sheets or initializing headers on a blank existing V54 sheet. It must block existing nonblank divergent headers, extra headers, extra real columns beyond the expected schema width even when the extra header cell is blank, and any divergent header situation with data rows below the header.

Reason:
A future `applySetupV54()` should be additive and reviewable. Automatically rewriting headers in existing sheets can silently corrupt manually created V54 data or hide schema drift. Blocking unsafe states forces human review before spreadsheet mutation.

Rejected:
- Reusing `UPDATE_HEADERS` as an apply-ready action.
- Ignoring extra headers beyond the expected schema width.
- Rewriting V54 headers automatically when data already exists.

## D019 - V54 Setup Apply Is Additive And Manual
Status: Accepted
Date: 2026-04-26

Decision:
`applySetupV54()` may exist as a manual Apps Script setup function, but it must be additive and must honor `planSetupV54ForState()` blocked states. It creates only missing V54 sheets, initializes headers only for existing blank V54 sheets, writes headers with `setValues()`, freezes row 1, and aborts without mutation if any action starts with `BLOCKED_`.

`applySetupV54()` must run under `withScriptLock('applySetupV54', ...)` and must not be exposed through `doGet` or `doPost`. `doGet` explicitly blocklists `applySetupV54` as a mutating action.

Reason:
The first real V54 spreadsheet mutation should be reviewable, idempotent, and low blast-radius. A manual apply function behind the dry-run planner allows creating the V54 skeleton while preserving all V53 sheets and avoiding formulas, seed data, migration, and hidden header rewrites.

Rejected:
- Running V54 setup from a GET maintenance endpoint.
- Rewriting divergent existing V54 headers automatically.
- Migrating data, writing formulas, or touching V53 sheets during the initial V54 sheet skeleton creation.

## D020 - Webhook Security Validation Is Read-Only And Redacted
Status: Accepted
Date: 2026-04-26

Decision:
Before Telegram production testing, validate webhook readiness with manual Apps Script diagnostics that do not write to the spreadsheet, do not send Telegram messages, and do not mutate Telegram webhook configuration.

`diagnoseWebhookSecurity()` reports whether required Script Properties and deployment URLs are present, but redacts `webhook_secret` and only prints a masked secret preview. `getTelegramWebhookInfo()` may call Telegram `getWebhookInfo` as a read-only Bot API check and must redact any secret query parameter in the returned URL.

Reason:
The next risk is environment drift: secure code can still fail if `WEBHOOK_SECRET`, authorized users, deployment URL, or Val.town forwarding are not configured correctly. Redacted read-only diagnostics give a safe gate before any real Telegram write path or production message test.

Rejected:
- Printing full webhook secrets or Telegram tokens in logs.
- Validating Telegram production readiness by sending real bot messages before negative auth checks.
- Mutating webhook configuration as part of diagnostics.

## D021 - V54 Fresh Start With V53 Temporary Fallback
Status: Superseded by D031 for the V53 fallback premise; clean-start/no-history-migration decision remains accepted
Date: 2026-04-26

Decision:
Treat V54 as a clean production start instead of migrating V53 historical data by default.

Historical note before D031: this decision originally treated V53 as a temporary production/fallback flow and warned not to delete, rename, or hide V53 sheets because current Apps Script commands still reference V53-era sheets such as `Config`, `Lancamentos`, `Dashboard`, `Investimentos`, and `Parcelas`. D031 supersedes that fallback premise. Cleanup/removal is still a separate refactor because code references remain, but V53 is no longer a product fallback requirement.

Reason:
The user confirmed that V53 does not contain meaningful valid historical data. Migrating it would add semantic risk without value, especially around categories, investments, installments, invoices, and DRE behavior. A fresh V54 seed keeps the model cleaner and reduces migration work.

Rejected:
- Migrating V53 transaction history by default.
- Deleting or renaming V53 sheets before V54 write paths are production-ready.
- Treating visual duplication between V53 and V54 sheets as a schema error during the transition.

Superseded note:
On 2026-04-27, the user corrected the planning premise: the project is still in development, V53 was never used as real production, and V53 no longer needs to be preserved as a mandatory fallback. The clean-start/no-history-migration part remains accepted. The fallback/cutover/sunset framing is superseded by D031.


## D022 - V54 Clean Seed Data Implementation
Status: Accepted
Date: 2026-04-26

Decision:
V54 seed data (categories, sources, cards, incomes, debts, and initial assets) is applied using a dry-run-first, lock-protected, additive mechanism (`planSeedV54ForState` and `applySeedV54`). It uses exact matching to avoid conflicts and does not mutate existing rows.

Reason:
To safely bootstrap the V54 architecture without migrating V53 history, the canonical configuration needs to be planted reliably. Using the same dry-run and lock-protected pattern as the sheet setup ensures no accidental duplication or corruption occurs if the function is run multiple times.

## D023 - ParsedEntryV54 Contract Is Strict And Local
Status: Accepted
Date: 2026-04-26

Decision:
Define `ParsedEntryV54` as a deterministic local Node.js contract before implementing `ParserV54` or V54 write paths. The validator returns structured `{ ok, errors, normalized }` results, trims strings, accepts only safe dot-decimal numeric strings, rejects comma money strings, requires explicit boolean flags, and rejects unknown top-level fields.

`compra_parcelada` may include a local `parcelamento` object (`parcelas_total`, optional `numero_parcela`, optional `valor_parcela`) so a future parser can express installment intent before the write path creates `Compras_Parceladas` and `Parcelas_Agenda` rows.

Reason:
The next risk is not spreadsheet mutation; it is allowing future LLM output to become a loose JSON blob. A strict local contract gives `ParserV54` and future write paths a narrow, testable interface before any production route or spreadsheet write is changed.

Rejected:
- Allowing unknown fields for forward compatibility.
- Accepting ambiguous Brazilian comma money strings before an explicit parser normalization layer exists.
- Wiring the contract into `doPost`, `Parser.js`, or `Actions.js` during Phase 2A.

## D024 - ParserV54 Adapter Stays Local Until Production Wiring Gate
Status: Accepted
Date: 2026-04-26

Decision:
Implement the first ParserV54 work as a local contract adapter in `scripts/lib`, not as a productive Apps Script parser. The adapter builds system/user prompts from canonical context, parses one JSON object response, accepts JSON enclosed in a markdown `json` fence, rejects invalid JSON and array output with structured errors, and validates candidates through `validateParsedEntryV54()`.

The prompt contract instructs future LLM output to use dot-decimal numeric values, ISO dates, strict enum values, real booleans, and only canonical IDs from provided dictionaries. It must not include secrets, production write-path instructions, or spreadsheet mutation instructions.

Reason:
ParserV54 needs to be designed against the strict ParsedEntryV54 contract before touching Telegram or V53 production routing. Handling fenced JSON is pragmatic for LLM output, but the adapter still fails closed through the contract for unknown fields, comma money strings, missing required fields, and invalid event rules.

Rejected:
- Importing or calling OpenAI in local ParserV54 tests.
- Importing Apps Script globals in the local parser adapter.
- Wiring ParserV54 into `doPost`, `Parser.js`, `Actions.js`, or V54 write paths during Phase 2B.

## D025 - Lancamentos_V54 Mapper Is Pure And Deterministic
Status: Accepted
Date: 2026-04-26

Decision:
Define the first V54 write-path boundary as a local pure mapper from a validated `ParsedEntryV54` candidate to the canonical 19-column `Lancamentos_V54` row payload. The mapper validates through `validateParsedEntryV54()`, returns structured failures without throwing for normal invalid input, uses `scripts/lib/v54-schema.js` as the header authority, fills optional link fields as empty strings, preserves booleans and numeric values, and supports dependency injection for `makeId()` and `now()` so tests stay deterministic.

This phase intentionally creates only a local row-payload contract in `scripts/lib`; it does not append to Google Sheets, import Apps Script globals, create `ActionsV54.js`, or wire V54 into Telegram routing.

Reason:
Before implementing a real Apps Script write path, the project needs a tested, schema-aligned conversion from strict parser output to spreadsheet row shape. Keeping ID and timestamp generation injectable avoids nondeterministic tests and makes the eventual `ActionsV54` layer a thin, lock-protected append around an already verified row contract.

Rejected:
- Generating row payloads directly inside a production Apps Script action before local mapper tests exist.
- Using random IDs or wall-clock timestamps in tests.
- Writing `undefined` into optional spreadsheet link columns.
- Handling installment fan-out, invoice generation, invoice payments, or real spreadsheet append in the mapper prep phase.

## D026 - ActionsV54 MVP Is Fake-First And Not Routed
Status: Accepted
Date: 2026-04-26

Decision:
Create `src/ActionsV54.js` as an isolated MVP write-path module for simple V54 events only: `despesa`, `receita`, `transferencia`, and `aporte`. The MVP validates and maps entries to one canonical 19-column `Lancamentos_V54` row, appends through injectable spreadsheet/sheet dependencies, and requires an injectable lock wrapper around the append.

Unsupported financial events (`compra_cartao`, `compra_parcelada`, `pagamento_fatura`, `divida_pagamento`, and `ajuste`) are rejected explicitly until their own card, invoice, debt, and reconciliation phases exist. The module is not wired into `doPost`, routing, Telegram, `Parser.js`, or the legacy V53 flow.

Reason:
The first Apps Script-facing V54 action should prove the write boundary with fake-spreadsheet tests before touching the real spreadsheet. Keeping all production dependencies injectable lets local tests verify row shape, header matching, lock usage, deterministic ID/timestamp behavior, and V53 isolation without `SpreadsheetApp` mutation.

Rejected:
- Routing Telegram messages to V54 during the MVP action phase.
- Supporting card/fatura/installment/debt/reconciliation events in the simple write-path phase.
- Calling real `SpreadsheetApp` from local tests.
- Modifying V53 production files to make V54 tests pass.

## D027 - V54 Reporting Contracts Stay Local And Deterministic
Status: Accepted
Date: 2026-04-26

Decision:
Define the first V54 reporting layer as a local pure Node.js contract in `scripts/lib/v54-reporting-contracts.js`, with tests in `scripts/test-v54-reporting-contracts.js` and npm script `test:v54:reporting`.

The helpers calculate operational DRE only from `Lancamentos_V54`-like rows with `afeta_dre=true`, keep reserve totals limited to assets flagged `conta_reserva_emergencia=true`, keep home-earmarked assets visible outside reserve, draft net worth as assets minus debts, expose debt reporting limitations when principal/interest split is unknown, draft couple settlement from `afeta_acerto=true` and `escopo=Casal`, filter private entries from shared detailed views, and produce `Fechamentos_Mensais`-shaped draft objects with deterministic placeholders instead of LLM recommendations.

Reason:
Monthly decision foundations need deterministic facts before any spreadsheet formulas, Apps Script views, Telegram responses, or LLM phrasing are wired. Keeping this layer local catches DRE leakage, reserve overstatement, privacy leakage, fake precision in debts, and closing-shape drift without mutating the real spreadsheet.

Rejected:
- Wiring reporting helpers into Telegram, routing, Apps Script views, or spreadsheet formulas during this phase.
- Calling OpenAI or generating recommendations from an LLM in reporting contracts.
- Counting home-item earmarked assets as emergency reserve.
- Pretending a principal/interest split exists for Caixa/Vasco-like debts when fixture data does not provide it.

## D028 - Card Purchase Competence Follows Invoice Cycle
Status: Accepted
Date: 2026-04-27

Decision:
For `compra_cartao`, `Lancamentos_V54.data` stores the real purchase date, while `Lancamentos_V54.competencia` must be overwritten to the computed invoice-cycle competence from the card cycle contract. The purchase is recognized once as expense in `Lancamentos_V54`; future invoice payment is settlement only and must not create another operational DRE expense.

Reason:
This keeps card purchases deterministic across closing-day boundaries, prevents duplicate expense recognition, and aligns `Lancamentos_V54` with the future `Faturas`/`Pagamentos_Fatura` reconciliation model.

## D029 - Installment Schedule Is Local Before Recognition
Status: Accepted
Date: 2026-04-27

Decision:
For `compra_parcelada`, Phase 4C-prep maps a validated parser candidate into one `Compras_Parceladas` row and N `Parcelas_Agenda` rows only. The first parcel uses the purchase-date invoice cycle, later parcels advance one invoice cycle each, `Parcelas_Agenda.competencia` and `id_fatura` follow those cycles, and parcel values split cents deterministically so the sum equals `valor_total`.

Installment scheduling does not create `Lancamentos_V54`, `Faturas`, or `Pagamentos_Fatura` rows in this phase. Statuses are `Compras_Parceladas.status = ativa`, `Parcelas_Agenda.status = pendente`, and `Parcelas_Agenda.id_lancamento = ""`.

Reason:
Installments need a stable schedule before expense recognition, invoice-row creation, payments, reconciliation, or Telegram routing. Keeping this as a pure local contract reduces the risk of duplicate DRE recognition and lets future write paths consume deterministic `id_compra`, `id_parcela`, competence, and invoice references.

## D030 - Installment Parcel Value Consistency And ID Strategy
Status: Accepted
Date: 2026-04-27

Decision:
In the local Phase 4C installment schedule contract, `valor_total` remains the authority for split calculation. `parcelamento.valor_parcela` is optional; when provided, it is accepted only if it exactly matches the deterministic split for every parcel, otherwise the contract fails with structured error `PARCEL_VALUE_MISMATCH` and returns no schedule rows.

Default `id_compra` generation is deterministic and can collide for identical purchases on the same day/card/description. Future production-like fake write paths must inject `makeCompraId` unique generation and must not rely on the default deterministic ID for duplicate disambiguation.

Reason:
Deterministic split remains the single source of truth while ambiguity around parser-provided parcel value is removed. Explicitly documenting deterministic default ID collisions prevents accidental duplicate-key assumptions in future write phases.

## D031 - V54-Only MVP Premise
Status: Accepted
Date: 2026-04-27

Decision:
Treat V54 as the only target architecture for the MVP. V53 is a deprecated historical prototype, not active production and not a mandatory fallback. Do not add new V53 features. Do not use V53 cutover, rollback, or sunset gates as blockers for V54 MVP delivery.

V53 code, scripts, and sheets may remain temporarily as legacy reference or cleanup targets, but future implementation work should move directly toward V54-only behavior unless a task explicitly asks for V53 cleanup.

Reason:
The user clarified that the project is still in development and V53 was never used in production. Keeping V53 as mandatory fallback would add unnecessary architecture, documentation, and testing overhead, and would keep future agents optimizing for a false production constraint.

Rejected:
- Treating `V53_CURRENT` as the production baseline for V54 planning.
- Requiring V53 fallback gates before V54 MVP work.
- Building new V53 features.
- Framing V54 work as a migration from production V53.

## D032 - V54 Income Base And Rateio
Status: Accepted
Date: 2026-04-27

Decision:
The rateio base uses only unrestricted recurring incomes. Gustavo's fuel allowance (R$ 1.200) is already included in his base salary of R$ 3.400. Therefore, the MVP base is Gustavo: 3400 (49.28%) and Luana: 3500 (50.72%). The rateio must be computed from the `Rendas` snapshot valid for the closing month.

Reason:
Using a deterministic base prevents rateio drift. Excluding restricted benefits ensures they don't overstate free cash.

## D033 - V54 Benefit Resources (VA/VR/Alelo)
Status: Accepted
Date: 2026-04-27

Decision:
Treat VA/VR/Alelo as restricted household resources. They do not enter the rateio base, emergency reserve, or investment capacity. They do not generate personal credit for the holder in the couple's acerto. When used for eligible shared expenses, they simply reduce the shared amount that needs to be settled with cash.

Reason:
This respects the restricted nature of the benefits and avoids one partner owing the other just because a shared meal was paid with a meal voucher.

## D034 - V54 "Fora orcamento" Disabled
Status: Accepted
Date: 2026-04-27

Decision:
Disable the `Fora orcamento` scope in the MVP. Private tracking must use `escopo=Gustavo` or `escopo=Luana` with `visibilidade=privada` and `afeta_acerto=false`. Explicit events like investments or debt payments must use their proper DRE class.

Reason:
`Fora orcamento` is ambiguous and risks hiding shared expenses, leaking private ones, or corrupting reports.

## D035 - V54 Home-Earmarked Assets Taxonomy
Status: Accepted
Date: 2026-04-27

Decision:
Maintain `Itens da casa` as the canonical taxonomy in `Patrimonio_Ativos.destinacao` for funds earmarked for furniture and initial home setup. These funds must not be counted as emergency reserve. Emergency reserve only counts if explicitly flagged with `conta_reserva_emergencia=true`.

Reason:
Prevents the false sense of security that occurs when home savings are accidentally reported as emergency liquidity.

## D036 - V54 Fatura Payment Prepayment Blocked
Status: Accepted
Date: 2026-04-27

Decision:
Block invoice prepayments in the MVP. A `pagamento_fatura` can only be registered if the invoice status is `fechada` and it has a `valor_fechado`.

Reason:
Prepayments complicate the minimum viable state machine for invoices.

## D037 - V54 Acerto Allocation by Fatura Competence
Status: Accepted
Date: 2026-04-27

Decision:
Invoice payments must be attributed to the invoice's competence for the couple's acerto, even if the cash payment occurs in the following calendar month. The payment date affects cash flow; the invoice competence affects the acerto.

Reason:
This decouples cash-flow reality from the accrual-based acerto, preventing duplicated or shifted obligations.

## D038 - V54 Idempotency Log
Status: Accepted
Date: 2026-04-27

Decision:
Create an `Idempotency_Log` entity/sheet before routing Telegram traffic to V54. Repeating the same Telegram message/update must not create a duplicate financial row. Semantic deduplication must warn or block, but never silently merge.

Reason:
Prevents double-spending when network issues cause Telegram to retry webhook deliveries.

## D039 - V54 Future Fatura Refunds
Status: Accepted
Date: 2026-04-27

Decision:
A refund posted on a future invoice affects that future invoice's competence and references the original launch. Closed months are not reopened automatically. Corrections to closed months require an explicit `ajuste` with a stated reason.

Reason:
Keeps historical monthly closings immutable and auditable.

## D040 - V54 Debt Payments as Cash Obligations
Status: Partially Accepted
Date: 2026-04-27

Decision:
For the MVP, debt payments (Caixa, Vasco) are tracked as cash outflows and non-DRE obligations, without requiring a principal/interest split on day one. They must reference an `id_divida`, reduce cash, and affect acerto if it's a shared debt. Amortization recommendations are blocked until full debt parameters are available. A dedicated `Pagamentos_Divida` entity is preferred for a later phase.

Reason:
Unblocks the tracking of cash outflows without forcing the user to invent interest/principal splits before the banking data is confirmed.

## D041 - V54 Expected Faturas Upsert
Status: Accepted
Date: 2026-04-27

Decision:
For Phase 4D local/fake-first expected invoice generation, create or update only `Faturas` rows with status `prevista`. The source of truth for `id_fatura`, `competencia`, `data_fechamento`, and `data_vencimento` is the accepted D010 card invoice cycle. Expected rows aggregate `valor_previsto` by `id_fatura`; `valor_fechado`, `valor_pago`, and `fonte_pagamento` stay blank while the invoice is only expected.

The expected upsert must fail closed and not modify invoices with status `fechada`, `paga`, `parcialmente_paga`, `divergente`, `ajustada`, or `cancelada` until an explicit reconciliation rule exists. It must not create `Pagamentos_Fatura`, must not create direct DRE rows, and installment purchases still must not create `Lancamentos_V54` during this phase.

Reason:
This gives card purchases and pending installment schedules a deterministic invoice aggregate without introducing payment settlement, reconciliation, or duplicate DRE recognition before those phases are accepted and tested.

## D042 - V54 Stale Processing Recovery Policy
Status: Accepted
Date: 2026-04-27

Decision:
Stale `Idempotency_Log` rows with `status=processing` are handled by an explicit local/fake-first recovery planner before any Telegram V54 routing or real spreadsheet mutation. The policy is opt-in through dependency injection and requires deterministic `now` plus configured `staleAfterMs`.

Fresh `processing` rows without matching domain mutation keep the existing `duplicate_processing` retryable block and do not produce recovery actions. Stale `processing` rows without any matching domain mutation may only produce a reviewed `MARK_IDEMPOTENCY_FAILED` plan with `error_code=STALE_PROCESSING_NO_DOMAIN_MUTATION`; they must not append a duplicate `processing` row automatically. `processing` rows with a matching deterministic `result_ref`/domain reference produce a reviewed `MARK_IDEMPOTENCY_COMPLETED` plan and must not apply the domain mutation again. Possible or mismatched domain mutation state blocks as manual review required. Failed rows remain non-retryable unless a future explicit policy is accepted.

Reason:
Webhook retries can arrive after a partial write window. Recovery must be visible, deterministic, and testable before V54 receives Telegram traffic, without silently creating duplicate financial rows or hiding ambiguous spreadsheet state.

Rejected:
- Silently recovering ambiguous domain state.
- Automatically appending a second `processing` row for the same idempotency key.
- Retrying failed rows without a separate accepted policy.

## D043 - V54 Idempotent Result References And Reviewed Recovery Executor
Status: Accepted
Date: 2026-04-27

Decision:
The V54 idempotent write path must use deterministic domain result references derived from the idempotency key. For idempotent simple/card launch paths, `id_lancamento` is `LAN_V54_IDEMP_<hash(idempotency_key)>`. For idempotent `compra_parcelada`, `id_compra` is `CP_V54_IDEMP_<hash(idempotency_key)>`. Non-idempotent fake/local paths may keep their existing injected or default ID behavior.

Crash recovery after `APPLY_DOMAIN_MUTATION` but before `MARK_IDEMPOTENCY_COMPLETED` may only plan completion when retry reconstructs the same deterministic result reference and finds the matching domain row. Random or non-reproducible result references must block as review-required.

Reviewed recovery application is modeled by a local-only executor/checklist. It can update only `Idempotency_Log` rows and only with `MARK_IDEMPOTENCY_FAILED` or `MARK_IDEMPOTENCY_COMPLETED`. It must never apply domain mutations. Completion recovery requires a reviewed checklist confirming the matched result reference; failed recovery requires a reviewed checklist confirming no matching domain mutation.

Reason:
The processing log is initially inserted with empty `result_ref`. If the domain mutation succeeds and completion marking fails, a retry must not depend on regenerating random IDs. Deterministic idempotent references make the already-written domain mutation discoverable while preserving explicit review for ambiguous states.

Rejected:
- Relying on random IDs being regenerated the same way.
- Applying recovery plans without a reviewed checklist.
- Letting the recovery executor apply `APPLY_DOMAIN_MUTATION` or any non-idempotency-log update.

## D044 - V54 Manual Shadow Runner Gate
Status: Accepted
Date: 2026-04-27

Decision:
`runV54ManualShadow` may only be invoked through a reviewed manual gate, not from `doPost`, `doGet`, Telegram routing, or any web event object. The gate accepts an explicit manual envelope with `mode`, `checklist`, `update`, and optional `runnerOptions`. The default mode is `fake_shadow`; `dry_run` validates the gate without calling the runner; `real_manual` is blocked unless `checklist.realRunApproved === true`.

The required checklist fields are `reviewed === true`, `manualOnly === true`, `doPostUnchanged === true`, and `telegramSendDisabled === true`. The gate must reject input shaped like Apps Script web events (`postData`, `parameter`, `parameters`, `queryString`, or equivalent request metadata) and must return structured results/errors.

Reason:
The manual/shadow runner composes parser, context, handler, idempotency, and write-path dependencies. A separate reviewed gate prevents accidental exposure through webhook or GET/POST routes while still allowing controlled fake-first review scenarios.

Rejected:
- Calling the V54 runner from `doPost` or `doGet`.
- Treating the gate as production readiness.
- Allowing real manual execution without explicit `realRunApproved`.
- Sending Telegram messages from the gate.

## D045 - V54 Real Manual Policy Diagnostics
Status: Accepted
Date: 2026-04-27

Decision:
Future `real_manual` V54 execution must pass a reviewed policy diagnostics contract before the manual gate can call the runner. The policy requires `mode=real_manual`, `realRunApproved === true`, an operator identity/label, synthetic manual input instead of webhook-shaped input, `doPost` unchanged/V54 not routed, `doGet` not exposing the V54 gate, Telegram send disabled, prior dry-run or fake-shadow acknowledgement, snapshot/export acknowledgement, `Idempotency_Log` present, all required V54 sheets present, headers matching the V54 schema mirror, and parser context readable.

The policy is fake-first and dependency-injected. Local tests use fake diagnostics, fake parser context, and fake sheets only. It is not a production readiness marker and does not authorize `doPost`, `doGet`, Telegram traffic, Telegram sends, real OpenAI calls, real SpreadsheetApp tests, setup, seed, deploy, or clasp execution.

Reason:
`real_manual` is more dangerous than fake/shadow because it can eventually run against real dependencies. A separate diagnostics contract keeps the checklist explicit and testable before any real mutation while preserving the current prohibition on route exposure and real service calls in tests.

Rejected:
- Treating `realRunApproved` alone as sufficient for `real_manual`.
- Accepting webhook-shaped input for manual execution.
- Running `real_manual` without prior fake/dry-run and snapshot acknowledgement.
- Exposing the policy or gate through `doPost` or `doGet`.

## D046 - V54 Real Manual Parser Context Evidence
Status: Accepted
Date: 2026-04-27

Decision:
`real_manual` parser context diagnostics require callable injected evidence. A boolean acknowledgement such as `diagnostics.parserContextReadable === true` is not sufficient. The policy must receive `options.getParserContext` as a function, call it with deterministic diagnostic input, and require a result object with `ok === true`; missing dependency, thrown exception, invalid result, or `ok:false` blocks the gate before the runner is called.

Reason:
Parser context is a dependency boundary for future real execution. Treating it as an acknowledgement flag could allow `real_manual` to pass without proving that canonical context can actually be read through the reviewed diagnostic path.

Rejected:
- Passing parser-context diagnostics with only an acknowledgement boolean.
- Letting `RunnerV54Gate` call the runner after parser-context policy failure.
- Treating this hardening as production readiness or route authorization.

## D047 - V54 Real Manual Evidence Envelope Contract
Status: Accepted
Date: 2026-04-28

Decision:
Future `real_manual` attempts must provide a canonical structured evidence envelope validated locally/fake-first. The validator is defined in `scripts/lib/v54-real-manual-evidence-contract.js` and may be consumed by `RunnerV54RealManualPolicy` through dependency injection (`validateEvidenceEnvelope`).

The envelope must include operator identity, timestamp/reference date, branch and commit marker (SHA or explicit local marker), route safety booleans (`mainJsDiffEmpty`, `doPostV54RefsAbsent`, `doGetV54RefsAbsent`, `telegramSendDisabled`), structured prior evidence objects (dry-run, fake-shadow or explicit accepted absence, snapshot/export), spreadsheet diagnostics with required sheets and per-sheet header status, parser context diagnostics object (`ran`, `ok`, `referenceDate`), and forbidden-actions confirmations.

Header diagnostics decision: prefix-compatible evidence is allowed only when `spreadsheetDiagnostics.allowExtraColumns === true` is explicit. If `allowExtraColumns` is missing, ambiguous, or false while extra columns are reported, the evidence must fail closed.

Reason:
Boolean acknowledgements were too weak for a future manual execution boundary. A structured envelope creates auditable evidence, blocks vague checklist-only approvals, and keeps V54 fake-first/manual-only without exposing `doPost`/`doGet` routes or real services in tests.

Rejected:
- Accepting parser/spreadsheet diagnostics as booleans only.
- Silently allowing extra columns without explicit policy.
- Treating evidence validation as production readiness or route authorization.


## D048 - V54 Real Manual Evidence Validator Is Mandatory
Status: Accepted
Date: 2026-04-28

Decision:
For `mode=real_manual`, `RunnerV54RealManualPolicy` must fail closed unless `validateEvidenceEnvelope` is injected and returns `{ ok: true }` for `input.evidence`. Missing validator, missing evidence, or malformed evidence must block before runner execution.

Reason:
Optional evidence validation leaves a safety gap where `real_manual` could proceed without audited envelope checks. Making validator + envelope mandatory keeps the boundary explicit and fake-first while preserving no-route exposure.

Rejected:
- Treating evidence-envelope validation as optional in real manual mode.
- Allowing `real_manual` to proceed when `input.evidence` is absent.

## D049 - V54 Real Manual Preflight Report Builder
Status: Accepted
Date: 2026-04-28

Decision:
Phase 5A adiciona um builder local/read-only de preflight para `real_manual` em `scripts/lib/v54-real-manual-preflight-report.js`. O builder retorna um report deterministico `real_manual_preflight` baseado em diagnosticos injetados para routing (`mainJsDiffEmpty`, ausencia de refs V54 em `doPost`/`doGet`), validade do evidence envelope canonico, parser context executado/legivel e compatibilidade de abas/headers V54 (incluindo `Idempotency_Log`).

O builder falha fechado com erros estruturados e sempre inclui o bloqueio canonico de acoes proibidas (`clasp`, `deploy`, `telegram`, `realOpenAI`, `realSpreadsheetMutation`). Ele nao chama runner, nao chama gate, nao chama Telegram/OpenAI, nao usa SpreadsheetApp real, nao executa setup/seed/deploy, e nao altera `doPost`/`doGet`.

Reason:
Antes de qualquer execucao manual revisada, e necessario um artefato de preflight auditavel e deterministico que consolide evidencias e diagnosticos sem abrir caminhos de execucao/mutacao. Isso reduz risco operacional e evita confundir preflight com ativacao de runtime.

Rejected:
- Acoplar preflight ao runner ou ao gate manual.
- Ler estado real via servicos de producao dentro do builder.
- Permitir overrides de blocked actions.


## D050 - Phase 5B Real Manual Preflight Diagnostics Collector
Status: Accepted
Date: 2026-04-28

Decision:
Phase 5B adiciona um collector local/read-only de diagnosticos de preflight `real_manual` em `scripts/lib/v54-real-manual-preflight-diagnostics-collector.js`. O collector recebe `deps.readTextFile`, le `src/Main.js`, extrai os corpos de `doPost` e `doGet` com parse de braces balanceadas (nao regex ingenua), detecta referencias proibidas de runtime V54 somente nesses corpos, monta `routingDiagnostics` e repassa evidencias/diagnosticos para `buildV54RealManualPreflightReport`.

O collector falha fechado quando `readTextFile` estiver ausente/falhar, `src/Main.js` estiver ausente/vazio, `routingDiagnostics.mainJsDiffEmpty` estiver ausente, `doPost`/`doGet` estiverem ausentes ou com braces desbalanceadas, ou quando houver tokens proibidos nos corpos extraidos.

Reason:
A Phase 5A exigia diagnosticos de roteamento ja prontos. O collector formaliza essa coleta local e auditavel sem alterar runtime de producao, reduzindo risco de falso positivo e evitando inspecao manual inconsistente de `src/Main.js` antes de qualquer tentativa futura de `real_manual`.

Rejected:
- Usar regex simples para extrair `doPost`/`doGet`.
- Escanear tokens fora dos corpos de `doPost` e `doGet`.
- Chamar runner/gate ou qualquer dependencia de mutacao durante o preflight collector.

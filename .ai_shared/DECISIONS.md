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
Status: Proposed
Date: 2026-04-26

Decision:
For initial local tests, a purchase belongs to the invoice whose closing date is the first closing date on or after the purchase date. A purchase on the closing day belongs to that closing cycle. A configured closing day that does not exist in a month is clamped to the month's last day. The due date is in the month after the closing date and is also clamped if needed.

Reason:
This provides deterministic behavior for Nubank Gustavo day 30, Mercado Pago Gustavo day 5, and Nubank Luana day 1 while keeping edge cases testable before spreadsheet implementation.

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
Status: Accepted
Date: 2026-04-26

Decision:
Treat V54 as a clean production start instead of migrating V53 historical data by default. V53 remains the temporary production/fallback flow until V54 has reviewed seed/config data, V54 write paths, reports, and Telegram validation.

Do not delete, rename, or hide V53 sheets yet, because current Apps Script commands still read from and write to V53 sheets such as `Config`, `Lancamentos`, `Dashboard`, `Investimentos`, and `Parcelas`.

Reason:
The user confirmed that V53 does not contain meaningful valid historical data. Migrating it would add semantic risk without value, especially around categories, investments, installments, invoices, and DRE behavior. A fresh V54 seed keeps the model cleaner and reduces migration work.

Rejected:
- Migrating V53 transaction history by default.
- Deleting or renaming V53 sheets before V54 write paths are production-ready.
- Treating visual duplication between V53 and V54 sheets as a schema error during the transition.


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

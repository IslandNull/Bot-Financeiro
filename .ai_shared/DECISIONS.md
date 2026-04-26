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

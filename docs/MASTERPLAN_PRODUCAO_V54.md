# MASTERPLAN PRODUCAO V54

Last updated: 2026-04-29
Branch: main
Status: MVP V54-only plan
Planning premise: V54 is the target product. V53 is completely deprecated and moved to `legacy/v53/`.

> **Authority note:** this masterplan is a planning/reference document. Accepted decisions in `.ai_shared/DECISIONS.md` prevail over any stale TODO/OPEN item here.

## 1. Executive Summary

DECISION: V54 is the only active runtime (D054). V53 has been entirely removed from the active source tree and now resides in `legacy/v53/`. 

VERIFIED: The V54 primary bridge is live. `doPost` processes messages via `V54_PRIMARY` directly without `V54_ROUTING_MODE`.

VERIFIED: V54 sheets, headers, and clean seed/config data exist in the real spreadsheet.

VERIFIED: Real Telegram usage, including logging, idempotency, and messages, has been successfully smoke-tested by the user.

## 2. Current Verified State

| Area | State |
|---|---|
| Repository | VERIFIED: branch `main`; V53 code is archived. |
| V54 schema & seed | VERIFIED: `scripts/lib/v54-schema.js` and `src/000_V54Schema.js` are synced with real spreadsheet. |
| Security | VERIFIED: `WEBHOOK_SECRET` is required and enforced. |
| V54 parser | VERIFIED: `ParserV54OpenAI` is integrated with robust guardrails (Phase 6K). |
| V54 actions | VERIFIED: `src/ActionsV54.js` handles fake-first writes, integrated into the V54 primary bridge. |
| Faturas | VERIFIED: schema exists. Expected upsert is implemented. |
| Pagamentos_Fatura | VERIFIED: schema exists. TODO: `pagamento_fatura` logic remains unsupported. |
| Reporting | VERIFIED: local deterministic reporting contracts exist. TODO: wire into Telegram/views. |
| Telegram V54 | VERIFIED: E2E routing, fail-closed, send logging, and real user smoke-tests are functional. |

## 3. Accepted Direction

- DECISION: V54 is the only target architecture for MVP (D031, D054).
- DECISION: Existing V54 sheets/seed are the starting point.
- DECISION: Card invoice payment is settlement, not operational expense.
- DECISION: Purchases/installments create expense recognition; fatura payment must not create duplicate DRE expense.
- DECISION: Recommendations start deterministic/rule-based before any LLM phrasing.

## 4. Domain Decision Status

### Accepted
See `.ai_shared/DECISIONS.md` for the full list of architectural and domain decisions. Decisions D001 through D054 have been accepted and govern the V54 implementation.

### Missing Inputs
The following inputs are still required for full operation:
- MISSING_INPUT: V54 opening date.
- MISSING_INPUT: Opening balances for account sources.
- MISSING_INPUT: Opening balances for Alelo/VA benefits.
- MISSING_INPUT: Open faturas at start date by card.
- MISSING_INPUT: Active installments still being paid.
- MISSING_INPUT: Caixa and Vasco debt details.

## 5. Roadmap

### Fase 1: Nucleo Transacional (Faturas e Relatorios)

Goal: complete V54 transaction behavior locally and prepare for real spreadsheet writes of complex entities.

Remaining TODOs:
- Implement `Pagamentos_Fatura` writes (respecting D036).
- Implement reconciliation: expected, closed, paid, partial, divergent.
- Implement adjustment/refund/cancellation behavior or explicit rejection.
- Add fake tests proving no duplicate DRE/acerto recognition.

### Fase 2: Comandos Secundários e E2E Telegram

Goal: finalize user-facing features on the active Telegram flow.

Remaining TODOs:
- Implement `/desfazer` ou equivalent V54 undo/reversal safely.
- Implement minimal V54 commands: `/saldo`, `/faturas`, `/fechar_mes` only if deterministic data supports them.
- Run negative webhook tests: missing secret, invalid secret, unauthorized chat against real endpoint.

### Fase 3: Relatorios E Recomendacoes Deterministicas

Goal: provide useful decision support without fake precision.

Required reports:
- TODO: operational DRE; faturas next 60 days; installments future exposure; reserve progress; home earmark outside reserve; debts with known limitations; net worth; acerto casal; monthly closing.

Required recommendation rules:
- TODO: reserve below minimum; upcoming fatura pressure; large purchase safety check; large surplus allocation; 13th salary, vacation pay, bonus, extra income; amortization only when debt/reserve/invoice gates allow it.

## 6. MVP Acceptance Criteria

V54 MVP is ready for real household use only when all applicable items are VERIFIED:

- VERIFIED: V53 is documented as deprecated prototype with no new features.
- VERIFIED: V54 domain decisions are recorded and accepted decisions live in `.ai_shared/DECISIONS.md`.
- VERIFIED: Rateio (D032) and benefits (D033) rules are implemented and tested.
- VERIFIED: Idempotency (D038) is implemented and tested.
- VERIFIED: Fatura expected (D041).
- VERIFIED: Telegram V54 E2E passes.
- TODO: Opening state is reviewed.
- TODO: Fatura closed/paid/reconciliation lifecycle is implemented and tested.
- TODO: `Pagamentos_Fatura` never affects operational DRE.
- TODO: Purchases/installments are recognized once.
- TODO: Adjustments/refunds/cancellations (D039) are supported or safely rejected.
- TODO: Reports use V54 data only.
- TODO: Privacy rules are enforced.
- TODO: Recommendations are deterministic and expose missing data.

## 7. References

- `.ai_shared/ACTIVE_CONTEXT.md`
- `.ai_shared/DECISIONS.md`
- `.ai_shared/KNOWN_ISSUES.md`
- `.ai_shared/FORMULA_STANDARD.md`
- `.ai_shared/SHEET_SCHEMA.md`

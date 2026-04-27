# MASTERPLAN PRODUCAO V54

Last updated: 2026-04-27
Branch: feat/v54-production-readiness
Status: MVP V54-only plan
Planning premise: V54 is the target product. V53 is a deprecated historical prototype, not a mandatory production fallback.

## 1. Executive Summary

DECISION: The project is still in development. V53 was a prototype and must not be treated as active production or mandatory fallback in V54 planning.

VERIFIED: The repo still contains V53-era code, sheets, tests, and routing helpers. They are historical/deprecated unless a later task explicitly migrates or removes them.

VERIFIED: V54 sheets, headers, and clean seed/config data exist in the real spreadsheet snapshot according to `.ai_shared/ACTIVE_CONTEXT.md` and `.ai_shared/SPREADSHEET_STATE.md`.

VERIFIED: V54 local/fake-first work exists for schema, seed, setup planner, parser contract, mapper, ActionsV54, reporting contracts, card cycle, single card purchase, and installment scheduling.

VERIFIED: V54 is not wired end-to-end into Telegram routing yet. `recordEntryV54()` remains isolated from `doPost`, `Parser.js`, `Actions.js`, `Commands.js`, and Telegram production behavior.

TODO: Build the MVP directly as V54-only instead of preserving V53 as a runtime fallback.

TODO: Treat V53 cleanup as technical-debt removal, not as a production cutover/sunset program.

## 2. Product Goal

Build a minimal but correct household finance bot for Gustavo and Luana using V54 as the only target architecture.

MVP scope:

- record day-to-day cash expenses and income in `Lancamentos_V54`;
- record card purchases without duplicate DRE recognition;
- schedule installment purchases in `Compras_Parceladas` and `Parcelas_Agenda`;
- model faturas, invoice payments, and reconciliation safely enough for real use;
- preserve privacy through `visibilidade`;
- support deterministic monthly reports before any LLM recommendation;
- validate real spreadsheet writes through protected tests before Telegram V54 goes live.

Non-goals for MVP:

- no migration of V53 history;
- no new V53 features;
- no V53 fallback gate;
- no LLM financial advice before deterministic facts are reliable;
- no unsupported debt amortization advice;
- no irreversible spreadsheet mutation without protected tests and cleanup.

## 3. Current Verified State

| Area | State |
|---|---|
| Repository | VERIFIED: branch `feat/v54-production-readiness`; working tree clean at startup on 2026-04-27. |
| Package scripts | VERIFIED: local scripts exist for V53 and V54 tests. V53 scripts are legacy/deprecated under the new premise. |
| Formula standard | VERIFIED: use `range.setFormula()` with English function names and semicolon separators. |
| V54 schema | VERIFIED: `scripts/lib/v54-schema.js` declares 14 V54 sheets. |
| Real V54 sheets | VERIFIED: V54 sheets and headers exist in the real spreadsheet snapshot. |
| V54 seed | VERIFIED: clean seed/config data exists for categories, sources, incomes, cards, assets, debts, and future home forecast. |
| V54 setup/seed | VERIFIED: dry-run-first, additive, lock-protected setup/seed mechanisms exist. Do not rerun without explicit task approval. |
| Security | VERIFIED: local code requires `WEBHOOK_SECRET` before trusting Telegram payload/chat data. |
| Mutating GET | VERIFIED: known mutating GET actions are blocked locally. |
| Locking | VERIFIED: `withScriptLock()` exists and local tests cover current guarded write paths. |
| V54 parser | VERIFIED: ParserV54 is local-only and contract-based; it does not call OpenAI. |
| V54 actions | VERIFIED: `src/ActionsV54.js` supports fake-first writes for simple events, card purchase, and installment schedule. |
| Faturas | VERIFIED: schema exists. TODO: production lifecycle is not implemented. |
| Pagamentos_Fatura | VERIFIED: schema exists. TODO: `pagamento_fatura` remains unsupported in `ActionsV54`. |
| Reporting | VERIFIED: local deterministic reporting contracts exist. TODO: not wired into Telegram/views. |
| Telegram V54 | TODO: V54 Telegram end-to-end is not implemented or verified. |
| Production negative webhook tests | TODO: missing against real endpoint. |

## 4. Accepted Direction

- DECISION: V54 is the only target architecture for MVP.
- DECISION: V53 is deprecated prototype code. Do not add features to it.
- DECISION: Do not migrate V53 history by default.
- DECISION: Existing V54 sheets/seed are the starting point, but opening state must still be reviewed before real usage.
- DECISION: Card invoice payment is settlement, not operational expense.
- DECISION: Purchases/installments create expense recognition; fatura payment must not create duplicate DRE expense.
- DECISION: Recommendations start deterministic/rule-based before any LLM phrasing.
- DECISION: Real spreadsheet writes require protected tests with deterministic fixtures and cleanup.

## 5. Open Domain Decisions

PROPOSTA: detailed proposals for the blocking MVP domain decisions are now documented in `docs/V54_DOMAIN_DECISIONS.md`.

TODO: after human review, accepted items must be recorded in `.ai_shared/DECISIONS.md` and converted into local/fake-first tests before implementation.

| Decision | Label | Why It Matters |
|---|---|---|
| V54 opening date and competence | OPEN_DECISION | Defines starting invoices, balances, installments, and reports. |
| Cash income for rateio | OPEN_DECISION | Local tests use Gustavo `3400` and Luana `3500`; seed also has Gustavo fuel allowance `1200` with `afeta_rateio=true`. |
| Benefits in acerto/DRE/cash | OPEN_DECISION | Alelo/VA are restricted resources and cannot be treated like ordinary cash without explicit rule. |
| `Fora orcamento` scope | OPEN_DECISION | Schema allows it, parser/actions currently reject it. |
| Home earmark taxonomy | OPEN_DECISION | Seed uses `Itens da casa`; reporting helper classifies home earmark as `Casa`/`home`. |
| Global ID strategy | OPEN_DECISION | Real Telegram retries/import duplicates require idempotency. |
| Dedupe mechanism | OPEN_DECISION | Need source message IDs, idempotency log, or deterministic dedupe keys. |
| Fatura state machine | OPEN_DECISION | Need expected, closed, paid, partial, divergent, adjusted/cancelled behavior. |
| Invoice payment acerto rule | OPEN_DECISION | Must avoid counting purchase and fatura payment as the same couple expense. |
| Refunds/chargebacks/cancellations | OPEN_DECISION | Needed before card use is safe in real life. |
| Corrections/adjustments | OPEN_DECISION | Need immutable reversal/adjustment rules before Telegram usage. |
| Debt payment semantics | OPEN_DECISION | `divida_pagamento` exists in parser contract but is not supported in ActionsV54. |
| Protected real test surface | OPEN_DECISION | Need safe write/cleanup route before real spreadsheet mutation tests. |

## 6. Missing Inputs

- MISSING_INPUT: V54 opening date.
- MISSING_INPUT: Opening balances for account sources.
- MISSING_INPUT: Opening balances for Alelo/VA benefits.
- MISSING_INPUT: Open faturas at start date by card.
- MISSING_INPUT: Active installments still being paid.
- MISSING_INPUT: Caixa debt details: current balance, installment, remaining term, interest/rate, amortization system, start date.
- MISSING_INPUT: Vasco debt details: current balance, installment, remaining term, interest/rate, amortization system, start date.
- MISSING_INPUT: Whether Gustavo fuel allowance is included in `3400` or additional to it.
- MISSING_INPUT: Privacy defaults for personal categories.
- MISSING_INPUT: Thresholds for large purchase, large surplus, and recommendation triggers.
- MISSING_INPUT: Confirmation of future home activation date and forecast values.

## 7. MVP Domain Rules

### 7.1 Transactions

VERIFIED: `Lancamentos_V54` is the target transaction/recognition table.

MVP rule:

- Store positive values.
- Use `tipo_evento`, category behavior, and flags to decide DRE/acerto/patrimony effects.
- Do not write `undefined`; optional links must be blank strings.
- Use immutable corrections rather than silently editing historical records after Telegram usage begins.

### 7.2 Cards, Installments, And Faturas

VERIFIED: Card cycle local contract exists.

VERIFIED: `compra_cartao` fake path writes one `Lancamentos_V54` row with computed `id_fatura`.

VERIFIED: `compra_parcelada` fake path writes one `Compras_Parceladas` row and N `Parcelas_Agenda` rows, not `Lancamentos_V54` or `Faturas` rows.

MVP requirements:

- Implement `Faturas` upsert/generation from card purchases and installments.
- Implement `Pagamentos_Fatura` as settlement only with `afeta_dre=false`.
- Support full payment, partial payment, and divergence.
- Define how expected, closed, and paid values reconcile.
- Support or explicitly reject refunds, chargebacks, cancellations, and adjustments before Telegram V54.

### 7.3 Rateio And Acerto

VERIFIED: `Acertos_Casal` schema exists.

VERIFIED: local reporting excludes `receita` from couple settlement.

MVP requirements:

- Resolve income base for rateio.
- Resolve how benefits reduce or credit shared spending.
- Define whether card purchase recognition or fatura payment drives acerto.
- Prevent duplicate acerto from purchase plus invoice settlement.
- Keep private details out of shared detailed views.

### 7.4 Assets, Reserve, And Debts

VERIFIED: Current home-item assets total `16635` in seed and are not emergency reserve.

MVP requirements:

- Emergency reserve counts only assets with `conta_reserva_emergencia=true`.
- Home earmarked assets must remain visible but excluded from reserve.
- Debt reports must label unknown interest/principal split instead of inventing precision.
- No amortization recommendation until reserve, invoices, and debt data are reliable.

### 7.5 Reports And Recommendations

VERIFIED: deterministic reporting contracts exist locally.

MVP rule:

- Facts first: DRE, faturas, installments, reserve, debts, net worth, acerto.
- Recommendations second: deterministic rules only.
- LLM wording later, if ever, must only explain deterministic outputs.

## 8. Roadmap

### Fase 0: Reset De Premissa E Limpeza V53

Goal: remove false V53-production assumptions from planning and prevent new V53 work.

Status:

- TODO: Mark V53 as deprecated prototype in docs/context.
- TODO: Stop using V53 as required fallback in roadmap, gates, rollback, and acceptance criteria.
- TODO: Keep V53 files only as legacy reference until removal is safe.
- TODO: Do not add new features to V53.
- TODO: Review scripts/docs that imply V53 production and either reword or mark deprecated.

Out of scope:

- Do not delete V53 code in this documentation phase.
- Do not rename/delete V53 sheets in this documentation phase.

### Fase 1: Decisoes De Dominio

Goal: close the domain decisions that would otherwise corrupt financial reporting.

Required outputs:

- PROPOSTA: review `docs/V54_DOMAIN_DECISIONS.md` and accept/reject/adjust each proposed rule.
- TODO: Opening date and opening competence.
- TODO: Income/rateio rule, including Gustavo fuel allowance.
- TODO: Benefit rule for Alelo/VA.
- TODO: Fatura state machine and reconciliation rule.
- TODO: Payment/acerto rule.
- TODO: ID/idempotency/dedupe design.
- TODO: Refund/chargeback/cancellation/adjustment semantics.
- TODO: Debt payment semantics or explicit MVP exclusion.
- TODO: Privacy defaults.

Exit criteria:

- VERIFIED: decisions recorded in `.ai_shared/DECISIONS.md`.
- VERIFIED: tests or TODO test cases identified for each accepted decision.

### Fase 2: Nucleo Transacional V54 Local/Fake-First

Goal: complete V54 transaction behavior locally before real spreadsheet writes.

Already verified locally:

- schema and seed contracts;
- strict ParsedEntryV54;
- ParserV54 adapter;
- Lancamentos_V54 mapper;
- ActionsV54 simple events;
- single card purchase fake write path;
- installment schedule fake write path;
- reporting contracts.

Next TODOs:

- Implement local/fake-first `Faturas` expected upsert.
- Implement local/fake-first `Pagamentos_Fatura` writes.
- Implement local/fake-first reconciliation: expected, closed, paid, partial, divergent.
- Implement local/fake-first idempotency/dedupe checks.
- Implement local/fake-first adjustment/refund/cancellation behavior or explicit rejection.
- Add fake tests proving no duplicate DRE/acerto recognition.

Exit criteria:

- VERIFIED: local tests pass for all MVP transaction types.
- VERIFIED: unsupported events fail closed with structured errors.
- VERIFIED: no OpenAI/vendor/API calls in deterministic tests.

### Fase 3: Testes Reais Protegidos Na Planilha

Goal: prove V54 writes against the real spreadsheet through deterministic protected tests with cleanup.

Do not start until Phase 1 and Phase 2 exit criteria are met.

Required tests:

- TODO: simple despesa write and cleanup in `Lancamentos_V54`;
- TODO: receita write and cleanup;
- TODO: card purchase with expected fatura and cleanup;
- TODO: installment schedule and cleanup;
- TODO: full fatura payment and cleanup;
- TODO: partial fatura payment and reconciliation cleanup;
- TODO: duplicate/idempotency rejection;
- TODO: adjustment/refund/cancellation behavior or explicit rejection;
- TODO: snapshot verification after cleanup.

Safety rules:

- Use deterministic low-value fixtures.
- Prefix all test IDs/descriptions with a V54 test marker.
- Fail closed if cleanup cannot be guaranteed.
- Do not call OpenAI.
- Do not use Telegram for these tests.
- Do not run setup, seed, deploy, or migration as part of protected write tests.

### Fase 4: Telegram V54

Goal: route Telegram to V54 only after protected real writes are verified.

Required work:

- TODO: wire ParserV54 and ActionsV54 into Telegram flow.
- TODO: ensure webhook secret validation still runs before parsing/routing.
- TODO: implement authorization and fail-closed handling.
- TODO: implement `/desfazer` or equivalent V54 undo/reversal safely.
- TODO: implement minimal V54 commands: `/saldo`, `/hoje`, `/faturas`, `/parcelas`, `/fechar_mes` only if deterministic data supports them.
- TODO: run production negative webhook tests: missing secret, invalid secret, unauthorized chat.
- TODO: run V54 Telegram E2E with controlled write and cleanup.

Exit criteria:

- VERIFIED: V54 Telegram write path works end-to-end.
- VERIFIED: cleanup/reversal works.
- VERIFIED: negative webhook tests do not write data.
- VERIFIED: no V53 write path is required for MVP operation.

### Fase 5: Relatorios E Recomendacoes Deterministicas

Goal: provide useful decision support without fake precision.

Required reports:

- TODO: operational DRE;
- TODO: faturas next 60 days;
- TODO: installments future exposure;
- TODO: reserve progress;
- TODO: home earmark outside reserve;
- TODO: debts with known limitations;
- TODO: net worth;
- TODO: acerto casal;
- TODO: monthly closing.

Required recommendation rules:

- TODO: reserve below minimum;
- TODO: upcoming fatura pressure;
- TODO: large purchase safety check;
- TODO: large surplus allocation;
- TODO: 13th salary, vacation pay, bonus, extra income;
- TODO: amortization only when debt/reserve/invoice gates allow it.

Exit criteria:

- VERIFIED: reports use deterministic V54 data only.
- VERIFIED: private entries do not leak into shared detailed reports.
- VERIFIED: recommendations expose missing data instead of inventing conclusions.

## 9. Test Strategy

Local deterministic tests:

- VERIFIED: existing V54 local tests cover schema, seed, setup, snapshot, security, routing foundation, domain, parser contract, parser adapter, mapper, actions, reporting, card cycle, card purchase, and installment schedule.
- TODO: add local tests for fatura upsert, payments, reconciliation, idempotency, dedupe, adjustments, refunds, cancellations, and debt payments or explicit exclusions.

Fake spreadsheet tests:

- VERIFIED: existing fake tests cover setup/seed/actions behavior.
- TODO: add fake tests for all MVP transaction flows before real writes.

Protected real spreadsheet tests:

- TODO: not implemented for V54 MVP transaction flows.
- TODO: must run only after explicit approval in a later task.

Telegram E2E tests:

- TODO: not implemented for V54.
- TODO: must run only after protected real spreadsheet tests pass.

## 10. Safety Rules

Hard constraints:

- Do not run setup, seed, deploy, clasp, real tests, spreadsheet mutation, migration, or Telegram mutation without explicit task approval.
- Do not read or commit `.env` or secrets.
- Do not add V53 features.
- Do not claim V54 Telegram readiness until V54 E2E is verified.
- Do not claim fatura/payment readiness until protected write tests verify it.
- Do not use LLM recommendations before deterministic reports are correct.

Rollback within V54-only MVP:

- Prefer cleanup by deterministic test IDs for protected tests.
- Prefer reversal/adjustment records for real user data after Telegram starts.
- If a V54 path is unsafe, disable that V54 feature path rather than returning to a V53 product fallback.
- Spreadsheet backup/export is required before broad real-data mutation phases.

## 11. MVP Acceptance Criteria

V54 MVP is ready for real household use only when all applicable items are VERIFIED:

- V53 is documented as deprecated prototype with no new features.
- V54 domain decisions are recorded.
- Opening state is reviewed.
- Rateio and benefits rules are implemented and tested.
- ID/idempotency/dedupe are implemented and tested.
- Fatura expected/closed/paid/reconciliation lifecycle is implemented and tested.
- `Pagamentos_Fatura` never affects operational DRE.
- Purchases/installments are recognized once.
- Adjustments/refunds/cancellations are supported or safely rejected.
- Protected real spreadsheet tests pass with cleanup.
- Production negative webhook tests pass.
- Telegram V54 E2E passes.
- Reports use V54 data only.
- Privacy rules are enforced.
- Recommendations are deterministic and expose missing data.

## 12. Removed From Previous Plan

Removed because it depended on the false premise that V53 was production or mandatory fallback:

- `V53_CURRENT` as production-flow assumption.
- V53 fallback as a required gate for V54 rollout.
- Cutover plan from V53 production to V54 production.
- Rollback plan that returns to V53 write path.
- Sunset plan for retiring a production V53 system.
- Acceptance criteria requiring V53 tests as production successor gates.
- Requirement to keep V53 sheets because production depends on them.
- Framing of Telegram positive test as proof of production V53 readiness.
- Migration/fallback language around V53 transaction history.
- Roadmap phases focused on preserving V53 while staging V54.

V53 may still remain in the repository temporarily as deprecated reference code, but it is not a product target and should not receive new features.

## 13. References

- `.ai_shared/ACTIVE_CONTEXT.md`
- `.ai_shared/DECISIONS.md`
- `.ai_shared/KNOWN_ISSUES.md`
- `.ai_shared/FORMULA_STANDARD.md`
- `.ai_shared/SPREADSHEET_STATE.md`
- `docs/V54_DOMAIN_DECISIONS.md`
- `scripts/lib/v54-schema.js`
- `scripts/lib/v54-seed.js`
- `src/ActionsV54.js`
- `docs/MASTERPLAN_REFATORACAO_V54.md`

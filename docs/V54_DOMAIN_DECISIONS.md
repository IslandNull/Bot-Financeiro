# V54 DOMAIN DECISIONS

Last updated: 2026-04-27
Branch: feat/v54-production-readiness
Status: ACEITA - Approved with adjustments 2026-04-27
Planning premise: V54-only MVP. V53 is deprecated prototype, not production and not fallback.

## 1. Purpose

This document proposes the blocking V54 domain decisions needed before implementation continues.

It does not implement code, mutate the spreadsheet, run setup/seed/deploy/clasp, run real tests, or change Telegram behavior.

Status labels:

| Label | Meaning |
|---|---|
| ACEITA | Already accepted in repo decisions or explicitly confirmed by user. |
| PROPOSTA | Recommended rule for human approval before implementation. |
| BLOQUEADA_POR_INPUT | Cannot be safely closed without a human/business input. |

Truth labels:

| Label | Meaning |
|---|---|
| VERIFIED | Confirmed in repo files or current context. |
| ASSUMPTION_TO_VALIDATE | Inferred working rule that must be confirmed before implementation. |
| TODO | Follow-up implementation or test work after acceptance. |

## 2. Verified Baseline

| Area | Baseline |
|---|---|
| MVP premise | ACEITA: V54 is the only target architecture; V53 is deprecated prototype. |
| Seed incomes | VERIFIED: `scripts/lib/v54-seed.js` defines Gustavo salary `3400`, Luana salary `3500`, Gustavo Alelo `1500`, Luana VA `300`, and Gustavo fuel allowance `1200`. |
| Seed income flags | VERIFIED: salaries and fuel allowance use `afeta_rateio=true`; Alelo/VA use `uso_restrito=true` and `afeta_rateio=false`. |
| Sources | VERIFIED: `Config_Fontes` supports `conta`, `cartao`, `beneficio`, `dinheiro`, and `investimento`. |
| Scope enum | VERIFIED: `scripts/lib/v54-schema.js` currently allows `Casal`, `Gustavo`, `Luana`, and `Fora orcamento`. |
| Faturas schema | VERIFIED: `Faturas` has `valor_previsto`, `valor_fechado`, `valor_pago`, `fonte_pagamento`, and `status`. |
| Payments schema | VERIFIED: `Pagamentos_Fatura` has `afeta_dre`, `afeta_acerto`, and `afeta_patrimonio`. |
| Card expense rule | ACEITA: card purchases/installments create expense recognition; invoice payment is settlement and must not be operational expense. |
| Home earmark | VERIFIED: seed assets use `destinacao='Itens da casa'` and `conta_reserva_emergencia=false`. |
| Current V54 action support | VERIFIED: simple events, single card purchase, and installment schedule have local/fake-first support; fatura payment remains unsupported. |

## 3. Decision D1 - Income Base And Rateio

Status: PROPOSTA

Recommended rule:

| Item | Rule |
|---|---|
| Rateio base | Use only recurring unrestricted incomes from `Rendas` with `afeta_rateio=true`. |
| Gustavo base | Use `REN_GU_SALARIO_LIQUIDO` plus `REN_GU_AUX_COMBUSTIVEL` while the seed remains as-is. Current seed-derived base: `3400 + 1200 = 4600`. |
| Luana base | Use `REN_LU_SALARIO_LIQUIDO`. Current seed-derived base: `3500`. |
| Benefits | Exclude Alelo/VA/VR from rateio base because they are `uso_restrito=true` and `afeta_rateio=false`. |
| Monthly snapshot | Compute rateio from the `Rendas` snapshot valid for the closing month, not from a mutable current total after the month is closed. |

Derived seed ratio if accepted:

| Pessoa | Base | Percentual |
|---|---:|---:|
| Gustavo | 4600 | 56.79% |
| Luana | 3500 | 43.21% |
| Total | 8100 | 100.00% |

Important caveat:

- ASSUMPTION_TO_VALIDATE: `REN_GU_AUX_COMBUSTIVEL` is additional to Gustavo salary, not already included in the `3400`.
- If the fuel allowance is only a reimbursement for a restricted work cost, change it to `uso_restrito=true` and `afeta_rateio=false`.
- Fuel expenses themselves should remain personal Gustavo expenses unless explicitly reclassified as household expenses.

Implementation notes after acceptance:

- TODO: Add deterministic tests for monthly rateio with and without restricted benefits.
- TODO: Add a closing test proving historical `Acertos_Casal` does not change when future `Rendas` rows are edited.

## 4. Decision D2 - VA/VR/Alelo Treatment

Status: PROPOSTA

Recommended rule:

| Dimension | Rule |
|---|---|
| Nature | Treat VA/VR/Alelo as restricted household resources, not ordinary free cash. |
| DRE | Show benefits in a separate restricted-income line. Do not mix them silently into salary/free-cash income. |
| Caixa | Do not count benefits as available free cash, emergency reserve, or investment capacity. |
| Rateio | Do not include benefits in the rateio base. |
| Acerto | Benefit-funded shared expenses do not generate personal credit to the benefit holder. They reduce the shared expense still needing cash settlement. |
| Eligible use | MVP eligible categories: market/food categories only unless user expands the list. |
| Privacy | Benefit source can appear in shared reports as summary; detailed item visibility follows the category `visibilidade_padrao`. |

Rationale:

- This respects the seed flags (`uso_restrito=true`, `afeta_rateio=false`) and avoids making Gustavo or Luana owe each other because one benefit card was used for a shared purchase.
- It avoids overstating free cash by treating restricted benefits like bank account cash.

Schema gap:

- VERIFIED: `Config_Fontes` identifies benefit sources, but there is no explicit opening/current balance field for benefit balances.
- TODO: Before showing available benefit balance, either derive it from an opening balance plus transactions or add a small balance/opening-state model.

Implementation notes after acceptance:

- TODO: Add tests for DRE with salary, restricted benefit income, benefit-paid market expense, and cash-paid market expense.
- TODO: Add tests proving benefit-paid expenses do not credit the holder in `Acertos_Casal`.

## 5. Decision D3 - `Fora orcamento`

Status: PROPOSTA

Recommended rule:

Do not support `Fora orcamento` as a regular MVP scope.

Use this instead:

| User intent | MVP representation |
|---|---|
| Personal expense to track privately | `escopo=Gustavo` or `escopo=Luana`, `visibilidade=privada`, `afeta_acerto=false`. |
| Transfer/investment/reserve/debt movement | Proper `classe_dre`/category flags, not `Fora orcamento`. |
| Event that should not be tracked at all | Reject or ignore explicitly; do not write a hidden budget row. |

Reason:

- `Fora orcamento` as scope is ambiguous: it can mean private, excluded from DRE, excluded from acerto, non-household, or do-not-track.
- Ambiguity here can hide expenses, leak privacy, or corrupt reports.

Compatibility note:

- VERIFIED: the schema enum still includes `Fora orcamento`.
- TODO: Leave it disabled/rejected in parser/actions for MVP or remove it from the schema in a later cleanup if tests confirm no dependency.

## 6. Decision D4 - Taxonomy For Home-Earmarked Assets

Status: PROPOSTA

Recommended taxonomy for `Patrimonio_Ativos.destinacao`:

| Canonical value | Meaning | Counts as reserve? |
|---|---|---|
| `Itens da casa` | Money earmarked for furniture, appliances, and initial home items. | No |
| `Reserva emergencia` | Money explicitly assigned to emergency reserve. | Yes, only if `conta_reserva_emergencia=true` |
| `Investimento livre` | Invested money not earmarked for home items, reserve, or monthly cash. | No |
| `Caixa operacional` | Cash intended for current monthly operation. | No |
| `Casa - entrada e custos` | Future home acquisition, documentation, taxes, or moving costs if tracked separately. | No |

Rules:

- `conta_reserva_emergencia` remains the authority for reserve inclusion.
- `destinacao='Itens da casa'` must be shown as earmarked patrimony, not emergency reserve and not free investment.
- Do not infer emergency reserve from liquidity, institution, or account type.

Implementation notes after acceptance:

- TODO: Add validation/test fixtures for each canonical `destinacao`.
- TODO: Add a report line separating emergency reserve, home earmark, and unrestricted patrimony.

## 7. Decision D5 - Couple Acerto For Card Purchases And Invoice Payments

Status: PROPOSTA

Recommended model:

| Event | DRE effect | Acerto effect | Cash/patrimony effect |
|---|---|---|---|
| Cash/debit shared expense | Expense recognized once in `Lancamentos_V54`. | Payer receives credit in the same competence. | Cash leaves payer source immediately. |
| Single card purchase | Expense recognized once in `Lancamentos_V54` using invoice competence. | Creates shared obligation, but does not credit the card holder yet. | No cash leaves until fatura payment. |
| Installment purchase | Schedule is created first. Each recognized parcel creates expense in its fatura competence when implemented. | Creates shared obligation per recognized parcel. | No cash leaves until fatura payment. |
| Fatura payment | No operational DRE expense. | Credits the person/source that actually paid, allocated to the fatura competence and capped to shared eligible fatura items. | Cash leaves payment source and reduces card liability. |
| Benefit-funded shared expense | Expense is visible in DRE/restricted-resource view. | No personal credit to benefit holder. | Restricted benefit balance decreases when balance tracking exists. |

Allocation rule for fatura payments:

- Use `id_fatura` to allocate the payment to the fatura competence, not the calendar month of `data_pagamento`.
- Only fatura items with `escopo=Casal` and `afeta_acerto=true` participate in couple acerto.
- Personal/private card items remain outside couple acerto even if paid in the same fatura.
- Partial payments produce partial acerto status; they do not close the month.
- Divergent faturas block final monthly closing until adjusted or explicitly accepted.

Reason:

- This prevents duplicate acerto from both purchase and invoice payment.
- It matches the accepted rule that fatura payment is settlement, not expense.

Implementation notes after acceptance:

- TODO: Add fake tests with one fatura containing mixed casal, personal, and benefit-funded items.
- TODO: Add tests proving card holder is not credited at purchase time.
- TODO: Add tests proving fatura payment credits the actual payer without creating DRE expense.

## 8. Decision D6 - Minimal Fatura State Machine

Status: PROPOSTA

Recommended statuses:

| Status | Meaning | Required fields |
|---|---|---|
| `prevista` | Generated from expected card purchases/installments before official invoice close. | `valor_previsto`, `data_fechamento`, `data_vencimento` |
| `fechada` | Official invoice value was reviewed/entered. | `valor_fechado` |
| `parcialmente_paga` | Sum of valid payments is greater than zero and less than the target value. | `valor_pago` |
| `paga` | Sum of valid payments equals the target value. | `valor_pago` |
| `divergente` | Expected, closed, paid, or line-item values do not reconcile. | observation/test evidence |
| `cancelada` | Invoice was created in error or has no valid remaining items and no valid payments. | cancellation reason |
| `ajustada` | Invoice reconciles only after explicit adjustment rows/events. | adjustment references |

Target value rule:

- Use `valor_fechado` once the fatura is `fechada`, `parcialmente_paga`, `paga`, `divergente`, or `ajustada`.
- Use `valor_previsto` only while status is `prevista`.
- In MVP, block fatura payment before `fechada` unless a later accepted rule explicitly supports prepayment.

Allowed transitions:

| From | To |
|---|---|
| `prevista` | `fechada`, `cancelada`, `divergente` |
| `fechada` | `parcialmente_paga`, `paga`, `divergente`, `ajustada` |
| `parcialmente_paga` | `paga`, `divergente`, `ajustada` |
| `divergente` | `ajustada`, `cancelada` only if no valid payments exist |
| `ajustada` | `parcialmente_paga`, `paga`, `divergente` |

Implementation notes after acceptance:

- TODO: Add a pure local state-machine helper before any spreadsheet write path.
- TODO: Add fake tests for every allowed transition and key rejected transition.

## 9. Decision D7 - ID, Dedupe, And Idempotency

Status: PROPOSTA

Recommended ID rules:

| Entity | Strategy |
|---|---|
| `id_lancamento` | Generated unique event ID with prefix `LAN_`; do not derive from mutable description/value alone. |
| `id_compra` | Generated unique purchase ID with prefix `CMP_`; injected generator must disambiguate same-day same-card same-description purchases. |
| `id_parcela` | Deterministic from `id_compra` plus parcel number, for example `PAR_{id_compra}_{NN}`. |
| `id_fatura` | Deterministic aggregate ID from card and competence, preserving the accepted pattern `FAT_{id_cartao}_{YYYY_MM}`. |
| `id_pagamento` | Generated unique payment ID with prefix `PAG_`; payment idempotency is handled by idempotency key, not by amount/date alone. |
| `id_divida` | Stable configured debt ID from `Dividas`. |
| Closing records | Deterministic by competence, for example one `Fechamentos_Mensais` row per `competencia`. |

Recommended idempotency model:

- Add an MVP idempotency registry before Telegram V54 writes.
- Proposed sheet/entity: `Idempotency_Log`.
- Minimum fields: `idempotency_key`, `source`, `source_event_id_hash`, `payload_hash`, `target_entity`, `target_id`, `status`, `created_at`.
- Telegram idempotency key should be based on source plus chat/user alias plus Telegram message/update ID, with sensitive IDs hashed or redacted.
- Replaying the same `idempotency_key` must return the original result and must not append another financial row.

Recommended dedupe model:

- Idempotency handles exact transport retries.
- Semantic dedupe warns or blocks likely human duplicates using date, value, category, source/card, person, and normalized description.
- Semantic dedupe must not silently merge records. It should fail with a reviewable duplicate warning.

Schema gap:

- VERIFIED: current V54 schema has no idempotency log and no source event columns.
- TODO: Accept either a new `Idempotency_Log` sheet or explicit source/idempotency fields before Telegram V54 write routing.

Implementation notes after acceptance:

- TODO: Add fake tests proving replay writes zero new rows.
- TODO: Add fake tests for same-message retry and same-value human duplicate as separate cases.

## 10. Decision D8 - Adjustment, Refund, Chargeback, And Cancellation Semantics

Status: PROPOSTA

Recommended principle:

Use immutable compensating records after real usage begins. Do not silently edit or delete historical user records except deterministic protected test cleanup.

Minimum semantics:

| Event | Rule |
|---|---|
| `ajuste` | Administrative correction. Must reference the original event and explain the reason. It may affect DRE/acerto/patrimony according to the corrected dimension. |
| `estorno` | Merchant/card refund that reverses a prior recognized purchase. Record as a reversing event linked to the original purchase or parcel. |
| `chargeback` | Dispute credit. Do not treat as final refund until the card/bank posts a confirmed credit. Pending dispute remains out of MVP or is recorded as non-final observation. |
| `cancelamento` | Cancellation before recognition should mark purchase/schedule as cancelled. Cancellation after recognition requires a reversing event. |

Competence rule:

- If refund/credit appears on the same fatura before close, adjust the same fatura.
- If refund/credit appears on a later fatura, record it in the later fatura competence and link it to the original event.
- Do not reopen a closed month silently. Prior month correction requires explicit `ajuste`.

Schema gap:

- VERIFIED: `Lancamentos_V54` does not currently include `id_lancamento_origem`, `tipo_ajuste`, or `motivo_ajuste`.
- TODO: Before implementation, choose either extra link columns on `Lancamentos_V54` or a dedicated adjustment table.

Implementation notes after acceptance:

- TODO: Add tests proving refunds reduce DRE/acerto exactly once.
- TODO: Add tests proving cancellation of a scheduled installment does not leave orphan parcel/fatura references.

## 11. Decision D9 - Debt Payment Semantics

Status: PROPOSTA with implementation blocked by schema/input gaps

Recommended MVP rule:

| Dimension | Rule |
|---|---|
| DRE | Debt payment is not operational DRE expense by default while principal/interest split is unknown. |
| Cash | Payment reduces available cash from the paying source. |
| Patrimony | Payment reduces liability when a reliable debt balance update rule exists. |
| Acerto | Couple debt payment can affect acerto if `escopo=Casal` and `afeta_acerto=true`. |
| Recommendations | No amortization advice until debt terms, reserve, faturas, and cash pressure are reliable. |

Minimum record semantics:

- A debt payment must reference a stable `id_divida`.
- If principal and interest split are unknown, store the payment as cash obligation and reduce debt balance only through a reviewed reconciliation rule.
- If split is known later, record `principal`, `juros`, and fees separately or use a dedicated payment entity.

Schema/input blockers:

- VERIFIED: `Dividas` exists, but `Lancamentos_V54` has no `id_divida`.
- BLOQUEADA_POR_INPUT: Caixa and Vasco still need confirmed rate, amortization system, start date, current official balance, and whether payments should be split into principal/interest for MVP.
- TODO: Choose between adding `id_divida` to `Lancamentos_V54` or adding a dedicated `Pagamentos_Divida` sheet before implementation.

Implementation notes after acceptance:

- TODO: Add fake tests proving `divida_pagamento` does not enter operational DRE.
- TODO: Add tests proving reports expose unknown split instead of inventing interest/principal precision.

## 12. Human Questions Before Implementation

1. Is Gustavo's `1200` fuel allowance additional to the `3400` salary, or already included in it?
2. Should the proposed rateio base be Gustavo `4600` and Luana `3500` until future income changes?
3. Should VA/VR/Alelo reduce shared cash settlement without giving personal credit to the benefit holder?
4. Should `Fora orcamento` be disabled/removed for MVP, with private personal tracking handled by `visibilidade=privada`?
5. Should `Itens da casa` remain the official taxonomy value for earmarked home-item assets?
6. Should fatura payments be attributed to the fatura competence for acerto, even when paid in the following calendar month?
7. Should MVP block fatura prepayment before `fechada` status?
8. Can we add an `Idempotency_Log` entity for Telegram/import dedupe before V54 routing?
9. For refunds posted in a later fatura, should the correction affect the later competence instead of reopening the original closed month?
10. For debt payments, should MVP track only cash obligation/non-DRE payment first, or must it split principal and interest from day one?
11. What are the confirmed Caixa and Vasco debt terms: rate, amortization system, start date, current balance source, and payment schedule?

## 13. Recommended Follow-Up After Human Acceptance

1. Update `.ai_shared/DECISIONS.md` with accepted domain decisions.
2. Update V54 schema/tests for any accepted schema gaps: idempotency, adjustment links, debt payment link, or benefit balances.
3. Add local/fake-first tests for each accepted rule before any real spreadsheet write.
4. Keep V53 untouched except explicit cleanup tasks; do not create V53 features.

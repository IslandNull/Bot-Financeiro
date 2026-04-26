# MASTERPLAN PRODUCAO V54

Date: 2026-04-25
Status: TODO - planning document for review before implementation
Branch context: feat/v52-upgrade

## 1. Goals And Non-Goals

### Goals

- TODO: Prepare V54 as a production-grade household finance operating system for Gustavo and Luana.
- TODO: Separate operational DRE from patrimony, investments, reserve movements, and card invoice settlements.
- TODO: Model shared household expenses while preserving personal autonomy for Gustavo and Luana.
- TODO: Support proportional/fair rateio using income, benefits, scope, and responsible person.
- TODO: Model emergency reserve with explicit target bands and progress rules.
- TODO: Keep future home costs as forecast-only until the home is active.
- TODO: Model card purchases, installments, invoices, invoice payment, and reconciliation without duplicate expense recognition.
- TODO: Enable rule-based bot recommendations for 13th salary, vacation pay, bonus, extra income, large surplus, large purchases, reserve, amortization, investment, and home item decisions.
- TODO: Define migration, tests, rollback, and acceptance criteria before any code or spreadsheet mutation.

### Non-Goals

- TODO: Do not implement V54 in code before this plan is reviewed.
- TODO: Do not mutate the production spreadsheet before approval and rollback preparation.
- TODO: Do not treat invoice payment as expense.
- TODO: Do not count the existing home-item earmarked balance as emergency reserve.
- TODO: Do not migrate fully paid historical installments unless explicitly requested later.
- TODO: Do not claim Telegram/Val.town end-to-end production behavior is verified until tested.

## 2. Current Verified State

- VERIFIED: Repository startup protocol was run on 2026-04-26: `git status --short`, `git branch --show-current`, `cat package.json`, and `ls`/`Get-ChildItem`.
- VERIFIED: Current branch is `feat/v52-upgrade`.
- VERIFIED: On 2026-04-26, `git status --short` showed only `.emdash.json` as untracked before V54 domain-test edits.
- VERIFIED: `.ai_shared/ACTIVE_CONTEXT.md` states that V53 schema implementation is coded locally and V54 is not implemented.
- VERIFIED: `.ai_shared/SPREADSHEET_STATE.md` was generated on 2026-04-25 18:36:14 and starts with `# Spreadsheet State`.
- VERIFIED: Current verified sheet structure includes:
  - `Lancamentos!A5:H5`: `Data | TIPO | ID | VALOR | FONTE | DESCRICAO | PAGADOR | COMPETENCIA`
  - `Config!A11:F11`: `ID_CATEGORIA | NOME_CATEGORIA | TIPO_MOVIMENTO | CLASSE_DRE | TIPO_ATIVO | REGRA_RENDIMENTO`
  - `Investimentos!A3:F3`: `Ativo | Saldo Inicial | Aportes (mes) | Resgates (mes) | Rendimentos (mes) | Saldo Atual`
  - `Parcelas!A3:H3`: `Descricao | Valor Parcela | Parcela Atual | Total Parcelas | Cartao | Categoria | Data 1a Parcela | Status`
- VERIFIED: Formula standard is `range.setFormula()` with English function names and semicolon separators.
- VERIFIED: Temp-cell `copyTo()` caused `#REF!` and must not be used for formulas.
- VERIFIED: `npm run test:v53` exists, and `npm run test:v53 -- --mutate` was previously verified through the active context as passed against deployment version 23.
- VERIFIED: Architecture/risk/fatiamento reviews executed on 2026-04-26 in read-only mode found V54 pre-implementation blockers documented below.
- UNVERIFIED: Real Telegram/Val.town webhook routing exercises the same production behavior end-to-end.
- UNVERIFIED: V54 schema exists in the spreadsheet. It does not exist according to active context and schema docs.

### 2.1 Pre-Implementation Blockers Found On 2026-04-26

- VERIFIED: `doPost` currently trusts Telegram `chat.id` from the request payload and does not verify a non-spoofable webhook secret before write paths. This must be fixed before claiming production safety.
- VERIFIED: Current GET maintenance endpoints protected by `SYNC_SECRET` can execute mutating actions. V54 must separate read-only sync from maintenance/mutating actions and keep deny-by-default behavior.
- VERIFIED: Existing setup/repair functions have high spreadsheet blast radius. V54 setup must be additive, idempotent, versioned, and preferably dry-run first.
- VERIFIED: Current write paths do not use `LockService`; V54 write paths and mutating tests must use locking to avoid concurrent row races.
- TODO: Define a canonical card/source model before implementation. `Config_Fontes` and `Cartoes` must not duplicate authority for closing day, due day, and limit.
- TODO: Add a stable `id_parcela` to `Parcelas_Agenda` or formally use `id_compra + numero_parcela` as the only key. `Lancamentos_V54` must reference the chosen key.
- TODO: Specify deterministic invoice-cycle rules before migrating installments, including purchase on closing day, closing day 30 in February, purchases after closing, payment partials, refunds, and closed versus expected invoice values.

## 3. Household Financial Model

### People And Income

- TODO: Model Gustavo and Luana as household members with income, benefits, personal spending, and couple obligations.
- VERIFIED from handoff: Gustavo monthly net cash is `3400`, paid on day `5` or previous business day if day 5 is not a business day.
- VERIFIED from handoff: Gustavo Alelo VA/VR is `1500`, 100% couple use, mostly groceries/market.
- VERIFIED from handoff: Gustavo fuel allowance average is `1200`, embedded in net pay and treated as normal salary.
- VERIFIED from handoff: Luana monthly net cash is `3500`, paid on day `5`.
- VERIFIED from handoff: Luana VA is `300`, 100% couple use.
- VERIFIED from handoff: No recurring variable income.
- TODO: Treat 13th salary, vacation pay, bonuses, reimbursements, and extra income as separate financial events that trigger recommendations.

### Scope

- TODO: Every relevant category, purchase, installment, and transaction should carry an `escopo`:
  - `Casal`
  - `Gustavo`
  - `Luana`
  - `Fora orcamento`
- TODO: Couple expenses include home, groceries, financing, bills, delivery together, restaurants together, emergency reserve, and investments.
- TODO: Personal expenses include clothes, personal care, individual medical, work snacks, and individual purchases.

### Rateio

- ASSUMPTION: Cash income for proportional rateio starts with Gustavo `3400` and Luana `3500`; benefits are treated as couple resources with restricted use, not as fully fungible cash.
- TODO: Define a formal rateio formula before implementation.
- Proposed rule:
  - Household cash share = person's monthly cash income / total monthly cash income.
  - Gustavo share = `3400 / (3400 + 3500) = 49.28%`.
  - Luana share = `3500 / (3400 + 3500) = 50.72%`.
  - Benefits reduce grocery/market cash need before cash rateio is calculated.
  - Personal expenses remain assigned to the responsible person.
  - Couple expenses paid by one person create an internal settlement/acerto if actual paid share differs from target share.
- TODO: Decide whether fuel allowance should stay entirely inside Gustavo cash income for rateio or be partially earmarked for transport. Current handoff says it is embedded in net pay and treated as normal salary.

## 4. Schema Proposal

V54 should prefer explicit tables over overloading the current V53 `Lancamentos` table. Existing V53 sheets can remain during migration, but production reporting should read from the V54 model once verified.

### Config_Categorias

TODO columns:

- `id_categoria`
- `nome`
- `grupo`
- `tipo_movimento`
- `classe_dre`
- `escopo`
- `comportamento_orcamento`
- `afeta_acerto`
- `afeta_dre`
- `ativo`

Rules:

- TODO: `classe_dre` must distinguish operational categories from investment, transfer, settlement, reserve, financing principal, and out-of-budget categories.
- TODO: `afeta_dre` controls operational DRE inclusion.
- TODO: `afeta_acerto` controls couple settlement inclusion.

### Config_Fontes

TODO columns:

- `id_fonte`
- `nome`
- `tipo`
- `titular`
- `ativo`

Source types:

- `conta`
- `cartao`
- `beneficio`
- `dinheiro`
- `investimento`

### Rendas

TODO columns:

- `id_renda`
- `pessoa`
- `tipo`
- `valor`
- `recorrente`
- `dia_recebimento`
- `uso_restrito`
- `afeta_rateio`
- `afeta_dre`
- `obs`

### Lancamentos_V54

TODO columns:

- `id_lancamento`
- `data`
- `competencia`
- `tipo_evento`
- `id_categoria`
- `valor`
- `id_fonte`
- `pessoa`
- `escopo`
- `id_cartao`
- `id_fatura`
- `id_compra`
- `id_parcela`
- `afeta_dre`
- `afeta_acerto`
- `descricao`
- `created_at`

Rules:

- TODO: Store positive values and use `tipo_evento`/category behavior to determine DRE and balance effects.
- TODO: Avoid duplicated expense recognition by linking card purchases/installments to invoices and settlements.
- TODO: `id_parcela` references `Parcelas_Agenda.id_parcela`.

### Patrimonio_Ativos

TODO columns:

- `id_ativo`
- `nome`
- `tipo_ativo`
- `instituicao`
- `saldo_inicial`
- `saldo_atual`
- `data_referencia`
- `destinacao`
- `conta_reserva_emergencia`
- `ativo`

Rules:

- VERIFIED from handoff: Mercado Pago Cofrinho `11469` and Nubank Caixinha `5166`, total `16635`, are earmarked for home items and must not count as emergency reserve.
- TODO: Add explicit `destinacao = Casa` for current earmarked assets.
- TODO: Emergency reserve assets require `conta_reserva_emergencia = TRUE`.

### Acertos_Casal

TODO columns:

- `competencia`
- `pessoa`
- `quota_esperada`
- `valor_pago_casal`
- `diferenca`
- `status`
- `observacao`

Rules:

- TODO: Generate settlement view from V54 launches rather than manually maintaining opaque totals.

## 5. Card, Invoice, And Installment Model

### Cards

VERIFIED from handoff planned cards:

- Nubank Gustavo: limit `10550.00`, closing day `30`, due day `7`.
- Mercado Pago Gustavo: limit `10000.00`, closing day `5`, due day `10`.
- Nubank Luana: limit `10000.00`, closing day `1`, due day `8`.

TODO `Cartoes` columns:

- `id_cartao`
- `id_fonte`
- `nome`
- `titular`
- `fechamento_dia`
- `vencimento_dia`
- `limite`
- `ativo`

### Invoices

TODO `Faturas` columns:

- `id_fatura`
- `id_cartao`
- `competencia`
- `data_fechamento`
- `data_vencimento`
- `valor_previsto`
- `valor_fechado`
- `valor_pago`
- `fonte_pagamento`
- `status`

Rules:

- TODO: Invoice payment is settlement/baixa of liability, not an expense.
- TODO: Expense recognition happens at purchase/installment competence, not at payment of invoice.
- TODO: Reconciliation must compare expected invoice items against actual paid/closed invoice totals.

### Purchases And Installments

TODO `Compras_Parceladas` columns:

- `id_compra`
- `data_compra`
- `id_cartao`
- `descricao`
- `id_categoria`
- `valor_total`
- `parcelas_total`
- `responsavel`
- `escopo`
- `status`

TODO `Parcelas_Agenda` columns:

- `id_parcela`
- `id_compra`
- `numero_parcela`
- `competencia`
- `valor_parcela`
- `id_fatura`
- `status`
- `id_lancamento`

Migration rule:

- TODO: Migrate only open/future installments.
- TODO: Do not migrate fully paid historical installments unless the user explicitly requests historical reconstruction.
- TODO: User must provide each active installment with description, card, installment value, current installment number, total installments, category, payer/responsible person, and scope.

## 6. Emergency Reserve Model

VERIFIED from handoff:

- Current formal emergency reserve: `0`.
- Existing total `16635` is earmarked for home items and must not count as emergency reserve.
- Initial minimum target: `15000`.
- Initial ideal target: `30000` to `33000`.
- Proposed contribution: `1400` per month if realistic.
- If tight: `1000` per month.
- If strong month: `1700` per month.

TODO model:

- Create explicit reserve dashboard block or sheet.
- Track reserve balance only from assets flagged as emergency reserve.
- Show progress to:
  - `15000` minimum
  - `30000` ideal lower bound
  - `33000` ideal upper bound
- Priority rules:
  - Reserve below `15000`: maximum priority.
  - Reserve from `15000` to `30000`: keep contribution, allow planned home purchases.
  - Reserve above `30000`: split surplus among amortization, investments, and home goals.

ASSUMPTION:

- The `15000` minimum roughly covers immediate household risk before home running costs start. Target should be recalculated after future home costs become active.

## 7. Future Home Forecast Model

VERIFIED from handoff:

- Home not received yet.
- Estimated receipt: June 2026.
- Future monthly forecast:
  - Luz: `200`
  - Agua: `100`
  - Internet: `120`
  - Celulares: `80`
  - Condominio: `400`
  - Total: `900`

TODO `Orcamento_Futuro_Casa` columns:

- `item`
- `valor_previsto`
- `data_inicio_prevista`
- `ativo_no_dre`

Rules:

- TODO: Forecast-only until the home is received or explicitly activated.
- TODO: Do not include these values in current operational DRE while inactive.
- TODO: Include forecast in recommendations, cash-flow projections, and reserve target recalculation.

## 8. Operational DRE Versus Patrimony

Problem:

- VERIFIED: V53 Aporte behavior writes `Despesa | INV-APORTE` and `Receita | ID_DO_ATIVO_INV-*`.
- VERIFIED: V54 must prevent investments from inflating operational DRE.

TODO rules:

- Operational DRE includes recurring income and actual operational expenses.
- Investments, reserve contributions, asset transfers, and invoice payments do not inflate income or expense totals unless explicitly modeled as budget allocations outside DRE.
- Investment yield may appear in patrimony/investment performance, not household operational surplus.
- Financing payment should be split conceptually:
  - interest/fee portion can affect DRE if available;
  - principal amortization affects patrimony/debt balance;
  - if split is unavailable, keep conservative reporting and label the limitation.

UNVERIFIED:

- Exact amortization split for Caixa and Vasco financing.

## 9. Bot Recommendation Model

Recommendation engine should start rule-based. LLM assistance can be added later for explanation quality after deterministic rules are stable.

Inputs:

- Emergency reserve progress.
- Current month operational DRE.
- Upcoming card invoices.
- Active installments.
- Home item goals.
- Future home forecast.
- Financing balances.
- Available cash and benefits.
- Existing earmarked assets.

Event recommendations:

- 13th salary:
  - If reserve < `15000`, prioritize reserve.
  - If reserve between `15000` and `30000`, split between reserve and planned home needs.
  - If reserve > `30000`, evaluate amortization, investments, and home goals.
- Vacation pay:
  - Protect near-term card invoices and reserve first.
  - Recommend a controlled leisure amount only after obligations are covered.
- Bonus or extra income:
  - Apply same priority ladder as 13th salary.
- Large surplus:
  - Check next 60 days of invoices and installments.
  - Allocate according to reserve band and home forecast.
- Large purchase:
  - Check reserve status, invoice capacity, active installments, and whether purchase is home-critical.
- Amortization:
  - Only recommend after reserve minimum is reached unless debt terms or cash-flow risk justify exception.

TODO:

- Define exact thresholds for "large purchase" and "large surplus".
- Decide whether recommendations live in Apps Script only, Telegram responses only, dashboard cells, or all three.

## 10. Migration Plan

Phase 0 - Approval:

- TODO: Review and approve this masterplan.
- TODO: Collect missing active installments.
- TODO: Decide reserve dashboard location and recommendation implementation strategy.

Phase 1 - Non-mutating design:

- TODO: Add tests/spec fixtures for V54 calculations before changing production sheets.
- TODO: Audit current V53 formulas numerically with controlled fixtures.
- TODO: Define invoice cycle calculation for closing day and due day edge cases.

Phase 2 - Sheet preparation:

- TODO: Create V54 sheets in a controlled setup function that is idempotent and does not destroy V53 data.
- TODO: Avoid running dangerous legacy setup functions blindly.
- TODO: Snapshot spreadsheet before mutation with `npm run sync`.

Phase 3 - Data migration:

- TODO: Migrate config categories, sources, cards, income, assets, and future home forecast.
- TODO: Migrate only open/future installments from user-provided list.
- TODO: Keep V53 `Lancamentos` readable during transition.

Phase 4 - Reporting:

- TODO: Build operational DRE, patrimony/investments, card invoice, reserve, future home forecast, and couple settlement views.
- TODO: Verify formulas with snapshot and tests.

Phase 5 - Bot behavior:

- TODO: Update parser/write paths to populate V54 fields.
- TODO: Add recommendation responses for approved event types.
- TODO: Test deterministic write paths before Telegram end-to-end validation.

## 11. Test Plan

Non-mutating tests:

- TODO: Snapshot structure test for required V54 sheets and headers.
- TODO: Formula syntax test using `setFormula()` with English functions and semicolon separators.
- TODO: DRE exclusion test proving investments, reserve transfers, and invoice payments do not affect operational DRE.
- TODO: Card cycle test for each configured card:
  - Nubank Gustavo close 30 due 7.
  - Mercado Pago Gustavo close 5 due 10.
  - Nubank Luana close 1 due 8.
- TODO: Installment schedule test for purchases crossing month/year boundaries.
- TODO: Rateio test using Gustavo `3400`, Luana `3500`, and benefit usage.
- TODO: Reserve target test for below `15000`, between `15000` and `30000`, and above `30000`.
- TODO: Future home forecast test proving inactive forecast does not enter current DRE.

Mutating protected tests:

- TODO: Add V54 protected Web App test similar to `test:v53 -- --mutate`, with deterministic low-value fixtures and automatic cleanup.
- TODO: Test card purchase writes expense recognition once.
- TODO: Test invoice payment writes settlement without duplicate expense.
- TODO: Test reserve contribution updates reserve/patrimony without operational DRE inflation.

End-to-end tests:

- UNVERIFIED: Telegram/Val.town production route.
- TODO: After deterministic tests pass, send real Telegram test messages through production routing and verify spreadsheet effects.

## 12. Rollback Plan

Before implementation:

- TODO: Run `npm run sync` and keep a verified snapshot.
- TODO: Export or duplicate production spreadsheet manually if a destructive migration is planned.
- TODO: Ensure new setup functions are additive or versioned.

During implementation:

- TODO: Do not delete V53 sheets during V54 rollout.
- TODO: Write V54 sheets alongside V53 until reports are verified.
- TODO: Keep migration functions idempotent and able to skip already-created rows by IDs.

Rollback actions:

- TODO: Disable V54 bot write path and return to V53 write path if V54 validation fails.
- TODO: Hide or ignore V54 report sheets if formulas are wrong.
- TODO: Restore spreadsheet from pre-migration copy if data corruption occurs.
- TODO: Re-run `forceFixAllFormulas()` only if the formula repair path is still compatible and protected by `SYNC_SECRET`.

## 13. Acceptance Criteria

V54 can be considered ready for production only when all applicable criteria are VERIFIED:

- TODO: `docs/MASTERPLAN_PRODUCAO_V54.md` reviewed and approved.
- TODO: V54 schema exists in spreadsheet and is verified by exported snapshot.
- TODO: Tests verify operational DRE excludes investments, reserve transfers, asset movements, and invoice payments.
- TODO: Card purchases/installments appear once in expense recognition and invoice payment appears only as settlement.
- TODO: Active installment migration is verified against user-provided list.
- TODO: Emergency reserve dashboard starts at `0` and does not count the `16635` home-item earmark.
- TODO: Future home costs total `900` and remain forecast-only until activated.
- TODO: Couple rateio/acerto is calculated from approved rules and matches controlled fixtures.
- TODO: Recommendation rules produce expected advice for 13th salary, vacation pay, bonus, extra income, large surplus, large purchase, and amortization scenarios.
- TODO: `npm run test:v53` still passes or an approved V54 successor test replaces it.
- TODO: V54 mutating protected tests pass with automatic cleanup.
- TODO: `npm run sync` succeeds after changes and exported snapshot contains no unexpected Apps Script HTML/error payload.
- TODO: Real Telegram/Val.town route is tested before claiming production end-to-end readiness.

## 14. Open Questions

- TODO: Exact list of active installments still being paid.
- TODO: Home item purchase list cleanup and priority order.
- TODO: Whether emergency reserve should have a separate formal sheet, a dashboard block, or both.
- TODO: Whether recommendation output should be rule-based only in V54, or rule-based with optional LLM phrasing.
- TODO: Whether financing principal/interest split can be imported or approximated.
- TODO: Whether benefits should reduce grocery budget before or after cash rateio in the monthly acerto view.

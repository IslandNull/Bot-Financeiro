# MASTERPLAN PRODUCAO V54

Date: 2026-04-25
Status: IN PROGRESS - V54 skeleton and Telegram positive production path verified; V53 remains the production flow
Branch context: feat/v54-production-readiness
Last consolidated analysis: 2026-04-26
Last local Phase 1 domain expansion: 2026-04-26
Last local Phase 2 setup-planner hardening: 2026-04-26
Last real V54 sheet setup: 2026-04-26

## 1. Goals And Non-Goals

### Goals

- TODO: Prepare V54 as a production-grade household finance operating system for Gustavo and Luana.
- TODO: Separate operational DRE from patrimony, investments, reserve movements, and card invoice settlements.
- TODO: Model shared household expenses while preserving personal autonomy for Gustavo and Luana.
- TODO: Support proportional/fair rateio using income, benefits, scope, and responsible person.
- TODO: Model emergency reserve with explicit target bands and progress rules.
- TODO: Keep future home costs as forecast-only until the home is active.
- TODO: Model card purchases, installments, invoices, invoice payment, and reconciliation without duplicate expense recognition.
- TODO: Model debts, monthly closing, and net worth before allowing amortization/investment recommendations.
- TODO: Preserve privacy and personal autonomy with explicit visibility rules, not only payer/scope fields.
- TODO: Enable rule-based bot recommendations for 13th salary, vacation pay, bonus, extra income, large surplus, large purchases, reserve, amortization, investment, and home item decisions.
- VERIFIED: Define clean-start bootstrap, tests, rollback, and acceptance criteria before V54 production activation.

### Non-Goals

- VERIFIED: Do not activate V54 as the production flow before this plan and the staged gates are reviewed.
- VERIFIED: Additive V54 skeleton sheet setup and clean seed data have been applied. Do not run migration or V54 writes without a reviewed dry-run and proper locking.
- TODO: Do not treat invoice payment as expense.
- TODO: Do not count the existing home-item earmarked balance as emergency reserve.
- VERIFIED: Do not migrate V53 history by default. V54 is a clean start; only manually approved opening data should be seeded.
- VERIFIED: Do not claim Telegram/Val.town production behavior until tested. Positive read/write/desfazer behavior was tested on 2026-04-26; negative webhook security tests are still pending.
- TODO: Do not let generative AI make financial recommendations before deterministic safety rules have checked reserve, debts, invoices, and cash flow.

## 2. Current Verified State

- VERIFIED: Repository startup protocol was run on 2026-04-26: `git status --short`, `git branch --show-current`, `cat package.json`, and `ls`/`Get-ChildItem`.
- VERIFIED: Current branch is `feat/v54-production-readiness`.
- VERIFIED: On 2026-04-26, the branch was renamed from `feat/v52-upgrade` to `feat/v54-production-readiness`.
- VERIFIED: On 2026-04-26, `.emdash.json` was removed locally and added to `.gitignore`; related remote Emdash branches were removed.
- VERIFIED: `.ai_shared/ACTIVE_CONTEXT.md` states that V53 remains the active production flow and V54 skeleton sheets/headers now exist in the real spreadsheet.
- VERIFIED: `.ai_shared/SPREADSHEET_STATE.md` was generated on 2026-04-26 15:27:14 and starts with `# Spreadsheet State`.
- VERIFIED: Current verified sheet structure includes:
  - `Lancamentos!A5:H5`: `Data | TIPO | ID | VALOR | FONTE | DESCRICAO | PAGADOR | COMPETENCIA`
  - `Config!A11:F11`: `ID_CATEGORIA | NOME_CATEGORIA | TIPO_MOVIMENTO | CLASSE_DRE | TIPO_ATIVO | REGRA_RENDIMENTO`
  - `Investimentos!A3:F3`: `Ativo | Saldo Inicial | Aportes (mes) | Resgates (mes) | Rendimentos (mes) | Saldo Atual`
  - `Parcelas!A3:H3`: `Descricao | Valor Parcela | Parcela Atual | Total Parcelas | Cartao | Categoria | Data 1a Parcela | Status`
- VERIFIED: Formula standard is `range.setFormula()` with English function names and semicolon separators.
- VERIFIED: Temp-cell `copyTo()` caused `#REF!` and must not be used for formulas.
- VERIFIED: `npm run test:v53` exists, and `npm run test:v53 -- --mutate` was previously verified through the active context as passed against deployment version 23.
- VERIFIED: Architecture/risk/fatiamento reviews executed on 2026-04-26 in read-only mode found V54 pre-implementation blockers documented below.
- VERIFIED: `.ai_shared/ANALISE_A_SER_CONSIDERADA.MD` was reviewed on 2026-04-26 and its findings were consolidated into this masterplan.
- VERIFIED: Real Telegram/Val.town positive routing was tested on 2026-04-26: `/saldo` returned real spreadsheet data, a controlled `R$ 1,00` `Restaurante casal` launch was written, `/hoje` showed it, `/desfazer` removed it, and a final `/hoje` showed no launch for the day.
- VERIFIED: V54 skeleton schema and clean seed data exist in the real spreadsheet. The exported snapshot verified on 2026-04-26 contains all 14 V54 sheets with headers and seed rows.
- VERIFIED: Phase 0.5 security/write-lock gate is coded locally and covered by `cmd /c npm run test:security-locks`.
- VERIFIED: Phase 1 local domain fixtures now cover invoice payment reconciliation, emergency reserve exclusion for home-earmarked assets, net worth, amortization readiness gates, monthly closing draft fields, and shared-view privacy sanitization.
- VERIFIED: Phase 2 setup dry-run planner was hardened locally to return explicit safe/blocked states instead of `UPDATE_HEADERS`.
- VERIFIED: `cmd /c npm run test:v54:setup` covers exact Apps Script/local schema parity, empty state, perfect state, blank existing sheets, header mismatch, existing data, extra headers, extra blank header columns with data below, V53 sheet preservation, and absence of `UPDATE_HEADERS`.
- VERIFIED: `applySetupV54()` was pushed to the Apps Script project, executed manually from the Apps Script editor on 2026-04-26, and applied 14 `CREATE_SHEET` actions with `summary.blocked: 0`.
- VERIFIED: V54 sheet audit found no blocking schema duplication. Apparent duplicate sheets are expected because V53 remains the current bot flow while V54 is staged as a clean start.
- VERIFIED: User confirmed V53 has no meaningful valid history to preserve. V54 should bootstrap from reviewed seed/config/opening data, not from default V53 historical migration.

### 2.1 Pre-Implementation Blockers Found On 2026-04-26

- VERIFIED: `doPost` previously trusted Telegram `chat.id` from the request payload before verifying a non-spoofable webhook secret. Code now requires `WEBHOOK_SECRET` before routing, and the positive Apps Script/Val.town production contract was verified on 2026-04-26. Negative security tests remain TODO.
- VERIFIED: GET maintenance mutation was identified as a risk. Local code now keeps `doGet` read-only for `exportState` and explicitly blocks known mutating GET actions, including `applySetupV54`.
- VERIFIED: Existing setup/repair functions have high spreadsheet blast radius. V54 setup was implemented as additive, manual, lock-protected, dry-run-first, and non-formula.
- VERIFIED: Current V53 write paths were missing locks. Local code now wraps `recordParsedEntry`, `desfazerUltimo`, `handleManter`, and `handleParcela` with `withScriptLock()`.
- VERIFIED: V54 must treat payment of invoice as liability settlement, not a new operational expense.
- VERIFIED: V54 must add `Pagamentos_Fatura`, `Dividas`, `Fechamentos_Mensais`, `afeta_patrimonio`, and `visibilidade` to avoid incomplete recommendations and privacy leakage.
- VERIFIED: `Config_Fontes` and `Cartoes` must not duplicate authority for closing day, due day, and limit.
- VERIFIED: `Parcelas_Agenda` uses stable `id_parcela`, and `Lancamentos_V54` references it.
- TODO: Specify deterministic invoice-cycle rules before enabling V54 card/installment writes, including purchase on closing day, closing day 30 in February, purchases after closing, payment partials, refunds, and closed versus expected invoice values.

### 2.2 Consolidated External Analysis

The 2026-04-26 analysis agrees with the V54 direction but changes the execution order.

VERIFIED consolidated conclusions:

- V54 is conceptually on the right path: DRE operational, patrimony, card invoices, installments, reserve, and couple settlement must be separated.
- The next implementation step must not be another financial feature. It must be security and write-safety hardening.
- The product must become a monthly decision system for Gustavo and Luana, not only a transaction recorder.
- Credit card control is central in the Brazilian household context. Purchases/installments create the expense; invoice payment settles card liability.
- Debt must be modeled explicitly before the bot recommends amortization. Caixa and Vasco cannot remain only operational categories.
- Emergency reserve must be a protected purpose, not any available investment balance.
- Personal expenses need visibility rules so the bot supports autonomy instead of creating surveillance or conflict.
- Recommendations must start as deterministic rules. LLM phrasing can come later after reserve, debts, invoices, and cash flow are reliable.

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

V54 should prefer explicit tables over overloading the current V53 `Lancamentos` table. Existing V53 sheets remain as temporary fallback while V54 is bootstrapped cleanly, but production reporting should read from the V54 model once verified.

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
- `visibilidade_padrao`
- `ativo`

Rules:

- TODO: `classe_dre` must distinguish operational categories from investment, transfer, settlement, reserve, financing principal, and out-of-budget categories.
- TODO: `afeta_dre` controls operational DRE inclusion.
- TODO: `afeta_acerto` controls couple settlement inclusion.
- TODO: `visibilidade_padrao` controls whether future transactions default to `detalhada`, `resumo`, or `privada`.

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
- `afeta_patrimonio`
- `visibilidade`
- `descricao`
- `created_at`

Rules:

- TODO: Store positive values and use `tipo_evento`/category behavior to determine DRE and balance effects.
- TODO: Avoid duplicated expense recognition by linking card purchases/installments to invoices and settlements.
- TODO: `id_parcela` references `Parcelas_Agenda.id_parcela`.
- TODO: `afeta_patrimonio` marks events that change asset/liability tracking, even when they do not affect operational DRE.
- TODO: `visibilidade` must support personal autonomy: `detalhada`, `resumo`, or `privada`.

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

### Dividas

TODO columns:

- `id_divida`
- `nome`
- `credor`
- `tipo`
- `pessoa`
- `escopo`
- `saldo_devedor`
- `parcela_atual`
- `parcelas_total`
- `valor_parcela`
- `taxa_juros`
- `sistema_amortizacao`
- `data_inicio`
- `data_atualizacao`
- `estrategia`
- `status`
- `observacao`

Rules:

- TODO: Caixa and Vasco must be modeled as debts with balance, term, payment, and strategy before amortization recommendations.
- TODO: If interest/principal split is unavailable, reports must label the limitation instead of pretending precision.

### Fechamentos_Mensais

TODO columns:

- `competencia`
- `status`
- `receitas_operacionais`
- `despesas_operacionais`
- `saldo_operacional`
- `faturas_60d`
- `parcelas_futuras`
- `taxa_poupanca`
- `reserva_total`
- `patrimonio_liquido`
- `acerto_status`
- `decisao_1`
- `decisao_2`
- `decisao_3`
- `created_at`
- `closed_at`

Rules:

- TODO: Monthly closing is the product heart. Daily logging feeds this table; decisions come from this table.
- TODO: `/fechar_mes` must summarize facts first and recommendations second.

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
- TODO: `valor_pago` and `fonte_pagamento` in `Faturas` are summary fields; payment-level truth lives in `Pagamentos_Fatura`.

### Invoice Payments

TODO `Pagamentos_Fatura` columns:

- `id_pagamento`
- `id_fatura`
- `data_pagamento`
- `valor_pago`
- `id_fonte`
- `pessoa`
- `escopo`
- `afeta_dre`
- `afeta_acerto`
- `afeta_patrimonio`
- `status`
- `observacao`
- `created_at`

Rules:

- TODO: Payment of invoice must always have `afeta_dre = FALSE`.
- TODO: Payment may affect couple settlement if one person pays a shared invoice.
- TODO: Payment should update/reconcile liability and cash tracking without creating a duplicate expense.

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
- `visibilidade`
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
- VERIFIED: Do not migrate V53 installment history by default. If old active installments are needed later, insert only manually reviewed open/future installments.
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
- TODO: Collect Caixa and Vasco debt details: current balance, installment value, remaining term, interest/rate if available, and amortization strategy.
- TODO: Decide reserve dashboard location, monthly closing format, privacy defaults, and recommendation implementation strategy.

Phase 0.5 - Security and write-safety gate:

- VERIFIED: Add webhook/proxy secret validation before any write path can run.
- VERIFIED: Separate read-only sync from mutating maintenance actions; deny unknown actions by default.
- VERIFIED: Add `withScriptLock()` around current V53 write paths.
- VERIFIED: Add local/static tests proving the security and lock wrappers exist before `clasp push`.
- VERIFIED: Add redacted read-only webhook diagnostics: `diagnoseWebhookSecurity()` and `getTelegramWebhookInfo()`.
- VERIFIED: Execute webhook diagnostics in the Apps Script editor and review results before Telegram production testing. On 2026-04-26, diagnostics showed required secrets configured, `authorizedUserCount: 2`, Val.town URL configured, and Telegram webhook URL redacted with `pending_update_count: 0`.

Phase 1 - Non-mutating design:

- VERIFIED: Add tests/spec fixtures for V54 calculations before changing production sheets.
- TODO: Audit current V53 formulas numerically with controlled fixtures.
- VERIFIED: Define invoice cycle calculation for closing day and due day edge cases.
- VERIFIED: Expand schema tests for `Pagamentos_Fatura`, `Dividas`, `Fechamentos_Mensais`, `afeta_patrimonio`, and `visibilidade`.

Phase 2 - Sheet preparation:

- VERIFIED: Harden `planSetupV54ForState()` before apply: safe actions are `OK`, `CREATE_SHEET`, and `INITIALIZE_HEADERS`; blocked actions are `BLOCKED_HEADER_MISMATCH`, `BLOCKED_EXTRA_HEADERS`, and `BLOCKED_EXISTING_DATA`. The planner also blocks extra real columns beyond schema width even when the extra header cell is blank.
- VERIFIED: Create local `applySetupV54()` as a controlled additive setup function that does not destroy V53 data, does not write formulas, and aborts on any `BLOCKED_*` action.
- VERIFIED: Snapshot spreadsheet before mutation with `cmd /c npm run sync`.
- VERIFIED: Review `planSetupV54()` output in Apps Script before executing `applySetupV54()` against the real spreadsheet.
- VERIFIED: Execute `applySetupV54()` manually from the Apps Script editor and verify the post-apply snapshot.
- VERIFIED: Avoid running dangerous legacy setup functions blindly.

Phase 3 - Clean V54 bootstrap:

- TODO: Seed reviewed V54 config categories, sources, cards, income, assets, debts, privacy defaults, and future home forecast.
- TODO: Do not migrate V53 transaction history by default.
- TODO: Add only manually reviewed opening balances and active obligations needed for V54 to start correctly.
- TODO: Keep V53 sheets readable and available as fallback during transition.

Phase 4 - Reporting:

- TODO: Build operational DRE, patrimony/investments, debts, card invoice, invoice payment, reserve, future home forecast, monthly closing, and couple settlement views.
- TODO: Verify formulas with snapshot and tests.

Phase 5 - Bot behavior:

- TODO: Update parser/write paths to populate V54 fields.
- TODO: Add recommendation responses for approved event types.
- VERIFIED: Test current V53 Telegram positive production route with a controlled low-value fixture and `/desfazer`.
- TODO: Test V54 deterministic write paths before V54 Telegram end-to-end validation.

## 11. Test Plan

Non-mutating tests:

- VERIFIED: Security static test proving webhook/proxy auth is enforced before command/write routing.
- VERIFIED: Lock static test proving write paths use `withScriptLock()` or equivalent.
- VERIFIED: Redacted webhook diagnostic test proving diagnostics do not mutate Telegram webhook configuration, send Telegram messages, or write sheets.
- VERIFIED: Snapshot structure test for required V54 sheets and headers: `cmd /c npm run test:v54:snapshot`.
- TODO: Formula syntax test using `setFormula()` with English functions and semicolon separators.
- VERIFIED: V54 setup dry-run planner test blocks header mismatch, extra headers, extra blank header columns with data below, existing data with divergent headers, and confirms V53 sheets are ignored.
- VERIFIED: V54 setup apply tests prove the local apply aborts blocked plans, creates only missing V54 sheets with headers, avoids formulas, and is explicitly blocked over GET.
- VERIFIED: DRE exclusion test proving investments, reserve transfers, and invoice payments do not affect operational DRE.
- VERIFIED: Card cycle test for each configured card:
  - Nubank Gustavo close 30 due 7.
  - Mercado Pago Gustavo close 5 due 10.
  - Nubank Luana close 1 due 8.
- VERIFIED: Installment schedule test for purchases crossing month/year boundaries.
- VERIFIED: Rateio test using Gustavo `3400`, Luana `3500`, and benefit usage.
- VERIFIED: Reserve target test for below `15000`, between `15000` and `30000`, and above `30000`.
- VERIFIED: Future home forecast test proving inactive forecast does not enter current DRE.
- VERIFIED: Debt/amortization rule test proving recommendations require known reserve, invoices, and debt data.
- VERIFIED: Monthly closing test covering DRE, faturas 60d, reserve, net worth, settlement, and three decisions.
- VERIFIED: Privacy test proving `visibilidade = privada` is not exposed in shared detail reports.

Mutating protected tests:

- TODO: Add V54 protected Web App test similar to `test:v53 -- --mutate`, with deterministic low-value fixtures and automatic cleanup.
- TODO: Test card purchase writes expense recognition once.
- TODO: Test invoice payment writes settlement without duplicate expense.
- TODO: Test partial invoice payment and reconciliation.
- TODO: Test reserve contribution updates reserve/patrimony without operational DRE inflation.

End-to-end tests:

- VERIFIED: Current V53 Telegram/Val.town positive production route was tested on 2026-04-26 with `/saldo`, a controlled `R$ 1,00` write, `/hoje`, `/desfazer`, and final `/hoje`.
- TODO: Add negative production webhook tests for missing secret, invalid secret, and unauthorized chat.
- TODO: After V54 deterministic tests pass, send real V54 Telegram test messages through production routing and verify spreadsheet effects.

## 12. Rollback Plan

Before implementation:

- TODO: Run `npm run sync` and keep a verified snapshot.
- TODO: Export or duplicate production spreadsheet manually if destructive cleanup/archive is planned.
- TODO: Ensure new setup functions are additive or versioned.

During implementation:

- TODO: Do not delete, rename, or hide V53 sheets during V54 rollout.
- TODO: Write V54 sheets alongside V53 until reports are verified.
- TODO: Keep V54 seed/bootstrap functions idempotent and able to skip already-created rows by IDs.

Rollback actions:

- TODO: Disable V54 bot write path and return to V53 write path if V54 validation fails.
- TODO: Hide or ignore V54 report sheets if formulas are wrong.
- TODO: Restore spreadsheet from pre-migration copy if data corruption occurs.
- TODO: Re-run `forceFixAllFormulas()` only if the formula repair path is still compatible and protected by `SYNC_SECRET`.

## 13. Acceptance Criteria

V54 can be considered ready for production only when all applicable criteria are VERIFIED:

- TODO: `docs/MASTERPLAN_PRODUCAO_V54.md` reviewed and approved.
- VERIFIED: V54 skeleton schema exists in spreadsheet and is verified by exported snapshot.
- VERIFIED: Webhook/proxy positive authentication path, mutating maintenance endpoint separation, and `LockService` write protection are verified before broader production mutation.
- VERIFIED: `diagnoseWebhookSecurity()` and `getTelegramWebhookInfo()` logs were reviewed and showed the expected deployment/webhook state without exposing raw secrets.
- TODO: Tests verify operational DRE excludes investments, reserve transfers, asset movements, and invoice payments.
- TODO: Card purchases/installments appear once in expense recognition and invoice payment appears only as settlement.
- TODO: `Pagamentos_Fatura` supports at least full payment, partial payment, and reconciliation against `Faturas`.
- TODO: `Dividas` includes Caixa and Vasco with enough fields to block unsafe amortization recommendations.
- TODO: `Fechamentos_Mensais` produces monthly DRE, faturas 60d, reserve, net worth, settlement status, and three decisions.
- TODO: Privacy rules prevent private personal purchases from appearing in shared detailed reports.
- TODO: Any manually selected old active installment bootstrap is verified against user-provided list.
- TODO: Emergency reserve dashboard starts at `0` and does not count the `16635` home-item earmark.
- TODO: Future home costs total `900` and remain forecast-only until activated.
- TODO: Couple rateio/acerto is calculated from approved rules and matches controlled fixtures.
- TODO: Recommendation rules produce expected advice for 13th salary, vacation pay, bonus, extra income, large surplus, large purchase, and amortization scenarios.
- TODO: `npm run test:v53` still passes or an approved V54 successor test replaces it.
- TODO: V54 mutating protected tests pass with automatic cleanup.
- TODO: `npm run sync` succeeds after changes and exported snapshot contains no unexpected Apps Script HTML/error payload.
- VERIFIED: Current V53 real Telegram/Val.town positive route was tested before claiming positive route readiness.
- TODO: V54 real Telegram/Val.town route must be tested before claiming V54 production end-to-end readiness.

## 14. Open Questions

- TODO: Exact list of active installments still being paid.
- TODO: Home item purchase list cleanup and priority order.
- TODO: Whether emergency reserve should have a separate formal sheet, a dashboard block, or both.
- TODO: Whether recommendation output should be rule-based only in V54, or rule-based with optional LLM phrasing.
- TODO: Whether financing principal/interest split can be imported or approximated.
- TODO: Whether benefits should reduce grocery budget before or after cash rateio in the monthly acerto view.
- TODO: Exact privacy defaults for personal spending categories.
- TODO: Whether invoice payment should affect `afeta_patrimonio` as liability/cash movement while remaining net-worth neutral.

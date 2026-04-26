# Handoff - V54 Masterplan Producao

Date: 2026-04-25
Branch: feat/v54-production-readiness
Status: Phase 2 local preparation. Do not mutate the production spreadsheet without explicit approval.

## Startup For Next Agent

Before any change, read and run the repository protocol:

1. Read `AGENTS.md`.
2. Run:
   - `git status`
   - `git branch --show-current`
   - `cat package.json`
   - `ls`
3. Read:
   - `AI_WORKFLOW.md`
   - `.ai_shared/ACTIVE_CONTEXT.md`
   - `.ai_shared/FORMULA_STANDARD.md`
   - `.ai_shared/KNOWN_ISSUES.md`
   - `.ai_shared/DECISIONS.md`
   - `.ai_shared/HANDOFF_PROTOCOL.md`
   - `.ai_shared/SHEET_SCHEMA.md`
   - `.ai_shared/SPREADSHEET_STATE.md`

Use truth labels from `AGENTS.md`: VERIFIED, UNVERIFIED, ASSUMPTION, TODO.

## Current Verified Technical State

- V53 exists and was validated structurally.
- `npm run sync` exports `.ai_shared/SPREADSHEET_STATE.md` starting with `# Spreadsheet State`.
- `npm run test:v53` exists for non-mutating snapshot checks.
- `npm run test:v53 -- --mutate` exists for a protected Aporte write test with automatic cleanup.
- Apps Script deployment used by `SHEETS_SYNC_URL` was updated to version 23.
- The protected Aporte write test passed on version 23, writing and cleaning:
  - `Despesa | INV-APORTE | R$ 12,34`
  - `Receita | INV-39 | R$ 12,34`
- Current branch is `feat/v54-production-readiness`.
- V54 security/write-lock hardening is coded locally and covered by `cmd /c npm run test:security-locks`.
- V54 setup planner is dry-run only and returns explicit safe/blocked actions: `OK`, `CREATE_SHEET`, `INITIALIZE_HEADERS`, `BLOCKED_HEADER_MISMATCH`, `BLOCKED_EXTRA_HEADERS`, and `BLOCKED_EXISTING_DATA`.
- `cmd /c npm run test:v54:setup` verifies exact Apps Script/local schema parity and blocks extra real columns beyond schema width, including blank extra header cells with data below.
- `applySetupV54()` exists locally as a manual additive setup function. It is protected by `withScriptLock`, aborts on `BLOCKED_*`, writes only headers for missing/blank V54 sheets, and is blocklisted over GET.
- `applySetupV54()` has not been pushed with `clasp` and has not been executed against the real spreadsheet.

## Known Technical Risks

- Real Telegram/Val.town route remains UNVERIFIED.
- Current V53 Aporte behavior writes `Despesa` + `Receita`; V54 must prevent investments from inflating operational DRE.
- `setupV52` and `setupV53` are dangerous if run blindly on the current sheet. Audit before any setup execution.
- Card/installment control is insufficient for production.
- Existing `Parcelas` sheet only has basic fields and no invoice cycle/future schedule model.

## Product Goal

Prepare Bot Financeiro for production as a household finance operating system for Gustavo and Luana, with:

- shared household budget;
- proportional but fair personal autonomy;
- emergency reserve plan;
- future home cost forecast;
- robust card invoice and installment tracking;
- separation between operational DRE and patrimony/investments;
- bot recommendations for major financial events.

## Household Income

Gustavo:
- Monthly net cash: `3400`
- Payment date: day `5`, or previous business day if day 5 is not a business day
- Alelo VA/VR: `1500`
- Fuel allowance: average `1200`, embedded in net pay and treated as normal salary
- Moto fuel: about `150` to `160` per month
- Moto oil/basic maintenance: about `150` every `2` to `3` months

Luana:
- Monthly net cash: `3500`
- Payment date: day `5`
- VA: `300`
- No transport/fuel allowance

Other income:
- No recurring variable income.
- 13th salary, vacation pay, bonuses, and similar payments must be treated as separate events. The bot should recommend what to do based on the current financial state.

Benefits:
- Gustavo Alelo and Luana VA are 100% for couple use, mostly groceries/market.

## Current Assets And Earmarks

- Mercado Pago Cofrinho: `11469`, yielding 120% CDI up to `10000`, remainder 100% CDI.
- Nubank Caixinha: `5166`, yielding 115% CDI.
- Total: `16635`.
- This total is earmarked for home items and must NOT count as emergency reserve.
- Formal emergency reserve today: `0`.

## Debt And Financing

- Caixa financing:
  - Monthly payment: `1906.20`
  - Outstanding balance: `254156.57`
  - Remaining term: `419` months
- Vasco financing:
  - Monthly payment: `862.12`
  - Outstanding balance: `55175.41`
  - Paid: `9` of `74` installments
- No other debts.

## Home Forecast

- Home not received yet.
- Estimated receipt: June 2026.
- Do not include home running costs in current DRE until active.
- Pre-fill as future forecast:
  - Luz: `200`
  - Água: `100`
  - Internet: `120`
  - Celulares: `80` total
  - Condomínio: `400`
  - Total future forecast: `900` per month
- No current house, motorcycle, or life insurance.
- Health plans have no monthly fee, only copay:
  - Gustavo: Unimed
  - Luana: Amil

## Spending Targets

Groceries/market:
- Main monthly shopping: about `700`
- Weekly market extras: about `300`

Food out:
- Delivery/snack: max one per week, up to `100` each.
- Higher-end restaurant: up to `200` per month.

Personal expenses:
- Proportional/fair.
- Include clothes, personal care, individual medical, work snacks, individual purchases.

Couple expenses:
- Home, groceries, financing, bills, delivery, restaurants together, emergency reserve, investments.

## Cards

- Nubank Gustavo:
  - Limit: `10550.00`
  - Closing day: `30`
  - Due day: `7`
- Mercado Pago Gustavo:
  - Limit: `10000.00`
  - Closing day: `5`
  - Due day: `10`
- Nubank Luana:
  - Limit: `10000.00`
  - Closing day: `1`
  - Due day: `8`

Card rules:
- Paying the invoice is NOT an expense.
- Expense happens at purchase/installment recognition.
- Invoice payment is settlement/baixa/transfer.
- Avoid duplicate spending: do not count both purchase and invoice payment as expenses.

## Installments

- There are old active installments still being paid.
- User will provide them later.
- Migrate only open/future installments, not fully paid historical installments.
- Required fields for each migrated installment:
  - description
  - card
  - installment value
  - current installment number
  - total installments
  - category
  - payer/responsible person
  - scope (`Casal`, `Gustavo`, `Luana`)

## Emergency Reserve Plan

Use common personal finance guidance of 3-6 months of essential expenses as reference, but apply household context.

Targets:
- Initial minimum: `15000`
- Initial ideal: `30000` to `33000`
- Healthy later target may be higher after the home is received.

Proposed contribution:
- `1400` per month if realistic in budget.
- If tight: `1000` per month.
- If strong month: `1700` per month.

Priority rule:
- While reserve < `15000`: priority maximum.
- From `15000` to `30000`: keep contribution but allow planned home purchases.
- Above `30000`: split surplus among amortization, investments, and home goals.

## Desired Bot Recommendation Behavior

The bot should not only record data. It should recommend actions during financial events:

- 13th salary
- vacation pay
- bonus
- extra income
- large surplus
- large purchase decision
- possible amortization
- whether to reserve, invest, buy home items, or amortize financing

Recommendations must consider:
- emergency reserve progress;
- upcoming card invoices;
- active installments;
- home purchase list;
- financing balances;
- current month cash flow.

## V54 Planning Deliverable

Next agent should continue Phase 2 from `docs/MASTERPLAN_PRODUCAO_V54.md`, after reading the current `ACTIVE_CONTEXT.md` and `DECISIONS.md`.

Required sections:
- Goals and non-goals
- Current verified state
- Household financial model
- Schema proposal
- Card/invoice/installment model
- Emergency reserve model
- Future home forecast model
- Bot recommendation model
- Migration plan
- Test plan
- Rollback plan
- Acceptance criteria

Do not implement code or mutate the spreadsheet before the masterplan is reviewed.

## Suggested V54 Schema

See `.ai_shared/SHEET_SCHEMA.md` for the updated V53 verified schema and V54 proposed schema.

## Remaining Questions

- Exact active installments list.
- Home item purchase list cleanup and priority order.
- Whether to create a formal `Reserva_Emergencia` dashboard block separate from `Investimentos`.
- Whether recommendations should be rule-based first, LLM-assisted later, or both.

# SHEET_SCHEMA - Bot Financeiro

This file is the shared schema reference for Google Sheets. Agents must verify the real spreadsheet with `.ai_shared/SPREADSHEET_STATE.md` and `npm run sync` before claiming any sheet/column exists.

## Status

- Current verified production flow: `V53`.
- Current verified V54 state: skeleton sheets and headers created in the real spreadsheet on 2026-04-26; seed data, formulas, dropdowns, write paths, and migrations are not implemented yet.
- Formula standard is defined in `.ai_shared/FORMULA_STANDARD.md`.

## Formula Standard

VERIFIED current standard:
- Use `range.setFormula()`.
- Use English function names: `SUMIFS`, `IF`, `DATEDIF`, `TODAY`, `XLOOKUP`.
- Use semicolon (`;`) as argument separator.
- Do not use temp-cell `copyTo()` for formulas.
- Do not use `setValue()` for formulas unless explicitly re-tested.

## V53 - Verified Current Structure

### Config

The `Config` sheet acts as the relational dictionary and source for cached lists.

Verified structural range:
- `Config!A11:F11`: `ID_CATEGORIA | NOME_CATEGORIA | TIPO_MOVIMENTO | CLASSE_DRE | TIPO_ATIVO | REGRA_RENDIMENTO`
- `Config!H11`: `FONTES`
- `Config!J11`: `PAGADORES`

Category dictionary:

| Column | Header | Type | Description |
| :--- | :--- | :--- | :--- |
| A | `ID_CATEGORIA` | String PK | Category/asset ID, e.g. `OPEX-01`, `INV-39`, `REC-01` |
| B | `NOME_CATEGORIA` | String | Human-readable category name used by parser prompts |
| C | `TIPO_MOVIMENTO` | Enum | `Despesa`, `Receita`, `Transferência` |
| D | `CLASSE_DRE` | String | Current values include `Operacional` and `Investimento` |
| E | `TIPO_ATIVO` | String | Asset type for investment rows, blank for operational categories |
| F | `REGRA_RENDIMENTO` | JSON/String | Optional yield rule, currently future-facing |

Sources and payers:

| Range | Meaning |
| :--- | :--- |
| `H12:H50` | Valid `FONTE` values |
| `J12:J30` | Valid `PAGADOR` values |

### Lançamentos

Verified structural range:
- `Lançamentos!A5:H5`: `Data | TIPO | ID | VALOR | FONTE | DESCRIÇÃO | PAGADOR | COMPETÊNCIA`

| Column | Header | Type | Description |
| :--- | :--- | :--- | :--- |
| A | `Data` | Date | Transaction date |
| B | `TIPO` | Enum | `Despesa`, `Receita`, `Transferência` |
| C | `ID` | String FK | FK to `Config!A:A` (`ID_CATEGORIA`) |
| D | `VALOR` | Number | Positive transaction amount |
| E | `FONTE` | String | Payment source/account/card |
| F | `DESCRIÇÃO` | String | Optional detail |
| G | `PAGADOR` | String | `Gustavo` or `Luana` |
| H | `COMPETÊNCIA` | Date | Reference date/month; crucial for cards and reports |

### V53 Double Entry

Current verified behavior for Aporte:
- A controlled test wrote two rows and cleaned them up successfully.
- Row 1: `Despesa | INV-APORTE | valor | fonte origem | descrição | pagador`
- Row 2: `Receita | ID_DO_ATIVO_INV-* | valor | fonte origem | descrição | pagador`

Known semantic risk:
- Aportes/resgates/rendimentos must not inflate operational DRE. V54 must explicitly separate operational budget from assets/patrimony.

### Dashboard

Current verified facts:
- Formulas no longer report `#ERROR!`, `#NAME?`, `#REF!`, or `#N/A` in exported snapshot.
- Dashboard and Investimentos formulas use `Lançamentos!D:D` as value column and `Lançamentos!C:C` as category ID column where applicable.

Known limitation:
- Dashboard still needs a V54 redesign to separate DRE operational, patrimony/investments, credit card invoices, future home forecast, and couple settlement.

### Investimentos

Current verified structure:
- `Investimentos!A3:F3`: `Ativo | Saldo Inicial | Aportes (mês) | Resgates (mês) | Rendimentos (mês) | Saldo Atual`

Known limitation:
- Existing formulas and V53 double-entry semantics must be audited numerically before production. The current Aporte write test validates row creation, not investment balance correctness.

### Parcelas

Current verified structure:
- `Parcelas!A3:H3`: `Descrição | Valor Parcela | Parcela Atual | Total Parcelas | Cartão | Categoria | Data 1ª Parcela | Status`

Known limitation:
- This is not production-grade. It does not model invoice cycle, due date, future installment schedule, invoice payment, reconciliation, or card limits.

## V54 - Verified Skeleton Schema

V54 is the planned production redesign. As of the snapshot generated at `2026-04-26 15:27:14`, the real spreadsheet contains all 14 V54 sheets with header rows matching `scripts/lib/v54-schema.js`.

Verified scope:
- Sheet creation and row-1 headers exist.
- No V54 seed data, formulas, dropdowns, write-path integration, or migration is verified yet.
- V53 sheets remain the active production flow until V54 writes and reports are implemented in later phases.

### Required New/Redesigned Sheets

#### Config_Categorias

Proposed columns:
- `id_categoria`
- `nome`
- `grupo`
- `tipo_movimento`
- `classe_dre`
- `escopo` (`Casal`, `Gustavo`, `Luana`, `Fora orçamento`)
- `comportamento_orcamento` (`mensal`, `provisao`, `meta`, `fora_orcamento`)
- `afeta_acerto`
- `afeta_dre`
- `visibilidade_padrao` (`detalhada`, `resumo`, `privada`)
- `ativo`

#### Config_Fontes

Proposed columns:
- `id_fonte`
- `nome`
- `tipo` (`conta`, `cartao`, `beneficio`, `dinheiro`, `investimento`)
- `titular`
- `ativo`

Known planned cards:
- Nubank Gustavo: limit `10550.00`, closes day `30`, due day `7`
- Mercado Pago Gustavo: limit `10000.00`, closes day `5`, due day `10`
- Nubank Luana: limit `10000.00`, closes day `1`, due day `8`

#### Rendas

Proposed columns:
- `id_renda`
- `pessoa`
- `tipo` (`Salário`, `VA/VR`, `Auxílio`, `Extra`, `Reembolso`)
- `valor`
- `recorrente`
- `dia_recebimento`
- `uso_restrito`
- `afeta_rateio`
- `afeta_dre`
- `obs`

Known planned monthly income:
- Gustavo cash: `3400`, day 5 or previous business day
- Luana cash: `3500`, day 5
- Gustavo Alelo VA/VR: `1500`, 100% couple use, mostly groceries
- Luana VA: `300`, 100% couple use
- Gustavo fuel allowance: average `1200`, embedded in net pay and treated as normal salary

#### Cartoes

Proposed columns:
- `id_cartao`
- `id_fonte`
- `nome`
- `titular`
- `fechamento_dia`
- `vencimento_dia`
- `limite`
- `ativo`

#### Faturas

Proposed columns:
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

Rule:
- Paying an invoice is not an expense. It is a payment/settlement of card liability. The expense is the purchase or installment.
- `valor_pago` and `fonte_pagamento` are summary fields; payment-level detail lives in `Pagamentos_Fatura`.

#### Pagamentos_Fatura

Proposed columns:
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

Rule:
- Invoice payments must have `afeta_dre = FALSE`; they settle liability and must not duplicate the original purchase/installment expense.

#### Compras_Parceladas

Proposed columns:
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

#### Parcelas_Agenda

Proposed columns:
- `id_parcela`
- `id_compra`
- `numero_parcela`
- `competencia`
- `valor_parcela`
- `id_fatura`
- `status`
- `id_lancamento`

Rule:
- Existing active installments should be migrated only for future/open installments, not fully paid history.

#### Lancamentos_V54

Proposed columns:
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

Rule:
- `afeta_patrimonio` is required for assets, liabilities, reserve, amortization, and card settlement tracking.
- `visibilidade` is required so personal spending can be private or summarized without exposing detail.

#### Patrimonio_Ativos

Proposed columns:
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

Rule:
- The current `16635` earmarked for home items must use `destinacao = Casa` and must not count as emergency reserve.

#### Dividas

Proposed columns:
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

Rule:
- Caixa and Vasco should be modeled here before any amortization recommendation is allowed.

#### Acertos_Casal

Proposed columns:
- `competencia`
- `pessoa`
- `quota_esperada`
- `valor_pago_casal`
- `diferenca`
- `status`
- `observacao`

#### Fechamentos_Mensais

Proposed columns:
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

Rule:
- Monthly closing is the decision layer: it must summarize facts first, then store the three recommended decisions for the next month.

#### Orcamento_Futuro_Casa

Proposed columns:
- `item`
- `valor_previsto`
- `data_inicio_prevista`
- `ativo_no_dre`

Known planned future home costs starting around June 2026:
- Luz: `200`
- Água: `100`
- Internet: `120`
- Celulares: `80`
- Condomínio: `400`

These must be forecast-only until the home is received.

## V54 Financial Rules

- Treat the household as a shared financial unit while preserving personal autonomy.
- Reserve/investment contribution comes before personal discretionary spending.
- Current formal emergency reserve: `0`.
- Existing `16635` is earmarked for home items and must not be counted as emergency reserve.
- Emergency reserve target:
  - Initial: `15000`
  - Ideal: `30000` to `33000`
  - Proposed monthly contribution: `1400` if budget allows
- Benefits (`Alelo`, `VA`) are 100% for couple use.
- Personal expenses include clothes, personal care, individual medical, and work snacks.
- Couple expenses include home, groceries, financing, bills, delivery, restaurants together, emergency reserve, and investments.
- Delivery target: at most one snack/week up to `100` each.
- Higher-end restaurant target: up to `200` per month.

## Remaining Production Work

Before using V54 as the active production flow:
- Audit current V53 formulas numerically with fixtures.
- Decide how to represent investments without inflating operational DRE.
- Design card invoice cycle calculation before migrating installments.
- Define couple settlement formula based on proportional income and benefit usage.
- Update tests before changing production sheets.
- Implement and verify seed/config writes for V54 categories, sources, cards, incomes, debts, and assets.
- Implement V54 write paths, reports, and controlled migration without deleting or rewriting V53 history.

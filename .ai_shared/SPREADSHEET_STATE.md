# Spreadsheet State

Generated at: 2026-04-26 15:27:14

## Sheet: Dashboard

**Headers:**
- DASHBOARD — VISÃO DO MÊS | (empty) | (empty) | (empty) | (empty) | (empty) | (empty)

**Size:** 7 columns x 108 rows

**Important Formulas:**
- `B3` (✅ OK): `=Config!B6`
- `B4` (✅ OK): `=DATE(YEAR(B3);MONTH(B3);1)`
- `D4` (✅ OK): `=EOMONTH(B3;0)`
- `D8` (✅ OK): `='Orçamento Mensal'!B9`
- `E8` (✅ OK): `=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Receita"; 'Lançamentos'!A:A; ">=" & $B$4; 'Lançamentos'!A:A; "<=" & $D$4)`
- `F8` (✅ OK): `=E8 - D8`
- `G8` (✅ OK): `=IF(D8=0; 0; E8/D8)`
- `D9` (✅ OK): `='Orçamento Mensal'!B18+'Orçamento Mensal'!B29+'Orçamento Mensal'!B38+'Orçamento Mensal'!B47+'Orçamento Mensal'!B57+'Orçamento Mensal'!B67+'Orçamento Mensal'!B74`
- `E9` (✅ OK): `=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Despesa"; 'Lançamentos'!A:A; ">=" & $B$4; 'Lançamentos'!A:A; "<=" & $D$4)`
- `F9` (✅ OK): `=D9 - E9`
- `G9` (✅ OK): `=IF(D9=0;0;E9/D9)`
- `D10` (✅ OK): `=D8 - D9`
- `E10` (✅ OK): `=E8 - E9`
- `F10` (✅ OK): `=E10-D10`
- `E13` (✅ OK): `=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Receita"; 'Lançamentos'!A:A; ">=" & $B$4; 'Lançamentos'!A:A; "<=" & $D$4; 'Lançamentos'!G:G; "Luana")`
- `E14` (✅ OK): `=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Despesa"; 'Lançamentos'!A:A; ">=" & $B$4; 'Lançamentos'!A:A; "<=" & $D$4; 'Lançamentos'!G:G; "Luana")`
- `E16` (✅ OK): `=E13 - E14 - E15`
- `C21` (✅ OK): `=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Despesa"; 'Lançamentos'!A:A; ">=" & $B$4; 'Lançamentos'!A:A; "<=" & $D$4; 'Lançamentos'!G:G; "Gustavo")`
- `D21` (✅ OK): `=IF($E$9=0; 0; C21/$E$9)`
- `D26` (✅ OK): `=IF(B26=""; ""; IFERROR(VLOOKUP(B26; 'Orçamento Mensal'!A:B; 2; FALSE()); 0))`
- `E26` (✅ OK): `=IF(B26=""; ""; SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Despesa"; 'Lançamentos'!C:C; XLOOKUP(B26; Config!B:B; Config!A:A); 'Lançamentos'!A:A; ">=" & $B$4; 'Lançamentos'!A:A; "<=" & $D$4))`
- `F26` (✅ OK): `=IF(B26=""; ""; D26 - E26)`
- `G26` (✅ OK): `=IF(B26=""; ""; IF(D26=0; IF(E26=0; 0; 9,99); E26/D26))`
- `D64` (✅ OK): `=SUM(D26:D63)`
- `E64` (✅ OK): `=SUM(E26:E63)`
- `G64` (✅ OK): `=IF(D64=0; IF(E64=0; 0; 9,99); E64/D64)`
- `E69` (✅ OK): `=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Despesa"; 'Lançamentos'!C:C; XLOOKUP("Padaria/café (semana)"; Config!B:B; Config!A:A); 'Lançamentos'!G:G; "Gustavo"; 'Lançamentos'!A:A; ">=" & $B$4; 'Lançamentos'!A:A; "<=" & $D$4)`
- `E70` (✅ OK): `=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Despesa"; 'Lançamentos'!C:C; XLOOKUP("Lanches esporádicos"; Config!B:B; Config!A:A); 'Lançamentos'!G:G; "Gustavo"; 'Lançamentos'!A:A; ">=" & $B$4; 'Lançamentos'!A:A; "<=" & $D$4)`
- `E71` (✅ OK): `=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Despesa"; 'Lançamentos'!C:C; XLOOKUP("Cuidado pessoal"; Config!B:B; Config!A:A); 'Lançamentos'!G:G; "Gustavo"; 'Lançamentos'!A:A; ">=" & $B$4; 'Lançamentos'!A:A; "<=" & $D$4)`
- `E72` (✅ OK): `=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Despesa"; 'Lançamentos'!C:C; XLOOKUP("Roupas"; Config!B:B; Config!A:A); 'Lançamentos'!G:G; "Gustavo"; 'Lançamentos'!A:A; ">=" & $B$4; 'Lançamentos'!A:A; "<=" & $D$4)`
- `E73` (✅ OK): `=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Despesa"; 'Lançamentos'!C:C; XLOOKUP("Peças íntimas"; Config!B:B; Config!A:A); 'Lançamentos'!G:G; "Gustavo"; 'Lançamentos'!A:A; ">=" & $B$4; 'Lançamentos'!A:A; "<=" & $D$4)`
- `E74` (✅ OK): `=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Despesa"; 'Lançamentos'!C:C; XLOOKUP("Calçado"; Config!B:B; Config!A:A); 'Lançamentos'!G:G; "Gustavo"; 'Lançamentos'!A:A; ">=" & $B$4; 'Lançamentos'!A:A; "<=" & $D$4)`
- `E75` (✅ OK): `=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Despesa"; 'Lançamentos'!C:C; XLOOKUP("Compras Shopee/ML"; Config!B:B; Config!A:A); 'Lançamentos'!G:G; "Gustavo"; 'Lançamentos'!A:A; ">=" & $B$4; 'Lançamentos'!A:A; "<=" & $D$4)`
- `E80` (✅ OK): `=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Despesa"; 'Lançamentos'!C:C; XLOOKUP("Padaria/café (semana)"; Config!B:B; Config!A:A); 'Lançamentos'!G:G; "Luana"; 'Lançamentos'!A:A; ">=" & $B$4; 'Lançamentos'!A:A; "<=" & $D$4)`
- `E81` (✅ OK): `=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Despesa"; 'Lançamentos'!C:C; XLOOKUP("Lanches esporádicos"; Config!B:B; Config!A:A); 'Lançamentos'!G:G; "Luana"; 'Lançamentos'!A:A; ">=" & $B$4; 'Lançamentos'!A:A; "<=" & $D$4)`
- `E82` (✅ OK): `=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Despesa"; 'Lançamentos'!C:C; XLOOKUP("Cuidado pessoal"; Config!B:B; Config!A:A); 'Lançamentos'!G:G; "Luana"; 'Lançamentos'!A:A; ">=" & $B$4; 'Lançamentos'!A:A; "<=" & $D$4)`
- `E83` (✅ OK): `=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Despesa"; 'Lançamentos'!C:C; XLOOKUP("Roupas"; Config!B:B; Config!A:A); 'Lançamentos'!G:G; "Luana"; 'Lançamentos'!A:A; ">=" & $B$4; 'Lançamentos'!A:A; "<=" & $D$4)`
- `E84` (✅ OK): `=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Despesa"; 'Lançamentos'!C:C; XLOOKUP("Peças íntimas"; Config!B:B; Config!A:A); 'Lançamentos'!G:G; "Luana"; 'Lançamentos'!A:A; ">=" & $B$4; 'Lançamentos'!A:A; "<=" & $D$4)`
- `E85` (✅ OK): `=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Despesa"; 'Lançamentos'!C:C; XLOOKUP("Calçado"; Config!B:B; Config!A:A); 'Lançamentos'!G:G; "Luana"; 'Lançamentos'!A:A; ">=" & $B$4; 'Lançamentos'!A:A; "<=" & $D$4)`
- `E86` (✅ OK): `=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Despesa"; 'Lançamentos'!C:C; XLOOKUP("Compras Shopee/ML"; Config!B:B; Config!A:A); 'Lançamentos'!G:G; "Luana"; 'Lançamentos'!A:A; ">=" & $B$4; 'Lançamentos'!A:A; "<=" & $D$4)`
- `C90` (✅ OK): `=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Despesa"; 'Lançamentos'!E:E; B90; 'Lançamentos'!H:H; ">=" & $B$4; 'Lançamentos'!H:H; "<=" & $D$4)`
- `E90` (✅ OK): `=C90 + D90`
- `D97` (✅ OK): `=DATEDIF(Config!$C$7; $D$4; "M") + 1`
- `E97` (✅ OK): `=C97 * D97`
- `F97` (✅ OK): `=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Despesa"; 'Lançamentos'!C:C; XLOOKUP(B97; Config!B:B; Config!A:A); 'Lançamentos'!A:A; ">=" & Config!$C$7)`
- `G97` (✅ OK): `=E97 - F97`


## Sheet: Config_Categorias

**Headers:**
- id_categoria | nome | grupo | tipo_movimento | classe_dre | escopo | comportamento_orcamento | afeta_acerto | afeta_dre | visibilidade_padrao | ativo

**Size:** 11 columns x 1 rows

## Sheet: Config_Fontes

**Headers:**
- id_fonte | nome | tipo | titular | ativo

**Size:** 5 columns x 1 rows

## Sheet: Rendas

**Headers:**
- id_renda | pessoa | tipo | valor | recorrente | dia_recebimento | uso_restrito | afeta_rateio | afeta_dre | obs

**Size:** 10 columns x 1 rows

## Sheet: Cartoes

**Headers:**
- id_cartao | id_fonte | nome | titular | fechamento_dia | vencimento_dia | limite | ativo

**Size:** 8 columns x 1 rows

## Sheet: Faturas

**Headers:**
- id_fatura | id_cartao | competencia | data_fechamento | data_vencimento | valor_previsto | valor_fechado | valor_pago | fonte_pagamento | status

**Size:** 10 columns x 1 rows

## Sheet: Pagamentos_Fatura

**Headers:**
- id_pagamento | id_fatura | data_pagamento | valor_pago | id_fonte | pessoa | escopo | afeta_dre | afeta_acerto | afeta_patrimonio | status | observacao | created_at

**Size:** 13 columns x 1 rows

## Sheet: Compras_Parceladas

**Headers:**
- id_compra | data_compra | id_cartao | descricao | id_categoria | valor_total | parcelas_total | responsavel | escopo | visibilidade | status

**Size:** 11 columns x 1 rows

## Sheet: Parcelas_Agenda

**Headers:**
- id_parcela | id_compra | numero_parcela | competencia | valor_parcela | id_fatura | status | id_lancamento

**Size:** 8 columns x 1 rows

## Sheet: Orcamento_Futuro_Casa

**Headers:**
- item | valor_previsto | data_inicio_prevista | ativo_no_dre

**Size:** 4 columns x 1 rows

## Sheet: Lancamentos_V54

**Headers:**
- id_lancamento | data | competencia | tipo_evento | id_categoria | valor | id_fonte | pessoa | escopo | id_cartao | id_fatura | id_compra | id_parcela | afeta_dre | afeta_acerto | afeta_patrimonio | visibilidade | descricao | created_at

**Size:** 19 columns x 1 rows

## Sheet: Patrimonio_Ativos

**Headers:**
- id_ativo | nome | tipo_ativo | instituicao | saldo_inicial | saldo_atual | data_referencia | destinacao | conta_reserva_emergencia | ativo

**Size:** 10 columns x 1 rows

## Sheet: Dividas

**Headers:**
- id_divida | nome | credor | tipo | pessoa | escopo | saldo_devedor | parcela_atual | parcelas_total | valor_parcela | taxa_juros | sistema_amortizacao | data_inicio | data_atualizacao | estrategia | status | observacao

**Size:** 17 columns x 1 rows

## Sheet: Acertos_Casal

**Headers:**
- competencia | pessoa | quota_esperada | valor_pago_casal | diferenca | status | observacao

**Size:** 7 columns x 1 rows

## Sheet: Fechamentos_Mensais

**Headers:**
- competencia | status | receitas_operacionais | despesas_operacionais | saldo_operacional | faturas_60d | parcelas_futuras | taxa_poupanca | reserva_total | patrimonio_liquido | acerto_status | decisao_1 | decisao_2 | decisao_3 | created_at | closed_at

**Size:** 16 columns x 1 rows

## Sheet: Investimentos

**Headers:**
- INVESTIMENTOS - SALDO POR ATIVO | (empty) | (empty) | (empty) | (empty) | (empty)

**Size:** 6 columns x 4 rows

**Structural Rows:**
- `A3:F3` row 3: Ativo | Saldo Inicial | Aportes (mês) | Resgates (mês) | Rendimentos (mês) | Saldo Atual


**Important Formulas:**
- `B4` (✅ OK): `=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Transferência"; 'Lançamentos'!C:C; XLOOKUP(A4; Config!B:B; Config!A:A); 'Lançamentos'!E:E; "Saldo Inicial")`
- `C4` (✅ OK): `=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Transferência"; 'Lançamentos'!C:C; XLOOKUP(A4; Config!B:B; Config!A:A); 'Lançamentos'!A:A; ">=" & Dashboard!$B$4; 'Lançamentos'!A:A; "<=" & Dashboard!$D$4; 'Lançamentos'!E:E; "<>Saldo Inicial")`
- `D4` (✅ OK): `=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Transferência"; 'Lançamentos'!E:E; XLOOKUP(A4; Config!B:B; Config!A:A); 'Lançamentos'!A:A; ">=" & Dashboard!$B$4; 'Lançamentos'!A:A; "<=" & Dashboard!$D$4)`
- `E4` (✅ OK): `=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Receita"; 'Lançamentos'!C:C; XLOOKUP("Rendimento CDB"; Config!B:B; Config!A:A); 'Lançamentos'!A:A; ">=" & Dashboard!$B$4; 'Lançamentos'!A:A; "<=" & Dashboard!$D$4)`
- `F4` (✅ OK): `=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Transferência"; 'Lançamentos'!C:C; XLOOKUP(A4; Config!B:B; Config!A:A)) - SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Transferência"; 'Lançamentos'!E:E; XLOOKUP(A4; Config!B:B; Config!A:A)) + SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Receita"; 'Lançamentos'!C:C; XLOOKUP("Rendimento CDB"; Config!B:B; Config!A:A))`


## Sheet: Parcelas

**Headers:**
- PARCELAS ATIVAS | (empty) | (empty) | (empty) | (empty) | (empty) | (empty) | (empty)

**Size:** 8 columns x 3 rows

**Structural Rows:**
- `A3:H3` row 3: Descrição | Valor Parcela | Parcela Atual | Total Parcelas | Cartão | Categoria | Data 1ª Parcela | Status


## Sheet: Lançamentos

**Headers:**
- LANÇAMENTOS — DIA A DIA | (empty) | (empty) | (empty) | (empty) | (empty) | (empty) | (empty)

**Size:** 8 columns x 6 rows

**Structural Rows:**
- `A5:H5` row 5: Data | TIPO | ID | VALOR | FONTE | DESCRIÇÃO | PAGADOR | COMPETÊNCIA


## Sheet: Orçamento Mensal

**Headers:**
- ORÇAMENTO MENSAL — GUSTAVO & LUANA | (empty) | (empty) | (empty)

**Size:** 4 columns x 86 rows

## Sheet: Compras da Casa

**Headers:**
- PLANO DE COMPRAS — MONTAGEM DA CASA | (empty) | (empty) | (empty) | (empty) | (empty) | (empty)

**Size:** 7 columns x 30 rows

## Sheet: Metas de Poupança

**Headers:**
- METAS DE POUPANÇA E PROGRESSO | (empty) | (empty) | (empty)

**Size:** 4 columns x 46 rows

## Sheet: Config

**Headers:**
- CONFIG — PARÂMETROS E LISTAS (editar aqui) | (empty) | (empty) | (empty) | (empty) | (empty) | (empty) | (empty) | (empty) | (empty) | (empty) | (empty)

**Size:** 12 columns x 56 rows

**Structural Rows:**
- `A11:L20` row 11: ID_CATEGORIA | NOME_CATEGORIA | TIPO_MOVIMENTO | CLASSE_DRE | TIPO_ATIVO | REGRA_RENDIMENTO | (empty) | FONTES | (empty) | PAGADORES | (empty) | (empty)
- `A11:L20` row 12: OPEX-01 | Financ. Caixa | Despesa | Operacional | (empty) | (empty) | (empty) | Conta Gustavo | (empty) | Gustavo | (empty) | (empty)
- `A11:L20` row 13: OPEX-02 | Financ. Vasco | Despesa | Operacional | (empty) | (empty) | (empty) | Conta Luana | (empty) | Luana | (empty) | (empty)
- `A11:L20` row 14: OPEX-03 | Combustível moto | Despesa | Operacional | (empty) | (empty) | (empty) | Nubank Gu | (empty) | (empty) | (empty) | (empty)
- `A11:L20` row 15: OPEX-04 | Óleo moto (provisão) | Despesa | Operacional | (empty) | (empty) | (empty) | Nubank Lu | (empty) | (empty) | (empty) | (empty)
- `A11:L20` row 16: OPEX-05 | Uber Luana | Despesa | Operacional | (empty) | (empty) | (empty) | VR/VA Gustavo | (empty) | (empty) | (empty) | (empty)
- `A11:L20` row 17: OPEX-06 | Supermercado | Despesa | Operacional | (empty) | (empty) | (empty) | Aux. Combustível Gustavo | (empty) | (empty) | (empty) | (empty)
- `A11:L20` row 18: OPEX-07 | Feira | Despesa | Operacional | (empty) | (empty) | (empty) | Dinheiro | (empty) | (empty) | (empty) | (empty)
- `A11:L20` row 19: OPEX-08 | Açougue/padaria | Despesa | Operacional | (empty) | (empty) | (empty) | Folha (crédito em conta) | (empty) | (empty) | (empty) | (empty)
- `A11:L20` row 20: OPEX-09 | Delivery | Despesa | Operacional | (empty) | (empty) | (empty) | Outro | (empty) | (empty) | (empty) | (empty)


**Important Formulas:**
- `B4` (✅ OK): `='Orçamento Mensal'!B8`
- `B6` (✅ OK): `=TODAY()`

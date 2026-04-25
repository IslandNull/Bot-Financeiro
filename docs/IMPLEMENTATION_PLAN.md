# Evolução do Sistema Financeiro — Plano v5.2 FINAL

> **Status: PRONTO PARA APROVAÇÃO** — todas as decisões travadas.

---

## ✅ Decisões Travadas

| # | Decisão | Resultado |
|---|---------|-----------|
| D1 | Dashboard individual | **Opção B** — manter categorias, filtrar por pagador |
| D2 | Cartões | **Nubank Gu**, **Nubank Lu**, **Mercado Pago Gu** |
| D3 | Dias fechamento | **Placeholder** — marcar `⚠️ CONFIGURAR` no Config |
| D4 | Valores individuais | **Aprovados** conforme sugerido |
| D5 | Aux. combustível | **Parcial**: combustível + óleo = carimbado; sobra = renda livre |
| D6 | Acúmulo de orçamento | **Sim** — categorias de provisão acumulam mês a mês |

---

## 📦 Envelope Budgeting — Categorias que Acumulam

### Classificação Completa

#### 🔄 CONSUMO MENSAL (reseta todo mês)

| Categoria | Motivo |
|-----------|--------|
| Supermercado | Compra mensal recorrente |
| Feira | Compra semanal |
| Açougue/padaria | Consumo contínuo |
| Delivery | Consumo semanal |
| Padaria/café (semana) | Consumo diário |
| Lanches esporádicos | Apesar do nome, é gasto mensal frequente |
| Restaurante casal | Lazer mensal planejado |
| Rolê casal | Lazer mensal planejado |
| Combustível moto | Consumo mensal |
| Condomínio | Fixo mensal |
| Luz | Fixo mensal |
| Água | Fixo mensal |
| Gás | Fixo mensal |
| Celular | Fixo mensal |
| Internet | Fixo mensal |
| Streaming | Fixo mensal |
| Spotify | Fixo mensal |
| Google One | Fixo mensal |
| Financ. Caixa | Fixo mensal |
| Financ. Vasco | Fixo mensal |
| Uber Luana | Fixo mensal |

#### 📦 PROVISÃO (acumula mês a mês)

| Categoria | Planejado/mês | Uso típico | Exemplo de acúmulo |
|-----------|---------------|------------|-------------------|
| Roupas | R$ 60+R$ 60 | A cada 2-3 meses | 3 meses → R$ 180 acumulado → compra R$ 150 → sobra R$ 30 |
| Peças íntimas | R$ 25+R$ 25 | 2-3x/ano | 4 meses → R$ 100 → compra R$ 80 |
| Calçado | R$ 30+R$ 30 | 2-3x/ano | 5 meses → R$ 150 → tênis R$ 200 → puxa R$ 50 do próximo |
| Presentes | R$ 80 | Varia (aniversários) | Meses sem aniversário acumulam |
| Cuidado pessoal | R$ 50+R$ 70 | Mensal mas variável | Mês sem salão acumula |
| Dentista | R$ 50 | Semestral | 6 meses → R$ 300 → limpeza R$ 250 |
| Coparticipação médica | R$ 120 | Esporádico | Meses sem consulta acumulam |
| Farmácia | R$ 80 | Variável | Meses leves acumulam |
| Óleo moto | R$ 75 | A cada 2 meses | 2 meses → R$ 150 → troca R$ 150 |
| IPTU | R$ 60 | Anual | 12 meses → R$ 720 → boleto anual |
| Compras Shopee/ML | R$ 50+R$ 50 | Esporádico | Meses sem compra acumulam |
| Reserva imprevistos | R$ 200 | Quando precisar | Acumula indefinidamente |

### Implementação: Como Calcular Acúmulo

**Fórmula base** (por categoria de provisão):

```
Acumulado = (Planejado × Nº de meses desde início) - Total gasto histórico nessa categoria
```

**Na planilha (Dashboard)**:

Para categorias de **consumo mensal** (E26:E63 existente):
```
Realizado = SUMIFS(C:C, B:B,"Despesa", D:D,categoria, A:A,">="&início_mês, A:A,"<="&fim_mês)
Saldo = Planejado - Realizado  ← mês corrente
```

Para categorias de **provisão**, nova coluna ou seção:
```
Gasto Histórico = SUMIFS(C:C, B:B,"Despesa", D:D,categoria, A:A,">="&data_início_sistema)
Acumulado Total = Planejado × MESES_DESDE_INICIO - Gasto Histórico
```

> [!NOTE]
> **`data_início_sistema`**: data a partir da qual o orçamento começou a valer. Colocaremos em Config (ex: `01/04/2026`). Isso define o "mês 1" do acúmulo.
>
> **Exemplo concreto** (Calçado G, R$ 30/mês, início abril/2026):
> - Abril: acumulado = R$ 30 × 1 - R$ 0 gasto = R$ 30
> - Maio: acumulado = R$ 30 × 2 - R$ 0 = R$ 60
> - Junho: comprou tênis R$ 180 → acumulado = R$ 30 × 3 - R$ 180 = -R$ 90 (negativo = "deve" ao envelope)
> - Julho-Setembro: acumula de volta → mês 6: R$ 30 × 6 - R$ 180 = R$ 0 (quitou)

### No Bot

Quando o usuário manda `/saldo calçado`, a resposta muda:

**Consumo mensal:**
```
📊 Delivery: R$ 210 de R$ 280 no mês (75%)
```

**Provisão:**
```
📦 Calçado (Gustavo): R$ 90 acumulado (3 meses)
   Último gasto: nenhum
```

Após gasto:
```
📦 Calçado (Gustavo): R$ 30 usado de R$ 90 acumulado
   Restante: R$ 60
```

---

## 💰 Aux. Combustível — Modelagem

**Renda do Gustavo (revisada):**

| Componente | Valor | Tratamento |
|------------|-------|------------|
| Salário base | R$ 2.200 | Renda livre |
| Aux. combustível | R$ 1.200 | Carimbado: R$ 220 (combustível R$ 145 + óleo R$ 75) |
| Sobra aux. combustível | R$ 980 | Renda livre |
| VR/VA | R$ 1.500 | Carimbado alimentação |

**Renda livre para proporção:**

| | Gustavo | Luana | Total |
|---|---------|-------|-------|
| Renda livre | R$ 2.200 + R$ 980 = **R$ 3.180** | **R$ 3.800** | **R$ 6.980** |
| Proporção | **45,6%** | **54,4%** | 100% |

> [!NOTE]
> Essa proporção é usada para dividir despesas compartilhadas do casal. Luana contribui proporcionalmente mais porque tem salário livre maior. Se os salários mudarem, basta atualizar Config e tudo recalcula.

---

## 🗂️ Renomeação de Fontes

| Fonte Atual | Fonte Nova | Ação |
|-------------|------------|------|
| Cartão Gustavo | **Nubank Gu** | Renomear |
| Cartão Luana | **Nubank Lu** | Renomear |
| *(novo)* | **Mercado Pago Gu** | Adicionar |
| Conta Gustavo | Conta Gustavo | Mantém |
| Conta Luana | Conta Luana | Mantém |
| VR/VA Gustavo | VR/VA Gustavo | Mantém |
| Aux. Combustível Gustavo | Aux. Combustível Gustavo | Mantém |
| Dinheiro | Dinheiro | Mantém |
| Folha (crédito em conta) | Folha (crédito em conta) | Mantém |
| Outro | Outro | Mantém |
| *(novo)* | **CDB 115% CDI** | Adicionar (investimento) |
| *(novo)* | **Saldo Inicial** | Adicionar (migração) |

---

## 📐 Mudanças Completas — Célula a Célula

### Aba Config

**Novos itens:**

| Local | O que | Valor |
|-------|-------|-------|
| A13 | Tipo | `Transferência` |
| B7 | Label | `Data início sistema` |
| C7 | Valor | `01/04/2026` |
| B8 | Label | `⚠️ Fechamento Nubank Gu` |
| C8 | Valor | `⚠️ CONFIGURAR` |
| B9 | Label | `⚠️ Fechamento Nubank Lu` |
| C9 | Valor | `⚠️ CONFIGURAR` |
| C20 | Fonte | `Nubank Gu` ← renomear C13 |
| C21 | Fonte | `Nubank Lu` ← renomear C14 |
| C22 | Fonte | `Mercado Pago Gu` |
| C23 | Fonte | `CDB 115% CDI` |
| C24 | Fonte | `Saldo Inicial` |
| E49 | Categoria despesa | `CDB 115% CDI` |
| I16 | Categoria receita | `Rendimento CDB` |
| L54 | Todas categorias | `CDB 115% CDI` |
| L55 | Todas categorias | `Rendimento CDB` |

### Aba Investimentos (NOVA)

```
A1: INVESTIMENTOS - SALDO POR ATIVO
A3: Ativo | B3: Saldo Inicial | C3: Aportes (mês) | D3: Resgates (mês) | E3: Rendimentos (mês) | F3: Saldo Atual
A4: CDB 115% CDI
B4: =SUMIFS(Lançamentos!C:C, Lançamentos!B:B,"Transferência", Lançamentos!D:D,A4, Lançamentos!F:F,"Saldo Inicial")
C4: =SUMIFS(Lançamentos!C:C, Lançamentos!B:B,"Transferência", Lançamentos!D:D,A4, Lançamentos!A:A,">="&Dashboard!$B$4, Lançamentos!A:A,"<="&Dashboard!$D$4, Lançamentos!F:F,"<>Saldo Inicial")
D4: =SUMIFS(Lançamentos!C:C, Lançamentos!B:B,"Transferência", Lançamentos!F:F,A4, Lançamentos!A:A,">="&Dashboard!$B$4, Lançamentos!A:A,"<="&Dashboard!$D$4)
E4: =SUMIFS(Lançamentos!C:C, Lançamentos!B:B,"Receita", Lançamentos!D:D,"Rendimento CDB", Lançamentos!A:A,">="&Dashboard!$B$4, Lançamentos!A:A,"<="&Dashboard!$D$4)
F4: =SUMIFS(Lançamentos!C:C, Lançamentos!B:B,"Transferência", Lançamentos!D:D,A4) - SUMIFS(Lançamentos!C:C, Lançamentos!B:B,"Transferência", Lançamentos!F:F,A4) + SUMIFS(Lançamentos!C:C, Lançamentos!B:B,"Receita", Lançamentos!D:D,"Rendimento CDB")
```

### Aba Parcelas (NOVA)

```
A1: PARCELAS ATIVAS
A3: Descrição | B3: Valor Parcela | C3: Parcela Atual | D3: Total Parcelas | E3: Cartão | F3: Categoria | G3: Data 1ª Parcela | H3: Status
```

Dados iniciais: você preenche com as parcelas que tem (passo 1 do cadastro).

### Aba Dashboard — Novos blocos

**Bloco "Gastos Individuais Gustavo" (após linha 64):**

| Célula | Conteúdo |
|--------|----------|
| A67 | Gastos Individuais — Gustavo |
| B68 | Categoria | D68: Planejado | E68: Realizado | F68: Saldo | G68: Acumulado |
| B69 | Padaria/café | D69: 60 | E69: `=SUMIFS(...,"Despesa",...,B69,...,"Gustavo",...)` | F69: `=D69-E69` | G69: `=D69*MESES-SUMIFS_HISTORICO` |
| B70 | Lanches esporádicos | D70: 35 | ... |
| B71 | Cuidado pessoal | D71: 50 | ... |
| B72 | Roupas | D72: 60 | ... |
| B73 | Peças íntimas | D73: 25 | ... |
| B74 | Calçado | D74: 30 | ... |
| B75 | Compras Shopee/ML | D75: 50 | ... |

**Bloco "Gastos Individuais Luana" (após):**

| Célula | Conteúdo |
|--------|----------|
| A78 | Gastos Individuais — Luana |
| B79-B85 | Mesmas categorias | D: valores Luana | E-G: mesmas fórmulas com filtro "Luana" |

**Bloco "Fatura por Cartão" (após):**

| Célula | Conteúdo |
|--------|----------|
| A88 | Fatura por Cartão (mês corrente) |
| B89 | Cartão | C89: Parcelas | D89: À Vista | E89: Total |
| B90 | Nubank Gu | C90: `=SUMIFS(...)` | D90: `=SUMIFS(...)` | E90: `=C90+D90` |
| B91 | Nubank Lu | ... |
| B92 | Mercado Pago Gu | ... |

**Bloco "Provisões — Saldo Acumulado" (após):**

| Célula | Conteúdo |
|--------|----------|
| A95 | Provisões — Saldo Acumulado |
| B96 | Categoria | C96: Plan/mês | D96: Meses | E96: Crédito Total | F96: Gasto Total | G96: Saldo |
| B97 | Roupas (casal) | C97: 120 | D97: `=DATEDIF(...)` | E97: `=C97*D97` | F97: `=SUMIFS(histórico)` | G97: `=E97-F97` |
| ... | (todas as categorias de provisão) |

**Coluna "Acumulado" nas categorias de provisão:**

Para categorias de provisão na tabela principal (E26:E63), a coluna G (% Consumido) muda de:
```
ANTES: =IF(D26=0,0,E26/D26)  ← % do mês
DEPOIS (provisão): =IF(acumulado=0,0,E26/acumulado)  ← % do acumulado
```

### Aba Lançamentos

**Coluna H (nova): Competência**

```
H5: Competência
```

Para compras à vista: `Competência = Data` (ou vazio).
Para parcelas: `Competência = mês em que cai na fatura` (pode ser diferente da data da compra).

Isso permite o bloco "Fatura por Cartão" somar por competência, não por data de compra.

---

## 🔧 Mudanças no AppScript — Resumo

### Schema JSON
```diff
- tipo: { type: 'string', enum: ['Despesa', 'Receita'] },
+ tipo: { type: 'string', enum: ['Despesa', 'Receita', 'Transferência'] },
```

### Prompt — Novas regras
- Regra 8: Transferência (aportes, resgates)
- Regra 9: Rendimentos
- Heurísticas: "aportei", "resgatei", "rendeu", "separei"
- 4 novos exemplos (aporte, resgate, rendimento, manter)
- Renomear cartões nos exemplos existentes

### Fontes no prompt
```diff
- "cartão" + pagador Gustavo → Cartão Gustavo
- "cartão" + pagador Luana → Cartão Luana
+ "cartão" + pagador Gustavo → Nubank Gu (ou Mercado Pago Gu se mencionar)
+ "cartão" + pagador Luana → Nubank Lu
+ "mercado pago", "mp" → Mercado Pago Gu
```

### validateParse
- Aceitar `Transferência`
- Bloquear self-transfer (`fonte === categoria`)

### formatEntryResponse
- Suporte a Transferência com saldo
- `/saldo` diferencia consumo vs provisão

### Novos comandos
- `/aporte`, `/resgate`, `/render`, `/invest`
- `/manter` (Luana)
- `/parcela`, `/parcelas`, `/fatura`

### getListsCached — Ajustar ranges
```diff
- const fontes = cfg.getRange('C11:C30').getValues()
+ const fontes = cfg.getRange('C11:C35').getValues()  // mais espaço
```

---

## 📅 Fases de Execução

| Fase | O que | Esforço |
|------|-------|---------|
| **1** | Config: tipos, fontes, categorias, parâmetros, renomear cartões | ~20 min |
| **2** | Novas abas: Investimentos + Parcelas | ~30 min |
| **3** | Dashboard: blocos individuais + fatura + provisões + acúmulo | ~1h |
| **4** | Lançamentos: coluna H (competência) + migração CDB + limpeza R6 | ~15 min |
| **5** | AppScript: schema + prompt + validação + formatação | ~1h |
| **6** | AppScript: comandos investimento + /manter | ~40 min |
| **7** | AppScript: parcelas (cadastro + auto-lançamento + /fatura) | ~1h30 |
| **8** | Testes + deploy | ~30 min |

**Total: ~6h (distribuído em sessões)**

---

## ⚠️ Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Acúmulo negativo (gastou mais que acumulou) | Média | Dashboard mostra vermelho, bot alerta |
| Renomear fontes quebra lançamentos existentes | Baixa | Apenas 1 lançamento real hoje, usa "Outro" |
| "em 10x" confunde parser se junto com descrição | Média | Regex explícito + exemplos no prompt |
| Competência errada em parcela retroativa | Média | Calcular a partir da data da 1ª parcela |
| Muitas linhas no Dashboard (blocos novos) | Baixa | Seções colapsáveis ou abas separadas |

---

## ⏭️ P1 — Backlog (após P0 estabilizar)

| # | Item | Quando |
|---|------|--------|
| P1.1 | Alerta proativo de estouro (>90%) | Após 1ª semana de uso |
| P1.2 | Recorrentes semi-automáticos | Após cadastrar parcelas |
| P1.3 | API BCB para rendimento CDB | Após validar fluxo manual |
| P1.4 | Importação CSV de fatura | Após ter 1 mês de dados |
| P2.1 | Série Mensal / Tendência | Após 3 meses de dados |
| P2.2 | `/editar` lançamentos | Quando precisar |

---

> [!IMPORTANT]
> **Este plano está pronto para execução.** Não há perguntas abertas. Se aprovar, começo pela Fase 1 (Config) e sigo sequencialmente. A única informação que fica como placeholder (dias de fechamento dos cartões) pode ser configurada a qualquer momento — não bloqueia nenhuma fase.

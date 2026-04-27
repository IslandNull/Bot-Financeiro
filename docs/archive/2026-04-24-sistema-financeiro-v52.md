> ARCHIVED: historical context only. Do not use as current implementation authority.

# Sistema Financeiro v5.2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Telegram financial bot from simple expense/income tracking to a system supporting investments (CDB aporte/resgate/rendimento), envelope budgeting with monthly accumulation for provision categories, installment purchase tracking, individual expense categories per person, and multi-card invoice visibility.

**Architecture:** Two-layer system — (1) Google Sheets (tabs: Config, Lançamentos, Dashboard, new Investimentos, new Parcelas) as the data store and formula engine, and (2) Google Apps Script file `Code.js` as the Telegram webhook handler. The bot reads lists (categories, sources, payers) from Config at startup (cached 1h), writes rows to Lançamentos on each entry, and reads aggregated values from Dashboard for `/resumo` and `/saldo`. Changes are split into MANUAL tasks (user does in Google Sheets browser) and CODE tasks (agent edits `Code.js`). Manual tasks must be done **before** deploying the corresponding code changes.

**Tech Stack:** Google Apps Script (JavaScript) + clasp for deploy, Google Sheets (SUMIFS/DATEDIF formulas), OpenAI GPT-5 Nano with JSON schema structured output, Telegram Bot API

---

## File Structure

| File | Responsibility |
|------|----------------|
| `Code.js` | **The only file to edit.** Pushed to Apps Script via `npm run push`. No credentials here — secrets live in Script Properties via `_loadSecrets()`. |
| `appsscript.json` | Clasp manifest — do not edit |
| `.clasp.json` | Contains the real scriptId — do not commit (already in .gitignore) |
| `orcamento_casal_v2.xlsx` | Excel source — all Sheets changes happen in the live Google Sheets, not here |

**All code changes go to `Code.js` only.**
**Deploy workflow:** `edit Code.js → git commit → npm run push`
**Tasks labeled MANUAL require the user to act in the Google Sheets browser — the agent cannot perform these.**

### Key pattern — _loadSecrets()
```javascript
// _loadSecrets() loads OPENAI_API_KEY, TELEGRAM_TOKEN, SPREADSHEET_ID, AUTHORIZED
// into CONFIG from Script Properties. It MUST be called at the top of any
// standalone entry-point function (doPost, testParse, setWebhook, etc.).
// Internal functions (getListsCached, handleEntry, etc.) do NOT call it —
// they rely on doPost/testParse having already called it.
```

### Current Lançamentos column layout (rows start at 6, header at row 5):
```
A: Data | B: Tipo | C: Valor | D: Categoria | E: Pagador | F: Fonte | G: Descrição | H: Competência (NEW)
```

### Key Config sheet ranges (read by getListsCached):
```
B11:B20 → pagadores | C11:C35 → fontes (expanded from C11:C30) | E11:E60 → categorias despesa | I11:I20 → categorias receita
```

---

## Subagent Model Assignments

| Task | Description | Recommended Model | Reason |
|------|-------------|-------------------|--------|
| Task 6 | CONFIG + getListsCached | **haiku** | Small, deterministic changes |
| Task 7 | Schema enum update | **haiku** | Single line change |
| Task 8 | buildSystemPrompt | **sonnet** | Large rewrite with nuanced rules |
| Task 9 | validateParse | **haiku** | Small logic addition |
| Task 10 | handleEntry + desfazer + hoje | **sonnet** | Multi-function, column counting matters |
| Task 11 | formatEntryResponse + getAccumulatedSaldo | **sonnet** | New complex provisão logic |
| Task 12 | getSaldoCategoria | **haiku** | Medium, follows provisão pattern |
| Task 13 | getInvestSaldo + handleManter | **sonnet** | New investment functions |
| Task 14 | handleParcela + parcelas + fatura | **sonnet** | Complex multi-function installment logic |
| Task 15 | handleCommand + helpText | **haiku** | Simple switch-case wiring |

---

## Task 1 — MANUAL: Aba Config — Tipos, Parâmetros, Fontes, Categorias

**Where:** Google Sheets → aba "Config"

- [ ] **Step 1: Add tipo Transferência**

  In cell **A13**, type: `Transferência`
  (Joins A11=Despesa, A12=Receita)

- [ ] **Step 2: Add system parameters**

  | Cell | Content |
  |------|---------|
  | B7 | `Data início sistema` |
  | C7 | `01/04/2026` (formatted as date) |
  | B8 | `⚠️ Fechamento Nubank Gu` |
  | C8 | `⚠️ CONFIGURAR` |
  | B9 | `⚠️ Fechamento Nubank Lu` |
  | C9 | `⚠️ CONFIGURAR` |

- [ ] **Step 3: Rename existing sources (column C, fontes section)**

  Find "Cartão Gustavo" and rename to `Nubank Gu`
  Find "Cartão Luana" and rename to `Nubank Lu`

- [ ] **Step 4: Add new sources (in column C, after existing fontes)**

  Add in the next available cells:
  - `Mercado Pago Gu`
  - `CDB 115% CDI`
  - `Saldo Inicial`

  *(Sources now span C11:C35 — the expanded range the updated bot will read)*

- [ ] **Step 5: Add new expense category**

  In **E49** (or next available row in expense categories column E): `CDB 115% CDI`

- [ ] **Step 6: Add new income category**

  In **I16** (or next available row in income categories column I): `Rendimento CDB`

- [ ] **Step 7: Add to "All categories" column (L)**

  In **L54**: `CDB 115% CDI`
  In **L55**: `Rendimento CDB`

---

## Task 2 — MANUAL: Aba Lançamentos — Coluna H (Competência)

**Where:** Google Sheets → aba "Lançamentos"

- [ ] **Step 1: Add column header**

  In **H5**, type: `Competência`

- [ ] **Step 2: Format column H**

  Select column H → Format → Number → Date (same format as column A: `dd/mm/yyyy`)

- [ ] **Step 3: Back-fill existing rows**

  For all existing data rows (row 6 onward), set H = same value as A (Data).
  Quick formula in H6: `=A6`, then copy down. After filling, paste-as-values to remove formula dependency.

---

## Task 3 — MANUAL: Criar aba Investimentos

**Where:** Google Sheets → click "+" to add new tab, name it "Investimentos"

- [ ] **Step 1: Add headers**

  ```
  A1: INVESTIMENTOS - SALDO POR ATIVO
  A3: Ativo | B3: Saldo Inicial | C3: Aportes (mês) | D3: Resgates (mês) | E3: Rendimentos (mês) | F3: Saldo Atual
  A4: CDB 115% CDI
  ```

- [ ] **Step 2: Add formulas in B4:F4**

  *(Replace `Dashboard!$B$4` and `$D$4` with actual cells where your Dashboard stores month start/end)*

  ```
  B4: =SUMIFS(Lançamentos!C:C,Lançamentos!B:B,"Transferência",Lançamentos!D:D,A4,Lançamentos!F:F,"Saldo Inicial")
  C4: =SUMIFS(Lançamentos!C:C,Lançamentos!B:B,"Transferência",Lançamentos!D:D,A4,Lançamentos!A:A,">="&Dashboard!$B$4,Lançamentos!A:A,"<="&Dashboard!$D$4,Lançamentos!F:F,"<>Saldo Inicial")
  D4: =SUMIFS(Lançamentos!C:C,Lançamentos!B:B,"Transferência",Lançamentos!F:F,A4,Lançamentos!A:A,">="&Dashboard!$B$4,Lançamentos!A:A,"<="&Dashboard!$D$4)
  E4: =SUMIFS(Lançamentos!C:C,Lançamentos!B:B,"Receita",Lançamentos!D:D,"Rendimento CDB",Lançamentos!A:A,">="&Dashboard!$B$4,Lançamentos!A:A,"<="&Dashboard!$D$4)
  F4: =SUMIFS(Lançamentos!C:C,Lançamentos!B:B,"Transferência",Lançamentos!D:D,A4)-SUMIFS(Lançamentos!C:C,Lançamentos!B:B,"Transferência",Lançamentos!F:F,A4)+SUMIFS(Lançamentos!C:C,Lançamentos!B:B,"Receita",Lançamentos!D:D,"Rendimento CDB")
  ```

- [ ] **Step 3: Format B4:F4 as currency** `R$ #,##0.00`

---

## Task 4 — MANUAL: Criar aba Parcelas

**Where:** Google Sheets → click "+" to add new tab, name it "Parcelas"

- [ ] **Step 1: Add headers**

  ```
  A1: PARCELAS ATIVAS
  A3: Descrição | B3: Valor Parcela | C3: Parcela Atual | D3: Total Parcelas | E3: Cartão | F3: Categoria | G3: Data 1ª Parcela | H3: Status
  ```

- [ ] **Step 2: Format** — Column B: currency | Column G: date | Column H: text

- [ ] **Step 3: Populate existing installments** manually (if any active)

---

## Task 5 — MANUAL: Dashboard — Novos Blocos

**Where:** Google Sheets → aba "Dashboard" (after existing category table ending ~row 64)

- [ ] **Step 1: Individual expenses — Gustavo (rows 67–75)**

  ```
  A67: Gastos Individuais — Gustavo
  B68: Categoria | D68: Planejado | E68: Realizado | F68: Saldo | G68: Acumulado
  ```

  Categories + planned values (filter Pagador="Gustavo"):
  - B69: Padaria/café (semana) | D69: 60
  - B70: Lanches esporádicos | D70: 35
  - B71: Cuidado pessoal | D71: 50
  - B72: Roupas | D72: 60
  - B73: Peças íntimas | D73: 25
  - B74: Calçado | D74: 30
  - B75: Compras Shopee/ML | D75: 50

  E column formula (example E69):
  ```
  =SUMIFS(Lançamentos!C:C,Lançamentos!B:B,"Despesa",Lançamentos!D:D,B69,Lançamentos!E:E,"Gustavo",Lançamentos!A:A,">="&$B$4,Lançamentos!A:A,"<="&$D$4)
  ```

- [ ] **Step 2: Individual expenses — Luana (rows 78–85)**

  Same structure, filter `"Luana"`, same categories, same planned values.

- [ ] **Step 3: Fatura por cartão (rows 88–92)**

  ```
  A88: Fatura por Cartão (mês corrente)
  B89: Cartão | C89: Total fatura | E89: Total
  B90: Nubank Gu | B91: Nubank Lu | B92: Mercado Pago Gu
  ```

  C90 formula (sum Despesas by fonte in competência period):
  ```
  =SUMIFS(Lançamentos!C:C,Lançamentos!B:B,"Despesa",Lançamentos!F:F,B90,Lançamentos!H:H,">="&$B$4,Lançamentos!H:H,"<="&$D$4)
  ```

- [ ] **Step 4: Provisões — Saldo Acumulado (rows 95+)**

  ```
  A95: Provisões — Saldo Acumulado
  B96: Categoria | C96: Plan/mês | D96: Meses | E96: Crédito Total | F96: Gasto Total | G96: Saldo
  ```

  D97: `=DATEDIF(Config!$C$7,TODAY(),"M")+1`
  E97: `=C97*D97`
  F97: `=SUMIFS(Lançamentos!C:C,Lançamentos!B:B,"Despesa",Lançamentos!D:D,B97,Lançamentos!A:A,">="&Config!$C$7)`
  G97: `=E97-F97`

  Provision categories and plan/mês:
  Roupas 120 | Peças íntimas 50 | Calçado 60 | Presentes 80 | Cuidado pessoal 120 | Dentista 50 | Coparticipação médica 120 | Farmácia 80 | Óleo moto 75 | IPTU 60 | Compras Shopee/ML 100 | Reserva imprevistos 200

---

## Task 6 — CODE: Update CONFIG and getListsCached [model: haiku]

**File:** `Code.js`

- [ ] **Step 1: Add new sheets to CONFIG.SHEETS**

  Find the CONFIG block (line 5). Replace:

  ```javascript
  SHEETS: {
      lancamentos: 'Lançamentos',
      config: 'Config',
      dashboard: 'Dashboard'
  }
  ```

  With:

  ```javascript
  SHEETS: {
      lancamentos: 'Lançamentos',
      config: 'Config',
      dashboard: 'Dashboard',
      investimentos: 'Investimentos',
      parcelas: 'Parcelas'
  }
  ```

- [ ] **Step 2: Add PROVISAO_CATS constant after the CONFIG block (after line 13, before `function _loadSecrets()`)**

  ```javascript
  const PROVISAO_CATS = [
      'Roupas', 'Peças íntimas', 'Calçado', 'Presentes',
      'Cuidado pessoal', 'Dentista', 'Coparticipação médica',
      'Farmácia', 'Óleo moto', 'IPTU', 'Compras Shopee/ML', 'Reserva imprevistos'
  ];
  ```

- [ ] **Step 3: Expand fontes range in getListsCached (line ~356)**

  Find:
  ```javascript
  const fontes = cfg.getRange('C11:C30').getValues().flat().filter(String);
  ```

  Replace with:
  ```javascript
  const fontes = cfg.getRange('C11:C35').getValues().flat().filter(String);
  ```

- [ ] **Step 4: Add temporary test function at bottom, run it in Apps Script Editor, delete it**

  ```javascript
  function testGetLists() {
      _loadSecrets();
      CacheService.getScriptCache().remove('lists_v1');
      const lists = getListsCached();
      console.log('Fontes:', lists.fontes);
      console.log('Categorias count:', lists.categorias.length);
      // Expected: fontes includes 'Nubank Gu', 'CDB 115% CDI', 'Saldo Inicial'
      // Expected: categorias includes 'CDB 115% CDI', 'Rendimento CDB'
  }
  ```

  After confirming in editor logs, delete `testGetLists`.

- [ ] **Step 5: Commit and push**

  ```bash
  git add Code.js
  git commit -m "feat: add investment/installment sheets to CONFIG, expand fontes range, add PROVISAO_CATS"
  npm run push
  ```

---

## Task 7 — CODE: Update JSON Schema (add Transferência type) [model: haiku]

**File:** `Code.js` — inside `parseWithOpenAI`

- [ ] **Step 1: Update tipo enum in schema (line ~151)**

  Find:
  ```javascript
  tipo: { type: 'string', enum: ['Despesa', 'Receita'] },
  ```

  Replace with:
  ```javascript
  tipo: { type: 'string', enum: ['Despesa', 'Receita', 'Transferência'] },
  ```

- [ ] **Step 2: Commit and push**

  ```bash
  git add Code.js
  git commit -m "feat: add Transferência to JSON schema tipo enum"
  npm run push
  ```

---

## Task 8 — CODE: Update buildSystemPrompt [model: sonnet]

**File:** `Code.js` — replace entire `buildSystemPrompt` function (lines ~185–317)

- [ ] **Step 1: Replace buildSystemPrompt with updated version**

  ```javascript
  function buildSystemPrompt(categorias, fontes, pagadores, pagadorDefault) {
      return `<identidade>
  Você é o parser de mensagens financeiras do bot doméstico do casal Gustavo e Luana.
  Sua única função é transformar mensagens em português brasileiro informal
  em registros estruturados de gastos, receitas ou transferências entre contas.
  </identidade>

  <regras_globais>
  1. TIPO: assuma "Despesa" por padrão. Marque "Receita" SOMENTE quando a mensagem
     descrever recebimento (salário, bônus, reembolso, PIX recebido, estorno).
     Marque "Transferência" para movimentação entre contas/investimentos (regra 8).

  2. VALOR: extraia o número exatamente como informado, PRESERVANDO casas decimais.
     "R$ 52,75" → 52.75 (não arredonde para 53).
     Aceite formatos: "52", "52,50", "R$ 52", "52 reais", "52.50".
     Sempre positivo.

  3. CATEGORIA: escolha SEMPRE uma das opções em <mapeamento_categorias>.
     Se nenhuma encaixar com segurança, use "Outros" E preencha "descricao"
     com o termo original da mensagem E preencha "error" com:
     "Não encontrei categoria exata. Confirma 'Outros' ou manda a categoria?"

  4. PAGADOR: use o valor passado em <contexto_pagador_default> por padrão
     (é quem mandou a mensagem no Telegram).
     Altere SOMENTE quando a mensagem citar explicitamente a outra pessoa
     ("luana pagou", "foi o gustavo", "ela comprou").
     Valores aceitos: ${pagadores.join(' ou ')}.

  5. FONTE: escolha SEMPRE uma das opções em <mapeamento_fontes>.
     Se a mensagem não dá pista da fonte, use "Outro" (é uma opção válida).
     Para Transferência: FONTE = conta/investimento de ORIGEM do dinheiro.

  6. DESCRICAO: texto livre curto, opcional. Preencha quando houver
     informação adicional útil (nome do estabelecimento, motivo).
     Caso contrário, retorne string vazia "".

  7. ERROR: retorne null quando o parse foi bem-sucedido.
     Preencha com uma pergunta curta ao usuário APENAS nestes casos:
     (a) categoria sem encaixe (ver regra 3),
     (b) valor ausente ou ambíguo na mensagem,
     (c) tipo (Despesa/Receita/Transferência) realmente ambíguo.
     Nesses casos, ainda retorne um JSON válido: use valor=0 e
     categoria="Outros" como placeholders.

  8. TRANSFERÊNCIA: use tipo="Transferência" quando a mensagem descrever
     movimentação entre contas ou para/de investimentos.
     Heurísticas: "aportei", "resgatei", "separei", "mandei pro cdb", "tirei do cdb".
     FONTE = origem (ex: "Conta Gustavo" para aporte; "CDB 115% CDI" para resgate).
     CATEGORIA = destino (ex: "CDB 115% CDI" para aporte; "Conta Gustavo" para resgate).
     ATENÇÃO: fonte NUNCA pode ser igual à categoria (auto-transferência é inválida).

  9. RENDIMENTOS: use tipo="Receita" e categoria="Rendimento CDB" quando
     a mensagem descrever rendimento de investimento.
     Heurísticas: "rendeu", "rende do cdb", "rendimento do cdb".
     FONTE = "CDB 115% CDI".
  </regras_globais>

  <contexto_pagador_default>
  ${pagadorDefault}
  </contexto_pagador_default>

  <mapeamento_categorias>
  <opcoes_validas>
  ${categorias.map(c => `- ${c}`).join('\n')}
  </opcoes_validas>

  <regras_de_inferencia>
  - "ifood", "rappi", "delivery", "pedi comida" → Delivery
  - "mercado", "zaffari", "carrefour", "compra do mês" → Supermercado
  - "feira", "hortifruti", "ceasa" → Feira
  - "açougue", "padaria" (compra estruturada) → Açougue/padaria
  - "café", "padaria na rua", "cafezinho" (consumo rápido recorrente) → Padaria/café (semana)
  - "lanche", "lanchinho", "pastel", "coxinha", "salgado" (consumo esporádico) → Lanches esporádicos
  - "salão", "barba", "manicure", "cabelo" → Cuidado pessoal
  - "uber", "99", "taxi" (da luana pro trabalho) → Uber Luana
  - "gasolina", "combustível" (moto do gustavo) → Combustível moto
  - "netflix", "disney", "prime", "max", "globoplay" → Streaming
  - "shopee", "mercado livre", "aliexpress" → Compras Shopee/ML
  - "restaurante", "jantar fora" (casal) → Restaurante casal
  - "luz", "cemig", "rge", "cpfl" → Luz
  - "água", "saneamento" → Água
  - "condomínio" → Condomínio
  - "financiamento caixa", "parcela casa" → Financ. Caixa
  - "vasco" (financiamento da entrada) → Financ. Vasco
  - "salário" + pagador → Salário Gustavo ou Salário Luana
  - "aportei", "mandei pro cdb" → categoria=CDB 115% CDI (tipo=Transferência)
  - "resgatei", "tirei do cdb" → categoria=Conta Gustavo (tipo=Transferência, fonte=CDB 115% CDI)
  - "rendeu", "rendimento cdb" → categoria=Rendimento CDB (tipo=Receita, fonte=CDB 115% CDI)
  </regras_de_inferencia>
  </mapeamento_categorias>

  <mapeamento_fontes>
  <opcoes_validas>
  ${fontes.map(f => `- ${f}`).join('\n')}
  </opcoes_validas>

  <regras_de_inferencia>
  - "cartão" ou "nubank" + pagador Gustavo → Nubank Gu
  - "cartão" ou "nubank" + pagador Luana → Nubank Lu
  - "mercado pago", "mp" → Mercado Pago Gu
  - "pix", "débito", "conta" + pagador → Conta Gustavo ou Conta Luana
  - "vr", "va", "vale refeição", "vale alimentação" → VR/VA Gustavo
  - "auxílio combustível", "aux combustível" → Aux. Combustível Gustavo
  - Sem pista → Outro
  - Receita de salário/VR/aux (tipo=Receita) → Folha (crédito em conta)
  - Aporte ao CDB: fonte=Conta Gustavo (ou Conta Luana)
  - Resgate do CDB: fonte=CDB 115% CDI
  - Rendimento CDB: fonte=CDB 115% CDI
  </regras_de_inferencia>
  </mapeamento_fontes>

  <formato_saida>
  JSON com os campos: tipo, valor, categoria, pagador, fonte, descricao, error.
  O schema é aplicado pela API — preencha todos os campos obrigatórios,
  respeitando os tipos e as opções válidas dos mapeamentos acima.
  </formato_saida>

  <exemplos>
  <exemplo_1>
  Entrada: "52 ifood luana nubank"
  Saída: {"tipo":"Despesa","valor":52,"categoria":"Delivery","pagador":"Luana","fonte":"Nubank Lu","descricao":"","error":null}
  </exemplo_1>

  <exemplo_2>
  Entrada: "gastei 35,50 no café" (contexto: pagador default = Gustavo)
  Saída: {"tipo":"Despesa","valor":35.50,"categoria":"Padaria/café (semana)","pagador":"Gustavo","fonte":"Nubank Gu","descricao":"","error":null}
  </exemplo_2>

  <exemplo_3>
  Entrada: "1910 financiamento caixa" (contexto: pagador default = Gustavo)
  Saída: {"tipo":"Despesa","valor":1910,"categoria":"Financ. Caixa","pagador":"Gustavo","fonte":"Conta Gustavo","descricao":"","error":null}
  </exemplo_3>

  <exemplo_4>
  Entrada: "420,75 mercado zaffari vr" (contexto: pagador default = Gustavo)
  Saída: {"tipo":"Despesa","valor":420.75,"categoria":"Supermercado","pagador":"Gustavo","fonte":"VR/VA Gustavo","descricao":"Zaffari","error":null}
  </exemplo_4>

  <exemplo_5>
  Entrada: "recebi salário 3800 luana"
  Saída: {"tipo":"Receita","valor":3800,"categoria":"Salário Luana","pagador":"Luana","fonte":"Folha (crédito em conta)","descricao":"","error":null}
  </exemplo_5>

  <exemplo_6>
  Entrada: "aportei 500 no cdb" (contexto: pagador default = Gustavo)
  Saída: {"tipo":"Transferência","valor":500,"categoria":"CDB 115% CDI","pagador":"Gustavo","fonte":"Conta Gustavo","descricao":"","error":null}
  </exemplo_6>

  <exemplo_7>
  Entrada: "resgatei 300 do cdb" (contexto: pagador default = Gustavo)
  Saída: {"tipo":"Transferência","valor":300,"categoria":"Conta Gustavo","pagador":"Gustavo","fonte":"CDB 115% CDI","descricao":"","error":null}
  </exemplo_7>

  <exemplo_8>
  Entrada: "o cdb rendeu 45,80 esse mês" (contexto: pagador default = Gustavo)
  Saída: {"tipo":"Receita","valor":45.80,"categoria":"Rendimento CDB","pagador":"Gustavo","fonte":"CDB 115% CDI","descricao":"","error":null}
  </exemplo_8>

  <exemplo_9>
  Entrada: "gastei algumas coisas" (contexto: pagador default = Gustavo)
  Saída: {"tipo":"Despesa","valor":0,"categoria":"Outros","pagador":"Gustavo","fonte":"Outro","descricao":"","error":"Qual o valor e a categoria?"}
  </exemplo_9>

  <exemplo_10>
  Entrada: "50 ração do cachorro pix" (contexto: pagador default = Gustavo)
  Saída: {"tipo":"Despesa","valor":50,"categoria":"Outros","pagador":"Gustavo","fonte":"Conta Gustavo","descricao":"ração cachorro","error":"Não encontrei categoria exata. Confirma 'Outros' ou manda a categoria?"}
  </exemplo_10>
  </exemplos>`;
  }
  ```

- [ ] **Step 2: Add test function at bottom, run in Apps Script Editor (delete after)**

  ```javascript
  function testParseV52() {
      _loadSecrets();
      const cases = [
          { text: '52 ifood luana nubank', expected: 'Nubank Lu' },
          { text: 'aportei 500 no cdb', expected: 'Transferência' },
          { text: 'resgatei 300 do cdb', expected: 'CDB 115% CDI' },
          { text: 'cdb rendeu 45,80', expected: 'Rendimento CDB' },
          { text: '38 mercado pago', expected: 'Mercado Pago Gu' }
      ];
      for (const c of cases) {
          const r = parseWithOpenAI(c.text, 'Gustavo');
          const pass = JSON.stringify(r).includes(c.expected);
          console.log(pass ? '✅' : '❌', c.text, '→', JSON.stringify(r));
      }
  }
  ```

  After confirming all 5 tests show ✅ in editor logs, delete `testParseV52`.

- [ ] **Step 3: Commit and push**

  ```bash
  git add Code.js
  git commit -m "feat: update buildSystemPrompt - Transferência rules, renamed sources, 4 new examples"
  npm run push
  ```

---

## Task 9 — CODE: Update validateParse [model: haiku]

**File:** `Code.js` — function `validateParse` (lines ~322–341)

- [ ] **Step 1: Replace validateParse**

  ```javascript
  function validateParse(p) {
      const { categorias, fontes, pagadores } = getListsCached();

      if (typeof p.valor !== 'number' || p.valor <= 0) {
          return { ok: false, message: `Valor inválido: "${p.valor}". Precisa ser um número maior que zero.` };
      }
      if (!['Despesa', 'Receita', 'Transferência'].includes(p.tipo)) {
          return { ok: false, message: `Tipo "${p.tipo}" inválido.` };
      }
      if (!pagadores.includes(p.pagador)) {
          return { ok: false, message: `Pagador "${p.pagador}" inválido. Use Gustavo ou Luana.` };
      }
      if (!fontes.includes(p.fonte)) {
          return { ok: false, message: `Fonte "${p.fonte}" não existe. Ex: Nubank Gu, Conta Gustavo, CDB 115% CDI.` };
      }
      // For Transferência, categoria is the destination — can be a category OR a fonte (account)
      if (p.tipo === 'Transferência') {
          if (!categorias.includes(p.categoria) && !fontes.includes(p.categoria)) {
              return { ok: false, message: `Destino "${p.categoria}" inválido para Transferência. Use uma conta ou investimento válido.` };
          }
          if (p.fonte === p.categoria) {
              return { ok: false, message: `Transferência inválida: origem e destino são iguais (${p.fonte}).` };
          }
      } else {
          if (!categorias.includes(p.categoria)) {
              return { ok: false, message: `Categoria "${p.categoria}" não existe. Ex: Delivery, Supermercado, Financ. Caixa.` };
          }
      }
      return { ok: true };
  }
  ```

- [ ] **Step 2: Commit and push**

  ```bash
  git add Code.js
  git commit -m "feat: validateParse accepts Transferência, blocks self-transfer"
  npm run push
  ```

---

## Task 10 — CODE: Update handleEntry, desfazerUltimo, getLancamentosHoje (8 columns) [model: sonnet]

**File:** `Code.js`

- [ ] **Step 1: Replace handleEntry (lines ~58–104)**

  ```javascript
  function handleEntry(text, chatId, user) {
      let parsed;
      try {
          parsed = parseWithOpenAI(text, user.pagador);
      } catch (err) {
          sendTelegram(chatId, `⚠️ Erro ao interpretar a mensagem: ${err.message}\n\nTente algo como: "52 ifood luana nubank" ou "aportei 500 no cdb".`);
          return;
      }

      if (parsed.error) {
          sendTelegram(chatId, `🤔 Não entendi: ${parsed.error}\n\nExemplos:\n• "52 ifood luana nubank"\n• "gastei 35 no café"\n• "aportei 500 no cdb"`);
          return;
      }

      const validation = validateParse(parsed);
      if (!validation.ok) {
          sendTelegram(chatId, `⚠️ ${validation.message}`);
          return;
      }

      const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      const sheet = ss.getSheetByName(CONFIG.SHEETS.lancamentos);
      const date = new Date();
      const newRow = sheet.getLastRow() + 1;

      // Column H (Competência) = same as date for non-installment entries
      sheet.getRange(newRow, 1, 1, 8).setValues([[
          date,
          parsed.tipo,
          parsed.valor,
          parsed.categoria,
          parsed.pagador,
          parsed.fonte,
          parsed.descricao || '',
          date
      ]]);

      sheet.getRange(newRow, 1).setNumberFormat('dd/mm/yyyy');
      sheet.getRange(newRow, 3).setNumberFormat('"R$ "#,##0.00');
      sheet.getRange(newRow, 8).setNumberFormat('dd/mm/yyyy');

      PropertiesService.getScriptProperties()
          .setProperty('last_row_' + chatId, String(newRow));

      sendTelegram(chatId, formatEntryResponse(parsed, date));
  }
  ```

- [ ] **Step 2: Update desfazerUltimo — change column count from 7 to 8**

  Find in `desfazerUltimo` (lines ~506–526):
  ```javascript
  const vals = sheet.getRange(row, 1, 1, 7).getValues()[0];
  ```
  Replace with:
  ```javascript
  const vals = sheet.getRange(row, 1, 1, 8).getValues()[0];
  ```

  And:
  ```javascript
  sheet.getRange(row, 1, 1, 7).clearContent();
  ```
  Replace with:
  ```javascript
  sheet.getRange(row, 1, 1, 8).clearContent();
  ```

- [ ] **Step 3: Update getLancamentosHoje — change column count from 7 to 8**

  Find in `getLancamentosHoje` (line ~492):
  ```javascript
  const rows = sheet.getRange(6, 1, last - 5, 7).getValues();
  ```
  Replace with:
  ```javascript
  const rows = sheet.getRange(6, 1, last - 5, 8).getValues();
  ```

- [ ] **Step 4: Commit and push**

  ```bash
  git add Code.js
  git commit -m "feat: handleEntry writes 8 columns (Competência), update desfazer and hoje"
  npm run push
  ```

---

## Task 11 — CODE: Update formatEntryResponse + add getAccumulatedSaldo [model: sonnet]

**File:** `Code.js`

- [ ] **Step 1: Add helper functions before getCategorySaldo (before line ~541)**

  Insert these two new functions immediately before `getCategorySaldo`:

  ```javascript
  function monthsDiff(d1, d2) {
      return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth()) + 1;
  }

  function getAccumulatedSaldo(categoria) {
      const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      const cfg = ss.getSheetByName(CONFIG.SHEETS.config);
      const dataInicio = cfg.getRange('C7').getValue();
      if (!dataInicio) return null;

      const meses = monthsDiff(new Date(dataInicio), new Date());
      const dash = ss.getSheetByName(CONFIG.SHEETS.dashboard);

      // Find planned amount for this category in Dashboard (B and D columns, rows 26-130)
      const dashData = dash.getRange('B26:D130').getValues();
      const dashRow = dashData.find(r => r[0] === categoria);
      const planejado = dashRow ? dashRow[2] : 0;
      if (!planejado) return null;

      // Sum all historical spending for this category since sistema start
      const sheet = ss.getSheetByName(CONFIG.SHEETS.lancamentos);
      const lastRow = sheet.getLastRow();
      if (lastRow < 6) return { planejado, meses, creditoTotal: planejado * meses, gastoHistorico: 0, acumulado: planejado * meses };

      const lancData = sheet.getRange(6, 1, lastRow - 5, 8).getValues();
      const gastoHistorico = lancData
          .filter(r => r[3] === categoria && r[1] === 'Despesa' && r[0] >= dataInicio)
          .reduce((sum, r) => sum + (typeof r[2] === 'number' ? r[2] : 0), 0);

      return {
          planejado,
          meses,
          creditoTotal: planejado * meses,
          gastoHistorico,
          acumulado: planejado * meses - gastoHistorico
      };
  }
  ```

- [ ] **Step 2: Replace formatEntryResponse (lines ~106–125)**

  ```javascript
  function formatEntryResponse(p, date) {
      const dataStr = Utilities.formatDate(date, CONFIG.TIMEZONE, 'dd/MM/yyyy');
      const valorStr = formatBRL(p.valor);

      if (p.tipo === 'Transferência') {
          return `✅ Transferência registrada\n💸 ${valorStr}\n📤 ${p.fonte} → ${p.categoria}\n👤 ${p.pagador}\n📅 ${dataStr}`;
      }

      const icon = p.tipo === 'Receita' ? '💵' : '💸';
      let resp = `✅ Registrado\n${icon} ${valorStr} — ${p.categoria}\n👤 ${p.pagador} • ${p.fonte}\n📅 ${dataStr}`;

      if (p.descricao) resp += `\n📝 ${p.descricao}`;

      if (p.tipo === 'Despesa') {
          if (PROVISAO_CATS.includes(p.categoria)) {
              const s = getAccumulatedSaldo(p.categoria);
              if (s) {
                  const pct = s.creditoTotal > 0 ? Math.round((s.gastoHistorico / s.creditoTotal) * 100) : 0;
                  const alerta = s.acumulado < 0 ? ' ⚠️ NEGATIVO' : pct > 80 ? ' ⚡' : ' ✅';
                  resp += `\n\n📦 ${p.categoria} (${s.meses} meses acumulados):\n${formatBRL(s.gastoHistorico)} de ${formatBRL(s.creditoTotal)} (${pct}%)\nSaldo envelope: ${formatBRL(s.acumulado)}${alerta}`;
              }
          } else {
              const s = getCategorySaldo(p.categoria);
              if (s) {
                  const pct = s.planejado > 0 ? Math.round((s.gasto / s.planejado) * 100) : 0;
                  const alerta = pct > 100 ? ' ⚠️ ESTOUROU' : pct > 80 ? ' ⚡' : pct > 50 ? '' : ' ✅';
                  resp += `\n\n📊 ${p.categoria} no mês:\n${formatBRL(s.gasto)} de ${formatBRL(s.planejado)} (${pct}%)${alerta}`;
              }
          }
      }

      return resp;
  }
  ```

- [ ] **Step 3: Commit and push**

  ```bash
  git add Code.js
  git commit -m "feat: formatEntryResponse handles Transferência and provisão envelope display"
  npm run push
  ```

---

## Task 12 — CODE: Update getSaldoCategoria (provisão-aware /saldo) [model: haiku]

**File:** `Code.js` — function `getSaldoCategoria` (lines ~444–462)

- [ ] **Step 1: Replace getSaldoCategoria**

  ```javascript
  function getSaldoCategoria(nomeAprox) {
      const { categorias } = getListsCached();
      const n = nomeAprox.toLowerCase();
      const match = categorias.find(c => c.toLowerCase().includes(n));

      if (!match) {
          const sugestoes = categorias.filter(c =>
              n.split(' ').some(w => w.length > 2 && c.toLowerCase().includes(w))
          ).slice(0, 5);
          return `Categoria "${nomeAprox}" não encontrada.${sugestoes.length ? '\n\nTalvez:\n' + sugestoes.map(s => '• ' + s).join('\n') : ''}`;
      }

      if (PROVISAO_CATS.includes(match)) {
          const s = getAccumulatedSaldo(match);
          if (!s) return `Categoria ${match} sem planejado configurado.`;
          const pct = s.creditoTotal > 0 ? Math.round((s.gastoHistorico / s.creditoTotal) * 100) : 0;
          const alerta = s.acumulado < 0 ? ' ⚠️ NEGATIVO' : '';
          return `📦 *${match}* (provisão)\nPlan/mês: ${formatBRL(s.planejado)} × ${s.meses} meses\nCrédito acumulado: ${formatBRL(s.creditoTotal)}\nGasto histórico: ${formatBRL(s.gastoHistorico)} (${pct}%)\nSaldo envelope: ${formatBRL(s.acumulado)}${alerta}`;
      }

      const s = getCategorySaldo(match);
      if (!s) return `Categoria ${match} sem planejado.`;
      const pct = s.planejado > 0 ? Math.round((s.gasto / s.planejado) * 100) : 0;
      const restante = s.planejado - s.gasto;
      return `📊 *${match}*\nPlanejado: ${formatBRL(s.planejado)}\nGasto: ${formatBRL(s.gasto)} (${pct}%)\nRestante: ${formatBRL(restante)}`;
  }
  ```

- [ ] **Step 2: Commit and push**

  ```bash
  git add Code.js
  git commit -m "feat: getSaldoCategoria differentiates provisão envelope vs monthly budget"
  npm run push
  ```

---

## Task 13 — CODE: Add investment + manter functions [model: sonnet]

**File:** `Code.js` — add after `getAcertoMes` (after line ~536)

- [ ] **Step 1: Add getInvestSaldo**

  ```javascript
  function getInvestSaldo() {
      const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      const inv = ss.getSheetByName(CONFIG.SHEETS.investimentos);
      if (!inv) return 'Aba Investimentos não encontrada. Configure a planilha primeiro.';

      const row = inv.getRange('A4:F4').getValues()[0];
      const [ativo, saldoInicial, aportes, resgates, rendimentos, saldoAtual] = row;
      if (!ativo) return 'Nenhum investimento cadastrado na aba Investimentos.';

      const mes = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'MMMM/yyyy');
      return `📈 *${ativo}*\n\nSaldo atual: *${formatBRL(saldoAtual)}*\n\n📅 ${mes}:\n  Aportes: ${formatBRL(aportes)}\n  Resgates: ${formatBRL(resgates)}\n  Rendimentos: ${formatBRL(rendimentos)}\n\nSaldo inicial total: ${formatBRL(saldoInicial)}`;
  }
  ```

- [ ] **Step 2: Add handleManter**

  ```javascript
  function handleManter(chatId, user) {
      const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      const dash = ss.getSheetByName(CONFIG.SHEETS.dashboard);
      const transfere = dash.getRange('E16').getValue();

      if (!transfere || transfere <= 0) {
          sendTelegram(chatId, `ℹ️ Acerto do mês: ${formatBRL(transfere)}\nNada a transferir este mês.`);
          return;
      }

      const sheet = ss.getSheetByName(CONFIG.SHEETS.lancamentos);
      const date = new Date();
      const newRow = sheet.getLastRow() + 1;

      sheet.getRange(newRow, 1, 1, 8).setValues([[
          date, 'Transferência', transfere, 'Conta Gustavo',
          user.pagador, 'Conta Luana', 'Acerto mensal', date
      ]]);
      sheet.getRange(newRow, 1).setNumberFormat('dd/mm/yyyy');
      sheet.getRange(newRow, 3).setNumberFormat('"R$ "#,##0.00');
      sheet.getRange(newRow, 8).setNumberFormat('dd/mm/yyyy');

      PropertiesService.getScriptProperties()
          .setProperty('last_row_' + chatId, String(newRow));

      sendTelegram(chatId, `✅ Acerto registrado!\n💸 ${formatBRL(transfere)}\n📤 Conta Luana → Conta Gustavo\n📅 ${Utilities.formatDate(date, CONFIG.TIMEZONE, 'dd/MM/yyyy')}`);
  }
  ```

- [ ] **Step 3: Commit and push**

  ```bash
  git add Code.js
  git commit -m "feat: add getInvestSaldo and handleManter functions"
  npm run push
  ```

---

## Task 14 — CODE: Add installment functions [model: sonnet]

**File:** `Code.js` — add after Task 13 functions

- [ ] **Step 1: Add getParcelasAtivas**

  ```javascript
  function getParcelasAtivas() {
      const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      const sheet = ss.getSheetByName(CONFIG.SHEETS.parcelas);
      if (!sheet) return 'Aba Parcelas não encontrada.';

      const lastRow = sheet.getLastRow();
      if (lastRow < 4) return 'Nenhuma parcela cadastrada.';

      const rows = sheet.getRange(4, 1, lastRow - 3, 8).getValues();
      const ativas = rows.filter(r => r[0] && String(r[7]).toLowerCase() === 'ativa');

      if (!ativas.length) return '✅ Sem parcelas ativas no momento.';

      const linhas = ativas.map(r => {
          const restantes = r[3] - r[2];
          return `• ${r[0]}: ${formatBRL(r[1])}/mês (${r[2]}/${r[3]}, ${restantes} restantes) — ${r[4]}`;
      });

      const totalMensal = ativas.reduce((sum, r) => sum + (typeof r[1] === 'number' ? r[1] : 0), 0);
      return `📋 *Parcelas Ativas*\n\n${linhas.join('\n')}\n\n*Total mensal:* ${formatBRL(totalMensal)}`;
  }
  ```

- [ ] **Step 2: Add handleParcela**

  Format: `/parcela [valor_total] [n_parcelas] [cartão] [categoria?]`
  Example: `/parcela 360 3 nubank calçado`

  ```javascript
  function handleParcela(arg, chatId, user) {
      if (!arg) {
          sendTelegram(chatId, `📋 *Cadastrar parcela*\n\nFormato: /parcela [valor_total] [n_parcelas] [cartão] [categoria]\n\nExemplo:\n/parcela 360 3 nubank calçado\n  → R$ 120,00 × 3x no Nubank Gu`);
          return;
      }

      const parts = arg.trim().split(/\s+/);
      if (parts.length < 3) {
          sendTelegram(chatId, '⚠️ Formato: /parcela [valor_total] [n_parcelas] [cartão] [categoria?]');
          return;
      }

      const valorTotal = parseFloat(parts[0].replace(',', '.'));
      const nParcelas = parseInt(parts[1], 10);
      const cartaoRaw = parts[2].toLowerCase();
      const catRaw = parts.slice(3).join(' ') || '';

      if (isNaN(valorTotal) || valorTotal <= 0 || isNaN(nParcelas) || nParcelas < 1) {
          sendTelegram(chatId, '⚠️ Valor ou número de parcelas inválido.');
          return;
      }

      const { fontes, categorias } = getListsCached();

      let cartao = fontes.find(f => f.toLowerCase().includes(cartaoRaw));
      if (!cartao) {
          if (cartaoRaw.includes('lu')) cartao = 'Nubank Lu';
          else if (cartaoRaw.includes('mp') || cartaoRaw.includes('mercado')) cartao = 'Mercado Pago Gu';
          else cartao = user.pagador === 'Luana' ? 'Nubank Lu' : 'Nubank Gu';
      }

      const categoria = categorias.find(c => c.toLowerCase().includes(catRaw.toLowerCase())) || 'Outros';
      const valorParcela = Math.round((valorTotal / nParcelas) * 100) / 100;

      const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      const parcelasSheet = ss.getSheetByName(CONFIG.SHEETS.parcelas);
      const date = new Date();
      const parcelaRow = Math.max(parcelasSheet.getLastRow() + 1, 4);

      parcelasSheet.getRange(parcelaRow, 1, 1, 8).setValues([[
          catRaw || categoria, valorParcela, 1, nParcelas, cartao, categoria, date, 'Ativa'
      ]]);
      parcelasSheet.getRange(parcelaRow, 2).setNumberFormat('"R$ "#,##0.00');
      parcelasSheet.getRange(parcelaRow, 7).setNumberFormat('dd/mm/yyyy');

      const lancSheet = ss.getSheetByName(CONFIG.SHEETS.lancamentos);
      const lancRow = lancSheet.getLastRow() + 1;
      lancSheet.getRange(lancRow, 1, 1, 8).setValues([[
          date, 'Despesa', valorParcela, categoria, user.pagador, cartao,
          `Parcela 1/${nParcelas}`, date
      ]]);
      lancSheet.getRange(lancRow, 1).setNumberFormat('dd/mm/yyyy');
      lancSheet.getRange(lancRow, 3).setNumberFormat('"R$ "#,##0.00');
      lancSheet.getRange(lancRow, 8).setNumberFormat('dd/mm/yyyy');

      PropertiesService.getScriptProperties()
          .setProperty('last_row_' + chatId, String(lancRow));

      sendTelegram(chatId, `✅ Parcela cadastrada!\n${catRaw || categoria}: ${formatBRL(valorParcela)}/mês × ${nParcelas}x\nCartão: ${cartao}\nParcela 1/${nParcelas} lançada em ${Utilities.formatDate(date, CONFIG.TIMEZONE, 'dd/MM/yyyy')}`);
  }
  ```

- [ ] **Step 3: Add getFatura**

  ```javascript
  function getFatura(arg) {
      const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      const dash = ss.getSheetByName(CONFIG.SHEETS.dashboard);

      // Reads the "Fatura por Cartão" block — adjust row numbers if Dashboard layout differs
      const cartoes = [
          { nome: 'Nubank Gu', row: 90 },
          { nome: 'Nubank Lu', row: 91 },
          { nome: 'Mercado Pago Gu', row: 92 }
      ];

      if (arg) {
          const n = arg.toLowerCase();
          const found = cartoes.find(c => c.nome.toLowerCase().includes(n));
          if (!found) return `Cartão "${arg}" não encontrado. Opções: nubank gu, nubank lu, mp`;
          const total = dash.getRange(`E${found.row}`).getValue();
          return `💳 *${found.nome}*\nFatura do mês: ${formatBRL(total)}`;
      }

      const linhas = cartoes.map(c => {
          const total = dash.getRange(`E${c.row}`).getValue();
          return `• ${c.nome}: ${formatBRL(total)}`;
      });
      const totalGeral = cartoes.reduce((sum, c) => sum + (dash.getRange(`E${c.row}`).getValue() || 0), 0);
      const mes = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'MMMM/yyyy');
      return `💳 *Faturas ${mes}*\n\n${linhas.join('\n')}\n\n*Total cartões:* ${formatBRL(totalGeral)}`;
  }
  ```

- [ ] **Step 4: Commit and push**

  ```bash
  git add Code.js
  git commit -m "feat: add installment functions - handleParcela, getParcelasAtivas, getFatura"
  npm run push
  ```

---

## Task 15 — CODE: Update handleCommand and helpText [model: haiku]

**File:** `Code.js`

- [ ] **Step 1: Replace handleCommand (lines ~373–394)**

  ```javascript
  function handleCommand(text, chatId, user) {
      const cmd = text.split(/\s+/)[0].toLowerCase();
      const arg = text.substring(cmd.length).trim();

      switch (cmd) {
          case '/start':
          case '/help':
              return sendTelegram(chatId, helpText());
          case '/resumo':
              return sendTelegram(chatId, getResumoMes());
          case '/saldo':
              return sendTelegram(chatId, arg ? getSaldoCategoria(arg) : getSaldoTop5());
          case '/hoje':
              return sendTelegram(chatId, getLancamentosHoje());
          case '/desfazer':
              return desfazerUltimo(chatId, user);
          case '/transferir':
              return sendTelegram(chatId, getAcertoMes());
          case '/invest':
          case '/investimentos':
              return sendTelegram(chatId, getInvestSaldo());
          case '/manter':
              return handleManter(chatId, user);
          case '/parcela':
              return handleParcela(arg, chatId, user);
          case '/parcelas':
              return sendTelegram(chatId, getParcelasAtivas());
          case '/fatura':
              return sendTelegram(chatId, getFatura(arg));
          default:
              return sendTelegram(chatId, `Comando "${cmd}" não reconhecido. Mande /help pra ver os comandos.`);
      }
  }
  ```

- [ ] **Step 2: Replace helpText (lines ~396–412)**

  ```javascript
  function helpText() {
      return `🤖 *Bot Financeiro*

  *Lançar gasto:* mande no formato livre
  • "52 ifood luana nubank"
  • "gastei 35 no café"
  • "1910 financiamento caixa"

  *Investimentos:*
  • "aportei 500 no cdb"
  • "resgatei 300 do cdb"
  • "cdb rendeu 45,80"

  *Parcelas:*
  /parcela 360 3 nubank calçado — cadastra 3x de R$ 120

  *Comandos:*
  /resumo — visão geral do mês
  /saldo — top 5 categorias
  /saldo calçado — categoria específica (provisão: mostra envelope acumulado)
  /hoje — lançamentos de hoje
  /invest — saldo do CDB
  /fatura — faturas dos cartões
  /parcelas — parcelas ativas
  /manter — registrar acerto mensal (Luana)
  /transferir — quanto Luana transfere
  /desfazer — apaga o último lançamento
  /help — esta ajuda`;
  }
  ```

- [ ] **Step 3: Commit and push**

  ```bash
  git add Code.js
  git commit -m "feat: wire all new commands in handleCommand, update helpText"
  npm run push
  ```

---

## Task 16 — Verify and Deploy

- [ ] **Step 1: Verify the push worked**

  ```bash
  npm run logs
  ```

  Or open the Apps Script Editor with `npm run open` and confirm the code matches `Code.js`.

- [ ] **Step 2: Clear the cache in Apps Script Editor**

  Run once:
  ```javascript
  function limparCache() {
      _loadSecrets();
      CacheService.getScriptCache().remove('lists_v1');
  }
  ```

- [ ] **Step 3: Create new deployment** (only needed if this is a first-time deploy or URL changed)

  Apps Script Editor → **Implantar** → **Nova implantação** → Web App → "Qualquer pessoa" → Implantar.
  Then run `apontarWebhookProValTown()` if the URL changed.

- [ ] **Step 4: Smoke test via Telegram**

  | Message | Expected |
  |---------|----------|
  | `/help` | Shows full list including /invest, /parcelas, /fatura, /manter |
  | `52 ifood luana nubank` | Delivery, Luana, Nubank Lu |
  | `aportei 500 no cdb` | Transferência: Conta Gustavo → CDB 115% CDI |
  | `cdb rendeu 40` | Receita, Rendimento CDB |
  | `/invest` | CDB saldo block |
  | `/saldo calçado` | Provisão envelope display |
  | `/fatura` | Three card totals |
  | `/parcelas` | Active list or "sem parcelas ativas" |
  | `/parcela 360 3 nubank calçado` | Parcela cadastrada! 3× R$ 120,00 |
  | `/desfazer` | Undoes last entry |

---

## Self-Review Checklist

**Spec coverage (all 24 items):**
- [x] Transferência tipo → Tasks 7, 9, 10, 11, 13, 15
- [x] Nubank Gu / Nubank Lu renaming → Tasks 1, 8
- [x] Mercado Pago Gu → Tasks 1, 8
- [x] CDB 115% CDI source + category → Tasks 1, 8
- [x] Rendimento CDB → Tasks 1, 8, 13
- [x] Saldo Inicial source → Task 1
- [x] Data início sistema (Config!C7) → Tasks 1, 11, 12
- [x] Card closing dates placeholder → Task 1
- [x] Envelope budgeting (provisão accumulation) → Tasks 5, 11, 12
- [x] PROVISAO_CATS list → Task 6
- [x] Investimentos tab + formulas → Task 3
- [x] Parcelas tab → Task 4
- [x] Dashboard individual blocks → Task 5
- [x] Dashboard fatura block → Task 5
- [x] Dashboard provisões block → Task 5
- [x] Column H Competência → Tasks 2, 10
- [x] getListsCached range expansion → Task 6
- [x] validateParse Transferência + self-transfer block → Task 9
- [x] /invest command → Tasks 13, 15
- [x] /manter command → Tasks 13, 15
- [x] /parcela command → Tasks 14, 15
- [x] /parcelas command → Tasks 14, 15
- [x] /fatura command → Tasks 14, 15
- [x] helpText updated → Task 15
- [x] _loadSecrets() in test functions → Tasks 6, 8
- [x] Deploy via npm run push (not copy-paste) → All CODE tasks

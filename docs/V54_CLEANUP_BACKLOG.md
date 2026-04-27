# V54_CLEANUP_BACKLOG.md

Backlog de limpeza, refatoração e dívida técnica do projeto Bot Financeiro.
Organizado por prioridade. Última atualização: 2026-04-27.

---

## NOW (Fase atual — 4F)

- [x] **Corrigir ambiguidade do runtime map**
  - Frase antiga: "Todo o tráfego atual de Telegram, se existir, usaria V53 ou seria barrado pela falta de integração V54."
  - Substituída por descrição factual do roteamento atual.

- [x] **Criar `docs/V54_CODEMAP.md`**
  - Mapa de arquivos, papéis, fluxos e dívidas para orientação humana.

- [x] **Criar `docs/V54_CLEANUP_BACKLOG.md`**
  - Este arquivo.

- [x] **Criar teste de guardrails arquiteturais**
  - `scripts/test-v54-architecture-guardrails.js`
  - Protege conceitos: V53 marcado como legacy, V54 não roteado prematuramente, runtime map atualizado, limite de linhas do adapter.

---

## NEXT (Próximas iterações de limpeza — sem feature financeira nova)

- [ ] **Reduzir duplicação de schema**
  - `scripts/lib/v54-schema.js` é a autoridade.
  - `src/Setup.js` (`getV54Schema()`) duplica os mesmos headers.
  - `src/ActionsV54.js` duplica headers inline (`V54_LANCAMENTOS_HEADERS`, etc.).
  - **Ação:** Extrair helper interno em `ActionsV54.js` que referencia uma cópia dos headers de `getV54Schema()` (já existente no mesmo escopo Apps Script), ou ao menos manter teste de paridade robusto.
  - **Restrição:** Não mover arquivos `src/` nem criar bundler nesta fase.

- [ ] **Extrair helpers de `ActionsV54.js` sem mudar comportamento**
  - Candidatos: funções de validação (`validateParsedEntryV54ForActions_`, `normalizeV54*`), helpers de fatura (`planCardPurchaseFaturaUpsert_`, `applyFaturasPlan_`), utilities (`cloneV54PlainObject_`, `makeV54ContractError_`).
  - **Ação:** Se extrair para outro arquivo `src/`, aceitar que ele será global no Apps Script.
  - **Restrição:** Não alterar comportamento. Todos os testes existentes devem continuar passando.

- [ ] **Documentar headers parity test como CI gate**
  - O teste `test:v54:actions` já verifica paridade de headers entre `ActionsV54.js` e `v54-schema.js`.
  - **Ação:** Documentar no `V54_CODEMAP.md` que esse teste é obrigatório antes de qualquer push.

---

## LATER (Após V54 Telegram MVP funcional)

- [ ] **Remover código V53 do runtime**
  - Arquivos: `src/Actions.js`, `src/Commands.js`, `src/Parser.js`, `src/Views.js`, `src/SetupLegacy.js`.
  - **Pré-condição:** V54 deve ser o caminho principal do Telegram com `ParserV54`, `ViewsV54`, `Idempotency_Log` e `ROUTING_MODES.V54_PRIMARY` ativo.
  - **Restrição:** Não remover V53 antes disso. V53 é o único caminho funcional hoje.

- [ ] **Avaliar bundler**
  - Opções: `clasp` + `esbuild` ou `rollup` para compilar `scripts/lib/*.js` em bundle consumível pelo Apps Script.
  - **Benefício:** Elimina duplicação de schema e permite `require()` nos adapters.
  - **Risco:** Adiciona complexidade de build. Avaliar se o tamanho do projeto justifica.
  - **Restrição:** Não criar bundler antes de o MVP V54 funcionar no Telegram.

- [ ] **Criar `ParserV54` produtivo**
  - Contrato local já existe (`scripts/lib/v54-parser-contract.js`).
  - **Ação:** Implementar versão que chama LLM real (OpenAI) com o prompt V54.
  - **Pré-condição:** Prompt V54 aceito e testado com fixtures.

- [ ] **Criar `ViewsV54` produtivo**
  - Leitura das abas V54 + formatação de respostas Telegram.
  - **Pré-condição:** `Lancamentos_V54` sendo populado pelo fluxo real.

- [ ] **Limpar abas V53 da planilha**
  - Abas: `Lançamentos`, `Config`, `Dashboard`, `Investimentos`, `Parcelas`.
  - **Pré-condição:** V54 completamente funcional e V53 desligado do runtime.

---

## DO NOT DO YET

- [ ] **Não implementar `Idempotency_Log`** nesta fase
  - Decisão D038 aceita, mas implementação é bloqueio para roteamento Telegram, não para guardrails ou docs.

- [ ] **Não implementar `Pagamentos_Fatura`** nesta fase
  - Decisão D036 aceita. Requer reconciliação e estado de fatura `fechada`.

- [ ] **Não plugar Telegram em V54 antes de `Idempotency_Log`**
  - Risco: retry de webhook do Telegram cria lançamentos duplicados.
  - O teste de guardrails (`test:v54:architecture`) verifica que `src/Main.js` NÃO chama `recordEntryV54`.

- [ ] **Não deletar V53 agora**
  - V53 é o único caminho funcional do Telegram.
  - Remoção prematura quebra o bot para Gustavo e Luana.

- [ ] **Não alterar lógica financeira nesta fase**
  - Phase 4F é exclusivamente sobre legibilidade e guardrails.

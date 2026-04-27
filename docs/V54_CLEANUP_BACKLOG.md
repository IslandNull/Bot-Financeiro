# V54_CLEANUP_BACKLOG.md

Backlog de limpeza, refatoração e dívida técnica do projeto Bot Financeiro.
Organizado por prioridade. Última atualização: 2026-04-27.

---

## COMPLETED

### Phase 4F — Architecture Guardrails

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

### Phase 4H — Context Load Reduction

- [x] **Deletar documentação obsoleta/redundante**
  - Deletados: `AI_WORKFLOW.md`, `.ai_shared/HANDOFF_PROTOCOL.md`, `.ai_shared/registry.json`, `.ai_shared/tools/`, `.ai_shared/skills/` (9 arquivos), `.ai_shared/handoffs/` (3 arquivos), `.ai_shared/archive/ANALISE_A_SER_CONSIDERADA.MD`, `docs/IMPLEMENTATION_PLAN.md`, `docs/archive/` (2 arquivos V52/pre-D031), `docs/superpowers/`.
  - Total: 19 arquivos/diretórios removidos.

- [x] **Mover HISTORY.md para docs/archive/**
  - `.ai_shared/HISTORY.md` → `docs/archive/HISTORY.md`
  - Referências atualizadas em `ACTIVE_CONTEXT.md`.

- [x] **Reescrever V54_DOCS_INDEX.md com categorias rígidas**
  - `MANDATORY_STARTUP` (4 arquivos), `CODE_TASKS` (3 arquivos), `TASK_SPECIFIC_REFERENCE` (6 arquivos), `AGENT_WRAPPER` (2 arquivos), `DO_NOT_USE_AS_AUTHORITY`.
  - Agentes não devem ler archive/handoffs como contexto atual.

- [x] **Limpar referências quebradas em docs ativos**
  - Removida referência stale a `docs/MASTERPLAN_REFATORACAO_V54.md` no MASTERPLAN.

---

### Phase 4J — Masterplan Stale Decision Cleanup

- [x] **Limpar decisões obsoletas no masterplan**
  - Masterplan alinhado com decisões D031-D041.
  - Nota de autoridade adicionada no topo.

---

## NOW

- [x] **Modelar Idempotency_Log local/fake-first**
  - sem Telegram
  - sem planilha real
  - sem doPost
  - sem Apps Script real
- [x] **Integrar contrato de Idempotency_Log ao futuro write path V54 local**
  - ainda sem Telegram real
  - ainda sem alterar roteamento
  - bloquear duplicidade antes de qualquer append financeiro
- [x] **Criar adapter Apps Script fake-first para write path idempotente**
  - consumir o boundary local em `recordEntryV54`
  - ainda sem Telegram real
  - ainda sem alterar roteamento
  - guarda grupos de mutação: eventos simples, `compra_cartao` + `Faturas`, `compra_parcelada` + `Parcelas_Agenda` + `Faturas`
  - sem recuperação automática de `processing` stale
- [x] **Definir política local/fake-first de recuperação de `processing` stale**
  - chamada somente por opt-in injetado
  - fresh sem mutação mantém `duplicate_processing` retryable
  - stale sem mutação planeja `MARK_IDEMPOTENCY_FAILED` com `STALE_PROCESSING_NO_DOMAIN_MUTATION`
  - match por `result_ref`/referência determinística planeja `MARK_IDEMPOTENCY_COMPLETED`
  - estados ambíguos ou mismatched continuam bloqueados para revisão manual
- [x] **Tornar referências do caminho idempotente recuperáveis após crash**
  - `id_lancamento`/`id_compra` idempotentes são derivados do `idempotency_key`
  - crash após mutação de domínio com log ainda `processing` e `result_ref` vazio pode reconstruir a referência esperada
  - ID aleatório/non-reproducible bloqueia recuperação automática e exige revisão
- [x] **Criar executor/checklist local para planos revisados de recuperação**
  - aplica somente `MARK_IDEMPOTENCY_FAILED` e `MARK_IDEMPOTENCY_COMPLETED`
  - exige checklist revisado antes de aplicar
  - nunca aplica `APPLY_DOMAIN_MUTATION`
- [x] **Criar adapter Apps Script fake-first para aplicação revisada de recuperação**
  - consome executor/checklist local por DI em testes
  - valida e escreve somente `Idempotency_Log`
  - sem rota real, sem Telegram, sem planilha real nos testes, sem recuperar estados ambíguos
- [x] **Criar skeleton runtime V54 desabilitado**
  - `ParserV54`, `HandlerV54`, `ViewsV54` em `src/`
  - handler recebe update Telegram-like e chama `recordEntryV54` idempotente por DI
  - formatador retorna texto seguro
  - sem `doPost`, sem Telegram real, sem OpenAI real, sem planilha real nos testes

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

- [ ] **Definir rota manual revisada para recovery, ainda sem Telegram**
  - pré-condição: regra aceita para entrada manual de plano/checklist
  - deve continuar bloqueando mutação de domínio e planilha real não revisada
  - **Restrição:** não expor por `doPost` e não plugar no tráfego Telegram.

- [ ] **Substituir skeleton por ParserV54 produtivo atrás da interface injetada**
  - usar contrato local existente de prompt/JSON/validação
  - chamar LLM real somente após gate explícito e testes negativos
  - **Restrição:** não rotear Telegram para V54 nesta etapa sem decisão/gate separado.

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

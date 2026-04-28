# V54_RUNTIME_MAP.md

Mapeamento de entrypoints e estado de runtime da transição V53 -> V54.

## 1. Rotas Webhook / Apps Script
- `doPost(e)` (em `src/Main.js`): Ponto de entrada do Telegram.
  - **Segurança:** Requer `WEBHOOK_SECRET` via query string ou body (Val.town).
  - **Status V54:** `doPost` opera por `V54_ROUTING_MODE` com release controlado: default/missing/invalid => `V53_CURRENT`; `V54_SHADOW` mantém `handleEntry` V53 como source-of-truth user-facing e roda diagnóstico V54 no-write; `V54_PRIMARY` usa path V54 para entradas normais sem fallback mutante automático para V53.
- `doGet(e)` (em `src/Main.js`): Ponto de entrada GET.
  - **Segurança:** Requer `SYNC_SECRET`.
  - **Uso atual:** `exportState` (exportação do SPREADSHEET_STATE.md).
  - **Ações bloqueadas:** Mutações como `applySetupV54`, `applySeedV54`, `forceFixAllFormulas`, e `runV53AporteTest` estão explicitamente proibidas via GET.

## 2. Separação de Lógica (V54 vs Legacy)
- **V54 Local-Only (Testes Node.js, Sem Google Sheets Real):**
  - Contratos e validadores: `scripts/lib/v54-parsed-entry-contract.js`, `v54-card-purchase-contract.js`, `v54-installment-schedule-contract.js`
  - Helpers de Relatório: `scripts/lib/v54-reporting-contracts.js`
  - Parser Adapter V54: `scripts/lib/v54-parser-contract.js`
  - Mapper: `scripts/lib/v54-lancamentos-mapper.js`
- **V54 Apps Script Adapter (Fake-First / Mocked Sheets):**
  - Lógica de escrita: `src/ActionsV54.js` (Eventos simples, compra de cartão, agendamento de parcelas).
  - Idempotência fake-first opt-in: `src/ActionsV54Idempotency.js`, consumindo planner injetado em testes locais. No caminho idempotente, referências de domínio são determinísticas a partir do `idempotency_key` (`id_lancamento`/`id_compra`) para permitir recuperação após crash sem depender de ID aleatório.
  - Recuperação de `processing` stale: contrato local em `scripts/lib/v54-idempotency-recovery-policy.js`, chamado pelo write path somente quando `recoveryPolicy.enabled === true` é injetado; retorna planos explícitos, não roteia Telegram e não chama planilha real nos testes.
  - Executor/checklist de recuperação: `scripts/lib/v54-idempotency-recovery-executor.js` aplica somente planos revisados `MARK_IDEMPOTENCY_FAILED` e `MARK_IDEMPOTENCY_COMPLETED` em memória local; não aplica mutações de domínio.
  - Adapter Apps Script de recuperação: `src/ActionsV54Recovery.js` aplica planos revisados somente em `Idempotency_Log` por dependências injetadas (`getSpreadsheet`, `withLock`, `applyReviewedIdempotencyRecovery`, `readIdempotencyRows`, `checklist`); não é chamado por `doPost`, não chama Telegram, não usa planilha real nos testes e não aplica mutação de domínio.
  - Skeleton runtime V54: `src/ParserV54.js`, `src/HandlerV54.js`, e `src/ViewsV54.js` modelam parser/handler/view com dependências injetadas. O handler recebe update Telegram-like, exige contexto de usuário, valida ParsedEntryV54, chama `recordEntryV54` com idempotência ligada e retorna resposta segura. Ele não é chamado por `doPost`, não chama Telegram e não chama OpenAI real.
  - Provider de contexto ParserV54: `src/ParserV54Context.js` implementa `getParserContextV54(runtimeContext, options)` atrás de DI. Ele lê `Config_Categorias`, `Config_Fontes` e `Cartoes` por `getSpreadsheet` injetado, valida headers, filtra linhas inativas, remove campos sensíveis/unrelated e retorna somente `categories`, `fontes`, `cartoes`, `defaultPessoa`, `defaultEscopo` e `referenceDate`. Não é chamado por `doPost`, não chama OpenAI, não envia Telegram e não muta planilhas.
  - Adapter produtivo de parser V54: `src/ParserV54OpenAI.js` implementa `parseTextV54OpenAI(text, runtimeContext, options)` atrás de DI. Ele constrói prompt V54 canônico, chama OpenAI somente via `fetchJson`/`urlFetch` injetado ou fallback Apps Script para uso futuro revisado, interpreta JSON, valida ParsedEntryV54 e retorna `{ ok, parsedEntry, normalized, errors }`. Não é chamado por `doPost`, não escreve em planilhas e não envia Telegram.
  - Runner manual/shadow V54: `src/RunnerV54.js` implementa `runV54ManualShadow(update, options)` e alias `runManualShadowV54(update, options)`. Ele compõe `handleTelegramUpdateV54`, `parseTextV54OpenAI`, `getParserContextV54`, `recordEntryV54`, idempotência e contratos de cartão/parcelamento/faturas somente quando dependências explícitas são injetadas. Falha fechado sem `getSpreadsheet`, `withLock`, validator, `planV54IdempotentWrite`, parser fake ou `fetchJson` + `apiKey`. Não é chamado por `doPost`, não envia Telegram e não escolhe OpenAI/planilha real em testes.
  - Gate manual/shadow V54: `src/RunnerV54Gate.js` implementa `invokeV54ManualShadowGate(input, options)` e alias `runV54ManualShadowGate(input, options)`. Ele aceita somente envelope manual, exige checklist revisado (`reviewed`, `manualOnly`, `doPostUnchanged`, `telegramSendDisabled`), exige `realRunApproved` e politica revisada para `real_manual`, rejeita objetos com formato de evento web Apps Script e chama o runner somente depois da validacao. `dry_run` valida sem chamar o runner.
  - Politica `real_manual` V54: `src/RunnerV54RealManualPolicy.js` implementa `evaluateV54RealManualPolicy(input, options)` e alias `evaluateRunnerV54RealManualPolicy(input, options)`. Ela exige operador, aprovacao explicita, input sintetico/manual, `doPost` inalterado/V54 nao roteado, `doGet` sem gate V54, Telegram send desabilitado, dry-run/fake-shadow previo, snapshot/export acknowledged, `Idempotency_Log`, todas as abas V54, headers esperados e contexto do parser legivel por DI. O contexto do parser deve vir de `getParserContext` injetado e retornar `{ ok: true }`; acknowledgement booleano nao basta. Testes usam diagnosticos fake e planilha fake; nao e rota web, nao envia Telegram e nao chama OpenAI ou planilha real.
  - Contrato de evidencias `real_manual`: `scripts/lib/v54-real-manual-evidence-contract.js` valida envelope canonico local/fake-first (operador, branch/commit marker, dry-run/snapshot estruturados, diagnosticos de planilha/parser e acoes proibidas). Para `mode=real_manual`, a politica exige esse contrato por DI (`validateEvidenceEnvelope`) e bloqueia o gate/runner quando o validador estiver ausente ou quando o envelope estiver ausente/malformado. Regra de colunas extras: so permitido quando `allowExtraColumns: true` explicito; ambiguidade falha fechado.
  - Usa injeção de dependências para `spreadsheetApp`, `lockService`, etc., permitindo testes locais.
- **V53 Legacy (deprecated/obsoleto):**
  - Módulos: `src/Actions.js`, `src/Commands.js`, `src/Parser.js`, `src/Views.js`, `src/SetupLegacy.js`.
  - **NÃO ADICIONAR NOVAS FEATURES NESTES ARQUIVOS.**

## 3. O que permanece controlado por gate
- O ParserV54 context provider e OpenAI adapter existem, mas ainda não processam mensagens do Telegram em produção porque não estão conectados ao handler roteado.
- O runner manual/shadow V54 existe, mas ainda é caminho desabilitado/manual por DI e não processa Telegram real.
- O gate manual/shadow V54 existe, mas ainda nao e rota web nem permissao de producao; ele apenas protege chamadas manuais controladas.
- `real_manual` continua manual-only/fake-first por contrato de diagnostico; nao e production-ready, nao e chamado por `doPost`, e nao e exposto por `doGet`.
- `RunnerV54.runV54ManualShadow` e `RunnerV54Gate.invokeV54ManualShadowGate` continuam fora de `doPost`/`doGet` (manual-only).
- `doGet` permanece read-only e sem ativacao V54.
- `RunnerV54Gate.invokeV54ManualShadowGate` ainda não é chamado por `doPost` nem exposto por `doGet`.
- `RunnerV54RealManualPolicy.evaluateV54RealManualPolicy` ainda não é chamado por `doPost` nem exposto por `doGet`.
- `ActionsV54Recovery.applyReviewedIdempotencyRecoveryV54` ainda não é chamado por `doPost` nem por rota de manutenção real.
- `doPost` ainda chama `handleCommand` / `handleEntry`, que pertencem ao fluxo legacy V53.
- V54 existe como contrato/adaptador testado, mas não é o caminho principal do Telegram.
- Não há pagamentos de fatura implementados em V54.
- Não há respostas/relatórios (Views) de V54 trafegando para o Telegram.

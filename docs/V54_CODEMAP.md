# V54_CODEMAP.md

Mapa do código-fonte do Bot Financeiro para orientar programadores humanos e agentes.
Última atualização: 2026-04-28.

---

## 1. Visão Geral do Runtime Atual

O projeto é um bot financeiro pessoal em **Google Apps Script** integrado ao **Telegram** e **Google Sheets**.
O runtime Apps Script carrega todos os arquivos `src/*.js` em escopo global compartilhado (não há bundler nem module system).

Existem duas gerações de código convivendo no mesmo runtime:
- **V53 (legacy/deprecated):** Fluxo Telegram legado ainda disponível como `V53_CURRENT` e como source-of-truth user-facing em `V54_SHADOW`.
- **V54 (MVP em construção):** Contratos locais Node.js + adapters Apps Script. `doPost` já possui ponte controlada por `V54_ROUTING_MODE`; `V54_PRIMARY` é explícito, fail-closed e sem fallback mutante automático para V53.

---

## 2. Tabela de Arquivos

| Arquivo | Papel | Status | Pode receber feature nova? | Observação |
|---|---|---|---|---|
| `src/000_V54Schema.js` | Espelho Apps Script único do schema V54, consumido por Setup/Actions/ParserContext/RealManualPolicy/log Telegram | `V54_APPS_SCRIPT_SCHEMA_MIRROR` | Sim (schema V54 somente) | `scripts/lib/v54-schema.js` continua sendo a autoridade Node; testes de paridade protegem drift. |
| `src/Main.js` | Entry points (`doPost`, `doGet`), CONFIG, routing mode enum, helpers de auth/sync/lock e `formatBRL` | `SHARED_INFRA` | Não sem aprovação explícita | `doPost` roteia por `V54_ROUTING_MODE`: default V53, shadow no-write, primary V54 fail-closed. |
| `src/TelegramNotification.js` | Boundary compartilhado de envio Telegram e redaction (`sendTelegram`, diagnósticos genéricos) | `SHARED_INFRA` | Não sem aprovação explícita | Envio retorna resultado estruturado e nunca loga segredos crus. |
| `src/TelegramSendLogV54.js` | Observabilidade persistente best-effort de tentativas de resposta Telegram no `V54_PRIMARY` | `V54_APPS_SCRIPT_ADAPTER` | Sim (observabilidade V54) | Falha de log é engolida; não causa retry, rollback financeiro ou fallback V53. |
| `src/ActionsV54.js` | Orquestrador Apps Script V54: `recordEntryV54`, escrita em Lancamentos/Compras/Parcelas/Faturas | `V54_APPS_SCRIPT_ADAPTER` | Sim (somente V54) | Helpers puros extraídos para `src/ActionsV54Helpers.js`; headers vêm do schema mirror. |
| `src/ActionsV54Helpers.js` | Helpers puros de validação, normalização, mapping simples e shaping de erros V54 | `V54_APPS_SCRIPT_ADAPTER` | Sim (somente V54) | Sem CommonJS, rede, Telegram ou SpreadsheetApp direto. |
| `src/ActionsV54Idempotency.js` | Adapter Apps Script fake-first para idempotência em `recordEntryV54` via DI | `V54_APPS_SCRIPT_ADAPTER` | Sim (somente V54) | Consome planner local injetado, guarda grupos de mutação V54, sem `require()` e sem roteamento Telegram. |
| `src/ActionsV54Recovery.js` | Adapter Apps Script fake-first para aplicar planos revisados de recuperação em `Idempotency_Log` via DI | `V54_APPS_SCRIPT_ADAPTER` | Sim (somente V54) | Consome executor/checklist local injetado em testes, escreve somente `Idempotency_Log`, sem rota Telegram e sem mutação de domínio. |
| `src/ParserV54.js` | Skeleton Apps Script do parser V54 via DI | `V54_APPS_SCRIPT_ADAPTER` | Sim (somente V54) | Não chama OpenAI; exige parser injetado e normaliza resultado/erro para o handler. |
| `src/ParserV54Context.js` | Provider Apps Script fake-first de contexto canônico do ParserV54 | `V54_APPS_SCRIPT_ADAPTER` | Sim (somente V54) | Lê `Config_Categorias`, `Config_Fontes` e `Cartoes` por planilha injetada, valida headers, filtra inativos, remove campos sensíveis e não é chamado por `doPost`. |
| `src/ParserV54OpenAI.js` | Adapter Apps Script produtivo do ParserV54 para OpenAI, atrás de DI | `V54_APPS_SCRIPT_ADAPTER` | Sim (somente V54) | Constrói prompt V54 canônico, chama OpenAI por `fetchJson`/`urlFetch` injetado ou fallback Apps Script, valida ParsedEntryV54 e não é chamado por `doPost`. |
| `src/HandlerV54.js` | Skeleton Apps Script do handler V54 Telegram-like via DI | `V54_APPS_SCRIPT_ADAPTER` | Sim (somente V54) | Extrai update/message, valida contexto de usuário, chama parser injetado, valida ParsedEntryV54, chama `recordEntryV54` idempotente e retorna resultado estruturado; não é chamado por `doPost`. |
| `src/ViewsV54.js` | Skeleton de formatadores seguros V54 | `V54_APPS_SCRIPT_ADAPTER` | Sim (somente V54) | Gera texto seguro para sucesso, duplicidade, retry, parser/validação/unsupported/error; não envia Telegram. |
| `src/RunnerV54.js` | Runner manual/shadow V54 fake-first | `V54_APPS_SCRIPT_ADAPTER` | Sim (somente V54) | Compoe handler, provider de contexto, parser OpenAI adapter e write path idempotente somente por DI explicita. Falha fechado sem dependencias; nao e chamado por `doPost` e nao envia Telegram. |
| `src/RunnerV54Gate.js` | Gate revisado para invocacao manual/shadow V54 | `V54_APPS_SCRIPT_ADAPTER` | Sim (somente V54) | Aceita apenas envelope manual com checklist, rejeita eventos web, chama `runV54ManualShadow` somente apos validacao e nao e exposto por `doPost`/`doGet`. |
| `src/RunnerV54RealManualPolicy.js` | Politica revisada e diagnosticos para futura execucao `real_manual` | `V54_APPS_SCRIPT_ADAPTER` | Sim (somente V54) | Exige operador, aprovacao, input sintetico, bloqueios de rota, Telegram desabilitado, dry-run/fake-shadow previo, snapshot ack, abas/headers V54, `Idempotency_Log` e contexto do parser por DI. Sem rota real e sem servicos reais nos testes. |
| `src/Actions.js` | Lógica de escrita legacy V53: `handleEntry`, `recordParsedEntry`, `desfazerUltimo`, `handleManter`, `handleParcela` | `V53_LEGACY` | **Não** | Deprecated. Fluxo de escrita do Telegram atual. |
| `src/Commands.js` | Switch de comandos legacy V53: `handleCommand`, `helpText` | `V53_LEGACY` | **Não** | Deprecated. Chamado por `doPost`. |
| `src/Parser.js` | Parser OpenAI legacy V53: `parseWithOpenAI`, `validateParse`, `getListsCached` | `V53_LEGACY` | **Não** | Deprecated. Chamado por `handleEntry`. |
| `src/Views.js` | Funções de leitura/resposta legacy V53: `getResumoMes`, `getSaldoTop5`, `getLancamentosHoje`, etc. | `V53_LEGACY` | **Não** | Deprecated. Read-only da planilha V53. |
| `src/Setup.js` | Setup/seed V54 + setup webhook + `exportSpreadsheetState` + `diagnoseWebhookSecurity` | `SHARED_INFRA` | Sim (setup/seed V54 somente) | Contém `planSetupV54`, `applySetupV54`, `planSeedV54`, `applySeedV54`. |
| `src/SetupLegacy.js` | Setup/migração V52→V53 + `forceFixAllFormulas` + `runV53AporteTest` | `V53_LEGACY` | **Não** | Deprecated. Mantido para referência/rollback. |
| `scripts/lib/v54-schema.js` | Schema canônico V54: headers, enums, validação | `V54_LOCAL_CONTRACT` | Sim | Autoridade de headers V54. Node.js `module.exports`. |
| `scripts/lib/v54-parsed-entry-contract.js` | Contrato de entrada parseada V54 | `V54_LOCAL_CONTRACT` | Sim | Validação estrita do ParsedEntryV54. |
| `scripts/lib/v54-parser-contract.js` | Parser adapter V54 local | `V54_LOCAL_CONTRACT` | Sim | Prompt builder + JSON parser, sem chamar OpenAI real. |
| `scripts/test-v54-parser-openai-adapter.js` | Testes locais do adapter produtivo OpenAI V54 | `V54_LOCAL_TEST` | Sim | Usa fake fetch e validator injetado; garante sem OpenAI real, sem planilha, sem Telegram e sem alteração de `doPost`. |
| `scripts/test-v54-parser-context-provider.js` | Testes locais do provider de contexto ParserV54 | `V54_LOCAL_TEST` | Sim | Usa planilhas fake; verifica headers contra schema, filtro de inativos, remoção de segredos e consumo pelo adapter OpenAI/handler por DI. |
| `scripts/lib/v54-lancamentos-mapper.js` | Mapper de parsed entry → row Lancamentos_V54 | `V54_LOCAL_CONTRACT` | Sim | Pure function, injeção de deps para id/timestamp. |
| `scripts/lib/v54-card-purchase-contract.js` | Contrato de compra de cartão V54 | `V54_LOCAL_CONTRACT` | Sim | Ciclo de fatura + mapeamento para Lancamentos. |
| `scripts/lib/v54-installment-schedule-contract.js` | Contrato de parcelamento V54 | `V54_LOCAL_CONTRACT` | Sim | Schedule de parcelas + ciclos de fatura. |
| `scripts/lib/v54-card-invoice-cycle.js` | Ciclo de fatura de cartão (fechamento/vencimento) | `V54_LOCAL_CONTRACT` | Sim | Determinístico, usado por compra e parcelamento. |
| `scripts/lib/v54-idempotency-contract.js` | Contrato local de idempotência V54 | `V54_LOCAL_CONTRACT` | Sim | Planeja `Idempotency_Log` sem Apps Script, Telegram real, rede ou planilha real. |
| `scripts/lib/v54-idempotency-recovery-policy.js` | Política local de recuperação para `processing` stale | `V54_LOCAL_CONTRACT` | Sim | Pure planner opt-in: fresh blocks, stale sem mutação planeja `failed`, match por referência planeja `completed`, ambíguo bloqueia. |
| `scripts/lib/v54-idempotency-recovery-executor.js` | Executor/checklist local para planos revisados de recuperação | `V54_LOCAL_CONTRACT` | Sim | Aplica somente `MARK_IDEMPOTENCY_FAILED`/`MARK_IDEMPOTENCY_COMPLETED` em `Idempotency_Log` fake; nunca aplica mutação de domínio. |
| `scripts/lib/v54-idempotent-write-path.js` | Boundary local de write path idempotente V54 | `V54_LOCAL_CONTRACT` | Sim | Planeja log `processing`, insert financeiro e marcação `completed`; executor em memória só para testes. |
| `scripts/lib/v54-reporting-contracts.js` | Contratos de relatório V54 (DRE, reserva, patrimônio, acerto) | `V54_LOCAL_CONTRACT` | Sim | Pure local, sem spreadsheet. |
| `docs/V54_DOCS_INDEX.md` | Índice da documentação V54 | `DOCS_ONLY` | N/A | Ponto de entrada para agentes. |
| `docs/V54_RUNTIME_MAP.md` | Mapa de entrypoints e estado de runtime | `DOCS_ONLY` | N/A | Limites V53/V54. |
| `docs/V54_CODEMAP.md` | Este arquivo | `DOCS_ONLY` | N/A | Mapa de código para humanos. |
| `docs/V54_CLEANUP_BACKLOG.md` | Backlog de limpeza e dívida técnica | `DOCS_ONLY` | N/A | Priorização NOW/NEXT/LATER. |

---

## 3. Fluxo Atual do Telegram (Roteado)

```
Telegram webhook
  → doPost(e)                          [src/Main.js]
    → parseTelegramUpdate_()
    → isWebhookAuthorized_()
    → if text starts with "/"
        → handleCommand(text, chatId, user)  [src/Commands.js]
            → sendTelegram() / Views.js functions
    → else if V54_ROUTING_MODE === V54_PRIMARY
        → routeV54PrimaryEntry_()        [src/Main.js]
            → RunnerV54ProductionBridge  [src/RunnerV54ProductionBridge.js]
            → Handler/Parser/Actions V54
            → sendTelegram()             [src/TelegramNotification.js]
            → Telegram_Send_Log          [src/TelegramSendLogV54.js]
    → else if V54_ROUTING_MODE === V54_SHADOW
        → handleEntry(text, chatId, user) [V53 source-of-truth]
        → runV54ShadowDiagnostics_()      [V54 no-write]
    → else
        → handleEntry(text, chatId, user)    [src/Actions.js]
            → parseWithOpenAI()              [src/Parser.js]
            → validateParse()
            → recordParsedEntry()            [src/Actions.js]
            → sendTelegram()
```

Comandos `/...` continuam no fluxo V53 legado. Entradas normais passam por V53, V54 shadow ou V54 primary conforme `V54_ROUTING_MODE`.

---

## 4. Fluxo V54 (Ponte Controlada)

```
Contratos locais Node.js (scripts/lib/):
  v54-schema.js           ← autoridade Node de headers canônicos
  v54-parsed-entry-contract.js  ← validação estrita de input
  v54-parser-contract.js  ← adapter de prompt/parse (sem LLM real)
  v54-lancamentos-mapper.js     ← parsed entry → row payload
  v54-card-purchase-contract.js ← compra cartão + ciclo fatura
  v54-installment-schedule-contract.js ← parcelamento + schedule
  v54-card-invoice-cycle.js     ← cálculo determinístico de ciclo
  v54-reporting-contracts.js    ← DRE, reserva, patrimônio, acerto
  v54-idempotency-contract.js   ← retry técnico e Idempotency_Log local
  v54-idempotency-recovery-policy.js ← política explícita para processing stale
  v54-idempotency-recovery-executor.js ← aplicação local revisada de planos de recuperação
  v54-idempotent-write-path.js  ← boundary fake-first antes do append financeiro

Adapter Apps Script:
  src/000_V54Schema.js
    → espelho Apps Script único de headers V54
    → consumido por Setup, Actions, ParserContext, RealManualPolicy e Telegram_Send_Log

  src/ActionsV54.js
    → recordEntryV54(parsedEntry, options)
      → se `options.idempotency.enabled === true`, delega para `src/ActionsV54Idempotency.js`
      → planner idempotente injetado decide antes de qualquer mutação V54
      → aplica grupo de mutação somente após `INSERT_IDEMPOTENCY_LOG`
      → validateParsedEntryV54ForActions_()
      → mapParsedEntryToLancamentoV54_() (simples)
      → OU mapSingleCardPurchaseContract (compra_cartao, via DI)
      → OU mapInstallmentScheduleContract (compra_parcelada, via DI)
      → planExpectedFaturasUpsert (Faturas upsert, via DI)
      → sheet.getRange().setValues()

  src/ActionsV54Recovery.js
    → applyReviewedIdempotencyRecoveryV54(input, options)
      → exige DI: `getSpreadsheet`, `withLock`, `applyReviewedIdempotencyRecovery`, `checklist`
      → valida `Idempotency_Log` e headers
      → le linhas existentes de idempotência
      → aplica somente planos revisados `MARK_IDEMPOTENCY_FAILED`/`MARK_IDEMPOTENCY_COMPLETED`
      → escreve somente a linha correspondente em `Idempotency_Log`

  src/ParserV54OpenAI.js
    → parseTextV54OpenAI(text, runtimeContext, options)
      → obtém contexto canônico por DI (`getParserContext`) ou contexto recebido
      → constrói system/user prompt V54 sem segredos e sem instruções de mutação
      → chama OpenAI somente via `fetchJson`/`urlFetch` injetado, com fallback Apps Script para uso futuro revisado
      → extrai JSON da resposta, rejeita JSON inválido/array e valida por ParsedEntryV54
      → retorna `{ ok, parsedEntry, normalized, errors }`
      → não escreve em planilhas, não envia Telegram e não é roteado

  src/ParserV54Context.js
    → getParserContextV54(runtimeContext, options)
      → lê `Config_Categorias`, `Config_Fontes` e `Cartoes` por `getSpreadsheet` injetado
      → valida headers contra cópia mínima do schema V54 canônico
      → filtra linhas inativas quando existe `ativo`
      → retorna somente `categories`, `fontes`, `cartoes`, `defaultPessoa`, `defaultEscopo`, `referenceDate`
      → remove campos sensíveis/unrelated, não chama OpenAI, não envia Telegram e não muta planilhas

  src/HandlerV54.js
    → handleTelegramUpdateV54(update, options)
      → extrai `chat_id`, `message_id`, `update_id`, texto e contexto de usuário
      → chama parser V54 injetado por `src/ParserV54.js`
      → valida ParsedEntryV54
      → chama `recordEntryV54(parsedEntry, options)` com `idempotency.enabled=true`
      → usa `src/ViewsV54.js` para formatar resposta segura
      → retorna resultado estruturado; não chama Telegram e não é roteado

  src/RunnerV54.js
    → runV54ManualShadow(update, options)
      → exige DI explicita: `getSpreadsheet`, `withLock`, validator, planner idempotente e parser fake ou `fetchJson` + `apiKey`
      → monta `parserOptions` com `getParserContextV54`, `fetchJson`, `apiKey`, `model` e validator
      → monta `recordOptions` com `getSpreadsheet`, `withLock`, `planV54IdempotentWrite`, contratos de cartao/parcelamento/faturas
      → chama `handleTelegramUpdateV54(update, composedOptions)`
      → retorna resultado estruturado; não chama `sendTelegram`, não chama `doPost` e não escolhe planilha/OpenAI real por fallback

  src/RunnerV54Gate.js
    → invokeV54ManualShadowGate(input, options)
      → aceita somente envelope manual `{ mode, checklist, update, runnerOptions }`
      → exige checklist revisado: `reviewed`, `manualOnly`, `doPostUnchanged`, `telegramSendDisabled`
      → `real_manual` exige tambem `realRunApproved` e politica revisada de diagnosticos
      → rejeita objetos com formato de evento web Apps Script (`postData`, `parameter`, `parameters`, `queryString`)
      → em `dry_run`, valida o gate sem chamar o runner
      → em `fake_shadow`, chama `runV54ManualShadow` injetado/global somente apos validacao
      → não e chamado por `doPost`, não e exposto por `doGet`, não envia Telegram

  src/RunnerV54RealManualPolicy.js
    → evaluateV54RealManualPolicy(input, options)
      → valida somente contrato de pre-run para futura execucao `real_manual`
      → exige operador, aprovacao explicita, input sintetico/manual, bloqueios de `doPost`/`doGet`, Telegram send desabilitado, dry-run/fake-shadow previo e snapshot/export acknowledged
      → valida por DI a presenca de `Idempotency_Log`, todas as abas V54, headers esperados e leitura de contexto do parser
      → nao chama Telegram, OpenAI, SpreadsheetApp real, setup, seed, deploy ou rotas web
```

`recordEntryV54` pode ser alcançado por `doPost` somente no caminho `V54_PRIMARY`, via `routeV54PrimaryEntry_` e `RunnerV54ProductionBridge`. O default continua `V53_CURRENT`; `V54_SHADOW` é no-write; `doGet` não ativa V54.

---

## 5. Onde Adicionar Nova Regra de Domínio

1. **Primeiro:** implemente como contrato local puro em `scripts/lib/`.
   - Sem Apps Script globals.
   - Sem chamada de rede.
   - Com teste local Node.js em `scripts/test-v54-*.js`.
2. **Depois:** crie adapter fino em `src/ActionsV54.js` consumindo o contrato via dependency injection.
3. **Nunca:** em código V53 (`Actions.js`, `Commands.js`, `Parser.js`, `Views.js`, `SetupLegacy.js`).

---

## 6. Dívidas Técnicas Conhecidas

| Dívida | Impacto | Fase para resolver |
|---|---|---|
| Drift entre `scripts/lib/v54-schema.js` e `src/000_V54Schema.js` | Node continua autoridade; Apps Script usa mirror por ausência de bundler. | Monitorar por `test:v54:schema`, `test:v54:setup`, `test:v54:actions`. |
| `ActionsV54.js` ainda concentra escrita/faturas | Orquestrador caiu para ~620 linhas, mas ainda possui escrita e faturas no mesmo arquivo. | NEXT (extrair helpers de sheet/faturas se necessário, sem mudar comportamento). |
| V53 ainda no runtime | Código morto que pode confundir agentes e humanos. | LATER (remover somente após V54 Telegram MVP funcional) |
| Sem bundler | Não é possível usar `require()` em Apps Script — forçando duplicação. | LATER (avaliar clasp + esbuild ou rollup) |
| V54 primary depende de checklist operacional real | Ponte existe e é testada local/fake-first, mas deploy/setup/sync/Telegram/OpenAI reais não foram executados nesta tarefa. | Operação manual revisada antes de ativação real. |
| Runner manual/shadow ainda local/fake-first | `src/RunnerV54.js` compoe as pecas V54 com DI explicita e `src/RunnerV54Gate.js` exige checklist manual revisado, mas isso nao e rota real, nao envia Telegram e nao deve ser usado como habilitacao de trafego. | Próxima fase de gate de roteamento. |
| Politica `real_manual` ainda e contrato de diagnostico | `src/RunnerV54RealManualPolicy.js` define pre-condicoes e fake diagnostics, mas nao executa servicos reais nem torna V54 production-ready. | Revisao manual antes de qualquer execucao real. |
| `ViewsV54` ainda é skeleton | Existe formatador seguro mínimo; respostas produtivas completas ainda não existem. | Próxima fase de feature. |
| Aplicação real/roteada dos planos de recuperação de idempotência | Adapter Apps Script fake-first existe, mas nenhum fluxo real, rota, Telegram ou planilha produtiva aplica planos revisados. | NEXT antes do roteamento real. |

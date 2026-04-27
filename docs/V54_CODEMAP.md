# V54_CODEMAP.md

Mapa do código-fonte do Bot Financeiro para orientar programadores humanos e agentes.
Última atualização: 2026-04-27.

---

## 1. Visão Geral do Runtime Atual

O projeto é um bot financeiro pessoal em **Google Apps Script** integrado ao **Telegram** e **Google Sheets**.
O runtime Apps Script carrega todos os arquivos `src/*.js` em escopo global compartilhado (não há bundler nem module system).

Existem duas gerações de código convivendo no mesmo runtime:
- **V53 (legacy/deprecated):** Fluxo produtivo ativo de Telegram — é o que o `doPost` roteia hoje.
- **V54 (MVP em construção):** Contratos locais Node.js + adapter Apps Script (`ActionsV54.js`). Ainda **não** está conectado ao `doPost`.

---

## 2. Tabela de Arquivos

| Arquivo | Papel | Status | Pode receber feature nova? | Observação |
|---|---|---|---|---|
| `src/Main.js` | Entry points (`doPost`, `doGet`), CONFIG, utilitários (`sendTelegram`, `formatBRL`, `withScriptLock`), routing mode enum | `SHARED_INFRA` | Não sem aprovação explícita | Roteia para V53 hoje. Futuro roteamento V54 será adicionado aqui. |
| `src/ActionsV54.js` | Adapter Apps Script V54: `recordEntryV54`, validação, mapeamento, escrita fake-first em Lancamentos/Compras/Parcelas/Faturas | `V54_APPS_SCRIPT_ADAPTER` | Sim (somente V54) | Contém duplicação temporária de headers e validação (limitação CommonJS). Não wired into `doPost` yet. |
| `src/ActionsV54Idempotency.js` | Adapter Apps Script fake-first para idempotência em `recordEntryV54` via DI | `V54_APPS_SCRIPT_ADAPTER` | Sim (somente V54) | Consome planner local injetado, guarda grupos de mutação V54, sem `require()` e sem roteamento Telegram. |
| `src/ActionsV54Recovery.js` | Adapter Apps Script fake-first para aplicar planos revisados de recuperação em `Idempotency_Log` via DI | `V54_APPS_SCRIPT_ADAPTER` | Sim (somente V54) | Consome executor/checklist local injetado em testes, escreve somente `Idempotency_Log`, sem rota Telegram e sem mutação de domínio. |
| `src/ParserV54.js` | Skeleton Apps Script do parser V54 via DI | `V54_APPS_SCRIPT_ADAPTER` | Sim (somente V54) | Não chama OpenAI; exige parser injetado e normaliza resultado/erro para o handler. |
| `src/ParserV54OpenAI.js` | Adapter Apps Script produtivo do ParserV54 para OpenAI, atrás de DI | `V54_APPS_SCRIPT_ADAPTER` | Sim (somente V54) | Constrói prompt V54 canônico, chama OpenAI por `fetchJson`/`urlFetch` injetado ou fallback Apps Script, valida ParsedEntryV54 e não é chamado por `doPost`. |
| `src/HandlerV54.js` | Skeleton Apps Script do handler V54 Telegram-like via DI | `V54_APPS_SCRIPT_ADAPTER` | Sim (somente V54) | Extrai update/message, valida contexto de usuário, chama parser injetado, valida ParsedEntryV54, chama `recordEntryV54` idempotente e retorna resultado estruturado; não é chamado por `doPost`. |
| `src/ViewsV54.js` | Skeleton de formatadores seguros V54 | `V54_APPS_SCRIPT_ADAPTER` | Sim (somente V54) | Gera texto seguro para sucesso, duplicidade, retry, parser/validação/unsupported/error; não envia Telegram. |
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

## 3. Fluxo Atual do Telegram (V53 — ATIVO)

```
Telegram webhook
  → doPost(e)                          [src/Main.js]
    → parseTelegramUpdate_()
    → isWebhookAuthorized_()
    → if text starts with "/"
        → handleCommand(text, chatId, user)  [src/Commands.js]
            → sendTelegram() / Views.js functions
    → else
        → handleEntry(text, chatId, user)    [src/Actions.js]
            → parseWithOpenAI()              [src/Parser.js]
            → validateParse()
            → recordParsedEntry()            [src/Actions.js]
            → sendTelegram()
```

Todas as funções acima pertencem ao fluxo **legacy V53**. Elas leem/escrevem nas abas V53 da planilha (`Lançamentos`, `Config`, `Dashboard`, `Investimentos`, `Parcelas`).

---

## 4. Fluxo V54 (EM CONSTRUÇÃO — não roteado)

```
Contratos locais Node.js (scripts/lib/):
  v54-schema.js           ← headers canônicos
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

  src/HandlerV54.js
    → handleTelegramUpdateV54(update, options)
      → extrai `chat_id`, `message_id`, `update_id`, texto e contexto de usuário
      → chama parser V54 injetado por `src/ParserV54.js`
      → valida ParsedEntryV54
      → chama `recordEntryV54(parsedEntry, options)` com `idempotency.enabled=true`
      → usa `src/ViewsV54.js` para formatar resposta segura
      → retorna resultado estruturado; não chama Telegram e não é roteado
```

**`recordEntryV54` NÃO é chamado por `doPost`.**
Para que V54 processe tráfego real do Telegram, é preciso:
1. Criar `ParserV54` produtivo (usando LLM real) atrás da interface já modelada.
2. Criar `ViewsV54` produtivo completo para respostas Telegram.
3. Alterar `doPost` para rotear para V54 (via `ROUTING_MODES`) somente após gates aceitos.

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
| Duplicação de schema entre `scripts/lib/v54-schema.js`, `src/Setup.js` (`getV54Schema()`) e `src/ActionsV54.js` (headers inline) | Headers podem divergir silenciosamente. Hoje protegido por testes de paridade. | NEXT (extrair helper ou unificar, sem bundler) |
| `ActionsV54.js` grande (1006 linhas) | Difícil de ler e revisar. Contém validação, mapeamento, escrita, helpers de fatura e utilities. | NEXT (extrair helpers sem mudar comportamento) |
| V53 ainda no runtime | Código morto que pode confundir agentes e humanos. | LATER (remover somente após V54 Telegram MVP funcional) |
| Sem bundler | Não é possível usar `require()` em Apps Script — forçando duplicação. | LATER (avaliar clasp + esbuild ou rollup) |
| ParserV54 produtivo ainda não roteado | Existe adapter OpenAI por DI em `src/ParserV54OpenAI.js`, mas V54 ainda não processa Telegram real porque `doPost` não chama o handler/parser V54. | Próxima fase de gate de roteamento. |
| `ViewsV54` ainda é skeleton | Existe formatador seguro mínimo; respostas produtivas completas ainda não existem. | Próxima fase de feature. |
| `ActionsV54.js` grande | Ainda concentra validação, mapeamento e escrita base. | NEXT (extrair helpers sem mudar comportamento) |
| Aplicação real/roteada dos planos de recuperação de idempotência | Adapter Apps Script fake-first existe, mas nenhum fluxo real, rota, Telegram ou planilha produtiva aplica planos revisados. | NEXT antes do roteamento real. |

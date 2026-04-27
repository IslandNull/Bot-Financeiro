# ARCHIVED - superseded by D031

This plan assumed V53 was active production/fallback. That premise is no longer valid. Use docs/MASTERPLAN_PRODUCAO_V54.md instead.

# Masterplan de Refatoração Segura — Bot Financeiro V54

## 1. Visão Geral e Veredito Executivo
**Recomendação:** Refatorar **agora**, de forma progressiva e rigorosamente isolada via **Branch by Abstraction** e Modos de Roteamento (Routing Modes).

O sistema base (V54 Schema e Seed) está maduro e aplicado na produção. A infraestrutura de locks e segurança foi validada para o caminho feliz. No entanto, o código atual (roteador, parser, comandos e views) está 100% acoplado à V53. Uma substituição do tipo "Big Bang" possui alto risco de quebrar o fluxo produtivo atual. 

A estratégia segura é: adicionar testes de segurança (caminhos negativos), criar uma fundação de roteamento paralelo (`ActionsV54.js`), introduzir os caminhos de escrita V54 sem tocar na V53, e então realizar o "cutover" gradual (Shadow Mode -> Primary).

## 2. Estado Atual Verificado
- **VERIFIED:** Estrutura física V54 (14 abas) existe.
- **VERIFIED:** Seed/Config inicial injetado via dry-run/lock path (`.ai_shared/SPREADSHEET_STATE.md`).
- **VERIFIED:** Fluxo atual no Telegram usa estritamente código V53 (`Actions.js` escreve em `CONFIG.SHEETS.lancamentos`).
- **VERIFIED:** Decisão D021: V53 *não* servirá como fonte de migração de histórico. V54 é um *clean start*.
- **VERIFIED:** Locks de segurança (`withScriptLock`) e verificação de `WEBHOOK_SECRET` estão ativos no caminho produtivo feliz.
- **VERIFIED:** Testes negativos dinâmicos locais cobrem os cenários principais de webhook.
- **UNVERIFIED:** Esses cenários ainda não foram testados contra o endpoint real de produção.

## 3. Políticas de Engenharia

### Política de Remoção (Sunset)
> **Regra Dura:** Nenhuma função legacy (V53) é removida até existir teste provando que nenhum comando produtivo a chama e os seguintes critérios objetivos forem cumpridos:
- Nenhum comando Telegram chama `recordParsedEntry` V53.
- Nenhuma view produtiva depende de `Dashboard` V53.
- Comandos centrais (`/saldo`, `/hoje`, `/fatura`, `/parcelas`, `/desfazer`) têm equivalentes V54 testados.
- Snapshot V54 limpo e sem erros de fórmula.
- Negative webhook tests passando na pipeline.
- Rollback documentado e testado.
- Backup/cópia da planilha garantido antes de ocultar/deletar abas V53.
- Confirmação humana explícita.

### Política de Nomes
Para evitar caos, manteremos a taxonomia estrita:
- `ActionsV54.js` (Write paths novos)
- `ParserV54.js` (Interpretador LLM com schema novo)
- `ViewsV54.js` (Relatórios de leitura)
- `Routing.js` ou `RuntimeMode.js` (Se necessário extrair chaves de roteamento)
- `SetupLegacy.js` (Depósito de funções de manutenção passadas)
- `SetupV54.js` (Para separação futura do setup limpo)

## 4. Plano de Execução em Fases Pequenas

As seguintes ações são candidatas a refatoração, mas devem ser divididas em fatias independentes para que possamos validar cada passo; **a primeira execução deve implementar apenas testes negativos de webhook**.

### Fase 1: Segurança e Fundação de Roteamento
- **Fase 1A — Testes negativos de webhook:** Adicionar testes locais/fake para provar que `doPost` falha fechado (WEBHOOK_SECRET ausente, inválido, requisição sem secret, chat não autorizado).
- **Fase 1B — Routing Mode:** Adicionar a enum de runtime (`V53_CURRENT`, `V54_SHADOW`, `V54_PRIMARY`) com default para `V53_CURRENT`. Nenhuma chamada produtiva muda ainda.
- **Fase 1C — Isolar Setup Legacy:** Mover `setupV52`, `setupV53`, `forceFixAllFormulas` para `SetupLegacy.js`, mantendo nomes globais idênticos e criando teste estático para garantir que não quebrou chamadas e não expôs mutações no `doGet`.

**Phase 1 close gate:** DONE on remote. Phase 1A local negative webhook coverage and Phase 1B routing-mode foundation are represented by commit `c43cb41`. Phase 1B.2 routing diagnostics/refactoring handoff documentation is represented by commits `4deab8d` and `804ffc1`. Phase 1C legacy setup isolation is represented by commit `022daeb`. Gemini handoff shell guidance was pushed in `b34e679`. Before Phase 2 starts, the working tree must be clean and the branch must be synced with origin.

### Fase 2: Contrato e Parser Duplo

**Phase 2A status:** DONE. `ParsedEntryV54` is a strict local contract with structured validation result `{ ok, errors, normalized }`; it is not wired into production routing.
- **Fase 2A — Definir Contrato V54:** Estabelecer a interface estrita (`ParsedEntryV54`) exigida pelo novo write path.
- **Fase 2B — ParserV54:** Fazer o parser resolver os IDs canônicos utilizando os dicionários `Config_Categorias` e `Config_Fontes`.

**Phase 2B status:** DONE. The local ParserV54 adapter builds prompts from canonical context, parses JSON/fenced JSON, and validates candidates through `ParsedEntryV54`; it is not wired into production routing.

### Fase 3: Transaction Write Paths V54 (MVP)
- **Fase 3A-prep — Mapper local de `Lancamentos_V54`:** DONE. `scripts/lib/v54-lancamentos-mapper.js` maps validated `ParsedEntryV54` objects to canonical 19-column `Lancamentos_V54` row payloads with injected ID/timestamp dependencies. This is local-only and not wired into production.
- **Fase 3A — Write Path Simples:** DONE locally. `src/ActionsV54.js` implements `recordEntryV54` for simple V54 events (`despesa`, `receita`, `transferencia`, `aporte`) with fake-spreadsheet tests only. It is not wired into Telegram/routing and does not implement cards, invoices, installments, debts, reconciliation, or reporting.

### Fase 4: Reporting e Complexidade Financeira
**Phase 4A status:** DONE locally. `scripts/lib/v54-reporting-contracts.js` defines deterministic reporting helpers for operational DRE, reserve/home earmarks, net worth, debts, couple settlement, shared-detail privacy filtering, and monthly closing draft shape. This is local-only and not wired into Telegram, routing, Apps Script views, formulas, OpenAI, or spreadsheet mutation.

*Desenvolver o motor progressivamente:*
- **Fase 4A-reporting — Contratos locais de relatório:** DONE locally.
- **Fase 4B:** Compra no cartão à vista (`Lancamentos_V54` vinculado ao `id_cartao`).
- **Fase 4C:** Compra parcelada (`Compras_Parceladas` + `Parcelas_Agenda`).
- **Fase 4D:** Geração/Associação de `Faturas`.
- **Fase 4E:** Pagamento de fatura (`Pagamentos_Fatura`, gerando contrapartida sem afetar DRE).
- **Fase 4F:** Reconciliação parcial/total.

### Fase 5: Shadow Mode e Cutover
- **Fase 5A — Shadow Mode:** Roteamento `V54_SHADOW`. V53 escreve os dados reais, V54 opera simulações controladas para garantir paridade.
- **Fase 5B — Primary Mode:** Roteamento `V54_PRIMARY`. A V54 assume o write path oficial.

### Fase 6: Sunset da V53
- **Fase 6:** Aposentar e deletar lógicas legadas conforme a "Política de Remoção" validada.

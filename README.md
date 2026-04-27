# 💰 Bot Financeiro — Gustavo & Luana

Bot de Telegram para gestão financeira doméstica, integrado ao Google Sheets via Google Apps Script.

> ⚠️ **ATENÇÃO: PROJETO EM DESENVOLVIMENTO (V54 MVP)**
> O projeto está em transição para uma nova arquitetura (V54-only).
> A versão antiga (V53) agora é considerada um **protótipo legado/deprecated** e não deve receber novas features.
> Branch atual de trabalho: `feat/v54-production-readiness`
> Não use este README antigo como guia de arquitetura.

## Documentação Autoritativa (Para IAs e Devs)
Antes de iniciar qualquer tarefa, leia obrigatoriamente:
1. `AGENTS.md`
2. `.ai_shared/ACTIVE_CONTEXT.md`
3. `.ai_shared/DECISIONS.md`
4. `docs/MASTERPLAN_PRODUCAO_V54.md`
5. `docs/V54_DOMAIN_DECISIONS.md`

## Funcionalidades (Visão Geral)
- **Lançamento por linguagem natural** — "52 ifood luana cartão"
- **Parse inteligente** — OpenAI GPT classifica dados
- **Dashboard** — acompanhamento de categorias e faturas
- **Acerto do casal** — cálculo proporcional

## Stack
- **Runtime**: Google Apps Script (Node.js tooling local via `clasp`)
- **AI**: OpenAI GPT (structured output)
- **Interface**: Telegram Bot API (webhook)
- **Dados**: Google Sheets

## Estrutura Atual
O código-fonte principal fica na pasta `src/`:
- `src/Main.js` — Entrypoints e roteamento
- `src/ActionsV54.js` / `src/Actions.js` — Lógicas de escrita (V54 vs Legacy)
- `src/Parser.js` — Parser LLM
- `src/Setup.js` / `src/SetupLegacy.js` — Scripts de setup
- `scripts/` — Testes locais e scripts utilitários (ex: verificação de schema V54)

## ⚠️ Segurança
- Segredos ficam no **Script Properties** do Apps Script, nunca no código.
- Nenhuma mutação de produção (V54) deve ser feita sem verificação de segurança (`LockService`, webhooks protegidos).
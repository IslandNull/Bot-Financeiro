# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Google Apps Script Telegram bot for couple (Gustavo & Luana) household financial management, backed by Google Sheets. Code runs on Google's serverless platform; local tooling is **clasp** (via npm) for push/pull from the terminal.

## Development Commands

```bash
npm install                  # instala clasp localmente
npm run push                 # clasp push — envia Code.js para o Apps Script
npm run pull                 # clasp pull — baixa versão do Apps Script
npm run logs                 # stream de logs do Apps Script
npm run open                 # abre o projeto no Apps Script Editor
```

## Setup Inicial (uma vez por máquina)

```bash
npx clasp login              # autenticação OAuth com Google
cp .clasp.json.template .clasp.json
# edite .clasp.json e coloque o scriptId real do seu projeto
```

O `scriptId` está em: Apps Script Editor → Project Settings → IDs.

## Segredos — PropertiesService

As chaves **nunca ficam no código**. Configure via Apps Script Editor:
**Project Settings → Script Properties → Add property**

| Chave | Valor |
|-------|-------|
| `OPENAI_API_KEY` | chave da OpenAI |
| `TELEGRAM_TOKEN` | token do BotFather |
| `SPREADSHEET_ID` | ID da planilha Google Sheets |
| `AUTHORIZED` | JSON: `{"CHAT_ID_G":{"nome":"Gustavo","pagador":"Gustavo"},"CHAT_ID_L":{"nome":"Luana","pagador":"Luana"}}` |

Após configurar as propriedades, faça o deploy:
1. Apps Script Editor → Deploy → New deployment → Web App
2. Execute `apontarWebhookProValTown()` uma vez no Editor

## Fluxo do dia a dia

```
editar Code.js → git commit → npm run push → Apps Script atualizado
```

Para testar o parse sem usar o Telegram, execute `testParse()` no Editor.

## Architecture

Single-file Google Apps Script (`Code.js`). Entry point is `doPost(e)` — the Telegram webhook handler.

**Data flow for a text message:**
```
Telegram → doPost → handleEntry → parseWithOpenAI (GPT structured output)
                                → validateParse (guards against bad GPT output)
                                → SpreadsheetApp (write to Lançamentos sheet)
                                → sendTelegram (confirmation + category saldo)
```

**Commands** (`/resumo`, `/saldo`, `/hoje`, `/desfazer`, `/transferir`) are handled in `handleCommand` → read from the Dashboard sheet cells directly.

**Google Sheets structure** (3 sheets):
- `Lançamentos` — transaction rows: date, tipo, valor, categoria, pagador, fonte, descricao
- `Config` — pagadores (B11:B20), fontes (C11:C30), categorias despesa (E11:E60), categorias receita (I11:I20)
- `Dashboard` — pre-calculated aggregates read by bot commands (hardcoded cell references like E8, E9, B26:E64)

**Caching:** `getListsCached()` reads Config sheet lists and caches them in `CacheService` for 1 hour to avoid repeated Sheets API calls. Invalidate by waiting or clearing Apps Script cache.

**Undo:** last written row per chat is tracked in `PropertiesService` (`last_row_<chatId>`). `/desfazer` clears that row and deletes the property.

## AI Parse Contract

`parseWithOpenAI` sends a structured output request to OpenAI with a strict JSON schema. The schema enforces all fields; `validateParse` is a second safety net checking values against live lists from the Config sheet. The system prompt in `buildSystemPrompt` embeds live category/fonte/pagador lists from the spreadsheet so GPT only outputs valid enum values.

## Key Constraints

- **Val.town proxy**: `apontarWebhookProValTown()` exists because Apps Script Web App URLs return HTTP 302, which Telegram rejects as a valid webhook. The proxy at `islandd.val.run` forwards correctly.
- **Dashboard cell references are hardcoded** — if the Dashboard sheet layout changes, update the corresponding functions (`getResumoMes`, `getSaldoTop5`, `getAcertoMes`, `getLancamentosHoje`).
- Secrets live in Script Properties, never in `Code.js`. `_loadSecrets()` is called at the top of every entry-point function (`doPost`, `setWebhook`, `testParse`, etc.).

## Planned Features (IMPLEMENTATION_PLAN.md)

The implementation plan v5.2 (see git history) outlines:
- Envelope budgeting: provisão categories that accumulate month-over-month vs. consumo categories that reset monthly
- Individual dashboards per pagador (Option B: same categories, filter by pagador)
- New payment sources: Nubank Gustavo, Nubank Luana, Mercado Pago Gustavo
- Investment tracking
- Multi-card tracking with closing dates

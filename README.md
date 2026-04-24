# 💰 Bot Financeiro — Gustavo & Luana

Bot de Telegram para gestão financeira doméstica, integrado ao Google Sheets via Google Apps Script.

## Funcionalidades

- **Lançamento por linguagem natural** — "52 ifood luana cartão" → registra automaticamente
- **Parse inteligente** — GPT classifica categoria, pagador e fonte de pagamento
- **Dashboard em tempo real** — planejado vs realizado por categoria
- **Acerto do casal** — calcula quanto a Luana transfere pro Gustavo
- **Comandos rápidos** — `/resumo`, `/saldo`, `/hoje`, `/desfazer`, `/transferir`

## Stack

- **Runtime**: Google Apps Script (serverless)
- **AI**: OpenAI GPT (structured output)
- **Interface**: Telegram Bot API (webhook)
- **Dados**: Google Sheets (planilha)

## Setup

1. Copie `appscript.template` → `appscript` (não versionado)
2. Preencha as chaves no `CONFIG`:
   - `OPENAI_API_KEY` — chave da OpenAI
   - `TELEGRAM_TOKEN` — token do BotFather
   - `SPREADSHEET_ID` — ID da planilha Google Sheets
   - `AUTHORIZED` — chat IDs do Telegram
3. Cole o conteúdo no Google Apps Script Editor
4. Deploy como Web App
5. Execute `setWebhook()` uma vez

## Estrutura

```
appscript.template  — Código do bot (sem chaves)
orcamento_casal_v2.xlsx — Planilha modelo
.gitignore          — Protege secrets
```

## ⚠️ Segurança

O arquivo `appscript` (com chaves reais) está no `.gitignore` e **nunca deve ser commitado**. Use sempre o `.template` para versionamento.

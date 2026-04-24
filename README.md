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
- **Tooling local**: Node.js + clasp (push/pull via terminal)

## Setup (primeira vez)

### 1. Pré-requisitos
- [Node.js](https://nodejs.org) instalado
- Projeto Google Apps Script criado (anote o `scriptId`)

### 2. Instalar e autenticar
```bash
npm install
npx clasp login
cp .clasp.json.template .clasp.json
# edite .clasp.json e coloque o scriptId real
```

### 3. Configurar segredos
No Apps Script Editor: **Project Settings → Script Properties → Add property**

| Chave | Valor |
|-------|-------|
| `OPENAI_API_KEY` | chave da OpenAI |
| `TELEGRAM_TOKEN` | token do BotFather |
| `SPREADSHEET_ID` | ID da planilha Google Sheets |
| `AUTHORIZED` | JSON: `{"CHAT_ID_G":{"nome":"Gustavo","pagador":"Gustavo"},"CHAT_ID_L":{"nome":"Luana","pagador":"Luana"}}` |

> Para descobrir seu chat ID do Telegram: mande uma mensagem para [@userinfobot](https://t.me/userinfobot).

### 4. Deploy
```bash
npm run push
```
1. No Apps Script Editor: **Deploy → New deployment → Web App**
2. Execute `apontarWebhookProValTown()` uma vez no Editor

## Fluxo do dia a dia

```
editar Code.js → git commit → npm run push
```

| Comando | O que faz |
|---------|-----------|
| `npm run push` | Envia `Code.js` para o Apps Script |
| `npm run pull` | Baixa versão atual do Apps Script |
| `npm run logs` | Stream de logs em tempo real |
| `npm run open` | Abre o projeto no Apps Script Editor |

## Estrutura

```
Code.js                  — Código do bot (sem chaves, versionado)
appsscript.json          — Manifesto do Apps Script
package.json             — Scripts npm (push/pull/logs/open)
.clasp.json.template     — Template para criar .clasp.json local
.claspignore             — Quais arquivos o clasp envia
orcamento_casal_v2.xlsx  — Planilha modelo
```

## ⚠️ Segurança

- Segredos ficam no **Script Properties** do Apps Script, nunca no código
- `.clasp.json` (com o `scriptId`) está no `.gitignore` — crie a partir do `.template`

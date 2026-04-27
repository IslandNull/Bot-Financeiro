# V54_RUNTIME_MAP.md

Mapeamento de entrypoints e estado de runtime da transição V53 -> V54.

## 1. Rotas Webhook / Apps Script
- `doPost(e)` (em `src/Main.js`): Ponto de entrada do Telegram.
  - **Segurança:** Requer `WEBHOOK_SECRET` via query string ou body (Val.town).
  - **Status V54:** `doPost` atualmente roteia todo o tráfego exclusivamente para o fluxo legacy V53 (`handleCommand` / `handleEntry`). `ActionsV54.recordEntryV54` existe mas ainda **não é chamado** por `doPost` — V54 não está plugado ao roteamento Telegram.
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
  - Usa injeção de dependências para `spreadsheetApp`, `lockService`, etc., permitindo testes locais.
- **V53 Legacy (deprecated/obsoleto):**
  - Módulos: `src/Actions.js`, `src/Commands.js`, `src/Parser.js`, `src/Views.js`, `src/SetupLegacy.js`.
  - **NÃO ADICIONAR NOVAS FEATURES NESTES ARQUIVOS.**

## 3. O que ainda não está roteado
- O ParserV54 ainda não processa mensagens do Telegram em produção.
- `ActionsV54.recordEntryV54` ainda não é chamado por `doPost`.
- `doPost` ainda chama `handleCommand` / `handleEntry`, que pertencem ao fluxo legacy V53.
- V54 existe como contrato/adaptador testado, mas não é o caminho principal do Telegram.
- Não há pagamentos de fatura implementados em V54.
- Não há respostas/relatórios (Views) de V54 trafegando para o Telegram.

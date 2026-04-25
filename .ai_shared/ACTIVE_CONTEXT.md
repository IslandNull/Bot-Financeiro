# ACTIVE_CONTEXT.md

Last updated: 2026-04-25
Branch: feat/v52-upgrade

## Verified facts
- Fórmulas funcionaram com setFormula() + funções em inglês + separador ;
- copyTo com célula temporária causou #REF!
- setFormula() com vírgula causou erro de análise na planilha atual
- Code.js fatiado com sucesso em src/ (Main.js, Parser.js, Commands.js, Views.js, Actions.js, Setup.js)
- Fase 4: Implementação do schema V53 codificada (setupV53 para migração, getListsCached e translate category -> id_categoria)
- Partidas Dobradas: implementado lógica em Actions.js (um aporte gera linha de despesa e receita)
- CLI script (scripts/sync-state.js) e API doGet criados com SYNC_SECRET

## Unverified claims
- setupV53 foi rodado na nuvem na planilha oficial e as colunas físicas refletem a V53
- Partidas Dobradas (handleEntry) funcionam end-to-end com sucesso na integração via Telegram

## Current task
Auditar a execução do npm run sync e validar a integridade estrutural e comportamental da V53 de ponta a ponta.

## Next safe action
1. Rodar localmente `npm run sync` e verificar o conteúdo do `SPREADSHEET_STATE.md`.
2. Confirmar através do estado exportado se o `setupV53` completou com sucesso a reestruturação da planilha oficial (ver se a coluna A é ID_CATEGORIA).
3. Após validado, testar a injeção via doPost simulando uma requisição de 'Aporte' e verificar se duas linhas são gravadas corretamente.
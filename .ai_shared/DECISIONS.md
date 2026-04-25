# DECISIONS.md

## D001 — Fórmulas no Google Sheets
Status: Accepted
Date: 2026-04-25

Decision:
Usar `range.setFormula()` com nomes de função em inglês e separador ponto e vírgula (`;`).

Reason:
Foi o único padrão validado na planilha real (devido ao locale pt-BR com vírgula para decimais e exigência de separador `;`).

Rejected:
- `setFormula()` com vírgula: erro de análise na planilha pt-BR.
- `setValue()` com SOMASES: função desconhecida pelo Apps Script API / inconsistência.
- `copyTo` de célula temporária: gerou `#REF!` nas referências.

## D002 — Sistema Relacional (V53) e Partidas Dobradas
Status: Accepted
Date: 2026-04-25

Decision:
Separar o Nome legível (`NOME_CATEGORIA`) do ID de banco de dados (`ID_CATEGORIA`).
O parser da OpenAI (LLM) retorna o nome legível, que é interceptado no `Parser.js` e convertido para o ID usando um cache em memória. O ID é gravado em `Lançamentos` para ser lido no `Dashboard` usando `XLOOKUP`. Partidas Dobradas são resolvidas programaticamente gerando dois registros no `Actions.js` quando tipo = "Aporte" (Transferência de/para Investimento).

Reason:
Reduz risco de alucinação do LLM tentando acertar o formato exato do ID, mantendo a responsabilidade de "Business Logic" e relacional rigoroso no lado do backend estruturado do Apps Script.

## D003 — Handoff entre Agentes (CLI-only)
Status: Accepted
Date: 2026-04-25

Decision:
Utilizar a raiz com `AGENTS.md` como contrato universal do repositório, com `GEMINI.md` e `CLAUDE.md` agindo apenas como wrappers de import (`@arquivo.md`). O estado fica versionado e auditável em `.ai_shared/ACTIVE_CONTEXT.md` e `.ai_shared/SPREADSHEET_STATE.md`.

Reason:
Minimiza "amnésia" em conversas de contexto limpo em ambientes CLI. Impede agentes de se basearem em memória interna/diários (`save_memory` ou `/memory`) não-versionados que não podem ser lidos por múltiplos usuários ou agentes diferentes.

# V54_DOCS_INDEX.md

Este é o índice oficial da documentação do projeto Bot Financeiro (V54 MVP).
Todos os agentes devem usar esta estrutura para saber onde ler as regras.

## 1. ACTIVE_AUTHORITY (Leitura Obrigatória para Implementação)
- `AGENTS.md`: Contrato principal de agentes, regras de repo, e ponto de entrada.
- `.ai_shared/ACTIVE_CONTEXT.md`: Estado atual, próximo passo seguro, bloqueios.
- `.ai_shared/DECISIONS.md`: Decisões técnicas e de negócio aceitas. Não invente novas decisões; leia o arquivo atual.
- `docs/MASTERPLAN_PRODUCAO_V54.md`: O plano principal do MVP V54-only.
- `docs/V54_DOMAIN_DECISIONS.md`: Referência de domínio V54. Use somente quando não conflitar com `.ai_shared/DECISIONS.md`; decisões aceitas em `DECISIONS.md` prevalecem.
- `.ai_shared/SHEET_SCHEMA.md`: Snapshot/referência estrutural. O arquivo `scripts/lib/v54-schema.js` é a autoridade de headers V54 em código/testes.
- `.ai_shared/FORMULA_STANDARD.md`: Regras de injeção de fórmulas Apps Script.

## 2. ACTIVE_REFERENCE (Consulta Adicional)
- `.ai_shared/SPREADSHEET_STATE.md`: Snapshot gerado da planilha. Não editar manualmente. Use apenas quando a tarefa exigir estado real da planilha.
- `docs/V54_RUNTIME_MAP.md`: Mapeamento de entrypoints, limites entre legacy e V54.
- `.ai_shared/KNOWN_ISSUES.md`: Problemas e riscos ativos.
- `.ai_shared/HISTORY.md`: Log de ações passadas (não é fonte de decisão futura).
- `README.md`: Visão geral do projeto para humanos.

## 3. AGENT_WRAPPER (Apenas Apontamentos)
- `GEMINI.md`: Wrapper para o Gemini. Aponta para `AGENTS.md`.
- `CLAUDE.md`: Wrapper para o Claude. Aponta para `AGENTS.md`.

## 4. OBSOLETE_REMOVE_CANDIDATE & HISTORICAL_ARCHIVE (NÃO USE COMO CONTEXTO)
Os seguintes documentos e pastas são mantidos apenas para histórico e NÃO devem guiar novas implementações:
- `AI_WORKFLOW.md` (redundante com AGENTS.md e este índice)
- `.ai_shared/HANDOFF_PROTOCOL.md`
- `.ai_shared/registry.json`
- Qualquer arquivo em `.ai_shared/handoffs/`
- Qualquer arquivo em `.ai_shared/archive/`
- Qualquer arquivo em `docs/archive/`
- Scripts/habilidades em `.ai_shared/skills/` que não estejam sendo ativamente chamados.

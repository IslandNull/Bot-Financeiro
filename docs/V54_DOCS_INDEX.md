# V54_DOCS_INDEX.md

Índice oficial da documentação do projeto Bot Financeiro (V54 MVP).

**Regra:** agentes devem ler SOMENTE o que a sua tarefa exige. Não ler tudo.

## 1. MANDATORY_STARTUP (Sempre ler antes de qualquer tarefa)

| Arquivo | Papel |
|---|---|
| `AGENTS.md` | Contrato principal de agentes, regras de repo, ponto de entrada. |
| `docs/V54_DOCS_INDEX.md` | Este arquivo. Mapa de leitura. |
| `.ai_shared/ACTIVE_CONTEXT.md` | Estado atual, próximo passo seguro, bloqueios. |
| `.ai_shared/DECISIONS.md` | Decisões técnicas e de negócio aceitas. Não invente novas decisões; leia o arquivo atual. |

## 2. CODE_TASKS (Ler somente se a tarefa envolver código)

| Arquivo | Papel |
|---|---|
| `docs/V54_CODEMAP.md` | Mapa de arquivos, papéis, fluxos e dívidas técnicas. |
| `docs/V54_RUNTIME_MAP.md` | Mapeamento de entrypoints e limites V53/V54. |
| `docs/V54_CLEANUP_BACKLOG.md` | Backlog de limpeza priorizado (NOW/NEXT/LATER/DO NOT DO YET). |

## 3. TASK_SPECIFIC_REFERENCE (Ler somente quando a tarefa exigir)

| Arquivo | Quando ler |
|---|---|
| `.ai_shared/FORMULA_STANDARD.md` | Tarefas de fórmula ou injeção de fórmulas Apps Script. |
| `.ai_shared/SHEET_SCHEMA.md` | Tarefas de schema, snapshot, ou verificação de planilha. |
| `.ai_shared/KNOWN_ISSUES.md` | Debugging, troubleshooting, ou avaliação de riscos. |
| `.ai_shared/SPREADSHEET_STATE.md` | Estado real da planilha (gerado por `npm run sync`, não editar). |
| `docs/MASTERPLAN_PRODUCAO_V54.md` | Planejamento geral do MVP V54. |

## 4. AGENT_WRAPPER (Apenas apontamentos)

| Arquivo | Papel |
|---|---|
| `GEMINI.md` | Wrapper para o Gemini. Aponta para `AGENTS.md`. |
| `CLAUDE.md` | Wrapper para o Claude. Aponta para `AGENTS.md`. |

## 5. DO_NOT_USE_AS_AUTHORITY

Os seguintes locais contêm apenas material histórico e **nunca devem ser usados como contexto para implementação atual**:

- `docs/archive/` — contém apenas `HISTORY.md` (log histórico de ações passadas).
- Qualquer documento arquivado nunca prevalece sobre `.ai_shared/DECISIONS.md`.
- Agentes **não devem** ler `docs/archive/` como parte do startup ou de tarefas normais.
- Se precisar de auditoria histórica, consulte `docs/archive/HISTORY.md` ou o `git log`.

# ACTIVE_CONTEXT.md

Last updated: 2026-04-27
Branch: feat/v54-production-readiness

## Premissa Atual
- D031 esta aceita. V54 e o unico alvo arquitetural do MVP.
- V53 e prototipo legado e deprecated, nao e producao nem fallback obrigatorio.
- Nao adicionar novas features no codigo/planilha V53.

## O que esta implementado (V54 local/fake-first)
- V54 Schema verificado (`scripts/lib/v54-schema.js`) e planilhas reais criadas na conta de producao com seed.
- Contratos locais implementados: Parser, Mapper, ActionsV54 (compras simples, compras de cartao, parceladas), Reporting.
- Phase 4D implementada local/fake-first: upsert previsto de `Faturas` a partir de compras de cartao e parcelas pendentes, sem `Pagamentos_Fatura`, sem DRE direto e sem mutacao real.
- Protecao de seguranca parcial: `WEBHOOK_SECRET` exigido no doPost localmente; `LockService` mapeado.
- Phase 4E-docs: Limpeza de autoridade documental realizada. Criado `docs/V54_DOCS_INDEX.md` e `docs/V54_RUNTIME_MAP.md`. Arquivos obsoletos marcados como arquivados. Wrapper mínimo no `GEMINI.md` e `CLAUDE.md`.
- Phase 4F: Codebase Human Readability & Architecture Guardrails. Criado `docs/V54_CODEMAP.md`, `docs/V54_CLEANUP_BACKLOG.md`, `scripts/test-v54-architecture-guardrails.js` (29 asserts, todos passando). Runtime map disambiguado. Nenhuma feature nova, nenhuma mudança de comportamento.
- Phase 4H: Context Load Reduction. Deletados 19 arquivos/diretórios obsoletos (AI_WORKFLOW.md, HANDOFF_PROTOCOL.md, registry.json, skills/, tools/, handoffs/, archive/, IMPLEMENTATION_PLAN.md, superpowers/, docs/archive V52+pre-D031). Movido HISTORY.md para `docs/archive/HISTORY.md`. Reescrito V54_DOCS_INDEX.md com categorias rígidas. Redução de 36 para 17 arquivos de documentação.
- Phase 4J: Masterplan stale decisions cleanup concluída; masterplan alinhado com D031-D041.

## O que esta bloqueado / Risco Atual
- **Seguranca:** O Telegram E2E path (do webhook real para o script atualizado) precisa de testes finais.
- GET mutantes protegidos por token na URL devem ser extintos.

## Proximo passo seguro
1. Criar modelagem de `Idempotency_Log` para garantir write-safety antes de plugar o webhook de producao.
2. Implementar proximas fases locais/fake-first de `Pagamentos_Fatura` e reconciliacao somente apos regra aceita.
3. **NAO executar** setup, seed, deploy, clasp, testes na planilha real, ou comandos Telegram sem aprovacao explicita.

*(Historico anterior detalhado movido para docs/archive/HISTORY.md)*

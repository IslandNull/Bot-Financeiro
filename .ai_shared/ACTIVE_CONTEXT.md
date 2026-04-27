# ACTIVE_CONTEXT.md

Last updated: 2026-04-27
Branch: feat/v54-production-readiness

## Premissa Atual
- D031 está aceita. V54 é o único alvo arquitetural do MVP.
- V53 é protótipo legado e deprecated, não é produção nem fallback obrigatório.
- Não adicionar novas features no código/planilha V53.

## O que está implementado (V54 local/fake-first)
- V54 Schema verificado (`scripts/lib/v54-schema.js`) e planilhas reais criadas na conta de produção com seed.
- Contratos locais implementados: Parser, Mapper, ActionsV54 (compras simples, compras de cartão, parceladas), Reporting.
- Proteção de segurança parcial: `WEBHOOK_SECRET` exigido no doPost localmente; `LockService` mapeado.

## O que está bloqueado / Risco Atual
- **Segurança:** O Telegram E2E path (do webhook real para o script atualizado) precisa de testes finais.
- GET mutantes protegidos por token na URL devem ser extintos.

## Próximo passo seguro
1. Iniciar **Phase 4D: Faturas expected upsert local/fake-first**.
2. Criar modelagem de `Idempotency_Log` para garantir write-safety antes de plugar o webhook de produção.
3. **NÃO executar** setup, seed, deploy, clasp, testes na planilha real, ou comandos Telegram sem aprovação explícita.

*(Histórico anterior detalhado movido para .ai_shared/HISTORY.md)*
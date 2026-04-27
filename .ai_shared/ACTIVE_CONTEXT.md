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
- Falta aceitar e implementar propostas do `docs/V54_DOMAIN_DECISIONS.md`.

## Próximo passo seguro
1. Revisar `docs/V54_DOMAIN_DECISIONS.md` e aguardar aprovação humana para aceitar propostas.
2. Registrar decisões aprovadas em `.ai_shared/DECISIONS.md`.
3. Continuar a implementar FASE 1 e FASE 2 do MVP V54, focando em Faturas e Pagamentos.
4. **NÃO executar** setup, seed, deploy, clasp, testes na planilha real, ou comandos Telegram sem aprovação explícita.

*(Histórico anterior detalhado movido para .ai_shared/HISTORY.md)*
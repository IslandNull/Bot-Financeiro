# SHEET_SCHEMA - Bot Financeiro

This file is the shared schema reference for Google Sheets. Agents must verify the real spreadsheet with `.ai_shared/SPREADSHEET_STATE.md` and `npm run sync` before claiming any sheet/column exists.

## 1. Status Atual
- **V54 é o alvo exclusivo do MVP.**
- **V53 é legado/protótipo.** Não adicione novas features baseadas no fluxo V53.
- O snapshot exportado ainda contém as abas da V53 e V54, mas a V53 não é a autoridade futura.
- Migration strategy: V54 is a clean start. Do not migrate V53 history by default; only manually approved seed/opening data should be written to V54.

## Formula Standard
VERIFIED current standard:
- Use `range.setFormula()`.
- Use English function names: `SUMIFS`, `IF`, `DATEDIF`, `TODAY`, `XLOOKUP`.
- Use semicolon (`;`) as argument separator.
- Do not use temp-cell `copyTo()` for formulas.
- Do not use `setValue()` for formulas unless explicitly re-tested.

## 2. V54 Schema Authority
The source of truth for the V54 schema is:
- `scripts/lib/v54-schema.js`
- `src/Setup.js` mirror

### V54 Real Sheets
As of the snapshot generated at `2026-04-26 16:24:28`, the real spreadsheet contains V54 sheets through `Idempotency_Log` with header rows matching the schema from that time. VERIFIED in code on 2026-04-28: local schema/setup now also includes `Telegram_Send_Log`, but this has not been verified in the real spreadsheet because setup/sync/deploy were intentionally not run in this phase.
`Config_Categorias`, `Config_Fontes`, `Rendas`, `Cartoes`, `Faturas`, `Pagamentos_Fatura`, `Idempotency_Log`, `Telegram_Send_Log` (local schema/setup only; real sheet UNVERIFIED), `Compras_Parceladas`, `Parcelas_Agenda`, `Orcamento_Futuro_Casa`, `Lancamentos_V54`, `Patrimonio_Ativos`, `Dividas`, `Acertos_Casal`, `Fechamentos_Mensais`.

Clean seed data was applied. Formulas, dropdowns, and full transaction write paths are in development.

### V54 Idempotent Write Path
VERIFIED in local code on 2026-04-27: `scripts/lib/v54-idempotent-write-path.js` plans idempotency before V54 domain mutations using `Idempotency_Log`. `src/ActionsV54Idempotency.js` consumes that boundary through dependency injection in local/fake tests and guards simple `Lancamentos_V54`, `compra_cartao` + `Faturas`, and `compra_parcelada` + `Parcelas_Agenda` + `Faturas` mutation groups. This remains local/fake-first only and is not verified against the real spreadsheet.

VERIFIED in local code on 2026-04-27: stale `processing` recovery is modeled in `scripts/lib/v54-idempotency-recovery-policy.js` without changing `Idempotency_Log` headers. The policy uses existing columns (`status`, `result_ref`, `updated_at`, `error_code`, `observacao`) to plan reviewed transitions to `failed` or `completed`. No setup/sync/deploy was run, and no real spreadsheet state was verified for this policy.

VERIFIED in local code on 2026-04-27: deterministic idempotent result references and reviewed recovery execution use the existing schema only. `result_ref` remains empty on the initial `processing` insert and is filled on reviewed completion recovery or normal completion. No new columns were added.

VERIFIED in local code on 2026-04-27: `src/ActionsV54Recovery.js` applies reviewed recovery plans through mocked sheet dependencies only and updates only existing `Idempotency_Log` rows. It uses the existing headers above; no schema columns were added or changed, and no real spreadsheet state was re-verified.

### V54 Telegram Send Observability
VERIFIED in local code on 2026-04-28: `Telegram_Send_Log` is modeled as a non-financial V54 sheet for `V54_PRIMARY` send-attempt observability. Headers are `id_notificacao`, `created_at`, `route`, `chat_id`, `phase`, `status`, `status_code`, `error`, `result_ref`, `id_lancamento`, `idempotency_key`, `text_preview`, `sent_at`. Logging is best-effort and must not affect financial writes or route results. Real spreadsheet presence is UNVERIFIED until reviewed setup/sync is run.

## 3. V53 Legacy Sheets (Reference Only)
The sheets `Dashboard`, `Investimentos`, `Parcelas`, `Lançamentos`, `Orçamento Mensal`, `Compras da Casa`, `Metas de Poupança`, and `Config` belong to the V53 era.
**Do not use these sheets to build new features.** They exist only as a historical reference until V54 is fully deployed and the legacy prototype is safely removed.

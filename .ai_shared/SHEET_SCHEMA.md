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
As of the snapshot generated at `2026-04-26 15:27:14`, the real spreadsheet contains the previous 14 V54 sheets with header rows matching the schema from that time. VERIFIED in code on 2026-04-27: local schema now also includes `Idempotency_Log`, but this has not been verified in the real spreadsheet because setup/sync/deploy were intentionally not run in this phase.
`Config_Categorias`, `Config_Fontes`, `Rendas`, `Cartoes`, `Faturas`, `Pagamentos_Fatura`, `Compras_Parceladas`, `Parcelas_Agenda`, `Orcamento_Futuro_Casa`, `Lancamentos_V54`, `Patrimonio_Ativos`, `Dividas`, `Acertos_Casal`, `Fechamentos_Mensais`.

Clean seed data was applied. Formulas, dropdowns, and full transaction write paths are in development.

### V54 Idempotent Write Path
VERIFIED in local code on 2026-04-27: `scripts/lib/v54-idempotent-write-path.js` plans idempotency before financial inserts using `Idempotency_Log`. It is local/fake-first only and not verified against the real spreadsheet.

## 3. V53 Legacy Sheets (Reference Only)
The sheets `Dashboard`, `Investimentos`, `Parcelas`, `Lançamentos`, `Orçamento Mensal`, `Compras da Casa`, `Metas de Poupança`, and `Config` belong to the V53 era.
**Do not use these sheets to build new features.** They exist only as a historical reference until V54 is fully deployed and the legacy prototype is safely removed.

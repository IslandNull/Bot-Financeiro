# KNOWN_ISSUES.md

## Current Known Issues

- **Val.town webhook proxy dependency:** The Telegram webhook does not support `HTTP 302` redirects out of the box, which is standard for Google Apps Script Web Apps. We currently use `islandd.val.run` (Val.town) as a reverse proxy via `apontarWebhookProValTown()`. If Val.town goes down, the bot will stop receiving Telegram messages.
- **Spreadsheet Sync Security:** The `doGet` endpoint verifies the `token` against `SYNC_SECRET` and is intended to remain read-only for `exportState`. If `SYNC_SECRET` is not set in Script Properties, sync will fail. Known mutating GET actions are blocked in local code.
- **Webhook Negative Tests Pending:** `WEBHOOK_SECRET` and Val.town positive production routing were verified on 2026-04-26, including read-only command, controlled write, and `/desfazer`. Negative production tests for missing secret, invalid secret, and unauthorized chat are still pending.
- **V54 Skeleton Only:** V54 sheets and headers exist in the real spreadsheet, but seed data, dropdowns, formulas, write paths, reports, and migrations are not implemented yet.
- **Formulas Idempotency:** The `setupV53` is generally idempotent but rewriting formulas directly with Apps Script can sometimes be tricky if intermediate ranges change. Use `forceFixAllFormulas()` to safely reset formulas to a consistent state.

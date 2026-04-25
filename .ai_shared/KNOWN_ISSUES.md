# KNOWN_ISSUES.md

## Current Known Issues

- **Val.town webhook proxy dependency:** The Telegram webhook does not support `HTTP 302` redirects out of the box, which is standard for Google Apps Script Web Apps. We currently use `islandd.val.run` (Val.town) as a reverse proxy via `apontarWebhookProValTown()`. If Val.town goes down, the bot will stop receiving Telegram messages.
- **Spreadsheet Sync Security:** The `doGet` endpoint currently verifies the `token` against `SYNC_SECRET`. If `SYNC_SECRET` is not set in Script Properties, sync will fail.
- **Formulas Idempotency:** The `setupV53` is generally idempotent but rewriting formulas directly with Apps Script can sometimes be tricky if intermediate ranges change. Use `forceFixAllFormulas()` to safely reset formulas to a consistent state.

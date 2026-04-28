# V54 Release Checklist

This document defines the strict procedure for deploying and updating V54 in production.

## 0. Safety Constraints
- **V54 is the only active runtime.**
- `V53_CURRENT`, `V54_SHADOW`, and `V54_ROUTING_MODE` have been completely removed.
- `V54_PRIMARY` handles all normal Telegram messages. Legacy commands explicitly return "não suportado".
- **Zero Real-Action Policy in Tests**: Codex and automated tests **must not** call `clasp deploy`, setup, seed, Telegram real, OpenAI real, or SpreadsheetApp real without explicit authorization.

## 1. Pre-Merge Local Checks
Before opening a Pull Request to `main`, run the entire local/fake-first suite:
```bash
npm run test:v54:all
```
All tests must pass. This guarantees domain logic, idempotency, routing mode logic, security locks, and architecture guardrails are fully functional.

## 2. Pull Request to `main`
- Verify CI passes (`.github/workflows/v54-safety.yml`).
- Merge the feature branch into `main`.

## 3. Deploy
Deploy the code to Google Apps Script. 
```bash
# Locally:
npm run push
```
*At this point, the system is running the new V54 code.*

## 4. Post-Deploy Readiness Check
Run the diagnostic function to ensure the environment is ready:
1. Open the Apps Script Editor.
2. Execute `diagnoseV54PrimaryReadiness()`.
3. Check the execution logs. It must return `{ ok: true }`. Ensure `OPENAI_API_KEY`, `TELEGRAM_TOKEN`, `SPREADSHEET_ID`, `WEBHOOK_SECRET` are present, and all required sheets (including `Telegram_Send_Log`) exist.
4. Verify the parser context is successfully reading the sheets.

## 5. Rollback Procedure
If any critical failure occurs in production:
1. Revert the `main` branch to the previous stable commit.
2. Run `npm run push` to deploy the stable version again.
3. (Do not attempt to rollback via Apps Script properties, as routing modes are no longer supported).

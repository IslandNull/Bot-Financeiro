# V54 Release Checklist

This document defines the strict, phased procedure for deploying and activating V54 in production. It is designed to ensure safe rollouts and predictable fallbacks.

## 0. Safety Constraints
- **V54 is disabled by default.**
- Missing, empty, or invalid `V54_ROUTING_MODE` resolves safely to `V53_CURRENT`.
- `V54_SHADOW` keeps V53 as the absolute source of truth and **must not** write through the V54 path.
- `V54_PRIMARY` **must not** fallback-mutate through V53 under any circumstances (fail-closed).
- **Zero Real-Action Policy in Tests**: Codex and automated tests **must not** call `clasp deploy`, setup, seed, Telegram real, OpenAI real, or SpreadsheetApp real.

## 1. Pre-Merge Local Checks
Before opening a Pull Request to `main`, run the entire local/fake-first suite:
```bash
npm run test:v54:all
```
All tests must pass. This guarantees domain logic, idempotency, routing mode logic, security locks, and architecture guardrails are fully functional.

## 2. Pull Request to `main`
- Verify CI passes (`.github/workflows/v54-safety.yml`).
- Merge `feat/v54-production-readiness` into `main`.

## 3. Deploy (Inactive State)
Deploy the code to Google Apps Script. 
**Crucial:** Ensure `V54_ROUTING_MODE` property is either **absent** or explicitly set to `V53_CURRENT`.
```bash
# Locally:
clasp push
clasp deploy
```
*At this point, the system is running the new code but fully routed to the legacy V53 behavior.*

## 4. V54_SHADOW Validation
1. Set the script property in Google Apps Script: `V54_ROUTING_MODE = V54_SHADOW`.
2. Monitor executions and Google Apps Script logs.
3. Validate that user messages continue to be answered and processed by V53.
4. Verify that V54 diagnostics are running in the background without mutating the spreadsheet (shadow mode telemetry).
5. If anomalies occur, immediately remove `V54_ROUTING_MODE` or set it back to `V53_CURRENT`.

## 5. V54_PRIMARY Controlled Validation
1. Once shadow diagnostics are stable, set `V54_ROUTING_MODE = V54_PRIMARY`.
2. The bot will now route inputs exclusively to the V54 architecture.
3. Verify that entries are correctly classified, parsed by OpenAI, and recorded via the idempotent write path.
4. Ensure no double-booking occurs in V53.
5. Monitor `Telegram_Send_Log` for each V54_PRIMARY response attempt and compare `status=failed` rows against Apps Script execution logs. Do not treat a Telegram send failure as a reason to replay the financial write automatically.

## 6. Rollback Procedure
If any critical failure occurs in `V54_PRIMARY` or `V54_SHADOW`:
1. Change the Apps Script property `V54_ROUTING_MODE` to `V53_CURRENT`.
2. The system immediately reverts to the legacy behavior.
3. (Optional) If the codebase itself is fatally flawed, revert the `main` branch to the previous stable commit and `clasp deploy` again.

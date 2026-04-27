# AGENTS.md

## Project
Bot financeiro pessoal em Google Apps Script integrado ao Telegram e Google Sheets.

## Mandatory startup protocol
Before changing code, always inspect the real repository state:
1. Run or request:
   - `git status`
   - `git branch --show-current`
   - `cat package.json`
   - `ls`
2. Read:
   - `docs/V54_DOCS_INDEX.md` (documentation authority map)
   - `.ai_shared/ACTIVE_CONTEXT.md` (current state and next safe step)
   - `.ai_shared/DECISIONS.md` (accepted decisions; do not override)
3. For formula, spreadsheet, setup, seed, Apps Script mutation, or reporting tasks, also read:
   - `.ai_shared/FORMULA_STANDARD.md`
   - `.ai_shared/KNOWN_ISSUES.md`
   - `.ai_shared/SHEET_SCHEMA.md`
4. Do not claim a feature exists unless verified in files or command output.

## Truth policy
Use these labels:
- VERIFIED: confirmed in code, terminal output, or spreadsheet snapshot.
- UNVERIFIED: claimed by a previous agent but not confirmed.
- ASSUMPTION: inferred but not proven.
- TODO: planned work.

Never write “completed”, “implemented”, or “pushed” unless verified.

## Google Sheets formula standard
Read `.ai_shared/FORMULA_STANDARD.md`.

Current verified standard:
- Use `range.setFormula()`
- Use English function names: `SUMIFS`, `IF`, `DATEDIF`, `TODAY`
- Use semicolon `;` as argument separator
- Do not use `setValue()` for formulas unless explicitly re-tested
- Do not use temp-cell `copyTo()` for formulas because it caused `#REF!`

## Sensitive data
Never commit:
- `.env`
- Telegram token
- OpenAI API key
- Spreadsheet ID if considered private
- full financial transaction dumps with real values

## Validation
After code changes:
1. Show changed files.
2. Explain what was verified.
3. Explain what remains unverified.
4. Update `.ai_shared/ACTIVE_CONTEXT.md` if task status changed.
5. Update `.ai_shared/DECISIONS.md` if a technical decision changed.
6. Update `docs/V54_DOCS_INDEX.md` if documentation authority changed.
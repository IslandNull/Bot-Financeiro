# Gemini Project Context

Read and follow the shared project contract:

 @AGENTS.md @.ai_shared/ACTIVE_CONTEXT.md @.ai_shared/FORMULA_STANDARD.md @.ai_shared/HANDOFF_PROTOCOL.md

## Windows Shell Rules

This project runs Gemini CLI on Windows. PowerShell 7 (`pwsh.exe`) is installed locally and should be preferred for command chaining that would fail in Windows PowerShell 5.1.

### Command Chaining

Do not use `&&` or `||` directly in a top-level `powershell.exe` command.

Preferred:

```powershell
pwsh -c "git status --short --branch && git push"
```

Alternative:

```powershell
cmd /c "git status --short --branch && git push"
```

Fallback for Windows PowerShell 5.1:

```powershell
git status --short --branch; if ($LASTEXITCODE -eq 0) { git push }
```

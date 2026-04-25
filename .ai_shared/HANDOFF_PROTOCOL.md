# HANDOFF PROTOCOL

## Resuming work (Context Reset)

When starting a new conversation (context clean), the agent MUST read:
1. `AGENTS.md`
2. `.ai_shared/ACTIVE_CONTEXT.md`

The human does not need to copy-paste historical text. Simply say: "Continue the work based on active context".

## Closing work (Context Save)

Before closing a conversation, the agent MUST:
1. Ensure all changes are empirical, tested, and VERIFIED.
2. Update `.ai_shared/ACTIVE_CONTEXT.md` explicitly defining what was completed and what is the *Next safe action*.
3. Note any architecture/design decision in `.ai_shared/DECISIONS.md`.
4. Prompt the user to commit the changes to Git.

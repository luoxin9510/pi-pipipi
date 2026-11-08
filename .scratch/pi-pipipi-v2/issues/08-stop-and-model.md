# 08: Stop and `/model`

**What to build:** `x` on a running panel row, or `/stop` on its screen, stops a subagent: the script's `Agent` call resolves `status: "failed"`, `error: "stopped by user"`, and the subagent can be resumed later. `/model` on a subagent screen picks a model for that subagent's conversation: applied at once if it runs (rpc `set_model`) and kept for later exchanges.

**Blocked by:** 07

**Status:** closed (done 2026-11-08)

- [x] `x` and `/stop` stop a running subagent via rpc `abort`; the script gets the failed result and keeps running
- [x] A stopped subagent can be resumed by main or by typing to it
- [x] `/model` changes the model of a running subagent and is stored in its meta for later exchanges; the agent file is untouched

## Comments

2026-11-08: done. Stop: `registry.stop(id)` sends rpc `abort` through the handle (false when not running; the runner's handle routes abort through `abortChild`, so the SIGTERM fallback applies) and marks the exchange; `exchange` turns a marked run into `{status:"failed", error:"stopped by user"}` and records "stopped" (usage/turns kept; the script gets a result, not a throw). `x` in the focused panel and `/stop` on the screen call it; on the screen a non-running subagent gets the notice "the subagent is not running" (the panel ignores `x` on such rows). Resume by main or typing works as for any finished subagent (tests). Model: `registry.setModel(id, "provider/id")`: if running, `ChildHandle.setModel` sends rpc `set_model` and waits for pi's response (failure -> reason returned, nothing stored); then the record's `model` is updated and meta written; `talkTo` already passes the record's model to later exchanges. `/model provider/id` or bare `/model` (a list drawn on the screen: up/down/enter/esc). Decision: ctx.ui.select cannot be used, its dialog is hidden under the full-screen overlay (seen in the pty test), so the picker is part of the screen; the list is `ctx.modelRegistry.getAvailable()` and a name not in it is "unknown model", never sent. The agent file is untouched. Tests: test/real/12-stop-and-model.test.ts (3, tool seam; second model = claude-haiku-4-5, asserted from the child's assistant message and the running child's model_change), test/tui/08-stop-model.test.ts (2, pty). Existing "other slash command" tests now use `/nonsense`.

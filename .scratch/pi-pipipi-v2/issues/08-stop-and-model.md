# 08: Stop and `/model`

**What to build:** `x` on a running panel row, or `/stop` on its screen, stops a subagent: the script's `Agent` call resolves `status: "failed"`, `error: "stopped by user"`, and the subagent can be resumed later. `/model` on a subagent screen picks a model for that subagent's conversation: applied at once if it runs (rpc `set_model`) and kept for later exchanges.

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] `x` and `/stop` stop a running subagent via rpc `abort`; the script gets the failed result and keeps running
- [ ] A stopped subagent can be resumed by main or by typing to it
- [ ] `/model` changes the model of a running subagent and is stored in its meta for later exchanges; the agent file is untouched

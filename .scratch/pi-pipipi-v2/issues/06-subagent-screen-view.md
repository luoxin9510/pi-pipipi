# 06: Subagent screen: viewing

**What to build:** Enter on a panel row, or choosing one in `/subagents`, switches the TUI to a full-screen subagent screen: `main › type(description)` and main's state at the top, the transcript drawn with pi's own message components (codemode scripts and nested calls included), growing live while the subagent runs, scrollable. `/main` or the `main` row goes back. Main keeps running throughout; pi's `switchSession` is never used.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] Opening a running subagent while main runs shows its transcript growing; main's run is not interrupted (pty test)
- [ ] Opening a finished subagent shows its full transcript from the session file
- [ ] Scrolling reaches earlier turns
- [ ] `/main` and the `main` row return to main; other slash commands say they are not available here

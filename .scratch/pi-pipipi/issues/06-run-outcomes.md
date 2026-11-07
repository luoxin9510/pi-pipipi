# 06: Run outcomes: partial, failed, abort, long prompts

**What to build:** every way a child run can end maps to the right result: `partial` at `maxTurns`, `failed` with a useful `error`, a thrown `aborted` on abort, and long prompts reach the child.

**Blocked by:** 01

**Status:** closed (done 2026-11-07)

- [x] `maxTurns` reached: the child is stopped and the result is `partial` with the latest output
- [x] Provider error, non-zero exit (stderr tail in `error`), unparseable line, missing session header, no `agent_settled`, missing binary: all `failed` with `isError`
- [x] U+2028 / U+2029 inside a JSON string do not split a record
- [x] Abort stops the child promptly and the call rejects with `aborted`
- [x] A prompt over 100 KB reaches the child through `@<file>`; a prompt starting with `-` is not read as a flag

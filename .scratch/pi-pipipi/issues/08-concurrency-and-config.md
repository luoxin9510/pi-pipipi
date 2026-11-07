# 08: Concurrency limit and config validation

**What to build:** at most `maxConcurrent` (default 20) children run at once per pi process; extra calls queue. Bad settings fail with the key named.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] With `maxConcurrent: 2`, a third concurrent call waits for a free slot
- [ ] A queued call that is aborted leaves the queue
- [ ] Wrong types for `maxConcurrent`, `models`, `toolMap`, `defaultModel`, `piCommand` throw naming the key

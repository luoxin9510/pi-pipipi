# 01 Tracer bullet: Agent tool runs a built-in agent through fake pi

Scaffold the package (package.json, AGENTS.md, tsconfig, node:test setup), `test/fake-pi.mjs`, and the thinnest
end-to-end path: `index.ts` registers `Agent` (codemode exposure) unless `PIPIPI_DEPTH` is set; `execute` loads the
built-in `general-purpose` definition, builds argv, spawns pi, parses the JSONL stream and returns `AgentResult`.
Tests: 10, 15, 18.

Status: done (2026-11-07), updated for Grill 2.

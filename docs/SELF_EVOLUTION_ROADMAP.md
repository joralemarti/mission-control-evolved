# Mission Control Self-Evolution Roadmap

## Phase 1 — Structural Refactor Foundation

### PR-1: Typed OpenClaw Facade
Goal:
Centralize OpenClaw connection, retry logic, and error mapping.

Files:
- src/lib/openclaw/index.ts (new)
- src/lib/openclaw/client.ts (refactor to low-level only)
- src/app/api/openclaw/*
- src/app/api/tasks/[id]/dispatch/route.ts

Success Criteria:
- All OpenClaw calls go through facade.
- Centralized error handling.
- No duplicated connection logic.

---

### PR-2: Entity-Specific DB Modules
Goal:
Remove duplicated SQL logic from API routes.

Files:
- src/lib/db/tasks.ts
- src/lib/db/agents.ts
- src/lib/db/events.ts
- src/lib/db/openclaw-sessions.ts

Success Criteria:
- Minimal SQL inside API routes.
- All DB access centralized per entity.

---

### PR-3: API Validation + Error Helpers
Goal:
Standardize request validation and API error responses.

Files:
- src/lib/api/validation.ts
- src/lib/api/errors.ts

Success Criteria:
- Consistent error response format.
- Reduced validation duplication.

---

## Phase 2 — Self-Evolution Enablement

### PR-4: Evolution Proposals + Telemetry MVP

New Tables:
- evolution_proposals
- task_metrics
- agent_metrics

Goal:
Enable structured improvement proposals and measurable impact tracking.

Success Criteria:
- Ability to log proposals.
- Ability to track task success rate and latency.
- Foundation for automated improvement loop.

# Changelog

All notable changes to Mission Control will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- **Orchestration Observability Dashboard** - New `/ops` route with comprehensive metrics visualization
  - Global metrics endpoint (`/api/ops/overview`) showing success rate, retry rate, avg attempts, and degraded agents
  - Agent health endpoint (`/api/ops/agents`) with success rates, last 20 performance, and degradation status
  - Task outcomes endpoint (`/api/ops/tasks`) displaying recent task attempts with retry indicators
  - Retry distribution endpoint (`/api/ops/retries`) for attempt pattern analysis
  - Real-time dashboard UI with color-coded health indicators
  - Agent health table with performance metrics and status badges
  - Recent task outcomes table with retry visibility
- **Ops Navigation Links** - Added "Ops" button to Header and WorkspaceDashboard for easy access to observability metrics
- **Device Identity Authentication** - Mission Control now connects to OpenClaw with ed25519 device identity, granting `operator.admin` scope for full gateway control (create, update, delete agents)
- **Push Agent to OpenClaw** - New `POST /api/agents/[id]/push` endpoint creates agent on gateway via `agents.create` and uploads SOUL.md via `agents.files.set`. "↑ Push to OpenClaw" button in AgentModal
- **Pull Agents from OpenClaw** - New `GET /api/agents/sync` endpoint syncs agents from gateway sessions into Mission Control with `auto_discovered` flag. "↻ Sync" button in AgentsSidebar
- **Cascade Delete to OpenClaw** - Deleting an agent in Mission Control now also removes it from OpenClaw gateway if it exists
- **Many-to-Many Agent-Workspaces** - New `agent_workspaces` join table (migration 010). Agents can belong to multiple workspaces
- **Workspace Assignment UI** - New "Workspaces" tab in AgentModal with toggle buttons to assign/unassign agents to workspaces
- **Agent Workspace Management API** - New `GET/POST /api/agents/[id]/workspaces` endpoint
- **Free-text OpenClaw Agent Name** - Replaced `<select>` dropdown with free-text `<input>` for `openclaw_agent_name`, allowing creation of new agent names not yet on the gateway
- **Auto-discovered Agent Fields** - New `auto_discovered` and `last_seen_at` columns on agents table (migration 009)
- **OpenClaw Gateway API Reference** - New `OPENCLAW.GATEWAY.md` documenting all 90 methods, 18 events, device auth flow, and connection protocol

### Changed

- **OpenClaw Client** (`src/lib/openclaw/client.ts`) - Generates ed25519 keypair per process, signs handshake payload, sends `device` param on connect
- **Agent CRUD** - Removed runtime agent validation from `POST /api/agents` and `PATCH /api/agents/[id]` (no longer requires agent to pre-exist on gateway)
- **Workspace Stats** - `GET /api/workspaces?stats=true` now uses `agent_workspaces` join table for agent counts
- **Agents List Query** - `GET /api/agents` updated to LEFT JOIN `agent_workspaces`

### Fixed

- **Sync Response Parsing** - Fixed `sessions.list` response to use `result?.sessions` and `session.key` (not `session.sessionKey`)
- **TypeScript Errors** - Added type assertions for OpenClaw API responses
- **Linting Issues** - Fixed prefer-const violations in planning route

---

## [1.2.0] - 2026-02-14

### Added

- **Agent Context in Tasks** - Agent SOUL.md, USER.md, and AGENTS.md content included in task dispatch messages sent to OpenClaw

### Fixed

- Removed unsupported `contextFiles` parameter from `chat.send` - context now embedded directly in message body

---

## [1.1.0] - 2026-02-13

### Added

- **Orchestration Evolution** (PR-4a/4b) - Automatic retry with exponential backoff, scoring system for orchestration quality, graceful degradation, idempotency hardening
- **Runtime Agent Isolation** (PR-5) - `openclaw_agent_name` field maps Mission Control agents to specific OpenClaw agent identities. Each agent runs in its own OpenClaw context
- **Runtime Agent Registry Sync** (PR-6) - Agent dropdown syncs with OpenClaw registry
- **Agent Governance Charter** - New `docs/AGENT_GOVERNANCE_CHARTER.md` defining agent behavior standards

### Fixed

- Runtime agent mapping now uses OpenClaw agent ID instead of identity name

---

## [1.0.1] - 2026-02-04

### Changed

- **Clickable Deliverables** - URL deliverables now have clickable titles and paths that open in new tabs
- Improved visual feedback on deliverable links (hover states, external link icons)

---

## [1.0.0] - 2026-02-04

### 🎉 First Official Release

This is the first stable, tested, and working release of Mission Control.

### Added

- **Task Management**
  - Create, edit, and delete tasks
  - Drag-and-drop Kanban board with 7 status columns
  - Task priority levels (low, normal, high, urgent)
  - Due date support

- **AI Planning Mode**
  - Interactive Q&A planning flow with AI
  - Multiple choice questions with "Other" option for custom answers
  - Automatic spec generation from planning answers
  - Planning session persistence (resume interrupted planning)

- **Agent System**
  - Automatic agent creation based on task requirements
  - Agent avatars with emoji support
  - Agent status tracking (standby, working, idle)
  - Custom SOUL.md personality for each agent

- **Task Dispatch**
  - Automatic dispatch after planning completes
  - Task instructions sent to agent with full context
  - Project directory creation for deliverables
  - Activity logging and deliverable tracking

- **OpenClaw Integration**
  - WebSocket connection to OpenClaw Gateway
  - Session management for planning and agent sessions
  - Chat history synchronization
  - Multi-machine support (local and remote gateways)

- **Dashboard UI**
  - Clean, dark-themed interface
  - Real-time task updates
  - Event feed showing system activity
  - Agent status panel
  - Responsive design

- **API Endpoints**
  - Full REST API for tasks, agents, and events
  - File upload endpoint for deliverables
  - OpenClaw proxy endpoints for session management
  - Activity and deliverable tracking endpoints

### Technical Details

- Built with Next.js 15 (App Router)
- SQLite database with automatic migrations
- Tailwind CSS for styling
- TypeScript throughout
- WebSocket client for OpenClaw communication

---

## [0.2.0] - 2026-02-03

### Added

- Inline agent creation from task assignment dropdown
- Planning mode checkbox for new tasks
- Auto-generated planning questions with visual indicators
- OpenClaw-powered planning with dynamic questions
- TESTING status with rework loop for automated QA workflow

### Changed

- Cleaner task cards with better spacing and visual hierarchy
- Removed unused Chat feature

### Fixed

- Session key format and response polling
- Transcript reading using session key as object key
- Status field included when creating tasks
- Planning endpoint syncs missing responses from OpenClaw
- Dispatch uses `chat.send` with correct sessionKey format
- Planning messages use OpenClaw API instead of local filesystem
- Added `idempotencyKey` to `chat.send` in dispatch

### Security

- Removed personal info and hardcoded IPs from codebase

---

## [0.1.0] - 2026-01-30

### Added

- Initial Mission Control dashboard
- OpenClaw Gateway integration with WebSocket authentication
- Automated task dispatch and completion workflow
- Real-time integration with SSE, activities, deliverables, and sub-agent tracking
- Automated browser testing for REVIEW tasks
- File download API for cross-machine file access
- Production-ready security and configuration refactor

---

## Future Plans

- [ ] Persistent device identity (file or env var) across restarts
- [ ] Pull agent files (SOUL.md) from OpenClaw on sync
- [ ] Bulk push/pull all agents
- [ ] Agent performance metrics and scoring
- [ ] Task dependencies
- [ ] Team collaboration
- [ ] Webhook integrations
- [ ] Cron job management from Mission Control
- [ ] Chat/session management UI
- [ ] Model selection per agent

---

[Unreleased]: https://github.com/joralemarti/mission-control-evolved/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/joralemarti/mission-control-evolved/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/joralemarti/mission-control-evolved/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/joralemarti/mission-control-evolved/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/joralemarti/mission-control-evolved/releases/tag/v1.0.0
[0.2.0]: https://github.com/joralemarti/mission-control-evolved/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/joralemarti/mission-control-evolved/releases/tag/v0.1.0

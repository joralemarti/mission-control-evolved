# OpenClaw Gateway API Reference

Reference extracted from OpenClaw source code (`src/gateway/`) and verified against live gateway (90 methods, 18 events).

## Connection

To get full access (all 90 methods), connect with **device identity** + `scopes: ['operator.admin']`.
Without device identity, scopes are cleared and admin methods (agents.create, agents.update, agents.delete, config.*, etc.) are unavailable.

```javascript
// 1. Generate ed25519 key pair
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

// 2. Build signed payload
const payload = ['v1', deviceId, clientId, mode, 'operator', 'operator.admin', signedAtMs, token].join('|');
const signature = base64UrlEncode(crypto.sign(null, Buffer.from(payload), privateKey));

// 3. Connect with device
params: {
  minProtocol: 3, maxProtocol: 3,
  client: { id: 'gateway-client', version: '1.0.0', platform: 'node', mode: 'ui' },
  scopes: ['operator.admin'],
  auth: { token },
  device: { id: deviceId, publicKey: publicKeyBase64, signature, signedAt: signedAtMs }
}
```

All methods are called via WebSocket RPC using JSON frames:
```json
{ "type": "req", "id": "<uuid>", "method": "<method>", "params": { ... } }
```
Response:
```json
{ "type": "res", "id": "<uuid>", "ok": true, "payload": { ... } }
```

### Quick Reference — Methods Most Useful for Mission Control

| Method | Scope | Description |
|--------|-------|-------------|
| `agents.list` | read | List all agents |
| `agents.create` | admin | Create new agent |
| `agents.update` | admin | Update agent config |
| `agents.delete` | admin | Delete agent |
| `agents.files.get` | read | Read agent file (SOUL.md, etc.) |
| `agents.files.set` | write | Write agent file |
| `chat.send` | write | Send message to agent session |
| `chat.history` | read | Get session chat history |
| `sessions.list` | read | List all sessions |
| `sessions.patch` | admin | Change model, thinking level, etc. |
| `sessions.reset` | admin | Clear session transcript |
| `models.list` | read | List available AI models |
| `cron.add` | admin | Schedule recurring tasks |
| `cron.list` | read | List cron jobs |
| `agent` | write | Invoke agent directly |
| `send` | write | Send message to channel recipient |
| `channels.status` | read | Get messaging channels status |

---

## Agents

### `agents.list`
List all registered agents.
- **Params:** `{}` (none)
- **Returns:** `{ defaultId, mainKey, scope: "per-sender"|"global", agents: [{ id, name?, identity?: { name?, theme?, emoji?, avatar?, avatarUrl? } }] }`

### `agents.create`
Create a new agent with workspace.
- **Params:**
  - `name` (string, required)
  - `workspace` (string, required) — e.g. `~/.openclaw/workspace-myagent`
  - `emoji` (string, optional)
  - `avatar` (string, optional)
- **Returns:** `{ ok: true, agentId, name, workspace }`

### `agents.update`
Update an existing agent.
- **Params:**
  - `agentId` (string, required)
  - `name` (string, optional)
  - `workspace` (string, optional)
  - `model` (string, optional)
  - `avatar` (string, optional)
- **Returns:** `{ ok: true, agentId }`

### `agents.delete`
Delete an agent.
- **Params:**
  - `agentId` (string, required)
  - `deleteFiles` (boolean, optional) — also remove workspace files
- **Returns:** `{ ok: true, agentId, removedBindings }`

### `agents.files.list`
List all bootstrap/memory files for an agent.
- **Params:**
  - `agentId` (string, required)
- **Returns:** `{ agentId, workspace, files: [{ name, path, missing, size?, updatedAtMs?, content? }] }`
- **Known files:** AGENTS.md, SOUL.md, TOOLS.md, IDENTITY.md, USER.md, HEARTBEAT.md, BOOTSTRAP.md, MEMORY.md, MEMORY.yaml

### `agents.files.get`
Get a specific agent file.
- **Params:**
  - `agentId` (string, required)
  - `name` (string, required) — e.g. `SOUL.md`
- **Returns:** `{ agentId, workspace, file: { name, path, missing, size?, updatedAtMs?, content? } }`

### `agents.files.set`
Create or update an agent file.
- **Params:**
  - `agentId` (string, required)
  - `name` (string, required)
  - `content` (string, required)
- **Returns:** `{ ok: true, agentId, workspace, file: { name, path, missing, size?, updatedAtMs? } }`

---

## Sessions

### `sessions.list`
List sessions with optional filters.
- **Params:**
  - `limit` (integer, optional)
  - `activeMinutes` (integer, optional)
  - `includeGlobal` (boolean, optional)
  - `includeUnknown` (boolean, optional)
  - `includeDerivedTitles` (boolean, optional) — reads first 8KB of transcript
  - `includeLastMessage` (boolean, optional) — reads last 16KB of transcript
  - `label` (string, optional)
  - `spawnedBy` (string, optional)
  - `agentId` (string, optional)
  - `search` (string, optional)

### `sessions.preview`
Preview session transcripts.
- **Params:**
  - `keys` (string[], required, min 1)
  - `limit` (integer, optional)
  - `maxChars` (integer, optional, min 20)

### `sessions.patch`
Update session settings.
- **Params:**
  - `key` (string, required)
  - `label` (string|null, optional)
  - `thinkingLevel` (string|null, optional)
  - `verboseLevel` (string|null, optional)
  - `reasoningLevel` (string|null, optional)
  - `responseUsage` ("off"|"tokens"|"full"|"on"|null, optional)
  - `elevatedLevel` (string|null, optional)
  - `execHost` (string|null, optional)
  - `execSecurity` (string|null, optional)
  - `execAsk` (string|null, optional)
  - `execNode` (string|null, optional)
  - `model` (string|null, optional)
  - `spawnedBy` (string|null, optional)
  - `sendPolicy` ("allow"|"deny"|null, optional)
  - `groupActivation` ("mention"|"always"|null, optional)

### `sessions.reset`
Reset a session (clear transcript).
- **Params:**
  - `key` (string, required)

### `sessions.delete`
Delete a session.
- **Params:**
  - `key` (string, required)
  - `deleteTranscript` (boolean, optional)

### `sessions.compact`
Compact a session transcript.
- **Params:**
  - `key` (string, required)
  - `maxLines` (integer, optional)

---

## Chat (WebSocket-native)

### `chat.send`
Send a message and trigger AI response.
- **Params:**
  - `sessionKey` (string, required)
  - `message` (string, required)
  - `thinking` (string, optional)
  - `deliver` (boolean, optional)
  - `attachments` (array, optional)
  - `timeoutMs` (integer, optional)
  - `idempotencyKey` (string, required)

### `chat.history`
Get chat history for a session.
- **Params:**
  - `sessionKey` (string, required)
  - `limit` (integer, optional, 1-1000)

### `chat.abort`
Abort a running chat response.
- **Params:**
  - `sessionKey` (string, required)
  - `runId` (string, optional)

---

## Agent (invoke agent directly)

### `agent`
Send a message to an agent and trigger a run.
- **Params:**
  - `message` (string, required)
  - `agentId` (string, optional)
  - `to` (string, optional)
  - `replyTo` (string, optional)
  - `sessionId` (string, optional)
  - `sessionKey` (string, optional)
  - `thinking` (string, optional)
  - `deliver` (boolean, optional)
  - `attachments` (array, optional)
  - `channel` (string, optional)
  - `replyChannel` (string, optional)
  - `accountId` (string, optional)
  - `replyAccountId` (string, optional)
  - `threadId` (string, optional)
  - `groupId` (string, optional)
  - `groupChannel` (string, optional)
  - `groupSpace` (string, optional)
  - `timeout` (integer, optional)
  - `lane` (string, optional)
  - `extraSystemPrompt` (string, optional)
  - `inputProvenance` (object, optional) — `{ kind, sourceSessionKey?, sourceChannel?, sourceTool? }`
  - `idempotencyKey` (string, required)
  - `label` (string, optional)
  - `spawnedBy` (string, optional)

### `agent.identity.get`
Get agent identity info.
- **Params:**
  - `agentId` (string, optional)
  - `sessionKey` (string, optional)
- **Returns:** `{ agentId, name?, avatar?, emoji? }`

### `agent.wait`
Wait for an agent run to complete.
- **Params:**
  - `runId` (string, required)
  - `timeoutMs` (integer, optional)

---

## Send (deliver messages to channels)

### `send`
Send a message to a channel recipient.
- **Params:**
  - `to` (string, required)
  - `message` (string, optional)
  - `mediaUrl` (string, optional)
  - `mediaUrls` (string[], optional)
  - `gifPlayback` (boolean, optional)
  - `channel` (string, optional)
  - `accountId` (string, optional)
  - `sessionKey` (string, optional)
  - `idempotencyKey` (string, required)

### `wake`
Wake the agent.
- **Params:**
  - `mode` ("now"|"next-heartbeat", required)
  - `text` (string, required)

### `last-heartbeat` / `set-heartbeats`
Heartbeat management (no documented params schema).

---

## Models

### `models.list`
List available AI models.
- **Params:** `{}` (none)
- **Returns:** `{ models: [{ id, name, provider, contextWindow?, reasoning? }] }`

---

## Config

### `config.get`
Get current configuration.
- **Params:** `{}` (none)

### `config.set`
Replace entire configuration.
- **Params:**
  - `raw` (string, required) — full config content
  - `baseHash` (string, optional) — for conflict detection

### `config.apply`
Apply configuration changes.
- **Params:**
  - `raw` (string, required)
  - `baseHash` (string, optional)
  - `sessionKey` (string, optional)
  - `note` (string, optional)
  - `restartDelayMs` (integer, optional)

### `config.patch`
Patch configuration.
- **Params:**
  - `raw` (string, required)
  - `baseHash` (string, optional)
  - `sessionKey` (string, optional)
  - `note` (string, optional)
  - `restartDelayMs` (integer, optional)

### `config.schema`
Get configuration JSON schema with UI hints.
- **Params:** `{}` (none)
- **Returns:** `{ schema, uiHints, version, generatedAt }`

---

## Channels

### `channels.status`
Get status of all messaging channels.
- **Params:**
  - `probe` (boolean, optional)
  - `timeoutMs` (integer, optional)
- **Returns:** `{ ts, channelOrder, channelLabels, channels, channelAccounts, channelDefaultAccountId }`

### `channels.logout`
Logout from a channel.
- **Params:**
  - `channel` (string, required)
  - `accountId` (string, optional)

---

## Cron

### `cron.list`
List cron jobs.
- **Params:**
  - `includeDisabled` (boolean, optional)

### `cron.status`
Get cron system status.
- **Params:** `{}` (none)

### `cron.add`
Add a new cron job.
- **Params:**
  - `name` (string, required)
  - `agentId` (string|null, optional)
  - `description` (string, optional)
  - `enabled` (boolean, optional)
  - `deleteAfterRun` (boolean, optional)
  - `schedule` (object, required) — one of:
    - `{ kind: "at", at: string }`
    - `{ kind: "every", everyMs: integer, anchorMs?: integer }`
    - `{ kind: "cron", expr: string, tz?: string }`
  - `sessionTarget` ("main"|"isolated", required)
  - `wakeMode` ("next-heartbeat"|"now", required)
  - `payload` (object, required) — one of:
    - `{ kind: "systemEvent", text: string }`
    - `{ kind: "agentTurn", message: string, model?, thinking?, timeoutSeconds?, deliver?, channel?, to? }`
  - `delivery` (object, optional) — `{ mode: "none"|"announce", channel?, to?, bestEffort? }`

### `cron.update`
Update a cron job.
- **Params:**
  - `id` or `jobId` (string, required)
  - `patch` (object, required) — partial fields from cron.add

### `cron.remove`
Remove a cron job.
- **Params:**
  - `id` or `jobId` (string, required)

### `cron.run`
Manually trigger a cron job.
- **Params:**
  - `id` or `jobId` (string, required)
  - `mode` ("due"|"force", optional)

### `cron.runs`
Get run history for a cron job.
- **Params:**
  - `id` or `jobId` (string, required)
  - `limit` (integer, optional, 1-5000)

---

## Nodes (remote execution nodes)

### `node.pair.request`
Request to pair a new node.
- **Params:**
  - `nodeId` (string, required)
  - `displayName` (string, optional)
  - `platform` (string, optional)
  - `version` (string, optional)
  - `coreVersion` (string, optional)
  - `uiVersion` (string, optional)
  - `deviceFamily` (string, optional)
  - `modelIdentifier` (string, optional)
  - `caps` (string[], optional)
  - `commands` (string[], optional)
  - `remoteIp` (string, optional)
  - `silent` (boolean, optional)

### `node.pair.list`
List pending pair requests.
- **Params:** `{}` (none)

### `node.pair.approve`
Approve a pair request.
- **Params:**
  - `requestId` (string, required)

### `node.pair.reject`
Reject a pair request.
- **Params:**
  - `requestId` (string, required)

### `node.pair.verify`
Verify a paired node.
- **Params:**
  - `nodeId` (string, required)
  - `token` (string, required)

### `node.rename`
Rename a node.
- **Params:**
  - `nodeId` (string, required)
  - `displayName` (string, required)

### `node.list`
List all nodes.
- **Params:** `{}` (none)

### `node.describe`
Get node details.
- **Params:**
  - `nodeId` (string, required)

### `node.invoke`
Invoke a command on a remote node.
- **Params:**
  - `nodeId` (string, required)
  - `command` (string, required)
  - `params` (any, optional)
  - `timeoutMs` (integer, optional)
  - `idempotencyKey` (string, required)

### `node.invoke.result`
Return result from a node invocation.
- **Params:**
  - `id` (string, required)
  - `nodeId` (string, required)
  - `ok` (boolean, required)
  - `payload` (any, optional)
  - `payloadJSON` (string, optional)
  - `error` (object, optional) — `{ code?, message? }`

### `node.event`
Emit an event from a node.
- **Params:**
  - `event` (string, required)
  - `payload` (any, optional)
  - `payloadJSON` (string, optional)

---

## Devices

### `device.pair.list`
List pending device pair requests.
- **Params:** `{}` (none)

### `device.pair.approve`
Approve a device pair request.
- **Params:**
  - `requestId` (string, required)

### `device.pair.reject`
Reject a device pair request.
- **Params:**
  - `requestId` (string, required)

### `device.token.rotate`
Rotate a device token.
- **Params:**
  - `deviceId` (string, required)
  - `role` (string, required)
  - `scopes` (string[], optional)

### `device.token.revoke`
Revoke a device token.
- **Params:**
  - `deviceId` (string, required)
  - `role` (string, required)

---

## Exec Approvals

### `exec.approvals.get`
Get exec approval settings.
- **Params:** `{}` (none)

### `exec.approvals.set`
Set exec approval settings.
- **Params:**
  - `file` (object, required) — full approval config
  - `baseHash` (string, optional)

### `exec.approvals.node.get`
Get exec approvals for a specific node.
- **Params:**
  - `nodeId` (string, required)

### `exec.approvals.node.set`
Set exec approvals for a specific node.
- **Params:**
  - `nodeId` (string, required)
  - `file` (object, required)
  - `baseHash` (string, optional)

### `exec.approval.request`
Request approval for a command execution.
- **Params:**
  - `id` (string, optional)
  - `command` (string, required)
  - `cwd` (string|null, optional)
  - `host` (string|null, optional)
  - `security` (string|null, optional)
  - `ask` (string|null, optional)
  - `agentId` (string|null, optional)
  - `resolvedPath` (string|null, optional)
  - `sessionKey` (string|null, optional)
  - `timeoutMs` (integer, optional)
  - `twoPhase` (boolean, optional)

### `exec.approval.resolve`
Resolve an approval request.
- **Params:**
  - `id` (string, required)
  - `decision` (string, required)

### `exec.approval.waitDecision`
Wait for an approval decision (no documented params schema).

---

## Wizard (setup wizard)

### `wizard.start`
Start a setup wizard session.
- **Params:**
  - `mode` ("local"|"remote", optional)
  - `workspace` (string, optional)
- **Returns:** `{ sessionId, done, step?, status?, error? }`

### `wizard.next`
Advance wizard to next step.
- **Params:**
  - `sessionId` (string, required)
  - `answer` (object, optional) — `{ stepId, value? }`
- **Returns:** `{ done, step?, status?, error? }`

### `wizard.cancel`
Cancel a wizard session.
- **Params:**
  - `sessionId` (string, required)

### `wizard.status`
Get wizard session status.
- **Params:**
  - `sessionId` (string, required)
- **Returns:** `{ status: "running"|"done"|"cancelled"|"error", error? }`

---

## Skills

### `skills.status`
Get installed skills status.
- **Params:**
  - `agentId` (string, optional)

### `skills.bins`
List available skill binaries.
- **Params:** `{}` (none)
- **Returns:** `{ bins: string[] }`

### `skills.install`
Install a skill.
- **Params:**
  - `name` (string, required)
  - `installId` (string, required)
  - `timeoutMs` (integer, optional, min 1000)

### `skills.update`
Update skill settings.
- **Params:**
  - `skillKey` (string, required)
  - `enabled` (boolean, optional)
  - `apiKey` (string, optional)
  - `env` (Record<string, string>, optional)

---

## Talk (voice)

### `talk.config`
Get talk/voice configuration.
- **Params:**
  - `includeSecrets` (boolean, optional)
- **Returns:** `{ config: { talk?: { voiceId?, voiceAliases?, modelId?, outputFormat?, apiKey?, interruptOnSpeech? }, session?: { mainKey? }, ui?: { seamColor? } } }`

### `talk.mode`
Enable/disable talk mode.
- **Params:**
  - `enabled` (boolean, required)
  - `phase` (string, optional)

---

## TTS (Text-to-Speech)

### `tts.status` / `tts.providers` / `tts.enable` / `tts.disable` / `tts.convert` / `tts.setProvider`
TTS management methods (schemas not in protocol directory — handled inline).

---

## Voice Wake

### `voicewake.get`
Get voice wake settings.

### `voicewake.set`
Set voice wake settings.

---

## Logs

### `logs.tail`
Tail gateway logs.
- **Params:**
  - `cursor` (integer, optional)
  - `limit` (integer, optional, 1-5000)
  - `maxBytes` (integer, optional, 1-1000000)
- **Returns:** `{ file, cursor, size, lines: string[], truncated?, reset? }`

---

## Browser

### `browser.request`
Request browser automation (schemas handled inline).

---

## System

### `health`
Health check.

### `status`
Get gateway status snapshot.

### `system-presence`
System presence update.

### `system-event`
System event.

### `update.run`
Run gateway update.
- **Params:**
  - `sessionKey` (string, optional)
  - `note` (string, optional)
  - `restartDelayMs` (integer, optional)
  - `timeoutMs` (integer, optional)

---

## Connection

### `connect` (handshake)
Initial connection handshake (sent automatically).
- **Params:**
  - `minProtocol` (integer, required)
  - `maxProtocol` (integer, required)
  - `client` (object, required) — `{ id, displayName?, version, platform, deviceFamily?, modelIdentifier?, mode, instanceId? }`
  - `caps` (string[], optional)
  - `commands` (string[], optional)
  - `permissions` (Record<string, boolean>, optional)
  - `pathEnv` (string, optional)
  - `role` (string, optional)
  - `scopes` (string[], optional) — requires device identity to be preserved
  - `device` (object, optional) — `{ id, publicKey, signature, signedAt, nonce? }`
  - `auth` (object, optional) — `{ token?, password? }`
  - `locale` (string, optional)
  - `userAgent` (string, optional)

**Valid client IDs:** `webchat-ui`, `openclaw-control-ui`, `webchat`, `cli`, `gateway-client`, `openclaw-macos`, `openclaw-ios`, `openclaw-android`, `node-host`, `test`, `fingerprint`, `openclaw-probe`

**Valid client modes:** `webchat`, `cli`, `ui`, `backend`, `node`, `probe`, `test`

---

## Web Login

### `web.login.start`
Start web login flow.
- **Params:**
  - `force` (boolean, optional)
  - `timeoutMs` (integer, optional)
  - `verbose` (boolean, optional)
  - `accountId` (string, optional)

### `web.login.wait`
Wait for web login completion.
- **Params:**
  - `timeoutMs` (integer, optional)
  - `accountId` (string, optional)

---

## Gateway Events (server → client)

| Event | Description |
|-------|-------------|
| `connect.challenge` | Auth challenge during handshake |
| `agent` | Agent run events (delta, final, aborted, error) |
| `chat` | Chat stream events |
| `presence` | Presence updates |
| `tick` | Periodic tick |
| `talk.mode` | Talk mode changed |
| `shutdown` | Gateway shutting down |
| `health` | Health status update |
| `heartbeat` | Heartbeat event |
| `cron` | Cron job event |
| `node.pair.requested` | Node pair request received |
| `node.pair.resolved` | Node pair request resolved |
| `node.invoke.request` | Node invocation request |
| `device.pair.requested` | Device pair request received |
| `device.pair.resolved` | Device pair request resolved |
| `voicewake.changed` | Voice wake settings changed |
| `exec.approval.requested` | Exec approval requested |
| `exec.approval.resolved` | Exec approval resolved |

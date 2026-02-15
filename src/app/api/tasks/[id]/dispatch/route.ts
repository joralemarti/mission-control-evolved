import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, run } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { broadcast } from '@/lib/events';
import { getProjectsPath, getMissionControlUrl } from '@/lib/config';
import type { Task, Agent, OpenClawSession } from '@/lib/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/tasks/[id]/dispatch
 * 
 * Dispatches a task to its assigned agent's OpenClaw session.
 * Creates session if needed, sends task details to agent.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Get task with agent info
    const task = queryOne<Task & { assigned_agent_name?: string }>(
      `SELECT t.*, a.name as assigned_agent_name, a.is_master
       FROM tasks t
       LEFT JOIN agents a ON t.assigned_agent_id = a.id
       WHERE t.id = ?`,
      [id]
    );

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (!task.assigned_agent_id) {
      return NextResponse.json(
        { error: 'Task has no assigned agent' },
        { status: 400 }
      );
    }

    // Get agent details
    const agent = queryOne<Agent>(
      'SELECT * FROM agents WHERE id = ?',
      [task.assigned_agent_id]
    );

    if (!agent) {
      return NextResponse.json({ error: 'Assigned agent not found' }, { status: 404 });
    }

    type AgentStatsRow = {
      total_success: number;
      total_failure: number;
      is_degraded: number;
    };

    const getSelectionScore = (agentId: string): number => {
      const stats = queryOne<AgentStatsRow>(
        'SELECT total_success, total_failure, is_degraded FROM agent_stats WHERE agent_id = ?',
        [agentId]
      );
      const totalAttempts = (stats?.total_success || 0) + (stats?.total_failure || 0);
      const successRate = totalAttempts > 0 ? (stats?.total_success || 0) / totalAttempts : 0;
      const degradationPenalty = stats?.is_degraded ? 0.2 : 0;
      return successRate - degradationPenalty;
    };

    // Determine attempt number (max 2 attempts)
    const attemptsSoFar = queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM task_attempts WHERE task_id = ?',
      [id]
    )?.count || 0;
    const attemptNumber = attemptsSoFar + 1;

    if (attemptNumber > 2) {
      return NextResponse.json(
        { error: 'Max dispatch attempts reached for this task' },
        { status: 409 }
      );
    }

    const previousAgents = queryAll<{ agent_id: string }>(
      'SELECT DISTINCT agent_id FROM task_attempts WHERE task_id = ?',
      [id]
    ).map(row => row.agent_id);

    let selectedAgent = agent;
    let selectionScore = getSelectionScore(agent.id);

    if (attemptNumber > 1) {
      const availableAgents = queryAll<Agent>(
        'SELECT * FROM agents WHERE status != ?',
        ['offline']
      );
      const alternativeAgents = availableAgents.filter(a => !previousAgents.includes(a.id));
      const candidatePool = alternativeAgents.length > 0 ? alternativeAgents : availableAgents;

      if (candidatePool.length > 0) {
        const scored = candidatePool.map(candidate => ({
          agent: candidate,
          score: getSelectionScore(candidate.id)
        })).sort((a, b) => b.score - a.score);

        selectedAgent = scored[0].agent;
        selectionScore = scored[0].score;
      }
    }

    // Update assignment if a different agent is selected for retry
    if (selectedAgent.id !== agent.id) {
      run(
        'UPDATE tasks SET assigned_agent_id = ?, updated_at = ? WHERE id = ?',
        [selectedAgent.id, new Date().toISOString(), id]
      );

      run(
        `INSERT INTO events (id, type, agent_id, task_id, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
        ,
        [
          uuidv4(),
          'task_assigned',
          selectedAgent.id,
          task.id,
          `Task "${task.title}" reassigned to ${selectedAgent.name} for retry`,
          new Date().toISOString()
        ]
      );
    }

    // Connect to OpenClaw Gateway
    const client = getOpenClawClient();
    if (!client.isConnected()) {
      try {
        await client.connect();
      } catch (err) {
        console.error('Failed to connect to OpenClaw Gateway:', err);
        return NextResponse.json(
          { error: 'Failed to connect to OpenClaw Gateway' },
          { status: 503 }
        );
      }
    }

    // Get or create OpenClaw session for this agent
    let session = queryOne<OpenClawSession>(
      'SELECT * FROM openclaw_sessions WHERE agent_id = ? AND status = ?',
      [selectedAgent.id, 'active']
    );

    const now = new Date().toISOString();

    if (!session) {
      // Create session record
      const sessionId = uuidv4();
      const openclawSessionId = `mission-control-${selectedAgent.name.toLowerCase().replace(/\s+/g, '-')}`;
      
      run(
        `INSERT INTO openclaw_sessions (id, agent_id, openclaw_session_id, channel, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [sessionId, selectedAgent.id, openclawSessionId, 'mission-control', 'active', now, now]
      );

      session = queryOne<OpenClawSession>(
        'SELECT * FROM openclaw_sessions WHERE id = ?',
        [sessionId]
      );

      // Log session creation
      run(
        `INSERT INTO events (id, type, agent_id, message, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), 'agent_status_changed', selectedAgent.id, `${selectedAgent.name} session created`, now]
      );
    }

    if (!session) {
      return NextResponse.json(
        { error: 'Failed to create agent session' },
        { status: 500 }
      );
    }

    // Build task message for agent
    const priorityEmoji = {
      low: '🔵',
      normal: '⚪',
      high: '🟡',
      urgent: '🔴'
    }[task.priority] || '⚪';

    // Get project path for deliverables
    const projectsPath = getProjectsPath();
    const projectDir = task.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const taskProjectDir = `${projectsPath}/${projectDir}`;
    const missionControlUrl = getMissionControlUrl();

    // Build agent context from configuration files
    let agentContext = '';
    if (selectedAgent.soul_md) {
      agentContext += `--- AGENT SOUL ---\n${selectedAgent.soul_md}\n\n`;
    }
    if (selectedAgent.user_md) {
      agentContext += `--- USER CONTEXT ---\n${selectedAgent.user_md}\n\n`;
    }
    if (selectedAgent.agents_md) {
      agentContext += `--- AGENTS DIRECTORY ---\n${selectedAgent.agents_md}\n\n`;
    }

    const taskMessage = `${agentContext}${priorityEmoji} **NEW TASK ASSIGNED**

**Title:** ${task.title}
${task.description ? `**Description:** ${task.description}\n` : ''}
**Priority:** ${task.priority.toUpperCase()}
${task.due_date ? `**Due:** ${task.due_date}\n` : ''}
**Task ID:** ${task.id}

**OUTPUT DIRECTORY:** ${taskProjectDir}
Create this directory and save all deliverables there.

**IMPORTANT:** After completing work, you MUST call these APIs:
1. Log activity: POST ${missionControlUrl}/api/tasks/${task.id}/activities
   Body: {"activity_type": "completed", "message": "Description of what was done"}
2. Register deliverable: POST ${missionControlUrl}/api/tasks/${task.id}/deliverables
   Body: {"deliverable_type": "file", "title": "File name", "path": "${taskProjectDir}/filename.html"}
3. Update status: PATCH ${missionControlUrl}/api/tasks/${task.id}
   Body: {"status": "review"}

When complete, reply with:
\`TASK_COMPLETE: [brief summary of what you did]\`

If you need help or clarification, ask me (Charlie).`;

    // Record dispatch attempt before sending
    const attemptInsert = run(
      `INSERT OR IGNORE INTO task_attempts (id, task_id, attempt_number, agent_id, auto_retry, selection_score, dispatched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        task.id,
        attemptNumber,
        selectedAgent.id,
        attemptNumber > 1 ? 1 : 0,
        selectionScore,
        now
      ]
    );

    if (attemptInsert.changes === 0) {
      return NextResponse.json(
        { error: 'Dispatch attempt already recorded' },
        { status: 409 }
      );
    }

    // Send message to agent's session using chat.send
    try {
      // Use sessionKey for routing to the agent's session
      const runtimeAgent = selectedAgent.openclaw_agent_name || 'main';
      // Format: agent:{openclaw_agent_name}:{openclaw_session_id}
      const sessionKey = `agent:${runtimeAgent}:${session.openclaw_session_id}`;
      
      await client.call('chat.send', {
        sessionKey,
        message: taskMessage,
        idempotencyKey: `dispatch-${task.id}-${Date.now()}`
      });

      // Update task status to in_progress
      run(
        'UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?',
        ['in_progress', now, id]
      );

      // Broadcast task update
      const updatedTask = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
      if (updatedTask) {
        broadcast({
          type: 'task_updated',
          payload: updatedTask,
        });
      }

      // Update agent status to working
      run(
        'UPDATE agents SET status = ?, updated_at = ? WHERE id = ?',
        ['working', now, selectedAgent.id]
      );

      // Log dispatch event
      run(
        `INSERT INTO events (id, type, agent_id, task_id, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          'task_dispatched',
          selectedAgent.id,
          task.id,
          `Task "${task.title}" dispatched to ${selectedAgent.name}`,
          now
        ]
      );

      return NextResponse.json({
        success: true,
        task_id: task.id,
        agent_id: selectedAgent.id,
        session_id: session.openclaw_session_id,
        message: 'Task dispatched to agent'
      });
    } catch (err) {
      console.error('Failed to send message to agent:', err);
      return NextResponse.json(
        { error: `Failed to send task to agent: ${err instanceof Error ? err.message : 'Unknown error'}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Failed to dispatch task:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to dispatch task' },
      { status: 500 }
    );
  }
}

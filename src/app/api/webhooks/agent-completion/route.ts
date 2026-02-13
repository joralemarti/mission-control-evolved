import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, run, transaction } from '@/lib/db';
import { getMissionControlUrl } from '@/lib/config';
import type { Task, OpenClawSession } from '@/lib/types';

/**
 * POST /api/webhooks/agent-completion
 * 
 * Receives completion notifications from agents.
 * Expected payload:
 * {
 *   "session_id": "mission-control-engineering",
 *   "message": "TASK_COMPLETE: Built the authentication system"
 * }
 * 
 * Or can be called with task_id directly:
 * {
 *   "task_id": "uuid",
 *   "summary": "Completed the task successfully"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const now = new Date().toISOString();

    let task: Task & { assigned_agent_name?: string } | undefined;
    let agentId: string | undefined;
    let summary = body.summary || 'Task finished';
    const rawOutcome = body.outcome ? String(body.outcome).toLowerCase() : undefined;
    const normalizedOutcome = rawOutcome && rawOutcome !== 'success' ? 'failed' : 'success';
    const error = body.error ? String(body.error) : null;

    // Handle direct task_id completion
    if (body.task_id) {
      task = queryOne<Task & { assigned_agent_name?: string }>(
        `SELECT t.*, a.name as assigned_agent_name
         FROM tasks t
         LEFT JOIN agents a ON t.assigned_agent_id = a.id
         WHERE t.id = ?`,
        [body.task_id]
      );

      if (!task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }

      agentId = task.assigned_agent_id;
      if (!agentId) {
        return NextResponse.json({ error: 'Task has no assigned agent' }, { status: 400 });
      }
    }

    // Handle session-based completion (from message parsing)
    if (!task && body.session_id && body.message) {
      // Parse TASK_COMPLETE message
      const completionMatch = body.message.match(/TASK_COMPLETE:\s*(.+)/i);
      if (!completionMatch) {
        return NextResponse.json(
          { error: 'Invalid completion message format. Expected: TASK_COMPLETE: [summary]' },
          { status: 400 }
        );
      }

      summary = completionMatch[1].trim();

      // Find agent by session
      const session = queryOne<OpenClawSession>(
        'SELECT * FROM openclaw_sessions WHERE openclaw_session_id = ? AND status = ?',
        [body.session_id, 'active']
      );

      if (!session) {
        return NextResponse.json(
          { error: 'Session not found or inactive' },
          { status: 404 }
        );
      }

      agentId = session.agent_id;

      // Find active task for this agent
      task = queryOne<Task & { assigned_agent_name?: string }>(
        `SELECT t.*, a.name as assigned_agent_name
         FROM tasks t
         LEFT JOIN agents a ON t.assigned_agent_id = a.id
         WHERE t.assigned_agent_id = ? 
           AND t.status IN ('assigned', 'in_progress')
         ORDER BY t.updated_at DESC
         LIMIT 1`,
        [session.agent_id]
      );

      if (!task) {
        return NextResponse.json(
          { error: 'No active task found for this agent' },
          { status: 404 }
        );
      }
    }

    if (!task || !agentId) {
      return NextResponse.json(
        { error: 'Invalid payload. Provide either task_id or session_id + message' },
        { status: 400 }
      );
    }

    let shouldRetry = false;
    let finalStatus: string | null = null;
    let alreadyCompleted = false;

    const pendingAttempt = queryOne<{ id: string; attempt_number: number }>(
      `SELECT id, attempt_number
       FROM task_attempts
       WHERE task_id = ? AND agent_id = ? AND completed_at IS NULL
       ORDER BY attempt_number DESC
       LIMIT 1`,
      [task!.id, agentId]
    );

    if (!pendingAttempt) {
      const completedAttempt = queryOne<{ id: string; outcome: string | null }>(
        `SELECT id, outcome
         FROM task_attempts
         WHERE task_id = ? AND agent_id = ? AND completed_at IS NOT NULL
         ORDER BY completed_at DESC
         LIMIT 1`,
        [task!.id, agentId]
      );

      if (completedAttempt) {
        return NextResponse.json({
          success: true,
          task_id: task.id,
          agent_id: agentId,
          outcome: completedAttempt.outcome,
          idempotent: true
        });
      }
    }

    transaction(() => {
      // Update attempt record
      let attempt = pendingAttempt;

      if (!attempt) {
        const existingAttempts = queryOne<{ count: number }>(
          'SELECT COUNT(*) as count FROM task_attempts WHERE task_id = ?',
          [task!.id]
        )?.count || 0;
        const fallbackAttemptNumber = existingAttempts + 1;
        const fallbackId = uuidv4();

        run(
          `INSERT OR IGNORE INTO task_attempts (id, task_id, attempt_number, agent_id, auto_retry, selection_score, dispatched_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            fallbackId,
            task!.id,
            fallbackAttemptNumber,
            agentId,
            fallbackAttemptNumber > 1 ? 1 : 0,
            null,
            now
          ]
        );

        attempt = { id: fallbackId, attempt_number: fallbackAttemptNumber };
      }

      const updateAttempt = run(
        `UPDATE task_attempts
         SET completed_at = ?, outcome = ?, error = ?
         WHERE id = ? AND completed_at IS NULL`,
        [now, normalizedOutcome, error, attempt.id]
      );

      if (updateAttempt.changes === 0) {
        alreadyCompleted = true;
        return;
      }

      // Update agent stats
      run(
        `INSERT OR IGNORE INTO agent_stats (
          agent_id, total_success, total_failure, is_degraded, updated_at
        ) VALUES (?, 0, 0, 0, ?)`,
        [agentId, now]
      );

      const stats = queryOne<{
        total_success: number;
        total_failure: number;
        is_degraded: number;
      }>(
        'SELECT total_success, total_failure, is_degraded FROM agent_stats WHERE agent_id = ?',
        [agentId]
      );

      let totalSuccess = stats?.total_success || 0;
      let totalFailure = stats?.total_failure || 0;

      if (normalizedOutcome === 'success') {
        totalSuccess += 1;
      } else {
        totalFailure += 1;
      }

      const recentOutcomes = queryAll<{ outcome: string | null }>(
        `SELECT outcome
         FROM task_attempts
         WHERE agent_id = ? AND completed_at IS NOT NULL
         ORDER BY completed_at DESC
         LIMIT 20`,
        [agentId]
      );

      const recentSuccesses = recentOutcomes.filter(row => row.outcome === 'success').length;
      const last20Total = recentOutcomes.length;
      const last20SuccessRate = last20Total > 0 ? recentSuccesses / last20Total : 0;

      const totalAttempts = totalSuccess + totalFailure;

      let isDegraded = stats?.is_degraded || 0;
      if (totalAttempts >= 10 && last20SuccessRate < 0.6) {
        isDegraded = 1;
      } else if (last20SuccessRate > 0.7) {
        isDegraded = 0;
      }

      run(
        `UPDATE agent_stats
         SET total_success = ?, total_failure = ?, is_degraded = ?, updated_at = ?
         WHERE agent_id = ?`,
        [totalSuccess, totalFailure, isDegraded, now, agentId]
      );

      const attemptCount = queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM task_attempts WHERE task_id = ?',
        [task!.id]
      )?.count || 0;

      if (normalizedOutcome === 'failed' && attemptCount < 2) {
        shouldRetry = true;
      } else {
        finalStatus = normalizedOutcome === 'success' ? 'testing' : 'review';

        run(
          `INSERT OR IGNORE INTO task_outcomes (id, task_id, final_status, attempts, last_agent_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [uuidv4(), task!.id, normalizedOutcome, attemptCount, agentId, now]
        );

        if (finalStatus && task!.status !== 'review' && task!.status !== 'done') {
          run(
            'UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?',
            [finalStatus, now, task!.id]
          );
        }

        const eventType = normalizedOutcome === 'success' ? 'task_completed' : 'task_status_changed';
        const eventMessage = normalizedOutcome === 'success'
          ? `${task!.assigned_agent_name || 'Agent'} completed: ${summary}`
          : `${task!.assigned_agent_name || 'Agent'} failed after ${attemptCount} attempts`;

        run(
          `INSERT INTO events (id, type, agent_id, task_id, message, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [uuidv4(), eventType, agentId, task!.id, eventMessage, now]
        );
      }

      // Set agent back to standby
      run(
        'UPDATE agents SET status = ?, updated_at = ? WHERE id = ?',
        ['standby', now, agentId]
      );
    });

    if (alreadyCompleted) {
      return NextResponse.json({
        success: true,
        task_id: task.id,
        agent_id: agentId,
        outcome: normalizedOutcome,
        idempotent: true
      });
    }

    if (shouldRetry) {
      const missionControlUrl = getMissionControlUrl();
      fetch(`${missionControlUrl}/api/tasks/${task.id}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }).catch(err => {
        console.error('Auto-dispatch retry failed:', err);
      });
    }

    return NextResponse.json({
      success: true,
      task_id: task.id,
      agent_id: agentId,
      summary,
      outcome: normalizedOutcome,
      should_retry: shouldRetry,
      new_status: finalStatus
    });
  } catch (error) {
    console.error('Agent completion webhook error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process completion' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/webhooks/agent-completion
 * 
 * Returns webhook status and recent completions
 */
export async function GET() {
  try {
    const recentCompletions = queryAll(
      `SELECT e.*, a.name as agent_name, t.title as task_title
       FROM events e
       LEFT JOIN agents a ON e.agent_id = a.id
       LEFT JOIN tasks t ON e.task_id = t.id
       WHERE e.type = 'task_completed'
       ORDER BY e.created_at DESC
       LIMIT 10`
    );

    return NextResponse.json({
      status: 'active',
      recent_completions: recentCompletions,
      endpoint: '/api/webhooks/agent-completion'
    });
  } catch (error) {
    console.error('Failed to fetch completion status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch status' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { queryAll } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const attempts = queryAll<{
      attempt_number: number;
      agent_id: string;
      auto_retry: number;
      selection_score: number | null;
      outcome: string | null;
      error: string | null;
      dispatched_at: string;
      completed_at: string | null;
    }>(
      `SELECT attempt_number, agent_id, auto_retry, selection_score, outcome, error, dispatched_at, completed_at
       FROM task_attempts
       WHERE task_id = ?
       ORDER BY attempt_number ASC`,
      [id]
    );

    const mapped = attempts.map(attempt => {
      let duration: number | null = null;
      if (attempt.completed_at) {
        duration = (new Date(attempt.completed_at).getTime() - new Date(attempt.dispatched_at).getTime()) / 1000;
      }

      return {
        attempt_number: attempt.attempt_number,
        agent_id: attempt.agent_id,
        auto_retry: attempt.auto_retry,
        selection_score: attempt.selection_score,
        outcome: attempt.outcome,
        error: attempt.error,
        duration
      };
    });

    return NextResponse.json({ attempts: mapped });
  } catch (error) {
    console.error('Failed to fetch task attempts:', error);
    return NextResponse.json({ error: 'Failed to fetch task attempts' }, { status: 500 });
  }
}

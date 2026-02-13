import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const stats = queryOne<{
      total_success: number;
      total_failure: number;
      is_degraded: number;
    }>(
      `SELECT total_success, total_failure, is_degraded
       FROM agent_stats
       WHERE agent_id = ?`,
      [id]
    );

    const totalSuccess = stats?.total_success || 0;
    const totalFailure = stats?.total_failure || 0;
    const totalAttempts = totalSuccess + totalFailure;

    const recentOutcomes = queryOne<{ success_count: number; total: number }>(
      `SELECT SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) as success_count,
              COUNT(*) as total
       FROM (
         SELECT outcome
         FROM task_attempts
         WHERE agent_id = ? AND completed_at IS NOT NULL
         ORDER BY completed_at DESC
         LIMIT 20
       )`,
      [id]
    );

    const last20SuccessCount = recentOutcomes?.success_count || 0;
    const last20Total = recentOutcomes?.total || 0;

    return NextResponse.json({
      total_success: totalSuccess,
      total_failure: totalFailure,
      success_rate: totalAttempts > 0 ? totalSuccess / totalAttempts : 0,
      last_20_success_rate: last20Total > 0 ? last20SuccessCount / last20Total : 0,
      is_degraded: stats?.is_degraded || 0
    });
  } catch (error) {
    console.error('Failed to fetch agent stats:', error);
    return NextResponse.json({ error: 'Failed to fetch agent stats' }, { status: 500 });
  }
}

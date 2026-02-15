import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();

    // Total tasks and outcomes
    const totals = db.prepare(`
      SELECT 
        COUNT(DISTINCT task_id) as total_tasks,
        COUNT(*) as total_outcomes
      FROM task_outcomes
    `).get() as { total_tasks: number; total_outcomes: number };

    // Success rate
    const successStats = db.prepare(`
      SELECT 
        COUNT(CASE WHEN final_status = 'completed' THEN 1 END) as successes,
        COUNT(*) as total
      FROM task_outcomes
    `).get() as { successes: number; total: number };

    const success_rate = successStats.total > 0 
      ? successStats.successes / successStats.total 
      : 0;

    // Average attempts per task
    const attemptsStats = db.prepare(`
      SELECT AVG(attempts) as avg_attempts
      FROM task_outcomes
    `).get() as { avg_attempts: number };

    // Retry rate (tasks with > 1 attempt)
    const retryStats = db.prepare(`
      SELECT 
        COUNT(CASE WHEN attempts > 1 THEN 1 END) as retry_count,
        COUNT(*) as total
      FROM task_outcomes
    `).get() as { retry_count: number; total: number };

    const retry_rate = retryStats.total > 0 
      ? retryStats.retry_count / retryStats.total 
      : 0;

    // Degraded agents count
    const degradedStats = db.prepare(`
      SELECT COUNT(*) as degraded_count
      FROM agent_stats
      WHERE is_degraded = 1
    `).get() as { degraded_count: number };

    return NextResponse.json({
      total_tasks: totals.total_tasks,
      total_outcomes: totals.total_outcomes,
      success_rate: Math.round(success_rate * 100) / 100,
      avg_attempts_per_task: Math.round((attemptsStats.avg_attempts || 0) * 100) / 100,
      retry_rate: Math.round(retry_rate * 100) / 100,
      degraded_agents: degradedStats.degraded_count
    });
  } catch (error) {
    console.error('Failed to fetch ops overview:', error);
    return NextResponse.json(
      { error: 'Failed to fetch metrics' },
      { status: 500 }
    );
  }
}

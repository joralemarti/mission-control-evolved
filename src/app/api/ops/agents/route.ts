import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();

    const agents = db.prepare(`
      SELECT 
        a.id as agent_id,
        a.name,
        COALESCE(s.total_success, 0) as total_success,
        COALESCE(s.total_failure, 0) as total_failure,
        COALESCE(s.is_degraded, 0) as is_degraded,
        (COALESCE(s.total_success, 0) + COALESCE(s.total_failure, 0)) as total_attempts
      FROM agents a
      LEFT JOIN agent_stats s ON a.id = s.agent_id
      WHERE a.auto_discovered = 0
      ORDER BY total_success DESC
    `).all() as Array<{
      agent_id: string;
      name: string;
      total_success: number;
      total_failure: number;
      is_degraded: number;
      total_attempts: number;
    }>;

    // Calculate success rates and last 20 for each agent
    const enrichedAgents = agents.map(agent => {
      const success_rate = agent.total_attempts > 0
        ? agent.total_success / agent.total_attempts
        : 0;

      // Get last 20 attempts for this agent
      const last20 = db.prepare(`
        SELECT outcome
        FROM task_attempts
        WHERE agent_id = ?
        ORDER BY dispatched_at DESC
        LIMIT 20
      `).all(agent.agent_id) as Array<{ outcome: string | null }>;

      const last20Successes = last20.filter(a => a.outcome === 'success').length;
      const last_20_success_rate = last20.length > 0
        ? last20Successes / last20.length
        : 0;

      return {
        agent_id: agent.agent_id,
        name: agent.name,
        total_success: agent.total_success,
        total_failure: agent.total_failure,
        success_rate: Math.round(success_rate * 100) / 100,
        last_20_success_rate: Math.round(last_20_success_rate * 100) / 100,
        is_degraded: agent.is_degraded,
        total_attempts: agent.total_attempts
      };
    });

    return NextResponse.json(enrichedAgents);
  } catch (error) {
    console.error('Failed to fetch agent health:', error);
    return NextResponse.json(
      { error: 'Failed to fetch agent health' },
      { status: 500 }
    );
  }
}

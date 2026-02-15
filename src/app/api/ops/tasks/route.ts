import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const db = getDb();

    const tasks = db.prepare(`
      SELECT 
        o.task_id,
        o.final_status,
        o.attempts,
        o.last_agent_id,
        o.created_at as completed_at,
        a.name as agent_name,
        t.title as task_title
      FROM task_outcomes o
      LEFT JOIN agents a ON o.last_agent_id = a.id
      LEFT JOIN tasks t ON o.task_id = t.id
      ORDER BY o.created_at DESC
      LIMIT ?
    `).all(limit) as Array<{
      task_id: string;
      final_status: string;
      attempts: number;
      last_agent_id: string;
      completed_at: string;
      agent_name: string | null;
      task_title: string | null;
    }>;

    const enrichedTasks = tasks.map(task => ({
      task_id: task.task_id,
      task_title: task.task_title,
      final_status: task.final_status,
      attempts: task.attempts,
      last_agent_id: task.last_agent_id,
      agent_name: task.agent_name,
      retry_used: task.attempts > 1,
      completed_at: task.completed_at
    }));

    return NextResponse.json(enrichedTasks);
  } catch (error) {
    console.error('Failed to fetch task attempts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch task attempts' },
      { status: 500 }
    );
  }
}

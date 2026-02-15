import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();

    const distribution = db.prepare(`
      SELECT 
        attempts,
        COUNT(*) as count
      FROM task_outcomes
      GROUP BY attempts
      ORDER BY attempts
    `).all() as Array<{ attempts: number; count: number }>;

    const result: Record<string, number> = {};
    
    distribution.forEach(({ attempts, count }) => {
      if (attempts === 1) {
        result.single_attempt = count;
      } else if (attempts === 2) {
        result.double_attempt = count;
      } else {
        result[`${attempts}_attempts`] = count;
      }
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to fetch retry distribution:', error);
    return NextResponse.json(
      { error: 'Failed to fetch retry distribution' },
      { status: 500 }
    );
  }
}

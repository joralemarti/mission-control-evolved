import { NextRequest, NextResponse } from 'next/server';
import { queryAll, run } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Get workspaces for an agent
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const workspaces = queryAll(
      `SELECT w.* FROM workspaces w
       JOIN agent_workspaces aw ON w.id = aw.workspace_id
       WHERE aw.agent_id = ?`,
      [id]
    );
    return NextResponse.json(workspaces);
  } catch (error) {
    console.error('Failed to fetch agent workspaces:', error);
    return NextResponse.json({ error: 'Failed to fetch workspaces' }, { status: 500 });
  }
}

// Assign/unassign agent to workspace
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { workspaceId, action } = await request.json();

    if (action === 'assign') {
      run(
        `INSERT OR IGNORE INTO agent_workspaces (agent_id, workspace_id) VALUES (?, ?)`,
        [id, workspaceId]
      );
    } else if (action === 'unassign') {
      run(
        `DELETE FROM agent_workspaces WHERE agent_id = ? AND workspace_id = ?`,
        [id, workspaceId]
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update agent workspace:', error);
    return NextResponse.json({ error: 'Failed to update workspace' }, { status: 500 });
  }
}

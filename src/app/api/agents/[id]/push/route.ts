import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import type { Agent } from '@/lib/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const agent = queryOne('SELECT * FROM agents WHERE id = ?', [id]) as Agent | undefined;
    
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const client = getOpenClawClient();
    await client.connect();

    const agentName = agent.openclaw_agent_name || agent.name.toLowerCase().replace(/\s+/g, '-');

    // 1. Check if agent exists
    const listResult = await client.call('agents.list', {}) as any;
    const existingAgents = listResult?.agents || [];
    const agentExists = existingAgents.some((a: any) => a.id === agentName);

    let agentId = agentName;

    // 2. Create agent if it doesn't exist
    if (!agentExists) {
      const createResult = await client.call('agents.create', {
        name: agentName,
        workspace: `~/.openclaw/workspace-${agentName}`,
        emoji: agent.avatar_emoji,
      }) as any;
      
      agentId = createResult?.agentId || agentName;
    }

    // 3. Update agent files
    const files = [
      { name: 'SOUL.md', content: agent.soul_md || `# ${agent.name}\n\n${agent.description || ''}` },
      { name: 'USER.md', content: agent.user_md || '' },
      { name: 'AGENTS.md', content: agent.agents_md || '' },
    ];

    for (const file of files) {
      if (file.content) {
        await client.call('agents.files.set', {
          agentId,
          name: file.name,
          content: file.content
        });
      }
    }

    await client.disconnect();

    return NextResponse.json({ 
      success: true, 
      agentId,
      created: !agentExists,
      message: agentExists 
        ? `Agent ${agent.name} updated in OpenClaw`
        : `Agent ${agent.name} created in OpenClaw as '${agentId}'`
    });
  } catch (error: any) {
    console.error('[Push to OpenClaw] Error:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to push agent to OpenClaw' 
    }, { status: 500 });
  }
}

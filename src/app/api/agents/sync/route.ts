import { NextResponse } from 'next/server';
import { queryAll, run, queryOne } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { v4 as uuidv4 } from 'uuid';
import type { Agent } from '@/lib/types';

const agentDefaults: Record<string, { emoji: string; role: string }> = {
  main: { emoji: '🤖', role: 'Main Agent' },
  designer: { emoji: '🎨', role: 'Designer' },
  developer: { emoji: '💻', role: 'Developer' },
  researcher: { emoji: '🔬', role: 'Researcher' },
  writer: { emoji: '✍️', role: 'Writer' },
};

async function getAgentFile(client: any, agentId: string, fileName: string) {
  try {
    const result = await client.call('agents.files.get', { agentId, name: fileName });
    return result?.file?.content || null;
  } catch {
    return null;
  }
}

export async function POST() {
  try {
    const client = getOpenClawClient();
    await client.connect();
    
    const result = await client.call('sessions.list', {}) as any;
    const sessions = result?.sessions || [];
    
    const agentNames = new Set<string>();
    for (const session of sessions) {
      const match = session.key?.match(/^agent:([^:]+):/);
      if (match) agentNames.add(match[1]);
    }
    
    const now = new Date().toISOString();
    let created = 0;
    let updated = 0;
    
    // Get all workspaces to assign auto-discovered agents
    const workspaces = queryAll('SELECT id FROM workspaces', []) as { id: string }[];
    
    for (const agentName of Array.from(agentNames)) {
      const existing = queryOne('SELECT * FROM agents WHERE openclaw_agent_name = ?', [agentName]) as Agent | undefined;
      
      if (existing) {
        run(
          `UPDATE agents SET last_seen_at = ?, status = ?, updated_at = ? WHERE id = ?`,
          [now, 'standby', now, existing.id]
        );
        updated++;
      } else {
        const defaults = agentDefaults[agentName] || { emoji: '🤖', role: 'Agent' };
        
        const [soul_md, user_md, agents_md] = await Promise.all([
          getAgentFile(client, agentName, 'SOUL.md'),
          getAgentFile(client, agentName, 'USER.md'),
          getAgentFile(client, agentName, 'AGENTS.md'),
        ]);
        
        const agentId = uuidv4();
        
        run(
          `INSERT INTO agents (
            id, name, role, openclaw_agent_name, avatar_emoji, description,
            soul_md, user_md, agents_md, auto_discovered, last_seen_at, 
            status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            agentId,
            agentName.charAt(0).toUpperCase() + agentName.slice(1),
            defaults.role,
            agentName,
            defaults.emoji,
            `Auto-discovered ${defaults.role.toLowerCase()}`,
            soul_md,
            user_md,
            agents_md,
            1,
            now,
            'standby',
            now,
            now
          ]
        );
        
        // Assign to all workspaces
        for (const workspace of workspaces) {
          run(
            `INSERT OR IGNORE INTO agent_workspaces (agent_id, workspace_id) VALUES (?, ?)`,
            [agentId, workspace.id]
          );
        }
        
        created++;
      }
    }
    
    await client.disconnect();
    
    return NextResponse.json({ 
      success: true, 
      created, 
      updated,
      total: agentNames.size 
    });
  } catch (error: any) {
    console.error('[Agent Sync] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}

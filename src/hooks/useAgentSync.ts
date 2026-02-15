import { useState } from 'react';

export function useAgentSync() {
  const [isSyncing, setIsSyncing] = useState(false);

  const syncAgents = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/agents/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        console.log(`[Agent Sync] Created: ${data.created}, Updated: ${data.updated}`);
        return data;
      }
      throw new Error(data.error || 'Sync failed');
    } catch (error) {
      console.error('[Agent Sync] Failed:', error);
      throw error;
    } finally {
      setIsSyncing(false);
    }
  };

  return { syncAgents, isSyncing };
}

'use client';

import { useEffect, useState } from 'react';
import { X, Save, Trash2 } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import type { Agent, AgentStatus } from '@/lib/types';

interface AgentModalProps {
  agent?: Agent;
  onClose: () => void;
  workspaceId?: string;
  onAgentCreated?: (agentId: string) => void;
}

const EMOJI_OPTIONS = ['🤖', '🦞', '💻', '🔍', '✍️', '🎨', '📊', '🧠', '⚡', '🚀', '🎯', '🔧'];

export function AgentModal({ agent, onClose, workspaceId, onAgentCreated }: AgentModalProps) {
  const { addAgent, updateAgent, agents } = useMissionControl();
  const [activeTab, setActiveTab] = useState<'info' | 'soul' | 'user' | 'agents' | 'workspaces'>('info');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [runtimeAgents, setRuntimeAgents] = useState<Array<{ id: string; display_name?: string }>>([]);
  const [loadingRuntime, setLoadingRuntime] = useState(false);
  const [workspaces, setWorkspaces] = useState<Array<{ id: string; name: string; assigned: boolean }>>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [isPushing, setIsPushing] = useState(false);

  const [form, setForm] = useState({
    name: agent?.name || '',
    role: agent?.role || '',
    description: agent?.description || '',
    avatar_emoji: agent?.avatar_emoji || '🤖',
    status: agent?.status || 'standby' as AgentStatus,
    is_master: agent?.is_master || false,
    soul_md: agent?.soul_md || '',
    user_md: agent?.user_md || '',
    agents_md: agent?.agents_md || '',
    openclaw_agent_name: agent?.openclaw_agent_name || 'main',
  });

  useEffect(() => {
    const loadAgents = async () => {
      try {
        setLoadingRuntime(true);
        const res = await fetch('/api/openclaw/agents');
        if (!res.ok) {
          throw new Error('Failed to load runtime agents');
        }
        const data = await res.json();
        setRuntimeAgents(data as Array<{ id: string; display_name?: string }>);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingRuntime(false);
      }
    };

    loadAgents();
  }, []);

  useEffect(() => {
    const loadWorkspaces = async () => {
      try {
        setLoadingWorkspaces(true);
        const allRes = await fetch('/api/workspaces');
        const allWorkspaces = await allRes.json();
        
        if (agent) {
          // Editing existing agent - load assignments
          const assignedRes = await fetch(`/api/agents/${agent.id}/workspaces`);
          const assignedWorkspaces = await assignedRes.json();
          const assignedIds = new Set(assignedWorkspaces.map((w: any) => w.id));
          
          setWorkspaces(allWorkspaces.map((w: any) => ({
            ...w,
            assigned: assignedIds.has(w.id)
          })));
        } else {
          // Creating new agent - all unassigned
          setWorkspaces(allWorkspaces.map((w: any) => ({
            ...w,
            assigned: false
          })));
        }
      } catch (err) {
        console.error('Failed to load workspaces:', err);
      } finally {
        setLoadingWorkspaces(false);
      }
    };

    if (activeTab === 'workspaces') {
      loadWorkspaces();
    }
  }, [agent, activeTab]);

  const toggleWorkspace = async (workspaceId: string) => {
    if (!agent) {
      // For new agents, just toggle locally
      setWorkspaces(workspaces.map(w => 
        w.id === workspaceId ? { ...w, assigned: !w.assigned } : w
      ));
      return;
    }
    
    const workspace = workspaces.find(w => w.id === workspaceId);
    if (!workspace) return;
    
    try {
      await fetch(`/api/agents/${agent.id}/workspaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          action: workspace.assigned ? 'unassign' : 'assign'
        })
      });
      
      setWorkspaces(workspaces.map(w => 
        w.id === workspaceId ? { ...w, assigned: !w.assigned } : w
      ));
    } catch (err) {
      console.error('Failed to toggle workspace:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const url = agent ? `/api/agents/${agent.id}` : '/api/agents';
      const method = agent ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          workspace_id: workspaceId || agent?.workspace_id || 'default',
        }),
      });

      if (res.ok) {
        const savedAgent = await res.json();
        
        // Assign workspaces for new agents
        if (!agent) {
          const assignedWorkspaceIds = workspaces.filter(w => w.assigned).map(w => w.id);
          for (const wsId of assignedWorkspaceIds) {
            await fetch(`/api/agents/${savedAgent.id}/workspaces`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ workspaceId: wsId, action: 'assign' })
            });
          }
        }
        
        if (agent) {
          updateAgent(savedAgent);
        } else {
          addAgent(savedAgent);
          // Notify parent if callback provided (e.g., for inline agent creation)
          if (onAgentCreated) {
            onAgentCreated(savedAgent.id);
          }
        }
        onClose();
      }
    } catch (error) {
      console.error('Failed to save agent:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!agent || !confirm(`Delete ${agent.name}?`)) return;

    try {
      const res = await fetch(`/api/agents/${agent.id}`, { method: 'DELETE' });
      if (res.ok) {
        // Remove from store
        useMissionControl.setState((state) => ({
          agents: state.agents.filter((a) => a.id !== agent.id),
          selectedAgent: state.selectedAgent?.id === agent.id ? null : state.selectedAgent,
        }));
        onClose();
      }
    } catch (error) {
      console.error('Failed to delete agent:', error);
    }
  };

  const handlePushToOpenClaw = async () => {
    if (!agent) return;
    
    try {
      setIsPushing(true);
      const res = await fetch(`/api/agents/${agent.id}/push`, { method: 'POST' });
      const data = await res.json();
      
      if (res.ok) {
        alert(`✓ ${data.message}`);
      } else {
        alert(`✗ Failed: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to push to OpenClaw:', error);
      alert('✗ Failed to push agent to OpenClaw');
    } finally {
      setIsPushing(false);
    }
  };

  const tabs = [
    { id: 'info', label: 'Info' },
    { id: 'soul', label: 'SOUL.md' },
    { id: 'user', label: 'USER.md' },
    { id: 'agents', label: 'AGENTS.md' },
    { id: 'workspaces', label: 'Workspaces' },
  ] as const;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-mc-bg-secondary border border-mc-border rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-mc-border">
          <h2 className="text-lg font-semibold">
            {agent ? `Edit ${agent.name}` : 'Create New Agent'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-mc-bg-tertiary rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-mc-border">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-mc-accent text-mc-accent'
                  : 'border-transparent text-mc-text-secondary hover:text-mc-text'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4">
          {activeTab === 'info' && (
            <div className="space-y-4">
              {/* Avatar Selection */}
              <div>
                <label className="block text-sm font-medium mb-2">Avatar</label>
                <div className="flex flex-wrap gap-2">
                  {EMOJI_OPTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setForm({ ...form, avatar_emoji: emoji })}
                      className={`text-2xl p-2 rounded hover:bg-mc-bg-tertiary ${
                        form.avatar_emoji === emoji
                          ? 'bg-mc-accent/20 ring-2 ring-mc-accent'
                          : ''
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
                  placeholder="Agent name"
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm font-medium mb-1">Role</label>
                <input
                  type="text"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  required
                  className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
                  placeholder="e.g., Code & Automation"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent resize-none"
                  placeholder="What does this agent do?"
                />
              </div>

              {/* Runtime Agent */}
              <div className="mt-4">
                <label className="block text-sm font-medium mb-1">
                  OpenClaw Runtime Agent
                </label>

                <input
                  type="text"
                  value={form.openclaw_agent_name || ''}
                  onChange={(e) =>
                    setForm({ ...form, openclaw_agent_name: e.target.value })
                  }
                  placeholder="Enter agent name (e.g., main, custom-agent)"
                  className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
                />

                {loadingRuntime ? (
                  <p className="text-xs text-mc-text-secondary mt-1">
                    Loading runtime agents...
                  </p>
                ) : runtimeAgents.length > 0 && (
                  <div className="mt-1 text-xs text-mc-text-secondary">
                    Existing: {runtimeAgents.map(a => a.id).join(', ')}
                  </div>
                )}
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as AgentStatus })}
                  className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
                >
                  <option value="standby">Standby</option>
                  <option value="working">Working</option>
                  <option value="offline">Offline</option>
                </select>
              </div>

              {/* Master Toggle */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_master"
                  checked={form.is_master}
                  onChange={(e) => setForm({ ...form, is_master: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="is_master" className="text-sm">
                  Master Orchestrator (can coordinate other agents)
                </label>
              </div>
            </div>
          )}

          {activeTab === 'soul' && (
            <div>
              <label className="block text-sm font-medium mb-2">
                SOUL.md - Agent Personality & Identity
              </label>
              <textarea
                value={form.soul_md}
                onChange={(e) => setForm({ ...form, soul_md: e.target.value })}
                rows={15}
                className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-mc-accent resize-none"
                placeholder="# Agent Name&#10;&#10;Define this agent's personality, values, and communication style..."
              />
            </div>
          )}

          {activeTab === 'user' && (
            <div>
              <label className="block text-sm font-medium mb-2">
                USER.md - Context About the Human
              </label>
              <textarea
                value={form.user_md}
                onChange={(e) => setForm({ ...form, user_md: e.target.value })}
                rows={15}
                className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-mc-accent resize-none"
                placeholder="# User Context&#10;&#10;Information about the human this agent works with..."
              />
            </div>
          )}

          {activeTab === 'agents' && (
            <div>
              <label className="block text-sm font-medium mb-2">
                AGENTS.md - Team Awareness
              </label>
              <textarea
                value={form.agents_md}
                onChange={(e) => setForm({ ...form, agents_md: e.target.value })}
                rows={15}
                className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-mc-accent resize-none"
                placeholder="# Team Roster&#10;&#10;Information about other agents this agent works with..."
              />
            </div>
          )}

          {activeTab === 'workspaces' && (
            <div>
              <label className="block text-sm font-medium mb-2">
                Workspace Assignments
              </label>
              {loadingWorkspaces ? (
                <div className="text-center py-8 text-mc-text-secondary">Loading...</div>
              ) : (
                <div className="space-y-2">
                  {workspaces.map((workspace) => (
                    <div
                      key={workspace.id}
                      className="flex items-center justify-between p-3 bg-mc-bg border border-mc-border rounded hover:border-mc-accent transition-colors"
                    >
                      <span className="text-sm">{workspace.name}</span>
                      <button
                        onClick={() => toggleWorkspace(workspace.id)}
                        className={`px-3 py-1 text-xs rounded ${
                          workspace.assigned
                            ? 'bg-mc-accent text-mc-bg'
                            : 'bg-mc-bg-tertiary text-mc-text-secondary'
                        }`}
                      >
                        {workspace.assigned ? 'Assigned' : 'Assign'}
                      </button>
                    </div>
                  ))}
                  {workspaces.length === 0 && (
                    <div className="text-center py-8 text-mc-text-secondary">
                      No workspaces available
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-mc-border">
          <div className="flex gap-2">
            {agent && (
              <>
                <button
                  type="button"
                  onClick={handlePushToOpenClaw}
                  disabled={isPushing}
                  className="flex items-center gap-2 px-3 py-2 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded text-sm disabled:opacity-50"
                >
                  {isPushing ? 'Pushing...' : '↑ Push to OpenClaw'}
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="flex items-center gap-2 px-3 py-2 text-mc-accent-red hover:bg-mc-accent-red/10 rounded text-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-mc-text-secondary hover:text-mc-text"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex items-center gap-2 px-4 py-2 bg-mc-accent text-mc-bg rounded text-sm font-medium hover:bg-mc-accent/90 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

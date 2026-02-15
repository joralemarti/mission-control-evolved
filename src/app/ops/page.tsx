'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Activity, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';

interface GlobalMetrics {
  total_tasks: number;
  total_outcomes: number;
  success_rate: number;
  avg_attempts_per_task: number;
  retry_rate: number;
  degraded_agents: number;
}

interface AgentHealth {
  agent_id: string;
  name: string;
  total_success: number;
  total_failure: number;
  success_rate: number;
  last_20_success_rate: number;
  is_degraded: number;
  total_attempts: number;
}

interface TaskOutcome {
  task_id: string;
  task_title: string | null;
  final_status: string;
  attempts: number;
  last_agent_id: string;
  agent_name: string | null;
  retry_used: boolean;
  completed_at: string;
}

export default function OpsPage() {
  const [metrics, setMetrics] = useState<GlobalMetrics | null>(null);
  const [agents, setAgents] = useState<AgentHealth[]>([]);
  const [tasks, setTasks] = useState<TaskOutcome[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [metricsRes, agentsRes, tasksRes] = await Promise.all([
          fetch('/api/ops/overview'),
          fetch('/api/ops/agents'),
          fetch('/api/ops/tasks?limit=50')
        ]);

        if (metricsRes.ok) setMetrics(await metricsRes.json());
        if (agentsRes.ok) setAgents(await agentsRes.json());
        if (tasksRes.ok) setTasks(await tasksRes.json());
      } catch (error) {
        console.error('Failed to load ops data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-mc-bg text-mc-text p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">Loading...</div>
        </div>
      </div>
    );
  }

  const getHealthColor = (rate: number) => {
    if (rate >= 0.8) return 'text-green-400';
    if (rate >= 0.6) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getStatusColor = (status: string) => {
    if (status === 'completed') return 'text-green-400';
    if (status === 'failed') return 'text-red-400';
    return 'text-gray-400';
  };

  return (
    <div className="min-h-screen bg-mc-bg text-mc-text p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link 
            href="/"
            className="inline-flex items-center gap-2 text-mc-text-dim hover:text-mc-text mb-4"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <div className="flex items-center gap-3">
            <Activity className="w-8 h-8 text-mc-accent" />
            <h1 className="text-3xl font-bold">Orchestration Ops</h1>
          </div>
        </div>

        {/* Global Metrics Cards */}
        {metrics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-mc-surface border border-mc-border rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-mc-text-dim text-sm">Success Rate</span>
                <TrendingUp className={`w-5 h-5 ${getHealthColor(metrics.success_rate)}`} />
              </div>
              <div className={`text-3xl font-bold ${getHealthColor(metrics.success_rate)}`}>
                {(metrics.success_rate * 100).toFixed(0)}%
              </div>
              <div className="text-xs text-mc-text-dim mt-1">
                {metrics.total_outcomes} total outcomes
              </div>
            </div>

            <div className="bg-mc-surface border border-mc-border rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-mc-text-dim text-sm">Avg Attempts</span>
                <Activity className="w-5 h-5 text-blue-400" />
              </div>
              <div className="text-3xl font-bold text-blue-400">
                {metrics.avg_attempts_per_task.toFixed(2)}
              </div>
              <div className="text-xs text-mc-text-dim mt-1">
                per task
              </div>
            </div>

            <div className="bg-mc-surface border border-mc-border rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-mc-text-dim text-sm">Retry Rate</span>
                <Activity className="w-5 h-5 text-yellow-400" />
              </div>
              <div className="text-3xl font-bold text-yellow-400">
                {(metrics.retry_rate * 100).toFixed(0)}%
              </div>
              <div className="text-xs text-mc-text-dim mt-1">
                tasks retried
              </div>
            </div>

            <div className="bg-mc-surface border border-mc-border rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-mc-text-dim text-sm">Degraded Agents</span>
                <AlertTriangle className={`w-5 h-5 ${metrics.degraded_agents > 0 ? 'text-orange-400' : 'text-green-400'}`} />
              </div>
              <div className={`text-3xl font-bold ${metrics.degraded_agents > 0 ? 'text-orange-400' : 'text-green-400'}`}>
                {metrics.degraded_agents}
              </div>
              <div className="text-xs text-mc-text-dim mt-1">
                need attention
              </div>
            </div>
          </div>
        )}

        {/* Agent Health Table */}
        <div className="bg-mc-surface border border-mc-border rounded-lg mb-8">
          <div className="p-6 border-b border-mc-border">
            <h2 className="text-xl font-bold">Agent Health</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-mc-bg">
                <tr>
                  <th className="text-left p-4 text-sm font-medium text-mc-text-dim">Agent</th>
                  <th className="text-left p-4 text-sm font-medium text-mc-text-dim">Success Rate</th>
                  <th className="text-left p-4 text-sm font-medium text-mc-text-dim">Last 20</th>
                  <th className="text-left p-4 text-sm font-medium text-mc-text-dim">Total Attempts</th>
                  <th className="text-left p-4 text-sm font-medium text-mc-text-dim">Status</th>
                </tr>
              </thead>
              <tbody>
                {agents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center p-8 text-mc-text-dim">
                      No agent data available
                    </td>
                  </tr>
                ) : (
                  agents.map(agent => (
                    <tr key={agent.agent_id} className="border-t border-mc-border hover:bg-mc-bg/50">
                      <td className="p-4">
                        <div className="font-medium">{agent.name}</div>
                        <div className="text-xs text-mc-text-dim">
                          {agent.total_success}W / {agent.total_failure}L
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`font-bold ${getHealthColor(agent.success_rate)}`}>
                          {(agent.success_rate * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`font-bold ${agent.last_20_success_rate < 0.6 ? 'text-orange-400' : getHealthColor(agent.last_20_success_rate)}`}>
                          {(agent.last_20_success_rate * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="p-4 text-mc-text-dim">
                        {agent.total_attempts}
                      </td>
                      <td className="p-4">
                        {agent.is_degraded === 1 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-500/10 text-red-400 rounded text-xs font-medium">
                            <AlertTriangle className="w-3 h-3" />
                            Degraded
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-500/10 text-green-400 rounded text-xs font-medium">
                            <CheckCircle className="w-3 h-3" />
                            Healthy
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Task Outcomes */}
        <div className="bg-mc-surface border border-mc-border rounded-lg">
          <div className="p-6 border-b border-mc-border">
            <h2 className="text-xl font-bold">Recent Task Outcomes</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-mc-bg">
                <tr>
                  <th className="text-left p-4 text-sm font-medium text-mc-text-dim">Task</th>
                  <th className="text-left p-4 text-sm font-medium text-mc-text-dim">Attempts</th>
                  <th className="text-left p-4 text-sm font-medium text-mc-text-dim">Final Status</th>
                  <th className="text-left p-4 text-sm font-medium text-mc-text-dim">Agent</th>
                  <th className="text-left p-4 text-sm font-medium text-mc-text-dim">Completed</th>
                </tr>
              </thead>
              <tbody>
                {tasks.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center p-8 text-mc-text-dim">
                      No task outcomes available
                    </td>
                  </tr>
                ) : (
                  tasks.map(task => (
                    <tr key={task.task_id} className="border-t border-mc-border hover:bg-mc-bg/50">
                      <td className="p-4">
                        <div className="font-medium truncate max-w-xs">
                          {task.task_title || task.task_id}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{task.attempts}</span>
                          {task.retry_used && (
                            <span className="px-2 py-0.5 bg-yellow-500/10 text-yellow-400 rounded text-xs font-medium">
                              Retry
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`font-medium ${getStatusColor(task.final_status)}`}>
                          {task.final_status}
                        </span>
                      </td>
                      <td className="p-4 text-mc-text-dim">
                        {task.agent_name || 'Unknown'}
                      </td>
                      <td className="p-4 text-mc-text-dim text-sm">
                        {new Date(task.completed_at).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

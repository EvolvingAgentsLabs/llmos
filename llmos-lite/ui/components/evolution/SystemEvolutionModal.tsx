'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Zap,
  TrendingUp,
  ArrowUpCircle,
  GitMerge,
  Archive,
  Bot,
  Wrench,
  FileCode,
  Workflow,
  CheckCircle,
  XCircle,
  Loader2,
  Brain,
  Database,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  runSystemEvolution,
  promoteArtifact,
  SystemEvolutionResult,
  EvolutionRecommendation,
  PromotionResult,
} from '@/lib/system-evolution';

interface Props {
  onClose: () => void;
}

type AnalysisStep = 'idle' | 'analyzing' | 'complete' | 'error';

export default function SystemEvolutionModal({ onClose }: Props) {
  const [step, setStep] = useState<AnalysisStep>('idle');
  const [progress, setProgress] = useState<string>('');
  const [progressDetails, setProgressDetails] = useState<string>('');
  const [result, setResult] = useState<SystemEvolutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Promotion state
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [promotionResults, setPromotionResults] = useState<Map<string, PromotionResult>>(new Map());

  // Collapsible sections
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['recommendations', 'subagents'])
  );

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const runAnalysis = useCallback(async () => {
    setStep('analyzing');
    setError(null);

    try {
      const analysisResult = await runSystemEvolution((stepName, details) => {
        setProgress(stepName);
        setProgressDetails(details || '');
      });

      setResult(analysisResult);
      setStep('complete');
    } catch (err: any) {
      setError(err.message || 'Analysis failed');
      setStep('error');
    }
  }, []);

  const handlePromote = async (recommendation: EvolutionRecommendation) => {
    setPromotingId(recommendation.artifactId);

    try {
      const promoteResult = await promoteArtifact(recommendation, (stepName) => {
        setProgress(stepName);
      });

      setPromotionResults(prev => {
        const next = new Map(prev);
        next.set(recommendation.artifactId, promoteResult);
        return next;
      });
    } catch (err: any) {
      setPromotionResults(prev => {
        const next = new Map(prev);
        next.set(recommendation.artifactId, {
          success: false,
          artifactId: recommendation.artifactId,
          artifactName: recommendation.artifactName,
          sourceVolume: recommendation.sourceVolume,
          targetVolume: 'system',
          error: err.message || 'Promotion failed',
        });
        return next;
      });
    } finally {
      setPromotingId(null);
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'promote':
        return <ArrowUpCircle className="w-4 h-4" />;
      case 'evolve':
        return <GitMerge className="w-4 h-4" />;
      case 'merge':
        return <GitMerge className="w-4 h-4" />;
      case 'archive':
        return <Archive className="w-4 h-4" />;
      default:
        return <Zap className="w-4 h-4" />;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'agent':
        return <Bot className="w-4 h-4" />;
      case 'tool':
        return <Wrench className="w-4 h-4" />;
      case 'code':
        return <FileCode className="w-4 h-4" />;
      case 'workflow':
        return <Workflow className="w-4 h-4" />;
      default:
        return <FileCode className="w-4 h-4" />;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'promote':
        return 'text-accent-success';
      case 'evolve':
        return 'text-accent-primary';
      case 'merge':
        return 'text-accent-secondary';
      case 'archive':
        return 'text-fg-tertiary';
      default:
        return 'text-fg-secondary';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-bg-primary border border-border-primary rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-primary bg-bg-secondary/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-fg-primary">System Evolution</h2>
              <p className="text-sm text-fg-tertiary">
                Analyze and promote artifacts to system volume
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-bg-tertiary transition-colors"
          >
            <X className="w-5 h-5 text-fg-secondary" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {step === 'idle' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-6">
              <div className="w-20 h-20 rounded-full bg-accent-primary/10 flex items-center justify-center">
                <Brain className="w-10 h-10 text-accent-primary" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-xl font-semibold text-fg-primary">
                  Ready to Evolve Your System
                </h3>
                <p className="text-fg-secondary max-w-md">
                  This will analyze your sub-agents, artifacts, and long-term memory
                  to identify successful patterns worth promoting to the system volume.
                </p>
              </div>
              <div className="flex flex-col items-center gap-3 text-sm text-fg-tertiary">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4" />
                  <span>Discover sub-agents across all volumes</span>
                </div>
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4" />
                  <span>Analyze long-term memory patterns</span>
                </div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  <span>Track usage and success rates</span>
                </div>
                <div className="flex items-center gap-2">
                  <ArrowUpCircle className="w-4 h-4" />
                  <span>Recommend promotions to system volume</span>
                </div>
              </div>
              <button
                onClick={runAnalysis}
                className="px-6 py-3 rounded-lg bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium hover:opacity-90 transition-opacity flex items-center gap-2"
              >
                <Zap className="w-5 h-5" />
                Start Evolution Analysis
              </button>
            </div>
          )}

          {step === 'analyzing' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-6">
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-accent-primary/10 flex items-center justify-center">
                  <Loader2 className="w-10 h-10 text-accent-primary animate-spin" />
                </div>
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
                  <div className="px-3 py-1 rounded-full bg-bg-tertiary text-xs font-medium text-fg-secondary whitespace-nowrap">
                    {progress}
                  </div>
                </div>
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-xl font-semibold text-fg-primary">
                  Analyzing System...
                </h3>
                <p className="text-fg-tertiary text-sm">
                  {progressDetails || 'Please wait while we analyze your volumes'}
                </p>
              </div>
            </div>
          )}

          {step === 'error' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-6">
              <div className="w-20 h-20 rounded-full bg-accent-error/10 flex items-center justify-center">
                <XCircle className="w-10 h-10 text-accent-error" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-xl font-semibold text-fg-primary">
                  Analysis Failed
                </h3>
                <p className="text-accent-error text-sm">{error}</p>
              </div>
              <button
                onClick={runAnalysis}
                className="px-4 py-2 rounded-lg bg-bg-tertiary text-fg-primary font-medium hover:bg-bg-secondary transition-colors flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
            </div>
          )}

          {step === 'complete' && result && (
            <div className="space-y-6">
              {/* Stats overview */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-lg bg-bg-tertiary border border-border-secondary">
                  <div className="text-2xl font-bold text-fg-primary">
                    {result.subAgents.system.length + result.subAgents.team.length + result.subAgents.user.length}
                  </div>
                  <div className="text-sm text-fg-tertiary">Sub-Agents</div>
                </div>
                <div className="p-4 rounded-lg bg-bg-tertiary border border-border-secondary">
                  <div className="text-2xl font-bold text-fg-primary">
                    {result.artifacts.length}
                  </div>
                  <div className="text-sm text-fg-tertiary">Artifacts</div>
                </div>
                <div className="p-4 rounded-lg bg-bg-tertiary border border-border-secondary">
                  <div className="text-2xl font-bold text-fg-primary">
                    {result.recommendations.length}
                  </div>
                  <div className="text-sm text-fg-tertiary">Recommendations</div>
                </div>
                <div className="p-4 rounded-lg bg-bg-tertiary border border-border-secondary">
                  <div className="text-2xl font-bold text-fg-primary">
                    {result.memoryInsights.totalWorkflows}
                  </div>
                  <div className="text-sm text-fg-tertiary">Memory Entries</div>
                </div>
              </div>

              {/* Recommendations Section */}
              <div className="border border-border-primary rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection('recommendations')}
                  className="w-full px-4 py-3 bg-bg-secondary flex items-center justify-between hover:bg-bg-tertiary transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <ArrowUpCircle className="w-5 h-5 text-accent-success" />
                    <span className="font-medium text-fg-primary">
                      Promotion Recommendations ({result.recommendations.length})
                    </span>
                  </div>
                  {expandedSections.has('recommendations') ? (
                    <ChevronDown className="w-4 h-4 text-fg-tertiary" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-fg-tertiary" />
                  )}
                </button>

                {expandedSections.has('recommendations') && (
                  <div className="divide-y divide-border-secondary">
                    {result.recommendations.length === 0 ? (
                      <div className="px-4 py-8 text-center text-fg-tertiary">
                        No recommendations yet. Use more sub-agents and artifacts to generate evolution suggestions.
                      </div>
                    ) : (
                      result.recommendations.map((rec) => {
                        const promotionResult = promotionResults.get(rec.artifactId);
                        const isPromoting = promotingId === rec.artifactId;

                        return (
                          <div
                            key={rec.artifactId}
                            className="px-4 py-3 flex items-center gap-4"
                          >
                            <div className={`${getActionColor(rec.action)}`}>
                              {getActionIcon(rec.action)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                {getTypeIcon(rec.artifactType)}
                                <span className="font-medium text-fg-primary truncate">
                                  {rec.artifactName}
                                </span>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-bg-tertiary text-fg-tertiary">
                                  {rec.sourceVolume}
                                </span>
                              </div>
                              <p className="text-sm text-fg-secondary mt-0.5 truncate">
                                {rec.reason}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <div className="text-xs text-fg-tertiary">
                                  {(rec.confidence * 100).toFixed(0)}% confidence
                                </div>
                                <span className="text-fg-quaternary">|</span>
                                <div className="text-xs text-fg-tertiary">
                                  Based on: {rec.basedOn.slice(0, 2).join(', ')}
                                </div>
                              </div>
                            </div>
                            <div className="flex-shrink-0">
                              {promotionResult ? (
                                promotionResult.success ? (
                                  <div className="flex items-center gap-1 text-accent-success text-sm">
                                    <CheckCircle className="w-4 h-4" />
                                    <span>Promoted</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1 text-accent-error text-sm">
                                    <XCircle className="w-4 h-4" />
                                    <span title={promotionResult.error}>Failed</span>
                                  </div>
                                )
                              ) : isPromoting ? (
                                <Loader2 className="w-5 h-5 text-accent-primary animate-spin" />
                              ) : (
                                <button
                                  onClick={() => handlePromote(rec)}
                                  className="px-3 py-1.5 text-sm rounded-lg bg-accent-success/10 text-accent-success hover:bg-accent-success/20 transition-colors flex items-center gap-1"
                                  disabled={rec.action === 'archive'}
                                >
                                  {rec.action === 'promote' && (
                                    <>
                                      <ArrowUpCircle className="w-3 h-3" />
                                      Promote
                                    </>
                                  )}
                                  {rec.action === 'evolve' && (
                                    <>
                                      <GitMerge className="w-3 h-3" />
                                      Evolve
                                    </>
                                  )}
                                  {rec.action === 'merge' && (
                                    <>
                                      <GitMerge className="w-3 h-3" />
                                      Merge
                                    </>
                                  )}
                                  {rec.action === 'archive' && (
                                    <span className="text-fg-tertiary">Archive</span>
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              {/* Sub-Agents Section */}
              <div className="border border-border-primary rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection('subagents')}
                  className="w-full px-4 py-3 bg-bg-secondary flex items-center justify-between hover:bg-bg-tertiary transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Bot className="w-5 h-5 text-accent-primary" />
                    <span className="font-medium text-fg-primary">
                      Sub-Agents by Volume
                    </span>
                  </div>
                  {expandedSections.has('subagents') ? (
                    <ChevronDown className="w-4 h-4 text-fg-tertiary" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-fg-tertiary" />
                  )}
                </button>

                {expandedSections.has('subagents') && (
                  <div className="p-4 space-y-4">
                    {/* System Volume */}
                    <div>
                      <div className="text-sm font-medium text-fg-secondary mb-2">
                        System ({result.subAgents.system.length})
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {result.subAgents.system.length === 0 ? (
                          <span className="text-xs text-fg-tertiary">No system agents</span>
                        ) : (
                          result.subAgents.system.map((agent) => (
                            <div
                              key={agent.path}
                              className="px-2 py-1 rounded bg-accent-success/10 text-accent-success text-xs"
                              title={agent.description}
                            >
                              {agent.name}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Team Volume */}
                    <div>
                      <div className="text-sm font-medium text-fg-secondary mb-2">
                        Team ({result.subAgents.team.length})
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {result.subAgents.team.length === 0 ? (
                          <span className="text-xs text-fg-tertiary">No team agents</span>
                        ) : (
                          result.subAgents.team.map((agent) => (
                            <div
                              key={agent.path}
                              className="px-2 py-1 rounded bg-accent-secondary/10 text-accent-secondary text-xs"
                              title={agent.description}
                            >
                              {agent.name}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* User Volume */}
                    <div>
                      <div className="text-sm font-medium text-fg-secondary mb-2">
                        User ({result.subAgents.user.length})
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {result.subAgents.user.length === 0 ? (
                          <span className="text-xs text-fg-tertiary">No user agents</span>
                        ) : (
                          result.subAgents.user.map((agent) => (
                            <div
                              key={agent.path}
                              className="px-2 py-1 rounded bg-accent-primary/10 text-accent-primary text-xs"
                              title={agent.description}
                            >
                              {agent.name}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Usage Stats */}
                    {result.subAgents.usageStats.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-border-secondary">
                        <div className="text-sm font-medium text-fg-secondary mb-2">
                          Usage Statistics
                        </div>
                        <div className="space-y-2">
                          {result.subAgents.usageStats.slice(0, 5).map((usage) => (
                            <div
                              key={`${usage.volume}:${usage.agentPath}`}
                              className="flex items-center justify-between text-sm"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-fg-primary">{usage.agentName}</span>
                                <span className="text-xs px-1.5 py-0.5 rounded bg-bg-tertiary text-fg-tertiary">
                                  {usage.volume}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-fg-tertiary">
                                <span>{usage.executionCount} runs</span>
                                <span className={usage.successCount / usage.executionCount >= 0.7 ? 'text-accent-success' : 'text-accent-warning'}>
                                  {((usage.successCount / usage.executionCount) * 100).toFixed(0)}% success
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Memory Insights Section */}
              <div className="border border-border-primary rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection('memory')}
                  className="w-full px-4 py-3 bg-bg-secondary flex items-center justify-between hover:bg-bg-tertiary transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Database className="w-5 h-5 text-accent-secondary" />
                    <span className="font-medium text-fg-primary">
                      Long-Term Memory Insights
                    </span>
                  </div>
                  {expandedSections.has('memory') ? (
                    <ChevronDown className="w-4 h-4 text-fg-tertiary" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-fg-tertiary" />
                  )}
                </button>

                {expandedSections.has('memory') && (
                  <div className="p-4 space-y-4">
                    <div>
                      <div className="text-sm font-medium text-fg-secondary mb-2">
                        Most Used Tools
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {result.memoryInsights.commonTools.length === 0 ? (
                          <span className="text-xs text-fg-tertiary">No tools recorded yet</span>
                        ) : (
                          result.memoryInsights.commonTools.map((tool) => (
                            <div
                              key={tool}
                              className="px-2 py-1 rounded bg-bg-tertiary text-fg-secondary text-xs"
                            >
                              {tool}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-medium text-fg-secondary mb-2">
                        Recent Learnings
                      </div>
                      <div className="space-y-1">
                        {result.memoryInsights.recentLearnings.length === 0 ? (
                          <span className="text-xs text-fg-tertiary">No learnings recorded yet</span>
                        ) : (
                          result.memoryInsights.recentLearnings.slice(0, 5).map((learning, i) => (
                            <div
                              key={i}
                              className="text-sm text-fg-tertiary truncate"
                            >
                              {learning}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Patterns Section */}
              {result.patterns.length > 0 && (
                <div className="border border-border-primary rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleSection('patterns')}
                    className="w-full px-4 py-3 bg-bg-secondary flex items-center justify-between hover:bg-bg-tertiary transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-accent-warning" />
                      <span className="font-medium text-fg-primary">
                        Detected Patterns ({result.patterns.length})
                      </span>
                    </div>
                    {expandedSections.has('patterns') ? (
                      <ChevronDown className="w-4 h-4 text-fg-tertiary" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-fg-tertiary" />
                    )}
                  </button>

                  {expandedSections.has('patterns') && (
                    <div className="divide-y divide-border-secondary">
                      {result.patterns.map((pattern) => (
                        <div key={pattern.name} className="px-4 py-3">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-fg-primary">
                              {pattern.name}
                            </span>
                            <span className="text-xs text-fg-tertiary">
                              {(pattern.confidence * 100).toFixed(0)}% confidence
                            </span>
                          </div>
                          <p className="text-sm text-fg-secondary mt-1">
                            {pattern.description}
                          </p>
                          <div className="text-xs text-fg-tertiary mt-1">
                            {pattern.occurrences} occurrences
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Analysis metadata */}
              <div className="text-xs text-fg-quaternary text-center">
                Analysis completed in {(result.analysisTime / 1000).toFixed(1)}s
                {' | '}
                Analyzed at {new Date(result.analyzedAt).toLocaleString()}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border-primary bg-bg-secondary/50 flex justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-fg-secondary hover:text-fg-primary hover:bg-bg-tertiary transition-colors"
          >
            Close
          </button>

          {step === 'complete' && (
            <button
              onClick={runAnalysis}
              className="px-4 py-2 rounded-lg bg-bg-tertiary text-fg-primary hover:bg-bg-secondary transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Re-analyze
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

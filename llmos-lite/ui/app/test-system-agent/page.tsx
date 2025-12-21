'use client';

import { useState } from 'react';
import { executeSystemAgent, SystemAgentResult } from '@/lib/system-agent-orchestrator';
import { getVFS } from '@/lib/virtual-fs';

export default function TestSystemAgentPage() {
  const [userGoal, setUserGoal] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<SystemAgentResult | null>(null);
  const [files, setFiles] = useState<string[]>([]);

  const handleExecute = async () => {
    if (!userGoal.trim()) return;

    setIsExecuting(true);
    setResult(null);

    try {
      const agentResult = await executeSystemAgent(userGoal);
      setResult(agentResult);

      // Refresh file list
      const vfs = getVFS();
      const allFiles = vfs.getAllFiles();
      setFiles(allFiles.map(f => f.path));
    } catch (error: any) {
      setResult({
        success: false,
        response: '',
        toolCalls: [],
        filesCreated: [],
        error: error.message || String(error),
        executionTime: 0,
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleViewFile = (path: string) => {
    const vfs = getVFS();
    const file = vfs.readFile(path);
    if (file) {
      alert(`File: ${path}\n\n${file.content}`);
    }
  };

  const handleClearFiles = () => {
    if (confirm('Clear all virtual files?')) {
      const vfs = getVFS();
      vfs.clear();
      setFiles([]);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="heading-1 mb-2">SystemAgent Test Page</h1>
        <p className="text-fg-secondary mb-8">
          Test the LLMunix SystemAgent orchestrator - creates projects, executes Python, saves to virtual filesystem
        </p>

        {/* Input Section */}
        <div className="card-elevated mb-6">
          <h2 className="heading-3 mb-4">User Goal</h2>
          <textarea
            value={userGoal}
            onChange={(e) => setUserGoal(e.target.value)}
            placeholder="e.g., Create a sine wave signal, add noise, then apply FFT to show frequency spectrum"
            className="textarea w-full h-32 mb-4"
          />
          <div className="flex gap-3">
            <button
              onClick={handleExecute}
              disabled={isExecuting || !userGoal.trim()}
              className="btn-primary"
            >
              {isExecuting ? 'Executing...' : 'Execute SystemAgent'}
            </button>
            <button onClick={handleClearFiles} className="btn-secondary">
              Clear All Files
            </button>
          </div>
        </div>

        {/* Results Section */}
        {result && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="card-elevated">
              <h2 className="heading-3 mb-4">
                {result.success ? '✓ Success' : '✗ Failed'}
              </h2>
              <div className="space-y-2 text-sm">
                <p><strong>Execution Time:</strong> {result.executionTime.toFixed(0)}ms</p>
                <p><strong>Tool Calls:</strong> {result.toolCalls.length}</p>
                <p><strong>Files Created:</strong> {result.filesCreated.length}</p>
                {result.projectPath && <p><strong>Project:</strong> {result.projectPath}</p>}
                {result.error && (
                  <p className="text-accent-error"><strong>Error:</strong> {result.error}</p>
                )}
              </div>
            </div>

            {/* Response */}
            {result.response && (
              <div className="card-elevated">
                <h2 className="heading-3 mb-4">Agent Response</h2>
                <div className="bg-bg-tertiary p-4 rounded-lg whitespace-pre-wrap text-sm">
                  {result.response}
                </div>
              </div>
            )}

            {/* Tool Calls */}
            {result.toolCalls.length > 0 && (
              <div className="card-elevated">
                <h2 className="heading-3 mb-4">Tool Calls ({result.toolCalls.length})</h2>
                <div className="space-y-3">
                  {result.toolCalls.map((call, idx) => (
                    <div key={idx} className="bg-bg-tertiary p-3 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold">{call.toolName}</h3>
                        <span className={`text-xs ${call.success ? 'text-accent-success' : 'text-accent-error'}`}>
                          {call.success ? '✓ Success' : '✗ Failed'}
                        </span>
                      </div>
                      <div className="text-xs space-y-1">
                        <p><strong>Tool ID:</strong> {call.toolId}</p>
                        <p><strong>Inputs:</strong> {JSON.stringify(call.inputs, null, 2)}</p>
                        {call.error && <p className="text-accent-error"><strong>Error:</strong> {call.error}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Files Section */}
        {files.length > 0 && (
          <div className="card-elevated mt-6">
            <h2 className="heading-3 mb-4">Virtual File System ({files.length} files)</h2>
            <div className="space-y-2">
              {files.map((path) => (
                <div key={path} className="flex items-center justify-between p-2 bg-bg-tertiary rounded">
                  <span className="text-sm font-mono">{path}</span>
                  <button
                    onClick={() => handleViewFile(path)}
                    className="btn-secondary text-xs px-3 py-1"
                  >
                    View
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sample Goals */}
        <div className="card-elevated mt-6">
          <h2 className="heading-3 mb-4">Sample Goals (Click to Try)</h2>
          <div className="space-y-2">
            {[
              'Create a sine wave signal, add noise, then apply FFT to show frequency spectrum',
              'Create a 3D surface plot of z = sin(sqrt(x^2 + y^2))',
              'Simulate a 2-link robot arm trajectory from (0,2) to (2,0)',
              'Train a K-means clustering model on synthetic 2D data',
            ].map((goal, idx) => (
              <button
                key={idx}
                onClick={() => setUserGoal(goal)}
                className="block w-full text-left p-3 bg-bg-tertiary hover:bg-bg-elevated rounded-lg transition-colors text-sm"
              >
                {goal}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

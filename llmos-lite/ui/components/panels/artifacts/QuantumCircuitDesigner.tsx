'use client';

import { useState, useCallback, useRef } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Node,
  Edge,
  Connection,
  BackgroundVariant,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Wand2, Play, StepForward, Bug, Save, FileJson, Upload, FolderOpen } from 'lucide-react';
import QuantumNode from './QuantumNode';
import QuantumNodeEditor from './QuantumNodeEditor';
import { parseNaturalLanguageToCircuit } from '@/lib/quantum-nlp-parser';
import { getPyodideRuntime } from '@/lib/pyodide-runtime';
import {
  createQuantumCircuitArtifact,
  saveQuantumCircuitArtifact,
  loadQuantumCircuitArtifact,
  listQuantumCircuitArtifacts,
  recordExecution,
  QuantumCircuitArtifact,
} from '@/lib/quantum-circuit-artifact';

const nodeTypes = {
  quantumNode: QuantumNode,
};

/**
 * Quantum Circuit Designer
 *
 * Main component for visual quantum circuit programming:
 * 1. Natural language input → Auto-generates circuit graph
 * 2. Visual node graph editor
 * 3. Code editor for each node
 * 4. Step-by-step execution with debugging
 * 5. Quantum state visualization
 */
export default function QuantumCircuitDesigner() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [nlpInput, setNlpInput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionStep, setExecutionStep] = useState(0);
  const [debugMode, setDebugMode] = useState(false);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [currentArtifact, setCurrentArtifact] = useState<QuantumCircuitArtifact | null>(null);
  const [savedArtifacts, setSavedArtifacts] = useState<QuantumCircuitArtifact[]>([]);
  const [showLoadDialog, setShowLoadDialog] = useState(false);

  // Node outputs storage (for passing data between nodes)
  const nodeOutputs = useRef<Record<string, any>>({});

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNode(node.id);
    },
    []
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  /**
   * Generate circuit from natural language
   * Creates skills on-demand and optionally saves them
   */
  const handleNLPGenerate = async () => {
    if (!nlpInput.trim()) return;

    const result = parseNaturalLanguageToCircuit(nlpInput);

    setNodes(result.nodes);
    setEdges(result.edges);

    // Save generated skills to API endpoint (backend will persist to /volumes/system/skills/)
    if (result.skills.length > 0) {
      try {
        await Promise.all(
          result.skills.map(skill =>
            fetch('/api/skills/save', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                filename: `${skill.metadata.skill_id}.md`,
                content: skill.markdown,
              }),
            })
          )
        );
        console.log(`Saved ${result.skills.length} skills to /volumes/system/skills/`);
      } catch (error) {
        console.warn('Could not save skills (API not available):', error);
        // Non-fatal - skills are still in memory
      }
    }

    // Fit view after generation
    setTimeout(() => {
      if (reactFlowInstance) {
        reactFlowInstance.fitView({ padding: 0.2 });
      }
    }, 100);
  };

  /**
   * Execute single node
   */
  const executeNode = async (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    // Update node status to running
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, status: 'running' } }
          : n
      )
    );

    try {
      const runtime = getPyodideRuntime();

      // Get inputs from connected nodes
      const incomingEdges = edges.filter(e => e.target === nodeId);
      const inputs: Record<string, any> = {};

      incomingEdges.forEach(edge => {
        const sourceOutput = nodeOutputs.current[edge.source];
        if (sourceOutput) {
          Object.assign(inputs, sourceOutput);
        }
      });

      // Prepare execution code
      const executionCode = `
${node.data.code}

# Execute with inputs
result = execute(${JSON.stringify(inputs)})
result
      `;

      const result = await runtime.executePython(executionCode);

      if (result.success) {
        // Store output for downstream nodes
        nodeOutputs.current[nodeId] = result.output;

        // Update node with success
        setNodes((nds) =>
          nds.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    status: 'completed',
                    output: result.output,
                    executionTime: result.executionTime,
                  },
                }
              : n
          )
        );

        // Animate outgoing edges
        setEdges((eds) =>
          eds.map((e) =>
            e.source === nodeId
              ? { ...e, animated: true, style: { stroke: '#00ff88' } }
              : e
          )
        );
      } else {
        throw new Error(result.error || 'Execution failed');
      }
    } catch (error) {
      console.error('Node execution error:', error);

      // Update node with error
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                data: {
                  ...n.data,
                  status: 'error',
                  error: error instanceof Error ? error.message : String(error),
                },
              }
            : n
        )
      );
    }
  };

  /**
   * Execute entire workflow
   */
  const handleExecuteWorkflow = async () => {
    setIsExecuting(true);
    nodeOutputs.current = {};
    const startTime = performance.now();

    // Reset all nodes to pending
    setNodes((nds) =>
      nds.map((n) => ({ ...n, data: { ...n.data, status: 'pending' } }))
    );

    // Topological sort to determine execution order
    const executionOrder = topologicalSort(nodes, edges);

    let executionError: string | undefined;

    try {
      // Execute nodes in order
      for (const nodeId of executionOrder) {
        await executeNode(nodeId);

        // If in debug mode, pause after each step
        if (debugMode) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } catch (error) {
      executionError = error instanceof Error ? error.message : String(error);
    }

    const duration = performance.now() - startTime;

    // Record execution if we have a current artifact
    if (currentArtifact) {
      const updatedArtifact = recordExecution(
        currentArtifact,
        executionError ? 'error' : 'success',
        duration,
        executionError ? undefined : nodeOutputs.current,
        executionError
      );
      setCurrentArtifact(updatedArtifact);

      // Auto-save after execution
      await saveQuantumCircuitArtifact(updatedArtifact, 'user');
    }

    setIsExecuting(false);
  };

  /**
   * Step through execution (debug mode)
   */
  const handleStepExecution = async () => {
    const executionOrder = topologicalSort(nodes, edges);

    if (executionStep < executionOrder.length) {
      const nodeId = executionOrder[executionStep];
      await executeNode(nodeId);
      setExecutionStep(prev => prev + 1);
    }
  };

  /**
   * Save circuit as artifact
   */
  const handleSaveCircuit = async () => {
    if (!currentArtifact) {
      // Create new artifact
      const artifactName = nlpInput.trim()
        ? nlpInput.substring(0, 50) + (nlpInput.length > 50 ? '...' : '')
        : `Quantum Circuit ${Date.now()}`;

      const artifact = createQuantumCircuitArtifact(
        artifactName,
        nlpInput || 'Custom quantum circuit',
        {
          nodes,
          edges,
          skills: nodes
            .filter(n => n.data.skillMarkdown)
            .map(n => ({
              metadata: {
                skill_id: n.data.skillId,
                name: n.data.label,
                description: n.data.description,
                type: n.data.type,
                inputs: n.data.inputs,
                outputs: n.data.outputs,
              },
              markdown: n.data.skillMarkdown,
              code: n.data.code,
            })),
        },
        nlpInput
      );

      setCurrentArtifact(artifact);
      await saveQuantumCircuitArtifact(artifact, 'user');
      alert('Circuit saved as artifact!');
    } else {
      // Update existing artifact
      const updatedArtifact = {
        ...currentArtifact,
        circuit: {
          nodes,
          edges,
          skills: nodes
            .filter(n => n.data.skillMarkdown)
            .map(n => ({
              metadata: {
                skill_id: n.data.skillId,
                name: n.data.label,
                description: n.data.description,
                type: n.data.type,
                inputs: n.data.inputs,
                outputs: n.data.outputs,
              },
              markdown: n.data.skillMarkdown,
              code: n.data.code,
            })),
        },
        updated_at: new Date().toISOString(),
      };

      setCurrentArtifact(updatedArtifact);
      await saveQuantumCircuitArtifact(updatedArtifact, 'user');
      alert('Circuit artifact updated!');
    }
  };

  /**
   * Load saved circuits
   */
  const handleLoadCircuits = async () => {
    const artifacts = await listQuantumCircuitArtifacts('user');
    setSavedArtifacts(artifacts);
    setShowLoadDialog(true);
  };

  /**
   * Load specific circuit
   */
  const handleLoadCircuit = (artifact: QuantumCircuitArtifact) => {
    setNodes(artifact.circuit.nodes);
    setEdges(artifact.circuit.edges);
    setCurrentArtifact(artifact);
    setNlpInput(artifact.nlp_input || artifact.description);
    setShowLoadDialog(false);

    // Fit view
    setTimeout(() => {
      if (reactFlowInstance) {
        reactFlowInstance.fitView({ padding: 0.2 });
      }
    }, 100);
  };

  // Get selected node data
  const selectedNodeData = selectedNode
    ? nodes.find(n => n.id === selectedNode)?.data
    : null;

  return (
    <div className="h-full flex gap-4">
      {/* Left Panel - Circuit Graph */}
      <div className="flex-1 flex flex-col">
        {/* NLP Input */}
        <div className="mb-4 space-y-2">
          <label className="text-xs text-terminal-fg-secondary">
            Natural Language Circuit Description:
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={nlpInput}
              onChange={(e) => setNlpInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleNLPGenerate()}
              placeholder="e.g., create a quantum circuit to process a cardiac pressure signal and detect echoes using two quantum fourier transforms"
              className="flex-1 terminal-input text-xs"
            />
            <button
              onClick={handleNLPGenerate}
              className="btn-terminal text-xs py-1 px-3 flex items-center gap-1"
            >
              <Wand2 className="w-3 h-3" />
              Generate
            </button>
          </div>
        </div>

        {/* Graph Canvas */}
        <div className="flex-1 bg-terminal-bg-primary border border-terminal-border rounded relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onInit={setReactFlowInstance}
            nodeTypes={nodeTypes}
            fitView
            className="bg-terminal-bg-primary"
          >
            <Controls className="bg-terminal-bg-secondary border border-terminal-border" />
            <MiniMap
              className="bg-terminal-bg-secondary border border-terminal-border"
              nodeColor={(node) => {
                if (node.id === selectedNode) return '#00ff88';
                if (node.data?.status === 'completed') return '#00ff88';
                if (node.data?.status === 'running') return '#ffaa00';
                if (node.data?.status === 'error') return '#ff0066';
                return '#666';
              }}
            />
            <Background variant={BackgroundVariant.Dots} gap={12} size={1} color="#333" />

            {/* Control Panel */}
            <Panel position="top-right" className="space-y-2">
              <div className="flex gap-2">
                <button
                  onClick={handleExecuteWorkflow}
                  disabled={isExecuting || nodes.length === 0}
                  className="btn-terminal text-xs py-1 px-3 flex items-center gap-1"
                >
                  <Play className="w-3 h-3" />
                  {isExecuting ? 'Running...' : 'Run All'}
                </button>
                <button
                  onClick={handleStepExecution}
                  disabled={isExecuting}
                  className="btn-terminal-secondary text-xs py-1 px-3 flex items-center gap-1"
                  title="Step through execution"
                >
                  <StepForward className="w-3 h-3" />
                  Step
                </button>
                <button
                  onClick={() => setDebugMode(!debugMode)}
                  className={`text-xs py-1 px-3 flex items-center gap-1 ${
                    debugMode ? 'btn-terminal' : 'btn-terminal-secondary'
                  }`}
                  title="Toggle debug mode"
                >
                  <Bug className="w-3 h-3" />
                  Debug
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveCircuit}
                  disabled={nodes.length === 0}
                  className="btn-terminal-secondary text-xs py-1 px-3 flex items-center gap-1"
                  title="Save as artifact"
                >
                  <Save className="w-3 h-3" />
                  {currentArtifact ? 'Update' : 'Save'}
                </button>
                <button
                  onClick={handleLoadCircuits}
                  className="btn-terminal-secondary text-xs py-1 px-3 flex items-center gap-1"
                  title="Load saved circuit"
                >
                  <FolderOpen className="w-3 h-3" />
                  Load
                </button>
                <button
                  onClick={() => {
                    if (reactFlowInstance) {
                      reactFlowInstance.fitView({ padding: 0.2 });
                    }
                  }}
                  className="btn-terminal-secondary text-xs py-1 px-2"
                >
                  Fit View
                </button>
              </div>
            </Panel>

            {/* Status Display */}
            <Panel position="bottom-left" className="text-xs text-terminal-fg-secondary space-y-0.5 bg-terminal-bg-secondary p-2 rounded border border-terminal-border">
              <div>Nodes: {nodes.length}</div>
              <div>Edges: {edges.length}</div>
              <div>
                Status:{' '}
                {isExecuting
                  ? 'Running...'
                  : debugMode
                  ? `Debug (Step ${executionStep})`
                  : 'Ready'}
              </div>
            </Panel>
          </ReactFlow>
        </div>
      </div>

      {/* Right Panel - Node Editor */}
      <div className="w-[500px] bg-terminal-bg-secondary border border-terminal-border rounded p-4 overflow-auto">
        {selectedNodeData ? (
          <QuantumNodeEditor
            nodeId={selectedNode!}
            nodeData={selectedNodeData}
            onCodeChange={(code) => {
              setNodes((nds) =>
                nds.map((n) =>
                  n.id === selectedNode
                    ? { ...n, data: { ...n.data, code } }
                    : n
                )
              );
            }}
            onExecute={(result) => {
              console.log('Node executed:', result);
            }}
          />
        ) : (
          <div className="text-center text-terminal-fg-tertiary text-sm pt-8">
            <p>Select a node to view and edit its code</p>
            <p className="mt-2 text-xs">
              Or enter a natural language description above to generate a circuit
            </p>
            {currentArtifact && (
              <div className="mt-4 p-3 bg-terminal-bg-primary rounded border border-terminal-border text-left">
                <div className="text-xs font-medium text-terminal-accent-green mb-2">
                  Current Artifact
                </div>
                <div className="text-xs space-y-1">
                  <div><strong>Name:</strong> {currentArtifact.name}</div>
                  <div><strong>Version:</strong> {currentArtifact.version}</div>
                  <div><strong>Executions:</strong> {currentArtifact.executions.length}</div>
                  <div><strong>Category:</strong> {currentArtifact.category}</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Load Dialog */}
      {showLoadDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-terminal-bg-primary border-2 border-terminal-border rounded-lg p-6 max-w-2xl max-h-[80vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-terminal-accent-green">
                Load Quantum Circuit
              </h2>
              <button
                onClick={() => setShowLoadDialog(false)}
                className="text-terminal-fg-tertiary hover:text-terminal-fg-primary"
              >
                ✕
              </button>
            </div>

            {savedArtifacts.length === 0 ? (
              <div className="text-center text-terminal-fg-tertiary py-8">
                No saved circuits found
              </div>
            ) : (
              <div className="space-y-2">
                {savedArtifacts.map((artifact) => (
                  <button
                    key={artifact.id}
                    onClick={() => handleLoadCircuit(artifact)}
                    className="w-full text-left p-3 bg-terminal-bg-secondary hover:bg-terminal-bg-tertiary border border-terminal-border rounded transition-colors"
                  >
                    <div className="text-sm font-medium text-terminal-fg-primary mb-1">
                      {artifact.name}
                    </div>
                    <div className="text-xs text-terminal-fg-secondary mb-2">
                      {artifact.description}
                    </div>
                    <div className="flex gap-4 text-xs text-terminal-fg-tertiary">
                      <span>v{artifact.version}</span>
                      <span>{artifact.circuit.nodes.length} nodes</span>
                      <span>{artifact.executions.length} runs</span>
                      <span className="text-terminal-accent-blue">{artifact.category}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Topological sort for execution order
 */
function topologicalSort(nodes: Node[], edges: Edge[]): string[] {
  const visited = new Set<string>();
  const result: string[] = [];

  const visit = (nodeId: string) => {
    if (visited.has(nodeId)) return;

    visited.add(nodeId);

    // Visit all dependencies first
    const incomingEdges = edges.filter(e => e.target === nodeId);
    incomingEdges.forEach(edge => {
      visit(edge.source);
    });

    result.push(nodeId);
  };

  nodes.forEach(node => visit(node.id));

  return result;
}

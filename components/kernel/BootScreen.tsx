'use client';

import { useEffect, useState } from 'react';
import { BootProgress } from '@/lib/kernel/boot';
import { generateRobotConfig, robotIconToDataURL, llmosLogoToDataURL } from '@/lib/agents/robot-icon-generator';

interface BootScreenProps {
  progress: BootProgress;
  onComplete?: () => void;
}

interface Position {
  x: number;
  y: number;
}

interface Agent {
  id: string;
  position: Position;
  direction: 'up' | 'down' | 'left' | 'right';
  iconUrl: string;
  isPacman: boolean;
}

const GRID_SIZE = 5;
const CELL_SIZE = 48;
const ANIMATION_SPEED = 400;

// Pacman-style Agent Animation
function AgentAnimation({ progress }: { progress: number }) {
  const [agents, setAgents] = useState<Agent[]>([]);

  // Initialize agents
  useEffect(() => {
    const initialAgents: Agent[] = [
      {
        id: 'pacman-agent',
        position: { x: 2, y: 2 },
        direction: 'right',
        iconUrl: robotIconToDataURL(generateRobotConfig('pacman-agent'), 40),
        isPacman: true,
      },
      {
        id: 'ghost-1',
        position: { x: 0, y: 0 },
        direction: 'right',
        iconUrl: robotIconToDataURL(generateRobotConfig('ghost-agent-1'), 40),
        isPacman: false,
      },
      {
        id: 'ghost-2',
        position: { x: 4, y: 0 },
        direction: 'down',
        iconUrl: robotIconToDataURL(generateRobotConfig('ghost-agent-2'), 40),
        isPacman: false,
      },
      {
        id: 'ghost-3',
        position: { x: 0, y: 4 },
        direction: 'up',
        iconUrl: robotIconToDataURL(generateRobotConfig('ghost-agent-3'), 40),
        isPacman: false,
      },
      {
        id: 'ghost-4',
        position: { x: 4, y: 4 },
        direction: 'left',
        iconUrl: robotIconToDataURL(generateRobotConfig('ghost-agent-4'), 40),
        isPacman: false,
      },
    ];
    setAgents(initialAgents);
  }, []);

  // Animation loop
  useEffect(() => {
    if (agents.length === 0 || progress === 100) return;

    const interval = setInterval(() => {
      setAgents((prevAgents) => {
        return prevAgents.map((agent) => {
          const newAgent = { ...agent };

          if (agent.isPacman) {
            newAgent.direction = getEscapeDirection(agent, prevAgents);
          } else {
            const pacman = prevAgents.find((a) => a.isPacman);
            if (pacman) {
              newAgent.direction = getChaseDirection(agent, pacman);
            }
          }

          newAgent.position = getNextPosition(agent.position, newAgent.direction);
          return newAgent;
        });
      });
    }, ANIMATION_SPEED);

    return () => clearInterval(interval);
  }, [agents, progress]);

  return (
    <div className="relative mx-auto mb-8" style={{ width: GRID_SIZE * CELL_SIZE, height: GRID_SIZE * CELL_SIZE }}>
      {/* Grid background */}
      <div className="absolute inset-0 rounded-lg bg-[#161b22] border-2 border-[#30363d]">
        {/* Grid lines */}
        {Array.from({ length: GRID_SIZE + 1 }).map((_, i) => (
          <div key={`grid-${i}`}>
            <div
              className="absolute bg-[#21262d]"
              style={{ left: 0, top: i * CELL_SIZE, width: '100%', height: 1 }}
            />
            <div
              className="absolute bg-[#21262d]"
              style={{ left: i * CELL_SIZE, top: 0, width: 1, height: '100%' }}
            />
          </div>
        ))}
      </div>

      {/* Agents */}
      {agents.map((agent) => (
        <div
          key={agent.id}
          className="absolute transition-all duration-300 ease-in-out"
          style={{
            left: agent.position.x * CELL_SIZE + CELL_SIZE / 2 - 20,
            top: agent.position.y * CELL_SIZE + CELL_SIZE / 2 - 20,
            transform: `rotate(${getRotation(agent.direction)}deg)`,
          }}
        >
          <img
            src={agent.iconUrl}
            alt={agent.id}
            className="w-10 h-10"
            style={{ imageRendering: 'pixelated' }}
          />
          {agent.isPacman && (
            <div className="absolute -top-1 -right-1 w-2 h-2 bg-[#ffd43b] rounded-full animate-pulse" />
          )}
        </div>
      ))}
    </div>
  );
}

function getNextPosition(pos: Position, direction: 'up' | 'down' | 'left' | 'right'): Position {
  let newPos = { ...pos };
  switch (direction) {
    case 'up':
      newPos.y = (pos.y - 1 + GRID_SIZE) % GRID_SIZE;
      break;
    case 'down':
      newPos.y = (pos.y + 1) % GRID_SIZE;
      break;
    case 'left':
      newPos.x = (pos.x - 1 + GRID_SIZE) % GRID_SIZE;
      break;
    case 'right':
      newPos.x = (pos.x + 1) % GRID_SIZE;
      break;
  }
  return newPos;
}

function getChaseDirection(ghost: Agent, pacman: Agent): 'up' | 'down' | 'left' | 'right' {
  const dx = pacman.position.x - ghost.position.x;
  const dy = pacman.position.y - ghost.position.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left';
  } else {
    return dy > 0 ? 'down' : 'up';
  }
}

function getEscapeDirection(pacman: Agent, agents: Agent[]): 'up' | 'down' | 'left' | 'right' {
  const ghosts = agents.filter((a) => !a.isPacman);
  let closestGhost: Agent | null = null;
  let minDistance = Infinity;

  for (const ghost of ghosts) {
    const distance = Math.abs(ghost.position.x - pacman.position.x) + Math.abs(ghost.position.y - pacman.position.y);
    if (distance < minDistance) {
      minDistance = distance;
      closestGhost = ghost;
    }
  }

  if (!closestGhost) return pacman.direction;

  const dx = closestGhost.position.x - pacman.position.x;
  const dy = closestGhost.position.y - pacman.position.y;

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'left' : 'right';
  } else {
    return dy > 0 ? 'up' : 'down';
  }
}

function getRotation(direction: 'up' | 'down' | 'left' | 'right'): number {
  switch (direction) {
    case 'up':
      return -90;
    case 'down':
      return 90;
    case 'left':
      return 180;
    case 'right':
      return 0;
  }
}

export default function BootScreen({ progress, onComplete }: BootScreenProps) {
  const [dots, setDots] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  // Animated dots for loading messages
  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Check for completion
  useEffect(() => {
    if (progress.percent === 100 && progress.stage.name === 'ready') {
      setIsComplete(true);
      // Fade out after a brief delay
      const timeout = setTimeout(() => {
        onComplete?.();
      }, 800);
      return () => clearTimeout(timeout);
    }
  }, [progress, onComplete]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-bg-primary transition-opacity duration-500 ${
        isComplete ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="w-full max-w-2xl px-8">
        {/* Logo/Title */}
        <div className="text-center mb-6 animate-fade-in flex items-center justify-center gap-4">
          <img
            src={llmosLogoToDataURL(64)}
            alt="LLMos"
            className="w-16 h-16"
            style={{ imageRendering: 'pixelated' }}
          />
          <div>
            <div className="text-4xl font-bold text-accent-primary">
              LLMos
            </div>
            <div className="text-sm text-fg-secondary font-light tracking-wider">
              Autonomous AI Runtime
            </div>
          </div>
        </div>

        {/* Agent Animation */}
        <AgentAnimation progress={progress.percent} />

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="h-2 bg-bg-tertiary rounded-full overflow-hidden shadow-sm">
            <div
              className="h-full bg-accent-primary transition-all duration-300 ease-out"
              style={{ width: `${progress.percent}%` }}
            >
              <div className="h-full w-full animate-pulse-glow" />
            </div>
          </div>
          <div className="flex justify-between mt-2 text-xs text-fg-tertiary">
            <span>{progress.percent.toFixed(0)}%</span>
            <span>{progress.stage.description}</span>
          </div>
        </div>

        {/* Current Stage Message */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-lg bg-bg-secondary border border-border-primary shadow-sm">
            {/* Spinner */}
            {!progress.error && (
              <div className="relative">
                <div className="w-5 h-5 border-2 border-accent-primary/30 border-t-accent-primary rounded-full animate-spin" />
              </div>
            )}

            {/* Error indicator */}
            {progress.error && (
              <div className="w-5 h-5 flex items-center justify-center">
                <svg
                  className="w-4 h-4 text-accent-warning"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
            )}

            {/* Message */}
            <span
              className={`text-sm font-mono ${
                progress.error ? 'text-accent-warning' : 'text-fg-primary'
              }`}
            >
              {progress.message}
              {!progress.error && <span className="ml-1 w-4 inline-block text-left">{dots}</span>}
            </span>
          </div>

          {/* Error message */}
          {progress.error && (
            <div className="mt-4 p-4 rounded-lg bg-accent-warning/10 border border-accent-warning/30 text-accent-warning text-sm animate-fade-in">
              <div className="font-semibold mb-1">Non-critical error (continuing boot):</div>
              <div className="font-mono text-xs opacity-80">{progress.error}</div>
            </div>
          )}
        </div>

        {/* Boot Stages Timeline */}
        <div className="grid grid-cols-6 gap-2">
          {['init', 'volumes', 'wasm', 'python', 'stdlib', 'ready'].map((stageName, index) => {
            const isCurrent = progress.stage.name === stageName;
            const isPast = getStageIndex(progress.stage.name) > index;
            const hasFailed = progress.error && isCurrent;

            return (
              <div
                key={stageName}
                className={`
                  relative h-1 rounded-full transition-all duration-300
                  ${
                    isPast
                      ? 'bg-accent-primary'
                      : isCurrent && !hasFailed
                      ? 'bg-accent-primary animate-pulse'
                      : hasFailed
                      ? 'bg-accent-warning'
                      : 'bg-bg-tertiary'
                  }
                `}
                title={stageName}
              >
                {/* Stage label */}
                <div
                  className={`
                    absolute -bottom-6 left-0 right-0 text-center text-xs transition-opacity duration-300
                    ${
                      isCurrent
                        ? 'text-accent-primary opacity-100'
                        : isPast
                        ? 'text-fg-tertiary opacity-70'
                        : 'text-fg-muted opacity-50'
                    }
                  `}
                >
                  {stageName}
                </div>
              </div>
            );
          })}
        </div>

        {/* Additional info */}
        <div className="mt-16 text-center text-xs text-fg-tertiary space-y-1">
          <div>Loading kernel from system volume...</div>
          <div className="font-mono">/system/kernel/</div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes pulse-glow {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.7;
          }
        }

        .animate-fade-in {
          animation: fade-in 0.5s ease-out;
        }

        .animate-pulse-glow {
          animation: pulse-glow 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

/**
 * Get stage index for comparison
 */
function getStageIndex(stageName: string): number {
  const stages = ['init', 'volumes', 'wasm', 'python', 'stdlib', 'ready'];
  return stages.indexOf(stageName);
}

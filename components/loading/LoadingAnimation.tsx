'use client';

import { useState, useEffect } from 'react';
import { generateRobotConfig, robotIconToDataURL, llmosLogoToDataURL } from '@/lib/agents/robot-icon-generator';

/**
 * Pacman-style Loading Animation
 *
 * Shows agent robots navigating and chasing each other in a 5×5 grid world.
 * Used as splash screen during app initialization.
 */

interface Position {
  x: number;
  y: number;
}

interface Agent {
  id: string;
  position: Position;
  direction: 'up' | 'down' | 'left' | 'right';
  iconUrl: string;
  isPacman: boolean; // The one being chased
}

const GRID_SIZE = 5;
const CELL_SIZE = 60; // pixels
const ANIMATION_SPEED = 400; // ms per move

export default function LoadingAnimation() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingProgress, setLoadingProgress] = useState(0);

  // Initialize agents
  useEffect(() => {
    const initialAgents: Agent[] = [
      {
        id: 'pacman-agent',
        position: { x: 2, y: 2 }, // Center
        direction: 'right',
        iconUrl: robotIconToDataURL(generateRobotConfig('pacman-agent'), 48),
        isPacman: true,
      },
      {
        id: 'ghost-1',
        position: { x: 0, y: 0 },
        direction: 'right',
        iconUrl: robotIconToDataURL(generateRobotConfig('ghost-agent-1'), 48),
        isPacman: false,
      },
      {
        id: 'ghost-2',
        position: { x: 4, y: 0 },
        direction: 'down',
        iconUrl: robotIconToDataURL(generateRobotConfig('ghost-agent-2'), 48),
        isPacman: false,
      },
      {
        id: 'ghost-3',
        position: { x: 0, y: 4 },
        direction: 'up',
        iconUrl: robotIconToDataURL(generateRobotConfig('ghost-agent-3'), 48),
        isPacman: false,
      },
      {
        id: 'ghost-4',
        position: { x: 4, y: 4 },
        direction: 'left',
        iconUrl: robotIconToDataURL(generateRobotConfig('ghost-agent-4'), 48),
        isPacman: false,
      },
    ];
    setAgents(initialAgents);
  }, []);

  // Animation loop - move agents
  useEffect(() => {
    if (agents.length === 0) return;

    const interval = setInterval(() => {
      setAgents((prevAgents) => {
        return prevAgents.map((agent) => {
          const newAgent = { ...agent };

          if (agent.isPacman) {
            // Pacman tries to escape from ghosts
            newAgent.direction = getEscapeDirection(agent, prevAgents);
          } else {
            // Ghosts chase Pacman
            const pacman = prevAgents.find((a) => a.isPacman);
            if (pacman) {
              newAgent.direction = getChaseDirection(agent, pacman);
            }
          }

          // Move in current direction
          newAgent.position = getNextPosition(agent.position, newAgent.direction);

          return newAgent;
        });
      });

      // Simulate loading progress
      setLoadingProgress((prev) => Math.min(prev + 5, 100));
    }, ANIMATION_SPEED);

    return () => clearInterval(interval);
  }, [agents]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d1117]">
      <div className="flex flex-col items-center gap-8">
        {/* LLMos Logo */}
        <div className="flex items-center gap-4">
          <img
            src={llmosLogoToDataURL(64)}
            alt="LLMos"
            className="w-16 h-16"
            style={{ imageRendering: 'pixelated' }}
          />
          <h1 className="text-3xl font-bold text-[#e6edf3]">LLMos</h1>
        </div>

        {/* 5×5 Grid World */}
        <div
          className="relative border-2 border-[#30363d] rounded-lg bg-[#161b22]"
          style={{
            width: GRID_SIZE * CELL_SIZE,
            height: GRID_SIZE * CELL_SIZE,
          }}
        >
          {/* Grid lines */}
          {Array.from({ length: GRID_SIZE + 1 }).map((_, i) => (
            <div key={`h-${i}`}>
              <div
                className="absolute bg-[#21262d]"
                style={{
                  left: 0,
                  top: i * CELL_SIZE,
                  width: '100%',
                  height: 1,
                }}
              />
              <div
                className="absolute bg-[#21262d]"
                style={{
                  left: i * CELL_SIZE,
                  top: 0,
                  width: 1,
                  height: '100%',
                }}
              />
            </div>
          ))}

          {/* Agents */}
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="absolute transition-all duration-300 ease-in-out"
              style={{
                left: agent.position.x * CELL_SIZE + CELL_SIZE / 2 - 24,
                top: agent.position.y * CELL_SIZE + CELL_SIZE / 2 - 24,
                transform: `rotate(${getRotation(agent.direction)}deg)`,
              }}
            >
              <img
                src={agent.iconUrl}
                alt={agent.id}
                className="w-12 h-12"
                style={{ imageRendering: 'pixelated' }}
              />
              {agent.isPacman && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-[#ffd43b] rounded-full animate-pulse" />
              )}
            </div>
          ))}
        </div>

        {/* Loading Text */}
        <div className="flex flex-col items-center gap-2">
          <div className="text-sm text-[#8b949e]">
            {loadingProgress < 30 && 'Initializing agents...'}
            {loadingProgress >= 30 && loadingProgress < 60 && 'Loading simulation world...'}
            {loadingProgress >= 60 && loadingProgress < 90 && 'Connecting to LLM...'}
            {loadingProgress >= 90 && 'Starting LLMos...'}
          </div>

          {/* Progress bar */}
          <div className="w-64 h-1 bg-[#21262d] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#58a6ff] transition-all duration-300"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Get next position based on current position and direction
 */
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

/**
 * Get chase direction for ghost to pursue Pacman
 */
function getChaseDirection(ghost: Agent, pacman: Agent): 'up' | 'down' | 'left' | 'right' {
  const dx = pacman.position.x - ghost.position.x;
  const dy = pacman.position.y - ghost.position.y;

  // Simple chase logic: move toward Pacman on the axis with larger distance
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left';
  } else {
    return dy > 0 ? 'down' : 'up';
  }
}

/**
 * Get escape direction for Pacman to run away from ghosts
 */
function getEscapeDirection(pacman: Agent, agents: Agent[]): 'up' | 'down' | 'left' | 'right' {
  const ghosts = agents.filter((a) => !a.isPacman);

  // Find the closest ghost
  let closestGhost: Agent | null = null;
  let minDistance = Infinity;

  for (const ghost of ghosts) {
    const distance = Math.abs(ghost.position.x - pacman.position.x) +
                     Math.abs(ghost.position.y - pacman.position.y);
    if (distance < minDistance) {
      minDistance = distance;
      closestGhost = ghost;
    }
  }

  if (!closestGhost) return pacman.direction;

  // Run away from closest ghost
  const dx = closestGhost.position.x - pacman.position.x;
  const dy = closestGhost.position.y - pacman.position.y;

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'left' : 'right';
  } else {
    return dy > 0 ? 'up' : 'down';
  }
}

/**
 * Get rotation angle for direction
 */
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

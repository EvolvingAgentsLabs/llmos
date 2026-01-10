'use client';

/**
 * WASM4 Robot Applet
 *
 * Combined interface for:
 * - WASM4 game display (160x160, 4 colors)
 * - Robot control and monitoring
 * - Game selection and management
 * - Sensor dashboard
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ESP32WASM4VM, getESP32WASM4VM, GAME_LIBRARY } from '../../lib/hardware/esp32-wasm4-vm';
import { BUTTON, DEFAULT_PALETTE, ROBOT_PALETTE } from '../../lib/hardware/wasm4-runtime';
import type { RobotState } from '../../lib/hardware/cube-robot-simulator';

// Applet props
interface WASM4RobotAppletProps {
  mode?: 'game' | 'controller' | 'monitor' | 'combined';
  theme?: 'dark' | 'light' | 'retro';
  showFPS?: boolean;
  enableSound?: boolean;
  onClose?: () => void;
}

// Theme colors
const THEMES = {
  dark: {
    bg: '#1a1a2e',
    panel: '#16213e',
    border: '#0f3460',
    text: '#e8e8e8',
    accent: '#00ff88',
    warning: '#ffaa00',
    danger: '#ff4444',
  },
  light: {
    bg: '#f0f0f0',
    panel: '#ffffff',
    border: '#dddddd',
    text: '#333333',
    accent: '#00aa55',
    warning: '#ff8800',
    danger: '#cc0000',
  },
  retro: {
    bg: '#071821',
    panel: '#306850',
    border: '#86c06c',
    text: '#e0f8cf',
    accent: '#86c06c',
    warning: '#e0f8cf',
    danger: '#e0f8cf',
  },
};

export const WASM4RobotApplet: React.FC<WASM4RobotAppletProps> = ({
  mode = 'combined',
  theme = 'dark',
  showFPS = true,
  enableSound = true,
  onClose,
}) => {
  // State
  const [connected, setConnected] = useState(false);
  const [vmState, setVmState] = useState<any>(null);
  const [robotState, setRobotState] = useState<RobotState | null>(null);
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [currentFPS, setCurrentFPS] = useState(0);
  const [pressedButtons, setPressedButtons] = useState<Set<string>>(new Set());

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapCanvasRef = useRef<HTMLCanvasElement>(null);
  const vmRef = useRef<ESP32WASM4VM | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Get theme colors
  const colors = THEMES[theme];

  // Initialize VM
  useEffect(() => {
    const vm = getESP32WASM4VM({
      enableRobot: true,
      enableSound,
    });
    vmRef.current = vm;

    // Set up event handlers
    vm.on('stateChange', (state) => {
      setVmState(state);
      setIsRunning(state.mode === 'running');
      setCurrentFPS(state.fps);
    });

    vm.on('frameUpdate', ({ framebuffer }) => {
      renderFrame(framebuffer);
    });

    vm.on('robotUpdate', (state) => {
      setRobotState(state);
      renderFloorMap(state);
    });

    // Connect
    vm.connect().then(() => {
      setConnected(true);
    });

    // Expose VM globally for applet tools
    (window as any).getESP32WASM4VM = () => vmRef.current;

    return () => {
      vm.disconnect();
      delete (window as any).getESP32WASM4VM;
    };
  }, [enableSound]);

  // Render WASM4 framebuffer
  const renderFrame = useCallback((framebuffer: Uint8Array) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const vm = vmRef.current;
    if (!vm) return;

    const rgba = vm.getFramebufferRGBA();
    const imageData = ctx.createImageData(160, 160);
    imageData.data.set(rgba);
    ctx.putImageData(imageData, 0, 0);
  }, []);

  // Render floor map
  const renderFloorMap = useCallback((state: RobotState) => {
    const canvas = mapCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const scale = width / 200; // 200cm floor

    // Clear
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= width; i += width / 10) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, height);
      ctx.moveTo(0, i);
      ctx.lineTo(width, i);
      ctx.stroke();
    }

    // Draw robot
    const rx = state.x * scale;
    const ry = state.y * scale;
    const angle = (state.heading * Math.PI) / 180;

    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(angle);

    // Robot body
    ctx.fillStyle = colors.accent;
    const robotSize = 5 * scale;
    ctx.fillRect(-robotSize / 2, -robotSize / 2, robotSize, robotSize);

    // Direction indicator
    ctx.fillStyle = colors.text;
    ctx.beginPath();
    ctx.moveTo(0, -robotSize * 0.7);
    ctx.lineTo(-robotSize * 0.3, 0);
    ctx.lineTo(robotSize * 0.3, 0);
    ctx.fill();

    ctx.restore();

    // Draw distance sensors
    ctx.strokeStyle = colors.danger;
    ctx.lineWidth = 1;
    const drawSensor = (dist: number, offsetAngle: number) => {
      const a = ((state.heading + offsetAngle) * Math.PI) / 180;
      const d = Math.min(dist, 50) * scale;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + Math.sin(a) * d, ry - Math.cos(a) * d);
      ctx.stroke();
    };
    drawSensor(state.distanceFront, 0);
    drawSensor(state.distanceLeft, -90);
    drawSensor(state.distanceRight, 90);
  }, [colors]);

  // Handle keyboard input
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const vm = vmRef.current;
    if (!vm) return;

    vm.handleKeyDown(e.key);

    const buttonMap: Record<string, string> = {
      ArrowUp: 'up',
      w: 'up',
      W: 'up',
      ArrowDown: 'down',
      s: 'down',
      S: 'down',
      ArrowLeft: 'left',
      a: 'left',
      A: 'left',
      ArrowRight: 'right',
      d: 'right',
      D: 'right',
      x: 'x',
      X: 'x',
      ' ': 'x',
      z: 'z',
      Z: 'z',
    };

    if (buttonMap[e.key]) {
      setPressedButtons((prev) => new Set([...prev, buttonMap[e.key]]));
    }
  }, []);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    const vm = vmRef.current;
    if (!vm) return;

    vm.handleKeyUp(e.key);

    const buttonMap: Record<string, string> = {
      ArrowUp: 'up',
      w: 'up',
      W: 'up',
      ArrowDown: 'down',
      s: 'down',
      S: 'down',
      ArrowLeft: 'left',
      a: 'left',
      A: 'left',
      ArrowRight: 'right',
      d: 'right',
      D: 'right',
      x: 'x',
      X: 'x',
      ' ': 'x',
      z: 'z',
      Z: 'z',
    };

    if (buttonMap[e.key]) {
      setPressedButtons((prev) => {
        const next = new Set(prev);
        next.delete(buttonMap[e.key]);
        return next;
      });
    }
  }, []);

  // Set up keyboard listeners
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.focus();
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  // Game control functions
  const loadGame = async (gameId: string) => {
    const vm = vmRef.current;
    if (!vm) return;

    await vm.loadGame(gameId);
    setSelectedGame(gameId);
  };

  const startGame = () => {
    vmRef.current?.start();
    setIsRunning(true);
  };

  const pauseGame = () => {
    vmRef.current?.pause();
    setIsRunning(false);
  };

  const resetGame = () => {
    vmRef.current?.reset();
    setIsRunning(false);
  };

  // Touch button handler
  const handleTouchButton = (button: string, pressed: boolean) => {
    const vm = vmRef.current;
    if (!vm) return;

    const buttonMap: Record<string, number> = {
      up: BUTTON.UP,
      down: BUTTON.DOWN,
      left: BUTTON.LEFT,
      right: BUTTON.RIGHT,
      x: BUTTON.X,
      z: BUTTON.Z,
    };

    if (buttonMap[button] !== undefined) {
      vm.setButton(buttonMap[button], pressed);

      if (pressed) {
        setPressedButtons((prev) => new Set([...prev, button]));
      } else {
        setPressedButtons((prev) => {
          const next = new Set(prev);
          next.delete(button);
          return next;
        });
      }
    }
  };

  // Styles
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: mode === 'combined' ? 'row' : 'column',
    gap: 16,
    padding: 16,
    backgroundColor: colors.bg,
    borderRadius: 8,
    fontFamily: 'monospace',
    outline: 'none',
    minHeight: 400,
  };

  const panelStyle: React.CSSProperties = {
    backgroundColor: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    padding: 12,
  };

  const buttonStyle: React.CSSProperties = {
    backgroundColor: colors.panel,
    border: `2px solid ${colors.border}`,
    borderRadius: 8,
    color: colors.text,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 14,
    padding: '8px 16px',
    transition: 'all 0.1s',
  };

  const activeButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    color: colors.bg,
  };

  const dpadButtonStyle: React.CSSProperties = {
    width: 50,
    height: 50,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
    userSelect: 'none',
    touchAction: 'manipulation',
  };

  return (
    <div ref={containerRef} style={containerStyle} tabIndex={0}>
      {/* Game Display */}
      {(mode === 'game' || mode === 'combined') && (
        <div style={panelStyle}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <span style={{ color: colors.text, fontWeight: 'bold' }}>
              {selectedGame || 'No Game'}
            </span>
            {showFPS && (
              <span style={{ color: colors.accent, fontSize: 12 }}>{currentFPS} FPS</span>
            )}
          </div>

          <canvas
            ref={canvasRef}
            width={160}
            height={160}
            style={{
              width: 320,
              height: 320,
              imageRendering: 'pixelated',
              border: `2px solid ${colors.border}`,
              borderRadius: 4,
              backgroundColor: '#000',
            }}
          />

          {/* Game Controls */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {!isRunning ? (
              <button
                style={activeButtonStyle}
                onClick={startGame}
                disabled={!selectedGame}
              >
                ▶ Play
              </button>
            ) : (
              <button style={buttonStyle} onClick={pauseGame}>
                ⏸ Pause
              </button>
            )}
            <button style={buttonStyle} onClick={resetGame}>
              ↺ Reset
            </button>
          </div>

          {/* Game Selection */}
          <div style={{ marginTop: 12 }}>
            <div style={{ color: colors.text, fontSize: 12, marginBottom: 8 }}>
              Select Game:
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {GAME_LIBRARY.map((game) => (
                <button
                  key={game.id}
                  style={selectedGame === game.id ? activeButtonStyle : buttonStyle}
                  onClick={() => loadGame(game.id)}
                >
                  {game.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Controller */}
      {(mode === 'controller' || mode === 'combined') && (
        <div style={panelStyle}>
          <div style={{ color: colors.text, fontWeight: 'bold', marginBottom: 12 }}>
            Controls
          </div>

          {/* D-Pad */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 50px)',
              gap: 4,
              marginBottom: 16,
            }}
          >
            <div />
            <button
              style={{
                ...buttonStyle,
                ...dpadButtonStyle,
                ...(pressedButtons.has('up') ? activeButtonStyle : {}),
              }}
              onMouseDown={() => handleTouchButton('up', true)}
              onMouseUp={() => handleTouchButton('up', false)}
              onMouseLeave={() => handleTouchButton('up', false)}
              onTouchStart={() => handleTouchButton('up', true)}
              onTouchEnd={() => handleTouchButton('up', false)}
            >
              ▲
            </button>
            <div />
            <button
              style={{
                ...buttonStyle,
                ...dpadButtonStyle,
                ...(pressedButtons.has('left') ? activeButtonStyle : {}),
              }}
              onMouseDown={() => handleTouchButton('left', true)}
              onMouseUp={() => handleTouchButton('left', false)}
              onMouseLeave={() => handleTouchButton('left', false)}
              onTouchStart={() => handleTouchButton('left', true)}
              onTouchEnd={() => handleTouchButton('left', false)}
            >
              ◀
            </button>
            <div />
            <button
              style={{
                ...buttonStyle,
                ...dpadButtonStyle,
                ...(pressedButtons.has('right') ? activeButtonStyle : {}),
              }}
              onMouseDown={() => handleTouchButton('right', true)}
              onMouseUp={() => handleTouchButton('right', false)}
              onMouseLeave={() => handleTouchButton('right', false)}
              onTouchStart={() => handleTouchButton('right', true)}
              onTouchEnd={() => handleTouchButton('right', false)}
            >
              ▶
            </button>
            <div />
            <button
              style={{
                ...buttonStyle,
                ...dpadButtonStyle,
                ...(pressedButtons.has('down') ? activeButtonStyle : {}),
              }}
              onMouseDown={() => handleTouchButton('down', true)}
              onMouseUp={() => handleTouchButton('down', false)}
              onMouseLeave={() => handleTouchButton('down', false)}
              onTouchStart={() => handleTouchButton('down', true)}
              onTouchEnd={() => handleTouchButton('down', false)}
            >
              ▼
            </button>
            <div />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              style={{
                ...buttonStyle,
                width: 60,
                height: 60,
                borderRadius: 30,
                fontSize: 16,
                fontWeight: 'bold',
                ...(pressedButtons.has('z') ? activeButtonStyle : {}),
              }}
              onMouseDown={() => handleTouchButton('z', true)}
              onMouseUp={() => handleTouchButton('z', false)}
              onMouseLeave={() => handleTouchButton('z', false)}
              onTouchStart={() => handleTouchButton('z', true)}
              onTouchEnd={() => handleTouchButton('z', false)}
            >
              Z
            </button>
            <button
              style={{
                ...buttonStyle,
                width: 60,
                height: 60,
                borderRadius: 30,
                fontSize: 16,
                fontWeight: 'bold',
                ...(pressedButtons.has('x') ? activeButtonStyle : {}),
              }}
              onMouseDown={() => handleTouchButton('x', true)}
              onMouseUp={() => handleTouchButton('x', false)}
              onMouseLeave={() => handleTouchButton('x', false)}
              onTouchStart={() => handleTouchButton('x', true)}
              onTouchEnd={() => handleTouchButton('x', false)}
            >
              X
            </button>
          </div>

          {/* Keyboard hint */}
          <div
            style={{
              color: colors.border,
              fontSize: 10,
              textAlign: 'center',
              marginTop: 12,
            }}
          >
            Arrow keys / WASD to move
            <br />
            X/Z or Space for action
          </div>
        </div>
      )}

      {/* Monitor */}
      {(mode === 'monitor' || mode === 'combined') && robotState && (
        <div style={{ ...panelStyle, minWidth: 200 }}>
          <div style={{ color: colors.text, fontWeight: 'bold', marginBottom: 12 }}>
            Robot Status
          </div>

          {/* Floor Map */}
          <canvas
            ref={mapCanvasRef}
            width={150}
            height={150}
            style={{
              width: 150,
              height: 150,
              border: `1px solid ${colors.border}`,
              borderRadius: 4,
              marginBottom: 12,
            }}
          />

          {/* Stats */}
          <div style={{ fontSize: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <div style={{ color: colors.border }}>Position</div>
                <div style={{ color: colors.text }}>
                  ({robotState.x.toFixed(0)}, {robotState.y.toFixed(0)})
                </div>
              </div>
              <div>
                <div style={{ color: colors.border }}>Heading</div>
                <div style={{ color: colors.text }}>{robotState.heading.toFixed(0)}°</div>
              </div>
              <div>
                <div style={{ color: colors.border }}>Front</div>
                <div style={{ color: colors.text }}>
                  {robotState.distanceFront.toFixed(0)} cm
                </div>
              </div>
              <div>
                <div style={{ color: colors.border }}>Speed</div>
                <div style={{ color: colors.text }}>
                  {robotState.linearVelocity.toFixed(0)} cm/s
                </div>
              </div>
              <div>
                <div style={{ color: colors.border }}>Battery</div>
                <div
                  style={{
                    color: robotState.batteryPercent > 20 ? colors.accent : colors.danger,
                  }}
                >
                  {robotState.batteryPercent.toFixed(0)}%
                </div>
              </div>
              <div>
                <div style={{ color: colors.border }}>Mode</div>
                <div style={{ color: colors.accent }}>{robotState.mode}</div>
              </div>
            </div>
          </div>

          {/* Connection Status */}
          <div
            style={{
              marginTop: 12,
              padding: 8,
              backgroundColor: connected ? colors.accent + '22' : colors.danger + '22',
              borderRadius: 4,
              textAlign: 'center',
              fontSize: 11,
              color: connected ? colors.accent : colors.danger,
            }}
          >
            {connected ? '● Connected' : '○ Disconnected'}
          </div>
        </div>
      )}
    </div>
  );
};

export default WASM4RobotApplet;

/**
 * WASM4 Built-in Games
 *
 * JavaScript implementations of classic games that run on the WASM4 runtime.
 * These games can control the cube robot when in game mode.
 *
 * Games:
 * - Snake: Classic snake game
 * - Pong: Classic paddle game
 * - Maze Runner: Procedural maze navigation
 * - Line Follower: Robot follows a line
 * - Obstacle Course: Navigate through obstacles
 */

import { BUTTON } from './wasm4-runtime';

// Game interface
export interface WASM4Game {
  name: string;
  init: () => void;
  update: (gamepad: number, framebuffer: Uint8Array, frame: number) => void;
  getRobotCommand?: () => { leftSpeed: number; rightSpeed: number };
}

// Helper to set pixel in framebuffer
const setPixel = (fb: Uint8Array, x: number, y: number, color: number): void => {
  if (x < 0 || x >= 160 || y < 0 || y >= 160) return;
  fb[y * 160 + x] = color & 3;
};

// Helper to draw rectangle
const drawRect = (
  fb: Uint8Array,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number
): void => {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      setPixel(fb, px, py, color);
    }
  }
};

// Helper to draw text (simple 5x7 font)
const FONT: { [char: string]: number[] } = {
  '0': [0x7C, 0x8A, 0x92, 0xA2, 0x7C],
  '1': [0x00, 0x42, 0xFE, 0x02, 0x00],
  '2': [0x46, 0x8A, 0x92, 0x92, 0x62],
  '3': [0x44, 0x82, 0x92, 0x92, 0x6C],
  '4': [0x18, 0x28, 0x48, 0xFE, 0x08],
  '5': [0xE4, 0xA2, 0xA2, 0xA2, 0x9C],
  '6': [0x3C, 0x52, 0x92, 0x92, 0x0C],
  '7': [0x80, 0x8E, 0x90, 0xA0, 0xC0],
  '8': [0x6C, 0x92, 0x92, 0x92, 0x6C],
  '9': [0x60, 0x92, 0x92, 0x94, 0x78],
  S: [0x64, 0x92, 0x92, 0x92, 0x4C],
  N: [0xFE, 0x40, 0x20, 0x10, 0xFE],
  A: [0x3E, 0x48, 0x88, 0x48, 0x3E],
  K: [0xFE, 0x10, 0x28, 0x44, 0x82],
  E: [0xFE, 0x92, 0x92, 0x92, 0x82],
  P: [0xFE, 0x90, 0x90, 0x90, 0x60],
  O: [0x7C, 0x82, 0x82, 0x82, 0x7C],
  G: [0x7C, 0x82, 0x92, 0x92, 0x5C],
  M: [0xFE, 0x40, 0x20, 0x40, 0xFE],
  Z: [0x86, 0x8A, 0x92, 0xA2, 0xC2],
  R: [0xFE, 0x90, 0x98, 0x94, 0x62],
  W: [0xFE, 0x04, 0x08, 0x04, 0xFE],
  I: [0x00, 0x82, 0xFE, 0x82, 0x00],
  ' ': [0x00, 0x00, 0x00, 0x00, 0x00],
};

const drawChar = (fb: Uint8Array, char: string, x: number, y: number, color: number): void => {
  const glyph = FONT[char.toUpperCase()] || FONT[' '];
  for (let col = 0; col < 5; col++) {
    for (let row = 0; row < 8; row++) {
      if ((glyph[col] >> row) & 1) {
        setPixel(fb, x + col, y + row, color);
      }
    }
  }
};

const drawText = (fb: Uint8Array, text: string, x: number, y: number, color: number): void => {
  for (let i = 0; i < text.length; i++) {
    drawChar(fb, text[i], x + i * 6, y, color);
  }
};

// === SNAKE GAME ===

interface SnakeState {
  snake: Array<{ x: number; y: number }>;
  food: { x: number; y: number };
  direction: number; // 0=up, 1=right, 2=down, 3=left
  nextDirection: number;
  score: number;
  gameOver: boolean;
  speed: number;
  frameCount: number;
}

const createSnakeGame = (): WASM4Game => {
  const GRID_SIZE = 8;
  const GRID_WIDTH = 160 / GRID_SIZE;
  const GRID_HEIGHT = 160 / GRID_SIZE;

  let state: SnakeState = {
    snake: [],
    food: { x: 0, y: 0 },
    direction: 1,
    nextDirection: 1,
    score: 0,
    gameOver: false,
    speed: 8,
    frameCount: 0,
  };

  const spawnFood = (): void => {
    let valid = false;
    while (!valid) {
      state.food.x = Math.floor(Math.random() * GRID_WIDTH);
      state.food.y = Math.floor(Math.random() * GRID_HEIGHT);
      valid = !state.snake.some((s) => s.x === state.food.x && s.y === state.food.y);
    }
  };

  return {
    name: 'Snake',

    init: () => {
      state = {
        snake: [{ x: 10, y: 10 }],
        food: { x: 15, y: 10 },
        direction: 1,
        nextDirection: 1,
        score: 0,
        gameOver: false,
        speed: 8,
        frameCount: 0,
      };
      spawnFood();
    },

    update: (gamepad: number, fb: Uint8Array, frame: number) => {
      // Clear
      fb.fill(0);

      // Handle input
      if ((gamepad & BUTTON.UP) && state.direction !== 2) state.nextDirection = 0;
      if ((gamepad & BUTTON.RIGHT) && state.direction !== 3) state.nextDirection = 1;
      if ((gamepad & BUTTON.DOWN) && state.direction !== 0) state.nextDirection = 2;
      if ((gamepad & BUTTON.LEFT) && state.direction !== 1) state.nextDirection = 3;

      if (state.gameOver) {
        // Draw game over
        drawText(fb, 'GAME OVER', 45, 70, 3);
        drawText(fb, `SCORE ${state.score}`, 50, 85, 2);
        drawText(fb, 'PRESS Z', 55, 100, 1);

        if (gamepad & BUTTON.Z) {
          state.gameOver = false;
          state.snake = [{ x: 10, y: 10 }];
          state.direction = 1;
          state.nextDirection = 1;
          state.score = 0;
          spawnFood();
        }
        return;
      }

      state.frameCount++;

      // Move snake every N frames
      if (state.frameCount % state.speed === 0) {
        state.direction = state.nextDirection;

        // Calculate new head position
        const head = state.snake[0];
        let newHead = { x: head.x, y: head.y };

        switch (state.direction) {
          case 0:
            newHead.y--;
            break;
          case 1:
            newHead.x++;
            break;
          case 2:
            newHead.y++;
            break;
          case 3:
            newHead.x--;
            break;
        }

        // Wrap around
        newHead.x = (newHead.x + GRID_WIDTH) % GRID_WIDTH;
        newHead.y = (newHead.y + GRID_HEIGHT) % GRID_HEIGHT;

        // Check self collision
        if (state.snake.some((s) => s.x === newHead.x && s.y === newHead.y)) {
          state.gameOver = true;
          return;
        }

        // Add new head
        state.snake.unshift(newHead);

        // Check food
        if (newHead.x === state.food.x && newHead.y === state.food.y) {
          state.score += 10;
          spawnFood();
          // Speed up slightly
          if (state.speed > 3) state.speed = Math.max(3, state.speed - 0.5);
        } else {
          // Remove tail
          state.snake.pop();
        }
      }

      // Draw border
      for (let i = 0; i < 160; i++) {
        setPixel(fb, i, 0, 1);
        setPixel(fb, i, 159, 1);
        setPixel(fb, 0, i, 1);
        setPixel(fb, 159, i, 1);
      }

      // Draw food
      drawRect(fb, state.food.x * GRID_SIZE, state.food.y * GRID_SIZE, GRID_SIZE - 1, GRID_SIZE - 1, 2);

      // Draw snake
      state.snake.forEach((segment, i) => {
        const color = i === 0 ? 3 : 1; // Head is brighter
        drawRect(fb, segment.x * GRID_SIZE, segment.y * GRID_SIZE, GRID_SIZE - 1, GRID_SIZE - 1, color);
      });

      // Draw score
      drawText(fb, `${state.score}`, 3, 3, 2);
    },

    getRobotCommand: () => {
      // Map snake direction to robot movement
      const speed = 40;
      switch (state.direction) {
        case 0:
          return { leftSpeed: speed, rightSpeed: speed }; // Up = forward
        case 1:
          return { leftSpeed: speed, rightSpeed: -speed * 0.5 }; // Right = turn right
        case 2:
          return { leftSpeed: -speed, rightSpeed: -speed }; // Down = backward
        case 3:
          return { leftSpeed: -speed * 0.5, rightSpeed: speed }; // Left = turn left
        default:
          return { leftSpeed: 0, rightSpeed: 0 };
      }
    },
  };
};

// === PONG GAME ===

interface PongState {
  paddleY: number;
  ballX: number;
  ballY: number;
  ballVX: number;
  ballVY: number;
  score: number;
  aiPaddleY: number;
  gameOver: boolean;
}

const createPongGame = (): WASM4Game => {
  const PADDLE_HEIGHT = 24;
  const PADDLE_WIDTH = 4;
  const BALL_SIZE = 4;

  let state: PongState = {
    paddleY: 68,
    ballX: 80,
    ballY: 80,
    ballVX: 2,
    ballVY: 1,
    score: 0,
    aiPaddleY: 68,
    gameOver: false,
  };

  return {
    name: 'Pong',

    init: () => {
      state = {
        paddleY: 68,
        ballX: 80,
        ballY: 80,
        ballVX: 2,
        ballVY: 1,
        score: 0,
        aiPaddleY: 68,
        gameOver: false,
      };
    },

    update: (gamepad: number, fb: Uint8Array, frame: number) => {
      fb.fill(0);

      // Handle input
      if (gamepad & BUTTON.UP) state.paddleY = Math.max(0, state.paddleY - 3);
      if (gamepad & BUTTON.DOWN) state.paddleY = Math.min(160 - PADDLE_HEIGHT, state.paddleY + 3);

      if (state.gameOver) {
        drawText(fb, 'GAME OVER', 45, 70, 3);
        drawText(fb, `SCORE ${state.score}`, 50, 85, 2);
        if (gamepad & BUTTON.Z) {
          state.gameOver = false;
          state.ballX = 80;
          state.ballY = 80;
          state.ballVX = 2;
          state.ballVY = 1;
          state.score = 0;
        }
        return;
      }

      // Move ball
      state.ballX += state.ballVX;
      state.ballY += state.ballVY;

      // Ball collision with top/bottom
      if (state.ballY <= 0 || state.ballY >= 160 - BALL_SIZE) {
        state.ballVY = -state.ballVY;
        state.ballY = Math.max(0, Math.min(160 - BALL_SIZE, state.ballY));
      }

      // Ball collision with player paddle
      if (
        state.ballX <= 10 + PADDLE_WIDTH &&
        state.ballY + BALL_SIZE >= state.paddleY &&
        state.ballY <= state.paddleY + PADDLE_HEIGHT
      ) {
        state.ballVX = Math.abs(state.ballVX) + 0.1;
        state.ballVY += (state.ballY - state.paddleY - PADDLE_HEIGHT / 2) * 0.1;
        state.score++;
      }

      // AI paddle movement
      const aiTarget = state.ballY - PADDLE_HEIGHT / 2;
      state.aiPaddleY += (aiTarget - state.aiPaddleY) * 0.05;
      state.aiPaddleY = Math.max(0, Math.min(160 - PADDLE_HEIGHT, state.aiPaddleY));

      // Ball collision with AI paddle
      if (
        state.ballX >= 150 - PADDLE_WIDTH - BALL_SIZE &&
        state.ballY + BALL_SIZE >= state.aiPaddleY &&
        state.ballY <= state.aiPaddleY + PADDLE_HEIGHT
      ) {
        state.ballVX = -Math.abs(state.ballVX);
      }

      // Ball out of bounds
      if (state.ballX < 0) {
        state.gameOver = true;
      }
      if (state.ballX > 160) {
        state.ballX = 80;
        state.ballY = 80;
        state.ballVX = -2;
        state.ballVY = (Math.random() - 0.5) * 4;
        state.score += 5;
      }

      // Draw center line
      for (let y = 0; y < 160; y += 10) {
        drawRect(fb, 79, y, 2, 5, 1);
      }

      // Draw paddles
      drawRect(fb, 10, Math.floor(state.paddleY), PADDLE_WIDTH, PADDLE_HEIGHT, 3);
      drawRect(fb, 150 - PADDLE_WIDTH, Math.floor(state.aiPaddleY), PADDLE_WIDTH, PADDLE_HEIGHT, 2);

      // Draw ball
      drawRect(fb, Math.floor(state.ballX), Math.floor(state.ballY), BALL_SIZE, BALL_SIZE, 3);

      // Draw score
      drawText(fb, `${state.score}`, 70, 5, 2);
    },

    getRobotCommand: () => {
      // Robot follows paddle position (move up/down only)
      const targetY = 100; // Center of floor
      const currentY = (state.paddleY / 160) * 200; // Map to floor coords
      const diff = currentY - targetY;

      if (Math.abs(diff) < 5) {
        return { leftSpeed: 0, rightSpeed: 0 };
      }

      const speed = Math.min(40, Math.abs(diff));
      if (diff > 0) {
        return { leftSpeed: speed, rightSpeed: speed }; // Move forward
      } else {
        return { leftSpeed: -speed, rightSpeed: -speed }; // Move backward
      }
    },
  };
};

// === MAZE RUNNER GAME ===

interface MazeState {
  playerX: number;
  playerY: number;
  goalX: number;
  goalY: number;
  maze: number[][];
  level: number;
  won: boolean;
}

const createMazeGame = (): WASM4Game => {
  const CELL_SIZE = 8;
  const MAZE_WIDTH = 20;
  const MAZE_HEIGHT = 20;

  let state: MazeState = {
    playerX: 1,
    playerY: 1,
    goalX: 18,
    goalY: 18,
    maze: [],
    level: 1,
    won: false,
  };

  const generateMaze = (): void => {
    // Initialize with walls
    state.maze = Array(MAZE_HEIGHT)
      .fill(null)
      .map(() => Array(MAZE_WIDTH).fill(1));

    // Simple maze generation using recursive backtracking
    const stack: Array<[number, number]> = [];
    const visited = new Set<string>();

    const startX = 1;
    const startY = 1;
    state.maze[startY][startX] = 0;
    visited.add(`${startX},${startY}`);
    stack.push([startX, startY]);

    const directions = [
      [0, -2],
      [2, 0],
      [0, 2],
      [-2, 0],
    ];

    while (stack.length > 0) {
      const [cx, cy] = stack[stack.length - 1];

      // Shuffle directions
      const shuffled = [...directions].sort(() => Math.random() - 0.5);

      let found = false;
      for (const [dx, dy] of shuffled) {
        const nx = cx + dx;
        const ny = cy + dy;

        if (
          nx > 0 &&
          nx < MAZE_WIDTH - 1 &&
          ny > 0 &&
          ny < MAZE_HEIGHT - 1 &&
          !visited.has(`${nx},${ny}`)
        ) {
          // Carve path
          state.maze[cy + dy / 2][cx + dx / 2] = 0;
          state.maze[ny][nx] = 0;
          visited.add(`${nx},${ny}`);
          stack.push([nx, ny]);
          found = true;
          break;
        }
      }

      if (!found) {
        stack.pop();
      }
    }

    // Ensure goal is reachable
    state.maze[state.goalY][state.goalX] = 0;
    state.maze[state.goalY - 1][state.goalX] = 0;
  };

  return {
    name: 'Maze Runner',

    init: () => {
      state.playerX = 1;
      state.playerY = 1;
      state.goalX = 18;
      state.goalY = 18;
      state.level = 1;
      state.won = false;
      generateMaze();
    },

    update: (gamepad: number, fb: Uint8Array, frame: number) => {
      fb.fill(0);

      if (state.won) {
        drawText(fb, 'LEVEL', 55, 60, 2);
        drawText(fb, 'COMPLETE', 45, 75, 3);
        drawText(fb, 'PRESS Z', 55, 100, 1);

        if (gamepad & BUTTON.Z) {
          state.level++;
          state.playerX = 1;
          state.playerY = 1;
          state.won = false;
          generateMaze();
        }
        return;
      }

      // Handle input (with debounce)
      if (frame % 8 === 0) {
        let newX = state.playerX;
        let newY = state.playerY;

        if (gamepad & BUTTON.UP) newY--;
        if (gamepad & BUTTON.DOWN) newY++;
        if (gamepad & BUTTON.LEFT) newX--;
        if (gamepad & BUTTON.RIGHT) newX++;

        // Check collision
        if (
          newX >= 0 &&
          newX < MAZE_WIDTH &&
          newY >= 0 &&
          newY < MAZE_HEIGHT &&
          state.maze[newY][newX] === 0
        ) {
          state.playerX = newX;
          state.playerY = newY;
        }
      }

      // Check win
      if (state.playerX === state.goalX && state.playerY === state.goalY) {
        state.won = true;
      }

      // Draw maze
      for (let y = 0; y < MAZE_HEIGHT; y++) {
        for (let x = 0; x < MAZE_WIDTH; x++) {
          if (state.maze[y][x] === 1) {
            drawRect(fb, x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE, 1);
          }
        }
      }

      // Draw goal
      drawRect(fb, state.goalX * CELL_SIZE, state.goalY * CELL_SIZE, CELL_SIZE, CELL_SIZE, 2);

      // Draw player
      drawRect(
        fb,
        state.playerX * CELL_SIZE + 1,
        state.playerY * CELL_SIZE + 1,
        CELL_SIZE - 2,
        CELL_SIZE - 2,
        3
      );

      // Draw level
      drawText(fb, `L${state.level}`, 145, 3, 2);
    },

    getRobotCommand: () => {
      // Robot mirrors player movement in maze
      return { leftSpeed: 0, rightSpeed: 0 }; // Will be set by direction
    },
  };
};

// === LINE FOLLOWER GAME ===

const createLineFollowerGame = (): WASM4Game => {
  let robotX = 80;
  let robotY = 140;
  let robotAngle = 270; // Facing up
  let score = 0;
  let frameCount = 0;

  // Track points (forms a figure-8)
  const track: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 360; i += 5) {
    const t = (i * Math.PI) / 180;
    // Figure-8 parametric curve
    const scale = 50;
    const x = 80 + scale * Math.sin(t);
    const y = 80 + scale * Math.sin(t) * Math.cos(t);
    track.push({ x, y });
  }

  return {
    name: 'Line Follower',

    init: () => {
      robotX = 80;
      robotY = 140;
      robotAngle = 270;
      score = 0;
      frameCount = 0;
    },

    update: (gamepad: number, fb: Uint8Array, frame: number) => {
      fb.fill(0);
      frameCount++;

      // Draw track
      for (let i = 0; i < track.length; i++) {
        const p = track[i];
        drawRect(fb, Math.floor(p.x) - 2, Math.floor(p.y) - 2, 4, 4, 1);
      }

      // Handle input
      const turnSpeed = 3;
      const moveSpeed = 1.5;

      if (gamepad & BUTTON.LEFT) robotAngle -= turnSpeed;
      if (gamepad & BUTTON.RIGHT) robotAngle += turnSpeed;

      if (gamepad & BUTTON.UP) {
        robotX += Math.cos((robotAngle * Math.PI) / 180) * moveSpeed;
        robotY += Math.sin((robotAngle * Math.PI) / 180) * moveSpeed;
      }
      if (gamepad & BUTTON.DOWN) {
        robotX -= Math.cos((robotAngle * Math.PI) / 180) * moveSpeed * 0.5;
        robotY -= Math.sin((robotAngle * Math.PI) / 180) * moveSpeed * 0.5;
      }

      // Keep in bounds
      robotX = Math.max(10, Math.min(150, robotX));
      robotY = Math.max(10, Math.min(150, robotY));

      // Check if on track
      let onTrack = false;
      for (const p of track) {
        const dist = Math.sqrt(Math.pow(robotX - p.x, 2) + Math.pow(robotY - p.y, 2));
        if (dist < 8) {
          onTrack = true;
          break;
        }
      }

      if (onTrack && frameCount % 10 === 0) {
        score++;
      }

      // Draw robot
      const rx = Math.floor(robotX);
      const ry = Math.floor(robotY);
      drawRect(fb, rx - 4, ry - 4, 8, 8, onTrack ? 3 : 2);

      // Draw direction
      const dx = Math.floor(Math.cos((robotAngle * Math.PI) / 180) * 6);
      const dy = Math.floor(Math.sin((robotAngle * Math.PI) / 180) * 6);
      setPixel(fb, rx + dx, ry + dy, 3);
      setPixel(fb, rx + dx - 1, ry + dy, 3);
      setPixel(fb, rx + dx + 1, ry + dy, 3);
      setPixel(fb, rx + dx, ry + dy - 1, 3);
      setPixel(fb, rx + dx, ry + dy + 1, 3);

      // Draw score
      drawText(fb, `${score}`, 3, 3, 2);

      // Draw instructions
      if (frameCount < 180) {
        drawText(fb, 'FOLLOW', 55, 145, 1);
        drawText(fb, 'THE LINE', 50, 152, 1);
      }
    },

    getRobotCommand: () => {
      // Calculate steering based on nearest track point
      let nearestDist = Infinity;
      let nearestAngle = 0;

      for (const p of track) {
        const dist = Math.sqrt(Math.pow(robotX - p.x, 2) + Math.pow(robotY - p.y, 2));
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestAngle = (Math.atan2(p.y - robotY, p.x - robotX) * 180) / Math.PI;
        }
      }

      const angleDiff = ((nearestAngle - robotAngle + 180) % 360) - 180;
      const baseSpeed = 30;

      if (Math.abs(angleDiff) < 10) {
        return { leftSpeed: baseSpeed, rightSpeed: baseSpeed };
      } else if (angleDiff > 0) {
        return { leftSpeed: baseSpeed, rightSpeed: baseSpeed * 0.5 };
      } else {
        return { leftSpeed: baseSpeed * 0.5, rightSpeed: baseSpeed };
      }
    },
  };
};

// === OBSTACLE COURSE GAME ===

const createObstacleCourseGame = (): WASM4Game => {
  let playerX = 80;
  let playerY = 140;
  let playerAngle = 270;
  let speed = 0;
  let score = 0;
  let crashed = false;
  let finishReached = false;

  const obstacles: Array<{ x: number; y: number; w: number; h: number }> = [
    { x: 40, y: 100, w: 20, h: 20 },
    { x: 100, y: 80, w: 25, h: 15 },
    { x: 60, y: 50, w: 15, h: 30 },
    { x: 110, y: 40, w: 20, h: 20 },
    { x: 30, y: 30, w: 15, h: 25 },
  ];

  const finish = { x: 70, y: 10, w: 20, h: 8 };

  return {
    name: 'Obstacle Course',

    init: () => {
      playerX = 80;
      playerY = 140;
      playerAngle = 270;
      speed = 0;
      score = 0;
      crashed = false;
      finishReached = false;
    },

    update: (gamepad: number, fb: Uint8Array, frame: number) => {
      fb.fill(0);

      if (crashed) {
        drawText(fb, 'CRASHED', 50, 70, 2);
        drawText(fb, 'PRESS Z', 55, 90, 1);
        if (gamepad & BUTTON.Z) {
          crashed = false;
          playerX = 80;
          playerY = 140;
          playerAngle = 270;
          speed = 0;
        }
        return;
      }

      if (finishReached) {
        drawText(fb, 'FINISHED', 45, 60, 3);
        drawText(fb, `SCORE ${score}`, 50, 80, 2);
        drawText(fb, 'PRESS Z', 55, 100, 1);
        if (gamepad & BUTTON.Z) {
          finishReached = false;
          playerX = 80;
          playerY = 140;
          playerAngle = 270;
          speed = 0;
          score = 0;
        }
        return;
      }

      // Input
      if (gamepad & BUTTON.LEFT) playerAngle -= 4;
      if (gamepad & BUTTON.RIGHT) playerAngle += 4;
      if (gamepad & BUTTON.UP) speed = Math.min(3, speed + 0.2);
      if (gamepad & BUTTON.DOWN) speed = Math.max(-1, speed - 0.1);

      // Friction
      speed *= 0.98;

      // Move
      playerX += Math.cos((playerAngle * Math.PI) / 180) * speed;
      playerY += Math.sin((playerAngle * Math.PI) / 180) * speed;

      // Bounds
      if (playerX < 5 || playerX > 155 || playerY < 5 || playerY > 155) {
        crashed = true;
      }

      // Check obstacle collision
      for (const obs of obstacles) {
        if (
          playerX > obs.x - 4 &&
          playerX < obs.x + obs.w + 4 &&
          playerY > obs.y - 4 &&
          playerY < obs.y + obs.h + 4
        ) {
          crashed = true;
        }
      }

      // Check finish
      if (
        playerX > finish.x &&
        playerX < finish.x + finish.w &&
        playerY > finish.y &&
        playerY < finish.y + finish.h
      ) {
        finishReached = true;
        score = Math.max(0, 1000 - frame);
      }

      // Draw finish line
      for (let i = 0; i < finish.w; i += 4) {
        drawRect(fb, finish.x + i, finish.y, 2, finish.h, i % 8 === 0 ? 3 : 0);
      }

      // Draw obstacles
      for (const obs of obstacles) {
        drawRect(fb, obs.x, obs.y, obs.w, obs.h, 2);
      }

      // Draw borders
      for (let i = 0; i < 160; i++) {
        setPixel(fb, i, 0, 1);
        setPixel(fb, i, 159, 1);
        setPixel(fb, 0, i, 1);
        setPixel(fb, 159, i, 1);
      }

      // Draw player
      const px = Math.floor(playerX);
      const py = Math.floor(playerY);
      drawRect(fb, px - 3, py - 3, 6, 6, 3);

      // Draw direction
      const dx = Math.floor(Math.cos((playerAngle * Math.PI) / 180) * 5);
      const dy = Math.floor(Math.sin((playerAngle * Math.PI) / 180) * 5);
      setPixel(fb, px + dx, py + dy, 3);
    },

    getRobotCommand: () => {
      // Robot mirrors player movement
      const baseSpeed = speed * 15;
      return {
        leftSpeed: baseSpeed,
        rightSpeed: baseSpeed,
      };
    },
  };
};

// === Game Factory ===

export const GAMES: Record<string, () => WASM4Game> = {
  snake: createSnakeGame,
  pong: createPongGame,
  'maze-runner': createMazeGame,
  'line-follower': createLineFollowerGame,
  'obstacle-course': createObstacleCourseGame,
};

export function createGame(gameId: string): WASM4Game | null {
  const factory = GAMES[gameId];
  if (!factory) return null;
  return factory();
}

export default GAMES;

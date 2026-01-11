/**
 * WASM4 Runtime - 160x160 4-color Fantasy Console
 *
 * A browser-based implementation of the WASM-4 fantasy console specification.
 * Designed for ESP32-S3 devices with WASM4 games that can also control cube robots.
 *
 * Inspired by https://wasm4.org
 *
 * Features:
 * - 160x160 pixel display with 4-color palette
 * - 64KB memory with memory-mapped I/O
 * - Gamepad input (DPAD + 2 buttons)
 * - Sound synthesis (4 channels)
 * - Persistent storage (256 bytes)
 * - Mouse/touch input
 */

// ═══════════════════════════════════════════════════════════════════════════
// WASM4 MEMORY MAP (matches official spec)
// ═══════════════════════════════════════════════════════════════════════════

export const WASM4_MEMORY = {
  // System reserved (0x00-0x03)
  PALETTE: 0x0004,           // 4 colors, 4 bytes each (16 bytes)
  DRAW_COLORS: 0x0014,       // 2 bytes
  GAMEPAD1: 0x0016,          // 1 byte
  GAMEPAD2: 0x0017,          // 1 byte
  GAMEPAD3: 0x0018,          // 1 byte
  GAMEPAD4: 0x0019,          // 1 byte
  MOUSE_X: 0x001a,           // 2 bytes (signed)
  MOUSE_Y: 0x001c,           // 2 bytes (signed)
  MOUSE_BUTTONS: 0x001e,     // 1 byte
  SYSTEM_FLAGS: 0x001f,      // 1 byte
  NETPLAY: 0x0020,           // 1 byte
  RESERVED: 0x0021,          // Reserved (95 bytes)

  // Framebuffer (6400 bytes for 160x160 @ 2bpp)
  FRAMEBUFFER: 0x00a0,
  FRAMEBUFFER_SIZE: 6400,

  // User memory starts after framebuffer
  USER_MEMORY: 0x19a0,

  // Total memory size
  TOTAL_SIZE: 65536,         // 64KB
};

// Button masks
export const BUTTON = {
  X: 0x01,      // Button 1
  Z: 0x02,      // Button 2
  LEFT: 0x10,
  RIGHT: 0x20,
  UP: 0x40,
  DOWN: 0x80,
};

// Mouse button masks
export const MOUSE_BUTTON = {
  LEFT: 0x01,
  RIGHT: 0x02,
  MIDDLE: 0x04,
};

// System flags
export const SYSTEM_FLAG = {
  PRESERVE_FRAMEBUFFER: 0x01,
  HIDE_GAMEPAD_OVERLAY: 0x02,
};

// Draw color constants
export const DRAW_COLORS = {
  NONE: 0,
  COLOR1: 1,
  COLOR2: 2,
  COLOR3: 3,
  COLOR4: 4,
};

// Blit flags
export const BLIT = {
  TWO_BPP: 0x01,
  FLIP_X: 0x02,
  FLIP_Y: 0x04,
  ROTATE: 0x08,
};

// Tone flags
export const TONE = {
  PULSE1: 0,
  PULSE2: 1,
  TRIANGLE: 2,
  NOISE: 3,
  MODE1: 0,
  MODE2: 4,
  MODE3: 8,
  MODE4: 12,
  PAN_LEFT: 16,
  PAN_RIGHT: 32,
};

// Display constants
export const SCREEN = {
  WIDTH: 160,
  HEIGHT: 160,
};

// Default dark palette (WASM4 style)
export const DEFAULT_PALETTE = [
  0xe0f8cf, // Light green (background)
  0x86c06c, // Medium green
  0x306850, // Dark green
  0x071821, // Almost black
];

// ═══════════════════════════════════════════════════════════════════════════
// WASM4 RUNTIME
// ═══════════════════════════════════════════════════════════════════════════

export interface WASM4Config {
  canvas?: HTMLCanvasElement;
  frameRate?: number;
  onFrame?: (framebuffer: Uint8Array) => void;
  onSound?: (channel: number, frequency: number, duration: number, volume: number, flags: number) => void;
  onDiskWrite?: (data: Uint8Array) => void;
}

export interface WASM4State {
  running: boolean;
  frameCount: number;
  palette: number[];
  drawColors: number;
  gamepad: number[];
  mouse: { x: number; y: number; buttons: number };
}

export class WASM4Runtime {
  private memory: WebAssembly.Memory;
  private memoryView: DataView;
  private memoryBytes: Uint8Array;

  private wasmInstance: WebAssembly.Instance | null = null;
  private config: Required<WASM4Config>;

  private running = false;
  private frameInterval: ReturnType<typeof setInterval> | null = null;
  private frameCount = 0;
  private startTime = 0;

  // Input state
  private gamepad = [0, 0, 0, 0];
  private prevGamepad = [0, 0, 0, 0];
  private mouseX = 0;
  private mouseY = 0;
  private mouseButtons = 0;

  // Audio context
  private audioContext: AudioContext | null = null;
  private oscillators: OscillatorNode[] = [];
  private gainNodes: GainNode[] = [];

  // Disk storage (256 bytes)
  private diskData = new Uint8Array(256);

  // Canvas rendering
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private imageData: ImageData | null = null;

  constructor(config: WASM4Config = {}) {
    this.config = {
      canvas: config.canvas || null as any,
      frameRate: config.frameRate ?? 60,
      onFrame: config.onFrame ?? (() => {}),
      onSound: config.onSound ?? (() => {}),
      onDiskWrite: config.onDiskWrite ?? (() => {}),
    };

    // Create WASM memory
    this.memory = new WebAssembly.Memory({
      initial: 1,    // 64KB
      maximum: 1,
    });

    this.memoryView = new DataView(this.memory.buffer);
    this.memoryBytes = new Uint8Array(this.memory.buffer);

    // Initialize default state
    this.initializeMemory();

    // Setup canvas if provided
    if (config.canvas) {
      this.setupCanvas(config.canvas);
    }
  }

  /**
   * Initialize memory with default values
   */
  private initializeMemory(): void {
    // Set default palette
    for (let i = 0; i < 4; i++) {
      this.memoryView.setUint32(WASM4_MEMORY.PALETTE + i * 4, DEFAULT_PALETTE[i], true);
    }

    // Set default draw colors (0x1234 = use all colors)
    this.memoryView.setUint16(WASM4_MEMORY.DRAW_COLORS, 0x1234, true);

    // Clear framebuffer
    this.memoryBytes.fill(0, WASM4_MEMORY.FRAMEBUFFER, WASM4_MEMORY.FRAMEBUFFER + WASM4_MEMORY.FRAMEBUFFER_SIZE);
  }

  /**
   * Setup canvas for rendering
   */
  private setupCanvas(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    if (this.ctx) {
      // Set canvas size
      canvas.width = SCREEN.WIDTH;
      canvas.height = SCREEN.HEIGHT;

      // Disable image smoothing for crisp pixels
      this.ctx.imageSmoothingEnabled = false;

      // Create image data for framebuffer
      this.imageData = this.ctx.createImageData(SCREEN.WIDTH, SCREEN.HEIGHT);

      // Setup input handlers
      this.setupInputHandlers(canvas);
    }
  }

  /**
   * Setup keyboard and mouse input handlers
   */
  private setupInputHandlers(canvas: HTMLCanvasElement): void {
    // Keyboard handlers
    const handleKeyDown = (e: KeyboardEvent) => {
      const button = this.keyToButton(e.key);
      if (button !== 0) {
        this.gamepad[0] |= button;
        e.preventDefault();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const button = this.keyToButton(e.key);
      if (button !== 0) {
        this.gamepad[0] &= ~button;
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Mouse handlers
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = SCREEN.WIDTH / rect.width;
      const scaleY = SCREEN.HEIGHT / rect.height;
      this.mouseX = Math.floor((e.clientX - rect.left) * scaleX);
      this.mouseY = Math.floor((e.clientY - rect.top) * scaleY);
    });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseButtons |= MOUSE_BUTTON.LEFT;
      if (e.button === 1) this.mouseButtons |= MOUSE_BUTTON.MIDDLE;
      if (e.button === 2) this.mouseButtons |= MOUSE_BUTTON.RIGHT;
    });

    canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseButtons &= ~MOUSE_BUTTON.LEFT;
      if (e.button === 1) this.mouseButtons &= ~MOUSE_BUTTON.MIDDLE;
      if (e.button === 2) this.mouseButtons &= ~MOUSE_BUTTON.RIGHT;
    });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /**
   * Map keyboard key to button
   */
  private keyToButton(key: string): number {
    switch (key.toLowerCase()) {
      case 'x':
      case ' ':
        return BUTTON.X;
      case 'z':
      case 'enter':
        return BUTTON.Z;
      case 'arrowleft':
      case 'a':
        return BUTTON.LEFT;
      case 'arrowright':
      case 'd':
        return BUTTON.RIGHT;
      case 'arrowup':
      case 'w':
        return BUTTON.UP;
      case 'arrowdown':
      case 's':
        return BUTTON.DOWN;
      default:
        return 0;
    }
  }

  /**
   * Load and run a WASM4 game
   */
  async loadCartridge(wasmBinary: Uint8Array): Promise<void> {
    const imports = this.createImports();

    const module = await WebAssembly.compile(wasmBinary.buffer as ArrayBuffer);
    this.wasmInstance = await WebAssembly.instantiate(module, imports);

    // Use exported memory if available
    if (this.wasmInstance.exports.memory) {
      this.memory = this.wasmInstance.exports.memory as WebAssembly.Memory;
      this.memoryView = new DataView(this.memory.buffer);
      this.memoryBytes = new Uint8Array(this.memory.buffer);
      this.initializeMemory();
    }

    // Call start function
    const startFn = this.wasmInstance.exports.start as Function | undefined;
    if (startFn) {
      try {
        startFn();
      } catch (error) {
        console.error('[WASM4] Error in start():', error);
      }
    }

    console.log('[WASM4] Cartridge loaded successfully');
  }

  /**
   * Create WASM imports (env functions)
   */
  private createImports(): WebAssembly.Imports {
    return {
      env: {
        memory: this.memory,

        // Drawing functions
        blit: this.blitImpl.bind(this),
        blitSub: this.blitSubImpl.bind(this),
        line: this.lineImpl.bind(this),
        hline: this.hlineImpl.bind(this),
        vline: this.vlineImpl.bind(this),
        oval: this.ovalImpl.bind(this),
        rect: this.rectImpl.bind(this),
        text: this.textImpl.bind(this),
        textUtf8: this.textUtf8Impl.bind(this),
        textUtf16: this.textUtf16Impl.bind(this),

        // Sound
        tone: this.toneImpl.bind(this),

        // Storage
        diskr: this.diskrImpl.bind(this),
        diskw: this.diskwImpl.bind(this),

        // Tracing
        trace: this.traceImpl.bind(this),
        traceUtf8: this.traceUtf8Impl.bind(this),
        traceUtf16: this.traceUtf16Impl.bind(this),
        tracef: this.tracefImpl.bind(this),
      },
    };
  }

  /**
   * Start the game loop
   */
  start(): void {
    if (this.running) return;

    this.running = true;
    this.startTime = Date.now();
    this.frameCount = 0;

    const frameInterval = 1000 / this.config.frameRate;

    this.frameInterval = setInterval(() => {
      this.updateFrame();
    }, frameInterval);

    console.log(`[WASM4] Started at ${this.config.frameRate} FPS`);
  }

  /**
   * Stop the game loop
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;

    if (this.frameInterval) {
      clearInterval(this.frameInterval);
      this.frameInterval = null;
    }

    console.log('[WASM4] Stopped');
  }

  /**
   * Update one frame
   */
  private updateFrame(): void {
    if (!this.wasmInstance) return;

    // Store previous gamepad state (for detecting button presses)
    for (let i = 0; i < 4; i++) {
      this.prevGamepad[i] = this.memoryBytes[WASM4_MEMORY.GAMEPAD1 + i];
    }

    // Update input state in memory
    for (let i = 0; i < 4; i++) {
      this.memoryBytes[WASM4_MEMORY.GAMEPAD1 + i] = this.gamepad[i];
    }
    this.memoryView.setInt16(WASM4_MEMORY.MOUSE_X, this.mouseX, true);
    this.memoryView.setInt16(WASM4_MEMORY.MOUSE_Y, this.mouseY, true);
    this.memoryBytes[WASM4_MEMORY.MOUSE_BUTTONS] = this.mouseButtons;

    // Clear framebuffer if not preserved
    const systemFlags = this.memoryBytes[WASM4_MEMORY.SYSTEM_FLAGS];
    if (!(systemFlags & SYSTEM_FLAG.PRESERVE_FRAMEBUFFER)) {
      this.memoryBytes.fill(0, WASM4_MEMORY.FRAMEBUFFER, WASM4_MEMORY.FRAMEBUFFER + WASM4_MEMORY.FRAMEBUFFER_SIZE);
    }

    // Call update function
    const updateFn = this.wasmInstance.exports.update as Function | undefined;
    if (updateFn) {
      try {
        updateFn();
      } catch (error) {
        console.error('[WASM4] Error in update():', error);
        this.stop();
        return;
      }
    }

    // Render framebuffer to canvas
    this.renderFramebuffer();

    // Notify callback
    const framebuffer = this.memoryBytes.slice(
      WASM4_MEMORY.FRAMEBUFFER,
      WASM4_MEMORY.FRAMEBUFFER + WASM4_MEMORY.FRAMEBUFFER_SIZE
    );
    this.config.onFrame(framebuffer);

    this.frameCount++;
  }

  /**
   * Render framebuffer to canvas
   */
  private renderFramebuffer(): void {
    if (!this.ctx || !this.imageData) return;

    const palette = [
      this.memoryView.getUint32(WASM4_MEMORY.PALETTE, true),
      this.memoryView.getUint32(WASM4_MEMORY.PALETTE + 4, true),
      this.memoryView.getUint32(WASM4_MEMORY.PALETTE + 8, true),
      this.memoryView.getUint32(WASM4_MEMORY.PALETTE + 12, true),
    ];

    const data = this.imageData.data;

    for (let y = 0; y < SCREEN.HEIGHT; y++) {
      for (let x = 0; x < SCREEN.WIDTH; x++) {
        const pixelIndex = y * SCREEN.WIDTH + x;
        const byteIndex = WASM4_MEMORY.FRAMEBUFFER + Math.floor(pixelIndex / 4);
        const bitOffset = (pixelIndex % 4) * 2;

        const colorIndex = (this.memoryBytes[byteIndex] >> bitOffset) & 0x03;
        const color = palette[colorIndex];

        const dataIndex = pixelIndex * 4;
        data[dataIndex] = (color >> 16) & 0xff;     // R
        data[dataIndex + 1] = (color >> 8) & 0xff;  // G
        data[dataIndex + 2] = color & 0xff;         // B
        data[dataIndex + 3] = 255;                  // A
      }
    }

    this.ctx.putImageData(this.imageData, 0, 0);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DRAWING FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  private getDrawColors(): [number, number, number, number] {
    const dc = this.memoryView.getUint16(WASM4_MEMORY.DRAW_COLORS, true);
    return [
      (dc & 0x000f) - 1,
      ((dc >> 4) & 0x000f) - 1,
      ((dc >> 8) & 0x000f) - 1,
      ((dc >> 12) & 0x000f) - 1,
    ];
  }

  private setPixel(x: number, y: number, colorIndex: number): void {
    if (x < 0 || x >= SCREEN.WIDTH || y < 0 || y >= SCREEN.HEIGHT) return;
    if (colorIndex < 0) return; // Transparent

    const pixelIndex = y * SCREEN.WIDTH + x;
    const byteIndex = WASM4_MEMORY.FRAMEBUFFER + Math.floor(pixelIndex / 4);
    const bitOffset = (pixelIndex % 4) * 2;

    const mask = ~(0x03 << bitOffset);
    this.memoryBytes[byteIndex] = (this.memoryBytes[byteIndex] & mask) | ((colorIndex & 0x03) << bitOffset);
  }

  private blitImpl(sprite: number, x: number, y: number, width: number, height: number, flags: number): void {
    this.blitSubImpl(sprite, x, y, width, height, 0, 0, width, flags);
  }

  private blitSubImpl(
    sprite: number, x: number, y: number, width: number, height: number,
    srcX: number, srcY: number, stride: number, flags: number
  ): void {
    const [dc0, dc1, dc2, dc3] = this.getDrawColors();
    const bpp = (flags & BLIT.TWO_BPP) ? 2 : 1;
    const flipX = !!(flags & BLIT.FLIP_X);
    const flipY = !!(flags & BLIT.FLIP_Y);
    const rotate = !!(flags & BLIT.ROTATE);

    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        // Source coordinates
        let sx = srcX + (flipX ? width - 1 - px : px);
        let sy = srcY + (flipY ? height - 1 - py : py);

        // Calculate bit position
        const bitIndex = sy * stride + sx;
        const byteIndex = sprite + Math.floor(bitIndex * bpp / 8);
        const bitOffset = (bitIndex * bpp) % 8;

        // Read color
        const colorMask = bpp === 2 ? 0x03 : 0x01;
        const rawColor = (this.memoryBytes[byteIndex] >> (8 - bpp - bitOffset)) & colorMask;

        // Map through draw colors
        let finalColor: number;
        switch (rawColor) {
          case 0: finalColor = dc0; break;
          case 1: finalColor = dc1; break;
          case 2: finalColor = dc2; break;
          case 3: finalColor = dc3; break;
          default: finalColor = -1;
        }

        // Destination coordinates
        let dx = x + px;
        let dy = y + py;

        if (rotate) {
          [dx, dy] = [x + py, y + width - 1 - px];
        }

        this.setPixel(dx, dy, finalColor);
      }
    }
  }

  private lineImpl(x1: number, y1: number, x2: number, y2: number): void {
    const [color] = this.getDrawColors();

    const dx = Math.abs(x2 - x1);
    const dy = -Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx + dy;

    while (true) {
      this.setPixel(x1, y1, color);

      if (x1 === x2 && y1 === y2) break;

      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x1 += sx; }
      if (e2 <= dx) { err += dx; y1 += sy; }
    }
  }

  private hlineImpl(x: number, y: number, len: number): void {
    const [color] = this.getDrawColors();
    for (let i = 0; i < len; i++) {
      this.setPixel(x + i, y, color);
    }
  }

  private vlineImpl(x: number, y: number, len: number): void {
    const [color] = this.getDrawColors();
    for (let i = 0; i < len; i++) {
      this.setPixel(x, y + i, color);
    }
  }

  private ovalImpl(x: number, y: number, width: number, height: number): void {
    const [strokeColor, fillColor] = this.getDrawColors();

    const cx = x + width / 2;
    const cy = y + height / 2;
    const rx = width / 2;
    const ry = height / 2;

    for (let py = y; py < y + height; py++) {
      for (let px = x; px < x + width; px++) {
        const dx = (px + 0.5 - cx) / rx;
        const dy = (py + 0.5 - cy) / ry;
        const dist = dx * dx + dy * dy;

        if (dist <= 1.0) {
          const edgeDist = 1.0 - dist;
          if (edgeDist < 0.1 && strokeColor >= 0) {
            this.setPixel(px, py, strokeColor);
          } else if (fillColor >= 0) {
            this.setPixel(px, py, fillColor);
          }
        }
      }
    }
  }

  private rectImpl(x: number, y: number, width: number, height: number): void {
    const [strokeColor, fillColor] = this.getDrawColors();

    for (let py = y; py < y + height; py++) {
      for (let px = x; px < x + width; px++) {
        const isEdge = px === x || px === x + width - 1 || py === y || py === y + height - 1;

        if (isEdge && strokeColor >= 0) {
          this.setPixel(px, py, strokeColor);
        } else if (!isEdge && fillColor >= 0) {
          this.setPixel(px, py, fillColor);
        }
      }
    }
  }

  private textImpl(textPtr: number, x: number, y: number): void {
    // Read null-terminated string
    let str = '';
    let offset = textPtr;
    while (this.memoryBytes[offset] !== 0 && offset < this.memoryBytes.length) {
      str += String.fromCharCode(this.memoryBytes[offset++]);
    }
    this.drawText(str, x, y);
  }

  private textUtf8Impl(textPtr: number, byteLength: number, x: number, y: number): void {
    const decoder = new TextDecoder('utf-8');
    const bytes = this.memoryBytes.slice(textPtr, textPtr + byteLength);
    this.drawText(decoder.decode(bytes), x, y);
  }

  private textUtf16Impl(textPtr: number, byteLength: number, x: number, y: number): void {
    const decoder = new TextDecoder('utf-16le');
    const bytes = this.memoryBytes.slice(textPtr, textPtr + byteLength);
    this.drawText(decoder.decode(bytes), x, y);
  }

  private drawText(text: string, x: number, y: number): void {
    const [color] = this.getDrawColors();

    // Simple 8x8 bitmap font (simplified - just draws rectangles for now)
    let px = x;
    for (const char of text) {
      if (char === '\n') {
        px = x;
        y += 8;
        continue;
      }

      // Draw character as 6x8 block (simplified)
      const charCode = char.charCodeAt(0);
      if (charCode >= 32 && charCode < 127) {
        // Just draw a simple pattern for visible characters
        for (let cy = 0; cy < 7; cy++) {
          for (let cx = 0; cx < 5; cx++) {
            // Simple pattern based on char code
            if (((charCode + cx + cy) % 3) < 2) {
              this.setPixel(px + cx, y + cy, color);
            }
          }
        }
      }

      px += 8;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SOUND FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  private toneImpl(frequency: number, duration: number, volume: number, flags: number): void {
    const freq1 = frequency & 0xffff;
    const freq2 = (frequency >> 16) & 0xffff;
    const dur = duration & 0xff;
    const attack = (duration >> 8) & 0xff;
    const decay = (duration >> 16) & 0xff;
    const release = (duration >> 24) & 0xff;
    const vol = volume & 0xff;
    const channel = flags & 0x03;

    this.config.onSound(channel, freq1, dur, vol, flags);

    // Play sound using Web Audio API
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    // Simple tone implementation
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.frequency.value = freq1;
    oscillator.type = this.getWaveType(channel);

    gainNode.gain.value = vol / 100;

    oscillator.start();
    oscillator.stop(this.audioContext.currentTime + dur / 60);
  }

  private getWaveType(channel: number): OscillatorType {
    switch (channel) {
      case TONE.PULSE1:
      case TONE.PULSE2:
        return 'square';
      case TONE.TRIANGLE:
        return 'triangle';
      case TONE.NOISE:
        return 'sawtooth'; // Approximate noise with sawtooth
      default:
        return 'sine';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STORAGE FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  private diskrImpl(destPtr: number, size: number): number {
    const actualSize = Math.min(size, 256);
    for (let i = 0; i < actualSize; i++) {
      this.memoryBytes[destPtr + i] = this.diskData[i];
    }
    return actualSize;
  }

  private diskwImpl(srcPtr: number, size: number): number {
    const actualSize = Math.min(size, 256);
    for (let i = 0; i < actualSize; i++) {
      this.diskData[i] = this.memoryBytes[srcPtr + i];
    }
    this.config.onDiskWrite(this.diskData.slice(0, actualSize));
    return actualSize;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRACE FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  private traceImpl(strPtr: number): void {
    let str = '';
    let offset = strPtr;
    while (this.memoryBytes[offset] !== 0 && offset < this.memoryBytes.length) {
      str += String.fromCharCode(this.memoryBytes[offset++]);
    }
    console.log('[WASM4]', str);
  }

  private traceUtf8Impl(strPtr: number, byteLength: number): void {
    const decoder = new TextDecoder('utf-8');
    const bytes = this.memoryBytes.slice(strPtr, strPtr + byteLength);
    console.log('[WASM4]', decoder.decode(bytes));
  }

  private traceUtf16Impl(strPtr: number, byteLength: number): void {
    const decoder = new TextDecoder('utf-16le');
    const bytes = this.memoryBytes.slice(strPtr, strPtr + byteLength);
    console.log('[WASM4]', decoder.decode(bytes));
  }

  private tracefImpl(strPtr: number, stackPtr: number): void {
    // Simplified tracef - just call trace
    this.traceImpl(strPtr);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Set gamepad input
   */
  setGamepad(player: number, buttons: number): void {
    if (player >= 0 && player < 4) {
      this.gamepad[player] = buttons;
    }
  }

  /**
   * Set mouse position
   */
  setMouse(x: number, y: number, buttons: number): void {
    this.mouseX = x;
    this.mouseY = y;
    this.mouseButtons = buttons;
  }

  /**
   * Set palette color
   */
  setPaletteColor(index: number, color: number): void {
    if (index >= 0 && index < 4) {
      this.memoryView.setUint32(WASM4_MEMORY.PALETTE + index * 4, color, true);
    }
  }

  /**
   * Get current state
   */
  getState(): WASM4State {
    return {
      running: this.running,
      frameCount: this.frameCount,
      palette: [
        this.memoryView.getUint32(WASM4_MEMORY.PALETTE, true),
        this.memoryView.getUint32(WASM4_MEMORY.PALETTE + 4, true),
        this.memoryView.getUint32(WASM4_MEMORY.PALETTE + 8, true),
        this.memoryView.getUint32(WASM4_MEMORY.PALETTE + 12, true),
      ],
      drawColors: this.memoryView.getUint16(WASM4_MEMORY.DRAW_COLORS, true),
      gamepad: [...this.gamepad],
      mouse: {
        x: this.mouseX,
        y: this.mouseY,
        buttons: this.mouseButtons,
      },
    };
  }

  /**
   * Get framebuffer as ImageData
   */
  getFramebufferAsImageData(): ImageData | null {
    if (!this.imageData) {
      this.imageData = new ImageData(SCREEN.WIDTH, SCREEN.HEIGHT);
    }

    this.renderFramebuffer();
    return this.imageData;
  }

  /**
   * Get raw framebuffer
   */
  getFramebuffer(): Uint8Array {
    return this.memoryBytes.slice(
      WASM4_MEMORY.FRAMEBUFFER,
      WASM4_MEMORY.FRAMEBUFFER + WASM4_MEMORY.FRAMEBUFFER_SIZE
    );
  }

  /**
   * Load disk data
   */
  loadDiskData(data: Uint8Array): void {
    const size = Math.min(data.length, 256);
    for (let i = 0; i < size; i++) {
      this.diskData[i] = data[i];
    }
  }

  /**
   * Get disk data
   */
  getDiskData(): Uint8Array {
    return new Uint8Array(this.diskData);
  }

  /**
   * Check if running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get frame count
   */
  getFrameCount(): number {
    return this.frameCount;
  }

  /**
   * Reset runtime
   */
  reset(): void {
    this.stop();
    this.initializeMemory();
    this.frameCount = 0;
    this.gamepad = [0, 0, 0, 0];
    this.prevGamepad = [0, 0, 0, 0];
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseButtons = 0;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.stop();
    this.wasmInstance = null;

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

/**
 * Create a new WASM4 runtime
 */
export function createWASM4Runtime(config?: WASM4Config): WASM4Runtime {
  return new WASM4Runtime(config);
}

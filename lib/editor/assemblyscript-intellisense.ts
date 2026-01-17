/**
 * Monaco Editor IntelliSense for AssemblyScript and Robot4 API
 *
 * Provides:
 * - Auto-completion for Robot4 functions
 * - Hover documentation
 * - Signature help
 * - Diagnostics
 */

import type * as Monaco from 'monaco-editor';

/**
 * Robot4 API function definitions for IntelliSense
 */
export const ROBOT4_API_DEFINITIONS = [
  // ============ Motor Control ============
  {
    name: 'drive',
    signature: 'drive(left: i32, right: i32): void',
    description: 'Control robot motors. Values range from -100 (full reverse) to 100 (full forward).',
    parameters: [
      { name: 'left', type: 'i32', description: 'Left motor speed (-100 to 100)' },
      { name: 'right', type: 'i32', description: 'Right motor speed (-100 to 100)' },
    ],
    returns: 'void',
    example: 'drive(50, 50);  // Move forward at 50% speed',
    category: 'Motor Control',
  },
  {
    name: 'stop',
    signature: 'stop(): void',
    description: 'Stop all motors immediately.',
    parameters: [],
    returns: 'void',
    example: 'stop();  // Emergency stop',
    category: 'Motor Control',
  },

  // ============ Sensors ============
  {
    name: 'distance',
    signature: 'distance(sensor?: i32): i32',
    description: 'Read distance sensor. Returns distance in centimeters (0-400). 400 means no obstacle detected.',
    parameters: [
      { name: 'sensor', type: 'i32', description: 'Sensor index: 0=front, 1=left, 2=right, 3=back (default: 0)' },
    ],
    returns: 'i32 - Distance in centimeters',
    example: 'const d = distance(0);  // Read front sensor',
    category: 'Sensors',
  },
  {
    name: 'getLineSensor',
    signature: 'getLineSensor(sensor: i32): i32',
    description: 'Read line sensor for line following. Returns 0 for white/light surface, 1 for black/dark surface.',
    parameters: [
      { name: 'sensor', type: 'i32', description: 'Sensor index: 0-4 (left to right)' },
    ],
    returns: 'i32 - 0=white, 1=black',
    example: 'const s = getLineSensor(2);  // Read center sensor',
    category: 'Sensors',
  },
  {
    name: 'getIMU',
    signature: 'getIMU(axis: i32): f32',
    description: 'Read IMU (Inertial Measurement Unit) sensor for acceleration and rotation.',
    parameters: [
      { name: 'axis', type: 'i32', description: '0=accel_x, 1=accel_y, 2=accel_z (g), 3=gyro_x, 4=gyro_y, 5=gyro_z (deg/s)' },
    ],
    returns: 'f32 - Sensor value',
    example: 'const accelZ = getIMU(2);  // Read vertical acceleration',
    category: 'Sensors',
  },
  {
    name: 'getButton',
    signature: 'getButton(): i32',
    description: 'Check if the button is currently pressed.',
    parameters: [],
    returns: 'i32 - 1 if pressed, 0 if not',
    example: 'if (getButton() == 1) { ... }',
    category: 'Sensors',
  },
  {
    name: 'buttonPressed',
    signature: 'buttonPressed(): bool',
    description: 'Check if button was just pressed (edge detection). Only returns true once per press.',
    parameters: [],
    returns: 'bool - true on rising edge only',
    example: 'if (buttonPressed()) { beep(1000, 100); }',
    category: 'Sensors',
  },
  {
    name: 'getBattery',
    signature: 'getBattery(): i32',
    description: 'Get battery level percentage.',
    parameters: [],
    returns: 'i32 - Battery percentage (0-100)',
    example: 'const battery = getBattery();',
    category: 'Sensors',
  },

  // ============ Output ============
  {
    name: 'led',
    signature: 'led(r: i32, g: i32, b: i32): void',
    description: 'Set LED color using RGB values.',
    parameters: [
      { name: 'r', type: 'i32', description: 'Red component (0-255)' },
      { name: 'g', type: 'i32', description: 'Green component (0-255)' },
      { name: 'b', type: 'i32', description: 'Blue component (0-255)' },
    ],
    returns: 'void',
    example: 'led(255, 0, 0);  // Red\nled(0, 255, 0);  // Green',
    category: 'Output',
  },
  {
    name: 'ledColor',
    signature: 'ledColor(color: string): void',
    description: 'Set LED to a named color.',
    parameters: [
      { name: 'color', type: 'string', description: '"red", "green", "blue", "yellow", "cyan", "magenta", "white", "orange"' },
    ],
    returns: 'void',
    example: 'ledColor("green");',
    category: 'Output',
  },
  {
    name: 'beep',
    signature: 'beep(frequency: i32, duration: i32): void',
    description: 'Play a beep sound.',
    parameters: [
      { name: 'frequency', type: 'i32', description: 'Frequency in Hz (100-10000)' },
      { name: 'duration', type: 'i32', description: 'Duration in milliseconds' },
    ],
    returns: 'void',
    example: 'beep(1000, 200);  // 1kHz for 200ms',
    category: 'Output',
  },
  {
    name: 'print',
    signature: 'print(message: string): void',
    description: 'Print a debug message to serial monitor.',
    parameters: [
      { name: 'message', type: 'string', description: 'Message to print' },
    ],
    returns: 'void',
    example: 'print("Hello Robot!");',
    category: 'Output',
  },
  {
    name: 'printNum',
    signature: 'printNum(label: string, value: i32): void',
    description: 'Print a labeled number to serial monitor.',
    parameters: [
      { name: 'label', type: 'string', description: 'Label for the value' },
      { name: 'value', type: 'i32', description: 'Number to print' },
    ],
    returns: 'void',
    example: 'printNum("distance", distance(0));',
    category: 'Output',
  },

  // ============ Time ============
  {
    name: 'millis',
    signature: 'millis(): i32',
    description: 'Get current time in milliseconds since robot boot.',
    parameters: [],
    returns: 'i32 - Milliseconds since boot',
    example: 'const startTime = millis();',
    category: 'Time',
  },
  {
    name: 'delay',
    signature: 'delay(ms: i32): void',
    description: 'Pause execution for specified milliseconds. Use sparingly as it blocks the update loop.',
    parameters: [
      { name: 'ms', type: 'i32', description: 'Milliseconds to wait' },
    ],
    returns: 'void',
    example: 'delay(500);  // Wait 500ms',
    category: 'Time',
  },
  {
    name: 'elapsed',
    signature: 'elapsed(startTime: i32): i32',
    description: 'Get milliseconds elapsed since a start time.',
    parameters: [
      { name: 'startTime', type: 'i32', description: 'Start time from millis()' },
    ],
    returns: 'i32 - Elapsed milliseconds',
    example: 'if (elapsed(startTime) > 1000) { ... }',
    category: 'Time',
  },
  {
    name: 'timerElapsed',
    signature: 'timerElapsed(startTime: i32, duration: i32): bool',
    description: 'Check if a timer duration has passed.',
    parameters: [
      { name: 'startTime', type: 'i32', description: 'Start time from millis()' },
      { name: 'duration', type: 'i32', description: 'Duration to check' },
    ],
    returns: 'bool - true if duration has elapsed',
    example: 'if (timerElapsed(turnStart, 500)) { ... }',
    category: 'Time',
  },

  // ============ State Management ============
  {
    name: 'setState',
    signature: 'setState(key: string, value: i32): void',
    description: 'Store an integer state value that persists between update() calls.',
    parameters: [
      { name: 'key', type: 'string', description: 'State key name' },
      { name: 'value', type: 'i32', description: 'Value to store' },
    ],
    returns: 'void',
    example: 'setState("state", 1);',
    category: 'State',
  },
  {
    name: 'getState',
    signature: 'getState(key: string, defaultValue?: i32): i32',
    description: 'Get a stored integer state value.',
    parameters: [
      { name: 'key', type: 'string', description: 'State key name' },
      { name: 'defaultValue', type: 'i32', description: 'Default if not set (default: 0)' },
    ],
    returns: 'i32 - Stored value or default',
    example: 'const state = getState("state", 0);',
    category: 'State',
  },
  {
    name: 'setStateF',
    signature: 'setStateF(key: string, value: f32): void',
    description: 'Store a floating-point state value.',
    parameters: [
      { name: 'key', type: 'string', description: 'State key name' },
      { name: 'value', type: 'f32', description: 'Float value to store' },
    ],
    returns: 'void',
    example: 'setStateF("error", 0.5);',
    category: 'State',
  },
  {
    name: 'getStateF',
    signature: 'getStateF(key: string, defaultValue?: f32): f32',
    description: 'Get a stored floating-point state value.',
    parameters: [
      { name: 'key', type: 'string', description: 'State key name' },
      { name: 'defaultValue', type: 'f32', description: 'Default if not set (default: 0.0)' },
    ],
    returns: 'f32 - Stored value or default',
    example: 'const error = getStateF("error", 0.0);',
    category: 'State',
  },

  // ============ Math Helpers ============
  {
    name: 'clamp',
    signature: 'clamp(value: i32, min: i32, max: i32): i32',
    description: 'Constrain an integer value to a range.',
    parameters: [
      { name: 'value', type: 'i32', description: 'Value to clamp' },
      { name: 'min', type: 'i32', description: 'Minimum bound' },
      { name: 'max', type: 'i32', description: 'Maximum bound' },
    ],
    returns: 'i32 - Clamped value',
    example: 'const speed = clamp(rawSpeed, -100, 100);',
    category: 'Math',
  },
  {
    name: 'clampF',
    signature: 'clampF(value: f32, min: f32, max: f32): f32',
    description: 'Constrain a float value to a range.',
    parameters: [
      { name: 'value', type: 'f32', description: 'Value to clamp' },
      { name: 'min', type: 'f32', description: 'Minimum bound' },
      { name: 'max', type: 'f32', description: 'Maximum bound' },
    ],
    returns: 'f32 - Clamped value',
    example: 'const normalized = clampF(raw, 0.0, 1.0);',
    category: 'Math',
  },
  {
    name: 'map',
    signature: 'map(value: i32, inMin: i32, inMax: i32, outMin: i32, outMax: i32): i32',
    description: 'Map an integer from one range to another.',
    parameters: [
      { name: 'value', type: 'i32', description: 'Input value' },
      { name: 'inMin', type: 'i32', description: 'Input range minimum' },
      { name: 'inMax', type: 'i32', description: 'Input range maximum' },
      { name: 'outMin', type: 'i32', description: 'Output range minimum' },
      { name: 'outMax', type: 'i32', description: 'Output range maximum' },
    ],
    returns: 'i32 - Mapped value',
    example: 'const speed = map(distance(0), 10, 100, 20, 80);',
    category: 'Math',
  },
  {
    name: 'mapF',
    signature: 'mapF(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32): f32',
    description: 'Map a float from one range to another.',
    parameters: [
      { name: 'value', type: 'f32', description: 'Input value' },
      { name: 'inMin', type: 'f32', description: 'Input range minimum' },
      { name: 'inMax', type: 'f32', description: 'Input range maximum' },
      { name: 'outMin', type: 'f32', description: 'Output range minimum' },
      { name: 'outMax', type: 'f32', description: 'Output range maximum' },
    ],
    returns: 'f32 - Mapped value',
    example: 'const normalized = mapF(raw, 0.0, 1023.0, 0.0, 1.0);',
    category: 'Math',
  },
  {
    name: 'abs',
    signature: 'abs(value: i32): i32',
    description: 'Get absolute value of an integer.',
    parameters: [
      { name: 'value', type: 'i32', description: 'Input value' },
    ],
    returns: 'i32 - Absolute value',
    example: 'const magnitude = abs(error);',
    category: 'Math',
  },
  {
    name: 'sign',
    signature: 'sign(value: i32): i32',
    description: 'Get sign of an integer (-1, 0, or 1).',
    parameters: [
      { name: 'value', type: 'i32', description: 'Input value' },
    ],
    returns: 'i32 - Sign (-1, 0, or 1)',
    example: 'const dir = sign(error);',
    category: 'Math',
  },
  {
    name: 'lerp',
    signature: 'lerp(a: f32, b: f32, t: f32): f32',
    description: 'Linear interpolation between two values.',
    parameters: [
      { name: 'a', type: 'f32', description: 'Start value' },
      { name: 'b', type: 'f32', description: 'End value' },
      { name: 't', type: 'f32', description: 'Interpolation factor (0.0 to 1.0)' },
    ],
    returns: 'f32 - Interpolated value',
    example: 'const smooth = lerp(current, target, 0.1);',
    category: 'Math',
  },
];

/**
 * AssemblyScript type definitions for Monaco
 */
export const ASSEMBLYSCRIPT_TYPE_DEFS = `
// AssemblyScript built-in types
declare type i8 = number;
declare type i16 = number;
declare type i32 = number;
declare type i64 = number;
declare type isize = number;
declare type u8 = number;
declare type u16 = number;
declare type u32 = number;
declare type u64 = number;
declare type usize = number;
declare type f32 = number;
declare type f64 = number;
declare type bool = boolean;

// Memory operations
declare function load<T>(ptr: usize, offset?: usize): T;
declare function store<T>(ptr: usize, value: T, offset?: usize): void;
declare function sizeof<T>(): usize;
declare function changetype<T>(value: any): T;

// Math
declare namespace Math {
  function abs(x: f64): f64;
  function ceil(x: f64): f64;
  function floor(x: f64): f64;
  function round(x: f64): f64;
  function sqrt(x: f64): f64;
  function pow(base: f64, exp: f64): f64;
  function min(a: f64, b: f64): f64;
  function max(a: f64, b: f64): f64;
  function sin(x: f64): f64;
  function cos(x: f64): f64;
  function tan(x: f64): f64;
  function atan2(y: f64, x: f64): f64;
  const PI: f64;
}

// String
declare class String {
  static fromCharCode(code: i32): string;
  static fromCodePoint(code: i32): string;
  readonly length: i32;
  charAt(index: i32): string;
  charCodeAt(index: i32): i32;
  concat(other: string): string;
  includes(search: string): bool;
  indexOf(search: string): i32;
  lastIndexOf(search: string): i32;
  slice(start: i32, end?: i32): string;
  split(separator?: string): string[];
  substring(start: i32, end?: i32): string;
  toLowerCase(): string;
  toUpperCase(): string;
  trim(): string;
  toString(): string;

  static UTF8: {
    encode(str: string): ArrayBuffer;
    decode(buf: ArrayBuffer): string;
    byteLength(str: string): i32;
  };
}

// Array
declare class Array<T> {
  constructor(length?: i32);
  readonly length: i32;
  push(value: T): i32;
  pop(): T;
  shift(): T;
  unshift(value: T): i32;
  slice(start?: i32, end?: i32): T[];
  splice(start: i32, deleteCount?: i32): T[];
  indexOf(value: T): i32;
  includes(value: T): bool;
  reverse(): T[];
  sort(compareFn?: (a: T, b: T) => i32): T[];
  join(separator?: string): string;
  map<U>(callbackFn: (value: T, index: i32, array: T[]) => U): U[];
  filter(callbackFn: (value: T, index: i32, array: T[]) => bool): T[];
  reduce<U>(callbackFn: (prev: U, curr: T, index: i32, array: T[]) => U, initialValue: U): U;
  forEach(callbackFn: (value: T, index: i32, array: T[]) => void): void;
  every(callbackFn: (value: T, index: i32, array: T[]) => bool): bool;
  some(callbackFn: (value: T, index: i32, array: T[]) => bool): bool;
}

// Map
declare class Map<K, V> {
  constructor();
  readonly size: i32;
  has(key: K): bool;
  get(key: K): V;
  set(key: K, value: V): void;
  delete(key: K): bool;
  clear(): void;
  keys(): K[];
  values(): V[];
}

// ArrayBuffer
declare class ArrayBuffer {
  constructor(length: i32);
  readonly byteLength: i32;
  slice(start?: i32, end?: i32): ArrayBuffer;
}

// Typed Arrays
declare class Int8Array {
  constructor(length: i32);
  readonly length: i32;
  readonly byteLength: i32;
}

declare class Uint8Array {
  constructor(length: i32);
  readonly length: i32;
  readonly byteLength: i32;
}

declare class Int32Array {
  constructor(length: i32);
  readonly length: i32;
  readonly byteLength: i32;
}

declare class Float32Array {
  constructor(length: i32);
  readonly length: i32;
  readonly byteLength: i32;
}

// Console (for debugging)
declare namespace console {
  function log(message: string): void;
}
`;

/**
 * Configure Monaco editor for AssemblyScript with Robot4 IntelliSense
 */
export function configureMonacoForAssemblyScript(monaco: typeof Monaco): void {
  // Register AssemblyScript as a language (based on TypeScript)
  monaco.languages.register({ id: 'assemblyscript' });

  // Configure TypeScript compiler options for AssemblyScript
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ES2020,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    allowNonTsExtensions: true,
    noEmit: true,
    strict: false,
    noImplicitAny: false,
    strictNullChecks: false,
  });

  // Add AssemblyScript type definitions
  monaco.languages.typescript.typescriptDefaults.addExtraLib(
    ASSEMBLYSCRIPT_TYPE_DEFS,
    'assemblyscript.d.ts'
  );

  // Add Robot4 API definitions
  const robot4TypeDefs = generateRobot4TypeDefinitions();
  monaco.languages.typescript.typescriptDefaults.addExtraLib(
    robot4TypeDefs,
    'robot4.d.ts'
  );

  // Register completion provider for Robot4 functions
  monaco.languages.registerCompletionItemProvider('typescript', {
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions: Monaco.languages.CompletionItem[] = ROBOT4_API_DEFINITIONS.map(fn => ({
        label: fn.name,
        kind: monaco.languages.CompletionItemKind.Function,
        insertText: generateSnippet(fn),
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        documentation: {
          value: `**${fn.name}**\n\n${fn.description}\n\n\`\`\`typescript\n${fn.signature}\n\`\`\`\n\n**Example:**\n\`\`\`typescript\n${fn.example}\n\`\`\``,
        },
        detail: fn.signature,
        range,
      }));

      return { suggestions };
    },
  });

  // Register hover provider for documentation
  monaco.languages.registerHoverProvider('typescript', {
    provideHover: (model, position) => {
      const word = model.getWordAtPosition(position);
      if (!word) return null;

      const fn = ROBOT4_API_DEFINITIONS.find(f => f.name === word.word);
      if (!fn) return null;

      return {
        contents: [
          { value: `**${fn.name}** — *${fn.category}*` },
          { value: `\`\`\`typescript\n${fn.signature}\n\`\`\`` },
          { value: fn.description },
          { value: `**Parameters:**\n${fn.parameters.map(p => `- \`${p.name}\`: ${p.description}`).join('\n') || 'None'}` },
          { value: `**Returns:** ${fn.returns}` },
          { value: `**Example:**\n\`\`\`typescript\n${fn.example}\n\`\`\`` },
        ],
      };
    },
  });

  // Register signature help provider
  monaco.languages.registerSignatureHelpProvider('typescript', {
    signatureHelpTriggerCharacters: ['(', ','],
    provideSignatureHelp: (model, position) => {
      const textUntilPosition = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      // Find function name before opening parenthesis
      const match = textUntilPosition.match(/(\w+)\s*\([^)]*$/);
      if (!match) return null;

      const fnName = match[1];
      const fn = ROBOT4_API_DEFINITIONS.find(f => f.name === fnName);
      if (!fn) return null;

      // Count commas to determine active parameter
      const argsText = match[0].substring(match[0].indexOf('(') + 1);
      const activeParameter = (argsText.match(/,/g) || []).length;

      return {
        value: {
          signatures: [{
            label: fn.signature,
            documentation: fn.description,
            parameters: fn.parameters.map(p => ({
              label: `${p.name}: ${p.type}`,
              documentation: p.description,
            })),
          }],
          activeSignature: 0,
          activeParameter,
        },
        dispose: () => {},
      };
    },
  });
}

/**
 * Generate snippet for function insertion
 */
function generateSnippet(fn: typeof ROBOT4_API_DEFINITIONS[0]): string {
  if (fn.parameters.length === 0) {
    return `${fn.name}()`;
  }

  const params = fn.parameters.map((p, i) => `\${${i + 1}:${p.name}}`).join(', ');
  return `${fn.name}(${params})`;
}

/**
 * Generate Robot4 TypeScript definitions
 */
function generateRobot4TypeDefinitions(): string {
  const lines = [
    '// Robot4 API Type Definitions',
    '// Auto-generated from ROBOT4_API_DEFINITIONS',
    '',
  ];

  // Group by category
  const categories = new Map<string, typeof ROBOT4_API_DEFINITIONS>();
  for (const fn of ROBOT4_API_DEFINITIONS) {
    if (!categories.has(fn.category)) {
      categories.set(fn.category, []);
    }
    categories.get(fn.category)!.push(fn);
  }

  for (const [category, functions] of categories) {
    lines.push(`// ============ ${category} ============`);
    for (const fn of functions) {
      lines.push(`/** ${fn.description} */`);
      lines.push(`declare function ${fn.signature};`);
      lines.push('');
    }
  }

  // Add update function declaration
  lines.push('// ============ Main Entry Point ============');
  lines.push('/** Main update loop - called at 60Hz by the firmware */');
  lines.push('declare function update(): void;');

  return lines.join('\n');
}

/**
 * Get all Robot4 API categories
 */
export function getRobot4Categories(): string[] {
  const categories = new Set(ROBOT4_API_DEFINITIONS.map(fn => fn.category));
  return Array.from(categories);
}

/**
 * Get Robot4 API functions by category
 */
export function getRobot4FunctionsByCategory(category: string): typeof ROBOT4_API_DEFINITIONS {
  return ROBOT4_API_DEFINITIONS.filter(fn => fn.category === category);
}

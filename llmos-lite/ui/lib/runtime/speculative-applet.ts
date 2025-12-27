/**
 * Speculative Applet Engine - Instant UI Perception
 *
 * Instead of waiting for the full LLM response, we:
 * 1. Detect user intent from the first few words
 * 2. Immediately render a "skeleton" applet template
 * 3. Stream in the actual content as the LLM generates it
 *
 * This creates the perception of instant response, similar to
 * how MTP (Multi-Token Prediction) speeds up generation.
 */

import { AppletMetadata, generateAppletId } from './applet-runtime';

// Intent patterns mapped to applet templates
export interface AppletTemplate {
  id: string;
  name: string;
  description: string;
  intentPatterns: RegExp[];
  skeletonCode: string;
  placeholders: string[];
  category: 'form' | 'calculator' | 'generator' | 'wizard' | 'dashboard';
}

// Pre-defined applet templates for common intents
export const APPLET_TEMPLATES: AppletTemplate[] = [
  {
    id: 'template-form-basic',
    name: 'Basic Form',
    description: 'A simple form for collecting information',
    intentPatterns: [
      /create\s+(a\s+)?form/i,
      /fill\s+out/i,
      /collect\s+information/i,
      /input\s+form/i,
    ],
    category: 'form',
    placeholders: ['{{TITLE}}', '{{FIELDS}}', '{{SUBMIT_LABEL}}'],
    skeletonCode: `function Component({ onSubmit }) {
  const [formData, setFormData] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  // Placeholder for dynamic fields - will be replaced
  const fields = {{FIELDS}} || [
    { name: 'field1', label: 'Loading...', type: 'text' },
    { name: 'field2', label: 'Loading...', type: 'text' },
  ];

  useEffect(() => {
    // Simulate loading while LLM generates
    const timer = setTimeout(() => setIsLoading(false), 100);
    return () => clearTimeout(timer);
  }, []);

  const updateField = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-bold text-gray-200">{{TITLE}}</h2>
        {isLoading && (
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      <div className="space-y-4">
        {fields.map((field, idx) => (
          <div key={field.name} className={isLoading ? 'animate-pulse' : ''}>
            <label className="block text-sm text-gray-400 mb-1">{field.label}</label>
            <input
              type={field.type || 'text'}
              value={formData[field.name] || ''}
              onChange={(e) => updateField(field.name, e.target.value)}
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400"
              placeholder={isLoading ? '' : \`Enter \${field.label.toLowerCase()}...\`}
              disabled={isLoading}
            />
          </div>
        ))}
      </div>

      <button
        onClick={() => onSubmit(formData)}
        disabled={isLoading}
        className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded transition-colors"
      >
        {{SUBMIT_LABEL}}
      </button>
    </div>
  );
}`,
  },
  {
    id: 'template-calculator',
    name: 'Calculator',
    description: 'A calculator for computing values',
    intentPatterns: [
      /calculate/i,
      /calculator/i,
      /compute/i,
      /convert/i,
      /conversion/i,
    ],
    category: 'calculator',
    placeholders: ['{{TITLE}}', '{{INPUT_LABEL}}', '{{OUTPUT_LABEL}}', '{{CALCULATE_FN}}'],
    skeletonCode: `function Component({ onSubmit }) {
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 100);
    return () => clearTimeout(timer);
  }, []);

  const calculate = () => {
    try {
      // Placeholder calculation - will be replaced by LLM
      const computed = {{CALCULATE_FN}} || ((x) => parseFloat(x) * 2)(input);
      setResult(computed);
    } catch (e) {
      setResult('Error');
    }
  };

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-xl font-bold text-gray-200 flex items-center gap-2">
        {{TITLE}}
        {isLoading && <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}
      </h2>

      <div className={isLoading ? 'animate-pulse' : ''}>
        <label className="block text-sm text-gray-400 mb-1">{{INPUT_LABEL}}</label>
        <div className="flex gap-2">
          <input
            type="number"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 p-2 bg-gray-700 border border-gray-600 rounded text-white"
            placeholder="Enter value..."
            disabled={isLoading}
          />
          <button
            onClick={calculate}
            disabled={isLoading || !input}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded transition-colors"
          >
            Calculate
          </button>
        </div>
      </div>

      {result !== null && (
        <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg">
          <span className="text-gray-400">{{OUTPUT_LABEL}}: </span>
          <span className="text-2xl font-bold text-green-400">{result}</span>
        </div>
      )}
    </div>
  );
}`,
  },
  {
    id: 'template-wizard',
    name: 'Multi-Step Wizard',
    description: 'A step-by-step wizard for complex tasks',
    intentPatterns: [
      /wizard/i,
      /step.by.step/i,
      /multi.?step/i,
      /guide\s+me/i,
      /walk\s+me\s+through/i,
      /create\s+(a\s+)?(nda|contract|agreement)/i,
      /generate\s+(a\s+)?(document|report)/i,
    ],
    category: 'wizard',
    placeholders: ['{{TITLE}}', '{{STEPS}}', '{{STEP_COUNT}}'],
    skeletonCode: `function Component({ onSubmit }) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  const totalSteps = {{STEP_COUNT}} || 3;
  const steps = {{STEPS}} || ['Step 1', 'Step 2', 'Step 3'];

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 100);
    return () => clearTimeout(timer);
  }, []);

  const nextStep = () => setStep(s => Math.min(s + 1, totalSteps));
  const prevStep = () => setStep(s => Math.max(s - 1, 1));

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold text-gray-200 mb-4 flex items-center gap-2">
        {{TITLE}}
        {isLoading && <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}
      </h2>

      {/* Progress */}
      <div className="mb-6">
        <div className="flex justify-between mb-2">
          {steps.map((label, idx) => (
            <div key={idx} className="flex flex-col items-center">
              <div className={\`w-8 h-8 rounded-full flex items-center justify-center text-sm \${
                step > idx + 1 ? 'bg-green-600 text-white' :
                step === idx + 1 ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'
              }\`}>
                {step > idx + 1 ? '✓' : idx + 1}
              </div>
              <span className="text-xs text-gray-500 mt-1">{label}</span>
            </div>
          ))}
        </div>
        <div className="h-2 bg-gray-700 rounded-full">
          <div
            className="h-full bg-blue-600 rounded-full transition-all"
            style={{ width: \`\${((step - 1) / (totalSteps - 1)) * 100}%\` }}
          />
        </div>
      </div>

      {/* Content placeholder */}
      <div className={\`min-h-[200px] p-4 bg-gray-800 border border-gray-700 rounded-lg mb-4 \${isLoading ? 'animate-pulse' : ''}\`}>
        {isLoading ? (
          <div className="space-y-3">
            <div className="h-4 bg-gray-700 rounded w-3/4" />
            <div className="h-4 bg-gray-700 rounded w-1/2" />
            <div className="h-10 bg-gray-700 rounded mt-4" />
          </div>
        ) : (
          <p className="text-gray-400">Step {step} content loading...</p>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={prevStep}
          disabled={step === 1 || isLoading}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded transition-colors"
        >
          ← Back
        </button>
        {step < totalSteps ? (
          <button
            onClick={nextStep}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded transition-colors"
          >
            Continue →
          </button>
        ) : (
          <button
            onClick={() => onSubmit(data)}
            disabled={isLoading}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded transition-colors"
          >
            Complete ✓
          </button>
        )}
      </div>
    </div>
  );
}`,
  },
  {
    id: 'template-generator',
    name: 'Generator Tool',
    description: 'Generate content or data',
    intentPatterns: [
      /generate\s+(a\s+)?password/i,
      /generate\s+(a\s+)?id/i,
      /random/i,
      /generator/i,
      /create\s+(a\s+)?uuid/i,
    ],
    category: 'generator',
    placeholders: ['{{TITLE}}', '{{OPTIONS}}', '{{GENERATE_FN}}'],
    skeletonCode: `function Component({ onSubmit }) {
  const [result, setResult] = useState('');
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 100);
    return () => clearTimeout(timer);
  }, []);

  const generate = () => {
    // Placeholder - will be replaced
    const generated = {{GENERATE_FN}} || (() => Math.random().toString(36).substring(2))();
    setResult(generated);
    setCopied(false);
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {}
  };

  useEffect(() => {
    if (!isLoading) generate();
  }, [isLoading]);

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-xl font-bold text-gray-200 flex items-center gap-2">
        {{TITLE}}
        {isLoading && <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}
      </h2>

      <div className={\`p-4 bg-gray-800 border border-gray-700 rounded-lg \${isLoading ? 'animate-pulse' : ''}\`}>
        <div className="font-mono text-lg text-green-400 break-all">
          {isLoading ? 'Generating...' : result || 'Click generate'}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={generate}
          disabled={isLoading}
          className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded transition-colors"
        >
          🔄 Generate New
        </button>
        <button
          onClick={copyToClipboard}
          disabled={isLoading || !result}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white rounded transition-colors"
        >
          {copied ? '✓ Copied!' : '📋 Copy'}
        </button>
      </div>
    </div>
  );
}`,
  },
  {
    id: 'template-dashboard',
    name: 'Data Dashboard',
    description: 'Display data and metrics',
    intentPatterns: [
      /dashboard/i,
      /visualize/i,
      /show\s+(me\s+)?(the\s+)?data/i,
      /display\s+(the\s+)?metrics/i,
      /analytics/i,
    ],
    category: 'dashboard',
    placeholders: ['{{TITLE}}', '{{METRICS}}'],
    skeletonCode: `function Component({ onSubmit }) {
  const [isLoading, setIsLoading] = useState(true);

  const metrics = {{METRICS}} || [
    { label: 'Loading...', value: '---', change: 0 },
    { label: 'Loading...', value: '---', change: 0 },
    { label: 'Loading...', value: '---', change: 0 },
  ];

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-xl font-bold text-gray-200 flex items-center gap-2">
        {{TITLE}}
        {isLoading && <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}
      </h2>

      <div className="grid grid-cols-3 gap-4">
        {metrics.map((metric, idx) => (
          <div
            key={idx}
            className={\`p-4 bg-gray-800 border border-gray-700 rounded-lg \${isLoading ? 'animate-pulse' : ''}\`}
          >
            <div className="text-sm text-gray-400">{metric.label}</div>
            <div className="text-2xl font-bold text-gray-200 mt-1">{metric.value}</div>
            {metric.change !== undefined && (
              <div className={\`text-sm mt-1 \${metric.change >= 0 ? 'text-green-400' : 'text-red-400'}\`}>
                {metric.change >= 0 ? '↑' : '↓'} {Math.abs(metric.change)}%
              </div>
            )}
          </div>
        ))}
      </div>

      <div className={\`h-40 bg-gray-800 border border-gray-700 rounded-lg flex items-center justify-center \${isLoading ? 'animate-pulse' : ''}\`}>
        {isLoading ? (
          <div className="text-gray-500">Loading chart...</div>
        ) : (
          <div className="text-gray-400">Chart placeholder</div>
        )}
      </div>
    </div>
  );
}`,
  },
];

/**
 * Detect user intent from message and return matching template
 */
export function detectIntent(message: string): AppletTemplate | null {
  const normalizedMessage = message.toLowerCase().trim();

  for (const template of APPLET_TEMPLATES) {
    for (const pattern of template.intentPatterns) {
      if (pattern.test(normalizedMessage)) {
        return template;
      }
    }
  }

  return null;
}

/**
 * Generate a speculative applet from a template
 */
export function generateSpeculativeApplet(
  template: AppletTemplate,
  inferredValues: Record<string, string> = {}
): { code: string; metadata: AppletMetadata } {
  let code = template.skeletonCode;

  // Replace placeholders with inferred values or defaults
  for (const placeholder of template.placeholders) {
    const key = placeholder.replace(/[{}]/g, '');
    const value = inferredValues[key] || getDefaultValue(key);
    code = code.replace(new RegExp(placeholder.replace(/[{}]/g, '\\{\\{$&\\}\\}'), 'g'), value);
  }

  const metadata: AppletMetadata = {
    id: generateAppletId(),
    name: inferredValues['TITLE'] || template.name,
    description: template.description,
    version: '1.0.0-speculative',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['speculative', template.category],
  };

  return { code, metadata };
}

/**
 * Get default values for common placeholders
 */
function getDefaultValue(key: string): string {
  const defaults: Record<string, string> = {
    TITLE: '"Loading..."',
    FIELDS: 'null',
    SUBMIT_LABEL: '"Submit"',
    INPUT_LABEL: '"Input"',
    OUTPUT_LABEL: '"Result"',
    CALCULATE_FN: 'null',
    STEPS: 'null',
    STEP_COUNT: '3',
    OPTIONS: '[]',
    GENERATE_FN: 'null',
    METRICS: 'null',
  };

  return defaults[key] || '""';
}

/**
 * Infer placeholder values from user message
 */
export function inferValuesFromMessage(
  message: string,
  template: AppletTemplate
): Record<string, string> {
  const values: Record<string, string> = {};

  // Try to extract title from message
  const titlePatterns = [
    /(?:create|build|make|generate)\s+(?:a\s+)?(?:an\s+)?(.+?)(?:\s+(?:for|that|which|to))/i,
    /(?:help\s+(?:me\s+)?(?:with|create))\s+(.+?)(?:\s+(?:for|that|which))?$/i,
    /^(.+?)\s+(?:calculator|generator|form|wizard|dashboard)/i,
  ];

  for (const pattern of titlePatterns) {
    const match = message.match(pattern);
    if (match) {
      const extracted = match[1].trim();
      if (extracted.length > 2 && extracted.length < 50) {
        values['TITLE'] = `"${extracted.charAt(0).toUpperCase() + extracted.slice(1)}"`;
        break;
      }
    }
  }

  // Set default title based on template if not found
  if (!values['TITLE']) {
    values['TITLE'] = `"${template.name}"`;
  }

  return values;
}

/**
 * Check if we should use speculative generation for this message
 */
export function shouldUseSpeculativeGeneration(message: string): boolean {
  // Use speculation for messages that clearly request interactive tools
  const interactivePatterns = [
    /create\s+(a\s+)?/i,
    /build\s+(a\s+)?/i,
    /make\s+(a\s+)?/i,
    /generate\s+(a\s+)?/i,
    /help\s+me\s+(with|create)/i,
    /calculator/i,
    /wizard/i,
    /form/i,
    /dashboard/i,
  ];

  return interactivePatterns.some((p) => p.test(message));
}

export const SpeculativeAppletEngine = {
  detectIntent,
  generateSpeculative: generateSpeculativeApplet,
  inferValues: inferValuesFromMessage,
  shouldSpeculate: shouldUseSpeculativeGeneration,
  templates: APPLET_TEMPLATES,
};

export default SpeculativeAppletEngine;

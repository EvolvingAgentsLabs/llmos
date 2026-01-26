---
name: GenerateAppletPrompt
type: tool
version: "1.0"
description: Instructions for generating interactive React applets
tool_id: generate-applet
variables: []
evolved_from: null
origin: extracted
extracted_from: lib/system-tools.ts:101-168
---

# Generate Applet Tool

Generate an interactive React applet that the user can interact with.

## When to Use

Use this tool when the user needs:
- A form or wizard to collect information
- A dashboard or visualization tool
- A calculator, converter, or interactive tool
- Any UI that would be better than text responses
- Real-time data display or controls
- Interactive simulations

## Critical Code Requirements

### 1. Component Syntax

**MUST use function declaration syntax:**
```javascript
function Applet({ onSubmit }) {
  // component code
}
```

**DO NOT use arrow functions:**
```javascript
// WRONG - will fail compilation
const Applet = () => { ... }
const Applet = ({ onSubmit }) => { ... }
```

### 2. No Imports/Exports

```javascript
// WRONG
import React from 'react';
export default function Applet() { ... }

// RIGHT - just define the function
function Applet() { ... }
```

### 3. No TypeScript

```javascript
// WRONG
function Applet({ onSubmit }: { onSubmit: (data: any) => void }) {
  const [value, setValue] = useState<string>('');
}

// RIGHT
function Applet({ onSubmit }) {
  const [value, setValue] = useState('');
}
```

### 4. Available APIs

**React Hooks:**
- `useState` - State management
- `useEffect` - Side effects
- `useCallback` - Memoized callbacks
- `useMemo` - Memoized values
- `useRef` - Mutable refs

**Globals:**
- `Math` - Mathematical operations
- `JSON` - JSON parsing/stringifying
- `console` - Logging (for debugging)
- `Date` - Date operations
- `setTimeout`, `setInterval` - Timers

### 5. Styling with Tailwind CSS

Use Tailwind classes for styling. Default to dark theme:

```javascript
function Applet() {
  return (
    <div className="p-6 space-y-4 bg-gray-800 text-white">
      <h2 className="text-xl font-bold">Title</h2>
      <input className="w-full p-2 bg-gray-700 border border-gray-600 rounded" />
      <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded">
        Click Me
      </button>
    </div>
  );
}
```

## Complete Example

```javascript
function Applet({ onSubmit }) {
  const [value, setValue] = useState('');
  const [result, setResult] = useState(null);

  function handleCalculate() {
    const num = Number(value);
    if (!isNaN(num)) {
      setResult(Math.sqrt(num));
    }
  }

  function handleSubmit() {
    if (onSubmit && result !== null) {
      onSubmit({ input: value, result });
    }
  }

  return (
    <div className="p-6 space-y-4 bg-gray-800 text-white">
      <h2 className="text-xl font-bold">Square Root Calculator</h2>

      <div className="space-y-2">
        <label className="block text-sm text-gray-400">Enter a number:</label>
        <input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full p-2 bg-gray-700 border border-gray-600 rounded focus:border-blue-500 focus:outline-none"
          placeholder="Enter a number..."
        />
      </div>

      <button
        onClick={handleCalculate}
        className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium transition-colors"
      >
        Calculate
      </button>

      {result !== null && (
        <div className="p-4 bg-gray-700 rounded">
          <p className="text-sm text-gray-400">Result:</p>
          <p className="text-2xl font-bold text-green-400">{result.toFixed(4)}</p>
        </div>
      )}

      {result !== null && (
        <button
          onClick={handleSubmit}
          className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-medium transition-colors"
        >
          Submit Result
        </button>
      )}
    </div>
  );
}
```

## Common Patterns

### Form with Validation
```javascript
function Applet({ onSubmit }) {
  const [formData, setFormData] = useState({ name: '', email: '' });
  const [errors, setErrors] = useState({});

  function validate() {
    const newErrors = {};
    if (!formData.name) newErrors.name = 'Name is required';
    if (!formData.email.includes('@')) newErrors.email = 'Invalid email';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit() {
    if (validate() && onSubmit) {
      onSubmit(formData);
    }
  }

  return (
    <div className="p-6 space-y-4 bg-gray-800 text-white">
      {/* Form fields */}
    </div>
  );
}
```

### Real-time Updates
```javascript
function Applet() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="p-6 bg-gray-800 text-white">
      <p className="text-4xl font-mono">{time.toLocaleTimeString()}</p>
    </div>
  );
}
```

### Data Visualization
```javascript
function Applet() {
  const [data, setData] = useState([25, 50, 75, 100, 60]);

  const maxValue = Math.max(...data);

  return (
    <div className="p-6 bg-gray-800 text-white">
      <div className="flex items-end space-x-2 h-40">
        {data.map((value, index) => (
          <div
            key={index}
            className="flex-1 bg-blue-500 rounded-t"
            style={{ height: `${(value / maxValue) * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}
```

## Error Recovery

If compilation fails, the system will attempt auto-fix up to 3 times. Common fixes include:
- Renaming component to "Applet"
- Removing TypeScript annotations
- Removing import/export statements
- Fixing syntax errors

If auto-fix fails, review the error message and manually correct the code.

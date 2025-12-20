# API Key Setup Guide

## OpenRouter API Authentication

The error `"User not found" (401)` indicates that the OpenRouter API key is invalid or missing.

## Getting an OpenRouter API Key

1. **Sign up for OpenRouter**
   - Visit: https://openrouter.ai/
   - Create an account
   - Navigate to: https://openrouter.ai/keys

2. **Create a new API key**
   - Click "Create Key"
   - Give it a name (e.g., "LLMos-Lite")
   - Set usage limits if desired
   - Copy the key (format: `sk-or-v1-...`)

3. **Add credits (if needed)**
   - OpenRouter requires credits to use paid models
   - Free models available: `moonshotai/kimi-k2:free`, `tng/deepseek-r1t2-chimera:free`
   - Premium models: Claude Sonnet 4.5, GPT-4, etc.

## Setting Up in LLMos-Lite

### Method 1: Through the UI (Recommended)

1. Start the application:
   ```bash
   npm run dev
   ```

2. Navigate to the onboarding/setup flow
3. When prompted, paste your OpenRouter API key
4. Select a model (e.g., `anthropic/claude-sonnet-4.5`)
5. Complete the setup

The API key will be stored in browser localStorage at:
- Key: `llmos_openrouter_api_key`
- Model: `llmos_selected_model`

### Method 2: Manual localStorage Setup

Open browser console (F12) and run:

```javascript
// Set API key
localStorage.setItem('llmos_openrouter_api_key', 'sk-or-v1-YOUR-KEY-HERE');

// Set model
localStorage.setItem('llmos_selected_model', 'claude-sonnet-4.5');

// Verify
console.log('API Key:', localStorage.getItem('llmos_openrouter_api_key')?.substring(0, 20));
console.log('Model:', localStorage.getItem('llmos_selected_model'));

// Refresh the page
location.reload();
```

### Method 3: Environment Variables (Server-side only)

**Note:** For security reasons, LLMos-Lite uses client-side API calls. Environment variables are NOT recommended as they expose the key in the browser bundle.

If you need server-side proxying:

1. Create `.env.local`:
   ```env
   OPENROUTER_API_KEY=sk-or-v1-your-key-here
   NEXT_PUBLIC_DEFAULT_MODEL=anthropic/claude-sonnet-4.5
   ```

2. Update `lib/llm-client.ts` to use server-side proxy
3. Create API route at `app/api/chat/route.ts`

## Testing Your API Key

### Using the Test Script

```bash
cd ui
node test-openrouter.js
```

**Expected output (success):**
```
Testing OpenRouter API...
Model: anthropic/claude-sonnet-4.5
API Key (first 20): sk-or-v1-c05eaf14840...
Response status: 200

=== RESPONSE DATA ===
ID: chatcmpl-...
Model: anthropic/claude-sonnet-4.5
Provider: Anthropic

=== MESSAGE CONTENT ===
Here's a quantum circuit for cepstral analysis...
```

**Expected output (error):**
```
Response status: 401
Error response: {"error":{"message":"User not found.","code":401}}
```

This means your API key is invalid or expired.

### Testing in the Chat Interface

1. Open the application
2. Type a simple message: "Hello"
3. Check browser console (F12)
4. Look for logs:
   ```
   [LLMClient] Making request to OpenRouter
   [LLMClient] Model: anthropic/claude-sonnet-4.5
   [LLMClient] Response status: 200  ✓ Success
   ```

## Troubleshooting

### Error: "User not found" (401)

**Causes:**
1. Invalid API key
2. Expired API key
3. API key not properly copied (missing characters)
4. Wrong API key format

**Solutions:**
1. Regenerate API key on OpenRouter
2. Copy the FULL key including `sk-or-v1-` prefix
3. Check for extra spaces or newlines
4. Verify the key in localStorage matches the one from OpenRouter

### Error: "Insufficient credits" (402)

**Causes:**
1. No credits in OpenRouter account
2. Model requires payment

**Solutions:**
1. Add credits to your OpenRouter account
2. Use a free model:
   - `moonshotai/kimi-k2:free`
   - `tng/deepseek-r1t2-chimera:free`

### Error: "Model not found" (404)

**Causes:**
1. Model ID incorrect
2. Model deprecated or removed

**Solutions:**
1. Check available models at: https://openrouter.ai/docs#models
2. Update model ID in localStorage or UI
3. Common models:
   - `anthropic/claude-sonnet-4.5`
   - `anthropic/claude-opus-4.5`
   - `openai/gpt-4-turbo`

### Error: "Rate limit exceeded" (429)

**Causes:**
1. Too many requests in short time
2. Free tier limits reached

**Solutions:**
1. Wait a few seconds between requests
2. Upgrade to paid tier
3. Use caching to reduce API calls

## Available Models

### Free Models
- **Kimi K2**: `moonshotai/kimi-k2:free`
  - Context: 128K tokens
  - Good for: General chat, code

- **DeepSeek R1T2**: `tng/deepseek-r1t2-chimera:free`
  - Context: 128K tokens
  - Good for: Reasoning, math

### Premium Models (Paid)

#### Anthropic Claude
- **Claude Opus 4.5**: `anthropic/claude-opus-4.5`
  - Cost: $15/M input, $75/M output
  - Context: 200K tokens
  - Best for: Complex reasoning, coding

- **Claude Sonnet 4.5**: `anthropic/claude-sonnet-4.5`
  - Cost: $3/M input, $15/M output
  - Context: 200K tokens
  - Best for: Balanced performance/cost

#### OpenAI
- **GPT-5.2 Pro**: `openai/gpt-5.2-pro`
  - Cost: $20/M input, $100/M output
  - Context: 128K tokens

- **GPT-4 Turbo**: `openai/gpt-4-turbo`
  - Cost: $10/M input, $30/M output
  - Context: 128K tokens

## Security Best Practices

### Client-Side Storage
LLMos-Lite stores API keys in browser localStorage:

**Pros:**
- No server exposure
- Each user brings their own key
- No API key sharing between users

**Cons:**
- Exposed in browser DevTools
- Cleared when browser data is cleared
- Not suitable for shared devices

### Recommendations

1. **Personal Use**
   - localStorage is fine
   - Clear browser data after use on shared computers

2. **Team Use**
   - Use server-side API proxy
   - Store team key in environment variables
   - Implement rate limiting per user

3. **Production**
   - OAuth with OpenRouter
   - Server-side token management
   - Usage tracking and limits

## Updating Your API Key

### In the UI
1. Go to Settings (click gear icon)
2. Navigate to "API Configuration"
3. Paste new API key
4. Click "Save"

### Via Console
```javascript
localStorage.setItem('llmos_openrouter_api_key', 'sk-or-v1-NEW-KEY');
location.reload();
```

### Clear All Settings
```javascript
// Clear all LLMos settings
Object.keys(localStorage)
  .filter(key => key.startsWith('llmos_'))
  .forEach(key => localStorage.removeItem(key));

location.reload();
```

## Testing Quantum Code with Valid API

Once you have a valid API key, test the quantum cepstral analysis:

1. Open the chat interface
2. Paste this prompt:
   ```
   Create a circuit to perform quantum cepstral analysis of a cardiac
   pressure wave to detect echoes using 2-stage Fourier quantum transform
   with 4 qubits
   ```

3. The system will:
   - Generate Python code with Qiskit
   - Auto-execute in Pyodide
   - Load Qiskit via micropip
   - Display circuit diagram and results

4. If errors occur, the Ralph Loop will:
   - Detect the error
   - Send refinement request to LLM
   - Re-execute fixed code
   - Show final result

## Cost Estimation

For quantum computing examples:

**Claude Sonnet 4.5:**
- Prompt: ~500 tokens ($0.0015)
- Response: ~1000 tokens ($0.015)
- Total per request: ~$0.0165

**Typical session (10 prompts):**
- Total cost: ~$0.165

**With Ralph Loop (3 refinement attempts):**
- Total cost: ~$0.05 per refinement
- Max per complex query: ~$0.20

## Support

If you continue to have issues:

1. Check the browser console for detailed error logs
2. Verify your API key at https://openrouter.ai/keys
3. Test with a simpler prompt first
4. Try a free model to isolate the issue
5. Check OpenRouter status: https://status.openrouter.ai/

## Related Files

- `/lib/llm-client.ts` - LLM client implementation
- `/test-openrouter.js` - API key testing script
- `/components/onboarding/APIKeySetup.tsx` - UI setup flow
- `/RALPH_LOOP_GUIDE.md` - Error handling documentation

---

**Important:** Never commit your API key to version control. The `test-openrouter.js` file should use environment variables or be in `.gitignore`.

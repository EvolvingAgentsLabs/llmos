# LLM Configuration - OpenRouter Setup

## Overview
The app has been configured to use **OpenRouter** as the default LLM provider with support for multiple models.

## Default Configuration

### Provider: OpenRouter
- **Base URL**: `https://openrouter.ai/api/v1/`
- **API Key**: Get from https://openrouter.ai/keys
- **Compatibility**: Uses OpenAI-compatible API format

### Default Model
**xiaomi/mimo-v2-flash:free**
- **Cost**: Free
- **Speed**: Fast
- **Context Window**: 128k tokens
- **Provider**: Xiaomi via OpenRouter
- **Recommended**: Yes (default selection)

## Available Models

### 1. xiaomi/mimo-v2-flash:free ⭐ (Default)
- **Provider**: Xiaomi via OpenRouter
- **Cost**: Free
- **Speed**: Very Fast
- **Context Window**: 128k tokens
- **Best For**: General use, fast responses, free tier

### 2. google/gemini-3-flash-preview
- **Provider**: Google via OpenRouter
- **Cost**: Varies (check OpenRouter pricing)
- **Speed**: Fast
- **Context Window**: 1M tokens
- **Best For**: Large context needs, complex reasoning

### 3. anthropic/claude-haiku-4.5
- **Provider**: Anthropic via OpenRouter
- **Cost**: Varies (check OpenRouter pricing)
- **Speed**: Fast
- **Context Window**: 200k tokens
- **Best For**: High quality responses, coding tasks

### 4. Custom Model
- **Provider**: Any available on OpenRouter
- **Cost**: Varies by model
- **Input**: Enter full model ID (e.g., `meta-llama/llama-3.1-8b-instruct:free`)
- **Find Models**: https://openrouter.ai/models

## Setup Process

### First Time Setup

When you first open the app, you'll see the setup wizard:

1. **Step 1: API Key**
   - Get your OpenRouter API key from: https://openrouter.ai/keys
   - Enter the key (format: `sk-or-...`)
   - Click Continue

2. **Step 2: Choose Model**
   - Select one of the pre-configured models:
     - `xiaomi/mimo-v2-flash:free` (Recommended - Free & Fast)
     - `google/gemini-3-flash-preview` (Large context)
     - `anthropic/claude-haiku-4.5` (High quality)
     - Custom Model (enter your own)
   - Click Start

### Configuration Saved
- API key stored in: `localStorage` (never leaves your device)
- Model selection persisted across sessions
- Provider set to: OpenRouter
- Base URL configured automatically

## Switching Providers (Advanced)

While OpenRouter is the default, you can switch to other providers:

### Available Providers
```javascript
{
  openrouter: 'https://openrouter.ai/api/v1/',      // Default
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  openai: 'https://api.openai.com/v1/',
  groq: 'https://api.groq.com/openai/v1/',
  together: 'https://api.together.xyz/v1/',
}
```

### To Switch Providers
1. Open app settings (gear icon)
2. Change provider and base URL
3. Update API key for new provider
4. Save configuration

## File Changes

### Updated Files

1. **lib/llm/types.ts**
   - Added OpenRouter models to `AVAILABLE_MODELS`
   - Includes: mimo-v2-flash, gemini-3-flash, claude-haiku-4.5, custom

2. **lib/llm/storage.ts**
   - Already supported multi-provider setup
   - Provider base URLs configured
   - OpenRouter URL included

3. **components/setup/APIKeySetup.tsx**
   - Default provider changed to OpenRouter
   - Default model set to `xiaomi/mimo-v2-flash:free`
   - UI updated to show all 4 model options
   - Custom model input field added
   - API key placeholder updated to `sk-or-...`
   - Links updated to point to OpenRouter

4. **.env.example**
   - Updated with OpenRouter configuration
   - Added recommended models list
   - Included provider switching instructions
   - Better organization and comments

## Environment Variables

**Note: LLM API keys are stored client-side only.**

The browser calls OpenRouter directly - your API key never touches the server:
```
Browser (localStorage) → OpenRouter API
```

No server-side environment variables are needed for LLM functionality. All configuration is stored in the browser's `localStorage`.

## Usage

### In the App
Once configured, the LLM will be used for:
- Chat conversations
- Agent operations
- Code generation
- System tools
- Autonomous tasks

### Verifying Configuration
Check browser console (DevTools) for:
```
[APIKeySetup] Saving configuration:
  - API Key (first 20 chars): sk-or-...
  - Model: xiaomi/mimo-v2-flash:free
  - Provider: openrouter (OpenAI-compatible API)
  - Base URL: https://openrouter.ai/api/v1/
```

## Cost Considerations

### Free Models
- **xiaomi/mimo-v2-flash:free** - Completely free
- Check OpenRouter for other free models: https://openrouter.ai/models?free=true

### Paid Models
- **google/gemini-3-flash-preview** - Check pricing on OpenRouter
- **anthropic/claude-haiku-4.5** - Check pricing on OpenRouter
- Pricing varies by provider and usage
- See: https://openrouter.ai/models

## Troubleshooting

### API Key Issues
- Ensure key starts with `sk-or-`
- Verify key is active at https://openrouter.ai/keys
- Check for typos in key entry

### Model Not Working
- Verify model ID is correct
- Check OpenRouter model availability
- Ensure sufficient credits (for paid models)
- Try the free model: `xiaomi/mimo-v2-flash:free`

### Connection Issues
- Check internet connection
- Verify OpenRouter service status
- Check browser console for errors

## Benefits of OpenRouter

✅ **Single API Key**: Access multiple LLM providers
✅ **Unified Pricing**: Pay-as-you-go with one account
✅ **Free Models**: Several free options available
✅ **Model Diversity**: Choose best model for each task
✅ **OpenAI Compatible**: Drop-in replacement for OpenAI API
✅ **No Lock-in**: Switch models anytime

## Additional Resources

- **OpenRouter Website**: https://openrouter.ai/
- **API Keys**: https://openrouter.ai/keys
- **Model Directory**: https://openrouter.ai/models
- **Documentation**: https://openrouter.ai/docs
- **Pricing**: https://openrouter.ai/pricing

## Next Steps

1. Get your OpenRouter API key
2. Start the app: `npm run electron:dev`
3. Complete the setup wizard
4. Choose `xiaomi/mimo-v2-flash:free` for free usage
5. Start using the app!

---

**Configuration Complete** ✅

The app is now configured to use OpenRouter with the free Xiaomi Mimo v2 Flash model as default, with easy options to switch to Google Gemini, Anthropic Claude, or any custom model from OpenRouter.

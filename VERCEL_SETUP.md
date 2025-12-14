# Vercel Deployment Setup Guide

This guide explains how to set up Vercel storage (KV + Blob) for LLMos persistence.

## Prerequisites

1. **Vercel Account** - Sign up at [vercel.com](https://vercel.com)
2. **Project Deployed** - Your LLMos project should be deployed to Vercel

## Step 1: Create Vercel KV Store

Vercel KV provides Redis-compatible storage for sessions and metadata.

### Create KV Store

1. Go to your Vercel project dashboard
2. Navigate to **Storage** tab
3. Click **Create Database**
4. Select **KV (Redis)**
5. Choose a name (e.g., `llmos-sessions`)
6. Click **Create**

### Get KV Credentials

After creation, Vercel will show you:
- `KV_REST_API_URL` - The REST API endpoint
- `KV_REST_API_TOKEN` - Your authentication token

## Step 2: Enable Vercel Blob Storage

Vercel Blob provides object storage for files, skills, and artifacts.

### Enable Blob

1. In your Vercel project dashboard
2. Navigate to **Storage** tab
3. Click **Create Database**
4. Select **Blob**
5. Choose a name (e.g., `llmos-files`)
6. Click **Create**

### Get Blob Token

After creation, get:
- `BLOB_READ_WRITE_TOKEN` - Your read/write access token

## Step 3: Add Environment Variables

### Via Vercel Dashboard

1. Go to **Settings** → **Environment Variables**
2. Add these variables:

```
KV_REST_API_URL=<your-kv-url>
KV_REST_API_TOKEN=<your-kv-token>
BLOB_READ_WRITE_TOKEN=<your-blob-token>
```

3. Set scope to **All Environments** (Production, Preview, Development)
4. Click **Save**

### Via Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Link your project
vercel link

# Add environment variables
vercel env add KV_REST_API_URL
vercel env add KV_REST_API_TOKEN
vercel env add BLOB_READ_WRITE_TOKEN
```

## Step 4: Redeploy Your Application

After adding environment variables:

```bash
# Trigger new deployment
vercel --prod
```

Or push to your connected Git repository (auto-deploys).

## Step 5: Verify Storage Integration

### Test KV (Sessions)

```bash
curl -X POST "https://your-app.vercel.app/api/sessions" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Session",
    "volume": "user",
    "initial_message": "Hello!"
  }'
```

Expected: Session created and saved to Vercel KV.

### Test Blob (Skills)

```bash
curl -X POST "https://your-app.vercel.app/api/skills" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Skill",
    "description": "A test skill",
    "code": "def execute(): pass",
    "language": "python",
    "tags": ["test"]
  }'
```

Expected: Skill saved to Vercel Blob at `volumes/user/default/skills/test-skill.md`.

## Local Development

For local development, create `.env.local`:

```bash
# Copy template
cp .env.example .env.local

# Add your Vercel credentials
echo "KV_REST_API_URL=your-kv-url" >> .env.local
echo "KV_REST_API_TOKEN=your-kv-token" >> .env.local
echo "BLOB_READ_WRITE_TOKEN=your-blob-token" >> .env.local
```

**⚠️ NEVER commit `.env.local` to Git!**

## Storage Structure

### Vercel KV (Redis) Keys

```
# Sessions
session:{session_id}              → Session JSON
session:{session_id}:messages     → List of messages
{volume}:{volume_id}:sessions     → Set of session IDs
all:sessions                      → Set of all session IDs

# Example:
session:sess_quantum_1234         → {"id": "sess_quantum_1234", "name": "Quantum Research", ...}
session:sess_quantum_1234:messages → [{"role": "user", "content": "..."}, ...]
user:alice:sessions               → ["sess_quantum_1234", "sess_data_5678"]
```

### Vercel Blob Paths

```
# Skills
volumes/{volume}/{volume_id}/skills/{skill-name}.md

# Workflows
volumes/{volume}/{volume_id}/workflows/{workflow-name}.md

# Artifacts
volumes/{volume}/{volume_id}/artifacts/{filename}

# Examples:
volumes/system/system/skills/quantum-vqe.md
volumes/team/engineering/skills/data-pipeline.md
volumes/user/alice/workflows/circuit-optimizer.md
```

## Fallback Behavior

The API gracefully falls back to mock data when storage is unavailable:

- **No KV credentials** → Returns mock sessions
- **No Blob credentials** → Returns mock skills
- **Storage error** → Logs warning, uses fallback

This allows development without Vercel accounts.

## Cost & Limits

### Vercel KV (Free Tier)
- Storage: 256 MB
- Requests: 10,000/day
- ⚠️ Sufficient for development, upgrade for production

### Vercel Blob (Free Tier)
- Storage: 500 MB
- Bandwidth: 100 GB/month
- ⚠️ Sufficient for ~1,000 skills

Upgrade plans available at [vercel.com/pricing](https://vercel.com/pricing).

## Troubleshooting

### "KV/Blob not available" Warning

**Cause**: Missing environment variables

**Fix**: Verify vars are set in Vercel dashboard and redeploy

### "KV get failed" Error

**Cause**: Invalid token or URL

**Fix**: Check token/URL match KV store credentials

### Skills Not Loading

**Cause**: No skills in Blob storage yet

**Fix**: Create a skill via POST /api/skills or manually upload to Blob

## Next Steps

1. ✅ Vercel storage configured
2. 📝 Create initial skills in system volume
3. 🎨 Build React Flow UI to visualize workflows
4. 🚀 Deploy and scale!

## Security Notes

- ✅ API keys stored client-side (localStorage)
- ✅ Sessions isolated per user/team
- ✅ Blob files namespaced by volume
- ⚠️ Consider adding authentication layer for production

---

**Questions?** Check [Vercel Docs](https://vercel.com/docs) or open an issue.

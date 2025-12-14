# Quick Vercel Storage Setup (5 Minutes)

## Option 1: Automated Script

```bash
cd /Users/agustinazwiener/evolving-agents-labs/llmunix
./setup-vercel-storage.sh
```

The script will:
1. ✅ Link your Vercel project
2. ✅ Guide you through Blob creation
3. ✅ Guide you through KV creation
4. ✅ Add environment variables to Vercel
5. ✅ Create `.env.local` for local development
6. ✅ Deploy to production

---

## Option 2: Manual Setup

### Step 1: Go to Vercel Dashboard

Open: https://vercel.com/dashboard

### Step 2: Create Blob Storage

1. Select your project
2. Click **Storage** tab
3. Click **Create Database**
4. Select **Blob**
5. Name: `llmos-files`
6. Click **Create**

**Copy this:**
```
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
```

### Step 3: Create KV Storage

1. Still in **Storage** tab
2. Click **Create Database** again
3. Select **KV**
4. Name: `llmos-sessions`
5. Click **Create**

**Copy these:**
```
KV_REST_API_URL=https://...kv.vercel-storage.com
KV_REST_API_TOKEN=...
```

### Step 4: Add Environment Variables

In Vercel dashboard:

1. Go to **Settings** → **Environment Variables**
2. Add these 3 variables:

```bash
BLOB_READ_WRITE_TOKEN=<paste-from-step-2>
KV_REST_API_URL=<paste-from-step-3>
KV_REST_API_TOKEN=<paste-from-step-3>
```

3. Set **Environments** to: ✅ Production, ✅ Preview, ✅ Development
4. Click **Save** for each

### Step 5: Create .env.local (Local Development)

Create this file in your project root:

**File: `.env.local`**
```bash
# Vercel Storage
BLOB_READ_WRITE_TOKEN=<your-blob-token>
KV_REST_API_URL=<your-kv-url>
KV_REST_API_TOKEN=<your-kv-token>

# Your API key
ANTHROPIC_API_KEY=sk-ant-api03-xxx...
```

⚠️ **Never commit `.env.local` to Git!** (already gitignored)

### Step 6: Redeploy

```bash
vercel --prod
```

---

## Verify Setup

### Test Locally

```bash
npm run dev

# Test sessions
curl -X POST "http://localhost:3000/api/sessions" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Session", "volume": "user"}'

# Test skills
curl -X POST "http://localhost:3000/api/skills" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Hello World",
    "description": "Test skill",
    "code": "print(\"Hello!\")",
    "language": "python",
    "tags": ["test"]
  }'
```

Expected: Both return success (saved to Vercel storage)

### Test Production

Same curl commands but replace `localhost:3000` with your Vercel URL:

```bash
curl -X POST "https://your-app.vercel.app/api/sessions" ...
```

---

## Troubleshooting

### "KV/Blob not available" warning

**Cause**: Missing environment variables

**Fix**:
1. Check variables exist in Vercel dashboard
2. Verify `.env.local` has correct values locally
3. Redeploy: `vercel --prod`

### "401 Unauthorized" from storage

**Cause**: Invalid tokens

**Fix**:
1. Go to Vercel Storage tab
2. Click on your Blob/KV store
3. Copy fresh tokens
4. Update environment variables

### Storage created but not working

**Cause**: Deployment didn't pick up new env vars

**Fix**: Force redeploy
```bash
vercel --prod --force
```

---

## What Happens After Setup

✅ **Sessions** saved to Vercel KV:
- Chat sessions persist across reloads
- Messages stored in Redis lists
- Fast lookups by session ID

✅ **Skills** saved to Vercel Blob:
- Skills uploaded as Markdown files
- Path: `volumes/user/default/skills/{skill-name}.md`
- Chat endpoint loads skills into LLM context

✅ **No more mock data**:
- All endpoints use real storage
- Graceful fallback if storage fails

---

## Next: Use the App!

Your storage is ready. Now you can:

1. **Create sessions** via chat
2. **Save skills** that persist
3. **Build workflows** with saved nodes
4. **Deploy and scale** with confidence

See `IMPLEMENTATION_COMPLETE.md` for full details!

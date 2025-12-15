# User & Team Setup Guide

## Current State Analysis

### Where Users/Teams Are Hardcoded

1. **Header Component** (`ui/components/layout/Header.tsx:17`)
   ```tsx
   <div className="text-terminal-fg-secondary text-sm">
     alice@engineering  // ← HARDCODED
   </div>
   ```

2. **API Requests** (`ui/lib/llm-client.ts:12-14`)
   ```typescript
   export interface ChatRequest {
     user_id: string;    // ← Required but not stored
     team_id: string;    // ← Required but not stored
     message: string;
   }
   ```

3. **Backend Accepts But Doesn't Validate** (`api/chat.py:22-24`)
   ```python
   class ChatRequest(BaseModel):
       user_id: str
       team_id: str
       # ... these are accepted but not validated
   ```

### Current Authentication Flow

```
┌─────────────────────────────────────────┐
│ User opens app                          │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ Check localStorage for OpenRouter key   │
│ (LLMStorage.isConfigured())             │
└──────────────┬──────────────────────────┘
               │
        ┌──────┴──────┐
        │             │
    YES │             │ NO
        ▼             ▼
   ┌────────┐    ┌─────────┐
   │ Show   │    │ Show    │
   │ Main   │    │ API Key │
   │ UI     │    │ Setup   │
   └────────┘    └─────────┘
```

**Problem**: No user/team data stored or validated!

---

## Solution Options

### Option 1: Simple localStorage (No Backend) ⭐ **RECOMMENDED**

**Best for**: MVP, prototypes, local development, single-user apps

**Pros**:
- ✅ No backend changes needed
- ✅ No authentication service (Supabase, Auth0)
- ✅ Works offline
- ✅ Quick to implement (1-2 hours)
- ✅ Free

**Cons**:
- ❌ No multi-device sync
- ❌ User can change their own ID
- ❌ No real security
- ❌ Data lost on browser clear

**Implementation**: See [Option 1 Implementation](#option-1-localstorage-implementation) below

---

### Option 2: Supabase Auth + Database 🔐

**Best for**: Production apps, multi-user, team collaboration

**Pros**:
- ✅ Real authentication (email/password, OAuth)
- ✅ Multi-device sync
- ✅ Team management
- ✅ Secure
- ✅ Free tier: 50,000 MAU

**Cons**:
- ❌ Requires Supabase account
- ❌ More complex (4-6 hours)
- ❌ Need database schema
- ❌ Need to manage Supabase keys

**Implementation**: See [Option 2 Implementation](#option-2-supabase-implementation) below

---

### Option 3: Hybrid (localStorage + Optional Supabase)

**Best for**: Apps that want to start simple and upgrade later

**Pros**:
- ✅ Start without Supabase
- ✅ Upgrade path for later
- ✅ Gradual migration

**Cons**:
- ❌ More code complexity
- ❌ Two code paths to maintain

---

## Option 1: localStorage Implementation

### Step 1: Create User Storage Library

Create `ui/lib/user-storage.ts`:

```typescript
/**
 * User & Team Management (localStorage-based)
 */

export interface User {
  id: string;
  email: string;
  name: string;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  created_at: string;
}

export const UserStorage = {
  STORAGE_KEYS: {
    USER: 'llmos_user',
    TEAM: 'llmos_team',
  },

  // User methods
  saveUser(user: User): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.STORAGE_KEYS.USER, JSON.stringify(user));
    }
  },

  getUser(): User | null {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(this.STORAGE_KEYS.USER);
      return stored ? JSON.parse(stored) : null;
    }
    return null;
  },

  // Team methods
  saveTeam(team: Team): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.STORAGE_KEYS.TEAM, JSON.stringify(team));
    }
  },

  getTeam(): Team | null {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(this.STORAGE_KEYS.TEAM);
      return stored ? JSON.parse(stored) : null;
    }
    return null;
  },

  // Check if user is set up
  isUserConfigured(): boolean {
    return !!this.getUser() && !!this.getTeam();
  },

  // Clear all
  clearAll(): void {
    if (typeof window !== 'undefined') {
      Object.values(this.STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
      });
    }
  },

  // Get formatted display
  getUserDisplay(): string {
    const user = this.getUser();
    const team = this.getTeam();
    if (!user || !team) return 'guest@unknown';
    return `${user.email.split('@')[0]}@${team.name}`;
  },
};
```

---

### Step 2: Add User Setup to APIKeySetup

Update `ui/components/setup/APIKeySetup.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { LLMStorage } from '@/lib/llm-client';
import { UserStorage, User, Team } from '@/lib/user-storage';

interface APIKeySetupProps {
  onComplete: () => void;
}

export default function APIKeySetup({ onComplete }: APIKeySetupProps) {
  // Existing state
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('anthropic/claude-opus-4.5');

  // NEW: User/team state
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [teamName, setTeamName] = useState('');

  const [error, setError] = useState('');
  const [isValid, setIsValid] = useState(false);

  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    setError('');
    setIsValid(value.startsWith('sk-or-v1-') && value.length > 20);
  };

  const handleSave = () => {
    // Validate API key
    if (!isValid) {
      setError('Invalid OpenRouter API key format');
      return;
    }

    // Validate model
    if (!modelName.trim()) {
      setError('Please enter a model name');
      return;
    }

    // NEW: Validate user info
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email');
      return;
    }

    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }

    if (!teamName.trim()) {
      setError('Please enter a team name');
      return;
    }

    // Save LLM config
    LLMStorage.saveProvider('openrouter');
    LLMStorage.saveApiKey(apiKey);
    LLMStorage.saveModel(modelName as any);

    // NEW: Save user/team
    const user: User = {
      id: `user_${Date.now()}`,
      email: email.trim(),
      name: name.trim(),
      created_at: new Date().toISOString(),
    };

    const team: Team = {
      id: teamName.toLowerCase().replace(/\s+/g, '-'),
      name: teamName.trim(),
      created_at: new Date().toISOString(),
    };

    UserStorage.saveUser(user);
    UserStorage.saveTeam(team);

    // Complete setup
    onComplete();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-terminal-bg-primary p-4">
      <div className="terminal-panel max-w-2xl w-full">
        <div className="mb-6">
          <h1 className="terminal-heading text-lg mb-2">Welcome to LLMos-Lite</h1>
          <p className="text-terminal-fg-secondary text-sm">
            Set up your account and API key to get started
          </p>
        </div>

        {/* NEW: User Information */}
        <div className="mb-6 p-4 bg-terminal-bg-tertiary border border-terminal-border rounded">
          <h2 className="terminal-heading text-xs mb-3">YOUR INFORMATION</h2>

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-terminal-fg-secondary mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="terminal-input w-full"
              />
            </div>

            <div>
              <label className="block text-xs text-terminal-fg-secondary mb-1">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your Name"
                className="terminal-input w-full"
              />
            </div>

            <div>
              <label className="block text-xs text-terminal-fg-secondary mb-1">
                Team Name
              </label>
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="engineering, research, personal, etc."
                className="terminal-input w-full"
              />
            </div>
          </div>
        </div>

        {/* Existing API Key section */}
        <div className="mb-6">
          <h2 className="terminal-heading text-xs mb-3">OPENROUTER API KEY</h2>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => handleApiKeyChange(e.target.value)}
            placeholder="sk-or-v1-..."
            className="terminal-input w-full"
          />
          {/* ... existing links and validation */}
        </div>

        {/* Existing Model section */}
        <div className="mb-6">
          <h2 className="terminal-heading text-xs mb-3">MODEL NAME</h2>
          <input
            type="text"
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            placeholder="anthropic/claude-opus-4.5"
            className="terminal-input w-full"
          />
          {/* ... existing examples */}
        </div>

        {/* Error display */}
        {error && (
          <div className="mb-6 p-3 bg-terminal-accent-red/10 border border-terminal-accent-red rounded">
            <div className="text-xs text-terminal-accent-red">{error}</div>
          </div>
        )}

        {/* Privacy notice */}
        <div className="mb-6 p-3 bg-terminal-bg-tertiary border border-terminal-border rounded">
          <div className="text-xs text-terminal-fg-secondary">
            🔒 <span className="text-terminal-accent-green">Privacy:</span> All data stored locally in your browser.
            Your API key and personal info never leave your device.
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={!isValid}
          className="btn-terminal w-full py-2"
        >
          Complete Setup
        </button>
      </div>
    </div>
  );
}
```

---

### Step 3: Update Header to Use Real User

Update `ui/components/layout/Header.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { UserStorage } from '@/lib/user-storage';

export default function Header() {
  const [userDisplay, setUserDisplay] = useState('loading...');

  useEffect(() => {
    setUserDisplay(UserStorage.getUserDisplay());
  }, []);

  return (
    <header className="h-12 bg-terminal-bg-secondary border-b border-terminal-border flex items-center justify-between px-4">
      <div className="flex items-center gap-3">
        <div className="text-terminal-accent-green font-bold text-lg">
          LLMos-Lite
        </div>
        <div className="text-terminal-fg-tertiary text-xs">
          Web Terminal
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-terminal-fg-secondary text-sm">
          {userDisplay}
        </div>
        <div className="w-2 h-2 rounded-full bg-terminal-accent-green animate-pulse-slow" />
      </div>
    </header>
  );
}
```

---

### Step 4: Update Chat to Use Real User/Team IDs

Update `ui/components/panel2-session/ChatInterface.tsx` (or wherever chat is called):

```tsx
import { UserStorage } from '@/lib/user-storage';
import { createLLMClient } from '@/lib/llm-client';

async function sendMessage(message: string) {
  const user = UserStorage.getUser();
  const team = UserStorage.getTeam();

  if (!user || !team) {
    throw new Error('User not configured');
  }

  const client = createLLMClient();
  if (!client) {
    throw new Error('LLM client not configured');
  }

  const response = await client.chat({
    user_id: user.id,          // ← Real user ID
    team_id: team.id,          // ← Real team ID
    message: message,
    session_id: activeSession,
    include_skills: true,
    max_skills: 5,
  });

  return response;
}
```

---

### Step 5: Update page.tsx to Check User Setup

Update `ui/app/page.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { LLMStorage } from '@/lib/llm-client';
import { UserStorage } from '@/lib/user-storage';

const TerminalLayout = dynamic(() => import('@/components/layout/TerminalLayout'), {
  ssr: false,
});

const APIKeySetup = dynamic(() => import('@/components/setup/APIKeySetup'), {
  ssr: false,
});

export default function Home() {
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    // Check both LLM config AND user config
    const configured = LLMStorage.isConfigured() && UserStorage.isUserConfigured();
    setIsConfigured(configured);
  }, []);

  if (!isMounted || isConfigured === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-terminal-bg-primary">
        <div className="text-terminal-accent-green animate-pulse">
          Initializing...
        </div>
      </div>
    );
  }

  if (!isConfigured) {
    return <APIKeySetup onComplete={() => setIsConfigured(true)} />;
  }

  return <TerminalLayout />;
}
```

---

### Step 6: Add Settings/Profile Page (Optional)

Create `ui/components/settings/ProfileSettings.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { UserStorage, User, Team } from '@/lib/user-storage';
import { LLMStorage } from '@/lib/llm-client';

export default function ProfileSettings({ onClose }: { onClose: () => void }) {
  const [user, setUser] = useState<User | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    setUser(UserStorage.getUser());
    setTeam(UserStorage.getTeam());
  }, []);

  const handleLogout = () => {
    if (confirm('Are you sure? This will clear all local data.')) {
      UserStorage.clearAll();
      LLMStorage.clearAll();
      window.location.reload();
    }
  };

  const handleSave = () => {
    if (user && team) {
      UserStorage.saveUser(user);
      UserStorage.saveTeam(team);
      setEditMode(false);
    }
  };

  if (!user || !team) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="terminal-panel max-w-md w-full">
        <div className="flex items-center justify-between mb-6">
          <h1 className="terminal-heading text-lg">Profile Settings</h1>
          <button onClick={onClose} className="text-terminal-fg-secondary hover:text-terminal-fg-primary">
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-terminal-fg-secondary mb-1">User ID</label>
            <div className="terminal-input bg-terminal-bg-tertiary">{user.id}</div>
          </div>

          <div>
            <label className="block text-xs text-terminal-fg-secondary mb-1">Email</label>
            {editMode ? (
              <input
                type="email"
                value={user.email}
                onChange={(e) => setUser({ ...user, email: e.target.value })}
                className="terminal-input w-full"
              />
            ) : (
              <div className="terminal-input bg-terminal-bg-tertiary">{user.email}</div>
            )}
          </div>

          <div>
            <label className="block text-xs text-terminal-fg-secondary mb-1">Name</label>
            {editMode ? (
              <input
                type="text"
                value={user.name}
                onChange={(e) => setUser({ ...user, name: e.target.value })}
                className="terminal-input w-full"
              />
            ) : (
              <div className="terminal-input bg-terminal-bg-tertiary">{user.name}</div>
            )}
          </div>

          <div>
            <label className="block text-xs text-terminal-fg-secondary mb-1">Team</label>
            {editMode ? (
              <input
                type="text"
                value={team.name}
                onChange={(e) => setTeam({ ...team, name: e.target.value })}
                className="terminal-input w-full"
              />
            ) : (
              <div className="terminal-input bg-terminal-bg-tertiary">{team.name}</div>
            )}
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          {editMode ? (
            <>
              <button onClick={handleSave} className="btn-terminal flex-1">Save</button>
              <button onClick={() => setEditMode(false)} className="btn-terminal-secondary flex-1">
                Cancel
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditMode(true)} className="btn-terminal flex-1">
                Edit Profile
              </button>
              <button onClick={handleLogout} className="btn-terminal-secondary flex-1 text-terminal-accent-red">
                Logout
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## Option 2: Supabase Implementation

### Prerequisites

1. Create Supabase account: https://supabase.com
2. Create new project
3. Get API keys from Settings → API

### Step 1: Install Supabase

```bash
cd llmos-lite/ui
npm install @supabase/supabase-js
```

### Step 2: Create Supabase Client

Create `ui/lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Profile = {
  id: string;
  email: string;
  name: string;
  team_id: string;
  created_at: string;
};

export type Team = {
  id: string;
  name: string;
  created_at: string;
};
```

### Step 3: Create Database Schema

Run this SQL in Supabase SQL Editor:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Teams table
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Profiles table (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  team_id UUID REFERENCES teams(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can view their team"
  ON teams FOR SELECT
  USING (id IN (SELECT team_id FROM profiles WHERE id = auth.uid()));
```

### Step 4: Create Auth Component

Create `ui/components/auth/SupabaseAuth.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function SupabaseAuth({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    setLoading(true);
    setError('');

    try {
      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) throw authError;

      if (authData.user) {
        // Create or get team
        const { data: teamData, error: teamError } = await supabase
          .from('teams')
          .upsert({ name: teamName })
          .select()
          .single();

        if (teamError) throw teamError;

        // Create profile
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: authData.user.id,
            email: authData.user.email,
            name,
            team_id: teamData.id,
          });

        if (profileError) throw profileError;

        onSuccess();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async () => {
    setLoading(true);
    setError('');

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-terminal-bg-primary p-4">
      <div className="terminal-panel max-w-md w-full">
        <h1 className="terminal-heading text-lg mb-6">
          {mode === 'signin' ? 'Sign In' : 'Create Account'}
        </h1>

        <div className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="terminal-input w-full"
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="terminal-input w-full"
          />

          {mode === 'signup' && (
            <>
              <input
                type="text"
                placeholder="Your Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="terminal-input w-full"
              />

              <input
                type="text"
                placeholder="Team Name"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className="terminal-input w-full"
              />
            </>
          )}

          {error && (
            <div className="text-xs text-terminal-accent-red p-2 bg-terminal-accent-red/10 rounded">
              {error}
            </div>
          )}

          <button
            onClick={mode === 'signin' ? handleSignIn : handleSignUp}
            disabled={loading}
            className="btn-terminal w-full"
          >
            {loading ? 'Loading...' : mode === 'signin' ? 'Sign In' : 'Sign Up'}
          </button>

          <button
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            className="text-xs text-terminal-accent-blue hover:underline w-full text-center"
          >
            {mode === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Step 5: Add Environment Variables

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

---

## Comparison

| Feature | localStorage | Supabase |
|---------|-------------|----------|
| **Setup Time** | 1-2 hours | 4-6 hours |
| **Cost** | Free | Free (50K MAU) |
| **Multi-device** | ❌ | ✅ |
| **Real auth** | ❌ | ✅ |
| **Team management** | Basic | Full |
| **Security** | Client-side only | Server-side |
| **Offline** | ✅ | ❌ (needs sync) |
| **Data persistence** | Browser only | Database |

---

## Recommendation

**Start with Option 1 (localStorage)** because:
1. ✅ LLMos-lite is currently designed for local/personal use
2. ✅ No backend infrastructure needed
3. ✅ Aligns with "zero server costs" philosophy
4. ✅ Can upgrade to Supabase later if needed
5. ✅ Faster to ship

You can always migrate to Supabase later when you need:
- Multi-user teams
- Cross-device sync
- Real authentication
- Production deployment

---

## Migration Path (localStorage → Supabase)

When ready to migrate:

1. Export data from localStorage
2. Set up Supabase
3. Import data to Supabase
4. Update components to use Supabase auth
5. Keep localStorage as fallback

The component interfaces can stay the same, just swap the storage backend!

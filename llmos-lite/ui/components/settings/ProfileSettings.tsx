'use client';

import { useState, useEffect } from 'react';
import { UserStorage, User, Team } from '@/lib/user-storage';
import { LLMStorage } from '@/lib/llm-client';

interface ProfileSettingsProps {
  onClose: () => void;
}

export default function ProfileSettings({ onClose }: ProfileSettingsProps) {
  const [user, setUser] = useState<User | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    setUser(UserStorage.getUser());
    setTeam(UserStorage.getTeam());
  }, []);

  const handleSave = () => {
    if (user && team) {
      UserStorage.saveUser(user);
      UserStorage.saveTeam(team);
      setEditMode(false);

      // Reload to update header
      window.location.reload();
    }
  };

  const handleLogout = () => {
    if (confirm('Are you sure you want to logout?\n\nThis will clear all local data including your API key, profile, and preferences.')) {
      UserStorage.clearAll();
      LLMStorage.clearAll();
      window.location.reload();
    }
  };

  if (!user || !team) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="terminal-panel max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="terminal-heading text-lg">Profile Settings</h1>
          <button
            onClick={onClose}
            className="text-terminal-fg-secondary hover:text-terminal-fg-primary transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Profile Fields */}
        <div className="space-y-4 mb-6">
          {/* User ID (read-only) */}
          <div>
            <label className="block text-xs text-terminal-fg-secondary mb-1">
              User ID
            </label>
            <div className="terminal-input bg-terminal-bg-tertiary text-terminal-fg-tertiary cursor-not-allowed">
              {user.id}
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs text-terminal-fg-secondary mb-1">
              Email
            </label>
            {editMode ? (
              <input
                type="email"
                value={user.email}
                onChange={(e) => setUser({ ...user, email: e.target.value })}
                className="terminal-input w-full"
              />
            ) : (
              <div className="terminal-input bg-terminal-bg-tertiary">
                {user.email}
              </div>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs text-terminal-fg-secondary mb-1">
              Name
            </label>
            {editMode ? (
              <input
                type="text"
                value={user.name}
                onChange={(e) => setUser({ ...user, name: e.target.value })}
                className="terminal-input w-full"
              />
            ) : (
              <div className="terminal-input bg-terminal-bg-tertiary">
                {user.name}
              </div>
            )}
          </div>

          {/* Team */}
          <div>
            <label className="block text-xs text-terminal-fg-secondary mb-1">
              Team Name
            </label>
            {editMode ? (
              <input
                type="text"
                value={team.name}
                onChange={(e) => setTeam({ ...team, name: e.target.value })}
                className="terminal-input w-full"
              />
            ) : (
              <div className="terminal-input bg-terminal-bg-tertiary">
                {team.name}
              </div>
            )}
          </div>

          {/* Created Date */}
          <div>
            <label className="block text-xs text-terminal-fg-secondary mb-1">
              Account Created
            </label>
            <div className="terminal-input bg-terminal-bg-tertiary text-terminal-fg-tertiary cursor-not-allowed">
              {new Date(user.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          {editMode ? (
            <div className="flex gap-3">
              <button
                onClick={handleSave}
                className="btn-terminal flex-1"
              >
                Save Changes
              </button>
              <button
                onClick={() => {
                  setUser(UserStorage.getUser());
                  setTeam(UserStorage.getTeam());
                  setEditMode(false);
                }}
                className="btn-terminal-secondary flex-1"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={() => setEditMode(true)}
                className="btn-terminal w-full"
              >
                Edit Profile
              </button>
              <button
                onClick={handleLogout}
                className="btn-terminal-secondary w-full text-terminal-accent-red hover:border-terminal-accent-red"
              >
                Logout & Clear Data
              </button>
            </>
          )}
        </div>

        {/* Info Note */}
        <div className="mt-6 p-3 bg-terminal-bg-tertiary border border-terminal-border rounded">
          <p className="text-xs text-terminal-fg-secondary">
            💡 <span className="text-terminal-accent-blue">Note:</span> All data is stored locally in your browser.
            Clearing your browser data will remove your profile and settings.
          </p>
        </div>
      </div>
    </div>
  );
}

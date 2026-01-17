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
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="card-elevated max-w-md w-full animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="heading-3">Profile Settings</h1>
          <button
            onClick={onClose}
            className="btn-icon"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Profile Fields */}
        <div className="space-y-4 mb-6">
          {/* User ID (read-only) */}
          <div>
            <label className="block text-xs text-fg-secondary mb-1.5 font-medium">
              User ID
            </label>
            <div className="input bg-bg-tertiary text-fg-tertiary cursor-not-allowed">
              {user.id}
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs text-fg-secondary mb-1.5 font-medium">
              Email
            </label>
            {editMode ? (
              <input
                type="email"
                value={user.email}
                onChange={(e) => setUser({ ...user, email: e.target.value })}
                className="input w-full"
              />
            ) : (
              <div className="input bg-bg-tertiary">
                {user.email}
              </div>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs text-fg-secondary mb-1.5 font-medium">
              Name
            </label>
            {editMode ? (
              <input
                type="text"
                value={user.name}
                onChange={(e) => setUser({ ...user, name: e.target.value })}
                className="input w-full"
              />
            ) : (
              <div className="input bg-bg-tertiary">
                {user.name}
              </div>
            )}
          </div>

          {/* Team */}
          <div>
            <label className="block text-xs text-fg-secondary mb-1.5 font-medium">
              Team Name
            </label>
            {editMode ? (
              <input
                type="text"
                value={team.name}
                onChange={(e) => setTeam({ ...team, name: e.target.value })}
                className="input w-full"
              />
            ) : (
              <div className="input bg-bg-tertiary">
                {team.name}
              </div>
            )}
          </div>

          {/* Created Date */}
          <div>
            <label className="block text-xs text-fg-secondary mb-1.5 font-medium">
              Account Created
            </label>
            <div className="input bg-bg-tertiary text-fg-tertiary cursor-not-allowed">
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
                className="btn-primary flex-1"
              >
                Save Changes
              </button>
              <button
                onClick={() => {
                  setUser(UserStorage.getUser());
                  setTeam(UserStorage.getTeam());
                  setEditMode(false);
                }}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={() => setEditMode(true)}
                className="btn-primary w-full"
              >
                Edit Profile
              </button>
              <button
                onClick={handleLogout}
                className="btn-secondary w-full text-accent-error hover:border-accent-error hover:text-accent-error"
              >
                Logout & Clear Data
              </button>
            </>
          )}
        </div>

        {/* Info Note */}
        <div className="mt-6 p-3 bg-bg-tertiary border border-border-primary rounded-lg">
          <p className="text-xs text-fg-secondary leading-relaxed">
            <span className="text-accent-info font-medium">Note:</span> All data is stored locally in your browser.
            Clearing your browser data will remove your profile and settings.
          </p>
        </div>
      </div>
    </div>
  );
}

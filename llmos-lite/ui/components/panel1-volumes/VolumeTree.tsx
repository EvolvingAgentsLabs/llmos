'use client';

import { useEffect, useState } from 'react';
import { UserStorage } from '@/lib/user-storage';

interface VolumeTreeProps {
  activeVolume: 'system' | 'team' | 'user';
  onVolumeChange: (volume: 'system' | 'team' | 'user') => void;
}

export default function VolumeTree({ activeVolume, onVolumeChange }: VolumeTreeProps) {
  const [userName, setUserName] = useState<string>('');
  const [teamName, setTeamName] = useState<string>('');

  useEffect(() => {
    // Load real user data from localStorage
    const user = UserStorage.getUser();
    const team = UserStorage.getTeam();

    if (user) {
      setUserName(user.email.split('@')[0]);
    }
    if (team) {
      setTeamName(team.name);
    }
  }, []);

  const volumes = [
    {
      id: 'system' as const,
      label: 'System',
      icon: '📁',
      readonly: true,
    },
    {
      id: 'team' as const,
      label: teamName ? `Team: ${teamName}` : 'Team',
      icon: '📁',
      readonly: false,
    },
    {
      id: 'user' as const,
      label: userName ? `User: ${userName}` : 'User',
      icon: '📁',
      readonly: false,
    },
  ];

  return (
    <div className="space-y-2">
      {volumes.map((volume) => (
        <div
          key={volume.id}
          onClick={() => onVolumeChange(volume.id)}
          className={`
            p-2 rounded cursor-pointer transition-colors
            ${activeVolume === volume.id ? 'terminal-active' : 'terminal-hover'}
          `}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>{volume.icon}</span>
              <span className="text-sm">{volume.label}</span>
              {activeVolume === volume.id && (
                <span className="text-terminal-accent-green">●</span>
              )}
            </div>
            {volume.readonly && (
              <span className="text-xs text-terminal-fg-tertiary">readonly</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

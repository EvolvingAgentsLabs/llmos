'use client';

import { useEffect, useState } from 'react';
import { getVFS } from '@/lib/virtual-fs';

export default function DebugVFSPage() {
  const [vfsState, setVFSState] = useState<{
    index: any;
    allFiles: any[];
    localStorage: Record<string, string>;
  } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const vfs = getVFS();
    const allFiles = vfs.getAllFiles();

    // Get raw localStorage
    const localStorageData: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('vfs:')) {
        const value = localStorage.getItem(key);
        if (value) {
          localStorageData[key] = value;
        }
      }
    }

    setVFSState({
      index: JSON.parse(localStorage.getItem('vfs:index') || '{}'),
      allFiles,
      localStorage: localStorageData,
    });
  }, []);

  if (!vfsState) return <div className="p-8">Loading...</div>;

  return (
    <div className="min-h-screen bg-bg-primary p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="heading-1 mb-6">VFS Debug Page</h1>

        {/* Index */}
        <div className="card-elevated mb-6">
          <h2 className="heading-3 mb-4">VFS Index</h2>
          <pre className="bg-bg-tertiary p-4 rounded-lg text-xs overflow-x-auto">
            {JSON.stringify(vfsState.index, null, 2)}
          </pre>
        </div>

        {/* All Files */}
        <div className="card-elevated mb-6">
          <h2 className="heading-3 mb-4">All Files ({vfsState.allFiles.length})</h2>
          <div className="space-y-2">
            {vfsState.allFiles.map((file, idx) => (
              <div key={idx} className="bg-bg-tertiary p-3 rounded-lg">
                <div className="text-sm font-semibold mb-2">{file.path}</div>
                <div className="text-xs text-fg-secondary">
                  <div>Size: {file.size} bytes</div>
                  <div>Modified: {file.modified}</div>
                </div>
                <details className="mt-2">
                  <summary className="text-xs text-accent-primary cursor-pointer">View Content</summary>
                  <pre className="mt-2 text-xs bg-bg-primary p-2 rounded overflow-x-auto">
                    {file.content}
                  </pre>
                </details>
              </div>
            ))}
          </div>
        </div>

        {/* localStorage Raw */}
        <div className="card-elevated">
          <h2 className="heading-3 mb-4">localStorage (Raw)</h2>
          <div className="space-y-2">
            {Object.entries(vfsState.localStorage).map(([key, value]) => (
              <details key={key} className="bg-bg-tertiary p-3 rounded-lg">
                <summary className="text-sm font-semibold cursor-pointer">{key}</summary>
                <pre className="mt-2 text-xs overflow-x-auto">
                  {value}
                </pre>
              </details>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

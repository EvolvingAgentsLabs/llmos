'use client';

/**
 * useDesktopAppletSync - Hook to sync VFS applets with the desktop
 *
 * Listens to VFS events and automatically adds/removes applets from the desktop
 * when .tsx files are created or deleted in projects.
 */

import { useEffect, useCallback } from 'react';
import { getVFS, VFSFile } from '@/lib/virtual-fs';
import { DesktopAppletManager, DesktopApplet } from '@/lib/applets/desktop-applet-manager';
import { VolumeType } from '@/lib/volumes/file-operations';

/**
 * Check if a file path represents an applet
 */
function isAppletFile(path: string): boolean {
  // Check if it's a .tsx file in a project directory
  // Applets are typically index.tsx files in project folders
  return (
    path.startsWith('projects/') &&
    (path.endsWith('.tsx') || path.endsWith('.jsx')) &&
    !path.includes('node_modules')
  );
}

/**
 * Extract project name and applet info from path
 */
function getAppletInfoFromPath(path: string): { name: string; projectPath: string } | null {
  // Path format: projects/<project-name>/.../<file>.tsx
  const parts = path.split('/');
  if (parts.length < 3) return null;

  const projectName = parts[1];
  const fileName = parts[parts.length - 1].replace(/\.(tsx|jsx)$/, '');

  // Use the file name if it's index, otherwise use the project name
  const name = fileName === 'index' ? projectName : fileName;

  return {
    name: name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' '),
    projectPath: `projects/${projectName}`,
  };
}

/**
 * Determine volume type from path
 */
function getVolumeFromPath(path: string): VolumeType {
  if (path.startsWith('system/')) return 'system';
  if (path.startsWith('team/')) return 'team';
  return 'user';
}

/**
 * Hook to sync VFS applets with the desktop
 */
export function useDesktopAppletSync() {
  // Scan existing projects and add applets to desktop
  const syncExistingApplets = useCallback(() => {
    try {
      const vfs = getVFS();
      const allFiles = vfs.getAllFiles();

      // Find all applet files
      const appletFiles = allFiles.filter(f => isAppletFile(f.path));

      // Add each applet to the desktop if not already there
      appletFiles.forEach(file => {
        if (!DesktopAppletManager.findAppletByPath(file.path)) {
          const appletInfo = getAppletInfoFromPath(file.path);
          if (appletInfo) {
            const desktopApplet: DesktopApplet = {
              id: `vfs-${file.path.replace(/[^a-zA-Z0-9]/g, '-')}`,
              name: appletInfo.name,
              description: `Project applet from ${appletInfo.projectPath}`,
              filePath: file.path,
              volume: getVolumeFromPath(file.path),
              createdAt: file.created,
              isActive: false,
            };
            DesktopAppletManager.addApplet(desktopApplet);
          }
        }
      });

      // Remove desktop applets that no longer exist in VFS
      const allRegions = DesktopAppletManager.getAllRegions();
      const allDesktopApplets = [
        ...allRegions.personal,
        ...allRegions.team,
      ];

      allDesktopApplets.forEach(applet => {
        // Skip system applets and non-VFS applets
        if (!applet.filePath.startsWith('projects/')) return;

        const fileExists = allFiles.some(f => f.path === applet.filePath);
        if (!fileExists) {
          DesktopAppletManager.removeApplet(applet.id);
        }
      });
    } catch (error) {
      console.error('Failed to sync existing applets:', error);
    }
  }, []);

  // Handle file creation
  const handleFileCreated = useCallback((path: string, file?: VFSFile) => {
    if (!isAppletFile(path)) return;

    const appletInfo = getAppletInfoFromPath(path);
    if (!appletInfo) return;

    const desktopApplet: DesktopApplet = {
      id: `vfs-${path.replace(/[^a-zA-Z0-9]/g, '-')}`,
      name: appletInfo.name,
      description: `Project applet from ${appletInfo.projectPath}`,
      filePath: path,
      volume: getVolumeFromPath(path),
      createdAt: file?.created || new Date().toISOString(),
      isActive: false,
    };

    DesktopAppletManager.addApplet(desktopApplet);
    console.log('[DesktopSync] Added applet to desktop:', desktopApplet.name);
  }, []);

  // Handle file deletion
  const handleFileDeleted = useCallback((path: string) => {
    if (!isAppletFile(path)) return;

    DesktopAppletManager.removeAppletByPath(path);
    console.log('[DesktopSync] Removed applet from desktop:', path);
  }, []);

  // Subscribe to VFS events
  useEffect(() => {
    const vfs = getVFS();

    // Initial sync
    syncExistingApplets();

    // Subscribe to VFS events
    const unsubCreate = vfs.on('file:created', handleFileCreated);
    const unsubDelete = vfs.on('file:deleted', handleFileDeleted);

    return () => {
      unsubCreate();
      unsubDelete();
    };
  }, [syncExistingApplets, handleFileCreated, handleFileDeleted]);

  return {
    syncExistingApplets,
  };
}

export default useDesktopAppletSync;

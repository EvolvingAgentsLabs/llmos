/**
 * Artifact Store (Zustand)
 *
 * React state management for artifacts using Zustand
 */

import { create } from 'zustand';
import {
  Artifact,
  CreateArtifactParams,
  UpdateArtifactParams,
  ArtifactFilterOptions,
  ArtifactVolume,
} from './types';
import { artifactManager } from './artifact-manager';

interface ArtifactStore {
  // State
  artifacts: Artifact[];
  initialized: boolean;

  // Actions
  initialize: () => Promise<void>;
  createArtifact: (params: CreateArtifactParams) => Artifact;
  updateArtifact: (id: string, params: UpdateArtifactParams) => Artifact | undefined;
  deleteArtifact: (id: string) => boolean;
  getArtifact: (id: string) => Artifact | undefined;
  filterArtifacts: (options: ArtifactFilterOptions) => Artifact[];
  getByVolume: (volume: ArtifactVolume) => Artifact[];
  getTemporal: () => Artifact[];
  getCommitted: () => Artifact[];
  commitArtifact: (id: string, commitHash: string, filePath: string) => Artifact | undefined;
  forkArtifact: (id: string, targetVolume?: ArtifactVolume) => Artifact | undefined;
  refresh: () => void;
}

export const useArtifactStore = create<ArtifactStore>((set, get) => ({
  // Initial state
  artifacts: [],
  initialized: false,

  // Initialize the store
  initialize: async () => {
    await artifactManager.initialize();
    set({
      artifacts: artifactManager.getAll(),
      initialized: true,
    });
  },

  // Create a new artifact
  createArtifact: (params: CreateArtifactParams) => {
    const artifact = artifactManager.create(params);
    set({ artifacts: artifactManager.getAll() });
    return artifact;
  },

  // Update an artifact
  updateArtifact: (id: string, params: UpdateArtifactParams) => {
    const updated = artifactManager.update(id, params);
    if (updated) {
      set({ artifacts: artifactManager.getAll() });
    }
    return updated;
  },

  // Delete an artifact
  deleteArtifact: (id: string) => {
    const deleted = artifactManager.delete(id);
    if (deleted) {
      set({ artifacts: artifactManager.getAll() });
    }
    return deleted;
  },

  // Get a single artifact
  getArtifact: (id: string) => {
    return artifactManager.get(id);
  },

  // Filter artifacts
  filterArtifacts: (options: ArtifactFilterOptions) => {
    return artifactManager.filter(options);
  },

  // Get artifacts by volume
  getByVolume: (volume: ArtifactVolume) => {
    return artifactManager.getByVolume(volume);
  },

  // Get temporal artifacts
  getTemporal: () => {
    return artifactManager.getTemporal();
  },

  // Get committed artifacts
  getCommitted: () => {
    return artifactManager.getCommitted();
  },

  // Commit an artifact
  commitArtifact: (id: string, commitHash: string, filePath: string) => {
    const committed = artifactManager.commit(id, commitHash, filePath);
    if (committed) {
      set({ artifacts: artifactManager.getAll() });
    }
    return committed;
  },

  // Fork an artifact
  forkArtifact: (id: string, targetVolume?: ArtifactVolume) => {
    const forked = artifactManager.fork(id, targetVolume);
    if (forked) {
      set({ artifacts: artifactManager.getAll() });
    }
    return forked;
  },

  // Refresh the artifacts list
  refresh: () => {
    set({ artifacts: artifactManager.getAll() });
  },
}));

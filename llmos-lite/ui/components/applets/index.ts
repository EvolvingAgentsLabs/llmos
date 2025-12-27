/**
 * Applets Module - The Infinite App Store
 *
 * Export all applet-related components for easy imports
 */

export { AppletViewer, AppletCard } from './AppletViewer';
export { AppletPanel, AppletDock } from './AppletPanel';
export { InlineAppletDisplay } from './InlineAppletDisplay';

// Re-export types
export type { AppletMetadata, AppletState, AppletProps } from '@/lib/runtime/applet-runtime';

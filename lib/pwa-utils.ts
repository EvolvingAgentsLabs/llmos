/**
 * PWA Utilities
 *
 * Service worker registration, installation prompts, and offline detection
 */

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

/**
 * Register service worker
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    console.log('[PWA] Service workers not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    console.log('[PWA] Service worker registered:', registration.scope);

    // Check for updates periodically
    setInterval(() => {
      registration.update();
    }, 60 * 60 * 1000); // Every hour

    // Listen for updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // New version available
          console.log('[PWA] New version available');
          notifyUpdate();
        }
      });
    });

    return registration;
  } catch (error) {
    console.error('[PWA] Service worker registration failed:', error);
    return null;
  }
}

/**
 * Unregister service worker
 */
export async function unregisterServiceWorker(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const unregistered = await registration.unregister();
    console.log('[PWA] Service worker unregistered:', unregistered);
    return unregistered;
  } catch (error) {
    console.error('[PWA] Service worker unregister failed:', error);
    return false;
  }
}

/**
 * Setup install prompt handler
 */
export function setupInstallPrompt(
  onPromptReady: (prompt: () => Promise<void>) => void
): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    console.log('[PWA] Install prompt ready');

    onPromptReady(async () => {
      if (!deferredPrompt) return;

      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;

      console.log('[PWA] Install prompt outcome:', outcome);
      deferredPrompt = null;
    });
  });

  window.addEventListener('appinstalled', () => {
    console.log('[PWA] App installed');
    deferredPrompt = null;
  });
}

/**
 * Check if app is installed
 */
export function isInstalled(): boolean {
  if (typeof window === 'undefined') return false;

  // Check if running as installed PWA
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://')
  );
}

/**
 * Check if app can be installed
 */
export function canInstall(): boolean {
  return deferredPrompt !== null;
}

/**
 * Trigger install prompt
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | null> {
  if (!deferredPrompt) {
    console.warn('[PWA] No install prompt available');
    return null;
  }

  try {
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    return outcome;
  } catch (error) {
    console.error('[PWA] Install prompt failed:', error);
    return null;
  }
}

/**
 * Check online status
 */
export function isOnline(): boolean {
  if (typeof window === 'undefined') return true;
  return navigator.onLine;
}

/**
 * Setup online/offline listeners
 */
export function setupOnlineListener(
  onOnline: () => void,
  onOffline: () => void
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleOnline = () => {
    console.log('[PWA] Back online');
    onOnline();
  };

  const handleOffline = () => {
    console.log('[PWA] Gone offline');
    onOffline();
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

/**
 * Request background sync
 */
export async function requestBackgroundSync(tag: string): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    if ('sync' in registration) {
      await (registration as any).sync.register(tag);
      console.log('[PWA] Background sync requested:', tag);
    }
  } catch (error) {
    console.error('[PWA] Background sync failed:', error);
  }
}

/**
 * Request notification permission
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission;
  }

  return Notification.permission;
}

/**
 * Show notification
 */
export async function showNotification(
  title: string,
  options?: NotificationOptions
): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      ...options,
    });
  } catch (error) {
    console.error('[PWA] Notification failed:', error);
  }
}

/**
 * Notify about app update
 */
function notifyUpdate(): void {
  if (typeof window === 'undefined') return;

  // Dispatch custom event
  window.dispatchEvent(new CustomEvent('app-update-available'));

  // Show notification if permission granted
  if (Notification.permission === 'granted') {
    showNotification('Update Available', {
      body: 'A new version of LLMos-Lite is available. Refresh to update.',
      tag: 'app-update',
      requireInteraction: true,
    });
  }
}

/**
 * Get app info
 */
export function getAppInfo() {
  return {
    isInstalled: isInstalled(),
    canInstall: canInstall(),
    isOnline: isOnline(),
    notificationPermission: typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'denied',
  };
}

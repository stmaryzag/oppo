import OneSignal from 'react-onesignal';
import { UserData } from '../types';
import { auth } from '../lib/firebase';

export const ONESIGNAL_APP_ID = '779cfd74-9eb2-4c11-94a2-495b0e084014';

let isInitialized = false;
let initPromise: Promise<boolean> | null = null;

export const initOneSignal = async (): Promise<boolean> => {
  if (typeof window === 'undefined') return false;
  if (isInitialized) return true;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // Safely determine base path to avoid 404s on GitHub Pages or nested paths
      const basePath = (import.meta as any).env?.BASE_URL || '/';
      // Use the Vite PWA generated sw.js which we injected OneSignal into
      const swPath = `${basePath === './' ? '/' : basePath}sw.js`.replace(/\/\/+/g, '/');
      const scopePath = basePath === './' ? '/' : basePath;

      await OneSignal.init({
        appId: ONESIGNAL_APP_ID,
        allowLocalhostAsSecureOrigin: true,
        autoResubscribe: false,
        serviceWorkerPath: swPath,
        serviceWorkerParam: { scope: scopePath },
      });
      isInitialized = true;
      console.log(`✅ OneSignal Web Push SDK Initialized successfully with custom SW: ${swPath}`);
      return true;
    } catch (err) {
      console.warn('OneSignal init notice:', err);
      // Even if init fails (e.g. in non-supported browser context/iframe), don't crash
      return false;
    }
  })();

  return initPromise;
};

/**
 * Identify user with OneSignal (login), set tags and role for targeting
 */
export const identifyOneSignalUser = async (user: UserData) => {
  try {
    const ok = await initOneSignal();
    if (!ok) return;

    if (user?.id) {
      // Login with user ID as external_id
      await OneSignal.login(user.id);
      
      // Set user tags for smart segment filtering
      const tags: Record<string, string> = {
        role: user.role || 'deacon',
        username: user.username || '',
        fullName: user.fullName || '',
      };

      if (user.grade) tags.grade = user.grade;
      if (user.teamId) tags.teamId = user.teamId;
      if (user.assignedAssistantId) tags.assignedAssistantId = user.assignedAssistantId;

      await OneSignal.User.addTags(tags);
      console.log(`✅ OneSignal identified user: ${user.fullName} (${user.role})`);
    }
  } catch (err) {
    console.warn('Error identifying OneSignal user:', err);
  }
};

/**
 * Logout from OneSignal session on sign out
 */
export const logoutOneSignalUser = async () => {
  try {
    if (isInitialized) {
      await OneSignal.logout();
    }
  } catch (err) {
    console.warn('Error logging out from OneSignal:', err);
  }
};

/**
 * Request notification permission from browser
 */
export const requestPushPermission = async (): Promise<boolean> => {
  try {
    await initOneSignal();
    const granted = await OneSignal.Notifications.requestPermission();
    return !!granted;
  } catch (err) {
    console.warn('Error requesting push permission:', err);
    return false;
  }
};

/**
 * Check if push notifications are enabled on this device
 */
export const isPushPermissionGranted = (): boolean => {
  try {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission === 'granted';
    }
  } catch (e) {
    // fallback
  }
  return false;
};

/**
 * Send push notification via server API proxy directly to devices or users!
 */
export const sendOneSignalPush = async (params: {
  externalUserIds?: string[];
  includedSegments?: string[];
  filters?: any[];
  title: string;
  body: string;
  url?: string;
  data?: Record<string, any>;
}) => {
  try {
    console.log('🚀 Dispatching OneSignal Push request via backend proxy...');
    
    // Get Firebase Auth token to authorize the request
    const user = auth.currentUser;
    const token = user ? await user.getIdToken() : '';
    
    // Call server endpoint (avoids CORS and protects API keys)
    const res = await fetch('/api/onesignal/push', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(params)
    });

    if (res.ok) {
      const data = await res.json();
      console.log('✅ Server Push Response:', data);
      return data.result || data;
    }

    console.warn('Backend proxy returned status:', res.status);
    throw new Error('Failed to dispatch push notification via backend proxy.');
  } catch (err) {
    console.error('❌ Error in sendOneSignalPush:', err);
    return null;
  }
};

import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface SystemSettingsConfig {
  subscriptionPoints: number; // default 300
  afteqadCallPoints: number;   // default 50
  subscriptionAmount: number; // default 30
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettingsConfig = {
  subscriptionPoints: 300,
  afteqadCallPoints: 50,
  subscriptionAmount: 30,
};

const SETTINGS_DOC_REF = doc(db, 'system_settings', 'general_config');

export const getSystemSettings = async (): Promise<SystemSettingsConfig> => {
  try {
    const snap = await getDoc(SETTINGS_DOC_REF);
    if (snap.exists()) {
      const data = snap.data() as Partial<SystemSettingsConfig>;
      return {
        subscriptionPoints: data.subscriptionPoints ?? DEFAULT_SYSTEM_SETTINGS.subscriptionPoints,
        afteqadCallPoints: data.afteqadCallPoints ?? DEFAULT_SYSTEM_SETTINGS.afteqadCallPoints,
        subscriptionAmount: data.subscriptionAmount ?? DEFAULT_SYSTEM_SETTINGS.subscriptionAmount,
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy
      };
    }
  } catch (err) {
    console.error('Error reading system settings:', err);
  }
  return DEFAULT_SYSTEM_SETTINGS;
};

export const updateSystemSettings = async (
  newSettings: Partial<SystemSettingsConfig>,
  userId?: string
): Promise<void> => {
  try {
    await setDoc(SETTINGS_DOC_REF, {
      ...newSettings,
      updatedAt: new Date().toISOString(),
      updatedBy: userId || 'admin'
    }, { merge: true });
  } catch (err) {
    console.error('Error saving system settings:', err);
    throw err;
  }
};

export const subscribeSystemSettings = (
  callback: (settings: SystemSettingsConfig) => void
) => {
  return onSnapshot(SETTINGS_DOC_REF, (snap) => {
    if (snap.exists()) {
      const data = snap.data() as Partial<SystemSettingsConfig>;
      callback({
        subscriptionPoints: data.subscriptionPoints ?? DEFAULT_SYSTEM_SETTINGS.subscriptionPoints,
        afteqadCallPoints: data.afteqadCallPoints ?? DEFAULT_SYSTEM_SETTINGS.afteqadCallPoints,
        subscriptionAmount: data.subscriptionAmount ?? DEFAULT_SYSTEM_SETTINGS.subscriptionAmount,
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy
      });
    } else {
      callback(DEFAULT_SYSTEM_SETTINGS);
    }
  }, (err) => {
    console.error('Error in system settings listener:', err);
    callback(DEFAULT_SYSTEM_SETTINGS);
  });
};

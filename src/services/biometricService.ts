import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo-modules-core';

const BIOMETRIC_STORAGE_KEY = '@simsit_biometric_session';

export interface BiometricSessionData {
  identifier: string;
  token: string;
  user: any;
  roles: string[];
  permissions: string[];
  portal?: string;
  scope?: any;
  timestamp: number;
}

let cachedModule: any = undefined;

function getLocalAuth(): any {
  if (cachedModule !== undefined) {
    return cachedModule;
  }

  // Gracefully check if the native Android binary includes ExpoLocalAuthentication
  // BEFORE requiring the package, avoiding [Error: Cannot find native module]
  const nativeModule = requireOptionalNativeModule('ExpoLocalAuthentication');
  if (!nativeModule) {
    cachedModule = null;
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-local-authentication');
    cachedModule = mod;
  } catch {
    cachedModule = null;
  }

  return cachedModule;
}

export const biometricService = {
  isNativeModuleInstalled(): boolean {
    return Boolean(requireOptionalNativeModule('ExpoLocalAuthentication'));
  },

  async isHardwareSupported(): Promise<boolean> {
    const mod = getLocalAuth();
    if (!mod) return false;
    try {
      return await mod.hasHardwareAsync();
    } catch {
      return false;
    }
  },

  async isEnrolled(): Promise<boolean> {
    const mod = getLocalAuth();
    if (!mod) return false;
    try {
      return await mod.isEnrolledAsync();
    } catch {
      return false;
    }
  },

  async isAvailable(): Promise<boolean> {
    const mod = getLocalAuth();
    if (!mod) return false;
    try {
      const supported = await mod.hasHardwareAsync();
      const enrolled = await mod.isEnrolledAsync();
      return Boolean(supported && enrolled);
    } catch {
      return false;
    }
  },

  async saveSession(session: Omit<BiometricSessionData, 'timestamp'>): Promise<void> {
    try {
      const data: BiometricSessionData = {
        ...session,
        timestamp: Date.now(),
      };
      await AsyncStorage.setItem(BIOMETRIC_STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Gagal menyimpan sesi biometrik:', e);
    }
  },

  async getStoredSession(): Promise<BiometricSessionData | null> {
    try {
      const raw = await AsyncStorage.getItem(BIOMETRIC_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  async clearSession(): Promise<void> {
    try {
      await AsyncStorage.removeItem(BIOMETRIC_STORAGE_KEY);
    } catch (e) {
      console.warn('Gagal menghapus sesi biometrik:', e);
    }
  },

  async authenticate(promptMessage = 'Verifikasi sidik jari atau Face ID untuk masuk ke SIMSIT'): Promise<{ success: boolean; message?: string }> {
    const mod = getLocalAuth();
    if (!mod) {
      return {
        success: false,
        message: 'Modul biometrik memerlukan build APK baru (npx expo run:android). Silakan gunakan Password.',
      };
    }
    try {
      const result = await mod.authenticateAsync({
        promptMessage,
        cancelLabel: 'Batal',
        fallbackLabel: 'Gunakan Kata Sandi',
        disableDeviceFallback: false,
      });
      return { success: result.success };
    } catch (error: any) {
      return {
        success: false,
        message: error?.message || 'Verifikasi biometrik gagal atau dibatalkan.',
      };
    }
  },
};

export default biometricService;

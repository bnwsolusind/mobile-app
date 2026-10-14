import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  getActiveBaseUrl,
  setActiveBaseUrl,
  pingApiUrl,
  normalizeApiUrl,
  getMetroHostIp,
  API_BASE_URL,
} from '../services/api';
import { useMobileConfigStore } from './mobileConfigStore';

export type ServerEnvironment = 'production' | 'staging' | 'local' | 'custom';

export interface ServerPreset {
  id: ServerEnvironment;
  title: string;
  subtitle: string;
  badge: string;
  badgeColor: string;
  icon: string;
  getUrl: () => string;
}

export const SERVER_STORAGE_KEY = 'simsit_saved_server_config';

export const getLocalDevAutoUrl = (): string => {
  const metroHost = getMetroHostIp();
  if (metroHost) {
    return `http://${metroHost}:8000/api`;
  }
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8000/api';
  }
  return 'http://127.0.0.1:8000/api';
};

export const SERVER_PRESETS: ServerPreset[] = [
  {
    id: 'local',
    title: 'Server Lokal (Development)',
    subtitle: 'PC/Mac pengembang atau Android Emulator',
    badge: 'LOCAL',
    badgeColor: '#0284C7', // Sky blue
    icon: 'laptop',
    getUrl: () => {
      // Prioritaskan configured URL di dev jika ada, jika tidak gunakan auto-detect
      if (process.env.EXPO_PUBLIC_API_URL?.trim()) {
        return normalizeApiUrl(process.env.EXPO_PUBLIC_API_URL);
      }
      return getLocalDevAutoUrl();
    },
  },
  {
    id: 'staging',
    title: 'Server Staging (Uji Coba)',
    subtitle: 'Server simulasi & validasi fitur baru',
    badge: 'STAGING',
    badgeColor: '#D97706', // Amber
    icon: 'test-tube',
    getUrl: () => {
      return (
        process.env.EXPO_PUBLIC_STAGING_API_URL?.trim() ||
        'https://staging-simsit.sekolah.sch.id/api'
      );
    },
  },
  {
    id: 'production',
    title: 'Server Live (Production)',
    subtitle: 'Server operasional resmi sekolah',
    badge: 'LIVE',
    badgeColor: '#059669', // Emerald
    icon: 'shield-check',
    getUrl: () => {
      return (
        process.env.EXPO_PUBLIC_PROD_API_URL?.trim() ||
        'https://simsit.sekolah.sch.id/api'
      );
    },
  },
  {
    id: 'custom',
    title: 'Kustom / IP Tertentu',
    subtitle: 'Ketik manual alamat IP atau host URL tujuan',
    badge: 'CUSTOM',
    badgeColor: '#7C3AED', // Violet
    icon: 'cog-outline',
    getUrl: () => '',
  },
];

interface ServerConfigState {
  currentEnv: ServerEnvironment;
  activeUrl: string;
  customUrl: string;
  isTesting: boolean;
  testResult: { ok: boolean; message: string; timestamp?: number } | null;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  setServer: (env: ServerEnvironment, explicitUrl?: string) => Promise<boolean>;
  testConnection: (urlToTest: string) => Promise<{ ok: boolean; message: string }>;
  resetToDefault: () => Promise<void>;
}

export const useServerConfigStore = create<ServerConfigState>((set, get) => ({
  currentEnv: 'local',
  activeUrl: API_BASE_URL,
  customUrl: '',
  isTesting: false,
  testResult: null,
  isHydrated: false,

  hydrate: async () => {
    try {
      const stored = await AsyncStorage.getItem(SERVER_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.activeUrl) {
          try {
            setActiveBaseUrl(parsed.activeUrl);
            set({
              currentEnv: parsed.currentEnv || 'local',
              activeUrl: parsed.activeUrl,
              customUrl: parsed.customUrl || '',
              isHydrated: true,
            });
            return;
          } catch {
            // Jika URL tersimpan tidak valid, abaikan dan gunakan default
          }
        }
      }
    } catch {
      // Abaikan kegagalan baca AsyncStorage
    }

    set({
      activeUrl: getActiveBaseUrl(),
      isHydrated: true,
    });
  },

  setServer: async (env: ServerEnvironment, explicitUrl?: string) => {
    let targetUrl = '';
    if (env === 'custom') {
      targetUrl = explicitUrl?.trim() || get().customUrl.trim();
    } else {
      const preset = SERVER_PRESETS.find((p) => p.id === env);
      targetUrl = preset ? preset.getUrl() : '';
    }

    if (!targetUrl) {
      throw new Error('Alamat URL server tidak boleh kosong');
    }

    try {
      const normalized = normalizeApiUrl(targetUrl);
      setActiveBaseUrl(normalized);

      const stateUpdate = {
        currentEnv: env,
        activeUrl: normalized,
        customUrl: env === 'custom' ? normalized : get().customUrl,
        testResult: null,
      };

      set(stateUpdate);

      await AsyncStorage.setItem(
        SERVER_STORAGE_KEY,
        JSON.stringify({
          currentEnv: env,
          activeUrl: normalized,
          customUrl: stateUpdate.customUrl,
        })
      );

      // Refresh konfigurasi branding & tema secara asinkron dari server baru
      void useMobileConfigStore.getState().refresh();

      return true;
    } catch (err: any) {
      throw new Error(err.message || 'Gagal mengubah server');
    }
  },

  testConnection: async (urlToTest: string) => {
    set({ isTesting: true, testResult: null });
    try {
      const normalized = normalizeApiUrl(urlToTest);
      const res = await pingApiUrl(normalized, 4000);
      const result = {
        ok: res.ok,
        message: res.ok
          ? `Terhubung! Server merespons (HTTP ${res.status || 200})`
          : `Gagal: ${res.error || 'Server tidak dapat dijangkau'}`,
        timestamp: Date.now(),
      };
      set({ isTesting: false, testResult: result });
      return result;
    } catch (err: any) {
      const result = {
        ok: false,
        message: `Format URL tidak valid: ${err.message}`,
        timestamp: Date.now(),
      };
      set({ isTesting: false, testResult: result });
      return result;
    }
  },

  resetToDefault: async () => {
    await AsyncStorage.removeItem(SERVER_STORAGE_KEY);
    setActiveBaseUrl(API_BASE_URL);
    set({
      currentEnv: 'local',
      activeUrl: API_BASE_URL,
      customUrl: '',
      testResult: null,
    });
    void useMobileConfigStore.getState().refresh();
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { api } from '../services/api';

export type MobileThemeConfig = {
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  background_gradient_enabled: boolean;
  background_gradient_start: string;
  background_gradient_end: string;
  background_gradient_direction: 'vertical' | 'horizontal' | 'diagonal';
  surface_color: string;
  text_color: string;
  muted_text_color: string;
  font_family: 'system' | 'Poppins' | 'Nunito';
  font_scale: 'compact' | 'normal' | 'large';
  button_radius: number;
  card_radius: number;
  welcome_text?: string;
  login_banner_url?: string | null;
  has_dedicated_login_banner?: boolean;
  news_gradient_start?: string;
  news_gradient_end?: string;
};

export type MobileBrandingConfig = {
  app_name: string;
  school_name: string;
  logo_url: string | null;
  logo_header_url?: string | null;
  logo_login_url?: string | null;
  logo_footer_url?: string | null;
  splash_background_color: string;
  has_dedicated_logo_header?: boolean;
  has_dedicated_logo_login?: boolean;
  has_dedicated_logo_footer?: boolean;
  fallback_logo_url?: string | null;
};

export type MobileNavigationItem = {
  key: string;
  label: string;
  icon: string;
  enabled: boolean;
  order: number;
};

export type MobileLayoutSection = {
  type: string;
  enabled: boolean;
  order: number;
};

export type MobileFeatureFlags = {
  qr_login: boolean;
  qr_attendance: boolean;
  chat: boolean;
  notifications: boolean;
  tahfizh: boolean;
  mutabaah: boolean;
  cbt: boolean;
  school_info: boolean;
};

export type MobileSystemConfig = {
  min_app_version: string;
  latest_app_version: string;
  maintenance_mode: boolean;
  maintenance_message: string;
  force_update: boolean;
  update_url: string;
};

export type MobileAppConfig = {
  platform: 'android';
  version: number;
  theme: MobileThemeConfig;
  branding: MobileBrandingConfig;
  navigation: {
    style: 'bottom_tabs';
    show_labels: boolean;
    items: MobileNavigationItem[];
  };
  home_layout: {
    template: 'dashboard_default' | 'dashboard_compact';
    sections: MobileLayoutSection[];
  };
  role_home_layouts: Record<
    string,
    {
      template: string;
      sections: MobileLayoutSection[];
    }
  >;
  features: MobileFeatureFlags;
  system: MobileSystemConfig;
  updated_at?: string;
};

export const DEFAULT_MOBILE_CONFIG: MobileAppConfig = {
  platform: 'android',
  version: 1,
  theme: {
    primary_color: '#0E5C44',
    secondary_color: '#10B981',
    accent_color: '#F59E0B',
    background_color: '#F7F9FC',
    background_gradient_enabled: true,
    background_gradient_start: '#F7FCFA',
    background_gradient_end: '#EAF8F2',
    background_gradient_direction: 'diagonal',
    surface_color: '#FFFFFF',
    text_color: '#0F172A',
    muted_text_color: '#64748B',
    font_family: 'system',
    font_scale: 'normal',
    button_radius: 14,
    card_radius: 18,
    welcome_text: 'Ahlan wa Sahlan di SIMSIT',
    login_banner_url: null,
    has_dedicated_login_banner: false,
    news_gradient_start: '#FFFFFF',
    news_gradient_end: '#E8F5E9',
  },
  branding: {
    app_name: 'Sistem Manajemen Sekolah Terpadu',
    school_name: 'Yayasan Dar el-Iman',
    logo_url: null,
    logo_header_url: null,
    logo_login_url: null,
    logo_footer_url: null,
    splash_background_color: '#004B3A',
    has_dedicated_logo_header: false,
    has_dedicated_logo_login: false,
    has_dedicated_logo_footer: false,
    fallback_logo_url: null,
  },
  navigation: {
    style: 'bottom_tabs',
    show_labels: true,
    items: [
      { key: 'home', label: 'Beranda', icon: 'view-dashboard-outline', enabled: true, order: 1 },
      { key: 'notifications', label: 'Chat Guru', icon: 'chat-processing-outline', enabled: true, order: 2 },
      { key: 'qr', label: 'QR Code', icon: 'qrcode-scan', enabled: true, order: 3 },
      { key: 'profile', label: 'Profil', icon: 'account-circle-outline', enabled: true, order: 4 },
      { key: 'more', label: 'Lainnya', icon: 'menu', enabled: true, order: 5 },
    ],
  },
  home_layout: {
    template: 'dashboard_default',
    sections: [
      { type: 'announcements', enabled: true, order: 1 },
      { type: 'quick_menu', enabled: true, order: 2 },
      { type: 'metrics', enabled: true, order: 3 },
      { type: 'schedule', enabled: true, order: 4 },
    ],
  },
  role_home_layouts: Object.fromEntries(
    Object.entries({
      super_admin: ['announcements', 'quick_menu', 'metrics', 'schedule'],
      foundation: ['metrics', 'announcements', 'schedule', 'quick_menu'],
      principal: ['metrics', 'schedule', 'announcements', 'quick_menu'],
      teacher: ['schedule', 'quick_menu', 'metrics', 'announcements'],
      parent: ['announcements', 'quick_menu', 'schedule', 'metrics'],
      student: ['schedule', 'quick_menu', 'announcements', 'metrics'],
      staff: ['quick_menu', 'metrics', 'announcements', 'schedule'],
    }).map(([role, sections]) => [
      role,
      {
        template: 'dashboard_default',
        sections: sections.map((type, index) => ({ type, enabled: true, order: index + 1 })),
      },
    ])
  ) as MobileAppConfig['role_home_layouts'],
  features: {
    qr_login: true,
    qr_attendance: true,
    chat: true,
    notifications: true,
    tahfizh: true,
    mutabaah: true,
    cbt: true,
    school_info: true,
  },
  system: {
    min_app_version: '1.0.0',
    latest_app_version: '1.0.0',
    maintenance_mode: false,
    maintenance_message:
      'Sistem sedang dalam pemeliharaan rutin. Silakan coba beberapa saat lagi.',
    force_update: false,
    update_url: 'https://play.google.com/store/apps/details?id=id.sch.dareliman.simsit',
  },
};

const CACHE_KEY = 'sims-android-ui-config-v2';
const META_KEY = 'sims-android-config-meta-v2';

export const mergeConfig = (value?: Partial<MobileAppConfig>): MobileAppConfig => ({
  ...DEFAULT_MOBILE_CONFIG,
  ...value,
  theme: { ...DEFAULT_MOBILE_CONFIG.theme, ...(value?.theme || {}) },
  branding: { ...DEFAULT_MOBILE_CONFIG.branding, ...(value?.branding || {}) },
  navigation: {
    ...DEFAULT_MOBILE_CONFIG.navigation,
    ...(value?.navigation || {}),
    items: (value?.navigation?.items || DEFAULT_MOBILE_CONFIG.navigation.items).map((it) => {
      if (it.key === 'notifications') {
        return { ...it, label: 'Chat Guru', icon: 'chat-processing-outline' };
      }
      return it;
    }),
  },
  home_layout: {
    ...DEFAULT_MOBILE_CONFIG.home_layout,
    ...(value?.home_layout || {}),
    sections: value?.home_layout?.sections || DEFAULT_MOBILE_CONFIG.home_layout.sections,
  },
  role_home_layouts: {
    ...DEFAULT_MOBILE_CONFIG.role_home_layouts,
    ...(value?.role_home_layouts || {}),
  },
  features: { ...DEFAULT_MOBILE_CONFIG.features, ...(value?.features || {}) },
  system: { ...DEFAULT_MOBILE_CONFIG.system, ...(value?.system || {}) },
});

type ConfigState = {
  config: MobileAppConfig;
  etag: string | null;
  isHydrated: boolean;
  isRefreshing: boolean;
  isOffline: boolean;
  lastCheckedAt: string | null;
  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
  isFeatureEnabled: (feature: keyof MobileFeatureFlags) => boolean;
};

export const useMobileConfigStore = create<ConfigState>((set, get) => ({
  config: DEFAULT_MOBILE_CONFIG,
  etag: null,
  isHydrated: false,
  isRefreshing: false,
  isOffline: false,
  lastCheckedAt: null,

  hydrate: async () => {
    try {
      const [cached, meta] = await Promise.all([
        AsyncStorage.getItem(CACHE_KEY),
        AsyncStorage.getItem(META_KEY),
      ]);

      let etag: string | null = null;
      let lastCheckedAt: string | null = null;
      if (meta) {
        try {
          const parsedMeta = JSON.parse(meta);
          etag = parsedMeta.etag || null;
          lastCheckedAt = parsedMeta.lastCheckedAt || null;
        } catch {
          // ignore parse error
        }
      }

      if (cached) {
        const parsed = JSON.parse(cached);
        set({ config: mergeConfig(parsed), etag, lastCheckedAt });
      } else {
        set({ etag, lastCheckedAt });
      }
    } catch {
      // Safe fallback stays active
    } finally {
      set({ isHydrated: true });
    }
  },

  refresh: async () => {
    set({ isRefreshing: true });
    const currentEtag = get().etag;

    try {
      const headers: Record<string, string> = {};
      if (currentEtag) {
        headers['If-None-Match'] = currentEtag;
      }

      const response = await api.get('/mobile/config', {
        headers,
        validateStatus: (status: number) => (status >= 200 && status < 300) || status === 304,
      });

      if (response.status === 304) {
        // Server responded 304 Not Modified: Cached configuration is still fresh
        const now = new Date().toISOString();
        set({ isRefreshing: false, isOffline: false, lastCheckedAt: now });
        await AsyncStorage.setItem(
          META_KEY,
          JSON.stringify({ etag: currentEtag, lastCheckedAt: now })
        );
        return;
      }

      if (response.status === 200 && response.data?.data) {
        const newEtag =
          response.headers?.etag || response.headers?.ETag || response.headers?.['etag'] || null;
        const freshConfig = mergeConfig(response.data.data);
        const now = new Date().toISOString();

        set({
          config: freshConfig,
          etag: newEtag,
          isRefreshing: false,
          isOffline: false,
          lastCheckedAt: now,
        });

        await Promise.all([
          AsyncStorage.setItem(CACHE_KEY, JSON.stringify(freshConfig)),
          AsyncStorage.setItem(META_KEY, JSON.stringify({ etag: newEtag, lastCheckedAt: now })),
        ]);
      }
    } catch (err) {
      // Keep cached or default configuration active, mark offline status
      set({ isRefreshing: false, isOffline: true });
    }
  },

  isFeatureEnabled: (feature: keyof MobileFeatureFlags): boolean => {
    const features = get().config.features;
    if (!features || typeof features[feature] === 'undefined') {
      return true; // default enabled
    }
    return Boolean(features[feature]);
  },
}));

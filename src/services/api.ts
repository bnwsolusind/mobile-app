import axios from 'axios';
import { Platform } from 'react-native';
import { useAuthStore } from '../stores/authStore';
import { useNetworkStore } from '../stores/networkStore';

export const normalizeApiUrl = (
  inputUrl?: string | null,
  isDev: boolean = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production'
): string => {
  if (!inputUrl || typeof inputUrl !== 'string') {
    throw new Error('API Base URL is required and must be a non-empty string');
  }

  const trimmed = inputUrl.trim();
  if (!trimmed) {
    throw new Error('API Base URL cannot be empty');
  }

  const lower = trimmed.toLowerCase();
  const unsafeSchemes = ['javascript:', 'file:', 'data:', 'content:', 'blob:'];
  if (unsafeSchemes.some((scheme) => lower.startsWith(scheme))) {
    throw new Error(`Unsafe URL scheme rejected: ${trimmed}`);
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Malformed API Base URL: ${trimmed}`);
  }

  if (parsed.username || parsed.password) {
    throw new Error('Embedded credentials in API Base URL are strictly prohibited');
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error(`Unsupported protocol scheme: ${parsed.protocol}`);
  }

  const hostname = parsed.hostname.toLowerCase();
  const isLocalHost = (
    hostname === '127.0.0.1' ||
    hostname === '10.0.2.2' ||
    hostname === 'localhost' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    (hostname.startsWith('172.') && (() => {
      const parts = hostname.split('.');
      const second = parseInt(parts[1] || '0', 10);
      return second >= 16 && second <= 31;
    })())
  );

  if (!isLocalHost && protocol === 'http:' && !isDev) {
    throw new Error(`Non-local production API URL must use HTTPS: ${trimmed}`);
  }

  let pathname = parsed.pathname.replace(/\/+$/, '');

  // Strip duplicate trailing /api/api
  while (pathname.endsWith('/api/api')) {
    pathname = pathname.slice(0, -4);
  }

  // Ensure /api suffix if pathname is empty or root
  if (!pathname || pathname === '/') {
    pathname = '/api';
  } else if (!pathname.endsWith('/api') && !pathname.includes('/api/')) {
    pathname = `${pathname}/api`;
  }

  parsed.pathname = pathname;
  return parsed.toString().replace(/\/+$/, '');
};

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
export const hasConfiguredApiUrl = Boolean(configuredApiUrl);

export const getBaseUrl = (): string => {
  if (configuredApiUrl) {
    return normalizeApiUrl(configuredApiUrl);
  }

  const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

  if (isDev) {
    return normalizeApiUrl(
      Platform.OS === 'android'
        ? 'http://10.0.2.2:8000/api'
        : 'http://127.0.0.1:8000/api'
    );
  }

  throw new Error('EXPO_PUBLIC_API_URL environment variable is required in production');
};

export const API_BASE_URL = getBaseUrl();

// Deterministic candidate URL policy:
// If EXPO_PUBLIC_API_URL is explicitly configured, it is the sole source of truth.
// Runtime failover to other hosts is strictly prohibited when an explicit URL is provided.
const getMetroHostIp = (): string | null => {
  try {
    const { NativeModules } = require('react-native');
    const scriptURL = NativeModules?.SourceCode?.scriptURL;
    if (scriptURL && typeof scriptURL === 'string') {
      const match = scriptURL.match(/^https?:\/\/([^:/]+)/i);
      if (match && match[1] && match[1] !== 'localhost' && match[1] !== '127.0.0.1') {
        return match[1];
      }
    }
  } catch {
    // Ignore extraction failure in production / static bundles
  }
  return null;
};

const getCandidateUrls = (): string[] => {
  if (hasConfiguredApiUrl) {
    return [API_BASE_URL];
  }

  const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';
  if (!isDev) {
    return [API_BASE_URL];
  }

  // Development-only fallback candidates when EXPO_PUBLIC_API_URL is absent
  const metroHostIp = getMetroHostIp();
  const metroApiUrl = metroHostIp ? `http://${metroHostIp}:8000/api` : null;

  const rawCandidates: (string | null)[] = Platform.OS === 'android'
    ? [
        API_BASE_URL,
        metroApiUrl,
        'http://127.0.0.1:8000/api',
      ]
    : [
        API_BASE_URL,
        metroApiUrl,
        'http://10.0.2.2:8000/api',
      ];

  return rawCandidates
    .filter((url): url is string => Boolean(url))
    .filter((url, index, self) => self.indexOf(url) === index);
};

export const candidateUrls: string[] = getCandidateUrls();

let activeBaseUrl = API_BASE_URL;

if (__DEV__) {
  console.log(`[API] Primary base URL: ${API_BASE_URL}`);
  if (candidateUrls.length > 1) {
    console.log(`[API] Candidate fallback URLs: ${candidateUrls.join(', ')}`);
  }
}

export const api = axios.create({
  baseURL: activeBaseUrl,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  timeout: 15000,
});

// Interceptor to attach Sanctum Bearer token & log requests safely
api.interceptors.request.use((config) => {
  (config as any).metadata = { startTime: Date.now() };
  config.baseURL = activeBaseUrl;
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (__DEV__ && config.url?.includes('/auth/login')) {
    const rawUrl = config.url || '';
    const normUrl = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
    console.log(`[LOGIN_TRACE] target_url: ${activeBaseUrl}${normUrl}`);
    console.log(`[LOGIN_TRACE] endpoint: ${config.method?.toUpperCase()} ${normUrl}`);
  }
  return config;
});

// Interceptor response handler enforcing session, deterministic active URL, & logging contracts
api.interceptors.response.use(
  (response) => {
    const startTime = (response.config as any)?.metadata?.startTime || Date.now();
    const duration = Date.now() - startTime;
    const isLogin = response.config.url?.includes('/auth/login');
    const isAuthMe = response.config.url?.includes('/auth/me') || response.config.url?.includes('/auth/profile');

    if (__DEV__ && (isLogin || isAuthMe)) {
      const state = useAuthStore.getState();
      const rawUrl = response.config.url || '';
      const normUrl = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
      console.log(`[LOGIN_TRACE] endpoint: ${response.config.method?.toUpperCase()} ${normUrl}`);
      console.log(`[LOGIN_TRACE] status: ${response.status}`);
      console.log(`[LOGIN_TRACE] duration: ${duration}ms`);
      console.log(`[LOGIN_TRACE] stage: ${isLogin ? 'POST_LOGIN_SUCCESS' : 'AUTH_ME_SUCCESS'}`);
      console.log(`[LOGIN_TRACE] token_present: ${Boolean(state.token || response.data?.token)}`);
      console.log(`[LOGIN_TRACE] user_present: ${Boolean(state.user || response.data?.user)}`);
      console.log(`[LOGIN_TRACE] role_count: ${state.roles?.length ?? 0}`);
      console.log(`[LOGIN_TRACE] permission_count: ${state.permissions?.length ?? 0}`);
    }
    useNetworkStore.getState().setOnline(true);
    return response;
  },
  async (error) => {
    if (!error.response || error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
      useNetworkStore.getState().setOnline(false);
    } else {
      useNetworkStore.getState().setOnline(true);
    }

    const originalConfig = error.config;
    const startTime = (originalConfig as any)?.metadata?.startTime || Date.now();
    const duration = Date.now() - startTime;
    const status = error.response?.status ?? 'NETWORK_ERROR';
    const isLogin = originalConfig?.url?.includes('/auth/login');
    const isAuthMe = originalConfig?.url?.includes('/auth/me') || originalConfig?.url?.includes('/auth/profile');

    // Multi-candidate fallback only for unconfigured development environments.
    // Never failover if an explicit EXPO_PUBLIC_API_URL is configured.
    // Never failover for authenticated requests.
    const isAuthRequest = Boolean(
      originalConfig?.headers?.Authorization ||
      useAuthStore.getState().token
    );

    const canAttemptFallback = (
      __DEV__ &&
      !hasConfiguredApiUrl &&
      !isAuthRequest &&
      !error.response &&
      originalConfig &&
      candidateUrls.length > 1
    );

    if (canAttemptFallback) {
      const attemptedIndex = (originalConfig as any)._retriedCandidateIndex ?? candidateUrls.indexOf(activeBaseUrl);
      const nextCandidateIndex = (attemptedIndex >= 0 ? attemptedIndex : 0) + 1;

      if (nextCandidateIndex < candidateUrls.length) {
        const nextUrl = candidateUrls[nextCandidateIndex];
        console.warn(
          `[API_FALLBACK] Connection to ${activeBaseUrl} failed (${error.code || 'NETWORK_ERROR'}). Attempting candidate [${nextCandidateIndex + 1}/${candidateUrls.length}]: ${nextUrl}...`
        );
        const retryConfig = {
          ...originalConfig,
          baseURL: nextUrl,
          _retriedCandidateIndex: nextCandidateIndex,
          metadata: { startTime: Date.now() },
        };
        return api.request(retryConfig);
      }
    }

    if (__DEV__ && (isLogin || isAuthMe)) {
      const state = useAuthStore.getState();
      const rawUrl = originalConfig?.url || '';
      const normUrl = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
      const stage = isLogin
        ? status === 401 ? 'LOGIN_401' : status === 422 ? 'LOGIN_422' : 'LOGIN_NETWORK_FAILURE'
        : 'AUTH_ME_FAILURE';
      console.log(`[LOGIN_TRACE] endpoint: ${originalConfig?.method?.toUpperCase()} ${normUrl}`);
      console.log(`[LOGIN_TRACE] status: ${status}`);
      console.log(`[LOGIN_TRACE] duration: ${duration}ms`);
      console.log(`[LOGIN_TRACE] stage: ${stage}`);
      console.log(`[LOGIN_TRACE] active_url: ${activeBaseUrl}`);
      console.log(`[LOGIN_TRACE] token_present: ${Boolean(state.token)}`);
      console.log(`[LOGIN_TRACE] user_present: ${Boolean(state.user)}`);
      console.log(`[LOGIN_TRACE] role_count: ${state.roles?.length ?? 0}`);
      console.log(`[LOGIN_TRACE] permission_count: ${state.permissions?.length ?? 0}`);
    }

    if (status === 401) {
      useAuthStore.getState().clearSession();
    }
    return Promise.reject(error);
  }
);

export const getApiErrorMessage = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return 'Tidak dapat terhubung ke server.';
    }

    const status = error.response.status;

    if (status === 401) {
      return (
        (error.response.data as { message?: string })?.message ||
        'Identitas atau kata sandi tidak sesuai.'
      );
    }

    if (status === 422) {
      const payload = error.response.data as {
        message?: string;
        errors?: Record<string, string[] | string>;
      } | undefined;

      if (payload?.errors) {
        const firstError = Object.values(payload.errors)[0];
        if (Array.isArray(firstError) && firstError[0]) return firstError[0];
        if (typeof firstError === 'string') return firstError;
      }

      return payload?.message || 'Identitas atau kata sandi tidak sesuai.';
    }

    if (status === 403) {
      return (
        (error.response.data as { message?: string })?.message ||
        'Akun tidak memiliki akses.'
      );
    }

    if (status >= 500) {
      return 'Terjadi kesalahan pada server.';
    }

    if (status === 404) {
      return (
        (error.response.data as { message?: string })?.message ||
        'Layanan tidak ditemukan.'
      );
    }

    const payload = error.response.data as { message?: string } | undefined;
    if (payload?.message) return payload.message;
  }

  return fallback;
};

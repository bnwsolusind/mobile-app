import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { offlineCache } from '../utils/offlineCache';

export interface UserScope {
  unit_id?: string | number | null;
  employee_id?: string | number | null;
  student_id?: string | number | null;
  parent_id?: string | number | null;
}

export interface AuthUser {
  id?: string | number;
  name?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  photo_url?: string | null;
  avatar_url?: string | null;
  unit?: string | null;
  roles?: string[];
  permissions?: string[];
  scope?: UserScope | null;
  default_portal?: string | null;
  default_redirect?: string | null;
  available_workspaces?: Array<{ key: string; label: string; route: string }>;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface SessionPayload {
  token: string;
  user?: AuthUser | null;
  roles?: string[];
  permissions?: string[];
  portal?: string | null;
  scope?: UserScope | null;
}

const SESSION_KEY = 'sims-mobile-session';

type PersistedSession = Omit<SessionPayload, 'token'> & { token: string };

type AuthState = {
  token: string | null;
  user: AuthUser | null;
  roles: string[];
  permissions: string[];
  portal: string | null;
  scope: UserScope | null;
  isHydrated: boolean;
  setToken: (token: string | null) => void;
  setUser: (user: AuthUser | null) => void;
  setRoles: (roles: string[]) => void;
  setPermissions: (permissions: string[]) => void;
  setSession: (session: SessionPayload) => void;
  syncServerProfile: (profileData: any) => void;
  hydrate: () => Promise<void>;
  clearSession: () => void;
};

const persistSession = (session: PersistedSession | null): void => {
  if (session) {
    void AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } else {
    void AsyncStorage.removeItem(SESSION_KEY);
  }
};

const extractNames = (arr: unknown): string[] => {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((item) => (typeof item === 'string' ? item : (item as { name?: string })?.name))
    .filter(Boolean) as string[];
};

const areArraysEqual = (a?: string[] | null, b?: string[] | null): boolean => {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((val, idx) => val === b[idx]);
};

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  roles: [],
  permissions: [],
  portal: null,
  scope: null,
  isHydrated: false,
  setToken: (token) => {
    set({ token });
    if (!token) persistSession(null);
  },
  setUser: (user) => set({ user }),
  setRoles: (roles) => set({ roles }),
  setPermissions: (permissions) => set({ permissions }),
  setSession: (session) => {
    const persisted: PersistedSession = {
      token: session.token,
      user: session.user ?? null,
      roles: session.roles ?? [],
      permissions: session.permissions ?? [],
      portal: session.portal ?? null,
      scope: session.scope ?? session.user?.scope ?? null,
    };

    set({
      token: persisted.token,
      user: persisted.user ?? null,
      roles: persisted.roles ?? [],
      permissions: persisted.permissions ?? [],
      portal: persisted.portal ?? null,
      scope: persisted.scope ?? null,
    });
    persistSession(persisted);
  },
  syncServerProfile: (profileData) => {
    const raw = profileData?.data ?? profileData;
    if (!raw) return;

    const currentToken = get().token;
    if (!currentToken) return;

    const serverRoles = extractNames(raw.roles);
    const serverPermissions = extractNames(raw.permissions);
    const serverScope = raw.scope ?? null;
    const serverPortal = raw.default_portal ?? raw.portal ?? get().portal;

    const currentRoles = get().roles;
    const currentPermissions = get().permissions;
    const currentScope = get().scope;

    const resolvedRoles = serverRoles.length > 0 ? serverRoles : currentRoles;
    const newRoles = areArraysEqual(currentRoles, resolvedRoles) ? currentRoles : resolvedRoles;

    const resolvedPermissions = serverPermissions.length > 0 ? serverPermissions : currentPermissions;
    const newPermissions = areArraysEqual(currentPermissions, resolvedPermissions) ? currentPermissions : resolvedPermissions;

    const newScope = serverScope || currentScope;

    const photoUrl =
      raw.photo_url ||
      raw.avatar_url ||
      raw.user?.photo_url ||
      raw.user?.avatar_url ||
      raw.employee?.foto_url ||
      raw.parent?.photo_url ||
      raw.student?.photo_url ||
      get().user?.photo_url ||
      null;

    const mergedUser: AuthUser = {
      ...(get().user || {}),
      ...(raw.user || raw),
      id: raw.id ?? raw.user?.id ?? get().user?.id,
      name: raw.name ?? raw.user?.name ?? get().user?.name,
      email: raw.email ?? raw.user?.email ?? get().user?.email,
      photo_url: photoUrl,
      avatar_url: photoUrl,
      roles: newRoles,
      permissions: newPermissions,
      scope: newScope,
      default_portal: serverPortal,
    };

    set({
      user: mergedUser,
      roles: newRoles,
      permissions: newPermissions,
      portal: serverPortal,
      scope: newScope,
    });

    persistSession({
      token: currentToken,
      user: mergedUser,
      roles: newRoles,
      permissions: newPermissions,
      portal: serverPortal,
      scope: newScope,
    });
  },
  hydrate: async () => {
    try {
      const stored = await AsyncStorage.getItem(SESSION_KEY);
      if (stored) {
        const session = JSON.parse(stored) as PersistedSession;
        if (session.token) {
          set({
            token: session.token,
            user: session.user ?? null,
            roles: session.roles ?? [],
            permissions: session.permissions ?? [],
            portal: session.portal ?? null,
            scope: session.scope ?? session.user?.scope ?? null,
          });
        }
      }
    } catch {
      persistSession(null);
    } finally {
      set({ isHydrated: true });
    }
  },
  clearSession: () => {
    set({ token: null, user: null, roles: [], permissions: [], portal: null, scope: null });
    persistSession(null);
    // Hapus semua cache data screen saat logout
    void offlineCache.clearAll();
  },
}));

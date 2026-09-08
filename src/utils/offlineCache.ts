import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = 'simsit_cache_';
const TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 hari dalam milliseconds

interface CacheEntry<T> {
  data: T;
  savedAt: number;
}

/**
 * Universal offline cache utility.
 * Data dari backend disimpan dengan TTL 3 hari.
 * Semua cache dihapus saat logout (clearAll dipanggil di authStore.clearSession).
 */
export const offlineCache = {
  /** Simpan data ke cache lokal */
  async set<T>(key: string, data: T): Promise<void> {
    try {
      const entry: CacheEntry<T> = { data, savedAt: Date.now() };
      await AsyncStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(entry));
    } catch {
      // Storage penuh atau error lain — biarkan app tetap berjalan
    }
  },

  /** Baca data dari cache. Mengembalikan null jika expired (> 3 hari) atau tidak ada */
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${key}`);
      if (!raw) return null;
      const entry: CacheEntry<T> = JSON.parse(raw);
      const age = Date.now() - entry.savedAt;
      if (age > TTL_MS) {
        void AsyncStorage.removeItem(`${CACHE_PREFIX}${key}`);
        return null;
      }
      return entry.data;
    } catch {
      return null;
    }
  },

  /** Hapus satu cache key */
  async clear(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(`${CACHE_PREFIX}${key}`);
    } catch {
      // ignore
    }
  },

  /** Hapus SEMUA cache — dipanggil saat logout */
  async clearAll(): Promise<void> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const cacheKeys = allKeys.filter((k) => k.startsWith(CACHE_PREFIX));
      if (cacheKeys.length > 0) {
        await AsyncStorage.multiRemove(cacheKeys);
      }
    } catch {
      // ignore
    }
  },

  /**
   * Buat key unik per user agar data tidak tercampur antar akun.
   * @param screenKey  Key screen (contoh: 'home_dashboard')
   * @param userId     ID user saat ini
   * @param extra      Parameter tambahan (contoh: childId, date string)
   */
  buildKey(screenKey: string, userId?: string | number | null, extra?: string | null): string {
    const uid = userId ? String(userId) : 'guest';
    return extra ? `${screenKey}_${uid}_${extra}` : `${screenKey}_${uid}`;
  },
};

export default offlineCache;

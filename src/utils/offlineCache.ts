import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = 'simsit_cache_';
const TTL_MS = 2 * 24 * 60 * 60 * 1000; // 2 hari dalam milliseconds (cukup untuk offline, tidak membebani storage)
const MAX_CACHE_ENTRIES = 25; // Maksimal 25 entri cache aktif

interface CacheEntry<T> {
  data: T;
  savedAt: number;
}

/**
 * Universal self-cleaning offline cache utility.
 * Bekerja 100% otomatis di latar belakang:
 * 1. Menghapus data expired (> 2 hari).
 * 2. Membatasi total entri maksimal 25 entri (Rolling Window).
 * 3. Menghapus otomatis cache usang/versi lama (seperti grades_v6).
 * 4. Melindungi aplikasi dari error "SQLITE_FULL (code 13)".
 */
export const offlineCache = {
  /**
   * Rutin Pembersihan Otomatis (Self-Cleaning Background Routine).
   * Dijalankan otomatis saat aplikasi pertama kali dibuka (cold boot).
   */
  async autoClean(): Promise<void> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const cacheKeys = allKeys.filter((k) => k.startsWith(CACHE_PREFIX));
      if (cacheKeys.length === 0) return;

      const keysToRemove: string[] = [];
      const now = Date.now();

      // 1. Sapu bersih cache usang versi lama
      for (const k of cacheKeys) {
        if (k.includes('grades_v6')) {
          keysToRemove.push(k);
        }
      }

      // 2. Periksa expiry TTL
      const keysToInspect = cacheKeys.filter((k) => !keysToRemove.includes(k));
      if (keysToInspect.length > 0) {
        const pairs = await AsyncStorage.multiGet(keysToInspect).catch(() => []);
        for (const [key, val] of pairs) {
          if (!val) {
            keysToRemove.push(key);
            continue;
          }
          try {
            const parsed: CacheEntry<unknown> = JSON.parse(val);
            if (!parsed.savedAt || now - parsed.savedAt > TTL_MS) {
              keysToRemove.push(key);
            }
          } catch {
            keysToRemove.push(key);
          }
        }
      }

      if (keysToRemove.length > 0) {
        await AsyncStorage.multiRemove(keysToRemove).catch(() => {});
      }

      // 3. Batasi total entri aktif maksimal MAX_CACHE_ENTRIES
      const remainingKeys = cacheKeys.filter((k) => !keysToRemove.includes(k));
      if (remainingKeys.length > MAX_CACHE_ENTRIES) {
        const excessCount = remainingKeys.length - MAX_CACHE_ENTRIES;
        const oldestKeys = remainingKeys.slice(0, excessCount);
        await AsyncStorage.multiRemove(oldestKeys).catch(() => {});
      }
    } catch {
      // Background auto-clean tidak boleh mengganggu alur utama aplikasi
    }
  },

  /**
   * Pangkas entri berlebih jika mendekati kuota.
   */
  async evictExcess(targetLimit = MAX_CACHE_ENTRIES): Promise<void> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const cacheKeys = allKeys.filter((k) => k.startsWith(CACHE_PREFIX));
      if (cacheKeys.length <= targetLimit) return;

      const toRemove = cacheKeys.slice(0, cacheKeys.length - targetLimit);
      if (toRemove.length > 0) {
        await AsyncStorage.multiRemove(toRemove).catch(() => {});
      }
    } catch {
      // ignore
    }
  },

  /** Simpan data ke cache lokal dengan proteksi kuota disk */
  async set<T>(key: string, data: T): Promise<void> {
    const fullKey = `${CACHE_PREFIX}${key}`;
    const entry: CacheEntry<T> = { data, savedAt: Date.now() };
    const payload = JSON.stringify(entry);

    try {
      await AsyncStorage.setItem(fullKey, payload);
    } catch (err: any) {
      const errStr = String(err?.message || err || '');
      // Jika disk / database SQLite penuh (code 13 SQLITE_FULL)
      if (errStr.includes('SQLITE_FULL') || errStr.includes('disk is full') || errStr.includes('full')) {
        try {
          // Buang entri cache separuh untuk memberi ruang napas
          await offlineCache.evictExcess(12);
          // Coba simpan kembali sekali lagi
          await AsyncStorage.setItem(fullKey, payload);
        } catch {
          // Jika tetap penuh, abaikan secara silent tanpa crash
        }
      }
    }
  },

  /** Baca data dari cache. Mengembalikan null jika expired atau tidak ada */
  async get<T>(key: string): Promise<T | null> {
    try {
      const fullKey = `${CACHE_PREFIX}${key}`;
      const raw = await AsyncStorage.getItem(fullKey);
      if (!raw) return null;
      const entry: CacheEntry<T> = JSON.parse(raw);
      const age = Date.now() - entry.savedAt;
      if (age > TTL_MS) {
        void AsyncStorage.removeItem(fullKey).catch(() => {});
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

  /** Hapus cache berdasarkan prefix kategori (misal: 'schedule', 'absensi', 'cbt_exams', 'notes') */
  async clearPrefix(categoryPrefix: string): Promise<void> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const targetPrefix = `${CACHE_PREFIX}${categoryPrefix}`;
      const toRemove = allKeys.filter((k) => k.startsWith(targetPrefix));
      if (toRemove.length > 0) {
        await AsyncStorage.multiRemove(toRemove).catch(() => {});
      }
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
        await AsyncStorage.multiRemove(cacheKeys).catch(() => {});
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

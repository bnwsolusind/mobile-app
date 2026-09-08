import { create } from 'zustand';

interface NetworkState {
  isOnline: boolean;
  wasOffline: boolean;
  lastChecked: number;
  setOnline: (online: boolean) => void;
  checkConnectivity: () => Promise<boolean>;
  startMonitoring: () => () => void;
}

export const useNetworkStore = create<NetworkState>((set, get) => ({
  isOnline: true,
  wasOffline: false,
  lastChecked: Date.now(),

  setOnline: (online: boolean) => {
    const current = get().isOnline;
    if (current !== online) {
      set({
        isOnline: online,
        wasOffline: current === false && online === true ? true : get().wasOffline,
        lastChecked: Date.now(),
      });
    } else {
      set({ lastChecked: Date.now() });
    }
  },

  checkConnectivity: async () => {
    // Ping backend endpoint jika tersedia, jika tidak ping target standar
    const targetUrl = process.env.EXPO_PUBLIC_API_URL
      ? `${process.env.EXPO_PUBLIC_API_URL.replace(/\/+$/, '')}/mobile/config`
      : 'https://www.google.com/generate_204';

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(targetUrl, {
        method: 'HEAD',
        signal: controller.signal,
      }).catch(async () => {
        return await fetch(targetUrl, {
          method: 'GET',
          signal: controller.signal,
        });
      });

      clearTimeout(timer);

      // Setiap status HTTP menandakan perangkat terhubung
      const isUp = Boolean(res && res.status > 0);
      get().setOnline(isUp);
      return isUp;
    } catch {
      get().setOnline(false);
      return false;
    }
  },

  startMonitoring: () => {
    void get().checkConnectivity();

    let isSubscribed = true;
    const interval = setInterval(() => {
      if (isSubscribed) {
        void get().checkConnectivity();
      }
    }, 6000);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  },
}));

export default useNetworkStore;

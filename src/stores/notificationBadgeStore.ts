import { create } from 'zustand';

interface NotificationBadgeState {
  unreadNotificationCount: number;
  setUnreadNotificationCount: (count: number) => void;
  incrementUnread: () => void;
  clearUnread: () => void;
}

export const useNotificationBadgeStore = create<NotificationBadgeState>((set) => ({
  unreadNotificationCount: 0,
  setUnreadNotificationCount: (count) => set({ unreadNotificationCount: Math.max(0, count) }),
  incrementUnread: () => set((state) => ({ unreadNotificationCount: state.unreadNotificationCount + 1 })),
  clearUnread: () => set({ unreadNotificationCount: 0 }),
}));

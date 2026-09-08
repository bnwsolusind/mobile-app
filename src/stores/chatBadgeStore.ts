import { create } from 'zustand';

interface ChatBadgeState {
  unreadChatCount: number;
  setUnreadChatCount: (count: number) => void;
  incrementUnread: () => void;
  clearUnread: () => void;
}

export const useChatBadgeStore = create<ChatBadgeState>((set) => ({
  unreadChatCount: 0,
  setUnreadChatCount: (count) => set({ unreadChatCount: Math.max(0, count) }),
  incrementUnread: () => set((state) => ({ unreadChatCount: state.unreadChatCount + 1 })),
  clearUnread: () => set({ unreadChatCount: 0 }),
}));

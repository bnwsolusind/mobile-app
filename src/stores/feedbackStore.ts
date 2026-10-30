import { create } from 'zustand';
import { FeedbackType } from '../components/AppFeedbackModal';
import { appHaptics } from '../utils/haptics';

export interface FeedbackOptions {
  type?: FeedbackType;
  title: string;
  message?: string;
  itemName?: string;
  category?: string;
  dateStr?: string;
  actionLabel?: string;
  cancelLabel?: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  onConfirm?: () => void;
  onClose?: () => void;
}

interface FeedbackState {
  current: FeedbackOptions | null;
  isOpen: boolean;
  showFeedback: (options: FeedbackOptions) => void;
  hideFeedback: () => void;
}

export const useFeedbackStore = create<FeedbackState>((set, get) => ({
  current: null,
  isOpen: false,
  showFeedback: (options) => {
    // Tactile haptic feedback sesuai jenis status
    if (options.type === 'success') {
      appHaptics.success();
    } else if (options.type === 'error') {
      appHaptics.error();
    } else if (options.type === 'warning' || options.type === 'confirm') {
      appHaptics.warning();
    } else {
      appHaptics.selection();
    }

    set({
      current: options,
      isOpen: true,
    });
  },
  hideFeedback: () => {
    const active = get().current;
    if (active?.onClose) {
      try {
        active.onClose();
      } catch {}
    }
    set({ isOpen: false, current: null });
  },
}));

// Standalone drop-in replacement for Alert.alert with Emerald UI/UX
export const appFeedback = {
  show: (options: FeedbackOptions) => useFeedbackStore.getState().showFeedback(options),
  success: (title: string, message?: string, options?: Partial<FeedbackOptions>) =>
    useFeedbackStore.getState().showFeedback({ type: 'success', title, message, ...options }),
  error: (title: string, message?: string, options?: Partial<FeedbackOptions>) =>
    useFeedbackStore.getState().showFeedback({ type: 'error', title, message, ...options }),
  warning: (title: string, message?: string, options?: Partial<FeedbackOptions>) =>
    useFeedbackStore.getState().showFeedback({ type: 'warning', title, message, ...options }),
  info: (title: string, message?: string, options?: Partial<FeedbackOptions>) =>
    useFeedbackStore.getState().showFeedback({ type: 'info', title, message, ...options }),
  confirm: (options: {
    title: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
    onConfirm: () => void;
    onClose?: () => void;
  }) =>
    useFeedbackStore.getState().showFeedback({
      type: 'confirm',
      ...options,
    }),
  hide: () => useFeedbackStore.getState().hideFeedback(),
};

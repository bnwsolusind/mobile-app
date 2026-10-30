import React from 'react';
import { AppFeedbackModal } from './AppFeedbackModal';
import { useFeedbackStore } from '../stores/feedbackStore';

export function GlobalFeedbackContainer() {
  const isOpen = useFeedbackStore((state) => state.isOpen);
  const current = useFeedbackStore((state) => state.current);
  const hideFeedback = useFeedbackStore((state) => state.hideFeedback);

  if (!isOpen || !current) return null;

  return (
    <AppFeedbackModal
      visible={isOpen}
      type={current.type || 'info'}
      title={current.title}
      message={current.message}
      itemName={current.itemName}
      category={current.category}
      dateStr={current.dateStr}
      actionLabel={current.actionLabel}
      cancelLabel={current.cancelLabel}
      confirmText={current.confirmText}
      cancelText={current.cancelText}
      isDestructive={current.isDestructive}
      onConfirm={() => {
        if (current.onConfirm) {
          current.onConfirm();
        }
        hideFeedback();
      }}
      onClose={hideFeedback}
    />
  );
}

export default GlobalFeedbackContainer;

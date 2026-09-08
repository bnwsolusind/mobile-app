import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { mobileApiService, unwrapCollection } from '../services/mobileApiService';
import { notificationService } from '../services/notificationService';
import { useChatBadgeStore } from '../stores/chatBadgeStore';

interface Contact {
  user_id: string;
  name: string;
  role?: string;
  teacher_type?: string;
  last_message?: string;
  last_message_at?: string;
  unread_count?: number;
  photo?: string | null;
  student_id?: string;
  student_name?: string;
}

export function useChatNotificationWatcher(onNavigateChat?: (teacherId?: string) => void) {
  const token = useAuthStore((state) => state.token);

  // Map of teacher_id -> last_message_at to detect brand new messages
  const seenMessagesRef = useRef<Record<string, string>>({});
  const isFirstLoadRef = useRef(true);

  useEffect(() => {
    if (!token) return;

    // 1. Initialize notification channel & request permission on Android
    notificationService.init().catch(() => {});

    let cachedChildren: any[] = [];

    // 2. Poll for incoming messages from teachers with parallel batching
    const checkIncomingMessages = async () => {
      try {
        if (cachedChildren.length === 0) {
          const childrenRes = await mobileApiService.getPortalChildren();
          cachedChildren = unwrapCollection<any>(childrenRes);
        }
        if (cachedChildren.length === 0) return;

        let totalUnread = 0;

        // Fetch contacts for all children in parallel instead of slow sequential loop
        const contactResults = await Promise.all(
          cachedChildren.map((child) =>
            mobileApiService.getChatContacts(String(child.id)).catch(() => null)
          )
        );

        for (let i = 0; i < cachedChildren.length; i++) {
          const child = cachedChildren[i];
          const contactRes = contactResults[i];
          if (!contactRes) continue;

          const contacts = unwrapCollection<Contact>(contactRes);

          for (const contact of contacts) {
            const uid = contact.user_id;
            const lastMsg = contact.last_message;
            const lastMsgAt = contact.last_message_at;
            const unreadCount = contact.unread_count || 0;
            totalUnread += unreadCount;

            if (!uid || !lastMsg || !lastMsgAt) continue;

            const prevLastAt = seenMessagesRef.current[uid];

            // If it's a new incoming message with unread count
            if (prevLastAt && prevLastAt !== lastMsgAt && unreadCount > 0) {
              const roleTitle = contact.teacher_type === 'wali_kelas' ? 'Wali Kelas' : 'Guru Mapel';
              notificationService.notifyNewMessage({
                title: `${contact.name} (${roleTitle})`,
                body: lastMsg,
                teacherId: uid,
                teacherName: contact.name,
                studentId: contact.student_id || child.id,
                studentName: contact.student_name || child.full_name,
                avatarUrl: contact.photo || undefined,
              });
            }

            // Update seen message timestamp
            seenMessagesRef.current[uid] = lastMsgAt;
          }
        }

        useChatBadgeStore.getState().setUnreadChatCount(totalUnread);
        isFirstLoadRef.current = false;
      } catch (err) {
        // Silent background polling fallback
      }
    };

    // Initial check
    checkIncomingMessages();

    // Polite polling interval (10s) to prevent mobile socket congestion
    const interval = setInterval(checkIncomingMessages, 10000);

    return () => clearInterval(interval);
  }, [token]);
}

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useNotificationBadgeStore } from '../stores/notificationBadgeStore';
import { useAuthStore } from '../stores/authStore';
import { isTuRole } from '../utils/roles';

// Configure notification behavior when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

export interface AppNotificationData {
  title: string;
  body: string;
  type?: 'chat' | 'schedule_10m' | 'schedule_5m' | 'general';
  teacherId?: string;
  teacherName?: string;
  studentId?: string;
  studentName?: string;
  avatarUrl?: string;
  messageId?: string;
  scheduleId?: string;
  classId?: string;
  className?: string;
  subjectName?: string;
  timeStart?: string;
  timeEnd?: string;
  screen?: string;
  iconName?: string;
  [key: string]: any;
}

export type ChatNotificationData = AppNotificationData;

// In-app listener callback type
type InAppNotificationListener = (data: AppNotificationData) => void;
const inAppListeners = new Set<InAppNotificationListener>();

export const notificationService = {
  /**
   * Subscribe to in-app notification events
   */
  subscribeInApp: (listener: InAppNotificationListener) => {
    inAppListeners.add(listener);
    return () => {
      inAppListeners.delete(listener);
    };
  },

  /**
   * Initialize notification channels and request permissions on Android
   */
  init: async () => {
    try {
      if (Platform.OS === 'android') {
        // Channel 1: Chat Messages
        await Notifications.setNotificationChannelAsync('chat_messages', {
          name: 'Pesan Guru & Obrolan',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#10B981',
          enableVibrate: true,
          showBadge: true,
        });

        // Channel 2: Lesson Schedule Reminders (10m & 5m before KBM)
        await Notifications.setNotificationChannelAsync('schedule_reminders', {
          name: 'Pengingat Jadwal KBM',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 350, 200, 350],
          lightColor: '#059669',
          enableVibrate: true,
          showBadge: true,
        });

        // Channel 3: Student Live Activities (Presensi, Tahfizh, Ibadah, LMS)
        await Notifications.setNotificationChannelAsync('student_activities', {
          name: 'Kegiatan & Aktivitas Santri',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#059669',
          enableVibrate: true,
          showBadge: true,
        });
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      return finalStatus === 'granted';
    } catch (err) {
      console.log('Error initializing notifications:', err);
      return false;
    }
  },

  /**
   * Batalkan semua notifikasi pengingat jadwal KBM (misal saat login sebagai role TU)
   */
  cancelAllScheduledLessonReminders: async () => {
    try {
      const scheduledList = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
      for (const n of scheduledList) {
        if (n.identifier && n.identifier.startsWith('sch_')) {
          await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {});
        }
      }
    } catch (err) {
      console.log('Error canceling scheduled lesson reminders:', err);
    }
  },

  /**
   * Schedule 10-minute and 5-minute reminder notifications for lesson schedules
   */
  scheduleLessonReminders: async (schedules: any[]) => {
    try {
      // Role TU (Tata Usaha) adalah staf administrasi, bukan guru kelas; jangan jadwalkan pengingat KBM
      const roles = useAuthStore.getState().roles || useAuthStore.getState().user?.roles || [];
      if (isTuRole(roles)) {
        return;
      }

      if (!Array.isArray(schedules) || schedules.length === 0) return;

      const now = new Date();
      const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      // Get currently scheduled notifications to avoid redundant re-scheduling
      const scheduledList = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
      const existingIdentifiers = new Set(scheduledList.map((n) => n.identifier));

      for (const s of schedules) {
        if (!s || !s.time_start) continue;

        const timeParts = String(s.time_start).split(':');
        if (timeParts.length < 2) continue;

        const startHour = parseInt(timeParts[0], 10);
        const startMin = parseInt(timeParts[1], 10);

        if (isNaN(startHour) || isNaN(startMin)) continue;

        const scheduleStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startHour, startMin, 0, 0);

        const subjectName = s.subject?.nama_mapel || s.subject?.name || s.subject_name || s.mata_pelajaran || 'Mata Pelajaran';
        const className = s.kelas?.nama_kelas || s.kelas?.name || s.class_name || 'Kelas';
        const roomName = s.metadata?.room || s.kelas?.ruangan || s.ruangan || '-';
        const timeStartStr = String(s.time_start).substring(0, 5);
        const timeEndStr = s.time_end ? String(s.time_end).substring(0, 5) : '';

        // ──────────────────────────────────────────────────────────
        // 1. Pengingat 10 Menit Sebelum Jadwal Pelajaran
        // ──────────────────────────────────────────────────────────
        const trigger10mDate = new Date(scheduleStart.getTime() - 10 * 60 * 1000);
        const id10m = `sch_${s.id}_10m_${todayYmd}`;

        if (trigger10mDate.getTime() > now.getTime() && !existingIdentifiers.has(id10m)) {
          await Notifications.scheduleNotificationAsync({
            identifier: id10m,
            content: {
              title: `🔔 10 Menit Lagi: KBM ${subjectName}`,
              body: `KBM ${subjectName} di kelas ${className} (${timeStartStr} - ${timeEndStr}) akan dimulai 10 menit lagi. Ruang: ${roomName}.`,
              data: {
                screen: 'QR Code',
                scheduleId: String(s.id),
                classId: String(s.kelas_id || s.class_id || ''),
                className,
                subjectName,
                timeStart: timeStartStr,
                timeEnd: timeEndStr,
                type: 'schedule_10m',
                mode: 'manual',
              },
              sound: true,
              priority: Notifications.AndroidNotificationPriority.MAX,
              color: '#059669',
            },
            trigger: { date: trigger10mDate } as any,
          }).catch(() => {});
        }

        // ──────────────────────────────────────────────────────────
        // 2. Pengingat 5 Menit Sebelum Jadwal Pelajaran
        // ──────────────────────────────────────────────────────────
        const trigger5mDate = new Date(scheduleStart.getTime() - 5 * 60 * 1000);
        const id5m = `sch_${s.id}_5m_${todayYmd}`;

        if (trigger5mDate.getTime() > now.getTime() && !existingIdentifiers.has(id5m)) {
          await Notifications.scheduleNotificationAsync({
            identifier: id5m,
            content: {
              title: `⏳ 5 Menit Lagi: Bersiap Mulai KBM!`,
              body: `KBM ${subjectName} di kelas ${className} segera dimulai (${timeStartStr} - ${timeEndStr}). Buka presensi siswa sekarang.`,
              data: {
                screen: 'QR Code',
                scheduleId: String(s.id),
                classId: String(s.kelas_id || s.class_id || ''),
                className,
                subjectName,
                timeStart: timeStartStr,
                timeEnd: timeEndStr,
                type: 'schedule_5m',
                mode: 'manual',
              },
              sound: true,
              priority: Notifications.AndroidNotificationPriority.MAX,
              color: '#10B981',
            },
            trigger: { date: trigger5mDate } as any,
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.log('Error scheduling lesson reminders:', err);
    }
  },

  /**
   * Trigger in-app floating banner & native alert for real-time lesson reminder
   */
  notifyLessonReminder: async (payload: AppNotificationData) => {
    try {
      // Role TU (Tata Usaha) tidak menerima push notifikasi pengingat jam KBM
      const roles = useAuthStore.getState().roles || useAuthStore.getState().user?.roles || [];
      if (isTuRole(roles)) {
        return;
      }

      // 1. Notify all in-app floating banner listeners
      inAppListeners.forEach((listener) => {
        try {
          listener(payload);
        } catch {}
      });

      // Update badge store so bell icon dot turns red immediately
      try {
        useNotificationBadgeStore.getState().incrementUnread();
      } catch {}

      // 2. Trigger native Android system notification
      await Notifications.scheduleNotificationAsync({
        content: {
          title: payload.title,
          body: payload.body,
          data: {
            screen: payload.screen || 'QR Code',
            scheduleId: payload.scheduleId,
            classId: payload.classId,
            className: payload.className,
            subjectName: payload.subjectName,
            timeStart: payload.timeStart,
            timeEnd: payload.timeEnd,
            mode: 'manual',
            type: payload.type,
          },
          sound: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
          color: '#059669',
        },
        trigger: null, // Display immediately
      }).catch(() => {});
    } catch (err) {
      console.log('Error notifying lesson reminder:', err);
    }
  },

  /**
   * Trigger both local Android system notification and in-app floating banner for chat
   */
  notifyNewMessage: async (payload: AppNotificationData) => {
    try {
      // 1. Notify all in-app floating banner listeners
      inAppListeners.forEach((listener) => {
        try {
          listener(payload);
        } catch {}
      });

      // Update badge store so bell icon dot turns red immediately
      try {
        useNotificationBadgeStore.getState().incrementUnread();
      } catch {}

      // 2. Trigger native Android system notification
      await Notifications.scheduleNotificationAsync({
        content: {
          title: payload.title,
          body: payload.body,
          data: {
            teacherId: payload.teacherId,
            studentId: payload.studentId,
            screen: 'Chat',
            type: 'chat',
          },
          priority: Notifications.AndroidNotificationPriority.MAX,
          color: '#0E5C44',
        },
        trigger: null, // Display immediately
      });
    } catch (err) {
      console.log('Error triggering notification:', err);
    }
  },

  /**
   * Trigger both local Android/iOS push notification and in-app floating banner for student live activity update
   */
  notifyStudentActivity: async (payload: {
    studentId: string;
    studentName?: string;
    title: string;
    subtitle?: string;
    badge_label?: string;
    type?: string;
  }) => {
    try {
      // 1. Notify floating in-app banner listeners
      inAppListeners.forEach((listener) => {
        try {
          listener({
            title: payload.title,
            body: payload.subtitle || '',
            studentId: payload.studentId,
            studentName: payload.studentName,
            type: 'general',
          });
        } catch {}
      });

      // Update badge store so app bell dot lights up
      try {
        useNotificationBadgeStore.getState().incrementUnread();
      } catch {}

      // 2. Trigger native Android/iOS system notification
      await Notifications.scheduleNotificationAsync({
        content: {
          title: payload.title,
          body: payload.subtitle || 'Pembaruan kegiatan santri telah dicatat.',
          data: {
            studentId: payload.studentId,
            studentName: payload.studentName,
            screen: 'Home',
            type: payload.type || 'student_activity',
          },
          sound: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
          color: '#059669',
        },
        trigger: null, // Display immediately!
      }).catch(() => {});
    } catch (err) {
      console.log('Error triggering student activity notification:', err);
    }
  },

  /**
   * Listen for user tapping native Android status-bar notification
   */
  onNotificationResponse: (callback: (data: any) => void) => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response?.notification?.request?.content?.data;
      if (data) callback(data);
    });

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        const data = response?.notification?.request?.content?.data;
        if (data) callback(data);
      })
      .catch(() => {});

    return () => {
      subscription.remove();
    };
  },
};

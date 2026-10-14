import { useEffect, useRef } from 'react';
import { Vibration } from 'react-native';
import { useAuthStore } from '../stores/authStore';
import { isTeacherRole, isTuRole } from '../utils/roles';
import { mobileApiService, unwrapCollection } from '../services/mobileApiService';
import { notificationService, AppNotificationData } from '../services/notificationService';
import { useTeacherClassStore, TeacherSchedule } from '../stores/teacherClassStore';

/**
 * Hook to watch today's schedules and deliver proactive notifications
 * at exactly 10 minutes and 5 minutes prior to lesson start time.
 */
export function useScheduleNotificationWatcher(
  onNavigateSchedule?: (payload: AppNotificationData) => void
) {
  const token = useAuthStore((state) => state.token);
  const roles = useAuthStore((state) => state.roles);
  const user = useAuthStore((state) => state.user);
  const allRoles = roles && roles.length > 0 ? roles : (user?.roles || []);
  const isTeacher = isTeacherRole(allRoles);
  const isTu = isTuRole(allRoles);

  const schedulesTodayFromStore = useTeacherClassStore((state) => state.schedulesToday);

  // Set of reminders already triggered during current day session to prevent duplicate alerts
  const triggeredRemindersRef = useRef<Set<string>>(new Set());
  const activeSchedulesRef = useRef<TeacherSchedule[]>([]);

  useEffect(() => {
    // Role TU (Tata Usaha) bukan guru pengajar di kelas, dinonaktifkan dari pengingat KBM
    if (isTu) {
      void notificationService.cancelAllScheduledLessonReminders?.();
      return;
    }

    if (!token || !isTeacher) return;

    // 1. Initialize notification channels on native platform
    notificationService.init().catch(() => {});

    // 2. Fetch today's schedules if store is empty
    const syncSchedules = async () => {
      try {
        let schedules = schedulesTodayFromStore;
        if (!schedules || schedules.length === 0) {
          const res = await mobileApiService.getTeacherSchedules();
          schedules = unwrapCollection<TeacherSchedule>(res);
          if (schedules.length > 0) {
            useTeacherClassStore.getState().setSchedulesToday(schedules);
          }
        }

        activeSchedulesRef.current = schedules;

        // Schedule native background notifications for 10m and 5m
        void notificationService.scheduleLessonReminders(schedules);
      } catch (err) {
        // Fallback silently if offline or network error
      }
    };

    void syncSchedules();

    // 3. In-App Foreground Real-Time Ticker (runs every 20 seconds)
    // Guarantees immediate notification & floating banner when user is actively in the app
    const intervalTimer = setInterval(() => {
      const now = new Date();
      const schedules = activeSchedulesRef.current;
      if (!Array.isArray(schedules) || schedules.length === 0) return;

      const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      for (const s of schedules) {
        if (!s || !s.time_start) continue;

        const timeParts = String(s.time_start).split(':');
        if (timeParts.length < 2) continue;

        const startHour = parseInt(timeParts[0], 10);
        const startMin = parseInt(timeParts[1], 10);
        if (isNaN(startHour) || isNaN(startMin)) continue;

        const scheduleStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startHour, startMin, 0, 0);

        // Difference in seconds
        const diffSeconds = Math.round((scheduleStart.getTime() - now.getTime()) / 1000);

        const subjectName = s.subject?.nama_mapel || s.subject?.name || s.subject_name || 'Mata Pelajaran';
        const className = s.kelas?.nama_kelas || s.kelas?.name || s.class_name || 'Kelas';
        const roomName = s.metadata?.room || s.kelas?.ruangan || s.ruangan || '-';
        const timeStartStr = String(s.time_start).substring(0, 5);
        const timeEndStr = s.time_end ? String(s.time_end).substring(0, 5) : '';

        // ──────────────────────────────────────────────────────────
        // 10 Menit Sebelum Jadwal (window 9.5 menit s/d 10.5 menit)
        // ──────────────────────────────────────────────────────────
        const key10m = `${s.id}_10m_${todayYmd}`;
        if (diffSeconds >= 540 && diffSeconds <= 630 && !triggeredRemindersRef.current.has(key10m)) {
          triggeredRemindersRef.current.add(key10m);

          Vibration.vibrate([0, 300, 150, 300]);

          const payload: AppNotificationData = {
            title: `🔔 10 Menit Lagi: KBM ${subjectName}`,
            body: `KBM ${subjectName} di kelas ${className} (${timeStartStr} - ${timeEndStr}) akan dimulai 10 menit lagi. Ruang: ${roomName}. Siapkan materi pembelajaran.`,
            type: 'schedule_10m',
            scheduleId: String(s.id),
            classId: String(s.kelas_id || s.class_id || ''),
            className,
            subjectName,
            timeStart: timeStartStr,
            timeEnd: timeEndStr,
            screen: 'QR Code',
          };

          void notificationService.notifyLessonReminder(payload);
        }

        // ──────────────────────────────────────────────────────────
        // 5 Menit Sebelum Jadwal (window 4.5 menit s/d 5.5 menit)
        // ──────────────────────────────────────────────────────────
        const key5m = `${s.id}_5m_${todayYmd}`;
        if (diffSeconds >= 240 && diffSeconds <= 330 && !triggeredRemindersRef.current.has(key5m)) {
          triggeredRemindersRef.current.add(key5m);

          Vibration.vibrate([0, 400, 200, 400]);

          const payload: AppNotificationData = {
            title: `⏳ 5 Menit Lagi: Bersiap Mulai KBM!`,
            body: `KBM ${subjectName} di kelas ${className} segera dimulai (${timeStartStr} - ${timeEndStr}). Buka presensi santri sekarang.`,
            type: 'schedule_5m',
            scheduleId: String(s.id),
            classId: String(s.kelas_id || s.class_id || ''),
            className,
            subjectName,
            timeStart: timeStartStr,
            timeEnd: timeEndStr,
            screen: 'QR Code',
          };

          void notificationService.notifyLessonReminder(payload);
        }
      }
    }, 20000);

    return () => {
      clearInterval(intervalTimer);
    };
  }, [token, isTeacher, isTu, schedulesTodayFromStore]);
}

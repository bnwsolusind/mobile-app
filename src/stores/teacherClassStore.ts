import { create } from 'zustand';
import { notificationService } from '../services/notificationService';
import { useAuthStore } from './authStore';
import { isTuRole } from '../utils/roles';

export interface TeacherClass {
  id: string;
  nama_kelas?: string;
  name?: string;
  tingkat?: string | number;
  kode_kelas?: string;
  ruangan?: string;
  kapasitas?: number;
  unit_pendidikan?: {
    id?: string;
    name?: string;
    nama?: string;
    code?: string;
    level?: string;
  };
  unit_name?: string;
  [key: string]: any;
}

export interface TeacherSchedule {
  id: string;
  kelas_id: string;
  subject_id?: string;
  time_start?: string;
  time_end?: string;
  day_of_week?: number;
  subject?: {
    id?: string;
    name?: string;
    nama_mapel?: string;
    code?: string;
  };
  kelas?: {
    id?: string;
    nama_kelas?: string;
    name?: string;
    ruangan?: string;
  };
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface UnlockRequest {
  classId: string;
  className: string;
  requestType: string;
  reason: string;
  requestTime: string;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
}

interface TeacherClassState {
  classes: TeacherClass[];
  selectedClassId: string | null;
  schedulesToday: TeacherSchedule[];
  approvedUnlockClassIds: string[];
  pendingUnlockRequests: Record<string, UnlockRequest>;

  // Actions
  setClasses: (classes: TeacherClass[]) => void;
  setSelectedClassId: (id: string | null) => void;
  setSchedulesToday: (schedules: TeacherSchedule[]) => void;
  getActiveScheduleNow: () => TeacherSchedule | null;
  getScheduleForClassNow: (classId: string) => TeacherSchedule | null;
  isClassLocked: (classId: string) => {
    isLocked: boolean;
    activeSchedule: TeacherSchedule | null;
    hasScheduleToday: boolean;
    isApproved: boolean;
    pendingRequest?: UnlockRequest;
  };
  requestUnlock: (classId: string, className: string, requestType: string, reason: string) => void;
  approveUnlock: (classId: string, approverNameOrRole: string) => void;
  getSelectedClass: () => TeacherClass | null;
  clear: () => void;
}

const getCurrentTimeStr = (): string => {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
};

export const useTeacherClassStore = create<TeacherClassState>((set, get) => ({
  classes: [],
  selectedClassId: '__ALL__',
  schedulesToday: [],
  approvedUnlockClassIds: [],
  pendingUnlockRequests: {},

  setClasses: (classes) => {
    const list = Array.isArray(classes) ? classes : [];
    const state = get();
    let nextId = state.selectedClassId;

    if (!nextId) {
      nextId = '__ALL__';
    } else if (nextId !== '__NONE__' && nextId !== '__ALL__' && !list.some((c) => String(c.id) === String(nextId))) {
      nextId = '__ALL__';
    }

    set({ classes: list, selectedClassId: nextId });
  },

  setSelectedClassId: (id) => {
    set({ selectedClassId: id != null ? String(id) : '__ALL__' });
  },

  setSchedulesToday: (schedules) => {
    const list = Array.isArray(schedules) ? schedules : [];
    set({ schedulesToday: list });

    // Jangan jadwalkan reminder jika akun aktif memiliki role TU (Tata Usaha)
    const userRoles = useAuthStore.getState().roles || useAuthStore.getState().user?.roles || [];
    if (isTuRole(userRoles)) {
      return;
    }

    // Schedule native background notifications for 10m and 5m before KBM
    if (list.length > 0) {
      void notificationService.scheduleLessonReminders(list);
    }
  },

  getActiveScheduleNow: () => {
    const { schedulesToday } = get();
    if (!schedulesToday || schedulesToday.length === 0) return null;
    const curTime = getCurrentTimeStr();

    return (
      schedulesToday.find((s) => {
        const start = s.time_start ? String(s.time_start).substring(0, 8) : '00:00:00';
        const end = s.time_end ? String(s.time_end).substring(0, 8) : '23:59:59';
        return curTime >= start && curTime <= end;
      }) || null
    );
  },

  getScheduleForClassNow: (classId: string) => {
    const { schedulesToday } = get();
    if (!schedulesToday || !classId) return null;
    const curTime = getCurrentTimeStr();

    return (
      schedulesToday.find((s) => {
        if (String(s.kelas_id) !== String(classId)) return false;
        const start = s.time_start ? String(s.time_start).substring(0, 8) : '00:00:00';
        const end = s.time_end ? String(s.time_end).substring(0, 8) : '23:59:59';
        return curTime >= start && curTime <= end;
      }) || null
    );
  },

  isClassLocked: (classId: string) => {
    const state = get();
    if (!classId) {
      return { isLocked: false, activeSchedule: null, hasScheduleToday: false, isApproved: true };
    }

    const curTime = getCurrentTimeStr();
    const classSchedulesToday = state.schedulesToday.filter(
      (s) => String(s.kelas_id) === String(classId)
    );
    const hasScheduleToday = classSchedulesToday.length > 0;

    const activeSchedule =
      classSchedulesToday.find((s) => {
        const start = s.time_start ? String(s.time_start).substring(0, 8) : '00:00:00';
        const end = s.time_end ? String(s.time_end).substring(0, 8) : '23:59:59';
        return curTime >= start && curTime <= end;
      }) || null;

    // Selalu tidak terkunci (akses terbuka penuh untuk seluruh menu operasional rombel)
    return {
      isLocked: false,
      activeSchedule,
      hasScheduleToday,
      isApproved: true,
    };
  },

  requestUnlock: (classId, className, requestType, reason) => {
    const key = String(classId);
    const nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    set((state) => ({
      pendingUnlockRequests: {
        ...state.pendingUnlockRequests,
        [key]: {
          classId: key,
          className,
          requestType,
          reason,
          requestTime: nowStr,
          status: 'pending',
        },
      },
    }));
  },

  approveUnlock: (classId, approverNameOrRole) => {
    const key = String(classId);
    set((state) => {
      const existing = state.pendingUnlockRequests[key];
      const nextPending = { ...state.pendingUnlockRequests };
      if (existing) {
        nextPending[key] = {
          ...existing,
          status: 'approved',
          approvedBy: approverNameOrRole,
        };
      }
      return {
        approvedUnlockClassIds: Array.from(new Set([...state.approvedUnlockClassIds, key])),
        pendingUnlockRequests: nextPending,
      };
    });
  },

  getSelectedClass: () => {
    const { classes, selectedClassId } = get();
    if (!selectedClassId || selectedClassId === '__ALL__') {
      return {
        id: '__ALL__',
        name: 'Semua Rombel',
        nama_kelas: 'Semua Rombel',
        rombel: 'Semua Rombel',
      } as any;
    }
    if (selectedClassId === '__NONE__') return null;
    return classes.find((c) => String(c.id) === String(selectedClassId)) || {
      id: '__ALL__',
      name: 'Semua Rombel',
      nama_kelas: 'Semua Rombel',
      rombel: 'Semua Rombel',
    } as any;
  },

  clear: () =>
    set({
      classes: [],
      selectedClassId: '__ALL__',
      schedulesToday: [],
      approvedUnlockClassIds: [],
      pendingUnlockRequests: {},
    }),
}));

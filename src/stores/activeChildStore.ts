import { create } from 'zustand';

export interface Child {
  id?: number | string;
  student_id?: number | string;
  name?: string;
  full_name?: string;
  nama_lengkap?: string;
  nis?: string;
  nisn?: string;
  gender?: string;
  jenis_kelamin?: string;
  avatar_url?: string | null;
  foto?: string | null;
  kelas?: {
    id?: number | string;
    nama_kelas?: string;
    name?: string;
  } | string | null;
  class_name?: string;
  education_unit?: {
    id?: number | string;
    name?: string;
    nama?: string;
  } | string | null;
  unit_name?: string;
  attendance_today?: any;
  presensi_hari_ini?: any;
  [key: string]: any;
}

interface ActiveChildState {
  activeChildId: string | null;
  children: Child[];
  setActiveChildId: (id: string | number | null | undefined) => void;
  setChildren: (children: Child[]) => void;
  getActiveChild: () => Child | null;
  updateChildBadge: (childId: string | number, count?: number) => void;
  updateChildAttendance: (childId: string | number, attendanceData: any) => void;
  clear: () => void;
}

export const useActiveChildStore = create<ActiveChildState>((set, get) => ({
  activeChildId: null,
  children: [],
  clear: () => set({ activeChildId: null, children: [] }),
  setActiveChildId: (id) => {
    const nextId = id != null ? String(id) : null;
    set({ activeChildId: nextId });
  },
  setChildren: (children) => {
    const list = Array.isArray(children) ? children : [];
    const state = get();
    let nextActiveId = state.activeChildId;

    // Preservasi data presensi real-time yang sudah ada di memori jika list baru belum menyertakannya
    const mergedList = list.map((newChild) => {
      const targetId = String(newChild.id || newChild.student_id || '');
      const oldChild = state.children.find((c) => String(c.id || c.student_id || '') === targetId);
      if (oldChild && (oldChild.attendance_today || oldChild.presensi_hari_ini || oldChild.attendance_status)) {
        return {
          ...oldChild,
          ...newChild,
          attendance_today: newChild.attendance_today ?? oldChild.attendance_today,
          presensi_hari_ini: newChild.presensi_hari_ini ?? oldChild.presensi_hari_ini,
          attendance_status: newChild.attendance_status ?? oldChild.attendance_status,
          status_kehadiran: newChild.status_kehadiran ?? oldChild.status_kehadiran,
          is_holiday: newChild.is_holiday ?? oldChild.is_holiday,
        };
      }
      return newChild;
    });

    if (mergedList.length > 0) {
      const exists = mergedList.some(
        (c) => String(c.id || c.student_id) === String(nextActiveId)
      );
      if (!exists || !nextActiveId) {
        nextActiveId = String(mergedList[0].id || mergedList[0].student_id || '');
      }
    } else {
      nextActiveId = null;
    }

    set({ children: mergedList, activeChildId: nextActiveId });
  },
  getActiveChild: () => {
    const { children, activeChildId } = get();
    if (!activeChildId || children.length === 0) return children[0] || null;
    return (
      children.find((c) => String(c.id || c.student_id) === String(activeChildId)) ||
      children[0] ||
      null
    );
  },
  updateChildBadge: (childId: string | number, count: number = 0) => {
    const sid = String(childId);
    set((state) => ({
      children: state.children.map((c) =>
        String(c.id || c.student_id) === sid
          ? { ...c, unread_notifications_count: count, unread_count: count }
          : c
      ),
    }));
  },
  updateChildAttendance: (childId: string | number, attendanceData: any) => {
    const sid = String(childId);
    set((state) => ({
      children: state.children.map((c) => {
        if (String(c.id || c.student_id) === sid) {
          return {
            ...c,
            attendance_today: attendanceData,
            presensi_hari_ini: attendanceData,
            attendance_status: typeof attendanceData === 'object' && attendanceData !== null ? (attendanceData.status_label || attendanceData.label || attendanceData.status) : attendanceData,
            status_kehadiran: typeof attendanceData === 'object' && attendanceData !== null ? (attendanceData.status_label || attendanceData.label || attendanceData.status) : attendanceData,
          };
        }
        return c;
      }),
    }));
  },
}));

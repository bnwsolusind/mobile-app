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
}

export const useActiveChildStore = create<ActiveChildState>((set, get) => ({
  activeChildId: null,
  children: [],
  setActiveChildId: (id) => {
    const nextId = id != null ? String(id) : null;
    set({ activeChildId: nextId });
  },
  setChildren: (children) => {
    const list = Array.isArray(children) ? children : [];
    const state = get();
    let nextActiveId = state.activeChildId;

    if (list.length > 0) {
      const exists = list.some(
        (c) => String(c.id || c.student_id) === String(nextActiveId)
      );
      if (!exists || !nextActiveId) {
        nextActiveId = String(list[0].id || list[0].student_id || '');
      }
    } else {
      nextActiveId = null;
    }

    set({ children: list, activeChildId: nextActiveId });
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
}));

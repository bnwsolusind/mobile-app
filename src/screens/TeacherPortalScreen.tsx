import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { getApiErrorMessage } from '../services/api';
import { mobileApiService, unwrapApiData, unwrapCollection } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { isSuperAdminRole, isTeacherRole, roleLabel } from '../utils/roles';
import { resolveUnitName } from '../utils/employeeUtils';
import { useNotificationBadgeStore } from '../stores/notificationBadgeStore';
import { useNavigationHistoryStore } from '../stores/navigationHistoryStore';
import { offlineCache } from '../utils/offlineCache';
import {
  getProfileImageUrl,
  DEFAULT_PARENT_AVATAR,
  DEFAULT_STUDENT_BOY_AVATAR,
  DEFAULT_STUDENT_GIRL_AVATAR,
  getStudentAvatarSource,
  isGirlStudent,
} from '../utils/profile';
import AppFeedbackModal, { FeedbackType } from '../components/AppFeedbackModal';
import EmptyStateCard from '../components/EmptyStateCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HEADER_MOSQUE_BG = require('../../assets/header_mosque_bg.png');

type TeacherTab = 'overview' | 'schedules' | 'students' | 'materials' | 'notes';
type FormType = 'note' | 'material';
type FormState = Record<string, string>;

const text = (value: unknown, fallback = '') =>
  value === null || value === undefined ? fallback : String(value);

const normalizeTab = (rawTab?: string): TeacherTab => {
  if (rawTab === 'classes' || rawTab === 'santri' || rawTab === 'students') return 'students';
  if (rawTab === 'reports' || rawTab === 'laporan' || rawTab === 'overview') return 'overview';
  if (rawTab === 'schedules' || rawTab === 'jadwal') return 'schedules';
  if (rawTab === 'materials' || rawTab === 'materi') return 'materials';
  if (rawTab === 'notes' || rawTab === 'jurnal' || rawTab === 'catatan') return 'notes';
  return 'overview';
};

export default function TeacherPortalScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const localNavigation = useNavigation<any>();
  const nav = navigation || localNavigation;
  const permissions = useAuthStore((state) => state.permissions);
  const user = useAuthStore((state) => state.user);

  const [tab, setTab] = useState<TeacherTab>(normalizeTab(route?.params?.tab));
  const [materialSubTab, setMaterialSubTab] = useState<'materials' | 'modul_ajar'>(
    route?.params?.subTab === 'modul_ajar' || route?.params?.type === 'modul_ajar' || route?.params?.type === 'rpp'
      ? 'modul_ajar'
      : 'materials'
  );

  const [dashboard, setDashboard] = useState<any>({});
  const [schedules, setSchedules] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [modulAjars, setModulAjars] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Searches & Multi-Filters (Selaras dengan Web-Dashboard)
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudentClassFilter, setSelectedStudentClassFilter] = useState('ALL');
  const [materialSearch, setMaterialSearch] = useState('');
  const [selectedMaterialClassFilter, setSelectedMaterialClassFilter] = useState<string>(
    route?.params?.kelas_id || route?.params?.class_id ? String(route.params.kelas_id || route.params.class_id) : 'ALL'
  );
  const [selectedMaterialSubjectFilter, setSelectedMaterialSubjectFilter] = useState<string>(
    route?.params?.subject_id ? String(route.params.subject_id) : 'ALL'
  );
  const [selectedMaterialStatusFilter, setSelectedMaterialStatusFilter] = useState<'ALL' | 'published' | 'draft'>('ALL');
  const [modulAjarSearch, setModulAjarSearch] = useState('');
  const [selectedModulAjarFaseFilter, setSelectedModulAjarFaseFilter] = useState('ALL');
  const [noteSearch, setNoteSearch] = useState('');
  const [selectedNoteCategory, setSelectedNoteCategory] = useState('ALL');

  // Sinkronisasi Parameter Rute / Navigasi
  useEffect(() => {
    if (route?.params?.tab) {
      setTab(normalizeTab(route.params.tab));
    }
    if (route?.params?.subTab) {
      setMaterialSubTab(route.params.subTab === 'modul_ajar' ? 'modul_ajar' : 'materials');
    } else if (route?.params?.type === 'modul_ajar' || route?.params?.type === 'rpp') {
      setMaterialSubTab('modul_ajar');
    }
    if (route?.params?.kelas_id || route?.params?.class_id) {
      setSelectedMaterialClassFilter(String(route.params.kelas_id || route.params.class_id));
    }
    if (route?.params?.subject_id) {
      setSelectedMaterialSubjectFilter(String(route.params.subject_id));
    }
  }, [route?.params]);

  // Form Modals & Editing State
  const [formType, setFormType] = useState<FormType>('note');
  const [formVisible, setFormVisible] = useState(false);
  const [selectedNoteStudent, setSelectedNoteStudent] = useState<any | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<any | null>(null);
  const [deleteConfirmMaterial, setDeleteConfirmMaterial] = useState<any | null>(null);
  const [deletingMaterial, setDeletingMaterial] = useState(false);
  const [selectedDetailMaterial, setSelectedDetailMaterial] = useState<any | null>(null);
  const [selectedDetailModulAjar, setSelectedDetailModulAjar] = useState<any | null>(null);
  const [form, setForm] = useState<FormState>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
  } | null>(null);

  const clearSession = useAuthStore((state) => state.clearSession);

  const handleLogout = () => {
    setFeedbackModal({
      visible: true,
      type: 'confirm',
      title: 'Keluar dari Aplikasi?',
      message: 'Sesi masuk akun Anda pada perangkat ini akan diakhiri. Anda dapat masuk kembali kapan saja.',
      confirmText: 'Ya, Keluar',
      cancelText: 'Batal',
      onConfirm: async () => {
        setFeedbackModal(null);
        try {
          await mobileApiService.logout();
        } catch {}
        finally {
          clearSession();
        }
      },
    });
  };

  // Hak Akses Role Guru (Selaras Penuh dengan Web-Dashboard)
  const roles = useAuthStore((state) => state.roles);
  const isSuperAdmin = isSuperAdminRole(roles);
  const isTeacher = isTeacherRole(roles);
  const canNote =
    isSuperAdmin ||
    isTeacher ||
    permissions.includes('teacher.student_note.create') ||
    permissions.includes('teacher.manage');
  const canMaterial =
    isSuperAdmin ||
    isTeacher ||
    permissions.includes('teacher.material.create') ||
    permissions.includes('pembelajaran.materi') ||
    permissions.includes('lms.manage');
  const canEditMaterial =
    isSuperAdmin ||
    isTeacher ||
    permissions.includes('teacher.material.update') ||
    permissions.includes('teacher.material.create') ||
    permissions.includes('pembelajaran.materi') ||
    permissions.includes('lms.manage') ||
    permissions.includes('teacher.manage');
  const canDeleteMaterial =
    isSuperAdmin ||
    isTeacher ||
    permissions.includes('teacher.material.delete') ||
    permissions.includes('pembelajaran.materi') ||
    permissions.includes('lms.manage') ||
    permissions.includes('teacher.manage');

  const load = useCallback(async () => {
    setError('');
    const cacheKey = offlineCache.buildKey('teacher_portal', user?.id);

    // 1. Baca cache dulu
    const cached = await offlineCache.get<{
      dashboard: any;
      schedules: any[];
      students: any[];
      materials: any[];
      modulAjars?: any[];
      notes: any[];
    }>(cacheKey);

    if (cached) {
      if (cached.dashboard) setDashboard(cached.dashboard);
      if (cached.schedules) setSchedules(cached.schedules);
      if (cached.students) setStudents(cached.students);
      if (cached.materials) setMaterials(cached.materials);
      if (cached.modulAjars) setModulAjars(cached.modulAjars);
      if (cached.notes) setNotes(cached.notes);
      setLoading(false);
    } else {
      setLoading(true);
    }

    const [
      dashboardResult,
      schedulesResult,
      studentsResult,
      materialsResult,
      notesResult,
      modulAjarResult,
    ] = await Promise.allSettled([
      mobileApiService.getTeacherDashboard(),
      mobileApiService.getTeacherSchedules(),
      mobileApiService.getTeacherStudents({ per_page: 100 }),
      mobileApiService.getTeacherMaterials({ per_page: 50 }),
      mobileApiService.getTeacherStudentNotes({ per_page: 50 }),
      mobileApiService.getTeacherModulAjar({ per_page: 50 }),
    ]);

    let freshDash = dashboard;
    let freshSched = schedules;
    let freshStud = students;
    let freshMat = materials;
    let freshNot = notes;
    let freshModul = modulAjars;

    if (dashboardResult.status === 'fulfilled') {
      freshDash = unwrapApiData<any>(dashboardResult.value) || {};
      setDashboard(freshDash);
    }
    if (schedulesResult.status === 'fulfilled') {
      freshSched = unwrapCollection(schedulesResult.value);
      setSchedules(freshSched);
    }
    if (studentsResult.status === 'fulfilled') {
      freshStud = unwrapCollection(studentsResult.value);
      setStudents(freshStud);
    }
    if (materialsResult.status === 'fulfilled') {
      freshMat = unwrapCollection(materialsResult.value);
      setMaterials(freshMat);
    }
    if (notesResult.status === 'fulfilled') {
      freshNot = unwrapCollection(notesResult.value);
      setNotes(freshNot);
    }
    if (modulAjarResult.status === 'fulfilled') {
      freshModul = unwrapCollection(modulAjarResult.value);
      setModulAjars(freshModul);
    }

    const failures = [
      dashboardResult,
      schedulesResult,
      studentsResult,
      materialsResult,
      notesResult,
      modulAjarResult,
    ].filter((result) => result.status === 'rejected');

    if (failures.length === 6 && !cached) {
      setError('Portal guru tidak dapat terhubung. Pastikan koneksi dan sinkronisasi hak akses guru aktif.');
    } else if (failures.length < 6) {
      void offlineCache.set(cacheKey, {
        dashboard: freshDash,
        schedules: freshSched,
        students: freshStud,
        materials: freshMat,
        modulAjars: freshModul,
        notes: freshNot,
      });
    }

    setLoading(false);
    setRefreshing(false);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Open note modal
  const openNote = (preSelectedStudent?: any) => {
    const target = preSelectedStudent || students[0] || null;
    setSelectedNoteStudent(target);
    setFormType('note');
    setEditingMaterial(null);
    setFormError('');
    setForm({
      student_id: text(target?.id || students[0]?.id),
      category: 'Akademik',
      title: '',
      content: '',
      priority: 'medium',
    });
    setFormVisible(true);
  };

  // Open material modal (buat baru)
  const openMaterial = () => {
    setFormType('material');
    setEditingMaterial(null);
    setFormError('');
    const firstSchedule = schedules[0] || {};
    setForm({
      judul: '',
      subject_id: text(firstSchedule.subject_id),
      class_id: text(firstSchedule.kelas_id || firstSchedule.class_id),
      ringkasan: '',
      isi: '',
      status: 'published',
    });
    setFormVisible(true);
  };

  // Open material modal untuk Ubah (Edit)
  const openEditMaterial = (material: any) => {
    setFormType('material');
    setEditingMaterial(material);
    setFormError('');

    const matchedSubjectId =
      material.mata_pelajaran_id ||
      material.subject_id ||
      material.subject?.id ||
      '';
    const matchedClassId =
      material.kelas_id ||
      material.class_id ||
      material.modul_ajar?.kelas_id ||
      material.kelas?.id ||
      '';

    setForm({
      judul: material.judul || material.title || '',
      subject_id: text(matchedSubjectId || schedules[0]?.subject_id),
      class_id: text(matchedClassId || schedules[0]?.kelas_id || schedules[0]?.class_id),
      ringkasan: material.ringkasan || '',
      isi: material.isi || '',
      status: material.status || (material.is_published ? 'published' : 'draft'),
    });
    setFormVisible(true);
  };

  // Hapus Materi dengan Konfirmasi
  const handleConfirmDeleteMaterial = async () => {
    if (!deleteConfirmMaterial) return;
    try {
      setDeletingMaterial(true);
      await mobileApiService.deleteTeacherMaterial(deleteConfirmMaterial.id);
      setMaterials((prev) =>
        prev.filter((m) => String(m.id) !== String(deleteConfirmMaterial.id))
      );
      setDeleteConfirmMaterial(null);
      setFeedbackModal({
        visible: true,
        type: 'success',
        title: 'Materi Dihapus 🗑️',
        message: 'Bahan ajar dan materi pembelajaran berhasil dihapus dari sistem.',
      });
    } catch (err: any) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Menghapus',
        message: err?.response?.data?.message || 'Terjadi kendala saat menghapus materi.',
      });
    } finally {
      setDeletingMaterial(false);
    }
  };

  const setField = (key: string, value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const saveForm = async () => {
    setFormError('');
    if (formType === 'note') {
      if (!form.student_id || !form.title?.trim() || !form.content?.trim()) {
        setFormError('Siswa, judul, dan isi catatan wajib diisi.');
        return;
      }
    }
    if (formType === 'material') {
      if (!form.judul?.trim() || !form.subject_id || !form.class_id) {
        setFormError('Judul, mata pelajaran, dan kelas wajib dipilih.');
        return;
      }
    }

    setSaving(true);
    try {
      if (formType === 'note') {
        await mobileApiService.createTeacherStudentNote({
          student_id: form.student_id,
          category: form.category || 'Akademik',
          title: form.title.trim(),
          content: form.content.trim(),
          priority: form.priority || 'medium',
          visible_to_parent: true,
          visible_to_student: true,
        });
        setFormVisible(false);
        setFeedbackModal({
          visible: true,
          type: 'success',
          title: 'Catatan Siswa Tersimpan! 📝',
          message: 'Catatan evaluasi perkembangan santri berhasil disimpan ke sistem terpadu sekolah.',
        });
        await load();
      } else {
        if (editingMaterial) {
          // Mode Ubah / Edit
          await mobileApiService.updateTeacherMaterial(editingMaterial.id, {
            judul: form.judul.trim(),
            subject_id: form.subject_id,
            class_id: form.class_id,
            ringkasan: form.ringkasan || undefined,
            isi: form.isi || undefined,
            status: form.status || 'published',
          });

          setMaterials((prev) =>
            prev.map((m) =>
              String(m.id) === String(editingMaterial.id)
                ? {
                    ...m,
                    judul: form.judul.trim(),
                    title: form.judul.trim(),
                    subject_id: form.subject_id,
                    class_id: form.class_id,
                    ringkasan: form.ringkasan,
                    isi: form.isi,
                    status: form.status,
                    is_published: form.status === 'published',
                  }
                : m
            )
          );

          setFormVisible(false);
          setEditingMaterial(null);
          setFeedbackModal({
            visible: true,
            type: 'success',
            title: 'Materi Berhasil Diperbarui! ✏️',
            message: 'Perubahan pada bahan ajar KBM telah berhasil disimpan ke sistem.',
          });
          await load();
        } else {
          // Mode Buat Baru
          await mobileApiService.createTeacherMaterial({
            judul: form.judul.trim(),
            subject_id: form.subject_id,
            class_id: form.class_id,
            ringkasan: form.ringkasan || undefined,
            isi: form.isi || undefined,
            status: form.status || 'published',
          });

          setFormVisible(false);
          setFeedbackModal({
            visible: true,
            type: 'success',
            title: 'Materi Pembelajaran Tersimpan! 📚',
            message: 'Materi pembelajaran telah berhasil dipublikasikan untuk siswa.',
          });
          await load();
        }
      }
    } catch (requestError) {
      setFormError(getApiErrorMessage(requestError, 'Data belum berhasil disimpan.'));
    } finally {
      setSaving(false);
    }
  };

  // Helper check if schedule is right now
  const isScheduleActiveNow = useCallback((s: any) => {
    if (!s.time_start || !s.time_end) return false;
    const now = new Date();
    const curTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;
    const start = String(s.time_start).substring(0, 8);
    const end = String(s.time_end).substring(0, 8);
    return curTime >= start && curTime <= end;
  }, []);

  // Filtered Students
  const filteredStudents = useMemo(() => {
    return students.filter((st) => {
      const matchSearch =
        !studentSearch.trim() ||
        String(st.full_name || st.nama_lengkap || st.name || '')
          .toLowerCase()
          .includes(studentSearch.toLowerCase()) ||
        String(st.nis || '').includes(studentSearch);

      const studentClassId = String(st.kelas_id || st.class_id || st.kelas?.id || '');
      const matchClass =
        selectedStudentClassFilter === 'ALL' || studentClassId === selectedStudentClassFilter;

      return matchSearch && matchClass;
    });
  }, [students, studentSearch, selectedStudentClassFilter]);

  // Unique Classes from students
  const uniqueClassesFromStudents = useMemo(() => {
    const map = new Map<string, string>();
    students.forEach((st) => {
      const cId = String(st.kelas_id || st.class_id || st.kelas?.id || '');
      const cName = st.kelas?.nama_kelas || st.kelas?.name || st.class_name || '';
      if (cId && cName && !map.has(cId)) {
        map.set(cId, cName);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [students]);

  // Unique Classes for Materials & Modul Ajar (from schedules, materials, modulAjars, & students)
  const uniqueMaterialClasses = useMemo(() => {
    const map = new Map<string, string>();
    schedules.forEach((sc) => {
      const cId = String(sc.kelas_id || sc.class_id || sc.kelas?.id || '');
      const cName = sc.kelas?.nama_kelas || sc.kelas?.name || sc.class_name || '';
      if (cId && cName && !map.has(cId)) map.set(cId, cName);
    });
    materials.forEach((m) => {
      const cId = String(m.kelas_id || m.class_id || m.kelas?.id || m.modul_ajar?.kelas_id || '');
      const cName = m.kelas?.nama_kelas || m.kelas?.name || m.class_name || '';
      if (cId && cName && !map.has(cId)) map.set(cId, cName);
    });
    modulAjars.forEach((mod) => {
      const cId = String(mod.kelas_id || mod.kelas?.id || '');
      const cName = mod.kelas?.nama_kelas || mod.kelas?.name || '';
      if (cId && cName && !map.has(cId)) map.set(cId, cName);
    });
    students.forEach((st) => {
      const cId = String(st.kelas_id || st.class_id || st.kelas?.id || '');
      const cName = st.kelas?.nama_kelas || st.kelas?.name || st.class_name || '';
      if (cId && cName && !map.has(cId)) map.set(cId, cName);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [schedules, materials, modulAjars, students]);

  // Unique Subjects for Materials & Modul Ajar
  const uniqueMaterialSubjects = useMemo(() => {
    const map = new Map<string, string>();
    schedules.forEach((sc) => {
      const sId = String(sc.subject_id || sc.subject?.id || '');
      const sName = sc.subject?.name || sc.subject?.nama_mapel || sc.subject_name || '';
      if (sId && sName && !map.has(sId)) map.set(sId, sName);
    });
    materials.forEach((m) => {
      const sId = String(m.mata_pelajaran_id || m.subject_id || m.subject?.id || '');
      const sName = m.subject?.name || m.subject?.nama_mapel || '';
      if (sId && sName && !map.has(sId)) map.set(sId, sName);
    });
    modulAjars.forEach((mod) => {
      const sId = String(mod.mata_pelajaran_id || mod.subject?.id || '');
      const sName = mod.subject?.name || mod.subject?.nama_mapel || '';
      if (sId && sName && !map.has(sId)) map.set(sId, sName);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [schedules, materials, modulAjars]);

  // Filtered Materials (Bahan Ajar KBM dengan Multi-Filter Selaras Web-Dashboard)
  const filteredMaterials = useMemo(() => {
    return materials.filter((m) => {
      // 1. Text Search
      const q = materialSearch.trim().toLowerCase();
      const matchSearch =
        !q ||
        String(m.judul || m.title || '').toLowerCase().includes(q) ||
        String(m.ringkasan || '').toLowerCase().includes(q) ||
        String(m.isi || '').toLowerCase().includes(q) ||
        String(m.subject?.name || m.subject?.nama_mapel || '').toLowerCase().includes(q) ||
        String(m.kelas?.nama_kelas || m.kelas?.name || m.class_name || '').toLowerCase().includes(q);

      // 2. Class / Rombel Filter
      const mClassId = String(m.kelas_id || m.class_id || m.kelas?.id || m.modul_ajar?.kelas_id || '');
      const matchClass =
        selectedMaterialClassFilter === 'ALL' ||
        mClassId === selectedMaterialClassFilter;

      // 3. Subject / Mapel Filter
      const mSubjId = String(m.mata_pelajaran_id || m.subject_id || m.subject?.id || '');
      const matchSubject =
        selectedMaterialSubjectFilter === 'ALL' ||
        mSubjId === selectedMaterialSubjectFilter;

      // 4. Status Filter (Published / Draft)
      const isPub = (m.status || (m.is_published ? 'published' : 'draft')).toLowerCase() === 'published';
      const matchStatus =
        selectedMaterialStatusFilter === 'ALL' ||
        (selectedMaterialStatusFilter === 'published' ? isPub : !isPub);

      return matchSearch && matchClass && matchSubject && matchStatus;
    });
  }, [
    materials,
    materialSearch,
    selectedMaterialClassFilter,
    selectedMaterialSubjectFilter,
    selectedMaterialStatusFilter,
  ]);

  // Filtered Modul Ajar (RPP Kurikulum Merdeka Terpadu Selaras Web-Dashboard)
  const filteredModulAjars = useMemo(() => {
    return modulAjars.filter((mod) => {
      // 1. Text Search
      const q = modulAjarSearch.trim().toLowerCase();
      const matchSearch =
        !q ||
        String(mod.judul_modul || mod.judul || '').toLowerCase().includes(q) ||
        String(mod.kode_modul || '').toLowerCase().includes(q) ||
        String(mod.subject?.name || mod.subject?.nama_mapel || '').toLowerCase().includes(q) ||
        String(mod.guru?.nama_lengkap || mod.guru?.name || '').toLowerCase().includes(q) ||
        String(mod.tujuan_pembelajaran || '').toLowerCase().includes(q);

      // 2. Fase Filter (A, B, C, D, E, F)
      const matchFase =
        selectedModulAjarFaseFilter === 'ALL' ||
        String(mod.fase || '').toUpperCase() === selectedModulAjarFaseFilter.toUpperCase();

      // 3. Class Filter
      const modClassId = String(mod.kelas_id || mod.kelas?.id || '');
      const matchClass =
        selectedMaterialClassFilter === 'ALL' ||
        modClassId === selectedMaterialClassFilter;

      return matchSearch && matchFase && matchClass;
    });
  }, [modulAjars, modulAjarSearch, selectedModulAjarFaseFilter, selectedMaterialClassFilter]);

  // Filtered Notes
  const filteredNotes = useMemo(() => {
    return notes.filter((n) => {
      const matchCategory =
        selectedNoteCategory === 'ALL' ||
        String(n.category || '').toLowerCase() === selectedNoteCategory.toLowerCase();

      const q = noteSearch.toLowerCase();
      const matchSearch =
        !noteSearch.trim() ||
        String(n.title || '').toLowerCase().includes(q) ||
        String(n.content || '').toLowerCase().includes(q) ||
        String(n.student?.full_name || n.student?.nama_lengkap || '').toLowerCase().includes(q);

      return matchCategory && matchSearch;
    });
  }, [notes, selectedNoteCategory, noteSearch]);

  // Dynamic Date Banner
  const dynamicDateStr = useMemo(() => {
    const today = new Date();
    return today.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }, []);

  const kpi = dashboard?.kpi || {};
  const teacherPhoto = getProfileImageUrl(user, dashboard);

  // Derived metadata for teacher matching EmployeeHeaderCard on HomeScreen
  const teacherName =
    dashboard?.teacher?.name ||
    user?.name ||
    user?.fullName ||
    'Ustadz / Pendidik';

  const teacherNip =
    dashboard?.teacher?.nip_niy ||
    user?.nip ||
    user?.niy ||
    (user?.metadata as any)?.nip ||
    (user?.metadata as any)?.niy ||
    user?.email ||
    '-';

  const teacherUnit =
    resolveUnitName(dashboard?.teacher?.unit) ||
    resolveUnitName(dashboard?.unit) ||
    resolveUnitName(dashboard?.unit_name) ||
    resolveUnitName(user?.unit) ||
    resolveUnitName((user as any)?.education_unit) ||
    resolveUnitName((user?.metadata as any)?.unit_name) ||
    'Sekolah Islam Terpadu';

  const teacherRoleTitle = roleLabel(roles, 'GURU / PENGAJAR').toUpperCase();

  const schedulesToday = kpi?.schedules_today_count ?? schedules.length ?? 0;
  const totalClasses = kpi?.total_classes ?? uniqueClassesFromStudents.length;
  const totalStudents = kpi?.total_students ?? students.length ?? 0;

  // Target santri untuk modal catatan evaluasi (Nama siswa, avatar, dan kelas)
  const noteTarget = useMemo(() => {
    if (selectedNoteStudent) return selectedNoteStudent;
    if (form.student_id) {
      const found = students.find((s) => String(s.id) === String(form.student_id));
      if (found) return found;
    }
    return students[0] || null;
  }, [selectedNoteStudent, form.student_id, students]);

  const noteAvatarSrc = getStudentAvatarSource(noteTarget);
  const noteIsGirl = isGirlStudent(noteTarget);

  const noteStudentName =
    noteTarget?.full_name ||
    noteTarget?.nama_lengkap ||
    noteTarget?.name ||
    'Santri Terpilih';

  const noteStudentClass =
    noteTarget?.kelas?.nama_kelas ||
    noteTarget?.kelas?.name ||
    noteTarget?.class_name ||
    'Rombel Kelas';

  const noteStudentNis = noteTarget?.nis || '-';
  const noteStudentNisn = noteTarget?.nisn || noteTarget?.metadata?.nisn || '';

  // Scroll animations for sticky header on scroll (60fps native driver)
  const scrollY = useRef(new Animated.Value(0)).current;
  const mainScrollHandler = useRef(
    Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
      useNativeDriver: true,
    })
  ).current;

  const stickyOpacity = useMemo(() => {
    return scrollY.interpolate({
      inputRange: [35, 80],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    });
  }, [scrollY]);

  const stickyTranslateY = useMemo(() => {
    return scrollY.interpolate({
      inputRange: [0, 34.9, 35, 80],
      outputRange: [-320, -320, -15, 0],
      extrapolate: 'clamp',
    });
  }, [scrollY]);



  const unreadNotificationCount = useNotificationBadgeStore(
    (state) => state.unreadNotificationCount
  );

  const handleBack = () => {
    const handled = useNavigationHistoryStore.getState().goBackDynamic(nav, route?.params);
    if (handled) return;
    if (nav?.canGoBack?.()) {
      nav.goBack();
    } else {
      nav?.navigate('Beranda');
    }
  };

  const menuButtonsConfig: Array<{
    id: TeacherTab;
    title: string;
    subtitle: string;
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    color: string;
    bg: string;
    borderColor: string;
    count?: number;
  }> = [
    {
      id: 'overview',
      title: 'Ringkasan',
      subtitle: 'Statistik & Dasbor',
      icon: 'view-dashboard-outline',
      color: '#059669',
      bg: '#ECFDF5',
      borderColor: '#A7F3D0',
    },
    {
      id: 'schedules',
      title: 'Jadwal KBM',
      subtitle: `${schedulesToday} Sesi Hari Ini`,
      icon: 'calendar-clock-outline',
      color: '#7C3AED',
      bg: '#F5F3FF',
      borderColor: '#DDD6FE',
      count: schedules.length,
    },
    {
      id: 'students',
      title: 'Data Siswa',
      subtitle: `${students.length} Santri Diampu`,
      icon: 'account-group-outline',
      color: '#2563EB',
      bg: '#EFF6FF',
      borderColor: '#BFDBFE',
      count: students.length,
    },
    {
      id: 'materials',
      title: 'Materi LMS',
      subtitle: `${materials.length} Modul & RPP`,
      icon: 'book-open-page-variant-outline',
      color: '#D97706',
      bg: '#FFFBEB',
      borderColor: '#FDE68A',
      count: materials.length,
    },
    {
      id: 'notes',
      title: 'Jurnal Siswa',
      subtitle: `${notes.length} Catatan Guru`,
      icon: 'notebook-edit-outline',
      color: '#E11D48',
      bg: '#FFF1F2',
      borderColor: '#FECDD3',
      count: notes.length,
    },
  ];

  return (
    <View style={styles.screen}>
      {/* ── 1. MAIN SCROLLABLE CONTENT WITH ON_SCROLL ── */}
      <Animated.ScrollView
        onScroll={mainScrollHandler}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            colors={['#059669']}
          />
        }
        contentContainerStyle={[styles.mainScrollContent, { paddingBottom: insets.bottom + 90 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. FULL-BLEED HERO CONTAINER GURU (SEAMLESS EDGE-TO-EDGE) ── */}
        <View style={[styles.heroFullBleedWrapper, { paddingTop: insets.top + 8 }]}>
          <LinearGradient
            colors={['#022C22', '#064E3B', '#047857', '#059669', '#10B981']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroDecorCircle1} />
          <View style={styles.heroDecorCircle2} />
          <View style={styles.heroDecorCircle3} />

          {/* Top Bar Row: Back + Title "Portal Guru" + Notification */}
          <View style={styles.staticTopBarRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleBack}
              style={styles.heroSquircleBtn}
              accessibilityRole="button"
              accessibilityLabel="Kembali"
            >
              <MaterialCommunityIcons name="arrow-left" size={20} color="#059669" />
            </TouchableOpacity>

            <View style={styles.heroTitleCenterCol}>
              <Text numberOfLines={1} style={styles.heroModuleTitle}>
                Portal Guru
              </Text>
              <Text numberOfLines={1} style={styles.heroModuleSubtitle}>
                {dashboard?.academic_context?.school_name || 'Manajemen Kelas & Akademik Terpadu'}
              </Text>
            </View>

            <View style={styles.heroTopActionsRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => nav?.navigate('Notifikasi')}
                style={styles.heroSquircleBtn}
                accessibilityRole="button"
                accessibilityLabel="Notifikasi"
              >
                <MaterialCommunityIcons name="bell-outline" size={20} color="#059669" />
                {unreadNotificationCount > 0 && <View style={styles.heroBellDot} />}
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleLogout}
                style={[styles.heroSquircleBtn, styles.heroLogoutBtn]}
                accessibilityRole="button"
                accessibilityLabel="Keluar Akun"
              >
                <MaterialCommunityIcons name="logout-variant" size={18} color="#EF4444" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Teacher Profile Card Section */}
          <View style={styles.heroTeacherCardInner}>
            <View style={styles.cardTopRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => nav?.navigate('Profil')}
                style={styles.avatarBox}
                accessibilityLabel="Profil Guru"
              >
                {teacherPhoto ? (
                  <Image
                    source={{ uri: teacherPhoto }}
                    style={styles.avatarImg}
                    resizeMode="cover"
                  />
                ) : (
                  <Image
                    source={DEFAULT_PARENT_AVATAR}
                    style={styles.avatarImg}
                    resizeMode="cover"
                  />
                )}
                <View style={styles.avatarOnlineDot} />
              </TouchableOpacity>

              <View style={styles.infoCol}>
                <View style={styles.roleBadgeRow}>
                  <View style={styles.rolePill}>
                    <MaterialCommunityIcons
                      name="shield-check"
                      size={11}
                      color="#059669"
                      style={{ marginRight: 3 }}
                    />
                    <Text numberOfLines={1} style={styles.rolePillText}>
                      {teacherRoleTitle}
                    </Text>
                  </View>
                </View>

                {/* Nama Guru Lengkap */}
                <Text numberOfLines={1} style={styles.fullNameText}>
                  {teacherName}
                </Text>

                <Text numberOfLines={1} style={styles.nipText}>
                  {dashboard?.teacher?.jabatan || 'Tenaga Pendidik'} • NIP: {teacherNip}
                </Text>

                <View style={styles.unitBadge}>
                  <MaterialCommunityIcons
                    name="school"
                    size={11}
                    color="#A7F3D0"
                    style={{ marginRight: 4 }}
                  />
                  <Text numberOfLines={1} style={styles.unitText}>
                    {teacherUnit}
                  </Text>
                </View>
              </View>

              {/* Action buttons: Presensi / QR */}
              <View style={styles.cardHeaderActions}>
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => nav?.navigate('Absensi')}
                  style={styles.iconBtn}
                  accessibilityLabel="Buka Presensi"
                >
                  <MaterialCommunityIcons name="clipboard-check-outline" size={19} color="#059669" />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => nav?.navigate('QR Code')}
                  style={styles.iconBtn}
                  accessibilityLabel="Scan / Tampilkan QR"
                >
                  <MaterialCommunityIcons name="qrcode-scan" size={19} color="#059669" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Middle: 3 Quick Metric / Attribute Chips */}
            <View style={styles.attributesGrid}>
              <View style={styles.attrBox}>
                <View style={styles.attrLabelRow}>
                  <MaterialCommunityIcons
                    name="clock-outline"
                    size={12}
                    color="#A7F3D0"
                    style={{ marginRight: 4 }}
                  />
                  <Text numberOfLines={1} style={styles.attrLabelText}>
                    Jadwal Hari Ini
                  </Text>
                </View>
                <Text numberOfLines={1} style={styles.attrValueText}>
                  {schedulesToday} KBM
                </Text>
              </View>

              <View style={styles.attrBox}>
                <View style={styles.attrLabelRow}>
                  <MaterialCommunityIcons
                    name="google-classroom"
                    size={12}
                    color="#A7F3D0"
                    style={{ marginRight: 4 }}
                  />
                  <Text numberOfLines={1} style={styles.attrLabelText}>
                    Kelas Diampu
                  </Text>
                </View>
                <Text numberOfLines={1} style={styles.attrValueText}>
                  {totalClasses} Kelas
                </Text>
              </View>

              <View style={styles.attrBox}>
                <View style={styles.attrLabelRow}>
                  <MaterialCommunityIcons
                    name="account-group"
                    size={12}
                    color="#A7F3D0"
                    style={{ marginRight: 4 }}
                  />
                  <Text numberOfLines={1} style={styles.attrLabelText}>
                    Total Santri
                  </Text>
                </View>
                <Text numberOfLines={1} style={styles.attrValueText}>
                  {totalStudents} Santri
                </Text>
              </View>
            </View>

            {/* Bottom Quick Row: Jadwal, Presensi, Ringkasan */}
            <View style={styles.cardBottomRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setTab('schedules')}
                style={styles.bottomActionBtn}
              >
                <MaterialCommunityIcons name="calendar-clock-outline" size={15} color="#064E3B" />
                <Text numberOfLines={1} style={styles.bottomActionText}>Jadwal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => nav?.navigate('Absensi')}
                style={styles.bottomActionBtn}
              >
                <MaterialCommunityIcons name="clipboard-check-outline" size={15} color="#064E3B" />
                <Text numberOfLines={1} style={styles.bottomActionText}>Presensi</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setTab('overview')}
                style={[styles.bottomActionBtn, tab === 'overview' && styles.bottomActionBtnPrimary]}
              >
                <MaterialCommunityIcons name="view-grid-outline" size={14} color={tab === 'overview' ? '#FFFFFF' : '#064E3B'} />
                <Text numberOfLines={1} style={[styles.bottomActionText, tab === 'overview' && styles.bottomActionTextPrimary]}>Ringkasan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── 2. BADAN HALAMAN KONTEN ── */}
        <View style={styles.bodyContentWrapper}>
          {/* ── MENU MODUL GURU (BUTTON MENU GRID) ── */}
          <View style={styles.menuGridSection}>
            <View style={styles.menuGridHeader}>
              <View style={styles.menuGridHeaderIconWrap}>
                <MaterialCommunityIcons name="view-grid" size={16} color="#059669" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuGridHeaderTitle}>Pilih Modul Guru</Text>
                <Text style={styles.menuGridHeaderSub}>Kelola KBM, jadwal, data santri, materi LMS & catatan</Text>
              </View>
              <View style={styles.menuActiveTagPill}>
                <Text style={styles.menuActiveTagText}>
                  {(menuButtonsConfig.find((m) => m.id === tab)?.title || 'MODUL').toUpperCase()}
                </Text>
              </View>
            </View>

            <View style={styles.menuButtonGrid}>
              {menuButtonsConfig.slice(0, 4).map((btn) => {
                const isActive = tab === btn.id;
                return (
                  <TouchableOpacity
                    key={btn.id}
                    activeOpacity={0.82}
                    onPress={() => setTab(btn.id)}
                    style={[
                      styles.menuBtnCard,
                      { borderColor: isActive ? btn.color : btn.borderColor },
                      isActive && styles.menuBtnCardActive,
                    ]}
                  >
                    {isActive && <View style={[styles.menuBtnActiveBar, { backgroundColor: btn.color }]} />}

                    <View style={styles.menuBtnCardTop}>
                      <View style={[styles.menuBtnIconSquare, { backgroundColor: btn.bg }]}>
                        <MaterialCommunityIcons name={btn.icon} size={22} color={btn.color} />
                      </View>
                      <View style={styles.menuBtnRightBadges}>
                        {typeof btn.count === 'number' && btn.count > 0 && (
                          <View style={[styles.menuBtnCountBadge, { backgroundColor: btn.bg, borderColor: btn.borderColor }]}>
                            <Text style={[styles.menuBtnCountText, { color: btn.color }]}>
                              {btn.count}
                            </Text>
                          </View>
                        )}
                        <View style={[styles.menuBtnActiveDot, isActive && { backgroundColor: btn.color }]}>
                          {isActive ? (
                            <MaterialCommunityIcons name="check" size={10} color="#FFFFFF" />
                          ) : (
                            <View style={styles.menuBtnInactiveInnerDot} />
                          )}
                        </View>
                      </View>
                    </View>

                    <Text
                      style={[styles.menuBtnTitle, isActive && { color: btn.color }]}
                      numberOfLines={1}
                    >
                      {btn.title}
                    </Text>
                    <Text style={styles.menuBtnSubtitle} numberOfLines={1}>
                      {btn.subtitle}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Item 5: Jurnal Siswa (Full Width Featured Button Menu) */}
            {(() => {
              const btn = menuButtonsConfig[4];
              const isActive = tab === btn.id;
              return (
                <TouchableOpacity
                  key={btn.id}
                  activeOpacity={0.82}
                  onPress={() => setTab(btn.id)}
                  style={[
                    styles.menuBtnCardFull,
                    { borderColor: isActive ? btn.color : btn.borderColor },
                    isActive && styles.menuBtnCardActive,
                  ]}
                >
                  {isActive && <View style={[styles.menuBtnActiveBar, { backgroundColor: btn.color }]} />}
                  <View style={[styles.menuBtnIconSquare, { backgroundColor: btn.bg }]}>
                    <MaterialCommunityIcons name={btn.icon} size={22} color={btn.color} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.menuBtnTitle, isActive && { color: btn.color }]} numberOfLines={1}>
                        {btn.title}
                      </Text>
                      {typeof btn.count === 'number' && btn.count > 0 && (
                        <View style={[styles.menuBtnCountBadge, { backgroundColor: btn.bg, borderColor: btn.borderColor }]}>
                          <Text style={[styles.menuBtnCountText, { color: btn.color }]}>
                            {btn.count}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.menuBtnSubtitle} numberOfLines={1}>
                      {btn.subtitle}
                    </Text>
                  </View>

                  <View style={[styles.menuBtnActiveDot, isActive && { backgroundColor: btn.color }]}>
                    {isActive ? (
                      <MaterialCommunityIcons name="check" size={12} color="#FFFFFF" />
                    ) : (
                      <MaterialCommunityIcons name="chevron-right" size={16} color="#94A3B8" />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })()}
          </View>

        {/* Error Notice */}
        {error ? (
          <View style={styles.errorNoticeCard}>
            <MaterialCommunityIcons name="alert-circle-outline" size={20} color="#DC2626" />
            <Text style={styles.errorNoticeText}>{error}</Text>
            <TouchableOpacity onPress={() => void load()} style={styles.errorRetryBtn}>
              <Text style={styles.errorRetryBtnText}>Coba Lagi</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Loading Spinner */}
        {loading && (
          <View style={styles.loadingWrapper}>
            <ActivityIndicator size="small" color="#059669" />
            <Text style={styles.loadingLabel}>Memuat data portal guru...</Text>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB 1: OVERVIEW (RINGKASAN)                                    */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {tab === 'overview' && !loading && (
          <View style={styles.tabContentBlock}>
            {/* KPI Summary Buttons (6 Card Interaktif Bergaya Warna) */}
            <View style={styles.kpiGrid}>
              {[
                {
                  label: 'Jadwal Hari Ini',
                  value: kpi.schedules_today_count ?? schedules.length,
                  icon: 'calendar-clock-outline',
                  color: '#047857',
                  bg: '#ECFDF5',
                  borderColor: '#A7F3D0',
                  iconBg: '#D1FAE5',
                  sub: 'Sesi KBM aktif',
                  onPress: () => setTab('schedules'),
                },
                {
                  label: 'Total Siswa',
                  value: kpi.total_students ?? students.length,
                  icon: 'account-group-outline',
                  color: '#1D4ED8',
                  bg: '#EFF6FF',
                  borderColor: '#BFDBFE',
                  iconBg: '#DBEAFE',
                  sub: 'Santri bimbingan',
                  onPress: () => setTab('students'),
                },
                {
                  label: 'Kelas Diampu',
                  value: kpi.total_classes ?? uniqueClassesFromStudents.length,
                  icon: 'google-classroom',
                  color: '#6D28D9',
                  bg: '#F5F3FF',
                  borderColor: '#DDD6FE',
                  iconBg: '#EDE9FE',
                  sub: 'Rombel belajar',
                  onPress: () => setTab('students'),
                },
                {
                  label: 'Perlu Dinilai',
                  value: kpi.pending_grading_count ?? 0,
                  icon: 'file-document-edit-outline',
                  color: '#B45309',
                  bg: '#FFFBEB',
                  borderColor: '#FDE68A',
                  iconBg: '#FEF3C7',
                  sub: 'Tugas & Ujian',
                  onPress: () => nav?.navigate('Nilai'),
                },
                {
                  label: 'Bahan Ajar',
                  value: materials.length,
                  icon: 'book-open-page-variant-outline',
                  color: '#0F766E',
                  bg: '#F0FDFA',
                  borderColor: '#99F6E4',
                  iconBg: '#CCFBF1',
                  sub: 'Modul materi',
                  onPress: () => setTab('materials'),
                },
                {
                  label: 'Catatan Siswa',
                  value: notes.length,
                  icon: 'notebook-edit-outline',
                  color: '#BE123C',
                  bg: '#FFF1F2',
                  borderColor: '#FECDD3',
                  iconBg: '#FFE4E6',
                  sub: 'Jurnal evaluasi',
                  onPress: () => setTab('notes'),
                },
              ].map((item, idx) => (
                <TouchableOpacity
                  key={`kpi-btn-${idx}`}
                  activeOpacity={0.8}
                  onPress={item.onPress}
                  style={[
                    styles.kpiCardItem,
                    {
                      backgroundColor: item.bg,
                      borderColor: item.borderColor,
                    },
                  ]}
                >
                  <View style={styles.kpiCardTopRow}>
                    <View style={[styles.kpiIconSquare, { backgroundColor: item.iconBg }]}>
                      <MaterialCommunityIcons name={item.icon as any} size={21} color={item.color} />
                    </View>
                    <View style={[styles.kpiMiniActionPill, { backgroundColor: item.iconBg }]}>
                      <MaterialCommunityIcons name="arrow-top-right" size={13} color={item.color} />
                    </View>
                  </View>
                  <Text style={[styles.kpiCardValue, { color: item.color }]}>{item.value}</Text>
                  <Text numberOfLines={1} style={styles.kpiCardLabel}>{item.label}</Text>
                  <Text numberOfLines={1} style={[styles.kpiCardSub, { color: item.color }]}>
                    {item.sub}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Ruang Kerja Cepat (Shortcut Grid dengan Style Warna) */}
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleWithIcon}>
                <MaterialCommunityIcons name="lightning-bolt" size={18} color="#059669" />
                <Text style={styles.sectionTitleText}>Ruang Kerja Cepat</Text>
              </View>
            </View>

            <View style={styles.quickGrid}>
              {[
                {
                  title: 'Buku Nilai',
                  sub: 'Input Formatif, UTS, & UAS',
                  icon: 'chart-box-outline',
                  color: '#047857',
                  bg: '#F0FDF4',
                  borderColor: '#86EFAC',
                  iconBg: '#DCFCE7',
                  route: 'Nilai',
                },
                {
                  title: 'Presensi KBM',
                  sub: 'Scan QR & Absensi Kelas',
                  icon: 'qrcode-scan',
                  color: '#0F766E',
                  bg: '#F0FDFA',
                  borderColor: '#5EEAD4',
                  iconBg: '#CCFBF1',
                  route: 'QR Code',
                },
                {
                  title: 'Tahfizh Quran',
                  sub: 'Setoran Mushaf & Ziyadah',
                  icon: 'book-open-variant',
                  color: '#1D4ED8',
                  bg: '#EFF6FF',
                  borderColor: '#93C5FD',
                  iconBg: '#DBEAFE',
                  route: 'Tahfizh',
                },
                {
                  title: 'Mutaba\'ah',
                  sub: 'Validasi Ibadah Santri',
                  icon: 'clipboard-check-outline',
                  color: '#B45309',
                  bg: '#FFFBEB',
                  borderColor: '#FCD34D',
                  iconBg: '#FEF3C7',
                  route: 'Mutabaah',
                },
              ].map((q, idx) => (
                <TouchableOpacity
                  key={`quick-${idx}`}
                  activeOpacity={0.8}
                  style={[
                    styles.quickCardItem,
                    {
                      backgroundColor: q.bg,
                      borderColor: q.borderColor,
                    },
                  ]}
                  onPress={() => nav?.navigate(q.route)}
                >
                  <View style={[styles.quickCardIconBox, { backgroundColor: q.iconBg }]}>
                    <MaterialCommunityIcons name={q.icon as any} size={22} color={q.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={[styles.quickCardTitle, { color: q.color }]}>
                      {q.title}
                    </Text>
                    <Text numberOfLines={1} style={styles.quickCardSub}>{q.sub}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={17} color={q.color} />
                </TouchableOpacity>
              ))}
            </View>

            {/* Agenda Mengajar Hari Ini */}
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleWithIcon}>
                <MaterialCommunityIcons name="clock-outline" size={18} color="#059669" />
                <Text style={styles.sectionTitleText}>Agenda Mengajar Hari Ini</Text>
              </View>
              {schedules.length > 3 && (
                <TouchableOpacity onPress={() => setTab('schedules')}>
                  <Text style={styles.seeAllText}>Lihat Semua ({schedules.length})</Text>
                </TouchableOpacity>
              )}
            </View>

            {schedules.length === 0 ? (
              <EmptyStateCard
                icon="calendar-blank-outline"
                title="Tidak Ada Jadwal Hari Ini"
                description="Tidak ada penugasan KBM terjadwal untuk hari ini. Silakan cek tab Jadwal untuk melihat seluruh jadwal mengajar."
              />
            ) : (
              schedules.slice(0, 4).map((sc, idx) => (
                <ModernScheduleCard
                  key={`sc-ov-${sc.id || idx}`}
                  item={sc}
                  isActive={isScheduleActiveNow(sc)}
                  onOpenPresensi={() =>
                    nav?.navigate('QR Code', {
                      schedule_id: sc.id,
                      kelas_id: sc.kelas_id || sc.class_id,
                      class_name: sc.kelas?.nama_kelas || sc.class_name,
                      mode: 'manual',
                    })
                  }
                  onOpenMateri={() => setTab('materials')}
                />
              ))
            )}
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB 2: SCHEDULES (JADWAL MENGAJAR)                            */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {tab === 'schedules' && !loading && (
          <View style={styles.tabContentBlock}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleWithIcon}>
                <MaterialCommunityIcons name="calendar-clock" size={20} color="#059669" />
                <Text style={styles.sectionTitleText}>Semua Jadwal Mengajar</Text>
              </View>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{schedules.length} Sesi KBM</Text>
              </View>
            </View>

            {schedules.length === 0 ? (
              <EmptyStateCard
                icon="calendar-remove-outline"
                title="Belum Ada Jadwal Tersedia"
                description="Server belum mengalokasikan jadwal mengajar untuk akun Anda. Silakan hubungi bagian kurikulum atau tata usaha."
              />
            ) : (
              schedules.map((sc, idx) => (
                <ModernScheduleCard
                  key={`sc-full-${sc.id || idx}`}
                  item={sc}
                  isActive={isScheduleActiveNow(sc)}
                  onOpenPresensi={() =>
                    nav?.navigate('QR Code', {
                      schedule_id: sc.id,
                      kelas_id: sc.kelas_id || sc.class_id,
                      class_name: sc.kelas?.nama_kelas || sc.class_name,
                      mode: 'manual',
                    })
                  }
                  onOpenMateri={() => setTab('materials')}
                />
              ))
            )}
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB 3: STUDENTS (DAFTAR SISWA DALAM CAKUPAN MENGAJAR)         */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {tab === 'students' && !loading && (
          <View style={styles.tabContentBlock}>
            {/* Header: Title + Total */}
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleWithIcon}>
                <MaterialCommunityIcons name="account-group" size={20} color="#059669" />
                <Text style={styles.sectionTitleText}>Siswa Bimbingan & Mengajar</Text>
              </View>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{filteredStudents.length} Santri</Text>
              </View>
            </View>

            {/* Search Input Bar */}
            <View style={styles.searchBarContainer}>
              <MaterialCommunityIcons name="magnify" size={18} color="#059669" />
              <TextInput
                style={styles.searchInput}
                placeholder="Cari nama santri / NIS..."
                placeholderTextColor="#94A3B8"
                value={studentSearch}
                onChangeText={setStudentSearch}
              />
              {Boolean(studentSearch) && (
                <TouchableOpacity onPress={() => setStudentSearch('')}>
                  <MaterialCommunityIcons name="close-circle" size={17} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            {/* Class Filter Chips */}
            {uniqueClassesFromStudents.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.classChipsScroll}
              >
                <TouchableOpacity
                  onPress={() => setSelectedStudentClassFilter('ALL')}
                  style={[
                    styles.classChip,
                    selectedStudentClassFilter === 'ALL' && styles.classChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.classChipText,
                      selectedStudentClassFilter === 'ALL' && styles.classChipTextActive,
                    ]}
                  >
                    Semua Rombel
                  </Text>
                </TouchableOpacity>

                {uniqueClassesFromStudents.map((cls) => (
                  <TouchableOpacity
                    key={`filter-cls-${cls.id}`}
                    onPress={() => setSelectedStudentClassFilter(cls.id)}
                    style={[
                      styles.classChip,
                      selectedStudentClassFilter === cls.id && styles.classChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.classChipText,
                        selectedStudentClassFilter === cls.id && styles.classChipTextActive,
                      ]}
                    >
                      {cls.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {filteredStudents.length === 0 ? (
              <EmptyStateCard
                icon="account-search-outline"
                title="Santri Tidak Ditemukan"
                description={
                  studentSearch
                    ? 'Tidak ada santri yang sesuai dengan kata kunci pencarian.'
                    : 'Belum ada data santri dalam penugasan kelas Anda.'
                }
              />
            ) : (
              filteredStudents.map((st, idx) => {
                const avatarSource = getStudentAvatarSource(st);
                const isGirl = isGirlStudent(st);

                const sName = st.full_name || st.nama_lengkap || st.name || 'Santri';
                const sNis = st.nis || '-';
                const sNisn = st.nisn || st.metadata?.nisn || '';
                const sClass = st.kelas?.nama_kelas || st.kelas?.name || st.class_name || 'Rombel Kelas';
                const sUnit = st.education_unit?.name || st.unit_name || st.unit?.name || '';

                return (
                  <View key={`st-${st.id || idx}`} style={styles.modernStudentCard}>
                    {/* Baris Utama: Avatar + Identitas Lengkap Santri */}
                    <View style={styles.studentCardMainRow}>
                      <View style={styles.studentCardAvatarWrap}>
                        <Image source={avatarSource} style={styles.studentCardAvatarImg} resizeMode="cover" />
                        <View style={[styles.studentGenderBadge, isGirl ? styles.studentGenderBadgeGirl : styles.studentGenderBadgeBoy]}>
                          <MaterialCommunityIcons
                            name={isGirl ? 'gender-female' : 'gender-male'}
                            size={10}
                            color="#FFFFFF"
                          />
                        </View>
                      </View>

                      <View style={styles.studentCardInfoCol}>
                        <View style={styles.studentCardHeaderRow}>
                          <View style={styles.studentIndexPill}>
                            <Text style={styles.studentIndexText}>#{idx + 1}</Text>
                          </View>
                          <Text numberOfLines={1} style={styles.studentCardName}>{sName}</Text>
                        </View>

                        {/* Identitas NIS & NISN */}
                        <View style={styles.studentCardMetaRow}>
                          <View style={styles.nisBadgePill}>
                            <Text style={styles.nisBadgeText}>NIS: {sNis}</Text>
                          </View>
                          {Boolean(sNisn) && (
                            <View style={styles.nisnBadgePill}>
                              <Text style={styles.nisnBadgeText}>NISN: {sNisn}</Text>
                            </View>
                          )}
                        </View>

                        {/* Rombel Kelas & Unit Pendidikan */}
                        <View style={styles.studentClassUnitRow}>
                          <View style={styles.classBadgePill}>
                            <MaterialCommunityIcons name="google-classroom" size={11} color="#047857" />
                            <Text style={styles.classBadgeText}>{sClass}</Text>
                          </View>
                          {Boolean(sUnit) && (
                            <View style={styles.unitBadgePill}>
                              <MaterialCommunityIcons name="school-outline" size={11} color="#1D4ED8" />
                              <Text numberOfLines={1} style={styles.unitBadgeText}>{sUnit}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>

                    {/* Footer Kartu: Status & Tombol Aksi Beri Catatan */}
                    <View style={styles.studentCardActionFooter}>
                      <View style={styles.studentStatusPill}>
                        <View style={styles.studentStatusDot} />
                        <Text style={styles.studentStatusText}>Santri Bimbingan</Text>
                      </View>

                      {canNote && (
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => openNote(st)}
                          style={styles.addNoteActionBtn}
                          accessibilityLabel={`Beri catatan evaluasi untuk ${sName}`}
                        >
                          <MaterialCommunityIcons name="notebook-plus-outline" size={15} color="#047857" />
                          <Text style={styles.addNoteActionBtnText}>+ Catatan Evaluasi</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB 4: MATERIALS (MATERI PEMBELAJARAN & MODUL AJAR RPP)       */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {tab === 'materials' && !loading && (
          <View style={styles.tabContentBlock}>
            {/* ── Sub-Tab Switcher: Bahan Ajar KBM vs Modul Ajar (RPP Digital) ── */}
            <View style={styles.materialSubTabContainer}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setMaterialSubTab('materials')}
                style={[
                  styles.materialSubTabBtn,
                  materialSubTab === 'materials' && styles.materialSubTabBtnActive,
                ]}
              >
                <MaterialCommunityIcons
                  name="book-open-page-variant"
                  size={16}
                  color={materialSubTab === 'materials' ? '#047857' : '#64748B'}
                />
                <Text
                  style={[
                    styles.materialSubTabBtnText,
                    materialSubTab === 'materials' && styles.materialSubTabBtnTextActive,
                  ]}
                >
                  Bahan Ajar KBM ({materials.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setMaterialSubTab('modul_ajar')}
                style={[
                  styles.materialSubTabBtn,
                  materialSubTab === 'modul_ajar' && styles.materialSubTabBtnActive,
                ]}
              >
                <MaterialCommunityIcons
                  name="file-certificate-outline"
                  size={16}
                  color={materialSubTab === 'modul_ajar' ? '#047857' : '#64748B'}
                />
                <Text
                  style={[
                    styles.materialSubTabBtnText,
                    materialSubTab === 'modul_ajar' && styles.materialSubTabBtnTextActive,
                  ]}
                >
                  Modul Ajar (RPP) ({modulAjars.length})
                </Text>
              </TouchableOpacity>
            </View>

            {/* ══════════════════════════════════════════════════════════ */}
            {/* SUB-VIEW 1: BAHAN AJAR & MATERI PEMBELAJARAN KBM          */}
            {/* ══════════════════════════════════════════════════════════ */}
            {materialSubTab === 'materials' && (
              <>
                {/* Header: Title + Create Button */}
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionTitleWithIcon}>
                    <MaterialCommunityIcons name="book-open-page-variant" size={20} color="#059669" />
                    <View>
                      <Text style={styles.sectionTitleText}>Bahan Ajar KBM</Text>
                      <Text style={styles.sectionSubtitleText}>
                        Materi bacaan, ringkasan dan instruksi belajar santri
                      </Text>
                    </View>
                  </View>
                  {canMaterial && (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={openMaterial}
                      style={styles.headerPrimaryCtaBtn}
                    >
                      <MaterialCommunityIcons name="plus" size={16} color="#FFFFFF" />
                      <Text style={styles.headerPrimaryCtaText}>Buat Materi</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Search Input Bar */}
                <View style={styles.searchBarContainer}>
                  <MaterialCommunityIcons name="magnify" size={18} color="#059669" />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Cari judul materi, isi, atau mapel..."
                    placeholderTextColor="#94A3B8"
                    value={materialSearch}
                    onChangeText={setMaterialSearch}
                  />
                  {Boolean(materialSearch) && (
                    <TouchableOpacity onPress={() => setMaterialSearch('')}>
                      <MaterialCommunityIcons name="close-circle" size={17} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Horizontal Filter 1: Rombel / Kelas */}
                <View style={styles.filterSectionWrapper}>
                  <Text style={styles.filterGroupHeader}>Filter Rombel / Kelas:</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.classChipsScroll}
                  >
                    <TouchableOpacity
                      onPress={() => setSelectedMaterialClassFilter('ALL')}
                      style={[
                        styles.classChip,
                        selectedMaterialClassFilter === 'ALL' && styles.classChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.classChipText,
                          selectedMaterialClassFilter === 'ALL' && styles.classChipTextActive,
                        ]}
                      >
                        Semua Rombel ({materials.length})
                      </Text>
                    </TouchableOpacity>
                    {uniqueMaterialClasses.map((c) => {
                      const isSel = selectedMaterialClassFilter === c.id;
                      return (
                        <TouchableOpacity
                          key={`cfilter-${c.id}`}
                          onPress={() => setSelectedMaterialClassFilter(c.id)}
                          style={[styles.classChip, isSel && styles.classChipActive]}
                        >
                          <Text style={[styles.classChipText, isSel && styles.classChipTextActive]}>
                            {c.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Horizontal Filter 2: Mata Pelajaran & Status */}
                <View style={styles.filterSectionWrapper}>
                  <Text style={styles.filterGroupHeader}>Mata Pelajaran & Status:</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.classChipsScroll}
                  >
                    {/* Status Pill Filters */}
                    <TouchableOpacity
                      onPress={() => setSelectedMaterialStatusFilter('ALL')}
                      style={[
                        styles.filterStatusChip,
                        selectedMaterialStatusFilter === 'ALL' && styles.filterStatusChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.filterStatusChipText,
                          selectedMaterialStatusFilter === 'ALL' && styles.filterStatusChipTextActive,
                        ]}
                      >
                        Semua Status
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setSelectedMaterialStatusFilter('published')}
                      style={[
                        styles.filterStatusChip,
                        selectedMaterialStatusFilter === 'published' && styles.filterStatusChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.filterStatusChipText,
                          selectedMaterialStatusFilter === 'published' && styles.filterStatusChipTextActive,
                        ]}
                      >
                        Dipublikasikan
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setSelectedMaterialStatusFilter('draft')}
                      style={[
                        styles.filterStatusChip,
                        selectedMaterialStatusFilter === 'draft' && styles.filterStatusChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.filterStatusChipText,
                          selectedMaterialStatusFilter === 'draft' && styles.filterStatusChipTextActive,
                        ]}
                      >
                        Draft
                      </Text>
                    </TouchableOpacity>

                    {/* Divider kecil */}
                    <View style={styles.filterChipDivider} />

                    {/* Mata Pelajaran Filters */}
                    <TouchableOpacity
                      onPress={() => setSelectedMaterialSubjectFilter('ALL')}
                      style={[
                        styles.filterSubjectChip,
                        selectedMaterialSubjectFilter === 'ALL' && styles.filterSubjectChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.filterSubjectChipText,
                          selectedMaterialSubjectFilter === 'ALL' && styles.filterSubjectChipTextActive,
                        ]}
                      >
                        Semua Mapel
                      </Text>
                    </TouchableOpacity>

                    {uniqueMaterialSubjects.map((s) => {
                      const isSel = selectedMaterialSubjectFilter === s.id;
                      return (
                        <TouchableOpacity
                          key={`sfilter-${s.id}`}
                          onPress={() => setSelectedMaterialSubjectFilter(s.id)}
                          style={[styles.filterSubjectChip, isSel && styles.filterSubjectChipActive]}
                        >
                          <Text style={[styles.filterSubjectChipText, isSel && styles.filterSubjectChipTextActive]}>
                            {s.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Reset Filters CTA Banner */}
                {(selectedMaterialClassFilter !== 'ALL' ||
                  selectedMaterialSubjectFilter !== 'ALL' ||
                  selectedMaterialStatusFilter !== 'ALL' ||
                  Boolean(materialSearch)) && (
                  <View style={styles.activeFilterNoticeRow}>
                    <Text style={styles.activeFilterNoticeText}>
                      Menampilkan {filteredMaterials.length} dari {materials.length} bahan ajar terfilter
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        setMaterialSearch('');
                        setSelectedMaterialClassFilter('ALL');
                        setSelectedMaterialSubjectFilter('ALL');
                        setSelectedMaterialStatusFilter('ALL');
                      }}
                      style={styles.resetFilterActionBtn}
                    >
                      <MaterialCommunityIcons name="refresh" size={13} color="#059669" />
                      <Text style={styles.resetFilterActionText}>Reset Filter</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* List Bahan Ajar Cards */}
                {filteredMaterials.length === 0 ? (
                  <EmptyStateCard
                    icon="book-open-page-variant-outline"
                    title="Belum Ada Bahan Ajar"
                    description={
                      materialSearch ||
                      selectedMaterialClassFilter !== 'ALL' ||
                      selectedMaterialSubjectFilter !== 'ALL' ||
                      selectedMaterialStatusFilter !== 'ALL'
                        ? 'Tidak ada bahan ajar yang cocok dengan filter atau kata kunci pencarian.'
                        : 'Belum ada materi pembelajaran yang diunggah. Tekan tombol "Buat Materi" untuk memulai.'
                    }
                  />
                ) : (
                  filteredMaterials.map((m, idx) => {
                    const isPublished = (m.status || (m.is_published ? 'published' : 'draft')).toLowerCase() === 'published';
                    return (
                      <TouchableOpacity
                        key={`mat-${m.id || idx}`}
                        activeOpacity={0.92}
                        onPress={() => setSelectedDetailMaterial(m)}
                        style={styles.modernMaterialCard}
                      >
                        <View style={styles.materialCardHeaderRow}>
                          <View style={styles.materialSubjectPill}>
                            <MaterialCommunityIcons name="bookmark" size={12} color="#059669" />
                            <Text style={styles.materialSubjectPillText}>
                              {m.subject?.name || m.subject?.nama_mapel || 'Mata Pelajaran'}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.materialStatusPill,
                              isPublished ? styles.statusPublished : styles.statusDraft,
                            ]}
                          >
                            <MaterialCommunityIcons
                              name={isPublished ? 'check-circle' : 'file-document-edit'}
                              size={12}
                              color={isPublished ? '#047857' : '#D97706'}
                            />
                            <Text
                              style={[
                                styles.materialStatusPillText,
                                { color: isPublished ? '#047857' : '#B45309' },
                              ]}
                            >
                              {isPublished ? 'Dipublikasikan' : 'Draft'}
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.materialTitleText}>{m.judul || m.title || 'Materi Belajar'}</Text>

                        {Boolean(m.ringkasan || m.isi) && (
                          <Text numberOfLines={2} style={styles.materialSnippetText}>
                            {m.ringkasan || m.isi}
                          </Text>
                        )}

                        <View style={styles.materialFooterRow}>
                          <View style={styles.materialClassBadge}>
                            <MaterialCommunityIcons name="google-classroom" size={13} color="#64748B" />
                            <Text style={styles.materialClassBadgeText}>
                              {m.kelas?.nama_kelas || m.kelas?.name || m.class_name || 'Seluruh Rombel'}
                            </Text>
                          </View>
                          <Text style={styles.materialDateText}>
                            {m.created_at ? new Date(m.created_at).toLocaleDateString('id-ID') : 'Aktif'}
                          </Text>
                        </View>

                        {/* Action Buttons: Baca Detail, Ubah & Hapus */}
                        <View style={styles.materialCardActionsRow}>
                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => setSelectedDetailMaterial(m)}
                            style={styles.materialReadBtn}
                          >
                            <MaterialCommunityIcons name="eye-outline" size={14} color="#047857" />
                            <Text style={styles.materialReadBtnText}>Baca Detail</Text>
                          </TouchableOpacity>

                          {(canEditMaterial || canDeleteMaterial) && (
                            <View style={{ flexDirection: 'row', gap: 6 }}>
                              {canEditMaterial && (
                                <TouchableOpacity
                                  activeOpacity={0.8}
                                  onPress={() => openEditMaterial(m)}
                                  style={styles.materialEditBtn}
                                >
                                  <MaterialCommunityIcons name="pencil-outline" size={14} color="#1D4ED8" />
                                  <Text style={styles.materialEditBtnText}>Ubah</Text>
                                </TouchableOpacity>
                              )}

                              {canDeleteMaterial && (
                                <TouchableOpacity
                                  activeOpacity={0.8}
                                  onPress={() => setDeleteConfirmMaterial(m)}
                                  style={styles.materialDeleteBtn}
                                >
                                  <MaterialCommunityIcons name="trash-can-outline" size={14} color="#DC2626" />
                                  <Text style={styles.materialDeleteBtnText}>Hapus</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </>
            )}

            {/* ══════════════════════════════════════════════════════════ */}
            {/* SUB-VIEW 2: MODUL AJAR (RPP KURIKULUM MERDEKA TERPADU)    */}
            {/* ══════════════════════════════════════════════════════════ */}
            {materialSubTab === 'modul_ajar' && (
              <>
                {/* Header */}
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionTitleWithIcon}>
                    <MaterialCommunityIcons name="file-certificate-outline" size={20} color="#059669" />
                    <View>
                      <Text style={styles.sectionTitleText}>Modul Ajar & RPP Digital</Text>
                      <Text style={styles.sectionSubtitleText}>
                        Struktur Kurikulum Merdeka, Capaian (CP) & Tujuan Pembelajaran (TP)
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Search Input Bar Modul Ajar */}
                <View style={styles.searchBarContainer}>
                  <MaterialCommunityIcons name="magnify" size={18} color="#059669" />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Cari modul ajar, kode modul, CP, atau mapel..."
                    placeholderTextColor="#94A3B8"
                    value={modulAjarSearch}
                    onChangeText={setModulAjarSearch}
                  />
                  {Boolean(modulAjarSearch) && (
                    <TouchableOpacity onPress={() => setModulAjarSearch('')}>
                      <MaterialCommunityIcons name="close-circle" size={17} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Filter Fase Kurikulum Merdeka (A - F) */}
                <View style={styles.filterSectionWrapper}>
                  <Text style={styles.filterGroupHeader}>Filter Fase Kurikulum Merdeka:</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.classChipsScroll}
                  >
                    <TouchableOpacity
                      onPress={() => setSelectedModulAjarFaseFilter('ALL')}
                      style={[
                        styles.classChip,
                        selectedModulAjarFaseFilter === 'ALL' && styles.classChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.classChipText,
                          selectedModulAjarFaseFilter === 'ALL' && styles.classChipTextActive,
                        ]}
                      >
                        Semua Fase ({modulAjars.length})
                      </Text>
                    </TouchableOpacity>
                    {['A', 'B', 'C', 'D', 'E', 'F'].map((f) => {
                      const isSel = selectedModulAjarFaseFilter === f;
                      return (
                        <TouchableOpacity
                          key={`fase-${f}`}
                          onPress={() => setSelectedModulAjarFaseFilter(f)}
                          style={[styles.classChip, isSel && styles.classChipActive]}
                        >
                          <Text style={[styles.classChipText, isSel && styles.classChipTextActive]}>
                            Fase {f}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Reset Filters CTA Banner untuk Modul Ajar */}
                {(selectedModulAjarFaseFilter !== 'ALL' ||
                  selectedMaterialClassFilter !== 'ALL' ||
                  Boolean(modulAjarSearch)) && (
                  <View style={styles.activeFilterNoticeRow}>
                    <Text style={styles.activeFilterNoticeText}>
                      Menampilkan {filteredModulAjars.length} dari {modulAjars.length} modul ajar terfilter
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        setModulAjarSearch('');
                        setSelectedModulAjarFaseFilter('ALL');
                        setSelectedMaterialClassFilter('ALL');
                      }}
                      style={styles.resetFilterActionBtn}
                    >
                      <MaterialCommunityIcons name="refresh" size={13} color="#059669" />
                      <Text style={styles.resetFilterActionText}>Reset Filter</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* List Modul Ajar Cards */}
                {filteredModulAjars.length === 0 ? (
                  <EmptyStateCard
                    icon="file-certificate-outline"
                    title="Belum Ada Modul Ajar"
                    description={
                      modulAjarSearch || selectedModulAjarFaseFilter !== 'ALL'
                        ? 'Tidak ada modul ajar yang cocok dengan kata kunci atau filter fase.'
                        : 'Belum ada Modul Ajar (RPP Digital) yang tercatat untuk mata pelajaran dan rombel Anda.'
                    }
                  />
                ) : (
                  filteredModulAjars.map((mod, idx) => {
                    const modulCode = mod.kode_modul || `MOD-${idx + 1}`;
                    const modulTitle = mod.judul_modul || mod.judul || 'Modul Pembelajaran Kurikulum Merdeka';
                    const mapelName = mod.subject?.name || mod.subject?.nama_mapel || 'Mata Pelajaran';
                    const className = mod.kelas?.nama_kelas || mod.kelas?.name || 'Rombel Kelas';
                    const faseStr = mod.fase ? `Fase ${mod.fase}` : 'Fase Kurikulum';
                    const semStr = mod.semester ? `Semester ${mod.semester}` : 'Semester 1';
                    const jpStr = mod.alokasi_waktu_jp || mod.alokasi_jam ? `${mod.alokasi_waktu_jp || mod.alokasi_jam} JP` : '2 JP';

                    return (
                      <TouchableOpacity
                        key={`mod-${mod.id || idx}`}
                        activeOpacity={0.92}
                        onPress={() => setSelectedDetailModulAjar(mod)}
                        style={styles.modernModulCard}
                      >
                        <View style={styles.modulCardTopRow}>
                          <View style={styles.modulCodeBadge}>
                            <MaterialCommunityIcons name="file-code-outline" size={12} color="#047857" />
                            <Text style={styles.modulCodeText}>{modulCode}</Text>
                          </View>

                          <View style={styles.modulFaseBadge}>
                            <Text style={styles.modulFaseBadgeText}>
                              {faseStr} · {semStr}
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.modulCardTitle}>{modulTitle}</Text>

                        {/* Meta Info Row */}
                        <View style={styles.modulMetaRow}>
                          <View style={styles.modulMetaItem}>
                            <MaterialCommunityIcons name="bookmark-outline" size={13} color="#059669" />
                            <Text style={styles.modulMetaItemText}>{mapelName}</Text>
                          </View>
                          <Text style={styles.modulMetaDot}>•</Text>
                          <View style={styles.modulMetaItem}>
                            <MaterialCommunityIcons name="google-classroom" size={13} color="#64748B" />
                            <Text style={styles.modulMetaItemText}>{className}</Text>
                          </View>
                          <Text style={styles.modulMetaDot}>•</Text>
                          <View style={styles.modulMetaItem}>
                            <MaterialCommunityIcons name="clock-outline" size={13} color="#D97706" />
                            <Text style={styles.modulMetaItemText}>{jpStr}</Text>
                          </View>
                        </View>

                        {/* Capaian & Tujuan Pembelajaran Preview */}
                        {Boolean(mod.tujuan_pembelajaran || mod.capaian_pembelajaran?.nama_cp) && (
                          <View style={styles.modulTpPreviewBox}>
                            <Text style={styles.modulTpPreviewHeader}>Tujuan Pembelajaran (TP):</Text>
                            <Text numberOfLines={2} style={styles.modulTpPreviewText}>
                              {mod.tujuan_pembelajaran || mod.capaian_pembelajaran?.nama_cp}
                            </Text>
                          </View>
                        )}

                        {/* Profil Pelajar Pancasila Pill Tags */}
                        {Boolean(mod.profil_pelajar_pancasila) && (
                          <View style={styles.modulP3Row}>
                            <MaterialCommunityIcons name="star-circle" size={13} color="#7C3AED" />
                            <Text numberOfLines={1} style={styles.modulP3Text}>
                              P3: {mod.profil_pelajar_pancasila}
                            </Text>
                          </View>
                        )}

                        {/* Card Action: View Full RPP */}
                        <View style={styles.modulCardFooterRow}>
                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => setSelectedDetailModulAjar(mod)}
                            style={styles.modulOpenRppBtn}
                          >
                            <MaterialCommunityIcons name="file-document-outline" size={14} color="#FFFFFF" />
                            <Text style={styles.modulOpenRppBtnText}>Buka RPP Digital</Text>
                          </TouchableOpacity>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </>
            )}
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB 5: NOTES (CATATAN PERKEMBANGAN & JURNAL SISWA)            */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {tab === 'notes' && !loading && (
          <View style={styles.tabContentBlock}>
            {/* Header: Title + Create Button */}
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleWithIcon}>
                <MaterialCommunityIcons name="notebook-edit" size={20} color="#059669" />
                <Text style={styles.sectionTitleText}>Catatan Evaluasi Santri</Text>
              </View>
              {canNote && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => openNote()}
                  style={styles.headerPrimaryCtaBtn}
                >
                  <MaterialCommunityIcons name="plus" size={16} color="#FFFFFF" />
                  <Text style={styles.headerPrimaryCtaText}>Catatan Baru</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Search Input Bar */}
            <View style={styles.searchBarContainer}>
              <MaterialCommunityIcons name="magnify" size={18} color="#059669" />
              <TextInput
                style={styles.searchInput}
                placeholder="Cari judul catatan / nama siswa..."
                placeholderTextColor="#94A3B8"
                value={noteSearch}
                onChangeText={setNoteSearch}
              />
              {Boolean(noteSearch) && (
                <TouchableOpacity onPress={() => setNoteSearch('')}>
                  <MaterialCommunityIcons name="close-circle" size={17} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            {/* Category Filter Chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.classChipsScroll}
            >
              {[
                { id: 'ALL', label: 'Semua Kategori' },
                { id: 'Akademik', label: 'Akademik' },
                { id: 'Karakter', label: 'Karakter / Akhlak' },
                { id: 'Kedisiplinan', label: 'Kedisiplinan' },
                { id: 'Tahfizh', label: 'Tahfizh' },
              ].map((c) => (
                <TouchableOpacity
                  key={`cat-${c.id}`}
                  onPress={() => setSelectedNoteCategory(c.id)}
                  style={[
                    styles.classChip,
                    selectedNoteCategory === c.id && styles.classChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.classChipText,
                      selectedNoteCategory === c.id && styles.classChipTextActive,
                    ]}
                  >
                    {c.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {filteredNotes.length === 0 ? (
              <EmptyStateCard
                icon="notebook-outline"
                title="Belum Ada Catatan Siswa"
                description={
                  noteSearch
                    ? 'Tidak ada catatan siswa yang sesuai dengan filter atau pencarian.'
                    : 'Belum ada catatan evaluasi santri yang dibuat. Tekan tombol "Catatan Baru" untuk mendokumentasikan perkembangan santri.'
                }
              />
            ) : (
              filteredNotes.map((n, idx) => {
                const sName = n.student?.full_name || n.student?.nama_lengkap || n.student_name || 'Santri';
                const sClass = n.student?.kelas?.nama_kelas || n.student?.kelas?.name || n.class_name || 'Rombel';
                const prio = (n.priority || 'medium').toLowerCase();

                let prioColor = '#0284C7';
                let prioBg = '#E0F2FE';
                let prioLabel = 'Normal';
                if (prio === 'urgent') {
                  prioColor = '#DC2626';
                  prioBg = '#FEE2E2';
                  prioLabel = 'Mendesak';
                } else if (prio === 'high') {
                  prioColor = '#EA580C';
                  prioBg = '#FFEDD5';
                  prioLabel = 'Tinggi';
                } else if (prio === 'low') {
                  prioColor = '#64748B';
                  prioBg = '#F1F5F9';
                  prioLabel = 'Rendah';
                }

                return (
                  <View key={`note-${n.id || idx}`} style={styles.modernNoteCard}>
                    <View style={styles.noteTopRow}>
                      <View style={styles.noteStudentIdentRow}>
                        <View style={styles.noteAvatarMiniBox}>
                          <MaterialCommunityIcons name="account" size={14} color="#059669" />
                        </View>
                        <Text numberOfLines={1} style={styles.noteStudentNameText}>{sName}</Text>
                        <Text style={styles.noteStudentClassText}>({sClass})</Text>
                      </View>

                      <View style={[styles.priorityPill, { backgroundColor: prioBg }]}>
                        <Text style={[styles.priorityPillText, { color: prioColor }]}>{prioLabel}</Text>
                      </View>
                    </View>

                    <Text style={styles.noteTitleText}>{n.title || 'Catatan Perkembangan'}</Text>

                    <View style={styles.noteQuoteBox}>
                      <Text style={styles.noteContentText}>{n.content || '-'}</Text>
                    </View>

                    <View style={styles.noteFooterRow}>
                      <View style={styles.noteCategoryTag}>
                        <MaterialCommunityIcons name="tag-outline" size={12} color="#059669" />
                        <Text style={styles.noteCategoryTagText}>{n.category || 'Akademik'}</Text>
                      </View>
                      <Text style={styles.noteDateText}>
                        {n.created_at ? new Date(n.created_at).toLocaleDateString('id-ID') : 'Hari ini'}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}
        </View>
      </Animated.ScrollView>

      {/* ── 0. STICKY COMPACT HEADER ON SCROLL (IDENTIK DENGAN HEADER DI BERANDA) ── */}
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.stickyHeaderBar,
          {
            paddingTop: insets.top + 4,
            opacity: stickyOpacity,
            transform: [{ translateY: stickyTranslateY }],
          },
        ]}
      >
        {/* Background: foto masjid + overlay + dekorasi, bawahnya dipotong 40px
            (sejajar batas atas deretan tombol / tengah card) sehingga card
            tampak melayang: background berakhir setinggi tombol. */}
        <View style={[StyleSheet.absoluteFill, { bottom: 40, overflow: 'hidden', pointerEvents: 'none' }]}>
          <Image
            source={HEADER_MOSQUE_BG}
            style={[StyleSheet.absoluteFill, styles.stickyMosqueBgImage]}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['rgba(8, 90, 56, 0.35)', 'rgba(10, 100, 65, 0.08)', 'rgba(52, 211, 153, 0.12)']}
            locations={[0, 0.45, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.stickyDecorCircle1} />
          <View style={styles.stickyDecorCircle2} />
        </View>

        {/* Baris Atas: Back + Title "Portal Guru" + Notifikasi + Avatar */}
        <View style={styles.stickyTopRow}>
          <View style={styles.stickyBrandGroup}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleBack}
              style={styles.stickySquircleBackBtn}
              accessibilityRole="button"
              accessibilityLabel="Kembali"
            >
              <MaterialCommunityIcons name="arrow-left" size={18} color="#059669" />
            </TouchableOpacity>
            <View style={styles.stickyBrandTextCol}>
              <Text style={styles.stickyBrandLabel}>Portal Guru</Text>
              <Text numberOfLines={1} style={styles.stickyBrandSub}>
                {teacherUnit}
              </Text>
            </View>
          </View>

          <View style={styles.stickyTopRightActions}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => nav?.navigate('Notifikasi')}
              style={styles.stickySquircleActionBtn}
              accessibilityLabel="Notifikasi"
            >
              <MaterialCommunityIcons name="bell-outline" size={18} color="#FFFFFF" />
              {unreadNotificationCount > 0 && <View style={styles.stickyBellBadgeDot} />}
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => nav?.navigate('Profil')}
              style={styles.stickyAvatarSquircleBtn}
              accessibilityLabel="Profil"
            >
              {teacherPhoto ? (
                <Image source={{ uri: teacherPhoto }} style={styles.stickyTopAvatarImg} resizeMode="cover" />
              ) : (
                <Image source={DEFAULT_PARENT_AVATAR} style={styles.stickyTopAvatarImg} resizeMode="cover" />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* ── RICH CARD: ukuran kompak persis ala sticky halaman utama ── */}
        <View style={{ marginHorizontal: 12, marginBottom: 0 }}>
          <LinearGradient
            colors={['#0D6B42', '#18A165', '#2BD988']}
            locations={[0, 0.55, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.teacherMainCard, { padding: 12, borderRadius: 18 }]}
          >
            <View style={styles.cardDecorCircle} />

            <View style={styles.stickyRichCardTopRow}>
              <TouchableOpacity
                activeOpacity={0.82}
                onPress={() => nav?.navigate('Profil')}
                style={styles.stickyRichAvatarWrap}
              >
                {teacherPhoto ? (
                  <Image
                    source={{ uri: teacherPhoto }}
                    style={styles.stickyRichAvatarImg}
                    resizeMode="cover"
                  />
                ) : (
                  <Image
                    source={DEFAULT_PARENT_AVATAR}
                    style={styles.stickyRichAvatarImg}
                    resizeMode="cover"
                  />
                )}
              </TouchableOpacity>

              <View style={styles.stickyRichInfoCol}>
                <Text numberOfLines={1} style={styles.stickyRichStudentName}>
                  {dashboard?.teacher?.jabatan || dashboard?.data?.teacher?.jabatan || teacherRoleTitle}
                </Text>

                <Text numberOfLines={1} style={styles.stickyRichNisText}>
                  ID/NIP: {teacherNip}
                </Text>

                <View style={styles.stickyRichUnitBadge}>
                  <MaterialCommunityIcons name="school" size={10} color="#FFFFFF" style={{ marginRight: 3 }} />
                  <Text numberOfLines={1} style={styles.stickyRichUnitText}>
                    {teacherUnit}
                  </Text>
                </View>

                <View style={styles.stickyRichMetaRow}>
                  <Text numberOfLines={1} style={styles.stickyRichMetaText}>
                    {teacherUnit}
                  </Text>
                  <Text style={styles.stickyRichMetaSep}> • </Text>
                  <View style={[styles.stickyRichPresensiDot, { backgroundColor: '#10B981', marginRight: 3 }]} />
                  <Text numberOfLines={1} style={[styles.stickyRichMetaText, { color: '#A7F3D0', fontSize: 9 }]}>
                    Aktif
                  </Text>
                </View>
              </View>

              <View style={styles.stickyRichMiniActions}>
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => nav?.navigate('Notifikasi')}
                  style={styles.stickyMiniBtn}
                  accessibilityLabel="Notifikasi"
                >
                  <MaterialCommunityIcons name="bell-ring-outline" size={16} color="#059669" />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => setTab('schedules')}
                  style={styles.stickyMiniBtn}
                  accessibilityLabel="Jadwal Mengajar"
                >
                  <MaterialCommunityIcons name="calendar-clock" size={16} color="#059669" />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => nav?.navigate('QR Code')}
                  style={styles.stickyMiniBtn}
                  accessibilityLabel="Scan / Tampilkan QR"
                >
                  <MaterialCommunityIcons name="qrcode-scan" size={16} color="#059669" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Quick Action Chips Sticky (persis ala halaman utama: Jadwal, Presensi, Menu) */}
            <View style={styles.stickyQuickChipRow}>
              <TouchableOpacity
                activeOpacity={0.78}
                onPress={() => setTab('schedules')}
                style={styles.stickyQuickChip}
              >
                <MaterialCommunityIcons name="calendar-month" size={11} color="#059669" />
                <Text style={styles.stickyQuickChipText}>Jadwal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.78}
                onPress={() => nav?.navigate('Absensi')}
                style={styles.stickyQuickChipSecondary}
              >
                <MaterialCommunityIcons name="clipboard-check-outline" size={11} color="#2563EB" />
                <Text style={styles.stickyQuickChipSecondaryText}>Presensi</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.78}
                onPress={() => setTab('overview')}
                style={styles.stickyQuickChipPrimary}
              >
                <MaterialCommunityIcons name="view-grid-outline" size={11} color="#7C3AED" />
                <Text style={styles.stickyQuickChipPrimaryText}>Menu</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </Animated.View>

      {/* ── MODAL FORM: BUAT CATATAN / MATERI ── */}
      <Modal
        visible={formVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setFormVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 20 }]}>
            {/* Modal Header */}
            <View style={styles.modalHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={styles.modalHeaderIconBox}>
                  <MaterialCommunityIcons
                    name={formType === 'note' ? 'notebook-edit-outline' : 'book-open-page-variant-outline'}
                    size={20}
                    color="#059669"
                  />
                </View>
                <View>
                  <Text style={styles.modalHeaderTitle}>
                    {formType === 'note'
                      ? 'Catatan Evaluasi Santri'
                      : editingMaterial
                      ? 'Ubah Bahan Ajar & Materi'
                      : 'Materi Pembelajaran Baru'}
                  </Text>
                  <Text style={styles.modalHeaderSub}>
                    {formType === 'note'
                      ? 'Dokumentasikan perkembangan dan capaian santri'
                      : editingMaterial
                      ? 'Perbarui rincian modul dan bahan ajar KBM'
                      : 'Terbitkan materi bahan ajar untuk siswa'}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => setFormVisible(false)}
                style={styles.modalCloseCircle}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {formType === 'note' ? (
                <>
                  {/* Kartu Target Santri: Nama Siswa, Avatar, dan Kelas (Tanpa Pemilih Santri Lagi) */}
                  <Text style={styles.inputFieldLabel}>Santri yang Dievaluasi</Text>
                  <View style={styles.targetStudentCard}>
                    <View style={styles.targetStudentAvatarWrap}>
                      <Image
                        source={noteAvatarSrc}
                        style={styles.targetStudentAvatarImg}
                        resizeMode="cover"
                      />
                      <View style={styles.targetStudentCheckBadge}>
                        <MaterialCommunityIcons name="check" size={10} color="#FFFFFF" />
                      </View>
                    </View>

                    <View style={styles.targetStudentInfoCol}>
                      <View style={styles.targetStudentTopRow}>
                        <View style={styles.targetStudentBadgePill}>
                          <MaterialCommunityIcons name="account-check-outline" size={11} color="#047857" />
                          <Text style={styles.targetStudentBadgeText}>TARGET EVALUASI</Text>
                        </View>
                        <Text style={styles.targetStudentGenderLabel}>
                          {noteIsGirl ? 'Santriwati (P)' : 'Santriwan (L)'}
                        </Text>
                      </View>

                      <Text numberOfLines={1} style={styles.targetStudentName}>
                        {noteStudentName}
                      </Text>

                      <View style={styles.targetStudentDetailRow}>
                        <View style={styles.targetStudentClassBadge}>
                          <MaterialCommunityIcons name="google-classroom" size={11} color="#047857" />
                          <Text style={styles.targetStudentClassText}>{noteStudentClass}</Text>
                        </View>
                        <Text style={styles.targetStudentDot}>•</Text>
                        <Text style={styles.targetStudentNisText}>
                          NIS: {noteStudentNis}{noteStudentNisn ? ` · NISN: ${noteStudentNisn}` : ''}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Kategori Catatan */}
                  <Text style={styles.inputFieldLabel}>Kategori Catatan</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.formSelectorScroll}
                  >
                    {['Akademik', 'Karakter / Akhlak', 'Kedisiplinan', 'Tahfizh', 'Umum'].map(
                      (cat) => {
                        const isSel = form.category === cat;
                        return (
                          <TouchableOpacity
                            key={`cat-pill-${cat}`}
                            onPress={() => setField('category', cat)}
                            style={[styles.formSelectPill, isSel && styles.formSelectPillActive]}
                          >
                            <Text
                              style={[
                                styles.formSelectPillText,
                                isSel && styles.formSelectPillTextActive,
                              ]}
                            >
                              {cat}
                            </Text>
                          </TouchableOpacity>
                        );
                      }
                    )}
                  </ScrollView>

                  {/* Judul Catatan */}
                  <Text style={styles.inputFieldLabel}>Judul Evaluasi</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="Contoh: Peningkatan Hafalan Juz 30 / Disiplin Shalat"
                    placeholderTextColor="#94A3B8"
                    value={form.title || ''}
                    onChangeText={(val) => setField('title', val)}
                  />

                  {/* Isi Catatan */}
                  <Text style={styles.inputFieldLabel}>Isi Catatan / Catatan Tindak Lanjut</Text>
                  <TextInput
                    style={[styles.formInput, styles.formTextArea]}
                    placeholder="Tuliskan catatan perkembangan dan saran pendidik..."
                    placeholderTextColor="#94A3B8"
                    value={form.content || ''}
                    onChangeText={(val) => setField('content', val)}
                    multiline
                    numberOfLines={4}
                  />

                  {/* Prioritas Catatan */}
                  <Text style={styles.inputFieldLabel}>Tingkat Urgensi / Prioritas</Text>
                  <View style={styles.prioritySelectorRow}>
                    {[
                      { key: 'low', label: 'Rendah' },
                      { key: 'medium', label: 'Normal' },
                      { key: 'high', label: 'Tinggi' },
                      { key: 'urgent', label: 'Mendesak' },
                    ].map((p) => {
                      const isSel = form.priority === p.key;
                      return (
                        <TouchableOpacity
                          key={`prio-sel-${p.key}`}
                          onPress={() => setField('priority', p.key)}
                          style={[styles.priorityPillBtn, isSel && styles.priorityPillBtnActive]}
                        >
                          <Text
                            style={[
                              styles.priorityPillBtnText,
                              isSel && styles.priorityPillBtnTextActive,
                            ]}
                          >
                            {p.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              ) : (
                <>
                  {/* Judul Materi */}
                  <Text style={styles.inputFieldLabel}>Judul Bahan Ajar / Modul</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="Contoh: Bab 3 - Fiqih Thaharah dan Shalat Jamaah"
                    placeholderTextColor="#94A3B8"
                    value={form.judul || ''}
                    onChangeText={(val) => setField('judul', val)}
                  />

                  {/* Pilih Rombel / Kelas */}
                  <Text style={styles.inputFieldLabel}>Pilih Rombel / Kelas Target</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.formSelectorScroll}
                  >
                    {uniqueMaterialClasses.map((c) => {
                      const isSel = form.class_id === c.id;
                      return (
                        <TouchableOpacity
                          key={`fcls-${c.id}`}
                          onPress={() => setField('class_id', c.id)}
                          style={[styles.formSelectPill, isSel && styles.formSelectPillActive]}
                        >
                          <Text
                            style={[
                              styles.formSelectPillText,
                              isSel && styles.formSelectPillTextActive,
                            ]}
                          >
                            {c.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {/* Pilih Mata Pelajaran */}
                  <Text style={styles.inputFieldLabel}>Pilih Mata Pelajaran</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.formSelectorScroll}
                  >
                    {uniqueMaterialSubjects.map((s) => {
                      const isSel = form.subject_id === s.id;
                      return (
                        <TouchableOpacity
                          key={`fsub-${s.id}`}
                          onPress={() => setField('subject_id', s.id)}
                          style={[styles.formSelectPill, isSel && styles.formSelectPillActive]}
                        >
                          <Text
                            style={[
                              styles.formSelectPillText,
                              isSel && styles.formSelectPillTextActive,
                            ]}
                          >
                            {s.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {/* Ringkasan */}
                  <Text style={styles.inputFieldLabel}>Ringkasan Singkat</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="Ringkasan poin utama bahan ajar..."
                    placeholderTextColor="#94A3B8"
                    value={form.ringkasan || ''}
                    onChangeText={(val) => setField('ringkasan', val)}
                  />

                  {/* Isi Materi Lengkap */}
                  <Text style={styles.inputFieldLabel}>Uraian Materi / Penjelasan Pembelajaran</Text>
                  <TextInput
                    style={[styles.formInput, styles.formTextArea]}
                    placeholder="Ketikkan teks materi atau instruksi bacaan..."
                    placeholderTextColor="#94A3B8"
                    value={form.isi || ''}
                    onChangeText={(val) => setField('isi', val)}
                    multiline
                    numberOfLines={5}
                  />

                  {/* Status Publikasi */}
                  <Text style={styles.inputFieldLabel}>Status Publikasi</Text>
                  <View style={styles.prioritySelectorRow}>
                    {[
                      { key: 'published', label: 'Langsung Terbitkan (Published)' },
                      { key: 'draft', label: 'Simpan Sebagai Draft' },
                    ].map((st) => {
                      const isSel = form.status === st.key;
                      return (
                        <TouchableOpacity
                          key={`status-sel-${st.key}`}
                          onPress={() => setField('status', st.key)}
                          style={[styles.priorityPillBtn, isSel && styles.priorityPillBtnActive]}
                        >
                          <Text
                            style={[
                              styles.priorityPillBtnText,
                              isSel && styles.priorityPillBtnTextActive,
                            ]}
                          >
                            {st.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              {Boolean(formError) && (
                <View style={styles.formErrorBox}>
                  <MaterialCommunityIcons name="alert-circle" size={15} color="#DC2626" />
                  <Text style={styles.formErrorText}>{formError}</Text>
                </View>
              )}

              <View style={styles.modalActionButtonsRow}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  disabled={saving}
                  onPress={() => setFormVisible(false)}
                  style={styles.modalCancelBtn}
                >
                  <Text style={styles.modalCancelBtnText}>Batal</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  disabled={saving}
                  onPress={() => void saveForm()}
                  style={styles.modalSubmitBtn}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="content-save-check" size={17} color="#FFFFFF" />
                      <Text style={styles.modalSubmitBtnText}>
                        {formType === 'material' && editingMaterial ? 'Perbarui Materi' : 'Simpan Data'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── MODAL KONFIRMASI HAPUS BAHAN AJAR ── */}
      <Modal
        visible={deleteConfirmMaterial !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteConfirmMaterial(null)}
      >
        <View style={styles.deleteModalOverlay}>
          <View style={styles.deleteModalCard}>
            {/* Top Accent Gradient Bar */}
            <LinearGradient
              colors={['#F43F5E', '#E11D48', '#BE123C']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.deleteModalTopBar}
            />

            <View style={styles.deleteModalBody}>
              {/* Squircle 3D Icon Badge */}
              <View style={styles.deleteModalIconBox}>
                <MaterialCommunityIcons name="trash-can-outline" size={28} color="#E11D48" />
              </View>

              {/* Status Hazard Pill Badge */}
              <View style={styles.deleteHazardPill}>
                <MaterialCommunityIcons name="alert-circle-outline" size={13} color="#E11D48" />
                <Text style={styles.deleteHazardPillText}>HAPUS PERMANEN</Text>
              </View>

              <Text style={styles.deleteModalTitle}>Hapus Bahan Ajar?</Text>
              <Text style={styles.deleteModalSub}>
                Bahan ajar akan dihapus secara permanen dari sistem pembelajaran.
              </Text>

              {/* Target Entity Summary Card */}
              {deleteConfirmMaterial && (
                <View style={styles.deleteTargetSummaryBox}>
                  <Text numberOfLines={2} style={styles.deleteTargetTitle}>
                    {deleteConfirmMaterial.judul || deleteConfirmMaterial.title || 'Bahan Ajar'}
                  </Text>
                  <View style={styles.deleteTargetBadgesRow}>
                    <View style={styles.deleteTargetChip}>
                      <MaterialCommunityIcons name="book-open-variant" size={11} color="#0284C7" />
                      <Text numberOfLines={1} style={[styles.deleteTargetChipText, { color: '#0369A1' }]}>
                        {deleteConfirmMaterial.subject?.name ||
                          deleteConfirmMaterial.subject?.nama_mapel ||
                          'Mata Pelajaran'}
                      </Text>
                    </View>
                    <View style={styles.deleteTargetChip}>
                      <MaterialCommunityIcons name="google-classroom" size={11} color="#475569" />
                      <Text numberOfLines={1} style={styles.deleteTargetChipText}>
                        {deleteConfirmMaterial.kelas?.nama_kelas ||
                          deleteConfirmMaterial.class_name ||
                          'Rombel Belajar'}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Warning Notice Box */}
              <View style={styles.deleteWarningNoticeBox}>
                <MaterialCommunityIcons name="information-outline" size={16} color="#E11D48" style={{ marginTop: 1 }} />
                <Text style={styles.deleteWarningNoticeText}>
                  Perhatian: Tindakan ini permanen. Seluruh materi dan lampiran berkas tidak dapat dipulihkan.
                </Text>
              </View>

              <View style={styles.deleteModalButtonsRow}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  disabled={deletingMaterial}
                  onPress={() => setDeleteConfirmMaterial(null)}
                  style={styles.deleteModalCancelBtn}
                >
                  <Text style={styles.deleteModalCancelBtnText}>Batal</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  disabled={deletingMaterial}
                  onPress={() => void handleConfirmDeleteMaterial()}
                  style={styles.deleteModalConfirmBtn}
                >
                  {deletingMaterial ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="trash-can-outline" size={16} color="#FFFFFF" />
                      <Text style={styles.deleteModalConfirmBtnText}>Ya, Hapus</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL DETAIL LENGKAP BAHAN AJAR ── */}
      <Modal
        visible={selectedDetailMaterial !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedDetailMaterial(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { maxHeight: '90%', paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <View style={styles.modalHeaderIconBox}>
                  <MaterialCommunityIcons name="book-open-page-variant" size={20} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={styles.modalHeaderTitle}>
                    {selectedDetailMaterial?.judul || selectedDetailMaterial?.title || 'Detail Bahan Ajar'}
                  </Text>
                  <Text numberOfLines={1} style={styles.modalHeaderSub}>
                    {selectedDetailMaterial?.subject?.name || selectedDetailMaterial?.subject?.nama_mapel || 'Mata Pelajaran'} · {selectedDetailMaterial?.kelas?.nama_kelas || selectedDetailMaterial?.kelas?.name || 'Rombel'}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => setSelectedDetailMaterial(null)}
                style={styles.modalCloseCircle}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.detailModalScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Status & Identitas Bar */}
              <View style={styles.detailStatusRow}>
                <View
                  style={[
                    styles.materialStatusPill,
                    (selectedDetailMaterial?.status || (selectedDetailMaterial?.is_published ? 'published' : 'draft')).toLowerCase() === 'published'
                      ? styles.statusPublished
                      : styles.statusDraft,
                  ]}
                >
                  <MaterialCommunityIcons
                    name={
                      (selectedDetailMaterial?.status || (selectedDetailMaterial?.is_published ? 'published' : 'draft')).toLowerCase() === 'published'
                        ? 'check-circle'
                        : 'file-document-edit'
                    }
                    size={13}
                    color={
                      (selectedDetailMaterial?.status || (selectedDetailMaterial?.is_published ? 'published' : 'draft')).toLowerCase() === 'published'
                        ? '#047857'
                        : '#D97706'
                    }
                  />
                  <Text
                    style={[
                      styles.materialStatusPillText,
                      {
                        color:
                          (selectedDetailMaterial?.status || (selectedDetailMaterial?.is_published ? 'published' : 'draft')).toLowerCase() === 'published'
                            ? '#047857'
                            : '#B45309',
                      },
                    ]}
                  >
                    {(selectedDetailMaterial?.status || (selectedDetailMaterial?.is_published ? 'published' : 'draft')).toLowerCase() === 'published'
                      ? 'Dipublikasikan'
                      : 'Draft / Belum Rilis'}
                  </Text>
                </View>

                <View style={styles.detailDateBadge}>
                  <MaterialCommunityIcons name="calendar-clock" size={13} color="#64748B" />
                  <Text style={styles.detailDateText}>
                    {selectedDetailMaterial?.created_at
                      ? new Date(selectedDetailMaterial.created_at).toLocaleDateString('id-ID', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })
                      : 'Aktif'}
                  </Text>
                </View>
              </View>

              {/* Ringkasan Box */}
              {Boolean(selectedDetailMaterial?.ringkasan) && (
                <View style={styles.detailSummaryBox}>
                  <View style={styles.detailSectionHeadingRow}>
                    <MaterialCommunityIcons name="text-box-search-outline" size={15} color="#059669" />
                    <Text style={styles.detailSectionHeadingText}>Ringkasan Materi</Text>
                  </View>
                  <Text style={styles.detailSummaryContent}>
                    {selectedDetailMaterial.ringkasan}
                  </Text>
                </View>
              )}

              {/* Isi Materi Lengkap */}
              <View style={styles.detailMainContentBox}>
                <View style={styles.detailSectionHeadingRow}>
                  <MaterialCommunityIcons name="file-document-outline" size={15} color="#059669" />
                  <Text style={styles.detailSectionHeadingText}>Uraian Materi Pembelajaran</Text>
                </View>
                <Text style={styles.detailMainContentText}>
                  {selectedDetailMaterial?.isi ||
                    selectedDetailMaterial?.ringkasan ||
                    'Tidak ada konten teks tambahan pada materi ini.'}
                </Text>
              </View>

              {/* Footer Actions */}
              <View style={styles.detailModalFooter}>
                {canEditMaterial && (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      const mat = selectedDetailMaterial;
                      setSelectedDetailMaterial(null);
                      openEditMaterial(mat);
                    }}
                    style={styles.detailEditActionBtn}
                  >
                    <MaterialCommunityIcons name="pencil-outline" size={15} color="#FFFFFF" />
                    <Text style={styles.detailEditActionBtnText}>Ubah Materi</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setSelectedDetailMaterial(null)}
                  style={styles.detailCloseBtn}
                >
                  <Text style={styles.detailCloseBtnText}>Tutup</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── MODAL DETAIL MODUL AJAR (RPP KURIKULUM MERDEKA) ── */}
      <Modal
        visible={selectedDetailModulAjar !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedDetailModulAjar(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { maxHeight: '92%', paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <View style={[styles.modalHeaderIconBox, { backgroundColor: '#F0FDF4' }]}>
                  <MaterialCommunityIcons name="file-certificate-outline" size={20} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={styles.modalHeaderTitle}>
                    {selectedDetailModulAjar?.judul_modul || selectedDetailModulAjar?.judul || 'Modul Ajar RPP'}
                  </Text>
                  <Text numberOfLines={1} style={styles.modalHeaderSub}>
                    Kode: {selectedDetailModulAjar?.kode_modul || '-'} · Kurikulum Merdeka
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => setSelectedDetailModulAjar(null)}
                style={styles.modalCloseCircle}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.detailModalScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* 1. Grid Informasi Identitas RPP */}
              <View style={styles.rppIdentGrid}>
                <View style={styles.rppIdentItem}>
                  <Text style={styles.rppIdentLabel}>MATA PELAJARAN</Text>
                  <Text style={styles.rppIdentVal}>
                    {selectedDetailModulAjar?.subject?.name || selectedDetailModulAjar?.subject?.nama_mapel || '-'}
                  </Text>
                </View>

                <View style={styles.rppIdentItem}>
                  <Text style={styles.rppIdentLabel}>KELAS & FASE</Text>
                  <Text style={styles.rppIdentVal}>
                    {selectedDetailModulAjar?.kelas?.nama_kelas || selectedDetailModulAjar?.kelas?.name || '-'} (Fase {selectedDetailModulAjar?.fase || 'A'})
                  </Text>
                </View>

                <View style={styles.rppIdentItem}>
                  <Text style={styles.rppIdentLabel}>SEMESTER & ALOKASI</Text>
                  <Text style={styles.rppIdentVal}>
                    Semester {selectedDetailModulAjar?.semester || '1'} · {selectedDetailModulAjar?.alokasi_waktu_jp || selectedDetailModulAjar?.alokasi_jam || '2'} JP
                  </Text>
                </View>

                <View style={styles.rppIdentItem}>
                  <Text style={styles.rppIdentLabel}>GURU PENGAMPU</Text>
                  <Text style={styles.rppIdentVal}>
                    {selectedDetailModulAjar?.guru?.nama_lengkap || selectedDetailModulAjar?.guru?.name || teacherName}
                  </Text>
                </View>
              </View>

              {/* 2. Capaian & Tujuan Pembelajaran (CP / TP) */}
              <View style={styles.rppSectionBox}>
                <View style={styles.rppSectionHead}>
                  <MaterialCommunityIcons name="bullseye-arrow" size={16} color="#059669" />
                  <Text style={styles.rppSectionTitle}>Capaian & Tujuan Pembelajaran</Text>
                </View>
                {Boolean(selectedDetailModulAjar?.capaian_pembelajaran?.nama_cp) && (
                  <View style={styles.rppSubBlock}>
                    <Text style={styles.rppSubLabel}>Capaian Pembelajaran (CP):</Text>
                    <Text style={styles.rppSubContent}>
                      {selectedDetailModulAjar.capaian_pembelajaran.nama_cp}
                    </Text>
                  </View>
                )}
                <View style={styles.rppSubBlock}>
                  <Text style={styles.rppSubLabel}>Tujuan Pembelajaran (TP):</Text>
                  <Text style={styles.rppSubContent}>
                    {selectedDetailModulAjar?.tujuan_pembelajaran ||
                      selectedDetailModulAjar?.tujuan_pembelajaran_detail?.nama_tp ||
                      'Menguasai kompetensi dasar materi secara komprehensif dan aplikatif.'}
                  </Text>
                </View>
              </View>

              {/* 3. Profil Pelajar Pancasila & Model Pembelajaran */}
              <View style={styles.rppSectionBox}>
                <View style={styles.rppSectionHead}>
                  <MaterialCommunityIcons name="star-shooting" size={16} color="#7C3AED" />
                  <Text style={[styles.rppSectionTitle, { color: '#7C3AED' }]}>
                    Profil Pelajar Pancasila & Model
                  </Text>
                </View>
                <View style={styles.rppSubBlock}>
                  <Text style={styles.rppSubLabel}>Dimensi Profil Pelajar Pancasila (P3):</Text>
                  <Text style={styles.rppSubContent}>
                    {selectedDetailModulAjar?.profil_pelajar_pancasila ||
                      'Beriman, Bertakwa kepada Tuhan YME, Berakhlak Mulia, Mandiri, dan Bernalar Kritis.'}
                  </Text>
                </View>
                <View style={styles.rppSubBlock}>
                  <Text style={styles.rppSubLabel}>Model & Metode Pembelajaran:</Text>
                  <Text style={styles.rppSubContent}>
                    Model: {selectedDetailModulAjar?.model_pembelajaran || 'Problem Based Learning (PBL)'}
                    {'\n'}Metode: {selectedDetailModulAjar?.metode_pembelajaran || 'Diskusi, Ceramah Interaktif, Praktik Langsung'}
                  </Text>
                </View>
              </View>

              {/* 4. Langkah-Langkah Pembelajaran KBM */}
              <View style={styles.rppSectionBox}>
                <View style={styles.rppSectionHead}>
                  <MaterialCommunityIcons name="format-list-checks" size={16} color="#2563EB" />
                  <Text style={[styles.rppSectionTitle, { color: '#2563EB' }]}>
                    Langkah-Langkah Pembelajaran KBM
                  </Text>
                </View>

                <View style={styles.kbmStepCard}>
                  <Text style={styles.kbmStepTitle}>1. Kegiatan Pendahuluan (10 Menit)</Text>
                  <Text style={styles.kbmStepContent}>
                    {selectedDetailModulAjar?.kegiatan_pendahuluan ||
                      'Guru membuka pembelajaran dengan salam, doa bersama, presensi santri, apersepsi mengaitkan materi sebelumnya, dan penyampaian tujuan pembelajaran.'}
                  </Text>
                </View>

                <View style={styles.kbmStepCard}>
                  <Text style={styles.kbmStepTitle}>2. Kegiatan Inti (60 Menit)</Text>
                  <Text style={styles.kbmStepContent}>
                    {selectedDetailModulAjar?.kegiatan_inti ||
                      'Santri mengamati materi, berdiskusi kelompok interaktif, memecahkan lembar aktivitas KBM, dan mempresentasikan hasil pemahaman di hadapan kelas.'}
                  </Text>
                </View>

                <View style={styles.kbmStepCard}>
                  <Text style={styles.kbmStepTitle}>3. Kegiatan Penutup (10 Menit)</Text>
                  <Text style={styles.kbmStepContent}>
                    {selectedDetailModulAjar?.kegiatan_penutup ||
                      'Guru bersama santri menyimpulkan intisari pembelajaran, refleksi materi, pemberian tugas penguatan, dan penutupan dengan doa kafaratul majlis.'}
                  </Text>
                </View>
              </View>

              {/* 5. Asesmen & Penilaian */}
              <View style={styles.rppSectionBox}>
                <View style={styles.rppSectionHead}>
                  <MaterialCommunityIcons name="clipboard-check-outline" size={16} color="#D97706" />
                  <Text style={[styles.rppSectionTitle, { color: '#D97706' }]}>
                    Rencana Asesmen & Penilaian
                  </Text>
                </View>

                <View style={styles.rppSubBlock}>
                  <Text style={styles.rppSubLabel}>Asesmen Formatif (Awal & Proses):</Text>
                  <Text style={styles.rppSubContent}>
                    {selectedDetailModulAjar?.asesmen_awal || selectedDetailModulAjar?.asesmen_proses ||
                      'Observasi keaktifan diskusi, tanya jawab lisan, dan penilaian sikap adab thalabul ilmi.'}
                  </Text>
                </View>

                <View style={styles.rppSubBlock}>
                  <Text style={styles.rppSubLabel}>Asesmen Sumatif (Akhir):</Text>
                  <Text style={styles.rppSubContent}>
                    {selectedDetailModulAjar?.asesmen_akhir || selectedDetailModulAjar?.rencana_penilaian ||
                      'Uji pemahaman kompetensi materi (Tes CBT / Tertulis & Unjuk Kerja Praktik).'}
                  </Text>
                </View>
              </View>

              {/* Tombol Tutup */}
              <View style={styles.detailModalFooter}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setSelectedDetailModulAjar(null)}
                  style={[styles.detailCloseBtn, { flex: 1 }]}
                >
                  <Text style={styles.detailCloseBtnText}>Tutup RPP</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Feedback Toast / Modal */}
      {feedbackModal && (
        <AppFeedbackModal
          visible={feedbackModal.visible}
          type={feedbackModal.type}
          title={feedbackModal.title}
          message={feedbackModal.message}
          confirmText={feedbackModal.confirmText}
          cancelText={feedbackModal.cancelText}
          onConfirm={feedbackModal.onConfirm}
          onClose={() => setFeedbackModal(null)}
        />
      )}
    </View>
  );
}

// ── SUB-COMPONENT: MODERN SCHEDULE CARD ──
function ModernScheduleCard({
  item,
  isActive,
  onOpenPresensi,
  onOpenMateri,
}: {
  item: any;
  isActive: boolean;
  onOpenPresensi: () => void;
  onOpenMateri: () => void;
}) {
  const mapelName = item.subject?.name || item.subject?.nama_mapel || item.subject_name || 'Mata Pelajaran';
  const className = item.kelas?.nama_kelas || item.kelas?.name || item.class_name || 'Rombel Belajar';
  const roomName = item.metadata?.room || item.kelas?.ruangan || 'Ruang KBM';
  const startTime = item.time_start || item.start_time ? String(item.time_start || item.start_time).substring(0, 5) : '08:00';
  const endTime = item.time_end || item.end_time ? String(item.time_end || item.end_time).substring(0, 5) : '09:30';

  return (
    <View style={[styles.scheduleCardOuter, isActive && styles.scheduleCardOuterActive]}>
      <View style={styles.scheduleCardHeaderRow}>
        <View style={[styles.scheduleTimeBox, isActive && styles.scheduleTimeBoxActive]}>
          <MaterialCommunityIcons
            name="clock-time-four-outline"
            size={13}
            color={isActive ? '#FFFFFF' : '#059669'}
          />
          <Text style={[styles.scheduleTimeText, isActive && styles.scheduleTimeTextActive]}>
            {startTime} - {endTime} WIB
          </Text>
        </View>

        {isActive ? (
          <View style={styles.scheduleLiveBadge}>
            <View style={styles.liveRedDot} />
            <Text style={styles.scheduleLiveBadgeText}>SEDANG BERLANGSUNG</Text>
          </View>
        ) : (
          <View style={styles.scheduleRoomPill}>
            <MaterialCommunityIcons name="door-open" size={12} color="#64748B" />
            <Text style={styles.scheduleRoomText}>{roomName}</Text>
          </View>
        )}
      </View>

      <Text style={styles.scheduleSubjectTitle}>{mapelName}</Text>

      <View style={styles.scheduleClassRow}>
        <MaterialCommunityIcons name="google-classroom" size={14} color="#059669" />
        <Text style={styles.scheduleClassName}>{className}</Text>
        <Text style={styles.scheduleClassDot}>·</Text>
        <Text style={styles.scheduleTeacherNip}>
          {item.hari || 'KBM Reguler'}
        </Text>
      </View>

      <View style={styles.scheduleActionsRow}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onOpenPresensi}
          style={[styles.scheduleActionBtn, styles.scheduleActionBtnPrimary]}
        >
          <MaterialCommunityIcons name="clipboard-check" size={15} color="#FFFFFF" />
          <Text style={styles.scheduleActionBtnPrimaryText}>Mulai Presensi KBM</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onOpenMateri}
          style={[styles.scheduleActionBtn, styles.scheduleActionBtnSecondary]}
        >
          <MaterialCommunityIcons name="book-open-outline" size={15} color="#059669" />
          <Text style={styles.scheduleActionBtnSecondaryText}>Bahan Ajar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── STYLES ──
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F0FDF4',
  },
  mainScrollContent: {
    paddingBottom: 24,
  },
  content: {
    padding: 16,
  },

  // ── Full Bleed Hero Container Guru (Seamless Edge-to-Edge) ──
  heroFullBleedWrapper: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    paddingBottom: 20,
    shadowColor: '#064E3B',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  heroDecorCircle1: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  heroDecorCircle2: {
    position: 'absolute',
    bottom: -30,
    left: -20,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  heroDecorCircle3: {
    position: 'absolute',
    top: 50,
    left: '38%',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(52, 211, 153, 0.07)',
  },
  staticTopBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    width: '100%',
  },
  heroSquircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    position: 'relative',
  },
  heroTopActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroLogoutBtn: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  heroBellDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  heroTitleCenterCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  heroModuleTitle: {
    fontSize: 16.5,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  heroModuleSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#D1FAE5',
    marginTop: 1,
  },

  // ── Inner Hero Content (Teacher Card Section) ──
  heroTeacherCardInner: {
    paddingHorizontal: 16,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarBox: {
    width: 58,
    height: 58,
    borderRadius: 20,
    borderWidth: 2.5,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    overflow: 'hidden',
    backgroundColor: '#DEF7EC',
    position: 'relative',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarOnlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#34D399',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  infoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  roleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  rolePillText: {
    color: '#064E3B',
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  fullNameText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '900',
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  nipText: {
    color: '#A7F3D0',
    fontSize: 10.5,
    fontWeight: '600',
    marginTop: 1,
  },
  unitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  unitText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  cardHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3,
  },
  attributesGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 13,
    marginBottom: 12,
  },
  attrBox: {
    flex: 1,
    backgroundColor: 'rgba(2, 44, 34, 0.42)',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  attrLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  attrLabelText: {
    color: '#A7F3D0',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  attrValueText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 2,
  },
  bottomActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    paddingVertical: 8.5,
    paddingHorizontal: 4,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  bottomActionBtnPrimary: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  bottomActionText: {
    color: '#064E3B',
    fontSize: 10.5,
    fontWeight: '800',
  },
  bottomActionTextPrimary: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '800',
  },

  // ── Badan Halaman Konten ──
  bodyContentWrapper: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },

  // ── Sticky Compact Header on Scroll (Sesuai Standar Beranda) ──
  stickyHeaderBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    overflow: 'hidden',
    shadowColor: '#003822',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 25,
  },
  stickyMosqueBgImage: {
    height: '150%',
    transform: [{ translateY: -40 }],
  },
  stickyDecorCircle1: {
    position: 'absolute',
    top: -30,
    right: -50,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    pointerEvents: 'none',
  },
  stickyDecorCircle2: {
    position: 'absolute',
    bottom: -20,
    left: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    pointerEvents: 'none',
  },
  stickyTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 10,
  },
  stickyBrandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  stickySquircleBackBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  stickyBrandTextCol: {
    marginLeft: 8,
    flex: 1,
  },
  stickyBrandLabel: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.4,
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  stickyBrandSub: {
    fontSize: 10,
    fontWeight: '600',
    color: '#A7F3D0',
    marginTop: 0.5,
    letterSpacing: 0.1,
  },
  stickyTopRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stickySquircleActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  stickyBellBadgeDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#064E3B',
  },
  stickyAvatarSquircleBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  stickyTopAvatarImg: {
    width: '100%',
    height: '100%',
  },
  teacherMainCard: {
    borderRadius: 22,
    paddingHorizontal: 15,
    paddingTop: 14,
    paddingBottom: 13,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.38)',
    position: 'relative',
    overflow: 'hidden',
  },
  cardDecorCircle: {
    position: 'absolute',
    right: -24,
    top: -24,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  stickyRichCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  stickyRichAvatarWrap: {
    width: 46,
    height: 46,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  stickyRichAvatarImg: {
    width: '100%',
    height: '100%',
  },
  stickyRichInfoCol: {
    flex: 1,
    marginLeft: 10,
  },
  stickyRichStudentName: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  stickyRichTeacherName: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  stickyRichNisText: {
    fontSize: 9.5,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 1,
  },
  stickyRichUnitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
    alignSelf: 'flex-start',
    marginTop: 2,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  stickyRichUnitText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  stickyRichMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  stickyRichMetaText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  stickyRichMetaSep: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  stickyRichPresensiDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginLeft: 4,
  },
  stickyRichMiniActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
  },
  stickyMiniBtn: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: 'rgba(5, 150, 105, 0.32)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  stickyQuickChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  stickyQuickChip: {
    flex: 1.1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6.5,
    paddingHorizontal: 4,
    borderRadius: 11,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: 'rgba(5, 150, 105, 0.32)',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3,
  },
  stickyQuickChipText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.1,
  },
  stickyQuickChipSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6.5,
    paddingHorizontal: 4,
    borderRadius: 11,
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: 'rgba(37, 99, 235, 0.32)',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3,
  },
  stickyQuickChipSecondaryText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#2563EB',
    letterSpacing: 0.1,
  },
  stickyQuickChipPrimary: {
    flex: 0.85,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6.5,
    paddingHorizontal: 4,
    borderRadius: 11,
    backgroundColor: '#F5F3FF',
    borderWidth: 1.5,
    borderColor: 'rgba(124, 58, 237, 0.32)',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3,
  },
  stickyQuickChipPrimaryText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#7C3AED',
    letterSpacing: 0.1,
  },

  // ── Menu Modul Guru (Button Menu Grid) ──
  menuGridSection: {
    marginBottom: 18,
  },
  menuGridHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 12,
  },
  menuGridHeaderIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuGridHeaderTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  menuGridHeaderSub: {
    fontSize: 10.5,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 1,
  },
  menuActiveTagPill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  menuActiveTagText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.3,
  },
  menuButtonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  menuBtnCard: {
    width: (SCREEN_WIDTH - 32 - 10) / 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 12,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  menuBtnCardActive: {
    backgroundColor: '#FFFFFF',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 4,
  },
  menuBtnActiveBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3.5,
  },
  menuBtnCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  menuBtnIconSquare: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBtnRightBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  menuBtnCountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  menuBtnCountText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  menuBtnActiveDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBtnInactiveInnerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
  },
  menuBtnTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  menuBtnSubtitle: {
    fontSize: 10,
    fontWeight: '500',
    color: '#64748B',
  },
  menuBtnCardFull: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 12,
    marginTop: 10,
    gap: 12,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  // Error Card
  errorNoticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 8,
  },
  errorNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#B91C1C',
    fontWeight: '600',
  },
  errorRetryBtn: {
    backgroundColor: '#DC2626',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  errorRetryBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Loading
  loadingWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  loadingLabel: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
  },

  // Tab Blocks
  tabContentBlock: {
    marginTop: 4,
  },

  // KPI Summary Buttons Grid
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  kpiCardItem: {
    width: (SCREEN_WIDTH - 42) / 2,
    borderRadius: 18,
    padding: 13,
    borderWidth: 1.5,
    minHeight: 116,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  kpiCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kpiIconSquare: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  kpiMiniActionPill: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.9,
  },
  kpiCardValue: {
    fontSize: 24,
    fontWeight: '900',
    marginTop: 6,
  },
  kpiCardLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 2,
  },
  kpiCardSub: {
    fontSize: 10.5,
    fontWeight: '600',
    marginTop: 1,
    opacity: 0.9,
  },

  // Section Headers
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 10,
  },
  sectionTitleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitleText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  sectionSubtitleText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
    fontWeight: '500',
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  countBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
  },

  // Quick Action Grid (Ruang Kerja Cepat Bergaya Warna)
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  quickCardItem: {
    width: (SCREEN_WIDTH - 42) / 2,
    borderRadius: 18,
    padding: 12,
    borderWidth: 1.5,
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  quickCardIconBox: {
    width: 42,
    height: 42,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickCardTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  quickCardSub: {
    fontSize: 10,
    color: '#475569',
    marginTop: 2,
    fontWeight: '500',
  },

  // Schedule Cards
  scheduleCardOuter: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1.5,
  },
  scheduleCardOuterActive: {
    borderColor: '#059669',
    backgroundColor: '#F0FDF4',
    borderWidth: 2,
  },
  scheduleCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  scheduleTimeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 9,
    gap: 5,
  },
  scheduleTimeBoxActive: {
    backgroundColor: '#059669',
  },
  scheduleTimeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
  },
  scheduleTimeTextActive: {
    color: '#FFFFFF',
  },
  scheduleLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 5,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  liveRedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },
  scheduleLiveBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#DC2626',
  },
  scheduleRoomPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 7,
    gap: 4,
  },
  scheduleRoomText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  scheduleSubjectTitle: {
    fontSize: 15.5,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 4,
  },
  scheduleClassRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 12,
  },
  scheduleClassName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  scheduleClassDot: {
    fontSize: 12,
    color: '#94A3B8',
  },
  scheduleTeacherNip: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '500',
  },
  scheduleActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  scheduleActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 11,
    gap: 5,
  },
  scheduleActionBtnPrimary: {
    backgroundColor: '#059669',
  },
  scheduleActionBtnPrimaryText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  scheduleActionBtnSecondary: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  scheduleActionBtnSecondaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#047857',
  },

  // Search Bar
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    padding: 0,
  },

  // Class Chips Scroll
  classChipsScroll: {
    flexDirection: 'row',
    gap: 6,
    paddingBottom: 10,
  },
  classChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  classChipActive: {
    backgroundColor: '#059669',
    borderColor: '#047857',
  },
  classChipText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#475569',
  },
  classChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  // Student Card
  modernStudentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 13,
    marginBottom: 11,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  studentCardMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  studentCardAvatarWrap: {
    position: 'relative',
  },
  studentCardAvatarImg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#ECFDF5',
  },
  studentGenderBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 17,
    height: 17,
    borderRadius: 8.5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  studentGenderBadgeBoy: {
    backgroundColor: '#2563EB',
  },
  studentGenderBadgeGirl: {
    backgroundColor: '#EC4899',
  },
  studentCardInfoCol: {
    flex: 1,
  },
  studentCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  studentIndexPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  studentIndexText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
  },
  studentCardName: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
  },
  studentCardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  nisBadgePill: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  nisBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  nisnBadgePill: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  nisnBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
  },
  studentClassUnitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  classBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3.5,
  },
  classBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#047857',
  },
  unitBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3.5,
  },
  unitBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  studentCardActionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  studentStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  studentStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  studentStatusText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
  },
  addNoteActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 6,
    gap: 4.5,
  },
  addNoteActionBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#047857',
  },

  // ── Target Student Display on Note Modal ──
  targetStudentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    padding: 12,
    marginBottom: 14,
    gap: 12,
  },
  targetStudentAvatarWrap: {
    position: 'relative',
  },
  targetStudentAvatarImg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: '#ECFDF5',
  },
  targetStudentCheckBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  targetStudentInfoCol: {
    flex: 1,
  },
  targetStudentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  targetStudentBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    gap: 3,
  },
  targetStudentBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#047857',
    letterSpacing: 0.3,
  },
  targetStudentGenderLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  targetStudentName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  targetStudentDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  targetStudentClassBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  targetStudentClassText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },
  targetStudentDot: {
    fontSize: 11,
    color: '#94A3B8',
  },
  targetStudentNisText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
  },

  // Header Primary CTA
  headerPrimaryCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 6,
    gap: 4,
  },
  headerPrimaryCtaText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Material Card
  modernMaterialCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  materialCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  materialSubjectPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
    gap: 4,
  },
  materialSubjectPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
  },
  materialStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    gap: 3,
  },
  statusPublished: {
    backgroundColor: '#DCFCE7',
  },
  statusDraft: {
    backgroundColor: '#FEF3C7',
  },
  materialStatusPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  materialTitleText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  materialSnippetText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
    marginBottom: 10,
  },
  materialFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 8,
  },
  materialClassBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  materialClassBadgeText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  materialDateText: {
    fontSize: 10.5,
    color: '#94A3B8',
    fontWeight: '500',
  },

  // Note Card
  modernNoteCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  noteTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  noteStudentIdentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  noteAvatarMiniBox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  noteStudentNameText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  noteStudentClassText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  priorityPill: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  priorityPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  noteTitleText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  noteQuoteBox: {
    backgroundColor: '#F8FAFC',
    borderLeftWidth: 3,
    borderLeftColor: '#059669',
    borderRadius: 6,
    padding: 9,
    marginBottom: 8,
  },
  noteContentText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 18,
  },
  noteFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  noteCategoryTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  noteCategoryTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  noteDateText: {
    fontSize: 10.5,
    color: '#94A3B8',
    fontWeight: '500',
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    maxHeight: '85%',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalHeaderIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalHeaderSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalScrollContent: {
    padding: 18,
  },
  inputFieldLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
    marginTop: 10,
  },
  formInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0F172A',
  },
  formTextArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  formSelectorScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
  },
  formSelectPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  formSelectPillActive: {
    backgroundColor: '#059669',
    borderColor: '#047857',
  },
  formSelectPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  formSelectPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  prioritySelectorRow: {
    flexDirection: 'row',
    gap: 6,
  },
  priorityPillBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  priorityPillBtnActive: {
    backgroundColor: '#059669',
    borderColor: '#047857',
  },
  priorityPillBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  priorityPillBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  formErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    padding: 10,
    borderRadius: 10,
    marginTop: 12,
    gap: 6,
  },
  formErrorText: {
    fontSize: 11.5,
    color: '#DC2626',
    fontWeight: '600',
  },
  modalActionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    marginBottom: 10,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  modalSubmitBtn: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  modalSubmitBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Material Card Action Buttons (Ubah & Hapus)
  materialCardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  materialEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5.5,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    gap: 4,
  },
  materialEditBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  materialDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5.5,
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 4,
  },
  materialDeleteBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#DC2626',
  },

  // Delete Confirmation Modal
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  deleteModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#FFE4E6',
    shadowColor: '#E11D48',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 12,
  },
  deleteModalTopBar: {
    height: 5,
    width: '100%',
  },
  deleteModalBody: {
    padding: 22,
    alignItems: 'center',
  },
  deleteModalIconBox: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: '#FFF1F2',
    borderWidth: 1.5,
    borderColor: '#FECDD3',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#E11D48',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  deleteHazardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    marginTop: 10,
  },
  deleteHazardPillText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#E11D48',
    letterSpacing: 0.5,
  },
  deleteModalTitle: {
    fontSize: 17.5,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 10,
    marginBottom: 4,
    textAlign: 'center',
  },
  deleteModalSub: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 14,
  },
  deleteTargetSummaryBox: {
    width: '100%',
    backgroundColor: '#FFF8F8',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  deleteTargetTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 18,
    marginBottom: 8,
  },
  deleteTargetBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  deleteTargetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  deleteTargetChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  deleteWarningNoticeBox: {
    width: '100%',
    backgroundColor: '#FFF1F2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECDD3',
    padding: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 18,
  },
  deleteWarningNoticeText: {
    flex: 1,
    fontSize: 11.5,
    color: '#9F1239',
    lineHeight: 16.5,
    fontWeight: '500',
  },
  deleteModalButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  deleteModalCancelBtn: {
    flex: 1,
    height: 46,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteModalCancelBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#64748B',
  },
  deleteModalConfirmBtn: {
    flex: 1.4,
    height: 46,
    flexDirection: 'row',
    backgroundColor: '#E11D48',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#E11D48',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  deleteModalConfirmBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ── Material Sub-Tab Switcher ──
  materialSubTabContainer: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 14,
    padding: 3,
    marginBottom: 16,
    gap: 4,
  },
  materialSubTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 11,
    gap: 6,
  },
  materialSubTabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  materialSubTabBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#64748B',
  },
  materialSubTabBtnTextActive: {
    color: '#047857',
    fontWeight: '800',
  },

  // ── Multi-Filter Styles ──
  filterSectionWrapper: {
    marginBottom: 10,
  },
  filterGroupHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 5,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  filterStatusChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 6,
  },
  filterStatusChipActive: {
    backgroundColor: '#059669',
    borderColor: '#047857',
  },
  filterStatusChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  filterStatusChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  filterChipDivider: {
    width: 1,
    height: 22,
    backgroundColor: '#CBD5E1',
    marginHorizontal: 4,
    alignSelf: 'center',
  },
  filterSubjectChip: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginRight: 6,
  },
  filterSubjectChipActive: {
    backgroundColor: '#059669',
    borderColor: '#047857',
  },
  filterSubjectChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#334155',
  },
  filterSubjectChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  activeFilterNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginBottom: 12,
  },
  activeFilterNoticeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#065F46',
    flex: 1,
  },
  resetFilterActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#D1FAE5',
  },
  resetFilterActionText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },

  // ── Material Read Action Button ──
  materialReadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  materialReadBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#047857',
  },

  // ── Modul Ajar (RPP) Card Styles ──
  modernModulCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  modulCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modulCodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
    gap: 4,
  },
  modulCodeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
    letterSpacing: 0.2,
  },
  modulFaseBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  modulFaseBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  modulCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
    lineHeight: 20,
  },
  modulMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  modulMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  modulMetaItemText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  modulMetaDot: {
    color: '#CBD5E1',
    fontSize: 10,
  },
  modulTpPreviewBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#059669',
    marginBottom: 8,
  },
  modulTpPreviewHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  modulTpPreviewText: {
    fontSize: 11.5,
    color: '#334155',
    lineHeight: 16,
  },
  modulP3Row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F3FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 5,
    marginBottom: 10,
  },
  modulP3Text: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#6D28D9',
    flex: 1,
  },
  modulCardFooterRow: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modulOpenRppBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
  },
  modulOpenRppBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ── Detail Modals Styles ──
  detailModalScrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 24,
  },
  detailStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  detailDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailDateText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  detailSummaryBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginBottom: 14,
  },
  detailSectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  detailSectionHeadingText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#047857',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  detailSummaryContent: {
    fontSize: 13,
    color: '#166534',
    lineHeight: 19,
    fontWeight: '600',
  },
  detailMainContentBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  detailMainContentText: {
    fontSize: 13.5,
    color: '#1E293B',
    lineHeight: 22,
  },
  detailModalFooter: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  detailEditActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#059669',
    paddingVertical: 12,
    borderRadius: 12,
  },
  detailEditActionBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  detailCloseBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailCloseBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },

  // ── RPP Detail Sections ──
  rppIdentGrid: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    gap: 8,
  },
  rppIdentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 6,
  },
  rppIdentLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  rppIdentVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  rppSectionBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  rppSectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 6,
  },
  rppSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#059669',
  },
  rppSubBlock: {
    marginBottom: 8,
  },
  rppSubLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 2,
  },
  rppSubContent: {
    fontSize: 12.5,
    color: '#0F172A',
    lineHeight: 18,
  },
  kbmStepCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#2563EB',
  },
  kbmStepTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1D4ED8',
    marginBottom: 3,
  },
  kbmStepContent: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 17,
  },
});

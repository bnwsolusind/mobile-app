import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Modal,
  Platform,
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
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import {
  isParentRole,
  isTeacherRole,
  isStaffRole,
  isTuRole,
  isPrincipalRole,
  isSuperAdminRole,
} from '../utils/roles';
import { useActiveChildStore } from '../stores/activeChildStore';
import { useAuthStore } from '../stores/authStore';
import { useNotificationBadgeStore } from '../stores/notificationBadgeStore';
import { useNavigationHistoryStore } from '../stores/navigationHistoryStore';
import { resolveSelectedChildId } from '../utils/selectedChild';
import { StudentHeroCard } from '../components/StudentHeroCard';
import { StudentStickyHeader, resolveStudentDisplay, useStickyScroll } from '../components/StudentStickyHeader';
import { TeacherStickyHeader } from '../components/TeacherStickyHeader';
import { TeacherHeroCard } from '../components/TeacherHeroCard';
import { StudentIdCardModal } from '../components/StudentIdCardModal';
import { StudentQrModal } from '../components/StudentQrModal';
import { StudentMenuModal } from '../components/StudentMenuModal';
import { StudentWeeklyReportModal } from '../components/StudentWeeklyReportModal';
import { AppFeedbackModal, FeedbackType } from '../components/AppFeedbackModal';
import { EmptyStateCard } from '../components/EmptyStateCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const STUDENT_CARD_GAP = 12;
const STUDENT_PEEK_WIDTH = 26;
const studentCardWidth = SCREEN_WIDTH - (STUDENT_PEEK_WIDTH * 2) - STUDENT_CARD_GAP;
const studentSnapInterval = studentCardWidth + STUDENT_CARD_GAP;
const studentTrackPad = STUDENT_PEEK_WIDTH;
const centerLoopOffset = studentSnapInterval;

const CATEGORIES = ['Semua', 'Akademik', 'Perilaku', 'Kedisiplinan', 'Prestasi', 'Konseling', 'Tahfizh', 'Ibadah', 'Kesehatan'];

const formatDate = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '-'
    : new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
};

// ── Category Theme Resolver (Harmonized dengan Web Dashboard TeacherCommentsWorkspace) ──
const getCategoryTheme = (rawCategory = '') => {
  const c = String(rawCategory).toLowerCase().trim();
  if (c.includes('tahfizh') || c.includes('quran')) {
    return {
      label: 'Tahfizh',
      badgeBg: '#ECFDF5',
      badgeText: '#065F46',
      badgeBorder: '#A7F3D0',
      borderLeft: '#10B981',
      icon: 'book-open-page-variant-outline',
    };
  }
  if (c.includes('akademik') || c.includes('belajar') || c.includes('pelajaran')) {
    return {
      label: 'Akademik',
      badgeBg: '#EFF6FF',
      badgeText: '#1E40AF',
      badgeBorder: '#BFDBFE',
      borderLeft: '#3B82F6',
      icon: 'school-outline',
    };
  }
  if (c.includes('ibadah') || c.includes('sholat') || c.includes('adab')) {
    return {
      label: 'Ibadah',
      badgeBg: '#FFFBEB',
      badgeText: '#B45309',
      badgeBorder: '#FDE68A',
      borderLeft: '#F59E0B',
      icon: 'hands-pray',
    };
  }
  if (c.includes('kedisiplinan') || c.includes('tata tertib') || c.includes('kehadiran')) {
    return {
      label: 'Kedisiplinan',
      badgeBg: '#F0F9FF',
      badgeText: '#0369A1',
      badgeBorder: '#BAE6FD',
      borderLeft: '#0EA5E9',
      icon: 'shield-check-outline',
    };
  }
  if (c.includes('konseling') || c.includes('bk') || c.includes('bimbingan')) {
    return {
      label: 'Konseling',
      badgeBg: '#F5F3FF',
      badgeText: '#6D28D9',
      badgeBorder: '#DDD6FE',
      borderLeft: '#8B5CF6',
      icon: 'account-voice',
    };
  }
  if (c.includes('perilaku') || c.includes('karakter') || c.includes('akhlak')) {
    return {
      label: 'Perilaku',
      badgeBg: '#FAF5FF',
      badgeText: '#7E22CE',
      badgeBorder: '#E9D5FF',
      borderLeft: '#A855F7',
      icon: 'heart-outline',
    };
  }
  if (c.includes('prestasi') || c.includes('lomba') || c.includes('juara')) {
    return {
      label: 'Prestasi',
      badgeBg: '#FFF1F2',
      badgeText: '#BE123C',
      badgeBorder: '#FECDD3',
      borderLeft: '#F43F5E',
      icon: 'trophy-outline',
    };
  }
  if (c.includes('kesehatan') || c.includes('uks')) {
    return {
      label: 'Kesehatan',
      badgeBg: '#EEF2FF',
      badgeText: '#4338CA',
      badgeBorder: '#C7D2FE',
      borderLeft: '#6366F1',
      icon: 'medical-bag',
    };
  }
  return {
    label: rawCategory || 'Catatan',
    badgeBg: '#F0FDFA',
    badgeText: '#115E59',
    badgeBorder: '#99F6E4',
    borderLeft: '#14B8A6',
    icon: 'notebook-outline',
  };
};


export default function StudentNotesScreen({ route }: any) {
  const navigation = useNavigation<any>();
  let insets = { top: 0, bottom: 0, left: 0, right: 0 };
  try {
    if (typeof useSafeAreaInsets === 'function') {
      insets = useSafeAreaInsets() || insets;
    }
  } catch {
    // fallback safe insets
  }
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 0);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 36 : 16);

  const user = useAuthStore((state) => state.user);
  const isParent = isParentRole(user?.roles || []);
  const isTeacher = isTeacherRole(user?.roles || []);
  const activeChildId = useActiveChildStore((state) => state.activeChildId);
  const isParentWithChild = isParent && Boolean(activeChildId);
  const unreadNotificationCount = useNotificationBadgeStore((state) => state.unreadNotificationCount);
  const globalActiveChildId = useActiveChildStore((state) => state.activeChildId);

  const isStaff = isStaffRole(user?.roles || []) || isTuRole(user?.roles || []) || isPrincipalRole(user?.roles || []) || isSuperAdminRole(user?.roles || []);
  const isTeacherUser = isTeacher || isStaff;
  const hasDualRole = isParent && isTeacherUser;

  const [dualRoleMode, setDualRoleMode] = useState<'teacher' | 'parent'>(() => {
    if (route?.params?.as_parent || route?.params?.mode === 'parent') return 'parent';
    if (route?.params?.mode === 'teacher') return 'teacher';
    if (isTeacherUser) return 'teacher';
    return 'parent';
  });

  const isTeacherOnly = isTeacherUser && (!hasDualRole || dualRoleMode === 'teacher');
  const isParentActive = isParent && (!hasDualRole || dualRoleMode === 'parent');

  const studentScrollRef = useRef<ScrollView>(null);
  const handledParamIdRef = useRef<string | null>(null);

  const [children, setChildren] = useState<any[]>(() => {
    const fromStore = useActiveChildStore.getState().children;
    return Array.isArray(fromStore) && fromStore.length > 0 ? fromStore : [];
  });
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(() => {
    const fromRoute = route?.params?.child_id || route?.params?.student_id;
    if (fromRoute) return String(fromRoute);
    const fromStore = useActiveChildStore.getState().activeChildId;
    return fromStore ? String(fromStore) : undefined;
  });
  const [activeChildIndex, setActiveChildIndex] = useState<number>(() => {
    const fromStore = useActiveChildStore.getState().children;
    const targetId = route?.params?.child_id || route?.params?.student_id || useActiveChildStore.getState().activeChildId;
    if (Array.isArray(fromStore) && fromStore.length > 0 && targetId) {
      const idx = fromStore.findIndex((c) => String(c.id || c.student_id) === String(targetId));
      return idx >= 0 ? idx : 0;
    }
    return 0;
  });

  useEffect(() => {
    if (selectedChildId && children.length > 0) {
      const idx = children.findIndex((c) => String(c.id || c.student_id) === String(selectedChildId));
      if (idx >= 0 && idx !== activeChildIndex) {
        setActiveChildIndex(idx);
      }
    }
  }, [selectedChildId, children]);

  const [notes, setNotes] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>({ current_page: 1, last_page: 1 });
  const [category, setCategory] = useState('Semua');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
  } | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'unsigned' | 'signed'>('all');
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [signing, setSigning] = useState(false);
  const [agreedSignature, setAgreedSignature] = useState(false);

  // Guru Note Form State & Students
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [editingNote, setEditingNote] = useState<any>(null);
  const [noteForm, setNoteForm] = useState({
    student_id: '',
    title: '',
    content: '',
    category: 'Akademik',
    priority: 'medium',
  });
  const [savingNote, setSavingNote] = useState(false);
  const [teacherStudents, setTeacherStudents] = useState<any[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  const loadTeacherStudents = useCallback(async () => {
    if (!isTeacherUser) return;
    try {
      setLoadingStudents(true);
      const res = await mobileApiService.getTeacherStudents({ per_page: 250 });
      const unwrapped = unwrapApiData<any>(res);
      const list = Array.isArray(unwrapped) ? unwrapped : Array.isArray(unwrapped?.data) ? unwrapped.data : [];
      setTeacherStudents(list);
    } catch (e) {
      console.warn('Gagal memuat siswa guru:', e);
    } finally {
      setLoadingStudents(false);
    }
  }, [isTeacherUser]);

  useEffect(() => {
    if (isTeacherOnly) {
      void loadTeacherStudents();
    }
  }, [isTeacherOnly, loadTeacherStudents]);

  const handleSaveTeacherNote = async () => {
    if (!noteForm.student_id) {
      Alert.alert('Peringatan', 'Silakan pilih siswa terlebih dahulu.');
      return;
    }
    if (!noteForm.title.trim()) {
      Alert.alert('Peringatan', 'Judul catatan wajib diisi.');
      return;
    }
    if (!noteForm.content.trim()) {
      Alert.alert('Peringatan', 'Isi catatan wajib diisi.');
      return;
    }

    setSavingNote(true);
    try {
      const payload = {
        student_id: noteForm.student_id,
        category: noteForm.category || 'Akademik',
        title: noteForm.title.trim(),
        content: noteForm.content.trim(),
        priority: noteForm.priority || 'medium',
        visible_to_parent: true,
        visible_to_student: true,
      };

      if (editingNote?.id) {
        await mobileApiService.updateTeacherStudentNote(String(editingNote.id), payload);
        setFeedbackModal({
          visible: true,
          type: 'success',
          title: 'Catatan Diperbarui',
          message: 'Perubahan catatan santri berhasil disimpan.',
        });
      } else {
        await mobileApiService.createTeacherStudentNote(payload);
        setFeedbackModal({
          visible: true,
          type: 'success',
          title: 'Catatan Diterbitkan',
          message: 'Catatan santri berhasil dikirim dan tersimpan di buku penghubung.',
        });
      }

      setNoteModalVisible(false);
      setEditingNote(null);
      setNoteForm({
        student_id: '',
        title: '',
        content: '',
        category: 'Akademik',
        priority: 'medium',
      });
      await loadNotes(undefined, 1, false);
    } catch (err: any) {
      Alert.alert('Gagal', err?.response?.data?.message || 'Gagal menyimpan catatan santri.');
    } finally {
      setSavingNote(false);
    }
  };

  const handleDeleteTeacherNote = (note: any) => {
    Alert.alert(
      'Hapus Catatan',
      `Yakin ingin menghapus catatan "${note.title}"?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            try {
              await mobileApiService.deleteTeacherStudentNote(String(note.id));
              setFeedbackModal({
                visible: true,
                type: 'success',
                title: 'Catatan Dihapus',
                message: 'Catatan siswa telah berhasil dihapus.',
              });
              await loadNotes(undefined, 1, false);
            } catch (err: any) {
              Alert.alert('Gagal', err?.response?.data?.message || 'Gagal menghapus catatan.');
            }
          },
        },
      ]
    );
  };

  // Modals identitas santri
  const [selectedIdCardStudent, setSelectedIdCardStudent] = useState<any>(null);
  const [selectedQrStudent, setSelectedQrStudent] = useState<any>(null);
  const [selectedMenuStudent, setSelectedMenuStudent] = useState<any>(null);
  const [selectedWeeklyStudent, setSelectedWeeklyStudent] = useState<any>(null);

  // ── Sticky Header Scroll Listener & Animasi (identik TahfizhScreen) ──
  const { scrollY, handleMainScroll } = useStickyScroll();

  const bodyCardOpacity = useMemo(
    () =>
      scrollY.interpolate({
        inputRange: [45, 105],
        outputRange: [1, 0],
        extrapolate: 'clamp',
      }),
    [scrollY]
  );

  const bodyCardTranslateY = useMemo(
    () =>
      scrollY.interpolate({
        inputRange: [45, 105],
        outputRange: [0, -16],
        extrapolate: 'clamp',
      }),
    [scrollY]
  );

  // ── Multi-child Looping Carousel State ──
  const studentLoopCount = children.length;
  const safeCenter = studentLoopCount > 0 ? ((activeChildIndex % studentLoopCount) + studentLoopCount) % studentLoopCount : 0;

  const loopWindow = useMemo(() => {
    const n = studentLoopCount;
    if (n <= 1) return { list: children, realIdx: [0] };
    const cur = ((activeChildIndex % n) + n) % n;
    const prev = (cur - 1 + n) % n;
    const next = (cur + 1) % n;
    return {
      list: [children[prev], children[cur], children[next]],
      realIdx: [prev, cur, next],
    };
  }, [children, activeChildIndex, studentLoopCount]);

  const recenterLoop = useCallback(() => {
    if (studentLoopCount > 1) {
      studentScrollRef.current?.scrollTo({ x: centerLoopOffset, animated: false });
    }
  }, [studentLoopCount]);

  // Posisikan ScrollView ke tengah setiap kali jumlah anak berubah
  useEffect(() => {
    if (studentLoopCount <= 1) return;
    requestAnimationFrame(() => {
      studentScrollRef.current?.scrollTo({ x: centerLoopOffset, animated: false });
    });
  }, [studentLoopCount]);

  // Siswa aktif untuk sticky header
  const activeChild = useMemo(() => {
    if (children.length === 0) return null;
    if (selectedChildId) {
      const found = children.find((c) => String(c.id || c.student_id) === String(selectedChildId));
      if (found) return found;
    }
    return children[safeCenter] || children[0] || null;
  }, [children, selectedChildId, safeCenter]);

  const headerStudent = useMemo(() => {
    return activeChild || (user as any)?.student || user || null;
  }, [activeChild, user]);

  const heroFirstName = useMemo(
    () => resolveStudentDisplay(headerStudent, user).firstName,
    [headerStudent, user]
  );

  // ── Load Catatan Buku Penghubung ──
  const loadNotes = useCallback(async (childId?: string, page = 1, append = false) => {
    if (isTeacherOnly) {
      if (!append) setLoading(true);
      try {
        const response = await mobileApiService.getTeacherStudentNotes({
          page,
          per_page: 15,
          category: category === 'Semua' ? undefined : category,
          search: search.trim() || undefined,
        });
        const rawData = response?.data ?? response;
        const rows = Array.isArray(rawData?.data)
          ? rawData.data
          : Array.isArray(rawData)
          ? rawData
          : Array.isArray(response?.data?.data)
          ? response.data.data
          : Array.isArray(response)
          ? response
          : [];

        setNotes((current) => (append ? [...current, ...rows] : rows));
        setMeta(rawData?.data && rawData?.current_page ? rawData : (response?.data || {}));
      } catch (err: any) {
        console.warn('Failed to load teacher student notes:', err);
      } finally {
        if (!append) setLoading(false);
      }
      return;
    }

    const targetId = childId || selectedChildId;
    if (!targetId) return;
    if (!append) setLoading(true);
    try {
      const response = await mobileApiService.getPortalStudentNotes(targetId, page);
      const rawData = response?.data ?? response;
      const rows = Array.isArray(rawData?.data)
        ? rawData.data
        : Array.isArray(rawData)
        ? rawData
        : Array.isArray(response?.data?.data)
        ? response.data.data
        : Array.isArray(response)
        ? response
        : [];

      setNotes((current) => (append ? [...current, ...rows] : rows));
      setMeta(rawData?.data && rawData?.current_page ? rawData : (response?.data || {}));
    } catch (err: any) {
      console.warn('Failed to load student notes:', err);
    } finally {
      if (!append) setLoading(false);
    }
  }, [category, isTeacherOnly, search, selectedChildId]);

  const syncLoopChildId = useCallback((newIdx: number) => {
    if (!children || children.length === 0) return;
    const n = children.length;
    const norm = ((newIdx % n) + n) % n;
    const targetChild = children[norm];
    if (targetChild) {
      const childId = String(targetChild.id || targetChild.student_id);
      setSelectedChildId(childId);
      useActiveChildStore.getState().setActiveChildId(childId);
      setNotes([]);
      setReplyFor(null);
      setAgreedSignature(false);
      void loadNotes(childId, 1, false);
    }
  }, [children, loadNotes]);

  const goToLoopChild = useCallback((targetRealIndex: number) => {
    if (studentLoopCount <= 1) {
      if (children.length === 1) {
        setActiveChildIndex(0);
        syncLoopChildId(0);
      }
      return;
    }
    const n = studentLoopCount;
    const normTarget = ((targetRealIndex % n) + n) % n;
    if (normTarget === safeCenter) return;

    let delta = normTarget - safeCenter;
    if (delta > n / 2) delta -= n;
    if (delta < -n / 2) delta += n;

    if (delta === 1) {
      studentScrollRef.current?.scrollTo({ x: centerLoopOffset * 2, animated: true });
      setTimeout(() => {
        setActiveChildIndex(normTarget);
        syncLoopChildId(normTarget);
        recenterLoop();
      }, 240);
    } else if (delta === -1) {
      studentScrollRef.current?.scrollTo({ x: 0, animated: true });
      setTimeout(() => {
        setActiveChildIndex(normTarget);
        syncLoopChildId(normTarget);
        recenterLoop();
      }, 240);
    } else {
      setActiveChildIndex(normTarget);
      syncLoopChildId(normTarget);
      recenterLoop();
    }
  }, [studentLoopCount, safeCenter, children.length, syncLoopChildId, recenterLoop]);

  // Route params sync (hanya sekali saat parameter route baru terdeteksi)
  useEffect(() => {
    const incomingId = route?.params?.child_id || route?.params?.student_id;
    if (incomingId && children.length > 0 && handledParamIdRef.current !== String(incomingId)) {
      handledParamIdRef.current = String(incomingId);
      const foundIdx = children.findIndex((c: any) => String(c.id || c.student_id) === String(incomingId));
      if (foundIdx >= 0) {
        goToLoopChild(foundIdx);
      }
    }
  }, [route?.params?.child_id, route?.params?.student_id, children, goToLoopChild]);

  // ── Inisialisasi Data Anak & Catatan ──
  const loadChildren = useCallback(async () => {
    const targetParamId = route?.params?.child_id || route?.params?.student_id;
    const storeActiveId = useActiveChildStore.getState().activeChildId;

    try {
      const response = await mobileApiService.getPortalChildren();
      const list = unwrapApiData<any[]>(response);
      const safeList = Array.isArray(list) ? list : [];

      if (safeList.length > 0) {
        // Pertahankan seluruh saudara agar kartu bisa di-swipe kiri/kanan
        setChildren(safeList);
        useActiveChildStore.getState().setChildren(safeList);

        const resolvedId = resolveSelectedChildId(
          targetParamId,
          storeActiveId || globalActiveChildId,
          safeList
        ) || String(safeList[0].id || safeList[0].student_id);

        if (resolvedId) {
          setSelectedChildId(String(resolvedId));
          useActiveChildStore.getState().setActiveChildId(String(resolvedId));
          const idx = safeList.findIndex((c) => String(c.id || c.student_id) === String(resolvedId));
          if (idx >= 0) {
            setActiveChildIndex(idx);
          }
          return String(resolvedId);
        }
      } else if (children.length > 0) {
        return selectedChildId || String(children[0].id || children[0].student_id);
      }
    } catch {
      if (children.length > 0) {
        return selectedChildId || String(children[0].id || children[0].student_id);
      }
    }
    return undefined;
  }, [route?.params?.child_id, route?.params?.student_id, globalActiveChildId, children, selectedChildId]);

  const load = useCallback(async () => {
    if (isTeacherOnly) {
      setLoading(true);
      setError('');
      try {
        await loadNotes(undefined, 1, false);
      } catch (requestError) {
        setError(getApiErrorMessage(requestError, 'Catatan buku penghubung belum berhasil dimuat.'));
      } finally {
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    setError('');
    try {
      const childId = await loadChildren();
      const targetId = childId || selectedChildId;
      if (targetId) {
        await loadNotes(targetId, 1, false);
      }
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Catatan buku penghubung belum berhasil dimuat.'));
    } finally {
      setLoading(false);
    }
  }, [isTeacherOnly, loadChildren, loadNotes, selectedChildId]);

  useEffect(() => {
    void load();
  }, [category]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      if (isTeacherOnly) {
        await loadNotes(undefined, 1, false);
      } else if (selectedChildId) {
        await loadNotes(selectedChildId, 1, false);
      }
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Catatan buku penghubung belum berhasil dimuat.'));
    } finally {
      setRefreshing(false);
    }
  };

  const loadMore = async () => {
    const current = Number(meta?.current_page || 1);
    const last = Number(meta?.last_page || 1);
    if (loadingMore || current >= last) return;
    if (!isTeacherOnly && !selectedChildId) return;
    setLoadingMore(true);
    try {
      await loadNotes(isTeacherOnly ? undefined : selectedChildId, current + 1, true);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleBack = () => {
    const handled = useNavigationHistoryStore.getState().goBackDynamic(navigation, route?.params);
    if (handled) return;
    const childId = route?.params?.child_id || route?.params?.student_id;
    if (route?.params?.from_child_portal && childId) {
      navigation?.navigate('Beranda');
      return;
    }
    if (navigation?.canGoBack?.()) {
      navigation.goBack();
    } else {
      navigation?.navigate('Beranda');
    }
  };

  const openScheduleForStudent = useCallback((student: any) => {
    const cid = String(student?.id || student?.student_id || selectedChildId || '');
    if (cid) {
      navigation?.navigate('Jadwal', { child_id: cid, student_id: cid });
    } else {
      navigation?.navigate('Jadwal');
    }
  }, [navigation, selectedChildId]);

  // ── Real-time Statistics KPI (identik dengan Master KPI Web Dashboard) ──
  const stats = useMemo(() => {
    let signedCount = 0;
    let unsignedCount = 0;
    const catSet = new Set<string>();

    notes.forEach((item) => {
      const isSigned = item.signature_status === 'signed' || Boolean(item.signed_by_user_id && item.signed_at);
      if (isSigned) signedCount++;
      else unsignedCount++;
      const cat = (item.category || '').trim();
      if (cat) catSet.add(cat);
    });

    return {
      total: notes.length,
      signedCount,
      unsignedCount,
      categoryCount: catSet.size,
    };
  }, [notes]);

  const signNote = async (note: any) => {
    if (!selectedChildId || !agreedSignature) return;
    setSigning(true);
    try {
      await mobileApiService.signPortalStudentNote(String(note.id), selectedChildId, reply);
      setReply('');
      setReplyFor(null);
      setAgreedSignature(false);
      await loadNotes(selectedChildId, 1, false);
      setFeedbackModal({
        visible: true,
        type: 'success',
        title: 'Tanda Tangan Tersimpan',
        message: 'Catatan dan persetujuan orang tua berhasil disimpan ke server sekolah.',
      });
    } catch (requestError) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Menyimpan',
        message: getApiErrorMessage(requestError, 'Catatan belum berhasil ditandatangani.'),
      });
    } finally {
      setSigning(false);
    }
  };

  const filtered = useMemo(() => {
    return notes.filter((note) => {
      const isSigned = note.signature_status === 'signed' || Boolean(note.signed_by_user_id && note.signed_at);
      if (statusFilter === 'unsigned' && isSigned) return false;
      if (statusFilter === 'signed' && !isSigned) return false;

      const matchesCategory =
        category === 'Semua' || String(note.category || '').toLowerCase() === category.toLowerCase();
      const keyword = search.trim().toLowerCase();
      const teacher = note.teacher?.full_name || note.teacher?.nama_lengkap || note.teacher?.name || '';
      const followUpText = note.follow_up || '';
      const title = note.title || '';
      const content = note.content || '';
      const catText = note.category || '';

      return (
        matchesCategory &&
        (!keyword ||
          [title, content, teacher, followUpText, catText].some((value) =>
            String(value || '').toLowerCase().includes(keyword)
          ))
      );
    });
  }, [notes, category, search, statusFilter]);

  const dynamicCategories = useMemo(() => {
    const set = new Set<string>();
    CATEGORIES.filter((c) => c !== 'Semua').forEach((c) => set.add(c));
    notes.forEach((item) => {
      const c = (item.category || item.kategori || '').trim();
      if (c) set.add(c);
    });
    return ['Semua', ...Array.from(set)];
  }, [notes]);

  return (
    <View style={styles.rootContainer}>
      {/* ── 0. STICKY HEADER BERSAMA ── */}
      {isTeacherOnly ? (
        <TeacherStickyHeader
          scrollY={scrollY}
          topInset={topInset}
          title="Buku Penghubung"
          subtitle="Catatan Santri & Respon Ortu"
          navigation={navigation}
          route={route}
          user={user}
          chips={dynamicCategories.slice(0, 6).map((cat) => ({
            label: cat,
            active: category === cat,
            onPress: () => setCategory(cat),
          }))}
        />
      ) : (
        <StudentStickyHeader
          scrollY={scrollY}
          topInset={topInset}
          title="Buku Penghubung"
          navigation={navigation}
          route={route}
          student={headerStudent}
          user={user}
          childrenList={children}
          selectedChildId={selectedChildId}
          onSelectChild={(cid, idx) => goToLoopChild(idx)}
          middleAction={{
            label: 'Jadwal',
            icon: 'calendar-clock',
            onPress: () => openScheduleForStudent(headerStudent),
          }}
          onOpenIdCard={(s) => setSelectedIdCardStudent(s)}
          onOpenQr={(s) => setSelectedQrStudent(s)}
          onOpenWeeklyReport={(s) => setSelectedWeeklyStudent(s)}
          onOpenMenu={(s) => setSelectedMenuStudent(s)}
        />
      )}

      <View style={styles.sheetContainer}>
        <LinearGradient
          colors={['#FFFFFF', '#F2FAF6', '#DDF5EB']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <Animated.ScrollView
          style={styles.screen}
          contentContainerStyle={[
            styles.mainScrollContent,
            { paddingBottom: Math.max(bottomInset + 72, 94) },
          ]}
          onScroll={handleMainScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refresh()}
              colors={['#18A165']}
              progressViewOffset={topInset + 10}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* ── 1. STATIC TOPBAR (identik TahfizhScreen) ── */}
          <View style={[styles.staticTopBarWrapper, { paddingTop: topInset + 8 }]}>
            <LinearGradient
              colors={['#047857', '#059669', '#10B981']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.heroDecorCircle1} />
            <View style={styles.heroDecorCircle2} />

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
                  Buku Penghubung
                </Text>
                <Text numberOfLines={1} style={styles.heroModuleSubtitle}>
                  {isTeacherOnly ? 'Catatan Evaluasi & Komunikasi Wali' : (heroFirstName ? `Ananda ${heroFirstName}` : 'Komunikasi Guru & Orang Tua')}
                </Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => navigation?.navigate('Notifikasi')}
                style={styles.heroSquircleBtn}
                accessibilityRole="button"
                accessibilityLabel="Notifikasi"
              >
                <MaterialCommunityIcons name="bell-outline" size={20} color="#059669" />
                {unreadNotificationCount > 0 && <View style={styles.heroBellDot} />}
              </TouchableOpacity>
            </View>
          </View>

          {/* ── 2. BADAN KONTEN HALAMAN ── */}
          <View style={styles.bodyContentWrapper}>
            {/* ── DUAL ROLE TOGGLE BAR (GURU & ORTU) ── */}
            {hasDualRole && (
              <View style={styles.dualRolePillContainer}>
                <TouchableOpacity
                  onPress={() => {
                    setDualRoleMode('teacher');
                    setCategory('Semua');
                    void loadNotes(undefined, 1, false);
                  }}
                  style={[
                    styles.dualRolePill,
                    dualRoleMode === 'teacher' && styles.dualRolePillActive,
                  ]}
                  activeOpacity={0.85}
                >
                  <MaterialCommunityIcons
                    name="human-male-board"
                    size={14}
                    color={dualRoleMode === 'teacher' ? '#FFFFFF' : '#047857'}
                  />
                  <Text
                    style={[
                      styles.dualRolePillText,
                      dualRoleMode === 'teacher' && styles.dualRolePillTextActive,
                    ]}
                  >
                    Mode Pengajar (Rombel)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    setDualRoleMode('parent');
                    setCategory('Semua');
                    if (selectedChildId) {
                      void loadNotes(selectedChildId, 1, false);
                    }
                  }}
                  style={[
                    styles.dualRolePill,
                    dualRoleMode === 'parent' && styles.dualRolePillActive,
                  ]}
                  activeOpacity={0.85}
                >
                  <MaterialCommunityIcons
                    name="account-child-outline"
                    size={14}
                    color={dualRoleMode === 'parent' ? '#FFFFFF' : '#047857'}
                  />
                  <Text
                    style={[
                      styles.dualRolePillText,
                      dualRoleMode === 'parent' && styles.dualRolePillTextActive,
                    ]}
                  >
                    Mode Orang Tua (Ananda)
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── 2A. CARD SISWA / GURU HERO ── */}
            {isTeacherOnly ? (
              <TeacherHeroCard
                user={user}
                title="Buku Penghubung Santri"
                subtitle="Pantau catatan pembinaan, evaluasi perilaku/tahfizh, dan umpan balik wali santri"
                stats={[
                  { label: 'Total Catatan', value: notes.length, icon: 'notebook-outline' },
                  { label: 'Kategori Aktif', value: category, icon: 'tag-outline' },
                  { label: 'Pencarian', value: search ? 'Filter' : 'Semua', icon: 'magnify' },
                ]}
              />
            ) : children.length > 0 ? (
              <Animated.View
                style={[
                  styles.containerBlock,
                  styles.studentContainerBlock,
                  { opacity: bodyCardOpacity, transform: [{ translateY: bodyCardTranslateY }] },
                ]}
              >
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionHeaderTitleWrap}>
                    <MaterialCommunityIcons name="account-school" size={18} color="#18A165" />
                    <Text style={styles.sectionTitle}>Data Ananda</Text>
                  </View>
                  {children.length > 1 && (
                    <View style={styles.studentCardCountBadge}>
                      <Text style={styles.studentCardCountBadgeText}>
                        {safeCenter + 1} dari {children.length} Ananda
                      </Text>
                    </View>
                  )}
                </View>

                {children.length === 1 ? (
                  <View style={styles.singleHeroCardContainer}>
                    <StudentHeroCard
                      child={children[0]}
                      isSelected={true}
                      isSingleChild={true}
                      showActionButtons={true}
                      cardLabel="Kartu Siswa"
                      calendarLabel="Jadwal"
                      portalLabel="Menu"
                      onPressCard={() => setSelectedIdCardStudent(children[0])}
                      onPressQr={() => setSelectedQrStudent(children[0])}
                      onPressWeeklyReport={() => setSelectedWeeklyStudent(children[0])}
                      onPressNotifications={() => navigation?.navigate('Notifikasi')}
                      onPressCalendar={() => openScheduleForStudent(children[0])}
                      onPressPortal={() => setSelectedMenuStudent(children[0])}
                    />
                  </View>
                ) : (
                  <>
                    <ScrollView
                      ref={studentScrollRef}
                      horizontal
                      nestedScrollEnabled={true}
                      showsHorizontalScrollIndicator={false}
                      contentOffset={{ x: centerLoopOffset, y: 0 }}
                      contentContainerStyle={[
                        styles.studentCardsTrack,
                        { paddingHorizontal: studentTrackPad },
                      ]}
                      decelerationRate="fast"
                      snapToInterval={studentSnapInterval}
                      snapToAlignment="start"
                      disableIntervalMomentum
                      onMomentumScrollEnd={(e) => {
                        if (studentLoopCount <= 1) return;
                        const offsetX = e.nativeEvent.contentOffset.x;
                        const slot = Math.round(offsetX / studentSnapInterval);
                        const n = studentLoopCount;
                        const cur = ((activeChildIndex % n) + n) % n;
                        let realIdx = cur;
                        if (slot === 2) realIdx = (cur + 1) % n;
                        else if (slot === 0) realIdx = (cur - 1 + n) % n;
                        if (realIdx !== cur) {
                          setActiveChildIndex(realIdx);
                          syncLoopChildId(realIdx);
                        }
                        recenterLoop();
                      }}
                      onScrollEndDrag={(e) => {
                        if (studentLoopCount <= 1) return;
                        const offsetX = e.nativeEvent.contentOffset.x;
                        const slot = Math.round(offsetX / studentSnapInterval);
                        const n = studentLoopCount;
                        const cur = ((activeChildIndex % n) + n) % n;
                        let realIdx = cur;
                        if (slot === 2) realIdx = (cur + 1) % n;
                        else if (slot === 0) realIdx = (cur - 1 + n) % n;
                        if (realIdx !== cur) {
                          setActiveChildIndex(realIdx);
                          syncLoopChildId(realIdx);
                        }
                      }}
                      scrollEventThrottle={16}
                      style={styles.heroCardScrollContainer}
                    >
                      {loopWindow.list.map((child: any, sIdx: number) => {
                        const realIdx = loopWindow.realIdx[sIdx] ?? 0;
                        const isCardActive = realIdx === safeCenter;
                        return (
                          <StudentHeroCard
                            key={`win-${sIdx}-${String(child?.id ?? realIdx)}`}
                            child={child}
                            isSelected={isCardActive}
                            isSingleChild={false}
                            showActionButtons={true}
                            cardWidth={studentCardWidth}
                            cardLabel="Kartu Siswa"
                            calendarLabel="Jadwal"
                            portalLabel="Menu"
                            onSelect={isCardActive ? undefined : () => goToLoopChild(realIdx)}
                            onPressCard={() => setSelectedIdCardStudent(child)}
                            onPressQr={() => setSelectedQrStudent(child)}
                            onPressWeeklyReport={() => setSelectedWeeklyStudent(child)}
                            onPressNotifications={() => navigation?.navigate('Notifikasi')}
                            onPressCalendar={() => openScheduleForStudent(child)}
                            onPressPortal={() => setSelectedMenuStudent(child)}
                          />
                        );
                      })}
                    </ScrollView>

                    {/* DOT INDIKATOR SCROLL SISWA */}
                    <View style={styles.paginationDotsRow}>
                      {children.map((_, dotIdx) => {
                        const isDotActive = dotIdx === safeCenter;
                        return (
                          <TouchableOpacity
                            key={dotIdx}
                            activeOpacity={0.7}
                            onPress={() => goToLoopChild(dotIdx)}
                            style={[
                              styles.paginationDot,
                              isDotActive && styles.paginationDotActive,
                            ]}
                            accessibilityLabel={`Pilih Siswa ke-${dotIdx + 1}`}
                            accessibilityRole="button"
                          />
                        );
                      })}
                    </View>
                  </>
                )}
              </Animated.View>
            ) : headerStudent ? (
              <Animated.View
                style={[
                  styles.containerBlock,
                  styles.studentContainerBlock,
                  { opacity: bodyCardOpacity, transform: [{ translateY: bodyCardTranslateY }] },
                ]}
              >
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionHeaderTitleWrap}>
                    <MaterialCommunityIcons name="account-school" size={18} color="#18A165" />
                    <Text style={styles.sectionTitle}>Data Ananda</Text>
                  </View>
                </View>

                <View style={styles.singleHeroCardContainer}>
                  <StudentHeroCard
                    child={headerStudent}
                    isSelected={true}
                    isSingleChild={true}
                    showActionButtons={true}
                    cardLabel="Kartu Siswa"
                    calendarLabel="Jadwal"
                    portalLabel="Menu"
                    onPressCard={() => setSelectedIdCardStudent(headerStudent)}
                    onPressQr={() => setSelectedQrStudent(headerStudent)}
                    onPressWeeklyReport={() => setSelectedWeeklyStudent(headerStudent)}
                    onPressNotifications={() => navigation?.navigate('Notifikasi')}
                    onPressCalendar={() => openScheduleForStudent(headerStudent)}
                    onPressPortal={() => setSelectedMenuStudent(headerStudent)}
                  />
                </View>
              </Animated.View>
            ) : null}

            {/* ── 2A-2. HERO KPI GROUP CARD (MUTABA'AH & TAHFIZH SCREEN STYLE) ── */}
            {!isTeacherOnly && (
              <View style={[styles.tahfizhGroupCard, styles.tahfizhGroupCardEmerald]}>
                <LinearGradient
                  colors={stats.unsignedCount > 0 ? ['#047857', '#065F46'] : ['#059669', '#047857']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.tahfizhGroupCardHeaderGradient}
                >
                  <View style={styles.tahfizhGroupCardHeaderLeft}>
                    <View style={styles.tahfizhGroupHeaderIconBoxWhite}>
                      <MaterialCommunityIcons name="notebook-check" size={17} color="#047857" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={styles.tahfizhGroupCardTitleWhite}>
                        Ringkasan Buku Penghubung
                      </Text>
                      <Text numberOfLines={1} style={styles.tahfizhGroupCardSubWhite}>
                        Evaluasi komunikasi guru &amp; persetujuan wali
                      </Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.tahfizhGroupActionBadge,
                      stats.unsignedCount > 0
                        ? styles.tahfizhGroupActionBadgeRed
                        : styles.tahfizhGroupActionBadgeWhite,
                    ]}
                  >
                    {stats.unsignedCount > 0 ? (
                      <MaterialCommunityIcons name="clock-alert-outline" size={13} color="#DC2626" style={{ marginRight: 3 }} />
                    ) : (
                      <MaterialCommunityIcons name="check-decagram" size={13} color="#047857" style={{ marginRight: 3 }} />
                    )}
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.tahfizhGroupActionBadgeText,
                        stats.unsignedCount > 0 ? { color: '#DC2626' } : { color: '#047857' },
                      ]}
                    >
                      {stats.unsignedCount > 0
                        ? `${stats.unsignedCount} Menunggu`
                        : stats.total > 0
                        ? `${Math.round((stats.signedCount / stats.total) * 100)}% Selesai`
                        : 'Semua Tuntas'}
                    </Text>
                  </View>
                </LinearGradient>

                <View style={styles.heroKpiRow}>
                  {/* Card 1: Progress Donut Ring */}
                  <View style={styles.heroKpiCard}>
                    <View style={styles.progressCircleBox}>
                      <View style={styles.progressCircleRing}>
                        <Text style={styles.progressCircleText}>
                          {stats.total > 0 ? `${Math.round((stats.signedCount / stats.total) * 100)}%` : '100%'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.heroKpiContentCol}>
                      <Text numberOfLines={1} style={styles.heroKpiTitle}>Persetujuan Wali</Text>
                      <Text numberOfLines={1} style={styles.heroKpiSub}>
                        {stats.signedCount}/{stats.total} Catatan Disetujui
                      </Text>
                      <View style={styles.heroProgressBarTrack}>
                        <View
                          style={[
                            styles.heroProgressBarFill,
                            { width: `${stats.total > 0 ? Math.min(100, Math.max(5, (stats.signedCount / stats.total) * 100)) : 100}%` },
                          ]}
                        />
                      </View>
                    </View>
                  </View>

                  {/* Card 2: Status Respon */}
                  <View
                    style={[
                      styles.heroKpiCard,
                      stats.unsignedCount > 0 && { borderColor: '#FECDD3', backgroundColor: '#FFFDFD' },
                    ]}
                  >
                    <View
                      style={[
                        styles.targetIconBox,
                        stats.unsignedCount > 0
                          ? { backgroundColor: '#FEF2F2', borderColor: '#FECDD3' }
                          : { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={stats.unsignedCount > 0 ? 'clock-alert-outline' : 'check-decagram'}
                        size={22}
                        color={stats.unsignedCount > 0 ? '#DC2626' : '#059669'}
                      />
                    </View>
                    <View style={styles.heroKpiContentCol}>
                      <Text numberOfLines={1} style={styles.heroKpiTargetLabel}>Status Respon</Text>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.heroKpiTargetValue,
                          stats.unsignedCount > 0 && { color: '#DC2626' },
                        ]}
                      >
                        {stats.unsignedCount > 0 ? `${stats.unsignedCount} Menunggu` : 'Semua Tuntas'}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.heroKpiTargetSub,
                          stats.unsignedCount > 0 && { color: '#B91C1C' },
                        ]}
                      >
                        {stats.unsignedCount > 0 ? 'Perlu tanggapan wali' : `${stats.categoryCount} Bidang Pembinaan`}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* ── 3 Enlarged KPI Cards (Total, Disetujui, Perlu TTD) ── */}
                <View style={styles.kpiGridThree}>
                  {/* Card 1: Total */}
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setStatusFilter('all')}
                    style={[
                      styles.kpiBigCard,
                      statusFilter === 'all' && styles.kpiBigCardActiveEmerald,
                    ]}
                  >
                    <View style={styles.kpiBigTopRow}>
                      <View style={[styles.kpiBigIconWrap, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                        <MaterialCommunityIcons name="notebook-outline" size={17} color="#047857" />
                      </View>
                      <Text style={[styles.kpiBigValue, { color: '#047857' }]}>{stats.total}</Text>
                    </View>
                    <Text numberOfLines={1} style={styles.kpiBigLabel}>Total Catatan</Text>
                  </TouchableOpacity>

                  {/* Card 2: Disetujui */}
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setStatusFilter('signed')}
                    style={[
                      styles.kpiBigCard,
                      statusFilter === 'signed' && styles.kpiBigCardActiveTeal,
                    ]}
                  >
                    <View style={styles.kpiBigTopRow}>
                      <View style={[styles.kpiBigIconWrap, { backgroundColor: '#F0FDFA', borderColor: '#99F6E4' }]}>
                        <MaterialCommunityIcons name="check-decagram" size={17} color="#0D9488" />
                      </View>
                      <Text style={[styles.kpiBigValue, { color: '#0D9488' }]}>{stats.signedCount}</Text>
                    </View>
                    <Text numberOfLines={1} style={styles.kpiBigLabel}>Disetujui</Text>
                  </TouchableOpacity>

                  {/* Card 3: Perlu TTD */}
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setStatusFilter('unsigned')}
                    style={[
                      styles.kpiBigCard,
                      stats.unsignedCount > 0 && styles.kpiBigCardWaitingNotice,
                      statusFilter === 'unsigned' &&
                        (stats.unsignedCount > 0 ? styles.kpiBigCardActiveRed : styles.kpiBigCardActiveAmber),
                    ]}
                  >
                    <View style={styles.kpiBigTopRow}>
                      <View
                        style={[
                          styles.kpiBigIconWrap,
                          stats.unsignedCount > 0
                            ? { backgroundColor: '#FEE2E2', borderColor: '#FECDD3' }
                            : { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={stats.unsignedCount > 0 ? 'clock-alert-outline' : 'clock-outline'}
                          size={17}
                          color={stats.unsignedCount > 0 ? '#DC2626' : '#D97706'}
                        />
                      </View>
                      <Text
                        style={[
                          styles.kpiBigValue,
                          { color: stats.unsignedCount > 0 ? '#DC2626' : '#D97706' },
                        ]}
                      >
                        {stats.unsignedCount}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      {stats.unsignedCount > 0 && <View style={styles.kpiAlertDot} />}
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.kpiBigLabel,
                          stats.unsignedCount > 0 && { color: '#DC2626', fontWeight: '800' },
                        ]}
                      >
                        Perlu TTD
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* ── 2B. TOOLBAR FILTER & PENCARIAN (MUTABA'AH SCREEN STYLE) ── */}
            <View style={styles.containerBlock}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderIconBox}>
                  <MaterialCommunityIcons name="notebook-edit-outline" size={17} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Buku Penghubung</Text>
                  <Text style={styles.sectionSub}>
                    Komunikasi perkembangan ananda antara guru, wali kelas, dan orang tua.
                  </Text>
                </View>
              </View>

              {/* Segmented Switcher (Identik dengan MutabaahScreen) */}
              <View style={styles.segmentedTabWrapper}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setStatusFilter('all')}
                  style={[
                    styles.segmentedTabItem,
                    statusFilter === 'all' && styles.segmentedTabItemActive,
                  ]}
                >
                  <View style={styles.segmentedTabContentRow}>
                    <MaterialCommunityIcons
                      name="notebook-outline"
                      size={14}
                      color={statusFilter === 'all' ? '#FFFFFF' : '#059669'}
                      style={{ marginRight: 4 }}
                    />
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.segmentedTabText,
                        statusFilter === 'all' && styles.segmentedTabTextActive,
                      ]}
                    >
                      Semua
                    </Text>
                    <View style={[styles.segmentedTabBadge, statusFilter === 'all' && styles.segmentedTabBadgeActive]}>
                      <Text style={[styles.segmentedTabBadgeText, statusFilter === 'all' && styles.segmentedTabBadgeTextActive]}>
                        {stats.total}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setStatusFilter('unsigned')}
                  style={[
                    styles.segmentedTabItem,
                    statusFilter === 'unsigned' &&
                      (stats.unsignedCount > 0
                        ? styles.segmentedTabItemActiveRed
                        : styles.segmentedTabItemActiveAmber),
                  ]}
                >
                  <View style={styles.segmentedTabContentRow}>
                    <MaterialCommunityIcons
                      name={stats.unsignedCount > 0 ? 'clock-alert-outline' : 'clock-outline'}
                      size={14}
                      color={
                        statusFilter === 'unsigned'
                          ? '#FFFFFF'
                          : stats.unsignedCount > 0
                          ? '#DC2626'
                          : '#D97706'
                      }
                      style={{ marginRight: 4 }}
                    />
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.segmentedTabText,
                        statusFilter === 'unsigned' && styles.segmentedTabTextActive,
                        statusFilter !== 'unsigned' &&
                          (stats.unsignedCount > 0 ? { color: '#DC2626' } : { color: '#B45309' }),
                      ]}
                    >
                      Perlu TTD
                    </Text>
                    <View
                      style={[
                        styles.segmentedTabBadge,
                        statusFilter === 'unsigned'
                          ? styles.segmentedTabBadgeActive
                          : stats.unsignedCount > 0
                          ? { backgroundColor: '#FEE2E2' }
                          : { backgroundColor: '#FEF3C7' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.segmentedTabBadgeText,
                          statusFilter === 'unsigned'
                            ? styles.segmentedTabBadgeTextActive
                            : stats.unsignedCount > 0
                            ? { color: '#DC2626' }
                            : { color: '#B45309' },
                        ]}
                      >
                        {stats.unsignedCount}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setStatusFilter('signed')}
                  style={[
                    styles.segmentedTabItem,
                    statusFilter === 'signed' && styles.segmentedTabItemActive,
                  ]}
                >
                  <View style={styles.segmentedTabContentRow}>
                    <MaterialCommunityIcons
                      name="check-circle-outline"
                      size={14}
                      color={statusFilter === 'signed' ? '#FFFFFF' : '#059669'}
                      style={{ marginRight: 5 }}
                    />
                    <Text
                      style={[
                        styles.segmentedTabText,
                        statusFilter === 'signed' && styles.segmentedTabTextActive,
                      ]}
                    >
                      Disetujui
                    </Text>
                    <View style={[styles.segmentedTabBadge, statusFilter === 'signed' && styles.segmentedTabBadgeActive]}>
                      <Text style={[styles.segmentedTabBadgeText, statusFilter === 'signed' && styles.segmentedTabBadgeTextActive]}>
                        {stats.signedCount}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Search Box with Clear Button */}
              <View style={styles.searchBox}>
                <MaterialCommunityIcons name="magnify" size={19} color="#059669" />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Cari catatan, topik, atau nama guru..."
                  placeholderTextColor="#94A3B8"
                  style={styles.searchInput}
                />
                {search.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setSearch('')}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <MaterialCommunityIcons name="close-circle" size={17} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Horizontal Category Filter Chips */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filters}
              >
                {dynamicCategories.map((item) => {
                  const isActive = category === item;
                  return (
                    <TouchableOpacity
                      key={item}
                      onPress={() => setCategory(item)}
                      activeOpacity={0.8}
                      style={[styles.filter, isActive && styles.filterActive]}
                    >
                      <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                        {item}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* ── 2C. DAFTAR CATATAN GURU ── */}
            {error ? (
              <View style={styles.errorCard}>
                <View style={styles.errorIconBox}>
                  <MaterialCommunityIcons name="cloud-alert" size={34} color="#E11D48" />
                </View>
                <View style={styles.errorPillBadge}>
                  <Text style={styles.errorPillBadgeText}>Gagal Menghubungkan</Text>
                </View>
                <Text style={styles.errorTitle}>Gagal Memuat Data</Text>
                <Text style={styles.errorDesc}>{error}</Text>
                <TouchableOpacity
                  style={styles.errorRetryBtn}
                  onPress={() => {
                    if (isTeacherOnly) {
                      void loadNotes(undefined, 1, false);
                    } else if (selectedChildId) {
                      void loadNotes(selectedChildId, 1, false);
                    }
                  }}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={['#BE123C', '#E11D48']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.errorRetryGradient}
                  >
                    <MaterialCommunityIcons name="refresh" size={16} color="#FFFFFF" />
                    <Text style={styles.errorRetryText}>Muat Ulang Data</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            ) : null}

            {loading ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator size="large" color="#18A165" />
                <Text style={styles.loadingText}>Memuat catatan buku penghubung...</Text>
              </View>
            ) : filtered.length === 0 ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconBox}>
                  <MaterialCommunityIcons name="notebook-outline" size={36} color="#059669" />
                </View>
                <View style={styles.emptyPillBadge}>
                  <Text style={styles.emptyPillBadgeText}>
                    {statusFilter === 'unsigned'
                      ? 'Menunggu Respon'
                      : statusFilter === 'signed'
                      ? 'Sudah Disetujui'
                      : 'Buku Penghubung'}
                  </Text>
                </View>
                <Text style={styles.emptyTitle}>Belum Ada Catatan</Text>
                <Text style={styles.emptyDesc}>
                  {statusFilter === 'unsigned'
                    ? 'Alhamdulillah, tidak ada catatan guru yang menunggu respon orang tua saat ini.'
                    : statusFilter === 'signed'
                    ? 'Belum ada catatan guru yang sudah ditandatangani untuk kriteria ini.'
                    : 'Belum ada catatan buku penghubung untuk kriteria atau kategori yang dipilih.'}
                </Text>
              </View>
            ) : (
              filtered.map((note) => {
                const status = note.signature_status || 'unsigned';
                const signed = status === 'signed';
                const teacherName =
                  note.teacher?.full_name ||
                  note.teacher?.nama_lengkap ||
                  note.teacher?.name ||
                  'Guru Pengampu';
                const teacherSubject =
                  note.teacher?.subject?.name ||
                  note.subject?.name ||
                  note.teacher?.mapel ||
                  '';
                const theme = getCategoryTheme(note.category || '');

                const isWaitingResponse = !signed || status === 'signed_updated';

                return (
                  <View
                    key={String(note.id)}
                    style={[
                      styles.noteCard,
                      isWaitingResponse
                        ? styles.noteCardWaiting
                        : { borderLeftWidth: 4, borderLeftColor: theme.borderLeft },
                    ]}
                  >
                    <View style={[styles.noteHead, isWaitingResponse ? styles.noteHeadWaiting : styles.noteHeadSigned]}>
                      {/* Baris 1: Avatar Guru, Nama Guru/Mapel, Badge Kategori */}
                      <View style={styles.noteHeadTopRow}>
                        <View
                          style={[
                            styles.teacherIcon,
                            isWaitingResponse
                              ? { backgroundColor: '#FEE2E2', borderColor: '#FECDD3', borderWidth: 1 }
                              : { backgroundColor: theme.badgeBg, borderColor: theme.badgeBorder, borderWidth: 1 },
                          ]}
                        >
                          <MaterialCommunityIcons
                            name={isWaitingResponse ? 'account-clock-outline' : (theme.icon as any)}
                            size={22}
                            color={isWaitingResponse ? '#DC2626' : theme.borderLeft}
                          />
                        </View>
                        <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
                          <Text numberOfLines={1} style={styles.teacherName}>{teacherName}</Text>
                          {teacherSubject ? (
                            <Text numberOfLines={1} style={styles.teacherSubject}>{teacherSubject}</Text>
                          ) : null}
                        </View>
                        <View
                          style={[
                            styles.categoryBadge,
                            isWaitingResponse
                              ? { backgroundColor: '#FEE2E2', borderColor: '#FECDD3', borderWidth: 1 }
                              : {
                                  backgroundColor: theme.badgeBg,
                                  borderColor: theme.badgeBorder,
                                  borderWidth: 1,
                                },
                          ]}
                        >
                          <Text
                            style={[
                              styles.categoryText,
                              isWaitingResponse ? { color: '#DC2626' } : { color: theme.badgeText },
                            ]}
                          >
                            {theme.label}
                          </Text>
                        </View>
                      </View>

                      {/* Baris 2: Meta Pill Santri, Tanggal, dan Status Tunggu */}
                      <View style={styles.noteHeadPillsRow}>
                        {note.student ? (
                          <View
                            style={[
                              styles.noteStudentPill,
                              isWaitingResponse && { backgroundColor: '#FFF1F2', borderColor: '#FECDD3' },
                            ]}
                          >
                            <MaterialCommunityIcons
                              name="account-school-outline"
                              size={11}
                              color={isWaitingResponse ? '#DC2626' : '#059669'}
                            />
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.noteStudentPillText,
                                isWaitingResponse && { color: '#DC2626' },
                              ]}
                            >
                              {note.student?.full_name || note.student?.name}
                            </Text>
                          </View>
                        ) : null}
                        <View style={styles.noteDatePill}>
                          <MaterialCommunityIcons name="calendar-clock-outline" size={11} color="#64748B" />
                          <Text style={styles.noteDateText}>
                            {formatDate(note.date || note.created_at)}
                          </Text>
                        </View>
                        {isWaitingResponse && (
                          <View style={styles.waitingHeaderPill}>
                            <MaterialCommunityIcons name="clock-alert-outline" size={10} color="#DC2626" />
                            <Text style={styles.waitingHeaderPillText}>Tunggu Tanggapan</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Attention banner if waiting response */}
                    {isWaitingResponse && (
                      <View style={styles.waitingAttentionBanner}>
                        <MaterialCommunityIcons name="clock-alert-outline" size={14} color="#DC2626" />
                        <Text style={styles.waitingAttentionText}>
                          {status === 'signed_updated'
                            ? 'Catatan diperbarui guru — Mohon tanda tangan ulang'
                            : 'Status: Menunggu tanggapan & tanda tangan orang tua'}
                        </Text>
                      </View>
                    )}

                    <Text style={styles.noteTitle}>{note.title || 'Catatan Guru'}</Text>
                    <Text style={styles.noteContent}>{note.content || '-'}</Text>

                    {note.follow_up ? (
                      <View style={styles.followUp}>
                        <View style={styles.followUpHeadRow}>
                          <MaterialCommunityIcons name="chat-processing-outline" size={15} color="#047857" />
                          <Text style={styles.followUpLabel}>Tindak Lanjut &amp; Tanggapan Orang Tua:</Text>
                        </View>
                        <Text style={styles.followUpText}>"{note.follow_up}"</Text>
                        {note.signed_at ? (
                          <Text style={styles.signedAtMeta}>
                            Ditandatangani pada: {formatDate(note.signed_at)}
                          </Text>
                        ) : null}
                      </View>
                    ) : null}

                    <View style={styles.noteFooter}>
                      <View
                        style={[
                          styles.statusBadge,
                          signed
                            ? styles.signed
                            : status === 'signed_updated'
                            ? styles.stale
                            : styles.unsignedRed,
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={
                            signed
                              ? 'check-decagram'
                              : status === 'signed_updated'
                              ? 'alert-decagram'
                              : 'clock-alert-outline'
                          }
                          size={14}
                          color={
                            signed
                              ? '#047857'
                              : status === 'signed_updated'
                              ? '#B45309'
                              : '#DC2626'
                          }
                        />
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.statusText,
                            signed
                              ? { color: '#047857' }
                              : status === 'signed_updated'
                              ? { color: '#B45309' }
                              : { color: '#DC2626', fontWeight: '800' },
                          ]}
                        >
                          {signed
                            ? 'Sudah ditandatangani'
                            : status === 'signed_updated'
                            ? 'Perlu TTD ulang'
                            : 'Menunggu tanggapan'}
                        </Text>
                      </View>

                      {/* Tombol Tanda Tangan: Khusus Akun Orang Tua */}
                      {!isTeacherOnly && isParent && !signed && (
                        <TouchableOpacity
                          onPress={() => {
                            if (replyFor === String(note.id)) {
                              setReplyFor(null);
                              setReply('');
                              setAgreedSignature(false);
                            } else {
                              setReplyFor(String(note.id));
                              setReply(note.follow_up || '');
                              setAgreedSignature(false);
                            }
                          }}
                          style={styles.signButtonRed}
                          activeOpacity={0.85}
                        >
                          <LinearGradient
                            colors={['#DC2626', '#B91C1C']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.signButtonGradientRed}
                          >
                            <MaterialCommunityIcons name="draw" size={13} color="#FFF" style={{ marginRight: 4 }} />
                            <Text style={styles.signButtonText}>
                              {replyFor === String(note.id) ? 'Tutup Lembar' : 'Tanggapi & TTD'}
                            </Text>
                          </LinearGradient>
                        </TouchableOpacity>
                      )}

                      {/* Tombol Ubah & Hapus: Khusus Akun Guru Pengajar */}
                      {isTeacherOnly && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                          <TouchableOpacity
                            onPress={() => {
                              setEditingNote(note);
                              setNoteForm({
                                student_id: note.student_id || note.student?.id || '',
                                title: note.title || '',
                                content: note.content || '',
                                category: note.category || 'Akademik',
                                priority: note.priority || 'medium',
                              });
                              setNoteModalVisible(true);
                            }}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 4,
                              paddingHorizontal: 10,
                              paddingVertical: 5,
                              borderRadius: 10,
                              backgroundColor: '#FEF3C7',
                              borderWidth: 1,
                              borderColor: '#FDE68A',
                            }}
                            activeOpacity={0.8}
                          >
                            <MaterialCommunityIcons name="pencil-outline" size={12} color="#D97706" />
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#B45309' }}>Ubah</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleDeleteTeacherNote(note)}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 4,
                              paddingHorizontal: 10,
                              paddingVertical: 5,
                              borderRadius: 10,
                              backgroundColor: '#FFE4E6',
                              borderWidth: 1,
                              borderColor: '#FECDD3',
                            }}
                            activeOpacity={0.8}
                          >
                            <MaterialCommunityIcons name="trash-can-outline" size={12} color="#E11D48" />
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#BE123C' }}>Hapus</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>

                    {/* Form Tanggapan & Tanda Tangan dengan Digital Agreement Checkbox */}
                    {replyFor === String(note.id) && (
                      <View style={styles.replyBox}>
                        <View style={styles.replyBoxHeaderRow}>
                          <View style={styles.replyBoxHeaderIcon}>
                            <MaterialCommunityIcons name="draw" size={15} color="#059669" />
                          </View>
                          <Text style={styles.replyBoxTitle}>
                            Lembar Tanggapan & Persetujuan Orang Tua
                          </Text>
                        </View>
                        <TextInput
                          value={reply}
                          onChangeText={setReply}
                          multiline
                          maxLength={5000}
                          placeholder="Tuliskan respon, apresiasi, atau tindak lanjut pembinaan di rumah (opsional)..."
                          placeholderTextColor="#94A3B8"
                          style={styles.replyInput}
                        />

                        {/* Digital Agreement Checkbox (Harmonized dengan Mutabaah & Web Dashboard) */}
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => setAgreedSignature((prev) => !prev)}
                          style={[
                            styles.agreementRow,
                            agreedSignature && styles.agreementRowChecked,
                          ]}
                        >
                          <View
                            style={[
                              styles.agreementCheckbox,
                              agreedSignature && styles.agreementCheckboxChecked,
                            ]}
                          >
                            {agreedSignature && (
                              <MaterialCommunityIcons name="check" size={13} color="#FFF" />
                            )}
                          </View>
                          <Text style={styles.agreementText}>
                            Saya sebagai orang tua/wali murid telah membaca, memahami, dan menyetujui lembar catatan buku penghubung ananda.
                          </Text>
                        </TouchableOpacity>

                        <View style={styles.replyActions}>
                          <TouchableOpacity
                            disabled={signing}
                            onPress={() => {
                              setReplyFor(null);
                              setReply('');
                              setAgreedSignature(false);
                            }}
                            style={styles.cancelButton}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.cancelText}>Batal</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            disabled={signing || !agreedSignature}
                            onPress={() => void signNote(note)}
                            style={[
                              styles.confirmButton,
                              (!agreedSignature || signing) && styles.confirmButtonDisabled,
                            ]}
                            activeOpacity={0.85}
                          >
                            {signing ? (
                              <ActivityIndicator size="small" color="#FFF" />
                            ) : (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                <MaterialCommunityIcons name="send" size={13} color="#FFF" />
                                <Text style={styles.confirmText}>Setujui & Tanda Tangani</Text>
                              </View>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })
            )}

            {Number(meta?.current_page || 1) < Number(meta?.last_page || 1) && (
              <TouchableOpacity
                disabled={loadingMore}
                onPress={() => void loadMore()}
                style={styles.moreButton}
              >
                {loadingMore ? (
                  <ActivityIndicator color="#047857" />
                ) : (
                  <Text style={styles.moreText}>Muat catatan berikutnya</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </Animated.ScrollView>
      </View>

      {/* ── 3. MODALS IDENTITAS SANTRI (KTS, QR, Menu Cepat, Rapor Mingguan) ── */}
      <StudentIdCardModal
        visible={!!selectedIdCardStudent}
        student={selectedIdCardStudent}
        onClose={() => setSelectedIdCardStudent(null)}
      />
      <StudentQrModal
        visible={!!selectedQrStudent}
        student={selectedQrStudent}
        onClose={() => setSelectedQrStudent(null)}
      />
      <StudentMenuModal
        visible={!!selectedMenuStudent}
        student={selectedMenuStudent}
        navigation={navigation}
        onClose={() => setSelectedMenuStudent(null)}
      />
      <StudentWeeklyReportModal
        visible={!!selectedWeeklyStudent}
        student={selectedWeeklyStudent}
        onClose={() => setSelectedWeeklyStudent(null)}
      />

      {feedbackModal && (
        <AppFeedbackModal
          visible={feedbackModal.visible}
          type={feedbackModal.type || 'info'}
          title={feedbackModal.title}
          message={feedbackModal.message}
          onClose={() => setFeedbackModal(null)}
        />
      )}

      {/* ── TEACHER FLOATING ACTION BUTTON ── */}
      {isTeacherOnly && (
        <TouchableOpacity
          style={[styles.teacherFab, { bottom: bottomInset + 16 }]}
          onPress={() => {
            setEditingNote(null);
            setNoteForm({
              student_id: '',
              title: '',
              content: '',
              category: 'Akademik',
              priority: 'medium',
            });
            setNoteModalVisible(true);
          }}
          activeOpacity={0.88}
        >
          <LinearGradient
            colors={['#059669', '#0E5C44']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.teacherFabGradient}
          >
            <MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" />
            <Text style={styles.teacherFabText}>Tulis Catatan</Text>
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* ── MODAL TULIS / UBAH CATATAN SANTRI ── */}
      <Modal
        visible={noteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!savingNote) setNoteModalVisible(false);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalHeaderIconWrap}>
                <MaterialCommunityIcons
                  name={editingNote ? 'pencil-box-outline' : 'notebook-plus-outline'}
                  size={22}
                  color="#059669"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalHeaderTitle}>
                  {editingNote ? 'Ubah Catatan Santri' : 'Tulis Catatan Santri'}
                </Text>
                <Text style={styles.modalHeaderSubtitle}>
                  Buku Penghubung Guru &amp; Wali Murid
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  if (!savingNote) setNoteModalVisible(false);
                }}
                style={styles.modalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ maxHeight: 420 }}
              contentContainerStyle={{ paddingBottom: 16 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Pilih Siswa (jika buat baru) */}
              {!editingNote && (
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Pilih Santri *</Text>
                  {loadingStudents ? (
                    <ActivityIndicator size="small" color="#059669" style={{ marginVertical: 8 }} />
                  ) : teacherStudents.length === 0 ? (
                    <Text style={{ fontSize: 11, color: '#94A3B8', fontStyle: 'italic' }}>
                      Tidak ada santri pada rombel pengajar.
                    </Text>
                  ) : (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
                    >
                      {teacherStudents.map((st) => {
                        const isSelected = String(st.id) === String(noteForm.student_id);
                        const sName = st.nama_lengkap || st.full_name || st.name;
                        const sClass = st.kelas?.nama_kelas || st.kelas?.name || '';
                        return (
                          <TouchableOpacity
                            key={String(st.id)}
                            onPress={() => setNoteForm((prev) => ({ ...prev, student_id: String(st.id) }))}
                            style={[
                              styles.studentSelectChip,
                              isSelected && styles.studentSelectChipActive,
                            ]}
                            activeOpacity={0.8}
                          >
                            <Text
                              style={[
                                styles.studentSelectChipText,
                                isSelected && styles.studentSelectChipTextActive,
                              ]}
                            >
                              {sName} {sClass ? `(${sClass})` : ''}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  )}
                </View>
              )}

              {/* Kategori */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Kategori Perkembangan *</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 6, paddingVertical: 4 }}
                >
                  {['Akademik', 'Perilaku', 'Kedisiplinan', 'Prestasi', 'Konseling', 'Tahfizh', 'Ibadah', 'Kesehatan'].map((catItem) => {
                    const isSelected = noteForm.category === catItem;
                    return (
                      <TouchableOpacity
                        key={catItem}
                        onPress={() => setNoteForm((prev) => ({ ...prev, category: catItem }))}
                        style={[
                          styles.catSelectChip,
                          isSelected && styles.catSelectChipActive,
                        ]}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.catSelectChipText,
                            isSelected && styles.catSelectChipTextActive,
                          ]}
                        >
                          {catItem}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Tingkat Prioritas */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Tingkat Urgensi *</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {[
                    { id: 'low', label: 'Rendah' },
                    { id: 'medium', label: 'Sedang' },
                    { id: 'high', label: 'Tinggi' },
                    { id: 'urgent', label: 'Mendesak' },
                  ].map((p) => {
                    const isSelected = noteForm.priority === p.id;
                    return (
                      <TouchableOpacity
                        key={p.id}
                        onPress={() => setNoteForm((prev) => ({ ...prev, priority: p.id }))}
                        style={[
                          styles.priorityChip,
                          isSelected && styles.priorityChipActive,
                        ]}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.priorityChipText,
                            isSelected && styles.priorityChipTextActive,
                          ]}
                        >
                          {p.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Judul Catatan */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Judul Ringkas *</Text>
                <TextInput
                  value={noteForm.title}
                  onChangeText={(val) => setNoteForm((prev) => ({ ...prev, title: val }))}
                  placeholder="Contoh: Perkembangan Hafalan Juz 30"
                  placeholderTextColor="#94A3B8"
                  style={styles.formTextInput}
                />
              </View>

              {/* Isi Catatan */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Isi Catatan Pembinaan *</Text>
                <TextInput
                  value={noteForm.content}
                  onChangeText={(val) => setNoteForm((prev) => ({ ...prev, content: val }))}
                  placeholder="Tuliskan evaluasi, saran pembinaan, atau apresiasi untuk ananda..."
                  placeholderTextColor="#94A3B8"
                  style={[styles.formTextInput, { minHeight: 90, textAlignVertical: 'top' }]}
                  multiline
                  numberOfLines={4}
                />
              </View>
            </ScrollView>

            {/* Modal Actions */}
            <View style={styles.modalFooterRow}>
              <TouchableOpacity
                onPress={() => {
                  if (!savingNote) setNoteModalVisible(false);
                }}
                style={styles.modalCancelBtn}
                disabled={savingNote}
              >
                <Text style={styles.modalCancelBtnText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void handleSaveTeacherNote()}
                style={styles.modalSubmitBtn}
                disabled={savingNote}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={['#059669', '#0E5C44']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.modalSubmitGradient}
                >
                  {savingNote ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="content-save-check-outline" size={16} color="#FFFFFF" />
                      <Text style={styles.modalSubmitBtnText}>
                        {editingNote ? 'Simpan Perubahan' : 'Terbitkan Catatan'}
                      </Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  sheetContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  screen: {
    flex: 1,
  },
  mainScrollContent: {
    paddingBottom: 94,
  },
  bodyContentWrapper: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },

  // ── Static Top Bar (identik TahfizhScreen) ──
  staticTopBarWrapper: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.22)',
    paddingBottom: 14,
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 4,
  },
  heroDecorCircle1: {
    position: 'absolute',
    top: -30,
    right: -20,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  heroDecorCircle2: {
    position: 'absolute',
    bottom: -20,
    left: 20,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  staticTopBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 6,
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
  heroTitleCenterCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  heroModuleTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  heroModuleSubtitle: {
    fontSize: 11.5,
    fontWeight: '600',
    fontFamily: 'Nunito_600SemiBold',
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginTop: 1,
  },
  heroBellDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },

  // ── Container & Student Block ──
  containerBlock: {
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DDEBE4',
    padding: 14,
    marginBottom: 14,
  },
  studentContainerBlock: {
    marginBottom: 10,
    backgroundColor: 'transparent',
    borderWidth: 0,
    padding: 0,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionHeaderTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  studentCardCountBadge: {
    backgroundColor: '#EBF8F2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  studentCardCountBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#084835',
  },
  singleHeroCardContainer: {
    width: '100%',
    alignSelf: 'stretch',
  },
  heroCardScrollContainer: {
    marginHorizontal: -16,
  },
  studentCardsTrack: {
    gap: STUDENT_CARD_GAP,
    paddingBottom: 4,
    zIndex: 1,
  },
  paginationDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  paginationDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#CBD5E1',
  },
  paginationDotActive: {
    width: 16,
    backgroundColor: '#18A165',
  },

  // ── Tahfizh & Mutaba'ah Hero KPI Group Card ──
  tahfizhGroupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 12,
    borderWidth: 1.5,
    marginBottom: 14,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  tahfizhGroupCardEmerald: {
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
  },
  tahfizhGroupCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 11,
    borderRadius: 13,
    borderWidth: 1,
  },
  tahfizhGroupCardHeaderRowEmerald: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  tahfizhGroupCardHeaderGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 11,
    borderRadius: 14,
  },
  tahfizhGroupCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flex: 1,
    marginRight: 8,
  },
  tahfizhGroupHeaderIconBox: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  tahfizhGroupHeaderIconBoxEmerald: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
  },
  tahfizhGroupHeaderIconBoxWhite: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tahfizhGroupCardTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    lineHeight: 17,
    letterSpacing: -0.2,
  },
  tahfizhGroupCardTitleWhite: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  tahfizhGroupCardSub: {
    fontSize: 10.5,
    fontWeight: '600',
    lineHeight: 14,
    marginTop: 2,
  },
  tahfizhGroupCardSubWhite: {
    fontSize: 10,
    fontWeight: '600',
    color: '#A7F3D0',
    marginTop: 1.5,
  },
  tahfizhGroupActionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 0,
  },
  tahfizhGroupActionBadgeEmerald: {
    backgroundColor: '#FFFFFF',
    borderColor: '#A7F3D0',
  },
  tahfizhGroupActionBadgeWhite: {
    backgroundColor: '#FFFFFF',
    borderColor: '#A7F3D0',
  },
  tahfizhGroupActionBadgeRed: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECDD3',
  },
  tahfizhGroupActionBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  heroKpiRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  heroKpiCard: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  progressCircleBox: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressCircleRing: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 3,
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressCircleText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#047857',
  },
  heroKpiContentCol: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  heroKpiTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  heroKpiSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  heroProgressBarTrack: {
    height: 4.5,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    marginTop: 5,
    overflow: 'hidden',
  },
  heroProgressBarFill: {
    height: '100%',
    backgroundColor: '#059669',
    borderRadius: 3,
  },
  targetIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroKpiTargetLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  heroKpiTargetValue: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 1,
  },
  heroKpiTargetSub: {
    fontSize: 9.5,
    color: '#059669',
    fontWeight: '600',
    marginTop: 2,
  },

  // ── Quick Filter Enlarged KPI Grid (3 Columns) ──
  kpiGridThree: {
    flexDirection: 'row',
    gap: 9,
    marginTop: 2,
  },
  kpiBigCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  kpiBigCardWaitingNotice: {
    borderColor: '#FECDD3',
    backgroundColor: '#FFFDFD',
  },
  kpiBigCardActiveEmerald: {
    borderColor: '#059669',
    backgroundColor: '#F0FDF4',
    shadowColor: '#059669',
    shadowOpacity: 0.15,
    elevation: 3,
  },
  kpiBigCardActiveTeal: {
    borderColor: '#0D9488',
    backgroundColor: '#F0FDFA',
    shadowColor: '#0D9488',
    shadowOpacity: 0.15,
    elevation: 3,
  },
  kpiBigCardActiveRed: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
    shadowColor: '#DC2626',
    shadowOpacity: 0.18,
    elevation: 3,
  },
  kpiBigCardActiveAmber: {
    borderColor: '#D97706',
    backgroundColor: '#FFFBEB',
  },
  kpiBigTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  kpiBigIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiBigValue: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  kpiBigLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  kpiBigAlertBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: '#FECDD3',
  },
  kpiBigAlertBadgeText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#DC2626',
  },

  // Legacy mini KPI fallbacks
  kpiMiniGrid: {
    flexDirection: 'row',
    gap: 7,
  },
  kpiMiniCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  kpiMiniCardActiveEmerald: {
    borderColor: '#059669',
    backgroundColor: '#F0FDF4',
  },
  kpiMiniCardActiveTeal: {
    borderColor: '#0D9488',
    backgroundColor: '#F0FDFA',
  },
  kpiMiniCardActiveAmber: {
    borderColor: '#D97706',
    backgroundColor: '#FFFBEB',
  },
  kpiMiniTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  kpiMiniIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiMiniValue: {
    fontSize: 13,
    fontWeight: '900',
  },
  kpiMiniLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
  },
  kpiAlertDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },

  // ── Toolbar Header & Segmented Tabs ──
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 12,
  },
  sectionHeaderIconBox: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionSub: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1.5,
  },
  segmentedTabWrapper: {
    flexDirection: 'row',
    backgroundColor: '#ECFDF5',
    borderRadius: 16,
    padding: 4,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  segmentedTabItem: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  segmentedTabItemActive: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  segmentedTabItemActiveAmber: {
    backgroundColor: '#D97706',
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  segmentedTabItemActiveRed: {
    backgroundColor: '#DC2626',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  segmentedTabContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  segmentedTabText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },
  segmentedTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  segmentedTabBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
    backgroundColor: 'rgba(5, 150, 105, 0.12)',
  },
  segmentedTabBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  segmentedTabBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#065F46',
  },
  segmentedTabBadgeTextActive: {
    color: '#FFFFFF',
  },

  // ── Search & Filter Chips ──
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    borderRadius: 13,
    paddingHorizontal: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchInput: {
    flex: 1,
    color: '#0F172A',
    fontSize: 12,
    marginLeft: 7,
  },
  filters: {
    gap: 7,
    paddingTop: 11,
  },
  filter: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  filterText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#475569',
  },
  filterTextActive: {
    color: '#FFFFFF',
  },

  // ── Loading, Empty, and Error States (Identik MutabaahScreen) ──
  centerLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    gap: 8,
  },
  loadingText: {
    fontSize: 11.5,
    color: '#059669',
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginVertical: 8,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  emptyIconBox: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyPillBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    marginBottom: 6,
  },
  emptyPillBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  emptyTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 2,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 11.5,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 17,
    maxWidth: '92%',
  },
  errorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FECDD3',
    marginVertical: 8,
    shadowColor: '#E11D48',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  errorIconBox: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: '#FFF1F2',
    borderWidth: 1.5,
    borderColor: '#FECDD3',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  errorPillBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    backgroundColor: '#FFE4E6',
    marginBottom: 6,
  },
  errorPillBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#BE123C',
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
    textAlign: 'center',
  },
  errorDesc: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    maxWidth: '92%',
  },
  errorRetryBtn: {
    marginTop: 14,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#E11D48',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  errorRetryGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    gap: 8,
  },
  errorRetryText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ── Note Card & Items ──
  noteCard: {
    borderRadius: 20,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  noteCardWaiting: {
    borderRadius: 20,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#FECDD3',
    borderLeftWidth: 5,
    borderLeftColor: '#DC2626',
    marginBottom: 14,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  noteHead: {
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  noteHeadWaiting: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
  },
  noteHeadSigned: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  noteHeadTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  noteHeadPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
  },
  waitingHeaderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEE2E2',
    borderWidth: 0.5,
    borderColor: '#FECDD3',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  waitingHeaderPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#DC2626',
  },
  waitingAttentionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  waitingAttentionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
    flex: 1,
  },
  teacherIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teacherName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  teacherSubject: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 1,
  },
  noteMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  noteStudentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    maxWidth: 160,
  },
  noteStudentPillText: {
    fontSize: 9.5,
    color: '#047857',
    fontWeight: '700',
    marginLeft: 3,
  },
  noteDatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  noteDateText: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '600',
    marginLeft: 3,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#D1FAE5',
    flexShrink: 0,
    alignSelf: 'flex-start',
  },
  categoryText: {
    color: '#047857',
    fontSize: 10,
    fontWeight: '800',
  },
  noteTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 13,
    lineHeight: 20,
  },
  noteContent: {
    fontSize: 12.5,
    lineHeight: 20,
    color: '#334155',
    marginTop: 7,
  },
  followUp: {
    backgroundColor: '#F0FDF4',
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  followUpHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  followUpLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
    textTransform: 'uppercase',
  },
  followUpText: {
    fontSize: 11.5,
    lineHeight: 18,
    color: '#166534',
    fontStyle: 'italic',
  },
  signedAtMeta: {
    fontSize: 10,
    color: '#059669',
    fontWeight: '600',
    marginTop: 6,
    fontStyle: 'italic',
  },
  noteFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 14,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderWidth: 1,
    flexShrink: 1,
  },
  signed: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  stale: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  unsigned: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
  },
  unsignedRed: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FECDD3',
  },
  statusText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#475569',
  },
  signButton: {
    backgroundColor: '#059669',
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  signButtonRed: {
    borderRadius: 11,
    overflow: 'hidden',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  signButtonGradientRed: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  signButtonText: {
    color: '#FFF',
    fontSize: 10.5,
    fontWeight: '800',
  },
  replyBox: {
    marginTop: 13,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  replyBoxHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 9,
  },
  replyBoxHeaderIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  replyBoxTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  replyInput: {
    minHeight: 88,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 12,
    fontSize: 12,
    color: '#0F172A',
    textAlignVertical: 'top',
    backgroundColor: '#FFFFFF',
  },
  agreementRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginTop: 11,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
  },
  agreementRowChecked: {
    backgroundColor: '#E6F9F0',
    borderColor: '#059669',
  },
  agreementCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    marginTop: 1,
  },
  agreementCheckboxChecked: {
    backgroundColor: '#059669',
  },
  agreementText: {
    flex: 1,
    fontSize: 10.5,
    lineHeight: 16,
    color: '#064E3B',
    fontWeight: '600',
  },
  replyActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  cancelButton: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#F1F5F9',
  },
  cancelText: {
    color: '#475569',
    fontSize: 10.5,
    fontWeight: '800',
  },
  confirmButton: {
    minWidth: 148,
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 9,
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  confirmButtonDisabled: {
    backgroundColor: '#94A3B8',
    opacity: 0.7,
    shadowOpacity: 0,
    elevation: 0,
  },
  confirmText: {
    color: '#FFF',
    fontSize: 10.5,
    fontWeight: '800',
  },
  moreButton: {
    alignItems: 'center',
    borderRadius: 14,
    padding: 13,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    marginBottom: 16,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  moreText: {
    color: '#047857',
    fontSize: 11.5,
    fontWeight: '800',
  },

  // Dual role toggle bar
  dualRolePillContainer: {
    flexDirection: 'row',
    backgroundColor: '#ECFDF5',
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginBottom: 12,
    gap: 4,
  },
  dualRolePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 12,
  },
  dualRolePillActive: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  dualRolePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#047857',
  },
  dualRolePillTextActive: {
    color: '#FFFFFF',
  },

  // Teacher FAB
  teacherFab: {
    position: 'absolute',
    right: 20,
    borderRadius: 28,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 99,
  },
  teacherFabGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 28,
  },
  teacherFabText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // Modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalHeaderIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalHeaderSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 1,
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
  },
  formGroup: {
    marginBottom: 12,
  },
  formLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  formTextInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    color: '#0F172A',
  },
  studentSelectChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  studentSelectChipActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  studentSelectChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  studentSelectChipTextActive: {
    color: '#047857',
    fontWeight: '800',
  },
  catSelectChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  catSelectChipActive: {
    backgroundColor: '#059669',
    borderColor: '#047857',
  },
  catSelectChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  catSelectChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  priorityChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  priorityChipActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  priorityChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  priorityChipTextActive: {
    color: '#B45309',
    fontWeight: '800',
  },
  modalFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  modalCancelBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  modalSubmitBtn: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalSubmitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  modalSubmitBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

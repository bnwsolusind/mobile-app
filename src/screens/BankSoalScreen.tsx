import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
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
import { useAuthStore } from '../stores/authStore';
import { getApiErrorMessage } from '../services/api';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import {
  getProfileImageUrl,
  DEFAULT_STUDENT_BOY_AVATAR,
  DEFAULT_STUDENT_GIRL_AVATAR,
} from '../utils/profile';
import { offlineCache } from '../utils/offlineCache';
import { useActiveChildStore } from '../stores/activeChildStore';
import { useNotificationBadgeStore } from '../stores/notificationBadgeStore';
import { useNavigationHistoryStore } from '../stores/navigationHistoryStore';
import { StudentHeroCard } from '../components/StudentHeroCard';
import { StudentStickyHeader, resolveStudentDisplay, useStickyScroll } from '../components/StudentStickyHeader';
import { TeacherStickyHeader } from '../components/TeacherStickyHeader';
import { TeacherHeroCard } from '../components/TeacherHeroCard';
import { StudentIdCardModal } from '../components/StudentIdCardModal';
import { StudentQrModal } from '../components/StudentQrModal';
import { StudentMenuModal } from '../components/StudentMenuModal';
import { StudentWeeklyReportModal } from '../components/StudentWeeklyReportModal';

import { isParentRole, isStudentRole, isTeacherRole, isTuRole, isPrincipalRole, isSuperAdminRole } from '../utils/roles';
import TeacherBankSoalWorkspace from '../components/teacher/TeacherBankSoalWorkspace';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const STUDENT_CARD_GAP = 12;
const STUDENT_PEEK_WIDTH = 26;
const STUDENT_CARD_WIDTH = Math.round(SCREEN_WIDTH - (STUDENT_PEEK_WIDTH * 2) - STUDENT_CARD_GAP);
const STUDENT_SNAP_INTERVAL = STUDENT_CARD_WIDTH + STUDENT_CARD_GAP;

export type BankSoalItem = {
  id: string;
  kode_soal?: string;
  pertanyaan: string;
  tipe_soal: string;
  opsi_a?: string;
  opsi_b?: string;
  opsi_c?: string;
  opsi_d?: string;
  opsi_e?: string;
  kunci_jawaban?: string;
  pembahasan?: string;
  poin?: number;
  tingkat_kesulitan?: string;
  indikator?: string;
  gambar_path?: string;
  mata_pelajaran_id?: string;
  subject?: { id?: string; name?: string; code?: string };
  kisi_kisi?: {
    id?: string;
    judul_kisi?: string;
    jenis_ujian?: string;
    guru?: { id?: string; name?: string; nama_lengkap?: string; full_name?: string };
    kelas?: { id?: string; name?: string; nama_kelas?: string };
  };
};

export type SubjectGroup = {
  id: string;
  name: string;
  code?: string;
  questionsCount: number;
  questions: BankSoalItem[];
  teacherName?: string;
};

export default function BankSoalScreen({ route }: any) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 36 : 16);
  const navigation = useNavigation<any>();
  const user = useAuthStore((state) => state.user);
  const roles = useAuthStore((state) => state.roles);
  const userRoles = useMemo(() => (roles?.length ? roles : user?.roles || []), [roles, user?.roles]);
  const isParent = isParentRole(userRoles);
  const isTeacher = isTeacherRole(userRoles);
  const isStaff = isTuRole(userRoles) || isPrincipalRole(userRoles) || isSuperAdminRole(userRoles);
  const isTeacherOrStaff = isTeacher || isStaff;

  if (isTeacherOrStaff) {
    return <TeacherBankSoalWorkspace navigation={navigation} route={route} />;
  }

  const globalActiveChildId = useActiveChildStore((state) => state.activeChildId);
  const studentScrollRef = useRef<ScrollView>(null);
  const [children, setChildren] = useState<any[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(() => {
    const fromRoute = route?.params?.child_id || route?.params?.student_id;
    if (fromRoute) return String(fromRoute);
    const fromStore = useActiveChildStore.getState().activeChildId;
    return fromStore ? String(fromStore) : undefined;
  });
  const [activeChildIndex, setActiveChildIndex] = useState(0);
  const handledParamIdRef = useRef<string | null>(null);
  const [studentInfo, setStudentInfo] = useState<any>(null);

  // ── Sticky header bersama ──
  const isTeacherOnly = false;
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 0);
  const { scrollY, handleMainScroll } = useStickyScroll();
  const unreadNotificationCount = useNotificationBadgeStore((state) => state.unreadNotificationCount);

  // ── Loop carousel (identik pola ScheduleScreen) ──
  const studentCardWidth = useMemo(() => {
    return children.length > 1
      ? SCREEN_WIDTH - 16 - STUDENT_CARD_GAP - STUDENT_PEEK_WIDTH
      : SCREEN_WIDTH - 32;
  }, [children.length]);
  const studentSnapInterval = useMemo(() => studentCardWidth + STUDENT_CARD_GAP, [studentCardWidth]);
  const studentTrackPad = useMemo(() => (SCREEN_WIDTH - studentCardWidth) / 2, [studentCardWidth]);
  const studentLoopCount = children.length > 1 ? children.length : 0;
  const safeCenter = studentLoopCount === 0
    ? 0
    : ((activeChildIndex % studentLoopCount) + studentLoopCount) % studentLoopCount;
  const loopWindow = useMemo(() => {
    if (studentLoopCount === 0) return { list: children, realIdx: [0] };
    const n = studentLoopCount;
    const prev = (safeCenter - 1 + n) % n;
    const next = (safeCenter + 1) % n;
    return { list: [children[prev], children[safeCenter], children[next]], realIdx: [prev, safeCenter, next] };
  }, [children, studentLoopCount, safeCenter]);
  const centerLoopOffset = studentSnapInterval;
  const recenterLoop = (): void => {
    if (studentLoopCount === 0) return;
    studentScrollRef.current?.scrollTo({ x: centerLoopOffset, animated: false });
  };
  const syncLoopChildId = (realIdx: number): void => {
    const selChild = children[realIdx];
    const sid = selChild?.id || selChild?.student_id;
    if (sid) {
      const strSid = String(sid);
      setSelectedChildId(strSid);
      useActiveChildStore.getState().setActiveChildId(strSid);
      setSelectedSubjectModal(null);
    }
  };
  const goToLoopChild = useCallback((target: number): void => {
    if (studentLoopCount === 0) return;
    const n = studentLoopCount;
    const cur = ((activeChildIndex % n) + n) % n;
    const tgt = ((target % n) + n) % n;
    if (tgt === cur) { recenterLoop(); return; }
    const fwd = (tgt - cur + n) % n;
    if (fwd === 1) {
      setActiveChildIndex(tgt); syncLoopChildId(tgt);
      studentScrollRef.current?.scrollTo({ x: centerLoopOffset * 2, animated: true }); return;
    }
    if (fwd === n - 1) {
      setActiveChildIndex(tgt); syncLoopChildId(tgt);
      studentScrollRef.current?.scrollTo({ x: 0, animated: true }); return;
    }
    setActiveChildIndex(tgt); syncLoopChildId(tgt); recenterLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentLoopCount, activeChildIndex, centerLoopOffset, children]);

  // ── Animated fade card on scroll ──
  const bodyCardOpacity = useMemo(() => scrollY.interpolate({ inputRange: [45, 105], outputRange: [1, 0], extrapolate: 'clamp' }), [scrollY]);
  const bodyCardTranslateY = useMemo(() => scrollY.interpolate({ inputRange: [45, 105], outputRange: [0, -16], extrapolate: 'clamp' }), [scrollY]);

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

  const [selectedIdCardStudent, setSelectedIdCardStudent] = useState<any>(null);
  const [selectedQrStudent, setSelectedQrStudent] = useState<any>(null);
  const [selectedMenuStudent, setSelectedMenuStudent] = useState<any>(null);
  const [selectedWeeklyStudent, setSelectedWeeklyStudent] = useState<any>(null);

  const openIdCard = (student: any) => setSelectedIdCardStudent(student);
  const openQrCard = (student: any) => setSelectedQrStudent(student);
  const openMenuModal = (student: any) => setSelectedMenuStudent(student);
  const openWeeklyReport = (student: any) => setSelectedWeeklyStudent(student);

  // ── Data & Subject States ──
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<BankSoalItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubjectModal, setSelectedSubjectModal] = useState<SubjectGroup | null>(null);

  // Interactive study mode: tracking user selected option and revealed answers
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [revealedSolutions, setRevealedSolutions] = useState<Record<string, boolean>>({});

  // Reset pengerjaan latihan & modal jika siswa berganti
  useEffect(() => {
    setSelectedAnswers({});
    setRevealedSolutions({});
    setSelectedSubjectModal(null);
  }, [selectedChildId]);

  // 1. Load Children if parent with offline cache
  useEffect(() => {
    let isMounted = true;
    if (isParent) {
      const targetChildId = route?.params?.child_id || route?.params?.student_id || globalActiveChildId;
      const childCacheKey = offlineCache.buildKey('bank_soal_children', user?.id);
      void (async () => {
        const cached = await offlineCache.get<any[]>(childCacheKey);
        if (cached && isMounted && cached.length > 0) {
          setChildren(cached);
          if (!selectedChildId) {
            const initId = targetChildId
              ? String(targetChildId)
              : String(cached[0]?.id || cached[0]?.student_id);
            setSelectedChildId(initId);
            const foundIdx = cached.findIndex((c: any) => String(c.id || c.student_id) === initId);
            if (foundIdx >= 0) setActiveChildIndex(foundIdx);
          }
        }
      })();

      mobileApiService.getPortalChildren()
        .then((res) => {
          const list = unwrapApiData<any[]>(res) || [];
          if (isMounted && list.length > 0) {
            setChildren(list);
            if (targetChildId) {
              setSelectedChildId(String(targetChildId));
              const foundIdx = list.findIndex((c: any) => String(c.id || c.student_id) === String(targetChildId));
              if (foundIdx >= 0) setActiveChildIndex(foundIdx);
            } else if (!selectedChildId) {
              setSelectedChildId(String(list[0]?.id || list[0]?.student_id));
              setActiveChildIndex(0);
            }
            void offlineCache.set(childCacheKey, list);
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [isParent, user?.id, globalActiveChildId]);

  // 2. Fetch Bank Soal Questions
  const loadBankSoal = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);

    const targetChild = isParent ? selectedChildId : undefined;
    const cacheKey = offlineCache.buildKey('bank_soal_list', user?.id, targetChild || 'self');

    const cached = await offlineCache.get<{ questions: BankSoalItem[]; student: any }>(cacheKey);
    if (cached && !isRefresh) {
      setQuestions(cached.questions || []);
      if (cached.student) setStudentInfo(cached.student);
      setLoading(false);
    }

    try {
      const response = isTeacher
        ? await mobileApiService.getTeacherBankSoal({ per_page: 50 })
        : await mobileApiService.getPortalBankSoal(targetChild, { per_page: 50 });
      let items: BankSoalItem[] = [];
      let studentData: any = null;

      if (response && response.data) {
        if (Array.isArray(response.data)) {
          items = response.data;
        } else if (response.data.data && Array.isArray(response.data.data)) {
          items = response.data.data;
        }
        studentData = response.student || response.data.student || null;
      }

      setQuestions(items);
      if (studentData) setStudentInfo(studentData);
      void offlineCache.set(cacheKey, { questions: items, student: studentData });
    } catch (err: any) {
      console.log('Error fetching bank soal:', err);
      if (!cached) {
        setError(getApiErrorMessage(err, 'Gagal memuat bank soal dan latihan.'));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isParent, selectedChildId, user?.id]);

  useEffect(() => {
    void loadBankSoal();
  }, [loadBankSoal]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void loadBankSoal(true);
  }, [loadBankSoal]);

  // Active student display
  const activeStudent = useMemo(() => {
    if (isParent && children.length > 0) {
      return children.find((c) => String(c.id || c.student_id) === String(selectedChildId)) || children[0];
    }
    return studentInfo || (user as any)?.student || user;
  }, [isParent, children, selectedChildId, studentInfo, user]);

  const { displayName, nis: resolvedNis, unit: resolvedUnit, kelas: resolvedClass } = useMemo(
    () => resolveStudentDisplay(activeStudent, user),
    [activeStudent, user]
  );
  const resolvedName = displayName;

  // ── Subject Groups Calculation (Sesuai Siswa Aktif) ──
  const subjectGroups = useMemo<SubjectGroup[]>(() => {
    const map = new Map<string, SubjectGroup>();
    questions.forEach((q) => {
      const sName = q.subject?.name || q.kisi_kisi?.judul_kisi || 'Mata Pelajaran Umum';
      const sId = q.mata_pelajaran_id || q.subject?.id || sName;
      const sCode = q.subject?.code;
      const teacher = q.kisi_kisi?.guru?.nama_lengkap || q.kisi_kisi?.guru?.name;

      if (!map.has(sId)) {
        map.set(sId, {
          id: sId,
          name: sName,
          code: sCode,
          questionsCount: 0,
          questions: [],
          teacherName: teacher,
        });
      }

      const grp = map.get(sId)!;
      grp.questionsCount += 1;
      grp.questions.push(q);
      if (!grp.teacherName && teacher) grp.teacherName = teacher;
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [questions]);

  // Filtered Subject Groups by Search Query
  const filteredSubjectGroups = useMemo(() => {
    if (!searchQuery.trim()) return subjectGroups;
    const q = searchQuery.toLowerCase();
    return subjectGroups.filter((g) => {
      return (
        g.name.toLowerCase().includes(q) ||
        (g.code && g.code.toLowerCase().includes(q)) ||
        (g.teacherName && g.teacherName.toLowerCase().includes(q)) ||
        g.questions.some((item) =>
          (item.pertanyaan || '').toLowerCase().includes(q) ||
          (item.indikator || '').toLowerCase().includes(q)
        )
      );
    });
  }, [subjectGroups, searchQuery]);

  // Ringkasan KPI
  const stats = useMemo(() => {
    return {
      totalSubjects: subjectGroups.length,
      totalQuestions: questions.length,
    };
  }, [subjectGroups.length, questions.length]);

  // Toggle user answer selection (for multiple choice study practice)
  const handleSelectOption = (questionId: string, optionKey: string) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionId]: optionKey,
    }));
  };

  // Toggle solution reveal
  const toggleSolution = (questionId: string) => {
    setRevealedSolutions((prev) => ({
      ...prev,
      [questionId]: !prev[questionId],
    }));
  };

  // Tema Ikon & Warna Mapel
  const getSubjectTheme = (name: string) => {
    const lower = (name || '').toLowerCase();
    if (lower.includes('agama') || lower.includes('pai') || lower.includes('tahfizh') || lower.includes('qur') || lower.includes('fiqih') || lower.includes('hadis')) {
      return { icon: 'book-open-page-variant-outline', bg: '#ECFDF5', border: '#A7F3D0', color: '#047857' };
    }
    if (lower.includes('matematika') || lower.includes('hitung') || lower.includes('aljabar')) {
      return { icon: 'calculator-variant-outline', bg: '#EFF6FF', border: '#BFDBFE', color: '#1D4ED8' };
    }
    if (lower.includes('bahasa') || lower.includes('inggris') || lower.includes('arab') || lower.includes('indonesia')) {
      return { icon: 'translate', bg: '#FAF5FF', border: '#E9D5FF', color: '#7E22CE' };
    }
    if (lower.includes('ipa') || lower.includes('fisika') || lower.includes('biologi') || lower.includes('kimia') || lower.includes('sains')) {
      return { icon: 'flask-outline', bg: '#F0FDF4', border: '#BBF7D0', color: '#15803D' };
    }
    if (lower.includes('ips') || lower.includes('sejarah') || lower.includes('geografi') || lower.includes('ekonomi') || lower.includes('sosial')) {
      return { icon: 'earth', bg: '#FFF7ED', border: '#FED7AA', color: '#C2410C' };
    }
    return { icon: 'notebook-outline', bg: '#F0FDFA', border: '#99F6E4', color: '#0F766E' };
  };

  return (
    <View style={styles.container}>
      {/* ── Sticky Header Bersama ── */}
      {!isTeacherOnly ? (
        <StudentStickyHeader
          scrollY={scrollY}
          topInset={topInset}
          title="Bank Soal & Latihan"
          navigation={navigation}
          route={route}
          student={activeStudent}
          user={user}
          childrenList={children}
          selectedChildId={selectedChildId}
          onSelectChild={(cid, idx) => {
            setSelectedChildId(cid);
            useActiveChildStore.getState().setActiveChildId(cid);
            setSelectedSubjectModal(null);
            const foundIdx = children.findIndex((c) => String(c.id || c.student_id) === String(cid));
            if (foundIdx >= 0) goToLoopChild(foundIdx);
          }}
          middleAction={{
            label: 'Kisi-kisi',
            icon: 'file-question',
            onPress: () => navigation?.navigate('KisiKisi'),
          }}
          onOpenIdCard={(s) => openIdCard(s)}
          onOpenQr={(s) => openQrCard(s)}
          onOpenWeeklyReport={(s) => setSelectedWeeklyStudent(s)}
          onOpenMenu={(s) => setSelectedMenuStudent(s)}
        />
      ) : (
        <TeacherStickyHeader
          scrollY={scrollY}
          topInset={topInset}
          title="Bank Soal CBT"
          navigation={navigation}
          route={route}
          quickChips={[
            {
              id: 'total_soal',
              label: `Bank Soal (${questions.length})`,
              icon: 'database-outline',
              active: true,
            },
            {
              id: 'total_mapel',
              label: `${subjectGroups.length} Mapel`,
              icon: 'book-open-page-variant',
              iconColor: '#2563EB',
            },
          ]}
        />
      )}

      {/* ── Main Sheet Container (identik Jadwal) ── */}
      <View style={styles.sheetContainer}>
        <LinearGradient
          colors={['#FFFFFF', '#F4FAF7', '#EAF7F0']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <Animated.ScrollView
          style={styles.screen}
          contentContainerStyle={[styles.mainScrollContent, { paddingBottom: Math.max(bottomInset + 72, 94) }]}
          showsVerticalScrollIndicator={false}
          onScroll={handleMainScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#0E5C44"
              colors={['#0E5C44', '#10B981']}
            />
          }
        >
          {/* ── Static Top Bar (standard — menghilang saat scroll) ── */}
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
                <Text numberOfLines={1} style={styles.heroModuleTitle}>Bank Soal & Latihan</Text>
                <Text numberOfLines={1} style={styles.heroModuleSubtitle}>Butir Soal & Latihan Mandiri</Text>
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

          {/* ── Data Ananda / Card Siswa / Teacher Hero Card ── */}
          <View style={styles.bodyContentWrapper}>
            {isTeacherOnly ? (
              <TeacherHeroCard
                title={String((user as any)?.name || (user as any)?.username || 'Guru Pengajar')}
                badgeText="Bank Soal Guru"
                badgeIcon="database-outline"
                stats={[
                  {
                    label: 'Total Soal',
                    value: questions.length,
                    icon: 'database-outline',
                    color: '#10B981',
                  },
                  {
                    label: 'Mata Pelajaran',
                    value: subjectGroups.length,
                    icon: 'book-open-page-variant',
                    color: '#38BDF8',
                  },
                  {
                    label: 'Latihan CBT',
                    value: stats.totalSubjects,
                    icon: 'checkbox-marked-circle-outline',
                    color: '#A7F3D0',
                  },
                ]}
              />
            ) : children && children.length > 0 ? (
              <Animated.View
                style={[
                  styles.containerBlock,
                  styles.studentContainerBlock,
                  { opacity: bodyCardOpacity, transform: [{ translateY: bodyCardTranslateY }] },
                ]}
              >
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionHeaderTitleWrap}>
                    <MaterialCommunityIcons name="account-school" size={18} color="#059669" />
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
                      showActionButtons={true}
                      isSingleChild={true}
                      cardLabel="Kartu Siswa"
                      calendarLabel="Kisi-kisi"
                      calendarIcon="file-question"
                      portalLabel="Menu"
                      onPressCard={() => openIdCard(children[0])}
                      onPressQr={() => openQrCard(children[0])}
                      onPressWeeklyReport={() => setSelectedWeeklyStudent(children[0])}
                      onPressNotifications={() => navigation?.navigate('Notifikasi')}
                      onPressCalendar={() => navigation?.navigate('KisiKisi')}
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
                      contentContainerStyle={[styles.studentCardsTrack, { paddingHorizontal: studentTrackPad }]}
                      decelerationRate="fast"
                      snapToInterval={studentSnapInterval}
                      snapToAlignment="start"
                      disableIntervalMomentum
                      onMomentumScrollEnd={(e) => {
                        if (studentLoopCount === 0) return;
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
                          requestAnimationFrame(() => { recenterLoop(); });
                        } else { recenterLoop(); }
                      }}
                      onScrollEndDrag={(e) => {
                        if (studentLoopCount === 0) return;
                        const offsetX = e.nativeEvent.contentOffset.x;
                        const slot = Math.round(offsetX / studentSnapInterval);
                        const n = studentLoopCount;
                        const cur = ((activeChildIndex % n) + n) % n;
                        let realIdx = cur;
                        if (slot === 2) realIdx = (cur + 1) % n;
                        else if (slot === 0) realIdx = (cur - 1 + n) % n;
                        if (realIdx !== cur) { setActiveChildIndex(realIdx); syncLoopChildId(realIdx); }
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
                            onSelect={isCardActive ? undefined : () => goToLoopChild(realIdx)}
                            showActionButtons={true}
                            cardWidth={studentCardWidth}
                            cardLabel="Kartu Siswa"
                            calendarLabel="Kisi-kisi"
                            calendarIcon="file-question"
                            portalLabel="Menu"
                            onPressCard={() => openIdCard(child)}
                            onPressQr={() => openQrCard(child)}
                            onPressWeeklyReport={() => setSelectedWeeklyStudent(child)}
                            onPressNotifications={() => navigation?.navigate('Notifikasi')}
                            onPressCalendar={() => navigation?.navigate('KisiKisi')}
                            onPressPortal={() => setSelectedMenuStudent(child)}
                            isSingleChild={false}
                          />
                        );
                      })}
                    </ScrollView>

                    <View style={styles.paginationDotsRow}>
                      {children.map((_, dotIdx) => (
                        <TouchableOpacity
                          key={dotIdx}
                          activeOpacity={0.7}
                          onPress={() => goToLoopChild(dotIdx)}
                          style={[styles.paginationDot, dotIdx === safeCenter && styles.paginationDotActive]}
                        />
                      ))}
                    </View>
                  </>
                )}
              </Animated.View>
            ) : activeStudent ? (
              <Animated.View
                style={[
                  styles.containerBlock,
                  styles.studentContainerBlock,
                  { opacity: bodyCardOpacity, transform: [{ translateY: bodyCardTranslateY }] },
                ]}
              >
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionHeaderTitleWrap}>
                    <MaterialCommunityIcons name="account-school" size={18} color="#059669" />
                    <Text style={styles.sectionTitle}>Data Siswa</Text>
                  </View>
                </View>
                <View style={styles.singleHeroCardContainer}>
                  <StudentHeroCard
                    child={activeStudent}
                    isSelected={true}
                    showActionButtons={true}
                    isSingleChild={true}
                    cardLabel="Kartu Siswa"
                    calendarLabel="Kisi-kisi"
                    calendarIcon="file-question"
                    portalLabel="Menu"
                    onPressCard={() => openIdCard(activeStudent)}
                    onPressQr={() => openQrCard(activeStudent)}
                    onPressWeeklyReport={() => setSelectedWeeklyStudent(activeStudent)}
                    onPressNotifications={() => navigation?.navigate('Notifikasi')}
                    onPressCalendar={() => navigation?.navigate('KisiKisi')}
                    onPressPortal={() => setSelectedMenuStudent(activeStudent)}
                  />
                </View>
              </Animated.View>
            ) : null}

            {/* Quick KPI Stats */}
            <View style={styles.kpiRow}>
              <View style={[styles.kpiCard, { borderColor: '#A7F3D0', backgroundColor: '#ECFDF5' }]}>
                <Text style={styles.kpiLabel}>Mata Pelajaran</Text>
                <Text style={[styles.kpiValue, { color: '#047857' }]}>{stats.totalSubjects}</Text>
                <Text style={styles.kpiSub}>Tersedia</Text>
              </View>
              <View style={[styles.kpiCard, { borderColor: '#BAE6FD', backgroundColor: '#F0F9FF' }]}>
                <Text style={styles.kpiLabel}>Total Soal</Text>
                <Text style={[styles.kpiValue, { color: '#0284C7' }]}>{stats.totalQuestions}</Text>
                <Text style={styles.kpiSub}>Latihan Mandiri</Text>
              </View>
            </View>

            {/* Search Bar */}
            <View style={styles.searchContainer}>
              <MaterialCommunityIcons name="magnify" size={20} color="#059669" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Cari mata pelajaran..."
                placeholderTextColor="#94A3B8"
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            {/* Section Header */}
            <View style={styles.listHeaderRow}>
              <View style={styles.listTitleCol}>
                <Text style={styles.listTitle}>Daftar Mata Pelajaran</Text>
                <Text style={styles.listSubtitle}>Pilih mata pelajaran untuk mulai latihan</Text>
              </View>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{filteredSubjectGroups.length} Mapel</Text>
              </View>
            </View>

            {/* Content States */}
            {loading && !refreshing ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#0E5C44" />
                <Text style={styles.loadingText}>Memuat materi latihan...</Text>
              </View>
            ) : error ? (
              <View style={styles.errorContainer}>
                <MaterialCommunityIcons name="alert-circle-outline" size={42} color="#EF4444" />
                <Text style={styles.errorTitle}>Gagal Memuat Data</Text>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity onPress={() => loadBankSoal(true)} style={styles.retryBtn}>
                  <Text style={styles.retryBtnText}>Coba Lagi</Text>
                </TouchableOpacity>
              </View>
            ) : filteredSubjectGroups.length === 0 ? (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <MaterialCommunityIcons name="book-open-page-variant-outline" size={44} color="#0D6B42" />
                </View>
                <Text style={styles.emptyTitle}>Belum Ada Soal Latihan</Text>
                <Text style={styles.emptyDesc}>
                  {searchQuery
                    ? `Tidak ditemukan mata pelajaran dengan kata kunci "${searchQuery}".`
                    : `Guru belum mengunggah butir soal latihan untuk kelas ini (${resolvedClass || 'Semua Kelas'}).`}
                </Text>
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.resetFilterBtn}>
                    <Text style={styles.resetFilterBtnText}>Reset Pencarian</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              filteredSubjectGroups.map((group) => {
                const theme = getSubjectTheme(group.name);
                return (
                  <TouchableOpacity
                    key={group.id}
                    style={[styles.subjectCard, { borderColor: theme.border }]}
                    activeOpacity={0.88}
                    onPress={() => setSelectedSubjectModal(group)}
                  >
                    <View style={[styles.subjectIconBox, { backgroundColor: theme.bg }]}>
                      <MaterialCommunityIcons name={theme.icon as any} size={26} color={theme.color} />
                    </View>

                    <View style={styles.subjectInfoCol}>
                      <Text style={styles.subjectCardTitle} numberOfLines={2}>
                        {group.name}
                      </Text>
                      {Boolean(group.teacherName) && (
                        <View style={styles.subjectTeacherRow}>
                          <MaterialCommunityIcons name="account-tie-outline" size={13} color="#64748B" style={{ marginRight: 4 }} />
                          <Text style={styles.subjectTeacherText} numberOfLines={1}>
                            Penyusun: {group.teacherName}
                          </Text>
                        </View>
                      )}

                      <View style={styles.subjectBadgeRow}>
                        <View style={[styles.subjectCountBadge, { backgroundColor: theme.bg }]}>
                          <MaterialCommunityIcons name="file-document-edit-outline" size={12} color={theme.color} style={{ marginRight: 3 }} />
                          <Text style={[styles.subjectCountBadgeText, { color: theme.color }]}>
                            {group.questionsCount} Butir Soal
                          </Text>
                        </View>
                        {Boolean(group.code) && (
                          <View style={styles.subjectCodeBadge}>
                            <Text style={styles.subjectCodeBadgeText}>{group.code}</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <View style={styles.subjectArrowWrap}>
                      <View style={[styles.subjectActionSquircle, { backgroundColor: theme.bg }]}>
                        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.color} />
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
        </View>
      </Animated.ScrollView>
    </View>

      {/* ── Modal Latihan Soal Interaktif (Opsi A: List Vertikal) ── */}
      <Modal
        visible={Boolean(selectedSubjectModal)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedSubjectModal(null)}
      >
        <View style={styles.modalRootContainer}>
          {/* Modal Top Bar */}
          <View style={[styles.modalTopBar, { paddingTop: Math.max(insets.top, Platform.OS === 'android' ? 20 : 14) }]}>
            <LinearGradient
              colors={['#047857', '#059669', '#10B981']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.modalTopBarRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setSelectedSubjectModal(null)}
                style={styles.modalTopBarBackBtn}
                accessibilityRole="button"
                accessibilityLabel="Tutup Latihan"
              >
                <MaterialCommunityIcons name="close" size={20} color="#059669" />
              </TouchableOpacity>

              <View style={styles.modalTopBarCenterCol}>
                <Text numberOfLines={1} style={styles.modalTopBarTitle}>
                  {selectedSubjectModal?.name}
                </Text>
                <Text numberOfLines={1} style={styles.modalTopBarSubtitle}>
                  {resolvedName} • {selectedSubjectModal?.questionsCount} Soal Latihan
                </Text>
              </View>

              <View style={{ width: 38 }} />
            </View>
          </View>

          {/* Modal Scroll Body (Opsi A: List Vertikal) */}
          <ScrollView
            style={styles.modalScrollBody}
            contentContainerStyle={[styles.modalScrollContent, { paddingBottom: Math.max(bottomInset + 40, 60) }]}
            showsVerticalScrollIndicator={true}
          >
            {/* Notice Banner */}
            <View style={styles.modalNoticeBanner}>
              <MaterialCommunityIcons name="information" size={18} color="#0D9488" style={{ marginRight: 8, marginTop: 1 }} />
              <Text style={styles.modalNoticeText}>
                Ketuk salah satu opsi (A, B, C, D, E) untuk memilih jawaban mandiri. Buka pembahasan untuk mengevaluasi pemahaman konsep secara mendalam.
              </Text>
            </View>

            {/* List Butir Soal Vertikal */}
            {selectedSubjectModal?.questions.map((item, idx) => {
              const isSolutionOpen = Boolean(revealedSolutions[item.id]);
              const userSelectedOption = selectedAnswers[item.id];

              const options = [
                { key: 'A', text: item.opsi_a },
                { key: 'B', text: item.opsi_b },
                { key: 'C', text: item.opsi_c },
                { key: 'D', text: item.opsi_d },
                { key: 'E', text: item.opsi_e },
              ].filter((o) => Boolean(o.text && o.text.trim()));

              return (
                <View key={item.id} style={styles.questionCard}>
                  {/* Card Header (Nomor Soal & Poin) - Label kesulitan & tipe soal dihapus */}
                  <View style={styles.cardHeader}>
                    <View style={styles.numberPill}>
                      <Text style={styles.numberPillText}>Soal No. {idx + 1}</Text>
                    </View>
                    <View style={styles.pointsBadge}>
                      <Text style={styles.pointsBadgeText}>{item.poin ?? 10} Poin</Text>
                    </View>
                  </View>

                  {/* Kode Soal jika ada */}
                  {Boolean(item.kode_soal) && (
                    <View style={styles.metaRow}>
                      <Text style={styles.metaCode}>Kode: {item.kode_soal}</Text>
                    </View>
                  )}

                  {/* Teks Pertanyaan */}
                  <Text style={styles.questionText}>{item.pertanyaan}</Text>

                  {/* Opsi Jawaban (A, B, C, D, E) */}
                  {options.length > 0 && (
                    <View style={styles.optionsList}>
                      {options.map((opt) => {
                        const isChosen = userSelectedOption === opt.key;
                        const isCorrectKey = (item.kunci_jawaban || '').toUpperCase() === opt.key;
                        const showCorrectHighlight = isSolutionOpen && isCorrectKey;
                        const showWrongHighlight = isSolutionOpen && isChosen && !isCorrectKey;

                        let optBorder = '#E2E8F0';
                        let optBg = '#FFFFFF';
                        let badgeBg = '#E2E8F0';
                        let badgeText = '#475569';

                        if (isChosen) {
                          optBorder = '#10B981';
                          optBg = '#ECFDF5';
                          badgeBg = '#10B981';
                          badgeText = '#FFFFFF';
                        }

                        if (showCorrectHighlight) {
                          optBorder = '#059669';
                          optBg = '#D1FAE5';
                          badgeBg = '#059669';
                          badgeText = '#FFFFFF';
                        } else if (showWrongHighlight) {
                          optBorder = '#EF4444';
                          optBg = '#FEE2E2';
                          badgeBg = '#EF4444';
                          badgeText = '#FFFFFF';
                        }

                        return (
                          <TouchableOpacity
                            key={opt.key}
                            onPress={() => handleSelectOption(item.id, opt.key)}
                            style={[styles.optionItem, { borderColor: optBorder, backgroundColor: optBg }]}
                            activeOpacity={0.75}
                          >
                            <View style={[styles.optionKeyCircle, { backgroundColor: badgeBg }]}>
                              <Text style={[styles.optionKeyText, { color: badgeText }]}>{opt.key}</Text>
                            </View>
                            <Text style={styles.optionContentText}>{opt.text}</Text>
                            {showCorrectHighlight && (
                              <MaterialCommunityIcons name="check-circle" size={18} color="#059669" style={{ marginLeft: 6 }} />
                            )}
                            {showWrongHighlight && (
                              <MaterialCommunityIcons name="close-circle" size={18} color="#EF4444" style={{ marginLeft: 6 }} />
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}

                  {/* Tombol Buka Kunci Jawaban & Pembahasan */}
                  <TouchableOpacity
                    onPress={() => toggleSolution(item.id)}
                    style={[styles.solutionToggleBtn, isSolutionOpen && styles.solutionToggleBtnActive]}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons
                      name={isSolutionOpen ? 'eye-off-outline' : 'lightbulb-on-outline'}
                      size={16}
                      color={isSolutionOpen ? '#475569' : '#0D6B42'}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={[styles.solutionToggleBtnText, isSolutionOpen && { color: '#475569' }]}>
                      {isSolutionOpen ? 'Sembunyikan Kunci & Pembahasan' : 'Lihat Kunci & Pembahasan Soal'}
                    </Text>
                    <MaterialCommunityIcons
                      name={isSolutionOpen ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={isSolutionOpen ? '#475569' : '#0D6B42'}
                    />
                  </TouchableOpacity>

                  {/* Konten Kunci Jawaban & Pembahasan */}
                  {isSolutionOpen && (
                    <View style={styles.solutionBox}>
                      <View style={styles.solutionHeaderRow}>
                        <MaterialCommunityIcons name="check-decagram" size={18} color="#059669" />
                        <Text style={styles.solutionTitle}>Kunci Jawaban Resmi:</Text>
                        <View style={styles.answerKeyPill}>
                          <Text style={styles.answerKeyPillText}>
                            {item.kunci_jawaban || 'Tersedia pada evaluasi guru'}
                          </Text>
                        </View>
                      </View>

                      {/* Pembahasan */}
                      <View style={styles.explanationSection}>
                        <Text style={styles.explanationLabel}>Pembahasan & Analisis:</Text>
                        <Text style={styles.explanationContent}>
                          {item.pembahasan && item.pembahasan.trim()
                            ? item.pembahasan
                            : 'Pelajari kembali materi pelajaran terkait untuk memahami konsep kunci butir soal ini dengan tuntas.'}
                        </Text>
                      </View>

                      {/* Indikator */}
                      {Boolean(item.indikator) && (
                        <View style={styles.indicatorRow}>
                          <MaterialCommunityIcons name="target" size={13} color="#0D9488" style={{ marginRight: 4, marginTop: 1 }} />
                          <Text style={styles.indicatorText}>Indikator: {item.indikator}</Text>
                        </View>
                      )}

                      {/* Penyusun */}
                      {Boolean(item.kisi_kisi?.guru?.nama_lengkap || item.kisi_kisi?.guru?.name) && (
                        <View style={styles.teacherAuthorRow}>
                          <MaterialCommunityIcons name="account-tie-outline" size={13} color="#64748B" style={{ marginRight: 4 }} />
                          <Text style={styles.teacherAuthorText}>
                            Penyusun: {item.kisi_kisi?.guru?.nama_lengkap || item.kisi_kisi?.guru?.name}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })}

            {/* Tombol Selesai Latihan */}
            <TouchableOpacity
              style={styles.modalFinishBtn}
              activeOpacity={0.85}
              onPress={() => setSelectedSubjectModal(null)}
            >
              <LinearGradient
                colors={['#059669', '#047857']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.modalFinishBtnGrad}
              >
                <MaterialCommunityIcons name="check" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.modalFinishBtnText}>Selesai Latihan</Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Sub Modals (KTS, QR, Menu, Weekly Report) ── */}
      <StudentIdCardModal
        visible={Boolean(selectedIdCardStudent)}
        student={selectedIdCardStudent}
        onClose={() => setSelectedIdCardStudent(null)}
      />
      <StudentQrModal
        visible={Boolean(selectedQrStudent)}
        student={selectedQrStudent}
        onClose={() => setSelectedQrStudent(null)}
      />
      <StudentMenuModal
        visible={Boolean(selectedMenuStudent)}
        student={selectedMenuStudent}
        onClose={() => setSelectedMenuStudent(null)}
        navigation={navigation}
      />
      <StudentWeeklyReportModal
        visible={Boolean(selectedWeeklyStudent)}
        student={selectedWeeklyStudent}
        onClose={() => setSelectedWeeklyStudent(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  // ── Standard sheet layout (identik ScheduleScreen) ──
  sheetContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  screen: { flex: 1, backgroundColor: 'transparent' },
  mainScrollContent: { flexGrow: 1 },
  scrollContent: { flexGrow: 1 },
  // ── Static Top Bar (standar Jadwal) ──
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
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: 'rgba(5, 150, 105, 0.32)',
    shadowColor: '#059669',
    shadowOpacity: 0.15,
    shadowRadius: 4,
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
  // ── Body Content Wrapper ──
  bodyContentWrapper: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  containerBlock: { marginBottom: 16 },
  studentContainerBlock: { marginBottom: 8 },
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
  heroCardScrollContainer: { marginHorizontal: -16 },
  studentCardsTrack: { gap: STUDENT_CARD_GAP, paddingBottom: 4, zIndex: 1 },
  paginationDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    marginBottom: 4,
  },
  paginationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
  },
  paginationDotActive: {
    width: 18,
    backgroundColor: '#059669',
    borderRadius: 3,
  },
  kpiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 8,
  },
  kpiCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 2,
  },
  kpiValue: {
    fontSize: 16,
    fontWeight: '800',
    fontFamily: 'Nunito_800ExtraBold',
  },
  kpiSub: {
    fontSize: 9,
    color: '#94A3B8',
    marginTop: 2,
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 42,
    marginBottom: 14,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
    paddingVertical: 0,
  },
  listTitleCol: {
    flex: 1,
  },
  listSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    fontFamily: 'Nunito_500Medium',
    marginTop: 1,
  },
  subjectCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  subjectIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  subjectInfoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  subjectCardTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
    color: '#0F172A',
    marginBottom: 3,
  },
  subjectTeacherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  subjectTeacherText: {
    fontSize: 11,
    color: '#64748B',
    fontFamily: 'Nunito_500Medium',
  },
  subjectBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  subjectCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  subjectCountBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Nunito_700Bold',
  },
  subjectCodeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  subjectCodeBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    fontFamily: 'Nunito_600SemiBold',
  },
  subjectArrowWrap: {
    marginLeft: 8,
  },
  subjectActionSquircle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  countBadge: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  countBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  errorContainer: {
    paddingVertical: 36,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#991B1B',
    marginTop: 10,
  },
  errorText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 14,
  },
  retryBtn: {
    backgroundColor: '#0D6B42',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 12,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyContainer: {
    paddingVertical: 36,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  emptyDesc: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  resetFilterBtn: {
    marginTop: 14,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  resetFilterBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  questionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  numberPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  numberPillText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#334155',
  },
  subjectPill: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
    maxWidth: 140,
  },
  subjectPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#065F46',
  },
  diffPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  diffPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  pointsBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  pointsBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#92400E',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  metaType: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  metaCode: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
  },
  questionText: {
    fontSize: 13.5,
    color: '#1E293B',
    lineHeight: 20,
    fontWeight: '600',
    marginBottom: 12,
  },
  optionsList: {
    gap: 8,
    marginBottom: 12,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  optionKeyCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  optionKeyText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  optionContentText: {
    flex: 1,
    fontSize: 12.5,
    color: '#334155',
    lineHeight: 18,
    fontWeight: '500',
  },
  solutionToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  solutionToggleBtnActive: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  solutionToggleBtnText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#065F46',
    textAlign: 'center',
  },
  solutionBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginTop: 10,
  },
  solutionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  solutionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    marginLeft: 6,
    marginRight: 8,
  },
  answerKeyPill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  answerKeyPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#15803D',
  },
  explanationSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 8,
  },
  explanationLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 3,
  },
  explanationContent: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 18,
  },
  indicatorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  indicatorText: {
    fontSize: 10.5,
    color: '#0D9488',
    fontWeight: '600',
    flex: 1,
  },
  teacherAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  teacherAuthorText: {
    fontSize: 10,
    color: '#64748B',
    fontStyle: 'italic',
  },
  modalRootContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  modalTopBar: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingBottom: 14,
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 4,
  },
  modalTopBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 4,
    width: '100%',
  },
  modalTopBarBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: 'rgba(5, 150, 105, 0.32)',
  },
  modalTopBarCenterCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  modalTopBarTitle: {
    fontSize: 15.5,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  modalTopBarSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Nunito_600SemiBold',
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginTop: 1,
  },
  modalScrollBody: {
    flex: 1,
  },
  modalScrollContent: {
    padding: 16,
  },
  modalNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F0FDFA',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#99F6E4',
    padding: 12,
    marginBottom: 16,
  },
  modalNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#0F766E',
    fontFamily: 'Nunito_500Medium',
    lineHeight: 18,
  },
  modalFinishBtn: {
    marginTop: 12,
    marginBottom: 20,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  modalFinishBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  modalFinishBtnText: {
    fontSize: 14.5,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
  },
});

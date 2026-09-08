import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useAuthStore } from '../stores/authStore';
import { getApiErrorMessage } from '../services/api';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import {
  getProfileImageUrl,
  DEFAULT_STUDENT_BOY_AVATAR,
  DEFAULT_STUDENT_GIRL_AVATAR,
} from '../utils/profile';
import { offlineCache } from '../utils/offlineCache';

import { isParentRole, isStudentRole } from '../utils/roles';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type CbtExamItem = {
  id: string;
  judul_ujian: string;
  instruksi?: string;
  waktu_mulai?: string;
  waktu_selesai?: string;
  durasi_menit: number;
  nilai_kkm: number;
  max_attempt: number;
  attempts_used: number;
  attempts_left: number;
  status: string;
  availability: 'available' | 'resume' | 'upcoming' | 'ended' | 'completed';
  mata_pelajaran?: string;
  kelas?: string;
  guru?: string;
  kisi_kisi?: {
    id?: string;
    judul?: string;
    jenis_ujian?: string;
    jumlah_soal?: number;
    alokasi_waktu_menit?: number;
  };
  latest_result?: {
    sesi_id?: string;
    nilai_final?: number | null;
    nilai_tersedia?: boolean;
    jumlah_benar?: number | null;
    jumlah_salah?: number | null;
    jumlah_kosong?: number | null;
    waktu_selesai?: string;
  };
};

const formatDate = (val?: string) => {
  if (!val) return 'Tanpa batas';
  const date = new Date(val);
  return Number.isNaN(date.getTime())
    ? '-'
    : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const childName = (child: any) => child?.full_name || child?.nama_lengkap || child?.name || 'Siswa';
const childClass = (child: any) => child?.kelas?.nama_kelas || child?.kelas?.name || child?.class_name || 'Kelas belum ditentukan';
const childUnit = (child: any) => child?.education_unit?.name || child?.kelas?.unit_pendidikan?.name || child?.unit_name || 'Unit Sekolah';

export default function CbtExamsScreen({ route }: any) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 36 : 16);
  const user = useAuthStore((state) => state.user);
  const roles = useAuthStore((state) => state.roles);
  const userRoles = useMemo(() => (roles?.length ? roles : user?.roles || []), [roles, user?.roles]);
  const isParent = isParentRole(userRoles);
  const isStudent = isStudentRole(userRoles);

  const studentScrollRef = useRef<ScrollView>(null);
  const [children, setChildren] = useState<any[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(route?.params?.child_id);
  const [studentInfo, setStudentInfo] = useState<any>(null);
  const [exams, setExams] = useState<CbtExamItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'semua' | 'available' | 'upcoming' | 'completed'>('semua');
  const [instructionModal, setInstructionModal] = useState<CbtExamItem | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);

  // CBT Exam Runner States
  const [activeExamSession, setActiveExamSession] = useState<{
    sesi_id: string;
    ujian: {
      id: string;
      judul_ujian: string;
      instruksi?: string;
      durasi_menit: number;
      sisa_waktu_detik: number;
      nilai_kkm?: number;
      tampilkan_nilai_langsung?: boolean;
    };
    soal: Array<{
      id: string;
      kode_soal?: string;
      pertanyaan: string;
      tipe_soal: string;
      poin: number;
      opsi?: Array<{ key: string; text: string }>;
    }>;
  } | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [examAnswers, setExamAnswers] = useState<Record<string, string>>({});
  const [doubtfulQuestions, setDoubtfulQuestions] = useState<Record<string, boolean>>({});
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [showQuestionPalette, setShowQuestionPalette] = useState<boolean>(false);
  const [submittingExam, setSubmittingExam] = useState<boolean>(false);
  const [savingAnswer, setSavingAnswer] = useState<boolean>(false);
  const [examResultModal, setExamResultModal] = useState<{
    sesi_id: string;
    nilai_tersedia: boolean;
    nilai_final: number | null;
    nilai_kkm: number | null;
    jumlah_benar: number | null;
    jumlah_salah: number | null;
    jumlah_kosong: number | null;
  } | null>(null);

  // 1. Load Children if parent with offline cache
  useEffect(() => {
    let isMounted = true;
    if (isParent) {
      const targetChildId = route?.params?.child_id;
      const childCacheKey = offlineCache.buildKey('cbt_exams_children', user?.id);
      void (async () => {
        const cached = await offlineCache.get<any[]>(childCacheKey);
        if (cached && isMounted && cached.length > 0) {
          const filteredCached = targetChildId
            ? cached.filter((c) => String(c.id) === String(targetChildId))
            : cached;
          setChildren(filteredCached.length > 0 ? filteredCached : cached);
          setSelectedChildId(targetChildId ? String(targetChildId) : ((prev: any) => prev || (cached[0]?.id ? String(cached[0].id) : undefined)));
        }
      })();

      mobileApiService.getPortalChildren()
        .then((res) => {
          const list = unwrapApiData<any[]>(res) || [];
          if (isMounted && list.length > 0) {
            const filteredList = targetChildId
              ? list.filter((c) => String(c.id) === String(targetChildId))
              : list;
            setChildren(filteredList.length > 0 ? filteredList : list);
            setSelectedChildId(targetChildId ? String(targetChildId) : ((prev: any) => prev || (list[0]?.id ? String(list[0].id) : undefined)));
            void offlineCache.set(childCacheKey, list);
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [isParent, user?.id, route?.params?.child_id]);

  // 2. Load Real CBT Exams from Backend Database with offline cache
  const loadCbtExams = useCallback(async () => {
    setError('');
    const targetChildId = isParent ? selectedChildId : undefined;
    const cacheKey = offlineCache.buildKey('cbt_exams', user?.id, targetChildId || 'self');

    // Baca cache dulu
    const cached = await offlineCache.get<{ exams: CbtExamItem[]; student: any }>(cacheKey);
    if (cached) {
      if (cached.exams) setExams(cached.exams);
      if (cached.student) setStudentInfo(cached.student);
    }

    try {
      const response = await mobileApiService.getPortalCbtExams(targetChildId);
      const raw = unwrapApiData<any>(response);
      const records = Array.isArray(raw?.exams)
        ? raw.exams
        : Array.isArray(raw?.data)
        ? raw.data
        : Array.isArray(raw)
        ? raw
        : [];
      setExams(records);

      const resolvedStudent = response?.student || raw?.student || response?.data?.student;
      let finalStudent = studentInfo;
      if (resolvedStudent) {
        finalStudent = resolvedStudent;
        setStudentInfo(resolvedStudent);
      } else if (isStudent) {
        const currentUser = useAuthStore.getState().user;
        finalStudent = currentUser?.student || currentUser;
        setStudentInfo((prev: any) => prev || finalStudent);
      }

      void offlineCache.set(cacheKey, { exams: records, student: finalStudent });
    } catch (err) {
      if (!cached) {
        setError(getApiErrorMessage(err, 'Jadwal ujian CBT belum berhasil dimuat.'));
        setExams([]);
      }
    }
  }, [isParent, isStudent, selectedChildId, studentInfo, user?.id]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      if (isStudent) {
        try {
          const profRes = await mobileApiService.getPortalProfile();
          const profData = unwrapApiData<any>(profRes) || profRes?.data || profRes;
          if (profData) setStudentInfo(profData);
        } catch {
          const currentUser = useAuthStore.getState().user;
          setStudentInfo((prev: any) => prev || currentUser?.student || currentUser);
        }
      }
      await loadCbtExams();
    } finally {
      setLoading(false);
    }
  }, [isStudent, loadCbtExams]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Handle Child Carousel Interaction
  const handleStudentScrollEnd = (e: any) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const cardWidth = SCREEN_WIDTH - 50 + 12;
    const index = Math.round(offsetX / cardWidth);
    if (index >= 0 && index < children.length) {
      const targetChild = children[index];
      if (targetChild && String(targetChild.id) !== selectedChildId) {
        setSelectedChildId(String(targetChild.id));
      }
    }
  };

  const selectChildWithScroll = (childId: string, index: number) => {
    setSelectedChildId(childId);
    studentScrollRef.current?.scrollTo({
      x: index * (SCREEN_WIDTH - 50 + 12),
      animated: true,
    });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      if (isParent) {
        const res = await mobileApiService.getPortalChildren();
        const list = unwrapApiData<any[]>(res) || [];
        setChildren(list);
      }
      await loadCbtExams();
    } finally {
      setRefreshing(false);
    }
  };

  // KPIs
  const stats = useMemo(() => {
    const total = exams.length;
    const available = exams.filter((e) => ['available', 'resume'].includes(e.availability)).length;
    const upcoming = exams.filter((e) => e.availability === 'upcoming').length;
    const completed = exams.filter((e) => e.latest_result || e.availability === 'completed').length;
    return { total, available, upcoming, completed };
  }, [exams]);

  // Filtered Exams
  const filteredExams = useMemo(() => {
    return exams.filter((item) => {
      const title = item.judul_ujian || '';
      const subject = item.mata_pelajaran || '';
      const teacher = item.guru || '';
      const matchesSearch =
        !search.trim() ||
        title.toLowerCase().includes(search.trim().toLowerCase()) ||
        subject.toLowerCase().includes(search.trim().toLowerCase()) ||
        teacher.toLowerCase().includes(search.trim().toLowerCase());

      let matchesFilter = true;
      if (selectedFilter === 'available') {
        matchesFilter = ['available', 'resume'].includes(item.availability);
      } else if (selectedFilter === 'upcoming') {
        matchesFilter = item.availability === 'upcoming';
      } else if (selectedFilter === 'completed') {
        matchesFilter = Boolean(item.latest_result) || item.availability === 'completed';
      }

      return matchesSearch && matchesFilter;
    });
  }, [exams, search, selectedFilter]);

  // Real-time countdown timer for active CBT session
  useEffect(() => {
    if (!activeExamSession || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          void handleAutoFinishExam();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeExamSession, timeLeft]);

  const formatTimer = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.max(0, seconds % 60);
    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleSelectOption = async (questionId: string, optionKey: string) => {
    if (!activeExamSession) return;
    const updated = { ...examAnswers, [questionId]: optionKey };
    setExamAnswers(updated);

    try {
      setSavingAnswer(true);
      await mobileApiService.savePortalCbtAnswers(activeExamSession.sesi_id, [
        { soal_id: questionId, jawaban_dipilih: optionKey },
      ]);
    } catch (e) {
      console.warn('Gagal menyimpan jawaban otomatis:', e);
    } finally {
      setSavingAnswer(false);
    }
  };

  const handleToggleDoubtful = (questionId: string) => {
    setDoubtfulQuestions((prev) => ({
      ...prev,
      [questionId]: !prev[questionId],
    }));
  };

  const handleStartExam = async (exam: CbtExamItem) => {
    if (isParent) {
      Alert.alert(
        'Mode Pemantauan Orang Tua',
        'Pengerjaan ujian CBT hanya dapat dilakukan oleh siswa melalui akun aplikasi/portal siswa masing-masing.'
      );
      return;
    }

    setInstructionModal(null);
    setStartingId(exam.id);
    try {
      const startRes = await mobileApiService.startPortalCbtExam(exam.id);
      const sessionData = unwrapApiData<any>(startRes) || startRes?.data || startRes;

      if (!sessionData || !sessionData.sesi_id) {
        throw new Error('Sesi ujian tidak berhasil dibuat atau data soal belum lengkap.');
      }

      // Populate pre-saved answers if any
      const answersMap: Record<string, string> = {};
      if (Array.isArray(sessionData.jawaban_tersimpan)) {
        sessionData.jawaban_tersimpan.forEach((item: any) => {
          if (item.soal_id && item.jawaban_dipilih) {
            answersMap[item.soal_id] = item.jawaban_dipilih;
          }
        });
      }

      setExamAnswers(answersMap);
      setDoubtfulQuestions({});
      setCurrentQuestionIndex(0);
      const remainingSeconds =
        sessionData.ujian?.sisa_waktu_detik != null
          ? Number(sessionData.ujian.sisa_waktu_detik)
          : Number(sessionData.ujian?.durasi_menit || 60) * 60;
      setTimeLeft(remainingSeconds > 0 ? remainingSeconds : 3600);
      setActiveExamSession(sessionData);
    } catch (startErr) {
      Alert.alert('Ujian Belum Dapat Dimulai', getApiErrorMessage(startErr, 'Gagal memulai sesi ujian CBT.'));
    } finally {
      setStartingId(null);
    }
  };

  const handleConfirmFinish = () => {
    if (!activeExamSession) return;
    const totalQuestions = activeExamSession.soal.length;
    const answeredCount = activeExamSession.soal.filter((q) => Boolean(examAnswers[q.id])).length;
    const unansweredCount = Math.max(0, totalQuestions - answeredCount);
    const doubtfulCount = Object.values(doubtfulQuestions).filter(Boolean).length;

    Alert.alert(
      'Kumpulkan Lembar Jawaban?',
      `Ringkasan pengerjaan ujian:\n\n` +
        `• Soal Dijawab: ${answeredCount} dari ${totalQuestions} soal\n` +
        (doubtfulCount > 0 ? `• Ditandai Ragu-ragu: ${doubtfulCount} soal\n` : '') +
        (unansweredCount > 0 ? `• Belum Terjawab: ${unansweredCount} soal\n` : '• Semua soal telah dijawab lengkap\n') +
        `\nApakah Anda yakin ingin menyelesaikan dan mengumpulkan ujian sekarang?`,
      [
        { text: 'Periksa Kembali', style: 'cancel' },
        {
          text: 'Ya, Kumpulkan',
          style: 'default',
          onPress: () => {
            void submitExam();
          },
        },
      ]
    );
  };

  const handleAutoFinishExam = async () => {
    Alert.alert('Waktu Ujian Habis', 'Waktu pengerjaan telah berakhir. Sistem mengumpulkan lembar jawaban Anda.');
    await submitExam();
  };

  const submitExam = async () => {
    if (!activeExamSession) return;
    setSubmittingExam(true);
    try {
      const answersPayload = Object.entries(examAnswers).map(([soal_id, jawaban_dipilih]) => ({
        soal_id,
        jawaban_dipilih,
      }));

      const res = await mobileApiService.finishPortalCbtExam(activeExamSession.sesi_id, answersPayload);
      const resData = unwrapApiData<any>(res) || res?.data || res;

      setActiveExamSession(null);
      setExamAnswers({});
      setDoubtfulQuestions({});
      setExamResultModal(resData || { nilai_tersedia: false });
      await loadCbtExams();
    } catch (err) {
      Alert.alert('Gagal Mengumpulkan Ujian', getApiErrorMessage(err, 'Terjadi kendala saat mengumpulkan ujian. Silakan coba kembali.'));
    } finally {
      setSubmittingExam(false);
    }
  };

  return (
    <View style={styles.rootContainer}>
      <View style={styles.sheetContainer}>
        {/* Soft emerald aesthetic background */}
        <LinearGradient
          colors={['#FFFFFF', '#F2FAF6', '#DDF5EB']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <ScrollView
          style={styles.screen}
          contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 30 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#18A165']} />}
          showsVerticalScrollIndicator={false}
        >
          {/* ══════════════════════════════════════════════════════════════
              SECTION 1: DATA SISWA & UNIT PENDIDIKAN (HERO CARD STANDAR)
             ══════════════════════════════════════════════════════════════ */}
          {children.length > 0 ? (
            <View style={[styles.containerBlock, styles.studentContainerBlock]}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderTitleWrap}>
                  <MaterialCommunityIcons name="account-school" size={18} color="#18A165" />
                  <Text style={styles.sectionTitle}>Data Ananda</Text>
                </View>
                {children.length > 1 && (
                  <View style={styles.studentCardCountBadge}>
                    <Text style={styles.studentCardCountBadgeText}>
                      {Math.max(1, children.findIndex((c) => String(c.id) === selectedChildId) + 1)} dari {children.length} Ananda
                    </Text>
                  </View>
                )}
              </View>

              <ScrollView
                ref={studentScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={SCREEN_WIDTH - 50 + 12}
                decelerationRate="fast"
                snapToAlignment="start"
                onMomentumScrollEnd={handleStudentScrollEnd}
                style={styles.heroCardScrollContainer}
                contentContainerStyle={styles.heroCardScroll}
              >
                {children.map((child, idx) => {
                  const isSelected = String(child.id) === selectedChildId;
                  const childFullName = childName(child);
                  const unitTitle = childUnit(child);
                  const className = childClass(child);
                  const jenjang = child.kelas?.jenjang || child.education_unit?.level || 'Terpadu';
                  const avatarUri = getProfileImageUrl(child);
                  const cardStyle = children.length === 1 ? styles.childCardHeroSizeSingle : styles.childCardHeroSize;

                  return (
                    <TouchableOpacity
                      key={String(child.id)}
                      activeOpacity={0.88}
                      onPress={() => selectChildWithScroll(String(child.id), idx)}
                    >
                      <LinearGradient
                        colors={['#0D6B42', '#18A165', '#2BD988']}
                        locations={[0, 0.55, 1]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[cardStyle, !isSelected && { opacity: 0.9 }]}
                      >
                        <View style={styles.cardDecorCircle} />

                        {/* Top Row: Avatar + Info (Name, NIS, Unit Pill) + Right Button */}
                        <View style={styles.childHeroTopRow}>
                          <View style={styles.avatarBorderWrapHero}>
                            {avatarUri ? (
                              <Image source={{ uri: avatarUri }} style={styles.childAvatarImgHero} resizeMode="cover" />
                            ) : (
                              <Image
                                source={
                                  child?.gender === 'female' ||
                                  child?.jenis_kelamin === 'P' ||
                                  child?.jenis_kelamin === 'female' ||
                                  child?.gender === 'P'
                                    ? DEFAULT_STUDENT_GIRL_AVATAR
                                    : DEFAULT_STUDENT_BOY_AVATAR
                                }
                                style={styles.childAvatarImgHero}
                                resizeMode="cover"
                              />
                            )}
                          </View>
                          <View style={styles.childInfoCol}>
                            <View style={styles.studentNameBadgeRow}>
                              <Text numberOfLines={1} style={styles.studentFullName}>
                                {childFullName}
                              </Text>
                            </View>
                            <Text style={styles.studentNisText}>
                              NIS: {child.nis || '-'} {child.nisn ? `· NISN: ${child.nisn}` : ''}
                            </Text>
                            <View style={styles.studentUnitBadge}>
                              <MaterialCommunityIcons
                                name="school"
                                size={11}
                                color="#FFFFFF"
                                style={{ marginRight: 4 }}
                              />
                              <Text numberOfLines={1} style={styles.studentUnitText}>
                                {unitTitle}
                              </Text>
                            </View>
                          </View>

                          {/* Right Action Button */}
                          <View style={[styles.selectedActionBtnRight, !isSelected && styles.selectedActionBtnRightInactive]}>
                            <MaterialCommunityIcons
                              name={isSelected ? 'check-circle' : 'gesture-tap'}
                              size={16}
                              color={isSelected ? '#18A165' : '#FFFFFF'}
                            />
                            <Text style={[styles.selectedActionBtnText, !isSelected && styles.selectedActionBtnTextInactive]}>
                              {isSelected ? 'Terpilih' : 'Pilih'}
                            </Text>
                          </View>
                        </View>

                        {/* Middle Attributes Bar: Kelas | Jenjang | Presensi */}
                        <View style={styles.studentAttributesGrid}>
                          <View style={styles.studentAttrBox}>
                            <View style={styles.studentAttrLabelRow}>
                              <MaterialCommunityIcons name="school" size={13} color="#A7F3D0" style={{ marginRight: 3 }} />
                              <Text style={styles.studentAttrLabel}>Kelas</Text>
                            </View>
                            <Text numberOfLines={1} style={styles.studentAttrValue}>
                              {className}
                            </Text>
                          </View>
                          <View style={styles.studentAttrDivider} />
                          <View style={styles.studentAttrBox}>
                            <View style={styles.studentAttrLabelRow}>
                              <MaterialCommunityIcons name="domain" size={13} color="#A7F3D0" style={{ marginRight: 3 }} />
                              <Text style={styles.studentAttrLabel}>Jenjang</Text>
                            </View>
                            <Text numberOfLines={1} style={styles.studentAttrValue}>
                              {jenjang}
                            </Text>
                          </View>
                          <View style={styles.studentAttrDivider} />
                          <View style={styles.studentAttrBox}>
                            <View style={styles.studentAttrLabelRow}>
                              <MaterialCommunityIcons name="account-group" size={13} color="#A7F3D0" style={{ marginRight: 3 }} />
                              <Text style={styles.studentAttrLabel}>Presensi</Text>
                            </View>
                            <View style={styles.studentPresensiValueRow}>
                              <Text numberOfLines={1} style={[styles.studentAttrValue, { color: '#DEF7EC' }]}>
                                Hadir
                              </Text>
                              <View style={styles.presensiGreenDot} />
                            </View>
                          </View>
                        </View>
                      </LinearGradient>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {children.length > 1 && (
                <View style={styles.paginationDotsRow}>
                  {children.map((child, idx) => {
                    const isSelected = String(child.id) === selectedChildId;
                    return (
                      <TouchableOpacity
                        key={String(child.id)}
                        onPress={() => selectChildWithScroll(String(child.id), idx)}
                        style={[styles.paginationDot, isSelected && styles.paginationDotActive]}
                      />
                    );
                  })}
                </View>
              )}
            </View>
          ) : studentInfo ? (
            <View style={[styles.containerBlock, styles.studentContainerBlock]}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderTitleWrap}>
                  <MaterialCommunityIcons name="account-school" size={18} color="#18A165" />
                  <Text style={styles.sectionTitle}>Data Ananda</Text>
                </View>
              </View>

              {(() => {
                const s = studentInfo;
                const studentFullName = s.full_name || s.nama_lengkap || s.name || 'Siswa Aktif';
                const className = s.kelas?.nama_kelas || s.kelas?.name || s.class || s.class_name || 'Kelas Belum Ditentukan';
                const unitTitle = s.education_unit?.name || s.kelas?.unit_pendidikan?.name || s.unit || s.unit_name || 'Unit Sekolah';
                const jenjang = s.kelas?.jenjang || s.education_unit?.level || 'Terpadu';
                const avatarUri = getProfileImageUrl(s);

                return (
                  <LinearGradient
                    colors={['#0D6B42', '#18A165', '#2BD988']}
                    locations={[0, 0.55, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.childCardHeroSizeSingle}
                  >
                    <View style={styles.cardDecorCircle} />

                    <View style={styles.childHeroTopRow}>
                      <View style={styles.avatarBorderWrapHero}>
                        {avatarUri ? (
                          <Image source={{ uri: avatarUri }} style={styles.childAvatarImgHero} resizeMode="cover" />
                        ) : (
                          <Image
                            source={
                              s?.gender === 'female' ||
                              s?.jenis_kelamin === 'P' ||
                              s?.jenis_kelamin === 'female' ||
                              s?.gender === 'P'
                                ? DEFAULT_STUDENT_GIRL_AVATAR
                                : DEFAULT_STUDENT_BOY_AVATAR
                            }
                            style={styles.childAvatarImgHero}
                            resizeMode="cover"
                          />
                        )}
                      </View>
                      <View style={styles.childInfoCol}>
                        <View style={styles.studentNameBadgeRow}>
                          <Text numberOfLines={1} style={styles.studentFullName}>
                            {studentFullName}
                          </Text>
                        </View>
                        <Text style={styles.studentNisText}>
                          NIS: {s.nis || '-'} {s.nisn ? `· NISN: ${s.nisn}` : ''}
                        </Text>
                        <View style={styles.studentUnitBadge}>
                          <MaterialCommunityIcons name="school" size={11} color="#FFFFFF" style={{ marginRight: 4 }} />
                          <Text numberOfLines={1} style={styles.studentUnitText}>
                            {unitTitle}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.selectedActionBtnRight}>
                        <MaterialCommunityIcons name="check-circle" size={16} color="#18A165" />
                        <Text style={styles.selectedActionBtnText}>Aktif</Text>
                      </View>
                    </View>

                    <View style={styles.studentAttributesGrid}>
                      <View style={styles.studentAttrBox}>
                        <View style={styles.studentAttrLabelRow}>
                          <MaterialCommunityIcons name="school" size={13} color="#A7F3D0" style={{ marginRight: 3 }} />
                          <Text style={styles.studentAttrLabel}>Kelas</Text>
                        </View>
                        <Text numberOfLines={1} style={styles.studentAttrValue}>
                          {className}
                        </Text>
                      </View>
                      <View style={styles.studentAttrDivider} />
                      <View style={styles.studentAttrBox}>
                        <View style={styles.studentAttrLabelRow}>
                          <MaterialCommunityIcons name="domain" size={13} color="#A7F3D0" style={{ marginRight: 3 }} />
                          <Text style={styles.studentAttrLabel}>Jenjang</Text>
                        </View>
                        <Text numberOfLines={1} style={styles.studentAttrValue}>
                          {jenjang}
                        </Text>
                      </View>
                      <View style={styles.studentAttrDivider} />
                      <View style={styles.studentAttrBox}>
                        <View style={styles.studentAttrLabelRow}>
                          <MaterialCommunityIcons name="account-group" size={13} color="#A7F3D0" style={{ marginRight: 3 }} />
                          <Text style={styles.studentAttrLabel}>Presensi</Text>
                        </View>
                        <View style={styles.studentPresensiValueRow}>
                          <Text numberOfLines={1} style={[styles.studentAttrValue, { color: '#DEF7EC' }]}>
                            Hadir
                          </Text>
                          <View style={styles.presensiGreenDot} />
                        </View>
                      </View>
                    </View>
                  </LinearGradient>
                );
              })()}
            </View>
          ) : user ? (
            <View style={[styles.containerBlock, styles.studentContainerBlock]}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderTitleWrap}>
                  <MaterialCommunityIcons name="account-tie" size={18} color="#18A165" />
                  <Text style={styles.sectionTitle}>Data Pengguna & Unit Pendidikan</Text>
                </View>
              </View>

              {(() => {
                const u = user as any;
                const userName = String(u?.name || u?.full_name || u?.nama_lengkap || 'Pengguna');
                const userRole = String(typeof u?.role === 'string' ? user.role : Array.isArray(u?.roles) && u.roles[0] ? u.roles[0] : 'Pengguna');
                const unitTitle = String(u?.unit_name || u?.education_unit?.name || 'Sistem Sekolah Terpadu');
                const avatarUri = getProfileImageUrl(u);

                return (
                  <LinearGradient
                    colors={['#0D6B42', '#18A165', '#2BD988']}
                    locations={[0, 0.55, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.childCardHeroSizeSingle}
                  >
                    <View style={styles.cardDecorCircle} />

                    <View style={styles.childHeroTopRow}>
                      <View style={styles.avatarBorderWrapHero}>
                        {avatarUri ? (
                          <Image source={{ uri: avatarUri }} style={styles.childAvatarImgHero} resizeMode="cover" />
                        ) : (
                          <Text style={styles.avatarInitialText}>{userName.charAt(0).toUpperCase()}</Text>
                        )}
                      </View>
                      <View style={styles.childInfoCol}>
                        <Text numberOfLines={1} style={styles.childNameHero}>
                          {userName}
                        </Text>
                        <Text style={styles.childSubInfoHero}>
                          {u.nis ? `NIS: ${u.nis}` : 'Akun Terverifikasi'}
                        </Text>
                        <View style={styles.studentUnitBadge}>
                          <MaterialCommunityIcons name="briefcase-outline" size={11} color="#FFFFFF" style={{ marginRight: 4 }} />
                          <Text numberOfLines={1} style={styles.studentUnitText}>
                            {userRole}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.selectedActionBtnRight}>
                        <MaterialCommunityIcons name="check-circle" size={18} color="#18A165" />
                        <Text style={styles.selectedActionBtnText}>Aktif</Text>
                      </View>
                    </View>

                    <View style={styles.studentAttributesGrid}>
                      <View style={styles.studentAttrBox}>
                        <Text style={styles.studentAttrLabel}>Peran</Text>
                        <Text numberOfLines={1} style={styles.studentAttrValue}>
                          {userRole}
                        </Text>
                      </View>
                      <View style={styles.studentAttrDivider} />
                      <View style={styles.studentAttrBox}>
                        <Text style={styles.studentAttrLabel}>Unit</Text>
                        <Text numberOfLines={1} style={styles.studentAttrValue}>
                          {unitTitle}
                        </Text>
                      </View>
                      <View style={styles.studentAttrDivider} />
                      <View style={styles.studentAttrBox}>
                        <Text style={styles.studentAttrLabel}>Status</Text>
                        <Text numberOfLines={1} style={[styles.studentAttrValue, { color: '#DEF7EC' }]}>
                          Aktif
                        </Text>
                      </View>
                    </View>
                  </LinearGradient>
                );
              })()}
            </View>
          ) : null}

          {/* ══════════════════════════════════════════════════════════════
              SECTION 2: 4 STATS GRID (TOTAL, TERSEDIA, AKAN DATANG, SELESAI)
             ══════════════════════════════════════════════════════════════ */}
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <View style={[styles.statIconBox, { backgroundColor: '#ECFDF5' }]}>
                <MaterialCommunityIcons name="file-document-check-outline" size={20} color="#059669" />
              </View>
              <Text style={styles.statValue}>{stats.total}</Text>
              <Text style={styles.statLabel}>Total CBT</Text>
            </View>

            <View style={styles.statCard}>
              <View style={[styles.statIconBox, { backgroundColor: '#EFF6FF' }]}>
                <MaterialCommunityIcons name="play-circle-outline" size={20} color="#2563EB" />
              </View>
              <Text style={styles.statValue}>{stats.available}</Text>
              <Text style={styles.statLabel}>Tersedia</Text>
            </View>

            <View style={styles.statCard}>
              <View style={[styles.statIconBox, { backgroundColor: '#FFFBEB' }]}>
                <MaterialCommunityIcons name="clock-outline" size={20} color="#D97706" />
              </View>
              <Text style={styles.statValue}>{stats.upcoming}</Text>
              <Text style={styles.statLabel}>Akan Datang</Text>
            </View>

            <View style={styles.statCard}>
              <View style={[styles.statIconBox, { backgroundColor: '#FAF5FF' }]}>
                <MaterialCommunityIcons name="shield-check-outline" size={20} color="#7C3AED" />
              </View>
              <Text style={styles.statValue}>{stats.completed}</Text>
              <Text style={styles.statLabel}>Selesai</Text>
            </View>
          </View>

          {/* ══════════════════════════════════════════════════════════════
              SECTION 3: SEARCH & FILTER TABS
             ══════════════════════════════════════════════════════════════ */}
          <View style={styles.containerBlock}>
            <View style={styles.searchContainer}>
              <MaterialCommunityIcons name="magnify" size={20} color="#94A3B8" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Cari judul ujian atau mata pelajaran..."
                placeholderTextColor="#94A3B8"
                value={search}
                onChangeText={setSearch}
              />
              {search.trim().length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            {/* Filter Tabs Row */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterTabsRow}>
              {[
                { id: 'semua', label: 'Semua Ujian' },
                { id: 'available', label: 'Siap Dikerjakan' },
                { id: 'upcoming', label: 'Mendatang' },
                { id: 'completed', label: 'Riwayat Selesai' },
              ].map((tab) => {
                const isSelected = selectedFilter === tab.id;
                return (
                  <TouchableOpacity
                    key={tab.id}
                    activeOpacity={0.75}
                    onPress={() => setSelectedFilter(tab.id as any)}
                    style={[styles.filterTab, isSelected && styles.filterTabActive]}
                  >
                    <Text style={[styles.filterTabText, isSelected && styles.filterTabTextActive]}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* ══════════════════════════════════════════════════════════════
              SECTION 4: CBT EXAMS LIST (100% REAL DATA DATABASE)
             ══════════════════════════════════════════════════════════════ */}
          {loading && !refreshing ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="large" color="#18A165" />
              <Text style={styles.loadingText}>Memuat jadwal ujian CBT dari database...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorBox}>
              <MaterialCommunityIcons name="alert-circle-outline" size={28} color="#DC2626" />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={() => void loadAll()} style={styles.retryBtn}>
                <Text style={styles.retryBtnText}>Muat Ulang</Text>
              </TouchableOpacity>
            </View>
          ) : filteredExams.length === 0 ? (
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="file-check-outline" size={48} color="#94A3B8" />
              <Text style={styles.emptyTitle}>Belum Ada Ujian CBT</Text>
              <Text style={styles.emptySubtitle}>
                {search || selectedFilter !== 'semua'
                  ? 'Tidak ditemukan jadwal ujian yang sesuai dengan filter pencarian.'
                  : 'Belum ada paket ujian CBT yang diterbitkan oleh dewan guru untuk kelas ini.'}
              </Text>
            </View>
          ) : (
            <View style={styles.examsList}>
              {filteredExams.map((exam) => {
                const isAvailable = ['available', 'resume'].includes(exam.availability);
                const isUpcoming = exam.availability === 'upcoming';
                const isEnded = exam.availability === 'ended' || exam.availability === 'completed';
                const hasScore = exam.latest_result?.nilai_tersedia && exam.latest_result?.nilai_final != null;

                return (
                  <TouchableOpacity
                    key={exam.id}
                    activeOpacity={0.92}
                    onPress={() => setInstructionModal(exam)}
                    style={styles.examCard}
                  >
                    {/* Header: Subject & Availability Badge */}
                    <View style={styles.cardHeaderRow}>
                      <View style={styles.subjectBadge}>
                        <MaterialCommunityIcons name="book-open-page-variant" size={12} color="#059669" />
                        <Text numberOfLines={1} style={styles.subjectBadgeText}>
                          {exam.mata_pelajaran || 'Mata Pelajaran'}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.statusBadge,
                          isAvailable && styles.statusBadgeAvailable,
                          isUpcoming && styles.statusBadgeUpcoming,
                          isEnded && styles.statusBadgeEnded,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusBadgeText,
                            isAvailable && styles.statusBadgeTextAvailable,
                            isUpcoming && styles.statusBadgeTextUpcoming,
                            isEnded && styles.statusBadgeTextEnded,
                          ]}
                        >
                          {exam.availability === 'available'
                            ? 'Tersedia'
                            : exam.availability === 'resume'
                            ? 'Lanjutkan'
                            : exam.availability === 'upcoming'
                            ? 'Akan Datang'
                            : 'Ditutup'}
                        </Text>
                      </View>
                    </View>

                    {/* Title */}
                    <Text style={styles.examTitle} numberOfLines={2}>
                      {exam.judul_ujian}
                    </Text>

                    {/* Meta: Kelas & Guru */}
                    <Text style={styles.metaClassGuru} numberOfLines={1}>
                      {exam.kelas || 'Kelas'} · Guru: {exam.guru || 'Dewan Guru'}
                    </Text>

                    {/* Attributes: Duration & Question Count */}
                    <View style={styles.attrRow}>
                      <View style={styles.attrPill}>
                        <MaterialCommunityIcons name="clock-outline" size={13} color="#2563EB" />
                        <Text style={styles.attrPillText}>{exam.durasi_menit} Menit</Text>
                      </View>
                      <View style={styles.attrPill}>
                        <MaterialCommunityIcons name="format-list-numbered" size={13} color="#7C3AED" />
                        <Text style={styles.attrPillText}>
                          {exam.kisi_kisi?.jumlah_soal ? `${exam.kisi_kisi.jumlah_soal} Soal` : 'Soal Terpadu'}
                        </Text>
                      </View>
                      <View style={styles.attrPill}>
                        <MaterialCommunityIcons name="target" size={13} color="#059669" />
                        <Text style={styles.attrPillText}>KKM {exam.nilai_kkm}</Text>
                      </View>
                    </View>

                    {/* Schedule Time Windows */}
                    <View style={styles.timeWindowBox}>
                      <Text style={styles.timeWindowText}>Mulai: {formatDate(exam.waktu_mulai)}</Text>
                      <Text style={styles.timeWindowText}>Selesai: {formatDate(exam.waktu_selesai)}</Text>
                    </View>

                    {/* Result Pill if Completed */}
                    {hasScore && (
                      <View style={styles.scoreRow}>
                        <MaterialCommunityIcons name="check-decagram" size={16} color="#059669" />
                        <Text style={styles.scoreText}>
                          Nilai Akhir: <Text style={{ fontWeight: '900', color: '#059669' }}>{exam.latest_result?.nilai_final}</Text>
                        </Text>
                      </View>
                    )}

                    {/* Action Button */}
                    {isParent ? (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => setInstructionModal(exam)}
                        style={styles.actionBtnParent}
                      >
                        <MaterialCommunityIcons name="information-outline" size={16} color="#0284C7" />
                        <Text style={styles.actionBtnParentText}>Lihat Detail & Petunjuk Ujian</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        disabled={!isAvailable || startingId === exam.id}
                        onPress={() => setInstructionModal(exam)}
                        style={[
                          styles.actionBtn,
                          !isAvailable && styles.actionBtnDisabled,
                        ]}
                      >
                        {startingId === exam.id ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <>
                            <MaterialCommunityIcons
                              name={isAvailable ? 'play-circle' : 'lock-outline'}
                              size={16}
                              color="#FFFFFF"
                            />
                            <Text style={styles.actionBtnText}>
                              {exam.availability === 'resume'
                                ? 'Lanjutkan Ujian'
                                : exam.availability === 'available'
                                ? 'Mulai Ujian'
                                : 'Belum Dapat Dikerjakan'}
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
      </View>

      {/* ══════════════════════════════════════════════════════════════
          MODAL PETUNJUK PENGERJAAN UJIAN
         ══════════════════════════════════════════════════════════════ */}
      <Modal
        visible={Boolean(instructionModal)}
        transparent
        animationType="fade"
        onRequestClose={() => setInstructionModal(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Petunjuk Pengerjaan Ujian</Text>
              <TouchableOpacity
                onPress={() => setInstructionModal(null)}
                style={styles.modalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalExamTitle}>{instructionModal?.judul_ujian}</Text>
              <Text style={styles.modalMetaInfo}>
                Mata Pelajaran: {instructionModal?.mata_pelajaran || '-'} · Durasi: {instructionModal?.durasi_menit} Menit
              </Text>

              {/* Parent Monitoring Info or Student Time Warning */}
              {isParent ? (
                <View style={styles.parentNoticeBox}>
                  <MaterialCommunityIcons name="account-eye" size={20} color="#0369A1" style={{ marginRight: 8 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.parentNoticeTitle}>Mode Pemantauan Orang Tua</Text>
                    <Text style={styles.parentNoticeText}>
                      Pengerjaan ujian CBT dilakukan secara mandiri oleh siswa melalui akun siswa. Orang tua dapat memantau jadwal, status kehadiran, dan nilai akhir ujian di halaman ini.
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.instructionNoticeBox}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={20} color="#B45309" style={{ marginRight: 6 }} />
                  <Text style={styles.instructionNoticeText}>
                    Setelah menekan Mulai Ujian, hitungan mundur waktu akan otomatis berjalan. Pastikan koneksi internet stabil hingga lembar jawaban berhasil dikumpulkan.
                  </Text>
                </View>
              )}

              {instructionModal?.instruksi ? (
                <View style={styles.instructionDetailBox}>
                  <Text style={styles.instructionDetailHeader}>Instruksi Guru:</Text>
                  <Text style={styles.instructionDetailContent}>{instructionModal.instruksi}</Text>
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                onPress={() => setInstructionModal(null)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelBtnText}>{isParent ? 'Tutup' : 'Batal'}</Text>
              </TouchableOpacity>
              {!isParent && (
                <TouchableOpacity
                  onPress={() => instructionModal && handleStartExam(instructionModal)}
                  style={styles.modalStartBtn}
                >
                  <MaterialCommunityIcons name="play" size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
                  <Text style={styles.modalStartBtnText}>
                    {instructionModal?.availability === 'resume' ? 'Lanjutkan Kerjakan' : 'Mulai Kerjakan'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════
          MODAL FULL-SCREEN: CBT EXAM RUNNER (RUANG UJIAN INTERAKTIF)
         ══════════════════════════════════════════════════════════════ */}
      <Modal
        visible={Boolean(activeExamSession)}
        animationType="slide"
        onRequestClose={handleConfirmFinish}
      >
        {activeExamSession && (
          <View style={[styles.runnerContainer, { paddingTop: Math.max(insets.top, Platform.OS === 'android' ? 24 : 16) }]}>
            {/* Runner Header */}
            <View style={styles.runnerHeader}>
              <TouchableOpacity
                onPress={handleConfirmFinish}
                style={styles.runnerExitBtn}
              >
                <MaterialCommunityIcons name="chevron-left" size={26} color="#0F172A" />
              </TouchableOpacity>

              <View style={styles.runnerHeaderTitleBox}>
                <Text style={styles.runnerExamTitle} numberOfLines={1}>
                  {activeExamSession.ujian.judul_ujian}
                </Text>
                <Text style={styles.runnerExamSub}>
                  Soal {currentQuestionIndex + 1} dari {activeExamSession.soal.length}
                </Text>
              </View>

              {/* Countdown Timer Badge */}
              <View
                style={[
                  styles.runnerTimerBadge,
                  timeLeft <= 300 && styles.runnerTimerBadgeWarning,
                ]}
              >
                <MaterialCommunityIcons
                  name="timer-outline"
                  size={15}
                  color={timeLeft <= 300 ? '#DC2626' : '#059669'}
                />
                <Text
                  style={[
                    styles.runnerTimerText,
                    timeLeft <= 300 && styles.runnerTimerTextWarning,
                  ]}
                >
                  {formatTimer(timeLeft)}
                </Text>
              </View>

              {/* Question Palette Button */}
              <TouchableOpacity
                onPress={() => setShowQuestionPalette(true)}
                style={styles.runnerPaletteBtn}
              >
                <MaterialCommunityIcons name="view-grid-outline" size={18} color="#0F172A" />
                <Text style={styles.runnerPaletteBtnText}>
                  {activeExamSession.soal.filter((q) => Boolean(examAnswers[q.id])).length}/{activeExamSession.soal.length}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Progress Bar & Auto-save Status */}
            <View style={styles.progressBarBackground}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${Math.round(
                      ((currentQuestionIndex + 1) / (activeExamSession.soal.length || 1)) * 100
                    )}%`,
                  },
                ]}
              />
            </View>
            <View style={styles.savingIndicatorRow}>
              {savingAnswer ? (
                <>
                  <ActivityIndicator size="small" color="#18A165" style={{ transform: [{ scale: 0.7 }] }} />
                  <Text style={styles.savingIndicatorText}>Menyimpan ke server...</Text>
                </>
              ) : (
                <>
                  <MaterialCommunityIcons name="cloud-check-outline" size={13} color="#059669" />
                  <Text style={styles.savingIndicatorText}>Jawaban tersimpan otomatis</Text>
                </>
              )}
            </View>

            {/* Question Body */}
            {activeExamSession.soal.length > 0 && activeExamSession.soal[currentQuestionIndex] ? (
              (() => {
                const currentQuestion = activeExamSession.soal[currentQuestionIndex];
                const isDoubtful = Boolean(doubtfulQuestions[currentQuestion.id]);
                const selectedKey = examAnswers[currentQuestion.id];

                return (
                  <ScrollView
                    style={styles.questionScroll}
                    contentContainerStyle={[styles.questionScrollContent, { paddingBottom: bottomInset + 80 }]}
                    showsVerticalScrollIndicator={false}
                  >
                    {/* Question Meta Row */}
                    <View style={styles.questionMetaRow}>
                      <View style={styles.questionIndexBadge}>
                        <Text style={styles.questionIndexText}>Nomor {currentQuestionIndex + 1}</Text>
                      </View>
                      <View style={styles.questionPointBadge}>
                        <MaterialCommunityIcons name="star-outline" size={13} color="#059669" />
                        <Text style={styles.questionPointText}>Poin: {currentQuestion.poin}</Text>
                      </View>
                      {isDoubtful && (
                        <View style={styles.doubtfulTag}>
                          <MaterialCommunityIcons name="alert-outline" size={12} color="#B45309" />
                          <Text style={styles.doubtfulTagText}>Ragu-ragu</Text>
                        </View>
                      )}
                    </View>

                    {/* Question Text Box */}
                    <View style={styles.questionCard}>
                      <Text style={styles.questionText}>{currentQuestion.pertanyaan}</Text>
                    </View>

                    {/* Multiple Choice Options */}
                    <View style={styles.optionsContainer}>
                      {currentQuestion.opsi && currentQuestion.opsi.length > 0 ? (
                        currentQuestion.opsi.map((opt) => {
                          const isSelected = selectedKey === opt.key;
                          return (
                            <TouchableOpacity
                              key={opt.key}
                              activeOpacity={0.8}
                              onPress={() => void handleSelectOption(currentQuestion.id, opt.key)}
                              style={[
                                styles.optionItem,
                                isSelected && styles.optionItemSelected,
                              ]}
                            >
                              <View
                                style={[
                                  styles.optionRadioCircle,
                                  isSelected && styles.optionRadioCircleSelected,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.optionRadioText,
                                    isSelected && styles.optionRadioTextSelected,
                                  ]}
                                >
                                  {opt.key}
                                </Text>
                              </View>
                              <Text
                                style={[
                                  styles.optionText,
                                  isSelected && styles.optionTextSelected,
                                ]}
                              >
                                {opt.text}
                              </Text>
                            </TouchableOpacity>
                          );
                        })
                      ) : (
                        <View style={styles.essayBox}>
                          <Text style={styles.essayPrompt}>Ketik jawaban Anda pada kolom di bawah:</Text>
                          <TextInput
                            style={styles.essayInput}
                            multiline
                            numberOfLines={5}
                            value={selectedKey || ''}
                            placeholder="Tuliskan jawaban lengkap..."
                            placeholderTextColor="#94A3B8"
                            onChangeText={(text) => {
                              void handleSelectOption(currentQuestion.id, text);
                            }}
                          />
                        </View>
                      )}
                    </View>
                  </ScrollView>
                );
              })()
            ) : (
              <View style={styles.emptyQuestionBox}>
                <Text style={styles.emptyQuestionText}>Belum ada soal pada ujian ini.</Text>
              </View>
            )}

            {/* Bottom Navigation Toolbar */}
            <View style={[styles.runnerBottomBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
              <TouchableOpacity
                disabled={currentQuestionIndex === 0}
                onPress={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
                style={[
                  styles.runnerNavBtn,
                  currentQuestionIndex === 0 && styles.runnerNavBtnDisabled,
                ]}
              >
                <MaterialCommunityIcons
                  name="chevron-left"
                  size={18}
                  color={currentQuestionIndex === 0 ? '#94A3B8' : '#334155'}
                />
                <Text
                  style={[
                    styles.runnerNavBtnText,
                    currentQuestionIndex === 0 && styles.runnerNavBtnTextDisabled,
                  ]}
                >
                  Sebelumnya
                </Text>
              </TouchableOpacity>

              {/* Ragu-ragu Button */}
              {activeExamSession.soal[currentQuestionIndex] && (
                <TouchableOpacity
                  onPress={() => handleToggleDoubtful(activeExamSession.soal[currentQuestionIndex].id)}
                  style={[
                    styles.doubtfulToggleBtn,
                    doubtfulQuestions[activeExamSession.soal[currentQuestionIndex].id] &&
                      styles.doubtfulToggleBtnActive,
                  ]}
                >
                  <MaterialCommunityIcons
                    name={
                      doubtfulQuestions[activeExamSession.soal[currentQuestionIndex].id]
                        ? 'checkbox-marked'
                        : 'checkbox-blank-outline'
                    }
                    size={16}
                    color={
                      doubtfulQuestions[activeExamSession.soal[currentQuestionIndex].id]
                        ? '#D97706'
                        : '#64748B'
                    }
                  />
                  <Text
                    style={[
                      styles.doubtfulToggleBtnText,
                      doubtfulQuestions[activeExamSession.soal[currentQuestionIndex].id] &&
                        styles.doubtfulToggleBtnTextActive,
                    ]}
                  >
                    Ragu-ragu
                  </Text>
                </TouchableOpacity>
              )}

              {currentQuestionIndex < activeExamSession.soal.length - 1 ? (
                <TouchableOpacity
                  onPress={() => setCurrentQuestionIndex((prev) => Math.min(activeExamSession.soal.length - 1, prev + 1))}
                  style={[styles.runnerNavBtn, styles.runnerNavBtnNext]}
                >
                  <Text style={styles.runnerNavBtnTextNext}>Berikutnya</Text>
                  <MaterialCommunityIcons name="chevron-right" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={handleConfirmFinish}
                  disabled={submittingExam}
                  style={styles.finishBtnPrimary}
                >
                  {submittingExam ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="check-all" size={18} color="#FFFFFF" />
                      <Text style={styles.finishBtnPrimaryText}>Kumpulkan</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </Modal>

      {/* ══════════════════════════════════════════════════════════════
          MODAL LEMBAR NOMOR SOAL (QUESTION PALETTE)
         ══════════════════════════════════════════════════════════════ */}
      <Modal
        visible={showQuestionPalette}
        transparent
        animationType="fade"
        onRequestClose={() => setShowQuestionPalette(false)}
      >
        <View style={styles.paletteModalBackdrop}>
          <View style={styles.paletteModalContainer}>
            <View style={styles.paletteHeader}>
              <Text style={styles.paletteTitle}>Daftar Nomor Soal</Text>
              <TouchableOpacity
                onPress={() => setShowQuestionPalette(false)}
                style={styles.modalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.paletteScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.paletteGrid}>
                {activeExamSession?.soal.map((q, idx) => {
                  const isCurrent = idx === currentQuestionIndex;
                  const isAnswered = Boolean(examAnswers[q.id]);
                  const isDoubtful = Boolean(doubtfulQuestions[q.id]);

                  return (
                    <TouchableOpacity
                      key={q.id}
                      activeOpacity={0.8}
                      onPress={() => {
                        setCurrentQuestionIndex(idx);
                        setShowQuestionPalette(false);
                      }}
                      style={[
                        styles.paletteItem,
                        isAnswered && styles.paletteItemAnswered,
                        isDoubtful && styles.paletteItemDoubtful,
                        isCurrent && styles.paletteItemCurrent,
                      ]}
                    >
                      <Text
                        style={[
                          styles.paletteItemText,
                          (isAnswered || isDoubtful) && styles.paletteItemTextAnswered,
                        ]}
                      >
                        {idx + 1}
                      </Text>
                      {isDoubtful ? (
                        <View style={styles.paletteDoubtfulDot} />
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Palette Legend */}
              <View style={styles.paletteLegendRow}>
                <View style={styles.paletteLegendItem}>
                  <View style={[styles.paletteLegendDot, { backgroundColor: '#10B981' }]} />
                  <Text style={styles.paletteLegendText}>Sudah Dijawab</Text>
                </View>
                <View style={styles.paletteLegendItem}>
                  <View style={[styles.paletteLegendDot, { backgroundColor: '#F59E0B' }]} />
                  <Text style={styles.paletteLegendText}>Ragu-ragu</Text>
                </View>
                <View style={styles.paletteLegendItem}>
                  <View style={[styles.paletteLegendDot, { backgroundColor: '#E2E8F0', borderWidth: 1, borderColor: '#CBD5E1' }]} />
                  <Text style={styles.paletteLegendText}>Belum Dijawab</Text>
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                onPress={() => setShowQuestionPalette(false)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelBtnText}>Tutup</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setShowQuestionPalette(false);
                  handleConfirmFinish();
                }}
                style={styles.finishBtnPalette}
              >
                <MaterialCommunityIcons name="check-circle-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.finishBtnPaletteText}>Selesaikan Ujian</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════
          MODAL HASIL UJIAN (EXAM RESULT)
         ══════════════════════════════════════════════════════════════ */}
      <Modal
        visible={Boolean(examResultModal)}
        transparent
        animationType="fade"
        onRequestClose={() => setExamResultModal(null)}
      >
        <View style={styles.resultModalBackdrop}>
          <View style={styles.resultModalContainer}>
            <View style={styles.resultIconCircle}>
              <MaterialCommunityIcons name="trophy-award" size={44} color="#18A165" />
            </View>

            <Text style={styles.resultTitle}>Ujian Berhasil Dikumpulkan!</Text>
            <Text style={styles.resultSub}>
              Seluruh lembar jawaban Anda telah tersimpan dengan aman pada sistem CBT sekolah.
            </Text>

            {examResultModal?.nilai_tersedia && examResultModal.nilai_final != null ? (
              <>
                <View style={styles.resultScoreCard}>
                  <Text style={styles.resultScoreLabel}>Nilai Akhir Anda</Text>
                  <Text style={styles.resultScoreValue}>
                    {Number(examResultModal.nilai_final).toFixed(1)}
                  </Text>
                  {examResultModal.nilai_kkm != null && (
                    <Text style={styles.resultKkmText}>
                      Standar KKM: {examResultModal.nilai_kkm} ·{' '}
                      {Number(examResultModal.nilai_final) >= Number(examResultModal.nilai_kkm) ? (
                        <Text style={{ color: '#059669', fontWeight: '800' }}>TUNTAS</Text>
                      ) : (
                        <Text style={{ color: '#DC2626', fontWeight: '800' }}>BELUM TUNTAS</Text>
                      )}
                    </Text>
                  )}
                </View>

                <View style={styles.resultStatsRow}>
                  <View style={styles.resultStatBox}>
                    <Text style={[styles.resultStatVal, { color: '#059669' }]}>
                      {examResultModal.jumlah_benar ?? '-'}
                    </Text>
                    <Text style={styles.resultStatLbl}>Benar</Text>
                  </View>
                  <View style={styles.resultStatBox}>
                    <Text style={[styles.resultStatVal, { color: '#DC2626' }]}>
                      {examResultModal.jumlah_salah ?? '-'}
                    </Text>
                    <Text style={styles.resultStatLbl}>Salah</Text>
                  </View>
                  <View style={styles.resultStatBox}>
                    <Text style={[styles.resultStatVal, { color: '#64748B' }]}>
                      {examResultModal.jumlah_kosong ?? '-'}
                    </Text>
                    <Text style={styles.resultStatLbl}>Kosong</Text>
                  </View>
                </View>
              </>
            ) : (
              <View style={styles.scorePendingBox}>
                <MaterialCommunityIcons name="clock-check-outline" size={24} color="#0E7490" />
                <Text style={styles.scorePendingText}>
                  Hasil penilaian dan rekapitulasi nilai akan diumumkan setelah proses evaluasi oleh dewan guru.
                </Text>
              </View>
            )}

            <TouchableOpacity
              onPress={() => setExamResultModal(null)}
              style={styles.resultCloseBtn}
            >
              <Text style={styles.resultCloseBtnText}>Kembali ke Beranda Ujian</Text>
            </TouchableOpacity>
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
    backgroundColor: 'transparent',
  },
  content: {
    padding: 16,
    paddingTop: Platform.OS === 'android' ? 20 : 16,
  },
  containerBlock: {
    marginBottom: 16,
  },
  studentContainerBlock: {
    marginBottom: 12,
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
  heroCardScrollContainer: {
    marginHorizontal: -16,
  },
  heroCardScroll: {
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 4,
  },
  childCardHeroSize: {
    width: SCREEN_WIDTH - 50,
    minHeight: 148,
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#0D6B42',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  childCardHeroSizeSingle: {
    width: '100%',
    minHeight: 148,
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#0D6B42',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  childCardHeroSizeInactive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    shadowOpacity: 0.06,
    elevation: 2,
  },
  cardDecorCircle: {
    position: 'absolute',
    top: -24,
    right: -24,
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    zIndex: 0,
  },
  childHeroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1,
  },
  avatarBorderWrapHero: {
    width: 62,
    height: 62,
    borderRadius: 22,
    borderWidth: 2.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarBorderWrapHeroInactive: {
    borderColor: '#A7F3D0',
    backgroundColor: '#EBF8F2',
  },
  childAvatarImgHero: {
    width: '100%',
    height: '100%',
  },
  avatarInitialText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#084835',
  },
  childInfoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  studentNameBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  studentFullName: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  childNameHero: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  childSubInfoHero: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 2,
    fontWeight: '600',
  },
  studentNisText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 2,
    fontWeight: '600',
  },
  studentUnitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  studentUnitBadgeInactive: {
    backgroundColor: '#E7F7EF',
    borderColor: '#A7F3D0',
  },
  studentUnitText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#FFFFFF',
    maxWidth: SCREEN_WIDTH - 220,
  },
  selectedActionBtnRight: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
    marginLeft: 8,
    minWidth: 46,
  },
  selectedActionBtnRightInactive: {
    backgroundColor: '#F1F5F9',
    elevation: 1,
  },
  selectedActionBtnText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#18A165',
    marginTop: 2,
  },
  selectedActionBtnTextInactive: {
    color: '#64748B',
  },
  studentAttributesGrid: {
    flexDirection: 'row',
    backgroundColor: 'rgba(4, 47, 30, 0.35)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginTop: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: 1,
  },
  studentAttributesGridInactive: {
    backgroundColor: '#F1F8F4',
    borderColor: '#D1E8DC',
  },
  studentAttrBox: {
    flex: 1,
    alignItems: 'center',
  },
  studentAttrLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  studentAttrLabel: {
    fontSize: 9,
    color: '#A7F3D0',
    fontWeight: '700',
  },
  studentAttrValue: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  studentPresensiValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  presensiGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34D399',
    marginLeft: 4,
  },
  studentAttrDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  inactiveText: {
    color: '#0F172A',
  },
  inactiveSubText: {
    color: '#64748B',
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

  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  statIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  statLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 2,
  },

  // Search & Filter Tabs
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 46,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
  },
  filterTabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterTabActive: {
    backgroundColor: '#18A165',
    borderColor: '#18A165',
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  filterTabTextActive: {
    color: '#FFFFFF',
  },

  // Exams List
  examsList: {
    gap: 12,
  },
  examCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  subjectBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
  },
  subjectBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#059669',
    textTransform: 'uppercase',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  statusBadgeAvailable: { backgroundColor: '#DCFCE7' },
  statusBadgeUpcoming: { backgroundColor: '#FEF3C7' },
  statusBadgeEnded: { backgroundColor: '#F1F5F9' },
  statusBadgeText: { fontSize: 10, fontWeight: '800', color: '#64748B' },
  statusBadgeTextAvailable: { color: '#15803D' },
  statusBadgeTextUpcoming: { color: '#B45309' },
  statusBadgeTextEnded: { color: '#64748B' },
  examTitle: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 20,
    marginBottom: 4,
  },
  metaClassGuru: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 10,
  },
  attrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  attrPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  attrPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  timeWindowBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  timeWindowText: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    padding: 8,
    borderRadius: 10,
    marginBottom: 10,
  },
  scoreText: {
    fontSize: 11.5,
    color: '#065F46',
    fontWeight: '700',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#18A165',
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  actionBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
  actionBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // State Views
  centerLoading: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  errorText: {
    fontSize: 12,
    color: '#991B1B',
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '600',
  },
  retryBtn: {
    marginTop: 12,
    backgroundColor: '#DC2626',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  emptyBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    marginVertical: 12,
  },
  modalExamTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 4,
  },
  modalMetaInfo: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 12,
  },
  instructionNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  instructionNoticeText: {
    fontSize: 11,
    color: '#92400E',
    fontWeight: '600',
    flex: 1,
    lineHeight: 16,
  },
  instructionDetailBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  instructionDetailHeader: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  instructionDetailContent: {
    fontSize: 11.5,
    color: '#475569',
    lineHeight: 18,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  modalCancelBtnText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
  },
  modalStartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18A165',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  modalStartBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  actionBtnParent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  actionBtnParentText: {
    color: '#0284C7',
    fontSize: 12,
    fontWeight: '700',
  },
  parentNoticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  parentNoticeTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0369A1',
    marginBottom: 2,
  },
  parentNoticeText: {
    fontSize: 11,
    color: '#0C4A6E',
    lineHeight: 16,
  },

  // CBT Runner Styles
  runnerContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  runnerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  runnerExitBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  runnerHeaderTitleBox: {
    flex: 1,
    marginRight: 10,
  },
  runnerExamTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  runnerExamSub: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  runnerTimerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    marginRight: 8,
  },
  runnerTimerBadgeWarning: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  runnerTimerText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#059669',
  },
  runnerTimerTextWarning: {
    color: '#DC2626',
  },
  runnerPaletteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
  },
  runnerPaletteBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
  },
  progressBarBackground: {
    height: 4,
    backgroundColor: '#E2E8F0',
    width: '100%',
  },
  progressBarFill: {
    height: 4,
    backgroundColor: '#18A165',
  },
  savingIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
    backgroundColor: '#F1F5F9',
  },
  savingIndicatorText: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
  },
  questionScroll: {
    flex: 1,
  },
  questionScrollContent: {
    padding: 16,
  },
  questionMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  questionIndexBadge: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  questionIndexText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800',
  },
  questionPointBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  questionPointText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '700',
  },
  doubtfulTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  doubtfulTagText: {
    color: '#B45309',
    fontSize: 11,
    fontWeight: '700',
  },
  questionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  questionText: {
    fontSize: 14.5,
    lineHeight: 22,
    color: '#0F172A',
    fontWeight: '600',
  },
  optionsContainer: {
    gap: 10,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  optionItemSelected: {
    borderColor: '#18A165',
    backgroundColor: '#F2FAF6',
  },
  optionRadioCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    backgroundColor: '#F8FAFC',
  },
  optionRadioCircleSelected: {
    borderColor: '#18A165',
    backgroundColor: '#18A165',
  },
  optionRadioText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#475569',
  },
  optionRadioTextSelected: {
    color: '#FFFFFF',
  },
  optionText: {
    fontSize: 13.5,
    color: '#334155',
    flex: 1,
    lineHeight: 19,
    fontWeight: '500',
  },
  optionTextSelected: {
    color: '#064E3B',
    fontWeight: '700',
  },
  essayBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  essayPrompt: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 8,
  },
  essayInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 12,
    fontSize: 13.5,
    color: '#0F172A',
    textAlignVertical: 'top',
    minHeight: 120,
  },
  emptyQuestionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyQuestionText: {
    fontSize: 13,
    color: '#64748B',
  },
  runnerBottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 8,
  },
  runnerNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 4,
  },
  runnerNavBtnDisabled: {
    opacity: 0.5,
  },
  runnerNavBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  runnerNavBtnTextDisabled: {
    color: '#94A3B8',
  },
  runnerNavBtnNext: {
    backgroundColor: '#0F172A',
  },
  runnerNavBtnTextNext: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  doubtfulToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  doubtfulToggleBtnActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  doubtfulToggleBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
  },
  doubtfulToggleBtnTextActive: {
    color: '#B45309',
  },
  finishBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#18A165',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  finishBtnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  // Question Palette Styles
  paletteModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  paletteModalContainer: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  paletteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  paletteTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  paletteScroll: {
    maxHeight: 320,
  },
  paletteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'flex-start',
    paddingVertical: 4,
  },
  paletteItem: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  paletteItemAnswered: {
    backgroundColor: '#10B981',
    borderColor: '#059669',
  },
  paletteItemDoubtful: {
    backgroundColor: '#F59E0B',
    borderColor: '#D97706',
  },
  paletteItemCurrent: {
    borderWidth: 2.5,
    borderColor: '#0F172A',
  },
  paletteItemText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#475569',
  },
  paletteItemTextAnswered: {
    color: '#FFFFFF',
  },
  paletteDoubtfulDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  paletteLegendRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  paletteLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  paletteLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  paletteLegendText: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
  },
  finishBtnPalette: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18A165',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  finishBtnPaletteText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  // Exam Result Modal Styles
  resultModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  resultModalContainer: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
  },
  resultIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#A7F3D0',
  },
  resultTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
  },
  resultSub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 18,
  },
  resultScoreCard: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  resultScoreLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 4,
  },
  resultScoreValue: {
    fontSize: 36,
    fontWeight: '900',
    color: '#18A165',
    marginBottom: 4,
  },
  resultKkmText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  resultStatsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
    marginBottom: 20,
  },
  resultStatBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  resultStatVal: {
    fontSize: 16,
    fontWeight: '900',
  },
  resultStatLbl: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  scorePendingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    padding: 14,
    borderRadius: 14,
    gap: 10,
    marginBottom: 20,
  },
  scorePendingText: {
    fontSize: 11.5,
    color: '#0369A1',
    flex: 1,
    lineHeight: 16,
    fontWeight: '600',
  },
  resultCloseBtn: {
    width: '100%',
    backgroundColor: '#0F172A',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  resultCloseBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});

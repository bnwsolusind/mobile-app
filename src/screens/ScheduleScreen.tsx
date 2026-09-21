import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { isParentRole, isTeacherRole } from '../utils/roles';
import {
  getProfileImageUrl,
  DEFAULT_STUDENT_BOY_AVATAR,
  DEFAULT_STUDENT_GIRL_AVATAR,
} from '../utils/profile';
import { offlineCache } from '../utils/offlineCache';
import { useActiveChildStore } from '../stores/activeChildStore';
import { StudentHeroCard } from '../components/StudentHeroCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Child = Record<string, any>;
type ScheduleItem = Record<string, any>;

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const padZero = (num: number): string => (num < 10 ? '0' + num : String(num));

const formatDateISO = (d: Date): string => {
  return `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;
};

const formatIndonesianDate = (d: Date): string => {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const dayName = days[d.getDay()];
  const dayNum = d.getDate();
  const monthName = MONTH_NAMES[d.getMonth()];
  const year = d.getFullYear();
  return `${dayName}, ${dayNum} ${monthName} ${year}`;
};

// Helper: Deteksi status waktu sesi jadwal (past / current / upcoming)
const getSessionTimelineStatus = (
  timeStartStr?: string,
  timeEndStr?: string,
  selectedDate?: Date
): 'past' | 'current' | 'upcoming' => {
  if (!selectedDate) return 'upcoming';
  const now = new Date();
  const isToday =
    now.getFullYear() === selectedDate.getFullYear() &&
    now.getMonth() === selectedDate.getMonth() &&
    now.getDate() === selectedDate.getDate();

  if (!isToday) {
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const selMidnight = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()).getTime();
    if (selMidnight < todayMidnight) return 'past';
    return 'upcoming';
  }

  if (!timeStartStr || !timeEndStr) return 'upcoming';

  const parseToMinutes = (t: string) => {
    const clean = t.replace(/\./g, ':').trim();
    const parts = clean.split(':');
    const h = parseInt(parts[0] || '0', 10);
    const m = parseInt(parts[1] || '0', 10);
    return h * 60 + m;
  };

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = parseToMinutes(timeStartStr);
  const endMinutes = parseToMinutes(timeEndStr);

  if (currentMinutes < startMinutes) return 'upcoming';
  if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) return 'current';
  return 'past';
};

// Helper: Dapatkan tanggal Senin dari minggu yang mengandung tanggal d
const getMonday = (d: Date): Date => {
  const date = new Date(d);
  const day = date.getDay();
  // Jika Minggu (0), maju ke Senin berikutnya; jika Sabtu (6), mundur ke Senin sebelumnya
  const diff = day === 0 ? 1 : day === 6 ? -5 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
};

const getSubjectStyle = (name: string = '', index: number) => {
  const n = name.toLowerCase();
  if (n.includes('apel') || n.includes('upacara') || n.includes('senam')) {
    return {
      bg: '#E6FFFA',
      color: '#0D9488',
      icon: 'bullhorn-outline',
    };
  }
  if (n.includes('matematika') || n.includes('hitung') || n.includes('aljabar')) {
    return {
      bg: '#EFF6FF',
      color: '#2563EB',
      icon: 'file-document-outline',
    };
  }
  if (n.includes('bahasa') || n.includes('indonesia') || n.includes('inggris') || n.includes('arab') || n.includes('literasi')) {
    return {
      bg: '#FFE4E6',
      color: '#E11D48',
      icon: 'book-open-variant',
    };
  }
  if (n.includes('ipa') || n.includes('sains') || n.includes('biologi') || n.includes('fisika') || n.includes('kimia')) {
    return {
      bg: '#E0F2FE',
      color: '#0284C7',
      icon: 'flask-outline',
    };
  }
  if (n.includes('ips') || n.includes('sosial') || n.includes('sejarah') || n.includes('geografi')) {
    return {
      bg: '#EFF6FF',
      color: '#2563EB',
      icon: 'file-document-outline',
    };
  }
  if (n.includes('agama') || n.includes('islam') || n.includes('pai') || n.includes('fiqih') || n.includes('akidah')) {
    return {
      bg: '#E8F5E9',
      color: '#16A34A',
      icon: 'home-roof',
    };
  }
  if (n.includes('tahfizh') || n.includes('quran') || n.includes('hadits')) {
    return {
      bg: '#E8F5E9',
      color: '#16A34A',
      icon: 'book-open-page-variant',
    };
  }
  const palettes = [
    { bg: '#E6FFFA', color: '#0D9488', icon: 'bullhorn-outline' },
    { bg: '#EFF6FF', color: '#2563EB', icon: 'file-document-outline' },
    { bg: '#FFE4E6', color: '#E11D48', icon: 'book-open-variant' },
    { bg: '#E0F2FE', color: '#0284C7', icon: 'flask-outline' },
    { bg: '#E8F5E9', color: '#16A34A', icon: 'home-roof' },
    { bg: '#FEF3C7', color: '#D97706', icon: 'school-outline' },
    { bg: '#F3E8FF', color: '#9333EA', icon: 'palette-outline' },
  ];
  return palettes[index % palettes.length];
};

export default function ScheduleScreen({ route }: any) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 16);

  const user = useAuthStore((state) => state.user);
  const isParent = isParentRole(user?.roles || []);
  const isTeacher = isTeacherRole(user?.roles || []);

  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(route?.params?.child_id);
  const studentScrollRef = useRef<ScrollView>(null);

  const handleStudentScrollEnd = (e: any) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const cardWidth = SCREEN_WIDTH - 50 + 12;
    const index = Math.round(offsetX / cardWidth);
    if (index >= 0 && index < children.length) {
      const targetChild = children[index];
      if (targetChild && String(targetChild.id) !== selectedChildId) {
        const sid = String(targetChild.id);
        setSelectedChildId(sid);
        useActiveChildStore.getState().setActiveChildId(sid);
      }
    }
  };

  const selectChildWithScroll = (childId: string, index: number) => {
    setSelectedChildId(childId);
    useActiveChildStore.getState().setActiveChildId(childId);
    studentScrollRef.current?.scrollTo({
      x: index * (SCREEN_WIDTH - 50 + 12),
      animated: true,
    });
  };

  // Date selection state: dimulai dari hari ini
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedScheduleDetail, setSelectedScheduleDetail] = useState<ScheduleItem | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [scheduleData, setScheduleData] = useState<any>(null);

  // 1. Load Children if parent (Pertahankan seluruh anak)
  useEffect(() => {
    let isMounted = true;
    if (isParent) {
      const isSingleChild = route?.params?.single_child_only === true;
      const targetChildId = route?.params?.child_id || useActiveChildStore.getState().activeChildId;
      const childCacheKey = offlineCache.buildKey('schedule_children', user?.id);
      void (async () => {
        const cached = await offlineCache.get<Child[]>(childCacheKey);
        if (cached && isMounted && cached.length > 0) {
          const displayCached = (isSingleChild && targetChildId)
            ? cached.filter((c) => String(c.id) === String(targetChildId))
            : cached;
          const safeCached = displayCached.length > 0 ? displayCached : cached;
          setChildren(safeCached);
          useActiveChildStore.getState().setChildren(cached);
          const activeId = targetChildId || useActiveChildStore.getState().activeChildId || String(safeCached[0].id);
          setSelectedChildId(activeId);
        }
      })();

      mobileApiService.getPortalChildren()
        .then((res) => {
          const arr = unwrapApiData<Child[]>(res) || [];
          if (isMounted && arr.length > 0) {
            const displayList = (isSingleChild && targetChildId)
              ? arr.filter((c) => String(c.id) === String(targetChildId))
              : arr;
            const safeList = displayList.length > 0 ? displayList : arr;
            setChildren(safeList);
            useActiveChildStore.getState().setChildren(arr);
            const activeId = targetChildId || useActiveChildStore.getState().activeChildId || String(safeList[0].id);
            setSelectedChildId(activeId);
            void offlineCache.set(childCacheKey, arr);
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [isParent, user?.id, route?.params?.child_id, route?.params?.single_child_only]);

  const hasLoadedRef = useRef<boolean>(false);

  // 2. Load schedules from backend API with date parameter & offline cache
  const loadSchedules = useCallback(async (showSpinner = false) => {
    const dateStr = formatDateISO(selectedDate);
    const cacheKey = offlineCache.buildKey('schedule', user?.id, `${selectedChildId || 'self'}_${dateStr}`);

    // Baca cache dulu agar tampil instan
    const cached = await offlineCache.get<any>(cacheKey);
    if (cached) {
      setScheduleData(cached);
      if (!hasLoadedRef.current) setLoading(false);
    } else if (showSpinner) {
      setLoading(true);
    }

    try {
      if (isTeacher && !isParent) {
        const res = await mobileApiService.getTeacherSchedules();
        const rawList = res?.data || (Array.isArray(res) ? res : []);
        const mapped = (Array.isArray(rawList) ? rawList : []).map((s: any) => ({
          id: s.id,
          day_of_week: Number(s.day_of_week),
          time_start: s.time_start,
          time_end: s.time_end,
          time_display: `${(s.time_start || '').slice(0, 5)} - ${(s.time_end || '').slice(0, 5)}`,
          subject: {
            id: s.subject_id,
            name: s.subject?.name || s.subject?.nama_mapel || 'Mata Pelajaran',
            code: s.subject?.code || s.subject?.kode_mapel || '',
          },
          room: s.room || s.ruangan || 'Ruang Kelas',
          class_name: s.kelas?.nama_kelas || s.kelas?.kode_kelas || 'Kelas',
          teacher: {
            name: user?.name || 'Saya',
          },
        }));
        const targetDay = selectedDate.getDay();
        const data = {
          all_schedules: mapped,
          today_schedules: mapped.filter((s: any) => s.day_of_week === targetDay),
          is_teacher_schedule: true,
        };
        setScheduleData(data);
        void offlineCache.set(cacheKey, data);
      } else {
        const res = await mobileApiService.getPortalSchedules({
          child_id: selectedChildId,
          date: dateStr,
        });
        const data = unwrapApiData<any>(res) || {};
        setScheduleData(data);
        void offlineCache.set(cacheKey, data);
      }
    } catch {
      // Jika offline dan belum ada cache, set empty object bukan crash
      if (!cached) {
        setScheduleData(null);
      }
    } finally {
      setLoading(false);
      hasLoadedRef.current = true;
    }
  }, [selectedChildId, selectedDate, user?.id]);

  useEffect(() => {
    void loadSchedules(!hasLoadedRef.current);
  }, [loadSchedules]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSchedules(false);
    setRefreshing(false);
  };

  // 5 day pill strip — dinamis berdasarkan minggu yang mengandung selectedDate
  const weekDays = useMemo(() => {
    const selISO = formatDateISO(selectedDate);
    const DAY_NAMES_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    const DAY_NAMES_FULL  = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const MONTH_SHORT = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    // Senin minggu ini
    const monday = getMonday(selectedDate);

    // Deteksi apakah jadwal mencakup hari Sabtu (khusus unit Boarding / Pesantren)
    const hasSaturday = Array.isArray(scheduleData?.all_schedules) && scheduleData.all_schedules.some(
      (s: any) => Number(s.day_of_week) === 6
    );
    const dayCount = hasSaturday ? 6 : 5;

    // Buat array hari kerja dinamis (5 hari untuk Fullday, 6 hari untuk Boarding/Pesantren)
    return Array.from({ length: dayCount }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const iso = formatDateISO(d);
      const dotw = d.getDay(); // 1=Sen, 2=Sel, ..., 5=Jum, 6=Sab
      return {
        dayName: DAY_NAMES_SHORT[dotw],
        dayNum: d.getDate(),
        monthShort: MONTH_SHORT[d.getMonth()],
        iso,
        fullDay: DAY_NAMES_FULL[dotw],
        dayOfWeek: dotw,
        dateStr: `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`,
        isSelected: iso === selISO,
        dateObj: d,
      };
    });
  }, [scheduleData, selectedDate]);

  const formattedSelectedDate = useMemo(() => formatIndonesianDate(selectedDate), [selectedDate]);

  // Jadwal dari backend saja — tidak ada fallback ke data dummy
  const displaySchedules: ScheduleItem[] = useMemo(() => {
    const targetDayOfWeek = selectedDate.getDay(); // 1=Sen, 2=Sel, ..., 5=Jum

    if (Array.isArray(scheduleData?.all_schedules) && scheduleData.all_schedules.length > 0) {
      const dayItems = scheduleData.all_schedules.filter(
        (s: any) => Number(s.day_of_week) === targetDayOfWeek
      );
      if (dayItems.length > 0) return dayItems;
    }
    if (Array.isArray(scheduleData?.today_schedules) && scheduleData.today_schedules.length > 0) {
      return scheduleData.today_schedules;
    }
    // Tidak ada data dari backend → kembalikan array kosong (tampilkan empty state)
    return [];
  }, [scheduleData, selectedDate]);

  return (
    <View style={styles.rootContainer}>
      <View style={styles.sheetContainer}>
        <LinearGradient
          colors={['#FFFFFF', '#F4FAF7', '#EAF7F0']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <ScrollView
          style={styles.screen}
          contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 30 }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#18A165']} />
          }
        >
          {/* 1. CONTAINER DATA SISWA & UNIT PENDIDIKAN (PRESERVED AS-IS) */}
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

              {children.length === 1 ? (
                <View style={styles.singleHeroCardContainer}>
                  <StudentHeroCard
                    child={children[0]}
                    isSelected={true}
                    isSingleChild={true}
                    showActionButtons={false}
                  />
                </View>
              ) : (
                <>
                  <ScrollView
                    ref={studentScrollRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    snapToInterval={SCREEN_WIDTH - 50 + 12}
                    decelerationRate="fast"
                    onMomentumScrollEnd={handleStudentScrollEnd}
                    style={styles.heroCardScrollContainer}
                    contentContainerStyle={styles.heroCardScroll}
                  >
                    {children.map((child, idx) => (
                      <StudentHeroCard
                        key={String(child.id || idx)}
                        child={child}
                        isSelected={String(child.id) === selectedChildId}
                        isSingleChild={false}
                        showActionButtons={false}
                        onSelect={() => selectChildWithScroll(String(child.id), idx)}
                      />
                    ))}
                  </ScrollView>

                  {/* DOT INDIKATOR SCROLL SISWA */}
                  <View style={styles.paginationDotsRow}>
                    {children.map((c, i) => {
                      const isDotActive = String(c.id) === selectedChildId;
                      return (
                        <TouchableOpacity
                          key={String(c.id || i)}
                          onPress={() => selectChildWithScroll(String(c.id), i)}
                          style={[
                            styles.paginationDot,
                            isDotActive && styles.paginationDotActive,
                          ]}
                        />
                      );
                    })}
                  </View>
                </>
              )}
            </View>
          ) : scheduleData?.student ? (
            <View style={[styles.containerBlock, styles.studentContainerBlock]}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderTitleWrap}>
                  <MaterialCommunityIcons name="account-school" size={18} color="#18A165" />
                  <Text style={styles.sectionTitle}>Data Ananda</Text>
                </View>
              </View>

              <View style={styles.singleHeroCardContainer}>
                <StudentHeroCard
                  child={scheduleData.student}
                  isSelected={true}
                  isSingleChild={true}
                  showActionButtons={false}
                />
              </View>
            </View>
          ) : user ? (
            <View style={[styles.containerBlock, styles.studentContainerBlock]}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderTitleWrap}>
                  <MaterialCommunityIcons name="account-school" size={18} color="#18A165" />
                  <Text style={styles.sectionTitle}>Data Pengguna & Unit</Text>
                </View>
              </View>

              {(() => {
                const userName = String(user?.name || user?.full_name || user?.nama_lengkap || 'Pengguna');
                const userRole = typeof user?.role === 'string' ? user.role : (Array.isArray(user?.roles) && user.roles[0] ? String(user.roles[0]) : 'Pengguna');
                const userUnit = String((user as any)?.unit_name || (user as any)?.education_unit?.name || (user as any)?.unit?.name || 'Unit Pendidikan');
                const avatarUri = getProfileImageUrl(user);

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
                          <Image
                            source={{ uri: avatarUri }}
                            style={styles.childAvatarImgHero}
                            resizeMode="cover"
                          />
                        ) : (
                          <Text style={styles.avatarInitialText}>{userName.charAt(0).toUpperCase()}</Text>
                        )}
                      </View>
                      <View style={styles.childInfoCol}>
                        <Text numberOfLines={1} style={styles.childNameHero}>
                          {userName}
                        </Text>
                        <Text style={styles.childSubInfoHero}>
                          Status: {userRole}
                        </Text>
                        <View style={styles.studentUnitBadge}>
                          <MaterialCommunityIcons name="school" size={11} color="#FFFFFF" style={{ marginRight: 4 }} />
                          <Text numberOfLines={1} style={styles.studentUnitText}>
                            {userUnit}
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
                        <Text numberOfLines={1} style={styles.studentAttrValue}>{userRole}</Text>
                      </View>
                      <View style={styles.studentAttrDivider} />
                      <View style={styles.studentAttrBox}>
                        <Text style={styles.studentAttrLabel}>Akses</Text>
                        <Text numberOfLines={1} style={styles.studentAttrValue}>Resmi</Text>
                      </View>
                      <View style={styles.studentAttrDivider} />
                      <View style={styles.studentAttrBox}>
                        <Text style={styles.studentAttrLabel}>Presensi</Text>
                        <Text numberOfLines={1} style={[styles.studentAttrValue, { color: '#DEF7EC' }]}>Hadir</Text>
                      </View>
                    </View>
                  </LinearGradient>
                );
              })()}
            </View>
          ) : null}

          {/* 2. DAY SELECTOR ROW (5 PILLS: SEN, SEL, RAB, KAM, JUM) */}
          <View style={styles.dayStripRow}>
            {weekDays.map((item) => {
              const isSel = item.isSelected;
              return (
                <TouchableOpacity
                  key={item.iso}
                  activeOpacity={0.8}
                  onPress={() => setSelectedDate(item.dateObj)}
                  style={[styles.dayPillBtn, isSel && styles.dayPillBtnActive]}
                >
                  {isSel && (
                    <LinearGradient
                      colors={['#0D6B42', '#18A165']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                  )}
                  <Text style={[styles.dayPillName, isSel && styles.dayPillNameActive]}>
                    {item.dayName}
                  </Text>
                  <Text style={[styles.dayPillDate, isSel && styles.dayPillDateActive]}>
                    {item.dateStr}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 3. DATE TITLE HEADER ROW */}
          <View style={styles.dateHeaderRow}>
            <MaterialCommunityIcons name="calendar-month" size={24} color="#18A165" />
            <Text style={styles.dateHeaderTitle}>{formattedSelectedDate}</Text>
          </View>

          {/* 4. MILESTONE SCHEDULE TIMELINE */}
          {loading ? (
            <ActivityIndicator color="#18A165" style={{ marginVertical: 32 }} />
          ) : displaySchedules.length > 0 ? (
            <View style={styles.milestoneContainer}>
              {/* Milestone Tracker Summary Bar */}
              <View style={styles.milestoneSummaryBar}>
                <View style={styles.milestoneSummaryLeft}>
                  <MaterialCommunityIcons name="map-marker-path" size={18} color="#0D6B42" />
                  <Text style={styles.milestoneSummaryTitle}>Jalur Pembelajaran Hari Ini</Text>
                </View>
                <View style={styles.milestoneSummaryBadge}>
                  <Text style={styles.milestoneSummaryBadgeText}>
                    {displaySchedules.length} Sesi Terjadwal
                  </Text>
                </View>
              </View>

              {/* Milestone Items List */}
              <View style={styles.milestoneList}>
                {displaySchedules.map((item, idx) => {
                  const styleMeta = getSubjectStyle(item.subject?.name, idx);
                  const rawTime = item.time_display || (item.time_start && item.time_end ? `${item.time_start.slice(0, 5)} - ${item.time_end.slice(0, 5)}` : '08.00 - 09.00');
                  const timeText = rawTime.replace(/:/g, '.');
                  const timeParts = timeText.split('-').map((s: string) => s.trim());
                  const timeStart = timeParts[0] || '08.00';
                  const timeEnd = timeParts[1] || '09.00';
                  const teacherName = item.teacher?.name;
                  const roomName = item.room;
                  const status = getSessionTimelineStatus(item.time_start || timeStart, item.time_end || timeEnd, selectedDate);
                  const isPast = status === 'past';
                  const isCurrent = status === 'current';
                  const isUpcoming = status === 'upcoming';
                  const isFirst = idx === 0;
                  const isLast = idx === displaySchedules.length - 1;

                  return (
                    <View key={item.id || idx} style={styles.milestoneRow}>
                      {/* Column 1: Time */}
                      <View style={styles.milestoneTimeCol}>
                        <Text style={[styles.milestoneTimeStart, isCurrent && styles.milestoneTimeStartCurrent]}>
                          {timeStart}
                        </Text>
                        <Text style={styles.milestoneTimeEnd}>
                          {timeEnd}
                        </Text>
                        {isCurrent && (
                          <View style={styles.liveIndicatorPill}>
                            <View style={styles.liveIndicatorDot} />
                            <Text style={styles.liveIndicatorText}>LIVE</Text>
                          </View>
                        )}
                      </View>

                      {/* Column 2: Milestone Node & Connecting Spine */}
                      <View style={styles.milestoneSpineCol}>
                        {/* Top Line Segment */}
                        <View
                          style={[
                            styles.milestoneSpineTop,
                            isFirst && { opacity: 0 },
                            (isPast || isCurrent) && styles.milestoneSpinePast,
                          ]}
                        />

                        {/* Node Circle */}
                        <View
                          style={[
                            styles.milestoneNode,
                            isPast && styles.milestoneNodePast,
                            isCurrent && styles.milestoneNodeCurrent,
                            isUpcoming && styles.milestoneNodeUpcoming,
                          ]}
                        >
                          {isPast ? (
                            <MaterialCommunityIcons name="check" size={13} color="#FFFFFF" />
                          ) : isCurrent ? (
                            <View style={styles.milestoneNodeCurrentInner} />
                          ) : (
                            <Text style={styles.milestoneNodeNumber}>{idx + 1}</Text>
                          )}
                        </View>

                        {/* Bottom Line Segment */}
                        <View
                          style={[
                            styles.milestoneSpineBottom,
                            isLast && { opacity: 0 },
                            isPast && styles.milestoneSpinePast,
                          ]}
                        />
                      </View>

                      {/* Column 3: Milestone Card */}
                      <TouchableOpacity
                        activeOpacity={0.88}
                        onPress={() => setSelectedScheduleDetail(item)}
                        style={[
                          styles.milestoneCard,
                          isCurrent && styles.milestoneCardCurrent,
                          isPast && styles.milestoneCardPast,
                        ]}
                      >
                        {/* Header: Sesi badge & live status */}
                        <View style={styles.milestoneCardHeader}>
                          <View style={[styles.sessionBadge, isCurrent && styles.sessionBadgeCurrent]}>
                            <Text style={[styles.sessionBadgeText, isCurrent && styles.sessionBadgeTextCurrent]}>
                              SESI #{idx + 1}
                            </Text>
                          </View>

                          {isCurrent ? (
                            <View style={styles.currentStatusBadge}>
                              <View style={styles.currentStatusDot} />
                              <Text style={styles.currentStatusText}>Sedang Berlangsung</Text>
                            </View>
                          ) : isPast ? (
                            <View style={styles.pastStatusBadge}>
                              <Text style={styles.pastStatusText}>Selesai</Text>
                            </View>
                          ) : (
                            <Text style={styles.upcomingStatusText}>Akan Datang</Text>
                          )}
                        </View>

                        {/* Content: Subject + Icon + Teacher + Room */}
                        <View style={styles.milestoneCardBody}>
                          <View style={[styles.milestoneIconBox, { backgroundColor: styleMeta.bg }]}>
                            <MaterialCommunityIcons name={styleMeta.icon as any} size={22} color={styleMeta.color} />
                          </View>

                          <View style={styles.milestoneInfoCol}>
                            <Text numberOfLines={1} style={styles.milestoneSubjectTitle}>
                              {item.subject?.name || 'Mata Pelajaran'}
                            </Text>

                            <View style={styles.milestoneMetaDetails}>
                              {teacherName ? (
                                <View style={styles.metaRow}>
                                  <MaterialCommunityIcons name="account-tie-outline" size={13} color="#64748B" style={{ marginRight: 3 }} />
                                  <Text numberOfLines={1} style={styles.metaText}>{teacherName}</Text>
                                </View>
                              ) : null}

                              {roomName ? (
                                <View style={styles.metaRow}>
                                  <MaterialCommunityIcons name="door-open" size={13} color="#64748B" style={{ marginRight: 3 }} />
                                  <Text numberOfLines={1} style={styles.metaText}>{roomName}</Text>
                                </View>
                              ) : null}
                            </View>
                          </View>

                          <MaterialCommunityIcons name="chevron-right" size={20} color="#94A3B8" />
                        </View>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="calendar-blank-outline" size={44} color="#94A3B8" />
              <Text style={styles.emptyTitle}>Tidak Ada Jadwal pada Tanggal Ini</Text>
              <Text style={styles.emptyText}>Tidak ada mata pelajaran yang terjadwal untuk {formattedSelectedDate}.</Text>
            </View>
          )}

          {/* 5. BOTTOM NOTICE BANNER */}
          <View style={styles.bottomNoticeBanner}>
            <MaterialCommunityIcons name="shield-check" size={18} color="#18A165" />
            <Text style={styles.bottomNoticeText}>Jadwal dapat berubah sewaktu-waktu.</Text>
          </View>
        </ScrollView>
      </View>

      {/* SCHEDULE DETAIL MODAL */}
      <Modal
        visible={!!selectedScheduleDetail}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedScheduleDetail(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setSelectedScheduleDetail(null)}
          />
          <View style={styles.modalCard}>
            {selectedScheduleDetail && (
              <>
                <View style={styles.modalHeaderRow}>
                  <View style={[styles.modalIconBox, { backgroundColor: getSubjectStyle(selectedScheduleDetail.subject?.name, 0).bg }]}>
                    <MaterialCommunityIcons
                      name={getSubjectStyle(selectedScheduleDetail.subject?.name, 0).icon as any}
                      size={24}
                      color={getSubjectStyle(selectedScheduleDetail.subject?.name, 0).color}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.modalSubjectTitle}>
                      {selectedScheduleDetail.subject?.name || 'Mata Pelajaran'}
                    </Text>
                    <Text style={styles.modalSubjectCode}>
                      {selectedScheduleDetail.subject?.code ? `Kode: ${selectedScheduleDetail.subject.code}` : 'Kurikulum Terpadu'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setSelectedScheduleDetail(null)}
                    style={styles.modalCloseBtn}
                  >
                    <MaterialCommunityIcons name="close" size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>

                <View style={styles.modalDivider} />

                <View style={styles.modalBodyRows}>
                  <View style={styles.modalDetailRow}>
                    <MaterialCommunityIcons name="clock-outline" size={18} color="#18A165" />
                    <Text style={styles.modalDetailLabel}>Waktu:</Text>
                    <Text style={styles.modalDetailValue}>
                      {selectedScheduleDetail.time_display?.replace(/:/g, '.') || '08.00 - 09.00'} WIB
                    </Text>
                  </View>

                  {selectedScheduleDetail.teacher?.name ? (
                    <View style={styles.modalDetailRow}>
                      <MaterialCommunityIcons name="account-tie-outline" size={18} color="#18A165" />
                      <Text style={styles.modalDetailLabel}>Guru:</Text>
                      <Text style={styles.modalDetailValue}>{selectedScheduleDetail.teacher.name}</Text>
                    </View>
                  ) : null}

                  {selectedScheduleDetail.room ? (
                    <View style={styles.modalDetailRow}>
                      <MaterialCommunityIcons name="map-marker-outline" size={18} color="#18A165" />
                      <Text style={styles.modalDetailLabel}>Ruangan:</Text>
                      <Text style={styles.modalDetailValue}>{selectedScheduleDetail.room}</Text>
                    </View>
                  ) : null}

                  <View style={styles.modalDetailRow}>
                    <MaterialCommunityIcons name="check-decagram-outline" size={18} color="#18A165" />
                    <Text style={styles.modalDetailLabel}>Presensi:</Text>
                    <View style={styles.modalPresensiBadge}>
                      <Text style={styles.modalPresensiText}>
                        {selectedScheduleDetail.attendance?.status_label || 'Terjadwal'}
                      </Text>
                    </View>
                  </View>
                </View>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setSelectedScheduleDetail(null)}
                  style={styles.modalActionBtn}
                >
                  <Text style={styles.modalActionBtnText}>Tutup</Text>
                </TouchableOpacity>
              </>
            )}
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
  screen: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: 16, paddingTop: Platform.OS === 'android' ? 16 : 12 },

  // DATA ANANDA (CARD ANANDA - PRESERVED UNCHANGED)
  studentContainerBlock: {
    marginBottom: 8,
  },
  containerBlock: {
    marginBottom: 16,
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
    opacity: 0.9,
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
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  avatarBorderWrapHeroInactive: {
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
  childAvatarImgHero: {
    width: '100%',
    height: '100%',
  },
  avatarInitialText: {
    fontSize: 24,
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
  },
  studentNisText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '600',
    marginTop: 1,
  },
  childNameHero: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  childSubInfoHero: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 1,
    fontWeight: '600',
  },
  studentUnitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 3,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  studentUnitBadgeInactive: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  studentUnitText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    maxWidth: SCREEN_WIDTH - 220,
  },
  selectedActionBtnRight: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
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
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    elevation: 0,
  },
  selectedActionBtnText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#18A165',
    marginTop: 2,
  },
  selectedActionBtnTextInactive: {
    color: '#FFFFFF',
  },
  studentAttributesGrid: {
    flexDirection: 'row',
    backgroundColor: 'rgba(4, 47, 30, 0.35)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginTop: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: 1,
  },
  studentAttributesGridInactive: {
    backgroundColor: 'rgba(4, 47, 30, 0.35)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  studentAttrBox: {
    flex: 1,
    alignItems: 'center',
  },
  studentAttrLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  studentAttrLabel: {
    fontSize: 9.5,
    color: '#A7F3D0',
    fontWeight: '700',
  },
  studentAttrValue: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  studentPresensiValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  presensiGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34D399',
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
    backgroundColor: '#18A165',
  },

  // 2. DAY SELECTOR PILLS (NEW DESIGN - MATCHING SCREENSHOT)
  dayStripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    marginBottom: 4,
  },
  dayPillBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  dayPillBtnActive: {
    shadowColor: '#0D6B42',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 3,
  },
  dayPillName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  dayPillNameActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  dayPillDate: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  dayPillDateActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // 3. DATE HEADER ROW
  dateHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    marginBottom: 12,
  },
  dateHeaderTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#0F172A',
  },

  // 4. CLEAN SCHEDULE CARDS
  scheduleListCol: {
    gap: 10,
  },
  // MILESTONE STYLES
  milestoneContainer: {
    marginTop: 4,
    marginBottom: 8,
  },
  milestoneSummaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#DEF7EC',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#BCF0DA',
  },
  milestoneSummaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  milestoneSummaryTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0D6B42',
  },
  milestoneSummaryBadge: {
    backgroundColor: '#0D6B42',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  milestoneSummaryBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  milestoneList: {
    paddingLeft: 2,
    paddingRight: 2,
  },
  milestoneRow: {
    flexDirection: 'row',
    marginBottom: 14,
    minHeight: 88,
  },
  milestoneTimeCol: {
    width: 60,
    alignItems: 'flex-end',
    paddingTop: 10,
    paddingRight: 8,
  },
  milestoneTimeStart: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#334155',
  },
  milestoneTimeStartCurrent: {
    color: '#059669',
    fontSize: 13,
  },
  milestoneTimeEnd: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 2,
  },
  liveIndicatorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 6,
    gap: 3,
  },
  liveIndicatorDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#10B981',
  },
  liveIndicatorText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#059669',
    letterSpacing: 0.5,
  },
  milestoneSpineCol: {
    width: 28,
    alignItems: 'center',
    position: 'relative',
  },
  milestoneSpineTop: {
    width: 2.5,
    flex: 1,
    backgroundColor: '#E2E8F0',
  },
  milestoneSpineBottom: {
    width: 2.5,
    flex: 1,
    backgroundColor: '#E2E8F0',
  },
  milestoneSpinePast: {
    backgroundColor: '#10B981',
  },
  milestoneNode: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    borderWidth: 2.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  milestoneNodePast: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  milestoneNodeCurrent: {
    backgroundColor: '#FFFFFF',
    borderColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  },
  milestoneNodeCurrentInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
  },
  milestoneNodeUpcoming: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
  },
  milestoneNodeNumber: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
  },
  milestoneCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginLeft: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  milestoneCardCurrent: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
    shadowColor: '#10B981',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  milestoneCardPast: {
    backgroundColor: '#FAFAFA',
    borderColor: '#F1F5F9',
    opacity: 0.92,
  },
  milestoneCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sessionBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  sessionBadgeCurrent: {
    backgroundColor: '#DEF7EC',
  },
  sessionBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.3,
  },
  sessionBadgeTextCurrent: {
    color: '#059669',
  },
  currentStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 8,
    gap: 4,
  },
  currentStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  currentStatusText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#059669',
  },
  pastStatusBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pastStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  upcomingStatusText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
  },
  milestoneCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  milestoneIconBox: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  milestoneInfoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  milestoneSubjectTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  milestoneMetaDetails: {
    marginTop: 3,
    gap: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '500',
  },
  cleanScheduleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardTimeCol: {
    width: 90,
  },
  cardTimeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  cardIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardInfoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  cardSubjectTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  cardTeacherText: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  cardRoomText: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },

  // 5. BOTTOM NOTICE BANNER
  bottomNoticeBanner: {
    backgroundColor: '#DEF7EC',
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 16,
  },
  bottomNoticeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0D6B42',
  },

  // EMPTY STATE
  emptyContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 28,
    alignItems: 'center',
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 8,
  },
  emptyText: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
  },

  // DETAIL MODAL
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubjectTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubjectCode: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 14,
  },
  modalBodyRows: {
    gap: 12,
  },
  modalDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalDetailLabel: {
    width: 70,
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  modalDetailValue: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalPresensiBadge: {
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  modalPresensiText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0D6B42',
  },
  modalActionBtn: {
    marginTop: 18,
    backgroundColor: '#18A165',
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalActionBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

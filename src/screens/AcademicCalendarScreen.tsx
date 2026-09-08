import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { isParentRole } from '../utils/roles';
import {
  getProfileImageUrl,
  DEFAULT_STUDENT_BOY_AVATAR,
  DEFAULT_STUDENT_GIRL_AVATAR,
} from '../utils/profile';
import { offlineCache } from '../utils/offlineCache';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Child = Record<string, any>;

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

const QUICK_RANGE_CARDS = [
  {
    key: 'today',
    label: 'Hari Ini',
    icon: 'calendar-today',
    activeBg: '#18A165',
    activeColor: '#FFFFFF',
    inactiveBg: '#ECFDF5',
    inactiveBorder: '#A7F3D0',
    inactiveColor: '#065F46',
  },
  {
    key: 'week',
    label: '1 Minggu',
    icon: 'calendar-week',
    activeBg: '#2563EB',
    activeColor: '#FFFFFF',
    inactiveBg: '#EFF6FF',
    inactiveBorder: '#BFDBFE',
    inactiveColor: '#1E40AF',
  },
  {
    key: 'month',
    label: '1 Bulan',
    icon: 'calendar-month-outline',
    activeBg: '#EA580C',
    activeColor: '#FFFFFF',
    inactiveBg: '#FFF7ED',
    inactiveBorder: '#FED7AA',
    inactiveColor: '#9A3412',
  },
  {
    key: 'semester',
    label: 'Semester',
    icon: 'book-education-outline',
    activeBg: '#0D9488',
    activeColor: '#FFFFFF',
    inactiveBg: '#F0FDFA',
    inactiveBorder: '#99F6E4',
    inactiveColor: '#115E59',
  },
  {
    key: 'year',
    label: 'Tahun Ajaran',
    icon: 'school-outline',
    activeBg: '#7C3AED',
    activeColor: '#FFFFFF',
    inactiveBg: '#FAF5FF',
    inactiveBorder: '#E9D5FF',
    inactiveColor: '#581C87',
  },
];

const getMonthGrid = (
  year: number,
  month: number,
  selectedDateStr: string,
  eventsList: any[]
) => {
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const now = new Date();
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth();
  const nowDay = now.getDate();

  const eventDates = new Set(
    (eventsList || [])
      .map((e: any) => (e.date ? String(e.date).slice(0, 10) : ''))
      .filter(Boolean)
  );

  const grid: Array<{
    day: number;
    fullDate: string;
    isCurrentMonth: boolean;
    isToday: boolean;
    isSelected: boolean;
    hasEvent: boolean;
  }> = [];

  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    const prevMonthIdx = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const fullDate = `${prevYear}-${String(prevMonthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    grid.push({
      day: d,
      fullDate,
      isCurrentMonth: false,
      isToday: false,
      isSelected: fullDate === selectedDateStr,
      hasEvent: eventDates.has(fullDate),
    });
  }

  for (let d = 1; d <= daysInCurrentMonth; d++) {
    const fullDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = year === nowYear && month === nowMonth && d === nowDay;
    const isSelected = fullDate === selectedDateStr;
    grid.push({
      day: d,
      fullDate,
      isCurrentMonth: true,
      isToday,
      isSelected,
      hasEvent: eventDates.has(fullDate),
    });
  }

  const remaining = (7 - (grid.length % 7)) % 7;
  for (let n = 1; n <= remaining; n++) {
    const nextMonthIdx = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    const fullDate = `${nextYear}-${String(nextMonthIdx + 1).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
    grid.push({
      day: n,
      fullDate,
      isCurrentMonth: false,
      isToday: false,
      isSelected: fullDate === selectedDateStr,
      hasEvent: eventDates.has(fullDate),
    });
  }

  return grid;
};

export default function AcademicCalendarScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 36 : 16);
  const user = useAuthStore((state) => state.user);
  const isParent = isParentRole(user?.roles || []);

  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(route?.params?.child_id);
  const [studentInfo, setStudentInfo] = useState<any>(null);
  const studentScrollRef = useRef<ScrollView>(null);

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

  const [calendarRange, setCalendarRange] = useState<string>('today');
  const [calendarDate, setCalendarDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [viewYear, setViewYear] = useState<number>(() => {
    const parts = new Date().toISOString().slice(0, 10).split('-');
    return parseInt(parts[0], 10) || new Date().getFullYear();
  });
  const [viewMonth, setViewMonth] = useState<number>(() => {
    const parts = new Date().toISOString().slice(0, 10).split('-');
    return (parseInt(parts[1], 10) || (new Date().getMonth() + 1)) - 1;
  });
  const [calendarViewMode, setCalendarViewMode] = useState<'hari' | 'minggu' | 'bulan' | 'agenda'>('minggu');
  const [calendarData, setCalendarData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [showAllAgendaModal, setShowAllAgendaModal] = useState<boolean>(false);

  // 1. Load Children if Parent with offline cache
  useEffect(() => {
    let isMounted = true;
    if (isParent) {
      const targetChildId = route?.params?.child_id;
      const childCacheKey = offlineCache.buildKey('academic_cal_children', user?.id);
      void (async () => {
        const cached = await offlineCache.get<Child[]>(childCacheKey);
        if (cached && isMounted && cached.length > 0) {
          const filteredCached = targetChildId
            ? cached.filter((c) => String(c.id) === String(targetChildId))
            : cached;
          setChildren(filteredCached.length > 0 ? filteredCached : cached);
          if (targetChildId) {
            setSelectedChildId(String(targetChildId));
          } else if (!selectedChildId) {
            setSelectedChildId(String(cached[0].id));
          }
        }
      })();

      mobileApiService.getPortalChildren()
        .then((res) => {
          const arr = unwrapApiData<Child[]>(res) || [];
          if (isMounted && arr.length > 0) {
            const filteredArr = targetChildId
              ? arr.filter((c) => String(c.id) === String(targetChildId))
              : arr;
            setChildren(filteredArr.length > 0 ? filteredArr : arr);
            if (targetChildId) {
              setSelectedChildId(String(targetChildId));
            } else if (!selectedChildId) {
              setSelectedChildId(String(arr[0].id));
            }
            void offlineCache.set(childCacheKey, arr);
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [isParent, user?.id, route?.params?.child_id]);

  // 2. Load Academic Calendar Data from Database API with offline cache
  const loadCalendar = useCallback(async () => {
    const cacheKey = offlineCache.buildKey('academic_calendar', user?.id, `${selectedChildId || 'self'}_${calendarRange}_${calendarDate}`);

    // Baca cache dulu
    const cached = await offlineCache.get<any>(cacheKey);
    if (cached) {
      if (cached.data) setCalendarData(cached.data);
      if (cached.student) setStudentInfo(cached.student);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const res = await mobileApiService.getAcademicCalendar({
        range: calendarRange,
        date: calendarDate,
        child_id: selectedChildId,
      });
      const data = unwrapApiData<any>(res) || {};
      setCalendarData(data);
      const freshStudent = res?.student || data?.student || null;
      if (freshStudent) {
        setStudentInfo(freshStudent);
      }
      void offlineCache.set(cacheKey, { data, student: freshStudent });
    } catch {
      if (!cached) {
        setCalendarData(null);
      }
    } finally {
      setLoading(false);
    }
  }, [calendarRange, calendarDate, selectedChildId, user?.id]);

  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar]);

  // Navigation handlers
  const handlePrevDate = () => {
    const cur = new Date(calendarDate);
    if (calendarRange === 'today' || calendarViewMode === 'hari') {
      cur.setDate(cur.getDate() - 1);
    } else if (calendarRange === 'month' || calendarViewMode === 'bulan') {
      cur.setMonth(cur.getMonth() - 1);
    } else {
      cur.setDate(cur.getDate() - 7);
    }
    setCalendarDate(cur.toISOString().slice(0, 10));
  };

  const handleNextDate = () => {
    const cur = new Date(calendarDate);
    if (calendarRange === 'today' || calendarViewMode === 'hari') {
      cur.setDate(cur.getDate() + 1);
    } else if (calendarRange === 'month' || calendarViewMode === 'bulan') {
      cur.setMonth(cur.getMonth() + 1);
    } else {
      cur.setDate(cur.getDate() + 7);
    }
    setCalendarDate(cur.toISOString().slice(0, 10));
  };

  const handlePrevMonth = () => {
    let nextMonth = viewMonth - 1;
    let nextYear = viewYear;
    if (nextMonth < 0) {
      nextMonth = 11;
      nextYear -= 1;
    }
    setViewMonth(nextMonth);
    setViewYear(nextYear);

    const mStr = String(nextMonth + 1).padStart(2, '0');
    const dayStr = calendarDate.split('-')[2] || '01';
    const daysInTargetMonth = new Date(nextYear, nextMonth + 1, 0).getDate();
    const clampedDay = Math.min(parseInt(dayStr, 10) || 1, daysInTargetMonth);
    const newDateStr = `${nextYear}-${mStr}-${String(clampedDay).padStart(2, '0')}`;
    setCalendarDate(newDateStr);
  };

  const handleNextMonth = () => {
    let nextMonth = viewMonth + 1;
    let nextYear = viewYear;
    if (nextMonth > 11) {
      nextMonth = 0;
      nextYear += 1;
    }
    setViewMonth(nextMonth);
    setViewYear(nextYear);

    const mStr = String(nextMonth + 1).padStart(2, '0');
    const dayStr = calendarDate.split('-')[2] || '01';
    const daysInTargetMonth = new Date(nextYear, nextMonth + 1, 0).getDate();
    const clampedDay = Math.min(parseInt(dayStr, 10) || 1, daysInTargetMonth);
    const newDateStr = `${nextYear}-${mStr}-${String(clampedDay).padStart(2, '0')}`;
    setCalendarDate(newDateStr);
  };

  const handleTodayDate = () => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    setCalendarDate(todayStr);
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setCalendarRange('today');
  };

  const activeChild = children.find((c) => String(c.id) === selectedChildId);
  const events = Array.isArray(calendarData?.events) ? calendarData.events : [];
  const upcomingEvents = Array.isArray(calendarData?.upcoming_events) ? calendarData.upcoming_events : [];
  const displayDates = Array.isArray(calendarData?.display_dates) && calendarData.display_dates.length > 0
    ? calendarData.display_dates
    : Array.isArray(calendarData?.week_dates)
      ? calendarData.week_dates
      : [];
  const quickRanges = Array.isArray(calendarData?.quick_ranges) && calendarData.quick_ranges.length > 0
    ? calendarData.quick_ranges
    : [
        { key: 'today', label: 'Hari Ini' },
        { key: 'week', label: '1 Minggu' },
        { key: 'month', label: '1 Bulan' },
        { key: 'semester', label: 'Semester' },
        { key: 'year', label: 'Tahun Ajaran' },
        { key: 'all', label: 'Semua Agenda' },
      ];

  const monthGridDays = getMonthGrid(viewYear, viewMonth, calendarDate, events);

  const formattedPanelDate = (() => {
    try {
      const parts = calendarDate.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        const dt = new Date(y, m, d);
        const dayNamesLong = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        return `${dayNamesLong[dt.getDay()]}, ${d} ${MONTH_NAMES[m]} ${y}`;
      }
    } catch {}
    return calendarDate;
  })();

  const todayEvents = events.filter((e: any) => {
    const eDate = e.date ? String(e.date).slice(0, 10) : '';
    return eDate === calendarDate;
  });
  const panelEvents = todayEvents.length > 0
    ? todayEvents
    : (events.length > 0 ? events.slice(0, 3) : upcomingEvents.slice(0, 3));

  return (
    <View style={styles.rootContainer}>
      <View style={styles.sheetContainer}>
        <LinearGradient
          colors={['#FFFFFF', '#F2FAF6', '#DDF5EB']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <ScrollView
          style={styles.screen}
          contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 30 }]}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={loadCalendar} colors={['#18A165']} />}
        >
      {/* 1. CONTAINER DATA SISWA & UNIT PENDIDIKAN */}
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
            onMomentumScrollEnd={handleStudentScrollEnd}
            style={styles.heroCardScrollContainer}
            contentContainerStyle={styles.heroCardScroll}
          >
            {children.map((child, idx) => {
              const isSelected = String(child.id) === selectedChildId;
              const childFullName = child.full_name || child.nama_lengkap || child.name || 'Siswa';
              const unitTitle = child.education_unit?.name || child.unit_name || 'Unit Sekolah';
              const className = child.kelas?.name || child.kelas?.nama_kelas || child.classroom?.name || child.class_name || 'Kelas Belum Ditentukan';
              const jenjang = child.kelas?.jenjang || child.education_unit?.level || 'Terpadu';
              const avatarUri = getProfileImageUrl(child);

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
                    style={[styles.childCardHeroSize, !isSelected && { opacity: 0.9 }]}
                  >
                    <View style={styles.cardDecorCircle} />

                    {/* Top Row: Avatar + Info (Name, NIS, Unit Pill) + Right Button */}
                    <View style={styles.childHeroTopRow}>
                      <View style={styles.avatarBorderWrapHero}>
                        {avatarUri ? (
                          <Image
                            source={{ uri: avatarUri }}
                            style={styles.childAvatarImgHero}
                            resizeMode="cover"
                          />
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

          {/* DOT INDIKATOR SCROLL SISWA */}
          {children.length > 1 && (
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
            const studentName = s.full_name || s.nama_lengkap || s.name || 'Siswa Aktif';
            const studentClass = s.kelas?.nama_kelas || s.kelas?.name || s.class || s.class_name || 'Kelas Belum Ditentukan';
            const studentUnit = s.education_unit?.name || s.unit || s.unit_name || 'Unit Pendidikan';
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
                      <Image
                        source={{ uri: avatarUri }}
                        style={styles.childAvatarImgHero}
                        resizeMode="cover"
                      />
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
                        {studentName}
                      </Text>
                    </View>
                    <Text style={styles.studentNisText}>
                      NIS: {s.nis || '-'} {s.nisn ? `· NISN: ${s.nisn}` : ''}
                    </Text>
                    <View style={styles.studentUnitBadge}>
                      <MaterialCommunityIcons name="school" size={11} color="#FFFFFF" style={{ marginRight: 4 }} />
                      <Text numberOfLines={1} style={styles.studentUnitText}>
                        {studentUnit}
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
                    <Text numberOfLines={1} style={styles.studentAttrValue}>{studentClass}</Text>
                  </View>
                  <View style={styles.studentAttrDivider} />
                  <View style={styles.studentAttrBox}>
                    <View style={styles.studentAttrLabelRow}>
                      <MaterialCommunityIcons name="domain" size={13} color="#A7F3D0" style={{ marginRight: 3 }} />
                      <Text style={styles.studentAttrLabel}>Jenjang</Text>
                    </View>
                    <Text numberOfLines={1} style={styles.studentAttrValue}>{jenjang}</Text>
                  </View>
                  <View style={styles.studentAttrDivider} />
                  <View style={styles.studentAttrBox}>
                    <View style={styles.studentAttrLabelRow}>
                      <MaterialCommunityIcons name="account-group" size={13} color="#A7F3D0" style={{ marginRight: 3 }} />
                      <Text style={styles.studentAttrLabel}>Presensi</Text>
                    </View>
                    <View style={styles.studentPresensiValueRow}>
                      <Text numberOfLines={1} style={[styles.studentAttrValue, { color: '#DEF7EC' }]}>Hadir</Text>
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
              <MaterialCommunityIcons name="account-school" size={18} color="#18A165" />
              <Text style={styles.sectionTitle}>Data Pengguna & Unit</Text>
            </View>
          </View>

          {(() => {
            const userName = String(user?.name || user?.full_name || user?.nama_lengkap || 'Pengguna');
            const userRole = typeof user?.role === 'string' ? user.role : (Array.isArray(user?.roles) && user.roles[0] ? String(user.roles[0]) : 'Pengguna');
            const userUnit = String((user as any)?.unit_name || (user as any)?.education_unit?.name || 'Mahad Abu Ja\'far');
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
                    <Text style={styles.studentAttrLabel}>Unit</Text>
                    <Text numberOfLines={1} style={styles.studentAttrValue}>{userUnit}</Text>
                  </View>
                  <View style={styles.studentAttrDivider} />
                  <View style={styles.studentAttrBox}>
                    <Text style={styles.studentAttrLabel}>Status</Text>
                    <Text numberOfLines={1} style={[styles.studentAttrValue, { color: '#DEF7EC' }]}>Terverifikasi</Text>
                  </View>
                </View>
              </LinearGradient>
            );
          })()}
        </View>
      ) : null}

      {/* 2. TOP HERO BANNER: Kalender Akademik */}
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.85)', 'rgba(242, 250, 246, 0.75)', 'rgba(221, 245, 235, 0.6)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroBannerCard}
      >
        <View style={styles.heroBannerLeft}>
          <View style={styles.heroBannerIconBox}>
            <MaterialCommunityIcons name="calendar-multiselect" size={24} color="#15803D" />
          </View>
          <View style={styles.heroBannerTextWrap}>
            <Text style={styles.heroBannerTitle}>Kalender Akademik</Text>
            <Text numberOfLines={1} style={styles.heroBannerSub}>
              {calendarData?.academic_year?.name || `Tahun Ajaran ${new Date().getMonth() >= 6 ? `${new Date().getFullYear()}/${new Date().getFullYear() + 1}` : `${new Date().getFullYear() - 1}/${new Date().getFullYear()}`}`}
            </Text>
            <Text numberOfLines={1} style={styles.heroBannerUnit}>
              {calendarData?.unit?.name || activeChild?.education_unit?.name || 'Sekolah Terpadu'}
            </Text>
          </View>
        </View>

        {/* 3D Calendar Graphic Illustration */}
        <View style={styles.heroCalendarArtWrap}>
          <View style={styles.artCardBackdrop} />
          <View style={styles.artCalendarCard}>
            <View style={styles.artCalendarHeader}>
              <View style={styles.artSpiralHole} />
              <View style={styles.artSpiralHole} />
            </View>
            <View style={styles.artCalendarBody}>
              <Text style={styles.artCalendarDayNum}>
                {calendarDate.split('-')[2] ? parseInt(calendarDate.split('-')[2], 10) : new Date().getDate()}
              </Text>
              <Text style={styles.artCalendarMonth}>
                {MONTH_NAMES[viewMonth]?.slice(0, 3)?.toUpperCase() || MONTH_NAMES[new Date().getMonth()]?.slice(0, 3)?.toUpperCase()}
              </Text>
            </View>
          </View>
          <View style={styles.artLeafBadge}>
            <MaterialCommunityIcons name="leaf" size={13} color="#16A34A" />
          </View>
        </View>
      </LinearGradient>

      {/* 3. SECTION: Rentang Cepat (5 Colorful Square Cards) */}
      <View style={styles.quickRangeSectionNew}>
        <Text style={styles.quickRangeTitleNew}>Rentang Cepat:</Text>
        <View style={styles.quickRangeGridRow}>
          {QUICK_RANGE_CARDS.map((card) => {
            const isActive = calendarRange === card.key;
            return (
              <TouchableOpacity
                key={card.key}
                activeOpacity={0.8}
                onPress={() => setCalendarRange(card.key)}
                style={[
                  styles.quickRangeCardNew,
                  {
                    backgroundColor: isActive ? card.activeBg : card.inactiveBg,
                    borderColor: isActive ? card.activeBg : card.inactiveBorder,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name={card.icon as any}
                  size={20}
                  color={isActive ? card.activeColor : card.inactiveColor}
                />
                <Text
                  numberOfLines={2}
                  style={[
                    styles.quickRangeCardTextNew,
                    { color: isActive ? card.activeColor : card.inactiveColor },
                  ]}
                >
                  {card.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 4. SPLIT 2-COLUMN SECTION: Month Calendar Grid (Left) & Agenda Hari Ini (Right) */}
      <View style={styles.splitGridRow}>
        {/* Left Column: Mini Month Calendar Grid */}
        <View style={styles.calendarColCard}>
          {/* Header Month < Month Year > */}
          <View style={styles.calendarColHeader}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handlePrevMonth}
              style={styles.monthNavBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <MaterialCommunityIcons name="chevron-left" size={20} color="#1E293B" />
            </TouchableOpacity>

            <View style={styles.monthColTitleWrap}>
              <Text numberOfLines={1} style={styles.monthColTitleMonth}>
                {MONTH_NAMES[viewMonth] || 'Bulan'}
              </Text>
              <Text style={styles.monthColTitleYear}>
                {viewYear}
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleNextMonth}
              style={styles.monthNavBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <MaterialCommunityIcons name="chevron-right" size={20} color="#1E293B" />
            </TouchableOpacity>
          </View>

          {/* Days of Week Header */}
          <View style={styles.dayNamesRow}>
            {DAY_NAMES.map((dn, idx) => (
              <Text
                key={dn}
                style={[
                  styles.dayNameCell,
                  idx === 0 && styles.dayNameCellSun,
                ]}
              >
                {dn}
              </Text>
            ))}
          </View>

          {/* Days Grid Matrix (7 Columns) */}
          <View style={styles.daysMatrixGrid}>
            {monthGridDays.map((cell, cIdx) => {
              return (
                <TouchableOpacity
                  key={`${cell.fullDate}_${cIdx}`}
                  activeOpacity={0.75}
                  onPress={() => {
                    setCalendarDate(cell.fullDate);
                    const parts = cell.fullDate.split('-');
                    if (parts.length === 3) {
                      setViewYear(parseInt(parts[0], 10));
                      setViewMonth(parseInt(parts[1], 10) - 1);
                    }
                  }}
                  style={styles.dayCellTouch}
                >
                  <View
                    style={[
                      styles.dayCellCircle,
                      cell.isSelected && styles.dayCellSelectedCircle,
                      cell.isToday && !cell.isSelected && styles.dayCellTodayCircle,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayCellText,
                        !cell.isCurrentMonth && styles.dayCellTextMuted,
                        cell.isToday && !cell.isSelected && styles.dayCellTextToday,
                        cell.isSelected && styles.dayCellTextSelected,
                      ]}
                    >
                      {cell.day}
                    </Text>
                  </View>
                  {cell.hasEvent && (
                    <View
                      style={[
                        styles.dayEventIndicatorDot,
                        cell.isSelected && styles.dayEventIndicatorDotSelected,
                      ]}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Right Column: Panel "Agenda Hari Ini" */}
        <View style={styles.agendaColCard}>
          <View style={styles.agendaColHeader}>
            <Text style={styles.agendaColTitle}>Agenda Hari Ini</Text>
            <Text numberOfLines={1} style={styles.agendaColDate}>
              {formattedPanelDate}
            </Text>
          </View>

          {loading ? (
            <ActivityIndicator size="small" color="#18A165" style={{ marginVertical: 24 }} />
          ) : panelEvents.length > 0 ? (
            <View style={styles.agendaListWrap}>
              {panelEvents.map((evt: any, idx: number) => {
                const dotColors = ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B'];
                const itemColor = evt.color || dotColors[idx % dotColors.length];
                return (
                  <TouchableOpacity
                    key={String(evt.id || idx)}
                    activeOpacity={0.82}
                    onPress={() => setSelectedEvent(evt)}
                    style={[styles.agendaMiniCard, { borderLeftColor: itemColor }]}
                  >
                    <View style={styles.agendaMiniTopRow}>
                      <View style={[styles.agendaMiniDot, { backgroundColor: itemColor }]} />
                      <Text numberOfLines={1} style={styles.agendaMiniTime}>
                        {evt.time_display || '07.00 - 07.30'}
                      </Text>
                    </View>
                    <Text numberOfLines={1} style={styles.agendaMiniTitle}>
                      {evt.title}
                    </Text>
                    <Text numberOfLines={1} style={styles.agendaMiniLocation}>
                      {evt.location || evt.room || 'Lapangan Sekolah'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View style={styles.agendaEmptyBox}>
              <MaterialCommunityIcons name="calendar-blank-outline" size={22} color="#94A3B8" />
              <Text style={styles.agendaEmptyText}>Tidak ada agenda kegiatan hari ini</Text>
            </View>
          )}

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setShowAllAgendaModal(true)}
            style={styles.seeAllAgendaBtn}
          >
            <Text style={styles.seeAllAgendaBtnText}>Lihat Semua Agenda →</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Dynamic Range Summary Banner from Backend (if week, month, semester, year) */}
      {calendarRange !== 'today' && calendarData?.range_info?.formatted_range && (
        <View style={styles.rangeInfoBanner}>
          <MaterialCommunityIcons name="calendar-range" size={15} color="#18A165" />
          <Text numberOfLines={1} style={styles.rangeInfoText}>
            {calendarData.range_info.label || calendarData.range_info.formatted_range}
          </Text>
          <View style={styles.rangeCountBadge}>
            <Text style={styles.rangeCountText}>
              {calendarData.range_info.total_days} Hari
            </Text>
          </View>
        </View>
      )}

      {/* If Range is not 'today' and has events, show full list */}
      {calendarRange !== 'today' && events.length > 0 && (
        <View style={styles.eventsSection}>
          <View style={styles.eventsSectionHeader}>
            <Text style={styles.eventsSectionTitle}>
              Daftar Agenda ({events.length})
            </Text>
            <View style={styles.unitTag}>
              <MaterialCommunityIcons name="shield-check" size={12} color="#18A165" />
              <Text numberOfLines={1} style={styles.unitTagText}>
                {calendarData?.unit?.name || 'Unit Terpilih'}
              </Text>
            </View>
          </View>

          {events.map((evt: any, idx: number) => {
            const borderStripeColor = evt.color || '#2563EB';
            return (
              <TouchableOpacity
                key={String(evt.id || idx)}
                activeOpacity={0.85}
                onPress={() => setSelectedEvent(evt)}
                style={[styles.eventCard, { borderLeftColor: borderStripeColor }]}
              >
                <View style={styles.eventCardHeader}>
                  <View style={styles.eventTimeBox}>
                    <MaterialCommunityIcons name="clock-outline" size={13} color="#475569" />
                    <Text style={styles.eventTimeText}>{evt.time_display || 'Waktu KBM'}</Text>
                  </View>

                  <View
                    style={[
                      styles.eventCategoryPill,
                      { backgroundColor: (evt.color || '#2563EB') + '15' },
                    ]}
                  >
                    <View
                      style={[
                        styles.eventCategoryDot,
                        { backgroundColor: evt.color || '#2563EB' },
                      ]}
                    />
                    <Text style={[styles.eventCategoryText, { color: evt.color || '#2563EB' }]}>
                      {evt.category || 'Kegiatan'}
                    </Text>
                  </View>
                </View>

                <Text style={styles.eventTitle}>{evt.title}</Text>

                <View style={styles.eventFooterRow}>
                  <View style={styles.eventLocationWrapper}>
                    <MaterialCommunityIcons name="map-marker-outline" size={13} color="#64748B" />
                    <Text numberOfLines={1} style={styles.eventLocationText}>
                      {evt.location || evt.room || evt.unit || 'Kampus SIT'}
                    </Text>
                  </View>
                  <Text style={styles.eventDateBadge}>
                    {evt.date ? new Date(evt.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : 'Hari ini'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* KEGIATAN MENDATANG ROW (BOTTOM CARDS) */}
      {upcomingEvents.length > 0 && (
        <View style={styles.upcomingSection}>
          <View style={styles.upcomingHeaderRow}>
            <Text style={styles.upcomingHeaderTitle}>KEGIATAN MENDATANG</Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setCalendarRange('semester')}
            >
              <Text style={styles.upcomingSeeAllText}>Lihat semester →</Text>
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.upcomingScroll}>
            {upcomingEvents.map((upEvt: any, uIdx: number) => {
              const cardBorder = upEvt.color || '#18A165';
              return (
                <TouchableOpacity
                  key={String(upEvt.id || uIdx)}
                  activeOpacity={0.85}
                  onPress={() => setSelectedEvent(upEvt)}
                  style={[styles.upcomingCard, { borderTopColor: cardBorder }]}
                >
                  <View style={[styles.upcomingIconWrap, { backgroundColor: cardBorder + '18' }]}>
                    <MaterialCommunityIcons
                      name={
                        upEvt.category?.includes('Ujian')
                          ? 'school'
                          : upEvt.category?.includes('Libur')
                          ? 'beach'
                          : upEvt.category?.includes('Rapor')
                          ? 'certificate'
                          : 'account-group'
                      }
                      size={18}
                      color={cardBorder}
                    />
                  </View>
                  <Text numberOfLines={2} style={styles.upcomingCardTitle}>
                    {upEvt.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.upcomingCardSub}>
                    {upEvt.location || upEvt.unit || 'Kampus SIT'}
                  </Text>
                  <Text style={styles.upcomingCardDate}>
                    {upEvt.date ? new Date(upEvt.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Mendatang'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* 7. MODAL DETAIL KEGIATAN AKADEMIK */}
      <Modal
        visible={Boolean(selectedEvent)}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setSelectedEvent(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.detailCard}>
            <View style={styles.detailHeader}>
              <View
                style={[
                  styles.eventCategoryPill,
                  { backgroundColor: (selectedEvent?.color || '#18A165') + '20' },
                ]}
              >
                <View
                  style={[
                    styles.eventCategoryDot,
                    { backgroundColor: selectedEvent?.color || '#18A165' },
                  ]}
                />
                <Text style={[styles.eventCategoryText, { color: selectedEvent?.color || '#18A165' }]}>
                  {selectedEvent?.category || 'Kegiatan'}
                </Text>
              </View>

              <TouchableOpacity onPress={() => setSelectedEvent(null)} style={styles.modalCloseIcon}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.detailTitle}>{selectedEvent?.title}</Text>

            <View style={styles.detailInfoBlock}>
              <View style={styles.detailInfoRow}>
                <MaterialCommunityIcons name="calendar-clock" size={16} color="#18A165" />
                <Text style={styles.detailInfoText}>
                  {selectedEvent?.date ? new Date(selectedEvent.date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Hari Ini'}
                  {selectedEvent?.time_display ? ` · ${selectedEvent.time_display}` : ''}
                </Text>
              </View>

              <View style={styles.detailInfoRow}>
                <MaterialCommunityIcons name="map-marker-radius-outline" size={16} color="#18A165" />
                <Text style={styles.detailInfoText}>
                  {selectedEvent?.location || selectedEvent?.room || selectedEvent?.unit || 'Kampus SIT'}
                </Text>
              </View>

              {selectedEvent?.teacher && (
                <View style={styles.detailInfoRow}>
                  <MaterialCommunityIcons name="account-tie" size={16} color="#18A165" />
                  <Text style={styles.detailInfoText}>
                    Pendidik: {selectedEvent.teacher}
                  </Text>
                </View>
              )}
            </View>

            {selectedEvent?.notes ? (
              <View style={styles.detailNotesBox}>
                <Text style={styles.detailNotesLabel}>Keterangan / Materi:</Text>
                <Text style={styles.detailNotesContent}>
                  {selectedEvent.notes}
                </Text>
              </View>
            ) : null}

            <View style={styles.rsvpRow}>
              <MaterialCommunityIcons name="check-circle" size={16} color="#10B981" />
              <Text style={styles.rsvpText}>Jadwal terdaftar resmi dalam kalender SIT</Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setSelectedEvent(null)}
              style={styles.modalCloseBtn}
            >
              <Text style={styles.modalCloseBtnText}>Tutup</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 8. MODAL SEMUA AGENDA */}
      <Modal
        visible={showAllAgendaModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowAllAgendaModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.allAgendaCard}>
            <View style={styles.allAgendaHeader}>
              <View style={styles.allAgendaHeaderTitleWrap}>
                <MaterialCommunityIcons name="calendar-multiselect" size={20} color="#18A165" />
                <Text style={styles.allAgendaTitle}>Daftar Semua Agenda</Text>
              </View>
              <TouchableOpacity onPress={() => setShowAllAgendaModal(false)} style={styles.modalCloseIcon}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {events.length > 0 ? (
                events.map((evt: any, idx: number) => (
                  <TouchableOpacity
                    key={String(evt.id || idx)}
                    activeOpacity={0.8}
                    onPress={() => {
                      setShowAllAgendaModal(false);
                      setSelectedEvent(evt);
                    }}
                    style={[styles.allAgendaItem, { borderLeftColor: evt.color || '#18A165' }]}
                  >
                    <View style={styles.allAgendaItemTop}>
                      <Text style={styles.allAgendaItemTime}>{evt.time_display || 'Waktu KBM'}</Text>
                      <Text style={styles.allAgendaItemDate}>
                        {evt.date ? new Date(evt.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : 'Hari ini'}
                      </Text>
                    </View>
                    <Text style={styles.allAgendaItemTitle}>{evt.title}</Text>
                    <Text style={styles.allAgendaItemLocation}>{evt.location || evt.room || 'Kampus SIT'}</Text>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <MaterialCommunityIcons name="calendar-blank-outline" size={36} color="#CBD5E1" />
                  <Text style={{ fontSize: 12, color: '#64748B', marginTop: 8 }}>Tidak ada agenda terdaftar</Text>
                </View>
              )}
            </ScrollView>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setShowAllAgendaModal(false)}
              style={styles.modalCloseBtn}
            >
              <Text style={styles.modalCloseBtnText}>Tutup</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
        </ScrollView>
      </View>
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
  content: { padding: 16, paddingTop: Platform.OS === 'android' ? 20 : 16 },
  containerBlock: {
    marginBottom: 16,
  },
  studentContainerBlock: {
    marginBottom: 10,
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
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
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
  childrenSection: {
    marginBottom: 14,
  },
  childrenLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#18A165',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  childrenScroll: {
    gap: 10,
    paddingRight: 10,
  },
  childChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
  },
  childChipActive: {
    backgroundColor: '#18A165',
    borderColor: '#18A165',
  },
  childAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#DEF7EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  childAvatarActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  childNameText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  childUnitText: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  childTextActive: {
    color: '#FFFFFF',
  },
  headerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    marginBottom: 0,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#18A165',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  headerSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  unitPill: {
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  unitPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#18A165',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 6,
    gap: 8,
    marginBottom: 0,
  },
  todayBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  todayBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
  },
  navArrows: {
    flexDirection: 'row',
    gap: 2,
  },
  arrowBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  viewDateTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'right',
  },
  modeRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 8,
  },
  modeBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  modeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  modeBtnTextActive: {
    color: '#18A165',
    fontWeight: '900',
  },
  quickRangeSection: {
    marginBottom: 14,
  },
  quickRangeLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 6,
  },
  quickRangeScroll: {
    gap: 8,
    paddingRight: 10,
  },
  quickRangeChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickRangeChipActive: {
    backgroundColor: '#18A165',
    borderColor: '#18A165',
  },
  quickRangeChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  quickRangeChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  rangeInfoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EBF8F2',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(24, 161, 101, 0.3)',
    marginBottom: 12,
    gap: 8,
  },
  rangeInfoText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '800',
    color: '#18A165',
  },
  rangeCountBadge: {
    backgroundColor: '#18A165',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  rangeCountText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  weekDatesSection: {
    marginBottom: 16,
  },
  weekDatesScroll: {
    gap: 8,
    paddingRight: 10,
    paddingBottom: 6,
  },
  weekDayCard: {
    width: 50,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#64748B',
    shadowOpacity: 0.08,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    position: 'relative',
  },
  weekDayCardHighlighted: {
    backgroundColor: '#EBF8F2',
    borderColor: '#18A165',
    shadowColor: '#18A165',
    shadowOpacity: 0.2,
    elevation: 3,
  },
  weekDayCardSelected: {
    backgroundColor: '#18A165',
    borderColor: '#0D6B42',
    shadowColor: '#0D6B42',
    shadowOpacity: 0.3,
    elevation: 4,
  },
  weekDayName: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  weekDayNameHighlighted: {
    color: '#18A165',
    fontWeight: '900',
  },
  weekDayNameSelected: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  weekDayNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  weekDayHighlightedBadge: {
    backgroundColor: '#18A165',
  },
  weekDayTodayBadge: {
    backgroundColor: '#18A165',
  },
  weekDaySelectedBadge: {
    backgroundColor: '#FFFFFF',
  },
  weekDayNumberText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  weekDayNumberTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  weekDayNumberTextSelected: {
    color: '#18A165',
    fontWeight: '900',
  },
  todayTinyBadge: {
    position: 'absolute',
    bottom: -6,
    backgroundColor: '#18A165',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  todayTinyBadgeText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  highlightedTinyDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#18A165',
    marginTop: 4,
  },
  eventCountDot: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  eventCountDotText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  eventsSection: {
    marginBottom: 18,
  },
  eventsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  eventsSectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },
  unitTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    maxWidth: 160,
  },
  unitTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#18A165',
  },
  eventCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4.5,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  eventCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  eventTimeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  eventTimeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  eventCategoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 5,
  },
  eventCategoryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  eventCategoryText: {
    fontSize: 10,
    fontWeight: '800',
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  eventFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eventLocationWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flex: 1,
    marginRight: 8,
  },
  eventLocationText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  eventDateBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#18A165',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  upcomingSection: {
    marginTop: 8,
    marginBottom: 20,
  },
  upcomingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  upcomingHeaderTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.6,
  },
  upcomingSeeAllText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#18A165',
  },
  upcomingScroll: {
    gap: 12,
    paddingRight: 12,
  },
  upcomingCard: {
    width: 170,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderTopWidth: 3.5,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  upcomingIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  upcomingCardTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    minHeight: 32,
  },
  upcomingCardSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  upcomingCardDate: {
    fontSize: 10,
    fontWeight: '800',
    color: '#18A165',
    marginTop: 6,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    padding: 20,
  },
  detailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 5,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalCloseIcon: {
    padding: 4,
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 14,
  },
  detailInfoBlock: {
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  detailInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailInfoText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
    flex: 1,
  },
  detailNotesBox: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  detailNotesLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 4,
  },
  detailNotesContent: {
    fontSize: 12,
    color: '#1E293B',
    lineHeight: 18,
  },
  rsvpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  rsvpText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#18A165',
  },
  modalCloseBtn: {
    backgroundColor: '#18A165',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCloseBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  emptyContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyText: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },

  // Hero Banner Card
  heroBannerCard: {
    borderRadius: 18,
    borderWidth: 0,
    borderColor: 'transparent',
    padding: 14,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 0,
    shadowOpacity: 0,
  },
  heroBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  heroBannerIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(220, 252, 231, 0.75)',
    borderWidth: 0,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  heroBannerTextWrap: {
    flex: 1,
  },
  heroBannerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#064E3B',
  },
  heroBannerSub: {
    fontSize: 12,
    fontWeight: '700',
    color: '#047857',
    marginTop: 2,
  },
  heroBannerUnit: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#059669',
    marginTop: 1,
  },
  heroCalendarArtWrap: {
    width: 52,
    height: 52,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  artCardBackdrop: {
    position: 'absolute',
    width: 38,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#3B82F6',
    opacity: 0.85,
    transform: [{ rotate: '-8deg' }],
  },
  artCalendarCard: {
    width: 38,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
    alignItems: 'center',
  },
  artCalendarHeader: {
    width: '100%',
    height: 10,
    backgroundColor: '#EF4444',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  artSpiralHole: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  artCalendarBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artCalendarDayNum: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 14,
  },
  artCalendarMonth: {
    fontSize: 7,
    fontWeight: '800',
    color: '#EF4444',
    letterSpacing: 0.5,
  },
  artLeafBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#DCFCE7',
    borderRadius: 10,
    padding: 2,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },

  // Split Grid 2-Column
  splitGridRow: {
    flexDirection: SCREEN_WIDTH < 340 ? 'column' : 'row',
    gap: 8,
    marginBottom: 16,
  },
  calendarColCard: {
    flex: 1.18,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#64748B',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  calendarColHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  monthNavBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthColTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  monthColTitleMonth: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  monthColTitleYear: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
    marginTop: 1,
  },
  dayNamesRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  dayNameCell: {
    flex: 1,
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8',
    textAlign: 'center',
  },
  dayNameCellSun: {
    color: '#EF4444',
  },
  daysMatrixGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCellTouch: {
    width: '14.28%',
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  dayCellCircle: {
    width: 21,
    height: 21,
    borderRadius: 10.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellSelectedCircle: {
    backgroundColor: '#18A165',
    shadowColor: '#18A165',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 2,
  },
  dayCellTodayCircle: {
    borderWidth: 1.2,
    borderColor: '#18A165',
    backgroundColor: '#ECFDF5',
  },
  dayCellText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1E293B',
  },
  dayCellTextMuted: {
    color: '#CBD5E1',
    fontWeight: '500',
  },
  dayCellTextToday: {
    color: '#18A165',
    fontWeight: '900',
  },
  dayCellTextSelected: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  dayEventIndicatorDot: {
    position: 'absolute',
    bottom: 0,
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#18A165',
  },
  dayEventIndicatorDotSelected: {
    backgroundColor: '#FFFFFF',
  },

  // Right Panel Agenda Hari Ini
  agendaColCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#64748B',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    justifyContent: 'space-between',
  },
  agendaColHeader: {
    marginBottom: 8,
  },
  agendaColTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
  },
  agendaColDate: {
    fontSize: 10,
    fontWeight: '700',
    color: '#18A165',
    marginTop: 2,
  },
  agendaListWrap: {
    gap: 6,
    marginBottom: 6,
  },
  agendaMiniCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderLeftWidth: 3,
  },
  agendaMiniTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  agendaMiniDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  agendaMiniTime: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
  },
  agendaMiniTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
  },
  agendaMiniLocation: {
    fontSize: 9.5,
    color: '#94A3B8',
    marginTop: 1,
  },
  agendaEmptyBox: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agendaEmptyText: {
    fontSize: 10,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 14,
  },
  seeAllAgendaBtn: {
    paddingVertical: 5,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 4,
  },
  seeAllAgendaBtnText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#18A165',
  },

  // Rentang Cepat 5 Cards
  quickRangeSectionNew: {
    marginBottom: 16,
  },
  quickRangeTitleNew: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 10,
  },
  quickRangeGridRow: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'space-between',
  },
  quickRangeCardNew: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 14,
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  quickRangeCardTextNew: {
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 11,
  },

  // All Agenda Modal
  allAgendaCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 5,
    maxHeight: '85%',
  },
  allAgendaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  allAgendaHeaderTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  allAgendaTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  allAgendaItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4,
  },
  allAgendaItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  allAgendaItemTime: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  allAgendaItemDate: {
    fontSize: 11,
    fontWeight: '800',
    color: '#18A165',
  },
  allAgendaItemTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  allAgendaItemLocation: {
    fontSize: 11,
    color: '#64748B',
  },
});

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
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
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { isParentRole } from '../utils/roles';
import { getProfileImageUrl } from '../utils/profile';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Child = Record<string, any>;
type ScheduleItem = Record<string, any>;

const RANGES = [
  { id: 'today', label: 'Hari Ini', icon: 'calendar-today' },
  { id: 'weekly', label: 'Jadwal Mingguan', icon: 'calendar-week' },
  { id: 'monthly', label: 'Bulanan', icon: 'calendar-month' },
  { id: 'semester', label: 'Semester', icon: 'school' },
  { id: 'academic_year', label: 'Tahun Ajaran', icon: 'calendar-range' },
];

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

export default function ScheduleScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 16);

  const user = useAuthStore((state) => state.user);
  const isParent = isParentRole(user?.roles || []);

  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(route?.params?.child_id);
  const studentScrollRef = useRef<ScrollView>(null);

  const handleStudentScrollEnd = (e: any) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const cardWidth = SCREEN_WIDTH - 32 + 12;
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
      x: index * (SCREEN_WIDTH - 32 + 12),
      animated: true,
    });
  };

  // Date selection states
  const [selectedDate, setSelectedDate] = useState<Date>(new Date('2026-09-03'));
  const [selectedWeekOffset, setSelectedWeekOffset] = useState<number>(0);
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number>(8); // September (0-indexed = 8)
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedSemester, setSelectedSemester] = useState<'ganjil' | 'genap'>('ganjil');
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('2026/2027');

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [scheduleData, setScheduleData] = useState<any>(null);

  const [activeTab, setActiveTab] = useState<'today' | 'weekly' | 'monthly' | 'semester' | 'academic_year'>('today');
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDay() || 4);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 1. Load Children if parent
  useEffect(() => {
    let isMounted = true;
    if (isParent) {
      mobileApiService.getPortalChildren()
        .then((res) => {
          const arr = unwrapApiData<Child[]>(res) || [];
          if (isMounted) {
            setChildren(arr);
            if (!selectedChildId && arr.length > 0) {
              setSelectedChildId(String(arr[0].id));
            }
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [isParent]);

  // 2. Load schedules from backend API with date parameter
  const loadSchedules = useCallback(async () => {
    try {
      const dateStr = formatDateISO(selectedDate);
      const res = await mobileApiService.getPortalSchedules({
        child_id: selectedChildId,
        date: dateStr,
      });
      const data = unwrapApiData<any>(res) || {};
      setScheduleData(data);
    } catch {
      setScheduleData(null);
    }
  }, [selectedChildId, selectedDate]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await loadSchedules();
    setLoading(false);
  }, [loadSchedules]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSchedules();
    setRefreshing(false);
  };

  // Quick date change helper
  const changeDateByDays = (deltaDays: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + deltaDays);
    setSelectedDate(newDate);
  };

  const resetToToday = () => {
    setSelectedDate(new Date('2026-09-03'));
  };

  // Recent 7 dates strip for fast date switching
  const dateStrip = useMemo(() => {
    const dates = [];
    const base = new Date('2026-09-03');
    for (let i = -4; i <= 2; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const isSel = formatDateISO(d) === formatDateISO(selectedDate);
      const isTod = formatDateISO(d) === '2026-09-03';
      const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
      dates.push({
        dateObj: d,
        iso: formatDateISO(d),
        dayName: days[d.getDay()],
        dayNum: d.getDate(),
        monthShort: MONTH_NAMES[d.getMonth()].slice(0, 3),
        isSelected: isSel,
        isToday: isTod,
      });
    }
    return dates;
  }, [selectedDate]);

  const kpi = scheduleData?.kpi || {
    today_count: 8,
    weekly_count: 41,
    subject_count: 18,
    teacher_count: 21,
  };

  const todaySchedules: ScheduleItem[] = useMemo(() => {
    return Array.isArray(scheduleData?.today_schedules) ? scheduleData.today_schedules : [];
  }, [scheduleData]);

  const weeklySchedules: ScheduleItem[] = useMemo(() => {
    return Array.isArray(scheduleData?.weekly_schedules)
      ? scheduleData.weekly_schedules
      : Array.isArray(scheduleData?.all_schedules)
      ? scheduleData.all_schedules
      : [];
  }, [scheduleData]);

  const weekDates = useMemo(() => {
    if (Array.isArray(scheduleData?.week_dates) && scheduleData.week_dates.length > 0) {
      return scheduleData.week_dates;
    }
    // Fallback static week dates
    return [
      { day_id: 1, day_name: 'Senin', date: '2026-08-31', date_short: '31 Agu' },
      { day_id: 2, day_name: 'Selasa', date: '2026-09-01', date_short: '1 Sep' },
      { day_id: 3, day_name: 'Rabu', date: '2026-09-02', date_short: '2 Sep' },
      { day_id: 4, day_name: 'Kamis', date: '2026-09-03', date_short: '3 Sep' },
      { day_id: 5, day_name: 'Jumat', date: '2026-09-04', date_short: '4 Sep' },
      { day_id: 6, day_name: 'Sabtu', date: '2026-09-05', date_short: '5 Sep' },
    ];
  }, [scheduleData]);

  const filteredWeeklySchedules = useMemo(() => {
    return weeklySchedules.filter((item) => {
      const dayMatch = item.day_of_week === selectedDay;
      const q = searchQuery.toLowerCase().trim();
      const subjectName = (item.subject?.name || '').toLowerCase();
      const teacherName = (item.teacher?.name || '').toLowerCase();
      const searchMatch = !q || subjectName.includes(q) || teacherName.includes(q);
      return dayMatch && searchMatch;
    });
  }, [weeklySchedules, selectedDay, searchQuery]);

  // Subject distribution
  const subjectDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    weeklySchedules.forEach((s) => {
      const name = s.subject?.name || 'Mata Pelajaran';
      counts[name] = (counts[name] || 0) + 1;
    });
    return Object.entries(counts).map(([name, count]) => ({
      name,
      weekly: count,
      monthly: count * 4,
      semester: count * 20,
      year: count * 40,
    }));
  }, [weeklySchedules]);

  const formattedSelectedDate = useMemo(() => {
    return formatIndonesianDate(selectedDate);
  }, [selectedDate]);

  const isSelectedDateToday = formatDateISO(selectedDate) === '2026-09-03';
  const isSelectedDatePast = formatDateISO(selectedDate) < '2026-09-03';

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
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#18A165']} />
          }
        >
          {/* 1. CONTAINER DATA SISWA & UNIT PENDIDIKAN */}
          {children.length > 0 ? (
            <View style={[styles.containerBlock, styles.studentContainerBlock]}>
              <View style={styles.sectionHeaderRow}>
                <MaterialCommunityIcons name="account-school" size={18} color="#18A165" />
                <Text style={styles.sectionTitle}>Data Siswa & Unit Pendidikan</Text>
              </View>

              <ScrollView
                ref={studentScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={SCREEN_WIDTH - 32 + 12}
                decelerationRate="fast"
                onMomentumScrollEnd={handleStudentScrollEnd}
                onScrollEndDrag={handleStudentScrollEnd}
                contentContainerStyle={styles.heroCardScroll}
              >
                {children.map((child, idx) => {
                  const isSelected = String(child.id) === selectedChildId;
                  const childFullName = child.full_name || child.nama_lengkap || child.name || 'Siswa';
                  const unitTitle = child.education_unit?.name || child.unit_name || 'Unit Sekolah';
                  const className = child.kelas?.name || child.kelas?.nama_kelas || child.classroom?.name || '';
                  const avatarUri =
                    getProfileImageUrl(child) ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(childFullName)}&background=${isSelected ? 'FFFFFF' : '18A165'}&color=${isSelected ? '18A165' : 'FFFFFF'}&bold=true&size=128`;

                  return (
                    <TouchableOpacity
                      key={String(child.id)}
                      activeOpacity={0.88}
                      onPress={() => selectChildWithScroll(String(child.id), idx)}
                      style={[styles.childCardHeroSize, isSelected && styles.childCardHeroSizeActive]}
                    >
                      <View style={styles.childHeroTopRow}>
                        <View style={[styles.avatarBorderWrapHero, isSelected && styles.avatarBorderWrapHeroActive]}>
                          <Image
                            source={{ uri: avatarUri }}
                            style={styles.childAvatarImgHero}
                            resizeMode="cover"
                          />
                        </View>
                        <View style={{ flex: 1, marginLeft: 14 }}>
                          <View style={styles.childHeroTitleRow}>
                            <Text numberOfLines={1} style={[styles.childNameHero, isSelected && styles.childTextActive]}>
                              {childFullName}
                            </Text>
                            <View style={[styles.childStatusBadgeHero, isSelected && styles.childStatusBadgeHeroActive]}>
                              <MaterialCommunityIcons
                                name={isSelected ? 'check-circle' : 'gesture-tap'}
                                size={12}
                                color={isSelected ? '#FFFFFF' : '#059669'}
                              />
                              <Text style={[styles.childStatusBadgeTextHero, isSelected && styles.childStatusBadgeTextHeroActive]}>
                                {isSelected ? 'Terpilih' : 'Pilih'}
                              </Text>
                            </View>
                          </View>
                          <Text numberOfLines={1} style={[styles.childClassHero, isSelected && styles.childTextActive]}>
                            {className ? `${className} · ${unitTitle}` : unitTitle}
                          </Text>
                          <Text style={[styles.childSubInfoHero, isSelected && styles.childSubInfoHeroActive]}>
                            {child.nis ? `NIS: ${child.nis} · ` : ''}Siswa Aktif Terdaftar
                          </Text>
                        </View>
                      </View>

                      <View style={[styles.childCardBottomBar, isSelected && styles.childCardBottomBarActive]}>
                        <View style={[styles.childInfoPill, isSelected && styles.childInfoPillActive]}>
                          <MaterialCommunityIcons
                            name="school-outline"
                            size={12}
                            color={isSelected ? '#FFFFFF' : '#18A165'}
                          />
                          <Text numberOfLines={1} style={[styles.childInfoPillText, isSelected && styles.childTextActive]}>
                            {unitTitle}
                          </Text>
                        </View>

                        <View style={[styles.childInfoPill, isSelected && styles.childInfoPillActive]}>
                          <MaterialCommunityIcons
                            name="badge-account-outline"
                            size={12}
                            color={isSelected ? '#FFFFFF' : '#18A165'}
                          />
                          <Text numberOfLines={1} style={[styles.childInfoPillText, isSelected && styles.childTextActive]}>
                            {child.nis ? `NIS: ${child.nis}` : 'Terdaftar Aktif'}
                          </Text>
                        </View>
                      </View>
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
          ) : scheduleData?.student ? (
            <View style={[styles.containerBlock, styles.studentContainerBlock]}>
              <View style={styles.sectionHeaderRow}>
                <MaterialCommunityIcons name="account-school" size={18} color="#18A165" />
                <Text style={styles.sectionTitle}>Data Siswa & Unit Pendidikan</Text>
              </View>

              {(() => {
                const s = scheduleData.student;
                const studentName = s.name || 'Siswa Aktif';
                const studentClass = s.class || '';
                const studentUnit = s.unit || '';
                const avatarUri =
                  getProfileImageUrl(s) ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(studentName)}&background=FFFFFF&color=18A165&bold=true&size=128`;

                return (
                  <View style={[styles.childCardHeroSize, styles.childCardHeroSizeActive]}>
                    <View style={styles.childHeroTopRow}>
                      <View style={[styles.avatarBorderWrapHero, styles.avatarBorderWrapHeroActive]}>
                        <Image
                          source={{ uri: avatarUri }}
                          style={styles.childAvatarImgHero}
                          resizeMode="cover"
                        />
                      </View>
                      <View style={{ flex: 1, marginLeft: 14 }}>
                        <View style={styles.childHeroTitleRow}>
                          <Text numberOfLines={1} style={[styles.childNameHero, styles.childTextActive]}>
                            {studentName}
                          </Text>
                          <View style={[styles.childStatusBadgeHero, styles.childStatusBadgeHeroActive]}>
                            <MaterialCommunityIcons name="check-circle" size={12} color="#FFFFFF" />
                            <Text style={[styles.childStatusBadgeTextHero, styles.childStatusBadgeTextHeroActive]}>
                              Siswa
                            </Text>
                          </View>
                        </View>
                        <Text numberOfLines={1} style={[styles.childClassHero, styles.childTextActive]}>
                          {studentClass ? `${studentClass} · ${studentUnit}` : (studentUnit || 'Siswa Terdaftar')}
                        </Text>
                        <Text style={[styles.childSubInfoHero, styles.childSubInfoHeroActive]}>
                          {s.nis ? `NIS: ${s.nis} · ` : ''}Jadwal Pelajaran Aktif
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.childCardBottomBar, styles.childCardBottomBarActive]}>
                      <View style={[styles.childInfoPill, styles.childInfoPillActive]}>
                        <MaterialCommunityIcons name="school-outline" size={12} color="#FFFFFF" />
                        <Text style={[styles.childInfoPillText, styles.childTextActive]}>
                          {studentUnit || 'Unit Sekolah'}
                        </Text>
                      </View>
                      <View style={[styles.childInfoPill, styles.childInfoPillActive]}>
                        <MaterialCommunityIcons name="badge-account-outline" size={12} color="#FFFFFF" />
                        <Text style={[styles.childInfoPillText, styles.childTextActive]}>
                          {s.nis ? `NIS: ${s.nis}` : 'Terdaftar Aktif'}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })()}
            </View>
          ) : user ? (
            <View style={[styles.containerBlock, styles.studentContainerBlock]}>
              <View style={styles.sectionHeaderRow}>
                <MaterialCommunityIcons name="account-school" size={18} color="#18A165" />
                <Text style={styles.sectionTitle}>Data Pengguna & Unit Pendidikan</Text>
              </View>

              {(() => {
                const u = user as any;
                const userName = String(u?.name || u?.full_name || u?.nama_lengkap || 'Pengguna');
                const userRole = typeof u?.role === 'string' ? u.role : (Array.isArray(u?.roles) && u.roles[0] ? String(u.roles[0]) : 'Siswa');
                const unitTitle = String(u?.unit_name || u?.education_unit?.name || 'Sistem Sekolah Terpadu');
                const idLabel = String(u?.nis || u?.username || 'Pengguna Aktif');
                const avatarUri =
                  getProfileImageUrl(u) ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=FFFFFF&color=18A165&bold=true&size=128`;

                return (
                  <View style={[styles.childCardHeroSize, styles.childCardHeroSizeActive]}>
                    <View style={styles.childHeroTopRow}>
                      <View style={[styles.avatarBorderWrapHero, styles.avatarBorderWrapHeroActive]}>
                        <Image
                          source={{ uri: avatarUri }}
                          style={styles.childAvatarImgHero}
                          resizeMode="cover"
                        />
                      </View>
                      <View style={{ flex: 1, marginLeft: 14 }}>
                        <View style={styles.childHeroTitleRow}>
                          <Text numberOfLines={1} style={[styles.childNameHero, styles.childTextActive]}>
                            {userName}
                          </Text>
                          <View style={[styles.childStatusBadgeHero, styles.childStatusBadgeHeroActive]}>
                            <MaterialCommunityIcons name="check-circle" size={12} color="#FFFFFF" />
                            <Text style={[styles.childStatusBadgeTextHero, styles.childStatusBadgeTextHeroActive]}>
                              {userRole}
                            </Text>
                          </View>
                        </View>
                        <Text numberOfLines={1} style={[styles.childClassHero, styles.childTextActive]}>
                          {unitTitle}
                        </Text>
                        <Text style={[styles.childSubInfoHero, styles.childSubInfoHeroActive]}>
                          Jadwal Pelajaran Terpadu
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.childCardBottomBar, styles.childCardBottomBarActive]}>
                      <View style={[styles.childInfoPill, styles.childInfoPillActive]}>
                        <MaterialCommunityIcons name="school-outline" size={12} color="#FFFFFF" />
                        <Text style={[styles.childInfoPillText, styles.childTextActive]}>
                          {unitTitle}
                        </Text>
                      </View>
                      <View style={[styles.childInfoPill, styles.childInfoPillActive]}>
                        <MaterialCommunityIcons name="badge-account-outline" size={12} color="#FFFFFF" />
                        <Text style={[styles.childInfoPillText, styles.childTextActive]}>
                          {idLabel}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })()}
            </View>
          ) : null}

          {/* 2. 4 KPI SUMMARY CARDS */}
          <View style={styles.containerBlock}>
            <View style={styles.sectionHeaderRow}>
              <MaterialCommunityIcons name="chart-box-outline" size={18} color="#18A165" />
              <Text style={styles.sectionTitle}>Ringkasan Jadwal Pelajaran</Text>
            </View>

            <View style={styles.kpiGrid}>
              <View style={styles.kpiCard}>
                <View style={styles.kpiHeaderRow}>
                  <View style={[styles.kpiIconBox, { backgroundColor: '#ECFDF5' }]}>
                    <MaterialCommunityIcons name="calendar-clock" size={20} color="#18A165" />
                  </View>
                  <Text style={styles.kpiNumber}>{kpi.today_count}</Text>
                </View>
                <Text style={styles.kpiTitle}>Pelajaran Hari Ini</Text>
                <Text style={styles.kpiSubtitle}>Jadwal aktif hari ini</Text>
              </View>

              <View style={styles.kpiCard}>
                <View style={styles.kpiHeaderRow}>
                  <View style={[styles.kpiIconBox, { backgroundColor: '#EFF6FF' }]}>
                    <MaterialCommunityIcons name="clock-outline" size={20} color="#2563EB" />
                  </View>
                  <Text style={styles.kpiNumber}>{kpi.weekly_count}</Text>
                </View>
                <Text style={styles.kpiTitle}>Total Sesi Mingguan</Text>
                <Text style={styles.kpiSubtitle}>Alokasi jam pelajaran</Text>
              </View>

              <View style={styles.kpiCard}>
                <View style={styles.kpiHeaderRow}>
                  <View style={[styles.kpiIconBox, { backgroundColor: '#FEF3C7' }]}>
                    <MaterialCommunityIcons name="book-open-page-variant" size={20} color="#D97706" />
                  </View>
                  <Text style={styles.kpiNumber}>{kpi.subject_count}</Text>
                </View>
                <Text style={styles.kpiTitle}>Mata Pelajaran</Text>
                <Text style={styles.kpiSubtitle}>Pelajaran semester ini</Text>
              </View>

              <View style={styles.kpiCard}>
                <View style={styles.kpiHeaderRow}>
                  <View style={[styles.kpiIconBox, { backgroundColor: '#F3E8FF' }]}>
                    <MaterialCommunityIcons name="account-tie" size={20} color="#7C3AED" />
                  </View>
                  <Text style={styles.kpiNumber}>{kpi.teacher_count}</Text>
                </View>
                <Text style={styles.kpiTitle}>Guru Pengampu</Text>
                <Text style={styles.kpiSubtitle}>Tim tenaga pendidik</Text>
              </View>
            </View>
          </View>

          {/* 3. WORKSPACE CONTAINER WITH 5 RANGES */}
          <View style={styles.containerBlock}>
            <View style={styles.sectionHeaderRow}>
              <MaterialCommunityIcons name="calendar-clock-outline" size={18} color="#18A165" />
              <Text style={styles.sectionTitle}>Jadwal Pelajaran & Sesi Belajar</Text>
            </View>

            <View style={styles.workspaceCard}>
            {/* 5 RANGES SELECTOR TABS */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rangeScroll}
            >
              {RANGES.map((rng) => {
                const isActive = activeTab === rng.id;
                return (
                  <TouchableOpacity
                    key={rng.id}
                    activeOpacity={0.8}
                    onPress={() => setActiveTab(rng.id as any)}
                    style={[styles.rangeBtn, isActive && styles.rangeBtnActive]}
                  >
                    <MaterialCommunityIcons
                      name={rng.icon as any}
                      size={15}
                      color={isActive ? '#FFFFFF' : '#475569'}
                    />
                    <Text style={[styles.rangeBtnText, isActive && styles.rangeBtnTextActive]}>
                      {rng.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* RANGE 1: HARI INI DENGAN NAVIGATOR TANGGAL & RIWAYAT SEBELUMNYA */}
            {activeTab === 'today' && (
              <View style={styles.tabContentArea}>
                {/* DATE NAVIGATOR HEADER */}
                <View style={styles.dateNavigatorCard}>
                  <View style={styles.dateNavRow}>
                    <TouchableOpacity
                      onPress={() => changeDateByDays(-1)}
                      style={styles.navArrowBtn}
                      accessibilityLabel="Tanggal sebelumnya"
                    >
                      <MaterialCommunityIcons name="chevron-left" size={24} color="#0F172A" />
                    </TouchableOpacity>

                    <View style={styles.dateInfoCenter}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <MaterialCommunityIcons name="calendar-month" size={16} color="#18A165" />
                        <Text style={styles.dateNavTitle}>{formattedSelectedDate}</Text>
                      </View>
                      <View style={styles.dateBadgeRow}>
                        {isSelectedDateToday ? (
                          <View style={styles.todayBadge}>
                            <Text style={styles.todayBadgeText}>HARI INI</Text>
                          </View>
                        ) : isSelectedDatePast ? (
                          <View style={styles.historyBadge}>
                            <Text style={styles.historyBadgeText}>RIWAYAT TANGGAL</Text>
                          </View>
                        ) : (
                          <View style={styles.futureBadge}>
                            <Text style={styles.futureBadgeText}>MENDATANG</Text>
                          </View>
                        )}
                        <Text style={styles.dateSubMeta}>
                          {todaySchedules.length} Sesi Terjadwal
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      onPress={() => changeDateByDays(1)}
                      style={styles.navArrowBtn}
                      accessibilityLabel="Tanggal berikutnya"
                    >
                      <MaterialCommunityIcons name="chevron-right" size={24} color="#0F172A" />
                    </TouchableOpacity>
                  </View>

                  {/* FAST DATE SWITCH STRIP (RIWAYAT CEPAT TANGGAL) */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.dateStripScroll}
                  >
                    {dateStrip.map((item) => (
                      <TouchableOpacity
                        key={item.iso}
                        onPress={() => setSelectedDate(item.dateObj)}
                        style={[
                          styles.dateStripItem,
                          item.isSelected && styles.dateStripItemActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dateStripDayText,
                            item.isSelected && styles.dateStripTextActive,
                          ]}
                        >
                          {item.dayName}
                        </Text>
                        <Text
                          style={[
                            styles.dateStripNumText,
                            item.isSelected && styles.dateStripTextActive,
                          ]}
                        >
                          {item.dayNum}
                        </Text>
                        <Text
                          style={[
                            styles.dateStripMonthText,
                            item.isSelected && styles.dateStripTextActive,
                          ]}
                        >
                          {item.monthShort}
                        </Text>
                        {item.isToday && !item.isSelected && (
                          <View style={styles.todayDot} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  {!isSelectedDateToday && (
                    <TouchableOpacity
                      onPress={resetToToday}
                      style={styles.resetTodayBtn}
                    >
                      <MaterialCommunityIcons name="calendar-arrow-right" size={14} color="#18A165" />
                      <Text style={styles.resetTodayBtnText}>Kembali ke Hari Ini (3 Sep 2026)</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {loading ? (
                  <ActivityIndicator color="#18A165" style={{ marginVertical: 32 }} />
                ) : todaySchedules.length > 0 ? (
                  <View style={styles.timelineContainer}>
                    <View style={styles.timelineVerticalLine} />

                    {todaySchedules.map((item, idx) => {
                      const isPast = item.is_past;
                      const isOngoing = item.is_ongoing;

                      const nodeColor = isPast ? '#EF4444' : isOngoing ? '#10B981' : '#64748B';
                      const nodeBg = isPast ? '#FEE2E2' : isOngoing ? '#D1FAE5' : '#F1F5F9';
                      const nodeIcon = isPast ? 'check-bold' : isOngoing ? 'play' : 'clock-outline';

                      return (
                        <View key={item.id || idx} style={styles.timelineNodeWrapper}>
                          <View style={[styles.milestoneNode, { backgroundColor: nodeBg, borderColor: nodeColor }]}>
                            <MaterialCommunityIcons name={nodeIcon} size={12} color={nodeColor} />
                          </View>

                          <View
                            style={[
                              styles.scheduleItemCard,
                              isPast && styles.scheduleItemCardPast,
                              isOngoing && styles.scheduleItemCardOngoing,
                            ]}
                          >
                            {/* LESSON DATE & TIME ROW */}
                            <View style={styles.lessonDateRow}>
                              <View style={styles.lessonDateBadge}>
                                <MaterialCommunityIcons name="calendar-range" size={11} color="#065F46" />
                                <Text style={styles.lessonDateText}>
                                  {item.date_formatted || formattedSelectedDate}
                                </Text>
                              </View>

                              {isPast ? (
                                <View style={styles.pastBadge}>
                                  <MaterialCommunityIcons name="check-circle" size={11} color="#DC2626" />
                                  <Text style={styles.pastBadgeText}>Selesai</Text>
                                </View>
                              ) : isOngoing ? (
                                <View style={styles.ongoingBadge}>
                                  <MaterialCommunityIcons name="broadcast" size={11} color="#15803D" />
                                  <Text style={styles.ongoingBadgeText}>Sedang Berlangsung</Text>
                                </View>
                              ) : (
                                <View style={styles.upcomingBadge}>
                                  <Text style={styles.upcomingBadgeText}>Akan Datang</Text>
                                </View>
                              )}
                            </View>

                            <View style={styles.itemTopRow}>
                              <View style={styles.timeTag}>
                                <MaterialCommunityIcons name="clock-outline" size={13} color="#18A165" />
                                <Text style={styles.timeTagText}>
                                  {item.time_start} - {item.time_end}
                                </Text>
                              </View>

                              <View style={styles.roomTag}>
                                <Text style={styles.roomTagText}>{item.room || 'Ruang Kelas'}</Text>
                              </View>
                            </View>

                            <Text style={styles.itemSubjectName}>
                              {item.subject?.name || 'Mata Pelajaran'}
                            </Text>

                            <View style={styles.teacherRow}>
                              <MaterialCommunityIcons name="account-tie" size={14} color="#18A165" />
                              <Text style={styles.teacherText}>
                                Guru: <Text style={styles.teacherBold}>{item.teacher?.name || 'Guru Pengampu'}</Text>
                              </Text>
                            </View>

                            {/* ATTENDANCE RECORD ON THIS LESSON */}
                            <View style={styles.attendanceBox}>
                              <View style={styles.attendanceLeft}>
                                <Text style={styles.attendanceTitle}>Presensi Siswa ({formattedSelectedDate.split(',')[0]}):</Text>
                                {item.attendance ? (
                                  <View style={styles.attendanceStatusRow}>
                                    <View
                                      style={[
                                        styles.attendancePill,
                                        item.attendance.status === 'hadir'
                                          ? styles.attHadir
                                          : item.attendance.status === 'izin'
                                          ? styles.attIzin
                                          : item.attendance.status === 'sakit'
                                          ? styles.attSakit
                                          : styles.attAlpa,
                                      ]}
                                    >
                                      <MaterialCommunityIcons
                                        name={
                                          item.attendance.status === 'hadir'
                                            ? 'check-decagram'
                                            : item.attendance.status === 'izin'
                                            ? 'file-document'
                                            : 'alert-circle'
                                        }
                                        size={12}
                                        color={
                                          item.attendance.status === 'hadir'
                                            ? '#059669'
                                            : item.attendance.status === 'izin'
                                            ? '#2563EB'
                                            : '#D97706'
                                        }
                                      />
                                      <Text
                                        style={[
                                          styles.attendancePillText,
                                          item.attendance.status === 'hadir'
                                            ? styles.attHadirText
                                            : item.attendance.status === 'izin'
                                            ? styles.attIzinText
                                            : styles.attSakitText,
                                        ]}
                                      >
                                        {item.attendance.status_label || 'Hadir'}
                                      </Text>
                                    </View>
                                    {item.attendance.recorded_at && (
                                      <Text style={styles.attendanceTimeText}>
                                        {item.attendance.recorded_at} WIB
                                      </Text>
                                    )}
                                  </View>
                                ) : (
                                  <View style={styles.attendanceStatusRow}>
                                    <View style={styles.attNonePill}>
                                      <Text style={styles.attNoneText}>
                                        {isPast ? 'Tidak Tercatat' : 'Menunggu Presensi Guru'}
                                      </Text>
                                    </View>
                                  </View>
                                )}
                              </View>

                              {item.attendance?.keterangan && (
                                <Text numberOfLines={1} style={styles.attendanceNotes}>
                                  Catatan: {item.attendance.keterangan}
                                </Text>
                              )}
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <View style={styles.emptyContainer}>
                    <MaterialCommunityIcons name="calendar-blank-outline" size={44} color="#94A3B8" />
                    <Text style={styles.emptyTitle}>Tidak Ada Jadwal pada Tanggal Ini</Text>
                    <Text style={styles.emptyText}>Tidak ada mata pelajaran yang terjadwal untuk {formattedSelectedDate}.</Text>
                  </View>
                )}
              </View>
            )}

            {/* RANGE 2: JADWAL MINGGUAN (DENGAN TANGGAL PEKAN SENIN S/D SABTU) */}
            {activeTab === 'weekly' && (
              <View style={styles.tabContentArea}>
                <View style={styles.rangeBanner}>
                  <MaterialCommunityIcons name="calendar-week" size={22} color="#18A165" />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.rangeBannerTitle}>Pekan 1 September 2026</Text>
                    <Text style={styles.rangeBannerDesc}>
                      Rentang tanggal 31 Agu s/d 05 Sep 2026 · Total 41 Sesi Pelajaran
                    </Text>
                  </View>
                </View>

                {/* DAY FILTER WITH DATE TAGS */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.dayFilterScroll}
                >
                  {weekDates.map((dayItem: any) => {
                    const isSelected = selectedDay === dayItem.day_id;
                    return (
                      <TouchableOpacity
                        key={dayItem.day_id}
                        activeOpacity={0.8}
                        onPress={() => setSelectedDay(dayItem.day_id)}
                        style={[styles.dayFilterBtnWithDate, isSelected && styles.dayFilterBtnActive]}
                      >
                        <Text style={[styles.dayFilterBtnText, isSelected && styles.dayFilterBtnTextActive]}>
                          {dayItem.day_name}
                        </Text>
                        <Text style={[styles.dayFilterBtnDateSub, isSelected && styles.dayFilterBtnDateSubActive]}>
                          {dayItem.date_short}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <View style={styles.searchBox}>
                  <MaterialCommunityIcons name="magnify" size={18} color="#94A3B8" />
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Cari pelajaran / guru..."
                    placeholderTextColor="#94A3B8"
                    style={styles.searchInput}
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                      <MaterialCommunityIcons name="close-circle" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>

                <View style={{ marginTop: 12, gap: 10 }}>
                  {filteredWeeklySchedules.length > 0 ? (
                    filteredWeeklySchedules.map((item, idx) => {
                      const curDayInfo = weekDates.find((w: any) => w.day_id === item.day_of_week);
                      return (
                        <View key={item.id || idx} style={styles.weeklyCard}>
                          <View style={styles.lessonDateRow}>
                            <View style={styles.lessonDateBadge}>
                              <MaterialCommunityIcons name="calendar" size={11} color="#065F46" />
                              <Text style={styles.lessonDateText}>
                                {curDayInfo?.date_formatted || curDayInfo?.day_name || 'Jadwal Mingguan'}
                              </Text>
                            </View>
                            <View style={styles.roomTag}>
                              <Text style={styles.roomTagText}>{item.room || 'Ruang Kelas'}</Text>
                            </View>
                          </View>

                          <View style={styles.itemTopRow}>
                            <View style={styles.timeTag}>
                              <MaterialCommunityIcons name="clock-outline" size={12} color="#18A165" />
                              <Text style={styles.timeTagText}>
                                {item.time_start} - {item.time_end}
                              </Text>
                            </View>
                          </View>

                          <Text style={styles.itemSubjectName}>
                            {item.subject?.name || 'Mata Pelajaran'}
                          </Text>

                          <View style={styles.teacherRow}>
                            <MaterialCommunityIcons name="account-tie" size={13} color="#18A165" />
                            <Text style={styles.teacherText}>
                              Guru: <Text style={styles.teacherBold}>{item.teacher?.name || 'Guru Pengampu'}</Text>
                            </Text>
                          </View>
                        </View>
                      );
                    })
                  ) : (
                    <View style={styles.emptyContainer}>
                      <MaterialCommunityIcons name="calendar-search" size={40} color="#94A3B8" />
                      <Text style={styles.emptyTitle}>Tidak Ditemukan Jadwal</Text>
                      <Text style={styles.emptyText}>Tidak ada jadwal pada hari ini yang cocok.</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* RANGE 3: BULANAN DENGAN NAVIGASI BULAN */}
            {activeTab === 'monthly' && (
              <View style={styles.tabContentArea}>
                <View style={styles.periodSelectorBar}>
                  <TouchableOpacity
                    onPress={() => setSelectedMonthIndex((prev) => (prev > 0 ? prev - 1 : 11))}
                    style={styles.periodNavBtn}
                  >
                    <MaterialCommunityIcons name="chevron-left" size={20} color="#0F172A" />
                  </TouchableOpacity>

                  <View style={{ alignItems: 'center' }}>
                    <Text style={styles.periodSelectorTitle}>
                      {MONTH_NAMES[selectedMonthIndex]} {selectedYear}
                    </Text>
                    <Text style={styles.periodSelectorSub}>
                      1 - {new Date(selectedYear, selectedMonthIndex + 1, 0).getDate()} {MONTH_NAMES[selectedMonthIndex]} {selectedYear}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => setSelectedMonthIndex((prev) => (prev < 11 ? prev + 1 : 0))}
                    style={styles.periodNavBtn}
                  >
                    <MaterialCommunityIcons name="chevron-right" size={20} color="#0F172A" />
                  </TouchableOpacity>
                </View>

                <View style={styles.rangeBanner}>
                  <MaterialCommunityIcons name="calendar-month-outline" size={22} color="#18A165" />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.rangeBannerTitle}>Alokasi Jadwal Bulan {MONTH_NAMES[selectedMonthIndex]}</Text>
                    <Text style={styles.rangeBannerDesc}>
                      Estimasi 4 pekan efektif pembelajaran (164 jam pelajaran)
                    </Text>
                  </View>
                </View>

                <View style={{ gap: 10 }}>
                  {subjectDistribution.map((item, idx) => (
                    <View key={idx} style={styles.distributionCard}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.distributionTitle}>{item.name}</Text>
                        <Text style={styles.distributionSub}>
                          {item.weekly} JP / minggu · Total {item.monthly} JP / bulan
                        </Text>
                      </View>
                      <View style={styles.jpBadge}>
                        <Text style={styles.jpBadgeText}>{item.monthly} JP</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* RANGE 4: SEMESTER DENGAN PILIHAN SEMESTER & RENTANG TANGGAL */}
            {activeTab === 'semester' && (
              <View style={styles.tabContentArea}>
                <View style={styles.semesterToggleRow}>
                  <TouchableOpacity
                    onPress={() => setSelectedSemester('ganjil')}
                    style={[
                      styles.semesterToggleBtn,
                      selectedSemester === 'ganjil' && styles.semesterToggleBtnActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.semesterToggleText,
                        selectedSemester === 'ganjil' && styles.semesterToggleTextActive,
                      ]}
                    >
                      Semester Ganjil
                    </Text>
                    <Text
                      style={[
                        styles.semesterToggleSub,
                        selectedSemester === 'ganjil' && styles.semesterToggleTextActive,
                      ]}
                    >
                      Juli - Des 2026
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setSelectedSemester('genap')}
                    style={[
                      styles.semesterToggleBtn,
                      selectedSemester === 'genap' && styles.semesterToggleBtnActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.semesterToggleText,
                        selectedSemester === 'genap' && styles.semesterToggleTextActive,
                      ]}
                    >
                      Semester Genap
                    </Text>
                    <Text
                      style={[
                        styles.semesterToggleSub,
                        selectedSemester === 'genap' && styles.semesterToggleTextActive,
                      ]}
                    >
                      Jan - Jun 2027
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.rangeBanner, { borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' }]}>
                  <MaterialCommunityIcons name="school" size={22} color="#2563EB" />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.rangeBannerTitle, { color: '#1E3A8A' }]}>
                      Beban Belajar {selectedSemester === 'ganjil' ? 'Semester Ganjil' : 'Semester Genap'}
                    </Text>
                    <Text style={styles.rangeBannerDesc}>
                      {selectedSemester === 'ganjil' ? '14 Juli 2026 - 19 Des 2026' : '05 Jan 2027 - 18 Jun 2027'} · 20 Pekan (820 JP)
                    </Text>
                  </View>
                </View>

                <View style={{ gap: 10 }}>
                  {subjectDistribution.map((item, idx) => (
                    <View key={idx} style={styles.distributionCard}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.distributionTitle}>{item.name}</Text>
                        <Text style={styles.distributionSub}>
                          Beban semester: {item.semester} Jam Pelajaran ({item.weekly} JP/pekan)
                        </Text>
                      </View>
                      <View style={[styles.jpBadge, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                        <Text style={[styles.jpBadgeText, { color: '#2563EB' }]}>{item.semester} JP</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* RANGE 5: TAHUN AJARAN DENGAN PILIHAN TAHUN & RENTANG TANGGAL */}
            {activeTab === 'academic_year' && (
              <View style={styles.tabContentArea}>
                <View style={styles.periodSelectorBar}>
                  <TouchableOpacity
                    onPress={() => setSelectedAcademicYear('2025/2026')}
                    style={[
                      styles.academicYearChip,
                      selectedAcademicYear === '2025/2026' && styles.academicYearChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.academicYearChipText,
                        selectedAcademicYear === '2025/2026' && styles.academicYearChipTextActive,
                      ]}
                    >
                      T.A. 2025/2026 (Arsip)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setSelectedAcademicYear('2026/2027')}
                    style={[
                      styles.academicYearChip,
                      selectedAcademicYear === '2026/2027' && styles.academicYearChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.academicYearChipText,
                        selectedAcademicYear === '2026/2027' && styles.academicYearChipTextActive,
                      ]}
                    >
                      T.A. 2026/2027 (Aktif)
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.rangeBanner, { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' }]}>
                  <MaterialCommunityIcons name="calendar-range" size={22} color="#D97706" />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.rangeBannerTitle, { color: '#92400E' }]}>
                      Tahun Ajaran {selectedAcademicYear}
                    </Text>
                    <Text style={styles.rangeBannerDesc}>
                      Rentang: Juli {selectedAcademicYear.split('/')[0]} s/d Juni {selectedAcademicYear.split('/')[1]} · Total 1.640 JP
                    </Text>
                  </View>
                </View>

                <View style={{ gap: 12 }}>
                  <View style={styles.semesterBlock}>
                    <View style={styles.semesterBlockHeader}>
                      <Text style={styles.semesterBlockTitle}>Semester Ganjil</Text>
                      <Text style={styles.semesterBlockBadge}>14 Jul - 19 Des {selectedAcademicYear.split('/')[0]}</Text>
                    </View>
                    <Text style={styles.semesterBlockText}>
                      20 Pekan Efektif Pembelajaran · Total 820 JP & Asesmen Sumatif
                    </Text>
                  </View>

                  <View style={styles.semesterBlock}>
                    <View style={styles.semesterBlockHeader}>
                      <Text style={styles.semesterBlockTitle}>Semester Genap</Text>
                      <Text style={styles.semesterBlockBadge}>05 Jan - 18 Jun {selectedAcademicYear.split('/')[1]}</Text>
                    </View>
                    <Text style={styles.semesterBlockText}>
                      20 Pekan Efektif Pembelajaran · Total 820 JP & Ujian Kenaikan Kelas
                    </Text>
                  </View>

                  <View style={styles.annualSummaryCard}>
                    <Text style={styles.annualSummaryTitle}>Struktur Kurikulum Terpadu:</Text>
                    <View style={styles.annualRow}>
                      <Text style={styles.annualLabel}>Total Pekan Efektif:</Text>
                      <Text style={styles.annualVal}>40 Pekan</Text>
                    </View>
                    <View style={styles.annualRow}>
                      <Text style={styles.annualLabel}>Total Hari Efektif Belajar:</Text>
                      <Text style={styles.annualVal}>240 Hari</Text>
                    </View>
                    <View style={styles.annualRow}>
                      <Text style={styles.annualLabel}>Total Alokasi Jam Belajar:</Text>
                      <Text style={[styles.annualVal, { color: '#18A165' }]}>1.640 JP</Text>
                    </View>
                  </View>
                </View>
              </View>
            )}
            </View>
          </View>
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
  studentContainerBlock: {
    marginBottom: 8,
  },
  childrenSection: {
    marginBottom: 14,
  },
  childrenScroll: {
    gap: 10,
    paddingRight: 10,
  },
  containerBlock: {
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  heroCardScroll: {
    gap: 12,
    paddingRight: 10,
  },
  childCardHeroSize: {
    width: SCREEN_WIDTH - 32,
    minHeight: 148,
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#18A165',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  childCardHeroSizeActive: {
    backgroundColor: '#18A165',
    borderColor: '#18A165',
  },
  childHeroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarBorderWrapHero: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: '#A7F3D0',
    overflow: 'hidden',
    backgroundColor: '#EBF8F2',
  },
  avatarBorderWrapHeroActive: {
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  childAvatarImgHero: {
    width: '100%',
    height: '100%',
  },
  childHeroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  childNameHero: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    flex: 1,
  },
  childClassHero: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#18A165',
    marginTop: 2,
  },
  childSubInfoHero: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  childSubInfoHeroActive: {
    color: 'rgba(255, 255, 255, 0.85)',
  },
  childStatusBadgeHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  childStatusBadgeHeroActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  childStatusBadgeTextHero: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
  childStatusBadgeTextHeroActive: {
    color: '#FFFFFF',
  },
  childCardBottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  childCardBottomBarActive: {
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  childInfoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
  },
  childInfoPillActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  childInfoPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  paginationDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#CBD5E1',
  },
  paginationDotActive: {
    width: 22,
    backgroundColor: '#18A165',
  },
  childCardLarge: {
    width: (SCREEN_WIDTH - 42) / 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#18A165',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  childCardLargeActive: {
    backgroundColor: '#18A165',
    borderColor: '#18A165',
  },
  childCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  avatarBorderWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#A7F3D0',
    overflow: 'hidden',
    backgroundColor: '#EBF8F2',
  },
  avatarBorderWrapActive: {
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  childAvatarImgLarge: {
    width: '100%',
    height: '100%',
  },
  childStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  childStatusBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  childStatusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
  childStatusBadgeTextActive: {
    color: '#FFFFFF',
  },
  childCardInfo: {
    marginTop: 2,
  },
  childNameTextLarge: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  childUnitTextLarge: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 2,
  },
  childChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  childChipActive: {
    backgroundColor: '#18A165',
    borderColor: '#18A165',
  },
  childAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EBF8F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  childAvatarActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  childNameText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    maxWidth: 140,
  },
  childUnitText: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  childTextActive: {
    color: '#FFFFFF',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kpiCard: {
    width: (SCREEN_WIDTH - 42) / 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#18A165',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  kpiHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  kpiIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiNumber: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
  },
  kpiTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
  kpiSubtitle: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },
  workspaceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  rangeScroll: {
    gap: 8,
    paddingBottom: 14,
  },
  rangeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  rangeBtnActive: {
    backgroundColor: '#18A165',
  },
  rangeBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#475569',
  },
  rangeBtnTextActive: {
    color: '#FFFFFF',
  },
  tabContentArea: {},
  dateNavigatorCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  dateNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navArrowBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateInfoCenter: {
    alignItems: 'center',
    flex: 1,
  },
  dateNavTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  dateBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  todayBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  todayBadgeText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#15803D',
  },
  historyBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  historyBadgeText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#B91C1C',
  },
  futureBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  futureBadgeText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#1D4ED8',
  },
  dateSubMeta: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  dateStripScroll: {
    gap: 8,
    paddingTop: 10,
    paddingBottom: 2,
  },
  dateStripItem: {
    width: 52,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  dateStripItemActive: {
    backgroundColor: '#18A165',
    borderColor: '#18A165',
  },
  dateStripDayText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  dateStripNumText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
  },
  dateStripMonthText: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#94A3B8',
  },
  dateStripTextActive: {
    color: '#FFFFFF',
  },
  todayDot: {
    position: 'absolute',
    bottom: 3,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#18A165',
  },
  resetTodayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 8,
    paddingVertical: 6,
    backgroundColor: '#EBF8F2',
    borderRadius: 10,
  },
  resetTodayBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#18A165',
  },
  timelineContainer: {
    position: 'relative',
    paddingLeft: 20,
  },
  timelineVerticalLine: {
    position: 'absolute',
    left: 8,
    top: 10,
    bottom: 20,
    width: 2,
    backgroundColor: 'rgba(24, 161, 101, 0.25)',
  },
  timelineNodeWrapper: {
    position: 'relative',
    marginBottom: 16,
  },
  milestoneNode: {
    position: 'absolute',
    left: -19,
    top: 12,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  scheduleItemCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  scheduleItemCardPast: {
    borderColor: '#FECACA',
    backgroundColor: '#FFFAFA',
  },
  scheduleItemCardOngoing: {
    borderColor: '#A7F3D0',
    backgroundColor: '#F0FDF4',
  },
  lessonDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  lessonDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EBF8F2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  lessonDateText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#065F46',
  },
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  timeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeTagText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#18A165',
    letterSpacing: 0.3,
  },
  pastBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  pastBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#DC2626',
    textTransform: 'uppercase',
  },
  ongoingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  ongoingBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#15803D',
    textTransform: 'uppercase',
  },
  upcomingBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  upcomingBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  itemSubjectName: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 19,
    marginBottom: 4,
  },
  teacherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 10,
  },
  teacherText: {
    fontSize: 11.5,
    color: '#475569',
  },
  teacherBold: {
    fontWeight: '800',
    color: '#0F172A',
  },
  attendanceBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  attendanceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  attendanceTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#64748B',
  },
  attendanceStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  attendancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  attHadir: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  attHadirText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#059669',
  },
  attIzin: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  attIzinText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#2563EB',
  },
  attSakit: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  attSakitText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#D97706',
  },
  attAlpa: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  attendancePillText: {
    fontSize: 10,
    fontWeight: '900',
  },
  attendanceTimeText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '700',
  },
  attNonePill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  attNoneText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
  },
  attendanceNotes: {
    fontSize: 10,
    color: '#64748B',
    fontStyle: 'italic',
    marginTop: 4,
  },
  dayFilterScroll: {
    gap: 8,
    paddingBottom: 12,
  },
  dayFilterBtnWithDate: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  dayFilterBtnActive: {
    backgroundColor: '#18A165',
  },
  dayFilterBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#475569',
  },
  dayFilterBtnTextActive: {
    color: '#FFFFFF',
  },
  dayFilterBtnDateSub: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#94A3B8',
    marginTop: 1,
  },
  dayFilterBtnDateSubActive: {
    color: '#DCFCE7',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'android' ? 4 : 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
    marginLeft: 6,
    padding: 0,
  },
  weeklyCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  roomTag: {
    backgroundColor: '#EBF8F2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roomTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#18A165',
  },
  periodSelectorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  periodNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodSelectorTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
  },
  periodSelectorSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  semesterToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  semesterToggleBtn: {
    flex: 1,
    padding: 10,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  semesterToggleBtnActive: {
    backgroundColor: '#18A165',
    borderColor: '#18A165',
  },
  semesterToggleText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
  },
  semesterToggleSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  semesterToggleTextActive: {
    color: '#FFFFFF',
  },
  academicYearChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  academicYearChipActive: {
    backgroundColor: '#18A165',
    borderColor: '#18A165',
  },
  academicYearChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
  },
  academicYearChipTextActive: {
    color: '#FFFFFF',
  },
  rangeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#EBF8F2',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    marginBottom: 14,
  },
  rangeBannerTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#065F46',
  },
  rangeBannerDesc: {
    fontSize: 11,
    color: '#475569',
    marginTop: 2,
  },
  distributionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  distributionTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  distributionSub: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
  },
  jpBadge: {
    backgroundColor: '#EBF8F2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  jpBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#18A165',
  },
  semesterBlock: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  semesterBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  semesterBlockTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  semesterBlockBadge: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#18A165',
    backgroundColor: '#EBF8F2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  semesterBlockText: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  annualSummaryCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  annualSummaryTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 8,
  },
  annualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  annualLabel: {
    fontSize: 11.5,
    color: '#64748B',
  },
  annualVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  emptyContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginVertical: 12,
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
});

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
import { getProfileImageUrl } from '../utils/profile';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Child = Record<string, any>;

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

  const [calendarRange, setCalendarRange] = useState<string>('week');
  const [calendarDate, setCalendarDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [calendarViewMode, setCalendarViewMode] = useState<'hari' | 'minggu' | 'bulan' | 'agenda'>('minggu');
  const [calendarData, setCalendarData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

  // 1. Load Children if Parent
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

  // 2. Load Academic Calendar Data from Database API
  const loadCalendar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await mobileApiService.getAcademicCalendar({
        range: calendarRange,
        date: calendarDate,
        child_id: selectedChildId,
      });
      const data = unwrapApiData<any>(res) || {};
      setCalendarData(data);
      if (res?.student || data?.student) {
        setStudentInfo(res?.student || data?.student);
      }
    } catch {
      setCalendarData(null);
    } finally {
      setLoading(false);
    }
  }, [calendarRange, calendarDate, selectedChildId]);

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

  const handleTodayDate = () => {
    setCalendarDate(new Date().toISOString().slice(0, 10));
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
      ) : studentInfo ? (
        <View style={[styles.containerBlock, styles.studentContainerBlock]}>
          <View style={styles.sectionHeaderRow}>
            <MaterialCommunityIcons name="account-school" size={18} color="#18A165" />
            <Text style={styles.sectionTitle}>Data Siswa & Unit Pendidikan</Text>
          </View>

          {(() => {
            const s = studentInfo;
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
                      {s.nis ? `NIS: ${s.nis} · ` : ''}Kalender Akademik Terpadu
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
            const userName = String(user?.name || user?.full_name || user?.nama_lengkap || 'Pengguna');
            const userRole = typeof user?.role === 'string' ? user.role : (Array.isArray(user?.roles) && user.roles[0] ? String(user.roles[0]) : 'Siswa');
            const avatarUri =
              getProfileImageUrl(user) ||
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
                      Portal Terpadu Mahad Abu Ja'far
                    </Text>
                    <Text style={[styles.childSubInfoHero, styles.childSubInfoHeroActive]}>
                      Kalender Akademik Terpadu
                    </Text>
                  </View>
                </View>

                <View style={[styles.childCardBottomBar, styles.childCardBottomBarActive]}>
                  <View style={[styles.childInfoPill, styles.childInfoPillActive]}>
                    <MaterialCommunityIcons name="school-outline" size={12} color="#FFFFFF" />
                    <Text style={[styles.childInfoPillText, styles.childTextActive]}>
                      Mahad Abu Ja'far
                    </Text>
                  </View>
                  <View style={[styles.childInfoPill, styles.childInfoPillActive]}>
                    <MaterialCommunityIcons name="badge-account-outline" size={12} color="#FFFFFF" />
                    <Text style={[styles.childInfoPillText, styles.childTextActive]}>
                      Akun Terverifikasi
                    </Text>
                  </View>
                </View>
              </View>
            );
          })()}
        </View>
      ) : null}

      {/* 2. TOP HEADER CARD: Kalender Akademik Unit */}
      <View style={styles.containerBlock}>
        <View style={styles.sectionHeaderRow}>
          <MaterialCommunityIcons name="calendar-month-outline" size={18} color="#18A165" />
          <Text style={styles.sectionTitle}>Kalender Akademik Unit</Text>
        </View>
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <View style={styles.headerIconBox}>
              <MaterialCommunityIcons name="calendar-month" size={22} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.headerTitle}>Kalender Akademik</Text>
              <Text numberOfLines={1} style={styles.headerSub}>
                {calendarData?.unit?.name || activeChild?.education_unit?.name || 'Yayasan Dar El-Iman'}
              </Text>
            </View>
            <View style={styles.unitPill}>
              <Text style={styles.unitPillText}>
                {calendarData?.academic_year?.name || '2025/2026'}
              </Text>
            </View>
          </View>

          {/* Date Navigation Row */}
          <View style={styles.navRow}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleTodayDate}
              style={styles.todayBtn}
            >
              <Text style={styles.todayBtnText}>Hari ini</Text>
            </TouchableOpacity>

            <View style={styles.navArrows}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handlePrevDate}
                style={styles.arrowBtn}
              >
                <MaterialCommunityIcons name="chevron-left" size={20} color="#1E293B" />
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleNextDate}
                style={styles.arrowBtn}
              >
                <MaterialCommunityIcons name="chevron-right" size={20} color="#1E293B" />
              </TouchableOpacity>
            </View>

            <Text numberOfLines={1} style={styles.viewDateTitle}>
              {calendarData?.view_title || calendarDate}
            </Text>
          </View>
        </View>
      </View>

      {/* 3. QUICK RANGE FILTERS: Dynamic from Backend */}
      <View style={styles.quickRangeSection}>
        <Text style={styles.quickRangeLabel}>Rentang Cepat:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRangeScroll}>
          {quickRanges.map((item: any) => {
            const isActive = calendarRange === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                activeOpacity={0.75}
                onPress={() => setCalendarRange(item.key)}
                style={[styles.quickRangeChip, isActive && styles.quickRangeChipActive]}
              >
                <Text style={[styles.quickRangeChipText, isActive && styles.quickRangeChipTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Dynamic Range Summary Banner from Backend */}
      {calendarData?.range_info?.formatted_range && (
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

      {/* 4. DATES STRIP WITH BACKEND HIGHLIGHTS */}
      {displayDates.length > 0 && (
        <View style={styles.weekDatesSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.weekDatesScroll}
          >
            {displayDates.map((wd: any) => {
              const isSelected = calendarDate === wd.date;
              const isHighlighted = Boolean(wd.is_highlighted || calendarData?.highlighted_dates?.includes(wd.date));
              return (
                <TouchableOpacity
                  key={wd.date}
                  activeOpacity={0.75}
                  onPress={() => setCalendarDate(wd.date)}
                  style={[
                    styles.weekDayCard,
                    isHighlighted && styles.weekDayCardHighlighted,
                    isSelected && styles.weekDayCardSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.weekDayName,
                      isHighlighted && styles.weekDayNameHighlighted,
                      isSelected && styles.weekDayNameSelected,
                    ]}
                  >
                    {wd.name}
                  </Text>
                  <View
                    style={[
                      styles.weekDayNumberBadge,
                      isHighlighted && !isSelected && styles.weekDayHighlightedBadge,
                      wd.is_today && !isSelected && styles.weekDayTodayBadge,
                      isSelected && styles.weekDaySelectedBadge,
                    ]}
                  >
                    <Text
                      style={[
                        styles.weekDayNumberText,
                        (wd.is_today || isHighlighted) && !isSelected && styles.weekDayNumberTextActive,
                        isSelected && styles.weekDayNumberTextSelected,
                      ]}
                    >
                      {wd.day}
                    </Text>
                  </View>
                  {wd.is_today ? (
                    <View style={styles.todayTinyBadge}>
                      <Text style={styles.todayTinyBadgeText}>HARI INI</Text>
                    </View>
                  ) : isHighlighted ? (
                    <View style={styles.highlightedTinyDot} />
                  ) : null}
                  {wd.has_events && (
                    <View style={styles.eventCountDot}>
                      <Text style={styles.eventCountDotText}>{wd.event_count || '•'}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* 5. TIMETABLE & EVENTS AGENDA LIST */}
      <View style={styles.eventsSection}>
        <View style={styles.eventsSectionHeader}>
          <Text style={styles.eventsSectionTitle}>
            Agenda Kegiatan ({events.length})
          </Text>
          <View style={styles.unitTag}>
            <MaterialCommunityIcons name="shield-check" size={12} color="#18A165" />
            <Text numberOfLines={1} style={styles.unitTagText}>
              {calendarData?.unit?.name || 'Unit Terpilih'}
            </Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color="#18A165" style={{ marginVertical: 30 }} />
        ) : events.length > 0 ? (
          events.map((evt: any, idx: number) => {
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
          })
        ) : (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="calendar-blank-outline" size={44} color="#94A3B8" />
            <Text style={styles.emptyText}>
              Tidak ada agenda kegiatan akademik pada rentang ini untuk unit {calendarData?.unit?.name || 'terpilih'}.
            </Text>
          </View>
        )}
      </View>

      {/* 6. KEGIATAN MENDATANG ROW (BOTTOM CARDS) */}
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
});

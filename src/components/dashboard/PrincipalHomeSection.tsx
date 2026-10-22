import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AppFeedbackModal from '../AppFeedbackModal';
import { mobileApiService, unwrapApiData } from '../../services/mobileApiService';
import PrincipalKpiDrilldownModal, { PrincipalKpiType } from './PrincipalKpiDrilldownModal';
import PrincipalTeacherMonitoringModal from './PrincipalTeacherMonitoringModal';
import PrincipalChatModal from './PrincipalChatModal';
import { SUPERVISI_GURU_ILLUSTRATION } from '../../utils/profile';

interface PrincipalHomeSectionProps {
  dashboard: Record<string, any>;
  navigation: any;
  user?: any;
  onOpenAllMenus?: () => void;
}

const FALLBACK_ANNOUNCEMENT_IMAGES = [
  'https://images.unsplash.com/photo-1577896851231-70ef18881754?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1609599006353-e629aaabfeae?w=800&auto=format&fit=crop&q=80',
];

function getAnnouncementImage(ann: any, index: number = 0): string {
  if (ann?.gambar_url && typeof ann.gambar_url === 'string' && ann.gambar_url.trim()) {
    return ann.gambar_url.trim();
  }
  if (ann?.image_url && typeof ann.image_url === 'string' && ann.image_url.trim()) {
    return ann.image_url.trim();
  }
  if (ann?.foto && typeof ann.foto === 'string' && ann.foto.trim()) {
    return ann.foto.trim();
  }
  return FALLBACK_ANNOUNCEMENT_IMAGES[index % FALLBACK_ANNOUNCEMENT_IMAGES.length];
}

function getAnnouncementDate(ann: any): string {
  if (ann?.tgl && typeof ann.tgl === 'string') return ann.tgl;
  if (ann?.created_at) {
    try {
      const d = new Date(ann.created_at);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
      }
    } catch {
      // fallback
    }
  }
  return 'Hari Ini';
}

type MenuCategoryTab = 'semua' | 'manajemen' | 'presensi' | 'akademik' | 'keagamaan';
type AttendanceDateFilter = 'today' | 'yesterday' | 'this_week' | 'custom';
type AttendanceRoleFilter = 'all' | 'guru' | 'tendik';
type AttendanceStatusFilter = 'all' | 'hadir' | 'izin_dinas' | 'sakit' | 'alfa';

// Helper pemformat tanggal Indonesia dinamis tanpa hardcode
function getIndonesianDateString(d: Date, withDayName: boolean = true): string {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  const dayName = days[d.getDay()];
  const dateNum = d.getDate();
  const monthName = months[d.getMonth()];
  const year = d.getFullYear();
  return withDayName ? `${dayName}, ${dateNum} ${monthName} ${year}` : `${dateNum} ${monthName} ${year}`;
}

function getIndonesianShortDate(d: Date): string {
  const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${d.getDate()} ${shortMonths[d.getMonth()]}`;
}

function getIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function PrincipalHomeSection({
  dashboard,
  navigation,
  user,
  onOpenAllMenus,
}: PrincipalHomeSectionProps) {
  const [activeMenuTab, setActiveMenuTab] = useState<MenuCategoryTab>('semua');
  const [empDateFilter, setEmpDateFilter] = useState<AttendanceDateFilter>('today');
  const [selectedCustomDate, setSelectedCustomDate] = useState<string>(() => getIsoDate(new Date()));
  const [showDatePickerModal, setShowDatePickerModal] = useState<boolean>(false);
  const [empRoleFilter, setEmpRoleFilter] = useState<AttendanceRoleFilter>('all');
  const [empAttFilter, setEmpAttFilter] = useState<AttendanceStatusFilter>('all');
  const [showAllEmpAtt, setShowAllEmpAtt] = useState(false);
  const [empSearchQuery, setEmpSearchQuery] = useState<string>('');
  const [debouncedEmpSearch, setDebouncedEmpSearch] = useState<string>('');
  const [civitasTab, setCivitasTab] = useState<'online' | 'logs'>('online');
  const [onlineFilter, setOnlineFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [showAllOnline, setShowAllOnline] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<any | null>(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedEmpSearch(empSearchQuery.trim().toLowerCase());
    }, 300);
    return () => clearTimeout(handler);
  }, [empSearchQuery]);

  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type?: 'info' | 'warning' | 'error' | 'success';
    title: string;
    message: string;
  } | null>(null);

  const [empDashboardStats, setEmpDashboardStats] = useState<any>(null);
  const [studentDashboardStats, setStudentDashboardStats] = useState<any>(null);

  // Sinkronisasi Sumber Data Statistik: GET /api/employees/dashboard & GET /api/students/dashboard
  useEffect(() => {
    let isMounted = true;
    const fetchAuxDashboards = async () => {
      try {
        const targetUnitId =
          dashboard?.school_info?.id ||
          dashboard?.data?.school_info?.id ||
          dashboard?.data?.context?.unit?.id ||
          dashboard?.context?.unit?.id;

        const [empRes, studentRes] = await Promise.allSettled([
          mobileApiService.getEmployeeDashboard({
            unit_id: targetUnitId,
            exclude_restricted_roles: 1,
          }),
          mobileApiService.getStudentDashboard({
            unit_id: targetUnitId,
          }),
        ]);
        if (!isMounted) return;
        if (empRes.status === 'fulfilled' && empRes.value) {
          const empData = unwrapApiData(empRes.value);
          setEmpDashboardStats(empData);
        }
        if (studentRes.status === 'fulfilled' && studentRes.value) {
          const studentData = unwrapApiData(studentRes.value);
          setStudentDashboardStats(studentData);
        }
      } catch {
        // Fallback to principal dashboard payload
      }
    };
    fetchAuxDashboards();
    return () => {
      isMounted = false;
    };
  }, [dashboard]);

  const data = dashboard || {};
  const schoolInfo = data?.school_info || data?.context?.unit || {};
  const kpis = data?.kpis || {};

  // Metrik Utama Unit Sekolah (Selaras 100% dengan Web Dashboard - KepalaSekolahDashboardPage.jsx)
  const totalSiswa = kpis?.total_siswa?.total ?? data?.total_siswa ?? dashboard?.total_students ?? studentDashboardStats?.total_siswa ?? studentDashboardStats?.total ?? 0;
  const totalGuru = kpis?.total_guru?.total ?? data?.total_guru ?? dashboard?.total_teachers ?? empDashboardStats?.total_guru ?? 0;
  const totalTendik = kpis?.total_tendik?.total ?? (kpis?.total_pegawai?.total ? Math.max(0, (kpis.total_pegawai.total || 0) - (kpis.total_guru?.total || 0)) : (empDashboardStats?.total_tendik ?? Math.max(0, (data?.total_pegawai || 0) - totalGuru)));
  const totalPegawai = kpis?.total_pegawai?.total ?? (totalGuru + totalTendik);
  const totalRombel = kpis?.total_rombel?.total ?? kpis?.total_kelas?.total ?? data?.total_rombel ?? studentDashboardStats?.total_kelas ?? 0;

  const [activeKpiModal, setActiveKpiModal] = useState<PrincipalKpiType | null>(null);
  const [isTeacherMonitoringModalOpen, setIsTeacherMonitoringModalOpen] = useState(false);

  // Tanggal Hari Ini & Objek Tanggal Dinamis
  const { todayObj, yesterdayObj, startOfWeekObj, quickDateOptions } = useMemo(() => {
    const serverDateStr = data?.attendance_meta?.date;
    const base = serverDateStr ? new Date(serverDateStr) : new Date();
    const today = !isNaN(base.getTime()) ? base : new Date();

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - 6);

    const options = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const iso = getIsoDate(d);
      options.push({
        id: iso,
        label: getIndonesianDateString(d, true),
        tag: i === 0 ? 'Hari Ini (Live)' : i === 1 ? 'Kemarin' : 'Arsip',
        preset: i === 0 ? 'today' : i === 1 ? 'yesterday' : 'custom',
      });
    }

    return {
      todayObj: today,
      yesterdayObj: yesterday,
      startOfWeekObj: startOfWeek,
      quickDateOptions: options,
    };
  }, [data?.attendance_meta?.date]);

  const todayFormatted = useMemo(() => {
    return getIndonesianDateString(todayObj, true);
  }, [todayObj]);

  const yesterdayFormatted = useMemo(() => {
    return `Kemarin (${getIndonesianDateString(yesterdayObj, true)})`;
  }, [yesterdayObj]);

  const thisWeekFormatted = useMemo(() => {
    return `Pekan Berjalan (${getIndonesianShortDate(startOfWeekObj)} - ${getIndonesianShortDate(todayObj)})`;
  }, [startOfWeekObj, todayObj]);

  const todayShortLabel = useMemo(() => {
    return getIndonesianShortDate(todayObj);
  }, [todayObj]);

  const yesterdayShortLabel = useMemo(() => {
    return getIndonesianShortDate(yesterdayObj);
  }, [yesterdayObj]);

  // 1. Pengurus Yayasan
  const pengurusYayasanList = useMemo(() => {
    return Array.isArray(data?.pengurus_yayasan) ? data.pengurus_yayasan : [];
  }, [data]);

  const [attendanceCache, setAttendanceCache] = useState<Record<string, any>>({});
  const [loadingAttendance, setLoadingAttendance] = useState<boolean>(false);

  const yayasanName = useMemo(() => {
    return (
      data?.context?.yayasan?.nama ||
      data?.context?.yayasan?.name ||
      schoolInfo?.yayasan_nama ||
      schoolInfo?.yayasan_name ||
      schoolInfo?.nama ||
      'Yayasan'
    );
  }, [data, schoolInfo]);

  const currentCalYear = useMemo(() => new Date().getFullYear(), []);
  const defaultTA = useMemo(() => {
    const month = new Date().getMonth();
    return month >= 6 ? `${currentCalYear}/${currentCalYear + 1}` : `${currentCalYear - 1}/${currentCalYear}`;
  }, [currentCalYear]);

  const tahunAjaran = useMemo(() => {
    return (
      data?.context?.tahun_ajaran?.nama ||
      data?.context?.tahun_ajaran?.name ||
      schoolInfo?.tahun_ajaran ||
      defaultTA
    );
  }, [data, schoolInfo, defaultTA]);

  const defaultPeriode = useMemo(() => {
    const basePeriod = Math.floor(currentCalYear / 5) * 5;
    return `${basePeriod} - ${basePeriod + 5}`;
  }, [currentCalYear]);

  const cleanPeriode = useMemo(() => {
    const raw =
      pengurusYayasanList[0]?.periode ||
      data?.context?.yayasan?.periode ||
      defaultPeriode;
    return String(raw).replace(/^periode\s*/i, '').trim() || defaultPeriode;
  }, [pengurusYayasanList, data, defaultPeriode]);

  // Label Tanggal Aktif Terpilih
  const currentDateDisplayLabel = useMemo(() => {
    if (empDateFilter === 'today') return todayFormatted;
    if (empDateFilter === 'yesterday') return yesterdayFormatted;
    if (empDateFilter === 'this_week') return thisWeekFormatted;
    const found = quickDateOptions.find((q) => q.id === selectedCustomDate);
    return found ? found.label : `Tanggal: ${selectedCustomDate}`;
  }, [empDateFilter, selectedCustomDate, todayFormatted, yesterdayFormatted, thisWeekFormatted, quickDateOptions]);

  // Fetch presensi pegawai secara live & dinamis dari database saat filter tanggal berubah
  useEffect(() => {
    if (empDateFilter === 'today') return;
    const key =
      empDateFilter === 'this_week'
        ? 'this_week'
        : empDateFilter === 'yesterday'
        ? getIsoDate(yesterdayObj)
        : selectedCustomDate;

    if (attendanceCache[key]) return;

    let isMounted = true;
    setLoadingAttendance(true);

    const params: Record<string, any> = {};
    if (empDateFilter === 'this_week') {
      params.period = 'this_week';
      params.date_from = getIsoDate(startOfWeekObj);
      params.date_to = getIsoDate(todayObj);
    } else if (empDateFilter === 'yesterday') {
      params.date = getIsoDate(yesterdayObj);
    } else {
      params.date = selectedCustomDate;
    }

    mobileApiService
      .getPrincipalDashboard(params)
      .then((res: any) => {
        if (!isMounted) return;
        const payload = unwrapApiData(res);
        if (payload?.employee_attendance) {
          setAttendanceCache((prev) => ({
            ...prev,
            [key]: payload.employee_attendance,
          }));
        }
      })
      .catch((err: any) => {
        console.log('[PrincipalHomeSection] Gagal fetch absensi pegawai:', err?.message || err);
      })
      .finally(() => {
        if (isMounted) setLoadingAttendance(false);
      });

    return () => {
      isMounted = false;
    };
  }, [empDateFilter, selectedCustomDate, todayObj, yesterdayObj, startOfWeekObj, attendanceCache]);

  // 1b. Data Presensi Berdasarkan Tanggal (Hari Ini / Kemarin / Pekan Ini / Custom)
  const activeDateData = useMemo(() => {
    const key =
      empDateFilter === 'today'
        ? getIsoDate(todayObj)
        : empDateFilter === 'this_week'
        ? 'this_week'
        : empDateFilter === 'yesterday'
        ? getIsoDate(yesterdayObj)
        : selectedCustomDate;

    const sourceAtt =
      empDateFilter === 'today'
        ? (data?.employee_attendance || attendanceCache[key] || {})
        : (attendanceCache[key] || {});

    const rawList = Array.isArray(sourceAtt?.list) ? sourceAtt.list : [];
    const rawSummary = sourceAtt?.summary || null;

    let baseList = (Array.isArray(rawList) ? rawList : []).filter((item: any) => {
      const jab = String(item.jabatan || item.position || item.extra || '').toLowerCase();
      const role = String(item.role_type || item.role || '').toLowerCase();
      const nama = String(item.nama || item.name || '').toLowerCase();
      const isYayasan =
        jab.includes('yayasan') ||
        jab.includes('pembina') ||
        jab.includes('pengawas') ||
        role.includes('yayasan') ||
        nama.includes('yayasan');
      return !isYayasan;
    });

    // Fallback HANYA jika list presensi kosong (misal belum ada data dari API)
    if (baseList.length === 0 && !loadingAttendance) {
      const teachers = (Array.isArray(data?.teachers_list) ? data.teachers_list : []).filter((t: any) => {
        const extra = String(t.extra || '').toLowerCase();
        return !extra.includes('yayasan') && !extra.includes('pembina') && !extra.includes('pengawas');
      });
      const staff = (Array.isArray(data?.staff_list) ? data.staff_list : []).filter((s: any) => {
        const extra = String(s.extra || '').toLowerCase();
        return !extra.includes('yayasan') && !extra.includes('pembina') && !extra.includes('pengawas');
      });
      baseList = [
        ...teachers.map((t: any) => ({
          id: t.id || `tch-${t.name}`,
          nama: t.name || 'Guru',
          nip: t.id_num || 'NUPTK. —',
          role_type: 'Guru',
          jabatan: t.extra || 'Tenaga Pendidik',
          status: 'Alfa',
          waktu: '—',
          keterangan: 'Belum ada catatan presensi',
          lokasi: '—',
          no_hp: t.no_hp || null,
          avatar_url: t.avatar_url || null,
        })),
        ...staff.map((s: any) => ({
          id: s.id || `stf-${s.name}`,
          nama: s.name || 'Staf Tendik',
          nip: s.id_num || 'NIK. —',
          role_type: 'Tendik',
          jabatan: s.extra || 'Tenaga Kependidikan',
          status: 'Alfa',
          waktu: '—',
          keterangan: 'Belum ada catatan presensi',
          lokasi: '—',
          no_hp: s.no_hp || null,
          avatar_url: s.avatar_url || null,
        })),
      ];
    }

    const guruCount = baseList.filter((x: any) => x.role_type === 'Guru').length;
    const tendikCount = baseList.filter((x: any) => x.role_type === 'Tendik').length;

    return {
      list: baseList,
      summary: rawSummary,
      counts: {
        total: baseList.length,
        guruTotal: guruCount,
        tendikTotal: tendikCount,
      },
    };
  }, [
    data,
    empDateFilter,
    selectedCustomDate,
    todayObj,
    yesterdayObj,
    attendanceCache,
    loadingAttendance,
  ]);

  // Filter berdasarkan Role (Semua, Guru, Tendik)
  const activeRoleData = useMemo(() => {
    const list = activeDateData.list || [];
    const filteredByRole =
      empRoleFilter === 'all'
        ? list
        : empRoleFilter === 'guru'
        ? list.filter((x: any) => x.role_type === 'Guru')
        : list.filter((x: any) => x.role_type === 'Tendik');

    const total = filteredByRole.length;
    const hadir = filteredByRole.filter((x: any) => x.status === 'Hadir').length;
    const izin = filteredByRole.filter((x: any) => x.status === 'Izin Dinas Luar').length;
    const sakit = filteredByRole.filter((x: any) => x.status === 'Sakit').length;
    const alfa = filteredByRole.filter((x: any) => x.status === 'Alfa').length;
    const persentase = total > 0 ? Math.round((hadir / total) * 100) : 0;

    return {
      list: filteredByRole,
      summary: {
        total,
        hadir,
        izin_dinas: izin,
        sakit,
        alfa,
        persentase_hadir: persentase,
      },
    };
  }, [activeDateData, empRoleFilter]);

  // Filter berdasarkan Status & Pencarian Nama/NIP
  const filteredEmpAttendanceList = useMemo(() => {
    let list = activeRoleData.list || [];

    if (empAttFilter === 'hadir') {
      list = list.filter((e: any) => e.status === 'Hadir');
    } else if (empAttFilter === 'izin_dinas') {
      list = list.filter((e: any) => e.status === 'Izin Dinas Luar');
    } else if (empAttFilter === 'sakit') {
      list = list.filter((e: any) => e.status === 'Sakit');
    } else if (empAttFilter === 'alfa') {
      list = list.filter((e: any) => e.status === 'Alfa');
    }

    if (debouncedEmpSearch) {
      list = list.filter(
        (e: any) =>
          String(e.nama || '').toLowerCase().includes(debouncedEmpSearch) ||
          String(e.nip || '').toLowerCase().includes(debouncedEmpSearch) ||
          String(e.jabatan || '').toLowerCase().includes(debouncedEmpSearch)
      );
    }

    return list;
  }, [activeRoleData, empAttFilter, debouncedEmpSearch]);

  const displayedEmpAttendanceList = useMemo(() => {
    return showAllEmpAtt ? filteredEmpAttendanceList : filteredEmpAttendanceList.slice(0, 5);
  }, [filteredEmpAttendanceList, showAllEmpAtt]);

  // 2. Agenda / Jadwal Hari Ini
  const todayAgendaList = useMemo(() => {
    if (Array.isArray(data?.agendas) && data.agendas.length > 0) return data.agendas;
    if (Array.isArray(data?.today_agendas) && data.today_agendas.length > 0) return data.today_agendas;
    if (Array.isArray(data?.events) && data.events.length > 0) return data.events;
    if (Array.isArray(data?.academic_calendar) && data.academic_calendar.length > 0) return data.academic_calendar;
    return [];
  }, [data]);

  // 3. Pengumuman & Berita Sekolah
  const announcementList = useMemo(() => {
    if (Array.isArray(data?.tables?.announcements) && data.tables.announcements.length > 0) {
      return data.tables.announcements;
    }
    if (Array.isArray(data?.announcements) && data.announcements.length > 0) {
      return data.announcements;
    }
    return [];
  }, [data]);

  // 4. Online Users & Logs
  const onlineUsers = useMemo(() => {
    return Array.isArray(data?.online_users) ? data.online_users : [];
  }, [data]);

  const filteredOnlineUsers = useMemo(() => {
    if (onlineFilter === 'online') return onlineUsers.filter((u: any) => u.is_online);
    if (onlineFilter === 'offline') return onlineUsers.filter((u: any) => !u.is_online);
    return onlineUsers;
  }, [onlineUsers, onlineFilter]);

  const onlineLogs = useMemo(() => {
    return Array.isArray(data?.online_logs) ? data.online_logs : [];
  }, [data]);

  const [activeChatUser, setActiveChatUser] = useState<any>(null);

  const handleOpenInternalChat = (targetUser?: any) => {
    if (!targetUser) return;
    const targetName = targetUser.nama || targetUser.name || 'Pengguna';
    const targetUserId = targetUser.user_id || targetUser.id || targetUser.employee_id;
    try {
      if (navigation?.navigate && targetUserId) {
        navigation.navigate('Chat Guru', {
          teacherId: String(targetUserId),
          recipientId: String(targetUserId),
          targetUser: {
            ...targetUser,
            user_id: targetUserId,
            name: targetName,
          },
          name: targetName,
        });
        return;
      }
    } catch {
      // fallback
    }
    setActiveChatUser(targetUser);
  };

  const handleOpenWhatsApp = (phone?: string, name?: string) => {
    if (!phone) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Nomor Tidak Tersedia',
        message: `Nomor kontak WhatsApp untuk ${name || 'pengguna ini'} belum tercatat di sistem.`,
      });
      return;
    }
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const intlPhone = cleanPhone.startsWith('0') ? '62' + cleanPhone.substring(1) : cleanPhone;
    const url = `whatsapp://send?phone=${intlPhone}`;
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          Linking.openURL(`https://wa.me/${intlPhone}`);
        }
      })
      .catch(() => {
        Linking.openURL(`https://wa.me/${intlPhone}`);
      });
  };

  const handleCallPhone = (phone?: string, name?: string) => {
    if (!phone) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Nomor Tidak Tersedia',
        message: `Nomor telepon untuk ${name || 'pengguna ini'} belum tercatat di sistem.`,
      });
      return;
    }
    Linking.openURL(`tel:${phone.replace(/[^0-9+]/g, '')}`);
  };

  const safeNavigate = (screenName: string, params?: any) => {
    try {
      navigation.navigate(screenName, params);
    } catch {
      onOpenAllMenus?.();
    }
  };

  // Reusable Quick Button Component (Style UI/UX Tata Usaha)
  const QBtn = ({
    icon,
    iconBg,
    label,
    onPress,
    image,
    badge,
  }: {
    icon: string;
    iconBg: string;
    label: string;
    onPress: () => void;
    image?: any;
    badge?: string;
  }) => (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={styles.qBtnTile}>
      <View style={[styles.qBtnBox, { backgroundColor: iconBg, overflow: 'hidden' }]}>
        {image ? (
          <Image
            source={typeof image === 'string' ? { uri: image } : image}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        ) : (
          <MaterialCommunityIcons name={icon as never} size={20} color="#FFFFFF" />
        )}
        {badge ? (
          <View style={styles.qBtnMiniBadge}>
            <Text style={styles.qBtnMiniBadgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.qBtnLabel} numberOfLines={2}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* ── 1. CARD: METRIK UTAMA UNIT SEKOLAH (SELARAS DENGAN WEB DASHBOARD) ── */}
      <View style={styles.cardContainer}>
        {/* Header Baris: Judul Utama, Subjudul, & Pintasan */}
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleWithIcon}>
            <View style={[styles.sectionIconBadgeRound, { backgroundColor: '#DEF7EC' }]}>
              <MaterialCommunityIcons name="chart-box-outline" size={17} color="#059669" />
            </View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={styles.sectionTitleBold}>Metrik Utama Unit Sekolah</Text>
              <Text numberOfLines={1} style={styles.sectionSubtitleText}>
                Jumlah siswa, guru, pegawai, dan rombel aktif unit
              </Text>
            </View>
          </View>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => safeNavigate('Data', { initialResource: 'students' })}
            style={styles.kpiHeaderLinkBtn}
          >
            <Text style={styles.kpiHeaderLinkText}>Data Siswa</Text>
            <MaterialCommunityIcons name="chevron-right" size={13} color="#059669" />
          </TouchableOpacity>
        </View>

        {/* 2x2 Grid Kartu Eksekutif Unit (Kompak & Rapi) */}
        <View style={styles.kpiGrid}>
          {/* 1. Siswa Terdaftar / Siswa Aktif Unit */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setActiveKpiModal('total_siswa')}
            style={[styles.kpiCard, { borderColor: '#A7F3D0' }]}
            accessibilityLabel={`Total Siswa Aktif Unit: ${totalSiswa} siswa`}
          >
            <LinearGradient colors={['#ECFDF5', '#F0FDF4']} style={styles.kpiGradient}>
              <View style={styles.kpiTopRow}>
                <View style={[styles.kpiIconWrap, { backgroundColor: '#059669' }]}>
                  <MaterialCommunityIcons name="school" size={14} color="#FFFFFF" />
                </View>
                <View style={styles.kpiBadgePillEmerald}>
                  <Text style={styles.kpiBadgePillEmeraldText}>Siswa Unit</Text>
                </View>
              </View>
              <Text style={[styles.kpiCount, { color: '#047857' }]}>{totalSiswa}</Text>
              <Text numberOfLines={1} style={styles.kpiLabel}>Total Siswa Aktif</Text>
              <Text numberOfLines={1} style={styles.kpiSub}>Terdaftar aktif di unit sekolah</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* 2. Guru Pengajar Aktif */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setActiveKpiModal('total_guru')}
            style={[styles.kpiCard, { borderColor: '#BAE6FD' }]}
            accessibilityLabel={`Total Guru Pengajar: ${totalGuru} guru`}
          >
            <LinearGradient colors={['#F0F9FF', '#E0F2FE']} style={styles.kpiGradient}>
              <View style={styles.kpiTopRow}>
                <View style={[styles.kpiIconWrap, { backgroundColor: '#0284C7' }]}>
                  <MaterialCommunityIcons name="account-tie" size={14} color="#FFFFFF" />
                </View>
                <View style={styles.kpiBadgePillBlue}>
                  <Text style={styles.kpiBadgePillBlueText}>Guru</Text>
                </View>
              </View>
              <Text style={[styles.kpiCount, { color: '#0369A1' }]}>{totalGuru}</Text>
              <Text numberOfLines={1} style={styles.kpiLabel}>Total Guru Pengajar</Text>
              <Text numberOfLines={1} style={styles.kpiSub}>Tenaga pendidik aktif</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* 3. Pegawai & Tendik */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setActiveKpiModal('total_tendik')}
            style={[styles.kpiCard, { borderColor: '#DDD6FE' }]}
            accessibilityLabel={`Total Tendik: ${totalTendik} staf (Total SDM: ${totalPegawai})`}
          >
            <LinearGradient colors={['#F5F3FF', '#EDE9FE']} style={styles.kpiGradient}>
              <View style={styles.kpiTopRow}>
                <View style={[styles.kpiIconWrap, { backgroundColor: '#7C3AED' }]}>
                  <MaterialCommunityIcons name="account-check" size={14} color="#FFFFFF" />
                </View>
                <View style={styles.kpiBadgePillPurple}>
                  <Text style={styles.kpiBadgePillPurpleText}>Tendik</Text>
                </View>
              </View>
              <Text style={[styles.kpiCount, { color: '#6D28D9' }]}>{totalTendik}</Text>
              <Text numberOfLines={1} style={styles.kpiLabel}>Total Tendik / Staf</Text>
              <Text numberOfLines={1} style={styles.kpiSub}>Administrasi & teknis (Total SDM: {totalPegawai})</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* 4. Rombel Belajar */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setActiveKpiModal('total_kelas')}
            style={[styles.kpiCard, { borderColor: '#FDE68A' }]}
            accessibilityLabel={`Total Rombel: ${totalRombel} rombel`}
          >
            <LinearGradient colors={['#FFFBEB', '#FEF3C7']} style={styles.kpiGradient}>
              <View style={styles.kpiTopRow}>
                <View style={[styles.kpiIconWrap, { backgroundColor: '#D97706' }]}>
                  <MaterialCommunityIcons name="door-open" size={14} color="#FFFFFF" />
                </View>
                <View style={styles.kpiBadgePillAmber}>
                  <Text style={styles.kpiBadgePillAmberText}>Rombel</Text>
                </View>
              </View>
              <Text style={[styles.kpiCount, { color: '#B45309' }]}>{totalRombel}</Text>
              <Text numberOfLines={1} style={styles.kpiLabel}>Total Rombel / Kelas</Text>
              <Text numberOfLines={1} style={styles.kpiSub}>Rombongan belajar aktif</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>


      {/* ── 2. BUTTON UTAMA: DASHBOARD KEPALA SEKOLAH (PINTASAN KE LAYAR EKSEKUTIF PENUH) ── */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => navigation.navigate('PrincipalDashboard')}
        style={styles.heroBannerBtn}
      >
        <LinearGradient
          colors={['#ECFDF5', '#D1FAE5']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroBannerGradient}
        >
          <View style={styles.heroBannerIconWrap}>
            <MaterialCommunityIcons name="view-dashboard" size={24} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.heroBannerTitleRow}>
              <Text style={styles.heroBannerTitle}>Dashboard Kepala Sekolah</Text>
              <View style={styles.heroBannerBadge}>
                <Text style={styles.heroBannerBadgeText}>EKSEKUTIF</Text>
              </View>
            </View>
            <Text style={styles.heroBannerSubtitle}>
              Buka KPI lengkap, tab kesiswaan, presensi & rekap prestasi siswa
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color="#059669" />
        </LinearGradient>
      </TouchableOpacity>

      {/* ── 3. MENU UTAMA KEPALA SEKOLAH (DIGABUNG DALAM 1 CARD BER-TAB) ── */}
      <View style={styles.sectionCard}>
        {/* Header Menu Utama */}
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIconBadge, { backgroundColor: '#DEF7EC' }]}>
            <MaterialCommunityIcons name="apps" size={16} color="#059669" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Layanan & Operasional Sekolah</Text>
            <Text style={styles.sectionSubtitle}>Pilih tab kategori untuk mengakses menu spesifik</Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={onOpenAllMenus}
            style={styles.allMenusPillBtn}
          >
            <Text style={styles.allMenusPillText}>Semua</Text>
            <MaterialCommunityIcons name="chevron-right" size={12} color="#059669" />
          </TouchableOpacity>
        </View>

        {/* Tab Switcher Kategori Menu */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.menuTabScroll}
        >
          {[
            { id: 'semua', label: 'Semua Menu', icon: 'view-grid-outline' },
            { id: 'manajemen', label: 'Manajemen', icon: 'chart-box-outline' },
            { id: 'presensi', label: 'Presensi', icon: 'clock-check-outline' },
            { id: 'akademik', label: 'Akademik', icon: 'school-outline' },
            { id: 'keagamaan', label: 'Keagamaan', icon: 'book-open-page-variant' },
          ].map((tab) => {
            const isActive = activeMenuTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                activeOpacity={0.75}
                onPress={() => setActiveMenuTab(tab.id as MenuCategoryTab)}
                style={[styles.menuTabChip, isActive && styles.menuTabChipActive]}
              >
                <MaterialCommunityIcons
                  name={tab.icon as any}
                  size={13}
                  color={isActive ? '#FFFFFF' : '#64748B'}
                />
                <Text style={[styles.menuTabChipText, isActive && styles.menuTabChipTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Grid Button Sesuai Tab Terpilih */}
        <View style={styles.qBtnGrid}>
          {(activeMenuTab === 'semua' || activeMenuTab === 'manajemen') && (
            <>
              <QBtn icon="database-outline"       iconBg="#059669" label="Data Master"     onPress={() => safeNavigate('Data')} />
              <QBtn icon="human-male-board"       iconBg="#0F766E" label="Supervisi Guru"  onPress={() => setIsTeacherMonitoringModalOpen(true)} />
              <QBtn icon="account-switch"         iconBg="#7C3AED" label="Kelola Alumni & Mutasi"  onPress={() => safeNavigate('MutasiSiswa')} />
              <QBtn icon="google-classroom"       iconBg="#D97706" label="Pantau Kelas"  onPress={() => safeNavigate('PantauKelas')} />
            </>
          )}

          {(activeMenuTab === 'semua' || activeMenuTab === 'presensi') && (
            <>
              <QBtn icon="account-check-outline" iconBg="#059669" label="Presensi Guru"  onPress={() => safeNavigate('RekapPresensiGuru', { defaultSubject: 'pegawai', lockedSubject: 'pegawai' })} />
              <QBtn icon="account-group"         iconBg="#0284C7" label="Presensi Siswa" onPress={() => safeNavigate('RekapPresensiSiswa', { defaultSubject: 'siswa', lockedSubject: 'siswa' })} />
              <QBtn icon="calendar-check-outline" iconBg="#10B981" label="Presensi Mandiri" onPress={() => safeNavigate('PresensiMandiriStaff')} />
              <QBtn icon="calendar-check-outline" iconBg="#059669" label="Presensi KBM"  onPress={() => safeNavigate('PresensiKbmPengganti')} />
              <QBtn icon="file-document-edit"    iconBg="#D97706" label="Izin & Cuti"    onPress={() => safeNavigate('Perizinan', { tab: 'permissions' })} />
              <QBtn icon="door-open"             iconBg="#E11D48" label="Izin Asrama"    onPress={() => safeNavigate('Perizinan', { tab: 'boarding' })} />
            </>
          )}

          {(activeMenuTab === 'semua' || activeMenuTab === 'akademik') && (
            <>
              <QBtn icon="clock-time-four"  iconBg="#7C3AED" label="Jadwal Pelajaran" onPress={() => safeNavigate('Jadwal')} />
              <QBtn icon="calendar-month"   iconBg="#0284C7" label="Kalender Akademik" onPress={() => safeNavigate('Kalender')} />
              <QBtn icon="book-multiple"    iconBg="#0D9488" label="Materi Belajar" onPress={() => safeNavigate('Materi')} />
              <QBtn icon="clipboard-text"   iconBg="#F59E0B" label="Tugas Siswa"    onPress={() => safeNavigate('Tugas')} />
              <QBtn icon="chart-box"        iconBg="#10B981" label="Penilaian & Rapor" onPress={() => safeNavigate('Nilai')} />
              <QBtn icon="database-outline" iconBg="#0D9488" label="Bank Soal CBT"   onPress={() => safeNavigate('BankSoal')} />
            </>
          )}

          {(activeMenuTab === 'semua' || activeMenuTab === 'keagamaan') && (
            <>
              <QBtn icon="book-marker"          iconBg="#2563EB" label="Setoran Tahfizh" onPress={() => safeNavigate('Tahfizh')} />
              <QBtn icon="clipboard-check"      iconBg="#D97706" label="Mutaba'ah"       onPress={() => safeNavigate('Mutabaah')} />
              <QBtn icon="book-open-variant"    iconBg="#059669" label="Al-Qur'an"       onPress={() => safeNavigate('Quran')} />
              <QBtn icon="hands-pray"           iconBg="#F97316" label="Doa & Dzikir"    onPress={() => safeNavigate('DoaDzikir')} />
              <QBtn icon="book-open-page-variant" iconBg="#8B5CF6" label="Chat Pegawai"   onPress={() => safeNavigate('Chat Guru')} />
              <QBtn icon="bullhorn"             iconBg="#E11D48" label="Informasi"       onPress={() => safeNavigate('Informasi')} />
            </>
          )}
        </View>
      </View>

      {/* ── 3B. CARD: PRESENSI REALTIME GURU & TENDIK (DI BAWAH MENU) ── */}
      <View style={styles.cardContainer}>
        {/* Header Container Presensi Realtime */}
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleWithIcon}>
            <View style={[styles.sectionIconBadgeRound, { backgroundColor: '#DEF7EC' }]}>
              <MaterialCommunityIcons name="account-clock-outline" size={18} color="#059669" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={styles.sectionTitleBold}>Presensi Guru & Tendik</Text>
                {empDateFilter === 'today' ? (
                  <View style={styles.empAttLiveBadge}>
                    <View style={styles.empAttLiveDot} />
                    <Text style={styles.empAttLiveText}>Live Hari Ini</Text>
                  </View>
                ) : (
                  <View style={[styles.empAttLiveBadge, { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1' }]}>
                    <MaterialCommunityIcons name="history" size={10} color="#64748B" />
                    <Text style={[styles.empAttLiveText, { color: '#475569' }]}>
                      {empDateFilter === 'yesterday' ? 'Arsip Kemarin' : empDateFilter === 'this_week' ? 'Pekan Ini' : 'Tanggal Khusus'}
                    </Text>
                  </View>
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[styles.sectionSubtitleText, { flexShrink: 1 }]} numberOfLines={1}>
                  {currentDateDisplayLabel} • {activeRoleData.summary.total} Hadir Tercatat (Total SDM: {totalPegawai})
                </Text>
                {loadingAttendance && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 6 }}>
                    <ActivityIndicator size="small" color="#059669" />
                  </View>
                )}
              </View>
            </View>
          </View>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => safeNavigate('RekapPresensiGuru', { defaultSubject: 'pegawai', lockedSubject: 'pegawai' })}
            style={styles.detailLinkBtn}
          >
            <Text style={styles.detailLinkBtnText}>Rekap</Text>
            <MaterialCommunityIcons name="arrow-right" size={13} color="#059669" />
          </TouchableOpacity>
        </View>

        {/* ── FILTER WAKTU (HARI INI, KEMARIN, PEKAN INI, PILIH TANGGAL) ── */}
        <View style={styles.dateFilterContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dateFilterScroll}
          >
            {[
              { id: 'today', label: 'Hari Ini', sublabel: todayShortLabel, icon: 'calendar-today' },
              { id: 'yesterday', label: 'Kemarin', sublabel: yesterdayShortLabel, icon: 'history' },
              { id: 'this_week', label: 'Pekan Ini', sublabel: 'Minggu Berjalan', icon: 'calendar-week' },
              { id: 'custom', label: 'Pilih Tanggal', sublabel: 'Kalender', icon: 'calendar-search' },
            ].map((dTab) => {
              const isActive = empDateFilter === dTab.id;
              return (
                <TouchableOpacity
                  key={dTab.id}
                  activeOpacity={0.8}
                  onPress={() => {
                    if (dTab.id === 'custom') {
                      setShowDatePickerModal(true);
                    } else {
                      setEmpDateFilter(dTab.id as AttendanceDateFilter);
                    }
                  }}
                  style={[
                    styles.dateFilterPill,
                    isActive && styles.dateFilterPillActive,
                  ]}
                >
                  <MaterialCommunityIcons
                    name={dTab.icon as any}
                    size={13}
                    color={isActive ? '#FFFFFF' : '#64748B'}
                  />
                  <Text style={[styles.dateFilterPillText, isActive && styles.dateFilterPillTextActive]}>
                    {dTab.label}
                  </Text>
                  <View style={[styles.dateFilterSubBadge, isActive && styles.dateFilterSubBadgeActive]}>
                    <Text style={[styles.dateFilterSubText, isActive && styles.dateFilterSubTextActive]}>
                      {dTab.id === 'custom' && empDateFilter === 'custom' ? selectedCustomDate.slice(5) : dTab.sublabel}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── FILTER CIVITAS (SEMUA, GURU, TENDIK) ── */}
        <View style={styles.roleFilterRow}>
          <Text style={styles.filterSectionTitle}>Kategori:</Text>
          <View style={styles.roleFilterChipsWrap}>
            {[
              { id: 'all', label: `Semua (${activeDateData.counts.total})` },
              { id: 'guru', label: `Guru (${activeDateData.counts.guruTotal})` },
              { id: 'tendik', label: `Tendik (${activeDateData.counts.tendikTotal})` },
            ].map((rf) => {
              const isSelected = empRoleFilter === rf.id;
              return (
                <TouchableOpacity
                  key={rf.id}
                  activeOpacity={0.75}
                  onPress={() => setEmpRoleFilter(rf.id as AttendanceRoleFilter)}
                  style={[styles.roleChip, isSelected && styles.roleChipActive]}
                >
                  <Text style={[styles.roleChipText, isSelected && styles.roleChipTextActive]}>
                    {rf.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── STATS PROGRESS BAR (VISUAL PERSENTASE KEHADIRAN) ── */}
        <View style={styles.distributionBarWrap}>
          <View style={styles.distributionBarTrack}>
            <View style={[styles.distributionBarSegment, { flex: Math.max(activeRoleData.summary.hadir, 1), backgroundColor: '#059669' }]} />
            <View style={[styles.distributionBarSegment, { flex: Math.max(activeRoleData.summary.izin_dinas, 0.01), backgroundColor: '#D97706' }]} />
            <View style={[styles.distributionBarSegment, { flex: Math.max(activeRoleData.summary.sakit, 0.01), backgroundColor: '#0284C7' }]} />
            <View style={[styles.distributionBarSegment, { flex: Math.max(activeRoleData.summary.alfa, 0.01), backgroundColor: '#E11D48' }]} />
          </View>
          <View style={styles.distributionLegendRow}>
            <Text style={styles.distributionLegendText}>
              Tingkat Kehadiran: <Text style={{ fontWeight: '800', color: '#059669' }}>{activeRoleData.summary.persentase_hadir}%</Text>
            </Text>
            <Text style={styles.distributionLegendSub}>
              {activeRoleData.summary.hadir} Hadir / {activeRoleData.summary.total} Personel
            </Text>
          </View>
        </View>

        {/* ── 4 KARTU KPI RINGKASAN STATUS PRESENSI (CLICKABLE QUICK FILTER) ── */}
        <View style={styles.empAttKpiGrid}>
          {/* 1. HADIR */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setEmpAttFilter(empAttFilter === 'hadir' ? 'all' : 'hadir')}
            style={[
              styles.empAttKpiCard,
              { backgroundColor: '#ECFDF5', borderColor: empAttFilter === 'hadir' ? '#059669' : '#A7F3D0' },
              empAttFilter === 'hadir' && styles.empAttKpiCardActive,
            ]}
          >
            <View style={styles.empAttKpiTopRow}>
              <MaterialCommunityIcons name="check-circle" size={13.5} color="#059669" />
              <Text style={[styles.empAttKpiLabel, { color: '#065F46' }]}>Hadir</Text>
            </View>
            <Text style={[styles.empAttKpiValue, { color: '#047857' }]}>
              {activeRoleData.summary.hadir}
            </Text>
            <View style={styles.empAttKpiPillWrap}>
              <Text style={[styles.empAttKpiSubtext, { color: '#059669' }]}>
                {activeRoleData.summary.persentase_hadir}%
              </Text>
            </View>
          </TouchableOpacity>

          {/* 2. IZIN DINAS LUAR */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setEmpAttFilter(empAttFilter === 'izin_dinas' ? 'all' : 'izin_dinas')}
            style={[
              styles.empAttKpiCard,
              { backgroundColor: '#FEF3C7', borderColor: empAttFilter === 'izin_dinas' ? '#D97706' : '#FDE68A' },
              empAttFilter === 'izin_dinas' && styles.empAttKpiCardActive,
            ]}
          >
            <View style={styles.empAttKpiTopRow}>
              <MaterialCommunityIcons name="briefcase-clock" size={13.5} color="#D97706" />
              <Text style={[styles.empAttKpiLabel, { color: '#92400E' }]} numberOfLines={1}>Dinas</Text>
            </View>
            <Text style={[styles.empAttKpiValue, { color: '#B45309' }]}>
              {activeRoleData.summary.izin_dinas}
            </Text>
            <View style={[styles.empAttKpiPillWrap, { backgroundColor: 'rgba(217, 119, 6, 0.12)' }]}>
              <Text style={[styles.empAttKpiSubtext, { color: '#B45309' }]}>
                Tugas
              </Text>
            </View>
          </TouchableOpacity>

          {/* 3. SAKIT */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setEmpAttFilter(empAttFilter === 'sakit' ? 'all' : 'sakit')}
            style={[
              styles.empAttKpiCard,
              { backgroundColor: '#F0F9FF', borderColor: empAttFilter === 'sakit' ? '#0284C7' : '#BAE6FD' },
              empAttFilter === 'sakit' && styles.empAttKpiCardActive,
            ]}
          >
            <View style={styles.empAttKpiTopRow}>
              <MaterialCommunityIcons name="hospital-box" size={13.5} color="#0284C7" />
              <Text style={[styles.empAttKpiLabel, { color: '#075985' }]}>Sakit</Text>
            </View>
            <Text style={[styles.empAttKpiValue, { color: '#0369A1' }]}>
              {activeRoleData.summary.sakit}
            </Text>
            <View style={[styles.empAttKpiPillWrap, { backgroundColor: 'rgba(2, 132, 199, 0.12)' }]}>
              <Text style={[styles.empAttKpiSubtext, { color: '#0369A1' }]}>
                Dokter
              </Text>
            </View>
          </TouchableOpacity>

          {/* 4. ALFA */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setEmpAttFilter(empAttFilter === 'alfa' ? 'all' : 'alfa')}
            style={[
              styles.empAttKpiCard,
              { backgroundColor: '#FFF1F2', borderColor: empAttFilter === 'alfa' ? '#E11D48' : '#FECDD3' },
              empAttFilter === 'alfa' && styles.empAttKpiCardActive,
            ]}
          >
            <View style={styles.empAttKpiTopRow}>
              <MaterialCommunityIcons name="alert-circle" size={13.5} color="#E11D48" />
              <Text style={[styles.empAttKpiLabel, { color: '#9F1239' }]}>Alfa</Text>
            </View>
            <Text style={[styles.empAttKpiValue, { color: '#BE123C' }]}>
              {activeRoleData.summary.alfa}
            </Text>
            <View style={[styles.empAttKpiPillWrap, { backgroundColor: 'rgba(225, 29, 72, 0.12)' }]}>
              <Text style={[styles.empAttKpiSubtext, { color: '#BE123C' }]}>
                Absen
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ── MINI SEARCH BAR (CARI GURU / STAF) ── */}
        <View style={styles.empSearchBarWrap}>
          <MaterialCommunityIcons name="magnify" size={16} color="#94A3B8" />
          <TextInput
            placeholder="Cari nama guru, staf, atau NIP..."
            placeholderTextColor="#94A3B8"
            value={empSearchQuery}
            onChangeText={setEmpSearchQuery}
            style={styles.empSearchInput}
          />
          {empSearchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setEmpSearchQuery('')} style={{ padding: 4 }}>
              <MaterialCommunityIcons name="close-circle" size={15} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* ── FILTER CHIPS BAR (STATUS FILTER) ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.empAttFilterScroll}
        >
          {[
            { id: 'all', label: `Semua (${activeRoleData.summary.total})`, icon: 'account-group-outline' },
            { id: 'hadir', label: `Hadir (${activeRoleData.summary.hadir})`, icon: 'check-circle-outline', activeBg: '#059669' },
            { id: 'izin_dinas', label: `Dinas Luar (${activeRoleData.summary.izin_dinas})`, icon: 'briefcase-clock-outline', activeBg: '#D97706' },
            { id: 'sakit', label: `Sakit (${activeRoleData.summary.sakit})`, icon: 'hospital-box-outline', activeBg: '#0284C7' },
            { id: 'alfa', label: `Alfa (${activeRoleData.summary.alfa})`, icon: 'alert-circle-outline', activeBg: '#E11D48' },
          ].map((tab) => {
            const isActive = empAttFilter === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                activeOpacity={0.75}
                onPress={() => setEmpAttFilter(tab.id as AttendanceStatusFilter)}
                style={[
                  styles.empAttFilterChip,
                  isActive && { backgroundColor: tab.activeBg || '#059669', borderColor: tab.activeBg || '#059669' },
                ]}
              >
                <MaterialCommunityIcons
                  name={tab.icon as any}
                  size={13}
                  color={isActive ? '#FFFFFF' : '#64748B'}
                />
                <Text style={[styles.empAttFilterChipText, isActive && styles.empAttFilterChipTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── DAFTAR PEGAWAI GURU & TENDIK ── */}
        {displayedEmpAttendanceList.length === 0 ? (
          <View style={styles.empAttEmptyBox}>
            <MaterialCommunityIcons name="account-search-outline" size={26} color="#94A3B8" />
            <Text style={styles.empAttEmptyTitle}>Tidak ada personel ditemukan</Text>
            <Text style={styles.empAttEmptySub}>
              Coba ganti filter status, filter kategori civitas, atau bersihkan kata kunci pencarian.
            </Text>
            {(empAttFilter !== 'all' || empRoleFilter !== 'all' || empSearchQuery.length > 0) && (
              <TouchableOpacity
                onPress={() => {
                  setEmpAttFilter('all');
                  setEmpRoleFilter('all');
                  setEmpSearchQuery('');
                }}
                style={styles.empAttResetFilterBtn}
              >
                <Text style={styles.empAttResetFilterText}>Reset Semua Filter</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.empAttListContainer}>
            {displayedEmpAttendanceList.map((item: any, idx: number) => {
              const isHadir = item.status === 'Hadir';
              const isDinas = item.status === 'Izin Dinas Luar';
              const isSakit = item.status === 'Sakit';
              const isAlfa = item.status === 'Alfa';

              const statusColor = isHadir
                ? '#059669'
                : isDinas
                ? '#D97706'
                : isSakit
                ? '#0284C7'
                : '#E11D48';

              const statusBg = isHadir
                ? '#DEF7EC'
                : isDinas
                ? '#FEF3C7'
                : isSakit
                ? '#E0F2FE'
                : '#FFE4E6';

              const statusIcon = isHadir
                ? 'check'
                : isDinas
                ? 'briefcase-outline'
                : isSakit
                ? 'hospital-box-outline'
                : 'alert-circle-outline';

              return (
                <View
                  key={item.id || idx}
                  style={[
                    styles.empAttItemRow,
                    idx < displayedEmpAttendanceList.length - 1 && styles.empAttItemRowBorder,
                  ]}
                >
                  {/* Avatar & Role */}
                  <View style={styles.empAttAvatarWrap}>
                    {item.avatar_url ? (
                      <Image source={{ uri: item.avatar_url }} style={styles.empAttAvatarImg} />
                    ) : (
                      <View
                        style={[
                          styles.empAttAvatarFallback,
                          { backgroundColor: item.role_type === 'Guru' ? '#059669' : '#0284C7' },
                        ]}
                      >
                        <Text style={styles.empAttAvatarText}>
                          {(item.nama || 'P').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Info Pegawai */}
                  <View style={styles.empAttInfoCol}>
                    <View style={styles.empAttNameRow}>
                      <Text style={styles.empAttNameText} numberOfLines={1}>
                        {item.nama}
                      </Text>
                      <View
                        style={[
                          styles.empAttRoleBadge,
                          {
                            backgroundColor: item.role_type === 'Guru' ? '#ECFDF5' : '#F0F9FF',
                            borderColor: item.role_type === 'Guru' ? '#A7F3D0' : '#BAE6FD',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.empAttRoleText,
                            { color: item.role_type === 'Guru' ? '#059669' : '#0284C7' },
                          ]}
                        >
                          {item.role_type || 'Pegawai'}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.empAttPositionText} numberOfLines={1}>
                      {item.jabatan} • {item.nip}
                    </Text>

                    {/* Catatan / Keterangan Waktu / Lokasi */}
                    <View style={styles.empAttMetaRow}>
                      <MaterialCommunityIcons
                        name={
                          isHadir
                            ? 'clock-check-outline'
                            : isDinas
                            ? 'map-marker-radius-outline'
                            : isSakit
                            ? 'file-document-outline'
                            : 'alert-circle-outline'
                        }
                        size={11.5}
                        color={statusColor}
                      />
                      <Text style={[styles.empAttMetaText, { color: statusColor }]} numberOfLines={1}>
                        {item.waktu !== '—' ? `${item.waktu}: ` : ''}{item.keterangan || item.lokasi || 'Presensi'}
                      </Text>
                    </View>
                  </View>

                  {/* Status Badge & Aksi Cepat */}
                  <View style={styles.empAttActionCol}>
                    <View style={[styles.empAttStatusBadge, { backgroundColor: statusBg }]}>
                      <MaterialCommunityIcons name={statusIcon as any} size={11} color={statusColor} />
                      <Text style={[styles.empAttStatusText, { color: statusColor }]}>
                        {item.status}
                      </Text>
                    </View>

                    {/* Tombol Hubungi Chat Internal / Call */}
                    <View style={styles.empAttContactRow}>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => handleOpenInternalChat(item)}
                        style={styles.empAttContactBtn}
                        accessibilityLabel={`Chat internal dengan ${item.nama}`}
                      >
                        <MaterialCommunityIcons name="message-text-outline" size={13} color="#059669" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => handleCallPhone(item.no_hp, item.nama)}
                        style={[styles.empAttContactBtn, { backgroundColor: '#F1F5F9' }]}
                      >
                        <MaterialCommunityIcons name="phone-outline" size={12} color="#0284C7" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Footer Button: Expand/Collapse & Link Rekap */}
        <View style={styles.empAttFooterRow}>
          {filteredEmpAttendanceList.length > 5 ? (
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => setShowAllEmpAtt(!showAllEmpAtt)}
              style={styles.empAttExpandBtn}
            >
              <Text style={styles.empAttExpandBtnText}>
                {showAllEmpAtt
                  ? 'Tampilkan Ringkas (5)'
                  : `Lihat Semua (${filteredEmpAttendanceList.length} Personel)`}
              </Text>
              <MaterialCommunityIcons
                name={showAllEmpAtt ? 'chevron-up' : 'chevron-down'}
                size={15}
                color="#059669"
              />
            </TouchableOpacity>
          ) : (
            <View style={{ flex: 1 }} />
          )}

          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => safeNavigate('PresensiKbmPengganti')}
            style={styles.empAttReportLinkBtn}
          >
            <MaterialCommunityIcons name="file-chart-outline" size={13} color="#0284C7" />
            <Text style={styles.empAttReportLinkText}>Rekap Presensi</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 4. CARD: AGENDA HARI INI & KALENDER AKADEMIK (DI BAWAH MENU) ── */}
      <View style={styles.cardContainer}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleWithIcon}>
            <View style={[styles.sectionIconBadgeRound, { backgroundColor: '#DEF7EC' }]}>
              <MaterialCommunityIcons name="calendar-clock-outline" size={17} color="#059669" />
            </View>
            <View>
              <Text style={styles.sectionTitleBold}>Agenda Hari Ini</Text>
              <Text style={styles.sectionSubtitleText}>{todayFormatted}</Text>
            </View>
          </View>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => safeNavigate('Kalender')}
            style={styles.detailLinkBtn}
          >
            <Text style={styles.detailLinkBtnText}>Buka Kalender</Text>
            <MaterialCommunityIcons name="arrow-right" size={13} color="#059669" />
          </TouchableOpacity>
        </View>

        {todayAgendaList.length === 0 ? (
          <View style={styles.agendaEmptyBox}>
            <View style={styles.agendaEmptyIconWrap}>
              <MaterialCommunityIcons name="calendar-check-outline" size={24} color="#059669" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.agendaEmptyTitle}>Tidak ada agenda khusus hari ini</Text>
              <Text style={styles.agendaEmptySub}>
                KBM dan kegiatan operasional madrasah berjalan sesuai jadwal reguler.
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.agendaListWrap}>
            {todayAgendaList.slice(0, 3).map((item: any, idx: number) => (
              <View key={idx} style={styles.agendaItemRow}>
                <View style={styles.agendaTimeBox}>
                  <Text style={styles.agendaTimeText}>
                    {item.jam || item.time || item.waktu || '08:00'}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={styles.agendaItemTitle}>
                    {item.judul || item.title || item.kegiatan || 'Agenda Madrasah'}
                  </Text>
                  <Text numberOfLines={1} style={styles.agendaItemMeta}>
                    {item.lokasi || item.tempat || 'Kampus Utama'} • {item.penanggung_jawab || 'Waka Kurikulum'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* ── 5. CARD: BERITA & INFORMASI MADRASAH (DI BAWAH AGENDA) ── */}
      <View style={styles.cardContainer}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleWithIcon}>
            <View style={[styles.sectionIconBadgeRound, { backgroundColor: '#CCFBF1' }]}>
              <MaterialCommunityIcons name="newspaper-variant-outline" size={17} color="#0D9488" />
            </View>
            <View>
              <Text style={styles.sectionTitleBold}>Berita & Informasi</Text>
              <Text style={styles.sectionSubtitleText}>Pengumuman dan edaran resmi madrasah</Text>
            </View>
          </View>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => safeNavigate('Informasi')}
            style={styles.detailLinkBtn}
          >
            <Text style={styles.detailLinkBtnText}>Lihat Semua</Text>
            <MaterialCommunityIcons name="chevron-right" size={14} color="#059669" />
          </TouchableOpacity>
        </View>

        {announcementList.length === 0 ? (
          <View style={styles.emptyStateWrap}>
            <MaterialCommunityIcons name="newspaper-variant" size={26} color="#94A3B8" />
            <Text style={styles.emptyStateText}>Belum ada edaran atau berita terbaru</Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.newsHorizontalScroll}
          >
            {announcementList.slice(0, 4).map((ann: any, idx: number) => {
              const imgUri = getAnnouncementImage(ann, idx);
              const dateStr = getAnnouncementDate(ann);
              const titleStr = ann.judul || ann.title || 'Pengumuman Madrasah';

              return (
                <TouchableOpacity
                  key={ann.id || idx}
                  activeOpacity={0.85}
                  onPress={() => setSelectedAnnouncement(ann)}
                  style={styles.newsCardItem}
                >
                  <View style={styles.newsImageWrap}>
                    <Image
                      source={{ uri: imgUri }}
                      style={styles.newsImage}
                      resizeMode="cover"
                    />
                    <View style={styles.newsDateBadge}>
                      <MaterialCommunityIcons name="clock-outline" size={10} color="#FFFFFF" />
                      <Text style={styles.newsDateBadgeText}>{dateStr}</Text>
                    </View>
                  </View>
                  <View style={styles.newsContentWrap}>
                    <Text numberOfLines={2} style={styles.newsCardTitle}>
                      {titleStr}
                    </Text>
                    <Text numberOfLines={2} style={styles.newsCardExcerpt}>
                      {ann.ringkasan || ann.konten || ann.content || 'Ketuk untuk membaca selengkapnya...'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* ── 6. CARD: STAF ONLINE & LOG KEAKTIFAN FEED (DENGAN SCROLL & DEFAULT 5 STATUS) ── */}
      <View style={styles.cardContainer}>
        <View style={styles.civitasSwitcherRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setCivitasTab('online')}
            style={[styles.civitasTabBtn, civitasTab === 'online' && styles.civitasTabBtnActive]}
          >
            <MaterialCommunityIcons
              name="account-multiple-check"
              size={15}
              color={civitasTab === 'online' ? '#059669' : '#64748B'}
            />
            <Text
              style={[
                styles.civitasTabBtnText,
                civitasTab === 'online' && styles.civitasTabBtnTextActive,
              ]}
            >
              Staf Online ({onlineUsers.filter((u: any) => u.is_online).length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setCivitasTab('logs')}
            style={[styles.civitasTabBtn, civitasTab === 'logs' && styles.civitasTabBtnActive]}
          >
            <MaterialCommunityIcons
              name="history"
              size={15}
              color={civitasTab === 'logs' ? '#059669' : '#64748B'}
            />
            <Text
              style={[
                styles.civitasTabBtnText,
                civitasTab === 'logs' && styles.civitasTabBtnTextActive,
              ]}
            >
              Log Keaktifan
            </Text>
          </TouchableOpacity>
        </View>

        {civitasTab === 'online' ? (
          <View>
            <View style={styles.onlineFilterRow}>
              {(['all', 'online', 'offline'] as const).map((filterKey) => (
                <TouchableOpacity
                  key={filterKey}
                  activeOpacity={0.7}
                  onPress={() => setOnlineFilter(filterKey)}
                  style={[
                    styles.onlineFilterChip,
                    onlineFilter === filterKey && styles.onlineFilterChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.onlineFilterChipText,
                      onlineFilter === filterKey && styles.onlineFilterChipTextActive,
                    ]}
                  >
                    {filterKey === 'all'
                      ? 'Semua'
                      : filterKey === 'online'
                      ? 'Online Saja'
                      : 'Offline Saja'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {filteredOnlineUsers.length === 0 ? (
              <View style={styles.emptyStateWrap}>
                <MaterialCommunityIcons name="account-search-outline" size={26} color="#94A3B8" />
                <Text style={styles.emptyStateText}>Tidak ada staf/guru yang sesuai filter</Text>
              </View>
            ) : (
              <View>
                {/* ScrollView vertikal dengan tinggi maksimal ~5 item */}
                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                  style={styles.onlineScrollContainer}
                  contentContainerStyle={styles.onlineUsersList}
                >
                  {(showAllOnline ? filteredOnlineUsers : filteredOnlineUsers.slice(0, 5)).map((u: any) => (
                    <View key={u.id} style={styles.onlineUserItem}>
                      <View style={styles.onlineUserAvatarBox}>
                        <Text style={styles.onlineUserInitials}>
                          {String(u.nama || u.name || 'PG').substring(0, 2).toUpperCase()}
                        </Text>
                        <View
                          style={[
                            styles.onlineUserDot,
                            { backgroundColor: u.is_online ? '#10B981' : '#94A3B8' },
                          ]}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={styles.onlineUserName}>
                          {u.nama}
                        </Text>
                        <Text style={styles.onlineUserRole}>
                          {u.role_label} • {u.unit} • {u.last_seen}
                        </Text>
                      </View>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => handleOpenInternalChat(u)}
                        style={styles.chatActionBtn}
                      >
                        <MaterialCommunityIcons name="message-text-outline" size={14} color="#059669" />
                        <Text style={styles.chatActionBtnText}>Chat</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>

                {filteredOnlineUsers.length > 5 && (
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => setShowAllOnline(!showAllOnline)}
                    style={styles.toggleShowAllBtn}
                  >
                    <Text style={styles.toggleShowAllBtnText}>
                      {showAllOnline
                        ? 'Tampilkan 5 Saja'
                        : `Lihat Semua (${filteredOnlineUsers.length} Staf)`}
                    </Text>
                    <MaterialCommunityIcons
                      name={showAllOnline ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color="#059669"
                    />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        ) : (
          <ScrollView
            nestedScrollEnabled
            showsVerticalScrollIndicator
            style={styles.logsScrollContainer}
            contentContainerStyle={styles.logsContainer}
          >
            {onlineLogs.length === 0 ? (
              <View style={styles.emptyStateWrap}>
                <MaterialCommunityIcons name="history" size={26} color="#94A3B8" />
                <Text style={styles.emptyStateText}>Belum ada riwayat aktivitas terbaru</Text>
              </View>
            ) : (
              onlineLogs.map((log: any, idx: number) => (
                <View key={idx} style={styles.logItemRow}>
                  <View style={styles.logDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.logActionText}>{log.action}</Text>
                    <Text style={styles.logMetaText}>
                      {log.user_name} ({log.role}) • {log.time}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        )}
      </View>

      <View style={{ height: 32 }} />

      {/* ── MODAL DETAIL PENGUMUMAN (TAMPIL BERSIH & BERGAMBAR) ── */}
      <Modal
        visible={Boolean(selectedAnnouncement)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedAnnouncement(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.announcementModalBox}>
            <View style={styles.announcementModalImageWrap}>
              <Image
                source={{ uri: getAnnouncementImage(selectedAnnouncement, 0) }}
                style={styles.announcementModalImage}
                resizeMode="cover"
              />
              <View style={styles.announcementModalTagRow}>
                <View style={styles.announcementModalCatTag}>
                  <Text style={styles.announcementModalCatText}>
                    {selectedAnnouncement?.kategori || 'Pengumuman'}
                  </Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setSelectedAnnouncement(null)}
                  style={styles.announcementModalCloseIcon}
                >
                  <MaterialCommunityIcons name="close" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.announcementModalHeaderInfo}>
              <Text style={styles.announcementModalTitle}>
                {selectedAnnouncement?.judul || selectedAnnouncement?.title || 'Pengumuman Madrasah'}
              </Text>
              <View style={styles.announcementModalMetaRow}>
                <MaterialCommunityIcons name="calendar-clock" size={13} color="#64748B" />
                <Text style={styles.announcementModalMetaText}>
                  {getAnnouncementDate(selectedAnnouncement)}
                </Text>
              </View>
            </View>

            <ScrollView
              style={styles.announcementModalBody}
              contentContainerStyle={{ paddingVertical: 14 }}
              showsVerticalScrollIndicator
            >
              <Text style={styles.announcementModalContentText}>
                {selectedAnnouncement?.konten ||
                  selectedAnnouncement?.content ||
                  selectedAnnouncement?.ringkasan ||
                  'Tidak ada rincian konten.'}
              </Text>
            </ScrollView>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setSelectedAnnouncement(null)}
              style={styles.announcementModalCloseBtn}
            >
              <Text style={styles.announcementModalCloseBtnText}>Tutup Pengumuman</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── MODAL PILIH TANGGAL PRESENSI ── */}
      <Modal
        visible={showDatePickerModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDatePickerModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.datePickerModalBox}>
            <View style={styles.datePickerModalHeader}>
              <View style={[styles.sectionIconBadgeRound, { backgroundColor: '#DEF7EC' }]}>
                <MaterialCommunityIcons name="calendar-month-outline" size={18} color="#059669" />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.datePickerModalTitle}>Pilih Tanggal Presensi</Text>
                <Text style={styles.datePickerModalSubtitle}>Pilih arsip harian atau kembali ke hari ini</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowDatePickerModal(false)}
                style={styles.datePickerModalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 340, paddingVertical: 4 }}>
              {quickDateOptions.map((opt) => {
                const isSelected =
                  (empDateFilter === 'today' && opt.preset === 'today') ||
                  (empDateFilter === 'yesterday' && opt.preset === 'yesterday') ||
                  (empDateFilter === 'custom' && selectedCustomDate === opt.id);

                return (
                  <TouchableOpacity
                    key={opt.id}
                    activeOpacity={0.75}
                    onPress={() => {
                      if (opt.preset === 'today') {
                        setEmpDateFilter('today');
                      } else if (opt.preset === 'yesterday') {
                        setEmpDateFilter('yesterday');
                      } else {
                        setEmpDateFilter('custom');
                        setSelectedCustomDate(opt.id);
                      }
                      setShowDatePickerModal(false);
                    }}
                    style={[
                      styles.datePickerOptionRow,
                      isSelected && styles.datePickerOptionRowSelected,
                    ]}
                  >
                    <View style={styles.datePickerOptionLeft}>
                      <MaterialCommunityIcons
                        name={isSelected ? 'calendar-check' : 'calendar-outline'}
                        size={17}
                        color={isSelected ? '#059669' : '#64748B'}
                      />
                      <Text
                        style={[
                          styles.datePickerOptionLabel,
                          isSelected && styles.datePickerOptionLabelSelected,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.datePickerOptionBadge,
                        isSelected && { backgroundColor: '#DEF7EC', borderColor: '#A7F3D0' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.datePickerOptionBadgeText,
                          isSelected && { color: '#059669', fontWeight: '800' },
                        ]}
                      >
                        {opt.tag}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                setEmpDateFilter('today');
                setShowDatePickerModal(false);
              }}
              style={styles.datePickerResetTodayBtn}
            >
              <MaterialCommunityIcons name="refresh" size={15} color="#059669" />
              <Text style={styles.datePickerResetTodayText}>Kembali ke Presensi Hari Ini (Live)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {feedbackModal && (
        <AppFeedbackModal
          visible={feedbackModal.visible}
          type={feedbackModal.type || 'info'}
          title={feedbackModal.title}
          message={feedbackModal.message}
          onClose={() => setFeedbackModal(null)}
        />
      )}

      {/* Modal Drilldown Detail KPI (Siswa, Guru, Tendik, Rombel, Tahfizh) */}
      <PrincipalKpiDrilldownModal
        type={activeKpiModal}
        isOpen={Boolean(activeKpiModal)}
        onClose={() => setActiveKpiModal(null)}
        dashboardData={dashboard}
        unitId={schoolInfo?.id || data?.context?.unit?.id}
      />

      <PrincipalTeacherMonitoringModal
        visible={isTeacherMonitoringModalOpen}
        onClose={() => setIsTeacherMonitoringModalOpen(false)}
        unitName={schoolInfo?.nama || 'Unit Sekolah'}
      />

      {/* Modal Chat Internal */}
      <PrincipalChatModal
        visible={Boolean(activeChatUser)}
        onClose={() => setActiveChatUser(null)}
        targetUser={activeChatUser}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },

  // 1. Hero Banner Button (Pintasan Dashboard KS)
  heroBannerBtn: {
    marginBottom: 14,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  heroBannerGradient: {
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroBannerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  heroBannerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
    flexWrap: 'wrap',
  },
  heroBannerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#065F46',
    flexShrink: 1,
  },
  heroBannerBadge: {
    backgroundColor: '#059669',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    flexShrink: 0,
  },
  heroBannerBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  heroBannerSubtitle: {
    fontSize: 11,
    color: '#047857',
    fontWeight: '500',
    lineHeight: 15,
    marginTop: 2,
  },

  // 2. Section Card (Menu Utama)
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  sectionIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  sectionSubtitle: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  allMenusPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  allMenusPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#059669',
  },

  // Tab Switcher Menu
  menuTabScroll: {
    gap: 6,
    paddingBottom: 10,
  },
  menuTabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  menuTabChipActive: {
    backgroundColor: '#059669',
  },
  menuTabChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  menuTabChipTextActive: {
    color: '#FFFFFF',
  },

  // Quick Button Grid (Senior UI/UX Optimized Spacing & Height Alignment)
  qBtnGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 8,
    marginTop: 6,
  },
  qBtnTile: {
    width: '22.8%',
    alignItems: 'center',
    paddingVertical: 4,
    minHeight: 88,
    marginBottom: 6,
  },
  qBtnBox: {
    width: 46,
    height: 46,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  qBtnLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#1E293B',
    textAlign: 'center',
    lineHeight: 14,
    height: 28,
    paddingHorizontal: 1,
  },
  qBtnMiniBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#059669',
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  qBtnMiniBadgeText: {
    fontSize: 7.5,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },

  // 3. Card Container Umum
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  sectionIconBadgeRound: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitleBold: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  sectionSubtitleText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 1,
  },
  periodePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    flexShrink: 0,
  },
  periodePillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  yayasanMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
    marginTop: 2,
  },
  yayasanOrgBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  yayasanOrgBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#B45309',
  },
  tahunAjaranBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tahunAjaranBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#0284C7',
  },
  yayasanCountBadge: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  yayasanCountBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  detailLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  detailLinkBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#059669',
  },

  // Pengurus Yayasan Cards
  yayasanCardsScroll: {
    gap: 10,
    paddingVertical: 2,
  },
  yayasanCard: {
    width: 232,
    padding: 13,
    borderRadius: 16,
    borderWidth: 1,
  },
  yayasanCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  yayasanAvatarBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  yayasanAvatarInitials: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  yayasanOnlineDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  yayasanRoleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 8,
  },
  yayasanRoleBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  yayasanOfficerName: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  yayasanOfficerNip: {
    fontSize: 10,
    color: '#64748B',
    marginBottom: 8,
  },
  yayasanContactRow: {
    flexDirection: 'row',
    gap: 6,
  },
  yayasanContactBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 9,
    paddingVertical: 6.5,
  },
  yayasanContactBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#059669',
  },

  // 4. Agenda Hari Ini
  agendaEmptyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  agendaEmptyIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  agendaEmptyTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 2,
  },
  agendaEmptySub: {
    fontSize: 10.5,
    color: '#64748B',
    lineHeight: 15,
  },
  agendaListWrap: {
    gap: 8,
  },
  agendaItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  agendaTimeBox: {
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  agendaTimeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
  agendaItemTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  agendaItemMeta: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },

  // 5. Berita & Informasi
  newsHorizontalScroll: {
    gap: 12,
    paddingVertical: 2,
  },
  newsCardItem: {
    width: 220,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  newsImageWrap: {
    width: '100%',
    height: 105,
    position: 'relative',
  },
  newsImage: {
    width: '100%',
    height: '100%',
  },
  newsDateBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  newsDateBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  newsContentWrap: {
    padding: 10,
  },
  newsCardTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 16,
    marginBottom: 4,
  },
  newsCardExcerpt: {
    fontSize: 10.5,
    color: '#64748B',
    lineHeight: 14,
  },

  // 6. Civitas Switcher
  civitasSwitcherRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 3,
    marginBottom: 12,
    gap: 4,
  },
  civitasTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    borderRadius: 9,
  },
  civitasTabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  civitasTabBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  civitasTabBtnTextActive: {
    fontWeight: '800',
    color: '#059669',
  },

  // Online Filter
  onlineFilterRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  onlineFilterChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  onlineFilterChipActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  onlineFilterChipText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
  },
  onlineFilterChipTextActive: {
    color: '#059669',
    fontWeight: '800',
  },
  onlineScrollContainer: {
    maxHeight: 255,
  },
  onlineUsersList: {
    gap: 8,
  },
  onlineUserItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  onlineUserAvatarBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  onlineUserInitials: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  onlineUserDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  onlineUserName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  onlineUserRole: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  chatActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  chatActionBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#059669',
  },
  toggleShowAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 9,
    marginTop: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  toggleShowAllBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#059669',
  },

  // Logs
  logsScrollContainer: {
    maxHeight: 255,
  },
  logsContainer: {
    gap: 10,
    paddingVertical: 4,
  },
  logItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  logDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#059669',
    marginTop: 5,
  },
  logActionText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#1E293B',
  },
  logMetaText: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },

  // Modal Announcement
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  announcementModalBox: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    overflow: 'hidden',
  },
  announcementModalImageWrap: {
    width: '100%',
    height: 180,
    position: 'relative',
  },
  announcementModalImage: {
    width: '100%',
    height: '100%',
  },
  announcementModalTagRow: {
    position: 'absolute',
    top: 12,
    left: 14,
    right: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  announcementModalCatTag: {
    backgroundColor: 'rgba(5, 150, 105, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  announcementModalCatText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  announcementModalCloseIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  announcementModalHeaderInfo: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  announcementModalTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 22,
    marginBottom: 6,
  },
  announcementModalMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  announcementModalMetaText: {
    fontSize: 11,
    color: '#64748B',
  },
  announcementModalBody: {
    paddingHorizontal: 18,
    maxHeight: 260,
  },
  announcementModalContentText: {
    fontSize: 13,
    lineHeight: 21,
    color: '#334155',
  },
  announcementModalCloseBtn: {
    margin: 16,
    marginTop: 8,
    backgroundColor: '#059669',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  announcementModalCloseBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Presensi Realtime Guru & Tendik Styles
  empAttLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 7,
  },
  empAttLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#059669',
  },
  empAttLiveText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#059669',
  },

  // Date Filter Segment
  dateFilterContainer: {
    marginBottom: 10,
    paddingVertical: 2,
  },
  dateFilterScroll: {
    gap: 7,
  },
  dateFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dateFilterPillActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  dateFilterPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  dateFilterPillTextActive: {
    color: '#FFFFFF',
  },
  dateFilterSubBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  dateFilterSubBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  dateFilterSubText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
  },
  dateFilterSubTextActive: {
    color: '#FFFFFF',
  },

  // Role Filter
  roleFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    backgroundColor: '#F8FAFC',
    padding: 3.5,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#EDF2F7',
  },
  filterSectionTitle: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
    marginLeft: 8,
  },
  roleFilterChipsWrap: {
    flexDirection: 'row',
    gap: 4,
  },
  roleChip: {
    paddingVertical: 4.5,
    paddingHorizontal: 9,
    borderRadius: 8,
  },
  roleChipActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  roleChipText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
  },
  roleChipTextActive: {
    fontWeight: '800',
    color: '#059669',
  },

  // Distribution Bar
  distributionBarWrap: {
    marginBottom: 11,
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EDF2F7',
  },
  distributionBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E2E8F0',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  distributionBarSegment: {
    height: '100%',
  },
  distributionLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  distributionLegendText: {
    fontSize: 11,
    color: '#475569',
  },
  distributionLegendSub: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },

  // KPI Grid
  empAttKpiGrid: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  empAttKpiCard: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 74,
  },
  empAttKpiCardActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3,
    borderWidth: 1.5,
  },
  empAttKpiTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 2,
  },
  empAttKpiLabel: {
    fontSize: 10,
    fontWeight: '800',
  },
  empAttKpiValue: {
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 21,
  },
  empAttKpiPillWrap: {
    backgroundColor: 'rgba(5, 150, 105, 0.12)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
    marginTop: 2,
  },
  empAttKpiSubtext: {
    fontSize: 8.5,
    fontWeight: '700',
  },

  // Search Bar
  empSearchBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 35,
    marginBottom: 9,
  },
  empSearchInput: {
    flex: 1,
    fontSize: 11.5,
    color: '#0F172A',
    paddingVertical: 0,
  },

  // Filter Chips Bar
  empAttFilterScroll: {
    gap: 6,
    paddingBottom: 9,
  },
  empAttFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  empAttFilterChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  empAttFilterChipTextActive: {
    fontWeight: '800',
    color: '#FFFFFF',
  },
  empAttEmptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 2,
    gap: 4,
  },
  empAttEmptyTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
    marginTop: 4,
  },
  empAttEmptySub: {
    fontSize: 10.5,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  empAttResetFilterBtn: {
    marginTop: 8,
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  empAttResetFilterText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },

  // List Container
  empAttListContainer: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    backgroundColor: '#FAFCFF',
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  empAttItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    gap: 10,
  },
  empAttItemRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  empAttAvatarWrap: {
    position: 'relative',
  },
  empAttAvatarImg: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  empAttAvatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empAttAvatarText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  empAttInfoCol: {
    flex: 1,
  },
  empAttNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  empAttNameText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
    flexShrink: 1,
  },
  empAttRoleBadge: {
    paddingHorizontal: 5.5,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1,
  },
  empAttRoleText: {
    fontSize: 8.5,
    fontWeight: '800',
  },
  empAttPositionText: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 1,
  },
  empAttMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2.5,
  },
  empAttMetaText: {
    fontSize: 10,
    fontWeight: '600',
  },
  empAttActionCol: {
    alignItems: 'flex-end',
    gap: 5,
  },
  empAttStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  empAttStatusText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  empAttContactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  empAttContactBtn: {
    width: 25,
    height: 25,
    borderRadius: 12.5,
    backgroundColor: '#E8F8EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empAttFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 4,
  },
  empAttExpandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 8,
    backgroundColor: '#DEF7EC',
  },
  empAttExpandBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  empAttReportLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 8,
    backgroundColor: '#F0F9FF',
  },
  empAttReportLinkText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
  },

  // DatePicker Modal Styles
  datePickerModalBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    width: '92%',
    maxWidth: 400,
    maxHeight: 520,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  datePickerModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  datePickerModalTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  datePickerModalSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  datePickerModalCloseBtn: {
    padding: 4,
  },
  datePickerOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#EDF2F7',
  },
  datePickerOptionRowSelected: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  datePickerOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  datePickerOptionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  datePickerOptionLabelSelected: {
    fontWeight: '800',
    color: '#065F46',
  },
  datePickerOptionBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  datePickerOptionBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
  },
  datePickerResetTodayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#DEF7EC',
    paddingVertical: 11,
    borderRadius: 12,
    marginTop: 10,
  },
  datePickerResetTodayText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#059669',
  },

  // Empty State
  emptyStateWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 6,
  },
  emptyStateText: {
    fontSize: 11.5,
    color: '#94A3B8',
    fontWeight: '500',
    textAlign: 'center',
  },

  // ── Executive KPI Grid Styles (Selaras dengan Web Dashboard - 2x2 Kompak) ──
  kpiHeaderLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  kpiHeaderLinkText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#059669',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
    marginTop: 10,
  },
  kpiCard: {
    width: '48.5%',
    borderRadius: 14,
    borderWidth: 1.2,
    overflow: 'hidden',
  },
  kpiGradient: {
    paddingHorizontal: 11,
    paddingVertical: 9,
    justifyContent: 'space-between',
  },
  kpiTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  kpiIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  kpiCount: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginVertical: 1,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
  },
  kpiSub: {
    fontSize: 9,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 0.5,
  },
  kpiBadgePillEmerald: {
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  kpiBadgePillEmeraldText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#059669',
  },
  kpiBadgePillBlue: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  kpiBadgePillBlueText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#0284C7',
  },
  kpiBadgePillPurple: {
    backgroundColor: '#F5F3FF',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  kpiBadgePillPurpleText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#7C3AED',
  },
  kpiBadgePillAmber: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  kpiBadgePillAmberText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#D97706',
  },
});

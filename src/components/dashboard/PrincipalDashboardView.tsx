import React, { useState, useMemo, useEffect } from 'react';
import {
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

import { mobileApiService, unwrapApiData } from '../../services/mobileApiService';
import PrincipalMonthlyReportModal from './PrincipalMonthlyReportModal';
import PrincipalKpiDrilldownModal, { PrincipalKpiType } from './PrincipalKpiDrilldownModal';
import PrincipalAttendanceModal from './PrincipalAttendanceModal';
import PrincipalTeacherMonitoringModal from './PrincipalTeacherMonitoringModal';
import PrincipalChatModal from './PrincipalChatModal';
import PrincipalAchievementModal from './PrincipalAchievementModal';
import WeeklyEvaluationReportPaperModal from '../WeeklyEvaluationReportPaperModal';
import AppFeedbackModal, { FeedbackType } from '../AppFeedbackModal';
import { SUPERVISI_GURU_ILLUSTRATION } from '../../utils/profile';

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

function getAnnouncementCategory(ann: any): string {
  if (ann?.kategori && typeof ann.kategori === 'string') return ann.kategori;
  if (ann?.target && typeof ann.target === 'string') return ann.target;
  return 'Edaran Resmi';
}

interface PrincipalDashboardViewProps {
  dashboard: Record<string, any>;
  navigation: any;
  onOpenAllMenus?: () => void;
  onRefresh?: () => void;
}

export default function PrincipalDashboardView({
  dashboard,
  navigation,
  onOpenAllMenus,
  onRefresh,
}: PrincipalDashboardViewProps) {
  const data = dashboard?.data || dashboard || {};
  const kpis = data?.kpis || {};
  const schoolInfo = data?.school_info || data?.schoolInfo || data?.context?.unit || dashboard?.school_info || {};
  const unitName = schoolInfo?.nama || schoolInfo?.name || 'Unit Madrasah';
  const unitNpsn = schoolInfo?.npsn || '';
  const unitKode = schoolInfo?.kode || schoolInfo?.code || '';
  const unitAkreditasi = schoolInfo?.akreditasi || '-';
  const unitStatus = schoolInfo?.status || (schoolInfo?.is_active === false ? 'Nonaktif' : 'Aktif / Operasional');
  const unitAlamat = schoolInfo?.alamat || schoolInfo?.kota || '-';
  const unitKepalaSekolah = schoolInfo?.kepala_sekolah || '';
  const unitKontak = schoolInfo?.kontak || '';
  const tahunAjaran = data?.context?.tahun_ajaran?.nama || data?.context?.tahun_ajaran?.name || data?.school_info?.tahun_ajaran || '-';
  const semester = data?.context?.semester?.nama || data?.context?.semester?.name || data?.school_info?.semester || '-';

  // Navigation Tab State (3 Executive Views)
  const [activeTab, setActiveTab] = useState<'ringkasan' | 'kesiswaan' | 'civitas'>('ringkasan');

  // Modal States
  const [activeKpiModal, setActiveKpiModal] = useState<PrincipalKpiType | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
  const [selectedAttendanceStatus, setSelectedAttendanceStatus] = useState<'all' | 'Hadir' | 'Terlambat' | 'Izin' | 'Sakit' | 'Alpha'>('all');
  const [isTeacherMonitoringModalOpen, setIsTeacherMonitoringModalOpen] = useState(false);
  const [isAchievementModalOpen, setIsAchievementModalOpen] = useState(false);
  const [activeChatUser, setActiveChatUser] = useState<any>(null);
  const [selectedStudentForPrint, setSelectedStudentForPrint] = useState<any>(null);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<any>(null);

  const handleOpenAttendanceWithStatus = (status: 'all' | 'Hadir' | 'Terlambat' | 'Izin' | 'Sakit' | 'Alpha') => {
    setSelectedAttendanceStatus(status);
    setIsAttendanceModalOpen(true);
  };

  // Sub-Filters State
  const [onlineFilter, setOnlineFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [trendScheduleMode, setTrendScheduleMode] = useState<'fullday' | 'pesantren'>('fullday');
  const [inlineAttendanceStatus, setInlineAttendanceStatus] = useState<string>('all');
  const [civitasTab, setCivitasTab] = useState<'online' | 'logs'>('online');
  const [inlinePrestasiCategory, setInlinePrestasiCategory] = useState<string>('all');
  const [inlinePrestasiTingkat, setInlinePrestasiTingkat] = useState<string>('all');
  const [inlinePrestasiSearch, setInlinePrestasiSearch] = useState<string>('');

  // Feedback Modal
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
  } | null>(null);

  const [empDashboardStats, setEmpDashboardStats] = useState<any>(null);
  const [studentDashboardStats, setStudentDashboardStats] = useState<any>(null);

  // Sinkronisasi Sumber Data Statistik: GET /api/employees/dashboard & GET /api/students/dashboard
  useEffect(() => {
    let isMounted = true;
    const fetchAuxDashboards = async () => {
      try {
        const targetUnitId = schoolInfo?.id || data?.context?.unit?.id;
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
  }, [schoolInfo?.id, data?.context?.unit?.id]);

  // KPI Metrics Calculation — Selaras 100% dengan Web Dashboard (KepalaSekolahDashboardPage.jsx)
  const totalSiswa = kpis?.total_siswa?.total ?? data?.total_siswa ?? dashboard?.total_students ?? studentDashboardStats?.total_siswa ?? studentDashboardStats?.total ?? 0;
  const totalGuru = kpis?.total_guru?.total ?? data?.total_guru ?? dashboard?.total_teachers ?? empDashboardStats?.total_guru ?? 0;
  const totalTendik = kpis?.total_tendik?.total ?? (kpis?.total_pegawai?.total ? Math.max(0, (kpis.total_pegawai.total || 0) - (kpis.total_guru?.total || 0)) : (empDashboardStats?.total_tendik ?? Math.max(0, (data?.total_pegawai || 0) - totalGuru)));
  const totalPegawai = kpis?.total_pegawai?.total ?? (totalGuru + totalTendik);
  const totalRombel = kpis?.total_rombel?.total ?? kpis?.total_kelas?.total ?? data?.total_rombel ?? studentDashboardStats?.total_kelas ?? 0;

  const hadirCount = kpis?.siswa_hadir_hari_ini?.total ?? data?.hadir_count ?? 0;
  const terlambatCount = kpis?.siswa_terlambat?.total ?? data?.terlambat_count ?? 0;
  const izinCount = kpis?.siswa_izin?.total ?? data?.izin_count ?? 0;
  const sakitCount = kpis?.siswa_sakit?.total ?? data?.sakit_count ?? 0;
  const alphaCount = kpis?.siswa_alpha?.total ?? data?.alpha_count ?? 0;
  const setoranTahfizhCount = kpis?.setoran_tahfizh_hari_ini?.total ?? data?.tahfizh_count ?? 0;

  const attendanceRate = totalSiswa > 0 ? Math.round(((hadirCount + terlambatCount) / totalSiswa) * 100) : 0;

  // 1. Profil Pengurus Yayasan (Ketua, Sekretaris, Bendahara)
  const pengurusYayasanList = useMemo(() => {
    return Array.isArray(data?.pengurus_yayasan) ? data.pengurus_yayasan : [];
  }, [data]);

  const currentCalYear = useMemo(() => new Date().getFullYear(), []);
  const defaultTA = useMemo(() => {
    const month = new Date().getMonth();
    return month >= 6 ? `${currentCalYear}/${currentCalYear + 1}` : `${currentCalYear - 1}/${currentCalYear}`;
  }, [currentCalYear]);
  const defaultPeriode = useMemo(() => {
    const base = Math.floor(currentCalYear / 5) * 5;
    return `${base} - ${base + 5}`;
  }, [currentCalYear]);

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

  const cleanPeriode = useMemo(() => {
    const raw =
      pengurusYayasanList[0]?.periode ||
      data?.context?.yayasan?.periode ||
      defaultPeriode;
    return String(raw).replace(/^periode\s*/i, '').trim() || defaultPeriode;
  }, [pengurusYayasanList, data, defaultPeriode]);

  // 2. Online Users (Pegawai & Guru Online Real-Time)
  const onlineUsers = useMemo(() => {
    return Array.isArray(data?.online_users) ? data.online_users : [];
  }, [data]);

  const filteredOnlineUsers = useMemo(() => {
    if (onlineFilter === 'online') return onlineUsers.filter((u: any) => u.is_online);
    if (onlineFilter === 'offline') return onlineUsers.filter((u: any) => !u.is_online);
    return onlineUsers;
  }, [onlineUsers, onlineFilter]);

  // 3. Log Keaktifan & Activity Feed Real-Time
  const onlineLogs = useMemo(() => {
    return Array.isArray(data?.online_logs) ? data.online_logs : [];
  }, [data]);

  // 4. Monitoring Kehadiran Siswa Hari Ini
  const studentAttendanceList = useMemo(() => {
    return Array.isArray(data?.student_attendance)
      ? data.student_attendance
      : Array.isArray(data?.student_attendance_list)
      ? data.student_attendance_list
      : [];
  }, [data]);

  const filteredInlineStudents = useMemo(() => {
    if (inlineAttendanceStatus === 'all') return studentAttendanceList;
    return studentAttendanceList.filter((s: any) =>
      String(s.status || '').toLowerCase() === inlineAttendanceStatus.toLowerCase()
    );
  }, [studentAttendanceList, inlineAttendanceStatus]);

  // 5. Tren Kehadiran Siswa
  const attendanceTrendData = useMemo(() => {
    const charts = data?.charts || {};
    if (trendScheduleMode === 'pesantren') {
      return Array.isArray(charts?.pesantren_trend) && charts.pesantren_trend.length > 0
        ? charts.pesantren_trend
        : Array.isArray(charts?.attendance_trend)
        ? charts.attendance_trend
        : [];
    }
    return Array.isArray(charts?.fullday_trend) && charts.fullday_trend.length > 0
      ? charts.fullday_trend
      : Array.isArray(charts?.attendance_trend)
      ? charts.attendance_trend
      : [];
  }, [data, trendScheduleMode]);

  // 6. Announcements List
  const announcementList = useMemo(() => {
    if (Array.isArray(data?.tables?.announcements)) return data.tables.announcements;
    if (Array.isArray(data?.announcements)) return data.announcements;
    return [];
  }, [data]);

  // 7. Rekapitulasi Prestasi Siswa
  const rekapPrestasiList = useMemo(() => {
    if (Array.isArray(data?.tables?.rekap_prestasi)) return data.tables.rekap_prestasi;
    if (Array.isArray(data?.rekap_prestasi)) return data.rekap_prestasi;
    return [];
  }, [data]);

  const prestasiCategoryCounts = useMemo(() => {
    const counts = {
      all: rekapPrestasiList.length,
      tahfizh: 0,
      akademik: 0,
      olahraga: 0,
      seni: 0,
    };
    rekapPrestasiList.forEach((pr: any) => {
      const kat = (pr.kategori || pr.jenis_prestasi || pr.jenis || '').toLowerCase();
      if (kat.includes('tahfizh') || kat.includes('qur\'an')) counts.tahfizh++;
      else if (kat.includes('akademik') || kat.includes('sains') || kat.includes('matematika') || kat.includes('bahasa')) counts.akademik++;
      else if (kat.includes('olahraga') || kat.includes('silat') || kat.includes('futsal') || kat.includes('renang') || kat.includes('panahan')) counts.olahraga++;
      else if (kat.includes('seni') || kat.includes('kaligrafi') || kat.includes('budaya') || kat.includes('puisi')) counts.seni++;
    });
    return counts;
  }, [rekapPrestasiList]);

  const filteredRekapPrestasiList = useMemo(() => {
    return rekapPrestasiList.filter((pr: any) => {
      // 1. Kategori
      const kat = (pr.kategori || pr.jenis_prestasi || pr.jenis || '').toLowerCase();
      let matchCat = true;
      if (inlinePrestasiCategory !== 'all') {
        if (inlinePrestasiCategory === 'tahfizh') {
          matchCat = kat.includes('tahfizh') || kat.includes('qur\'an');
        } else if (inlinePrestasiCategory === 'akademik') {
          matchCat = kat.includes('akademik') || kat.includes('sains') || kat.includes('matematika') || kat.includes('bahasa');
        } else if (inlinePrestasiCategory === 'olahraga') {
          matchCat = kat.includes('olahraga') || kat.includes('silat') || kat.includes('futsal') || kat.includes('renang') || kat.includes('panahan');
        } else if (inlinePrestasiCategory === 'seni') {
          matchCat = kat.includes('seni') || kat.includes('kaligrafi') || kat.includes('budaya') || kat.includes('puisi');
        } else {
          matchCat = kat.includes(inlinePrestasiCategory.toLowerCase());
        }
      }

      // 2. Tingkat
      const tingkat = (pr.tingkat_prestasi || pr.tingkat || '').toLowerCase();
      let matchTingkat = true;
      if (inlinePrestasiTingkat !== 'all') {
        matchTingkat = tingkat.includes(inlinePrestasiTingkat.toLowerCase());
      }

      // 3. Search query
      const q = inlinePrestasiSearch.trim().toLowerCase();
      let matchSearch = true;
      if (q) {
        const sName = (pr.nama_siswa || pr.siswa_nama || '').toLowerCase();
        const pName = (pr.nama_prestasi || pr.jenis_prestasi || pr.jenis || '').toLowerCase();
        const kName = (pr.kelas_nama || pr.kelas || '').toLowerCase();
        matchSearch = sName.includes(q) || pName.includes(q) || kName.includes(q);
      }

      return matchCat && matchTingkat && matchSearch;
    });
  }, [rekapPrestasiList, inlinePrestasiCategory, inlinePrestasiTingkat, inlinePrestasiSearch]);

  // WhatsApp Helper
  const handleOpenWhatsApp = (phone: string, studentName?: string) => {
    const cleanPhone = String(phone || '').replace(/\D/g, '').replace(/^0/, '62');
    if (cleanPhone.length < 8) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Nomor WhatsApp Tidak Valid',
        message: 'Nomor kontak belum terdaftar atau format tidak sesuai.',
      });
      return;
    }
    const message = studentName
      ? encodeURIComponent(`Assalamu'alaikum Warahmatullahi Wabarakatuh. Menghubungi dari pihak Madrasah terkait ananda ${studentName}.`)
      : encodeURIComponent(`Assalamu'alaikum Warahmatullahi Wabarakatuh.`);
    Linking.openURL(`https://wa.me/${cleanPhone}?text=${message}`).catch(() => {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Membuka WhatsApp',
        message: 'Pastikan aplikasi WhatsApp telah terpasang pada perangkat Anda.',
      });
    });
  };

  // Safe Phone Call Helper (Prevents crash if telephone app is unavailable)
  const handleCallPhone = (phone: string, name?: string) => {
    const cleanPhone = String(phone || '').replace(/[^\d+]/g, '');
    if (!cleanPhone || cleanPhone.length < 5) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Nomor Telepon Tidak Valid',
        message: `Nomor telepon ${name ? `untuk ${name}` : ''} belum terdaftar atau format tidak sesuai.`,
      });
      return;
    }
    Linking.openURL(`tel:${cleanPhone}`).catch(() => {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Membuka Panggilan',
        message: 'Perangkat ini tidak mendukung panggilan telepon langsung atau aplikasi telepon tidak tersedia.',
      });
    });
  };

  // Safe Navigation Helper (Prevents force close if a route is not registered or inaccessible)
  const safeNavigate = (screenName: string, params?: Record<string, any>) => {
    try {
      if (!navigation) {
        setFeedbackModal({
          visible: true,
          type: 'warning',
          title: 'Navigasi Belum Siap',
          message: 'Komponen navigasi belum terhubung.',
        });
        return;
      }
      navigation.navigate(screenName, params);
    } catch (err: any) {
      console.log(`[NAVIGATION] Gagal membuka route "${screenName}":`, err);
      setFeedbackModal({
        visible: true,
        type: 'info',
        title: 'Fitur Sedang Dipersiapkan',
        message: `Modul ${screenName} sedang dalam sinkronisasi dengan hak akses akun Anda.`,
      });
    }
  };

  const QBtn = ({ icon, iconBg, label, onPress, image, badge }: {
    icon: string; iconBg: string; label: string; onPress: () => void; image?: any; badge?: string;
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
      <Text style={styles.qBtnLabel} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* ── 1. RINGKASAN IDENTITAS UNIT SEKOLAH (COMPACT & NON-DUPLICATIVE) ── */}
      <View style={styles.identityCard}>
        <View style={styles.identityTopRow}>
          <View style={styles.identityLeftCol}>
            <View style={styles.identityTitleRow}>
              <MaterialCommunityIcons name="domain" size={18} color="#059669" />
              <Text numberOfLines={1} style={styles.identityUnitName}>
                {unitName}
              </Text>
            </View>
            <Text numberOfLines={1} style={styles.identitySubText}>
              NPSN: {unitNpsn || '—'} • Kode: {unitKode || '—'}
            </Text>
          </View>
          <View style={styles.identityStatusBadge}>
            <View style={styles.identityStatusDot} />
            <Text style={styles.identityStatusText}>{unitStatus}</Text>
          </View>
        </View>

        {/* Micro-Chips Row */}
        <View style={styles.identityChipsRow}>
          <View style={[styles.microChip, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
            <MaterialCommunityIcons name="calendar-check" size={11} color="#059669" />
            <Text style={[styles.microChipText, { color: '#065F46' }]}>TA {tahunAjaran}</Text>
          </View>
          <View style={[styles.microChip, { backgroundColor: '#F3E8FF', borderColor: '#E9D5FF' }]}>
            <MaterialCommunityIcons name="book-clock-outline" size={11} color="#7C3AED" />
            <Text style={[styles.microChipText, { color: '#6D28D9' }]}>{semester}</Text>
          </View>
          <View style={[styles.microChip, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
            <MaterialCommunityIcons name="star-outline" size={11} color="#D97706" />
            <Text style={[styles.microChipText, { color: '#B45309' }]}>Akreditasi {unitAkreditasi}</Text>
          </View>
        </View>

        {/* Location & Principal Strip */}
        <View style={styles.identityDetailRow}>
          <View style={styles.identityDetailItem}>
            <MaterialCommunityIcons name="map-marker-outline" size={12} color="#64748B" />
            <Text numberOfLines={1} style={styles.identityDetailText}>
              {unitAlamat}
            </Text>
          </View>
          {Boolean(unitKepalaSekolah) && (
            <View style={styles.identityDetailItem}>
              <MaterialCommunityIcons name="account-tie-outline" size={12} color="#64748B" />
              <Text numberOfLines={1} style={styles.identityDetailText}>
                KS: {unitKepalaSekolah}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* ── 2. SEGMENTED TAB SWITCHER (ERGONOMIS & ZERO-CLUTTER) ── */}
      <View style={styles.tabSwitcherContainer}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setActiveTab('ringkasan')}
          style={[styles.tabButton, activeTab === 'ringkasan' && styles.tabButtonActive]}
        >
          <MaterialCommunityIcons
            name="view-dashboard-outline"
            size={18}
            color={activeTab === 'ringkasan' ? '#FFFFFF' : '#64748B'}
          />
          <Text style={[styles.tabButtonText, activeTab === 'ringkasan' && styles.tabButtonTextActive]}>
            Ringkasan
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setActiveTab('kesiswaan')}
          style={[styles.tabButton, activeTab === 'kesiswaan' && styles.tabButtonActive]}
        >
          <MaterialCommunityIcons
            name="account-group-outline"
            size={18}
            color={activeTab === 'kesiswaan' ? '#FFFFFF' : '#64748B'}
          />
          <Text style={[styles.tabButtonText, activeTab === 'kesiswaan' && styles.tabButtonTextActive]}>
            Kesiswaan
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setActiveTab('civitas')}
          style={[styles.tabButton, activeTab === 'civitas' && styles.tabButtonActive]}
        >
          <MaterialCommunityIcons
            name="trophy-award"
            size={18}
            color={activeTab === 'civitas' ? '#FFFFFF' : '#64748B'}
          />
          <Text style={[styles.tabButtonText, activeTab === 'civitas' && styles.tabButtonTextActive]}>
            Prestasi Siswa
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── 3. KONTEN TAB 1: RINGKASAN & KBM ── */}
      {activeTab === 'ringkasan' && (
        <View style={styles.tabContentWrap}>
          {/* A. 4 METRIK UTAMA UNIT SEKOLAH (2x2 Grid) */}
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleWithIcon}>
              <View style={[styles.sectionIconBadge, { backgroundColor: '#DEF7EC' }]}>
                <MaterialCommunityIcons name="chart-box-outline" size={16} color="#059669" />
              </View>
              <View>
                <Text style={styles.sectionTitleBold}>Metrik Utama Unit Sekolah</Text>
                <Text style={styles.sectionSubtitleText}>Ketuk kartu untuk melihat rincian drill-down</Text>
              </View>
            </View>
          </View>

          <View style={styles.kpiGrid}>
            {/* Siswa */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setActiveKpiModal('total_siswa')}
              style={[styles.kpiCard, { borderColor: '#A7F3D0' }]}
              accessibilityLabel={`Total Siswa Aktif: ${totalSiswa} siswa`}
            >
              <LinearGradient colors={['#ECFDF5', '#F0FDF4']} style={styles.kpiGradient}>
                <View style={styles.kpiTopRow}>
                  <View style={[styles.kpiIconWrap, { backgroundColor: '#059669' }]}>
                    <MaterialCommunityIcons name="school" size={17} color="#FFFFFF" />
                  </View>
                  <Text style={[styles.kpiCount, { color: '#047857' }]}>{totalSiswa}</Text>
                </View>
                <Text style={styles.kpiLabel}>Total Siswa Aktif</Text>
                <Text style={styles.kpiSub}>Terdaftar aktif di unit sekolah</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Guru */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setActiveKpiModal('total_guru')}
              style={[styles.kpiCard, { borderColor: '#BAE6FD' }]}
              accessibilityLabel={`Total Guru Pengajar: ${totalGuru} guru`}
            >
              <LinearGradient colors={['#F0F9FF', '#E0F2FE']} style={styles.kpiGradient}>
                <View style={styles.kpiTopRow}>
                  <View style={[styles.kpiIconWrap, { backgroundColor: '#0284C7' }]}>
                    <MaterialCommunityIcons name="account-tie" size={17} color="#FFFFFF" />
                  </View>
                  <Text style={[styles.kpiCount, { color: '#0369A1' }]}>{totalGuru}</Text>
                </View>
                <Text style={styles.kpiLabel}>Total Guru Pengajar</Text>
                <Text style={styles.kpiSub}>Tenaga pendidik aktif</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Pegawai / Tendik */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setActiveKpiModal('total_tendik')}
              style={[styles.kpiCard, { borderColor: '#DDD6FE' }]}
              accessibilityLabel={`Total Tendik: ${totalTendik} staf (Total SDM: ${totalPegawai})`}
            >
              <LinearGradient colors={['#F5F3FF', '#EDE9FE']} style={styles.kpiGradient}>
                <View style={styles.kpiTopRow}>
                  <View style={[styles.kpiIconWrap, { backgroundColor: '#7C3AED' }]}>
                    <MaterialCommunityIcons name="account-check" size={17} color="#FFFFFF" />
                  </View>
                  <Text style={[styles.kpiCount, { color: '#6D28D9' }]}>{totalTendik}</Text>
                </View>
                <Text style={styles.kpiLabel}>Total Tendik / Staf</Text>
                <Text style={styles.kpiSub}>Administrasi & teknis (Total SDM: {totalPegawai})</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Rombel */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setActiveKpiModal('total_kelas')}
              style={[styles.kpiCard, { borderColor: '#FDE68A' }]}
              accessibilityLabel={`Total Rombel: ${totalRombel} rombel`}
            >
              <LinearGradient colors={['#FFFBEB', '#FEF3C7']} style={styles.kpiGradient}>
                <View style={styles.kpiTopRow}>
                  <View style={[styles.kpiIconWrap, { backgroundColor: '#D97706' }]}>
                    <MaterialCommunityIcons name="door-open" size={17} color="#FFFFFF" />
                  </View>
                  <Text style={[styles.kpiCount, { color: '#B45309' }]}>{totalRombel}</Text>
                </View>
                <Text style={styles.kpiLabel}>Total Rombel / Kelas</Text>
                <Text style={styles.kpiSub}>Rombongan belajar aktif</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* B. RINGKASAN PRESENSI & SETORAN TAHFIZH HARI INI (ANTI-BERTUMPUK) */}
          <View style={styles.cardContainer}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleWithIcon}>
                <View style={[styles.sectionIconBadge, { backgroundColor: '#DEF7EC' }]}>
                  <MaterialCommunityIcons name="clipboard-check-outline" size={16} color="#059669" />
                </View>
                <View>
                  <Text style={styles.sectionTitleBold}>Kondisi Presensi Hari Ini</Text>
                  <Text style={styles.sectionSubtitleText}>Pemantauan santri & hafalan quran</Text>
                </View>
              </View>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setIsAttendanceModalOpen(true)}
                style={styles.detailLinkBtn}
              >
                <Text style={styles.detailLinkBtnText}>Buka Rekap</Text>
                <MaterialCommunityIcons name="chevron-right" size={14} color="#059669" />
              </TouchableOpacity>
            </View>

            {/* Gauge & Progress Bar Banner */}
            <View style={styles.presenceRateBanner}>
              <View style={styles.presenceGaugeBox}>
                <Text style={styles.presenceGaugeRate}>{attendanceRate}%</Text>
                <Text style={styles.presenceGaugeSub}>Tingkat Kehadiran</Text>
              </View>
              <View style={styles.presenceProgressBarWrap}>
                <View style={styles.presenceBarLabelRow}>
                  <Text style={styles.presenceBarLabelLeft}>Total Hadir: {hadirCount + terlambatCount} Santri</Text>
                  <Text style={styles.presenceBarLabelRight}>Target: {totalSiswa}</Text>
                </View>
                <View style={styles.presenceBarTrack}>
                  <View style={[styles.presenceBarFill, { width: `${Math.min(attendanceRate, 100)}%` }]} />
                </View>
              </View>
            </View>

            {/* 5 Distinct Metric Cards (2 Rows with Generous Breathing Room) */}
            <View style={styles.presenceMetricsGrid}>
              {/* Row 1: Hadir & Terlambat */}
              <View style={styles.presenceMetricsRow}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => handleOpenAttendanceWithStatus('Hadir')}
                  style={[styles.presenceBox, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}
                >
                  <View style={[styles.presenceBoxIconCircle, { backgroundColor: '#059669' }]}>
                    <MaterialCommunityIcons name="check" size={14} color="#FFFFFF" />
                  </View>
                  <View style={styles.presenceBoxContent}>
                    <Text style={[styles.presenceBoxCount, { color: '#047857' }]}>{hadirCount}</Text>
                    <Text style={styles.presenceBoxLabel}>Hadir Tepat Waktu</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => handleOpenAttendanceWithStatus('Terlambat')}
                  style={[styles.presenceBox, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}
                >
                  <View style={[styles.presenceBoxIconCircle, { backgroundColor: '#D97706' }]}>
                    <MaterialCommunityIcons name="clock-outline" size={14} color="#FFFFFF" />
                  </View>
                  <View style={styles.presenceBoxContent}>
                    <Text style={[styles.presenceBoxCount, { color: '#B45309' }]}>{terlambatCount}</Text>
                    <Text style={styles.presenceBoxLabel}>Terlambat Hadir</Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Row 2: Izin, Sakit, Tahfizh */}
              <View style={styles.presenceMetricsRow}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => handleOpenAttendanceWithStatus('Izin')}
                  style={[styles.presenceBoxMini, { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }]}
                >
                  <View style={[styles.presenceBoxIconCircle, { backgroundColor: '#0284C7' }]}>
                    <MaterialCommunityIcons name="file-document-outline" size={12} color="#FFFFFF" />
                  </View>
                  <Text style={[styles.presenceBoxCount, { color: '#0369A1' }]}>{izinCount}</Text>
                  <Text style={styles.presenceBoxLabel}>Izin</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => handleOpenAttendanceWithStatus('Sakit')}
                  style={[styles.presenceBoxMini, { backgroundColor: '#FFF1F2', borderColor: '#FECDD3' }]}
                >
                  <View style={[styles.presenceBoxIconCircle, { backgroundColor: '#E11D48' }]}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={12} color="#FFFFFF" />
                  </View>
                  <Text style={[styles.presenceBoxCount, { color: '#BE123C' }]}>{sakitCount}</Text>
                  <Text style={styles.presenceBoxLabel}>Sakit</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setActiveKpiModal('setoran_tahfizh')}
                  style={[styles.presenceBoxMini, { backgroundColor: '#FAF5FF', borderColor: '#E9D5FF' }]}
                >
                  <View style={[styles.presenceBoxIconCircle, { backgroundColor: '#7C3AED' }]}>
                    <MaterialCommunityIcons name="book-open-page-variant" size={12} color="#FFFFFF" />
                  </View>
                  <Text style={[styles.presenceBoxCount, { color: '#6D28D9' }]}>{setoranTahfizhCount}</Text>
                  <Text style={styles.presenceBoxLabel}>Tahfizh</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* C. MENU UTAMA KEPALA SEKOLAH (STYLE UI/UX TATA USAHA) */}

          {/* Modul 1: Manajemen & Laporan Pimpinan */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconBadge, { backgroundColor: '#CCFBF1' }]}>
                <MaterialCommunityIcons name="shield-account" size={16} color="#0D9488" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Manajemen & Laporan Pimpinan</Text>
                <Text style={styles.sectionSubtitle}>Laporan bulanan, evaluasi, prestasi & mutasi</Text>
              </View>
            </View>
            <View style={styles.qBtnGrid}>
              <QBtn icon="database-outline"           iconBg="#0284C7" label="Data Master"     onPress={() => safeNavigate('Data')} />
              <QBtn icon="file-document-edit-outline" iconBg="#0D9488" label="Input Laporan"   onPress={() => setIsReportModalOpen(true)} />
              <QBtn icon="human-male-board"           iconBg="#0F766E" label="Supervisi Guru"  onPress={() => setIsTeacherMonitoringModalOpen(true)} />
              <QBtn icon="trophy-award"               iconBg="#D97706" label="Prestasi Siswa"  onPress={() => setIsAchievementModalOpen(true)} />
              <QBtn icon="account-switch-outline"     iconBg="#7C3AED" label="Kelola Alumni & Mutasi" onPress={() => safeNavigate('MutasiSiswa')} />
              <QBtn icon="google-classroom"           iconBg="#D97706" label="Pantau Kelas"   onPress={() => safeNavigate('PantauKelas')} />
              <QBtn icon="refresh"                    iconBg="#475569" label="Segarkan Data"   onPress={() => { if (onRefresh) onRefresh(); }} />
            </View>
          </View>

          {/* Modul 2: Presensi & Kehadiran */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconBadge, { backgroundColor: '#CCFBF1' }]}>
                <MaterialCommunityIcons name="clock-check-outline" size={16} color="#0D9488" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Presensi & Kehadiran</Text>
                <Text style={styles.sectionSubtitle}>Monitoring kehadiran siswa, guru & gerbang</Text>
              </View>
            </View>
            <View style={styles.qBtnGrid}>
              <QBtn icon="account-check-outline"  iconBg="#059669" label="Presensi Guru"  onPress={() => safeNavigate('RekapPresensiGuru', { defaultSubject: 'pegawai', lockedSubject: 'pegawai' })} />
              <QBtn icon="account-group"          iconBg="#0284C7" label="Presensi Siswa" onPress={() => safeNavigate('RekapPresensiSiswa', { defaultSubject: 'siswa', lockedSubject: 'siswa' })} />
              <QBtn icon="door-open"              iconBg="#0D9488" label="Absensi Gerbang" onPress={() => safeNavigate('AbsensiGerbangTerminal')} />
              <QBtn icon="calendar-check-outline" iconBg="#059669" label="Presensi KBM"     onPress={() => safeNavigate('PresensiKbmPengganti')} />
              <QBtn icon="file-document-edit"     iconBg="#D97706" label="Izin & Cuti"     onPress={() => safeNavigate('Perizinan', { tab: 'permissions' })} />
              <QBtn icon="door-closed"            iconBg="#E11D48" label="Izin Asrama"     onPress={() => safeNavigate('Perizinan', { tab: 'boarding' })} />
              <QBtn icon="calendar-check-outline" iconBg="#10B981" label="Presensi Mandiri" onPress={() => safeNavigate('PresensiMandiriStaff')} />
            </View>
          </View>

          {/* Modul 3: Akademik & LMS */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconBadge, { backgroundColor: '#DBEAFE' }]}>
                <MaterialCommunityIcons name="school-outline" size={16} color="#2563EB" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Akademik & LMS</Text>
                <Text style={styles.sectionSubtitle}>Jadwal, materi, tugas, CBT & penilaian</Text>
              </View>
            </View>
            <View style={styles.qBtnGrid}>
              <QBtn icon="calendar-clock"   iconBg="#7C3AED" label="Jadwal Pelajaran" onPress={() => safeNavigate('Jadwal')} />
              <QBtn icon="book-open-page-variant" iconBg="#0D9488" label="Materi Belajar" onPress={() => safeNavigate('Materi')} />
              <QBtn icon="clipboard-text"   iconBg="#F59E0B" label="Tugas Siswa"    onPress={() => safeNavigate('Tugas')} />
              <QBtn icon="calendar-month"   iconBg="#2563EB" label="Kalender Akademik" onPress={() => safeNavigate('Kalender')} />
              <QBtn icon="laptop"           iconBg="#2563EB" label="CBT Ujian Online" onPress={() => safeNavigate('CbtExams')} />
              <QBtn icon="database-outline" iconBg="#059669" label="Bank Soal"      onPress={() => safeNavigate('BankSoal')} />
              <QBtn icon="file-question"    iconBg="#EF4444" label="Kisi-kisi Ujian" onPress={() => safeNavigate('KisiKisi')} />
              <QBtn icon="card-account-details-star-outline" iconBg="#10B981" label="Penilaian & Rapor" onPress={() => safeNavigate('Nilai')} />
            </View>
          </View>

          {/* Modul 4: Keagamaan & Komunikasi */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconBadge, { backgroundColor: '#F3E8FF' }]}>
                <MaterialCommunityIcons name="book-open-variant" size={16} color="#7C3AED" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Keagamaan & Komunikasi</Text>
                <Text style={styles.sectionSubtitle}>Tahfizh Al-Qur'an, mutaba'ah & koordinasi</Text>
              </View>
            </View>
            <View style={styles.qBtnGrid}>
              <QBtn icon="book-marker"          iconBg="#059669" label="Setoran Tahfizh" onPress={() => safeNavigate('Tahfizh')} />
              <QBtn icon="clipboard-check"      iconBg="#E11D48" label="Mutaba'ah"       onPress={() => safeNavigate('Mutabaah')} />
              <QBtn icon="book-open-variant"    iconBg="#0284C7" label="Al-Qur'an"       onPress={() => safeNavigate('Quran')} />
              <QBtn icon="hands-pray"           iconBg="#0D9488" label="Doa & Dzikir"    onPress={() => safeNavigate('DoaDzikir')} />
              <QBtn icon="message-text-outline" iconBg="#059669" label="Chat Pegawai"    onPress={() => safeNavigate('Chat Guru')} />
              <QBtn icon="bullhorn-outline"     iconBg="#0284C7" label="Informasi"       onPress={() => safeNavigate('Informasi')} />
            </View>
          </View>


          {/* E. STAF ONLINE & LOG KEAKTIFAN FEED (PINDAH KE HALAMAN UTAMA) */}
          <View style={styles.cardContainer}>
            <View style={styles.civitasSwitcherRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setCivitasTab('online')}
                style={[styles.civitasTabBtn, civitasTab === 'online' && styles.civitasTabBtnActive]}
              >
                <View style={styles.onlinePulseBox}>
                  <View style={styles.onlineInnerDot} />
                </View>
                <Text style={[styles.civitasTabBtnText, civitasTab === 'online' && styles.civitasTabBtnTextActive]}>
                  Staf Online ({onlineUsers.filter((u: any) => u.is_online).length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setCivitasTab('logs')}
                style={[styles.civitasTabBtn, civitasTab === 'logs' && styles.civitasTabBtnActive]}
              >
                <MaterialCommunityIcons name="radio-tower" size={15} color={civitasTab === 'logs' ? '#059669' : '#64748B'} />
                <Text style={[styles.civitasTabBtnText, civitasTab === 'logs' && styles.civitasTabBtnTextActive]}>
                  Log Keaktifan
                </Text>
              </TouchableOpacity>
            </View>

            {civitasTab === 'online' ? (
              <View style={styles.onlinePersonnelWrap}>
                {/* Filter Pills */}
                <View style={styles.onlineFilterPillsRow}>
                  <TouchableOpacity
                    onPress={() => setOnlineFilter('all')}
                    style={[styles.onlineFilterChip, onlineFilter === 'all' && styles.onlineFilterChipActive]}
                  >
                    <Text style={[styles.onlineFilterChipText, onlineFilter === 'all' && styles.onlineFilterChipTextActive]}>
                      Semua ({onlineUsers.length})
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setOnlineFilter('online')}
                    style={[styles.onlineFilterChip, onlineFilter === 'online' && { backgroundColor: '#059669' }]}
                  >
                    <Text style={[styles.onlineFilterChipText, onlineFilter === 'online' && styles.onlineFilterChipTextActive]}>
                      Online ({onlineUsers.filter((u: any) => u.is_online).length})
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setOnlineFilter('offline')}
                    style={[styles.onlineFilterChip, onlineFilter === 'offline' && { backgroundColor: '#64748B' }]}
                  >
                    <Text style={[styles.onlineFilterChipText, onlineFilter === 'offline' && styles.onlineFilterChipTextActive]}>
                      Offline ({onlineUsers.filter((u: any) => !u.is_online).length})
                    </Text>
                  </TouchableOpacity>
                </View>

                {filteredOnlineUsers.length === 0 ? (
                  <View style={styles.emptyStateWrap}>
                    <MaterialCommunityIcons name="account-off-outline" size={26} color="#94A3B8" />
                    <Text style={styles.emptyStateText}>
                      {onlineFilter === 'online'
                        ? 'Tidak ada staf yang sedang online'
                        : onlineFilter === 'offline'
                        ? 'Tidak ada staf yang sedang offline'
                        : 'Belum ada data civitas staf'}
                    </Text>
                  </View>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.onlineAvatarsScroll}>
                    {filteredOnlineUsers.map((user: any) => (
                      <TouchableOpacity
                        key={user.id}
                        activeOpacity={0.8}
                        onPress={() => setActiveChatUser(user)}
                        style={styles.onlineUserTile}
                      >
                        <View style={styles.onlineAvatarBox}>
                          <Text style={styles.onlineAvatarLetters}>
                            {String(user.nama || user.name || 'PG').substring(0, 2).toUpperCase()}
                          </Text>
                          <View
                            style={[
                              styles.onlineStatusDot,
                              { backgroundColor: user.is_online ? '#10B981' : '#94A3B8' },
                            ]}
                          />
                        </View>
                        <Text style={styles.onlineUserName} numberOfLines={1}>{user.nama}</Text>
                        <Text style={styles.onlineUserRole} numberOfLines={1}>{user.role}</Text>
                        <View style={styles.onlineChatPill}>
                          <MaterialCommunityIcons name="chat-outline" size={11} color="#059669" />
                          <Text style={styles.onlineChatPillText}>Chat</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            ) : (
              <View style={styles.activityFeedWrap}>
                {onlineLogs.length === 0 ? (
                  <View style={styles.emptyStateWrap}>
                    <MaterialCommunityIcons name="history" size={26} color="#94A3B8" />
                    <Text style={styles.emptyStateText}>Belum ada catatan log keaktifan terbaru</Text>
                  </View>
                ) : (
                  onlineLogs.map((log: any, idx: number) => (
                    <View key={log.id || idx} style={styles.activityFeedItem}>
                      <View style={[styles.activityFeedIcon, { backgroundColor: log.type === 'login' ? '#ECFDF5' : '#EFF6FF' }]}>
                        <MaterialCommunityIcons
                          name={log.type === 'login' ? 'account-check' : 'lightning-bolt'}
                          size={16}
                          color={log.type === 'login' ? '#059669' : '#2563EB'}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={styles.activityFeedTop}>
                          <Text style={styles.activityFeedUser}>{log.user}</Text>
                          <Text style={styles.activityFeedTime}>{log.time}</Text>
                        </View>
                        <Text style={styles.activityFeedAction}>
                          <Text style={styles.activityFeedRoleTag}>[{log.role}]</Text> {log.action}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}
          </View>

          {/* D. PENGUMUMAN SEKOLAH TERBARU */}
          <View style={styles.cardContainer}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleWithIcon}>
                <View style={[styles.sectionIconBadge, { backgroundColor: '#FEF3C7' }]}>
                  <MaterialCommunityIcons name="bullhorn-outline" size={18} color="#D97706" />
                </View>
                <View>
                  <Text style={styles.sectionTitleBold}>Pengumuman Sekolah Terbaru</Text>
                  <Text style={styles.sectionSubtitleText}>Edaran resmi & informasi penting unit madrasah</Text>
                </View>
              </View>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => safeNavigate('Informasi')}
                style={styles.detailLinkBtn}
              >
                <Text style={styles.detailLinkBtnText}>Semua</Text>
                <MaterialCommunityIcons name="chevron-right" size={14} color="#059669" />
              </TouchableOpacity>
            </View>

            {announcementList.length === 0 ? (
              <View style={styles.emptyStateWrap}>
                <MaterialCommunityIcons name="bullhorn-outline" size={32} color="#94A3B8" />
                <Text style={styles.emptyStateText}>Belum ada pengumuman sekolah terbaru</Text>
              </View>
            ) : (
              <View style={styles.announcementListWrap}>
                {announcementList.slice(0, 3).map((ann: any, idx: number) => {
                  const imgUri = getAnnouncementImage(ann, idx);
                  const dateStr = getAnnouncementDate(ann);
                  const category = getAnnouncementCategory(ann);

                  return (
                    <TouchableOpacity
                      key={ann.id || idx}
                      activeOpacity={0.88}
                      onPress={() => setSelectedAnnouncement(ann)}
                      style={styles.announcementCard}
                    >
                      {/* Image Banner */}
                      <View style={styles.announcementImageWrap}>
                        <Image
                          source={{ uri: imgUri }}
                          style={styles.announcementImage}
                          resizeMode="cover"
                        />
                        <View style={styles.announcementCategoryOverlay}>
                          <Text style={styles.announcementCategoryOverlayText}>{category}</Text>
                        </View>
                        {ann.prioritas ? (
                          <View style={styles.announcementPriorityBadge}>
                            <MaterialCommunityIcons name="fire" size={11} color="#FFFFFF" />
                            <Text style={styles.announcementPriorityText}>Penting</Text>
                          </View>
                        ) : null}
                      </View>

                      {/* Content Body */}
                      <View style={styles.announcementBody}>
                        <View style={styles.announcementMetaRow}>
                          <View style={styles.announcementMetaItem}>
                            <MaterialCommunityIcons name="calendar-month-outline" size={13} color="#059669" />
                            <Text style={styles.announcementMetaDate}>{dateStr}</Text>
                          </View>
                          <View style={styles.announcementTargetBadge}>
                            <Text numberOfLines={1} style={styles.announcementTargetBadgeText}>
                              {ann.target || 'Semua Unit'}
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.announcementJudul} numberOfLines={2}>
                          {ann.judul}
                        </Text>

                        <Text style={styles.announcementSnippet} numberOfLines={2}>
                          {ann.ringkasan || ann.isi || 'Ketuk untuk membaca detail pengumuman madrasah selengkapnya.'}
                        </Text>

                        <View style={styles.announcementFooterRow}>
                          <Text style={styles.announcementReadMoreText}>Baca Selengkapnya</Text>
                          <View style={styles.announcementChevronCircle}>
                            <MaterialCommunityIcons name="arrow-right" size={13} color="#059669" />
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {announcementList.length > 0 && (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => safeNavigate('Informasi')}
                style={styles.seeAllAnnouncementsBtn}
              >
                <MaterialCommunityIcons name="newspaper-variant-multiple-outline" size={16} color="#059669" style={{ marginRight: 6 }} />
                <Text style={styles.seeAllAnnouncementsBtnText}>Buka Semua Informasi & Edaran</Text>
                <MaterialCommunityIcons name="arrow-right" size={15} color="#059669" style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            )}
          </View>
          <View style={{ height: 40 }} />
        </View>
      )}

      {/* ── 4. KONTEN TAB 2: KESISWAAN & PRESENSI ── */}
      {activeTab === 'kesiswaan' && (
        <View style={styles.tabContentWrap}>
          {/* A. TREN KEHADIRAN SISWA */}
          <View style={styles.cardContainer}>
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.sectionTitleBold}>Tren Kehadiran Siswa</Text>
                <Text style={styles.sectionSubtitleText}>Rata-rata presensi: {attendanceRate}%</Text>
              </View>

              {/* Mode Switcher */}
              <View style={styles.modeSwitchBox}>
                <TouchableOpacity
                  onPress={() => setTrendScheduleMode('fullday')}
                  style={[styles.modeTab, trendScheduleMode === 'fullday' && styles.modeTabActive]}
                >
                  <Text style={[styles.modeTabText, trendScheduleMode === 'fullday' && styles.modeTabTextActive]}>
                    Fullday
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setTrendScheduleMode('pesantren')}
                  style={[styles.modeTab, trendScheduleMode === 'pesantren' && styles.modeTabActive]}
                >
                  <Text style={[styles.modeTabText, trendScheduleMode === 'pesantren' && styles.modeTabTextActive]}>
                    Pesantren
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Daily Attendance Graph Bars */}
            <View style={styles.trendGraphWrap}>
              {attendanceTrendData.length === 0 ? (
                <View style={styles.emptyStateWrap}>
                  <MaterialCommunityIcons name="chart-bar" size={28} color="#CBD5E1" />
                  <Text style={styles.emptyStateText}>Data tren belum tersedia</Text>
                </View>
              ) : (
                attendanceTrendData.map((item: any, i: number) => {
                  const barHeightPct = Math.max(((item.rate ?? 0) / 100) * 80, 6);
                  const dayLabel = item.day_name || item.day || item.label || `H-${i + 1}`;
                  return (
                    <View key={i} style={styles.trendGraphCol}>
                      <Text style={styles.trendGraphRateText}>{item.rate ?? 0}%</Text>
                      <View style={styles.trendGraphBarTrack}>
                        <LinearGradient
                          colors={['#10B981', '#059669']}
                          style={[styles.trendGraphBarFill, { height: `${barHeightPct}%` }]}
                        />
                      </View>
                      <Text style={styles.trendGraphDayLabel}>{dayLabel.substring(0, 3)}</Text>
                    </View>
                  );
                })
              )}
            </View>

            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
                <Text style={styles.legendText}>Hadir ({hadirCount})</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
                <Text style={styles.legendText}>Terlambat ({terlambatCount})</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#0284C7' }]} />
                <Text style={styles.legendText}>Izin/Sakit ({izinCount + sakitCount})</Text>
              </View>
            </View>
          </View>

          {/* B. MONITORING KEHADIRAN SISWA HARI INI */}
          <View style={styles.cardContainer}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleWithIcon}>
                <View style={[styles.sectionIconBadge, { backgroundColor: '#DEF7EC' }]}>
                  <MaterialCommunityIcons name="account-group" size={16} color="#059669" />
                </View>
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.sectionTitleBold}>Presensi Siswa Hari Ini</Text>
                    <View style={styles.todayPill}>
                      <Text style={styles.todayPillText}>Real-Time</Text>
                    </View>
                  </View>
                  <Text style={styles.sectionSubtitleText}>Kesiswaan unit {unitName}</Text>
                </View>
              </View>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setIsAttendanceModalOpen(true)}
                style={styles.detailLinkBtn}
              >
                <Text style={styles.detailLinkBtnText}>Tabel Lengkap</Text>
                <MaterialCommunityIcons name="chevron-right" size={14} color="#059669" />
              </TouchableOpacity>
            </View>

            {/* Filter Tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.attendanceFilterScroll}>
              {['all', 'Hadir', 'Terlambat', 'Izin', 'Sakit', 'Alpha'].map((stKey) => {
                const isActive = inlineAttendanceStatus === stKey;
                const label = stKey === 'all' ? `Semua (${studentAttendanceList.length})` : stKey;
                return (
                  <TouchableOpacity
                    key={stKey}
                    onPress={() => setInlineAttendanceStatus(stKey)}
                    style={[styles.statusChipBtn, isActive && styles.statusChipBtnActive]}
                  >
                    <Text style={[styles.statusChipText, isActive && styles.statusChipTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* List of Student Cards */}
            <View style={styles.studentCardsList}>
              {filteredInlineStudents.length === 0 ? (
                <View style={styles.emptyStateWrap}>
                  <MaterialCommunityIcons name="account-search-outline" size={26} color="#94A3B8" />
                  <Text style={styles.emptyStateText}>
                    {inlineAttendanceStatus === 'all'
                      ? 'Belum ada data presensi santri hari ini'
                      : `Tidak ada santri dengan status "${inlineAttendanceStatus}"`}
                  </Text>
                </View>
              ) : (
                filteredInlineStudents.slice(0, 6).map((st: any) => {
                  const isHadir = st.status === 'Hadir';
                  const isTerlambat = st.status === 'Terlambat';
                  const isIzin = st.status === 'Izin';
                  const isSakit = st.status === 'Sakit';

                  const statusBg = isHadir ? '#ECFDF5' : isTerlambat ? '#FFFBEB' : isIzin ? '#F0F9FF' : '#FFF1F2';
                  const statusColor = isHadir ? '#059669' : isTerlambat ? '#D97706' : isIzin ? '#0284C7' : '#E11D48';

                  return (
                    <View key={st.id} style={styles.studentCardItem}>
                      <View style={styles.studentCardMain}>
                        <View style={[styles.studentCardAvatar, { backgroundColor: isHadir ? '#D1FAE5' : '#E0E7FF' }]}>
                          <Text style={[styles.studentCardInitials, { color: isHadir ? '#059669' : '#3730A3' }]}>
                            {String(st.nama || st.name || 'ST').substring(0, 2).toUpperCase()}
                          </Text>
                        </View>

                        <View style={{ flex: 1 }}>
                          <View style={styles.studentCardTitleRow}>
                            <Text numberOfLines={1} style={styles.studentCardName}>{st.nama}</Text>
                            <View style={[styles.studentStatusBadge, { backgroundColor: statusBg }]}>
                              <Text style={[styles.studentStatusBadgeText, { color: statusColor }]}>{st.status}</Text>
                            </View>
                          </View>

                          <Text style={styles.studentCardSub}>
                            NISN: {st.nisn} • Kelas: <Text style={{ fontWeight: '700', color: '#1E293B' }}>{st.kelas}</Text>
                          </Text>

                          <View style={styles.studentCardMetaRow}>
                            <MaterialCommunityIcons name="clock-outline" size={11} color="#64748B" style={{ marginRight: 3 }} />
                            <Text style={styles.studentCardMetaText}>{st.waktu || '—'}</Text>
                            {st.keterangan && st.keterangan !== '—' && (
                              <>
                                <Text style={{ marginHorizontal: 4, color: '#CBD5E1' }}>•</Text>
                                <Text numberOfLines={1} style={styles.studentCardKetText}>{st.keterangan}</Text>
                              </>
                            )}
                          </View>
                        </View>
                      </View>

                      {/* Footer Actions (WhatsApp Wali & Cetak Evaluasi) */}
                      <View style={styles.studentCardFooter}>
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => handleOpenWhatsApp(st.no_hp_ortu || st.kontak_ortu, st.nama)}
                          style={styles.studentFooterBtn}
                        >
                          <MaterialCommunityIcons name="whatsapp" size={13} color="#059669" />
                          <Text style={styles.studentFooterBtnText}>Chat Wali ({st.wali || 'Ortu'})</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => setSelectedStudentForPrint(st)}
                          style={[styles.studentFooterBtn, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}
                        >
                          <MaterialCommunityIcons name="printer-outline" size={13} color="#059669" />
                          <Text style={[styles.studentFooterBtnText, { color: '#059669', fontWeight: '800' }]}>
                            Cetak Pekanan
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            {/* Link to Full Modal */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setIsAttendanceModalOpen(true)}
              style={styles.openFullAttendanceBtn}
            >
              <MaterialCommunityIcons name="table-search" size={16} color="#059669" style={{ marginRight: 6 }} />
              <Text style={styles.openFullAttendanceBtnText}>
                Buka Rekap Presensi Lengkap ({studentAttendanceList.length} Siswa Terdata)
              </Text>
            </TouchableOpacity>
          </View>
          <View style={{ height: 40 }} />
        </View>
      )}

      {/* ── 5. KONTEN TAB 3: PRESTASI & CIVITAS ── */}
      {activeTab === 'civitas' && (
        <View style={styles.tabContentWrap}>
          {/* A. REKAPITULASI PRESTASI SISWA */}
          <View style={styles.cardContainer}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleWithIcon}>
                <View style={[styles.sectionIconBadge, { backgroundColor: '#FEF3C7' }]}>
                  <MaterialCommunityIcons name="trophy-variant" size={16} color="#D97706" />
                </View>
                <View>
                  <Text style={styles.sectionTitleBold}>Rekapitulasi Prestasi Siswa</Text>
                  <Text style={styles.sectionSubtitleText}>Pencapaian Tahfizh, Olahraga, & Akademik</Text>
                </View>
              </View>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setIsAchievementModalOpen(true)}
                style={styles.detailLinkBtn}
              >
                <Text style={styles.detailLinkBtnText}>Verifikasi</Text>
                <MaterialCommunityIcons name="chevron-right" size={14} color="#059669" />
              </TouchableOpacity>
            </View>

            {/* 1. Bar Pencarian Prestasi */}
            <View style={styles.prestasiSearchBarWrap}>
              <MaterialCommunityIcons name="magnify" size={18} color="#94A3B8" />
              <TextInput
                style={styles.prestasiSearchInput}
                placeholder="Cari santri, prestasi, atau kelas..."
                placeholderTextColor="#94A3B8"
                value={inlinePrestasiSearch}
                onChangeText={setInlinePrestasiSearch}
              />
              {inlinePrestasiSearch ? (
                <TouchableOpacity onPress={() => setInlinePrestasiSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialCommunityIcons name="close-circle" size={16} color="#94A3B8" />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* 2. Filter Kategori Chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.prestasiFilterScroll}>
              {[
                { key: 'all', label: `Semua (${rekapPrestasiList.length})` },
                { key: 'tahfizh', label: `Tahfizh (${prestasiCategoryCounts.tahfizh})` },
                { key: 'akademik', label: `Akademik (${prestasiCategoryCounts.akademik})` },
                { key: 'olahraga', label: `Olahraga (${prestasiCategoryCounts.olahraga})` },
                { key: 'seni', label: `Seni (${prestasiCategoryCounts.seni})` },
              ].map((item) => {
                const isActive = inlinePrestasiCategory === item.key;
                return (
                  <TouchableOpacity
                    key={item.key}
                    onPress={() => setInlinePrestasiCategory(item.key)}
                    style={[styles.statusChipBtn, isActive && styles.statusChipBtnActive]}
                  >
                    <Text style={[styles.statusChipText, isActive && styles.statusChipTextActive]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* 3. Filter Tingkat Chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.prestasiFilterScroll, { marginBottom: 12 }]}>
              {['all', 'Nasional', 'Provinsi', 'Kota', 'Kecamatan', 'Sekolah'].map((tKey) => {
                const isActive = inlinePrestasiTingkat === tKey;
                const label = tKey === 'all' ? 'Semua Tingkat' : tKey;
                return (
                  <TouchableOpacity
                    key={tKey}
                    onPress={() => setInlinePrestasiTingkat(tKey)}
                    style={[styles.tingkatChipBtn, isActive && styles.tingkatChipBtnActive]}
                  >
                    <Text style={[styles.tingkatChipText, isActive && styles.tingkatChipTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.achievementListWrap}>
              {filteredRekapPrestasiList.length === 0 ? (
                <View style={styles.emptyStateWrap}>
                  <MaterialCommunityIcons name="trophy-outline" size={28} color="#CBD5E1" />
                  <Text style={styles.emptyStateText}>
                    {inlinePrestasiSearch.trim() || inlinePrestasiCategory !== 'all' || inlinePrestasiTingkat !== 'all'
                      ? 'Tidak ada data prestasi yang cocok dengan filter'
                      : 'Belum ada data prestasi siswa'}
                  </Text>
                </View>
              ) : (
                filteredRekapPrestasiList.slice(0, 6).map((pr: any) => {
                  const namaPrestasiLabel = pr.nama_prestasi || pr.jenis_prestasi || pr.jenis || '—';
                  const kelasLabel = pr.kelas_nama || pr.kelas || '—';
                  const tingkatLabel = pr.tingkat_prestasi || pr.tingkat || '—';
                  const peringkatLabel = pr.nilai_prestasi || pr.peringkat || '—';
                  const statusLabel = pr.keterangan || pr.status || '—';
                  const isVerified = statusLabel === 'Terverifikasi' || String(statusLabel).toLowerCase().includes('terverifikasi');
                  return (
                    <View key={pr.id} style={styles.achievementItemCard}>
                      <View style={styles.achievementIconCircle}>
                        <MaterialCommunityIcons name="medal-outline" size={18} color="#D97706" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={styles.achievementHeaderRow}>
                          <Text numberOfLines={1} style={styles.achievementStudentName}>{pr.nama_siswa || pr.siswa_nama}</Text>
                          <View style={[styles.achievementStatusPill, { backgroundColor: isVerified ? '#ECFDF5' : '#FFFBEB' }]}>
                            <Text style={[styles.achievementStatusPillText, { color: isVerified ? '#059669' : '#D97706' }]}>
                              {isVerified ? 'Terverifikasi' : statusLabel}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.achievementJenisText}>{namaPrestasiLabel}</Text>
                        <Text style={styles.achievementSubText}>
                          Kelas {kelasLabel} • Tingkat {tingkatLabel} • <Text style={{ fontWeight: '800', color: '#B45309' }}>{peringkatLabel}</Text>
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            {/* Quick Button to Open Full CRUD Modal */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setIsAchievementModalOpen(true)}
              style={styles.manageAchievementsBtn}
            >
              <MaterialCommunityIcons name="trophy-award" size={16} color="#D97706" style={{ marginRight: 6 }} />
              <Text style={styles.manageAchievementsBtnText}>
                Kelola, Tambah & Ubah Prestasi ({rekapPrestasiList.length})
              </Text>
            </TouchableOpacity>
          </View>
          <View style={{ height: 40 }} />
        </View>
      )}

      {/* ── MODAL DETAIL PENGUMUMAN (TAMPIL BERSIH, BERGAMBAR & ANTI-TERPOTONG) ── */}
      <Modal
        visible={Boolean(selectedAnnouncement)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedAnnouncement(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.announcementModalBox}>
            {/* Modal Image Header */}
            <View style={styles.announcementModalImageWrap}>
              <Image
                source={{ uri: getAnnouncementImage(selectedAnnouncement, 0) }}
                style={styles.announcementModalImage}
                resizeMode="cover"
              />
              <LinearGradient
                colors={['rgba(15, 23, 42, 0.65)', 'transparent', 'rgba(15, 23, 42, 0.8)']}
                style={styles.announcementModalGradientOverlay}
              >
                <View style={styles.announcementModalTopBar}>
                  <View style={styles.announcementModalCategoryBadge}>
                    <Text style={styles.announcementModalCategoryBadgeText}>
                      {getAnnouncementCategory(selectedAnnouncement)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.announcementModalCloseIcon}
                    onPress={() => setSelectedAnnouncement(null)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <MaterialCommunityIcons name="close" size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </View>

            {/* Title & Metadata */}
            <View style={styles.announcementModalHeaderInfo}>
              <Text style={styles.announcementModalTitle}>{selectedAnnouncement?.judul}</Text>
              <View style={styles.announcementModalMetaRow}>
                <View style={styles.announcementMetaItem}>
                  <MaterialCommunityIcons name="calendar-month-outline" size={13} color="#059669" />
                  <Text style={styles.announcementMetaDate}>{getAnnouncementDate(selectedAnnouncement)}</Text>
                </View>
                <Text style={styles.announcementModalDot}>•</Text>
                <View style={styles.announcementTargetBadge}>
                  <Text numberOfLines={1} style={styles.announcementTargetBadgeText}>
                    Target: {selectedAnnouncement?.target || 'Semua Unit'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Full Scrollable Content - Guaranteed zero clipping */}
            <ScrollView
              style={styles.announcementModalBody}
              contentContainerStyle={styles.announcementModalBodyContent}
              showsVerticalScrollIndicator={true}
            >
              <Text style={styles.announcementModalContentText}>
                {selectedAnnouncement?.isi || selectedAnnouncement?.ringkasan || 'Tidak ada detail edaran.'}
              </Text>
            </ScrollView>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setSelectedAnnouncement(null)}
              style={styles.announcementModalCloseBtn}
            >
              <Text style={styles.announcementModalCloseBtnText}>Tutup Pengumuman</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── MODAL CETAK EVALUASI PEKANAN ── */}
      {selectedStudentForPrint && (
        <WeeklyEvaluationReportPaperModal
          visible={Boolean(selectedStudentForPrint)}
          student={selectedStudentForPrint}
          reportTitle="LAPORAN PERKEMBANGAN PEKANAN SANTRI"
          periodText={`Tahun Ajaran ${tahunAjaran}`}
          onClose={() => setSelectedStudentForPrint(null)}
        />
      )}

      {/* ── ALL EXECUTIVE MODALS ── */}
      <PrincipalKpiDrilldownModal
        type={activeKpiModal}
        isOpen={Boolean(activeKpiModal)}
        onClose={() => setActiveKpiModal(null)}
        dashboardData={dashboard}
        unitId={schoolInfo?.id || data?.context?.unit?.id}
      />

      <PrincipalMonthlyReportModal
        visible={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        unitName={unitName}
        onSuccess={() => {
          if (onRefresh) onRefresh();
        }}
      />

      <PrincipalAttendanceModal
        visible={isAttendanceModalOpen}
        onClose={() => setIsAttendanceModalOpen(false)}
        unitName={unitName}
        academicYear={tahunAjaran !== '-' ? tahunAjaran : undefined}
        attendanceList={studentAttendanceList}
        initialStatus={selectedAttendanceStatus}
      />

      <PrincipalTeacherMonitoringModal
        visible={isTeacherMonitoringModalOpen}
        onClose={() => setIsTeacherMonitoringModalOpen(false)}
        unitName={unitName}
      />

      <PrincipalAchievementModal
        visible={isAchievementModalOpen}
        onClose={() => setIsAchievementModalOpen(false)}
        unitName={unitName}
        achievements={rekapPrestasiList}
        onRefresh={() => {
          if (onRefresh) onRefresh();
        }}
      />

      <PrincipalChatModal
        visible={Boolean(activeChatUser)}
        onClose={() => setActiveChatUser(null)}
        targetUser={activeChatUser}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
  },

  // 1. Identity Card
  identityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 14,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  identityTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  identityLeftCol: {
    flex: 1,
  },
  identityTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  identityUnitName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    flex: 1,
  },
  identitySubText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  identityStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  identityStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
  },
  identityStatusText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#065F46',
  },
  identityChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  microChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  microChipText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  identityDetailRow: {
    marginTop: 10,
    gap: 4,
  },
  identityDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  identityDetailText: {
    fontSize: 11,
    color: '#64748B',
    flex: 1,
  },

  // 2. Segmented Tab Switcher (Perbesar sedikit untuk kenyamanan sentuhan)
  tabSwitcherContainer: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 14,
    padding: 4,
    marginBottom: 14,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
  },
  tabButtonActive: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  tabButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  tabContentWrap: {
    gap: 14,
  },

  // 3. Sections & Cards (Perbesar sedikit Card Container)
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flex: 1,
  },
  sectionIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitleBold: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  sectionSubtitleText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 1,
  },
  detailLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  detailLinkBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },

  // 4. KPI Grid (Perbesar Card Metrik Utama)
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kpiCard: {
    flexBasis: '48%',
    flexGrow: 1,
    minHeight: 112,
    borderRadius: 20,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  kpiGradient: {
    padding: 14,
    flex: 1,
    justifyContent: 'space-between',
  },
  kpiTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  kpiIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  kpiCount: {
    fontSize: 24,
    fontWeight: '900',
  },
  kpiLabel: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  kpiSub: {
    fontSize: 10.5,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 1,
  },

  // 5. Presensi Hari Ini Section (Perbesar Card & Gauge)
  presenceRateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  presenceGaugeBox: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DEF7EC',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    minWidth: 84,
  },
  presenceGaugeRate: {
    fontSize: 18,
    fontWeight: '900',
    color: '#059669',
  },
  presenceGaugeSub: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#065F46',
    marginTop: 1,
  },
  presenceProgressBarWrap: {
    flex: 1,
  },
  presenceBarLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  presenceBarLabelLeft: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E293B',
  },
  presenceBarLabelRight: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
  },
  presenceBarTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  presenceBarFill: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: '#059669',
  },
  presenceMetricsGrid: {
    gap: 10,
  },
  presenceMetricsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  presenceBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 12,
  },
  presenceBoxMini: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  presenceBoxIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  presenceBoxContent: {
    flex: 1,
  },
  presenceBoxCount: {
    fontSize: 19,
    fontWeight: '900',
  },
  presenceBoxLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
    marginTop: 1,
  },

  // 6. Section Card & Quick Actions (Style UI/UX Tata Usaha)
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
    marginBottom: 12,
    gap: 10,
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
  qBtnGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  qBtnTile: {
    width: '22%',
    alignItems: 'center',
    paddingVertical: 4,
  },
  qBtnBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1.5,
  },
  qBtnLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'center',
    lineHeight: 13,
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

  actionGridTwoCols: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionCardTile: {
    flexBasis: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 12,
    minHeight: 68,
  },
  actionCardIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionCardContent: {
    flex: 1,
  },
  actionCardTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  actionCardSub: {
    fontSize: 10.5,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 2,
  },

  // 7. Tren Kehadiran Siswa (Tab Kesiswaan - Perbesar)
  modeSwitchBox: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
  },
  modeTab: {
    paddingHorizontal: 12,
    paddingVertical: 6.5,
    borderRadius: 8,
  },
  modeTabActive: {
    backgroundColor: '#059669',
  },
  modeTabText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  modeTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  trendGraphWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 140,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 6,
  },
  trendGraphCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  trendGraphRateText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#059669',
    marginBottom: 4,
  },
  trendGraphBarTrack: {
    width: 16,
    height: 85,
    backgroundColor: '#E2E8F0',
    borderRadius: 7,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  trendGraphBarFill: {
    width: '100%',
    borderRadius: 7,
  },
  trendGraphDayLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 6,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
  },

  // 8. Student Cards & Presensi (Tab Kesiswaan - Perbesar)
  todayPill: {
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  todayPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
  attendanceFilterScroll: {
    gap: 7,
    marginBottom: 12,
  },
  statusChipBtn: {
    paddingHorizontal: 13,
    paddingVertical: 6.5,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  statusChipBtnActive: {
    backgroundColor: '#059669',
  },
  statusChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  statusChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  studentCardsList: {
    gap: 10,
  },
  studentCardItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 12,
  },
  studentCardMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  studentCardAvatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  studentCardInitials: {
    fontSize: 13.5,
    fontWeight: '900',
  },
  studentCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  studentCardName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
    marginRight: 6,
  },
  studentStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 8,
  },
  studentStatusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  studentCardSub: {
    fontSize: 10.5,
    color: '#64748B',
  },
  studentCardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },
  studentCardMetaText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  studentCardKetText: {
    fontSize: 10.5,
    color: '#059669',
    fontWeight: '600',
    flex: 1,
  },
  studentCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  studentFooterBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingVertical: 8,
  },
  studentFooterBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  openFullAttendanceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DEF7EC',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    paddingVertical: 12,
    marginTop: 12,
  },
  openFullAttendanceBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#059669',
  },

  // 9. Prestasi Section (Tab Prestasi & Civitas - Perbesar)
  prestasiSearchBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
    gap: 8,
  },
  prestasiSearchInput: {
    flex: 1,
    fontSize: 12.5,
    color: '#0F172A',
    padding: 0,
  },
  prestasiFilterScroll: {
    gap: 7,
    marginBottom: 8,
  },
  tingkatChipBtn: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  tingkatChipBtnActive: {
    backgroundColor: '#D97706',
    borderColor: '#D97706',
  },
  tingkatChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
  },
  tingkatChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  achievementListWrap: {
    gap: 10,
  },
  achievementItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  achievementIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  achievementHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  achievementStudentName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
    marginRight: 6,
  },
  achievementStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 8,
  },
  achievementStatusPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  achievementJenisText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#059669',
  },
  achievementSubText: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
  },
  manageAchievementsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    borderRadius: 14,
    paddingVertical: 12,
    marginTop: 12,
  },
  manageAchievementsBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#B45309',
  },

  // 10. Pengurus Yayasan (Tab Prestasi & Civitas - Perbesar)
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
  yayasanCardsScroll: {
    gap: 12,
    paddingRight: 10,
  },
  yayasanCard: {
    width: 220,
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 14,
  },
  yayasanCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  yayasanAvatarBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  yayasanAvatarInitials: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  yayasanOnlineDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
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
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 18,
  },
  yayasanOfficerNip: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  yayasanContactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  yayasanContactBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingVertical: 7,
  },
  yayasanContactBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },

  // 11. Civitas Tabs & Activity Feed (Perbesar)
  civitasSwitcherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 4,
    marginBottom: 14,
  },
  civitasTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
  },
  civitasTabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  civitasTabBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  civitasTabBtnTextActive: {
    color: '#0F172A',
    fontWeight: '900',
  },
  onlinePulseBox: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  onlineInnerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  onlinePersonnelWrap: {},
  onlineFilterPillsRow: {
    flexDirection: 'row',
    gap: 7,
    marginBottom: 12,
  },
  onlineFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 5.5,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  onlineFilterChipActive: {
    backgroundColor: '#0F172A',
  },
  onlineFilterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  onlineFilterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  onlineAvatarsScroll: {
    gap: 10,
  },
  onlineUserTile: {
    width: 98,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  onlineAvatarBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#DEF7EC',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 5,
    position: 'relative',
  },
  onlineAvatarLetters: {
    fontSize: 13,
    fontWeight: '900',
    color: '#059669',
  },
  onlineStatusDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  onlineUserName: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  onlineUserRole: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
    marginTop: 1,
  },
  onlineChatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    marginTop: 8,
  },
  onlineChatPillText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#059669',
  },
  activityFeedWrap: {
    gap: 10,
  },
  activityFeedItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 11,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  activityFeedIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityFeedTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  activityFeedUser: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  activityFeedTime: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#94A3B8',
  },
  activityFeedAction: {
    fontSize: 11.5,
    color: '#475569',
    lineHeight: 16,
  },
  activityFeedRoleTag: {
    fontWeight: '800',
    color: '#059669',
  },

  // 12. PENGUMUMAN SEKOLAH TERBARU (CARD BERGAMBAR, MODERN, ZERO-CLIPPING)
  announcementListWrap: {
    gap: 14,
  },
  announcementCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  announcementImageWrap: {
    width: '100%',
    height: 135,
    backgroundColor: '#F1F5F9',
    position: 'relative',
  },
  announcementImage: {
    width: '100%',
    height: '100%',
  },
  announcementCategoryOverlay: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(5, 150, 105, 0.92)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  announcementCategoryOverlayText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  announcementPriorityBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#E11D48',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  announcementPriorityText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  announcementBody: {
    padding: 14,
  },
  announcementMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  announcementMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  announcementMetaDate: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  announcementTargetBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    maxWidth: '55%',
  },
  announcementTargetBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  announcementJudul: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 20,
    marginBottom: 5,
  },
  announcementSnippet: {
    fontSize: 11.5,
    lineHeight: 17,
    color: '#64748B',
    marginBottom: 10,
  },
  announcementFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  announcementReadMoreText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#059669',
  },
  announcementChevronCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#DEF7EC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  seeAllAnnouncementsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    paddingVertical: 12,
    marginTop: 12,
  },
  seeAllAnnouncementsBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#059669',
  },

  // 13. MODAL DETAIL PENGUMUMAN (TAMPIL PENUH, BERGAMBAR, ANTI-TERPOTONG)
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  announcementModalBox: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 10,
  },
  announcementModalImageWrap: {
    width: '100%',
    height: 160,
    position: 'relative',
    backgroundColor: '#0F172A',
  },
  announcementModalImage: {
    width: '100%',
    height: '100%',
  },
  announcementModalGradientOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
    padding: 14,
  },
  announcementModalTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  announcementModalCategoryBadge: {
    backgroundColor: '#059669',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  announcementModalCategoryBadgeText: {
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
    gap: 8,
  },
  announcementModalDot: {
    color: '#CBD5E1',
  },
  announcementModalBody: {
    paddingHorizontal: 18,
    maxHeight: 260,
  },
  announcementModalBodyContent: {
    paddingVertical: 14,
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

  // Empty State
  emptyStateWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyStateText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
    textAlign: 'center',
  },
});

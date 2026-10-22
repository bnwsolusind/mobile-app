import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTeacherClassStore, TeacherClass } from '../../stores/teacherClassStore';
import { mobileApiService, unwrapCollection } from '../../services/mobileApiService';
import { useAuthStore } from '../../stores/authStore';
import { resolveUnitName } from '../../utils/employeeUtils';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ──────────────────────────────────────────────────────────────
// KOMPONEN ANIMASI RADAR PULSE / RIPPLE WAVE DINAMIS
// ──────────────────────────────────────────────────────────────
const RadarPulseDot: React.FC<{ color?: string; size?: number }> = ({
  color = '#10B981',
  size = 8,
}) => {
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 1500,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  const scale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 2.7],
  });

  const opacity = pulseAnim.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [0.85, 0.35, 0],
  });

  return (
    <View
      style={{
        width: size * 2.4,
        height: size * 2.4,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Animated.View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          transform: [{ scale }],
          opacity,
        }}
      />
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
};

// ──────────────────────────────────────────────────────────────
// DEFAULT KELAS & ROMBEL GURU (DINAMIS DARI SERVER)
// ──────────────────────────────────────────────────────────────
const buildDefaultClasses = (_unitName?: string, _teacherName?: string): TeacherClass[] => [];

const getAnnouncementTitle = (item: any): string =>
  item?.judul_pengumuman ||
  item?.judul ||
  item?.title ||
  item?.name ||
  item?.subject?.name ||
  item?.subject?.nama_mapel ||
  'Informasi Madrasah';

const getAnnouncementBody = (item: any): string =>
  item?.data_tambahan?.ringkasan ||
  item?.isi_pengumuman ||
  item?.isi ||
  item?.message ||
  item?.body ||
  item?.summary ||
  item?.content ||
  item?.description ||
  '';

const getAnnouncementTimeTag = (item: any): { label: string; time: string } => {
  const rawDate = item?.mulai_tampil || item?.created_at || item?.published_at || item?.tanggal || item?.date;
  if (!rawDate) return { label: 'Terbaru', time: '' };

  const d = new Date(rawDate);
  if (isNaN(d.getTime())) return { label: 'Terbaru', time: '' };

  const now = new Date();
  const isSameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const timeStr = `${hh}:${mm}`;

  if (isSameDay) {
    return { label: 'Hari ini', time: timeStr };
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();

  if (isYesterday) {
    return { label: 'Kemarin', time: timeStr };
  }

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return { label: `${d.getDate()} ${months[d.getMonth()]}`, time: timeStr };
};

const getAnnouncementTheme = (index: number) => {
  const themes = [
    { bg: '#059669', icon: 'bullhorn' as const },
    { bg: '#2563EB', icon: 'file-document-outline' as const },
    { bg: '#EA580C', icon: 'calendar-clock' as const },
    { bg: '#7C3AED', icon: 'newspaper-variant-outline' as const },
    { bg: '#0D9488', icon: 'bell-ring-outline' as const },
  ];
  return themes[index % themes.length];
};

interface TeacherDashboardViewProps {
  dashboard: Record<string, any>;
  navigation: any;
  onOpenAllMenus?: () => void;
  announcements?: any[];
}

export default function TeacherDashboardView({
  dashboard,
  navigation,
  onOpenAllMenus,
  announcements,
}: TeacherDashboardViewProps) {
  // Konteks Guru & Unit Dinamis dari AuthStore dan Dashboard
  const user = useAuthStore((state) => state.user);
  const teacherData = dashboard?.teacher || dashboard?.data?.teacher || {};
  const teacherName =
    teacherData?.name ||
    user?.name ||
    user?.fullName ||
    'Pendidik';
  const teacherUnit =
    resolveUnitName(teacherData?.education_unit) ||
    resolveUnitName(teacherData?.unit) ||
    resolveUnitName(dashboard?.unit) ||
    resolveUnitName(dashboard?.unit_name) ||
    resolveUnitName(user?.unit_name) ||
    resolveUnitName(user?.unit) ||
    resolveUnitName((user as any)?.education_unit) ||
    resolveUnitName((user?.metadata as any)?.unit_name) ||
    'Sekolah Islam Terpadu';

  // 1. Integrasi Store Kelas & Rombel Guru
  const classesFromStore = useTeacherClassStore((state) => state.classes) || [];
  const selectedClassId = useTeacherClassStore((state) => state.selectedClassId);
  const setClasses = useTeacherClassStore((state) => state.setClasses);
  const setSelectedClassId = useTeacherClassStore((state) => state.setSelectedClassId);
  const setSchedulesToday = useTeacherClassStore((state) => state.setSchedulesToday);
  const schedulesToday = useTeacherClassStore((state) => state.schedulesToday) || [];

  // Modal Bottom Sheet State (Panel 2 & Panel 3)
  const [showAllClassesModal, setShowAllClassesModal] = useState<boolean>(false);
  const [tempSelectedClassId, setTempSelectedClassId] = useState<string | null>(selectedClassId || '__ALL__');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('Semua');
  const [showFilterPanel, setShowFilterPanel] = useState<boolean>(false);

  // Filter Dropdown Values (Panel 3)
  const [filterMahad, setFilterMahad] = useState<string>('Semua Mahad');
  const [filterTingkat, setFilterTingkat] = useState<string>('Semua Tingkat');
  const [filterStatusSaya, setFilterStatusSaya] = useState<string>('Semua');

  useEffect(() => {
    // Sinkronisasi jadwal hari ini ke store
    if (dashboard?.schedules_today && Array.isArray(dashboard.schedules_today)) {
      setSchedulesToday(dashboard.schedules_today);
    } else if (dashboard?.data?.schedules_today && Array.isArray(dashboard.data.schedules_today)) {
      setSchedulesToday(dashboard.data.schedules_today);
    }

    // Ambil daftar kelas dari API jika store masih kosong
    const fetchClasses = async () => {
      try {
        const res = await mobileApiService.getTeacherClasses();
        const list = unwrapCollection(res);
        if (list.length > 0) {
          // Gabungkan kelas riil dari API dengan data rombel lengkap
          const merged = list.map((item: any, idx: number) => ({
            ...item,
            id: String(item.id || item.kelas_id || `cls-${idx + 1}`),
            nama_kelas: item.nama_kelas || item.name || `Kelas ${idx + 1}`,
            name: item.name || item.nama_kelas || `Kelas ${idx + 1}`,
            rombel: item.kode_kelas || item.nama_kelas || item.name || `Rombel ${idx + 1}`,
            total_santri: item.total_students || item.total_santri || item.kapasitas || 0,
            wali_kelas: item.wali_kelas?.name || item.wali_kelas || item.homeroom_teacher || teacherName || '-',
            mahad: item.unit_pendidikan?.name || item.unit_name || item.mahad || teacherUnit || '-',
            tingkat: item.tingkat ? `Tingkat ${item.tingkat}` : (item.grade_level ? `Tingkat ${item.grade_level}` : ''),
            category: item.category || 'Kelas Guru',
            ruangan: item.ruangan || item.metadata?.room || '-',
          }));
          setClasses(merged);
          if (!selectedClassId) {
            setSelectedClassId('__ALL__');
          }
        } else {
          setClasses([]);
          if (!selectedClassId) {
            setSelectedClassId('__ALL__');
          }
        }
      } catch {
        setClasses([]);
        if (!selectedClassId) {
          setSelectedClassId('__ALL__');
        }
      }
    };

    if (classesFromStore.length === 0) {
      void fetchClasses();
    }
  }, [dashboard, teacherUnit, teacherName]);

  // Daftar kelas aktif yang siap dipakai dari store
  const allClasses: TeacherClass[] = useMemo(() => {
    return classesFromStore || [];
  }, [classesFromStore]);

  // Rombel/Kelas yang sedang aktif terpilih
  const selectedClass = useMemo(() => {
    if (selectedClassId === '__NONE__') {
      return null;
    }
    if (!selectedClassId || selectedClassId === '__ALL__') {
      return {
        id: '__ALL__',
        name: 'Semua Rombel',
        nama_kelas: 'Semua Rombel',
        rombel: 'Semua Rombel',
        mahad: teacherUnit,
        total_santri: allClasses.reduce((acc, c) => acc + (c.total_santri || 0), 0),
        wali_kelas: teacherName,
        tingkat: 'Semua Tingkat',
        category: 'Semua',
      } as TeacherClass;
    }
    if (selectedClassId) {
      const found = allClasses.find((c) => String(c.id) === String(selectedClassId));
      if (found) return found;
    }
    return {
      id: '__ALL__',
      name: 'Semua Rombel',
      nama_kelas: 'Semua Rombel',
      rombel: 'Semua Rombel',
      mahad: teacherUnit,
      total_santri: allClasses.reduce((acc, c) => acc + (c.total_santri || 0), 0),
      wali_kelas: teacherName,
      tingkat: 'Semua Tingkat',
      category: 'Semua',
    } as TeacherClass;
  }, [allClasses, selectedClassId, teacherUnit, teacherName]);

  const selectedClassName = useMemo(() => {
    if (!selectedClass) return '';
    return selectedClass.nama_kelas || selectedClass.name || '';
  }, [selectedClass]);

  // Saat membuka modal, sync tempSelectedClassId
  const handleOpenClassModal = () => {
    const defaultId = selectedClassId && selectedClassId !== '__NONE__'
      ? String(selectedClassId)
      : '__ALL__';
    setTempSelectedClassId(defaultId);
    setShowAllClassesModal(true);
  };

  // Langsung pilih rombel saat item diklik di modal
  const handleSelectClass = (cls: TeacherClass) => {
    const idStr = String(cls.id);
    setTempSelectedClassId(idStr);
    setSelectedClassId(idStr);
    setShowAllClassesModal(false);
  };

  // Terapkan pilihan rombel (Panel 2 -> Panel 4)
  const handleApplyClass = () => {
    if (tempSelectedClassId) {
      setSelectedClassId(tempSelectedClassId);
    }
    setShowAllClassesModal(false);
  };

  // Reset/Kosongkan rombel terpilih untuk mengetes Panel 5 (Belum Memilih)
  const handleClearSelectedClass = () => {
    setSelectedClassId('__NONE__');
    setTempSelectedClassId('__NONE__');
    setShowAllClassesModal(false);
  };

  // 2. Tanggal Hari Ini Terformat Rapi Sesuai Mockup ("Rabu, 24 Sep 2026")
  const dateFormatted = useMemo(() => {
    const raw = dashboard?.academic_context?.date;
    let d = new Date();
    if (raw) {
      const parsed = new Date(raw);
      if (!isNaN(parsed.getTime())) {
        d = parsed;
      }
    }
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const dayName = days[d.getDay()];
    const dayNum = d.getDate();
    const monthName = months[d.getMonth()];
    const year = d.getFullYear();
    return `${dayName}, ${dayNum} ${monthName} ${year}`;
  }, [dashboard]);

  // Helper konversi jam string ("07:30" / "07.30" / "07:30:00") ke jumlah menit dari jam 00:00
  const parseToMinutes = (t?: string): number => {
    if (!t) return 0;
    const clean = String(t).replace(/\./g, ':').trim();
    const parts = clean.split(':');
    const h = parseInt(parts[0] || '0', 10);
    const m = parseInt(parts[1] || '0', 10);
    return h * 60 + m;
  };

  // 3. Raw Schedules dari Backend API (atau jadwal rombel terpilih)
  const rawSchedulesFromBackend: any[] = useMemo(() => {
    const raw = dashboard?.schedules_today || dashboard?.data?.schedules_today || schedulesToday || [];
    if (!Array.isArray(raw) || raw.length === 0) return [];

    // Jika pengguna memilih "Semua Rombel", tampilkan seluruh jadwal tanpa difilter kelas!
    if (!selectedClassId || selectedClassId === '__ALL__') {
      return raw;
    }

    // Jika ada rombel spesifik terpilih, filter sesuai rombel tersebut (id atau nama)
    if (selectedClass) {
      const targetId = String(selectedClass.id || '');
      const targetName = (selectedClass.nama_kelas || selectedClass.name || '').trim().toLowerCase();
      const filtered = raw.filter((s: any) => {
        const cId = String(s.kelas?.id || s.kelas_id || s.class_id || '');
        const cName = String(s.kelas?.nama_kelas || s.kelas?.name || s.nama_kelas || s.class_name || '').trim().toLowerCase();
        return (targetId && cId === targetId) || (targetName && cName === targetName);
      });
      return filtered;
    }

    return raw;
  }, [dashboard, schedulesToday, selectedClass, selectedClassId]);

  // 4. Data Jadwal Carousel Horizontal: 100% DINAMIS BERDASARKAN API & JAM SAAT INI (ZERO HARDCODE)
  const displaySchedules = useMemo(() => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    let listToProcess: any[] = [];
    if (rawSchedulesFromBackend && rawSchedulesFromBackend.length > 0) {
      listToProcess = rawSchedulesFromBackend.map((item, idx) => ({
        id: item.id || `sched-real-${idx}`,
        timeStartStr: item.time_start ? String(item.time_start).substring(0, 5) : '07:30',
        timeEndStr: item.time_end ? String(item.time_end).substring(0, 5) : '08:50',
        subjectName: item.subject?.name || item.subject?.nama_mapel || item.nama_mapel || item.mata_pelajaran || 'Mata Pelajaran',
        className: item.kelas?.nama_kelas || item.kelas?.name || item.nama_kelas || selectedClassName || 'Kelas',
        room: item.room || item.ruang || item.ruangan || item.kelas?.ruangan || 'R. KBM',
      }));
    } else if (!selectedClassId || selectedClassId === '__ALL__') {
      // Jika mode "Semua Rombel" dan tidak ada jadwal raw dari API, kumpulkan jadwal dari seluruh kelas yang tersedia
      const allList: any[] = [];
      allClasses.forEach((cls, cIdx) => {
        if (cls.schedule) {
          allList.push({
            id: cls.schedule.id || `sched-all-${cIdx}`,
            timeStartStr: cls.schedule.timeStartStr || '07:30',
            timeEndStr: cls.schedule.timeEndStr || '08:50',
            subjectName: cls.schedule.subjectName || 'Mata Pelajaran',
            className: cls.nama_kelas || cls.name || 'Kelas',
            room: cls.ruangan || cls.schedule.room || 'R. KBM',
          });
        }
      });
      listToProcess = allList;
    } else if (selectedClass?.schedule) {
      listToProcess = [
        {
          id: selectedClass.schedule.id || 'sched-selected',
          timeStartStr: selectedClass.schedule.timeStartStr || '07:30',
          timeEndStr: selectedClass.schedule.timeEndStr || '08:50',
          subjectName: selectedClass.schedule.subjectName || 'Mata Pelajaran',
          className: selectedClassName || selectedClass.nama_kelas || 'Kelas',
          room: selectedClass.ruangan || selectedClass.schedule.room || 'R. KBM',
        },
      ];
    } else {
      // Tidak ada jadwal aktif untuk kelas ini hari ini
      return [];
    }

    return listToProcess.map((item) => {
      const startMin = parseToMinutes(item.timeStartStr);
      const endMin = parseToMinutes(item.timeEndStr);

      let status: 'completed' | 'ongoing' | 'upcoming' = 'upcoming';
      let remainingText = '';

      if (currentMinutes > endMin) {
        status = 'completed';
      } else if (currentMinutes >= startMin && currentMinutes <= endMin) {
        status = 'ongoing';
        const diffMin = endMin - currentMinutes;
        const diffH = Math.floor(diffMin / 60);
        const diffM = diffMin % 60;
        remainingText = diffH > 0 ? `Sisa ${diffH}j ${diffM}m` : `Sisa ${diffM}m`;
      } else {
        status = 'upcoming';
      }

      return {
        ...item,
        status,
        remainingText,
        timeDisplayStr: `${item.timeStartStr} - ${item.timeEndStr}`,
      };
    });
  }, [rawSchedulesFromBackend, selectedClass, selectedClassName]);

  // 5. Data Jadwal Banner Atas Real-Time: HANYA "Sedang Mengajar" Jika Jam Sesuai (ZERO HARDCODE)
  const activeTeachingSchedule = useMemo(() => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // 1. Prioritas Utama: Cari sesi KBM yang SEDANG BERLANGSUNG tepat saat ini
    const ongoing = displaySchedules.find((s) => s.status === 'ongoing');
    if (ongoing) {
      return {
        ...ongoing,
        isCurrentlyOngoing: true,
        bannerLabel: 'Sedang Mengajar',
        badgeColor: '#10B981',
      };
    }

    // 2. Jika tidak ada yang sedang berlangsung, cari sesi KBM AKAN DATANG berikutnya hari ini
    const upcoming = displaySchedules.find((s) => s.status === 'upcoming');
    if (upcoming) {
      const startMin = parseToMinutes(upcoming.timeStartStr);
      const diffToStart = Math.max(0, startMin - currentMinutes);
      const diffH = Math.floor(diffToStart / 60);
      const diffM = diffToStart % 60;
      const timeWaitText = diffH > 0 ? `${diffH}j ${diffM}m lagi` : `${diffM}m lagi`;

      return {
        ...upcoming,
        isCurrentlyOngoing: false,
        bannerLabel: 'KBM Berikutnya',
        remainingText: `Mulai ${timeWaitText}`,
        badgeColor: '#F59E0B',
      };
    }

    // 3. Jika seluruh sesi hari ini telah usai
    if (displaySchedules.length > 0) {
      const last = displaySchedules[displaySchedules.length - 1];
      return {
        ...last,
        isCurrentlyOngoing: false,
        bannerLabel: 'KBM Selesai',
        remainingText: 'Selesai Hari Ini',
        badgeColor: '#94A3B8',
      };
    }

    // 4. Jika tidak ada jadwal sama sekali hari ini (Bebas Hardcode)
    return {
      id: 'sched-none',
      subjectName: selectedClass ? 'Tidak Ada Jadwal KBM' : 'Belum Ada Rombel Dipilih',
      className: selectedClassName || (selectedClass ? selectedClass.nama_kelas || selectedClass.name : 'Pilih Rombel & Kelas'),
      room: selectedClass?.ruangan || 'Ruang Belajar',
      timeStartStr: '--:--',
      timeEndStr: '--:--',
      remainingText: 'Tidak Ada Sesi',
      status: 'completed' as const,
      isCurrentlyOngoing: false,
      bannerLabel: 'Agenda KBM Hari Ini',
      badgeColor: '#64748B',
    };
  }, [displaySchedules, selectedClassName, selectedClass]);

  // Deteksi kelas mana saja yang memiliki jadwal mengajar hari ini
  const classIdsWithSchedule = useMemo(() => {
    const ids = new Set<string>();
    const names = new Set<string>();

    const scheds = [
      ...(dashboard?.schedules_today || []),
      ...(dashboard?.data?.schedules_today || []),
      ...(dashboard?.schedules || []),
      ...(schedulesToday || []),
    ];

    scheds.forEach((s: any) => {
      const cid = s.kelas?.id || s.kelas_id || s.class_id;
      if (cid) ids.add(String(cid));
      const cname = s.kelas?.nama_kelas || s.kelas?.name || s.nama_kelas || s.class_name;
      if (cname) names.add(String(cname).trim().toLowerCase());
    });

    // Periksa juga template jadwal hari ini (displaySchedules) yang merujuk ke kelas
    displaySchedules.forEach((ds: any) => {
      if (ds.className) names.add(String(ds.className).trim().toLowerCase());
    });

    // Tambahkan juga jika cls di allClasses memiliki properti schedule
    allClasses.forEach((dtc) => {
      if (dtc.schedule) {
        ids.add(String(dtc.id));
        if (dtc.nama_kelas) names.add(dtc.nama_kelas.trim().toLowerCase());
      }
    });

    return { ids, names };
  }, [dashboard, schedulesToday, displaySchedules, allClasses]);

  // 5. 15 Menu Utama Guru (Grid 5 Kolom x 3 Baris Persis Sesuai Mockup)
  const primary15MenuItems = useMemo(() => {
    const isAll = !selectedClassId || selectedClassId === '__ALL__';
    const classId = isAll ? undefined : selectedClass?.id;
    const className = isAll ? undefined : selectedClassName;

    return [
      // Baris 1
      {
        id: 'jadwal',
        title: 'Jadwal\nKBM',
        icon: 'clock-time-four',
        color: '#7C3AED',
        bg: '#F5F3FF',
        route: 'Jadwal',
        params: { kelas_id: classId, class_name: className },
      },
      {
        id: 'presensi',
        title: 'Presensi\nKBM',
        icon: 'calendar-check-outline',
        color: '#059669',
        bg: '#ECFDF5',
        route: 'QR Code',
        fallbackRoute: 'Absensi',
        params: { kelas_id: classId, class_name: className, mode: 'manual' },
      },
      {
        id: 'materi',
        title: 'Bahan\nAjar',
        icon: 'book-multiple',
        color: '#0D9488',
        bg: '#E6FFFA',
        route: 'Materi',
        params: { tab: 'materials', subTab: 'materials', kelas_id: classId, class_name: className },
      },
      {
        id: 'tugas',
        title: 'Tugas\nLMS',
        icon: 'clipboard-text',
        color: '#F59E0B',
        bg: '#FEF9EC',
        route: 'Tugas',
        params: { kelas_id: classId, class_name: className },
      },
      {
        id: 'nilai',
        title: 'Input\nNilai',
        icon: 'chart-box',
        color: '#10B981',
        bg: '#E8FAF2',
        route: 'Nilai',
        params: { kelas_id: classId, class_name: className },
      },
      // Baris 2
      {
        id: 'tahfizh',
        title: 'Tahfizh',
        icon: 'book-marker',
        color: '#2563EB',
        bg: '#EFF6FF',
        route: 'Tahfizh',
        params: { kelas_id: classId, class_name: className },
      },
      {
        id: 'mutabaah',
        title: 'Mutabaah',
        icon: 'clipboard-check',
        color: '#D97706',
        bg: '#FEF3C7',
        route: 'Mutabaah',
        params: { kelas_id: classId, class_name: className },
      },
      {
        id: 'chat',
        title: 'Buku\nPenghubung',
        icon: 'book-open-page-variant',
        color: '#8B5CF6',
        bg: '#FAF5FF',
        route: 'Chat',
        fallbackRoute: 'Chat Guru',
        params: { kelas_id: classId, class_name: className },
      },
      {
        id: 'kisi_kisi',
        title: 'Kisi-kisi',
        icon: 'file-question',
        color: '#EF4444',
        bg: '#FEF2F2',
        route: 'KisiKisi',
        params: { kelas_id: classId, class_name: className },
      },
      {
        id: 'bank_soal',
        title: 'Bank Soal',
        icon: 'database-outline',
        color: '#0D9488',
        bg: '#E6FFFA',
        route: 'BankSoal',
        params: { kelas_id: classId, class_name: className },
      },
      // Baris 3
      {
        id: 'ujian',
        title: 'Ujian\nCBT',
        icon: 'laptop',
        color: '#2563EB',
        bg: '#EFF6FF',
        route: 'CbtExams',
        params: { kelas_id: classId, class_name: className },
      },
      {
        id: 'kalender',
        title: 'Kalender',
        icon: 'calendar-month',
        color: '#0284C7',
        bg: '#F0F9FF',
        route: 'Kalender',
      },
      {
        id: 'informasi',
        title: 'Informasi',
        icon: 'bullhorn',
        color: '#E11D48',
        bg: '#FFF1F2',
        route: 'Informasi',
      },
      {
        id: 'pengaturan',
        title: 'Pengaturan',
        icon: 'cog',
        color: '#64748B',
        bg: '#F1F5F9',
        route: 'Profil',
      },
      {
        id: 'lainnya',
        title: 'Lainnya',
        icon: 'dots-horizontal',
        color: '#64748B',
        bg: '#F1F5F9',
        route: '__OPEN_ALL__',
      },
    ];
  }, [selectedClass, selectedClassName]);

  const handleMenuPress = (item: any) => {
    if (item.route === '__OPEN_ALL__') {
      if (typeof onOpenAllMenus === 'function') {
        onOpenAllMenus();
      } else {
        navigation?.navigate('Menu');
      }
      return;
    }

    try {
      if (item.params) {
        navigation.navigate(item.route, item.params);
      } else {
        navigation.navigate(item.route);
      }
    } catch {
      if (item.fallbackRoute) {
        try {
          navigation.navigate(item.fallbackRoute, item.params);
        } catch {
          navigation.navigate(item.fallbackRoute);
        }
      } else {
        navigation.navigate(item.route);
      }
    }
  };

  // 6. Data Pengumuman / Informasi Terbaru 100% DINAMIS (ZERO HARDCODE)
  const [fetchedNotifications, setFetchedNotifications] = useState<any[]>([]);

  useEffect(() => {
    let isMounted = true;
    const loadNotifs = async () => {
      try {
        const res = await mobileApiService.getTeacherAnnouncements({ per_page: 5 });
        const list = unwrapCollection(res);
        if (isMounted && Array.isArray(list) && list.length > 0) {
          setFetchedNotifications(list);
          return;
        }
      } catch {
        // Fallback ke general school information
      }
      try {
        const res = await mobileApiService.getSchoolInformation({ per_page: 5 });
        const list = unwrapCollection(res);
        if (isMounted && Array.isArray(list) && list.length > 0) {
          setFetchedNotifications(list);
        }
      } catch {
        // Mode offline / fallback
      }
    };

    const hasPropsAnn = Array.isArray(announcements) && announcements.length > 0;
    const hasDashAnn =
      Array.isArray(dashboard?.announcements) ||
      Array.isArray(dashboard?.data?.announcements) ||
      Array.isArray(dashboard?.pengumuman);

    if (!hasPropsAnn && !hasDashAnn) {
      void loadNotifs();
    }

    return () => {
      isMounted = false;
    };
  }, [announcements, dashboard]);

  const displayAnnouncements = useMemo(() => {
    if (Array.isArray(announcements) && announcements.length > 0) {
      return announcements;
    }
    const fromDash =
      dashboard?.announcements ||
      dashboard?.data?.announcements ||
      dashboard?.pengumuman ||
      dashboard?.data?.pengumuman ||
      dashboard?.recent_information ||
      dashboard?.tables?.announcements;
    if (Array.isArray(fromDash) && fromDash.length > 0) {
      return fromDash;
    }
    if (fetchedNotifications.length > 0) {
      return fetchedNotifications;
    }
    return [];
  }, [announcements, dashboard, fetchedNotifications]);

  // Opsi filter dropdown dinamis dari daftar kelas
  const availableMahads = useMemo(() => {
    const set = new Set<string>();
    allClasses.forEach((c) => {
      if (c.mahad) set.add(c.mahad);
    });
    return ['Semua Mahad', ...Array.from(set)];
  }, [allClasses]);

  const availableTingkats = useMemo(() => {
    const set = new Set<string>();
    allClasses.forEach((c) => {
      if (c.tingkat) set.add(String(c.tingkat));
    });
    return ['Semua Tingkat', ...Array.from(set)];
  }, [allClasses]);

  const availableStatuses = useMemo(() => {
    const set = new Set<string>();
    allClasses.forEach((c) => {
      if (c.category) set.add(c.category);
    });
    return ['Semua', ...Array.from(set)];
  }, [allClasses]);

  // 7. Filter & Pencarian Kelas untuk Modal Bottom Sheet (Panel 2 & 3)
  const filteredClasses = useMemo(() => {
    return allClasses.filter((c) => {
      // 1. Filter Search Query
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = (c.nama_kelas || c.name || '').toLowerCase().includes(q);
        const rombelMatch = (c.rombel || '').toLowerCase().includes(q);
        const mahadMatch = (c.mahad || '').toLowerCase().includes(q);
        const roomMatch = (c.ruangan || '').toLowerCase().includes(q);
        if (!nameMatch && !rombelMatch && !mahadMatch && !roomMatch) {
          return false;
        }
      }

      // 2. Filter Kategori Pill
      if (activeCategoryFilter !== 'Semua') {
        if (c.category !== activeCategoryFilter) {
          return false;
        }
      }

      // 3. Filter Dropdown (Panel 3)
      if (filterMahad !== 'Semua Mahad' && c.mahad !== filterMahad) {
        return false;
      }
      if (filterTingkat !== 'Semua Tingkat' && c.tingkat !== filterTingkat) {
        return false;
      }
      if (filterStatusSaya !== 'Semua' && c.category !== filterStatusSaya) {
        return false;
      }

      return true;
    });
  }, [allClasses, searchQuery, activeCategoryFilter, filterMahad, filterTingkat, filterStatusSaya]);

  // Grouping kelas per Mahad/Unit
  const classesByMahad = useMemo(() => {
    const groups: { [key: string]: TeacherClass[] } = {};
    filteredClasses.forEach((cls) => {
      const mahadName = cls.mahad || teacherUnit;
      if (!groups[mahadName]) {
        groups[mahadName] = [];
      }
      groups[mahadName].push(cls);
    });
    return groups;
  }, [filteredClasses, teacherUnit]);

  return (
    <View style={styles.container}>
      {/* ────────────────────────────────────────────────────────── */}
      {/* 1. CARD "SEDANG MENGAJAR" (WARNA LATAR STICKY HEADER)      */}
      {/* ────────────────────────────────────────────────────────── */}
      <LinearGradient
        colors={['#0D6B42', '#18A165', '#2BD988']}
        locations={[0, 0.55, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.liveKbmCard}
      >
        {/* Row Atas: Status Sedang Mengajar / KBM Berikutnya & Jam */}
        <View style={styles.liveKbmTopRow}>
          <View style={styles.liveKbmBadgeLeft}>
            <RadarPulseDot color={activeTeachingSchedule.badgeColor || '#10B981'} size={7} />
            <Text style={styles.liveKbmBadgeText}>
              {activeTeachingSchedule.bannerLabel || 'Sedang Mengajar'}
            </Text>
          </View>
          <Text style={styles.liveKbmTimeText}>
            {activeTeachingSchedule.timeStartStr === '--:--'
              ? 'Tidak Ada Sesi'
              : `${activeTeachingSchedule.timeStartStr} - ${activeTeachingSchedule.timeEndStr}`}
          </Text>
        </View>

        {/* Row Tengah: Icon Al-Qur'an / Rehal + Detail Mapel + Sisa Waktu & Arrow */}
        <View style={styles.liveKbmMidRow}>
          {/* Squircle Icon Al-Qur'an di atas Rehal */}
          <View style={styles.liveKbmIconBox}>
            <MaterialCommunityIcons name="book-open-page-variant" size={24} color="#FFFFFF" />
          </View>

          {/* Info Mapel, Kelas, dan Ruangan */}
          <View style={styles.liveKbmInfoCol}>
            <Text numberOfLines={1} style={styles.liveKbmSubjectText}>
              {activeTeachingSchedule.subjectName}
            </Text>
            <Text numberOfLines={1} style={styles.liveKbmClassText}>
              {activeTeachingSchedule.className}
            </Text>
            <Text numberOfLines={1} style={styles.liveKbmRoomText}>
              📍 {activeTeachingSchedule.room}
            </Text>
          </View>

          {/* Kolom Kanan: Sisa Waktu & Tombol Arrow */}
          <View style={styles.liveKbmRightCol}>
            <View style={styles.liveKbmTimerPill}>
              <MaterialCommunityIcons name="clock-outline" size={10} color="#B45309" style={{ marginRight: 2 }} />
              <Text style={styles.liveKbmTimerText}>
                {activeTeachingSchedule.remainingText}
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigation?.navigate('Jadwal')}
              style={styles.liveKbmArrowBtn}
            >
              <MaterialCommunityIcons name="chevron-right" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Row Bawah: 2 Tombol Aksi (Presensi Siswa & Lihat Materi) */}
        <View style={styles.liveKbmActionRow}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() =>
              navigation?.navigate('QR Code', {
                kelas_id: selectedClass?.id,
                class_name: activeTeachingSchedule.className,
                mode: 'manual',
              })
            }
            style={styles.liveKbmBtnPrimary}
          >
            <MaterialCommunityIcons name="account-group" size={15} color="#064E3B" style={{ marginRight: 5 }} />
            <Text style={styles.liveKbmBtnPrimaryText}>Presensi Siswa</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() =>
              navigation?.navigate('Materi', {
                tab: 'materials',
                kelas_id: selectedClass?.id,
                class_name: activeTeachingSchedule.className,
              })
            }
            style={styles.liveKbmBtnSecondary}
          >
            <MaterialCommunityIcons name="book-open-page-variant" size={15} color="#064E3B" style={{ marginRight: 5 }} />
            <Text style={styles.liveKbmBtnSecondaryText}>Lihat Materi</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* ────────────────────────────────────────────────────────── */}
      {/* 2. CARD "ROMBEL & KELAS AKTIF" (KOMPONEN KUNCI 1)          */}
      {/* ────────────────────────────────────────────────────────── */}
      <View style={styles.whiteSectionCard}>
        {/* Header Rombel & Kelas Aktif */}
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleLeft}>
            <View style={styles.accountIconSquircle}>
              <MaterialCommunityIcons name="account-group" size={18} color="#059669" />
            </View>
            <Text style={styles.sectionTitleText}>Rombel & Kelas Aktif</Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.75}
            onPress={handleOpenClassModal}
            style={styles.seeAllLinkBtn}
          >
            <Text style={styles.seeAllLinkTextBlue}>Ganti Rombel</Text>
            <MaterialCommunityIcons name="chevron-right" size={14} color="#0284C7" />
          </TouchableOpacity>
        </View>

        {/* Konten Rombel: Normal Terpilih (Warna Hijau Sticky Header) vs Belum Dipilih (Panel 5) */}
        {selectedClass ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleOpenClassModal}
            style={styles.activeClassBoxWrap}
          >
            <LinearGradient
              colors={['#0D6B42', '#18A165', '#2BD988']}
              locations={[0, 0.55, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              pointerEvents="none"
              style={styles.activeClassGradient}
            >
              <View style={styles.activeClassLeftIconBox}>
                <MaterialCommunityIcons
                  name={(!selectedClassId || selectedClassId === '__ALL__') ? 'view-grid-outline' : 'domain'}
                  size={22}
                  color="#059669"
                />
              </View>

              <View style={styles.activeClassTextBox}>
                <Text numberOfLines={1} style={styles.activeClassNameText}>
                  {(!selectedClassId || selectedClassId === '__ALL__') ? 'Semua Rombel' : (selectedClass.nama_kelas || selectedClass.name)}
                </Text>
                <Text numberOfLines={1} style={styles.activeClassDetailText}>
                  {(!selectedClassId || selectedClassId === '__ALL__')
                    ? `${allClasses.length} Rombel • Seluruh Jadwal Ditampilkan`
                    : `${selectedClass.mahad || teacherUnit} • ${selectedClass.total_santri ? `${selectedClass.total_santri} Santri` : (selectedClass.kapasitas ? `${selectedClass.kapasitas} Santri` : 'Kelas Aktif')} • Wali Kelas: ${selectedClass.wali_kelas || teacherName}`}
                </Text>
              </View>

              <View style={styles.activeClassChevronBox}>
                <MaterialCommunityIcons name="chevron-down" size={20} color="#FFFFFF" />
              </View>
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          /* Empty State Rombel (Panel 5) */
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleOpenClassModal}
            style={styles.emptyClassBoxAmber}
          >
            <View style={styles.emptyClassAmberIconBox}>
              <MaterialCommunityIcons name="alert-circle-outline" size={22} color="#D97706" />
            </View>

            <View style={styles.activeClassTextBox}>
              <Text numberOfLines={1} style={styles.emptyClassAmberTitle}>
                Belum dipilih
              </Text>
              <Text numberOfLines={1} style={styles.emptyClassAmberSub}>
                Pilih rombel dan kelas untuk menampilkan data.
              </Text>
            </View>

            <MaterialCommunityIcons name="chevron-right" size={20} color="#D97706" />
          </TouchableOpacity>
        )}
      </View>

      {/* ────────────────────────────────────────────────────────── */}
      {/* 3. CARD "JADWAL HARI INI" (HORIZONTAL CAROUSEL / EMPTY)    */}
      {/* ────────────────────────────────────────────────────────── */}
      <View style={styles.whiteSectionCard}>
        {/* Header Jadwal Hari Ini: Judul di atas & Tanggal di bawah label */}
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleLeftCol}>
            <View style={styles.sectionTitleHeaderRow}>
              <View style={styles.calendarIconSquircle}>
                <MaterialCommunityIcons name="calendar-month" size={18} color="#059669" />
              </View>
              <Text style={styles.sectionTitleText}>Jadwal Hari Ini</Text>
            </View>
            {/* Tanggal dipindahkan ke bawah label Jadwal Hari Ini */}
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => navigation?.navigate('Kalender')}
              style={styles.dateBadgeBelowTitle}
            >
              <MaterialCommunityIcons name="calendar-month-outline" size={12} color="#059669" style={{ marginRight: 4 }} />
              <Text numberOfLines={1} style={styles.dateBadgeBelowText}>
                {dateFormatted}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => navigation?.navigate('Jadwal')}
            style={styles.seeAllLinkBtn}
          >
            <Text style={styles.seeAllLinkTextBlue}>Lihat Semua</Text>
            <MaterialCommunityIcons name="chevron-right" size={14} color="#0284C7" />
          </TouchableOpacity>
        </View>

        {/* Kondisi: Carousel Kartu Jadwal (Panel 1, 4) vs Empty State (Panel 5) */}
        {selectedClass ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scheduleTrack}
          >
            {displaySchedules.map((item, idx) => {
              const isCompleted = item.status === 'completed';
              const isOngoing = item.status === 'ongoing';
              const isUpcoming = item.status === 'upcoming';

              return (
                <TouchableOpacity
                  key={item.id || idx}
                  activeOpacity={0.85}
                  onPress={() => navigation?.navigate('Jadwal')}
                  style={[
                    styles.schedulePillCard,
                    isCompleted && styles.schedulePillCardCompleted,
                    isOngoing && styles.schedulePillCardOngoing,
                    isUpcoming && styles.schedulePillCardUpcoming,
                  ]}
                >
                  {/* Baris Atas: Status Indicator & Waktu */}
                  <View style={styles.schedCardTopRow}>
                    {isCompleted ? (
                      <View style={styles.schedCheckIcon}>
                        <MaterialCommunityIcons name="check-circle" size={15} color="#94A3B8" />
                      </View>
                    ) : isOngoing ? (
                      <RadarPulseDot color="#10B981" size={7} />
                    ) : (
                      <View style={styles.schedUpcomingDotYellow} />
                    )}
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.schedTimeText,
                        isCompleted && styles.schedTimeTextCompleted,
                        isOngoing && styles.schedTimeTextOngoing,
                        isUpcoming && styles.schedTimeTextUpcoming,
                      ]}
                    >
                      {item.timeStartStr} - {item.timeEndStr}
                    </Text>
                  </View>

                  {/* Konten Tengah: Mapel & Kelas */}
                  <View style={styles.schedCardMid}>
                    <Text
                      numberOfLines={2}
                      style={[
                        styles.schedSubjectText,
                        isCompleted && styles.schedSubjectTextCompleted,
                        isOngoing && styles.schedSubjectTextOngoing,
                        isUpcoming && styles.schedSubjectTextUpcoming,
                      ]}
                    >
                      {item.subjectName}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.schedClassText,
                        isCompleted && styles.schedClassTextCompleted,
                        isOngoing && styles.schedClassTextOngoing,
                        isUpcoming && styles.schedClassTextUpcoming,
                      ]}
                    >
                      {item.className}
                    </Text>
                  </View>

                  {/* Baris Bawah: Status Pill Badge */}
                  <View style={styles.schedCardBottom}>
                    {isCompleted ? (
                      <View style={styles.badgeCompletedPill}>
                        <Text style={styles.badgeCompletedPillText}>Selesai</Text>
                      </View>
                    ) : isOngoing ? (
                      <View style={styles.badgeOngoingPill}>
                        <Text style={styles.badgeOngoingPillText}>Sedang Berjalan</Text>
                      </View>
                    ) : (
                      <View style={styles.badgeUpcomingPillYellow}>
                        <Text style={styles.badgeUpcomingPillTextYellow}>Akan Datang</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : (
          /* Empty State Jadwal KBM (Panel 5) */
          <View style={styles.emptyScheduleContainer}>
            <View style={styles.emptyScheduleIconCircle}>
              <MaterialCommunityIcons name="calendar-month-outline" size={40} color="#059669" />
            </View>
            <Text style={styles.emptyScheduleTitle}>Belum ada jadwal KBM hari ini</Text>
            <Text style={styles.emptyScheduleSubtitle}>
              Pilih rombel dan kelas terlebih dahulu untuk melihat jadwal mengajar.
            </Text>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleOpenClassModal}
              style={styles.emptyScheduleSelectBtn}
            >
              <Text style={styles.emptyScheduleSelectBtnText}>Pilih Rombel & Kelas</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ────────────────────────────────────────────────────────── */}
      {/* 4. CARD "MENU UTAMA" (GRID 5 KOLOM X 3 BARIS)              */}
      {/* ────────────────────────────────────────────────────────── */}
      <View style={styles.whiteSectionCard}>
        {/* Header Menu Utama */}
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleLeft}>
            <View style={styles.gridIconSquircle}>
              <MaterialCommunityIcons name="view-grid" size={18} color="#059669" />
            </View>
            <Text style={styles.sectionTitleText}>Menu Utama</Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => {
              if (typeof onOpenAllMenus === 'function') {
                onOpenAllMenus();
              } else {
                navigation?.navigate('Menu');
              }
            }}
            style={styles.seeAllLinkBtn}
          >
            <Text style={styles.seeAllLinkTextBlue}>Lihat Semua</Text>
            <MaterialCommunityIcons name="chevron-right" size={14} color="#0284C7" />
          </TouchableOpacity>
        </View>

        {/* Grid 5 Kolom Menu */}
        <View style={styles.menuGrid5Col}>
          {primary15MenuItems.map((menu) => (
            <TouchableOpacity
              key={menu.id}
              activeOpacity={0.75}
              onPress={() => handleMenuPress(menu)}
              style={styles.menuItem5Col}
            >
              <View style={[styles.menuItemSquircle, { backgroundColor: menu.bg }]}>
                <MaterialCommunityIcons
                  name={menu.icon as any}
                  size={24}
                  color={menu.color}
                />
              </View>
              <Text numberOfLines={2} style={styles.menuItemLabel}>
                {menu.title}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ────────────────────────────────────────────────────────── */}
      {/* 5. CARD "INFORMASI TERBARU" (HORIZONTAL CARDS)             */}
      {/* ────────────────────────────────────────────────────────── */}
      <View style={styles.whiteSectionCard}>
        {/* Header Informasi Terbaru */}
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleLeft}>
            <View style={styles.notifIconSquircle}>
              <MaterialCommunityIcons name="bullhorn" size={18} color="#059669" />
            </View>
            <Text style={styles.sectionTitleText}>Informasi Terbaru</Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => navigation?.navigate('Notifikasi')}
            style={styles.seeAllLinkBtn}
          >
            <Text style={styles.seeAllLinkTextBlue}>Lihat Semua</Text>
            <MaterialCommunityIcons name="chevron-right" size={14} color="#0284C7" />
          </TouchableOpacity>
        </View>

        {/* Dynamic Horizontal Cards Pengumuman / Informasi Terbaru */}
        {displayAnnouncements.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.infoTrack}
          >
            {displayAnnouncements.map((item: any, idx: number) => {
              const theme = getAnnouncementTheme(idx);
              const title = getAnnouncementTitle(item);
              const body = getAnnouncementBody(item);
              const { label, time } = getAnnouncementTimeTag(item);

              return (
                <TouchableOpacity
                  key={item.id || idx}
                  activeOpacity={0.85}
                  onPress={() => {
                    if (item.route) {
                      navigation?.navigate(item.route);
                    } else {
                      navigation?.navigate('Informasi', { item, title });
                    }
                  }}
                  style={styles.infoHorizontalCardWrap}
                >
                  <LinearGradient
                    colors={['#0D6B42', '#18A165', '#2BD988']}
                    locations={[0, 0.55, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.infoHorizontalCard}
                  >
                    <View style={styles.infoIconBox}>
                      <MaterialCommunityIcons name={theme.icon || 'bullhorn'} size={20} color="#059669" />
                    </View>
                    <View style={styles.infoTextBox}>
                      <View style={styles.infoTitleRow}>
                        <Text numberOfLines={1} style={styles.infoCardTitle}>
                          {title}
                        </Text>
                        {label ? (
                          <View style={styles.infoMetaTag}>
                            <Text style={styles.infoMetaText}>{label}</Text>
                            {time ? (
                              <>
                                <View style={styles.infoTimeDot} />
                                <Text style={styles.infoTimeText}>{time}</Text>
                              </>
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                      <Text numberOfLines={2} style={styles.infoCardSub}>
                        {body || 'Ketuk untuk membaca informasi lengkap.'}
                      </Text>
                    </View>
                    <View style={styles.infoChevronBox}>
                      <MaterialCommunityIcons name="chevron-right" size={16} color="#FFFFFF" />
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : (
          <View style={styles.emptyInfoContainer}>
            <View style={styles.emptyInfoIconCircle}>
              <MaterialCommunityIcons name="bullhorn-outline" size={24} color="#059669" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.emptyInfoTitle}>Belum Ada Informasi Baru</Text>
              <Text style={styles.emptyInfoSub}>
                Semua pengumuman dan edaran resmi madrasah akan muncul di sini.
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* ────────────────────────────────────────────────────────── */}
      {/* 6. MODAL BOTTOM SHEET: PILIH ROMBEL & KELAS (PANEL 2 & 3)  */}
      {/* ────────────────────────────────────────────────────────── */}
      <Modal
        visible={showAllClassesModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAllClassesModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={styles.modalBackdropDismiss}
            activeOpacity={1}
            onPress={() => setShowAllClassesModal(false)}
          />

          <View style={styles.modalSheetContent}>
            {/* Header Modal Berwarna Gradasi Hijau Zamrud Sticky Header */}
            <LinearGradient
              colors={['#0D6B42', '#18A165', '#2BD988']}
              locations={[0, 0.55, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.modalHeaderBanner}
            >
              {/* Drag Handle Bar Putih Halus */}
              <View style={styles.modalDragHandleBanner} />

              <View style={styles.modalHeaderRow}>
                <View style={styles.modalHeaderLeftGroup}>
                  <View style={styles.modalHeaderIconBadge}>
                    <MaterialCommunityIcons name="domain" size={20} color="#064E3B" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={styles.modalTitleTextWhite}>
                      Pilih Rombel & Kelas
                    </Text>
                    <Text numberOfLines={1} style={styles.modalSubtitleTextMint}>
                      Tentukan rombel aktif atau seluruh jadwal
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setShowAllClassesModal(false)}
                  style={styles.modalCloseCircleBtnWhite}
                >
                  <MaterialCommunityIcons name="close" size={18} color="#064E3B" />
                </TouchableOpacity>
              </View>
            </LinearGradient>

            {/* Search Bar & Tune Filter Button */}
            <View style={styles.searchRow}>
              <View style={styles.searchInputWrap}>
                <MaterialCommunityIcons name="magnify" size={20} color="#94A3B8" style={{ marginRight: 8 }} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Cari nama kelas, rombel, atau lokasi..."
                  placeholderTextColor="#94A3B8"
                  style={styles.searchTextInput}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
                    <MaterialCommunityIcons name="close-circle" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setShowFilterPanel(!showFilterPanel)}
                style={[
                  styles.filterTuneBtn,
                  showFilterPanel && styles.filterTuneBtnActive,
                ]}
              >
                <MaterialCommunityIcons
                  name="tune-variant"
                  size={20}
                  color={showFilterPanel ? '#059669' : '#475569'}
                />
              </TouchableOpacity>
            </View>

            {/* 4 Category Filter Pills */}
            <View style={styles.categoryPillsRow}>
              {['Semua', 'Kelas Binaan', 'Wali Kelas', 'Mengajar'].map((cat) => {
                const isActive = activeCategoryFilter === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    activeOpacity={0.8}
                    onPress={() => setActiveCategoryFilter(cat)}
                    style={[
                      styles.categoryPill,
                      isActive && styles.categoryPillActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryPillText,
                        isActive && styles.categoryPillTextActive,
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ──────────────────────────────────────────────────────── */}
            {/* PANEL FILTER & PENCARIAN (PANEL 3 EXPANDABLE)            */}
            {/* ──────────────────────────────────────────────────────── */}
            {showFilterPanel && (
              <View style={styles.filterOptionsPanel}>
                <View style={styles.filterOptionsPanelHeader}>
                  <Text style={styles.filterPanelTitle}>Filter</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setFilterMahad('Semua Mahad');
                      setFilterTingkat('Semua Tingkat');
                      setFilterStatusSaya('Semua');
                      setActiveCategoryFilter('Semua');
                      setSearchQuery('');
                    }}
                  >
                    <Text style={styles.filterResetLink}>Reset</Text>
                  </TouchableOpacity>
                </View>

                {/* Dropdown 1: Mahad / Lokasi */}
                <View style={styles.filterFieldItem}>
                  <Text style={styles.filterFieldLabel}>Mahad / Lokasi</Text>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      const curIdx = availableMahads.indexOf(filterMahad);
                      const nextIdx = (curIdx + 1) % availableMahads.length;
                      setFilterMahad(availableMahads[nextIdx]);
                    }}
                    style={styles.filterSelectBox}
                  >
                    <Text style={styles.filterSelectBoxText}>{filterMahad}</Text>
                    <MaterialCommunityIcons name="chevron-down" size={18} color="#64748B" />
                  </TouchableOpacity>
                </View>

                {/* Dropdown 2: Tingkat */}
                <View style={styles.filterFieldItem}>
                  <Text style={styles.filterFieldLabel}>Tingkat</Text>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      const curIdx = availableTingkats.indexOf(filterTingkat);
                      const nextIdx = (curIdx + 1) % availableTingkats.length;
                      setFilterTingkat(availableTingkats[nextIdx]);
                    }}
                    style={styles.filterSelectBox}
                  >
                    <Text style={styles.filterSelectBoxText}>{filterTingkat}</Text>
                    <MaterialCommunityIcons name="chevron-down" size={18} color="#64748B" />
                  </TouchableOpacity>
                </View>

                {/* Dropdown 3: Status Saya */}
                <View style={styles.filterFieldItem}>
                  <Text style={styles.filterFieldLabel}>Status Saya</Text>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      const curIdx = availableStatuses.indexOf(filterStatusSaya);
                      const nextIdx = (curIdx + 1) % availableStatuses.length;
                      setFilterStatusSaya(availableStatuses[nextIdx]);
                    }}
                    style={styles.filterSelectBox}
                  >
                    <Text style={styles.filterSelectBoxText}>{filterStatusSaya}</Text>
                    <MaterialCommunityIcons name="chevron-down" size={18} color="#64748B" />
                  </TouchableOpacity>
                </View>

                {/* Tombol Tampilkan Hasil */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setShowFilterPanel(false)}
                  style={styles.applyFilterBtn}
                >
                  <Text style={styles.applyFilterBtnText}>Tampilkan Hasil</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* List Grouped Kelas per Mahad */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              style={styles.modalScrollArea}
              contentContainerStyle={{ paddingBottom: 16 }}
            >
              {/* Opsi Spesial: Lihat Semua Rombel (Semua Jadwal Rombel Tampil) */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() =>
                  handleSelectClass({
                    id: '__ALL__',
                    name: 'Semua Rombel',
                    nama_kelas: 'Semua Rombel',
                    rombel: 'Semua Rombel',
                    mahad: teacherUnit,
                    total_santri: allClasses.reduce((acc, c) => acc + (c.total_santri || 0), 0),
                    wali_kelas: teacherName,
                  } as any)
                }
                style={[
                  styles.classItemRow,
                  styles.classItemRowAll,
                  (!tempSelectedClassId || tempSelectedClassId === '__ALL__' || selectedClassId === '__ALL__') && styles.classItemRowAllSelected,
                ]}
              >
                <View
                  style={[
                    styles.classItemIconBox,
                    (!tempSelectedClassId || tempSelectedClassId === '__ALL__' || selectedClassId === '__ALL__') ? styles.classItemIconBoxAllSelected : styles.classItemIconBoxAll,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="view-grid-outline"
                    size={20}
                    color={(!tempSelectedClassId || tempSelectedClassId === '__ALL__' || selectedClassId === '__ALL__') ? '#059669' : '#0284C7'}
                  />
                </View>

                <View style={styles.classItemInfoCol}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.classItemNameText,
                        (!tempSelectedClassId || tempSelectedClassId === '__ALL__' || selectedClassId === '__ALL__') && styles.classItemNameTextSelected,
                      ]}
                    >
                      Lihat Semua Rombel
                    </Text>
                    <View style={styles.pillSemuaRombel}>
                      <Text style={styles.pillSemuaRombelText}>Semua Jadwal</Text>
                    </View>
                  </View>
                  <Text numberOfLines={1} style={styles.classItemSubText}>
                    Tampilkan seluruh jadwal dari {allClasses.length} kelas binaan & mengajar
                  </Text>
                </View>

                {(!tempSelectedClassId || tempSelectedClassId === '__ALL__' || selectedClassId === '__ALL__') ? (
                  <MaterialCommunityIcons name="check-circle" size={22} color="#059669" />
                ) : (
                  <MaterialCommunityIcons name="checkbox-blank-circle-outline" size={22} color="#CBD5E1" />
                )}
              </TouchableOpacity>

              {Object.keys(classesByMahad).length > 0 ? (
                Object.entries(classesByMahad).map(([mahadName, items]) => (
                  <View key={mahadName} style={styles.mahadGroupContainer}>
                    {/* Header Group Mahad */}
                    <View style={styles.mahadGroupHeader}>
                      <View style={styles.mahadGroupTitleLeft}>
                        <MaterialCommunityIcons name="domain" size={16} color="#059669" style={{ marginRight: 6 }} />
                        <Text style={styles.mahadGroupTitleText}>{mahadName}</Text>
                      </View>
                      <Text style={styles.mahadGroupCountText}>{items.length} kelas ›</Text>
                    </View>

                    {/* Class Items in this Mahad */}
                    <View style={styles.classListContainer}>
                      {items.map((cls) => {
                        const isSelected = String(cls.id) === String(tempSelectedClassId);
                        const hasSchedule =
                          classIdsWithSchedule.ids.has(String(cls.id)) ||
                          classIdsWithSchedule.names.has((cls.nama_kelas || cls.name || '').trim().toLowerCase()) ||
                          Boolean(cls.schedule);

                        return (
                          <TouchableOpacity
                            key={cls.id}
                            activeOpacity={0.8}
                            onPress={() => handleSelectClass(cls)}
                            style={[
                              styles.classItemRow,
                              hasSchedule && styles.classItemRowYellow,
                              isSelected && styles.classItemRowSelected,
                              isSelected && hasSchedule && styles.classItemRowYellowSelected,
                            ]}
                          >
                            {/* Left Squircle Icon */}
                            <View
                              style={[
                                styles.classItemIconBox,
                                hasSchedule && styles.classItemIconBoxYellow,
                                isSelected && styles.classItemIconBoxSelected,
                                isSelected && hasSchedule && styles.classItemIconBoxYellowSelected,
                              ]}
                            >
                              <MaterialCommunityIcons
                                name="domain"
                                size={20}
                                color={hasSchedule ? '#B45309' : isSelected ? '#059669' : '#059669'}
                              />
                            </View>

                            {/* Middle Info */}
                            <View style={styles.classItemInfoCol}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <Text
                                  numberOfLines={1}
                                  style={[
                                    styles.classItemNameText,
                                    hasSchedule && styles.classItemNameTextYellow,
                                    isSelected && styles.classItemNameTextSelected,
                                  ]}
                                >
                                  {cls.nama_kelas || cls.name}
                                </Text>
                                {hasSchedule && (
                                  <View style={styles.pillAdaJadwalYellow}>
                                    <MaterialCommunityIcons name="calendar-check" size={10} color="#B45309" style={{ marginRight: 2 }} />
                                    <Text style={styles.pillAdaJadwalYellowText}>Ada Jadwal</Text>
                                  </View>
                                )}
                              </View>
                              <Text numberOfLines={1} style={[styles.classItemSubText, hasSchedule && { color: '#92400E' }]}>
                                Rombel: {cls.rombel || cls.nama_kelas} • {cls.total_santri ? `${cls.total_santri} Santri` : (cls.kapasitas ? `${cls.kapasitas} Santri` : 'Santri Terdaftar')}
                              </Text>
                            </View>

                            {/* Right Radio Indicator */}
                            {isSelected ? (
                              <MaterialCommunityIcons
                                name="check-circle"
                                size={22}
                                color={hasSchedule ? '#D97706' : '#059669'}
                              />
                            ) : (
                              <MaterialCommunityIcons
                                name="checkbox-blank-circle-outline"
                                size={22}
                                color={hasSchedule ? '#F59E0B' : '#CBD5E1'}
                              />
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.noClassesFoundBox}>
                  <MaterialCommunityIcons name="magnify-close" size={36} color="#94A3B8" />
                  <Text style={styles.noClassesFoundText}>Tidak ada rombel yang sesuai kriteria.</Text>
                </View>
              )}
            </ScrollView>

            {/* Bottom Footer Action */}
            <View style={styles.modalFooterActions}>
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={handleApplyClass}
                style={styles.applyRombelBtn}
              >
                <Text style={styles.applyRombelBtnText}>Terapkan Rombel</Text>
              </TouchableOpacity>

              {/* Opsi Reset untuk Mengetes Panel 5 (Belum Memilih) */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleClearSelectedClass}
                style={styles.clearSelectionBtn}
              >
                <Text style={styles.clearSelectionBtnText}>Kosongkan Pilihan (Mode Belum Memilih)</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 48,
    backgroundColor: '#F8FAFC',
  },

  /* ────────────────────────────────────────────────────────── */
  /* 1. LIVE KBM CARD ("Sedang Mengajar")                       */
  /* ────────────────────────────────────────────────────────── */
  liveKbmCard: {
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingTop: 13,
    paddingBottom: 13,
    marginBottom: 14,
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  liveKbmTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  liveKbmBadgeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveKbmPulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  liveKbmBadgeText: {
    color: '#FBBF24',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  liveKbmTimeText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },
  liveKbmMidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  liveKbmIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveKbmInfoCol: {
    flex: 1,
    marginLeft: 10,
    marginRight: 6,
    justifyContent: 'center',
  },
  liveKbmSubjectText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  liveKbmClassText: {
    color: '#D1FAE5',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 1,
  },
  liveKbmRoomText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 10.5,
    fontWeight: '500',
  },
  liveKbmRightCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 6,
  },
  liveKbmTimerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
  },
  liveKbmTimerText: {
    color: '#B45309',
    fontSize: 9.5,
    fontWeight: '800',
  },
  liveKbmArrowBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveKbmActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveKbmBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  liveKbmBtnPrimaryText: {
    color: '#064E3B',
    fontSize: 11.5,
    fontWeight: '800',
  },
  liveKbmBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  liveKbmBtnSecondaryText: {
    color: '#064E3B',
    fontSize: 11.5,
    fontWeight: '800',
  },

  /* ────────────────────────────────────────────────────────── */
  /* 2. WHITE SECTION CARDS UMUM                                */
  /* ────────────────────────────────────────────────────────── */
  whiteSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  sectionTitleLeftCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  sectionTitleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  dateBadgeBelowTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 36,
  },
  dateBadgeBelowText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  accountIconSquircle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#DEF7EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarIconSquircle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#E6F7F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridIconSquircle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#DEF7EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifIconSquircle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#DEF7EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitleText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  sectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  seeAllLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllLinkTextBlue: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0284C7',
  },
  dateBadgeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    borderRadius: 8,
  },
  dateBadgeText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#475569',
  },

  /* ────────────────────────────────────────────────────────── */
  /* ROMBEL & KELAS AKTIF (KOMPONEN 1 - WARNA HIJAU STICKY HEADER) */
  /* ────────────────────────────────────────────────────────── */
  activeClassBoxWrap: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
    elevation: 4,
  },
  activeClassGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  activeClassLeftIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  activeClassTextBox: {
    flex: 1,
    justifyContent: 'center',
  },
  activeClassNameText: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  activeClassDetailText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#A7F3D0',
  },
  activeClassChevronBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },

  /* Empty State Rombel (Panel 5) */
  emptyClassBoxAmber: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 16,
    padding: 12,
  },
  emptyClassAmberIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  emptyClassAmberTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#92400E',
    marginBottom: 2,
  },
  emptyClassAmberSub: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#B45309',
  },

  /* ────────────────────────────────────────────────────────── */
  /* JADWAL HARI INI: CAROUSEL VS EMPTY STATE                   */
  /* ────────────────────────────────────────────────────────── */
  scheduleTrack: {
    gap: 10,
    paddingRight: 8,
  },
  schedulePillCard: {
    width: 126,
    minHeight: 136,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 10,
    justifyContent: 'space-between',
  },
  schedulePillCardCompleted: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
    borderWidth: 1.5,
  },
  schedulePillCardOngoing: {
    borderColor: '#10B981',
    borderWidth: 2,
    backgroundColor: '#ECFDF5',
  },
  schedulePillCardUpcoming: {
    backgroundColor: '#FEFCE8',
    borderColor: '#FACC15',
    borderWidth: 1.5,
  },
  schedCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 6,
  },
  schedCheckIcon: {
    width: 15,
    height: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  schedUpcomingDotYellow: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#EAB308',
  },
  schedTimeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  schedTimeTextCompleted: {
    color: '#64748B',
    fontWeight: '600',
  },
  schedTimeTextOngoing: {
    color: '#064E3B',
    fontWeight: '800',
  },
  schedTimeTextUpcoming: {
    color: '#854D0E',
    fontWeight: '800',
  },
  schedCardMid: {
    flex: 1,
    justifyContent: 'center',
    marginVertical: 3,
  },
  schedSubjectText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 16,
    marginBottom: 2,
  },
  schedSubjectTextCompleted: {
    color: '#64748B',
  },
  schedSubjectTextOngoing: {
    color: '#064E3B',
  },
  schedSubjectTextUpcoming: {
    color: '#713F12',
  },
  schedClassText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#64748B',
  },
  schedClassTextCompleted: {
    color: '#94A3B8',
  },
  schedClassTextOngoing: {
    color: '#059669',
    fontWeight: '700',
  },
  schedClassTextUpcoming: {
    color: '#A16207',
    fontWeight: '600',
  },
  schedCardBottom: {
    marginTop: 4,
  },
  badgeCompletedPill: {
    backgroundColor: '#E2E8F0',
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 6,
    alignItems: 'center',
  },
  badgeCompletedPillText: {
    color: '#475569',
    fontSize: 9.5,
    fontWeight: '700',
  },
  badgeOngoingPill: {
    backgroundColor: '#10B981',
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 6,
    alignItems: 'center',
  },
  badgeOngoingPillText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '800',
  },
  badgeUpcomingPillYellow: {
    backgroundColor: '#FEF08A',
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 6,
    alignItems: 'center',
  },
  badgeUpcomingPillTextYellow: {
    color: '#854D0E',
    fontSize: 9.5,
    fontWeight: '800',
  },
  classItemRowAll: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
    borderWidth: 1.5,
    marginBottom: 10,
  },
  classItemRowAllSelected: {
    backgroundColor: '#F0FDF4',
    borderColor: '#059669',
    borderWidth: 2,
  },
  classItemIconBoxAll: {
    backgroundColor: '#E0F2FE',
  },
  classItemIconBoxAllSelected: {
    backgroundColor: '#DEF7EC',
  },
  pillSemuaRombel: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pillSemuaRombelText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },

  /* Empty State Jadwal (Panel 5) */
  emptyScheduleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  emptyScheduleIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E6F7F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyScheduleTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
    textAlign: 'center',
  },
  emptyScheduleSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 16,
    maxWidth: 260,
  },
  emptyScheduleSelectBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 12,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  emptyScheduleSelectBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },

  /* ────────────────────────────────────────────────────────── */
  /* 4. MENU UTAMA (GRID 5 KOLOM)                               */
  /* ────────────────────────────────────────────────────────── */
  menuGrid5Col: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 16,
  },
  menuItem5Col: {
    width: '18.5%',
    alignItems: 'center',
  },
  menuItemSquircle: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  menuItemLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#334155',
    textAlign: 'center',
    lineHeight: 13,
  },

  /* ────────────────────────────────────────────────────────── */
  /* 5. INFORMASI TERBARU (HORIZONTAL CARDS)                    */
  /* ────────────────────────────────────────────────────────── */
  infoTrack: {
    gap: 12,
    paddingRight: 8,
  },
  infoHorizontalCardWrap: {
    width: 295,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
  },
  infoHorizontalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  infoIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  infoTextBox: {
    flex: 1,
    justifyContent: 'center',
  },
  infoTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  infoCardTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
    flex: 1,
  },
  infoMetaTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  infoMetaText: {
    fontSize: 9.5,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  infoTimeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FEF08A',
  },
  infoTimeText: {
    fontSize: 9.5,
    color: '#DEF7EC',
    fontWeight: '700',
  },
  infoCardSub: {
    fontSize: 11.5,
    color: '#DEF7EC',
    lineHeight: 16,
  },
  infoChevronBox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    gap: 12,
  },
  emptyInfoIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#DEF7EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyInfoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  emptyInfoSub: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 15,
  },

  /* ────────────────────────────────────────────────────────── */
  /* 6. MODAL BOTTOM SHEET: PILIH ROMBEL & KELAS (PANEL 2 & 3)  */
  /* ────────────────────────────────────────────────────────── */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalBackdropDismiss: {
    flex: 1,
  },
  modalSheetContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    maxHeight: '85%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 14,
    elevation: 20,
  },
  modalHeaderBanner: {
    marginHorizontal: -16,
    marginTop: -10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginBottom: 14,
  },
  modalDragHandleBanner: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalHeaderLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  modalHeaderIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  modalTitleTextWhite: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  modalSubtitleTextMint: {
    fontSize: 11,
    fontWeight: '600',
    color: '#DEF7EC',
    marginTop: 1,
  },
  modalCloseCircleBtnWhite: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  modalDragHandle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalTitleText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  modalCloseCircleBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 42,
  },
  searchTextInput: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
    paddingVertical: 0,
  },
  filterTuneBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterTuneBtnActive: {
    backgroundColor: '#DEF7EC',
    borderColor: '#A7F3D0',
  },
  categoryPillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  categoryPillActive: {
    backgroundColor: '#065F46',
  },
  categoryPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  categoryPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  /* Filter Panel Expandable (Panel 3) */
  filterOptionsPanel: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterOptionsPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  filterPanelTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  filterResetLink: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284C7',
  },
  filterFieldItem: {
    marginBottom: 10,
  },
  filterFieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4,
  },
  filterSelectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  filterSelectBoxText: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '600',
  },
  applyFilterBtn: {
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 6,
  },
  applyFilterBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },

  /* Grouped Class Items */
  modalScrollArea: {
    maxHeight: 380,
  },
  mahadGroupContainer: {
    marginBottom: 14,
  },
  mahadGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  mahadGroupTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mahadGroupTitleText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  mahadGroupCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  classListContainer: {
    gap: 8,
  },
  classItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  classItemRowYellow: {
    backgroundColor: '#FEFCE8',
    borderColor: '#FACC15',
    borderWidth: 1.5,
  },
  classItemRowSelected: {
    backgroundColor: '#F0FDF4',
    borderColor: '#059669',
    borderWidth: 1.5,
  },
  classItemRowYellowSelected: {
    backgroundColor: '#FEF9C3',
    borderColor: '#D97706',
    borderWidth: 2,
  },
  classItemIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#E6F7F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  classItemIconBoxYellow: {
    backgroundColor: '#FEF08A',
  },
  classItemIconBoxSelected: {
    backgroundColor: '#DEF7EC',
  },
  classItemIconBoxYellowSelected: {
    backgroundColor: '#FDE047',
  },
  classItemInfoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  classItemNameText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  classItemNameTextYellow: {
    color: '#713F12',
  },
  pillAdaJadwalYellow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF08A',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: '#FACC15',
  },
  pillAdaJadwalYellowText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#854D0E',
  },
  classItemNameTextSelected: {
    color: '#047857',
  },
  classItemSubText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
  },
  noClassesFoundBox: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  noClassesFoundText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },

  /* Footer Action Buttons */
  modalFooterActions: {
    paddingTop: 10,
    gap: 8,
  },
  applyRombelBtn: {
    backgroundColor: '#065F46',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#065F46',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  applyRombelBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
  clearSelectionBtn: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  clearSelectionBtnText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});

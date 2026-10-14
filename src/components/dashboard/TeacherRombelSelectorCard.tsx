import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
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
import { useAuthStore } from '../../stores/authStore';
import {
  isPrincipalRole,
  isDivisiRole,
  isTuRole,
  isSuperAdminRole,
} from '../../utils/roles';
import { mobileApiService, unwrapCollection } from '../../services/mobileApiService';
import AppFeedbackModal, { FeedbackType } from '../AppFeedbackModal';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface TeacherRombelSelectorCardProps {
  navigation: any;
  dashboard?: Record<string, any>;
  onSelectClass?: (classItem: TeacherClass) => void;
  onOpenAllMenus?: () => void;
}

export default function TeacherRombelSelectorCard({
  navigation,
  dashboard,
  onSelectClass,
  onOpenAllMenus,
}: TeacherRombelSelectorCardProps) {
  const user = useAuthStore((state) => state.user);
  const roles = useAuthStore((state) => state.roles);

  const isPrincipal = isPrincipalRole(roles);
  const isDivisi = isDivisiRole(roles);
  const isTu = isTuRole(roles);
  const isSuperAdmin = isSuperAdminRole(roles);
  const isPimpinan = isPrincipal || isDivisi || isTu || isSuperAdmin;

  const classes = useTeacherClassStore((state) => state.classes) || [];
  const selectedClassId = useTeacherClassStore((state) => state.selectedClassId);
  const schedulesToday = useTeacherClassStore((state) => state.schedulesToday) || [];
  const setClasses = useTeacherClassStore((state) => state.setClasses);
  const setSelectedClassId = useTeacherClassStore((state) => state.setSelectedClassId);
  const setSchedulesToday = useTeacherClassStore((state) => state.setSchedulesToday);
  const getActiveScheduleNow = useTeacherClassStore((state) => state.getActiveScheduleNow);
  const isClassLocked = useTeacherClassStore((state) => state.isClassLocked);
  const requestUnlock = useTeacherClassStore((state) => state.requestUnlock);
  const approveUnlock = useTeacherClassStore((state) => state.approveUnlock);
  const getSelectedClass = useTeacherClassStore((state) => state.getSelectedClass);

  const [loadingClasses, setLoadingClasses] = useState<boolean>(false);
  const [showAllClassesModal, setShowAllClassesModal] = useState<boolean>(false);
  const [unlockModalVisible, setUnlockModalVisible] = useState<boolean>(false);
  const [approvalModalVisible, setApprovalModalVisible] = useState<boolean>(false);
  const [requestType, setRequestType] = useState<string>('inval');
  const [reason, setReason] = useState<string>('');

  // Feedback Notification
  const [feedback, setFeedback] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
  } | null>(null);

  // 1. Sinkronisasi data kelas & jadwal guru
  useEffect(() => {
    // Jika dashboard membawa schedules_today, masukkan ke store
    if (dashboard?.schedules_today && Array.isArray(dashboard.schedules_today)) {
      setSchedulesToday(dashboard.schedules_today);
    } else if (dashboard?.data?.schedules_today && Array.isArray(dashboard.data.schedules_today)) {
      setSchedulesToday(dashboard.data.schedules_today);
    }

    // Ambil daftar kelas dari API jika store masih kosong
    const fetchClasses = async () => {
      try {
        setLoadingClasses(true);
        const res = await mobileApiService.getTeacherClasses();
        const list = unwrapCollection(res);
        if (list.length > 0) {
          setClasses(list);
        }
      } catch {
        // Fallback: ekstrak kelas unik dari schedules_today
        const scheds = dashboard?.schedules_today || dashboard?.data?.schedules_today || [];
        const uniqueClasses: any[] = [];
        const seenIds = new Set();
        scheds.forEach((s: any) => {
          if (s.kelas && !seenIds.has(s.kelas.id)) {
            seenIds.add(s.kelas.id);
            uniqueClasses.push({
              id: s.kelas.id,
              nama_kelas: s.kelas.nama_kelas || s.kelas.name,
              name: s.kelas.name || s.kelas.nama_kelas,
              ruangan: s.kelas.ruangan || s.metadata?.room,
              tingkat: s.kelas.tingkat,
              unit_pendidikan: s.kelas.unit_pendidikan,
            });
          }
        });
        if (uniqueClasses.length > 0) {
          setClasses(uniqueClasses);
        }
      } finally {
        setLoadingClasses(false);
      }
    };

    if (classes.length === 0) {
      void fetchClasses();
    }
  }, [dashboard]);

  // 2. Deteksi KBM yang Sedang Diajar Saat Sekarang
  const activeNow = getActiveScheduleNow();

  // Jadwal berikutnya jika tidak ada yang sedang aktif
  const upcomingSchedule = useMemo(() => {
    if (activeNow || schedulesToday.length === 0) return null;
    const now = new Date();
    const curTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    return schedulesToday.find((s) => {
      const start = s.time_start ? String(s.time_start).substring(0, 8) : '00:00:00';
      return start > curTime;
    }) || null;
  }, [activeNow, schedulesToday]);

  const selectedClass = getSelectedClass();
  const selectedClassLockStatus = isClassLocked(selectedClassId || '');

  // Handle pindah pilihan rombel
  const handleSelectClass = (cls: TeacherClass) => {
    setSelectedClassId(cls.id);
    if (onSelectClass) onSelectClass(cls);
  };

  // Navigasi kontekstual rombel dengan parameter kelas_id
  const handleRombelMenuPress = (routeKey: string, extraTab?: string) => {
    const isAll = !selectedClassId || selectedClassId === '__ALL__';
    const classId = isAll ? undefined : selectedClass?.id;
    const className = isAll ? undefined : (selectedClass?.nama_kelas || selectedClass?.name || 'Kelas');

    switch (routeKey) {
      case 'Absensi':
        navigation.navigate('QR Code', {
          kelas_id: classId,
          class_id: classId,
          class_name: className,
          schedule_id: selectedClassLockStatus.activeSchedule?.id,
          mode: 'manual',
        });
        break;
      case 'GuruMaterials':
        navigation.navigate('Guru', {
          tab: 'materials',
          kelas_id: classId,
          class_name: className,
        });
        break;
      case 'Tugas':
        navigation.navigate('Tugas', {
          kelas_id: classId,
          class_id: classId,
          class_name: className,
        });
        break;
      case 'Nilai':
        navigation.navigate('Nilai', {
          kelas_id: classId,
          class_id: classId,
          class_name: className,
        });
        break;
      case 'Tahfizh':
        navigation.navigate('Tahfizh', {
          kelas_id: classId,
          class_id: classId,
          class_name: className,
        });
        break;
      case 'Mutabaah':
        navigation.navigate('Mutabaah', {
          kelas_id: classId,
          class_id: classId,
          class_name: className,
        });
        break;
      case 'GuruNotes':
        navigation.navigate('Guru', {
          tab: 'notes',
          kelas_id: classId,
          class_name: className,
        });
        break;
      case 'Chat':
        navigation.navigate('Chat Guru', {
          kelas_id: classId,
          class_name: className,
        });
        break;
      default:
        navigation.navigate(routeKey);
    }
  };

  // Kirim pengajuan izin buka kelas
  const handleSubmitRequestUnlock = () => {
    if (!reason.trim()) {
      setFeedback({
        visible: true,
        type: 'warning',
        title: 'Alasan Belum Diisi ⚠️',
        message: 'Mohon isi alasan pengajuan buka akses kelas terlebih dahulu.',
      });
      return;
    }
    if (!selectedClassId || !selectedClass) return;

    requestUnlock(
      selectedClassId,
      selectedClass.nama_kelas || selectedClass.name || 'Kelas',
      requestType,
      reason.trim()
    );

    setUnlockModalVisible(false);
    setReason('');
    setFeedback({
      visible: true,
      type: 'success',
      title: 'Pengajuan Terkirim 📬',
      message: `Permohonan izin buka akses kelas "${selectedClass.nama_kelas || selectedClass.name || 'Kelas'}" telah dikirim ke Kepala Sekolah, Divisi Pendidikan, dan TU Unit.`,
    });
  };

  // Persetujuan buka kunci oleh pimpinan (Bypass)
  const handleApproveUnlock = () => {
    if (!selectedClassId || !selectedClass) return;
    const approverRole = isPrincipal
      ? 'Kepala Sekolah'
      : isDivisi
      ? 'Divisi Pendidikan'
      : isTu
      ? 'Tata Usaha (TU)'
      : 'Super Admin';

    approveUnlock(selectedClassId, `${approverRole} (${user?.name || 'Pimpinan'})`);
    setApprovalModalVisible(false);
    setFeedback({
      visible: true,
      type: 'success',
      title: 'Akses Kelas Dibuka! 🔓',
      message: `Kelas "${selectedClass.nama_kelas || selectedClass.name || 'Kelas'}" berhasil dibuka untuk sesi pembelajaran hari ini.`,
    });
  };

  return (
    <View style={styles.container}>
      {/* ────────────────────────────────────────────────────────── */}
      {/* 1. HERO BANNER: STATUS REAL-TIME KBM SAAT SEKARANG        */}
      {/* ────────────────────────────────────────────────────────── */}
      {activeNow ? (
        <View style={styles.liveActiveBanner}>
          <LinearGradient
            colors={['#065F46', '#047857', '#059669']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.liveBannerGradient}
          >
            <View style={styles.liveBadgeRow}>
              <View style={styles.livePulsePill}>
                <View style={styles.liveRedDot} />
                <Text style={styles.livePulseText}>SEDANG MENGAJAR SEKARANG</Text>
              </View>
              <View style={styles.timeTagPill}>
                <MaterialCommunityIcons name="clock-outline" size={13} color="#D1FAE5" />
                <Text style={styles.timeTagText}>
                  {String(activeNow.time_start).substring(0, 5)} - {String(activeNow.time_end).substring(0, 5)}
                </Text>
              </View>
            </View>

            <View style={styles.liveMainInfo}>
              <Text numberOfLines={1} style={styles.liveClassTitle}>
                {activeNow.kelas?.nama_kelas || activeNow.kelas?.name || 'Rombel Aktif'}
              </Text>
              <Text numberOfLines={1} style={styles.liveSubjectSubtitle}>
                📚 {activeNow.subject?.nama_mapel || activeNow.subject?.name || 'Mata Pelajaran'} · 📍 Ruang {activeNow.metadata?.room || activeNow.kelas?.ruangan || '-'}
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.livePresensiCtaBtn}
              onPress={() =>
                navigation.navigate('QR Code', {
                  schedule_id: activeNow.id,
                  kelas_id: activeNow.kelas_id,
                  class_name: activeNow.kelas?.nama_kelas,
                  mode: 'manual',
                })
              }
            >
              <MaterialCommunityIcons name="clipboard-check" size={16} color="#065F46" />
              <Text style={styles.livePresensiCtaText}>Mulai Presensi Siswa</Text>
              <MaterialCommunityIcons name="arrow-right" size={14} color="#065F46" />
            </TouchableOpacity>
          </LinearGradient>
        </View>
      ) : upcomingSchedule ? (
        <View style={styles.upcomingBanner}>
          <View style={styles.upcomingLeft}>
            <View style={styles.upcomingIconBox}>
              <MaterialCommunityIcons name="clock-fast" size={18} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.upcomingHeading}>Jadwal Mengajar Berikutnya</Text>
              <Text numberOfLines={1} style={styles.upcomingSub}>
                ⏰ {String(upcomingSchedule.time_start).substring(0, 5)} - {String(upcomingSchedule.time_end).substring(0, 5)} · {upcomingSchedule.kelas?.nama_kelas} ({upcomingSchedule.subject?.nama_mapel || upcomingSchedule.subject?.name})
              </Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.idleBanner}>
          <View style={styles.idleIconBox}>
            <MaterialCommunityIcons name="coffee-outline" size={17} color="#059669" />
          </View>
          <Text style={styles.idleText}>
            Tidak ada agenda KBM aktif saat ini. Pilih rombel di bawah untuk kelola data kelas.
          </Text>
        </View>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* 2. PEMILIHAN ROMBEL & KELAS (HORIZONTAL PILL CAROUSEL)    */}
      {/* ────────────────────────────────────────────────────────── */}
      <View style={styles.sectionHeaderStack}>
        <View style={styles.sectionTitleRow}>
          <View style={styles.sectionTitleWithIcon}>
            <MaterialCommunityIcons name="google-classroom" size={18} color="#059669" style={{ marginRight: 6 }} />
            <Text style={styles.sectionTitleBold}>Pilih Rombel & Kelas</Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => setShowAllClassesModal(true)}
            style={styles.seeAllBtn}
          >
            <Text style={styles.seeAllBtnText}>Lihat Semua</Text>
            <MaterialCommunityIcons name="chevron-right" size={14} color="#059669" />
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHeaderSubBadgesRow}>
          {selectedClass && (
            <View style={styles.selectedClassBadge}>
              <MaterialCommunityIcons name="door-open" size={13} color="#047857" style={{ marginRight: 4 }} />
              <Text numberOfLines={1} style={styles.selectedClassBadgeText}>
                Lokal: {selectedClass.nama_kelas || selectedClass.name}
              </Text>
            </View>
          )}
          {Boolean(onOpenAllMenus) && (
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={onOpenAllMenus}
              style={styles.allMenusBadge}
            >
              <MaterialCommunityIcons name="view-grid-plus" size={13} color="#059669" style={{ marginRight: 3 }} />
              <Text style={styles.allMenusBadgeText}>Semua Menu</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loadingClasses ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color="#059669" />
          <Text style={styles.loadingText}>Memuat rombel...</Text>
        </View>
      ) : classes.length === 0 ? (
        <View style={styles.emptyClassBox}>
          <Text style={styles.emptyClassText}>Belum ada rombel terdaftar untuk akun pendidik ini.</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.classScrollTrack}
        >
          {/* Pill "Semua Rombel" */}
          <TouchableOpacity
            key="__ALL__"
            activeOpacity={0.8}
            onPress={() =>
              handleSelectClass({
                id: '__ALL__',
                name: 'Semua Rombel',
                nama_kelas: 'Semua Rombel',
                rombel: 'Semua Rombel',
              } as any)
            }
            style={[
              styles.classPillCard,
              (!selectedClassId || selectedClassId === '__ALL__') && styles.classPillCardSelected,
            ]}
          >
            <View style={styles.pillTopStatusRow}>
              {(!selectedClassId || selectedClassId === '__ALL__') ? (
                <View style={styles.pillSelectedTag}>
                  <MaterialCommunityIcons name="check-circle" size={11} color="#059669" />
                  <Text style={styles.pillSelectedTagText}>Terpilih</Text>
                </View>
              ) : (
                <View style={styles.pillRegularTag}>
                  <MaterialCommunityIcons name="view-grid-outline" size={11} color="#0D9488" />
                  <Text style={styles.pillRegularTagText}>Semua Rombel</Text>
                </View>
              )}
            </View>

            <Text
              numberOfLines={1}
              style={[
                styles.classPillName,
                (!selectedClassId || selectedClassId === '__ALL__') && styles.classPillNameSelected,
              ]}
            >
              Semua Rombel
            </Text>

            <Text numberOfLines={1} style={styles.classPillMeta}>
              {classes.length} Rombel · Seluruh Jadwal
            </Text>
          </TouchableOpacity>

          {classes.map((cls) => {
            const isSelected = String(cls.id) === String(selectedClassId);
            const lockInfo = isClassLocked(cls.id);
            const isClassActiveNow = Boolean(
              activeNow && String(activeNow.kelas_id) === String(cls.id)
            );
            const hasSchedule = Boolean(
              lockInfo.hasScheduleToday ||
              (schedulesToday || []).some(
                (s: any) => String(s.kelas?.id || s.kelas_id) === String(cls.id)
              )
            );
            const classScheds = (schedulesToday || []).filter(
              (s: any) => String(s.kelas?.id || s.kelas_id) === String(cls.id)
            );
            const firstSched = classScheds.length > 0 ? classScheds[0] : null;

            return (
              <TouchableOpacity
                key={cls.id}
                activeOpacity={0.8}
                onPress={() => handleSelectClass(cls)}
                style={[
                  styles.classPillCard,
                  hasSchedule && styles.classPillCardBlue,
                  isSelected && (hasSchedule ? styles.classPillCardBlueSelected : styles.classPillCardSelected),
                  isClassActiveNow && (hasSchedule ? styles.classPillCardBlueLiveActive : styles.classPillCardLiveActive),
                ]}
              >
                {/* Status Indicator Chip */}
                <View style={styles.pillTopStatusRow}>
                  {isClassActiveNow ? (
                    <View style={[styles.pillActiveTag, hasSchedule && { backgroundColor: '#2563EB' }]}>
                      <View style={[styles.pulseDotMini, hasSchedule && { backgroundColor: '#FFFFFF' }]} />
                      <Text style={[styles.pillActiveTagText, hasSchedule && { color: '#FFFFFF' }]}>Sedang KBM</Text>
                    </View>
                  ) : hasSchedule ? (
                    <View style={isSelected ? styles.pillTagBlueSelected : styles.pillTagBlue}>
                      <MaterialCommunityIcons
                        name="calendar-check"
                        size={12}
                        color={isSelected ? '#1D4ED8' : '#2563EB'}
                        style={{ marginRight: 3 }}
                      />
                      <Text style={isSelected ? styles.pillTagBlueSelectedText : styles.pillTagBlueText}>
                        Jadwal Hari Ini
                      </Text>
                    </View>
                  ) : isSelected ? (
                    <View style={styles.pillSelectedTag}>
                      <MaterialCommunityIcons name="check-circle" size={11} color="#059669" />
                      <Text style={styles.pillSelectedTagText}>Terpilih</Text>
                    </View>
                  ) : (
                    <View style={styles.pillRegularTag}>
                      <MaterialCommunityIcons name="book-open-outline" size={11} color="#0D9488" />
                      <Text style={styles.pillRegularTagText}>Rombel Guru</Text>
                    </View>
                  )}
                </View>

                {/* Class Name */}
                <Text
                  numberOfLines={1}
                  style={[
                    styles.classPillName,
                    hasSchedule && styles.classPillNameBlue,
                    isSelected && (hasSchedule ? styles.classPillNameBlueSelected : styles.classPillNameSelected),
                  ]}
                >
                  {cls.nama_kelas || cls.name || 'Kelas'}
                </Text>

                {/* Class Meta */}
                <Text
                  numberOfLines={1}
                  style={[
                    styles.classPillMeta,
                    hasSchedule && styles.classPillMetaBlue,
                  ]}
                >
                  {firstSched?.time_start
                    ? `⏰ ${String(firstSched.time_start).substring(0, 5)} - ${String(firstSched.time_end).substring(0, 5)} · ${cls.ruangan || cls.kode_kelas || 'Ruang KBM'}`
                    : `${cls.ruangan || cls.kode_kelas || 'Ruang KBM'} · ${cls.unit_pendidikan?.level || 'Terpadu'}`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* 3. MENU OPERASIONAL ROMBEL TERPILIH                       */}
      {/* ────────────────────────────────────────────────────────── */}
      {selectedClass && (
        <View style={styles.rombelActionContainer}>
          {/* Header Rombel Terpilih */}
          <View style={styles.rombelHeaderRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.rombelHeaderTitleRow}>
                <Text numberOfLines={1} style={styles.rombelTargetTitle}>
                  {selectedClass.nama_kelas || selectedClass.name}
                </Text>
                {activeNow && String(activeNow.kelas_id) === String(selectedClass.id) ? (
                  <View style={styles.activeNowPillHeader}>
                    <MaterialCommunityIcons name="clock-check-outline" size={12} color="#059669" />
                    <Text style={styles.activeNowPillHeaderText}>KBM Sedang Aktif</Text>
                  </View>
                ) : (
                  <View style={styles.unlockedPillHeader}>
                    <MaterialCommunityIcons name="check-circle-outline" size={12} color="#059669" />
                    <Text style={styles.unlockedPillHeaderText}>Akses Terbuka</Text>
                  </View>
                )}
              </View>
              <Text numberOfLines={1} style={styles.rombelTargetSub}>
                {selectedClass.unit_pendidikan?.name || 'Unit Pendidikan'} · Ruang: {selectedClass.ruangan || '-'}
              </Text>
            </View>
          </View>

          {/* Grid 8 Menu Operasional Rombel */}
          <View style={styles.rombelGrid}>
            {[
              {
                label: 'Presensi Siswa',
                sub: 'Absensi KBM',
                icon: 'account-check',
                color: '#059669',
                bg: '#ECFDF5',
                route: 'Absensi',
              },
              {
                label: 'Bahan Ajar',
                sub: 'Modul & Materi',
                icon: 'book-multiple',
                color: '#0D9488',
                bg: '#E6FFFA',
                route: 'GuruMaterials',
              },
              {
                label: 'Tugas LMS',
                sub: 'PR & Ulangan',
                icon: 'clipboard-text',
                color: '#D97706',
                bg: '#FEF3C7',
                route: 'Tugas',
              },
              {
                label: 'Input Nilai',
                sub: 'Rapor & Kuis',
                icon: 'chart-box',
                color: '#10B981',
                bg: '#E8FAF2',
                route: 'Nilai',
              },
              {
                label: 'Tahfizh',
                sub: 'Setoran Quran',
                icon: 'book-marker',
                color: '#2563EB',
                bg: '#EFF6FF',
                route: 'Tahfizh',
              },
              {
                label: 'Mutaba\'ah',
                sub: 'Amalan Yaumiah',
                icon: 'clipboard-check',
                color: '#7C3AED',
                bg: '#F5F3FF',
                route: 'Mutabaah',
              },
              {
                label: 'Catatan Siswa',
                sub: 'Karakter & Buku',
                icon: 'book-open-page-variant',
                color: '#E11D48',
                bg: '#FFF1F2',
                route: 'GuruNotes',
              },
              {
                label: 'Chat Ortu',
                sub: 'Wali Santri',
                icon: 'chat-processing',
                color: '#0284C7',
                bg: '#F0F9FF',
                route: 'Chat',
              },
            ].map((menu, idx) => {
              return (
                <TouchableOpacity
                  key={idx}
                  activeOpacity={0.75}
                  onPress={() => handleRombelMenuPress(menu.route)}
                  style={[
                    styles.rombelGridTile,
                    { backgroundColor: menu.bg },
                  ]}
                >
                  <View style={styles.rombelTileIconCircle}>
                    <MaterialCommunityIcons
                      name={menu.icon as any}
                      size={24}
                      color={menu.color}
                    />
                  </View>
                  <Text
                    numberOfLines={1}
                    style={styles.rombelTileLabel}
                  >
                    {menu.label}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={styles.rombelTileSub}
                  >
                    {menu.sub}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* 4. MODAL PENGAJUAN IZIN BUKA KELAS (GURU)                 */}
      {/* ────────────────────────────────────────────────────────── */}
      <Modal
        visible={unlockModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setUnlockModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalHeaderIconBox}>
                <MaterialCommunityIcons name="shield-key-outline" size={22} color="#059669" />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.modalTitle}>Ajukan Buka Akses Kelas</Text>
                <Text style={styles.modalSub}>
                  {selectedClass?.nama_kelas || 'Rombel Terpilih'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setUnlockModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.formLabel}>Pilih Keperluan Masuk Kelas:</Text>
            <View style={styles.typeSelectorRow}>
              {[
                { key: 'inval', label: 'Guru Pengganti (Inval)' },
                { key: 'tambahan', label: 'Jam Tambahan / Remedial' },
                { key: 'bimbingan', label: 'Bimbingan Khusus' },
              ].map((t) => (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => setRequestType(t.key)}
                  style={[
                    styles.typeChip,
                    requestType === t.key && styles.typeChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.typeChipText,
                      requestType === t.key && styles.typeChipTextActive,
                    ]}
                  >
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.formLabel}>Alasan Masuk Kelas:</Text>
            <TextInput
              style={styles.textInputArea}
              placeholder="Contoh: Menggantikan Ustadz Fulan yang sedang dinas luar..."
              placeholderTextColor="#94A3B8"
              multiline
              numberOfLines={3}
              value={reason}
              onChangeText={setReason}
            />

            <View style={styles.approvalNoteBox}>
              <MaterialCommunityIcons name="information-outline" size={16} color="#0284C7" />
              <Text style={styles.approvalNoteText}>
                Izin akan diverifikasi oleh Kepala Sekolah, Divisi Pendidikan, atau TU Unit sebelum gembok pembelajaran terbuka.
              </Text>
            </View>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setUnlockModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={handleSubmitRequestUnlock}
              >
                <Text style={styles.modalSubmitText}>Kirim Pengajuan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ────────────────────────────────────────────────────────── */}
      {/* 5. MODAL OTORISASI MANDIRI PIMPINAN (KEPSEK / TU / DIVISI) */}
      {/* ────────────────────────────────────────────────────────── */}
      <Modal
        visible={approvalModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setApprovalModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <View style={[styles.modalHeaderIconBox, { backgroundColor: '#FEF3C7' }]}>
                <MaterialCommunityIcons name="shield-check" size={22} color="#D97706" />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.modalTitle}>Otorisasi Buka Kelas</Text>
                <Text style={styles.modalSub}>
                  Akses Khusus Pimpinan (Kepsek / Divisi / TU)
                </Text>
              </View>
              <TouchableOpacity onPress={() => setApprovalModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.bypassDescBox}>
              <Text style={styles.bypassDescTitle}>
                Buka Gembok Rombel: {selectedClass?.nama_kelas}
              </Text>
              <Text style={styles.bypassDescBody}>
                Akun Anda memiliki kewenangan pimpinan untuk membuka gembok pembelajaran rombel ini secara langsung untuk sesi hari ini tanpa perlu menunggu approval eksternal.
              </Text>
            </View>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setApprovalModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Tutup</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, { backgroundColor: '#059669' }]}
                onPress={handleApproveUnlock}
              >
                <MaterialCommunityIcons name="lock-open-variant" size={15} color="#FFFFFF" style={{ marginRight: 4 }} />
                <Text style={styles.modalSubmitText}>Setujui Buka Akses</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ────────────────────────────────────────────────────────── */}
      {/* MODAL: DAFTAR SEMUA ROMBEL & KELAS                         */}
      {/* ────────────────────────────────────────────────────────── */}
      <Modal
        visible={showAllClassesModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAllClassesModal(false)}
      >
        <View style={styles.modalSheetBackdrop}>
          <TouchableOpacity
            style={styles.modalSheetBackdropDismiss}
            activeOpacity={1}
            onPress={() => setShowAllClassesModal(false)}
          />
          <View style={styles.modalSheetContent}>
            {/* Handle Drag Bar */}
            <View style={styles.modalDragHandle} />

            {/* Modal Header */}
            <View style={styles.modalSheetHeaderRow}>
              <View style={styles.modalSheetHeaderTitleLeft}>
                <View style={styles.modalIconSquircle}>
                  <MaterialCommunityIcons name="google-classroom" size={20} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalSheetTitle}>Daftar Semua Rombel & Kelas</Text>
                  <Text style={styles.modalSheetSub}>
                    Total {classes.length} Rombel · Pilih rombel untuk beralih kelas
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setShowAllClassesModal(false)}
                style={styles.modalSheetCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Class Items Scroll List */}
            <ScrollView
              showsVerticalScrollIndicator={true}
              style={styles.modalClassListScroll}
              contentContainerStyle={{ paddingBottom: 24, gap: 10 }}
            >
              {/* Opsi Spesial: Lihat Semua Rombel */}
              <TouchableOpacity
                key="__ALL__"
                activeOpacity={0.75}
                onPress={() => {
                  handleSelectClass({
                    id: '__ALL__',
                    name: 'Semua Rombel',
                    nama_kelas: 'Semua Rombel',
                    rombel: 'Semua Rombel',
                  } as any);
                  setShowAllClassesModal(false);
                }}
                style={[
                  styles.modalClassCard,
                  (!selectedClassId || selectedClassId === '__ALL__') && styles.modalClassCardSelected,
                ]}
              >
                <View style={styles.modalClassCardLeft}>
                  <View
                    style={[
                      styles.modalClassIconBox,
                      (!selectedClassId || selectedClassId === '__ALL__')
                        ? { backgroundColor: '#DEF7EC' }
                        : { backgroundColor: '#F1F5F9' },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="view-grid-outline"
                      size={22}
                      color={(!selectedClassId || selectedClassId === '__ALL__') ? '#059669' : '#64748B'}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.modalClassName,
                          (!selectedClassId || selectedClassId === '__ALL__') && { color: '#047857' },
                        ]}
                      >
                        Lihat Semua Rombel
                      </Text>
                      <View style={styles.pillRegularTag}>
                        <Text style={styles.pillRegularTagText}>Semua Jadwal</Text>
                      </View>
                    </View>
                    <Text numberOfLines={1} style={styles.modalClassMeta}>
                      Tampilkan seluruh jadwal dari {classes.length} kelas binaan & mengajar
                    </Text>
                  </View>
                </View>

                {(!selectedClassId || selectedClassId === '__ALL__') ? (
                  <View style={styles.modalCheckCircle}>
                    <MaterialCommunityIcons name="check" size={15} color="#FFFFFF" />
                  </View>
                ) : (
                  <MaterialCommunityIcons name="chevron-right" size={20} color="#CBD5E1" />
                )}
              </TouchableOpacity>

              {classes.map((cls) => {
                const isSelected = String(cls.id) === String(selectedClassId);
                const isClassActiveNow = Boolean(
                  activeNow && String(activeNow.kelas_id) === String(cls.id)
                );
                const clsScheds = (schedulesToday || []).filter((s: any) => {
                  const schedCid = String(s.kelas?.id || s.kelas_id || '');
                  return schedCid === String(cls.id);
                });
                const hasSchedule = clsScheds.length > 0;
                const firstSched = hasSchedule ? clsScheds[0] : null;

                return (
                  <TouchableOpacity
                    key={cls.id}
                    activeOpacity={0.75}
                    onPress={() => {
                      handleSelectClass(cls);
                      setShowAllClassesModal(false);
                    }}
                    style={[
                      styles.modalClassCard,
                      hasSchedule && styles.modalClassCardYellow,
                      isSelected && (hasSchedule ? styles.modalClassCardYellowSelected : styles.modalClassCardSelected),
                    ]}
                  >
                    <View style={styles.modalClassCardLeft}>
                      <View
                        style={[
                          styles.modalClassIconBox,
                          hasSchedule
                            ? { backgroundColor: '#FEF08A' }
                            : isSelected
                            ? { backgroundColor: '#DEF7EC' }
                            : { backgroundColor: '#F1F5F9' },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name="google-classroom"
                          size={22}
                          color={hasSchedule ? '#B45309' : isSelected ? '#059669' : '#64748B'}
                        />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.modalClassName,
                              hasSchedule && { color: '#713F12' },
                              isSelected && !hasSchedule && { color: '#047857' },
                            ]}
                          >
                            {cls.nama_kelas || cls.name || 'Kelas'}
                          </Text>
                          {isClassActiveNow ? (
                            <View style={styles.pillActiveTag}>
                              <View style={styles.pulseDotMini} />
                              <Text style={styles.pillActiveTagText}>KBM Aktif</Text>
                            </View>
                          ) : hasSchedule ? (
                            <View style={styles.pillTagYellow}>
                              <MaterialCommunityIcons name="calendar-check" size={11} color="#B45309" style={{ marginRight: 2 }} />
                              <Text style={styles.pillTagYellowText}>Ada Jadwal</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.modalClassMeta,
                            hasSchedule && { color: '#92400E' },
                          ]}
                        >
                          {firstSched?.time_start
                            ? `⏰ ${String(firstSched.time_start).substring(0, 5)} - ${String(firstSched.time_end).substring(0, 5)} · ${cls.ruangan || cls.kode_kelas || 'Ruang KBM'}`
                            : `${cls.ruangan || cls.kode_kelas || 'Ruang KBM'} · ${cls.unit_pendidikan?.level || 'Terpadu'}`}
                        </Text>
                      </View>
                    </View>

                    {isSelected ? (
                      <View style={styles.modalCheckCircle}>
                        <MaterialCommunityIcons name="check" size={15} color="#FFFFFF" />
                      </View>
                    ) : (
                      <MaterialCommunityIcons name="chevron-right" size={20} color="#CBD5E1" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 5. Feedback Modal Toast */}
      {feedback && (
        <AppFeedbackModal
          visible={feedback.visible}
          type={feedback.type}
          title={feedback.title}
          message={feedback.message}
          onClose={() => setFeedback(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 12,
  },
  liveActiveBanner: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 14,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  liveBannerGradient: {
    padding: 16,
  },
  liveBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  livePulsePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#064E3B',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#34D399',
  },
  liveRedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    marginRight: 6,
  },
  livePulseText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#ECFDF5',
    letterSpacing: 0.5,
  },
  timeTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 10,
  },
  timeTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  liveMainInfo: {
    marginBottom: 12,
  },
  liveClassTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  liveSubjectSubtitle: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#D1FAE5',
    marginTop: 2,
  },
  livePresensiCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingVertical: 9,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  livePresensiCtaText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#065F46',
  },
  upcomingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  upcomingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 9,
  },
  upcomingIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  upcomingHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400E',
  },
  upcomingSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#B45309',
    marginTop: 1,
  },
  idleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    gap: 9,
  },
  idleIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  idleText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#047857',
    flex: 1,
    lineHeight: 16,
  },
  sectionHeaderStack: {
    marginBottom: 12,
    gap: 8,
    paddingHorizontal: 2,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitleBold: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  sectionHeaderSubBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  selectedClassBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  selectedClassBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  allMenusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  allMenusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  emptyClassBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  emptyClassText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  classScrollTrack: {
    gap: 10,
    paddingBottom: 6,
  },
  classPillCard: {
    width: 204,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    minHeight: 128,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    justifyContent: 'space-between',
  },
  classPillCardSelected: {
    borderColor: '#059669',
    backgroundColor: '#F0FDF4',
    borderWidth: 2,
  },
  classPillCardLiveActive: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
    borderWidth: 2,
  },
  classPillCardBlue: {
    borderColor: '#60A5FA',
    backgroundColor: '#F0F9FF',
    borderWidth: 1.5,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  classPillCardBlueSelected: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
    borderWidth: 2,
  },
  classPillCardBlueLiveActive: {
    borderColor: '#1D4ED8',
    backgroundColor: '#EFF6FF',
    borderWidth: 2,
  },
  pillTopStatusRow: {
    marginBottom: 8,
  },
  pillActiveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8.5,
    paddingVertical: 4.5,
    borderRadius: 9,
    alignSelf: 'flex-start',
    gap: 5,
  },
  pulseDotMini: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#059669',
  },
  pillActiveTagText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#047857',
  },
  pillTagBlue: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 8.5,
    paddingVertical: 4.5,
    borderRadius: 9,
    alignSelf: 'flex-start',
    gap: 5,
  },
  pillTagBlueText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  pillTagYellow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF08A',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: '#FACC15',
    alignSelf: 'flex-start',
    gap: 4,
  },
  pillTagYellowText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#854D0E',
  },
  pillTagBlueSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#BFDBFE',
    paddingHorizontal: 8.5,
    paddingVertical: 4.5,
    borderRadius: 9,
    alignSelf: 'flex-start',
    gap: 5,
  },
  pillTagBlueSelectedText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#1E40AF',
  },
  pillApprovedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8.5,
    paddingVertical: 4.5,
    borderRadius: 9,
    alignSelf: 'flex-start',
    gap: 5,
  },
  pillApprovedTagText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0284C7',
  },
  pillLockedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8.5,
    paddingVertical: 4.5,
    borderRadius: 9,
    alignSelf: 'flex-start',
    gap: 5,
  },
  pillLockedTagText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
  },
  pillSelectedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 8.5,
    paddingVertical: 4.5,
    borderRadius: 9,
    alignSelf: 'flex-start',
    gap: 5,
  },
  pillSelectedTagText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#059669',
  },
  pillRegularTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6F4EA',
    paddingHorizontal: 8.5,
    paddingVertical: 4.5,
    borderRadius: 9,
    alignSelf: 'flex-start',
    gap: 5,
  },
  pillRegularTagText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#059669',
  },
  classPillName: {
    fontSize: 16.5,
    fontWeight: '800',
    color: '#1E293B',
  },
  classPillNameSelected: {
    color: '#047857',
  },
  classPillNameBlue: {
    color: '#1E3A8A',
  },
  classPillNameBlueSelected: {
    color: '#1D4ED8',
  },
  classPillMeta: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 4,
  },
  classPillMetaBlue: {
    color: '#2563EB',
    fontWeight: '600',
  },
  rombelActionContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  rombelHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 10,
  },
  rombelHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rombelTargetTitle: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  lockedPillHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  lockedPillHeaderText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B91C1C',
  },
  activeNowPillHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  activeNowPillHeaderText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065F46',
  },
  unlockedPillHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  unlockedPillHeaderText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
  },
  rombelTargetSub: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  requestUnlockHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  requestUnlockHeaderText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#92400E',
  },
  lockedWarningBox: {
    flexDirection: 'row',
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  lockedWarningTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400E',
  },
  lockedWarningDesc: {
    fontSize: 11,
    color: '#78350F',
    lineHeight: 15,
    marginTop: 2,
  },
  pendingRequestTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  pendingRequestTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0369A1',
  },
  rombelGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  rombelGridTile: {
    width: '23%',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rombelGridTileLocked: {
    backgroundColor: '#F8FAFC',
    opacity: 0.65,
  },
  rombelTileIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  lockMiniOverlay: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  rombelTileLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#1E293B',
    textAlign: 'center',
    lineHeight: 13,
  },
  rombelTileSub: {
    fontSize: 8.5,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
    marginTop: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalHeaderIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#DEF7EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  modalSub: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    marginTop: 6,
  },
  typeSelectorRow: {
    gap: 6,
    marginBottom: 10,
  },
  typeChip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  typeChipActive: {
    backgroundColor: '#DEF7EC',
    borderColor: '#059669',
  },
  typeChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  typeChipTextActive: {
    color: '#047857',
  },
  textInputArea: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 10,
    fontSize: 12,
    color: '#1E293B',
    textAlignVertical: 'top',
    minHeight: 70,
    marginBottom: 10,
  },
  approvalNoteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0F9FF',
    padding: 10,
    borderRadius: 10,
    marginBottom: 14,
  },
  approvalNoteText: {
    fontSize: 10.5,
    color: '#0369A1',
    fontWeight: '600',
    flex: 1,
    lineHeight: 14,
  },
  bypassDescBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  bypassDescTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#92400E',
    marginBottom: 4,
  },
  bypassDescBody: {
    fontSize: 11.5,
    color: '#78350F',
    lineHeight: 16,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  modalCancelText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  modalSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: '#059669',
  },
  modalSubmitText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Modal Daftar Semua Rombel & Kelas
  modalSheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalSheetBackdropDismiss: {
    flex: 1,
  },
  modalSheetContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
    maxHeight: '82%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 20,
  },
  modalDragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 14,
  },
  modalSheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 14,
  },
  modalSheetHeaderTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  modalIconSquircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#DEF7EC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalSheetTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSheetSub: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 1,
  },
  modalSheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  modalClassListScroll: {
    maxHeight: 460,
  },
  modalClassCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 70,
  },
  modalClassCardSelected: {
    backgroundColor: '#F0FDF4',
    borderColor: '#10B981',
  },
  modalClassCardYellow: {
    backgroundColor: '#FEFCE8',
    borderColor: '#FACC15',
    borderWidth: 1.5,
  },
  modalClassCardYellowSelected: {
    backgroundColor: '#FEF9C3',
    borderColor: '#D97706',
    borderWidth: 2,
  },
  modalClassCardBlue: {
    backgroundColor: '#FEFCE8',
    borderColor: '#FACC15',
    borderWidth: 1.5,
  },
  modalClassCardBlueSelected: {
    backgroundColor: '#FEF9C3',
    borderColor: '#D97706',
    borderWidth: 2,
  },
  modalClassCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    flex: 1,
  },
  modalClassIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalClassName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalClassMeta: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 3,
  },
  modalCheckCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

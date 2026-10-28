import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { getApiErrorMessage } from '../services/api';
import { mobileApiService } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { offlineCache } from '../utils/offlineCache';
import AppFeedbackModal, { FeedbackType } from '../components/AppFeedbackModal';
import EmptyStateCard from '../components/EmptyStateCard';

type RecordItem = {
  id: string;
  judul?: string;
  title?: string;
  deskripsi?: string;
  description?: string;
  deadline?: string;
  start_time?: string;
  end_time?: string;
  room?: string;
  ruang?: string;
  teacher?: { name?: string; nama?: string };
  subject?: { name?: string; nama?: string; nama_mapel?: string };
  pengumpulan_tugas?: Array<{ status?: string; nilai?: number; catatan_guru?: string }>;
};

const unwrap = <T,>(response: any): T => response?.data?.data ?? response?.data ?? response;

export default function StudentPortalScreen() {
  const user = useAuthStore((state) => state.user);
  const [profile, setProfile] = useState<any>();
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [tab, setTab] = useState<'schedules' | 'materials' | 'assignments'>('schedules');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [answer, setAnswer] = useState('');
  const [assignmentId, setAssignmentId] = useState<string>();
  const [selectedTaskTitle, setSelectedTaskTitle] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
  } | null>(null);

  const load = useCallback(async () => {
    setError('');
    const cacheKey = offlineCache.buildKey('student_portal', user?.id, tab);

    // Baca cache dulu
    const cached = await offlineCache.get<{ profile: any; records: RecordItem[] }>(cacheKey);
    if (cached) {
      if (cached.profile) setProfile(cached.profile);
      if (cached.records) setRecords(cached.records);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const [dashboardResponse, listResponse] = await Promise.all([
        mobileApiService.getPortalDashboard(),
        mobileApiService.getPortalResource(tab),
      ]);
      const freshProf = unwrap<any>(dashboardResponse)?.student;
      const freshRecs = unwrap<RecordItem[]>(listResponse) || [];
      if (freshProf) setProfile(freshProf);
      setRecords(freshRecs);
      void offlineCache.set(cacheKey, { profile: freshProf, records: freshRecs });
    } catch (err: any) {
      if (!cached) {
        setError(getApiErrorMessage(err, 'Data portal siswa belum berhasil dimuat.'));
      }
    } finally {
      setLoading(false);
    }
  }, [tab, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    if (!assignmentId || !answer.trim()) return;
    setSubmitting(true);
    try {
      await mobileApiService.submitPortalAssignment(assignmentId, answer.trim());
      setAnswer('');
      setAssignmentId(undefined);
      setSelectedTaskTitle('');
      setFeedbackModal({
        visible: true,
        type: 'success',
        title: 'Tugas Terkirim! 🌟',
        message: 'Jawaban tugas Anda telah berhasil dikirimkan ke dewan guru.',
      });
      await load();
    } catch (err: any) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Mengirim Tugas',
        message: getApiErrorMessage(err, 'Tugas belum berhasil dikumpulkan. Silakan coba kembali.'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const studentName = profile?.full_name || profile?.nama_lengkap || user?.name || 'Peserta Didik';
  const studentClass = profile?.kelas?.nama_kelas || profile?.kelas?.name || 'Kelas Belum Ditentukan';
  const studentNis = profile?.nis || (user as any)?.student?.nis || '-';
  const studentUnit = profile?.education_unit?.name || (user as any)?.student?.education_unit?.name || 'Sekolah Terpadu';

  // Status Kehadiran Dinamis Siswa (Hadir [Hijau], Libur Sekolah [Kuning], Tidak Hadir [Merah])
  const attendanceStatus = React.useMemo(() => {
    const day = new Date().getDay();
    const isWeekend = day === 0 || day === 6;

    if (isWeekend || profile?.is_holiday) {
      return {
        label: 'Libur Sekolah',
        color: '#D97706',
        bg: '#FFFBEB',
        border: '#FDE68A',
        icon: 'weather-sunny' as const,
      };
    }

    const rawStatus = String(
      profile?.attendance_today?.status_label ||
      profile?.attendance_today?.label ||
      profile?.presensi_hari_ini?.status ||
      profile?.attendance_status ||
      profile?.status_kehadiran ||
      profile?.presensi_status ||
      ''
    ).toLowerCase().trim();

    if (rawStatus.includes('hadir') || rawStatus.includes('masuk')) {
      return {
        label: 'Hadir',
        color: '#047857',
        bg: '#ECFDF5',
        border: '#A7F3D0',
        icon: 'check-circle' as const,
      };
    }

    if (rawStatus.includes('izin') || rawStatus.includes('sakit')) {
      return {
        label: rawStatus.includes('sakit') ? 'Sakit' : 'Izin',
        color: '#E11D48',
        bg: '#FFF1F2',
        border: '#FECDD3',
        icon: 'alert-circle' as const,
      };
    }

    if (rawStatus.includes('alpa') || rawStatus.includes('tidak hadir') || rawStatus.includes('alpha')) {
      return {
        label: 'Tidak Hadir',
        color: '#E11D48',
        bg: '#FFF1F2',
        border: '#FECDD3',
        icon: 'close-circle' as const,
      };
    }

    return {
      label: 'Hadir',
      color: '#047857',
      bg: '#ECFDF5',
      border: '#A7F3D0',
      icon: 'check-circle' as const,
    };
  }, [profile]);

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#059669" />}
      >
        {/* CARD IDENTITAS SISWA TERPADU */}
        <View style={styles.identityCard}>
          <LinearGradient
            colors={['#047857', '#059669', '#10B981']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.identityGradient}
          >
            <View style={styles.decorCircle1} />
            <View style={styles.decorCircle2} />

            <View style={styles.identityTopRow}>
              <View style={styles.avatarSquircle}>
                <MaterialCommunityIcons name="account-school" size={26} color="#047857" />
              </View>
              <View style={styles.identityTextCol}>
                <View style={styles.tagBadge}>
                  <MaterialCommunityIcons name="shield-check" size={12} color="#A7F3D0" style={{ marginRight: 4 }} />
                  <Text style={styles.tagBadgeText}>PORTAL SISWA TERPADU</Text>
                </View>
                <Text style={styles.studentName} numberOfLines={1}>
                  {studentName}
                </Text>

                {/* Baris 2: Unit Pendidikan */}
                <View style={styles.studentMetaRow}>
                  <MaterialCommunityIcons name="school-outline" size={12} color="#D1FAE5" style={{ marginRight: 4 }} />
                  <Text numberOfLines={1} style={styles.studentUnitText}>
                    {studentUnit}
                  </Text>
                </View>

                {/* Baris 3: Kelas tepat di bawah unit pendidikan */}
                <View style={styles.studentMetaRow}>
                  <MaterialCommunityIcons name="door-open" size={12} color="#A7F3D0" style={{ marginRight: 4 }} />
                  <Text numberOfLines={1} style={styles.studentClassText}>
                    {studentClass}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.identityFooterRow}>
              <View style={styles.nisPill}>
                <MaterialCommunityIcons name="card-account-details-outline" size={13} color="#D1FAE5" style={{ marginRight: 5 }} />
                <Text style={styles.nisPillText}>NIS: {studentNis}</Text>
              </View>

              <View
                style={[
                  styles.attendanceBadge,
                  { backgroundColor: attendanceStatus.bg, borderColor: attendanceStatus.border },
                ]}
              >
                <MaterialCommunityIcons
                  name={attendanceStatus.icon}
                  size={12}
                  color={attendanceStatus.color}
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.attendanceBadgeText, { color: attendanceStatus.color }]}>
                  {attendanceStatus.label}
                </Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* 3-PILL TAB SWITCHER MODERN */}
        <View style={styles.tabContainer}>
          {([
            { id: 'schedules', label: 'Jadwal Pelajaran', icon: 'calendar-clock' },
            { id: 'materials', label: 'Materi Belajar', icon: 'book-open-page-variant' },
            { id: 'assignments', label: 'Tugas LMS', icon: 'clipboard-text-outline' },
          ] as const).map((item) => {
            const isActive = tab === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.8}
                onPress={() => setTab(item.id)}
                style={[styles.tabButton, isActive && styles.tabButtonActive]}
              >
                <MaterialCommunityIcons
                  name={item.icon as any}
                  size={15}
                  color={isActive ? '#FFFFFF' : '#64748B'}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.tabButtonText, isActive && styles.tabButtonTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ERROR NOTICE */}
        {error ? (
          <View style={styles.errorBox}>
            <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#DC2626" style={{ marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={load} style={{ marginTop: 6 }}>
                <Text style={styles.retryText}>Muat Ulang Data</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* CONTENT LIST */}
        {loading && !records.length ? (
          <View style={styles.loaderBox}>
            <ActivityIndicator color="#059669" size="large" />
            <Text style={styles.loaderText}>Menyelaraskan data portal...</Text>
          </View>
        ) : (
          <View style={styles.contentList}>
            {records.map((item, idx) => {
              const subjectName = item.subject?.name || item.subject?.nama || item.subject?.nama_mapel || (
                tab === 'schedules' ? 'Jadwal Pelajaran' : tab === 'materials' ? 'Bahan Ajar' : 'Tugas Pelajaran'
              );
              const cardTitle = item.judul || item.title || subjectName;

              return (
                <View key={item.id || idx} style={styles.itemCard}>
                  {/* Top Bar Card */}
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.subjectBadge}>
                      <MaterialCommunityIcons
                        name={tab === 'schedules' ? 'calendar-clock' : tab === 'materials' ? 'book-outline' : 'clipboard-text-outline'}
                        size={12}
                        color="#059669"
                        style={{ marginRight: 4 }}
                      />
                      <Text style={styles.subjectBadgeText} numberOfLines={1}>
                        {subjectName}
                      </Text>
                    </View>

                    {tab === 'assignments' && (
                      <View style={[
                        styles.statusPill,
                        item.pengumpulan_tugas?.[0]?.status === 'selesai' || item.pengumpulan_tugas?.[0]?.status === 'dikumpulkan'
                          ? styles.statusPillDone
                          : styles.statusPillPending,
                      ]}>
                        <MaterialCommunityIcons
                          name={item.pengumpulan_tugas?.[0]?.status === 'selesai' || item.pengumpulan_tugas?.[0]?.status === 'dikumpulkan' ? 'check-circle' : 'clock-alert-outline'}
                          size={11}
                          color={item.pengumpulan_tugas?.[0]?.status === 'selesai' || item.pengumpulan_tugas?.[0]?.status === 'dikumpulkan' ? '#059669' : '#D97706'}
                          style={{ marginRight: 3 }}
                        />
                        <Text style={[
                          styles.statusPillText,
                          item.pengumpulan_tugas?.[0]?.status === 'selesai' || item.pengumpulan_tugas?.[0]?.status === 'dikumpulkan'
                            ? styles.statusPillDoneText
                            : styles.statusPillPendingText,
                        ]}>
                          {item.pengumpulan_tugas?.[0]?.status === 'selesai' || item.pengumpulan_tugas?.[0]?.status === 'dikumpulkan'
                            ? 'Sudah Dikumpulkan'
                            : 'Belum Dikumpulkan'}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Title & Deskripsi */}
                  <Text style={styles.cardTitleText} numberOfLines={2}>
                    {cardTitle}
                  </Text>
                  {(item.deskripsi || item.description) && (
                    <Text style={styles.cardDescText} numberOfLines={2}>
                      {item.deskripsi || item.description}
                    </Text>
                  )}

                  {/* Meta Chips */}
                  <View style={styles.cardMetaRow}>
                    {tab === 'schedules' && (
                      <>
                        <View style={styles.metaChip}>
                          <MaterialCommunityIcons name="clock-outline" size={13} color="#2563EB" style={{ marginRight: 4 }} />
                          <Text style={styles.metaChipText}>
                            {item.start_time || '-'} – {item.end_time || '-'}
                          </Text>
                        </View>
                        {(item.room || item.ruang) && (
                          <View style={styles.metaChip}>
                            <MaterialCommunityIcons name="door-open" size={13} color="#7C3AED" style={{ marginRight: 4 }} />
                            <Text style={styles.metaChipText}>{item.room || item.ruang}</Text>
                          </View>
                        )}
                        {item.teacher && (
                          <View style={styles.metaChip}>
                            <MaterialCommunityIcons name="account-tie-outline" size={13} color="#059669" style={{ marginRight: 4 }} />
                            <Text style={styles.metaChipText}>{item.teacher.nama || item.teacher.name || 'Guru Pengajar'}</Text>
                          </View>
                        )}
                      </>
                    )}

                    {tab === 'assignments' && (
                      <View style={styles.metaChip}>
                        <MaterialCommunityIcons name="calendar-alert" size={13} color="#EF4444" style={{ marginRight: 4 }} />
                        <Text style={styles.metaChipText}>
                          Batas Waktu: {item.deadline || 'Sesuai Jadwal KBM'}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Action Button for Assignments */}
                  {tab === 'assignments' && (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => {
                        setAssignmentId(item.id);
                        setSelectedTaskTitle(cardTitle);
                        setAnswer('');
                      }}
                      style={styles.submitTaskBtn}
                    >
                      <MaterialCommunityIcons name="pencil-box-outline" size={16} color="#059669" style={{ marginRight: 6 }} />
                      <Text style={styles.submitTaskBtnText}>
                        {item.pengumpulan_tugas?.[0]?.status === 'selesai' || item.pengumpulan_tugas?.[0]?.status === 'dikumpulkan'
                          ? 'Perbarui Jawaban Tugas'
                          : 'Kumpulkan Jawaban'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}

            {!records.length && (
              <EmptyStateCard
                icon={tab === 'schedules' ? 'calendar-clock' : tab === 'materials' ? 'book-open-outline' : 'clipboard-text-outline'}
                title={tab === 'schedules' ? 'Belum Ada Jadwal KBM' : tab === 'materials' ? 'Belum Ada Bahan Ajar' : 'Belum Ada Tugas Aktif'}
                description={`Tidak ada data ${tab === 'schedules' ? 'jadwal pelajaran' : tab === 'materials' ? 'bahan atau modul ajar' : 'tugas'} untuk kelas Anda saat ini.`}
              />
            )}
          </View>
        )}
      </ScrollView>

      {/* MODAL PENGUMPULAN TUGAS */}
      <Modal
        visible={Boolean(assignmentId)}
        transparent
        animationType="slide"
        onRequestClose={() => setAssignmentId(undefined)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderIconWrap}>
                <MaterialCommunityIcons name="clipboard-check" size={20} color="#059669" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Kirim Jawaban Tugas</Text>
                <Text style={styles.modalSub} numberOfLines={1}>{selectedTaskTitle || 'Tugas Siswa'}</Text>
              </View>
              <TouchableOpacity onPress={() => setAssignmentId(undefined)} style={styles.modalCloseBtn}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Tuliskan Jawaban atau Catatan Tugas:</Text>
            <TextInput
              value={answer}
              onChangeText={setAnswer}
              multiline
              placeholder="Ketikkan teks jawaban, penjelasan, atau tautan Google Drive / dokumen..."
              placeholderTextColor="#94A3B8"
              style={styles.textArea}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setAssignmentId(undefined)}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelBtnText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={submit}
                disabled={submitting || !answer.trim()}
                style={[styles.confirmBtn, (!answer.trim() || submitting) && styles.confirmBtnDisabled]}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="send" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.confirmBtnText}>Kirimkan Tugas</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {feedbackModal && (
        <AppFeedbackModal
          visible={feedbackModal.visible}
          type={feedbackModal.type}
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
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 110,
  },
  identityCard: {
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 14,
  },
  identityGradient: {
    padding: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  decorCircle1: {
    position: 'absolute',
    top: -24,
    right: -24,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  decorCircle2: {
    position: 'absolute',
    bottom: -20,
    left: 40,
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  identityTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarSquircle: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  identityTextCol: {
    flex: 1,
  },
  tagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  tagBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#D1FAE5',
    letterSpacing: 0.4,
  },
  studentName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  studentClass: {
    fontSize: 11.5,
    color: '#E6FFFA',
    marginTop: 1,
    fontWeight: '500',
  },
  studentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  studentUnitText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#E6FFFA',
    flexShrink: 1,
  },
  studentClassText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#A7F3D0',
    flexShrink: 1,
  },
  attendanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  attendanceBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  identityFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.18)',
  },
  nisPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  nisPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 5,
  },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#34D399',
  },
  activePillText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 12,
  },
  tabButtonActive: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  tabButtonText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
  },
  tabButtonTextActive: {
    color: '#FFFFFF',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 12,
    color: '#B91C1C',
    lineHeight: 17,
  },
  retryText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#059669',
  },
  loaderBox: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 10,
  },
  contentList: {
    gap: 12,
  },
  itemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 15,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 1.5,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  subjectBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  subjectBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#047857',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusPillDone: {
    backgroundColor: '#ECFDF5',
  },
  statusPillDoneText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#047857',
  },
  statusPillPending: {
    backgroundColor: '#FFFBEB',
  },
  statusPillPendingText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
  },
  cardTitleText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 20,
  },
  cardDescText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 17,
  },
  cardMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
  },
  metaChipText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  submitTaskBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    paddingVertical: 9,
  },
  submitTaskBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#047857',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  modalHeaderIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSub: {
    fontSize: 11.5,
    color: '#64748B',
  },
  modalCloseBtn: {
    padding: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
  },
  textArea: {
    minHeight: 120,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    padding: 12,
    fontSize: 13,
    color: '#0F172A',
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  confirmBtn: {
    flex: 2,
    flexDirection: 'row',
    backgroundColor: '#059669',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 2,
  },
  confirmBtnDisabled: {
    opacity: 0.6,
  },
  confirmBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

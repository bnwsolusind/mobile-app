import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import { useActiveChildStore } from '../stores/activeChildStore';
import { useNotificationBadgeStore } from '../stores/notificationBadgeStore';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface StudentNotificationModalProps {
  visible: boolean;
  student: any;
  onClose: () => void;
  navigation?: any;
}

export const StudentNotificationModal: React.FC<StudentNotificationModalProps> = ({
  visible,
  student,
  onClose,
  navigation,
}) => {
  const [loading, setLoading] = useState(false);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [cbtExams, setCbtExams] = useState<any[]>([]);
  const [filterMode, setFilterMode] = useState<'all' | 'tugas' | 'cbt'>('all');

  const sId = student?.id || student?.student_id;
  const sName = student?.full_name || student?.nama_lengkap || student?.name || 'Ananda';

  const loadData = useCallback(async () => {
    if (!visible || !student) return;
    setLoading(true);

    // Reset badge khusus siswa ini
    if (sId) {
      const sIdStr = String(sId);
      useActiveChildStore.getState().updateChildBadge(sIdStr, 0);
      void mobileApiService.markAllNotificationsRead({ child_id: sIdStr }).catch(() => {});
    }

    try {
      const [assignRes, cbtRes] = await Promise.allSettled([
        mobileApiService.getPortalAssignments({ child_id: sId ? String(sId) : undefined, per_page: 20 }),
        mobileApiService.getPortalCbtExams(sId ? String(sId) : undefined),
      ]);

      if (assignRes.status === 'fulfilled') {
        const raw: any = assignRes.value;
        const list = Array.isArray(raw?.data?.data)
          ? raw.data.data
          : Array.isArray(raw?.data)
          ? raw.data
          : Array.isArray(raw?.items)
          ? raw.items
          : Array.isArray(raw)
          ? raw
          : [];
        setAssignments(list);
      }

      if (cbtRes.status === 'fulfilled') {
        const rawCbt: any = cbtRes.value;
        const cbtData = unwrapApiData<any[]>(rawCbt) || (Array.isArray(rawCbt?.data) ? rawCbt.data : Array.isArray(rawCbt) ? rawCbt : []);
        setCbtExams(cbtData);
      }
    } catch (err) {
      console.warn('[StudentNotificationModal] loadData error:', err);
    } finally {
      setLoading(false);
    }
  }, [visible, student, sId]);

  useEffect(() => {
    if (visible) {
      void loadData();
    }
  }, [visible, loadData]);

  if (!student) return null;

  const handleOpenFullNotifications = () => {
    onClose();
    if (navigation?.navigate) {
      navigation.navigate('Notifikasi');
    }
  };

  const totalAgenda = assignments.length + cbtExams.length;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        {/* Backdrop dismiss */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={styles.sheetContainer}>
          {/* Header Gradient — Hijau Zamrud Modern */}
          <LinearGradient
            colors={['#064E3B', '#0D6B42', '#18A165']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.sheetHeaderGradient}
          >
            <View style={styles.decorCircle1} />
            <View style={styles.decorCircle2} />

            <View style={styles.headerTopRow}>
              <TouchableOpacity
                onPress={onClose}
                style={styles.roundcubeBtn}
                accessibilityLabel="Tutup"
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="arrow-left" size={20} color="#059669" />
              </TouchableOpacity>

              <View style={styles.headerTitleCol}>
                <View style={styles.headerTagRow}>
                  <MaterialCommunityIcons name="bell-ring-outline" size={13} color="#A7F3D0" />
                  <Text style={styles.headerTagText}>NOTIFIKASI & PENGINGAT</Text>
                </View>
                <Text numberOfLines={1} style={styles.headerStudentName}>
                  {sName}
                </Text>
              </View>

              <TouchableOpacity
                onPress={loadData}
                style={styles.roundcubeBtn}
                accessibilityLabel="Muat Ulang"
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="refresh" size={20} color="#059669" />
              </TouchableOpacity>
            </View>
          </LinearGradient>

          {/* Subheader Box & Filter Tabs */}
          <View style={styles.filterWrap}>
            <View style={styles.agendaIntroRow}>
              <View style={styles.agendaIntroIconBox}>
                <MaterialCommunityIcons name="calendar-clock" size={18} color="#059669" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.agendaIntroTitle}>Agenda & Tugas Terjadwal</Text>
                <Text style={styles.agendaIntroSub}>
                  Pengingat tugas LMS, jadwal ujian CBT, kuis, dan maklumat belajar.
                </Text>
              </View>
            </View>

            <View style={styles.tabsRow}>
              <TouchableOpacity
                onPress={() => setFilterMode('all')}
                style={[
                  styles.tabPill,
                  filterMode === 'all' && styles.tabPillActiveEmerald,
                ]}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="view-grid-outline"
                  size={14}
                  color={filterMode === 'all' ? '#FFFFFF' : '#047857'}
                />
                <Text
                  style={[
                    styles.tabPillText,
                    filterMode === 'all' && styles.tabPillTextActive,
                  ]}
                >
                  Semua ({totalAgenda})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setFilterMode('tugas')}
                style={[
                  styles.tabPill,
                  filterMode === 'tugas' && styles.tabPillActiveAmber,
                ]}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="clipboard-text-outline"
                  size={14}
                  color={filterMode === 'tugas' ? '#FFFFFF' : '#D97706'}
                />
                <Text
                  style={[
                    styles.tabPillText,
                    filterMode === 'tugas' && styles.tabPillTextActive,
                  ]}
                >
                  Tugas LMS ({assignments.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setFilterMode('cbt')}
                style={[
                  styles.tabPill,
                  filterMode === 'cbt' && styles.tabPillActiveBlue,
                ]}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="laptop"
                  size={14}
                  color={filterMode === 'cbt' ? '#FFFFFF' : '#2563EB'}
                />
                <Text
                  style={[
                    styles.tabPillText,
                    filterMode === 'cbt' && styles.tabPillTextActive,
                  ]}
                >
                  Ujian CBT ({cbtExams.length})
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* List Content */}
          <ScrollView
            contentContainerStyle={styles.scrollList}
            showsVerticalScrollIndicator={false}
          >
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#059669" />
                <Text style={styles.loadingText}>Memuat agenda & notifikasi siswa...</Text>
              </View>
            ) : (
              <>
                {/* TUGAS SECTION */}
                {(filterMode === 'all' || filterMode === 'tugas') && assignments.length > 0 && (
                  <View style={styles.sectionBox}>
                    <View style={styles.sectionHeader}>
                      <MaterialCommunityIcons name="clipboard-text-outline" size={16} color="#D97706" />
                      <Text style={styles.sectionTitle}>Tugas & Kuis LMS</Text>
                    </View>
                    {assignments.map((item, idx) => {
                      const title = item.title || item.judul || 'Tugas Siswa';
                      const subject = item.subject?.name || item.subject_name || item.mata_pelajaran || 'Mata Pelajaran';
                      const deadline = item.deadline || item.due_date || item.tanggal_batas;

                      return (
                        <View key={String(item.id || idx)} style={styles.itemCardAmber}>
                          <View style={styles.itemCardHeaderRow}>
                            <View style={styles.badgeAmber}>
                              <Text style={styles.badgeAmberText}>{subject}</Text>
                            </View>
                            {deadline ? (
                              <View style={styles.deadlineRow}>
                                <MaterialCommunityIcons name="clock-outline" size={12} color="#92400E" />
                                <Text style={styles.deadlineText}>{String(deadline).slice(0, 16)}</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={styles.itemTitle}>{title}</Text>
                          {item.instructions || item.description ? (
                            <Text numberOfLines={2} style={styles.itemDesc}>
                              {item.instructions || item.description}
                            </Text>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* CBT EXAMS SECTION */}
                {(filterMode === 'all' || filterMode === 'cbt') && cbtExams.length > 0 && (
                  <View style={styles.sectionBox}>
                    <View style={styles.sectionHeader}>
                      <MaterialCommunityIcons name="laptop" size={16} color="#2563EB" />
                      <Text style={styles.sectionTitle}>Jadwal Ujian CBT Daring</Text>
                    </View>
                    {cbtExams.map((item, idx) => {
                      const title = item.title || item.nama_ujian || 'Ujian CBT';
                      const subject = item.subject?.name || item.subject_name || 'Mapel';
                      const timeStr = item.start_time || item.waktu_mulai || item.scheduled_at;

                      return (
                        <View key={String(item.id || idx)} style={styles.itemCardBlue}>
                          <View style={styles.itemCardHeaderRow}>
                            <View style={styles.badgeBlue}>
                              <Text style={styles.badgeBlueText}>{subject}</Text>
                            </View>
                            {timeStr ? (
                              <View style={styles.deadlineRow}>
                                <MaterialCommunityIcons name="calendar-clock" size={12} color="#1E40AF" />
                                <Text style={styles.deadlineTextBlue}>{String(timeStr).slice(0, 16)}</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={styles.itemTitle}>{title}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* EMPTY STATE */}
                {assignments.length === 0 && cbtExams.length === 0 && (
                  <View style={styles.emptyContainer}>
                    <View style={styles.emptyIconBox}>
                      <MaterialCommunityIcons name="bell-check-outline" size={32} color="#059669" />
                    </View>
                    <Text style={styles.emptyTitle}>Semua Agenda Telah Selesai</Text>
                    <Text style={styles.emptySub}>
                      Tidak ada tugas atau jadwal ujian tertunda untuk ananda saat ini.
                    </Text>
                  </View>
                )}
              </>
            )}
          </ScrollView>

          {/* Footer Action */}
          <View style={styles.sheetFooter}>
            <TouchableOpacity
              onPress={handleOpenFullNotifications}
              style={styles.fullNotifBtn}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name="bell-badge-outline" size={18} color="#FFFFFF" />
              <Text style={styles.fullNotifBtnText}>Buka Pusat Notifikasi Lengkap</Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    width: '100%',
    maxHeight: SCREEN_HEIGHT * 0.88,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 20,
  },
  sheetHeaderGradient: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  decorCircle1: {
    position: 'absolute',
    top: -20,
    right: 40,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  decorCircle2: {
    position: 'absolute',
    bottom: -30,
    left: -20,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 1,
  },
  roundcubeBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  headerTitleCol: {
    flex: 1,
    marginHorizontal: 12,
  },
  headerTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  headerTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#A7F3D0',
    letterSpacing: 0.8,
  },
  headerStudentName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  filterWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  agendaIntroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  agendaIntroIconBox: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  agendaIntroTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  agendaIntroSub: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  tabPillActiveEmerald: {
    backgroundColor: '#059669',
    borderColor: '#047857',
  },
  tabPillActiveAmber: {
    backgroundColor: '#D97706',
    borderColor: '#B45309',
  },
  tabPillActiveBlue: {
    backgroundColor: '#2563EB',
    borderColor: '#1D4ED8',
  },
  tabPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  tabPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  scrollList: {
    padding: 16,
    paddingBottom: 20,
    gap: 14,
  },
  loadingContainer: {
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
  sectionBox: {
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#334155',
  },
  itemCardAmber: {
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  itemCardBlue: {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  itemCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  badgeAmber: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  badgeAmberText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#92400E',
  },
  badgeBlue: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  badgeBlueText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1E40AF',
  },
  deadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  deadlineText: {
    fontSize: 10.5,
    color: '#92400E',
    fontWeight: '600',
  },
  deadlineTextBlue: {
    fontSize: 10.5,
    color: '#1E40AF',
    fontWeight: '600',
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  itemDesc: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 15,
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconBox: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#065F46',
  },
  emptySub: {
    fontSize: 11.5,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 30,
  },
  sheetFooter: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  fullNotifBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#059669',
    borderRadius: 14,
    paddingVertical: 12,
    shadowColor: '#059669',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 3,
  },
  fullNotifBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

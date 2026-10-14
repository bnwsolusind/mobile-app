import React, { useState, useMemo, useEffect } from 'react';
import {
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
import WeeklyEvaluationReportPaperModal from '../WeeklyEvaluationReportPaperModal';

interface StudentAttendanceItem {
  id?: string | number;
  nama?: string;
  name?: string;
  nisn?: string;
  nis?: string;
  kelas?: string;
  rombel?: string;
  unit_name?: string;
  status?: string;
  waktu?: string;
  keterangan?: string;
  nama_ortu?: string;
  wali?: string;
  no_hp_ortu?: string;
  kontak_ortu?: string;
  avatar_url?: string;
}

interface PrincipalAttendanceModalProps {
  visible: boolean;
  onClose: () => void;
  attendanceList?: StudentAttendanceItem[];
  unitName?: string;
  initialStatus?: 'all' | 'Hadir' | 'Terlambat' | 'Izin' | 'Sakit' | 'Alpha';
  academicYear?: string;
}

export default function PrincipalAttendanceModal({
  visible,
  onClose,
  attendanceList = [],
  unitName = 'Unit Madrasah',
  initialStatus = 'all',
  academicYear,
}: PrincipalAttendanceModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Hadir' | 'Terlambat' | 'Izin' | 'Sakit' | 'Alpha'>(initialStatus);
  const [selectedStudentForPrint, setSelectedStudentForPrint] = useState<any>(null);
  const [displayLimit, setDisplayLimit] = useState(25);

  useEffect(() => {
    if (visible && initialStatus) {
      setStatusFilter(initialStatus);
    }
  }, [visible, initialStatus]);

  useEffect(() => {
    setDisplayLimit(25);
  }, [searchTerm, statusFilter, visible]);

  // Real attendance data from backend
  const rawList: StudentAttendanceItem[] = useMemo(() => {
    return Array.isArray(attendanceList) ? attendanceList : [];
  }, [attendanceList]);

  const filteredList = useMemo(() => {
    return rawList.filter((item) => {
      const sName = (item.nama || item.name || '').toLowerCase();
      const sNisn = (item.nisn || item.nis || '').toLowerCase();
      const sKelas = (item.kelas || item.rombel || '').toLowerCase();
      const q = searchTerm.toLowerCase();

      const matchSearch = !q || sName.includes(q) || sNisn.includes(q) || sKelas.includes(q);
      const matchStatus = statusFilter === 'all' || item.status === statusFilter;

      return matchSearch && matchStatus;
    });
  }, [rawList, searchTerm, statusFilter]);

  const displayedList = useMemo(() => {
    return filteredList.slice(0, displayLimit);
  }, [filteredList, displayLimit]);

  const statusCount = useMemo(() => {
    return {
      all: rawList.length,
      hadir: rawList.filter((i) => i.status === 'Hadir').length,
      terlambat: rawList.filter((i) => i.status === 'Terlambat').length,
      izin: rawList.filter((i) => i.status === 'Izin').length,
      sakit: rawList.filter((i) => i.status === 'Sakit').length,
      alpha: rawList.filter((i) => i.status === 'Alpha').length,
    };
  }, [rawList]);

  const getStatusTheme = (st?: string) => {
    switch (st) {
      case 'Hadir': return { bg: '#DEF7EC', text: '#059669', border: '#A7F3D0' };
      case 'Terlambat': return { bg: '#FEF3C7', text: '#D97706', border: '#FDE68A' };
      case 'Izin': return { bg: '#E0F2FE', text: '#0284C7', border: '#BAE6FD' };
      case 'Sakit': return { bg: '#FFE4E6', text: '#E11D48', border: '#FECDD3' };
      case 'Alpha': return { bg: '#FEE2E2', text: '#DC2626', border: '#FCA5A5' };
      default: return { bg: '#F1F5F9', text: '#64748B', border: '#CBD5E1' };
    }
  };

  const handleOpenWhatsApp = (phone?: string | number) => {
    if (!phone) return;
    const cleanPhone = String(phone).replace(/\D/g, '').replace(/^0/, '62');
    Linking.openURL(`https://wa.me/${cleanPhone}`).catch(() => {});
  };

  return (
    <>
      <Modal visible={visible && !selectedStudentForPrint} animationType="slide" transparent onRequestClose={onClose}>
        <View style={styles.backdrop}>
          <View style={styles.sheetContainer}>
            {/* Header */}
            <LinearGradient
              colors={['#047857', '#059669', '#10B981']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sheetHeader}
            >
              <View style={styles.headerLeft}>
                <View style={styles.headerIconWrap}>
                  <MaterialCommunityIcons name="clipboard-text-search" size={22} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.headerTitle}>Monitoring Kehadiran Siswa</Text>
                  <Text style={styles.headerSub}>Rekap presensi harian kesiswaan {unitName}</Text>
                </View>
              </View>

              <TouchableOpacity activeOpacity={0.7} onPress={onClose} style={styles.closeBtn}>
                <MaterialCommunityIcons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </LinearGradient>

            {/* Search Bar */}
            <View style={styles.searchBarWrap}>
              <View style={styles.searchInputBox}>
                <MaterialCommunityIcons name="magnify" size={18} color="#94A3B8" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Cari santri, NISN, atau kelas..."
                  placeholderTextColor="#94A3B8"
                  value={searchTerm}
                  onChangeText={setSearchTerm}
                />
                {searchTerm ? (
                  <TouchableOpacity onPress={() => setSearchTerm('')}>
                    <MaterialCommunityIcons name="close-circle" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            {/* Filter Pills */}
            <View style={styles.filterPillsWrap}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPillsRow}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setStatusFilter('all')}
                  style={[styles.pillBtn, statusFilter === 'all' && styles.pillBtnActive]}
                >
                  <Text style={[styles.pillText, statusFilter === 'all' && styles.pillTextActive]}>
                    Semua ({statusCount.all})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setStatusFilter('Hadir')}
                  style={[styles.pillBtn, statusFilter === 'Hadir' && { backgroundColor: '#059669', borderColor: '#059669' }]}
                >
                  <Text style={[styles.pillText, statusFilter === 'Hadir' && styles.pillTextActive]}>
                    Hadir ({statusCount.hadir})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setStatusFilter('Terlambat')}
                  style={[styles.pillBtn, statusFilter === 'Terlambat' && { backgroundColor: '#D97706', borderColor: '#D97706' }]}
                >
                  <Text style={[styles.pillText, statusFilter === 'Terlambat' && styles.pillTextActive]}>
                    Terlambat ({statusCount.terlambat})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setStatusFilter('Izin')}
                  style={[styles.pillBtn, statusFilter === 'Izin' && { backgroundColor: '#0284C7', borderColor: '#0284C7' }]}
                >
                  <Text style={[styles.pillText, statusFilter === 'Izin' && styles.pillTextActive]}>
                    Izin ({statusCount.izin})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setStatusFilter('Sakit')}
                  style={[styles.pillBtn, statusFilter === 'Sakit' && { backgroundColor: '#E11D48', borderColor: '#E11D48' }]}
                >
                  <Text style={[styles.pillText, statusFilter === 'Sakit' && styles.pillTextActive]}>
                    Sakit ({statusCount.sakit})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setStatusFilter('Alpha')}
                  style={[styles.pillBtn, statusFilter === 'Alpha' && { backgroundColor: '#DC2626', borderColor: '#DC2626' }]}
                >
                  <Text style={[styles.pillText, statusFilter === 'Alpha' && styles.pillTextActive]}>
                    Alpha ({statusCount.alpha})
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>

            {/* List */}
            <ScrollView style={styles.listWrap} contentContainerStyle={styles.listContent}>
              {displayedList.map((item, idx) => {
                const sName = item.nama || item.name || 'Santri';
                const sNisn = item.nisn || item.nis || '—';
                const sKelas = item.kelas || item.rombel || '—';
                const sStatus = item.status || 'Belum Presensi';
                const sTime = item.waktu || '—';
                const sKet = item.keterangan || (sStatus === 'Hadir' ? 'Hadir Tepat Waktu' : '—');
                const sPhone = item.no_hp_ortu || item.kontak_ortu;
                const theme = getStatusTheme(sStatus);

                return (
                  <View key={item.id || idx} style={styles.studentCard}>
                    <View style={styles.cardHeaderRow}>
                      <View style={styles.avatarWrap}>
                        <Text style={styles.avatarLetter}>
                          {sName.substring(0, 2).toUpperCase()}
                        </Text>
                      </View>

                      <View style={styles.headerInfoCol}>
                        <View style={styles.nameRow}>
                          <Text style={styles.studentName} numberOfLines={1}>{sName}</Text>
                          <View style={[styles.statusBadge, { backgroundColor: theme.bg, borderColor: theme.border }]}>
                            <Text style={[styles.statusBadgeText, { color: theme.text }]}>{sStatus}</Text>
                          </View>
                        </View>
                        <Text style={styles.studentSub}>
                          NISN: {sNisn} • Kelas: {sKelas}
                        </Text>
                      </View>
                    </View>

                    {/* Meta Row: Time & Notes */}
                    <View style={styles.detailBox}>
                      <View style={styles.detailRow}>
                        <MaterialCommunityIcons name="clock-outline" size={14} color="#059669" />
                        <Text style={styles.detailTime}>Waktu: {sTime}</Text>
                        <Text style={styles.dotDivider}>•</Text>
                        <Text style={styles.detailKet} numberOfLines={1}>{sKet}</Text>
                      </View>
                    </View>

                    {/* Action Buttons: Call Wali & Print Report */}
                    <View style={styles.cardActionsRow}>
                      {sPhone ? (
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => handleOpenWhatsApp(sPhone)}
                          style={styles.waBtn}
                        >
                          <MaterialCommunityIcons name="whatsapp" size={15} color="#059669" />
                          <Text style={styles.waBtnText}>Hubungi Wali</Text>
                        </TouchableOpacity>
                      ) : null}

                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => setSelectedStudentForPrint(item)}
                        style={styles.printBtn}
                      >
                        <MaterialCommunityIcons name="printer" size={15} color="#2563EB" />
                        <Text style={styles.printBtnText}>Cetak Perkembangan</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}

              {filteredList.length > displayLimit && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setDisplayLimit((prev) => prev + 25)}
                  style={styles.loadMoreBtn}
                >
                  <MaterialCommunityIcons name="chevron-down" size={16} color="#059669" />
                  <Text style={styles.loadMoreBtnText}>
                    Tampilkan Lebih Banyak ({filteredList.length - displayLimit} santri tersisa)
                  </Text>
                </TouchableOpacity>
              )}

              {filteredList.length === 0 && (
                <View style={styles.emptyWrap}>
                  <MaterialCommunityIcons name="account-search-outline" size={44} color="#CBD5E1" />
                  <Text style={styles.emptyTitle}>Data Tidak Ditemukan</Text>
                  <Text style={styles.emptySub}>
                    {searchTerm.trim() || statusFilter !== 'all'
                      ? `Tidak ada santri dengan status "${statusFilter}" atau pencarian "${searchTerm}"`
                      : 'Belum ada catatan presensi santri untuk tanggal evaluasi ini.'}
                  </Text>
                </View>
              )}
            </ScrollView>

            {/* Footer */}
            <View style={styles.footerWrap}>
              <TouchableOpacity activeOpacity={0.8} onPress={onClose} style={styles.closeFullBtn}>
                <Text style={styles.closeFullBtnText}>Tutup Window</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Weekly Evaluation Modal Trigger */}
      {selectedStudentForPrint && (
        <WeeklyEvaluationReportPaperModal
          visible={Boolean(selectedStudentForPrint)}
          onClose={() => setSelectedStudentForPrint(null)}
          student={selectedStudentForPrint}
          academicYear={academicYear || selectedStudentForPrint?.academic_year || selectedStudentForPrint?.tahun_ajaran || ''}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSub: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '600',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBarWrap: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  searchInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: '#1E293B',
    paddingVertical: 0,
  },
  filterPillsWrap: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  filterPillsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
  },
  pillBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pillBtnActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
  listWrap: {
    maxHeight: 420,
    paddingHorizontal: 16,
  },
  listContent: {
    paddingVertical: 12,
    gap: 12,
  },
  studentCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 18,
    padding: 14,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#DEF7EC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: {
    fontSize: 14,
    fontWeight: '800',
    color: '#059669',
  },
  headerInfoCol: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  studentName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  studentSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  detailBox: {
    marginTop: 10,
    padding: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailTime: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
  },
  dotDivider: {
    color: '#CBD5E1',
  },
  detailKet: {
    fontSize: 11,
    color: '#64748B',
    flex: 1,
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  waBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  waBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  printBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  printBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#64748B',
    marginTop: 4,
  },
  emptySub: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
  },
  footerWrap: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  closeFullBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  closeFullBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#475569',
  },
  loadMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginVertical: 10,
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  loadMoreBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
});

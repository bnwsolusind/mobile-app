import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { EmptyStateCard } from '../EmptyStateCard';

interface Props {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  academicFilter: 'all' | 'high' | 'remedial' | 'pending';
  setAcademicFilter: (f: 'all' | 'high' | 'remedial' | 'pending') => void;
  subjects: any[];
  trendData: { month?: string; semester?: string; score: number }[];
  studentName?: string;
  onSelectSubject: (subject: any) => void;
}

const getSubjectTheme = (subjectName: string = ''): { bgIcon: string; iconColor: string; icon: any } => {
  const norm = (subjectName || '').toLowerCase();
  if (
    norm.includes('agama') ||
    norm.includes('islam') ||
    norm.includes('pai') ||
    norm.includes('fiqih') ||
    norm.includes('tahfiz') ||
    norm.includes('quran') ||
    norm.includes('hadits') ||
    norm.includes('akidah')
  ) {
    return { bgIcon: '#E6F8F0', iconColor: '#059669', icon: 'book-open-page-variant-outline' };
  }
  if (
    norm.includes('ipa') ||
    norm.includes('alam') ||
    norm.includes('fisika') ||
    norm.includes('biologi') ||
    norm.includes('kimia') ||
    norm.includes('sains')
  ) {
    return { bgIcon: '#F3E8FF', iconColor: '#7C3AED', icon: 'flask-outline' };
  }
  if (
    norm.includes('matematika') ||
    norm.includes('math') ||
    norm.includes('hitung') ||
    norm.includes('aljabar')
  ) {
    return { bgIcon: '#EFF6FF', iconColor: '#2563EB', icon: 'calculator-variant-outline' };
  }
  if (
    norm.includes('bahasa') ||
    norm.includes('indonesia') ||
    norm.includes('inggris') ||
    norm.includes('arab') ||
    norm.includes('literasi')
  ) {
    return { bgIcon: '#DCFCE7', iconColor: '#16A34A', icon: 'book-open-variant' };
  }
  if (
    norm.includes('ips') ||
    norm.includes('sosial') ||
    norm.includes('sejarah') ||
    norm.includes('geografi') ||
    norm.includes('ekonomi')
  ) {
    return { bgIcon: '#FEF3C7', iconColor: '#D97706', icon: 'earth' };
  }
  if (norm.includes('seni') || norm.includes('budaya') || norm.includes('prakarya')) {
    return { bgIcon: '#FCE7F3', iconColor: '#DB2777', icon: 'palette-outline' };
  }
  if (norm.includes('pjok') || norm.includes('olahraga') || norm.includes('jasmani')) {
    return { bgIcon: '#FFE4E6', iconColor: '#E11D48', icon: 'run' };
  }
  return { bgIcon: '#F1F5F9', iconColor: '#059669', icon: 'book-outline' };
};

export const GradeAkademikTab: React.FC<Props> = ({
  searchQuery,
  setSearchQuery,
  academicFilter,
  setAcademicFilter,
  subjects,
  trendData,
  studentName,
  onSelectSubject,
}) => {
  return (
    <View style={styles.tabContainer}>
      {/* 1. GRAFIK PERKEMBANGAN NILAI (TREND CHART CARD) */}
      {trendData && trendData.length > 0 && (
        <View style={styles.trendCard}>
          <View style={styles.trendHeaderRow}>
            <View style={styles.trendHeaderLeft}>
              <View style={styles.trendIconBox}>
                <MaterialCommunityIcons name="chart-bell-curve-cumulative" size={18} color="#059669" />
              </View>
              <View style={styles.trendTitleCol}>
                <Text style={styles.trendTitle}>Grafik Perkembangan Nilai</Text>
                {studentName ? (
                  <View style={styles.trendStudentBadge}>
                    <MaterialCommunityIcons name="account-circle-outline" size={12} color="#047857" />
                    <Text style={styles.trendStudentBadgeText} numberOfLines={1} ellipsizeMode="tail">
                      {studentName}
                    </Text>
                  </View>
                ) : null}
                <Text style={styles.trendSub} numberOfLines={1}>
                  {studentName ? `Tren capaian semester ananda ${studentName}` : 'Tren rata-rata nilai tiap semester'}
                </Text>
              </View>
            </View>
            <View style={styles.trendBadge}>
              <MaterialCommunityIcons name="trending-up" size={14} color="#059669" />
              <Text style={styles.trendBadgeText}>Progresif</Text>
            </View>
          </View>

          {/* Bar Visualizer */}
          <View style={styles.chartTrack}>
            {trendData.map((item, idx) => {
              const isLatest = idx === trendData.length - 1;
              const barHeightPct = Math.max(22, Math.min(100, ((item.score - 50) / 50) * 100));

              return (
                <View key={idx} style={styles.barColumn}>
                  <Text style={[styles.barScoreLabel, isLatest && styles.barScoreLabelActive]}>
                    {item.score}
                  </Text>
                  <View style={styles.barSlot}>
                    <LinearGradient
                      colors={
                        isLatest
                          ? (['#047857', '#10B981'] as const)
                          : (['#CBD5E1', '#E2E8F0'] as const)
                      }
                      start={{ x: 0, y: 1 }}
                      end={{ x: 0, y: 0 }}
                      style={[styles.barFill, { height: `${barHeightPct}%` }]}
                    />
                  </View>
                  <Text
                    numberOfLines={1}
                    style={[styles.barSemesterLabel, isLatest && styles.barSemesterLabelActive]}
                  >
                    {item.semester || item.month}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* 2. SEARCH & FILTER TOOLBAR (Identik MaterialScreen) */}
      <View style={styles.searchBarContainerModern}>
        <MaterialCommunityIcons
          name="magnify"
          size={20}
          color={searchQuery.length > 0 ? '#059669' : '#94A3B8'}
          style={{ marginRight: 8 }}
        />
        <TextInput
          placeholder="Cari mata pelajaran, guru, atau predikat..."
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchInputFieldModern}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Chips Horizontal Scrollable */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterPillsScrollContent}
        style={styles.filterPillsScrollView}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setAcademicFilter('all')}
          style={[
            styles.subjectFilterChip,
            academicFilter === 'all' && styles.subjectFilterChipActive,
          ]}
        >
          <MaterialCommunityIcons
            name="book-open-outline"
            size={13}
            color={academicFilter === 'all' ? '#FFFFFF' : '#059669'}
            style={{ marginRight: 4 }}
          />
          <Text
            style={[
              styles.subjectFilterChipText,
              academicFilter === 'all' && styles.subjectFilterChipTextActive,
            ]}
          >
            Semua ({subjects.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setAcademicFilter('high')}
          style={[
            styles.subjectFilterChip,
            academicFilter === 'high' && styles.subjectFilterChipActive,
          ]}
        >
          <MaterialCommunityIcons
            name="star-outline"
            size={13}
            color={academicFilter === 'high' ? '#FFFFFF' : '#D97706'}
            style={{ marginRight: 4 }}
          />
          <Text
            style={[
              styles.subjectFilterChipText,
              academicFilter === 'high' && styles.subjectFilterChipTextActive,
            ]}
          >
            Nilai ≥ 85
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setAcademicFilter('remedial')}
          style={[
            styles.subjectFilterChip,
            academicFilter === 'remedial' && styles.subjectFilterChipActive,
          ]}
        >
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={13}
            color={academicFilter === 'remedial' ? '#FFFFFF' : '#E11D48'}
            style={{ marginRight: 4 }}
          />
          <Text
            style={[
              styles.subjectFilterChipText,
              academicFilter === 'remedial' && styles.subjectFilterChipTextActive,
            ]}
          >
            Remedial
          </Text>
        </TouchableOpacity>

        {(academicFilter !== 'all' || searchQuery.trim().length > 0) && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              setAcademicFilter('all');
              setSearchQuery('');
            }}
            style={styles.resetFilterChip}
          >
            <MaterialCommunityIcons name="filter-remove-outline" size={13} color="#E11D48" style={{ marginRight: 4 }} />
            <Text style={styles.resetFilterChipText}>Reset Filter</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* 3. DAFTAR MATA PELAJARAN (CARDS IDENTIK DENGAN HALAMAN MATERI) */}
      <View style={styles.subjectList}>
        {subjects.length === 0 ? (
          <View style={styles.emptyCardModern}>
            <View style={styles.emptyIconCircle}>
              <MaterialCommunityIcons name="book-open-outline" size={38} color="#94A3B8" />
            </View>
            <Text style={styles.emptyTitleModern}>Mata Pelajaran Tidak Ditemukan</Text>
            <Text style={styles.emptySubtitleModern}>
              {searchQuery || academicFilter !== 'all'
                ? 'Tidak ada nilai mata pelajaran yang sesuai dengan filter atau kata kunci pencarian Anda.'
                : 'Nilai mata pelajaran ananda untuk semester ini belum dipublikasikan.'}
            </Text>
            {(searchQuery || academicFilter !== 'all') && (
              <TouchableOpacity
                onPress={() => {
                  setSearchQuery('');
                  setAcademicFilter('all');
                }}
                style={styles.emptyResetBtn}
              >
                <MaterialCommunityIcons name="refresh" size={15} color="#059669" style={{ marginRight: 4 }} />
                <Text style={styles.emptyResetBtnText}>Reset Semua Filter</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          subjects.map((item) => {
            const theme = getSubjectTheme(item.name);
            const kkmVal = item.kkm != null ? Math.round(Number(item.kkm)) : 75;
            const scoreVal = Math.round(Number(item.score) || 0);
            const isRemedial = scoreVal < kkmVal;
            const isHigh = scoreVal >= 85;
            const diffKkm = Math.round(Math.abs(scoreVal - kkmVal));

            return (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.88}
                onPress={() => onSelectSubject(item)}
                style={[
                  styles.materialCardModern,
                  {
                    borderLeftWidth: 4,
                    borderLeftColor: theme.iconColor,
                    borderColor: '#E2E8F0',
                  },
                ]}
              >
                <LinearGradient
                  colors={[theme.bgIcon || '#F0FDF4', '#FFFFFF', '#FFFFFF']}
                  locations={[0, 0.45, 1]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0.8 }}
                  style={styles.materialCardGradient}
                >
                  {/* Header Row: Subject Badge, KKM Badge, Score Pill */}
                  <View style={styles.cardHeaderRow}>
                    <View style={[styles.subjectPillBadgeModern, { backgroundColor: '#FFFFFF', borderColor: `${theme.iconColor}40` }]}>
                      <MaterialCommunityIcons
                        name={theme.icon}
                        size={12}
                        color={theme.iconColor}
                        style={{ marginRight: 4 }}
                      />
                      <Text numberOfLines={1} style={[styles.subjectPillTextModern, { color: theme.iconColor }]}>
                        {item.name}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.statusBadgeModern,
                        isHigh
                          ? styles.statusBadgeHigh
                          : isRemedial
                          ? styles.statusBadgeRemedial
                          : styles.statusBadgeNormal,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusBadgeTextModern,
                          isHigh
                            ? styles.statusTextHigh
                            : isRemedial
                            ? styles.statusTextRemedial
                            : styles.statusTextNormal,
                        ]}
                      >
                        {isHigh ? 'Unggul' : isRemedial ? 'Remedial' : 'Tuntas'}
                      </Text>
                    </View>

                    <View style={{ flex: 1 }} />

                    {/* Nilai Akhir & Predikat Pill */}
                    <View
                      style={[
                        styles.scorePillBadge,
                        {
                          backgroundColor: isHigh ? '#DEF7EC' : isRemedial ? '#FEE2E2' : '#DBEAFE',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.scorePillNum,
                          {
                            color: isHigh ? '#03543F' : isRemedial ? '#991B1B' : '#1E40AF',
                          },
                        ]}
                      >
                        {scoreVal}
                      </Text>
                      <View
                        style={[
                          styles.scorePredCircle,
                          {
                            backgroundColor: isHigh ? '#059669' : isRemedial ? '#DC2626' : '#2563EB',
                          },
                        ]}
                      >
                        <Text style={styles.scorePredCircleText}>{item.predicate || 'A'}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Body: Mapel & Guru Pengampu */}
                  <View style={styles.cardBodySection}>
                    <Text numberOfLines={1} style={styles.subjectMainTitle}>
                      {item.name}
                    </Text>
                    <View style={styles.teacherAuthorRow}>
                      <MaterialCommunityIcons name="account-tie-outline" size={13} color="#64748B" style={{ marginRight: 4 }} />
                      <Text numberOfLines={1} style={styles.teacherAuthorText}>
                        Guru Pengampu: <Text style={{ fontWeight: '700', color: '#334155' }}>{item.teacher || 'Dewan Guru'}</Text>
                      </Text>
                    </View>
                  </View>

                  {/* 4-Box Nilai Breakdown: Tugas, UTS, UAS, KKM */}
                  <View style={styles.scoreBreakdownContainer}>
                    <View style={styles.scoreBoxCol}>
                      <Text style={styles.scoreBoxLabel}>Tugas/PR</Text>
                      <Text style={styles.scoreBoxVal}>{item.score_assignment != null ? Math.round(Number(item.score_assignment)) : '-'}</Text>
                    </View>
                    <View style={styles.scoreBoxDivider} />
                    <View style={styles.scoreBoxCol}>
                      <Text style={styles.scoreBoxLabel}>UTS / PTS</Text>
                      <Text style={styles.scoreBoxVal}>{item.score_mid != null ? Math.round(Number(item.score_mid)) : '-'}</Text>
                    </View>
                    <View style={styles.scoreBoxDivider} />
                    <View style={styles.scoreBoxCol}>
                      <Text style={styles.scoreBoxLabel}>UAS / PAS</Text>
                      <Text style={styles.scoreBoxVal}>{item.score_final != null ? Math.round(Number(item.score_final)) : '-'}</Text>
                    </View>
                    <View style={styles.scoreBoxDivider} />
                    <View style={styles.scoreBoxCol}>
                      <Text style={styles.scoreBoxLabel}>KKM Mapel</Text>
                      <Text style={styles.scoreBoxVal}>{kkmVal}</Text>
                    </View>
                  </View>

                  {/* Catatan Guru (Jika Ada) */}
                  {item.teacher_note || item.description ? (
                    <View style={styles.teacherNoteCallout}>
                      <MaterialCommunityIcons name="comment-text-outline" size={13} color="#059669" style={{ marginRight: 6, marginTop: 1 }} />
                      <Text numberOfLines={2} style={styles.teacherNoteText}>
                        {item.teacher_note || item.description}
                      </Text>
                    </View>
                  ) : null}

                  {/* Footer Action */}
                  <View style={styles.cardFooterRow}>
                    <Text style={styles.cardFooterSub}>
                      {scoreVal >= kkmVal
                        ? `+${diffKkm} poin di atas KKM`
                        : `Kurang ${diffKkm} poin dari KKM`}
                    </Text>
                    <View style={styles.detailActionBtn}>
                      <Text style={styles.detailActionBtnText}>Rincian Penilaian</Text>
                      <MaterialCommunityIcons name="chevron-right" size={15} color="#059669" />
                    </View>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  tabContainer: {
    paddingBottom: 16,
  },
  trendCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  trendHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  trendHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  trendIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trendTitleCol: {
    flex: 1,
  },
  trendTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#064E3B',
  },
  trendStudentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    gap: 3,
    marginTop: 2,
    marginBottom: 1,
    maxWidth: '100%',
  },
  trendStudentBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#047857',
  },
  trendSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 3,
  },
  trendBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#03543F',
  },
  chartTrack: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 96,
    paddingTop: 8,
    paddingBottom: 2,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  barScoreLabel: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 4,
  },
  barScoreLabelActive: {
    fontWeight: '800',
    color: '#059669',
  },
  barSlot: {
    width: 14,
    height: 52,
    backgroundColor: '#F1F5F9',
    borderRadius: 7,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 7,
  },
  barSemesterLabel: {
    fontSize: 9,
    color: '#64748B',
    marginTop: 5,
    fontWeight: '500',
  },
  barSemesterLabelActive: {
    color: '#059669',
    fontWeight: '800',
  },

  // ── Search & Filter Section (Identik MaterialScreen) ──
  searchBarContainerModern: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    height: 42,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    marginBottom: 10,
  },
  searchInputFieldModern: {
    flex: 1,
    fontSize: 12.5,
    color: '#0F172A',
    paddingVertical: 0,
  },
  filterPillsScrollView: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  filterPillsScrollContent: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  subjectFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
  },
  subjectFilterChipActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
    shadowColor: '#059669',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  subjectFilterChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  subjectFilterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  resetFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: '#FFF1F2',
    borderWidth: 1.2,
    borderColor: '#FECDD3',
  },
  resetFilterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E11D48',
  },

  // ── Subject Cards (Identik MaterialScreen) ──
  subjectList: {
    gap: 12,
  },
  materialCardModern: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#059669',
    shadowOpacity: 0.07,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  materialCardGradient: {
    padding: 13,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  subjectPillBadgeModern: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: '48%',
  },
  subjectPillTextModern: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  statusBadgeModern: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeHigh: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  statusBadgeNormal: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  statusBadgeRemedial: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  statusBadgeTextModern: {
    fontSize: 10,
    fontWeight: '800',
  },
  statusTextHigh: {
    color: '#059669',
  },
  statusTextNormal: {
    color: '#2563EB',
  },
  statusTextRemedial: {
    color: '#DC2626',
  },
  scorePillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  scorePillNum: {
    fontSize: 14,
    fontWeight: '900',
  },
  scorePredCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scorePredCircleText: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  cardBodySection: {
    marginBottom: 10,
  },
  subjectMainTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
    letterSpacing: -0.2,
  },
  teacherAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teacherAuthorText: {
    fontSize: 11,
    color: '#64748B',
  },
  scoreBreakdownContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  scoreBoxCol: {
    flex: 1,
    alignItems: 'center',
  },
  scoreBoxLabel: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 2,
  },
  scoreBoxVal: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  scoreBoxDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#E2E8F0',
  },
  teacherNoteCallout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#D1FAE5',
    marginBottom: 8,
  },
  teacherNoteText: {
    flex: 1,
    fontSize: 10.5,
    color: '#065F46',
    lineHeight: 14,
  },
  cardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  cardFooterSub: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  detailActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  detailActionBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },

  // Empty State
  emptyCardModern: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitleModern: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  emptySubtitleModern: {
    fontSize: 11.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 12,
  },
  emptyResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  emptyResetBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
});

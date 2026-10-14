import React from 'react';
import {
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
            <Text style={styles.trendBadgeText}>+3.5 Poin</Text>
          </View>
        </View>

        {/* Bar Visualizer */}
        <View style={styles.chartTrack}>
          {trendData.map((item, idx) => {
            const isLatest = idx === trendData.length - 1;
            const barHeightPct = Math.max(20, Math.min(100, ((item.score - 50) / 50) * 100));

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

      {/* 2. SEARCH & FILTER SECTION */}
      <View style={styles.searchBar}>
        <MaterialCommunityIcons name="magnify" size={20} color="#94A3B8" />
        <TextInput
          placeholder="Cari mata pelajaran atau guru..."
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchInput}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialCommunityIcons name="close-circle" size={16} color="#94A3B8" />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Chips */}
      <View style={styles.filterChipsRow}>
        {[
          { key: 'all', label: `Semua (${subjects.length})` },
          { key: 'high', label: 'Nilai ≥ 85' },
          { key: 'remedial', label: 'Remedial' },
          { key: 'pending', label: 'Belum Dinilai' },
        ].map((chip) => {
          const isSelected = academicFilter === chip.key;
          return (
            <TouchableOpacity
              key={chip.key}
              activeOpacity={0.8}
              onPress={() => setAcademicFilter(chip.key as any)}
              style={[styles.filterChip, isSelected && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                {chip.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 3. DAFTAR MATA PELAJARAN (CARDS) */}
      <View style={styles.subjectList}>
        {subjects.length === 0 ? (
          <EmptyStateCard
            icon="book-open-outline"
            title="Mata Pelajaran Tidak Ditemukan"
            description="Coba gunakan kata kunci pencarian lain atau ubah filter di atas."
          />
        ) : (
          subjects.map((item) => {
            const isRemedial = item.score < 75;
            const isHigh = item.score >= 85;

            const badgeBg = isHigh ? '#DEF7EC' : isRemedial ? '#FDE8E8' : '#E1EFFE';
            const badgeText = isHigh ? '#03543F' : isRemedial ? '#9B1C1C' : '#1E429F';

            return (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.88}
                onPress={() => onSelectSubject(item)}
                style={styles.subjectCard}
              >
                <View style={styles.subjectCardTop}>
                  <View style={styles.subjectLeft}>
                    <View style={styles.subjectIconBox}>
                      <MaterialCommunityIcons
                        name={item.icon || 'book-open-variant'}
                        size={22}
                        color="#059669"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={styles.subjectName}>
                        {item.name}
                      </Text>
                      <Text numberOfLines={1} style={styles.teacherName}>
                        {item.teacher}
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.scoreBadge, { backgroundColor: badgeBg }]}>
                    <Text style={[styles.scoreBadgeNum, { color: badgeText }]}>{item.score}</Text>
                    <Text style={[styles.scoreBadgePred, { color: badgeText }]}>{item.predicate}</Text>
                  </View>
                </View>

                {/* KKM & Progress bar indicator */}
                <View style={styles.progressRow}>
                  <View style={styles.progressBarTrack}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          width: `${Math.min(100, item.score)}%`,
                          backgroundColor: isHigh ? '#10B981' : isRemedial ? '#EF4444' : '#3B82F6',
                        },
                      ]}
                    />
                  </View>
                </View>

                <View style={styles.subjectCardBottom}>
                  <Text style={styles.kkmInfoText}>
                    KKM: 75 • {item.score >= 75 ? `+${item.score - 75} poin di atas KKM` : 'Perlu Remedial'}
                  </Text>
                  <View style={styles.detailLinkRow}>
                    <Text style={styles.detailLinkText}>Detail</Text>
                    <MaterialCommunityIcons name="chevron-right" size={16} color="#059669" />
                  </View>
                </View>
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
    paddingBottom: 20,
  },
  trendCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  trendHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  trendHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  trendIconBox: {
    width: 36,
    height: 36,
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
    fontWeight: '700',
    color: '#0F172A',
  },
  trendStudentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 3,
    marginTop: 2,
    marginBottom: 2,
    maxWidth: '100%',
  },
  trendStudentBadgeText: {
    fontSize: 10,
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
    borderRadius: 12,
    gap: 3,
  },
  trendBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#03543F',
  },
  chartTrack: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 110,
    paddingTop: 10,
    paddingBottom: 4,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  barScoreLabel: {
    fontSize: 10,
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
    height: 60,
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
    marginTop: 6,
    fontWeight: '500',
  },
  barSemesterLabelActive: {
    color: '#059669',
    fontWeight: '700',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
    padding: 0,
  },
  filterChipsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  filterChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterChipActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  filterChipText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#059669',
    fontWeight: '700',
  },
  subjectList: {
    gap: 10,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginTop: 10,
  },
  emptySub: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
  subjectCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  subjectCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subjectLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  subjectIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#DEF7EC',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  subjectName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  teacherName: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  scoreBadgeNum: {
    fontSize: 14,
    fontWeight: '800',
  },
  scoreBadgePred: {
    fontSize: 11,
    fontWeight: '700',
  },
  progressRow: {
    marginTop: 10,
    marginBottom: 6,
  },
  progressBarTrack: {
    height: 4,
    backgroundColor: '#F1F5F9',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  subjectCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  kkmInfoText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '500',
  },
  detailLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  detailLinkText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
});

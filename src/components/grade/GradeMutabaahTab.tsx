import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import EmptyStateCard from '../EmptyStateCard';

interface Props {
  aspects: any[];
  onSelectAspect: (aspect: any) => void;
  onOpenWeeklyReport?: () => void;
}

export const GradeMutabaahTab: React.FC<Props> = ({
  aspects,
  onSelectAspect,
  onOpenWeeklyReport,
}) => {
  return (
    <View style={styles.tabContainer}>
      {/* TOMBOL CETAK LAPORAN PEKANAN DI ATAS TAB MUTABAAH */}
      {onOpenWeeklyReport && (
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={onOpenWeeklyReport}
          style={styles.topPrintBtn}
        >
          <View style={styles.topPrintIconSquircle}>
            <MaterialCommunityIcons name="printer" size={24} color="#059669" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.topPrintTitle}>Cetak Laporan Pekanan Mutabaah</Text>
            <Text style={styles.topPrintSub}>Format Evaluasi & Jurnal Ibadah Pekanan</Text>
          </View>
          <View style={styles.topPrintArrowBox}>
            <MaterialCommunityIcons name="chevron-right" size={20} color="#059669" />
          </View>
        </TouchableOpacity>
      )}

      <View style={styles.sectionHeaderRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Aspek Penilaian Karakter & Ibadah</Text>
          <Text style={styles.sectionSub}>Berdasarkan mutabaah harian & jurnal ananda</Text>
        </View>
      </View>

      <View style={styles.aspectsList}>
        {!aspects || aspects.length === 0 ? (
          <EmptyStateCard
            icon="star-outline"
            title="Belum Ada Aspek Penilaian"
            description="Penilaian karakter dan pembiasaan ibadah ananda belum diinput untuk periode ini."
          />
        ) : (
          aspects.map((item) => {
          const isHigh = item.score >= 90;
          const badgeBg = isHigh ? '#DEF7EC' : '#E1EFFE';
          const badgeText = isHigh ? '#03543F' : '#1E429F';

          return (
            <TouchableOpacity
              key={item.key}
              activeOpacity={0.88}
              onPress={() => onSelectAspect(item)}
              style={styles.aspectCard}
            >
              <View style={styles.topRow}>
                <View style={styles.iconBox}>
                  <MaterialCommunityIcons name={item.icon || 'star'} size={22} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.aspectName}>{item.aspect}</Text>
                  <Text numberOfLines={1} style={styles.teacherName}>
                    {item.teacher}
                  </Text>
                </View>

                <View style={[styles.scoreBadge, { backgroundColor: badgeBg }]}>
                  <Text style={[styles.scoreNum, { color: badgeText }]}>{item.score}%</Text>
                  <Text style={[styles.scorePred, { color: badgeText }]}>{item.predicate}</Text>
                </View>
              </View>

              {/* Progress bar */}
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${item.score}%`,
                      backgroundColor: isHigh ? '#10B981' : '#3B82F6',
                    },
                  ]}
                />
              </View>

              <View style={styles.bottomRow}>
                <View style={styles.statusPill}>
                  <MaterialCommunityIcons
                    name={isHigh ? 'check-circle' : 'information'}
                    size={12}
                    color={isHigh ? '#059669' : '#2563EB'}
                  />
                  <Text
                    style={[
                      styles.statusText,
                      { color: isHigh ? '#059669' : '#2563EB' },
                    ]}
                  >
                    {isHigh ? 'Sangat Istiqomah' : 'Capaian Terpelihara'}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailText}>Grafik & Detail</Text>
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
    paddingBottom: 24,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 8,
  },
  topPrintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  topPrintIconSquircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#DEF7EC',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  topPrintTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#064E3B',
    letterSpacing: 0.1,
  },
  topPrintSub: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '600',
    marginTop: 2,
  },
  topPrintArrowBox: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  sectionSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  aspectsList: {
    gap: 10,
  },
  aspectCard: {
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#ECFDF5',
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
  aspectName: {
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
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  scoreNum: {
    fontSize: 13,
    fontWeight: '800',
  },
  scorePred: {
    fontSize: 10,
    fontWeight: '700',
  },
  progressTrack: {
    height: 5,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 12,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  detailText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
});

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface Props {
  selectedSemester: string | { year: string; semester: string; months?: string };
  onPress: () => void;
}

export const GradeSemesterSelector: React.FC<Props> = ({ selectedSemester, onPress }) => {
  const label =
    typeof selectedSemester === 'string'
      ? selectedSemester
      : `Semester ${selectedSemester.semester} ${selectedSemester.year}`;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={styles.container}
    >
      <View style={styles.leftRow}>
        <View style={styles.iconCircle}>
          <MaterialCommunityIcons name="calendar-clock" size={18} color="#059669" />
        </View>
        <View>
          <Text style={styles.subText}>Tahun Ajaran & Semester</Text>
          <Text style={styles.mainText}>{label}</Text>
        </View>
      </View>
      <View style={styles.rightRow}>
        <View style={styles.badgeAktif}>
          <Text style={styles.badgeAktifText}>Aktif</Text>
        </View>
        <MaterialCommunityIcons name="chevron-down" size={18} color="#64748B" />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  subText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#64748B',
    marginBottom: 1,
  },
  mainText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  rightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgeAktif: {
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  badgeAktifText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#03543F',
  },
});

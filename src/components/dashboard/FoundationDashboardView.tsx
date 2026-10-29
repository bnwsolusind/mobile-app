import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface FoundationDashboardViewProps {
  dashboard: Record<string, any>;
  navigation: any;
}

export default function FoundationDashboardView({
  dashboard,
  navigation,
}: FoundationDashboardViewProps) {
  const data = dashboard?.overview || dashboard?.data || dashboard || {};
  const totalStudents = data?.total_students ?? dashboard?.total_students ?? data?.totalStudents ?? '-';
  const totalEmployees = data?.total_employees ?? dashboard?.total_employees ?? data?.totalEmployees ?? '-';
  const totalUnits = data?.total_units ?? dashboard?.total_units ?? data?.totalUnits ?? '-';
  const totalClasses = data?.total_classes ?? dashboard?.total_classes ?? data?.totalClasses ?? data?.total_rombel ?? '-';

  return (
    <View style={styles.container}>
      {/* 1. Hub Yayasan */}
      <View style={styles.hubHeaderRow}>
        <View style={styles.hubHeaderLeft}>
          <View style={styles.hubPulseBox}>
            <View style={styles.pulseDot} />
            <MaterialCommunityIcons name="domain" size={17} color="#059669" />
          </View>
          <View>
            <Text style={styles.hubTitle}>Konsolidasi Yayasan Terpadu</Text>
            <Text style={styles.hubSubtitle}>
              Monitoring lintas unit & tata kelola pendidikan
            </Text>
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation?.navigate('Data')}
          style={styles.portalPillBtn}
        >
          <Text style={styles.portalPillText}>Pusat Data</Text>
          <MaterialCommunityIcons name="chevron-right" size={14} color="#065F46" />
        </TouchableOpacity>
      </View>

      {/* 2. 4 KPI Foundation Cards */}
      <View style={styles.kpiGrid}>
        {/* KPI 1: Total Santri Seluruh Unit */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigation?.navigate('Data')}
          style={[styles.kpiCard, { borderColor: '#A7F3D0' }]}
        >
          <LinearGradient
            colors={['#ECFDF5', '#F0FDF4']}
            style={styles.kpiGradient}
          >
            <View style={styles.kpiTopRow}>
              <View style={[styles.kpiIconWrap, { backgroundColor: '#059669' }]}>
                <MaterialCommunityIcons name="account-group" size={18} color="#FFFFFF" />
              </View>
              <Text style={[styles.kpiCount, { color: '#047857' }]}>
                {totalStudents}
              </Text>
            </View>
            <Text style={styles.kpiLabel}>Total Peserta Didik</Text>
            <Text style={styles.kpiSub}>Semua unit terpadu</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* KPI 2: Total SDM Pendidik & Staf */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigation?.navigate('Data')}
          style={[styles.kpiCard, { borderColor: '#BAE6FD' }]}
        >
          <LinearGradient
            colors={['#F0F9FF', '#E0F2FE']}
            style={styles.kpiGradient}
          >
            <View style={styles.kpiTopRow}>
              <View style={[styles.kpiIconWrap, { backgroundColor: '#0284C7' }]}>
                <MaterialCommunityIcons name="briefcase-account" size={18} color="#FFFFFF" />
              </View>
              <Text style={[styles.kpiCount, { color: '#0369A1' }]}>
                {totalEmployees}
              </Text>
            </View>
            <Text style={styles.kpiLabel}>SDM & Pendidik</Text>
            <Text style={styles.kpiSub}>Guru dan tenaga TU</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* KPI 3: Unit Pendidikan */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigation?.navigate('Data')}
          style={[styles.kpiCard, { borderColor: '#FDE68A' }]}
        >
          <LinearGradient
            colors={['#FFFBEB', '#FEF3C7']}
            style={styles.kpiGradient}
          >
            <View style={styles.kpiTopRow}>
              <View style={[styles.kpiIconWrap, { backgroundColor: '#D97706' }]}>
                <MaterialCommunityIcons name="domain" size={18} color="#FFFFFF" />
              </View>
              <Text style={[styles.kpiCount, { color: '#B45309' }]}>
                {totalUnits}
              </Text>
            </View>
            <Text style={styles.kpiLabel}>Unit Pendidikan</Text>
            <Text style={styles.kpiSub}>TK, SD, SMP, SMA, Ponpes</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* KPI 4: Rombel & Asrama */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigation?.navigate('Data')}
          style={[styles.kpiCard, { borderColor: '#DDD6FE' }]}
        >
          <LinearGradient
            colors={['#F5F3FF', '#EDE9FE']}
            style={styles.kpiGradient}
          >
            <View style={styles.kpiTopRow}>
              <View style={[styles.kpiIconWrap, { backgroundColor: '#7C3AED' }]}>
                <MaterialCommunityIcons name="door-open" size={18} color="#FFFFFF" />
              </View>
              <Text style={[styles.kpiCount, { color: '#6D28D9' }]}>
                {totalClasses}
              </Text>
            </View>
            <Text style={styles.kpiLabel}>Rombel & Asrama</Text>
            <Text style={styles.kpiSub}>Kapasitas terkelola</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* 3. Quick Controls */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleWithIcon}>
            <MaterialCommunityIcons name="chart-box-outline" size={20} color="#059669" style={{ marginRight: 6 }} />
            <Text style={styles.sectionTitleBold}>Pusat Monitoring & Evaluasi</Text>
          </View>
        </View>

        <View style={styles.actionGrid}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => navigation?.navigate('Data')}
            style={styles.actionBtnTile}
          >
            <View style={[styles.actionIconBox, { backgroundColor: '#E0F2FE' }]}>
              <MaterialCommunityIcons name="monitor-dashboard" size={22} color="#0284C7" />
            </View>
            <Text style={styles.actionBtnLabel}>Data Konsolidasi</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => navigation?.navigate('Absensi')}
            style={styles.actionBtnTile}
          >
            <View style={[styles.actionIconBox, { backgroundColor: '#DEF7EC' }]}>
              <MaterialCommunityIcons name="gate" size={22} color="#059669" />
            </View>
            <Text style={styles.actionBtnLabel}>Absensi Gerbang</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => navigation?.navigate('Kalender')}
            style={styles.actionBtnTile}
          >
            <View style={[styles.actionIconBox, { backgroundColor: '#FEF3C7' }]}>
              <MaterialCommunityIcons name="calendar-month-outline" size={22} color="#D97706" />
            </View>
            <Text style={styles.actionBtnLabel}>Kalender Terpadu</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => navigation?.navigate('Informasi')}
            style={styles.actionBtnTile}
          >
            <View style={[styles.actionIconBox, { backgroundColor: '#F1F5F9' }]}>
              <MaterialCommunityIcons name="newspaper" size={22} color="#334155" />
            </View>
            <Text style={styles.actionBtnLabel}>Agenda Yayasan</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  hubHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  hubHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flex: 1,
  },
  hubPulseBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    backgroundColor: '#DEF7EC',
  },
  pulseDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  hubTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#064E3B',
    lineHeight: 18,
  },
  hubSubtitle: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '600',
  },
  portalPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  portalPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#065F46',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  kpiCard: {
    width: '48.5%',
    borderRadius: 18,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  kpiGradient: {
    padding: 13,
  },
  kpiTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  kpiIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  kpiCount: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#064E3B',
    lineHeight: 16,
  },
  kpiSub: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 15,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitleBold: {
    fontSize: 14,
    fontWeight: '800',
    color: '#064E3B',
  },
  actionGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionBtnTile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
  },
  actionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  actionBtnLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#065F46',
    textAlign: 'center',
    lineHeight: 14,
  },
});

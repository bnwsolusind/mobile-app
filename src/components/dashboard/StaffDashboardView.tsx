import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface StaffDashboardViewProps {
  dashboard: Record<string, any>;
  navigation: any;
}

export default function StaffDashboardView({
  dashboard,
  navigation,
}: StaffDashboardViewProps) {
  const data = dashboard?.data || dashboard || {};
  const totalSiswa = data?.total_siswa ?? dashboard?.total_students ?? '-';
  const totalGuru = data?.total_guru ?? dashboard?.total_teachers ?? '-';

  return (
    <View style={styles.container}>
      {/* 1. Hub Tata Usaha */}
      <View style={styles.hubHeaderRow}>
        <View style={styles.hubHeaderLeft}>
          <View style={styles.hubPulseBox}>
            <View style={styles.pulseDot} />
            <MaterialCommunityIcons name="file-document-edit-outline" size={17} color="#0D9488" />
          </View>
          <View>
            <Text style={styles.hubTitle}>Operasional & Tata Usaha</Text>
            <Text style={styles.hubSubtitle}>
              Layanan administrasi madrasah & persuratan
            </Text>
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation?.navigate('Data')}
          style={styles.portalPillBtn}
        >
          <Text style={styles.portalPillText}>Kelola Data</Text>
          <MaterialCommunityIcons name="chevron-right" size={14} color="#0D9488" />
        </TouchableOpacity>
      </View>

      {/* 2. 4 KPI Staff Cards */}
      <View style={styles.kpiGrid}>
        {/* KPI 1: Data Santri */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigation?.navigate('Data')}
          style={[styles.kpiCard, { borderColor: '#99F6E4' }]}
        >
          <LinearGradient
            colors={['#F0FDFA', '#CCFBF1']}
            style={styles.kpiGradient}
          >
            <View style={styles.kpiTopRow}>
              <View style={[styles.kpiIconWrap, { backgroundColor: '#0D9488' }]}>
                <MaterialCommunityIcons name="account-group" size={18} color="#FFFFFF" />
              </View>
              <Text style={[styles.kpiCount, { color: '#0F766E' }]}>
                {totalSiswa}
              </Text>
            </View>
            <Text style={styles.kpiLabel}>Data Siswa</Text>
            <Text style={styles.kpiSub}>Administrasi induk</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* KPI 2: Tenaga Pengajar */}
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
                <MaterialCommunityIcons name="account-tie" size={18} color="#FFFFFF" />
              </View>
              <Text style={[styles.kpiCount, { color: '#0369A1' }]}>
                {totalGuru}
              </Text>
            </View>
            <Text style={styles.kpiLabel}>Data Guru & Staf</Text>
            <Text style={styles.kpiSub}>Berkas kepegawaian</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* KPI 3: Presensi Harian */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigation?.navigate('Absensi')}
          style={[styles.kpiCard, { borderColor: '#A7F3D0' }]}
        >
          <LinearGradient
            colors={['#ECFDF5', '#F0FDF4']}
            style={styles.kpiGradient}
          >
            <View style={styles.kpiTopRow}>
              <View style={[styles.kpiIconWrap, { backgroundColor: '#059669' }]}>
                <MaterialCommunityIcons name="clipboard-check" size={18} color="#FFFFFF" />
              </View>
              <Text style={[styles.kpiCount, { color: '#047857' }]}>
                Aktif
              </Text>
            </View>
            <Text style={styles.kpiLabel}>Presensi Harian</Text>
            <Text style={styles.kpiSub}>Monitoring gerbang</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* KPI 4: Agenda & Kalender */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigation?.navigate('Kalender')}
          style={[styles.kpiCard, { borderColor: '#FED7AA' }]}
        >
          <LinearGradient
            colors={['#FFF7ED', '#FFEDD5']}
            style={styles.kpiGradient}
          >
            <View style={styles.kpiTopRow}>
              <View style={[styles.kpiIconWrap, { backgroundColor: '#EA580C' }]}>
                <MaterialCommunityIcons name="calendar-month" size={18} color="#FFFFFF" />
              </View>
              <Text style={[styles.kpiCount, { color: '#C2410C', fontSize: 16 }]}>
                {dashboard?.academic_year || dashboard?.active_year || new Date().getFullYear()}
              </Text>
            </View>
            <Text style={styles.kpiLabel}>Kalender Akademik</Text>
            <Text style={styles.kpiSub}>Tahun ajaran aktif</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* 3. Administrative Quick Controls */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleWithIcon}>
            <MaterialCommunityIcons name="folder-text-outline" size={20} color="#0D9488" style={{ marginRight: 6 }} />
            <Text style={styles.sectionTitleBold}>Layanan Administrasi</Text>
          </View>
        </View>

        <View style={styles.actionGrid}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => navigation?.navigate('Data')}
            style={styles.actionBtnTile}
          >
            <View style={[styles.actionIconBox, { backgroundColor: '#CCFBF1' }]}>
              <MaterialCommunityIcons name="database-outline" size={22} color="#0D9488" />
            </View>
            <Text style={styles.actionBtnLabel}>Data Master</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => navigation?.navigate('Absensi')}
            style={styles.actionBtnTile}
          >
            <View style={[styles.actionIconBox, { backgroundColor: '#DEF7EC' }]}>
              <MaterialCommunityIcons name="clipboard-text-outline" size={22} color="#059669" />
            </View>
            <Text style={styles.actionBtnLabel}>Rekap Kehadiran</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => navigation?.navigate('Informasi')}
            style={styles.actionBtnTile}
          >
            <View style={[styles.actionIconBox, { backgroundColor: '#E0F2FE' }]}>
              <MaterialCommunityIcons name="bullhorn-outline" size={22} color="#0284C7" />
            </View>
            <Text style={styles.actionBtnLabel}>Pengumuman</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => navigation?.navigate('Profil')}
            style={styles.actionBtnTile}
          >
            <View style={[styles.actionIconBox, { backgroundColor: '#F1F5F9' }]}>
              <MaterialCommunityIcons name="account-cog-outline" size={22} color="#475569" />
            </View>
            <Text style={styles.actionBtnLabel}>Profil Staf</Text>
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
    backgroundColor: '#CCFBF1',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  pulseDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0D9488',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  hubTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 18,
  },
  hubSubtitle: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  portalPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 12,
  },
  portalPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0D9488',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  kpiCard: {
    width: '48.5%',
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  kpiGradient: {
    padding: 12,
  },
  kpiTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  kpiIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  kpiCount: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
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
    borderRadius: 20,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
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
    color: '#0F172A',
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
  },
  actionBtnLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'center',
    lineHeight: 14,
  },
});

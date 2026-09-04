import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from 'react-native-paper';
import { SafeRemoteImage } from '../components/SafeRemoteImage';
import { useMobileConfigStore } from '../stores/mobileConfigStore';

export default function MaintenanceScreen() {
  const config = useMobileConfigStore((state) => state.config);
  const refresh = useMobileConfigStore((state) => state.refresh);
  const [checking, setChecking] = useState(false);

  const handleRetry = async () => {
    setChecking(true);
    try {
      await refresh();
    } finally {
      setChecking(false);
    }
  };

  const message =
    config.system?.maintenance_message ||
    'Sistem sedang dalam pemeliharaan rutin. Silakan coba beberapa saat lagi.';

  return (
    <View style={styles.container}>
      <SafeRemoteImage
        url={config.branding?.logo_login_url || config.branding?.logo_url}
        style={styles.logo}
        alt="Logo Sekolah"
      />

      <Text style={styles.badge}>PEMELIHARAAN SISTEM</Text>

      <Text style={styles.title}>{config.branding?.app_name || 'SIMSIT DAREL-IMAN'}</Text>
      <Text style={styles.schoolName}>{config.branding?.school_name || 'Yayasan Dar el-Iman'}</Text>

      <View style={styles.card}>
        <Text style={styles.message}>{message}</Text>
      </View>

      <Button
        mode="contained"
        buttonColor={config.theme?.primary_color || '#0E5C44'}
        textColor="#FFFFFF"
        loading={checking}
        disabled={checking}
        style={styles.button}
        onPress={handleRetry}
      >
        Periksa Status Kembali
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  logo: {
    width: 90,
    height: 90,
    marginBottom: 16,
  },
  badge: {
    backgroundColor: '#FEF3C7',
    color: '#92400E',
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  schoolName: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
    marginBottom: 24,
    width: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  message: {
    fontSize: 14,
    color: '#334155',
    textAlign: 'center',
    lineHeight: 22,
  },
  button: {
    borderRadius: 12,
    width: '100%',
    paddingVertical: 4,
  },
});

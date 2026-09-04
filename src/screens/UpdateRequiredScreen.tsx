import React, { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Button } from 'react-native-paper';
import { SafeRemoteImage } from '../components/SafeRemoteImage';
import { useMobileConfigStore } from '../stores/mobileConfigStore';
import { isSafeUpdateUrl } from '../utils/urlValidator';

type Props = {
  currentVersion: string;
};

export default function UpdateRequiredScreen({ currentVersion }: Props) {
  const config = useMobileConfigStore((state) => state.config);
  const refresh = useMobileConfigStore((state) => state.refresh);
  const [checking, setChecking] = useState(false);

  const updateUrl = config.system?.update_url;
  const minVersion = config.system?.min_app_version || '1.0.0';

  const handleOpenUpdate = async () => {
    if (!updateUrl || !isSafeUpdateUrl(updateUrl)) {
      return;
    }

    try {
      const supported = await Linking.canOpenURL(updateUrl);
      if (supported) {
        await Linking.openURL(updateUrl);
      }
    } catch {
      // Gracefully ignore link opening errors
    }
  };

  const handleRetry = async () => {
    setChecking(true);
    try {
      await refresh();
    } finally {
      setChecking(false);
    }
  };

  return (
    <View style={styles.container}>
      <SafeRemoteImage
        url={config.branding?.logo_login_url || config.branding?.logo_url}
        style={styles.logo}
        alt="Logo Sekolah"
      />

      <Text style={styles.badge}>PEMBARUAN WAJIB</Text>

      <Text style={styles.title}>Versi Aplikasi Perlu Diperbarui</Text>
      <Text style={styles.subtitle}>
        Untuk memastikan kelancaran dan keamanan sistem, silakan perbarui aplikasi SIMSIT ke versi terbaru.
      </Text>

      <View style={styles.versionCard}>
        <View style={styles.versionRow}>
          <Text style={styles.versionLabel}>Versi Saat Ini:</Text>
          <Text style={styles.versionValue}>v{currentVersion}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.versionRow}>
          <Text style={styles.versionLabel}>Versi Minimal:</Text>
          <Text style={[styles.versionValue, { color: '#0E5C44' }]}>v{minVersion}</Text>
        </View>
      </View>

      <View style={styles.buttonContainer}>
        {updateUrl && isSafeUpdateUrl(updateUrl) && (
          <Button
            mode="contained"
            buttonColor={config.theme?.primary_color || '#0E5C44'}
            textColor="#FFFFFF"
            style={styles.button}
            onPress={handleOpenUpdate}
          >
            Perbarui Sekarang di Play Store
          </Button>
        )}

        <Button
          mode="outlined"
          textColor={config.theme?.primary_color || '#0E5C44'}
          loading={checking}
          disabled={checking}
          style={[styles.button, { marginTop: 10 }]}
          onPress={handleRetry}
        >
          Periksa Kembali
        </Button>
      </View>
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
    backgroundColor: '#FEE2E2',
    color: '#991B1B',
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
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  versionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 24,
    width: '100%',
  },
  versionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  versionLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  versionValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E293B',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 8,
  },
  buttonContainer: {
    width: '100%',
  },
  button: {
    borderRadius: 12,
    paddingVertical: 4,
  },
});

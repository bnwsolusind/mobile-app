import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Surface, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMobileConfigStore } from '../stores/mobileConfigStore';

interface AccessDeniedScreenProps {
  title?: string;
  message?: string;
  onGoBack?: () => void;
}

export default function AccessDeniedScreen({
  title = 'Akses Tidak Diizinkan',
  message = 'Akun Anda tidak memiliki hak akses atau izin yang diperlukan untuk membuka layanan ini.',
  onGoBack,
}: AccessDeniedScreenProps) {
  const config = useMobileConfigStore((state) => state.config);
  const theme = config.theme;

  return (
    <View style={[styles.container, { backgroundColor: theme.background_color }]}>
      <Surface
        style={[
          styles.card,
          {
            backgroundColor: theme.surface_color,
            borderRadius: theme.card_radius || 20,
          },
        ]}
        elevation={2}
      >
        <View style={styles.iconWrapper}>
          <MaterialCommunityIcons name="shield-alert-outline" size={48} color="#DC2626" />
        </View>

        <Text style={[styles.title, { color: theme.text_color }]}>{title}</Text>

        <Text style={[styles.message, { color: theme.muted_text_color }]}>{message}</Text>

        <View style={styles.badge}>
          <MaterialCommunityIcons name="lock-outline" size={14} color="#B91C1C" />
          <Text style={styles.badgeText}>Sistem Keamanan Terpadu SIMSIT</Text>
        </View>

        {onGoBack ? (
          <Button
            mode="contained"
            onPress={onGoBack}
            style={[styles.button, { backgroundColor: theme.primary_color, borderRadius: theme.button_radius || 12 }]}
            labelStyle={styles.buttonLabel}
            icon="arrow-left"
          >
            Kembali ke Beranda
          </Button>
        ) : null}
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    shadowColor: '#DC2626',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  iconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 18,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF1F2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 20,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#991B1B',
  },
  button: {
    width: '100%',
    marginTop: 4,
  },
  buttonLabel: {
    fontSize: 14,
    fontWeight: '700',
    paddingVertical: 4,
  },
});

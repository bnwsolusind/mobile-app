import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNetworkStore } from '../stores/networkStore';

export default function NetworkStatusBar() {
  const insets = useSafeAreaInsets();
  const isOnline = useNetworkStore((state) => state.isOnline);
  const wasOffline = useNetworkStore((state) => state.wasOffline);
  const checkConnectivity = useNetworkStore((state) => state.checkConnectivity);
  const startMonitoring = useNetworkStore((state) => state.startMonitoring);

  const [visible, setVisible] = useState(false);
  const translateY = useRef(new Animated.Value(-120)).current;
  const hideTimerRef = useRef<any>(null);

  // Start background monitoring when component mounts
  useEffect(() => {
    const stop = startMonitoring();
    return () => {
      stop();
    };
  }, [startMonitoring]);

  useEffect(() => {
    if (!isOnline) {
      // Masuk ke Mode Offline: Tampilkan banner MERAH
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      setVisible(true);
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 6,
      }).start();
    } else if (wasOffline) {
      // Kembali Online setelah sebelumnya Offline: Tampilkan banner HIJAU
      setVisible(true);
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 6,
      }).start();

      // Sembunyikan banner hijau otomatis setelah 3.5 detik
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        Animated.timing(translateY, {
          toValue: -120,
          duration: 350,
          useNativeDriver: true,
        }).start(() => {
          setVisible(false);
        });
      }, 3500);
    } else {
      // Normal online saat app pertama kali buka
      Animated.timing(translateY, {
        toValue: -120,
        duration: 250,
        useNativeDriver: true,
      }).start(() => {
        setVisible(false);
      });
    }

    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [isOnline, wasOffline, translateY]);

  if (!visible) return null;

  const isRed = !isOnline;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          paddingTop: Math.max(insets.top, 8) + 4,
          backgroundColor: isRed ? '#DC2626' : '#16A34A',
          transform: [{ translateY }],
        },
      ]}
    >
      <View style={styles.contentRow}>
        <View style={styles.iconCircle}>
          <MaterialCommunityIcons
            name={isRed ? 'wifi-off' : 'wifi-check'}
            size={18}
            color={isRed ? '#DC2626' : '#16A34A'}
          />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.title}>
            {isRed ? 'Mode Offline' : 'Jaringan Online'}
          </Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {isRed
              ? 'Koneksi terputus. Menampilkan data lokal (cache).'
              : 'Terhubung kembali ke server. Data tersinkronisasi.'}
          </Text>
        </View>
        {isRed && (
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.retryButton}
            onPress={() => void checkConnectivity()}
          >
            <MaterialCommunityIcons name="refresh" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999999,
    paddingHorizontal: 16,
    paddingBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 10,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 11,
    marginTop: 1,
  },
  retryButton: {
    padding: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
});

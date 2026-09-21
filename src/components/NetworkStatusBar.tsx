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
  const translateY = useRef(new Animated.Value(-60)).current;
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
      // Masuk ke Mode Offline: Tampilkan badge kecil MERAH
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      setVisible(true);
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 4,
      }).start();
    } else if (wasOffline) {
      // Kembali Online setelah sebelumnya Offline: Tampilkan badge kecil HIJAU
      setVisible(true);
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 4,
      }).start();

      // Sembunyikan badge hijau otomatis setelah 2.5 detik
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        Animated.timing(translateY, {
          toValue: -60,
          duration: 250,
          useNativeDriver: true,
        }).start(() => {
          setVisible(false);
        });
      }, 2500);
    } else {
      // Normal online saat app pertama kali buka
      Animated.timing(translateY, {
        toValue: -60,
        duration: 200,
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
    <View style={styles.floatingWrapper} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.compactPill,
          {
            top: Math.max(insets.top, 6) + 4,
            backgroundColor: isRed ? '#DC2626' : '#059669',
            transform: [{ translateY }],
          },
        ]}
      >
        <MaterialCommunityIcons
          name={isRed ? 'wifi-off' : 'wifi-check'}
          size={13}
          color="#FFFFFF"
        />
        <Text numberOfLines={1} style={styles.pillText}>
          {isRed ? 'Mode Offline' : 'Online'}
        </Text>
        {isRed && (
          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.retryBtn}
            onPress={() => void checkConnectivity()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialCommunityIcons name="refresh" size={12} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  floatingWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999999,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  compactPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 3.5,
    paddingHorizontal: 10,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 5,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  pillText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  retryBtn: {
    padding: 2,
    marginLeft: 1,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
});

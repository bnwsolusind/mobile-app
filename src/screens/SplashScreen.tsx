import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMobileConfigStore } from '../stores/mobileConfigStore';

const PARENT_HOME_BG = require('../../assets/parent_home_bg.jpg');

interface SplashScreenProps {
  onFinish?: () => void;
  duration?: number;
}

export default function SplashScreen({ onFinish, duration = 1600 }: SplashScreenProps) {
  const insets = useSafeAreaInsets();
  const config = useMobileConfigStore((state) => state.config);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const subContentAnim = useRef(new Animated.Value(0)).current;
  const [progressPercent, setProgressPercent] = useState(0);
  const didFinishRef = useRef(false);

  const triggerFinish = useCallback(() => {
    if (!didFinishRef.current) {
      didFinishRef.current = true;
      progressAnim.stopAnimation();
      setProgressPercent(100);
      if (onFinish) onFinish();
    }
  }, [onFinish, progressAnim]);

  useEffect(() => {
    // Smooth fade-in for subtitles and progress bar while logo remains stable
    Animated.timing(subContentAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();

    // Track percentage in real-time
    const listenerId = progressAnim.addListener(({ value }) => {
      setProgressPercent(Math.round(value * 100));
    });

    // Progress bar animation
    Animated.timing(progressAnim, {
      toValue: 1,
      duration,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      useNativeDriver: false,
    }).start(() => {
      triggerFinish();
    });

    // Unconditional safety timer to guarantee transition (never hangs)
    const safetyTimer = setTimeout(() => {
      triggerFinish();
    }, duration + 100);

    return () => {
      progressAnim.removeListener(listenerId);
      clearTimeout(safetyTimer);
    };
  }, [duration, triggerFinish, progressAnim, subContentAnim]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Pressable
      style={styles.container}
      onPress={triggerFinish}
      accessibilityRole="button"
      accessibilityLabel="Lanjutkan ke aplikasi"
    >
      {/* Background Image Ilustrasi Gedung Sekolah & Masjid (Identik dengan Halaman Utama) */}
      <Image
        source={PARENT_HOME_BG}
        style={[StyleSheet.absoluteFill, styles.bgImage]}
        resizeMode="cover"
      />
      {/* Overlay gradien halus berbasis warna #18A165 agar background tetap kelihatan */}
      <LinearGradient
        colors={['rgba(24, 161, 101, 0.35)', 'rgba(24, 161, 101, 0.72)', 'rgba(18, 128, 80, 0.94)']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Center Branding Content */}
      <View style={styles.content}>
        {/* White Rounded Card with Yayasan Dar el-Iman Logo (Matching native splash icon) */}
        <View style={styles.logoCardOuter}>
          <Image
            source={require('../../assets/launcher_source.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>

        {/* Title, Organization Name & Tagline fade in smoothly */}
        <Animated.View style={[styles.subTextContainer, { opacity: subContentAnim }]}>
          <Text style={styles.appNameText}>SIMSIT</Text>
          <Text style={styles.subTitleText}>Sistem Manajemen Sekolah Terpadu</Text>
          <Text style={styles.orgNameText}>{config?.branding?.school_name || config?.branding?.app_name || ''}</Text>

          {/* Value Tagline Pill Badge */}
          <View style={styles.taglineBadge}>
            <MaterialCommunityIcons
              name="creation"
              size={16}
              color="#FFFFFF"
              style={styles.taglineBadgeIcon}
            />
            <Text style={styles.taglineBadgeText}>
              Islami · Pendidikan · Berkarakter
            </Text>
          </View>
        </Animated.View>
      </View>

      {/* Bottom Loading Progress Section (Active only in In-App Splash) */}
      <Animated.View
        style={[
          styles.bottomSection,
          {
            paddingBottom: Math.max(insets.bottom, 24),
            opacity: subContentAnim,
          },
        ]}
      >
        <View style={styles.progressHeaderRow}>
          <Text style={styles.loadingStatusText}>Memuat aplikasi...</Text>
          <Text style={styles.percentText}>{progressPercent}%</Text>
        </View>

        {/* Progress Bar Track & Fill */}
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>

        {/* Tombol Lanjut ke Aplikasi Berwarna #18A165 */}
        <TouchableOpacity
          onPress={triggerFinish}
          activeOpacity={0.85}
          style={styles.splashActionButton}
        >
          <Text style={styles.splashActionButtonText}>Lanjut ke Aplikasi</Text>
          <MaterialCommunityIcons name="arrow-right" size={18} color="#FFFFFF" />
        </TouchableOpacity>

        {/* App Version Info */}
        <Text style={styles.versionText}>Versi 1.0.0</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#18A165',
  },
  bgImage: {
    width: '100%',
    height: '100%',
    opacity: 0.88,
  },
  // Decorative ambient circles
  topRightDecorCircle: {
    position: 'absolute',
    top: 50,
    right: -80,
    width: 330,
    height: 330,
    borderRadius: 165,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    pointerEvents: 'none',
  },
  bottomLeftDecorCircle: {
    position: 'absolute',
    bottom: 150,
    left: -90,
    width: 270,
    height: 270,
    borderRadius: 135,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    pointerEvents: 'none',
  },
  midRightDecorDot: {
    position: 'absolute',
    top: '64%',
    right: 42,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    pointerEvents: 'none',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 24,
    marginTop: -30,
  },
  subTextContainer: {
    alignItems: 'center',
    width: '100%',
  },
  logoCardOuter: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 8,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    overflow: 'hidden',
  },
  logoImage: {
    width: 156,
    height: 156,
    borderRadius: 78,
  },
  appNameText: {
    fontSize: 34,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.5,
    marginTop: 26,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  subTitleText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.98)',
    marginTop: 8,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  orgNameText: {
    fontSize: 14.5,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.92)',
    marginTop: 4,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  taglineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(24, 161, 101, 0.70)',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.50)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  taglineBadgeIcon: {
    marginRight: 8,
  },
  taglineBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  // Bottom Section with Progress Bar & Action Button
  bottomSection: {
    position: 'absolute',
    bottom: 24,
    left: 28,
    right: 28,
  },
  progressHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  loadingStatusText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.92)',
  },
  percentText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  progressTrack: {
    width: '100%',
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.26)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  splashActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#18A165',
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    marginTop: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  splashActionButtonText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
    marginRight: 6,
    letterSpacing: 0.3,
  },
  versionText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
    marginTop: 16,
  },
});

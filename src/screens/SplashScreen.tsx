import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface SplashScreenProps {
  onFinish?: () => void;
  duration?: number;
}

export default function SplashScreen({ onFinish, duration = 2400 }: SplashScreenProps) {
  const insets = useSafeAreaInsets();
  const progressAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.94)).current;
  const [progressPercent, setProgressPercent] = useState(0);

  useEffect(() => {
    // Entrance animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    // Track percentage in real-time
    const listenerId = progressAnim.addListener(({ value }) => {
      setProgressPercent(Math.round(value * 100));
    });

    // Progress bar animation
    let didFinish = false;
    const triggerFinish = () => {
      if (!didFinish) {
        didFinish = true;
        if (onFinish) onFinish();
      }
    };

    Animated.timing(progressAnim, {
      toValue: 1,
      duration,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      useNativeDriver: false,
    }).start(() => {
      triggerFinish();
    });

    // Unconditional safety timer to guarantee transition
    const safetyTimer = setTimeout(() => {
      triggerFinish();
    }, duration + 150);

    return () => {
      progressAnim.removeListener(listenerId);
      clearTimeout(safetyTimer);
    };
  }, [duration, onFinish, progressAnim]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <LinearGradient
      colors={['#10A368', '#0B8A4D', '#087340']}
      style={styles.container}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      {/* Soft Decorative Ambient Circles (Exact match to reference design) */}
      <View style={styles.topRightDecorCircle} pointerEvents="none" />
      <View style={styles.bottomLeftDecorCircle} pointerEvents="none" />
      <View style={styles.midRightDecorDot} pointerEvents="none" />

      {/* Center Branding Content */}
      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {/* White Rounded Card with Yayasan Dar el-Iman Logo */}
        <View style={styles.logoCardOuter}>
          <Image
            source={require('../../assets/launcher_source.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>

        {/* Title & Organization Name */}
        <Text style={styles.appNameText}>SIMSIT</Text>
        <Text style={styles.subTitleText}>Sistem Manajemen Sekolah Terpadu</Text>
        <Text style={styles.orgNameText}>Yayasan Dar el-Iman</Text>

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

      {/* Bottom Loading Progress Section */}
      <View
        style={[
          styles.bottomSection,
          { paddingBottom: Math.max(insets.bottom, 24) },
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

        {/* App Version Info */}
        <Text style={styles.versionText}>Versi 1.0.0</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
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
  },
  bottomLeftDecorCircle: {
    position: 'absolute',
    bottom: 150,
    left: -90,
    width: 270,
    height: 270,
    borderRadius: 135,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
  },
  midRightDecorDot: {
    position: 'absolute',
    top: '64%',
    right: 42,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 24,
    marginTop: -30,
  },
  logoCardOuter: {
    width: 176,
    height: 176,
    borderRadius: 48,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  logoImage: {
    width: 148,
    height: 148,
  },
  appNameText: {
    fontSize: 34,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.5,
    marginTop: 26,
    textAlign: 'center',
  },
  subTitleText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.95)',
    marginTop: 8,
    textAlign: 'center',
  },
  orgNameText: {
    fontSize: 14.5,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.88)',
    marginTop: 4,
    textAlign: 'center',
  },
  taglineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
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
  // Bottom Progress Section
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
  versionText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.75)',
    textAlign: 'center',
    marginTop: 28,
  },
});

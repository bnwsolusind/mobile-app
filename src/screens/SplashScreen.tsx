import React, { useEffect, useRef } from 'react';
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
import { SafeRemoteImage } from '../components/SafeRemoteImage';
import { useMobileConfigStore } from '../stores/mobileConfigStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface SplashScreenProps {
  onFinish?: () => void;
  duration?: number;
}

export default function SplashScreen({ onFinish, duration = 2200 }: SplashScreenProps) {
  const config = useMobileConfigStore((state) => state.config);
  const branding = config.branding || {};
  const logoUrl = branding.logo_url || branding.logo_login_url;

  const progressAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;

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
        friction: 7,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

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
    }, duration + 100);

    return () => {
      clearTimeout(safetyTimer);
    };
  }, [duration, onFinish]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const appName = branding.app_name || 'SDIT 2';
  const schoolName = branding.school_name || 'DAR EL-IMAN';
  const tagline = (branding as any).tagline || 'Unggul dalam Iman,\nIlmu dan Akhlak';

  return (
    <LinearGradient
      colors={['#08382A', '#05291E', '#021610']}
      style={styles.container}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      {/* Background Islamic Ambient Glow */}
      <View style={styles.topAmbientGlow} />
      <View style={styles.centerAmbientGlow} />

      {/* Mosque Silhouette at bottom */}
      <View style={styles.mosqueContainer} pointerEvents="none">
        {/* Ambient warm light behind mosque */}
        <View style={styles.mosqueGoldenGlow} />
        
        {/* Architectural minarets & domes silhouette */}
        <View style={styles.mosqueSilhouetteRow}>
          {/* Left minaret */}
          <View style={[styles.minaretCol, { left: 24 }]}>
            <View style={styles.crescentSmall} />
            <View style={styles.minaretSpire} />
            <View style={styles.minaretBalcony} />
            <View style={styles.minaretPillar} />
          </View>

          {/* Left small dome */}
          <View style={[styles.smallDome, { left: 74 }]} />

          {/* Center grand dome with crescent */}
          <View style={styles.grandDomeWrapper}>
            <MaterialCommunityIcons
              name="moon-waning-crescent"
              size={18}
              color="rgba(229, 192, 123, 0.85)"
              style={styles.grandCrescent}
            />
            <View style={styles.grandDomeSpire} />
            <View style={styles.grandDome} />
            <View style={styles.grandDomeBase} />
          </View>

          {/* Right small dome */}
          <View style={[styles.smallDome, { right: 74 }]} />

          {/* Right minaret */}
          <View style={[styles.minaretCol, { right: 24 }]}>
            <View style={styles.crescentSmall} />
            <View style={styles.minaretSpire} />
            <View style={styles.minaretBalcony} />
            <View style={styles.minaretPillar} />
          </View>
        </View>

        {/* Base foundation line */}
        <View style={styles.mosqueBaseLine} />
      </View>

      {/* Main Content */}
      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {/* Circular Logo with golden halo */}
        <View style={styles.logoHalo}>
          <View style={styles.logoRingGold}>
            <View style={styles.logoCircleInner}>
              {logoUrl ? (
                <SafeRemoteImage
                  url={logoUrl}
                  style={styles.logoImage}
                  resizeMode="contain"
                  alt={appName}
                />
              ) : (
                <Image
                  source={require('../../assets/logo.png')}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
              )}
            </View>
          </View>
        </View>

        {/* Title */}
        <Text style={styles.appNameText}>{appName}</Text>
        <Text style={styles.schoolNameText}>{schoolName}</Text>

        {/* Tagline */}
        <Text style={styles.taglineText}>{tagline}</Text>
      </Animated.View>

      {/* Bottom Loading Indicator */}
      <View style={styles.bottomLoaderSection}>
        <Text style={styles.loadingText}>Memuat aplikasi...</Text>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topAmbientGlow: {
    position: 'absolute',
    top: -60,
    width: SCREEN_WIDTH * 0.9,
    height: SCREEN_WIDTH * 0.9,
    borderRadius: SCREEN_WIDTH * 0.45,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  centerAmbientGlow: {
    position: 'absolute',
    top: '32%',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(212, 175, 55, 0.06)',
  },
  mosqueContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 240,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  mosqueGoldenGlow: {
    position: 'absolute',
    bottom: 30,
    width: SCREEN_WIDTH * 0.85,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
    opacity: 0.8,
  },
  mosqueSilhouetteRow: {
    width: '100%',
    height: 140,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  minaretCol: {
    position: 'absolute',
    bottom: 20,
    alignItems: 'center',
  },
  crescentSmall: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(229, 192, 123, 0.8)',
    marginBottom: 2,
  },
  minaretSpire: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 20,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#031710',
  },
  minaretBalcony: {
    width: 18,
    height: 6,
    backgroundColor: '#031710',
    borderRadius: 2,
    marginTop: -1,
  },
  minaretPillar: {
    width: 12,
    height: 70,
    backgroundColor: '#031710',
  },
  smallDome: {
    position: 'absolute',
    bottom: 20,
    width: 44,
    height: 44,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: '#031710',
  },
  grandDomeWrapper: {
    position: 'absolute',
    bottom: 20,
    alignItems: 'center',
  },
  grandCrescent: {
    marginBottom: -2,
  },
  grandDomeSpire: {
    width: 3,
    height: 12,
    backgroundColor: 'rgba(229, 192, 123, 0.8)',
  },
  grandDome: {
    width: 96,
    height: 64,
    borderTopLeftRadius: 48,
    borderTopRightRadius: 48,
    backgroundColor: '#031710',
  },
  grandDomeBase: {
    width: 104,
    height: 18,
    backgroundColor: '#031710',
  },
  mosqueBaseLine: {
    width: '100%',
    height: 30,
    backgroundColor: '#031710',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    zIndex: 10,
    marginTop: -40,
  },
  logoHalo: {
    width: 146,
    height: 146,
    borderRadius: 73,
    backgroundColor: 'rgba(13, 72, 55, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
    shadowColor: '#10B981',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  logoRingGold: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 2.5,
    borderColor: '#E5C07B',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#073325',
  },
  logoCircleInner: {
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    padding: 10,
  },
  logoImage: {
    width: 96,
    height: 96,
  },
  appNameText: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
    marginTop: 24,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  schoolNameText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 2.5,
    marginTop: 2,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  taglineText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#9FE1CE',
    lineHeight: 22,
    marginTop: 14,
    textAlign: 'center',
    maxWidth: 260,
  },
  bottomLoaderSection: {
    position: 'absolute',
    bottom: 50,
    alignItems: 'center',
    zIndex: 20,
  },
  loadingText: {
    fontSize: 12,
    color: '#D1EAE2',
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  progressTrack: {
    width: 150,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#F59E0B',
  },
});

import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Image,
  TouchableOpacity,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMobileConfigStore, OnboardingSlide } from '../stores/mobileConfigStore';
import { SafeRemoteImage } from '../components/SafeRemoteImage';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const PARENT_HOME_BG = require('../../assets/parent_home_bg.jpg');
const FALLBACK_SLIDE_1 = require('../../assets/school_illustration.jpg');
const FALLBACK_SLIDE_2 = require('../../assets/family_illustration.png');
const FALLBACK_SLIDE_3 = require('../../assets/supervisi_guru.jpg');

const FALLBACK_IMAGES = [FALLBACK_SLIDE_1, FALLBACK_SLIDE_2, FALLBACK_SLIDE_3];

export const ONBOARDING_STORAGE_KEY = '@simsit_onboarding_completed';

type Props = {
  onFinish: () => void;
};

export default function OnboardingScreen({ onFinish }: Props) {
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const config = useMobileConfigStore((state) => state.config);
  const branding = config?.branding;
  const onboardingConfig = config?.onboarding;

  const slides: OnboardingSlide[] =
    onboardingConfig?.slides && onboardingConfig.slides.length > 0
      ? onboardingConfig.slides
      : [
          {
            id: 1,
            title: 'Sistem Sekolah Terpadu',
            description:
              'Akses seluruh informasi akademik, jadwal pelajaran, dan kegiatan harian siswa dalam satu aplikasi terintegrasi.',
            image_url: null,
          },
          {
            id: 2,
            title: "Mutaba'ah & Tahfizh Mandiri",
            description:
              "Pantau setoran hafalan Al-Qur'an dan amalan yaumiyyah ananda secara berkala dan real-time bersama ustadz/ustadzah.",
            image_url: null,
          },
          {
            id: 3,
            title: 'Presensi & Layanan Digital',
            description:
              'Dapatkan notifikasi kedatangan gerbang sekolah, perizinan asrama, dan komunikasi cepat dengan pihak sekolah.',
            image_url: null,
          },
        ];

  const handleComplete = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    } catch {
      // Ignored: AsyncStorage failure shouldn't block navigation
    }
    onFinish();
  };

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({
        index: currentIndex + 1,
        animated: true,
      });
      setCurrentIndex(currentIndex + 1);
    } else {
      void handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      flatListRef.current?.scrollToIndex({
        index: currentIndex - 1,
        animated: true,
      });
      setCurrentIndex(currentIndex - 1);
    }
  };

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / SCREEN_WIDTH);
    if (index >= 0 && index < slides.length) {
      setCurrentIndex(index);
    }
  };

  const isLastSlide = currentIndex === slides.length - 1;

  const renderSlideItem = ({ item, index }: { item: OnboardingSlide; index: number }) => {
    const fallbackImage = FALLBACK_IMAGES[index % FALLBACK_IMAGES.length];

    return (
      <View style={styles.slideContainer}>
        {/* Visual Illustration Card Container */}
        <View style={styles.illustrationCard}>
          {item.image_url ? (
            <SafeRemoteImage
              url={item.image_url}
              fallbackSource={fallbackImage}
              style={styles.slideImage}
              resizeMode="cover"
              alt={item.title}
              showLoadingIndicator={true}
            />
          ) : (
            <Image
              source={fallbackImage}
              style={styles.slideImage}
              resizeMode="cover"
            />
          )}

          {/* Subtle Islamic Geometry / Badge Accent */}
          <View style={styles.cardTagBadge}>
            <MaterialCommunityIcons name="star-four-points" size={13} color="#18A165" />
            <Text style={styles.cardTagText}>Fitur Unggulan {index + 1}</Text>
          </View>
        </View>

        {/* Text Details Area */}
        <View style={styles.textDetailsArea}>
          <View style={styles.stepPill}>
            <Text style={styles.stepPillText}>
              LANGKAH {index + 1} DARI {slides.length}
            </Text>
          </View>

          <Text style={styles.slideTitle}>{item.title}</Text>
          <Text style={styles.slideDescription}>{item.description || (item as any).desc || ''}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      {/* Background Image: Ilustrasi Gedung Sekolah & Kubah Masjid */}
      <Image
        source={PARENT_HOME_BG}
        style={[StyleSheet.absoluteFill, styles.bgImage]}
        resizeMode="cover"
      />

      {/* Overlay Warna #18A165 dengan gradien transparan agar background nampak jelas */}
      <LinearGradient
        colors={[
          'rgba(24, 161, 101, 0.35)',
          'rgba(24, 161, 101, 0.72)',
          'rgba(16, 120, 75, 0.94)',
        ]}
        locations={[0, 0.45, 1.0]}
        style={StyleSheet.absoluteFill}
      />

      {/* Header Bar */}
      <View style={[styles.headerBar, { paddingTop: Math.max(insets.top, 16) }]}>
        <View style={styles.headerBrandBadge}>
          <Image
            source={require('../../assets/launcher_source.png')}
            style={styles.headerBrandLogo}
            resizeMode="contain"
          />
          <View>
            <Text style={styles.headerBrandTitle}>
              {branding?.app_name || 'SIMSIT Terpadu'}
            </Text>
            <Text style={styles.headerBrandSubtitle}>
              {branding?.school_name || 'Yayasan Dar el-Iman'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => void handleComplete()}
          activeOpacity={0.8}
          style={styles.skipButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.skipButtonText}>LEWATI</Text>
          <MaterialCommunityIcons name="chevron-double-right" size={15} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* 3-Slide Carousel FlatList */}
      <FlatList
        ref={flatListRef}
        data={slides}
        keyExtractor={(item, index) => `slide-${item.id || index}`}
        renderItem={renderSlideItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        contentContainerStyle={styles.flatListContent}
        style={styles.flatList}
      />

      {/* Bottom Navigation & Pagination Bar */}
      <View style={[styles.bottomControlBar, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        {/* Pagination Dots Indicator */}
        <View style={styles.paginationRow}>
          {slides.map((_, i) => {
            const isActive = i === currentIndex;
            return (
              <View
                key={`dot-${i}`}
                style={[
                  styles.paginationDot,
                  isActive ? styles.paginationDotActive : styles.paginationDotInactive,
                ]}
              />
            );
          })}
        </View>

        {/* Action Controls */}
        <View style={styles.actionButtonContainer}>
          {!isLastSlide ? (
            <View style={styles.navRow}>
              {currentIndex > 0 ? (
                <TouchableOpacity
                  onPress={handlePrev}
                  activeOpacity={0.8}
                  style={styles.prevButton}
                >
                  <MaterialCommunityIcons name="arrow-left" size={20} color="#FFFFFF" />
                  <Text style={styles.prevButtonText}>Kembali</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ flex: 1 }} />
              )}

              <TouchableOpacity
                onPress={handleNext}
                activeOpacity={0.88}
                style={styles.nextButton}
              >
                <Text style={styles.nextButtonText}>Lanjut</Text>
                <MaterialCommunityIcons name="arrow-right" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => void handleComplete()}
              activeOpacity={0.9}
              style={styles.startNowButton}
            >
              <LinearGradient
                colors={['#18A165', '#128050']}
                style={styles.startNowGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={styles.startNowIconBadge}>
                  <MaterialCommunityIcons name="rocket-launch" size={20} color="#FFFFFF" />
                </View>
                <Text style={styles.startNowText}>Mulai Gunakan Aplikasi</Text>
                <MaterialCommunityIcons name="arrow-right" size={22} color="#FFFFFF" />
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#18A165',
  },
  bgImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    opacity: 0.90,
  },
  headerBar: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  headerBrandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  headerBrandLogo: {
    width: 24,
    height: 24,
    borderRadius: 6,
  },
  headerBrandTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerBrandSubtitle: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 10,
    fontWeight: '500',
  },
  skipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  skipButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  flatList: {
    flex: 1,
  },
  flatListContent: {
    alignItems: 'center',
  },
  slideContainer: {
    width: SCREEN_WIDTH,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  illustrationCard: {
    width: SCREEN_WIDTH - 48,
    height: SCREEN_HEIGHT * 0.38,
    maxHeight: 320,
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.45)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 8,
    position: 'relative',
  },
  slideImage: {
    width: '100%',
    height: '100%',
  },
  cardTagBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTagText: {
    color: '#0B4D30',
    fontSize: 11,
    fontWeight: '700',
  },
  textDetailsArea: {
    width: '100%',
    marginTop: 24,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  stepPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    marginBottom: 10,
  },
  stepPillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  slideTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 28,
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  slideDescription: {
    color: 'rgba(255, 255, 255, 0.92)',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    fontWeight: '400',
    paddingHorizontal: 8,
  },
  bottomControlBar: {
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  paginationRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  paginationDot: {
    height: 8,
    borderRadius: 4,
  },
  paginationDotActive: {
    width: 28,
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 4,
  },
  paginationDotInactive: {
    width: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  actionButtonContainer: {
    width: '100%',
    minHeight: 52,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  prevButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  prevButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  nextButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#18A165',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  startNowButton: {
    width: '100%',
    height: 54,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  startNowGradient: {
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
  },
  startNowIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  startNowText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});

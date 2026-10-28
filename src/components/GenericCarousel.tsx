import React, { useRef, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export interface GenericCarouselProps<T> {
  data: T[];
  activeIndex: number;
  onSelectIndex: (index: number, isDirectTap?: boolean) => void;
  renderItem: (item: T, index: number, isSelected: boolean, cardWidth: number) => React.ReactNode;
  keyExtractor?: (item: T, index: number) => string;
  itemGap?: number;
  peekWidth?: number;
  // Header & Switcher Chips
  showHeader?: boolean;
  headerTitle?: string;
  headerIcon?: string;
  showChips?: boolean;
  chipLabelExtractor?: (item: T, index: number) => string;
  showCounterBadge?: boolean;
  counterLabel?: (current: number, total: number) => string;
  showDots?: boolean;
  // Scroll control refs
  isProgrammaticScrollRef?: React.MutableRefObject<boolean>;
  lastDirectTapTimeRef?: React.MutableRefObject<number>;
  isUserDraggingRef?: React.MutableRefObject<boolean>;
  visualDotIndex?: number | null;
  setVisualDotIndex?: (idx: number | null) => void;
  containerStyle?: any;
}

export function GenericCarousel<T>({
  data,
  activeIndex,
  onSelectIndex,
  renderItem,
  keyExtractor = (_, idx) => String(idx),
  itemGap = 12,
  peekWidth = 18,
  showHeader = true,
  headerTitle = 'Data Ananda',
  headerIcon = 'account-child-circle',
  showChips = true,
  chipLabelExtractor,
  showCounterBadge = true,
  counterLabel,
  showDots = true,
  isProgrammaticScrollRef,
  lastDirectTapTimeRef,
  isUserDraggingRef,
  visualDotIndex,
  setVisualDotIndex,
  containerStyle,
}: GenericCarouselProps<T>) {
  const scrollRef = useRef<ScrollView>(null);
  const internalIsUserDraggingRef = useRef<boolean>(false);
  const internalLastTapRef = useRef<number>(0);
  const internalProgrammaticRef = useRef<boolean>(false);

  const activeDraggingRef = isUserDraggingRef || internalIsUserDraggingRef;
  const activeLastTapRef = lastDirectTapTimeRef || internalLastTapRef;
  const activeProgrammaticRef = isProgrammaticScrollRef || internalProgrammaticRef;
  const currentPhysicalIndexRef = useRef<number>(activeIndex);

  const cardWidth = useMemo(() => {
    return data.length > 1
      ? SCREEN_WIDTH - 48
      : SCREEN_WIDTH - 32;
  }, [data.length]);

  const snapInterval = useMemo(() => cardWidth + itemGap, [cardWidth, itemGap]);

  const trackPadding = useMemo(() => {
    return Math.max(16, (SCREEN_WIDTH - cardWidth) / 2);
  }, [cardWidth]);

  const scrollToChildIndex = useCallback(
    (targetIdx: number, animated = true) => {
      if (data.length <= 1) return;
      const clamped = Math.max(0, Math.min(data.length - 1, targetIdx));
      currentPhysicalIndexRef.current = clamped;
      scrollRef.current?.scrollTo({
        x: clamped * snapInterval,
        animated,
      });
    },
    [data.length, snapInterval]
  );

  // Auto scroll saat activeIndex berganti dari luar (misal dari chips, selector, atau parent state)
  useEffect(() => {
    if (activeDraggingRef.current) return;
    // Jika scroll fisik sudah berada di index target (karena hasil gesture geser), jangan panggil scrollTo ulang
    if (currentPhysicalIndexRef.current === activeIndex) return;

    currentPhysicalIndexRef.current = activeIndex;
    scrollToChildIndex(activeIndex, true);
  }, [activeIndex, scrollToChildIndex, activeDraggingRef]);

  const handleSelect = (idx: number, isDirectTap = true) => {
    if (isDirectTap) {
      activeLastTapRef.current = Date.now();
      activeProgrammaticRef.current = true;
      setTimeout(() => {
        activeProgrammaticRef.current = false;
      }, 650);
    }
    currentPhysicalIndexRef.current = idx;
    onSelectIndex(idx, isDirectTap);
    scrollToChildIndex(idx, true);
  };

  if (!data || data.length === 0) {
    return null;
  }

  // Jika hanya ada 1 anak, render langsung tanpa scroll track horizontal
  if (data.length === 1) {
    return (
      <View style={[styles.wrapper, containerStyle]}>
        <View style={styles.singleItemContainer}>
          {renderItem(data[0], 0, true, SCREEN_WIDTH - 32)}
        </View>
      </View>
    );
  }

  const safeCurrent = Math.max(0, Math.min(data.length - 1, activeIndex));
  const currentCounterText = counterLabel
    ? counterLabel(safeCurrent + 1, data.length)
    : `${safeCurrent + 1} dari ${data.length} Ananda`;

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {/* Header bar: Icon + Title + Count Badge */}
      {showHeader && (
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <View style={styles.iconCircle}>
              <MaterialCommunityIcons name={headerIcon as any} size={15} color="#047857" />
            </View>
            <Text style={styles.headerTitle}>{headerTitle}</Text>
          </View>
          {showCounterBadge && (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{currentCounterText}</Text>
            </View>
          )}
        </View>
      )}

      {/* Switcher Chips Horizontal */}
      {showChips && (
        <View style={styles.chipsContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsScroll}
          >
            {data.map((item, idx) => {
              const isSelected = idx === safeCurrent;
              const rawLabel = chipLabelExtractor
                ? chipLabelExtractor(item, idx)
                : (item as any)?.name || (item as any)?.nama || `Ananda ${idx + 1}`;
              const chipLabel =
                rawLabel.length > 14 ? `${rawLabel.substring(0, 12)}..` : rawLabel;

              return (
                <TouchableOpacity
                  key={`carousel-chip-${keyExtractor(item, idx)}`}
                  activeOpacity={0.8}
                  onPress={() => handleSelect(idx, true)}
                  style={[
                    styles.chip,
                    isSelected && styles.chipActive,
                  ]}
                >
                  <MaterialCommunityIcons
                    name={isSelected ? 'check-circle' : 'circle-outline'}
                    size={13}
                    color={isSelected ? '#FFFFFF' : '#047857'}
                    style={{ marginRight: 5 }}
                  />
                  <Text
                    style={[
                      styles.chipText,
                      isSelected && styles.chipTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {chipLabel}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Track Carousel Kartu */}
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.track,
          { paddingHorizontal: trackPadding },
        ]}
        decelerationRate="fast"
        snapToInterval={snapInterval}
        snapToAlignment="start"
        disableIntervalMomentum={true}
        onScrollBeginDrag={() => {
          activeDraggingRef.current = true;
        }}
        onScroll={(e) => {
          if (activeProgrammaticRef.current) return;
          const offsetX = Math.max(0, e.nativeEvent.contentOffset.x);
          const index = Math.round(offsetX / snapInterval);
          const clamped = Math.max(0, Math.min(data.length - 1, index));
          if (setVisualDotIndex && visualDotIndex !== clamped) {
            setVisualDotIndex(clamped);
          }
        }}
        onScrollEndDrag={() => {
          // Jari diangkat; scroll momentum masih meluncur menuju snap position di tengah.
          // Jangan panggil onSelectIndex prematur di sini agar tidak memotong animasi geser.
        }}
        onMomentumScrollEnd={(e) => {
          activeDraggingRef.current = false;
          if (setVisualDotIndex) setVisualDotIndex(null);
          if (activeProgrammaticRef.current) return;

          const offsetX = Math.max(0, e.nativeEvent.contentOffset.x);
          const index = Math.round(offsetX / snapInterval);
          const clamped = Math.max(0, Math.min(data.length - 1, index));
          currentPhysicalIndexRef.current = clamped;
          if (clamped !== activeIndex) {
            onSelectIndex(clamped, false);
          }
        }}
        scrollEventThrottle={16}
      >
        {data.map((item, idx) => {
          const isSelected = idx === safeCurrent;
          return (
            <View
              key={`carousel-item-${keyExtractor(item, idx)}`}
              style={[
                styles.itemWrapper,
                {
                  width: cardWidth,
                  marginRight: idx === data.length - 1 ? 0 : itemGap,
                },
              ]}
            >
              {renderItem(item, idx, isSelected, cardWidth)}
            </View>
          );
        })}
      </ScrollView>

      {/* Pagination Dots */}
      {showDots && data.length > 1 && (
        <View style={styles.dotsRow}>
          {data.map((_, dotIdx) => {
            const isDotActive = (visualDotIndex !== null && visualDotIndex !== undefined ? visualDotIndex : safeCurrent) === dotIdx;
            return (
              <TouchableOpacity
                key={`carousel-dot-${dotIdx}`}
                activeOpacity={0.7}
                hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
                onPress={() => handleSelect(dotIdx, true)}
                style={styles.dotTouchable}
              >
                <View
                  style={[
                    styles.dot,
                    isDotActive ? styles.dotActive : styles.dotInactive,
                  ]}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    zIndex: 2,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  dotTouchable: {
    padding: 2,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 22,
    backgroundColor: '#10B981',
  },
  dotInactive: {
    width: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  singleItemContainer: {
    paddingHorizontal: 16,
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 8,
    zIndex: 2,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  iconCircle: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#059669',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.15,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  countBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 0.8,
    borderColor: 'rgba(255, 255, 255, 0.45)',
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  chipsContainer: {
    marginBottom: 10,
    zIndex: 2,
  },
  chipsScroll: {
    paddingHorizontal: 16,
    gap: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingHorizontal: 11,
    paddingVertical: 5.5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.75)',
    ...Platform.select({
      ios: {
        shadowColor: '#003822',
        shadowOffset: { width: 0, height: 1.5 },
        shadowOpacity: 0.12,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  chipActive: {
    backgroundColor: '#047857',
    borderColor: '#064E3B',
    borderWidth: 1.2,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  track: {
    alignItems: 'center',
  },
  itemWrapper: {
    overflow: 'visible',
  },
});

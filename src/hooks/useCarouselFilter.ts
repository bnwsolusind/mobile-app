import { useState, useRef, useCallback, useMemo, useEffect } from 'react';

export interface UseCarouselFilterProps<T> {
  items: T[];
  keyExtractor: (item: T) => string;
  initialKey?: string;
  onKeyChange?: (item: T, key: string, index: number) => void;
}

export interface UseCarouselFilterReturn<T> {
  activeKey: string;
  activeIndex: number;
  activeItem: T | null;
  visualDotIndex: number | null;
  currentActiveDotIndex: number;
  setVisualDotIndex: (idx: number | null) => void;
  selectByKey: (key: string, isDirectTap?: boolean) => void;
  selectByIndex: (index: number, isDirectTap?: boolean) => void;
  lockProgrammaticScroll: (durationMs?: number) => void;
  isProgrammaticScrollRef: React.MutableRefObject<boolean>;
  lastDirectTapTimeRef: React.MutableRefObject<number>;
  isUserDraggingRef: React.MutableRefObject<boolean>;
}

export function useCarouselFilter<T>({
  items,
  keyExtractor,
  initialKey,
  onKeyChange,
}: UseCarouselFilterProps<T>): UseCarouselFilterReturn<T> {
  const [activeKey, setActiveKey] = useState<string>(() => {
    if (initialKey && items.some(item => keyExtractor(item) === initialKey)) {
      return initialKey;
    }
    return items.length > 0 ? keyExtractor(items[0]) : '';
  });

  const [visualDotIndex, setVisualDotIndex] = useState<number | null>(null);

  const lastDirectTapTimeRef = useRef<number>(0);
  const isProgrammaticScrollRef = useRef<boolean>(false);
  const programmaticScrollTimerRef = useRef<any>(null);
  const isUserDraggingRef = useRef<boolean>(false);
  const lastEmittedKeyRef = useRef<string>('');

  // Sinkronisasi jika initialKey berubah dari luar (misal dari Global Store / Route params)
  useEffect(() => {
    if (initialKey && items.some(item => keyExtractor(item) === initialKey)) {
      if (initialKey !== activeKey) {
        setActiveKey(initialKey);
      }
    } else if (items.length > 0 && (!activeKey || !items.some(item => keyExtractor(item) === activeKey))) {
      setActiveKey(keyExtractor(items[0]));
    }
  }, [initialKey, items, keyExtractor, activeKey]);

  // Turunkan index aktif secara deklaratif murni
  const activeIndex = useMemo(() => {
    const idx = items.findIndex(item => keyExtractor(item) === activeKey);
    return idx >= 0 ? idx : 0;
  }, [items, activeKey, keyExtractor]);

  // Turunkan item data aktif
  const activeItem = useMemo(() => {
    return items[activeIndex] || null;
  }, [items, activeIndex]);

  // Real-time dot indicator saat gesture dragging berlangsung
  const currentActiveDotIndex = visualDotIndex !== null ? visualDotIndex : activeIndex;

  const lockProgrammaticScroll = useCallback((durationMs = 650) => {
    isProgrammaticScrollRef.current = true;
    if (programmaticScrollTimerRef.current) {
      clearTimeout(programmaticScrollTimerRef.current);
    }
    programmaticScrollTimerRef.current = setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, durationMs);
  }, []);

  const selectByKey = useCallback((key: string, isDirectTap = false) => {
    if (items.length === 0) return;
    const targetIdx = items.findIndex(item => keyExtractor(item) === key);
    if (targetIdx < 0) return;

    if (isDirectTap) {
      lastDirectTapTimeRef.current = Date.now();
      lockProgrammaticScroll(650);
    }

    setActiveKey(key);
    const targetItem = items[targetIdx];
    if (onKeyChange && lastEmittedKeyRef.current !== key) {
      lastEmittedKeyRef.current = key;
      onKeyChange(targetItem, key, targetIdx);
    }
  }, [items, keyExtractor, lockProgrammaticScroll, onKeyChange]);

  const selectByIndex = useCallback((index: number, isDirectTap = false) => {
    if (items.length === 0) return;
    const clamped = Math.max(0, Math.min(items.length - 1, index));
    const targetItem = items[clamped];
    const key = keyExtractor(targetItem);

    if (isDirectTap) {
      lastDirectTapTimeRef.current = Date.now();
      lockProgrammaticScroll(650);
    }

    setActiveKey(key);
    if (onKeyChange && lastEmittedKeyRef.current !== key) {
      lastEmittedKeyRef.current = key;
      onKeyChange(targetItem, key, clamped);
    }
  }, [items, keyExtractor, lockProgrammaticScroll, onKeyChange]);

  return {
    activeKey,
    activeIndex,
    activeItem,
    visualDotIndex,
    currentActiveDotIndex,
    setVisualDotIndex,
    selectByKey,
    selectByIndex,
    lockProgrammaticScroll,
    isProgrammaticScrollRef,
    lastDirectTapTimeRef,
    isUserDraggingRef,
  };
}

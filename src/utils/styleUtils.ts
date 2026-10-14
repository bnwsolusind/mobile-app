import { Platform } from 'react-native';

export interface ShadowConfig {
  color?: string;
  opacity?: number;
  radius?: number;
  offsetX?: number;
  offsetY?: number;
  elevation?: number;
}

/**
 * Cross-platform shadow helper.
 * On Web: Returns clean CSS boxShadow string to avoid react-native-web deprecation warning.
 * On Native (iOS/Android): Returns standard RN shadow props + elevation.
 */
export function shadowStyle(config: ShadowConfig = {}) {
  const {
    color = '#000000',
    opacity = 0.1,
    radius = 8,
    offsetX = 0,
    offsetY = 4,
    elevation = 4,
  } = config;

  if (Platform.OS === 'web') {
    let rgba = color;
    if (color.startsWith('#')) {
      const hex = color.replace('#', '');
      const fullHex = hex.length === 3
        ? hex.split('').map((c) => c + c).join('')
        : hex;
      const r = parseInt(fullHex.substring(0, 2), 16) || 0;
      const g = parseInt(fullHex.substring(2, 4), 16) || 0;
      const b = parseInt(fullHex.substring(4, 6), 16) || 0;
      rgba = `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    return {
      boxShadow: `${offsetX}px ${offsetY}px ${radius}px ${rgba}`,
    };
  }

  return {
    shadowColor: color,
    shadowOffset: { width: offsetX, height: offsetY },
    shadowOpacity: opacity,
    shadowRadius: radius,
    elevation,
  };
}

/**
 * Cross-platform textShadow helper.
 * On Web: Returns standard CSS textShadow string.
 * On Native: Returns textShadowColor, textShadowOffset, textShadowRadius.
 */
export function textShadowStyle(
  color = 'rgba(0, 0, 0, 0.3)',
  offsetX = 0,
  offsetY = 1,
  radius = 2
) {
  if (Platform.OS === 'web') {
    return {
      textShadow: `${offsetX}px ${offsetY}px ${radius}px ${color}`,
    };
  }
  return {
    textShadowColor: color,
    textShadowOffset: { width: offsetX, height: offsetY },
    textShadowRadius: radius,
  };
}

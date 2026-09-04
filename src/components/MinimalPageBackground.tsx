import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

type GradientDirection = 'vertical' | 'horizontal' | 'diagonal';

type Props = {
  baseColor: string;
  primaryColor: string;
  enabled?: boolean;
  gradientStart?: string;
  gradientEnd?: string;
  direction?: GradientDirection;
};

const gradientPoints = {
  vertical: { start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } },
  horizontal: { start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } },
  diagonal: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
};

export default function MinimalPageBackground({
  baseColor,
  primaryColor,
  enabled = true,
  gradientStart = '#F7FCFA',
  gradientEnd = '#EAF8F2',
  direction = 'diagonal',
}: Props) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: baseColor }]}>
      {enabled ? (
        <LinearGradient
          colors={[gradientStart, gradientEnd]}
          {...gradientPoints[direction]}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View style={[styles.topGlow, { backgroundColor: primaryColor }]} />
      <View style={styles.mintGlow} />
      <View style={styles.bottomLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  topGlow: {
    position: 'absolute', width: 260, height: 260, borderRadius: 130,
    right: -150, top: 220, opacity: 0.035,
  },
  mintGlow: {
    position: 'absolute', width: 220, height: 220, borderRadius: 110,
    left: -145, bottom: 80, backgroundColor: '#61DCAE', opacity: 0.055,
  },
  bottomLine: {
    position: 'absolute', width: 180, height: 8, borderRadius: 8,
    right: -65, bottom: 52, backgroundColor: '#17B897', opacity: 0.045,
    transform: [{ rotate: '-18deg' }],
  },
});

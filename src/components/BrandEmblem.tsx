import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type BrandEmblemProps = {
  size?: number;
};

export default function BrandEmblem({ size = 96 }: BrandEmblemProps) {
  const ringSize = size - 10;

  return (
    <View
      accessible
      accessibilityLabel="Emblem SIMS Terpadu"
      style={[styles.emblem, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <View style={[styles.ring, { width: ringSize, height: ringSize, borderRadius: ringSize / 2 }]}>
        <MaterialCommunityIcons name="mosque" size={size * 0.48} color="#087A4F" />
        <View style={[styles.globe, { width: size * 0.46, height: size * 0.25, borderRadius: size * 0.08 }]}>
          <MaterialCommunityIcons name="book-open-page-variant-outline" size={size * 0.29} color="#A87410" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  emblem: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#D5A72D',
    shadowColor: '#001F17',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 5,
  },
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#087A4F',
  },
  globe: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    bottom: 8,
    backgroundColor: '#FFFFFF',
  },
});

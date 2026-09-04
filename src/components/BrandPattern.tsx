import React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

type BrandPatternProps = {
  opacity?: number;
};

export default function BrandPattern({ opacity = 0.08 }: BrandPatternProps) {
  const { width } = useWindowDimensions();
  const tileSize = Math.min(108, Math.max(74, width * 0.3));
  const columnStep = width / 3;
  const tiles = Array.from({ length: 15 });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {tiles.map((_, index) => {
        const column = index % 3;
        const row = Math.floor(index / 3);

        return (
          <View
            key={index}
            style={[
              styles.tile,
              {
                width: tileSize,
                height: tileSize,
                left: column * columnStep + (columnStep - tileSize) / 2,
                top: row * 142 - 32,
                opacity,
              },
            ]}
          >
            <View style={[styles.outerDiamond, { width: tileSize * 0.68, height: tileSize * 0.68 }]} />
            <View style={[styles.innerDiamond, { width: tileSize * 0.42, height: tileSize * 0.42 }]} />
            <View style={[styles.cross, { width: tileSize * 0.74 }]} />
            <View style={[styles.cross, styles.crossVertical, { height: tileSize * 0.74 }]} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '45deg' }],
  },
  outerDiamond: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: '#B5DFD1',
  },
  innerDiamond: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: '#B5DFD1',
  },
  cross: {
    position: 'absolute',
    height: 1,
    backgroundColor: '#B5DFD1',
  },
  crossVertical: {
    width: 1,
  },
});

import React, { useState } from 'react';
import {
  Image,
  ImageSourcePropType,
  ImageStyle,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { isSafeRemoteUrl } from '../utils/urlValidator';

type Props = {
  url: string | null | undefined;
  fallbackSource?: ImageSourcePropType;
  style?: StyleProp<ImageStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  alt?: string;
  showLoadingIndicator?: boolean;
};

const DEFAULT_FALLBACK_ICON = require('../../assets/icon.png');

export function SafeRemoteImage({
  url,
  fallbackSource = DEFAULT_FALLBACK_ICON,
  style,
  containerStyle,
  resizeMode = 'contain',
  alt = 'Image',
  showLoadingIndicator = false,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  const isValidRemote = isSafeRemoteUrl(url) && !hasError;

  return (
    <View style={[styles.container, containerStyle]}>
      {isValidRemote ? (
        <>
          <Image
            source={{ uri: url!.trim() }}
            style={style}
            resizeMode={resizeMode}
            accessibilityLabel={alt}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setHasError(true);
            }}
          />
          {loading && showLoadingIndicator && (
            <View style={[StyleSheet.absoluteFill, styles.loadingOverlay]}>
              <ActivityIndicator size="small" color="#0E5C44" />
            </View>
          )}
        </>
      ) : (
        <Image
          source={fallbackSource}
          style={style}
          resizeMode={resizeMode}
          accessibilityLabel={alt}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingOverlay: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
});

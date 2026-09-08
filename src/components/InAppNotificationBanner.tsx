import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Image,
  Dimensions,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { notificationService, ChatNotificationData } from '../services/notificationService';

interface InAppNotificationBannerProps {
  onPressNotification?: (data: ChatNotificationData) => void;
}

const { width } = Dimensions.get('window');

export default function InAppNotificationBanner({ onPressNotification }: InAppNotificationBannerProps) {
  const [currentNotif, setCurrentNotif] = useState<ChatNotificationData | null>(null);
  const translateY = useRef(new Animated.Value(-120)).current;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = notificationService.subscribeInApp((data) => {
      setCurrentNotif(data);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Slide down into view
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 6,
        speed: 14,
      }).start();

      // Auto dismiss after 5 seconds
      timeoutRef.current = setTimeout(() => {
        dismissBanner();
      }, 5000);
    });

    return () => {
      unsubscribe();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const dismissBanner = () => {
    Animated.timing(translateY, {
      toValue: -140,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setCurrentNotif(null);
    });
  };

  const handlePress = () => {
    if (currentNotif) {
      onPressNotification?.(currentNotif);
      dismissBanner();
    }
  };

  if (!currentNotif) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }],
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.92}
        style={styles.card}
        onPress={handlePress}
      >
        {/* Left: Avatar or Icon */}
        <View style={styles.avatarBox}>
          {currentNotif.avatarUrl ? (
            <Image
              source={{ uri: currentNotif.avatarUrl }}
              style={styles.avatarImg}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.defaultAvatar}>
              <MaterialCommunityIcons name="chat-processing" size={20} color="#FFFFFF" />
            </View>
          )}
          <View style={styles.dotIndicator} />
        </View>

        {/* Center: Text Content */}
        <View style={styles.contentCol}>
          <View style={styles.topRow}>
            <Text numberOfLines={1} style={styles.senderTitle}>
              {currentNotif.title}
            </Text>
            <Text style={styles.timeTag}>Baru saja</Text>
          </View>
          <Text numberOfLines={2} style={styles.bodyText}>
            {currentNotif.body}
          </Text>
        </View>

        {/* Right: Action Button */}
        <TouchableOpacity
          onPress={dismissBanner}
          style={styles.closeBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialCommunityIcons name="close" size={16} color="#64748B" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 48 : 28,
    left: 16,
    right: 16,
    zIndex: 99999,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#0E5C44',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 8,
  },
  avatarBox: {
    position: 'relative',
    marginRight: 10,
  },
  avatarImg: {
    width: 42,
    height: 42,
    borderRadius: 14,
  },
  defaultAvatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#0E5C44',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotIndicator: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  contentCol: {
    flex: 1,
    paddingRight: 6,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  senderTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
    marginRight: 6,
  },
  timeTag: {
    fontSize: 10,
    fontWeight: '700',
    color: '#10B981',
  },
  bodyText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#475569',
    lineHeight: 16,
  },
  closeBtn: {
    padding: 4,
  },
});

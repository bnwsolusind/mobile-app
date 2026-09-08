import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure notification behavior when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

export interface ChatNotificationData {
  title: string;
  body: string;
  teacherId?: string;
  teacherName?: string;
  studentId?: string;
  studentName?: string;
  avatarUrl?: string;
  messageId?: string;
}

// In-app listener callback type
type InAppNotificationListener = (data: ChatNotificationData) => void;
const inAppListeners = new Set<InAppNotificationListener>();

export const notificationService = {
  /**
   * Subscribe to in-app notification events
   */
  subscribeInApp: (listener: InAppNotificationListener) => {
    inAppListeners.add(listener);
    return () => {
      inAppListeners.delete(listener);
    };
  },

  /**
   * Initialize notification channels and request permissions on Android
   */
  init: async () => {
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('chat_messages', {
          name: 'Pesan Guru & Obrolan',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#10B981',
          enableVibrate: true,
          showBadge: true,
        });
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      return finalStatus === 'granted';
    } catch (err) {
      console.log('Error initializing notifications:', err);
      return false;
    }
  },

  /**
   * Trigger both local Android system notification and in-app floating banner
   */
  notifyNewMessage: async (payload: ChatNotificationData) => {
    try {
      // 1. Notify all in-app floating banner listeners
      inAppListeners.forEach((listener) => {
        try {
          listener(payload);
        } catch {}
      });

      // 2. Trigger native Android system notification
      await Notifications.scheduleNotificationAsync({
        content: {
          title: payload.title,
          body: payload.body,
          data: {
            teacherId: payload.teacherId,
            studentId: payload.studentId,
            screen: 'Chat',
          },
          priority: Notifications.AndroidNotificationPriority.MAX,
          color: '#0E5C44',
        },
        trigger: null, // Display immediately
      });
    } catch (err) {
      console.log('Error triggering notification:', err);
    }
  },

  /**
   * Listen for user tapping native Android status-bar notification
   */
  onNotificationResponse: (callback: (data: any) => void) => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response?.notification?.request?.content?.data;
      if (data) callback(data);
    });

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        const data = response?.notification?.request?.content?.data;
        if (data) callback(data);
      })
      .catch(() => {});

    return () => {
      subscription.remove();
    };
  },
};

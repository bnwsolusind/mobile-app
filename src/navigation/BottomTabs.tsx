import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import InAppNotificationBanner from '../components/InAppNotificationBanner';
import { useChatNotificationWatcher } from '../hooks/useChatNotificationWatcher';
import { notificationService } from '../services/notificationService';
import { useChatBadgeStore } from '../stores/chatBadgeStore';
import HomeScreen from '../screens/HomeScreen';
import AbsensiScreen from '../screens/AbsensiScreen';
import ProfilScreen from '../screens/ProfilScreen';
import TeacherPortalScreen from '../screens/TeacherPortalScreen';
import ParentPortalScreen from '../screens/ParentPortalScreen';
import StudentPortalScreen from '../screens/StudentPortalScreen';
import DataManagementScreen from '../screens/DataManagementScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import ChatScreen from '../screens/ChatScreen';
import QrCodeScreen from '../screens/QrCodeScreen';
import MoreScreen from '../screens/MoreScreen';
import AcademicCalendarScreen from '../screens/AcademicCalendarScreen';
import SchoolInformationScreen from '../screens/SchoolInformationScreen';
import ScheduleScreen from '../screens/ScheduleScreen';
import MaterialScreen from '../screens/MaterialScreen';
import AssignmentScreen from '../screens/AssignmentScreen';
import TahfizhScreen from '../screens/TahfizhScreen';
import GradeScreen from '../screens/GradeScreen';
import StudentNotesScreen from '../screens/StudentNotesScreen';
import MutabaahScreen from '../screens/MutabaahScreen';
import ExamGridsScreen from '../screens/ExamGridsScreen';
import CbtExamsScreen from '../screens/CbtExamsScreen';
import QuranScreen from '../screens/QuranScreen';
import DoaDzikirScreen from '../screens/DoaDzikirScreen';
import AccessDeniedScreen from '../components/AccessDeniedScreen';
import { useAuthStore } from '../stores/authStore';
import { mobileApiService } from '../services/mobileApiService';
import { useMobileConfigStore } from '../stores/mobileConfigStore';
import { isFoundationRole } from '../utils/roles';
import { canAccessScreen, ScreenKey } from '../utils/accessControl';

const Tab = createBottomTabNavigator();

function ModuleHeader({ title, subtitle, navigation }: { title: string; subtitle?: string; navigation: any }) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 0);

  const resolvedSubtitle = subtitle || (
    title === 'Nilai Hasil Belajar' ? 'Mutabaah Ibadah Harian' :
    title === 'Mutaba’ah Yaumiyyah' ? 'Pantau dan tingkatkan ibadah setiap hari' :
    title === 'Tahfizh Al-Qur\'an' ? 'Pantau dan tingkatkan capaian hafalan' :
    title === 'Kalender Akademik' ? 'Agenda & kalender pendidikan terpadu' :
    undefined
  );

  return (
    <View style={{ backgroundColor: '#FFFFFF', width: '100%' }}>
      <LinearGradient
        colors={['#047857', '#059669', '#10B981']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          moduleHeaderStyles.gradientBar,
          {
            paddingTop: topInset + 8,
            paddingBottom: resolvedSubtitle ? 16 : 14,
          },
        ]}
      >
        <View style={moduleHeaderStyles.decorWave} />
        <View style={moduleHeaderStyles.decorCircle} />
        <View style={moduleHeaderStyles.decorMosqueArch} />

        {/* Title layer: Absolutely centered relative to full screen width */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View
            style={[
              moduleHeaderStyles.titleAbsoluteCenter,
              {
                paddingTop: topInset + 8,
                paddingBottom: resolvedSubtitle ? 16 : 14,
              },
            ]}
          >
            <Text numberOfLines={1} style={moduleHeaderStyles.title}>
              {title}
            </Text>
            {resolvedSubtitle ? (
              <Text numberOfLines={1} style={moduleHeaderStyles.subtitle}>
                {resolvedSubtitle}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Buttons layer: left back button and right bell button */}
        <View style={moduleHeaderStyles.buttonsRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kembali ke Beranda"
            onPress={() => navigation.navigate('Beranda')}
            style={moduleHeaderStyles.backButton}
          >
            <MaterialCommunityIcons name="arrow-left" size={20} color="#059669" />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notifikasi"
            onPress={() => navigation.navigate('Notifikasi')}
            style={moduleHeaderStyles.bellButton}
          >
            <MaterialCommunityIcons name="bell-outline" size={20} color="#059669" />
            <View style={moduleHeaderStyles.bellBadgeDot} />
          </Pressable>
        </View>
      </LinearGradient>
    </View>
  );
}

const moduleOptions = (title: string, theme: any) => ({ navigation }: any) => ({
  title,
  headerShown: true,
  tabBarButton: () => null,
  tabBarItemStyle: { display: 'none' as const },
  headerShadowVisible: false,
  header: () => <ModuleHeader title={title} navigation={navigation} />,
});

/**
 * Screen Guard HOC
 * Ensures unauthorized entry through direct navigation, deep links,
 * or restored navigation state renders AccessDeniedScreen immediately
 * without fetching protected resources.
 */
function withScreenGuard(Component: React.ComponentType<any>, screenKey: ScreenKey) {
  return function GuardedScreen(props: any) {
    const user = useAuthStore((state) => state.user);
    const config = useMobileConfigStore((state) => state.config);
    const result = canAccessScreen(screenKey, user, config);

    if (!result.allowed) {
      return (
        <AccessDeniedScreen
          message={result.reason}
          onGoBack={() => props.navigation?.navigate('Beranda')}
        />
      );
    }
    return <Component {...props} />;
  };
}

const GuardedHomeScreen = withScreenGuard(HomeScreen, 'home');
const GuardedNotificationsScreen = withScreenGuard(NotificationsScreen, 'notifications');
const GuardedChatScreen = withScreenGuard(ChatScreen, 'notifications');
const GuardedQrCodeScreen = withScreenGuard(QrCodeScreen, 'qr');
const GuardedProfilScreen = withScreenGuard(ProfilScreen, 'profile');
const GuardedMoreScreen = withScreenGuard(MoreScreen, 'more');
const GuardedDataScreen = withScreenGuard(DataManagementScreen, 'data');
const GuardedTeacherScreen = withScreenGuard(TeacherPortalScreen, 'teacher');
const GuardedParentScreen = withScreenGuard(ParentPortalScreen, 'parent');
const GuardedStudentScreen = withScreenGuard(StudentPortalScreen, 'student');
const GuardedAbsensiScreen = withScreenGuard(AbsensiScreen, 'attendance');

const getSafeInsets = (insetsHook?: () => any) => {
  try {
    if (typeof insetsHook === 'function') {
      const res = insetsHook();
      if (res && typeof res === 'object') return res;
    }
  } catch {}
  return { top: 0, bottom: 0, left: 0, right: 0 };
};

function QrTabBarButton(props: any) {
  const isSelected = props.accessibilityState?.selected;
  return (
    <TouchableOpacity
      {...props}
      activeOpacity={0.88}
      style={tabStyles.qrFabWrapper}
    >
      <LinearGradient
        colors={['#24BD7C', '#18A165', '#108251']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          tabStyles.qrFabCircle,
          isSelected && tabStyles.qrFabCircleActive,
        ]}
      >
        <MaterialCommunityIcons name="qrcode-scan" size={26} color="#FFFFFF" />
      </LinearGradient>
    </TouchableOpacity>
  );
}

export default function BottomTabs() {
  const insets = getSafeInsets(typeof useSafeAreaInsets === 'function' ? useSafeAreaInsets : undefined);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 18 : 10);
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const syncServerProfile = useAuthStore((state) => state.syncServerProfile);
  const mobileConfig = useMobileConfigStore((state) => state.config);
  const theme = mobileConfig.theme;

  const [isProfileSyncing, setIsProfileSyncing] = useState<boolean>(
    Boolean(token && (!user?.permissions || user.permissions.length === 0))
  );

  useEffect(() => {
    if (!token) {
      setIsProfileSyncing(false);
      return;
    }

    // Refresh user roles, permissions, and scope from authoritative server profile
    mobileApiService
      .getProfile()
      .then((response) => {
        syncServerProfile(response);
      })
      .catch(() => {
        // Safe offline preservation: cached session remains active if offline
      })
      .finally(() => {
        setIsProfileSyncing(false);
      });
  }, [token, syncServerProfile]);

  const access = useMemo(() => ({
    home: canAccessScreen('home', user, mobileConfig).allowed,
    notifications: canAccessScreen('notifications', user, mobileConfig).allowed,
    qr: canAccessScreen('qr', user, mobileConfig).allowed,
    profile: canAccessScreen('profile', user, mobileConfig).allowed,
    more: canAccessScreen('more', user, mobileConfig).allowed,
    data: canAccessScreen('data', user, mobileConfig).allowed,
    teacher: canAccessScreen('teacher', user, mobileConfig).allowed,
    parent: canAccessScreen('parent', user, mobileConfig).allowed,
    student: canAccessScreen('student', user, mobileConfig).allowed,
    attendance: canAccessScreen('attendance', user, mobileConfig).allowed,
  }), [user, mobileConfig]);

  const tabRegistry: Record<string, { name: string; component: React.ComponentType<any>; key: ScreenKey }> = {
    home: { name: 'Beranda', component: GuardedHomeScreen, key: 'home' },
    notifications: { name: 'Chat Guru', component: GuardedChatScreen, key: 'notifications' },
    qr: { name: 'QR Code', component: GuardedQrCodeScreen, key: 'qr' },
    profile: { name: 'Profil', component: GuardedProfilScreen, key: 'profile' },
    more: { name: 'Lainnya', component: GuardedMoreScreen, key: 'more' },
  };

  const primaryTabs = mobileConfig.navigation.items
    .filter((item) => item.enabled && access[item.key as ScreenKey] !== false)
    .sort((a, b) => a.order - b.order);

  const navigationRef = useNavigationContainerRef();
  const unreadChatCount = useChatBadgeStore((state) => state.unreadChatCount);

  const handleNavigateChat = useCallback((teacherId?: string) => {
    try {
      (navigationRef as any).navigate('Chat Guru', { teacherId });
    } catch {}
  }, [navigationRef]);

  // Watch for incoming messages from teachers and show notifications
  useChatNotificationWatcher(handleNavigateChat);

  // Listen for user tapping native Android status-bar notification
  useEffect(() => {
    const unsubscribe = notificationService.onNotificationResponse((data) => {
      try {
        if (data?.screen === 'Chat' || data?.teacherId) {
          (navigationRef as any).navigate('Chat Guru', {
            teacherId: data.teacherId,
            studentId: data.studentId,
          });
        } else if (data?.screen === 'Notifikasi') {
          (navigationRef as any).navigate('Notifikasi');
        }
      } catch (err) {
        console.log('Error navigating from notification tap:', err);
      }
    });

    return unsubscribe;
  }, []);

  const isFoundation = isFoundationRole(user?.roles || []);

  if (isProfileSyncing) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: theme.background_color,
          padding: 24,
        }}
      >
        <ActivityIndicator size="large" color={theme.primary_color} />
        <Text
          style={{
            marginTop: 14,
            fontSize: 13,
            fontWeight: '700',
            color: theme.muted_text_color,
          }}
        >
          Memverifikasi hak akses akun...
        </Text>
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Tab.Navigator
        initialRouteName="Beranda"
        backBehavior="initialRoute"
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarHideOnKeyboard: true,
          sceneStyle: { backgroundColor: theme.background_color },
          headerStyle: { backgroundColor: theme.surface_color },
          headerTitleStyle: { color: '#059669', fontWeight: '800' },
          tabBarActiveTintColor: '#059669',
          tabBarInactiveTintColor: '#64748B',
          tabBarStyle: {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: '#FFFFFF',
            borderTopLeftRadius: 32,
            borderTopRightRadius: 32,
            borderTopWidth: 1,
            borderTopColor: '#E2E8F0',
            paddingTop: 5,
            paddingBottom: Math.max(insets.bottom, Platform.OS === 'android' ? 14 : 8),
            height: 58 + Math.max(insets.bottom, Platform.OS === 'android' ? 14 : 8),
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.08,
            shadowRadius: 10,
            elevation: 8,
          },
          tabBarItemStyle: { minWidth: 0, paddingHorizontal: 0, justifyContent: 'center' },
          tabBarShowLabel: mobileConfig.navigation.show_labels,
          tabBarLabelStyle: {
            fontSize: mobileConfig.theme.font_scale === 'large' ? 10.5 : 9.5,
            lineHeight: 12,
            fontWeight: '700',
            fontFamily: 'Nunito_700Bold',
            marginTop: 1,
          },
          tabBarIcon: ({ focused }) => {
            let iconName = 'circle-outline';
            if (route.name === 'Beranda') iconName = focused ? 'home' : 'home-outline';
            else if (route.name === 'Chat Guru') iconName = focused ? 'chat-processing' : 'chat-processing-outline';
            else if (route.name === 'Notifikasi') iconName = focused ? 'bell' : 'bell-outline';
            else if (route.name === 'Profil') iconName = focused ? 'account' : 'account-outline';
            else if (route.name === 'Lainnya') iconName = 'menu';
            else if (route.name === 'Data') iconName = 'database-outline';
            else if (route.name === 'Guru') iconName = 'teach';
            else if (route.name === 'Orang Tua') iconName = 'account-child-outline';
            else if (route.name === 'Siswa') iconName = 'school-outline';
            else if (route.name === 'Absensi') iconName = 'clipboard-check-outline';
            else if (route.name === 'Kalender') iconName = 'calendar-month-outline';

            const isChat = route.name === 'Chat Guru';
            const showBadge = isChat && unreadChatCount > 0;

            if (focused) {
              return (
                <View style={tabStyles.activeTabSquircle}>
                  <MaterialCommunityIcons
                    name={iconName as never}
                    color="#FFFFFF"
                    size={18}
                  />
                  {showBadge && <View style={tabStyles.chatBadgeDotActive} />}
                </View>
              );
            }

            return (
              <View style={tabStyles.inactiveTabIconBox}>
                <MaterialCommunityIcons
                  name={iconName as never}
                  color="#64748B"
                  size={22}
                />
                {showBadge && <View style={tabStyles.chatBadgeDot} />}
              </View>
            );
          },
        })}
      >

        {primaryTabs.map((item) => {
          const entry = tabRegistry[item.key];
          if (!entry) return null;
          const isChat = item.key === 'notifications' || entry.name === 'Chat Guru';
          const isQr = item.key === 'qr' || entry.name === 'QR Code';
          const finalLabel = isChat ? 'Chat Guru' : item.label;

          if (isQr) {
            return (
              <Tab.Screen
                key={item.key}
                name={entry.name}
                component={entry.component}
                options={{
                  headerShown: false,
                  tabBarLabel: () => null,
                  title: 'QR Code',
                  tabBarButton: QrTabBarButton,
                }}
              />
            );
          }

          return (
            <Tab.Screen
              key={item.key}
              name={entry.name}
              component={entry.component}
              options={{ tabBarLabel: finalLabel, title: finalLabel }}
            />
          );
        })}
        {access.data && (
          <Tab.Screen
            name="Data"
            component={GuardedDataScreen}
            options={moduleOptions(isFoundation ? 'Data Yayasan' : 'Data Master', theme)}
          />
        )}
        {access.teacher && (
          <Tab.Screen
            name="Guru"
            component={GuardedTeacherScreen}
            options={moduleOptions('Portal Guru', theme)}
          />
        )}
        {access.parent && (
          <Tab.Screen
            name="Orang Tua"
            component={GuardedParentScreen}
            options={moduleOptions('Portal Orang Tua', theme)}
          />
        )}
        {access.student && (
          <Tab.Screen
            name="Siswa"
            component={GuardedStudentScreen}
            options={moduleOptions('Portal Siswa', theme)}
          />
        )}
        {access.attendance && (
          <Tab.Screen
            name="Absensi"
            component={GuardedAbsensiScreen}
            options={moduleOptions('Presensi', theme)}
          />
        )}
        <Tab.Screen
          name="Kalender"
          component={AcademicCalendarScreen}
          options={moduleOptions('Kalender Akademik', theme)}
        />
        <Tab.Screen
          name="Informasi"
          component={SchoolInformationScreen}
          options={moduleOptions('Informasi Sekolah', theme)}
        />
        <Tab.Screen
          name="Jadwal"
          component={ScheduleScreen}
          options={moduleOptions('Jadwal Pelajaran', theme)}
        />
        <Tab.Screen
          name="Materi"
          component={MaterialScreen}
          options={moduleOptions('Materi Pembelajaran', theme)}
        />
        <Tab.Screen
          name="Tugas"
          component={AssignmentScreen}
          options={moduleOptions('Tugas Siswa', theme)}
        />
        <Tab.Screen
          name="Tahfizh"
          component={TahfizhScreen}
          options={moduleOptions('Tahfizh Al-Qur\'an', theme)}
        />
        <Tab.Screen
          name="Mutabaah"
          component={MutabaahScreen}
          options={moduleOptions('Mutaba’ah Yaumiyyah', theme)}
        />
        <Tab.Screen
          name="Nilai"
          component={GradeScreen}
          options={moduleOptions('Nilai Hasil Belajar', theme)}
        />
        {access.parent && (
          <Tab.Screen
            name="Komentar"
            component={StudentNotesScreen}
            options={moduleOptions('Komentar & Catatan Guru', theme)}
          />
        )}
        <Tab.Screen
          name="KisiKisi"
          component={ExamGridsScreen}
          options={moduleOptions('Kisi-Kisi Ujian', theme)}
        />
        <Tab.Screen
          name="CbtExams"
          component={CbtExamsScreen}
          options={moduleOptions('Ujian CBT', theme)}
        />
        <Tab.Screen
          name="Quran"
          component={QuranScreen}
          options={moduleOptions("Al-Qur'an Al-Karim", theme)}
        />
        <Tab.Screen
          name="DoaDzikir"
          component={DoaDzikirScreen}
          options={moduleOptions('Doa & Dzikir Harian', theme)}
        />
        <Tab.Screen
          name="Notifikasi"
          component={GuardedNotificationsScreen}
          options={moduleOptions('Notifikasi & Pengumuman', theme)}
        />
      </Tab.Navigator>
      <InAppNotificationBanner
        onPressNotification={(data) => {
          try {
            (navigationRef as any).navigate('Chat Guru', {
              teacherId: data.teacherId,
              studentId: data.studentId,
            });
          } catch {}
        }}
      />
    </NavigationContainer>
  );
}

const moduleHeaderStyles = StyleSheet.create({
  gradientBar: {
    width: '100%',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
  },
  titleAbsoluteCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 68,
  },
  buttonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    width: '100%',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  bellButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    position: 'relative',
  },
  bellBadgeDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  eyebrow: {
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#D4F5E6',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Nunito_600SemiBold',
    color: 'rgba(255, 255, 255, 0.88)',
    textAlign: 'center',
    marginTop: 1.5,
  },
  decorWave: {
    position: 'absolute',
    top: -40,
    right: -20,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    transform: [{ scaleX: 1.3 }, { rotate: '-25deg' }],
  },
  decorCircle: {
    position: 'absolute',
    bottom: -20,
    left: 40,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  decorMosqueArch: {
    position: 'absolute',
    right: 48,
    top: -10,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  tabIcon: {
    width: 38,
    height: 30,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const tabStyles = StyleSheet.create({
  activeTabSquircle: {
    width: 44,
    height: 28,
    borderRadius: 10,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    shadowColor: '#059669',
    shadowOpacity: 0.25,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  inactiveTabIconBox: {
    width: 44,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  chatBadgeDot: {
    position: 'absolute',
    top: 2,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  chatBadgeDotActive: {
    position: 'absolute',
    top: 2,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#059669',
  },
  qrFabWrapper: {
    top: -18,
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },
  qrFabCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#059669',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.38,
    shadowRadius: 10,
    elevation: 8,
  },
  qrFabCircleActive: {
    borderColor: '#DEF7EC',
    shadowOpacity: 0.6,
    transform: [{ scale: 1.05 }],
  },
});

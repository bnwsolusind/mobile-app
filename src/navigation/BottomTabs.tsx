import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
import AccessDeniedScreen from '../components/AccessDeniedScreen';
import { useAuthStore } from '../stores/authStore';
import { mobileApiService } from '../services/mobileApiService';
import { useMobileConfigStore } from '../stores/mobileConfigStore';
import { isFoundationRole } from '../utils/roles';
import { canAccessScreen, ScreenKey } from '../utils/accessControl';

const Tab = createBottomTabNavigator();

const moduleOptions = (title: string, theme: any) => ({ navigation }: any) => ({
  title,
  headerShown: true,
  tabBarButton: () => null,
  tabBarItemStyle: { display: 'none' as const },
  headerShadowVisible: false,
  headerBackground: () => (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <LinearGradient
        colors={['#0D6B42', '#18A165', '#2BD988']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          StyleSheet.absoluteFill,
          {
            borderBottomLeftRadius: 28,
            borderBottomRightRadius: 28,
            overflow: 'hidden',
          },
        ]}
      >
        <View style={moduleHeaderStyles.decorWave} />
        <View style={moduleHeaderStyles.decorCircle} />
      </LinearGradient>
    </View>
  ),
  headerStyle: {
    backgroundColor: 'transparent',
    height: Platform.OS === 'android' ? 96 : 106,
  },
  headerTitle: () => (
    <View style={{ marginLeft: 4, paddingBottom: 4 }}>
      <Text numberOfLines={1} style={moduleHeaderStyles.title}>
        {title}
      </Text>
    </View>
  ),
  headerLeft: () => (
    <View style={{ paddingBottom: 6 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Kembali ke Beranda"
        onPress={() => navigation.navigate('Beranda')}
        style={moduleHeaderStyles.backButton}
      >
        <MaterialCommunityIcons name="arrow-left" size={20} color="#18A165" />
      </Pressable>
    </View>
  ),
  headerRight: () => (
    <View style={{ paddingBottom: 6, marginRight: 14 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Notifikasi"
        onPress={() => navigation.navigate('Notifikasi')}
        style={moduleHeaderStyles.bellButton}
      >
        <MaterialCommunityIcons name="bell-outline" size={20} color="#18A165" />
      </Pressable>
    </View>
  ),
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

export default function BottomTabs() {
  const insets = useSafeAreaInsets();
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
    <NavigationContainer>
      <Tab.Navigator
        initialRouteName="Beranda"
        backBehavior="initialRoute"
        screenOptions={({ route }) => ({
          headerShown: false,
          sceneStyle: { backgroundColor: theme.background_color },
          headerStyle: { backgroundColor: theme.surface_color },
          headerTitleStyle: { color: '#18A165', fontWeight: '800' },
          tabBarActiveTintColor: '#18A165',
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
            shadowOpacity: 0.1,
            shadowRadius: 10,
            elevation: 8,
          },
          tabBarItemStyle: { minWidth: 0, paddingHorizontal: 0, justifyContent: 'center' },
          tabBarShowLabel: mobileConfig.navigation.show_labels,
          tabBarLabelStyle: {
            fontSize: mobileConfig.theme.font_scale === 'large' ? 10 : 9,
            lineHeight: 12,
            fontWeight: '700',
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

            if (focused) {
              return (
                <View style={tabStyles.activeTabSquircle}>
                  <MaterialCommunityIcons
                    name={iconName as never}
                    color="#FFFFFF"
                    size={18}
                  />
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
                  tabBarLabel: () => null,
                  title: 'QR Code',
                  tabBarButton: (props: any) => {
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
                  },
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
          name="Notifikasi"
          component={GuardedNotificationsScreen}
          options={moduleOptions('Notifikasi & Pengumuman', theme)}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const moduleHeaderStyles = StyleSheet.create({
  backButton: {
    width: 38,
    height: 38,
    marginLeft: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.15,
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
    shadowOpacity: 0.15,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  eyebrow: {
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#D4F5E6',
  },
  title: {
    fontSize: 15.5,
    fontWeight: '900',
    color: '#FFFFFF',
    maxWidth: 220,
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
    backgroundColor: '#18A165',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    shadowColor: '#18A165',
    shadowOpacity: 0.3,
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
    backgroundColor: '#18A165',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    shadowColor: '#18A165',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },
  qrFabCircleActive: {
    borderColor: '#DEF7EC',
    shadowOpacity: 0.65,
    transform: [{ scale: 1.05 }],
  },
});

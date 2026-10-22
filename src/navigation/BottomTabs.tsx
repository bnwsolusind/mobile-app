import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import InAppNotificationBanner from '../components/InAppNotificationBanner';
import { useChatNotificationWatcher } from '../hooks/useChatNotificationWatcher';
import { useScheduleNotificationWatcher } from '../hooks/useScheduleNotificationWatcher';
import { notificationService } from '../services/notificationService';
import { useChatBadgeStore } from '../stores/chatBadgeStore';
import { useNotificationBadgeStore } from '../stores/notificationBadgeStore';
import { useNavigationHistoryStore } from '../stores/navigationHistoryStore';
import { useActiveChildStore } from '../stores/activeChildStore';
import {
  getProfileImageUrl,
  DEFAULT_STUDENT_BOY_AVATAR,
  DEFAULT_STUDENT_GIRL_AVATAR,
} from '../utils/profile';
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
import BankSoalScreen from '../screens/BankSoalScreen';
import CbtExamsScreen from '../screens/CbtExamsScreen';
import QuranScreen from '../screens/QuranScreen';
import DoaDzikirScreen from '../screens/DoaDzikirScreen';
import ParentBillsScreen from '../screens/ParentBillsScreen';
import StudentAttendanceReportScreen from '../screens/StudentAttendanceReportScreen';
import GateAttendanceTerminalScreen from '../screens/GateAttendanceTerminalScreen';
import SubstituteKbmAttendanceScreen from '../screens/SubstituteKbmAttendanceScreen';
import StaffSelfAttendanceScreen from '../screens/StaffSelfAttendanceScreen';
import PrincipalDashboardScreen from '../screens/PrincipalDashboardScreen';
import MasterSiswaScreen from '../screens/MasterSiswaScreen';
import MutasiSiswaScreen from '../screens/MutasiSiswaScreen';
import PantauKelasScreen from '../screens/PantauKelasScreen';
import AccessDeniedScreen from '../components/AccessDeniedScreen';
import { useAuthStore } from '../stores/authStore';
import { mobileApiService } from '../services/mobileApiService';
import { useMobileConfigStore } from '../stores/mobileConfigStore';
import { isFoundationRole } from '../utils/roles';
import { canAccessScreen, canAccessBilling, ScreenKey } from '../utils/accessControl';

const Tab = createBottomTabNavigator();

function ModuleHeader({
  title,
  subtitle,
  navigation,
  route,
  showStudentCard = false,
}: {
  title: string;
  subtitle?: string;
  navigation: any;
  route?: any;
  showStudentCard?: boolean;
}) {
  let insets = { top: 0, bottom: 0, left: 0, right: 0 };
  try {
    if (typeof useSafeAreaInsets === 'function') {
      insets = useSafeAreaInsets() || insets;
    }
  } catch {}
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 0);
  const unreadNotificationCount = useNotificationBadgeStore((state) => state.unreadNotificationCount);

  const user = useAuthStore((state) => state.user);
  const children = useActiveChildStore((state) => state.children);
  const activeChildId = useActiveChildStore((state) => state.activeChildId);
  const setActiveChildId = useActiveChildStore((state) => state.setActiveChildId);

  // Sinkronkan ke activeChildId jika dari route params berbeda
  useEffect(() => {
    const routeChildId = route?.params?.child_id || route?.params?.student_id;
    if (routeChildId && String(routeChildId) !== String(activeChildId)) {
      setActiveChildId(String(routeChildId));
    }
  }, [route?.params?.child_id, route?.params?.student_id, activeChildId, setActiveChildId]);

  // Active student calculation
  const targetId = route?.params?.child_id || route?.params?.student_id || activeChildId;
  const activeStudent: any = useMemo(() => {
    if (children && children.length > 0) {
      if (targetId) {
        const found = children.find(
          (c) => String(c.id || c.student_id) === String(targetId)
        );
        if (found) return found;
      }
      return children[0];
    }
    return (user as any)?.student || user || null;
  }, [children, targetId, user]);

  const studentName = activeStudent?.name || activeStudent?.full_name || activeStudent?.nama_lengkap || user?.name || 'Siswa';
  const studentGender = activeStudent?.gender || activeStudent?.jenis_kelamin || (user as any)?.gender || 'L';
  const isGirl = studentGender === 'P' || studentGender === 'female' || studentGender === 'perempuan';
  const defaultAvatar = isGirl ? DEFAULT_STUDENT_GIRL_AVATAR : DEFAULT_STUDENT_BOY_AVATAR;
  const avatarUrl = getProfileImageUrl(activeStudent);

  const studentClass = typeof activeStudent?.kelas === 'object'
    ? (activeStudent?.kelas?.nama_kelas || activeStudent?.kelas?.name)
    : (activeStudent?.class_name || activeStudent?.kelas || '-');

  const studentUnit = typeof activeStudent?.education_unit === 'object'
    ? (activeStudent?.education_unit?.name || activeStudent?.education_unit?.nama)
    : (activeStudent?.unit_name || (user as any)?.unit_name || 'Unit Pendidikan');

  const studentNis = activeStudent?.nisn || activeStudent?.nis || '-';

  const resolvedSubtitle = subtitle || (
    title === 'Nilai Hasil Belajar' ? 'Mutabaah Ibadah Harian' :
    title === 'Mutaba’ah Yaumiyyah' ? 'Pantau dan tingkatkan ibadah setiap hari' :
    title === 'Tahfizh Al-Qur\'an' ? 'Pantau dan tingkatkan capaian hafalan' :
    title === 'Kalender Akademik' ? 'Agenda & kalender pendidikan terpadu' :
    undefined
  );

  const handleBack = () => {
    const handled = useNavigationHistoryStore.getState().goBackDynamic(navigation, route?.params);
    if (handled) {
      return;
    }
    const childId = route?.params?.child_id || route?.params?.student_id;
    if (route?.params?.from_child_portal && childId) {
      navigation.navigate('Beranda');
      return;
    }
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Beranda');
    }
  };

  return (
    <View style={moduleHeaderStyles.headerOuterWrapper}>
      <LinearGradient
        colors={['#047857', '#059669', '#10B981']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          moduleHeaderStyles.gradientBar,
          {
            paddingTop: topInset + 8,
            paddingBottom: showStudentCard ? 14 : (resolvedSubtitle ? 16 : 14),
          },
        ]}
      >
        {/* Subtle Decorative Accents (clean geometric circles, no heavy images) */}
        <View style={moduleHeaderStyles.decorCircle1} />
        <View style={moduleHeaderStyles.decorCircle2} />

        {showStudentCard ? (
          /* ================= UNIFIED DYNAMIC HEADER (WITH INTEGRATED STUDENT CARD) ================= */
          <View style={moduleHeaderStyles.unifiedHeaderContainer}>
            {/* Top Bar: Back Button, Left Identity, Right Bell */}
            <View style={moduleHeaderStyles.unifiedTopRow}>
              {/* Back button */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Kembali ke halaman sebelumnya"
                onPress={handleBack}
                style={moduleHeaderStyles.squircleBtn}
              >
                <MaterialCommunityIcons name="arrow-left" size={20} color="#059669" />
              </Pressable>

              {/* Left Identity: Squircle Avatar + Title & Student Subtitle */}
              <View style={moduleHeaderStyles.unifiedLeftIdentity}>
                <View style={moduleHeaderStyles.studentAvatarSquircle}>
                  <Image
                    source={avatarUrl ? { uri: avatarUrl } : defaultAvatar}
                    style={moduleHeaderStyles.studentAvatarImg}
                    resizeMode="cover"
                  />
                </View>
                <View style={moduleHeaderStyles.headerIdentityTextCol}>
                  <Text numberOfLines={1} style={moduleHeaderStyles.headerModuleTitleText}>
                    {title}
                  </Text>
                  <Text numberOfLines={1} style={moduleHeaderStyles.headerStudentSubnameText}>
                    Ananda {studentName}
                  </Text>
                </View>
              </View>

              {/* Right Bell */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Notifikasi"
                onPress={() => navigation.navigate('Notifikasi')}
                style={moduleHeaderStyles.squircleBtn}
              >
                <MaterialCommunityIcons name="bell-outline" size={20} color="#059669" />
                {unreadNotificationCount > 0 && (
                  <View style={moduleHeaderStyles.bellBadgeDot} />
                )}
              </Pressable>
            </View>

            {/* Integrated Dynamic Student Card */}
            <View style={moduleHeaderStyles.integratedCard}>
              <View style={moduleHeaderStyles.integratedCardMainRow}>
                <View style={moduleHeaderStyles.integratedCardInfoCol}>
                  <Text numberOfLines={1} style={moduleHeaderStyles.integratedCardStudentName}>
                    {studentName}
                  </Text>
                  <View style={moduleHeaderStyles.integratedBadgesRow}>
                    <View style={moduleHeaderStyles.unitClassBadge}>
                      <MaterialCommunityIcons name="school" size={12} color="#059669" style={{ marginRight: 4 }} />
                      <Text numberOfLines={1} style={moduleHeaderStyles.unitClassBadgeText}>
                        {studentClass} • {studentUnit}
                      </Text>
                    </View>
                    {studentNis !== '-' && (
                      <View style={moduleHeaderStyles.nisBadge}>
                        <Text style={moduleHeaderStyles.nisBadgeText}>NIS: {studentNis}</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Status Indicator */}
                <View style={moduleHeaderStyles.activeStatusPill}>
                  <MaterialCommunityIcons name="check-circle" size={13} color="#059669" />
                  <Text style={moduleHeaderStyles.activeStatusText}>Aktif</Text>
                </View>
              </View>

              {/* Multiple Children Switcher Chips (if more than 1 child) */}
              {children && children.length > 1 && (
                <View style={moduleHeaderStyles.childSwitcherSection}>
                  <View style={moduleHeaderStyles.childSwitcherDivider} />
                  <View style={moduleHeaderStyles.childSwitcherRow}>
                    <Text style={moduleHeaderStyles.childSwitcherLabel}>Pilih Ananda:</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={moduleHeaderStyles.childChipsScroll}
                    >
                      {children.map((child: any) => {
                        const childIdStr = String(child.id || child.student_id);
                        const isSelected = childIdStr === String(activeChildId);
                        const shortName = (child.name || child.full_name || 'Ananda').split(' ')[0];
                        return (
                          <TouchableOpacity
                            key={childIdStr}
                            activeOpacity={0.75}
                            onPress={() => setActiveChildId(childIdStr)}
                            style={[
                              moduleHeaderStyles.childChip,
                              isSelected && moduleHeaderStyles.childChipActive,
                            ]}
                          >
                            <MaterialCommunityIcons
                              name={isSelected ? 'check-circle' : 'account-circle-outline'}
                              size={13}
                              color={isSelected ? '#FFFFFF' : '#64748B'}
                              style={{ marginRight: 4 }}
                            />
                            <Text
                              style={[
                                moduleHeaderStyles.childChipText,
                                isSelected && moduleHeaderStyles.childChipTextActive,
                              ]}
                            >
                              {shortName}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                </View>
              )}
            </View>
          </View>
        ) : (
          /* ================= STANDARD HEADER (FOR OTHER MODULES) ================= */
          <>
            {/* Title layer: Absolutely centered relative to full screen width */}
            <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
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
                accessibilityLabel="Kembali ke halaman sebelumnya"
                onPress={handleBack}
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
                {unreadNotificationCount > 0 && (
                  <View style={moduleHeaderStyles.bellBadgeDot} />
                )}
              </Pressable>
            </View>
          </>
        )}
      </LinearGradient>
    </View>
  );
}

const moduleOptions = (title: string, theme: any, options?: { showStudentCard?: boolean }) => ({ navigation, route }: any) => ({
  title,
  headerShown: true,
  tabBarButton: () => null,
  tabBarItemStyle: { display: 'none' as const },
  headerShadowVisible: false,
  header: () => (
    <ModuleHeader
      title={title}
      navigation={navigation}
      route={route}
      showStudentCard={options?.showStudentCard}
    />
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
          onGoBack={() => {
            const handled = useNavigationHistoryStore.getState().goBackDynamic(props.navigation);
            if (!handled) {
              props.navigation?.navigate('Beranda');
            }
          }}
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
const GuardedTeacherAttendanceReportScreen = withScreenGuard(StudentAttendanceReportScreen, 'rekapPresensiGuru');

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
  let insets = { top: 0, bottom: 0, left: 0, right: 0 };
  try {
    if (typeof useSafeAreaInsets === 'function') {
      insets = useSafeAreaInsets() || insets;
    }
  } catch {}
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

    // Safety timeout: jangan biarkan spinner verifikasi menahan layar lebih dari 1.2 detik
    const timer = setTimeout(() => {
      setIsProfileSyncing(false);
    }, 1200);

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
        clearTimeout(timer);
        setIsProfileSyncing(false);
      });

    return () => clearTimeout(timer);
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
    billing: canAccessBilling(user, mobileConfig),
  }), [user, mobileConfig]);

  const tabRegistry: Record<string, { name: string; component: React.ComponentType<any>; key: ScreenKey }> = {
    home: { name: 'Beranda', component: GuardedHomeScreen, key: 'home' },
    notifications: { name: 'Chat Guru', component: GuardedChatScreen, key: 'notifications' },
    qr: { name: 'QR Code', component: GuardedQrCodeScreen, key: 'qr' },
    profile: { name: 'Profil', component: GuardedProfilScreen, key: 'profile' },
    more: { name: 'Lainnya', component: GuardedMoreScreen, key: 'more' },
  };

  const primaryTabs = mobileConfig.navigation.items
    .filter((item) => item.enabled && (access as Record<string, boolean>)[item.key] !== false)
    .sort((a, b) => a.order - b.order);

  const navigationRef = useNavigationContainerRef();
  const unreadChatCount = useChatBadgeStore((state) => state.unreadChatCount);

  const handleNavigateChat = useCallback((teacherId?: string) => {
    try {
      (navigationRef as any).navigate('Chat Guru', { teacherId });
    } catch {}
  }, [navigationRef]);

  const handleNavigateSchedule = useCallback((payload: any) => {
    try {
      if (payload?.scheduleId || payload?.classId) {
        (navigationRef as any).navigate('QR Code', {
          schedule_id: payload.scheduleId,
          kelas_id: payload.classId,
          class_name: payload.className,
          mode: 'manual',
        });
      } else {
        (navigationRef as any).navigate('Jadwal');
      }
    } catch {}
  }, [navigationRef]);

  // Watch for incoming messages from teachers and show notifications
  useChatNotificationWatcher(handleNavigateChat);

  // Watch for lesson schedules and trigger 10-minute and 5-minute notifications
  useScheduleNotificationWatcher(handleNavigateSchedule);

  // Listen for user tapping native Android status-bar notification
  useEffect(() => {
    const unsubscribe = notificationService.onNotificationResponse((data) => {
      try {
        if (data?.screen === 'QR Code' || data?.scheduleId) {
          (navigationRef as any).navigate('QR Code', {
            schedule_id: data.scheduleId,
            kelas_id: data.classId,
            class_name: data.className,
            mode: 'manual',
          });
        } else if (data?.screen === 'Jadwal') {
          (navigationRef as any).navigate('Jadwal');
        } else if (data?.screen === 'Chat' || data?.teacherId) {
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

  // Sync unread notification & message count periodically & on AppState change
  useEffect(() => {
    if (!user?.id) return;

    let isMounted = true;
    const syncUnreadCount = async () => {
      try {
        const res: any = await mobileApiService.getUnreadNotificationCount();
        if (!isMounted) return;
        const count = Number(res?.data?.unread_count ?? res?.unread_count ?? (typeof res === 'number' ? res : 0));
        useNotificationBadgeStore.getState().setUnreadNotificationCount(count);
      } catch {}
    };

    // 1. Initial sync
    syncUnreadCount();

    // 2. Periodic polling every 8s while user is logged in
    const intervalId = setInterval(syncUnreadCount, 8000);

    // 3. Re-sync whenever app comes to foreground
    const appStateSub = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        syncUnreadCount();
      }
    });

    // 4. Re-sync whenever in-app notification triggers
    const inAppUnsub = notificationService.subscribeInApp(() => {
      syncUnreadCount();
    });

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      appStateSub.remove();
      inAppUnsub();
    };
  }, [user?.id]);

  const handleNavigationStateChange = useCallback(() => {
    try {
      const currentRoute = (navigationRef as any)?.getCurrentRoute?.();
      if (currentRoute?.name) {
        useNavigationHistoryStore.getState().pushRoute({
          name: currentRoute.name,
          params: currentRoute.params as Record<string, any> | undefined,
        });
      }
    } catch {}
  }, [navigationRef]);

  // Android hardware back button handler
  useEffect(() => {
    const onHardwareBack = () => {
      try {
        const currentRoute = (navigationRef as any)?.getCurrentRoute?.();
        if (!currentRoute?.name || currentRoute.name === 'Beranda') {
          return false;
        }
        return useNavigationHistoryStore.getState().goBackDynamic(navigationRef);
      } catch {
        return false;
      }
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => sub.remove();
  }, [navigationRef]);

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
    <NavigationContainer
      ref={navigationRef}
      onReady={handleNavigationStateChange}
      onStateChange={handleNavigationStateChange}
    >
      <Tab.Navigator
        initialRouteName="Beranda"
        backBehavior="history"
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
            else if (route.name === 'Chat Guru' || route.name === 'Chat') iconName = focused ? 'chat-processing' : 'chat-processing-outline';
            else if (route.name === 'Notifikasi') iconName = focused ? 'bell' : 'bell-outline';
            else if (route.name === 'Profil') iconName = focused ? 'account' : 'account-outline';
            else if (route.name === 'Lainnya') iconName = 'menu';
            else if (route.name === 'Data') iconName = 'database-outline';
            else if (route.name === 'Guru') iconName = 'presentation';
            else if (route.name === 'Orang Tua') iconName = 'account-child-outline';
            else if (route.name === 'Siswa') iconName = 'school-outline';
            else if (route.name === 'Absensi') iconName = 'clipboard-check-outline';
            else if (route.name === 'Kalender') iconName = 'calendar-month-outline';

            const isChat = route.name === 'Chat Guru' || route.name === 'Chat';
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
          const isChat = item.key === 'notifications' || entry.name === 'Chat Guru' || entry.name === 'Chat';
          const isQr = item.key === 'qr' || entry.name === 'QR Code';
          const finalLabel = isChat ? 'Chat' : item.label;

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
            options={{
              headerShown: false,
              tabBarButton: () => null,
              tabBarItemStyle: { display: 'none' as const },
            }}
          />
        )}
        <Tab.Screen
          name="DataManagement"
          component={GuardedDataScreen}
          options={{
            headerShown: false,
            tabBarButton: () => null,
            tabBarItemStyle: { display: 'none' as const },
          }}
        />
        {access.teacher && (
          <Tab.Screen
            name="Guru"
            component={GuardedTeacherScreen}
            options={{
              headerShown: false,
              tabBarButton: () => null,
              tabBarItemStyle: { display: 'none' as const },
            }}
          />
        )}
        {access.parent && (
          <Tab.Screen
            name="Orang Tua"
            component={GuardedParentScreen}
            options={{
              headerShown: false,
              tabBarButton: () => null,
              tabBarItemStyle: { display: 'none' as const },
            }}
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
            options={{
              headerShown: false,
              tabBarButton: () => null,
              tabBarItemStyle: { display: 'none' as const },
            }}
          />
        )}
        <Tab.Screen
          name="Perizinan"
          component={GuardedAbsensiScreen}
          initialParams={{ tab: 'permissions' }}
          options={{
            headerShown: false,
            tabBarButton: () => null,
            tabBarItemStyle: { display: 'none' as const },
          }}
        />
        <Tab.Screen
          name="Kalender"
          component={AcademicCalendarScreen}
          options={{
            headerShown: false,
            tabBarButton: () => null,
            tabBarItemStyle: { display: 'none' as const },
          }}
        />
        <Tab.Screen
          name="Informasi"
          component={SchoolInformationScreen}
          options={{
            headerShown: false,
            tabBarButton: () => null,
            tabBarItemStyle: { display: 'none' as const },
          }}
        />
        <Tab.Screen
          name="Jadwal"
          component={ScheduleScreen}
          options={{
            headerShown: false,
            tabBarButton: () => null,
            tabBarItemStyle: { display: 'none' as const },
          }}
        />
        <Tab.Screen
          name="Materi"
          component={MaterialScreen}
          options={{
            headerShown: false,
            tabBarButton: () => null,
            tabBarItemStyle: { display: 'none' as const },
          }}
        />
        <Tab.Screen
          name="Tugas"
          component={AssignmentScreen}
          options={{
            headerShown: false,
            tabBarButton: () => null,
            tabBarItemStyle: { display: 'none' as const },
          }}
        />
        <Tab.Screen
          name="Tahfizh"
          component={TahfizhScreen}
          options={{
            headerShown: false,
            tabBarButton: () => null,
            tabBarItemStyle: { display: 'none' as const },
          }}
        />
        <Tab.Screen
          name="Mutabaah"
          component={MutabaahScreen}
          options={{
            headerShown: false,
            tabBarButton: () => null,
            tabBarItemStyle: { display: 'none' as const },
          }}
        />
        <Tab.Screen
          name="Nilai"
          component={GradeScreen}
          options={{
            headerShown: false,
            tabBarButton: () => null,
            tabBarItemStyle: { display: 'none' as const },
          }}
        />
        <Tab.Screen
          name="Komentar"
          component={StudentNotesScreen}
          options={{
            headerShown: false,
            tabBarButton: () => null,
            tabBarItemStyle: { display: 'none' as const },
          }}
        />
        {(access.parent || access.billing) && (
          <Tab.Screen
            name="Tagihan"
            component={ParentBillsScreen}
            options={moduleOptions('Tagihan & Pembayaran SPP', theme)}
          />
        )}
        <Tab.Screen
          name="KisiKisi"
          component={ExamGridsScreen}
          options={{
            headerShown: false,
            tabBarButton: () => null,
            tabBarItemStyle: { display: 'none' as const },
          }}
        />
        <Tab.Screen
          name="BankSoal"
          component={BankSoalScreen}
          options={{
            headerShown: false,
            tabBarButton: () => null,
            tabBarItemStyle: { display: 'none' as const },
          }}
        />
        <Tab.Screen
          name="CbtExams"
          component={CbtExamsScreen}
          options={{
            headerShown: false,
            tabBarButton: () => null,
            tabBarItemStyle: { display: 'none' as const },
          }}
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
        <Tab.Screen
          name="Notifications"
          component={GuardedNotificationsScreen}
          options={{
            headerShown: false,
            tabBarButton: () => null,
            tabBarItemStyle: { display: 'none' as const },
          }}
        />
        <Tab.Screen
          name="Chat"
          component={GuardedChatScreen}
          options={{
            headerShown: false,
            tabBarButton: () => null,
            tabBarItemStyle: { display: 'none' as const },
          }}
        />
        <Tab.Screen
          name="RekapPresensiSiswa"
          component={StudentAttendanceReportScreen}
          initialParams={{ defaultSubject: 'siswa', lockedSubject: 'siswa' }}
          options={{
            headerShown: false,
            tabBarButton: () => null,
            tabBarItemStyle: { display: 'none' as const },
          }}
        />
        <Tab.Screen
          name="RekapPresensiGuru"
          component={GuardedTeacherAttendanceReportScreen}
          initialParams={{ defaultSubject: 'pegawai', lockedSubject: 'pegawai' }}
          options={{
            headerShown: false,
            tabBarButton: () => null,
            tabBarItemStyle: { display: 'none' as const },
          }}
        />
        <Tab.Screen
          name="AbsensiGerbangTerminal"
          component={GateAttendanceTerminalScreen}
          options={{
            headerShown: false,
            tabBarButton: () => null,
            tabBarItemStyle: { display: 'none' as const },
          }}
        />
        <Tab.Screen
          name="RekapPresensiGerbang"
          component={GateAttendanceTerminalScreen}
          options={{
            headerShown: false,
            tabBarButton: () => null,
            tabBarItemStyle: { display: 'none' as const },
          }}
        />
        <Tab.Screen
          name="PresensiKbmPengganti"
          component={SubstituteKbmAttendanceScreen}
          options={{
            headerShown: false,
            tabBarButton: () => null,
            tabBarItemStyle: { display: 'none' as const },
          }}
        />
        <Tab.Screen
          name="PresensiMandiriStaff"
          component={StaffSelfAttendanceScreen}
          options={{
            headerShown: false,
            tabBarButton: () => null,
            tabBarItemStyle: { display: 'none' as const },
          }}
        />
        <Tab.Screen
          name="PrincipalDashboard"
          component={PrincipalDashboardScreen}
          options={{
            headerShown: false,
            tabBarButton: () => null,
            tabBarItemStyle: { display: 'none' as const },
          }}
        />
        <Tab.Screen
          name="DashboardKepalaSekolah"
          component={PrincipalDashboardScreen}
          options={{
            headerShown: false,
            tabBarButton: () => null,
            tabBarItemStyle: { display: 'none' as const },
          }}
        />
        <Tab.Screen
          name="MasterSiswa"
          component={MasterSiswaScreen}
          options={{
            headerShown: false,
            tabBarButton: () => null,
            tabBarItemStyle: { display: 'none' as const },
          }}
        />
        <Tab.Screen
          name="MutasiSiswa"
          component={MutasiSiswaScreen}
          options={{
            headerShown: false,
            tabBarButton: () => null,
            tabBarItemStyle: { display: 'none' as const },
          }}
        />
        <Tab.Screen
          name="KelolaAlumni"
          component={MutasiSiswaScreen}
          options={{
            headerShown: false,
            tabBarButton: () => null,
            tabBarItemStyle: { display: 'none' as const },
          }}
        />
        <Tab.Screen
          name="PantauKelas"
          component={PantauKelasScreen}
          options={{
            headerShown: false,
            tabBarButton: () => null,
            tabBarItemStyle: { display: 'none' as const },
          }}
        />
      </Tab.Navigator>
      <InAppNotificationBanner
        onPressNotification={(data: any) => {
          try {
            if (data?.screen === 'QR Code' || data?.scheduleId) {
              (navigationRef as any).navigate('QR Code', {
                schedule_id: data.scheduleId,
                kelas_id: data.classId,
                class_name: data.className,
                mode: 'manual',
              });
            } else if (data?.screen === 'Jadwal') {
              (navigationRef as any).navigate('Jadwal');
            } else if (data?.teacherId) {
              (navigationRef as any).navigate('Chat Guru', {
                teacherId: data.teacherId,
                studentId: data.studentId,
              });
            } else if (data?.screen === 'Notifikasi') {
              (navigationRef as any).navigate('Notifikasi');
            }
          } catch {}
        }}
      />
    </NavigationContainer>
  );
}

const moduleHeaderStyles = StyleSheet.create({
  headerOuterWrapper: {
    backgroundColor: '#FFFFFF',
    width: '100%',
  },
  gradientBar: {
    width: '100%',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.22)',
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 5,
  },
  decorCircle1: {
    position: 'absolute',
    top: -30,
    right: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  decorCircle2: {
    position: 'absolute',
    bottom: -20,
    left: 20,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
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

  /* Unified Header Styles */
  unifiedHeaderContainer: {
    width: '100%',
  },
  unifiedTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    width: '100%',
  },
  squircleBtn: {
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
  unifiedLeftIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 10,
  },
  studentAvatarSquircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  studentAvatarImg: {
    width: '100%',
    height: '100%',
  },
  headerIdentityTextCol: {
    flex: 1,
    marginLeft: 10,
  },
  headerModuleTitleText: {
    fontSize: 15.5,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  headerStudentSubnameText: {
    fontSize: 11.5,
    fontWeight: '600',
    fontFamily: 'Nunito_600SemiBold',
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 1,
  },

  /* Integrated Card Styles */
  integratedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  integratedCardMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  integratedCardInfoCol: {
    flex: 1,
    marginRight: 8,
  },
  integratedCardStudentName: {
    fontSize: 14.5,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  integratedBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  unitClassBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  unitClassBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Nunito_600SemiBold',
    color: '#047857',
  },
  nisBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  nisBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Nunito_600SemiBold',
    color: '#64748B',
  },
  activeStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
  },
  activeStatusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
    marginLeft: 3.5,
  },
  childSwitcherSection: {
    marginTop: 8,
  },
  childSwitcherDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginBottom: 8,
  },
  childSwitcherRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  childSwitcherLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
    marginRight: 6,
  },
  childChipsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  childChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  childChipActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  childChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  childChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
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

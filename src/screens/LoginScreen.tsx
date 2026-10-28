import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeRemoteImage } from '../components/SafeRemoteImage';
import { getApiErrorMessage } from '../services/api';
import { mobileApiService } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { useMobileConfigStore } from '../stores/mobileConfigStore';
import { biometricService, BiometricSessionData } from '../services/biometricService';
import { AppFeedbackModal, FeedbackType } from '../components/AppFeedbackModal';
import ServerSwitchModal from '../components/ServerSwitchModal';

let CameraViewComponent: any = null;
let useCameraPermissionsHook: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cam = require('expo-camera');
  CameraViewComponent = cam.CameraView || null;
  useCameraPermissionsHook = cam.useCameraPermissions || null;
} catch {
  CameraViewComponent = null;
  useCameraPermissionsHook = null;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const PARENT_HOME_BG = require('../../assets/parent_home_bg.jpg');

const roleNames = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.map((item) => typeof item === 'string' ? item : (item as { name?: string })?.name).filter(Boolean) as string[]
    : []
);

export default function LoginScreen() {
  const setSession = useAuthStore((state) => state.setSession);
  const config = useMobileConfigStore((state) => state.config);
  const branding = config.branding || {};

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [error, setError] = useState('');

  const [serverModalVisible, setServerModalVisible] = useState(false);
  const [logoTapCount, setLogoTapCount] = useState(0);
  const lastLogoTapRef = React.useRef(0);

  const handleLogoTap = () => {
    const now = Date.now();
    if (now - lastLogoTapRef.current > 3000) {
      setLogoTapCount(1);
    } else {
      const nextCount = logoTapCount + 1;
      setLogoTapCount(nextCount);
      if (nextCount >= 5) {
        setLogoTapCount(0);
        setServerModalVisible(true);
      }
    }
    lastLogoTapRef.current = now;
  };

  const [storedBiometric, setStoredBiometric] = useState<BiometricSessionData | null>(null);
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [manualCode, setManualCode] = useState('');

  // Camera permissions hook & auto-request
  const [camPermission, requestCamPermission] = useCameraPermissionsHook
    ? useCameraPermissionsHook()
    : [null, async () => ({ granted: true })];

  useEffect(() => {
    if (qrModalVisible && useCameraPermissionsHook && (!camPermission || !camPermission.granted)) {
      requestCamPermission();
    }
  }, [qrModalVisible, camPermission, requestCamPermission]);

  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
  } | null>(null);

  useEffect(() => {
    async function checkBiometrics() {
      const saved = await biometricService.getStoredSession();
      if (saved) {
        setStoredBiometric(saved);
        if (!identifier) {
          setIdentifier(saved.identifier || '');
        }
      }
    }
    void checkBiometrics();
  }, []);

  const handleBiometricLogin = async () => {
    if (!storedBiometric) {
      setFeedbackModal({
        visible: true,
        type: 'info',
        title: 'Login Biometrik',
        message: 'Silakan masukkan Email / Username dan Password Anda sekali ini terlebih dahulu untuk mengaktifkan akses sidik jari / Face ID pada perangkat ini.',
      });
      return;
    }

    setBiometricLoading(true);
    setError('');

    try {
      const authResult = await biometricService.authenticate(
        `Masuk sebagai ${storedBiometric.user?.name || storedBiometric.identifier}`
      );

      if (authResult.success) {
        setSession({
          token: storedBiometric.token,
          user: storedBiometric.user,
          roles: storedBiometric.roles,
          permissions: storedBiometric.permissions,
          portal: storedBiometric.portal,
          scope: storedBiometric.scope as any,
        });

        // Sync with server profile to ensure session is still valid
        try {
          const meProfile = await mobileApiService.getProfile();
          useAuthStore.getState().syncServerProfile(meProfile);
        } catch {
          // Fallback to cached biometric session
        }
      } else if (authResult.message) {
        setError(authResult.message);
      }
    } catch {
      setError('Verifikasi biometrik gagal atau dibatalkan.');
    } finally {
      setBiometricLoading(false);
    }
  };

  const handleScanSuccess = (scannedData: string) => {
    setQrModalVisible(false);
    if (!scannedData || typeof scannedData !== 'string') return;

    try {
      const trimmed = scannedData.trim();
      if (trimmed.startsWith('{')) {
        const parsed = JSON.parse(trimmed);
        if (parsed.token) {
          setSession({
            token: parsed.token,
            user: parsed.user || null,
            roles: roleNames(parsed.roles),
            permissions: roleNames(parsed.permissions),
            portal: parsed.portal,
            scope: parsed.scope,
          });
          return;
        }
        if (parsed.identifier || parsed.username || parsed.email) {
          setIdentifier(parsed.identifier || parsed.username || parsed.email);
          if (parsed.password) {
            setPassword(parsed.password);
          }
          return;
        }
      }

      setIdentifier(trimmed);
      setFeedbackModal({
        visible: true,
        type: 'success',
        title: 'Kode Berhasil Dipindai',
        message: `Kode ID kartu ${trimmed} telah dimasukkan. Silakan masukkan kata sandi untuk masuk.`,
      });
    } catch {
      setIdentifier(scannedData.trim());
    }
  };

  const submit = async () => {
    if (!identifier.trim() || !password) {
      setError('Identitas pengguna dan kata sandi wajib diisi.');
      return;
    }

    if (password.length < 8) {
      setError('Kata sandi minimal terdiri dari 8 karakter.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await mobileApiService.login(identifier.trim(), password);
      const user = response?.user?.data ?? response?.user ?? null;
      const roles = roleNames(user?.roles ?? response?.roles);
      const permissions = roleNames(user?.permissions ?? response?.permissions);

      const sessionData = {
        token: response?.token,
        user,
        roles,
        permissions,
        portal: response?.portal ?? response?.default_portal,
        scope: user?.scope ?? response?.scope,
      };

      setSession(sessionData);

      // Save for subsequent biometric one-touch login
      if (rememberMe && response?.token) {
        void biometricService.saveSession({
          identifier: identifier.trim(),
          ...sessionData,
        });
      }

      // Verify Sanctum token with /api/auth/me immediately after login
      try {
        const meProfile = await mobileApiService.getProfile();
        useAuthStore.getState().syncServerProfile(meProfile);
      } catch {
        // Fallback to initial login session if /me profile fetch fails concurrently
      }
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Identitas atau kata sandi tidak sesuai.'));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    setFeedbackModal({
      visible: true,
      type: 'info',
      title: 'Lupa Kata Sandi',
      message: 'Silakan hubungi administrator sekolah atau wali kelas untuk melakukan reset kata sandi akun Anda.',
    });
  };

  const handleContactAdmin = () => {
    const adminPhone = (branding as any).admin_whatsapp || (branding as any).contact_phone || (branding as any).phone || '';
    if (!adminPhone) {
      setFeedbackModal({
        visible: true,
        type: 'info',
        title: 'Bantuan Pendaftaran',
        message: 'Pendaftaran akun dilakukan oleh pihak Tata Usaha / Admin Sekolah. Silakan hubungi tata usaha sekolah Anda.',
      });
      return;
    }
    setFeedbackModal({
      visible: true,
      type: 'confirm',
      title: 'Bantuan Pendaftaran',
      message: 'Pendaftaran akun dilakukan oleh pihak Tata Usaha / Admin Sekolah. Hubungi admin via WhatsApp sekarang?',
      confirmText: 'Hubungi WhatsApp',
      cancelText: 'Batal',
      onConfirm: () => {
        setFeedbackModal(null);
        const clean = adminPhone.replace(/[^0-9]/g, '');
        void Linking.openURL(`https://wa.me/${clean}?text=Assalamu'alaikum%20Admin,%20saya%20butuh%20bantuan%20akun%20SIMSIT`);
      },
    });
  };

  const loginLogoUrl = branding.logo_login_url || branding.logo_url;
  const appName = branding.app_name || 'SIMSIT Mobile';
  const schoolName = branding.school_name || '';

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Background Image Ilustrasi Gedung Sekolah & Masjid (Identik dengan Splash Screen) */}
      <Image
        source={PARENT_HOME_BG}
        style={[StyleSheet.absoluteFill, styles.bgImage]}
        resizeMode="cover"
      />
      {/* Overlay gradien halus berbasis warna #18A165 identik dengan splash screen */}
      <LinearGradient
        colors={['rgba(24, 161, 101, 0.35)', 'rgba(24, 161, 101, 0.72)', 'rgba(18, 128, 80, 0.94)']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header Branding Container */}
        <View style={styles.brandingSection}>
          {/* Circular/Squircle Card with logo (Matching Splash Screen 1) */}
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={handleLogoTap}
            style={styles.logoCardOuter}
          >
            {loginLogoUrl ? (
              <SafeRemoteImage
                url={loginLogoUrl}
                style={styles.logoImage}
                resizeMode="contain"
                alt={appName}
              />
            ) : (
              <Image
                source={require('../../assets/launcher_source.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            )}
          </TouchableOpacity>

          {/* School Name Typography (White high-contrast on emerald background) */}
          <Text style={styles.brandTitle}>{appName}</Text>
          <Text style={styles.brandSubtitle}>{schoolName}</Text>

          {/* Value Tagline Pill Badge (Identik dengan Splash Screen) */}
          <View style={styles.taglineBadge}>
            <MaterialCommunityIcons
              name="creation"
              size={14}
              color="#FFFFFF"
              style={styles.taglineBadgeIcon}
            />
            <Text style={styles.taglineBadgeText}>
              Islami · Pendidikan · Berkarakter
            </Text>
          </View>
        </View>

        {/* Login Form Card */}
        <View style={styles.formContainer}>
          {/* Greetings inside crisp elevated white card */}
          <Text style={styles.welcomeGreeting}>Selamat Datang 👋</Text>
          <Text style={styles.welcomeSubtitle}>Silahkan login untuk melanjutkan</Text>
          {error ? (
            <View style={styles.errorAlert}>
              <MaterialCommunityIcons name="alert-circle" size={18} color="#DC2626" />
              <Text style={styles.errorAlertText}>{error}</Text>
            </View>
          ) : null}

          {/* Identifier Input (Email / Username) */}
          <View style={styles.inputWrapper}>
            <MaterialCommunityIcons
              name="email-outline"
              size={20}
              color="#94A3B8"
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.textInput}
              placeholder="Email / Username"
              placeholderTextColor="#94A3B8"
              value={identifier}
              onChangeText={(text) => {
                setIdentifier(text);
                if (error) setError('');
              }}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />
          </View>

          {/* Password Input */}
          <View style={styles.inputWrapper}>
            <MaterialCommunityIcons
              name="lock-outline"
              size={20}
              color="#94A3B8"
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.textInput}
              placeholder="Password"
              placeholderTextColor="#94A3B8"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (error) setError('');
              }}
              returnKeyType="done"
              onSubmitEditing={submit}
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeButton}
              accessibilityLabel="Tampilkan kata sandi"
            >
              <MaterialCommunityIcons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color="#94A3B8"
              />
            </TouchableOpacity>
          </View>

          {/* Options Row: Remember Me & Forgot Password */}
          <View style={styles.optionsRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setRememberMe(!rememberMe)}
              style={styles.rememberRow}
            >
              <View style={[styles.checkboxBox, rememberMe && styles.checkboxBoxActive]}>
                {rememberMe && (
                  <MaterialCommunityIcons name="check" size={13} color="#FFFFFF" />
                )}
              </View>
              <Text style={styles.rememberText}>Ingat saya</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleForgotPassword} activeOpacity={0.7}>
              <Text style={styles.forgotText}>Lupa password?</Text>
            </TouchableOpacity>
          </View>

          {/* Login Button */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={submit}
            disabled={loading || biometricLoading}
            style={[styles.loginButton, (loading || biometricLoading) && styles.loginButtonDisabled]}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.loginButtonText}>Login</Text>
            )}
          </TouchableOpacity>

          {/* OR DIVIDER */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>atau login cepat dengan</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* 2-COLUMN ACTION ROW: BIOMETRIC & QR CODE */}
          <View style={styles.twoColumnRow}>
            {/* Column 1: Biometric Login */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleBiometricLogin}
              disabled={loading || biometricLoading}
              style={styles.twoColumnCard}
            >
              <View style={styles.columnIconBadge}>
                {biometricLoading ? (
                  <ActivityIndicator color="#18A165" size="small" />
                ) : (
                  <MaterialCommunityIcons name="fingerprint" size={26} color="#18A165" />
                )}
              </View>
              <Text style={styles.columnCardTitle}>Biometrik</Text>
              <Text numberOfLines={1} style={styles.columnCardSub}>
                {storedBiometric ? 'Sidik Jari / Wajah' : 'Login Cepat'}
              </Text>
            </TouchableOpacity>

            {/* Column 2: Scan QR Code */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setQrModalVisible(true)}
              disabled={loading || biometricLoading}
              style={styles.twoColumnCard}
            >
              <View style={styles.columnIconBadge}>
                <MaterialCommunityIcons name="qrcode-scan" size={24} color="#18A165" />
              </View>
              <Text style={styles.columnCardTitle}>Scan QR Code</Text>
              <Text numberOfLines={1} style={styles.columnCardSub}>
                Pindai Kartu / QR
              </Text>
            </TouchableOpacity>
          </View>

          {/* Footer Admin Link */}
          <View style={styles.footerRow}>
            <Text style={styles.footerPrompt}>Belum punya akun? </Text>
            <TouchableOpacity onPress={handleContactAdmin} activeOpacity={0.7}>
              <Text style={styles.footerLink}>Hubungi Admin</Text>
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>

      {/* QR SCANNER MODAL */}
      <Modal
        visible={qrModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setQrModalVisible(false)}
      >
        <SafeAreaView style={styles.qrModalContainer}>
          <View style={styles.qrModalHeader}>
            <TouchableOpacity
              onPress={() => setQrModalVisible(false)}
              style={styles.qrBackButton}
            >
              <MaterialCommunityIcons name="arrow-left" size={24} color="#1E293B" />
            </TouchableOpacity>
            <Text style={styles.qrModalTitle}>Pindai QR Code Kartu / Akun</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.qrBody}>
            {CameraViewComponent && camPermission?.granted ? (
              <View style={styles.cameraFrame}>
                <CameraViewComponent
                  style={StyleSheet.absoluteFill}
                  barcodeScannerSettings={{
                    barcodeTypes: ['qr'],
                  }}
                  onBarcodeScanned={({ data }: { data: string }) => handleScanSuccess(data)}
                />
                {/* Viewfinder overlay */}
                <View style={styles.viewfinderBox}>
                  <View style={[styles.corner, styles.topLeft]} />
                  <View style={[styles.corner, styles.topRight]} />
                  <View style={[styles.corner, styles.bottomLeft]} />
                  <View style={[styles.corner, styles.bottomRight]} />
                </View>
              </View>
            ) : CameraViewComponent && !camPermission?.granted ? (
              <View style={styles.qrPlaceholderBox}>
                <MaterialCommunityIcons name="camera-lock-outline" size={70} color="#084835" />
                <Text style={styles.qrNoticeTitle}>Izin Kamera Diperlukan</Text>
                <Text style={styles.qrNoticeText}>
                  Izinkan akses kamera di perangkat Anda untuk memindai QR Code kartu secara otomatis.
                </Text>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#059669',
                    paddingHorizontal: 18,
                    paddingVertical: 9,
                    borderRadius: 10,
                    marginTop: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                  onPress={() => requestCamPermission()}
                >
                  <MaterialCommunityIcons name="camera" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>Aktifkan Kamera</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.qrPlaceholderBox}>
                <MaterialCommunityIcons name="qrcode-scan" size={84} color="#084835" />
                <Text style={styles.qrNoticeTitle}>Pemindai QR Code</Text>
                <Text style={styles.qrNoticeText}>
                  Arahkan kamera pada QR Code kartu pelajar / kartu pegawai sekolah.
                </Text>
              </View>
            )}

            {/* Manual input fallback */}
            <View style={styles.manualInputSection}>
              <Text style={styles.manualInputLabel}>Atau Masukkan Kode Kartu Manual:</Text>
              <View style={styles.manualInputRow}>
                <TextInput
                  style={styles.manualInput}
                  placeholder="Contoh: KODE-SISWA-001"
                  placeholderTextColor="#94A3B8"
                  value={manualCode}
                  onChangeText={setManualCode}
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  style={styles.manualSubmitButton}
                  onPress={() => {
                    if (manualCode.trim()) {
                      handleScanSuccess(manualCode.trim());
                    }
                  }}
                >
                  <Text style={styles.manualSubmitText}>Terapkan</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Universal Feedback Modal */}
      {feedbackModal && (
        <AppFeedbackModal
          visible={feedbackModal.visible}
          type={feedbackModal.type || 'info'}
          title={feedbackModal.title}
          message={feedbackModal.message}
          confirmText={feedbackModal.confirmText}
          cancelText={feedbackModal.cancelText}
          onConfirm={feedbackModal.onConfirm}
          onClose={() => setFeedbackModal(null)}
        />
      )}

      {/* Dynamic Server Switcher Modal */}
      <ServerSwitchModal
        visible={serverModalVisible}
        onClose={() => setServerModalVisible(false)}
        onSuccess={(newUrl) => {
          setError('');
          setFeedbackModal({
            visible: true,
            type: 'success',
            title: 'Server Diperbarui',
            message: `Koneksi API berhasil dialihkan ke:\n${newUrl}`,
            confirmText: 'OK',
            onConfirm: () => setFeedbackModal(null),
          });
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#18A165',
  },
  bgImage: {
    width: '100%',
    height: '100%',
    opacity: 0.88,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 36,
  },
  brandingSection: {
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : 42,
    paddingHorizontal: 24,
  },
  logoCardOuter: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 6,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    overflow: 'hidden',
  },
  logoImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.5,
    textAlign: 'center',
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  brandSubtitle: {
    fontSize: 13.5,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.95)',
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 2,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  taglineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18A165',
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 16,
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.65)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.20,
    shadowRadius: 6,
    elevation: 4,
  },
  taglineBadgeIcon: {
    marginRight: 6,
  },
  taglineBadgeText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  formContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    marginHorizontal: 20,
    marginTop: 22,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 22,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 8,
    zIndex: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
  },
  welcomeGreeting: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1E293B',
    textAlign: 'center',
  },
  welcomeSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 4,
    marginBottom: 20,
    textAlign: 'center',
  },
  errorAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorAlertText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#B91C1C',
    lineHeight: 16,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    height: 52,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    paddingVertical: 0,
  },
  eyeButton: {
    padding: 6,
  },
  optionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 20,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxActive: {
    backgroundColor: '#18A165',
    borderColor: '#18A165',
  },
  rememberText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
  },
  forgotText: {
    fontSize: 13,
    color: '#18A165',
    fontWeight: '700',
  },
  loginButton: {
    height: 50,
    borderRadius: 14,
    backgroundColor: '#18A165',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#18A165',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  dividerText: {
    paddingHorizontal: 12,
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  twoColumnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    width: '100%',
  },
  twoColumnCard: {
    width: '48.2%',
    minHeight: 124,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  columnIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EBF8F2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(24, 161, 101, 0.22)',
    marginBottom: 8,
  },
  columnCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
  },
  columnCardSub: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
    textAlign: 'center',
    fontWeight: '500',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  footerPrompt: {
    fontSize: 13,
    color: '#64748B',
  },
  footerLink: {
    fontSize: 13,
    fontWeight: '800',
    color: '#18A165',
  },
  qrModalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  qrModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  qrBackButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrModalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
  },
  qrBody: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
  },
  cameraFrame: {
    width: '100%',
    height: 320,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  viewfinderBox: {
    width: 200,
    height: 200,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#10B981',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  qrPlaceholderBox: {
    width: '100%',
    paddingVertical: 40,
    paddingHorizontal: 24,
    borderRadius: 20,
    backgroundColor: '#F2FBF7',
    borderWidth: 1.5,
    borderColor: '#C3E5D9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrNoticeTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#084835',
    marginTop: 14,
  },
  qrNoticeText: {
    fontSize: 13,
    color: '#4B6B5D',
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 6,
  },
  manualInputSection: {
    width: '100%',
    marginTop: 28,
  },
  manualInputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 8,
  },
  manualInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  manualInput: {
    flex: 1,
    height: 48,
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 13,
    backgroundColor: '#F8FAFC',
    color: '#0F172A',
  },
  manualSubmitButton: {
    height: 48,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: '#18A165',
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualSubmitText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
});

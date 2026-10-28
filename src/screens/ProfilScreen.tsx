import React, { useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { mobileApiService } from '../services/mobileApiService';
import { AuthUser, useAuthStore } from '../stores/authStore';
import { useMobileConfigStore } from '../stores/mobileConfigStore';
import { useActiveChildStore } from '../stores/activeChildStore';
import { useNotificationBadgeStore } from '../stores/notificationBadgeStore';
import { navigationHistory } from '../stores/navigationHistoryStore';
import {
  isParentRole,
  isStudentRole,
  isAlumniRole,
  isPrincipalRole,
  isFoundationRole,
  isSuperAdminRole,
  isTuRole,
  isTeacherRole,
  roleLabel,
} from '../utils/roles';
import {
  getProfileImageUrl,
  resolveMediaUrl,
  DEFAULT_PARENT_AVATAR,
  DEFAULT_STUDENT_BOY_AVATAR,
  DEFAULT_STUDENT_GIRL_AVATAR,
  isGirlStudent,
} from '../utils/profile';
import { AppFeedbackModal, FeedbackType } from '../components/AppFeedbackModal';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PARENT_HOME_BG = require('../../assets/parent_home_bg.jpg');

const displayValue = (value: unknown, fallback = '-') => {
  if (!value) return fallback;
  if (typeof value === 'object') return (value as any)?.name || (value as any)?.nama || fallback;
  return String(value);
};

const formatDateSafe = (dateStr: any) => {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return String(dateStr);
  }
};

type TabType = 'biodata' | 'edit_profil' | 'keamanan' | 'sesi';

interface MenuButtonItem {
  id: TabType;
  title: string;
  subtitle: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  iconColor: string;
  iconBg: string;
}

type InfoRowProps = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  isLast?: boolean;
};

function InfoRow({ icon, iconBg, iconColor, label, value, isLast }: InfoRowProps) {
  const safeValue = typeof value === 'object' && value !== null
    ? ((value as any)?.name || (value as any)?.nama || (value as any)?.unit_name || '-')
    : String(value ?? '-');

  return (
    <View style={[styles.infoRow, isLast && styles.infoRowLast]}>
      <View style={[styles.infoIconBadge, { backgroundColor: iconBg }]}>
        <MaterialCommunityIcons name={icon} size={16} color={iconColor} />
      </View>
      <View style={styles.infoTextCol}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue} numberOfLines={2}>{safeValue}</Text>
      </View>
    </View>
  );
}

export default function ProfilScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 12);

  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const roles = useAuthStore((state) => state.roles);
  const scope = useAuthStore((state) => state.scope);
  const setUser = useAuthStore((state) => state.setUser);
  const clearSession = useAuthStore((state) => state.clearSession);

  // Active child store sync
  const storeActiveChildId = useActiveChildStore((state) => state.activeChildId);
  const setActiveChildIdInStore = useActiveChildStore((state) => state.setActiveChildId);
  const unreadNotificationCount = useNotificationBadgeStore((state) => state.unreadNotificationCount);

  const [loading, setLoading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [activeTab, setActiveTab] = useState<TabType>('biodata');

  // Multi-child for parent
  const [children, setChildren] = useState<any[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>();

  // Feedback Modal state
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
  } | null>(null);

  // Form Edit Profil state
  const employee = useMemo(() => (user?.employee || {}) as Record<string, any>, [user]);
  const [namaLengkap, setNamaLengkap] = useState('');
  const [gelarDepan, setGelarDepan] = useState('');
  const [gelarBelakang, setGelarBelakang] = useState('');
  const [namaPanggilan, setNamaPanggilan] = useState('');
  const [phone, setPhone] = useState('');
  const [tempatLahir, setTempatLahir] = useState('');
  const [tanggalLahir, setTanggalLahir] = useState('');
  const [jenisKelamin, setJenisKelamin] = useState<'L' | 'P'>('L');
  const [agama, setAgama] = useState('Islam');
  const [alamat, setAlamat] = useState('');

  // Form Email & Password state
  const [emailInput, setEmailInput] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  const isParent = isParentRole(roles);
  const isStudent = isStudentRole(roles);
  const isAlumni = isAlumniRole(roles);
  const isPrincipal = isPrincipalRole(roles);
  const isFoundation = isFoundationRole(roles) || isSuperAdminRole(roles);
  const isTu = isTuRole(roles);
  const isTeacher = isTeacherRole(roles);
  const isTeacherOrEmployee = !isStudent && !isParent && !isAlumni;

  const handleBack = () => {
    const handled = navigationHistory.goBackDynamic(navigation);
    if (!handled) {
      if (typeof navigation?.goBack === 'function' && navigation.canGoBack()) {
        navigation.goBack();
        return;
      }
      if (typeof navigation?.navigate === 'function') {
        navigation.navigate('Beranda');
      }
    }
  };

  const menuButtons: MenuButtonItem[] = useMemo(() => {
    if (isParent) {
      return [
        {
          id: 'biodata',
          title: 'Biodata & Santri',
          subtitle: 'Data wali & ananda',
          icon: 'account-child-outline',
          iconColor: '#059669',
          iconBg: '#DCFCE7',
        },
        {
          id: 'edit_profil',
          title: 'Ubah Data',
          subtitle: 'Edit kontak & domisili',
          icon: 'account-edit-outline',
          iconColor: '#D97706',
          iconBg: '#FEF3C7',
        },
        {
          id: 'keamanan',
          title: 'Password & Email',
          subtitle: 'Keamanan kata sandi',
          icon: 'shield-key-outline',
          iconColor: '#2563EB',
          iconBg: '#EFF6FF',
        },
        {
          id: 'sesi',
          title: 'Sesi & Akun',
          subtitle: 'Info akun & keluar',
          icon: 'cellphone-lock',
          iconColor: '#7C3AED',
          iconBg: '#F5F3FF',
        },
      ];
    }

    if (isStudent) {
      return [
        {
          id: 'biodata',
          title: 'Biodata Siswa',
          subtitle: 'Data santri & kelas',
          icon: 'school-outline',
          iconColor: '#059669',
          iconBg: '#DCFCE7',
        },
        {
          id: 'edit_profil',
          title: 'Ubah Data',
          subtitle: 'Edit kontak & domisili',
          icon: 'account-edit-outline',
          iconColor: '#D97706',
          iconBg: '#FEF3C7',
        },
        {
          id: 'keamanan',
          title: 'Password & Email',
          subtitle: 'Keamanan kata sandi',
          icon: 'shield-key-outline',
          iconColor: '#2563EB',
          iconBg: '#EFF6FF',
        },
        {
          id: 'sesi',
          title: 'Sesi & Akun',
          subtitle: 'Info akun & keluar',
          icon: 'cellphone-lock',
          iconColor: '#7C3AED',
          iconBg: '#F5F3FF',
        },
      ];
    }

    if (isAlumni) {
      return [
        {
          id: 'biodata',
          title: 'Biodata Alumni',
          subtitle: 'Data kelulusan & kontak',
          icon: 'account-school-outline',
          iconColor: '#0D9488',
          iconBg: '#E6FFFA',
        },
        {
          id: 'edit_profil',
          title: 'Ubah Data',
          subtitle: 'Edit kontak & profesi',
          icon: 'account-edit-outline',
          iconColor: '#D97706',
          iconBg: '#FEF3C7',
        },
        {
          id: 'keamanan',
          title: 'Password & Email',
          subtitle: 'Keamanan kata sandi',
          icon: 'shield-key-outline',
          iconColor: '#2563EB',
          iconBg: '#EFF6FF',
        },
        {
          id: 'sesi',
          title: 'Sesi & Akun',
          subtitle: 'Info akun & keluar',
          icon: 'cellphone-lock',
          iconColor: '#7C3AED',
          iconBg: '#F5F3FF',
        },
      ];
    }

    if (isFoundation) {
      return [
        {
          id: 'biodata',
          title: 'Biodata Pimpinan',
          subtitle: 'Informasi otoritas yayasan',
          icon: 'shield-account-outline',
          iconColor: '#059669',
          iconBg: '#DCFCE7',
        },
        {
          id: 'edit_profil',
          title: 'Ubah Data',
          subtitle: 'Edit biodata & kontak',
          icon: 'account-edit-outline',
          iconColor: '#D97706',
          iconBg: '#FEF3C7',
        },
        {
          id: 'keamanan',
          title: 'Password & Email',
          subtitle: 'Keamanan kata sandi',
          icon: 'shield-key-outline',
          iconColor: '#2563EB',
          iconBg: '#EFF6FF',
        },
        {
          id: 'sesi',
          title: 'Sesi & Akun',
          subtitle: 'Info akun & keluar',
          icon: 'cellphone-lock',
          iconColor: '#7C3AED',
          iconBg: '#F5F3FF',
        },
      ];
    }

    if (isPrincipal) {
      return [
        {
          id: 'biodata',
          title: 'Kepala Sekolah',
          subtitle: 'Pimpinan eksekutif unit',
          icon: 'shield-check-outline',
          iconColor: '#059669',
          iconBg: '#DCFCE7',
        },
        {
          id: 'edit_profil',
          title: 'Ubah Data',
          subtitle: 'Edit biodata & kontak',
          icon: 'account-edit-outline',
          iconColor: '#D97706',
          iconBg: '#FEF3C7',
        },
        {
          id: 'keamanan',
          title: 'Password & Email',
          subtitle: 'Keamanan kata sandi',
          icon: 'shield-key-outline',
          iconColor: '#2563EB',
          iconBg: '#EFF6FF',
        },
        {
          id: 'sesi',
          title: 'Sesi & Akun',
          subtitle: 'Info akun & keluar',
          icon: 'cellphone-lock',
          iconColor: '#7C3AED',
          iconBg: '#F5F3FF',
        },
      ];
    }

    if (isTu) {
      return [
        {
          id: 'biodata',
          title: 'Biodata Pegawai',
          subtitle: 'Data staf administrasi',
          icon: 'card-account-details-outline',
          iconColor: '#059669',
          iconBg: '#DCFCE7',
        },
        {
          id: 'edit_profil',
          title: 'Ubah Data',
          subtitle: 'Edit biodata & kontak',
          icon: 'account-edit-outline',
          iconColor: '#D97706',
          iconBg: '#FEF3C7',
        },
        {
          id: 'keamanan',
          title: 'Password & Email',
          subtitle: 'Keamanan kata sandi',
          icon: 'shield-key-outline',
          iconColor: '#2563EB',
          iconBg: '#EFF6FF',
        },
        {
          id: 'sesi',
          title: 'Sesi & Akun',
          subtitle: 'Info akun & keluar',
          icon: 'cellphone-lock',
          iconColor: '#7C3AED',
          iconBg: '#F5F3FF',
        },
      ];
    }

    // Role Guru / Tenaga Pendidik
    return [
      {
        id: 'biodata',
        title: 'Biodata Guru',
        subtitle: 'Data profil & tugas',
        icon: 'card-account-details-outline',
        iconColor: '#059669',
        iconBg: '#DCFCE7',
      },
      {
        id: 'edit_profil',
        title: 'Ubah Data',
        subtitle: 'Edit biodata & kontak',
        icon: 'account-edit-outline',
        iconColor: '#D97706',
        iconBg: '#FEF3C7',
      },
      {
        id: 'keamanan',
        title: 'Password & Email',
        subtitle: 'Keamanan kata sandi',
        icon: 'shield-key-outline',
        iconColor: '#2563EB',
        iconBg: '#EFF6FF',
      },
      {
        id: 'sesi',
        title: 'Sesi & Akun',
        subtitle: 'Info akun & keluar',
        icon: 'cellphone-lock',
        iconColor: '#7C3AED',
        iconBg: '#F5F3FF',
      },
    ];
  }, [isParent, isStudent, isAlumni, isFoundation, isPrincipal, isTu]);

  // Sync form inputs from user / employee object
  const syncFormData = (userData: any) => {
    const emp = userData?.employee || {};
    setNamaLengkap(emp?.nama_lengkap || userData?.name || userData?.fullName || '');
    setGelarDepan(emp?.gelar_depan || '');
    setGelarBelakang(emp?.gelar_belakang || '');
    setNamaPanggilan(emp?.nama_panggilan || '');
    setPhone(emp?.no_hp || userData?.phone || '');
    setTempatLahir(emp?.tempat_lahir || '');
    setTanggalLahir(emp?.tanggal_lahir ? String(emp.tanggal_lahir).split('T')[0] : '');
    setJenisKelamin(emp?.jenis_kelamin === 'P' || emp?.jenis_kelamin === 'Perempuan' ? 'P' : 'L');
    setAgama(emp?.agama || 'Islam');
    setAlamat(emp?.alamat || userData?.address || '');
    setEmailInput(userData?.email || emp?.email || '');
  };

  useEffect(() => {
    if (user) {
      syncFormData(user);
    }
  }, [user]);

  const loadFreshProfile = () => {
    if (!token) return;
    setLoading(true);
    mobileApiService
      .getProfile()
      .then((response) => {
        const profile = response?.data?.data ?? response?.data ?? response;
        if (profile) {
          setUser(profile as AuthUser);
          syncFormData(profile);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    if (isParent) {
      mobileApiService
        .getPortalChildren()
        .then((res) => {
          const raw = res?.data ?? res;
          const available = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
          setChildren(available);
          if (available.length > 0) {
            const initialId = storeActiveChildId && available.some((c: any) => String(c.id) === String(storeActiveChildId))
              ? storeActiveChildId
              : String(available[0].id);
            setSelectedChildId(initialId);
            if (!storeActiveChildId) {
              setActiveChildIdInStore(initialId);
            }
          }
        })
        .catch(() => {});
    }
  };

  useEffect(() => {
    loadFreshProfile();
  }, [token, isParent]);

  // Keep selected child synced if store changes
  useEffect(() => {
    if (storeActiveChildId && storeActiveChildId !== selectedChildId) {
      setSelectedChildId(storeActiveChildId);
    }
  }, [storeActiveChildId]);

  const handleSelectChild = (childId: string) => {
    setSelectedChildId(childId);
    setActiveChildIdInStore(childId);
  };

  const unitName: string = useMemo(() => {
    const raw =
      (user?.unit as any)?.name ||
      (typeof user?.unit === 'string' ? user?.unit : null) ||
      (user as any)?.education_unit?.name ||
      (typeof (user as any)?.education_unit === 'string' ? (user as any)?.education_unit : null) ||
      (user?.metadata as any)?.unit_name ||
      employee?.unit?.name ||
      (typeof employee?.unit === 'string' ? employee?.unit : null) ||
      employee?.education_unit?.name ||
      'Unit Pendidikan Terpadu';
    return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : 'Unit Pendidikan Terpadu';
  }, [user, employee]);

  const niyOrNip = employee?.niy || employee?.nik || scope?.employee_id || '-';
  const jabatanName = (isParent ? 'Orang Tua / Wali Santri' : employee?.position?.name) || roleLabel(roles);
  const profileImageUrl = getProfileImageUrl(user);
  const currentChild = children.find((c) => String(c.id) === String(selectedChildId)) || children[0];

  const activeAcademicPeriod = useMemo(() => {
    const ay =
      (user as any)?.academic_year?.name ||
      user?.academic_year ||
      (user as any)?.tahun_ajaran?.nama ||
      (user as any)?.tahun_ajaran ||
      (user?.metadata as any)?.academic_year ||
      (user?.metadata as any)?.tahun_ajaran ||
      employee?.academic_year?.name ||
      employee?.academic_year ||
      employee?.tahun_ajaran?.nama ||
      employee?.tahun_ajaran ||
      '';
    const sem =
      (user as any)?.semester?.name ||
      (user as any)?.semester ||
      (user?.metadata as any)?.semester ||
      employee?.semester?.name ||
      employee?.semester ||
      '';
    if (ay && sem) return `${ay} (${sem})`;
    if (ay) return String(ay);
    return 'Tahun Ajaran Aktif';
  }, [user, employee]);

  // Pick and Upload Avatar
  const handlePickAndUploadAvatar = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        setFeedbackModal({
          visible: true,
          type: 'warning',
          title: 'Izin Galeri Diperlukan',
          message: 'Mohon izinkan akses ke galeri foto perangkat untuk memilih foto profil.',
          confirmText: 'Mengerti',
        });
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: true,
        aspect: [1, 1],
      });

      if (result.canceled || !result.assets || !result.assets[0]) return;

      const asset = result.assets[0];
      setUploadingAvatar(true);

      const formData = new FormData();
      const filename = asset.fileName || `avatar_${Date.now()}.jpg`;
      const match = /\.(\w+)$/.exec(filename);
      const mimeType = match ? `image/${match[1]}` : 'image/jpeg';

      formData.append('foto', {
        uri: asset.uri,
        name: filename,
        type: mimeType,
      } as any);

      const res = await mobileApiService.updateAvatar(formData);
      const updatedUser = res?.data ?? res;
      if (updatedUser) {
        setUser({ ...user, ...updatedUser });
      }
      loadFreshProfile();

      setFeedbackModal({
        visible: true,
        type: 'success',
        title: 'Foto Profil Berhasil Diperbarui',
        message: 'Foto profil baru Anda telah tersimpan dan diperbarui di sistem.',
        confirmText: 'Selesai',
      });
    } catch (err: any) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Mengunggah Foto',
        message: err?.response?.data?.message || err?.message || 'Terjadi kesalahan saat mengunggah foto profil.',
        confirmText: 'Tutup',
      });
    } finally {
      setUploadingAvatar(false);
    }
  };

  // Submit Update Profile
  const handleSaveProfile = async () => {
    if (!namaLengkap.trim()) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Nama Wajib Diisi',
        message: 'Mohon masukkan nama lengkap Anda.',
        confirmText: 'Periksa Kembali',
      });
      return;
    }

    setSavingProfile(true);
    try {
      const payload: Record<string, unknown> = {
        name: namaLengkap.trim(),
        fullName: namaLengkap.trim(),
        nama_panggilan: namaPanggilan.trim(),
        gelar_depan: gelarDepan.trim(),
        gelar_belakang: gelarBelakang.trim(),
        phone: phone.trim(),
        no_hp: phone.trim(),
        tempat_lahir: tempatLahir.trim(),
        tanggal_lahir: tanggalLahir.trim() || null,
        jenis_kelamin: jenisKelamin,
        agama: agama.trim(),
        alamat: alamat.trim(),
        email: emailInput.trim() || user?.email,
      };

      const res = await mobileApiService.updateProfile(payload);
      const updatedData = res?.data ?? res;
      if (updatedData) {
        setUser({ ...user, ...updatedData });
      }
      loadFreshProfile();

      setFeedbackModal({
        visible: true,
        type: 'success',
        title: 'Data Profil Berhasil Disimpan',
        message: 'Informasi biodata dan kontak profil Anda telah berhasil diperbarui.',
        confirmText: 'Bagus',
      });
    } catch (err: any) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Memperbarui Profil',
        message: err?.response?.data?.message || err?.message || 'Terjadi kesalahan saat memperbarui data profil.',
        confirmText: 'Tutup',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  // Submit Update Email
  const handleSaveEmail = async () => {
    const trimmed = emailInput.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@') || !trimmed.includes('.')) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Format Email Tidak Valid',
        message: 'Mohon masukkan alamat email yang benar dan valid.',
        confirmText: 'Periksa',
      });
      return;
    }

    setSavingEmail(true);
    try {
      await mobileApiService.updateProfile({ email: trimmed });
      setUser({ ...user, email: trimmed } as AuthUser);
      loadFreshProfile();

      setFeedbackModal({
        visible: true,
        type: 'success',
        title: 'Email Berhasil Diperbarui',
        message: 'Alamat email akun Anda telah berhasil diganti menjadi: ' + trimmed,
        confirmText: 'Alhamdulillah',
      });
    } catch (err: any) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Memperbarui Email',
        message: err?.response?.data?.message || err?.message || 'Email mungkin sudah digunakan oleh akun lain.',
        confirmText: 'Tutup',
      });
    } finally {
      setSavingEmail(false);
    }
  };

  // Submit Change Password
  const handleChangePassword = async () => {
    if (!currentPassword) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Password Saat Ini Diperlukan',
        message: 'Mohon masukkan kata sandi saat ini untuk verifikasi keamanan.',
        confirmText: 'Isi Password',
      });
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Password Terlalu Pendek',
        message: 'Password baru minimal harus terdiri dari 6 karakter.',
        confirmText: 'Ubah Password',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Konfirmasi Password Tidak Cocok',
        message: 'Password baru dan konfirmasi password harus sama persis.',
        confirmText: 'Periksa Kembali',
      });
      return;
    }

    setSavingPassword(true);
    try {
      await mobileApiService.changePassword({
        current_password: currentPassword,
        password: newPassword,
        password_confirmation: confirmPassword,
      });

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      setFeedbackModal({
        visible: true,
        type: 'success',
        title: 'Password Berhasil Diubah',
        message: 'Password akun Anda berhasil diganti. Gunakan password baru saat login berikutnya.',
        confirmText: 'Alhamdulillah',
      });
    } catch (err: any) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Mengubah Password',
        message: err?.response?.data?.message || 'Password saat ini yang Anda masukkan tidak sesuai.',
        confirmText: 'Coba Lagi',
      });
    } finally {
      setSavingPassword(false);
    }
  };

  const handleLogout = () => {
    setFeedbackModal({
      visible: true,
      type: 'confirm',
      title: 'Keluar dari Akun?',
      message: 'Sesi masuk Anda pada perangkat ini akan dihapus. Anda dapat masuk kembali kapan saja.',
      confirmText: 'Ya, Keluar',
      cancelText: 'Batal',
      onConfirm: async () => {
        setFeedbackModal(null);
        try {
          await mobileApiService.logout();
        } catch {}
        finally {
          clearSession();
        }
      },
    });
  };

  return (
    <View style={styles.rootContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* ── BACKGROUND ILUSTRASI SEKOLAH IDENTIK HALAMAN MUTABA’AH ── */}
      <View style={styles.topFoliageWrapper} pointerEvents="none">
        <Image
          source={PARENT_HOME_BG}
          style={styles.topFoliageBgImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['rgba(236, 253, 245, 0)', 'rgba(236, 253, 245, 0.45)', '#ECFDF5']}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* ── TOP HEADER IDENTIK HALAMAN MUTABA’AH ── */}
      <View style={[styles.cleanTopHeader, { paddingTop: topInset + 6 }]}>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={handleBack}
          style={styles.cleanHeaderIconBtn}
          accessibilityRole="button"
          accessibilityLabel="Kembali"
        >
          <MaterialCommunityIcons name="arrow-left" size={22} color="#004D32" />
        </TouchableOpacity>

        <Text numberOfLines={1} style={styles.cleanHeaderTitle}>
          Profil & Pengaturan Akun
        </Text>

        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => navigation?.navigate('Notifikasi')}
          style={styles.cleanHeaderIconBtn}
          accessibilityRole="button"
          accessibilityLabel="Notifikasi"
        >
          <MaterialCommunityIcons name="bell-outline" size={20} color="#004D32" />
          {unreadNotificationCount > 0 && <View style={styles.heroBellDot} />}
        </TouchableOpacity>
      </View>

      {/* ── BODY SCROLL CONTAINER ── */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* 1. HERO PROFILE CARD IDENTIK TAHFIZH GROUP CARD MUTABA'AH */}
          <View style={styles.heroCardContainer}>
            <View style={[styles.tahfizhGroupCard, styles.tahfizhGroupCardEmerald]}>
              {/* Header Box di dalam Group Card */}
              <View style={[styles.tahfizhGroupCardHeaderRow, styles.tahfizhGroupCardHeaderRowEmerald]}>
                <View style={styles.tahfizhGroupCardHeaderLeft}>
                  <View style={[styles.tahfizhGroupHeaderIconBox, styles.tahfizhGroupHeaderIconBoxEmerald]}>
                    <MaterialCommunityIcons name="shield-account" size={16} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={[styles.tahfizhGroupCardTitle, { color: '#064E3B' }]}>
                      Identitas Akun Terverifikasi
                    </Text>
                    <Text numberOfLines={1} style={[styles.tahfizhGroupCardSub, { color: '#059669' }]}>
                      {activeAcademicPeriod}
                    </Text>
                  </View>
                </View>
                {loading ? (
                  <View style={styles.loadingPill}>
                    <ActivityIndicator size="small" color="#059669" />
                  </View>
                ) : (
                  <View style={[styles.tahfizhGroupActionBadge, styles.tahfizhGroupActionBadgeEmerald]}>
                    <View style={styles.activeDotPulse} />
                    <Text style={[styles.tahfizhGroupActionBadgeText, { color: '#047857' }]}>
                      Aktif
                    </Text>
                  </View>
                )}
              </View>

              {/* Center Profile Details */}
              <View style={styles.heroProfileCenterWrap}>
                {/* Avatar with Camera Action */}
                <View style={styles.avatarContainer}>
                  <View style={styles.heroAvatarWrap}>
                    {profileImageUrl ? (
                      <Image source={{ uri: String(profileImageUrl) }} style={styles.heroAvatarImg} resizeMode="cover" />
                    ) : (
                      <Image source={DEFAULT_PARENT_AVATAR} style={styles.heroAvatarImg} resizeMode="cover" />
                    )}
                    {uploadingAvatar && (
                      <View style={styles.avatarLoadingOverlay}>
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      </View>
                    )}
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={handlePickAndUploadAvatar}
                    style={styles.avatarCameraBtn}
                    disabled={uploadingAvatar}
                    accessibilityLabel="Ganti foto profil"
                  >
                    <MaterialCommunityIcons name="camera" size={14} color="#FFFFFF" />
                  </TouchableOpacity>
                  <View style={styles.heroAvatarOnlineDot} />
                </View>

                {/* User Name & Role */}
                <Text style={styles.heroName} numberOfLines={2}>
                  {employee?.gelar_depan ? `${employee.gelar_depan} ` : ''}
                  {namaLengkap || user?.name || (isParent ? 'Orang Tua / Wali Santri' : isStudent ? 'Peserta Didik' : 'Ustadz / Tenaga Pendidik')}
                  {employee?.gelar_belakang ? `, ${employee.gelar_belakang}` : ''}
                </Text>

                <View style={styles.heroBadgesRow}>
                  <View style={styles.heroRoleBadge}>
                    <MaterialCommunityIcons name="shield-check" size={13} color="#059669" style={{ marginRight: 4 }} />
                    <Text style={styles.heroRoleBadgeText}>{jabatanName}</Text>
                  </View>

                  {isStudent && (
                    <View style={styles.heroNiyBadge}>
                      <MaterialCommunityIcons name="card-account-details-outline" size={12} color="#0284C7" style={{ marginRight: 4 }} />
                      <Text style={styles.heroNiyBadgeText}>NIS: {displayValue((user as any)?.student?.nis || (user as any)?.nis || '-')}</Text>
                    </View>
                  )}

                  {niyOrNip !== '-' && isTeacherOrEmployee && (
                    <View style={styles.heroNiyBadge}>
                      <MaterialCommunityIcons name="card-account-details-outline" size={12} color="#0284C7" style={{ marginRight: 4 }} />
                      <Text style={styles.heroNiyBadgeText}>NIY: {niyOrNip}</Text>
                    </View>
                  )}
                </View>

                <Text style={styles.heroEmail} numberOfLines={1}>{user?.email || 'email@sekolah.sch.id'}</Text>

                {/* KPI STATS ROW */}
                <View style={styles.heroStatsRow}>
                  <View style={styles.heroStatItem}>
                    <Text style={styles.heroStatValue} numberOfLines={1}>
                      {isParent && currentChild
                        ? String(
                            currentChild?.education_unit?.name ||
                            currentChild?.education_unit?.nama ||
                            currentChild?.educationUnit?.name ||
                            currentChild?.educationUnit?.nama ||
                            currentChild?.kelas?.unit_pendidikan?.name ||
                            currentChild?.kelas?.unit_pendidikan?.nama ||
                            currentChild?.kelas?.unitPendidikan?.name ||
                            currentChild?.kelas?.unitPendidikan?.nama ||
                            currentChild?.unit_name ||
                            (typeof currentChild?.unit === 'object' ? (currentChild?.unit?.name || currentChild?.unit?.nama) : currentChild?.unit) ||
                            unitName ||
                            'Unit Belajar'
                          ).replace(/^Unit\s+/i, '')
                        : isStudent
                        ? String(
                            (user as any)?.student?.education_unit?.name ||
                            (user as any)?.student?.education_unit?.nama ||
                            (user as any)?.student?.educationUnit?.name ||
                            (user as any)?.student?.kelas?.unit_pendidikan?.name ||
                            (user as any)?.student?.kelas?.unitPendidikan?.name ||
                            (user as any)?.student?.unit_name ||
                            (user as any)?.unit_name ||
                            unitName ||
                            'Unit Belajar'
                          ).replace(/^Unit\s+/i, '')
                        : String(unitName || '').replace(/^Unit\s+/i, '') || 'Dar El-Iman'}
                    </Text>
                    <Text style={styles.heroStatLabel}>{isParent ? 'Unit Belajar' : isStudent ? 'Unit Belajar' : 'Unit Tugas'}</Text>
                  </View>
                  <View style={styles.heroStatDivider} />
                  <View style={styles.heroStatItem}>
                    <Text style={styles.heroStatValue}>
                      {isParent ? `${children.length} Santri` : isStudent ? displayValue((user as any)?.student?.kelas?.nama_kelas || (user as any)?.student?.kelas?.name || (user as any)?.class_name || '-') : (employee?.status_pegawai || 'Tetap')}
                    </Text>
                    <Text style={styles.heroStatLabel}>{isParent ? 'Ananda' : isStudent ? 'Kelas' : 'Kepegawaian'}</Text>
                  </View>
                  <View style={styles.heroStatDivider} />
                  <View style={styles.heroStatItem}>
                    <View style={styles.activeStatIndicator}>
                      <View style={styles.activeStatPulse} />
                      <Text style={styles.heroStatValue}>Aktif</Text>
                    </View>
                    <Text style={styles.heroStatLabel}>Status Akun</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* 2. PILIH ANANDA TERCINTA (TAB / SELECTOR KHUSUS ORANG TUA WALI) */}
          {isParent && children.length > 0 && (
            <View style={styles.childSelectorWrapper}>
              <View style={styles.childSelectorHeaderRow}>
                <View style={styles.childSelectorHeaderLeft}>
                  <View style={styles.childSelectorIconBadge}>
                    <MaterialCommunityIcons name="account-child-circle" size={18} color="#059669" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.childSelectorTitle}>Pilih Ananda Tercinta</Text>
                    <Text style={styles.childSelectorSub}>
                      Pilih santri untuk sinkronisasi data & melihat biodata
                    </Text>
                  </View>
                </View>
                <View style={styles.childCountBadge}>
                  <MaterialCommunityIcons name="school-outline" size={12} color="#047857" />
                  <Text style={styles.childCountBadgeText}>{children.length} Santri</Text>
                </View>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.childCardsScrollContent}
              >
                {children.map((child, idx) => {
                  const isSelected = String(child.id) === String(selectedChildId);
                  const childName = child.full_name || child.nama_lengkap || child.name || `Ananda ${idx + 1}`;
                  const isGirl = isGirlStudent(child);
                  const defaultAvatar = isGirl ? DEFAULT_STUDENT_GIRL_AVATAR : DEFAULT_STUDENT_BOY_AVATAR;
                  const rawPhoto = child.foto || child.photo || child.avatar || child.photo_url || child.image;
                  const photoUrl = rawPhoto ? resolveMediaUrl(rawPhoto) : null;
                  const className = child.kelas?.nama_kelas || child.kelas?.name || child.class_name || child.kelas || 'Rombel Aktif';
                  const unit =
                    child.education_unit?.name ||
                    child.education_unit?.nama ||
                    child.educationUnit?.name ||
                    child.educationUnit?.nama ||
                    child.kelas?.unit_pendidikan?.name ||
                    child.kelas?.unit_pendidikan?.nama ||
                    child.kelas?.unitPendidikan?.name ||
                    child.kelas?.unitPendidikan?.nama ||
                    child.unit_name ||
                    (typeof child.unit === 'object' ? (child.unit?.name || child.unit?.nama) : child.unit) ||
                    'Unit Belajar';
                  const nis = child.nis || child.nisn || '-';

                  return (
                    <TouchableOpacity
                      key={String(child.id)}
                      activeOpacity={0.88}
                      onPress={() => handleSelectChild(String(child.id))}
                      style={[
                        styles.childCard,
                        isSelected && styles.childCardSelected,
                        children.length === 1 && { width: SCREEN_WIDTH - 32 },
                      ]}
                    >
                      {/* Top Row: Status badge & Unit pill */}
                      <View style={styles.childCardTopRow}>
                        <View style={[styles.childActivePill, isSelected ? styles.childActivePillSelected : styles.childActivePillInactive]}>
                          <MaterialCommunityIcons
                            name={isSelected ? 'check-decagram' : 'checkbox-blank-circle-outline'}
                            size={12}
                            color={isSelected ? '#047857' : '#64748B'}
                          />
                          <Text style={[styles.childActivePillText, isSelected ? styles.childActivePillTextSelected : styles.childActivePillTextInactive]}>
                            {isSelected ? 'Ananda Terpilih' : 'Ketuk Memilih'}
                          </Text>
                        </View>

                        <View style={styles.childUnitPill}>
                          <Text numberOfLines={1} style={styles.childUnitPillText}>
                            {String(unit).replace(/^Unit\s+/i, '')}
                          </Text>
                        </View>
                      </View>

                      {/* Main Identity: Avatar & Text */}
                      <View style={styles.childCardIdentityRow}>
                        <View style={[styles.childAvatarWrap, isSelected && styles.childAvatarWrapSelected]}>
                          <Image
                            source={photoUrl ? { uri: photoUrl } : defaultAvatar}
                            style={styles.childAvatarImg}
                            resizeMode="cover"
                          />
                        </View>

                        <View style={styles.childCardIdentityText}>
                          <Text numberOfLines={1} style={[styles.childCardName, isSelected && styles.childCardNameSelected]}>
                            {childName}
                          </Text>
                          <View style={styles.childClassRow}>
                            <MaterialCommunityIcons name="google-classroom" size={13} color={isSelected ? '#059669' : '#64748B'} />
                            <Text numberOfLines={1} style={styles.childClassText}>
                              {className}
                            </Text>
                          </View>
                          <View style={styles.childNisRow}>
                            <MaterialCommunityIcons name="card-account-details-outline" size={12} color="#94A3B8" />
                            <Text style={styles.childNisText}>NIS: {nis}</Text>
                          </View>
                        </View>
                      </View>

                      {/* Bottom active indicator */}
                      {isSelected && <View style={styles.childSelectedBottomBar} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* 3. 2x2 NAVIGATION BUTTON MENU GRID */}
          <View style={styles.menuButtonGridSection}>
            <View style={styles.menuGridHeader}>
              <View style={styles.menuGridHeaderIconWrap}>
                <MaterialCommunityIcons name="view-dashboard-outline" size={16} color="#059669" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuGridHeaderTitle}>Pilih Menu Pengaturan</Text>
                <Text style={styles.menuGridHeaderSub}>Ketuk menu untuk membuka atau memperbarui data</Text>
              </View>
            </View>

            <View style={styles.menuButtonGrid}>
              {menuButtons.map((btn) => {
                const isActive = activeTab === btn.id;
                return (
                  <TouchableOpacity
                    key={btn.id}
                    activeOpacity={0.8}
                    onPress={() => setActiveTab(btn.id)}
                    style={[
                      styles.menuButtonCard,
                      isActive && styles.menuButtonCardActive,
                    ]}
                  >
                    {isActive && <View style={styles.menuButtonActiveIndicatorBar} />}

                    <View style={styles.menuButtonCardTop}>
                      <View style={[styles.menuButtonIconBox, { backgroundColor: btn.iconBg }]}>
                        <MaterialCommunityIcons name={btn.icon} size={20} color={btn.iconColor} />
                      </View>
                      <View style={[styles.menuButtonStatusDot, isActive && styles.menuButtonStatusDotActive]}>
                        {isActive ? (
                          <MaterialCommunityIcons name="check" size={11} color="#FFFFFF" />
                        ) : (
                          <View style={styles.menuButtonInactiveDot} />
                        )}
                      </View>
                    </View>

                    <Text style={[styles.menuButtonCardTitle, isActive && styles.menuButtonCardTitleActive]} numberOfLines={1}>
                      {btn.title}
                    </Text>
                    <Text style={styles.menuButtonCardSub} numberOfLines={1}>
                      {btn.subtitle}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* 4. TAB CONTENT 1: BIODATA & IDENTITAS */}
          {activeTab === 'biodata' && (
            <>
              {/* BIODATA ANANDA TERPILIH (FOR PARENT) */}
              {isParent && currentChild && (() => {
                const isSantriChild = Boolean(
                  currentChild?.is_santri ||
                  currentChild?.asrama ||
                  currentChild?.education_unit?.name?.toLowerCase().includes('ponpes') ||
                  currentChild?.education_unit?.name?.toLowerCase().includes('pesantren')
                );
                const childRoleLabel = isSantriChild ? 'Santri' : 'Peserta Didik';
                const childShortLabel = isSantriChild ? 'Santri' : 'Siswa';
                const defaultUnitFallback = useMobileConfigStore.getState().config.branding?.school_name || 'Sekolah Terpadu';

                return (
                  <View style={styles.sectionCard}>
                    <View style={styles.cardSectionHeader}>
                      <View style={styles.cardSectionIconBadge}>
                        <MaterialCommunityIcons name="card-account-details-outline" size={16} color="#059669" />
                      </View>
                      <Text style={styles.cardSectionTitle}>{`Biodata Lengkap ${childRoleLabel}`}</Text>
                      <View style={styles.cardSectionBadge}>
                        <Text style={styles.cardSectionBadgeText} numberOfLines={1}>
                          {currentChild?.full_name || currentChild?.nama_lengkap || childShortLabel}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.infoRowsContainer}>
                      <InfoRow icon="account" iconBg="#DCFCE7" iconColor="#059669" label={`Nama Lengkap ${childShortLabel}`} value={displayValue(currentChild?.full_name || currentChild?.nama_lengkap || currentChild?.name)} />
                      <InfoRow icon="numeric" iconBg="#EFF6FF" iconColor="#2563EB" label="NIS / NISN" value={(currentChild?.nis || '-') + ' / ' + (currentChild?.nisn || '-')} />
                      <InfoRow
                        icon="domain"
                        iconBg="#F5F3FF"
                        iconColor="#7C3AED"
                        label="Unit Pendidikan"
                        value={displayValue(
                          currentChild?.education_unit?.name ||
                          currentChild?.education_unit?.nama ||
                          currentChild?.educationUnit?.name ||
                          currentChild?.educationUnit?.nama ||
                          currentChild?.kelas?.unit_pendidikan?.name ||
                          currentChild?.kelas?.unit_pendidikan?.nama ||
                          currentChild?.kelas?.unitPendidikan?.name ||
                          currentChild?.kelas?.unitPendidikan?.nama ||
                          currentChild?.unit_name ||
                          (typeof currentChild?.unit === 'object' ? (currentChild?.unit?.name || currentChild?.unit?.nama) : currentChild?.unit) ||
                          defaultUnitFallback
                        )}
                      />
                      <InfoRow icon="google-classroom" iconBg="#FEF3C7" iconColor="#D97706" label="Kelas / Rombel" value={displayValue(currentChild?.kelas?.nama_kelas || currentChild?.kelas?.name || currentChild?.class_name)} />
                      <InfoRow icon="calendar-account" iconBg="#FEE2E2" iconColor="#DC2626" label="Tempat, Tanggal Lahir" value={(currentChild?.birth_place || '-') + ', ' + formatDateSafe(currentChild?.birth_date)} />
                      <InfoRow icon="home-map-marker" iconBg="#ECFDF5" iconColor="#059669" label="Alamat Tempat Tinggal" value={displayValue(currentChild?.address)} isLast />
                    </View>
                  </View>
                );
              })()}

              {/* PROFIL UNIT SEKOLAH ANANDA TERPILIH (FOR PARENT) */}
              {isParent && currentChild && (() => {
                const eduUnit = currentChild?.education_unit || currentChild?.kelas?.unit_pendidikan || {};
                const meta = eduUnit?.metadata || {};
                const schoolName = eduUnit?.name || currentChild?.unit_name || 'Unit Sekolah';
                const principalName = meta?.principal_name || '-';
                const npsn = meta?.npsn || eduUnit?.code || '-';
                const accreditation = meta?.accreditation || 'A';
                const address = meta?.address || '-';
                const phone = meta?.phone || '-';
                const email = meta?.email || '-';
                const program = `${eduUnit?.program_type ? String(eduUnit.program_type).toUpperCase() : 'FULDAY'} · ${eduUnit?.jam_kegiatan || 'Jam KBM Terpadu'}`;

                return (
                  <View style={styles.sectionCard}>
                    <View style={styles.cardSectionHeader}>
                      <View style={[styles.cardSectionIconBadge, { backgroundColor: '#EFF6FF' }]}>
                        <MaterialCommunityIcons name="domain" size={16} color="#2563EB" />
                      </View>
                      <Text style={styles.cardSectionTitle}>Profil Unit Sekolah Ananda</Text>
                      <View style={[styles.cardSectionBadge, { backgroundColor: '#EFF6FF' }]}>
                        <Text style={[styles.cardSectionBadgeText, { color: '#2563EB' }]} numberOfLines={1}>
                          {schoolName.replace(/^Unit\s+/i, '')}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.infoRowsContainer}>
                      <InfoRow icon="domain" iconBg="#EFF6FF" iconColor="#2563EB" label="Nama Unit Sekolah" value={displayValue(schoolName)} />
                      <InfoRow icon="account-tie" iconBg="#DCFCE7" iconColor="#059669" label="Kepala Sekolah / Pimpinan" value={displayValue(principalName)} />
                      <InfoRow icon="certificate" iconBg="#FEF3C7" iconColor="#D97706" label="Akreditasi & NPSN" value={`Akreditasi ${accreditation} · NPSN ${npsn}`} />
                      <InfoRow icon="clock-outline" iconBg="#F3E8FF" iconColor="#7C3AED" label="Program & Jam KBM" value={displayValue(program)} />
                      <InfoRow icon="phone-outline" iconBg="#ECFDF5" iconColor="#059669" label="Kontak Telepon" value={displayValue(phone)} />
                      <InfoRow icon="email-outline" iconBg="#EFF6FF" iconColor="#2563EB" label="Email Resmi" value={displayValue(email)} />
                      <InfoRow icon="map-marker-outline" iconBg="#FFF1F2" iconColor="#E11D48" label="Alamat Kampus Sekolah" value={displayValue(address)} isLast />
                    </View>
                  </View>
                );
              })()}

              {/* BIODATA SISWA (FOR STUDENT ROLE) */}
              {isStudent && (
                <View style={styles.sectionCard}>
                  <View style={styles.cardSectionHeader}>
                    <View style={styles.cardSectionIconBadge}>
                      <MaterialCommunityIcons name="school" size={16} color="#059669" />
                    </View>
                    <Text style={styles.cardSectionTitle}>Biodata Peserta Didik</Text>
                    <View style={styles.cardSectionBadge}>
                      <Text style={styles.cardSectionBadgeText}>Siswa Aktif</Text>
                    </View>
                  </View>
                  <View style={styles.infoRowsContainer}>
                    <InfoRow icon="account" iconBg="#DCFCE7" iconColor="#059669" label="Nama Lengkap Siswa" value={displayValue(user?.name || (user as any)?.student?.nama_lengkap || namaLengkap)} />
                    <InfoRow icon="numeric" iconBg="#EFF6FF" iconColor="#2563EB" label="NIS / NISN" value={((user as any)?.student?.nis || (user as any)?.nis || '-') + ' / ' + ((user as any)?.student?.nisn || (user as any)?.nisn || '-')} />
                    <InfoRow icon="domain" iconBg="#F5F3FF" iconColor="#7C3AED" label="Unit Pendidikan" value={displayValue((user as any)?.student?.education_unit?.name || (user as any)?.unit_name || unitName || 'Sekolah Terpadu')} />
                    <InfoRow icon="google-classroom" iconBg="#FEF3C7" iconColor="#D97706" label="Kelas / Rombel" value={displayValue((user as any)?.student?.kelas?.nama_kelas || (user as any)?.student?.kelas?.name || (user as any)?.class_name || '-')} />
                    <InfoRow icon="calendar-account" iconBg="#FEE2E2" iconColor="#DC2626" label="Tempat, Tanggal Lahir" value={`${displayValue((user as any)?.student?.birth_place || tempatLahir)}, ${formatDateSafe((user as any)?.student?.birth_date || tanggalLahir)}`} />
                    <InfoRow icon="gender-male-female" iconBg="#ECFDF5" iconColor="#059669" label="Jenis Kelamin" value={isGirlStudent((user as any)?.student || user) ? 'Perempuan' : 'Laki-laki'} />
                    <InfoRow icon="account-child-outline" iconBg="#FEF3C7" iconColor="#D97706" label="Orang Tua / Wali" value={displayValue((user as any)?.student?.parent?.name || (user as any)?.parent_name || '-')} />
                    <InfoRow icon="phone-outline" iconBg="#DCFCE7" iconColor="#059669" label="Nomor WhatsApp / HP" value={displayValue(phone || user?.phone)} />
                    <InfoRow icon="email-outline" iconBg="#EFF6FF" iconColor="#2563EB" label="Email Terdaftar" value={displayValue(user?.email)} />
                    <InfoRow icon="home-map-marker" iconBg="#F0FDFA" iconColor="#0D9488" label="Alamat Tempat Tinggal" value={displayValue(alamat || (user as any)?.student?.address)} isLast />
                  </View>
                </View>
              )}

              {/* IDENTITAS PENDIDIK / PEGAWAI / WALI (FOR NON-STUDENT) */}
              {!isStudent && (
                <View style={styles.sectionCard}>
                  <View style={styles.cardSectionHeader}>
                    <View style={styles.cardSectionIconBadge}>
                      <MaterialCommunityIcons name="badge-account-outline" size={16} color="#059669" />
                    </View>
                    <Text style={styles.cardSectionTitle}>{isTeacherOrEmployee ? 'Identitas Tenaga Pendidik' : 'Identitas Akun Wali'}</Text>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setActiveTab('edit_profil')}
                      style={styles.cardHeaderQuickAction}
                    >
                      <MaterialCommunityIcons name="pencil" size={12} color="#059669" />
                      <Text style={styles.cardHeaderQuickActionText}>Ubah</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.infoRowsContainer}>
                    <InfoRow icon="account" iconBg="#DCFCE7" iconColor="#059669" label="Nama Lengkap & Gelar" value={namaLengkap ? `${employee?.gelar_depan ? employee.gelar_depan + ' ' : ''}${namaLengkap}${employee?.gelar_belakang ? ', ' + employee.gelar_belakang : ''}` : displayValue(user?.name)} />
                    {isTeacherOrEmployee && (
                      <>
                        <InfoRow icon="card-bulleted-outline" iconBg="#FEF3C7" iconColor="#D97706" label="Nomor Induk Yayasan (NIY)" value={displayValue(employee?.niy || niyOrNip)} />
                        <InfoRow icon="account-tie-outline" iconBg="#EFF6FF" iconColor="#2563EB" label="Jabatan & Peran" value={displayValue(jabatanName)} />
                        <InfoRow icon="office-building" iconBg="#F5F3FF" iconColor="#7C3AED" label="Unit Penugasan" value={displayValue(unitName)} />
                        <InfoRow icon="gender-male-female" iconBg="#FEE2E2" iconColor="#E11D48" label="Jenis Kelamin" value={jenisKelamin === 'L' ? 'Laki-laki' : 'Perempuan'} />
                        <InfoRow icon="calendar-clock" iconBg="#ECFDF5" iconColor="#059669" label="Tempat, Tanggal Lahir" value={`${displayValue(tempatLahir)}, ${formatDateSafe(tanggalLahir)}`} />
                      </>
                    )}
                    <InfoRow icon="phone-outline" iconBg="#DCFCE7" iconColor="#059669" label="Nomor WhatsApp / HP" value={displayValue(phone || user?.phone)} />
                    <InfoRow icon="email-outline" iconBg="#EFF6FF" iconColor="#2563EB" label="Email Terdaftar" value={displayValue(user?.email)} />
                    <InfoRow icon="home-outline" iconBg="#F0FDFA" iconColor="#0D9488" label="Alamat Domisili" value={displayValue(alamat)} isLast />
                  </View>
                </View>
              )}

              {/* QUICK ACTION BANNER */}
              <View style={styles.quickActionBanner}>
                <View style={styles.quickActionIconWrap}>
                  <MaterialCommunityIcons name="lightning-bolt" size={20} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.quickActionTitle}>Kelola Akun Mandiri</Text>
                  <Text style={styles.quickActionDesc}>
                    Perbarui kontak, biodata, serta ganti kata sandi kapan saja langsung dari aplikasi.
                  </Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setActiveTab('edit_profil')}
                  style={styles.quickActionPill}
                >
                  <Text style={styles.quickActionPillText}>Edit Data</Text>
                  <MaterialCommunityIcons name="chevron-right" size={14} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* 5. TAB CONTENT 2: UBAH DATA PROFIL */}
          {activeTab === 'edit_profil' && (
            <View style={styles.sectionCard}>
              <View style={styles.cardSectionHeader}>
                <View style={styles.cardSectionIconBadge}>
                  <MaterialCommunityIcons name="account-edit" size={16} color="#059669" />
                </View>
                <Text style={styles.cardSectionTitle}>Form Perubahan Biodata</Text>
                <View style={styles.statusLivePill}>
                  <Text style={styles.statusLivePillText}>Editable</Text>
                </View>
              </View>

              <View style={styles.formContainer}>
                {/* Gelar Depan & Belakang Row */}
                {isTeacherOrEmployee && (
                  <View style={styles.formRowTwoCol}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inputFieldLabel}>Gelar Depan</Text>
                      <TextInput
                        style={styles.formInput}
                        value={gelarDepan}
                        onChangeText={setGelarDepan}
                        placeholder="Ustadz / Dr."
                        placeholderTextColor="#94A3B8"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inputFieldLabel}>Gelar Belakang</Text>
                      <TextInput
                        style={styles.formInput}
                        value={gelarBelakang}
                        onChangeText={setGelarBelakang}
                        placeholder="S.Pd.I / M.Pd"
                        placeholderTextColor="#94A3B8"
                      />
                    </View>
                  </View>
                )}

                {/* Nama Lengkap */}
                <View style={styles.formGroup}>
                  <Text style={styles.inputFieldLabel}>Nama Lengkap *</Text>
                  <View style={styles.inputWithIcon}>
                    <MaterialCommunityIcons name="account-outline" size={18} color="#059669" style={styles.inputPrefixIcon} />
                    <TextInput
                      style={styles.inputWithPrefix}
                      value={namaLengkap}
                      onChangeText={setNamaLengkap}
                      placeholder="Masukkan nama lengkap..."
                      placeholderTextColor="#94A3B8"
                    />
                  </View>
                </View>

                {/* Nama Panggilan & No HP */}
                <View style={styles.formRowTwoCol}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputFieldLabel}>Nama Panggilan</Text>
                    <TextInput
                      style={styles.formInput}
                      value={namaPanggilan}
                      onChangeText={setNamaPanggilan}
                      placeholder="Panggilan"
                      placeholderTextColor="#94A3B8"
                    />
                  </View>
                  <View style={{ flex: 1.3 }}>
                    <Text style={styles.inputFieldLabel}>No. WhatsApp / HP</Text>
                    <TextInput
                      style={styles.formInput}
                      value={phone}
                      onChangeText={setPhone}
                      placeholder="081234567890"
                      keyboardType="phone-pad"
                      placeholderTextColor="#94A3B8"
                    />
                  </View>
                </View>

                {/* Tempat & Tanggal Lahir */}
                <View style={styles.formRowTwoCol}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputFieldLabel}>Tempat Lahir</Text>
                    <TextInput
                      style={styles.formInput}
                      value={tempatLahir}
                      onChangeText={setTempatLahir}
                      placeholder="Kota Lahir"
                      placeholderTextColor="#94A3B8"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputFieldLabel}>Tgl Lahir (YYYY-MM-DD)</Text>
                    <TextInput
                      style={styles.formInput}
                      value={tanggalLahir}
                      onChangeText={setTanggalLahir}
                      placeholder="1990-05-20"
                      placeholderTextColor="#94A3B8"
                    />
                  </View>
                </View>

                {/* Jenis Kelamin Selector */}
                <View style={styles.formGroup}>
                  <Text style={styles.inputFieldLabel}>Jenis Kelamin</Text>
                  <View style={styles.genderSelectRow}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setJenisKelamin('L')}
                      style={[styles.genderOption, jenisKelamin === 'L' && styles.genderOptionActive]}
                    >
                      <MaterialCommunityIcons
                        name="gender-male"
                        size={16}
                        color={jenisKelamin === 'L' ? '#FFFFFF' : '#059669'}
                      />
                      <Text style={[styles.genderOptionText, jenisKelamin === 'L' && styles.genderOptionTextActive]}>
                        Laki-laki (Ikhwan)
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setJenisKelamin('P')}
                      style={[styles.genderOption, jenisKelamin === 'P' && styles.genderOptionActive]}
                    >
                      <MaterialCommunityIcons
                        name="gender-female"
                        size={16}
                        color={jenisKelamin === 'P' ? '#FFFFFF' : '#059669'}
                      />
                      <Text style={[styles.genderOptionText, jenisKelamin === 'P' && styles.genderOptionTextActive]}>
                        Perempuan (Akhwat)
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Alamat Domisili */}
                <View style={styles.formGroup}>
                  <Text style={styles.inputFieldLabel}>Alamat Domisili</Text>
                  <TextInput
                    style={[styles.formInput, { minHeight: 70, textAlignVertical: 'top' }]}
                    value={alamat}
                    onChangeText={setAlamat}
                    placeholder="Alamat tempat tinggal lengkap..."
                    placeholderTextColor="#94A3B8"
                    multiline
                    numberOfLines={3}
                  />
                </View>

                {/* Save Profile Button */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handleSaveProfile}
                  disabled={savingProfile}
                  style={styles.saveSubmitBtn}
                >
                  <LinearGradient
                    colors={['#059669', '#10B981']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.saveSubmitGradient}
                  >
                    {savingProfile ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <MaterialCommunityIcons name="content-save-check-outline" size={18} color="#FFFFFF" />
                        <Text style={styles.saveSubmitBtnText}>Simpan Perubahan Data</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* 6. TAB CONTENT 3: PASSWORD & EMAIL */}
          {activeTab === 'keamanan' && (
            <>
              {/* CARD GANTI EMAIL */}
              <View style={styles.sectionCard}>
                <View style={styles.cardSectionHeader}>
                  <View style={styles.cardSectionIconBadge}>
                    <MaterialCommunityIcons name="email-edit-outline" size={16} color="#059669" />
                  </View>
                  <Text style={styles.cardSectionTitle}>Perbarui Alamat Email</Text>
                </View>
                <View style={styles.formContainer}>
                  <Text style={styles.inputDescription}>
                    Email digunakan untuk menerima pemberitahuan resmi dan sebagai alternatif masuk ke akun.
                  </Text>
                  <View style={styles.formGroup}>
                    <Text style={styles.inputFieldLabel}>Alamat Email Akun</Text>
                    <View style={styles.inputWithIcon}>
                      <MaterialCommunityIcons name="email-outline" size={18} color="#059669" style={styles.inputPrefixIcon} />
                      <TextInput
                        style={styles.inputWithPrefix}
                        value={emailInput}
                        onChangeText={setEmailInput}
                        placeholder="nama@sekolah.sch.id"
                        placeholderTextColor="#94A3B8"
                        keyboardType="email-address"
                        autoCapitalize="none"
                      />
                    </View>
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={handleSaveEmail}
                    disabled={savingEmail}
                    style={styles.saveSecondaryBtn}
                  >
                    {savingEmail ? (
                      <ActivityIndicator size="small" color="#059669" />
                    ) : (
                      <>
                        <MaterialCommunityIcons name="check-circle-outline" size={16} color="#059669" />
                        <Text style={styles.saveSecondaryBtnText}>Simpan Email Baru</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* CARD GANTI PASSWORD */}
              <View style={styles.sectionCard}>
                <View style={styles.cardSectionHeader}>
                  <View style={[styles.cardSectionIconBadge, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                    <MaterialCommunityIcons name="lock-reset" size={16} color="#2563EB" />
                  </View>
                  <Text style={styles.cardSectionTitle}>Ubah Kata Sandi (Password)</Text>
                </View>
                <View style={styles.formContainer}>
                  <Text style={styles.inputDescription}>
                    Gunakan kata sandi yang kuat dengan minimal 6 karakter kombinasi huruf dan angka.
                  </Text>

                  {/* Password Saat Ini */}
                  <View style={styles.formGroup}>
                    <Text style={styles.inputFieldLabel}>Password Saat Ini *</Text>
                    <View style={styles.inputWithIcon}>
                      <MaterialCommunityIcons name="lock-outline" size={18} color="#64748B" style={styles.inputPrefixIcon} />
                      <TextInput
                        style={styles.inputWithPrefix}
                        value={currentPassword}
                        onChangeText={setCurrentPassword}
                        placeholder="Ketik password lama Anda..."
                        placeholderTextColor="#94A3B8"
                        secureTextEntry={!showCurrentPass}
                        autoCapitalize="none"
                      />
                      <TouchableOpacity
                        onPress={() => setShowCurrentPass(!showCurrentPass)}
                        style={styles.inputSuffixBtn}
                      >
                        <MaterialCommunityIcons
                          name={showCurrentPass ? 'eye-off-outline' : 'eye-outline'}
                          size={18}
                          color="#64748B"
                        />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Password Baru */}
                  <View style={styles.formGroup}>
                    <Text style={styles.inputFieldLabel}>Password Baru (Min. 6 Karakter) *</Text>
                    <View style={styles.inputWithIcon}>
                      <MaterialCommunityIcons name="lock-check-outline" size={18} color="#059669" style={styles.inputPrefixIcon} />
                      <TextInput
                        style={styles.inputWithPrefix}
                        value={newPassword}
                        onChangeText={setNewPassword}
                        placeholder="Ketik password baru..."
                        placeholderTextColor="#94A3B8"
                        secureTextEntry={!showNewPass}
                        autoCapitalize="none"
                      />
                      <TouchableOpacity
                        onPress={() => setShowNewPass(!showNewPass)}
                        style={styles.inputSuffixBtn}
                      >
                        <MaterialCommunityIcons
                          name={showNewPass ? 'eye-off-outline' : 'eye-outline'}
                          size={18}
                          color="#64748B"
                        />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Konfirmasi Password Baru */}
                  <View style={styles.formGroup}>
                    <Text style={styles.inputFieldLabel}>Konfirmasi Password Baru *</Text>
                    <View style={styles.inputWithIcon}>
                      <MaterialCommunityIcons name="shield-check-outline" size={18} color="#059669" style={styles.inputPrefixIcon} />
                      <TextInput
                        style={styles.inputWithPrefix}
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        placeholder="Ketik ulang password baru..."
                        placeholderTextColor="#94A3B8"
                        secureTextEntry={!showConfirmPass}
                        autoCapitalize="none"
                      />
                      <TouchableOpacity
                        onPress={() => setShowConfirmPass(!showConfirmPass)}
                        style={styles.inputSuffixBtn}
                      >
                        <MaterialCommunityIcons
                          name={showConfirmPass ? 'eye-off-outline' : 'eye-outline'}
                          size={18}
                          color="#64748B"
                        />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Password Match Status */}
                  {newPassword.length > 0 && confirmPassword.length > 0 && (
                    <View style={[
                      styles.passCheckAlert,
                      newPassword === confirmPassword ? styles.passCheckAlertMatch : styles.passCheckAlertMismatch
                    ]}>
                      <MaterialCommunityIcons
                        name={newPassword === confirmPassword ? 'check-circle' : 'alert-circle'}
                        size={14}
                        color={newPassword === confirmPassword ? '#059669' : '#DC2626'}
                      />
                      <Text style={[
                        styles.passCheckAlertText,
                        newPassword === confirmPassword ? styles.passCheckAlertTextMatch : styles.passCheckAlertTextMismatch
                      ]}>
                        {newPassword === confirmPassword ? 'Konfirmasi password sesuai' : 'Konfirmasi password belum sama'}
                      </Text>
                    </View>
                  )}

                  {/* Submit Change Password Button */}
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={handleChangePassword}
                    disabled={savingPassword}
                    style={styles.saveSubmitBtn}
                  >
                    <LinearGradient
                      colors={['#2563EB', '#3B82F6']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.saveSubmitGradient}
                    >
                      {savingPassword ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <MaterialCommunityIcons name="key-change" size={18} color="#FFFFFF" />
                          <Text style={styles.saveSubmitBtnText}>Perbarui Password Sekarang</Text>
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}

          {/* 7. TAB CONTENT 4: SESI & KEAMANAN */}
          {activeTab === 'sesi' && (
            <>
              {/* SESSION INFO CARD */}
              <View style={styles.sessionCard}>
                <View style={styles.sessionIconBadge}>
                  <MaterialCommunityIcons name="shield-lock-outline" size={20} color="#059669" />
                </View>
                <View style={styles.sessionTextCol}>
                  <Text style={styles.sessionTitle}>Status Keamanan & Enkripsi Sesi</Text>
                  <Text style={styles.sessionDesc}>
                    Token autentikasi Sanctum Anda terenkripsi aman secara lokal di perangkat. Setiap pertukaran data API dienkripsi melalui protokol SSL/TLS yang terjamin.
                  </Text>
                </View>
              </View>

              {/* DETAIL PERANGKAT & AKUN */}
              <View style={styles.sectionCard}>
                <View style={styles.cardSectionHeader}>
                  <View style={styles.cardSectionIconBadge}>
                    <MaterialCommunityIcons name="cellphone-check" size={16} color="#059669" />
                  </View>
                  <Text style={styles.cardSectionTitle}>Informasi Aplikasi & Sesi</Text>
                </View>
                <View style={styles.infoRowsContainer}>
                  <InfoRow icon="shield-account" iconBg="#DCFCE7" iconColor="#059669" label="Hak Akses Sistem" value={roleLabel(roles)} />
                  <InfoRow icon="calendar-check" iconBg="#EFF6FF" iconColor="#2563EB" label="Tahun Ajaran Aktif" value={activeAcademicPeriod} />
                  <InfoRow icon="cellphone" iconBg="#F5F3FF" iconColor="#7C3AED" label="Platform Perangkat" value={`${Platform.OS.toUpperCase()} Native App`} />
                  <InfoRow icon="clock-outline" iconBg="#FEF3C7" iconColor="#D97706" label="Sesi Terverifikasi" value="Aktif (Terhubung Aman)" isLast />
                </View>
              </View>
            </>
          )}

          {/* 8. ALWAYS-ACCESSIBLE LOGOUT BUTTON ACROSS ALL TABS */}
          <TouchableOpacity activeOpacity={0.85} onPress={handleLogout} style={styles.logoutBtn}>
            <View style={styles.logoutIconSquare}>
              <MaterialCommunityIcons name="logout-variant" size={18} color="#DC2626" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.logoutBtnText}>Keluar dari Akun</Text>
              <Text style={styles.logoutBtnSubText}>Akhiri sesi login perangkat ini dengan aman</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color="#DC2626" />
          </TouchableOpacity>

          <Text style={styles.version}>Sistem Manajemen Sekolah Terpadu • v2.6.4 Modern</Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Universal Feedback Modal */}
      {feedbackModal && (
        <AppFeedbackModal
          visible={feedbackModal.visible}
          type={feedbackModal.type || 'confirm'}
          title={feedbackModal.title}
          message={feedbackModal.message}
          confirmText={feedbackModal.confirmText}
          cancelText={feedbackModal.cancelText}
          onConfirm={feedbackModal.onConfirm}
          onClose={() => setFeedbackModal(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#ECFDF5',
  },
  topFoliageWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 380,
    overflow: 'hidden',
  },
  topFoliageBgImage: {
    width: '100%',
    height: '100%',
    opacity: 0.88,
  },

  // CLEAN TOP HEADER IDENTIK HALAMAN MUTABA’AH
  cleanTopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    zIndex: 10,
  },
  cleanHeaderIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#004D32',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  cleanHeaderTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16.5,
    fontWeight: '800',
    color: '#004D32',
    letterSpacing: -0.3,
    marginHorizontal: 8,
  },
  heroBellDot: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },

  scrollContent: {
    paddingBottom: 110,
    paddingTop: 4,
  },

  // 1. HERO PROFILE CARD IDENTIK TAHFIZH GROUP CARD
  heroCardContainer: {
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  tahfizhGroupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#047857',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    overflow: 'hidden',
  },
  tahfizhGroupCardEmerald: {
    borderColor: '#A7F3D0',
  },
  tahfizhGroupCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#F0FDF4',
    borderBottomWidth: 1,
    borderBottomColor: '#D1FAE5',
  },
  tahfizhGroupCardHeaderRowEmerald: {
    backgroundColor: '#F0FDF4',
  },
  tahfizhGroupCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flex: 1,
  },
  tahfizhGroupHeaderIconBox: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tahfizhGroupHeaderIconBoxEmerald: {
    backgroundColor: '#059669',
  },
  tahfizhGroupCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  tahfizhGroupCardSub: {
    fontSize: 10.5,
    fontWeight: '600',
    marginTop: 1,
  },
  tahfizhGroupActionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 12,
    gap: 4,
  },
  tahfizhGroupActionBadgeEmerald: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  tahfizhGroupActionBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  activeDotPulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  loadingPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  // HERO PROFILE DETAILS
  heroProfileCenterWrap: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 10,
  },
  heroAvatarWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 3,
    borderColor: '#A7F3D0',
    overflow: 'hidden',
    backgroundColor: '#DCFCE7',
    shadowColor: '#059669',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  heroAvatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarLoadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCameraBtn: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#059669',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  heroAvatarOnlineDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  heroName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#064E3B',
    letterSpacing: -0.3,
    textAlign: 'center',
    marginBottom: 5,
    paddingHorizontal: 8,
  },
  heroBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 5,
  },
  heroRoleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  heroRoleBadgeText: {
    color: '#065F46',
    fontSize: 10.5,
    fontWeight: '800',
  },
  heroNiyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  heroNiyBadgeText: {
    color: '#1E40AF',
    fontSize: 10.5,
    fontWeight: '700',
  },
  heroEmail: {
    fontSize: 11.5,
    color: '#475569',
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 12,
  },

  // HERO STATS ROW
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    width: '100%',
  },
  heroStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  heroStatValue: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#064E3B',
    letterSpacing: -0.2,
  },
  heroStatLabel: {
    fontSize: 9.5,
    color: '#059669',
    fontWeight: '700',
    marginTop: 2,
  },
  heroStatDivider: {
    width: 1,
    height: 22,
    backgroundColor: '#A7F3D0',
    marginHorizontal: 2,
  },
  activeStatIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activeStatPulse: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
  },

  // 2. CHILD SELECTOR FOR PARENTS
  childSelectorWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    marginHorizontal: 16,
    marginBottom: 14,
    paddingTop: 12,
    paddingBottom: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#047857',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  childSelectorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  childSelectorHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  childSelectorIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  childSelectorTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#064E3B',
    letterSpacing: -0.2,
  },
  childSelectorSub: {
    fontSize: 10,
    color: '#059669',
    fontWeight: '600',
    marginTop: 1,
  },
  childCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  childCountBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#047857',
  },
  childCardsScrollContent: {
    paddingHorizontal: 14,
    gap: 10,
  },
  childCard: {
    width: SCREEN_WIDTH * 0.72,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    position: 'relative',
    overflow: 'hidden',
  },
  childCardSelected: {
    backgroundColor: '#ECFDF5',
    borderColor: '#059669',
    shadowColor: '#059669',
    shadowOpacity: 0.16,
    shadowRadius: 6,
    elevation: 3,
  },
  childCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  childActivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  childActivePillSelected: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  childActivePillInactive: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  childActivePillText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  childActivePillTextSelected: {
    color: '#047857',
  },
  childActivePillTextInactive: {
    color: '#64748B',
  },
  childUnitPill: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    maxWidth: 95,
  },
  childUnitPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#1E40AF',
  },
  childCardIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  childAvatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
  },
  childAvatarWrapSelected: {
    borderColor: '#059669',
  },
  childAvatarImg: {
    width: '100%',
    height: '100%',
  },
  childCardIdentityText: {
    flex: 1,
  },
  childCardName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 2,
  },
  childCardNameSelected: {
    color: '#064E3B',
    fontWeight: '900',
  },
  childClassRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  childClassText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  childNisRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  childNisText: {
    fontSize: 9.5,
    fontWeight: '500',
    color: '#94A3B8',
  },
  childSelectedBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#059669',
  },

  // 3. 2x2 BUTTON MENU GRID
  menuButtonGridSection: {
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#047857',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  menuGridHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0FDF4',
  },
  menuGridHeaderIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  menuGridHeaderTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#064E3B',
    letterSpacing: -0.2,
  },
  menuGridHeaderSub: {
    fontSize: 10,
    color: '#059669',
    fontWeight: '600',
    marginTop: 1,
  },
  menuButtonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  menuButtonCard: {
    width: '48.5%',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 11,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    position: 'relative',
    overflow: 'hidden',
  },
  menuButtonCardActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#059669',
    shadowColor: '#059669',
    shadowOpacity: 0.16,
    shadowRadius: 6,
    elevation: 3,
  },
  menuButtonActiveIndicatorBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#059669',
  },
  menuButtonCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  menuButtonIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButtonStatusDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButtonStatusDotActive: {
    backgroundColor: '#059669',
  },
  menuButtonInactiveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#94A3B8',
  },
  menuButtonCardTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 1.5,
    letterSpacing: -0.2,
  },
  menuButtonCardTitleActive: {
    color: '#064E3B',
    fontWeight: '900',
  },
  menuButtonCardSub: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '500',
  },

  // 4. CARD SECTIONS
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    marginHorizontal: 16,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#047857',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    overflow: 'hidden',
  },
  cardSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#D1FAE5',
    backgroundColor: '#F0FDF4',
  },
  cardSectionIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  cardSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#064E3B',
    letterSpacing: -0.2,
    flex: 1,
  },
  cardSectionBadge: {
    backgroundColor: '#059669',
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 3,
    maxWidth: 120,
  },
  cardSectionBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  cardHeaderQuickAction: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 3,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  cardHeaderQuickActionText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065F46',
  },
  statusLivePill: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  statusLivePillText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#059669',
  },

  // INFO ROWS
  infoRowsContainer: {
    paddingHorizontal: 14,
    paddingTop: 2,
    paddingBottom: 6,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0FDF4',
    gap: 10,
  },
  infoRowLast: {
    borderBottomWidth: 0,
  },
  infoIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  infoTextCol: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 9.5,
    color: '#059669',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 17,
  },

  // QUICK ACTION BANNER
  quickActionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    gap: 10,
    shadowColor: '#047857',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  quickActionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  quickActionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#064E3B',
    marginBottom: 2,
  },
  quickActionDesc: {
    fontSize: 10.5,
    color: '#047857',
    lineHeight: 15,
    fontWeight: '500',
  },
  quickActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 2,
    shadowColor: '#059669',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  quickActionPillText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // FORM STYLES
  formContainer: {
    padding: 14,
  },
  inputDescription: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 12,
    lineHeight: 16,
  },
  formGroup: {
    marginBottom: 12,
  },
  formRowTwoCol: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  inputFieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#064E3B',
    marginBottom: 5,
  },
  formInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 12.5,
    color: '#0F172A',
    fontWeight: '600',
  },
  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 10,
  },
  inputPrefixIcon: {
    marginRight: 8,
  },
  inputWithPrefix: {
    flex: 1,
    paddingVertical: 9,
    fontSize: 12.5,
    color: '#0F172A',
    fontWeight: '600',
  },
  inputSuffixBtn: {
    padding: 6,
  },

  // GENDER SELECTOR
  genderSelectRow: {
    flexDirection: 'row',
    gap: 10,
  },
  genderOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#86EFAC',
    gap: 6,
  },
  genderOptionActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  genderOptionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },
  genderOptionTextActive: {
    color: '#FFFFFF',
  },

  // PASSWORD MATCH ALERT
  passCheckAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 10,
    marginBottom: 12,
    gap: 6,
  },
  passCheckAlertMatch: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  passCheckAlertMismatch: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  passCheckAlertText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  passCheckAlertTextMatch: {
    color: '#059669',
  },
  passCheckAlertTextMismatch: {
    color: '#DC2626',
  },

  // SUBMIT BUTTONS
  saveSubmitBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 4,
    shadowColor: '#059669',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  saveSubmitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  saveSubmitBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  saveSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#86EFAC',
    borderRadius: 12,
    paddingVertical: 10,
    gap: 6,
    marginTop: 4,
  },
  saveSecondaryBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#059669',
  },

  // SESSION & LOGOUT
  sessionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    gap: 10,
    shadowColor: '#059669',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  sessionIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#86EFAC',
    flexShrink: 0,
  },
  sessionTextCol: {
    flex: 1,
  },
  sessionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#064E3B',
    marginBottom: 3,
    letterSpacing: -0.2,
  },
  sessionDesc: {
    fontSize: 11,
    color: '#047857',
    lineHeight: 16,
    fontWeight: '500',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 10,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#FECDD3',
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 12,
    shadowColor: '#DC2626',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  logoutIconSquare: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FFE4E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutBtnText: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#E11D48',
    letterSpacing: -0.2,
  },
  logoutBtnSubText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#94A3B8',
    marginTop: 1,
  },
  version: {
    textAlign: 'center',
    color: '#059669',
    fontSize: 10,
    marginTop: 8,
    marginBottom: 8,
    letterSpacing: 0.5,
    fontWeight: '700',
    opacity: 0.7,
  },
});

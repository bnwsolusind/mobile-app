
import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ActivityIndicator,
  Avatar,
  Button,
  Card,
  Divider,
  List,
  Surface,
  Text,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { mobileApiService } from '../services/mobileApiService';
import { AuthUser, useAuthStore } from '../stores/authStore';
import { roleLabel } from '../utils/roles';
import { getProfileImageUrl, DEFAULT_PARENT_AVATAR } from '../utils/profile';

const displayValue = (value: unknown, fallback = '-') => (value ? String(value) : fallback);

export default function ProfilScreen() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const roles = useAuthStore((state) => state.roles);
  const scope = useAuthStore((state) => state.scope);
  const setUser = useAuthStore((state) => state.setUser);
  const clearSession = useAuthStore((state) => state.clearSession);

  const [loading, setLoading] = useState(false);
  const [children, setChildren] = useState<any[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>();

  const isParent = roles.some(
    (r) =>
      r.toLowerCase().includes('parent') ||
      r.toLowerCase().includes('orang tua') ||
      r.toLowerCase().includes('wali')
  );

  useEffect(() => {
    if (!token) return;
    setLoading(true);

    mobileApiService
      .getProfile()
      .then((response) => {
        const profile = response?.data?.data ?? response?.data ?? response;
        if (profile) setUser(profile as AuthUser);
      })
      .catch(() => {
        // Profile data from authenticated session
      })
      .finally(() => setLoading(false));

    if (isParent) {
      mobileApiService
        .getPortalChildren()
        .then((res) => {
          const raw = res?.data ?? res;
          const available = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
          setChildren(available);
          if (available.length > 0) {
            setSelectedChildId(String(available[0].id));
          }
        })
        .catch(() => {
          // fallback
        });
    }
  }, [setUser, token, isParent]);

  const employee = (user?.employee || {}) as Record<string, any>;
  const unit = user?.unit || employee?.unit?.name;
  const name = user?.name || user?.fullName || 'Pengguna';
  const avatarLabel = name.slice(0, 2).toUpperCase();
  const profileImageUrl = getProfileImageUrl(user);

  const currentChild =
    children.find((c) => String(c.id) === String(selectedChildId)) || children[0];

  const handleLogout = () => {
    Alert.alert('Keluar dari aplikasi', 'Sesi pada perangkat ini akan dihapus.', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Keluar',
        style: 'destructive',
        onPress: async () => {
          try {
            await mobileApiService.logout();
          } catch {
            // locally clear session
          } finally {
            clearSession();
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header Profil Utama */}
        <Surface style={styles.profileHeader} elevation={1}>
          {profileImageUrl ? (
            <Avatar.Image size={62} source={{ uri: String(profileImageUrl) }} style={styles.avatar} />
          ) : (
            <Avatar.Image size={62} source={DEFAULT_PARENT_AVATAR} style={styles.avatar} />
          )}
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.email}>{displayValue(user?.email)}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{roleLabel(roles)}</Text>
          </View>
          {loading && <ActivityIndicator size="small" color="#084835" style={styles.refreshIndicator} />}
        </Surface>

        {/* Khusus Peran Orang Tua: Menampilkan Profil & Biodata Santri (Fungsi Asli Menu Utama) */}
        {isParent && (
          <>
            {/* Pemilih Santri / Anak jika lebih dari 1 */}
            {children.length > 1 && (
              <View style={styles.childSelectorBox}>
                <Text style={styles.childSelectorLabel}>Pilih Ananda:</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.childChipsRow}
                >
                  {children.map((child) => {
                    const isSelected = String(child.id) === String(currentChild?.id);
                    return (
                      <TouchableOpacity
                        key={String(child.id)}
                        activeOpacity={0.8}
                        onPress={() => setSelectedChildId(String(child.id))}
                        style={[styles.childChip, isSelected && styles.childChipActive]}
                      >
                        <MaterialCommunityIcons
                          name="school"
                          size={15}
                          color={isSelected ? '#FFFFFF' : '#084835'}
                          style={{ marginRight: 6 }}
                        />
                        <Text style={[styles.childChipText, isSelected && styles.childChipTextActive]}>
                          {child.full_name || child.nama_lengkap || child.name} (
                          {child.kelas?.nama_kelas || 'Kelas'})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Biodata Lengkap Santri */}
            <Card style={styles.card}>
              <Card.Content>
                <View style={styles.cardTitleRow}>
                  <MaterialCommunityIcons name="card-account-details-outline" size={20} color="#084835" />
                  <Text variant="titleMedium" style={styles.sectionTitle}>
                    Biodata Santri ({currentChild?.full_name || 'Santri'})
                  </Text>
                </View>
                <Divider style={styles.divider} />

                <List.Item
                  title="Nama Lengkap Santri"
                  description={displayValue(
                    currentChild?.full_name || currentChild?.nama_lengkap || currentChild?.name
                  )}
                  left={(props) => <List.Icon {...props} icon="account" color="#084835" />}
                />
                <List.Item
                  title="NIS / NISN"
                  description={(currentChild?.nis || '-') + ' / ' + (currentChild?.nisn || '-')}
                  left={(props) => <List.Icon {...props} icon="numeric" color="#084835" />}
                />
                <List.Item
                  title="Unit Pendidikan"
                  description={displayValue(
                    currentChild?.education_unit?.name ||
                      currentChild?.educationUnit?.name ||
                      currentChild?.unit_name ||
                      'Sekolah Terpadu'
                  )}
                  left={(props) => <List.Icon {...props} icon="domain" color="#084835" />}
                />
                <List.Item
                  title="Kelas / Rombel"
                  description={displayValue(
                    currentChild?.kelas?.nama_kelas ||
                      currentChild?.kelas?.name ||
                      currentChild?.class_name
                  )}
                  left={(props) => <List.Icon {...props} icon="google-classroom" color="#084835" />}
                />
                <List.Item
                  title="Tempat, Tanggal Lahir"
                  description={(currentChild?.birth_place || '-') + ', ' + (currentChild?.birth_date ? new Date(currentChild.birth_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-')}
                  left={(props) => <List.Icon {...props} icon="calendar-account" color="#084835" />}
                />
                <List.Item
                  title="Alamat Tempat Tinggal"
                  description={displayValue(currentChild?.address || 'Padang, Sumatera Barat')}
                  left={(props) => <List.Icon {...props} icon="home-map-marker" color="#084835" />}
                />
              </Card.Content>
            </Card>
          </>
        )}

        {/* Informasi Akun / Wali */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.cardTitleRow}>
              <MaterialCommunityIcons name="shield-account-outline" size={20} color="#084835" />
              <Text variant="titleMedium" style={styles.sectionTitle}>
                {isParent ? 'Data Akun Wali Santri' : 'Identitas Akun'}
              </Text>
            </View>
            <Divider style={styles.divider} />

            <List.Item
              title="Nomor Telepon / WhatsApp"
              description={displayValue(user?.phone || employee?.no_hp)}
              left={(props) => <List.Icon {...props} icon="phone-outline" color="#084835" />}
            />
            <List.Item
              title="Email Terdaftar"
              description={displayValue(user?.email)}
              left={(props) => <List.Icon {...props} icon="email-outline" color="#084835" />}
            />
            {!isParent && (
              <>
                <List.Item
                  title="Unit / Sekolah"
                  description={displayValue(unit)}
                  left={(props) => <List.Icon {...props} icon="domain" color="#084835" />}
                />
                <List.Item
                  title="ID Pegawai / Siswa"
                  description={displayValue(scope?.employee_id || scope?.student_id || employee?.niy)}
                  left={(props) => (
                    <List.Icon {...props} icon="badge-account-horizontal-outline" color="#084835" />
                  )}
                />
              </>
            )}
          </Card.Content>
        </Card>

        {/* Bantuan Sesi */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Bantuan Sesi
            </Text>
            <Divider style={styles.divider} />
            <Text style={styles.help}>
              Token autentikasi tersimpan aman di perangkat. Keluar dari akun akan menghapus sesi pada
              perangkat ini.
            </Text>
          </Card.Content>
        </Card>

        {/* Tombol Logout */}
        <Button
          mode="outlined"
          icon="logout"
          onPress={handleLogout}
          textColor="#B91C1C"
          style={styles.logout}
        >
          Keluar dari Akun
        </Button>
        <Text style={styles.version}>SISTEM MANAJEMEN SEKOLAH TERPADU</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8FAF9' },
  content: { padding: 16, paddingBottom: 24 },
  profileHeader: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  avatar: { backgroundColor: '#084835' },
  name: { color: '#0F172A', fontSize: 16, fontWeight: '800', marginTop: 10 },
  email: { color: '#64748B', fontSize: 12, marginTop: 2 },
  badge: {
    backgroundColor: '#DEF7EC',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 8,
  },
  badgeText: { color: '#084835', fontSize: 11, fontWeight: '800' },
  refreshIndicator: { marginTop: 10 },
  childSelectorBox: {
    marginTop: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  childSelectorLabel: { fontSize: 11.5, fontWeight: '700', color: '#64748B', marginBottom: 8 },
  childChipsRow: { flexDirection: 'row', gap: 8 },
  childChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  childChipActive: {
    backgroundColor: '#084835',
    borderColor: '#084835',
  },
  childChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  childChipTextActive: {
    color: '#FFFFFF',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 0,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { color: '#0F172A', fontWeight: '800', fontSize: 14 },
  divider: { marginVertical: 8 },
  help: { color: '#64748B', fontSize: 12, lineHeight: 18 },
  logout: { borderColor: '#FCA5A5', borderRadius: 12, marginTop: 18, borderWidth: 1.2 },
  version: {
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 10.5,
    marginTop: 16,
    letterSpacing: 0.5,
  },
});

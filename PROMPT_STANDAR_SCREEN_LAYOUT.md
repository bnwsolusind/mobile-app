# MASTER PROMPT: STANDAR DESAIN SCREEN & HEADER NAVIGASI (MOBILE APP SIT)

Dokumen ini adalah template prompt standar resmi untuk pembuatan dan penyelarasan halaman (screen) pada aplikasi mobile ini. Anda cukup menyalin teks prompt di dalam kotak kode di bawah ini setiap kali ingin membuat atau merapikan screen/modul baru.

---

```markdown
Tolong buatkan / selaraskan halaman [NAMA_SCREEN] pada aplikasi React Native (Expo) ini agar mengikuti standar arsitektur UI dan layout konsisten yang sama persis dengan AcademicCalendarScreen dan MaterialScreen.

Pastikan memenuhi seluruh pedoman arsitektur dan desain berikut:

### 1. Navigasi Header di `BottomTabs.tsx` (`moduleOptions`)
- Header memiliki latar belakang gradien hijau `['#0D6B42', '#18A165', '#2BD988']`.
- Sudut bawah header melengkung ke atas pada kedua sisi (`borderBottomLeftRadius: 28, borderBottomRightRadius: 28`) dengan latar belakang putih.
- Sisi kiri (`headerLeft`): Tombol kembali (`arrow-left`) berbentuk kartu putih 38x38 berbayang halus.
- Sisi kanan (`headerRight`): Tombol lonceng notifikasi (`bell-outline`) berbentuk kartu putih 38x38 berbayang halus yang membuka halaman `'Notifikasi'`.

### 2. Struktur Pembungkus Layar Screen
- Bungkus layar dengan `rootContainer` putih dan `sheetContainer` ber-gradien lembut:
```tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { isParentRole } from '../utils/roles';
import { getProfileImageUrl } from '../utils/profile';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function [NamaScreen]({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 36 : 16);
  const user = useAuthStore((state) => state.user);
  const isParent = isParentRole(user?.roles || []);

  const [children, setChildren] = useState<any[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(route?.params?.child_id);
  const [studentInfo, setStudentInfo] = useState<any>(null);
  const studentScrollRef = useRef<ScrollView>(null);

  return (
    <View style={styles.rootContainer}>
      <View style={styles.sheetContainer}>
        <LinearGradient
          colors={['#FFFFFF', '#F2FAF6', '#DDF5EB']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <ScrollView
          style={styles.screen}
          contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 30 }]}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} colors={['#18A165']} />}
        >
          {/* SECTION 1: DATA SISWA & UNIT PENDIDIKAN */}
          {children.length > 0 ? (
            <View style={[styles.containerBlock, styles.studentContainerBlock]}>
              <View style={styles.sectionHeaderRow}>
                <MaterialCommunityIcons name="account-school" size={18} color="#18A165" />
                <Text style={styles.sectionTitle}>Data Siswa & Unit Pendidikan</Text>
              </View>

              <ScrollView
                ref={studentScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={SCREEN_WIDTH - 32 + 12}
                decelerationRate="fast"
                onMomentumScrollEnd={handleStudentScrollEnd}
                onScrollEndDrag={handleStudentScrollEnd}
                contentContainerStyle={styles.heroCardScroll}
              >
                {children.map((child, idx) => {
                  const isSelected = String(child.id) === selectedChildId;
                  const childFullName = child.full_name || child.nama_lengkap || child.name || 'Siswa';
                  const unitTitle = child.education_unit?.name || child.unit_name || 'Unit Sekolah';
                  const className = child.kelas?.name || child.kelas?.nama_kelas || child.classroom?.name || '';
                  const avatarUri =
                    getProfileImageUrl(child) ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(childFullName)}&background=${isSelected ? 'FFFFFF' : '18A165'}&color=${isSelected ? '18A165' : 'FFFFFF'}&bold=true&size=128`;

                  return (
                    <TouchableOpacity
                      key={String(child.id)}
                      activeOpacity={0.88}
                      onPress={() => selectChildWithScroll(String(child.id), idx)}
                      style={[styles.childCardHeroSize, isSelected && styles.childCardHeroSizeActive]}
                    >
                      <View style={styles.childHeroTopRow}>
                        <View style={[styles.avatarBorderWrapHero, isSelected && styles.avatarBorderWrapHeroActive]}>
                          <Image source={{ uri: avatarUri }} style={styles.childAvatarImgHero} resizeMode="cover" />
                        </View>
                        <View style={{ flex: 1, marginLeft: 14 }}>
                          <View style={styles.childHeroTitleRow}>
                            <Text numberOfLines={1} style={[styles.childNameHero, isSelected && styles.childTextActive]}>
                              {childFullName}
                            </Text>
                            <View style={[styles.childStatusBadgeHero, isSelected && styles.childStatusBadgeHeroActive]}>
                              <MaterialCommunityIcons
                                name={isSelected ? 'check-circle' : 'gesture-tap'}
                                size={12}
                                color={isSelected ? '#FFFFFF' : '#059669'}
                              />
                              <Text style={[styles.childStatusBadgeTextHero, isSelected && styles.childStatusBadgeTextHeroActive]}>
                                {isSelected ? 'Terpilih' : 'Pilih'}
                              </Text>
                            </View>
                          </View>
                          <Text numberOfLines={1} style={[styles.childClassHero, isSelected && styles.childTextActive]}>
                            {className ? `${className} · ${unitTitle}` : unitTitle}
                          </Text>
                          <Text style={[styles.childSubInfoHero, isSelected && styles.childSubInfoHeroActive]}>
                            {child.nis ? `NIS: ${child.nis} · ` : ''}Siswa Aktif Terdaftar
                          </Text>
                        </View>
                      </View>

                      <View style={[styles.childCardBottomBar, isSelected && styles.childCardBottomBarActive]}>
                        <View style={[styles.childInfoPill, isSelected && styles.childInfoPillActive]}>
                          <MaterialCommunityIcons name="school-outline" size={12} color={isSelected ? '#FFFFFF' : '#18A165'} />
                          <Text numberOfLines={1} style={[styles.childInfoPillText, isSelected && styles.childTextActive]}>
                            {unitTitle}
                          </Text>
                        </View>
                        <View style={[styles.childInfoPill, isSelected && styles.childInfoPillActive]}>
                          <MaterialCommunityIcons name="badge-account-outline" size={12} color={isSelected ? '#FFFFFF' : '#18A165'} />
                          <Text numberOfLines={1} style={[styles.childInfoPillText, isSelected && styles.childTextActive]}>
                            {child.nis ? `NIS: ${child.nis}` : 'Terdaftar Aktif'}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {children.length > 1 && (
                <View style={styles.paginationDotsRow}>
                  {children.map((c, i) => (
                    <TouchableOpacity
                      key={String(c.id || i)}
                      onPress={() => selectChildWithScroll(String(c.id), i)}
                      style={[styles.paginationDot, String(c.id) === selectedChildId && styles.paginationDotActive]}
                    />
                  ))}
                </View>
              )}
            </View>
          ) : studentInfo ? (
            <View style={[styles.containerBlock, styles.studentContainerBlock]}>
              <View style={styles.sectionHeaderRow}>
                <MaterialCommunityIcons name="account-school" size={18} color="#18A165" />
                <Text style={styles.sectionTitle}>Data Siswa & Unit Pendidikan</Text>
              </View>
              {/* Single Hero Card untuk Santri/Siswa login langsung */}
              <View style={[styles.childCardHeroSize, styles.childCardHeroSizeActive]}>
                <View style={styles.childHeroTopRow}>
                  <View style={[styles.avatarBorderWrapHero, styles.avatarBorderWrapHeroActive]}>
                    <Image source={{ uri: getProfileImageUrl(studentInfo) || `https://ui-avatars.com/api/?name=${encodeURIComponent(studentInfo.name || 'Siswa')}&background=FFFFFF&color=18A165&bold=true&size=128` }} style={styles.childAvatarImgHero} resizeMode="cover" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <View style={styles.childHeroTitleRow}>
                      <Text numberOfLines={1} style={[styles.childNameHero, styles.childTextActive]}>{studentInfo.name || 'Siswa Aktif'}</Text>
                      <View style={[styles.childStatusBadgeHero, styles.childStatusBadgeHeroActive]}>
                        <MaterialCommunityIcons name="check-circle" size={12} color="#FFFFFF" />
                        <Text style={[styles.childStatusBadgeTextHero, styles.childStatusBadgeTextHeroActive]}>Siswa</Text>
                      </View>
                    </View>
                    <Text numberOfLines={1} style={[styles.childClassHero, styles.childTextActive]}>{studentInfo.class ? `${studentInfo.class} · ${studentInfo.unit}` : (studentInfo.unit || 'Siswa Terdaftar')}</Text>
                    <Text style={[styles.childSubInfoHero, styles.childSubInfoHeroActive]}>{studentInfo.nis ? `NIS: ${studentInfo.nis} · ` : ''}Terdaftar Aktif</Text>
                  </View>
                </View>
                <View style={[styles.childCardBottomBar, styles.childCardBottomBarActive]}>
                  <View style={[styles.childInfoPill, styles.childInfoPillActive]}>
                    <MaterialCommunityIcons name="school-outline" size={12} color="#FFFFFF" />
                    <Text style={[styles.childInfoPillText, styles.childTextActive]}>{studentInfo.unit || 'Unit Sekolah'}</Text>
                  </View>
                  <View style={[styles.childInfoPill, styles.childInfoPillActive]}>
                    <MaterialCommunityIcons name="badge-account-outline" size={12} color="#FFFFFF" />
                    <Text style={[styles.childInfoPillText, styles.childTextActive]}>{studentInfo.nis ? `NIS: ${studentInfo.nis}` : 'Terdaftar Aktif'}</Text>
                  </View>
                </View>
              </View>
            </View>
          ) : user ? (
            <View style={[styles.containerBlock, styles.studentContainerBlock]}>
              <View style={styles.sectionHeaderRow}>
                <MaterialCommunityIcons name="account-school" size={18} color="#18A165" />
                <Text style={styles.sectionTitle}>Data Pengguna & Unit Pendidikan</Text>
              </View>
              {/* Fallback Single Hero Card Akun Pengguna */}
              <View style={[styles.childCardHeroSize, styles.childCardHeroSizeActive]}>
                <View style={styles.childHeroTopRow}>
                  <View style={[styles.avatarBorderWrapHero, styles.avatarBorderWrapHeroActive]}>
                    <Image source={{ uri: getProfileImageUrl(user) || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'Pengguna')}&background=FFFFFF&color=18A165&bold=true&size=128` }} style={styles.childAvatarImgHero} resizeMode="cover" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <View style={styles.childHeroTitleRow}>
                      <Text numberOfLines={1} style={[styles.childNameHero, styles.childTextActive]}>{user.name || 'Pengguna'}</Text>
                      <View style={[styles.childStatusBadgeHero, styles.childStatusBadgeHeroActive]}>
                        <MaterialCommunityIcons name="check-circle" size={12} color="#FFFFFF" />
                        <Text style={[styles.childStatusBadgeTextHero, styles.childStatusBadgeTextHeroActive]}>{user.role || 'Aktif'}</Text>
                      </View>
                    </View>
                    <Text numberOfLines={1} style={[styles.childClassHero, styles.childTextActive]}>Portal Terpadu Mahad Abu Ja'far</Text>
                    <Text style={[styles.childSubInfoHero, styles.childSubInfoHeroActive]}>Akun Resmi Terverifikasi</Text>
                  </View>
                </View>
                <View style={[styles.childCardBottomBar, styles.childCardBottomBarActive]}>
                  <View style={[styles.childInfoPill, styles.childInfoPillActive]}>
                    <MaterialCommunityIcons name="school-outline" size={12} color="#FFFFFF" />
                    <Text style={[styles.childInfoPillText, styles.childTextActive]}>Mahad Abu Ja'far</Text>
                  </View>
                  <View style={[styles.childInfoPill, styles.childInfoPillActive]}>
                    <MaterialCommunityIcons name="badge-account-outline" size={12} color="#FFFFFF" />
                    <Text style={[styles.childInfoPillText, styles.childTextActive]}>Akun Terverifikasi</Text>
                  </View>
                </View>
              </View>
            </View>
          ) : null}

          {/* SECTION 2: RINGKASAN / KONTEN UTAMA (WAJIB ADA LABEL KONTAINER) */}
          <View style={styles.containerBlock}>
            <View style={styles.sectionHeaderRow}>
              <MaterialCommunityIcons name="chart-box-outline" size={18} color="#18A165" />
              <Text style={styles.sectionTitle}>Ringkasan & Informasi Utama</Text>
            </View>
            {/* Konten Card / KPI Grid / Form / Workspace */}
          </View>

          {/* SECTION 3: DAFTAR DATA (WAJIB ADA LABEL KONTAINER) */}
          <View style={styles.containerBlock}>
            <View style={styles.sectionHeaderRow}>
              <MaterialCommunityIcons name="format-list-bulleted" size={18} color="#18A165" />
              <Text style={styles.sectionTitle}>Daftar Data & Riwayat</Text>
            </View>
            {/* List item card */}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}
```

### 3. Styling StyleSheet Lengkap
Gunakan kode CSS/StyleSheet berikut:
```tsx
const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  sheetContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  screen: { flex: 1, backgroundColor: 'transparent' },
  content: {
    padding: 16,
    paddingTop: Platform.OS === 'android' ? 20 : 16,
  },
  containerBlock: {
    marginBottom: 16,
  },
  studentContainerBlock: {
    marginBottom: 8, // Jarak rapat, proporsional, dan rapi ke kontainer/ringkasan berikutnya
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  heroCardScroll: {
    gap: 12,
    paddingRight: 10,
  },
  childCardHeroSize: {
    width: SCREEN_WIDTH - 32,
    minHeight: 148,
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#18A165',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  childCardHeroSizeActive: {
    backgroundColor: '#18A165',
    borderColor: '#18A165',
  },
  childHeroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarBorderWrapHero: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: '#A7F3D0',
    overflow: 'hidden',
    backgroundColor: '#EBF8F2',
  },
  avatarBorderWrapHeroActive: {
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  childAvatarImgHero: {
    width: '100%',
    height: '100%',
  },
  childHeroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  childNameHero: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    flex: 1,
  },
  childClassHero: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#18A165',
    marginTop: 2,
  },
  childSubInfoHero: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  childSubInfoHeroActive: {
    color: 'rgba(255, 255, 255, 0.85)',
  },
  childStatusBadgeHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  childStatusBadgeHeroActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  childStatusBadgeTextHero: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
  childStatusBadgeTextHeroActive: {
    color: '#FFFFFF',
  },
  childCardBottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  childCardBottomBarActive: {
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  childInfoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
  },
  childInfoPillActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  childInfoPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  childTextActive: {
    color: '#FFFFFF',
  },
  paginationDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#CBD5E1',
  },
  paginationDotActive: {
    width: 22,
    backgroundColor: '#18A165',
});
```

### 4. Aturan Wajib Label Kontainer (`sectionHeaderRow`)
- Seluruh bagian/kontainer konten (baik card ringkasan statistik, KPI grid, workspace filter, maupun list item) **WAJIB** dibungkus dalam `<View style={styles.containerBlock}>` dan diawali dengan baris judul header:
  ```tsx
  <View style={styles.containerBlock}>
    <View style={styles.sectionHeaderRow}>
      <MaterialCommunityIcons name="[nama-icon]" size={18} color="#18A165" />
      <Text style={styles.sectionTitle}>[Judul Kontainer]</Text>
    </View>
    {/* Konten Card / Grid / List */}
  </View>
  ```
- Jarak antar-kontainer dikelola konsisten dengan `styles.containerBlock` (`marginBottom: 16`), sedangkan jarak kartu data siswa ke kontainer pertama di bawahnya menggunakan `styles.studentContainerBlock` (`marginBottom: 8` s/d `12`) agar rapat dan proporsional.
- Tidak diperkenankan menampilkan card, grid, atau daftar yang melayang tanpa header label penjelas.
```

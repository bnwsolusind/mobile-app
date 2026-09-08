# MASTER PROMPT: STANDAR DESAIN SCREEN & HEADER NAVIGASI (MOBILE APP SIT)

Dokumen ini adalah template prompt standar resmi untuk pembuatan dan penyelarasan halaman (screen) pada aplikasi mobile ini. Anda cukup menyalin teks prompt di dalam kotak kode di bawah ini setiap kali ingin membuat atau merapikan screen/modul baru.

---

```markdown
Tolong buatkan / selaraskan halaman [NAMA_SCREEN] pada aplikasi React Native (Expo) ini agar mengikuti standar arsitektur UI dan layout konsisten yang sama persis dengan AcademicCalendarScreen dan MaterialScreen.

================================================================================
⚠️ ATURAN EMAS (GOLDEN RULES - WAJIB DIPATUHI TANPA PENGECUALIAN):
================================================================================
1. PRESERVASI ELEMEN INTI & FUNGSI (JANGAN UBAH ELEMEN YANG SUDAH ADA):
   - JANGAN PERNAH mengubah, merusak, atau menghapus Card Data Ananda / Siswa (carousel card, pagination dots, dan state aktif berlatar hijau solid #18A165).
   - JANGAN PERNAH mengubah, merusak, atau mengganti Header Navigasi Gradien Hijau dengan True Absolute Center Title dan batas tombol selaras card 16dp.
   - JANGAN PERNAH merusak BottomTabs, tombol menu, status bar, navigasi kembali, maupun routing yang sudah berfungsi.
   - JANGAN PERNAH merusak atau menghapus fungsi bisnis, logika peran (role Guru/Musyrif/Orang Tua), modal pop-up yang sudah ada, maupun alur API yang telah berjalan.
   - Setiap permintaan perubahan style atau penambahan halaman HANYA BOLEH mempercantik tampilan visual atau menambahkan halaman baru dengan komponen standar tanpa mengganggu stabilitas modul yang sudah ada!

2. ZERO HARDCODE POLICY (DILARANG KERAS MENGGUNAKAN DATA HARDCODE / DUMMY STATIS):
   - DILARANG membuat konstanta array statis berisi data fiktif (mockup) untuk data siswa, jadwal, absensi, nilai, ibadah, maupun hafalan.
   - WAJIB menghubungkan setiap tampilan konten ke API dinamis backend (`mobileApiService`), menggunakan schema interface/type TypeScript yang jelas.
   - WAJIB menyediakan handling status yang lengkap:
     * Loading State (ActivityIndicator / Skeleton elegan).
     * Empty State (ilustrasi/icon + pesan informatif ramah jika belum ada data dari server).
     * Error & Offline State (menggunakan `offlineCache` dan tombol coba lagi).
   - Penyesuaian data wajib mengikuti tipe program siswa dari server (misal: membedakan hak akses dan agenda Fullday School vs Boarding Pesantren).
================================================================================

Pastikan memenuhi seluruh pedoman arsitektur dan desain berikut:

### 1. Navigasi Header Modul di `BottomTabs.tsx` (`moduleOptions` & `ModuleHeader`)
- **Latar Belakang Gradien Hijau**: Memiliki gradien `['#0D6B42', '#18A165', '#2BD988']` dengan dekorasi lingkaran halus (`decorWave` & `decorCircle`).
- **Sudut Lengkung Bawah**: Sudut bawah melengkung elegan (`borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden'`) dengan latar pembungkus `#FFFFFF`.
- **Batas Luar Tombol Selaras Card (`paddingHorizontal: 16`)**:
  - Tombol kembali (`arrow-left`) di sebelah kiri dan tombol lonceng (`bell-outline`) di sebelah kanan ditempatkan dalam `buttonsRow` dengan `paddingHorizontal: 16` dan `justifyContent: 'space-between'`.
  - Posisi batas terluar kedua tombol lurus dan sejajar presisi dengan batas tepi kartu (*cards*) konten di bawahnya yang juga menggunakan margin/padding 16dp.
  - Berbentuk kartu putih squircle 38x38 (`borderRadius: 12`), bayangan lembut (`elevation: 3`, `shadowOpacity: 0.15`), dan ikon berwarna `#18A165`.
- **Penempatan Judul Tepat di Tengah (*True Absolute Center*)**:
  - Judul halaman **WAJIB** berada tepat di titik tengah layar (50% dari lebar layar) secara simetris dan seimbang.
  - Untuk mencegah pergeseran judul ke arah kanan akibat flexbox atau toolbar bawaan Android, judul dibungkus dalam layer terpisah menggunakan `StyleSheet.absoluteFill` dengan `pointerEvents="none"`.
  - Teks judul diberi `numberOfLines={1}`, `fontSize: 16.5`, `fontWeight: '900'`, warna `#FFFFFF`, serta `paddingHorizontal: 68` agar teks panjang tidak menabrak tombol kiri maupun kanan.
- **Implementasi Kode Standar di `BottomTabs.tsx`**:
```tsx
function ModuleHeader({ title, navigation }: { title: string; navigation: any }) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 0);

  return (
    <View style={{ backgroundColor: '#FFFFFF', width: '100%' }}>
      <LinearGradient
        colors={['#0D6B42', '#18A165', '#2BD988']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          moduleHeaderStyles.gradientBar,
          {
            paddingTop: topInset + 8,
            paddingBottom: 14,
          },
        ]}
      >
        <View style={moduleHeaderStyles.decorWave} />
        <View style={moduleHeaderStyles.decorCircle} />

        {/* Layer Judul: Tepat di titik tengah layar (50% Screen Width) */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View
            style={[
              moduleHeaderStyles.titleAbsoluteCenter,
              {
                paddingTop: topInset + 8,
                paddingBottom: 14,
              },
            ]}
          >
            <Text numberOfLines={1} style={moduleHeaderStyles.title}>
              {title}
            </Text>
          </View>
        </View>

        {/* Layer Tombol: Kiri (Back) & Kanan (Bell) Selaras Batas Card 16dp */}
        <View style={moduleHeaderStyles.buttonsRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kembali ke Beranda"
            onPress={() => navigation.navigate('Beranda')}
            style={moduleHeaderStyles.backButton}
          >
            <MaterialCommunityIcons name="arrow-left" size={20} color="#18A165" />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notifikasi"
            onPress={() => navigation.navigate('Notifikasi')}
            style={moduleHeaderStyles.bellButton}
          >
            <MaterialCommunityIcons name="bell-outline" size={20} color="#18A165" />
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

// StyleSheet Header Modul:
const moduleHeaderStyles = StyleSheet.create({
  gradientBar: {
    width: '100%',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
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
    paddingHorizontal: 16, // Presisi selaras dengan margin konten card
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
  title: {
    fontSize: 16.5,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
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
});
```


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

### 5. Aturan Wajib Warna Hero Card Siswa Terpilih / Aktif
- **Background & Border**: Card dalam keadaan terpilih (`childCardHeroSizeActive`) **WAJIB** berlatar hijau solid `#18A165` dan border `#18A165` (DILARANG memakai background pucat/putih kehijauan seperti `#F0FDF4`).
- **Warna Teks Aktif (`childTextActive`)**: Seluruh teks (nama anak, kelas, unit pendidikan, NIS, teks badge status, dan teks chip info bawah) **WAJIB** berwarna putih bersih `#FFFFFF`.
- **Warna Sub-Info Aktif (`childSubInfoHeroActive`)**: Teks keterangan sub-info berwarna putih lembut `rgba(255, 255, 255, 0.85)`.
- **Bingkai Avatar Aktif (`avatarBorderWrapHeroActive`)**: Border putih `#FFFFFF` dengan latar transparan `rgba(255, 255, 255, 0.25)`.
- **Badge Status Terpilih (`childStatusBadgeHeroActive`)**: Latar transparan `rgba(255, 255, 255, 0.25)`, border `rgba(255, 255, 255, 0.4)`, icon centang dan teks `#FFFFFF`.
- **Chip Bawah & Separator Aktif (`childInfoPillActive` & `childCardBottomBarActive`)**: Latar chip `rgba(255, 255, 255, 0.2)`, garis pemisah `borderTopColor: 'rgba(255, 255, 255, 0.2)'`, serta seluruh icon chip (`school-outline`, `badge-account-outline`) berwarna `#FFFFFF`.

### 6. Aturan Wajib Modal Pop-Up & Bottom-Sheet Bebas Tabrakan Navigasi Handphone
- **Masalah Utama**: Pada perangkat Android modern dengan sistem navigasi 3 tombol softkey (Kembali, Home, Recents) atau gesture pill setinggi 36dp s/d 48dp, modal pop-up bottom-sheet (`justifyContent: 'flex-end'`) sering kali tombol aksi terbawahnya ("Tutup", "Simpan", "Batal") **tertutup atau bertabrakan** dengan bilah navigasi handphone jika hanya menggunakan `paddingBottom` statis.
- **Wajib Inset Bawah Dinamis**:
  ```tsx
  import { useSafeAreaInsets } from 'react-native-safe-area-context';
  import { Dimensions, Platform, Pressable } from 'react-native';

  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

  // Di dalam component:
  const insets = useSafeAreaInsets();
  const modalBottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 48 : 20) + 16;
  ```
- **Struktur Modal Wajib**:
  1. Berikan prop `statusBarTranslucent` pada `<Modal>`.
  2. Pasang `<Pressable style={StyleSheet.absoluteFill} onPress={() => setModalOpen(false)} />` pada backdrop agar user dapat menutup modal dengan menekan area di luar modal.
  3. Berikan padding bawah dinamis pada kartu: `style={[styles.modalCard, { paddingBottom: modalBottomInset }]}`.
  4. Sediakan `modalDragHandle` (`width: 40, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', alignSelf: 'center', marginBottom: 12`).
  5. Batasi ketinggian ScrollView di dalam modal (`style={{ maxHeight: SCREEN_HEIGHT * 0.62 }}`) agar konten tidak mendorong tombol aksi keluar batas layar.
  6. Tombol aksi penutup/submit berjarak aman di atas sistem navigasi handphone dengan `paddingVertical: 13`.
```tsx
<Modal
  visible={Boolean(isOpen)}
  animationType="slide"
  transparent
  onRequestClose={() => setIsOpen(false)}
  statusBarTranslucent
>
  <View style={styles.modalBackdrop}>
    <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsOpen(false)} />
    <View style={[styles.modalCard, { paddingBottom: modalBottomInset }]}>
      <View style={styles.modalDragHandle} />
      <View style={styles.modalHeaderRow}>
        <Text style={styles.modalHeaderTitle}>Detail Informasi</Text>
        <TouchableOpacity onPress={() => setIsOpen(false)} style={styles.modalCloseBtn}>
          <MaterialCommunityIcons name="close" size={18} color="#64748B" />
        </TouchableOpacity>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: SCREEN_HEIGHT * 0.62 }}>
        {/* Isi detail modal */}
      </ScrollView>
      <TouchableOpacity activeOpacity={0.88} onPress={() => setIsOpen(false)} style={styles.modalActionBtn}>
        <Text style={styles.modalActionBtnText}>Tutup</Text>
      </TouchableOpacity>
    </View>
  </View>
</Modal>
```
```

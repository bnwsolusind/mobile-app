# STANDAR RESMI DESAIN UI/UX & ARSITEKTUR KOMPONEN MOBILE APP (HEROUI SPECIFICATION)
*Sistem Manajemen Sekolah Terpadu (SIT & Boarding Pesantren)*

Dokumen ini adalah **pedoman baku dan patokan resmi emas (Gold Standard)** untuk seluruh desain antarmuka (UI), pengalaman pengguna (UX), komponen, dan hierarki tipografi pada aplikasi mobile React Native (Expo). Setiap pengembangan layar baru maupun perapian layar lama **wajib patuh 100%** pada standar ini.

---

## 📐 1. ATURAN EMAS TIPOGRAFI (TYPOGRAPHY SPECIFICATION)

### A. Skala & Hierarki Font
Dilarang menggunakan ukuran teks acak atau terlalu kecil. Seluruh teks dalam aplikasi wajib mengikuti skala berikut:

| Token / Role | Font Size | Font Weight | Line Height | Contoh Penggunaan |
| :--- | :--- | :--- | :--- | :--- |
| **Display / Hero** | `20px - 22px` | `900` (Black) | `26px - 28px` | Salam Utama Beranda, Header Modal Besar |
| **Title 1 (Page Title)** | `16px - 17px` | `900` (Black) | `22px` | Judul Halaman di Header Navigasi, Judul Modul Utama |
| **Title 2 (Card Header)** | `13.5px - 14.5px`| `800` (ExtraBold) | `19px - 20px` | Judul Kartu Penugasan, Judul Card Rekap KPI, Judul Jadwal |
| **Title 3 (Section / Sub)**| `12.5px - 13px` | `800` (Bold) | `17px - 18px` | Sub-header di dalam Card, Nama Guru, Nama Mapel |
| **Body (Isi Teks)** | `12px - 12.5px` | `500 - 600` (Medium) | `17px - 18px` | Deskripsi tugas, instruksi, catatan guru, keterangan libur |
| **Button Text** | `11.5px - 12px` | `800` (ExtraBold) | `16px` | Teks tombol: "Kumpulkan Tugas", "Detail", "Ganti Anak", "Filter" |
| **Meta / Label / Badge** | `10.5px - 11px` | `700 - 800` (Bold) | `14px - 15px` | Label KPI ("TOTAL TUGAS"), Status Pill ("Terlambat"), Tag Mapel |
| **Micro Counter / Count** | `9.5px - 10px` | `900` (Black) | `12px` | Badge angka kecil di dalam pill (misal: pill count status filter) |

### B. Golden Rules Kontras & Keterbacaan (Anti-Invisible Text)
1. **Zero Text Below 10.5px**: Dilarang menggunakan teks di bawah `10.5px` untuk label, subteks, atau metadata penting agar orang tua dan siswa dapat membaca tanpa kendala *outdoor glare*.
2. **Jaminan Kontras Tinggi (WCAG AAA)**:
   - Latar Gelap/Vivid (`#065F46`, `#047857`, `#1E3A8A`, `#7C3AED`): Wajib teks putih murni `#FFFFFF` dengan subteks `#CCFBF1` atau `#BFDBFE`.
   - Latar Terang/Pastel (`#ECFDF5`, `#FFFBEB`, `#FFF1F2`, `#FAF5FF`): Wajib teks gelap pekat semantik (`#065F46`, `#92400E`, `#9F1239`, `#5B21B6`).
   - **DILARANG KERAS** menggunakan teks putih di atas latar putih/mint pucat.
3. **Truncation & Ellipsis Safety**:
   - Seluruh judul kartu, nama siswa, nama guru, dan label badge wajib menggunakan `numberOfLines={1}` atau `numberOfLines={2}` dengan `ellipsizeMode="tail"` agar tidak terjadi *text clipping* atau overflow horizontal.

---

## 🎨 2. SISTEM TOKEN DESAIN (HEROUI-INSPIRED TOKENS)

### A. Palet Warna Semantik
```typescript
export const PALETTE = {
  emerald: {
    50: '#ECFDF5',
    100: '#D1FAE5',
    200: '#A7F3D0',
    500: '#10B981',
    600: '#059669',
    700: '#047857',
    800: '#065F46',
    900: '#064E3B',
    dark: '#004D32',
  },
  amber: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    600: '#D97706',
    700: '#B45309',
    800: '#92400E',
  },
  rose: {
    50: '#FFF1F2',
    100: '#FFE4E6',
    200: '#FECDD3',
    600: '#E11D48',
    700: '#BE123C',
    800: '#9F1239',
  },
  purple: {
    50: '#FAF5FF',
    100: '#F3E8FF',
    200: '#E9D5FF',
    600: '#7C3AED',
    700: '#6D28D9',
    800: '#5B21B6',
  },
  blue: {
    50: '#EFF6FF',
    100: '#DBEAFE',
    200: '#BFDBFE',
    600: '#2563EB',
    700: '#1D4ED8',
    800: '#1E40AF',
  },
  slate: {
    50: '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    600: '#475569',
    700: '#334155',
    900: '#0F172A',
  },
};
```

### B. Skala Sudut (Border Radius Tokens)
* `radius.sm`: `8px` — Badge kecil, dot pill, nested counter.
* `radius.md`: `12px` — Tombol aksi (`Button`), Icon Squircle, Badge Mapel, Tag Status.
* `radius.lg`: `16px` — Sub-kartu KPI, SearchBar input, Item baris jadwal.
* `radius.xl`: `20px` — Container Card Utama (Master KPI Card, Filter Card, Calendar Card).
* `radius.full`: `9999px` — Avatar bulat, Segmented Tab Pill, Status Pill.

### C. Elevasi & Bayangan (Shadow Tokens)
* `shadow.subtle`: `{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 }`
* `shadow.card`: `{ shadowColor: '#047857', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2 }`
* `shadow.floating`: `{ shadowColor: '#059669', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 4 }`

---

## 🧩 3. SPESIFIKASI KOMPONEN MODULAR ALA HEROUI

### 1. `HeroAvatar`
* **Kegunaan**: Identitas siswa di header beranda, jadwal, tugas, dan pemilih ananda.
* **Ukuran Standar**:
  * `xl` (`72px` x `72px`): Hero profil utama halaman dengan ring tebal 3.5px (`#10B981`).
  * `lg` (`48px` x `48px`): Kartu seleksi dialog anak.
  * `md` (`38px` x `38px`): Header row tabel atau list.
* **Fitur**: Fallback avatar otomatis (kartun santri putra/putri) jika URL null, serta badge online/status asrama.

### 2. `HeroButton`
* **Kegunaan**: Seluruh tombol aksi interaktif.
* **Spesifikasi Ergonomis**:
  * **Tinggi Standar**:
    * `md` = `38px` (tombol aksi pada card: "Detail", "Kelompok", "Kumpulkan").
    * `lg` = `44px` (tombol kontrol baris pencarian: "Filter", "Sortir", "Submit Modal").
  * **Varian**:
    * `solid`: Latar gradasi zamrud/indigo penuh, teks putih bold.
    * `flat`: Latar pastel lembut (`#ECFDF5`), border tipis (`#A7F3D0`), teks semantik (`#065F46`).
    * `bordered`: Latar putih, border 1.5px, teks gelap.
    * `light`: Transparan untuk tombol ikon.
  * **Feedback Interaktif**: `activeOpacity: 0.8` atau pegas `transform: [{ scale: 0.98 }]`.

### 3. `HeroCard` (Master Card & Content Card)
* **Kegunaan**: Wadah terpadu agar elemen tidak melayang tanpa batas.
* **Struktur 3 Lapis**:
  1. `<HeroCard.Header>`: Latar pastel lembut (`#F0FDF4`), border-bottom 1.2px, ikon squircle, judul card, subjudul, dan badge total.
  2. `<HeroCard.Body>`: Area isi (grid metrik atau kumpulan list).
  3. `<HeroCard.Footer>`: Tombol aksi bawah (jika ada).
* **Wajib**: Border presisi `1.5px`, radius `20px`, overflow `hidden`.

### 4. `HeroChip` / `HeroBadge`
* **Kegunaan**: Indikator status (Belum Dikerjakan, Dikumpulkan, Terlambat, Dinilai, KBM Aktif).
* **Varian**:
  * `flat`: Latar pastel + teks bold semantik (default untuk tugas & presensi).
  * `dot`: Dilengkapi titik pulsing hijau menyala untuk sesi yang sedang aktif.
  * `solid`: Angka hitungan tugas / notifikasi.
* **Tinggi**: `22px` - `26px`, padding horizontal `8px - 10px`, radius `8px - 10px`.

### 5. `HeroTabs` (Segmented Tab Bar)
* **Kegunaan**: Navigasi 3 Tab (Jadwal: Harian/Semua/Ujian, Tugas: Daftar/Kalender/Nilai).
* **Spesifikasi**:
  * Kontainer abu-abu lembut (`#F1F5F9`), border 1px (`#E2E8F0`), padding 4px, radius `18px`.
  * Tombol Tab: Tinggi `42px`, pembagian lebar rata (`flex: 1`).
  * Tab Aktif: Gradasi zamrud pekat `['#064E3B', '#047857']`, teks putih `11px font-900`, ikon putih.
  * Tab Inaktif: Latar putih, border 1.2px (`#E2E8F0`), teks `#0F172A` bold.

### 6. `HeroInput` & SearchBar
* **Kegunaan**: Bar pencarian real-time tugas, guru, atau mata pelajaran.
* **Spesifikasi**:
  * Tinggi `44px`, border `1.5px` (`#CBD5E1`), radius `14px`, background `#FFFFFF`.
  * Ikon pencarian di kiri (`magnify`), tombol bersihkan teks di kanan (`close-circle`) saat terisi.
  * Integrasi debounce `350ms` untuk mencegah lonjakan request server.

### 7. `HeroBottomSheet` & Modal
* **Kegunaan**: Modal filter, pemilih anak, detail sesi, dan pengumpulan berkas.
* **Aturan Anti-Tabrakan Navigasi HP**:
  * Wajib menghitung inset bawah: `modalBottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 48 : 20) + 16`.
  * Dilengkapi `modalDragHandle` visual di bagian atas kartu sheet.
  * Backdrop kaca es buram (`rgba(15, 23, 42, 0.65)`).
  * Batasi tinggi scroll konten (`maxHeight: SCREEN_HEIGHT * 0.65`).

### 8. `HeroSkeleton` & `HeroProgress`
* **Kegunaan**: Menghilangkan spinner melompat dan menampilkan progres visual belajar.
* **Spesifikasi**:
  * Shimmer halus meniru bentuk kartu penugasan saat data dimuat.
  * Progress Bar: Tinggi `6px - 8px`, radius `full`, warna emerald terpadu.

---

## 🏆 4. STANDAR HALAMAN BENCHMARK (GOLD STANDARDS)

1. **Halaman Jadwal Pelajaran**: [ScheduleScreen.tsx](file:///Applications/XAMPP/xamppfiles/htdocs/Sistem-Manajemen-Sekolah-terpadu-main/mobile-app/src/screens/ScheduleScreen.tsx)
   - Patokan untuk: Timeline vertikal (Jam Kiri + Card Kanan), Pulsing KBM Dot, Week Day Strip, Card Format Switcher, dan Handling Hari Libur Santai.
2. **Halaman Tugas Siswa**: [AssignmentScreen.tsx](file:///Applications/XAMPP/xamppfiles/htdocs/Sistem-Manajemen-Sekolah-terpadu-main/mobile-app/src/screens/AssignmentScreen.tsx)
   - Patokan untuk: Master Rekap Penugasan Card (1 Card berisi 4 KPI), Card Filter & Pencarian (Search + Sort + Filter Modal + Status Pills), Assignment Card Action Cluster, dan Evaluasi Graded Frame.
3. **Header Foliage & Profil Siswa**:
   - Patokan untuk: Header dedaunan kampus ramah keluarga, Avatar 72px ring mint, tombol "Ganti Anak" squircle, dan transisi modal bottom sheet pemilih siswa.

# Catatan Audit & Dokumentasi Modul Kisi-Kisi Ujian (LMS & Portal)

Dokumen ini mencatat hasil audit menyeluruh, temuan bug, status data hardcode/mockup, serta implementasi perbaikan pada **Web-Dashboard**, **Backend**, dan **Mobile App (Android)**.

---

## 1. Ringkasan Status Akhir Modul

- **Database (`lms_kisi_kisi`):** 100% Real Database. Menggunakan relasi resmi ke `subjects` (mata pelajaran), `kelas`, `guru`, `semester`, dan `tahun_ajaran`.
- **Backend Service & Controller:** Bebas hardcode/mockup. Data dinamis dari query database.
- **Web-Dashboard (`LmsKisiKisiPage.jsx` & `ParentPortalPage.jsx`):** Bebas hardcode/mockup. Menggunakan data ril dari API.
- **Mobile App (Android - `ExamGridsScreen.tsx`):** Layar baru resmi telah selesai dibuat dengan layout standar SIT (`PROMPT_STANDAR_SCREEN_LAYOUT.md`), tersambung langsung ke backend, dan **bebas hardcode**.

---

## 2. Hasil Audit Awal & Temuan Masalah

### A. Backend (`backend`)
1. **Bug Query Column Mismatch di Portal Controller:**
   - **Lokasi:** `backend/app/Http/Controllers/Api/V1/StudentParentPortalController.php` (baris 2027)
   - **Masalah:** Controller memanggil `->where('status_publikasi', true)`. Namun pada skema tabel database `lms_kisi_kisi`, nama kolom yang benar adalah `status` (boolean).
   - **Dampak:** Query SQL menghasilkan error atau data kisi-kisi siswa/anak selalu bernilai kosong.
   - **Status Solusi:** **Telah diperbaiki** menjadi `->where('status', true)`.

### B. Web-Dashboard (`web-dashboard`)
1. **LmsKisiKisiPage.jsx (`/kisi-kisi-ujian`):**
   - Menggunakan service `lmsKisiKisiService` yang terhubung ke `/api/lms/kisi-kisi`.
   - **Status:** 100% Real Data, tidak ada mock data array.
2. **ParentPortalPage.jsx:**
   - Tab kisi-kisi memanggil `api.get('/portal/exam-grids', { headers: { 'X-Child-Id': childId } })` dan merender `ExamGridsWorkspace.jsx`.
   - **Status:** 100% Real Data.
3. **StudentPortalPage.jsx:**
   - Terdapat logika fallback jika endpoint `portal/exam-grids` kosong (akibat bug backend terdahulu), sistem mencari relasi `kisi_kisi` pada array ujian. Setelah query backend diperbaiki, data ril kini langsung tersaji dari tabel utama.

### C. Mobile App Android (`mobile-app`)
1. **Kondisi Sebelum Perbaikan:**
   - Menu *"Kisi-kisi"* di Beranda hanya mengarahkan navigasi ke portal orang tua umum tanpa memuat modul kisi-kisi.
   - Belum ada layar khusus `ExamGridsScreen.tsx`.
   - Belum ada pemanggilan method API `getPortalExamGrids` di `mobileApiService.ts`.
   - Di `ParentPortalScreen.tsx` terdapat nilai fallback hardcode (`92` untuk rata-rata rapor dan `'172 Ayat'` untuk tahfizh).

---

## 3. Implementasi Perbaikan yang Dilakukan

### 1. Perbaikan Backend Query
- File: [StudentParentPortalController.php](file:///Applications/XAMPP/xamppfiles/htdocs/Sistem-Manajemen-Sekolah-terpadu-main/backend/app/Http/Controllers/Api/V1/StudentParentPortalController.php)
- Memperbaiki baris 2027:
  ```php
  // SEBELUM:
  ->where('status_publikasi', true)

  // SESUDAH (FIXED):
  ->where('status', true)
  ```

### 2. Penambahan Service API Mobile
- File: [mobileApiService.ts](file:///Applications/XAMPP/xamppfiles/htdocs/Sistem-Manajemen-Sekolah-terpadu-main/mobile-app/src/services/mobileApiService.ts)
- Menambahkan method:
  ```typescript
  getPortalExamGrids: async (childId?: string, params: Record<string, any> = {}) => {
    const childConfig = childRequest(childId);
    return (
      await api.get('/portal/exam-grids', {
        ...(childConfig || {}),
        params: { ...(childConfig?.params || {}), ...params },
      })
    ).data;
  },
  ```

### 3. Pembuatan Layar Android Mandiri (Sesuai Layout Standar)
- File: [ExamGridsScreen.tsx](file:///Applications/XAMPP/xamppfiles/htdocs/Sistem-Manajemen-Sekolah-terpadu-main/mobile-app/src/screens/ExamGridsScreen.tsx)
- Fitur & Standar yang Diimplementasikan:
  - **Header & Sheet Container:** Menggunakan gradient hijau SIT `#0D6B42` s.d `#18A165` dengan tombol back dan bell notifikasi.
  - **Data Siswa & Unit Pendidikan (Hero Card Carousel):** Menampilkan santri/anak aktif dengan kartu solid hijau saat terpilih, foto profil asli / inisial, kelas, dan unit sekolah.
  - **Toolbar Filter Dinamis:** Pencarian judul/mapel/guru dan filter chip mata pelajaran yang di-generate murni dari mata pelajaran kisi-kisi yang ada di database.
  - **Kartu Kisi-Kisi Ril:** Menampilkan mata pelajaran, jenis ujian (PTS, PAS, UH, CBT), judul, alokasi waktu, jumlah butir soal, level kognitif (L1-L3), dan guru pengampu.
  - **Modal Detail Kisi-Kisi:** Menampilkan capaian kompetensi dasar dan distribusi bobot soal secara lengkap.
  - **Empty State Ril:** Jika belum ada data yang diinput guru di database, halaman menampilkan instruksi kosong resmi (tanpa memunculkan data palsu/tiruan).

### 4. Pembersihan Hardcode Portal Orang Tua
- File: [ParentPortalScreen.tsx](file:///Applications/XAMPP/xamppfiles/htdocs/Sistem-Manajemen-Sekolah-terpadu-main/mobile-app/src/screens/ParentPortalScreen.tsx)
- Mengubah fallback nilai hardcode `92` dan `'172 Ayat'` menjadi data ril atau tanda strip (`'-'`) jika data memang belum diinput di database.

### 5. Registrasi Navigasi & Menu
- File: [BottomTabs.tsx](file:///Applications/XAMPP/xamppfiles/htdocs/Sistem-Manajemen-Sekolah-terpadu-main/mobile-app/src/navigation/BottomTabs.tsx) & [HomeScreen.tsx](file:///Applications/XAMPP/xamppfiles/htdocs/Sistem-Manajemen-Sekolah-terpadu-main/mobile-app/src/screens/HomeScreen.tsx)
- Mendaftarkan rute screen `KisiKisi` dan mengarahkan menu beranda peran Orang Tua dan Siswa langsung ke layar tersebut.

---

## 4. Jaminan Production (Zero Mockup)

Seluruh modul Kisi-Kisi telah dipastikan:
1. **Tidak mengandung array data statis/tiruan.**
2. **Aman untuk dihapus/dibersihkan:** Data seeder/dummy di database dapat dikosongkan sewaktu-waktu saat menuju lingkungan *production* tanpa menimbulkan bug atau merusak tampilan antarmuka.

---

## 5. Log Perbaikan Error & Bundling (Metro Bundler)

| Komponen | Isu / Pesan Error | Tindakan Penyelesaian | Status |
| :--- | :--- | :--- | :---: |
| `ExamGridsScreen.tsx` | `Unable to resolve "../store/authStore" from "src/screens/ExamGridsScreen.tsx"` | Mengubah jalur import dari `../store/authStore` menjadi `../stores/authStore` sesuai struktur folder resmi. | **Resolved** |


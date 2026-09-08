# Catatan Audit dan Perbaikan Data Absensi

Dokumen ini mencatat kesimpulan audit menyeluruh, verifikasi integrasi database/backend, serta laporan perbaikan data hardcode/mockup pada modul absensi di Android, Web-Dashboard, Backend, dan Database.

---

## 1. Ringkasan Eksekutif

Modul absensi sekolah terpadu mencakup 3 pilar operasional:
1. **Absensi Gerbang / Masuk Sekolah** (RFID / QR Scanner / Mobile Tap).
2. **Absensi Pembelajaran di Kelas** (LMS Presensi per Jadwal Pelajaran).
3. **Perizinan Siswa** (Pengajuan Izin/Sakit oleh Orang Tua & Siswa, verifikasi oleh Wali Kelas / Guru).

Audit ini memastikan bahwa seluruh alur data dari aplikasi mobile (Android) dan Web Dashboard berjalan secara terintegrasi dengan backend dan database MariaDB/MySQL, serta bebas dari data rekayasa/mockup lokal.

---

## 2. Status Data Staging vs Production

### Pertanyaan Pokok:
> *Apakah data absensi yang digunakan saat staging dapat dihapus saat beralih ke production tanpa merusak modul atau menimbulkan bug?*

### Hasil Audit & Jaminan Integritas Database:
1. **Aman untuk Pembersihan (Truncate / Reset):**
   - Data absensi tersimpan pada tabel `lms_presensi_sesi`, `lms_presensi`, `student_attendance_permissions`, dan `gate_attendance_logs`.
   - Modul absensi **tidak mengandalkan ID statis atau baris data tertentu** di database agar kodenya bisa berjalan.
   - Semua foreign key (`siswa_id`, `jadwal_pelajaran_id`, `session_id`, `created_by`) menggunakan relasi standar dengan cascade / set null yang aman.
2. **Kondisi Empty State yang Kuat:**
   - Baik backend, web dashboard, maupun Android telah dilengkapi dengan proteksi kondisi kosong (*empty state* / `Array.isArray(data) ? data : []`).
   - Jika data staging dihapus seluruhnya (`DELETE FROM lms_presensi;` atau `TRUNCATE`), sistem tidak akan crash, melainkan menampilkan tampilan bersih *"Belum ada riwayat presensi"*.
3. **Input Data Real Produksi:**
   - Ketika guru memulai sesi absensi baru (`lmsPresensiService.storeSession`) atau siswa melakukan tap gerbang (`gateAttendanceService.scanCheckIn`), database akan meng-generate ID auto-increment / UUID baru secara wajar tanpa ketergantungan pada data staging lama.

---

## 3. Hasil Audit Hardcode pada Web Dashboard

Sebelum dilakukan perbaikan, ditemukan beberapa titik sisa data mockup / fallback pada komponen Web-Dashboard:

| File Web-Dashboard | Temuan Sebelum Perbaikan | Dampak |
| :--- | :--- | :--- |
| `src/components/portal/AttendanceWorkspace.jsx` | Pembacaan field salah: `item.status` bukan `item.status_hadir` / `item.status_label`. Fallback teks statis `'Hadir'`. | Counter KPI bernilai 0 dan status selalu tampil "Hadir" walau di DB statusnya izin/sakit. |
| `src/pages/LaporanAbsensiPage.jsx` | Fungsi lokal `buildSimulatedAttendanceRows` yang otomatis meng-generate absensi palsu jika DB kosong untuk filter tertentu. | Muncul baris data buatan frontend bertipe `att-real-*`. |
| `src/pages/attendance/HomeroomAttendanceDashboardPage.jsx` | Konstanta `DEFAULT_TEACHERS` berisi 7 nama guru rekaan (`Ust. Abdullah`, `Ustdh. Fatimah`, dll.) sebagai fallback query. | Jika pegawai belum terdaftar / server lambat, muncul guru fiktif. |
| `src/pages/ParentPortalPage.jsx` | Konstanta `MOCK_FALLBACK_CHILDREN` (220+ baris data anak dummy tidak terpakai/dead code). | Menambah ukuran file dan memicu keraguan integritas data. |

---

## 4. Perbaikan yang Telah Dilakukan (Eksekusi Selesai)

Semua titik hardcode di atas telah diperbaiki secara tuntas:

### A. [AttendanceWorkspace.jsx](file:///Applications/XAMPP/xamppfiles/htdocs/Sistem-Manajemen-Sekolah-terpadu-main/web-dashboard/src/components/portal/AttendanceWorkspace.jsx)
- **Normalisasi Status:** Pembacaan status kini mendukung `item.status_hadir || item.status_label || item.status`.
- **Perhitungan Statistik Akurat:** Menghitung jumlah hadir, terlambat, izin, sakit, dan alpa langsung dari data riil.
- **Relasi Mata Pelajaran & Jadwal:** Menghubungkan nama mata pelajaran secara hierarkis:
  `item.jadwal_pelajaran?.subject?.name || item.jadwalPelajaran?.subject?.name || item.session?.subject?.name || item.session?.schedule?.subject?.name || item.subject_name`.
- **Waktu Kehadiran:** Menggunakan jam kedatangan riil `item.tanggal` dan `item.arrival_time || item.waktu_presensi`.

### B. [LaporanAbsensiPage.jsx](file:///Applications/XAMPP/xamppfiles/htdocs/Sistem-Manajemen-Sekolah-terpadu-main/web-dashboard/src/pages/LaporanAbsensiPage.jsx)
- **Generator Simulasi Dihapus:** Fungsi `buildSimulatedAttendanceRows` telah dinonaktifkan (`() => []`).
- **Murni Data Database:** Baris tabel laporan (`rawRows`) murni mengembalikan `Array.isArray(report.rows) ? report.rows : []`. Jika filter tidak menemukan data di database, halaman menampilkan *empty state* yang jujur tanpa memanipulasi data di browser.

### C. [HomeroomAttendanceDashboardPage.jsx](file:///Applications/XAMPP/xamppfiles/htdocs/Sistem-Manajemen-Sekolah-terpadu-main/web-dashboard/src/pages/attendance/HomeroomAttendanceDashboardPage.jsx)
- **Pengosongan Guru Mock:** Array `DEFAULT_TEACHERS` telah diubah menjadi `[]`.
- **Fallback Bersih:** Jika API gagal merespons atau belum ada guru, state `teachersList` menjadi `[]` dan menampilkan indikator belum ada guru terdaftar.
- **Formulir Jadwal:** Dropdown guru pengampu jadwal membaca array asli `teachersList` dari backend.

### D. [ParentPortalPage.jsx](file:///Applications/XAMPP/xamppfiles/htdocs/Sistem-Manajemen-Sekolah-terpadu-main/web-dashboard/src/pages/ParentPortalPage.jsx)
- **Pembersihan Dead Code:** Mengosongkan konstanta `MOCK_FALLBACK_CHILDREN = []` (menghapus 220+ baris data statis anak fiktif).

---

## 5. Checklist Kesiapan Produksi (Production Readiness)

- [x] Backend API `/api/portal/attendance` mengirim pagination log presensi asli dari tabel `lms_presensi`.
- [x] Backend API `/api/portal/permissions` mengelola pengajuan dan riwayat izin/sakit dari tabel `student_attendance_permissions`.
- [x] Web-Dashboard tidak lagi meng-inject data absensi tiruan pada halaman laporan maupun portal.
- [x] Web-Dashboard membaca struktur kolom database yang benar (`status_hadir` & `status_label`).
- [x] Android Mobile App terhubung ke endpoint absensi dan jadwal asli via `mobileApiService`.
- [x] Penghapusan data uji coba (staging) teruji aman tanpa menimbulkan error foreign key atau pemutusan relasi.

---

## 6. Penyelarasan Layar Absensi Mobile Android (`AbsensiScreen.tsx`)

Sesuai standar **`PROMPT_STANDAR_SCREEN_LAYOUT.md`**, layar absensi pada mobile app telah dirombak secara menyeluruh:

1. **Dukungan Multi-Peran (Orang Tua, Siswa, Guru & Pegawai):**
   - **Orang Tua:** Menampilkan *Hero Card Carousel* anak horizontal dengan snap scroll, indikator dot, dan avatar. Otomatis menarik presensi pembelajaran (`/api/portal/attendance`) dan perizinan (`/api/portal/permissions`) untuk anak yang dipilih.
   - **Siswa:** Menampilkan *Single Hero Card* identitas siswa terdaftar, statistik kehadiran, dan riwayat presensi pembelajaran.
   - **Pegawai / Guru / Staff:** Menampilkan kartu pegawai terverifikasi, status presensi mandiri (Masuk/Pulang) via GPS/QR, dan riwayat presensi harian pegawai.

2. **Arsitektur Tampilan Berstandar Master Layout:**
   - **Latar Belakang:** Menggunakan gradien halus `['#FFFFFF', '#F2FAF6', '#DDF5EB']` dengan pembungkus `rootContainer` dan `sheetContainer`.
   - **Section 1 (Data Siswa & Unit):** Hero card warna hijau solid `#18A165` untuk kartu aktif terpilih, teks putih bersih `#FFFFFF`, badge status transparan, serta bottom bar info unit & NIS.
   - **Section 2 (Ringkasan & Statistik):** Kartu sorotan persentase kehadiran (%) siswa, diikuti grid modern kartu KPI (Hadir, Terlambat, Izin, Sakit, Alpha).
   - **Section 3 (Aksi Utama / Perizinan):** Formulir pengajuan izin/sakit langsung ke wali kelas (untuk orang tua/siswa) dan tombol presensi masuk/pulang (untuk pegawai).
   - **Section 4 (Riwayat & Log Kehadiran):** Tab filter (`Semua`, `Presensi Kelas`, `Izin / Sakit`), bilah pencarian real-time, kartu riwayat dengan badge status dinamis, dan catatan guru.

3. **Standar Modal Bottom-Sheet Bebas Tabrakan Navigasi Android:**
   - Menggunakan `modalBottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 48 : 20) + 16`.
   - Backdrop transparan interaktif (dapat ditutup dengan tap di luar modal), drag handle atas, dan pembatasan `maxHeight: SCREEN_HEIGHT * 0.62` pada ScrollView agar tombol aksi penutup ("Tutup" / "Kirim Pengajuan Izin") tetap terlihat aman di atas bilah navigasi handphone.

4. **100% Data Riil Tanpa Hardcode:**
   - Semua data di-*fetch* langsung dari database via API `mobileApiService` tanpa array mock statis.

---

## 7. Perbaikan Rute Navigasi & Hak Akses Modul Absensi di Mobile App

Ditemukan dan telah diperbaiki 2 kendala teknis yang sebelumnya menyebabkan layar absensi di Android tidak langsung berubah:

### A. Rute Menu Beranda (`src/screens/HomeScreen.tsx`)
* **Penyebab:**
  - Sebelumnya, tombol menu "Absensi" di halaman utama di-mapping secara terpisah ke rute portal masing-masing peran:
    - Orang Tua diarahkan ke `'Orang Tua'` (`ParentPortalScreen.tsx`, tab: `'attendance'`), yang hanya menampilkan kartu profil umum.
    - Siswa diarahkan ke `'Siswa'` (`StudentPortalScreen.tsx`).
    - Guru diarahkan ke `'Guru'` (`TeacherPortalScreen.tsx`).
  - Hal ini menyebabkan pengguna tidak pernah diarahkan ke screen `AbsensiScreen.tsx`.
* **Perbaikan:**
  - Menyelaraskan seluruh tombol menu "Absensi" pada `HomeScreen.tsx` (untuk Guru, Orang Tua, Siswa, TU, dan Kepala Sekolah) agar semuanya langsung membuka screen **`'Absensi'`** (`AbsensiScreen.tsx`).

### B. Otorisasi Layar & Screen Guard (`src/utils/accessControl.ts`)
* **Penyebab:**
  - Fungsi evaluasi hak akses layar `canAccessScreen('attendance', ...)` pada switch `attendance` awalnya hanya mendaftarkan peran `isTeacherRole`, `isTuRole`, `isOperatorRole`, dan `isPrincipalRole`.
  - Peran `isParentRole` dan `isStudentRole` belum disertakan, sehingga `withScreenGuard` pada `BottomTabs.tsx` memblokir akses atau menyembunyikan tab presensi untuk Orang Tua dan Siswa dengan pesan: *"Akun Anda tidak memiliki hak akses untuk mencatat presensi mandiri."*
* **Perbaikan:**
  - Menambahkan `isParentRole(roles)` dan `isStudentRole(roles)` ke dalam pengecekan `hasAttendanceRole` pada `src/utils/accessControl.ts`.
  - Sekarang seluruh peran (Guru, Orang Tua, Siswa, Staf) memiliki otorisasi penuh untuk mengakses layar Absensi terpadu.

### C. Hasil Validasi
* Kompilasi TypeScript (`npx tsc --noEmit`) lolos dengan **0 error**.
* Navigasi dari menu Beranda maupun Tab Bar langsung membuka antarmuka terpadu `AbsensiScreen.tsx`.



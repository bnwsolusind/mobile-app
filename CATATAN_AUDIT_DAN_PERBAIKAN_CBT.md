# Catatan Audit & Dokumentasi Modul Ujian Online CBT

Dokumen ini mencatat hasil audit menyeluruh, perbaikan missing routes, pembersihan data mockup, serta implementasi layar **Ujian CBT** pada **Web-Dashboard**, **Backend**, dan **Mobile App (Android)** dengan **100% Real Data Database**.

---

## 1. Ringkasan Status Akhir Modul CBT

- **Database (`lms_ujian`, `lms_bank_soal`, `lms_ujian_sesi`, `lms_jawaban_siswa`):** 100% Real Database MySQL.
- **Backend API & Engine:**
  - Telah didaftarkan rute pengumpulan ujian `POST /api/portal/lms/exam-sessions/{sesiId}/finish`.
  - Sistem penilaian otomatis (*auto-grading*) untuk PG, Isian, Menjodohkan, dan Benar/Salah berjalan secara aman di server (kunci jawaban tidak dibocorkan ke klien).
  - Cron scheduler `cbt:auto-timeout` aktif tiap menit untuk sesi kedaluwarsa.
- **Web-Dashboard:**
  - Mock data `DEFAULT_FALLBACK_EXAMS` pada `CbtExamsWorkspace.jsx` **telah dihapus**.
  - Butir soal dummy `MOCK_EXAM_SESSIONS` dan interceptor pada `StudentPortalPage.jsx` **telah dihapus**.
- **Mobile App (Android):**
  - Dibuat layar mandiri [CbtExamsScreen.tsx](file:///Applications/XAMPP/xamppfiles/htdocs/Sistem-Manajemen-Sekolah-terpadu-main/mobile-app/src/screens/CbtExamsScreen.tsx) dengan mengikuti layout standar SIT (`PROMPT_STANDAR_SCREEN_LAYOUT.md`).
  - Terhubung langsung ke API `/portal/lms/exams` dan bebas dari data mock/hardcode.

---

## 2. Hasil Audit Awal & Masalah yang Ditemukan

### A. Backend Route
- **Masalah:** Method `finishExam` di `StudentParentPortalController.php:2187` belum memiliki rute di `routes/api.php`.
- **Dampak:** Pengumpulan lembar ujian CBT oleh siswa gagal (*404 Not Found*).
- **Perbaikan:** Menambahkan:
  ```php
  Route::post('/lms/exam-sessions/{sesiId}/finish', [StudentParentPortalController::class, 'finishExam'])
      ->middleware('role:Siswa|siswa|student');
  ```

### B. Web-Dashboard
- **Masalah:** Terdapat data dummy ujian PAI dan Pancasila di `CbtExamsWorkspace.jsx` serta soal tiruan di `StudentPortalPage.jsx`.
- **Perbaikan:** Menghapus seluruh array dan konstanta mock tersebut, sehingga antarmuka 100% membaca data dinamis dari backend.

### C. Mobile App Android
- **Masalah:** Tombol "Ujian CBT" di menu Beranda hanya mengarahkan ke halaman profil portal umum (`ParentPortalScreen`). Siswa bahkan belum memiliki tombol menu ujian CBT.
- **Perbaikan:** Dibuat layar baru `CbtExamsScreen.tsx`, didaftarkan ke `BottomTabs.tsx`, dan dihubungkan ke tombol menu peran Orang Tua dan Siswa.

---

## 3. Implementasi Layar Mobile Android (`CbtExamsScreen.tsx`)

1. **Header & Theme:**
   - Gradient hijau SIT `#0D6B42` ke `#18A165` lengkap dengan tombol back dan bell notifikasi.
2. **Hero Card Siswa & Unit Pendidikan:**
   - Carousel santri aktif dengan kartu hijau solid saat terpilih, foto avatar asli / inisial, nomor induk siswa (NIS), kelas, dan nama unit pendidikan.
3. **4 Kartu Ringkasan Statistik (KPI Cards):**
   - Total CBT, Ujian Siap Dikerjakan, Jadwal Mendatang, dan Riwayat Ujian Selesai.
4. **Pencarian & Filter Tab Real-time:**
   - Input pencarian judul/mapel dan tab filter (Semua, Siap Dikerjakan, Mendatang, Riwayat Selesai).
5. **Kartu Jadwal Ujian Ril:**
   - Menampilkan badge mata pelajaran, status ketersediaan (Tersedia, Lanjutkan, Akan Datang, Ditutup), judul ujian, kelas, guru pengampu, durasi menit, jumlah butir soal, target KKM, rentang waktu pengerjaan, dan riwayat skor nilai akhir jika sudah dinilai.
6. **Modal Petunjuk & Tombol Mulai:**
   - Konfirmasi instruksi pengerjaan dari guru sebelum sesi dimulai.
   - Hak akses orang tua dibatasi ke mode *monitoring jadwal* (read-only), sedangkan siswa dapat memulai sesi pengerjaan langsung.
7. **Kondisi Kosong (*Empty State*):**
   - Menampilkan ilustrasi dan pesan resmi jika dewan guru belum menerbitkan paket ujian di database (tidak menampilkan data palsu).

---

## 4. Jaminan Production (Zero Mockup)

Seluruh alur modul Ujian CBT di Backend, Web-Dashboard, dan Mobile-App telah:
1. Menggunakan data murni dari database MySQL (`lms_ujian`).
2. Aman untuk dihapus/direset seeder-nya kapan saja tanpa menyebabkan crash atau bug antarmuka.

---

## 5. Audit & Solusi: Ujian Tersedia Tidak Bisa Diklik / Tidak Ada Tombol Kerjakan

### A. Akar Masalah yang Ditemukan
1. **Pada Akun Orang Tua (`isParent === true`):**
   - Sebelumnya, tombol aksi `"Mulai Ujian"` dibungkus oleh kondisi `{!isParent && ( ... )}` sehingga tombol aksi disembunyikan sepenuhnya bagi orang tua.
   - Kartu ujian merupakan elemen `<View>` biasa tanpa listener interaktif (`onPress`). Akibatnya, orang tua melihat kartu dengan badge hijau `"Tersedia"` namun tidak ada satupun elemen yang dapat diklik atau ditekan, memberikan kesan aplikasi macet/rusak.
2. **Pada Akun Siswa / Penguji (`!isParent`):**
   - Saat tombol `"Mulai Ujian"` ditekan dan instruksi dikonfirmasi, fungsi `handleStartExam` sebelumnya hanya memunculkan `Alert.alert('Sesi Ujian Dimulai', '... Silakan kerjakan di portal CBT')` tanpa membuka antarmuka pengerjaan soal di dalam aplikasi mobile.
3. **Hak Akses Endpoint Backend:**
   - Endpoint `POST /api/portal/lms/exams/{id}/start` sebelumnya hanya membolehkan peran siswa, sehingga akun Super Admin / Admin yang melakukan simulasi pengujian mendapatkan respons *403 Forbidden*.

### B. Perbaikan & Fitur yang Diimplementasikan
1. **Kartu Ujian Interaktif (`TouchableOpacity`):**
   - Seluruh area kartu ujian kini dapat diklik untuk membuka modal detail & petunjuk pengerjaan ujian.
   - Bagi **Orang Tua**: Disediakan tombol eksplisit `"Lihat Detail & Petunjuk Ujian"` berwarna biru dengan info box informatif bahwa akun orang tua berada dalam *Mode Pemantauan* (pengerjaan dilakukan oleh siswa melalui akun siswa).
   - Bagi **Siswa & Admin**: Disediakan tombol `"Mulai Ujian"` / `"Lanjutkan Ujian"` berwarna hijau.
2. **Ruang Ujian Interaktif CBT In-App (*Full-Screen Exam Runner*):**
   - **Countdown Timer Ril:** Hitungan mundur durasi ujian (`MM:SS` / `HH:MM:SS`) yang otomatis berubah warna merah peringatan jika sisa waktu $\le$ 5 menit. Sesi otomatis dikumpulkan jika waktu habis.
   - **Lembar Soal & Opsi Pilihan Ganda / Esai:** Tampilan butir pertanyaan dengan opsi radio A, B, C, D, E berdesain modern dan bersih. Jawaban otomatis tersimpan (*auto-save*) ke server backend setiap kali dipilih.
   - **Tombol Ragu-ragu:** Fitur penanda soal ragu-ragu dengan warna kuning khas CBT nasional.
   - **Lembar Nomor Soal (*Question Palette*):** Tombol palet soal untuk melompat langsung ke nomor tertentu dengan indikator status (hijau = sudah dijawab, kuning = ragu-ragu, abu-abu = belum dijawab).
   - **Konfirmasi Pengumpulan:** Modal konfirmasi sebelum submit yang merangkum jumlah soal yang telah dijawab, ragu-ragu, dan belum dijawab.
   - **Modal Hasil Ujian:** Menampilkan skor nilai akhir, perbandingan KKM, status Tuntas/Belum Tuntas, serta jumlah benar, salah, dan kosong bila ujian disetel menampilkan nilai langsung.
3. **Backend Middleware Multi-Peran:**
   - Rute `startExam`, `saveExamAnswers`, dan `finishExam` telah disesuaikan agar mendukung mode testing/simulasi oleh Admin/Super Admin dengan mengaitkan konteks data siswa.

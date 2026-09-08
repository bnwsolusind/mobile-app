# Catatan Audit dan Flow Mutabaah Orang Tua

Dokumen ini menyimpan kesimpulan audit dan rancangan pengembangan Mutabaah untuk portal orang tua pada backend, web dashboard, dan aplikasi Android. Dokumen ini menjadi acuan sebelum implementasi dilakukan.

## 1. Pengertian Mutabaah

Mutabaah adalah sistem pemantauan kebiasaan, pembinaan, dan ibadah harian siswa secara terstruktur. Mutabaah bukan sekadar checklist. Data Mutabaah memiliki sumber input, lokasi pelaksanaan, proses verifikasi, finalisasi, paraf orang tua, riwayat, dan hasil penilaian.

Pembagian peran:

- Sekolah mengatur agenda, template, periode, program siswa, rumus penilaian, lokasi, dan pihak yang bertanggung jawab menginput.
- Guru, pembimbing, atau musyrif mencatat kegiatan di sekolah/asrama, melakukan verifikasi, memberikan catatan, dan melakukan finalisasi.
- Orang tua menginput aktivitas yang berlangsung di rumah sesuai aturan backend, membaca laporan sekolah/asrama, serta memberikan paraf atau meminta klarifikasi.
- Siswa melihat hasil dan riwayat sesuai hak aksesnya.

## 2. Kesimpulan Audit Backend

Backend telah memiliki fondasi berikut:

- Header dan detail Mutabaah harian.
- Agenda, kategori, template, assignment template, dan assignment pembimbing.
- Periode penilaian dan aturan input orang tua.
- Rekap harian, mingguan, bulanan, dan riwayat.
- Catatan pembimbing.
- Paraf orang tua dengan status `approved`, `clarification_requested`, dan `unable_to_verify`.
- Permission `mutabaah.daily.view`, `mutabaah.parent.sign`, dan `mutabaah.parent.input_home`.
- Pembatasan relasi orang tua dan siswa melalui `parent_id` dan pivot `student_parents`.
- Larangan mengubah data setelah pembimbing melakukan finalisasi.

Endpoint utama monitoring orang tua:

```text
GET  /api/parent/mutabaah/children
GET  /api/parent/mutabaah/{studentId}
GET  /api/parent/mutabaah/{studentId}/history
POST /api/parent/mutabaah/{dailyHeaderId}/signature
```

Endpoint input ibadah rumah:

```text
GET  /api/portal/children/{studentId}/worship-input
POST /api/portal/children/{studentId}/worship-input
```

Kekurangan backend yang ditemukan:

1. Pemetaan `class_name` dan `class_id` di `MutabaahPortalService` memakai operator boolean `||`. Operator tersebut dapat menghasilkan `true` atau `false`. Nilai properti seharusnya dipilih memakai `??`.
2. Terdapat dua jalur endpoint yang tumpang tindih, yaitu `/portal/mutabaah` dan `/parent/mutabaah/{studentId}`. Kontrak utama orang tua perlu disatukan pada endpoint parent yang lengkap.
3. Context input ibadah rumah belum mengirim nilai existing dari database.
4. Context perlu mengirim `can_parent_input`, `report_only`, alasan larangan input, lokasi aktual siswa, program siswa, dan status apakah data masih dapat diedit.
5. Diperlukan tes HTTP untuk penolakan input serta paraf terhadap siswa milik orang tua lain.
6. Diperlukan tes aturan agenda di luar tanggung jawab orang tua dan larangan perubahan data yang sudah final.

## 3. Kesimpulan Audit Web Dashboard

Tab Mutabaah pada `ParentPortalPage` saat ini memakai endpoint lama:

```text
GET /api/portal/mutabaah?child_id={id}
```

Respons endpoint tersebut berbentuk object, sedangkan fungsi `unwrap()` pada halaman hanya menangani array. Akibatnya object Mutabaah dapat berubah menjadi array kosong sebelum diberikan kepada `MutabaahWorkspace`.

Kekurangan lain:

- Perhitungan checklist lama menganggap keberadaan detail sebagai aktivitas tercapai. Status `less`, `not_done`, dan `na` dapat ikut dihitung sebagai tercapai.
- `ParentWorshipInputWorkspace` belum menampilkan nilai yang sebelumnya tersimpan.
- Tanggal input rumah menggunakan UTC melalui `toISOString()`, sehingga dapat berbeda dengan tanggal Asia/Jakarta di sekitar pergantian hari.
- Pilihan `na` atau uzur belum tersedia pada form web meskipun backend mendukungnya.
- Setelah penyimpanan, context belum dimuat ulang.
- Belum tersedia pemilih tanggal input rumah.

Project sebenarnya sudah memiliki `MutabaahFamilyPortal` yang lebih lengkap, mencakup monitoring, rekap mingguan/bulanan, riwayat, catatan pembimbing, dan paraf. Namun pengguna dengan role orang tua diarahkan kembali ke `/portal-orangtua`, sehingga modul lengkap tersebut belum menjadi tampilan utama orang tua.

`ParentPortalPage` juga masih mempunyai `MOCK_FALLBACK_CHILDREN` dan angka/keterangan contoh. Seluruh fallback tersebut harus dihapus. Jika database kosong atau request gagal, halaman harus menampilkan empty state atau pesan error yang jujur.

## 4. Kesimpulan Audit Android

File `MutabaahScreen.tsx` sudah ada dan dapat membaca endpoint Mutabaah. Namun halaman tersebut belum didaftarkan pada navigasi utama.

Masalah yang ditemukan:

- Tombol Mutabaah orang tua membuka `ParentPortalScreen` dengan parameter `tab: mutabaah`.
- `ParentPortalScreen` tidak membaca parameter tab tersebut.
- `MutabaahScreen` belum dapat memilih anak dan hanya memakai anak pertama sebagai fallback.
- Belum tersedia input ibadah rumah.
- Belum tersedia paraf, komentar, atau permintaan klarifikasi.
- Belum tersedia riwayat dan pemilih tanggal.
- Nilai kosong ditampilkan sebagai `0%`, padahal data kosong berbeda dengan nilai nol.
- Layout belum mengikuti `PROMPT_STANDAR_SCREEN_LAYOUT.md`.
- `ParentPortalScreen` masih memuat angka dan keterangan contoh Mutabaah/Tahfizh.

Halaman Android yang akan dibangun harus memakai data backend dan memiliki:

- Kartu pemilihan siswa standar.
- Pemilih tanggal.
- Status program dan lokasi siswa.
- Skor harian, mingguan, serta bulanan.
- Jumlah aktivitas Baik, Kurang, Belum, dan Uzur/N/A.
- Detail aktivitas, lokasi, sumber input, dan status verifikasi.
- Catatan pembimbing.
- Riwayat dengan pagination.
- Input ibadah rumah jika diizinkan backend.
- Paraf, komentar, klarifikasi, dan status tidak dapat memverifikasi.
- Empty state yang tidak mengubah data kosong menjadi angka nol.

## 5. Program Siswa Fullday dan Boarding

Program siswa harus ditentukan dari record aktif di backend, bukan ditebak dari nama kelas atau unit.

Data minimal penempatan program:

```text
student_id
program_type: fullday | boarding
education_unit_id
class_id
start_date
end_date
status
```

Penempatan program harus mempunyai riwayat agar laporan masa lalu tetap memakai program yang berlaku pada tanggal tersebut.

### Flow Fullday

Pembagian tanggung jawab yang direncanakan:

| Aktivitas | Lokasi | Penginput | Akses orang tua |
|---|---|---|---|
| Dhuha | Sekolah | Guru/pembimbing | Melihat laporan |
| Zuhur | Sekolah | Guru/pembimbing | Melihat laporan |
| Asar | Sekolah | Guru/pembimbing | Melihat laporan |
| Subuh | Rumah | Orang tua | Menginput |
| Magrib | Rumah | Orang tua | Menginput |
| Isya | Rumah | Orang tua | Menginput |
| Tahajud | Rumah | Orang tua | Menginput |
| Ibadah rumah lainnya | Rumah | Orang tua | Menginput sesuai aturan |

Flow fullday:

```text
Sekolah menetapkan program fullday
→ backend memilih template dan membagi penanggung jawab agenda
→ guru menginput kegiatan sekolah
→ orang tua melihat laporan kegiatan sekolah
→ orang tua menginput kegiatan rumah yang ditugaskan kepadanya
→ pembimbing memverifikasi
→ backend menghitung skor
→ pembimbing memfinalisasi
→ orang tua memberi paraf atau meminta klarifikasi
→ hasil resmi masuk ke halaman Nilai Hasil Belajar
```

### Flow Boarding

Ketika siswa berada di pondok, seluruh kegiatan sekolah dan asrama dicatat guru atau musyrif. Orang tua menerima laporan dan tidak memperoleh form input harian.

Aktivitas dapat meliputi Subuh, Dhuha, Zuhur, Asar, Magrib, Isya, Tahajud, tilawah, adab, kebersihan, dan kegiatan asrama lainnya.

Flow boarding:

```text
Sekolah menetapkan program boarding
→ backend memilih template boarding
→ guru/musyrif mencatat kegiatan sekolah dan asrama
→ pembimbing melakukan verifikasi dan finalisasi
→ orang tua menerima laporan harian, mingguan, dan bulanan
→ orang tua membaca catatan pembimbing
→ orang tua memberi paraf, meminta klarifikasi, atau menyatakan tidak dapat memverifikasi
→ hasil resmi masuk ke halaman Nilai Hasil Belajar
```

Orang tua boarding hanya mendapat akses input apabila siswa secara resmi sedang berada di rumah, misalnya karena izin pulang, libur pondok, sakit bersama keluarga, atau periode kepulangan.

## 6. Lokasi Aktual dan Perpindahan Tanggung Jawab

Program siswa tidak cukup untuk menentukan hak input. Backend juga perlu mengetahui lokasi aktual siswa pada setiap tanggal.

Contoh status lokasi:

```text
school
home
boarding
leave
hospital
```

Hak input ditentukan oleh kombinasi:

```text
program aktif siswa
+ tanggal aktivitas
+ kalender sekolah/asrama
+ status izin atau kepulangan
+ lokasi aktual
+ periode khusus
+ aturan agenda
```

Frontend tidak boleh menentukan sendiri siapa yang dapat menginput. Frontend hanya menampilkan aturan yang diberikan backend.

Contoh context fullday di rumah:

```json
{
  "program_type": "fullday",
  "care_location": "home",
  "input_mode": "parent_input",
  "can_parent_input": true,
  "report_only": false
}
```

Contoh context boarding di pondok:

```json
{
  "program_type": "boarding",
  "care_location": "boarding",
  "input_mode": "report_only",
  "can_parent_input": false,
  "report_only": true
}
```

## 7. Periode Ramadan

Ramadan harus menggunakan periode dan template khusus, bukan kondisi hardcode di Android atau web.

Agenda Ramadan dapat mencakup:

- Puasa.
- Sahur.
- Tarawih.
- Witir.
- Tilawah.
- Sedekah.
- Kultum.
- Iktikaf.
- Target hafalan Ramadan.

Pembagian penginput tetap berdasarkan lokasi aktual. Siswa fullday yang berada di rumah pada malam hari dicatat orang tua. Santri boarding yang berada di pondok dicatat musyrif. Setelah periode Ramadan berakhir, backend kembali menggunakan template reguler.

## 8. Sinkronisasi dengan Nilai Hasil Belajar

Halaman Mutabaah merupakan sumber aktivitas dan proses penilaian. Halaman Nilai Hasil Belajar hanya menampilkan hasil resmi yang telah dihitung backend.

Flow nilai:

```text
Input aktivitas Mutabaah
→ verifikasi pembimbing
→ finalisasi harian
→ kalkulasi formula backend
→ rekap periode penilaian
→ publikasi nilai akhir
→ halaman Nilai Hasil Belajar Android dan web
```

Nilai resmi per periode membutuhkan data minimal:

```text
student_id
academic_year_id
semester_id
assessment_period_id
formula_version
final_score
predicate
passing_grade
completion_status
publication_status
```

Halaman Nilai dapat menampilkan:

- Nilai akhir Mutabaah.
- Predikat.
- KKM atau batas ketuntasan.
- Status tuntas atau perlu pembinaan.
- Tahun ajaran, semester, dan periode penilaian.
- Jumlah hari yang dinilai.
- Jumlah Baik, Kurang, Belum, dan Uzur.
- Persentase kepatuhan.
- Catatan pembimbing.
- Versi formula.
- Status draft atau published.

Nilai Mutabaah sebaiknya ditampilkan sebagai kelompok penilaian terpisah terlebih dahulu. Nilai tidak ikut rata-rata mata pelajaran kecuali kebijakan formula sekolah secara eksplisit mengaktifkan bobot tersebut.

Android dan web tidak boleh menghitung nilai akhir. Jika formula atau nilai published belum tersedia, tampilkan `Nilai Mutabaah belum diterbitkan`, bukan `0` dan bukan nilai contoh.

## 9. Aturan Perhitungan

Konsep perhitungan dilakukan di backend berdasarkan formula aktif:

- `good` memperoleh bobot penuh.
- `less` memperoleh sebagian bobot sesuai formula.
- `not_done` memperoleh nol.
- `na` atau uzur dapat dikeluarkan dari pembagi sesuai kebijakan formula.
- Setiap agenda dapat memiliki bobot berbeda.
- Aktivitas yang memerlukan verifikasi belum menjadi hasil final sebelum diverifikasi.
- Formula dan hasil harus disimpan sebagai snapshot agar perubahan rumus tidak mengubah nilai periode lama.

## 10. Aturan Hak Akses

Orang tua fullday dapat:

- Melihat hasil kegiatan sekolah.
- Menginput kegiatan rumah yang diberikan backend.
- Memperbarui input selama masih draft.
- Memberi paraf, meminta klarifikasi, atau tidak dapat memverifikasi.
- Melihat riwayat dan nilai.

Orang tua fullday tidak dapat mengubah input sekolah, hasil verifikasi, finalisasi, atau nilai.

Orang tua boarding dapat:

- Melihat laporan sekolah dan asrama.
- Melihat catatan musyrif.
- Melihat riwayat dan nilai.
- Memberi paraf, meminta klarifikasi, atau tidak dapat memverifikasi.
- Menginput hanya ketika backend menetapkan siswa berada di rumah.

Orang tua boarding tidak dapat mengubah input musyrif atau menginput kegiatan asrama ketika siswa berada di pondok.

## 11. Prinsip Data dan Empty State

- Tidak menggunakan data mock atau hardcode pada halaman produksi.
- Seluruh identitas siswa harus berasal dari backend dan terikat ke akun orang tua yang login.
- Perubahan siswa terpilih harus mengganti seluruh context, aktivitas, riwayat, dan nilai.
- Request gagal tidak boleh diganti dengan siswa atau skor contoh.
- Data kosong tidak boleh ditampilkan sebagai nilai nol.
- Gunakan pesan `Belum ada agenda aktif`, `Belum ada penilaian`, `Belum ada pembimbing`, atau `Belum ada aktivitas untuk tanggal ini` sesuai kondisi sebenarnya.

## 12. Urutan Eksekusi yang Direkomendasikan

1. Perbaiki operator `||` menjadi `??` pada pemetaan siswa Mutabaah backend.
2. Tetapkan `/parent/mutabaah/*` sebagai kontrak monitoring utama orang tua.
3. Lengkapi context input rumah dengan program, lokasi, hak input, status existing, dan kemampuan edit.
4. Tambahkan model/riwayat program siswa dan lokasi aktual per tanggal bila belum tersedia.
5. Pastikan aturan fullday, boarding, kepulangan, dan Ramadan dikendalikan backend.
6. Tambahkan endpoint atau hasil resmi nilai Mutabaah per periode.
7. Perbaiki portal web agar memakai overview lengkap dan menghapus fallback mock.
8. Bangun dan hubungkan halaman Mutabaah Android khusus sesuai standar layout.
9. Sinkronkan nilai published Mutabaah ke halaman Nilai Hasil Belajar web dan Android.
10. Tambahkan tes keamanan, aturan input, finalisasi, formula, dan pemisahan data lintas orang tua/siswa.

## 13. Kesimpulan Akhir

Fondasi Mutabaah telah tersedia di backend, tetapi integrasi web dan Android belum konsisten. Implementasi berikutnya tidak perlu membangun ulang seluruh modul. Fokusnya adalah menyatukan kontrak endpoint, melengkapi context, membedakan program dan lokasi siswa, menghapus hardcode, menghubungkan halaman Android, serta menerbitkan hasil nilai Mutabaah yang resmi dan dapat ditelusuri.

Flow akhir yang dituju:

```text
Orang tua memilih anak
→ backend membaca program dan lokasi anak pada tanggal tersebut
→ backend memilih periode, template, agenda, dan penanggung jawab
→ aplikasi menampilkan laporan dan aktivitas yang sesuai hak akses
→ guru/musyrif/orang tua menginput bagiannya masing-masing
→ pembimbing melakukan verifikasi dan finalisasi
→ orang tua menerima laporan dan memberi paraf/klarifikasi
→ backend menghitung serta menerbitkan nilai periode
→ nilai resmi tampil pada halaman Nilai Hasil Belajar
```

## 14. Hasil Audit Data Staging, Proteksi Finalisasi, & Status Lintas Platform (4 September 2026)

### A. Audit Penyebab Data Awal Kosong & Injeksi Data Staging
1. **Audit Master Awal**:
   - `education_program_settings`: 0 record (program sekolah tidak terdefinisi).
   - `mutabaah_input_rules`: 0 record (belum ada pembagian tugas rumah vs sekolah).
   - `mutabaah_supervisor_assignments`: Belum mencakup unit SD/MI aktif (*Mahad Abu Ja'far*).
2. **Injeksi Data Resmi Staging**:
   - Dibuat seeder resmi `MutabaahCompleteDemoSeeder` yang mencakup 7 tabel relasional lengkap untuk santri aktif (`Laila Fitriani`, `Ahmad Zaky`, `Siswa Test`).
   - Dibuat seeder pembersih `MutabaahPurgeDemoSeeder` (`php artisan db:seed --class=Database\Seeders\MutabaahPurgeDemoSeeder`) yang memungkinkan *one-click wipe* seluruh data dummy transaksional harian tanpa merusak data master akun, siswa riil, ataupun struktur produksi sekolah.

### B. Audit Proteksi Input Orang Tua (Status Finalized vs Draft)
1. **Aturan Bisnis Backend (`ParentWorshipInputController`)**:
   - Hak edit orang tua dikontrol oleh:
     `$canEdit = ! $header || $header->status->value === 'draft';`
   - Jika status header hari bersangkutan sudah berstatus **`finalized`** (disahkan musyrif):
     - Backend mengembalikan `can_edit = false` dan `can_parent_input = false`.
     - Request `POST /worship-input` ditolak dengan `HTTP 409 (Conflict)`: *"Data sudah difinalisasi dan tidak dapat diubah orang tua."*
     - Pada fase ini, peran orang tua beralih murni menjadi peninjau (*reviewer*) untuk membubuhkan paraf tanda tangan (`/signature`).
   - Orang tua **hanya dapat menginput/mengubah amalan rumah** jika header pada tanggal tersebut belum ada (masih kosong) atau berstatus **`draft`**.
2. **Respon di Android (`MutabaahScreen.tsx`)**:
   - Modal input mendeteksi `can_edit === false`, menampilkan banner kunci *"Data pada tanggal ini telah difinalisasi oleh pembimbing"*, dan menyembunyikan tombol simpan.
3. **Respon di Web Dashboard (`MutabaahWorkspace.jsx` & `ParentPortalPage.jsx`)**:
   - Terdapat kondisi `const isReadOnly = isParent || readOnly` yang memaksa status read-only bagi orang tua.
   - Portal orang tua web belum dilengkapi dialog/modal popup input ibadah rumah seperti pada Android.

### C. Matriks Perbedaan Siswa Fullday vs Boarding (Pesantren)
1. **Siswa Fullday**:
   - **Tanggung Jawab**: Terbagi dua lokasi (Sekolah diisi Guru/Wali Kelas, Rumah diisi Orang Tua).
   - **Akses Orang Tua**: `input_mode: parent_input` (Memiliki form input ibadah harian di rumah untuk Subuh, Maghrib, Isya, Zikir Petang, Tilawah).
2. **Siswa Boarding / Pesantren**:
   - **Tanggung Jawab**: Terpusat 24 jam di lingkungan pondok oleh Musyrif/Musyrifah asrama.
   - **Akses Orang Tua**: `input_mode: report_only` (Menerima laporan pemantauan harian, catatan kamar/halaqah, dan tombol paraf orang tua).
   - **Pengecualian**: Akses input orang tua boarding otomatis aktif jika santri tercatat berada di rumah (masa libur pondok, izin kepulangan resmi, atau izin sakit keluarga).



# Walkthrough: Perbaikan `scripts/dev.sh` (Metro Bundler & Auto Launch ke HP Fisik)

## 1. Masalah yang Ditemukan pada `scripts/dev.sh` Sebelumnya
1. **Markdown Fence Syntax Error:**
   - Pada baris pertama terdapat teks ` ```bash ` dan baris terakhir ` ``` `, yang menyebabkan eksekusi script langsung gagal dengan error `dev.sh: line 1: ```bash: command not found`.
2. **Aplikasi Tidak Pernah Dibuka ke Layar HP:**
   - Script sebelumnya hanya menjalankan `exec expo start`, yang hanya menyalakan Metro bundler di terminal tanpa memicu pembukaan aplikasi ke layar HP Android (`am start` tidak dipanggil).
3. **Penyaringan Device ADB yang Terganggu oleh Artefak mDNS:**
   - Saat terhubung melalui Wireless ADB, output `adb devices` menyertakan entri mDNS seperti `adb-10DDC108U40008A-M3Aq4S (2)._adb-tls-connect._tcp` yang memiliki spasi dan kurung, sehingga parsing `awk` dapat memilih identifier yang salah.
4. **Deteksi IP Device USB:**
   - Jika HP dicolok via kabel USB (serial tanpa titik dua), script sebelumnya mengisi `DEVICE_IP` dengan nomor serial HP, bukan alamat IP.

---

## 2. Perbaikan yang Diterapkan di `scripts/dev.sh`
1. **Pembersihan Sintaks & Formatting:**
   - Menghapus pembungkus markdown block code sehingga script valid dan dapat dieksekusi langsung.
2. **Penyaringan Perangkat HP Fisik yang Cerdas:**
   - Menyaring artefak `_adb-tls-connect`.
   - Memprioritaskan koneksi Wireless ADB (`IP:PORT`), lalu HP fisik via USB, dan terakhir perangkat yang tersedia.
   - Untuk perangkat USB, alamat IP HP diambil otomatis dari interface Wi-Fi `wlan0` HP (`adb shell ip -4 addr show wlan0`).
3. **Konfigurasi Port Forwarding / Reverse Lengkap:**
   - Mengaktifkan `adb reverse tcp:8081 tcp:8081` untuk Metro bundler.
   - Mengaktifkan `adb reverse tcp:8000 tcp:8000` untuk API backend Laravel lokal.
4. **Otomatisasi Pembukaan Aplikasi ke Layar HP Fisik (Background Worker):**
   - Menjalankan background worker sebelum Metro aktif:
     1. Menunggu hingga Metro bundler siap merespons (`http://localhost:8081/status`).
     2. Menyalakan layar HP (`input keyevent KEYCODE_WAKEUP`) dan membuka kunci (`wm dismiss-keyguard`).
     3. Membuka Activity utama aplikasi SIMSIT (`am start -n id.sch.dareliman.simsit/.MainActivity -a android.intent.action.MAIN -c android.intent.category.LAUNCHER`).
     4. Mengirim sinyal broadcast reload (`ACTION_RELOAD`) agar aplikasi langsung me-refresh bundle dari Metro.
5. **Konfigurasi Expo:**
   - Menambahkan opsi `--scheme simsit` untuk menghindari peringatan URI scheme dev-client.

---

## 3. Hasil Pengujian & Verifikasi
- **Sintaks Shell:** `bash -n scripts/dev.sh` berhasil (Exit code 0).
- **Eksekusi Nyata:**
  - Script mendeteksi perangkat fisik Vivo V2322 (`192.168.1.7:41919`).
  - Metro bundler berhasil aktif di port 8081 dengan Node v22.23.2.
  - ADB reverse port 8081 dan 8000 berhasil dipasang.
  - Aplikasi `id.sch.dareliman.simsit` berhasil diluncurkan ke layar HP dan menjadi `mCurrentFocus` / `mFocusedApp`.
  - Tangkapan layar dari HP fisik berhasil diambil dan memverifikasi aplikasi tampil sempurna di HP.

---

## 4. Perbaikan Masalah Aplikasi Stuck di Splash Screen (Android 12–15 & .APK Release)

### A. Akar Masalah
1. **Deadlock Native `preventAutoHideAsync()`**:
   - Pemanggilan `ExpoSplashScreen.preventAutoHideAsync()` di module level `App.tsx` menyebabkan `SplashScreenManager.preventAutoHideCalled = true`.
   - Android 12–15 (`androidx.core.splashscreen`) membatalkan frame pertama (`OnPreDrawListener` return `false`).
   - Karena frame dibatalkan dan view tree idle, Choreographer Android tidak pernah melakukan pass gambar ulang saat `hide()` dipanggil di memori, menyebabkan native splash screen (`#0B8A4D`) terkunci permanen (ANR / timeout 60 detik di HP fisik).
2. **Double Splash Screen Conflict**:
   - Aplikasi sudah memiliki custom React Native screen (`src/screens/SplashScreen.tsx`) dengan LinearGradient dan animasi progress bar 0-100%.
   - Menahan splash OS dengan `preventAutoHideAsync()` justru menutupi custom splash screen tersebut.
3. **Bottleneck Multi-Condition Gate**:
   - Custom splash screen sebelumnya tertahan menunggu 4 kondisi dan timeout 4000ms.

### B. Solusi yang Diterapkan
1. **Pembersihan `preventAutoHideAsync()`**:
   - Menghapus `preventAutoHideAsync()` dari global scope di `App.tsx`.
   - Native OS splash screen kini menutup secara otomatis dan alami saat React Native me-mount frame pertama (`ReactMarkerConstants.CONTENT_APPEARED`).
2. **Optimasi Waktu Transisi & Safety Timer**:
   - Durasi animasi progress bar dipangkas dari 2400ms menjadi **1600ms**.
   - Maximum safety timeout di `App.tsx` dipangkas dari 4000ms menjadi **2200ms**.
   - Font fallback timeout dipangkas dari 2500ms menjadi **1200ms**.
   - Profile verification spinner di `BottomTabs.tsx` dipangkas dari 3000ms menjadi **1200ms**.
3. **Fitur Tap to Skip (Fast Forward)**:
   - Menambahkan `Pressable` wrapper pada `SplashScreen.tsx` sehingga pengguna dapat mengetuk layar kapan saja untuk langsung masuk tanpa menunggu sisa animasi.
4. **Validasi & Pengujian**:
   - Seluruh unit test suite lulus 100%:
     - `test-config-guards.mjs`: PASS (Exit code 0).
     - `test-access-control.mjs`: PASS (Exit code 0).

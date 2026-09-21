# Panduan Pengembangan SIMSIT Mobile (Android)

Panduan lengkap instalasi dan konfigurasi aplikasi mobile SIMSIT berbasis **React Native (Expo Dev Client)**, mulai dari cloning/pulling project dari repository, konfigurasi environment, hingga menjalankan aplikasi di **Emulator Android** maupun **HP Fisik Android**.

---

## Daftar Isi
1. [Prasyarat Sistem (Prerequisites)](#1-prasyarat-sistem-prerequisites)
2. [Pull / Clone Project ke Komputer Lokal](#2-pull--clone-project-ke-komputer-lokal)
3. [Konfigurasi Environment Variable (OS)](#3-konfigurasi-environment-variable-os)
4. [Persiapan Backend API (Laravel)](#4-persiapan-backend-api-laravel)
5. [Instalasi Dependensi Mobile App](#5-instalasi-dependensi-mobile-app)
6. [Konfigurasi Environment File (.env.local)](#6-konfigurasi-environment-file-envlocal)
7. [Menjalankan di Emulator Android](#7-menjalankan-di-emulator-android)
8. [Menjalankan di HP Fisik Android](#8-menjalankan-di-hp-fisik-android)
9. [Perintah yang Tersedia (Scripts)](#9-perintah-yang-tersedia-scripts)
10. [Troubleshooting & Solusi Masalah Umum](#10-troubleshooting--solusi-masalah-umum)

---

## 1. Prasyarat Sistem (Prerequisites)

Sebelum memulai, pastikan perangkat komputer Anda telah terinstal:

- **Node.js**: Sangat disarankan **v22.x** (versi LTS terbaru / sesuai script otomasi `v22.23.2`).
  - Cek: `node -v`
  - Disarankan menggunakan [NVM (Node Version Manager)](https://github.com/nvm-sh/nvm):
    ```bash
    nvm install 22
    nvm use 22
    ```
- **Java Development Kit (JDK)**: JDK 17 (misal: Eclipse Temurin 17 atau Azul Zulu 17).
  - Cek: `java -version`
- **Android Studio & Android SDK**:
  - Android SDK Platform (Android 14/15 - API level 34/35)
  - Android SDK Build-Tools
  - Android SDK Command-line Tools
  - Android SDK Platform-Tools (`adb`)
  - Android Virtual Device (AVD) jika ingin menggunakan emulator.
- **Git**: Versi terbaru.

---

## 2. Pull / Clone Project ke Komputer Lokal

Buka terminal dan lakukan pull atau clone dari repository:

```bash
# Clone repository jika baru pertama kali
git clone <URL_REPOSITORY_ANDA>
cd Sistem-Manajemen-Sekolah-terpadu-main

# ATAU jika sudah memiliki repo lokal dan ingin menarik update terbaru:
git checkout main
git pull origin main
```

Pindah ke direktori aplikasi mobile:

```bash
cd mobile-app
```

---

## 3. Konfigurasi Environment Variable (OS)

Pastikan path Android SDK dan `adb` sudah terdaftar di environment terminal Anda (`~/.zshrc` atau `~/.bashrc` di Mac/Linux):

```bash
# Tambahkan ke ~/.zshrc atau ~/.bash_profile
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
```

Setelah itu muat ulang konfigurasi:

```bash
source ~/.zshrc
```

Verifikasi apakah `adb` sudah terdeteksi:

```bash
adb version
```

---

## 4. Persiapan Backend API (Laravel)

Aplikasi mobile membutuhkan koneksi ke API Laravel. Jalankan server Laravel terlebih dahulu di tab terminal terpisah:

```bash
cd ../backend

# Pastikan dependensi dan migrasi database sudah siap
composer install
php artisan migrate

# Jalankan server dengan bind ke 0.0.0.0 agar dapat diakses oleh emulator/HP fisik
php artisan serve --host=0.0.0.0 --port=8000
```

> **Catatan Penting**: Parameter `--host=0.0.0.0` wajib disertakan agar server tidak hanya mendengarkan `localhost`, melainkan juga IP LAN komputer Anda.

---

## 5. Instalasi Dependensi Mobile App

Masuk kembali ke direktori `mobile-app` dan pasang paket yang dibutuhkan:

```bash
cd mobile-app
npm install
```

---

## 6. Konfigurasi Environment File (`.env.local`)

Salin template environment:

```bash
cp .env.example .env.local
```

Sesuaikan nilai `EXPO_PUBLIC_API_URL` sesuai target pengujian Anda:

### Opsi A: HP Fisik via USB (Metode Direkomendasikan)
Gunakan alamat localhost karena kita menggunakan **ADB Reverse**:
```env
EXPO_PUBLIC_API_URL=http://127.0.0.1:8000/api
```

### Opsi B: Emulator Android Standar
Emulator Android bawaan memetakan host komputer ke IP khusus `10.0.2.2`:
```env
EXPO_PUBLIC_API_URL=http://10.0.2.2:8000/api
```

### Opsi C: HP Fisik via WiFi / LAN (Tanpa Kabel)
Gunakan IP lokal Mac/Komputer Anda (misal `192.168.1.10`):
```env
EXPO_PUBLIC_API_URL=http://192.168.1.10:8000/api
```
*(Cek IP komputer Anda dengan perintah `ipconfig getifaddr en0` di Mac).*

> **Info Otomatisasi**: Jika Anda menjalankan `npm run dev`, script otomasi `scripts/dev.sh` akan mendeteksi IP dan memperbarui file `.env.local` secara otomatis!

---

## 7. Menjalankan di Emulator Android

### Langkah 1: Jalankan Emulator
Buka **Android Studio** > **Device Manager** > Klik tombol **Play (Run)** pada salah satu Virtual Device (AVD).

Atau jalankan langsung dari terminal:
```bash
# Cek daftar nama emulator yang ada
emulator -list-avds

# Jalankan salah satu emulator
emulator -avd <NAMA_AVD>
```

### Langkah 2: Pastikan Emulator Terdeteksi
Jalankan di terminal:
```bash
adb devices
```
Output harus menampilkan emulator dengan status **device**:
```text
List of devices attached
emulator-5554    device
```

### Langkah 3: Build & Pasang Aplikasi (Khusus Pertama Kali)
Jika ini pertama kali atau ada perubahan dependensi native:
```bash
npx expo run:android
```
Perintah ini akan melakukan kompilasi native gradle, memasang development APK ke emulator, dan langsung membukanya.

### Langkah 4: Menjalankan Server Development Selanjutnya
Setelah aplikasi terpasang di emulator, Anda cukup menjalankan:
```bash
npm run dev
# atau
npm start
```
*(Tekan tombol `a` di terminal jika server Metro meminta target platform).*

---

## 8. Menjalankan di HP Fisik Android

### Langkah 1: Aktifkan Opsi Pengembang & USB Debugging di HP
1. Masuk ke **Pengaturan (Settings)** di HP Android Anda.
2. Buka menu **Tentang Ponsel (About Phone)**.
3. Cari **Nomor Bentukan (Build Number)** dan **ketuk sebanyak 7 kali** hingga muncul pesan: *"Anda sekarang adalah seorang pengembang!"*.
4. Kembali ke menu utama Pengaturan > cari **Opsi Pengembang (Developer Options)**.
5. Aktifkan:
   - **Debugging USB (USB Debugging)**.
   - *(Opsional untuk Xiaomi/MIUI)*: Aktifkan juga *"Install via USB"* dan *"USB Debugging (Security Settings)"*.

### Langkah 2: Hubungkan HP ke Komputer Menggunakan Kabel Data USB
1. Tancapkan kabel USB dari HP ke port komputer.
2. Mode koneksi USB di HP pilih **File Transfer (MTP)** atau **No data transfer**.
3. Di layar HP akan muncul pop-up dialog:
   > **Izinkan debugging USB? (Allow USB debugging?)**
   
   Centang pilihan **"Selalu izinkan dari komputer ini (Always allow from this computer)"**, lalu tekan **Izinkan (OK)**.

### Langkah 3: Verifikasi Koneksi Device
Jalankan di terminal komputer:
```bash
adb devices
```
Pastikan statusnya **device**, contoh:
```text
List of devices attached
RF8N10XXXXX    device
```
*(Jika muncul `unauthorized`, periksa layar HP Anda dan klik 'Izinkan').*

### Langkah 4: Jalankan Script Otomasi Dev
Project ini dilengkapi script otomatisasi (`scripts/dev.sh`):

```bash
npm run dev
```

Script ini akan secara otomatis:
1. Memverifikasi versi Node.js dan path Android SDK / ADB.
2. Mendeteksi HP yang terhubung.
3. Melakukan sinkronisasi otomatis IP Host dan URL API ke `.env.local`.
4. Mengaktifkan **ADB Reverse** (port Metro `8081` dan port backend `8000` di-forward ke HP).
5. Membersihkan port yang bentrok.
6. Membuka aplikasi secara otomatis di layar HP dan memulai Metro Bundler.

### Alternatif: Menjalankan via Wireless Debugging (Tanpa Kabel)

> **Syarat**: HP menggunakan **Android 11 atau lebih baru**, dan HP serta Komputer terhubung ke **jaringan WiFi yang sama**.
>
> Di HP, masuk ke **Pengaturan > Opsi Pengembang > Debugging Nirkabel (Wireless Debugging)**, lalu aktifkan toggle-nya. Ketuk pada teks *Debugging Nirkabel* untuk masuk ke submenu konfigurasinya.

Pilih salah satu metode pairing berikut:

#### Cara 1: Menggunakan Kode QR (Paling Cepat & Mudah via Android Studio)
1. Buka **Android Studio** di komputer Anda.
2. Di toolbar bagian atas pada dropdown pemilihan device, klik **Pair Devices Using Wi-Fi**  
   *(Atau buka tab **Device Manager** di panel sebelah kanan > pilih tab **Physical** > klik **Pair using Wi-Fi**)*.
3. Jendela pop-up dengan **QR Code** akan muncul di layar komputer.
4. Di HP Anda, pada menu *Debugging Nirkabel*, ketuk **Hubungkan perangkat dengan kode QR (Pair device with QR code)**.
5. Kamera HP akan aktif, arahkan kamera ke layar komputer untuk memindai QR Code tersebut.
6. Begitu berhasil dipindai, status device akan langsung terhubung secara otomatis di Android Studio dan ADB.

---

#### Cara 2: Menggunakan Kode Pairing (Via Terminal / ADB CLI)
1. Di HP Anda, pada menu *Debugging Nirkabel*, ketuk **Hubungkan perangkat dengan kode pairing (Pair device with pairing code)**.
2. Layar HP akan menampilkan:
   - **Kode penyambungan Wi-Fi** (6 digit angka, contoh: `123456`).
   - **Alamat IP & Port Pairing** (contoh: `192.168.1.50:37849`).
   > *Perhatian: Port pairing ini hanya dipakai sekali dan berbeda dengan port debugging utama!*
3. Di Terminal komputer Anda, jalankan:
   ```bash
   adb pair 192.168.1.50:37849
   ```
   *(Ganti IP dan Port sesuai yang tertera di pop-up layar HP Anda)*.
4. Terminal akan meminta: `Enter pairing code:`. Masukkan 6 digit kode dari HP Anda, lalu tekan **Enter**.
   - Terminal akan menampilkan: `Successfully paired to 192.168.1.50:37849...`
5. Tutup pop-up pairing di layar HP. Perhatikan di menu utama *Debugging Nirkabel*, lihat bagian **Alamat IP & Port** (ini adalah Port Debugging utama, contoh: `192.168.1.50:41235`).
6. Hubungkan ADB ke port debugging tersebut:
   ```bash
   adb connect 192.168.1.50:41235
   ```
   - Terminal akan menampilkan: `connected to 192.168.1.50:41235`

---

#### Langkah Akhir:
Verifikasi koneksi nirkabel di terminal:
```bash
adb devices
```
Jika sudah muncul device aktif, jalankan script pengembangan:
```bash
npm run dev
```

---

## 9. Perintah yang Tersedia (Scripts)

| Perintah | Fungsi |
| :--- | :--- |
| `npm run dev` | Menjalankan script otomasi `dev.sh` (ADB reverse, auto IP sync, auto launch ke device). |
| `npm start` | Memulai Metro Bundler standar Expo. |
| `npm run android` | Mengompilasi dan menjalankan aplikasi native Android (`expo run:android`). |
| `npm run dev:android` | Menjalankan Expo development client di port 8081. |
| `npm run dev:android:clear` | Menjalankan development client dengan membersihkan cache Metro bundler. |

---

## 10. Troubleshooting & Solusi Masalah Umum

### 1. `ERROR: Android device tidak ditemukan`
- **Penyebab**: `adb` tidak menemukan emulator atau HP yang terhubung dengan status `device`.
- **Solusi**:
  1. Pastikan kabel USB terpasang erat dan gunakan kabel data (bukan sekadar kabel charger).
  2. Pastikan **USB Debugging** di HP sudah aktif.
  3. Buka layar HP, pastikan tidak ada pop-up otorisasi yang belum disetujui.
  4. Jalankan `adb kill-server && adb devices` di terminal untuk merestart daemon ADB.

### 2. Status Device `unauthorized`
- **Solusi**: Buka kunci layar HP Anda, cari pesan dialog *"Allow USB debugging?"* lalu klik **Allow / Izinkan**.

### 3. Network Request Failed / Gagal Login ke Laravel
- **Penyebab**: Aplikasi mobile tidak dapat mengakses backend Laravel.
- **Solusi**:
  1. Pastikan backend berjalan dengan: `php artisan serve --host=0.0.0.0 --port=8000`.
  2. Jika menggunakan koneksi kabel USB dengan `npm run dev`, jalankan manual:
     ```bash
     adb reverse tcp:8000 tcp:8000
     ```
     dan pastikan `.env.local` berisi `EXPO_PUBLIC_API_URL=http://127.0.0.1:8000/api`.
  3. Jika tidak menggunakan reverse (via WiFi), pastikan HP dan laptop di satu WiFi yang sama dan tidak terisolasi oleh firewall (AP Isolation).

### 4. Port 8081 Sudah Dipakai (Port Metro Conflict)
- **Solusi**:
  ```bash
  lsof -ti:8081 | xargs kill -9
  ```
  Atau cukup jalankan `npm run dev` karena script sudah menangani pembersihan port secara otomatis.

### 5. Tampilan Stuck atau Cache Lama Masih Terbaca
- **Solusi**: Jalankan Metro dengan flag pembersihan cache:
  ```bash
  npm run dev:android:clear
  # atau
  npx expo start -c
  ```

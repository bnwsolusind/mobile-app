# Standar Desain Layar & Header Navigasi Mobile App (SIT)

Setiap kali membuat, memodifikasi, atau menata ulang halaman (screen) pada aplikasi mobile ini:

1. **Header Navigasi (`BottomTabs.tsx` / `moduleOptions`)**:
   - Memiliki tombol kembali di kiri dan ikon lonceng notifikasi di kanan (`headerRight`).
   - Latar belakang gradien hijau memiliki lengkungan dengan sudut melengkung ke atas pada kedua sudut bawah (`borderBottomLeftRadius: 28, borderBottomRightRadius: 28`) dengan latar belakang putih.

2. **Struktur Layar Screen**:
   - `rootContainer`: `{ flex: 1, backgroundColor: '#FFFFFF' }`.
   - `sheetContainer`: `{ flex: 1, overflow: 'hidden' }`.
   - Di dalam `sheetContainer`, gunakan latar belakang `LinearGradient` `['#FFFFFF', '#F2FAF6', '#DDF5EB']`.
   - `content` pada ScrollView menggunakan `padding: 16, paddingTop: Platform.OS === 'android' ? 20 : 16`.
   - `contentContainerStyle` pada ScrollView menambahkan padding bawah dinamis: `{ paddingBottom: bottomInset + 30 }`.

3. **Komponen Data Siswa & Unit Pendidikan (Hero Card)**:
   - Tempatkan di urutan paling atas di dalam `ScrollView`.
   - Gunakan pembungkus `<View style={[styles.containerBlock, styles.studentContainerBlock]}>` dengan `studentContainerBlock: { marginBottom: 8 }` (atau `8` s/d `12`) agar jarak vertikal ke kontainer di bawahnya rapat, proporsional, dan rapi.
   - Gunakan format Hero Card horizontal carousel (`SCREEN_WIDTH - 32`) dengan indikator pagination dots, avatar lingkaran berbingkai, badge status terpilih, serta chip unit sekolah dan NIS.
   - **Standar Warna Hero Card Terpilih / Aktif**:
     - Card Aktif (`childCardHeroSizeActive`): Background solid hijau emerald `#18A165`, border `#18A165` (DILARANG menggunakan background pucat `#F0FDF4`).
     - Teks Card Aktif (`childTextActive`): Warna putih bersih `#FFFFFF` untuk nama, kelas, unit pendidikan, NIS, badge, dan chip.
     - Avatar Border Aktif (`avatarBorderWrapHeroActive`): Border putih `#FFFFFF` dengan background `rgba(255, 255, 255, 0.25)`.
     - Badge Status Terpilih (`childStatusBadgeHeroActive`): Background `rgba(255, 255, 255, 0.25)`, border `rgba(255, 255, 255, 0.4)`, icon centang & teks `#FFFFFF`.
     - Sub-Info Aktif (`childSubInfoHeroActive`): Teks putih lembut `rgba(255, 255, 255, 0.85)`.
     - Chip Bawah Aktif (`childInfoPillActive` & `childCardBottomBarActive`): Background chip `rgba(255, 255, 255, 0.2)`, separator `borderTopColor: 'rgba(255, 255, 255, 0.2)'`, icon & teks `#FFFFFF`.

4. **Aturan Wajib Label pada Setiap Kontainer (`sectionHeaderRow`)**:
   - Setiap bagian/kontainer (baik itu card ringkasan, KPI grid, workspace filter, maupun daftar list) **WAJIB** dibungkus dalam `<View style={styles.containerBlock}>` dan diawali dengan baris label judul:
     ```tsx
     <View style={styles.containerBlock}>
       <View style={styles.sectionHeaderRow}>
         <MaterialCommunityIcons name="[nama-icon]" size={18} color="#18A165" />
         <Text style={styles.sectionTitle}>[Judul Kontainer]</Text>
       </View>
       {/* Konten card / grid / list */}
     </View>
     ```
   - Tidak diperkenankan meletakkan card atau grid melayang tanpa label kontainer penjelas.

5. **Aturan Wajib Modal Pop-Up & Bottom-Sheet Bebas Tabrakan Navigasi Handphone**:
   - Untuk mencegah tombol aksi bawah ("Tutup", "Simpan", dsb.) tertutup oleh bilah navigasi fisik/sistem handphone (Android 3-tombol kembali/home/recents atau gesture pill setinggi 36dp–48dp), gunakan perhitungan inset dinamis:
     ```tsx
     const insets = useSafeAreaInsets();
     const modalBottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 48 : 20) + 16;
     ```
   - Seluruh modal pop-up bottom-sheet wajib:
     1. Menyertakan prop `statusBarTranslucent` pada `<Modal>`.
     2. Memasang `<Pressable style={StyleSheet.absoluteFill} onPress={() => setVisible(false)} />` pada backdrop agar pengguna dapat menutup modal dengan menekan area luar.
     3. Memberikan style dinamis `style={[styles.modalCard, { paddingBottom: modalBottomInset }]}`.
     4. Menyediakan `modalDragHandle` visual di bagian atas kartu modal.
     5. Membatasi ketinggian ScrollView di dalam modal (`maxHeight: SCREEN_HEIGHT * 0.62`) agar konten panjang tidak mendorong tombol aksi keluar dari layar.
     6. Tombol aksi penutup/submit berada di posisi yang nyaman dan bebas dijangkau jari tanpa terhalang sistem navigasi handphone.

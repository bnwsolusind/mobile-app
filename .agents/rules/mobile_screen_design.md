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

3. **Komponen Data Siswa & Unit Pendidikan**:
   - Tempatkan di urutan paling atas di dalam `ScrollView`.
   - Gunakan pembungkus `<View style={[styles.containerBlock, styles.studentContainerBlock]}>` dengan `studentContainerBlock: { marginBottom: 8 }` (atau `8` s/d `12`) agar jarak vertikal ke kontainer di bawahnya rapat, proporsional, dan rapi.
   - Gunakan format Hero Card horizontal carousel (`SCREEN_WIDTH - 32`) dengan indikator pagination dots, avatar lingkaran berbingkai, badge status terpilih, serta chip unit sekolah dan NIS.

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

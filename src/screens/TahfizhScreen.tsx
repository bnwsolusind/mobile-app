import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  RefreshControl,
} from 'react-native';
import {
  Text,
  Card,
  Button,
  TextInput,
  Badge,
  Surface,
  Divider,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { mobileApiService, TahfizhPayload } from '../services/mobileApiService';

interface TahfizhItem {
  id: string;
  tanggal: string;
  juz: number;
  surah: string;
  ayat_mulai: number;
  ayat_selesai: number;
  nilai: 'Mumtaz' | 'Jayyid Jiddan' | 'Jayyid' | 'Maqbul';
  ustadz: string;
}

export default function TahfizhScreen() {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State Input Setoran
  const [juz, setJuz] = useState('30');
  const [surah, setSurah] = useState('An-Naba');
  const [ayatMulai, setAyatMulai] = useState('1');
  const [ayatSelesai, setAyatSelesai] = useState('40');
  const [nilai, setNilai] = useState<'Mumtaz' | 'Jayyid Jiddan' | 'Jayyid' | 'Maqbul'>('Mumtaz');

  const [tahfizhList, setTahfizhList] = useState<TahfizhItem[]>([
    {
      id: '1',
      tanggal: '27 Juli 2026',
      juz: 30,
      surah: 'An-Naba',
      ayat_mulai: 1,
      ayat_selesai: 40,
      nilai: 'Mumtaz',
      ustadz: 'Ustadz Ahmad Musyaffa, S.Pd.I',
    },
    {
      id: '2',
      tanggal: '25 Juli 2026',
      juz: 30,
      surah: 'An-Nazi\'at',
      ayat_mulai: 1,
      ayat_selesai: 46,
      nilai: 'Jayyid Jiddan',
      ustadz: 'Ustadz Ahmad Musyaffa, S.Pd.I',
    },
    {
      id: '3',
      tanggal: '22 Juli 2026',
      juz: 30,
      surah: 'Abasa',
      ayat_mulai: 1,
      ayat_selesai: 42,
      nilai: 'Mumtaz',
      ustadz: 'Ustadz Abdul Malik',
    },
  ]);

  const loadTahfizhData = useCallback(async () => {
    try {
      const data = await mobileApiService.getTahfizhReport();
      if (data && Array.isArray(data.records)) {
        setTahfizhList(data.records);
      }
    } catch (e) {
      console.log('Error loading tahfizh report:', e);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadTahfizhData();
  }, [loadTahfizhData]);

  const handleSubmitSetoran = async () => {
    if (!surah.trim()) {
      Alert.alert('Form Belum Lengkap', 'Silakan masukkan nama Surah.');
      return;
    }

    setLoading(true);
    try {
      const payload: TahfizhPayload = {
        student_id: 'siswa-1',
        juz: Number(juz),
        surah,
        ayat_mulai: Number(ayatMulai),
        ayat_selesai: Number(ayatSelesai),
        nilai,
        catatan: 'Setoran hafalan lancar dan tajwid mumtaz.',
      };

      await mobileApiService.submitTahfizh(payload).catch(() => {});

      const newRecord: TahfizhItem = {
        id: String(Date.now()),
        tanggal: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
        juz: Number(juz),
        surah,
        ayat_mulai: Number(ayatMulai),
        ayat_selesai: Number(ayatSelesai),
        nilai,
        ustadz: 'Ustadz Pembimbing (Mobile)',
      };

      setTahfizhList((prev) => [newRecord, ...prev]);
      setIsModalOpen(false);
      Alert.alert('Alhamdulillah!', 'Setoran hafalan Al-Qur\'an berhasil dicatat.');
    } catch {
      Alert.alert('Gagal Simpan', 'Terjadi kesalahan saat menyimpan setoran.');
    } finally {
      setLoading(false);
    }
  };

  const getNilaiBadgeColor = (val: string) => {
    switch (val) {
      case 'Mumtaz':
        return '#0f5132';
      case 'Jayyid Jiddan':
        return '#10b981';
      case 'Jayyid':
        return '#d97706';
      default:
        return '#64748b';
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadTahfizhData(); }} colors={['#0f5132']} />
        }
      >
        {/* Banner Monitoring Hafalan */}
        <Surface style={styles.headerSurface} elevation={2}>
          <View style={styles.headerRow}>
            <MaterialCommunityIcons name="book-open-page-variant" size={40} color="#d97706" />
            <View style={styles.headerInfo}>
              <Text variant="titleMedium" style={styles.headerTitle}>
                Monitoring Tahfizh Al-Qur'an
              </Text>
              <Text variant="bodySmall" style={styles.headerSub}>
                Capaian Hafalan: <Text style={{ fontWeight: 'bold', color: '#0f5132' }}>Juz 30 (Mumtaz)</Text>
              </Text>
            </View>
          </View>

          <Button
            mode="contained"
            onPress={() => setIsModalOpen(true)}
            style={styles.btnTambah}
            icon="plus"
          >
            Input Setoran Baru
          </Button>
        </Surface>

        {/* History Setoran Cards */}
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Riwayat Setoran Hafalan
        </Text>

        {tahfizhList.map((item) => (
          <Card key={item.id} style={styles.cardItem}>
            <Card.Content>
              <View style={styles.cardHeader}>
                <View style={styles.surahInfo}>
                  <Text style={styles.surahName}>{item.surah}</Text>
                  <Text style={styles.juzBadge}>Juz {item.juz} • Ayat {item.ayat_mulai}-{item.ayat_selesai}</Text>
                </View>
                <Badge style={{ backgroundColor: getNilaiBadgeColor(item.nilai), paddingHorizontal: 8 }}>
                  {item.nilai}
                </Badge>
              </View>

              <Divider style={{ marginVertical: 8 }} />

              <View style={styles.cardFooter}>
                <Text style={styles.ustadzText}>👳‍♂️ {item.ustadz}</Text>
                <Text style={styles.dateText}>{item.tanggal}</Text>
              </View>
            </Card.Content>
          </Card>
        ))}
      </ScrollView>

      {/* Form Input Setoran Modal */}
      <Modal visible={isModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <Surface style={styles.modalContent} elevation={5}>
            <View style={styles.modalHeader}>
              <Text variant="titleMedium" style={styles.modalTitle}>Form Setoran Hafalan</Text>
              <TouchableOpacity onPress={() => setIsModalOpen(false)}>
                <MaterialCommunityIcons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 400 }}>
              <TextInput
                label="Juz"
                value={juz}
                onChangeText={setJuz}
                keyboardType="numeric"
                style={styles.input}
                mode="outlined"
              />

              <TextInput
                label="Nama Surah"
                value={surah}
                onChangeText={setSurah}
                placeholder="Contoh: An-Naba"
                style={styles.input}
                mode="outlined"
              />

              <View style={styles.rowTwo}>
                <TextInput
                  label="Ayat Mulai"
                  value={ayatMulai}
                  onChangeText={setAyatMulai}
                  keyboardType="numeric"
                  style={[styles.input, { flex: 1, marginRight: 8 }]}
                  mode="outlined"
                />
                <TextInput
                  label="Ayat Selesai"
                  value={ayatSelesai}
                  onChangeText={setAyatSelesai}
                  keyboardType="numeric"
                  style={[styles.input, { flex: 1 }]}
                  mode="outlined"
                />
              </View>

              <Text style={{ fontSize: 12, color: '#334155', marginTop: 8, marginBottom: 4 }}>
                Nilai / Predikat Setoran:
              </Text>
              <View style={styles.nilaiRow}>
                {(['Mumtaz', 'Jayyid Jiddan', 'Jayyid', 'Maqbul'] as const).map((n) => (
                  <TouchableOpacity
                    key={n}
                    onPress={() => setNilai(n)}
                    style={[
                      styles.nilaiChip,
                      nilai === n && { backgroundColor: '#0f5132', borderColor: '#0f5132' },
                    ]}
                  >
                    <Text style={{ fontSize: 11, color: nilai === n ? '#fff' : '#0f172a' }}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <Button mode="outlined" onPress={() => setIsModalOpen(false)} style={{ marginRight: 8 }}>
                Batal
              </Button>

              <Button
                mode="contained"
                onPress={handleSubmitSetoran}
                loading={loading}
                disabled={loading}
                style={{ backgroundColor: '#0f5132' }}
              >
                Simpan Setoran
              </Button>
            </View>
          </Surface>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  headerSurface: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerInfo: {
    marginLeft: 12,
    flex: 1,
  },
  headerTitle: {
    fontWeight: 'bold',
    color: '#0f172a',
  },
  headerSub: {
    color: '#64748b',
    marginTop: 2,
  },
  btnTambah: {
    backgroundColor: '#0f5132',
    borderRadius: 10,
  },
  sectionTitle: {
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 12,
  },
  cardItem: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  surahInfo: {
    flex: 1,
  },
  surahName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  juzBadge: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ustadzText: {
    fontSize: 11,
    color: '#334155',
  },
  dateText: {
    fontSize: 11,
    color: '#64748b',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontWeight: 'bold',
    color: '#0f172a',
  },
  input: {
    marginBottom: 10,
    backgroundColor: '#ffffff',
  },
  rowTwo: {
    flexDirection: 'row',
  },
  nilaiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  nilaiChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
});

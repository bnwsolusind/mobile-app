import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { getApiErrorMessage } from '../services/api';
import { mobileApiService } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { offlineCache } from '../utils/offlineCache';

type RecordItem = {
  id: string;
  judul?: string;
  title?: string;
  deadline?: string;
  start_time?: string;
  end_time?: string;
  subject?: { name?: string };
  pengumpulan_tugas?: Array<{ status?: string }>;
};

const unwrap = <T,>(response: any): T => response?.data?.data ?? response?.data ?? response;

export default function StudentPortalScreen() {
  const user = useAuthStore((state) => state.user);
  const [profile, setProfile] = useState<any>();
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [tab, setTab] = useState<'schedules' | 'materials' | 'assignments'>('schedules');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [answer, setAnswer] = useState('');
  const [assignmentId, setAssignmentId] = useState<string>();

  const load = useCallback(async () => {
    setError('');
    const cacheKey = offlineCache.buildKey('student_portal', user?.id, tab);

    // Baca cache dulu
    const cached = await offlineCache.get<{ profile: any; records: RecordItem[] }>(cacheKey);
    if (cached) {
      if (cached.profile) setProfile(cached.profile);
      if (cached.records) setRecords(cached.records);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const [dashboardResponse, listResponse] = await Promise.all([
        mobileApiService.getPortalDashboard(),
        mobileApiService.getPortalResource(tab),
      ]);
      const freshProf = unwrap<any>(dashboardResponse)?.student;
      const freshRecs = unwrap<RecordItem[]>(listResponse) || [];
      if (freshProf) setProfile(freshProf);
      setRecords(freshRecs);
      void offlineCache.set(cacheKey, { profile: freshProf, records: freshRecs });
    } catch (err: any) {
      if (!cached) {
        setError(getApiErrorMessage(err, 'Data portal siswa belum berhasil dimuat.'));
      }
    } finally {
      setLoading(false);
    }
  }, [tab, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    if (!assignmentId || !answer.trim()) return;
    try {
      await mobileApiService.submitPortalAssignment(assignmentId, answer.trim());
      setAnswer('');
      setAssignmentId(undefined);
      Alert.alert('Berhasil', 'Tugas telah berhasil dikumpulkan.');
      await load();
    } catch (err: any) {
      Alert.alert('Gagal', getApiErrorMessage(err, 'Tugas belum berhasil dikumpulkan.'));
    }
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#0E5C44" />}
    >
      <View style={styles.hero}>
        <Text style={styles.tag}>PORTAL SISWA</Text>
        <Text style={styles.title}>Assalamu'alaikum, {profile?.full_name || 'Siswa'}</Text>
        <Text style={styles.subtitle}>
          {profile?.kelas?.nama_kelas || profile?.kelas?.name || 'Kelas belum ditentukan'} · NIS{' '}
          {profile?.nis || '-'}
        </Text>
      </View>

      <View style={styles.tabs}>
        {([
          ['schedules', 'Jadwal'],
          ['materials', 'Materi'],
          ['assignments', 'Tugas'],
        ] as const).map(([id, label]) => (
          <TouchableOpacity
            key={id}
            onPress={() => setTab(id)}
            style={[styles.tab, tab === id && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === id && styles.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {error ? (
        <View style={styles.error}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={load}>
            <Text style={styles.retry}>Muat ulang</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color="#0E5C44" style={styles.loader} />
      ) : (
        <View style={styles.content}>
          {records.map((item) => (
            <View key={item.id} style={styles.card}>
              <Text style={styles.subject}>
                {item.subject?.name || (tab === 'schedules' ? 'Jadwal pelajaran' : 'Pembelajaran')}
              </Text>
              <Text style={styles.cardTitle}>
                {item.judul || item.title || item.subject?.name || 'Data pembelajaran'}
              </Text>
              {tab === 'schedules' && (
                <Text style={styles.meta}>
                  {item.start_time || '-'} – {item.end_time || '-'}
                </Text>
              )}
              {tab === 'assignments' && (
                <>
                  <Text style={styles.meta}>Deadline: {item.deadline || '-'}</Text>
                  <Text style={styles.status}>
                    {item.pengumpulan_tugas?.[0]?.status || 'Belum dikumpulkan'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setAssignmentId(item.id)}
                    style={styles.outlineButton}
                  >
                    <Text style={styles.outlineText}>Tulis jawaban</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          ))}
          {!records.length && (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Belum ada data yang tersedia.</Text>
            </View>
          )}

          {assignmentId && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Jawaban tugas</Text>
              <TextInput
                value={answer}
                onChangeText={setAnswer}
                multiline
                placeholder="Tuliskan jawaban atau keterangan..."
                style={styles.input}
              />
              <TouchableOpacity onPress={submit} style={styles.button}>
                <Text style={styles.buttonText}>Kirim tugas</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setAssignmentId(undefined)}>
                <Text style={styles.cancel}>Batal</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  hero: {
    backgroundColor: '#0E5C44',
    padding: 18,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  tag: { fontSize: 10, fontWeight: '800', color: '#6EE7B7' },
  title: { fontSize: 16, fontWeight: '800', color: '#fff', marginTop: 4 },
  subtitle: { fontSize: 11, color: '#D1FAE5', marginTop: 2 },
  tabs: {
    flexDirection: 'row',
    margin: 16,
    padding: 4,
    borderRadius: 14,
    backgroundColor: '#fff',
  },
  tab: { flex: 1, padding: 10, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: '#0E5C44' },
  tabText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  tabTextActive: { color: '#fff' },
  content: { paddingHorizontal: 16, paddingBottom: 30, gap: 12 },
  card: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  subject: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
    textTransform: 'uppercase',
  },
  cardTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A', marginTop: 5 },
  meta: { fontSize: 11, color: '#64748B', marginTop: 5 },
  status: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    fontSize: 10,
    fontWeight: '700',
  },
  outlineButton: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#0E5C44',
    borderRadius: 10,
    padding: 9,
    alignItems: 'center',
  },
  outlineText: { fontSize: 12, fontWeight: '800', color: '#0E5C44' },
  input: {
    minHeight: 90,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    padding: 12,
    textAlignVertical: 'top',
  },
  button: {
    marginTop: 10,
    backgroundColor: '#0E5C44',
    borderRadius: 12,
    padding: 13,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '800' },
  cancel: { textAlign: 'center', marginTop: 12, fontSize: 12, color: '#64748B' },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 12, color: '#94A3B8' },
  loader: { margin: 40 },
  error: {
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
  },
  errorText: { fontSize: 12, color: '#B91C1C' },
  retry: { fontSize: 12, fontWeight: '800', color: '#0E5C44', marginTop: 8 },
});

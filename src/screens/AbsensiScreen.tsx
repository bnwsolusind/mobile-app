import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  ActivityIndicator,
  Badge,
  Button,
  Card,
  Divider,
  Surface,
  Text,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getApiErrorMessage } from '../services/api';
import { AttendancePayload, mobileApiService } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { useMobileConfigStore } from '../stores/mobileConfigStore';
import { canUseQrAttendance } from '../utils/accessControl';

type AttendanceRecord = Record<string, any>;

const timeOf = (value: unknown): string => {
  if (!value) return '-';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
};

const dateOf = (value: unknown): string => {
  if (!value) return 'Tanggal tidak tersedia';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

const colorOf = (status: string): string => {
  const value = status.toLowerCase();
  if (value.includes('hadir') || value.includes('present')) return '#059669';
  if (value.includes('terlambat') || value.includes('late')) return '#D97706';
  if (value.includes('izin') || value.includes('sakit')) return '#2563EB';
  return '#DC2626';
};

export default function AbsensiScreen() {
  const user = useAuthStore((state) => state.user);
  const employeeId = useAuthStore((state) => state.scope?.employee_id);
  const config = useMobileConfigStore((state) => state.config);
  const qrEnabled = canUseQrAttendance(user, config);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!employeeId) {
      setError('Akun ini belum terhubung ke data pegawai. Hubungkan user_id pada tabel employees terlebih dahulu.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setError('');
    setLoading(true);
    try {
      const response = await mobileApiService.getAttendanceReport({ employee_id: employeeId, per_page: 100 });
      const records = Array.isArray(response?.records)
        ? response.records
        : Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response?.data?.data)
            ? response.data.data
            : [];
      setHistory(records);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Riwayat presensi belum berhasil dimuat.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const today = history[0];
  const checkedIn = Boolean(today?.check_in_time && !today?.check_out_time);

  const checkIn = async () => {
    if (!employeeId) return;
    setSaving(true);
    try {
      const payload: AttendancePayload = {
        tipe_presensi: 'Pegawai',
        employee_id: String(employeeId),
        status: 'HADIR',
        attendance_method: 'MOBILE',
        location: 'SIMS Mobile Android',
        keterangan: 'Presensi masuk melalui aplikasi mobile.',
      };
      await mobileApiService.checkIn(payload);
      Alert.alert('Presensi berhasil', 'Presensi masuk sudah tercatat di server.');
      await load();
    } catch (requestError) {
      Alert.alert('Presensi gagal', getApiErrorMessage(requestError, 'Presensi masuk belum berhasil dicatat.'));
    } finally {
      setSaving(false);
    }
  };

  const checkOut = async () => {
    if (!employeeId) return;
    setSaving(true);
    try {
      await mobileApiService.checkOut({ employee_id: String(employeeId), location: 'SIMS Mobile Android' });
      Alert.alert('Presensi berhasil', 'Presensi pulang sudah tercatat di server.');
      await load();
    } catch (requestError) {
      Alert.alert('Presensi gagal', getApiErrorMessage(requestError, 'Presensi pulang belum berhasil dicatat.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} colors={['#0E5C44']} />}>
        <Surface style={styles.statusCard} elevation={1}>
          <View style={styles.statusHeader}><View><Text style={styles.eyebrow}>KEHADIRAN PEGAWAI</Text><Text variant="titleLarge" style={styles.title}>Presensi hari ini</Text><Text style={styles.date}>{dateOf(new Date().toISOString())}</Text></View><MaterialCommunityIcons name="map-marker-check-outline" size={34} color="#0E5C44" /></View>
          <Divider style={styles.divider} />
          <View style={styles.stateRow}><Text style={styles.stateLabel}>{checkedIn ? 'Sedang berada di jam kerja' : today?.check_out_time ? 'Presensi hari ini selesai' : 'Belum melakukan presensi'}</Text><Badge style={{ backgroundColor: checkedIn ? '#059669' : '#64748B' }}>{checkedIn ? 'Sudah masuk' : today?.check_out_time ? 'Selesai' : 'Belum absen'}</Badge></View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 6 }}>
            <Badge style={{ backgroundColor: qrEnabled ? '#059669' : '#475569' }}>
              {qrEnabled ? 'Mode Presensi: Scanner QR & Mandiri' : 'Mode Presensi: Mandiri (QR Nonaktif)'}
            </Badge>
          </View>
          <Text style={styles.note}>Aplikasi mengirim presensi ke `/api/attendance/checkin` dan `/api/attendance/checkout`. Lokasi dapat ditambahkan setelah permission GPS diaktifkan.</Text>
          <Button mode="contained" loading={saving} disabled={saving || !employeeId || Boolean(today?.check_out_time)} icon={checkedIn ? 'logout' : 'account-check-outline'} onPress={() => void (checkedIn ? checkOut() : checkIn())} style={[styles.action, checkedIn && styles.checkout]}>{checkedIn ? 'Absen pulang' : 'Absen masuk'}</Button>
        </Surface>

        {error ? <Card style={styles.errorCard}><Card.Content><Text style={styles.errorText}>{error}</Text><Button compact onPress={() => void load()}>Muat ulang</Button></Card.Content></Card> : null}
        {loading ? <ActivityIndicator color="#0E5C44" style={styles.loader} /> : null}

        <Text variant="titleMedium" style={styles.sectionTitle}>Riwayat presensi</Text>
        {!loading && !history.length ? <Card style={styles.emptyCard}><Card.Content><Text style={styles.empty}>Belum ada riwayat presensi untuk akun ini.</Text></Card.Content></Card> : null}
        {history.map((record, index) => {
          const status = String(record.status || 'Belum tercatat');
          return <Card key={String(record.id || index)} style={styles.historyCard}><Card.Content><View style={styles.historyHeader}><View style={styles.historyDate}><MaterialCommunityIcons name="calendar-outline" size={19} color="#0E5C44" /><Text style={styles.historyDateText}>{dateOf(record.attendance_date || record.created_at)}</Text></View><Badge style={{ backgroundColor: colorOf(status) }}>{status}</Badge></View><View style={styles.times}><View><Text style={styles.timeLabel}>Masuk</Text><Text style={styles.timeValue}>{timeOf(record.check_in_time)}</Text></View><View><Text style={styles.timeLabel}>Pulang</Text><Text style={styles.timeValue}>{timeOf(record.check_out_time)}</Text></View></View><Text style={styles.location}>{record.location || record.keterangan || 'Lokasi belum diisi'}</Text></Card.Content></Card>;
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F9FC' },
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  statusCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16 },
  statusHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: '#059669', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  title: { color: '#0F172A', fontWeight: '800', marginTop: 3 },
  date: { color: '#64748B', fontSize: 11, marginTop: 3 },
  divider: { marginVertical: 13 },
  stateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stateLabel: { flex: 1, color: '#334155', fontSize: 13, fontWeight: '700' },
  note: { color: '#64748B', fontSize: 11, lineHeight: 17, marginTop: 12 },
  action: { backgroundColor: '#0E5C44', borderRadius: 12, marginTop: 14 },
  checkout: { backgroundColor: '#B45309' },
  errorCard: { backgroundColor: '#FEF2F2', borderRadius: 14, marginTop: 14 },
  errorText: { color: '#B91C1C', fontSize: 12, lineHeight: 18 },
  loader: { marginVertical: 20 },
  sectionTitle: { color: '#0F172A', fontWeight: '800', marginTop: 20, marginBottom: 10 },
  emptyCard: { backgroundColor: '#FFFFFF', borderRadius: 16 },
  empty: { color: '#94A3B8', fontSize: 12 },
  historyCard: { backgroundColor: '#FFFFFF', borderRadius: 16, marginBottom: 10 },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  historyDate: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  historyDateText: { color: '#0F172A', fontSize: 12, fontWeight: '800', marginLeft: 7 },
  times: { flexDirection: 'row', gap: 32, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, marginTop: 12 },
  timeLabel: { color: '#64748B', fontSize: 10 },
  timeValue: { color: '#0F172A', fontSize: 15, fontWeight: '800', marginTop: 3 },
  location: { color: '#64748B', fontSize: 11, marginTop: 10 },
});

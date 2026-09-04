import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { ActivityIndicator, Card, Chip, ProgressBar, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { api } from '../services/api';

const colors: Record<string, string> = { good: '#22c55e', less: '#f59e0b', not_done: '#ef4444', na: '#94a3b8' };
const labels: Record<string, string> = { good: 'Baik', less: 'Kurang', not_done: 'Belum', na: 'N/A' };

export default function MutabaahScreen() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      try {
        const response = await api.get('/student/mutabaah');
        setData(response.data.data);
      } catch (studentError: any) {
        if (studentError.response?.status !== 403 && studentError.response?.status !== 404) throw studentError;
        let childList = [];
        try {
          const res = await api.get('/portal/children');
          childList = Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : []);
        } catch {
          const res = await api.get('/parent/mutabaah/children');
          childList = Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : []);
        }
        const child = childList[0];
        if (!child) throw new Error('Belum ada anak yang terhubung.');
        const response = await api.get(`/parent/mutabaah/${child.id}`);
        setData(response.data.data);
      }
    } catch (e: any) {
      setError(e.response?.data?.message || e.message || 'Data gagal dimuat.');
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <SafeAreaView style={styles.center}><ActivityIndicator color="#0e5c44" /><Text>Memuat Mutaba’ah...</Text></SafeAreaView>;
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
    <View style={styles.hero}><View><Text variant="labelSmall" style={styles.heroSub}>MUTABA’AH YAUMIYYAH</Text><Text variant="headlineSmall" style={styles.heroTitle}>Agenda Hari Ini</Text><Text style={styles.heroText}>Hasil pembiasaan dan ibadah harian</Text></View><MaterialCommunityIcons name="book-heart" size={44} color="#8ed4b5" /></View>
    {error ? <Card style={styles.empty}><Card.Content><MaterialCommunityIcons name="alert-circle-outline" size={40} color="#ef4444" /><Text variant="titleMedium">Data gagal dimuat</Text><Text>{error}</Text></Card.Content></Card> : <>
      <Card style={styles.card}><Card.Content style={styles.profile}><View style={styles.avatar}><MaterialCommunityIcons name="account-school" size={28} color="#0e5c44" /></View><View style={styles.flex}><Text variant="titleMedium">{data?.student?.name}</Text><Text variant="bodySmall">{data?.student?.class_name || '-'} · {data?.student?.unit || '-'}</Text></View><View style={styles.score}><Text variant="titleLarge">{Math.round(Number(data?.today?.score || 0))}%</Text></View></Card.Content></Card>
      <View style={styles.summary}><Summary title="Mingguan" value={data?.weekly?.score || 0} /><Summary title="Bulanan" value={data?.monthly?.score || 0} /></View>
      <Text variant="titleMedium" style={styles.heading}>Agenda</Text>
      {data?.today?.details?.map((item: any) => <Card key={item.id} style={styles.agenda}><Card.Content style={styles.agendaContent}><View style={[styles.statusIcon, { backgroundColor: `${colors[item.status_value]}22` }]}><MaterialCommunityIcons name={item.status_value === 'good' ? 'check-circle' : item.status_value === 'not_done' ? 'close-circle' : 'clock-outline'} size={22} color={colors[item.status_value]} /></View><View style={styles.flex}><Text variant="labelSmall" style={styles.muted}>{item.category}</Text><Text variant="titleSmall">{item.name}</Text>{item.notes ? <Text variant="bodySmall">{item.notes}</Text> : null}</View><Chip compact textStyle={{ color: colors[item.status_value] }} style={{ backgroundColor: `${colors[item.status_value]}18` }}>{labels[item.status_value]}</Chip></Card.Content></Card>)}
      {!data?.today && <Card style={styles.empty}><Card.Content><MaterialCommunityIcons name="book-open-blank-variant" size={40} color="#0e5c44" /><Text variant="titleMedium">Belum ada hasil hari ini</Text><Text>Hasil tampil setelah pembimbing melakukan finalisasi.</Text></Card.Content></Card>}
      {data?.today?.notes ? <Card style={styles.note}><Card.Content><Text variant="labelMedium">Catatan Pembimbing</Text><Text variant="bodyMedium">{data.today.notes}</Text></Card.Content></Card> : null}
    </>}
  </ScrollView></SafeAreaView>;
}
function Summary({ title, value }: { title: string; value: number }) { return <Card style={styles.summaryCard}><Card.Content><Text variant="labelMedium">{title}</Text><Text variant="headlineSmall" style={styles.green}>{Math.round(Number(value))}%</Text><ProgressBar progress={Number(value) / 100} color="#0e5c44" style={styles.bar} /></Card.Content></Card> }
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: '#f7f9fc' }, container: { padding: 14, gap: 10 }, center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 }, hero: { borderRadius: 20, backgroundColor: '#0e5c44', padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, heroSub: { color: '#a7dfc7', fontWeight: '700' }, heroTitle: { color: '#fff', fontWeight: '700' }, heroText: { color: '#d8f3e6' }, card: { borderRadius: 18, backgroundColor: '#fff' }, profile: { flexDirection: 'row', alignItems: 'center', gap: 12 }, avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#e4f7ec', alignItems: 'center', justifyContent: 'center' }, flex: { flex: 1 }, score: { width: 58, height: 58, borderRadius: 29, borderWidth: 6, borderColor: '#1e8e5a', alignItems: 'center', justifyContent: 'center' }, summary: { flexDirection: 'row', gap: 10 }, summaryCard: { flex: 1, borderRadius: 16, backgroundColor: '#fff' }, green: { color: '#0e5c44', fontWeight: '700' }, bar: { marginTop: 8, borderRadius: 8 }, heading: { marginTop: 6, fontWeight: '700' }, agenda: { borderRadius: 15, backgroundColor: '#fff' }, agendaContent: { flexDirection: 'row', alignItems: 'center', gap: 10 }, statusIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, muted: { color: '#64748b' }, note: { borderRadius: 16, backgroundColor: '#eef9f3' }, empty: { borderRadius: 18, backgroundColor: '#fff' }, });

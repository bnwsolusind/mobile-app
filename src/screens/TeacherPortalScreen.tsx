import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  HelperText,
  Surface,
  Text,
  TextInput,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getApiErrorMessage } from '../services/api';
import { mobileApiService, unwrapApiData, unwrapCollection } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { isSuperAdminRole } from '../utils/roles';

type TeacherTab = 'overview' | 'schedules' | 'students' | 'materials' | 'notes';
type FormType = 'note' | 'material';
type FormState = Record<string, string>;

const text = (value: unknown, fallback = '') => value === null || value === undefined ? fallback : String(value);

export default function TeacherPortalScreen() {
  const permissions = useAuthStore((state) => state.permissions);
  const user = useAuthStore((state) => state.user);
  const [tab, setTab] = useState<TeacherTab>('overview');
  const [dashboard, setDashboard] = useState<any>({});
  const [schedules, setSchedules] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [formType, setFormType] = useState<FormType>('note');
  const [formVisible, setFormVisible] = useState(false);
  const [form, setForm] = useState<FormState>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const roles = useAuthStore((state) => state.roles);
  const isSuperAdmin = isSuperAdminRole(roles);
  const canNote = isSuperAdmin || permissions.includes('teacher.student_note.create') || permissions.includes('teacher.manage');
  const canMaterial = isSuperAdmin || permissions.includes('teacher.material.create') || permissions.includes('pembelajaran.materi') || permissions.includes('lms.manage');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [dashboardResult, schedulesResult, studentsResult, materialsResult, notesResult] = await Promise.allSettled([
      mobileApiService.getTeacherDashboard(),
      mobileApiService.getTeacherSchedules(),
      mobileApiService.getTeacherStudents({ per_page: 50 }),
      mobileApiService.getTeacherMaterials({ per_page: 30 }),
      mobileApiService.getTeacherStudentNotes({ per_page: 30 }),
    ]);

    if (dashboardResult.status === 'fulfilled') setDashboard(unwrapApiData<any>(dashboardResult.value) || {});
    if (schedulesResult.status === 'fulfilled') setSchedules(unwrapCollection(schedulesResult.value));
    if (studentsResult.status === 'fulfilled') setStudents(unwrapCollection(studentsResult.value));
    if (materialsResult.status === 'fulfilled') setMaterials(unwrapCollection(materialsResult.value));
    if (notesResult.status === 'fulfilled') setNotes(unwrapCollection(notesResult.value));

    const failures = [dashboardResult, schedulesResult, studentsResult, materialsResult, notesResult].filter((result) => result.status === 'rejected');
    if (failures.length === 5) setError('Portal guru tidak dapat terhubung. Pastikan role dan permission guru sudah tersinkron.');
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openNote = () => {
    setFormType('note');
    setFormError('');
    setForm({
      student_id: text(students[0]?.id),
      category: 'Akademik',
      title: '',
      content: '',
      priority: 'medium',
    });
    setFormVisible(true);
  };

  const openMaterial = () => {
    setFormType('material');
    setFormError('');
    const firstSchedule = schedules[0] || {};
    setForm({
      judul: '',
      subject_id: text(firstSchedule.subject_id),
      class_id: text(firstSchedule.kelas_id || firstSchedule.class_id),
      ringkasan: '',
      isi: '',
      status: 'published',
    });
    setFormVisible(true);
  };

  const setField = (key: string, value: string) => setForm((previous) => ({ ...previous, [key]: value }));

  const saveForm = async () => {
    setFormError('');
    if (formType === 'note' && (!form.student_id || !form.title?.trim() || !form.content?.trim())) {
      setFormError('Siswa, judul, dan isi catatan wajib diisi.');
      return;
    }
    if (formType === 'material' && (!form.judul?.trim() || !form.subject_id || !form.class_id)) {
      setFormError('Judul, subject_id, dan class_id wajib diisi sesuai jadwal mengajar.');
      return;
    }

    setSaving(true);
    try {
      if (formType === 'note') {
        await mobileApiService.createTeacherStudentNote({
          student_id: form.student_id,
          category: form.category || 'Akademik',
          title: form.title.trim(),
          content: form.content.trim(),
          priority: form.priority || 'medium',
          visible_to_parent: true,
          visible_to_student: true,
        });
      } else {
        await mobileApiService.createTeacherMaterial({
          judul: form.judul.trim(),
          subject_id: form.subject_id,
          class_id: form.class_id,
          ringkasan: form.ringkasan || undefined,
          isi: form.isi || undefined,
          status: form.status || 'published',
        });
      }
      setFormVisible(false);
      Alert.alert('Berhasil', formType === 'note' ? 'Catatan siswa tersimpan.' : 'Materi pembelajaran tersimpan.');
      await load();
    } catch (requestError) {
      setFormError(getApiErrorMessage(requestError, 'Data belum berhasil disimpan.'));
    } finally {
      setSaving(false);
    }
  };

  const kpi = dashboard?.kpi || {};
  const tabs: Array<[TeacherTab, string]> = [['overview', 'Ringkasan'], ['schedules', 'Jadwal'], ['students', 'Siswa'], ['materials', 'Materi'], ['notes', 'Catatan']];

  return (
    <View style={styles.screen}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} colors={['#0E5C44']} />} contentContainerStyle={styles.content}>
        <Surface style={styles.hero} elevation={1}><Text style={styles.eyebrow}>PORTAL GURU TERPADU</Text><Text style={styles.heroTitle}>Assalamu'alaikum, {dashboard?.teacher?.name || user?.name || 'Guru'}</Text><Text style={styles.heroSubtitle}>{dashboard?.academic_context?.academic_year || 'Tahun ajaran aktif'} · {dashboard?.academic_context?.semester || 'Semester aktif'}</Text></Surface>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>{tabs.map(([id, label]) => <TouchableOpacity key={id} onPress={() => setTab(id)} style={[styles.tab, tab === id && styles.tabActive]}><Text style={[styles.tabText, tab === id && styles.tabTextActive]}>{label}</Text></TouchableOpacity>)}</ScrollView>
        {error ? <Card style={styles.errorCard}><Card.Content><Text style={styles.errorText}>{error}</Text><Button compact onPress={() => void load()}>Coba lagi</Button></Card.Content></Card> : null}
        {loading ? <ActivityIndicator color="#0E5C44" style={styles.loader} /> : null}

        {tab === 'overview' ? <View><View style={styles.kpiGrid}>{[
          ['Jadwal hari ini', kpi.schedules_today_count ?? 0, 'calendar-clock-outline'],
          ['Siswa diajar', kpi.total_students ?? 0, 'account-group-outline'],
          ['Kelas', kpi.total_classes ?? 0, 'google-classroom'],
          ['Perlu dinilai', kpi.pending_grading_count ?? 0, 'file-document-edit-outline'],
          ['Materi', materials.length, 'book-open-outline'],
          ['Catatan', notes.length, 'note-text-outline'],
        ].map(([label, value, icon]) => <Card key={String(label)} style={styles.kpiCard}><Card.Content><MaterialCommunityIcons name={String(icon) as never} size={23} color="#0E5C44" /><Text style={styles.kpiValue}>{String(value)}</Text><Text style={styles.kpiLabel}>{String(label)}</Text></Card.Content></Card>)}</View><Text style={styles.sectionTitle}>Agenda mengajar</Text><ScheduleList items={schedules.slice(0, 5)} /></View> : null}

        {tab === 'schedules' ? <View><Text style={styles.sectionTitle}>Jadwal mengajar</Text><ScheduleList items={schedules} /></View> : null}
        {tab === 'students' ? <View><Text style={styles.sectionTitle}>Siswa dalam cakupan mengajar</Text>{students.length ? students.map((item, index) => <Card key={String(item.id || index)} style={styles.listCard}><Card.Content style={styles.row}><View style={styles.smallIcon}><MaterialCommunityIcons name="account-school-outline" size={21} color="#0E5C44" /></View><View style={styles.rowCopy}><Text style={styles.itemTitle}>{item.full_name || item.nama_lengkap || 'Siswa'}</Text><Text style={styles.itemMeta}>{[item.nis, item.kelas?.nama_kelas || item.kelas?.name].filter(Boolean).join(' · ') || 'Detail kelas belum tersedia'}</Text></View></Card.Content></Card>) : <Empty text="Belum ada siswa pada assignment guru." />}</View> : null}
        {tab === 'materials' ? <View><View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Materi pembelajaran</Text>{canMaterial ? <Button compact mode="contained" icon="plus" onPress={openMaterial} style={styles.addButton}>Tambah</Button> : null}</View>{materials.length ? materials.map((item, index) => <Card key={String(item.id || index)} style={styles.listCard}><Card.Content><Text style={styles.itemTitle}>{item.judul || item.title || 'Materi'}</Text><Text style={styles.itemMeta}>{item.subject?.name || item.subject?.nama_mapel || item.status || 'Materi tersimpan'}</Text></Card.Content></Card>) : <Empty text="Belum ada materi yang dibuat." />}</View> : null}
        {tab === 'notes' ? <View><View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Catatan perkembangan siswa</Text>{canNote ? <Button compact mode="contained" icon="plus" onPress={openNote} style={styles.addButton}>Tambah</Button> : null}</View>{notes.length ? notes.map((item, index) => <Card key={String(item.id || index)} style={styles.listCard}><Card.Content><Text style={styles.itemTitle}>{item.title || 'Catatan siswa'}</Text><Text style={styles.itemMeta}>{item.student?.full_name || item.student?.nama_lengkap || 'Siswa'} · {item.category || 'Akademik'}</Text><Text style={styles.noteText} numberOfLines={3}>{item.content || '-'}</Text></Card.Content></Card>) : <Empty text="Belum ada catatan siswa." />}</View> : null}
      </ScrollView>

      <Modal visible={formVisible} animationType="slide" onRequestClose={() => setFormVisible(false)}><View style={styles.modal}><View style={styles.modalHeader}><Text variant="titleLarge" style={styles.modalTitle}>{formType === 'note' ? 'Catatan siswa' : 'Materi pembelajaran'}</Text><TouchableOpacity onPress={() => setFormVisible(false)}><MaterialCommunityIcons name="close" size={25} color="#0F172A" /></TouchableOpacity></View><ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">{formType === 'note' ? <><TextInput mode="outlined" label="ID siswa" value={form.student_id || ''} onChangeText={(value) => setField('student_id', value)} style={styles.input} /><TextInput mode="outlined" label="Kategori" value={form.category || ''} onChangeText={(value) => setField('category', value)} style={styles.input} /><TextInput mode="outlined" label="Judul" value={form.title || ''} onChangeText={(value) => setField('title', value)} style={styles.input} /><TextInput mode="outlined" label="Isi catatan" value={form.content || ''} onChangeText={(value) => setField('content', value)} multiline numberOfLines={5} style={styles.input} /><TextInput mode="outlined" label="Prioritas: low, medium, high, urgent" value={form.priority || ''} onChangeText={(value) => setField('priority', value)} style={styles.input} /></> : <><TextInput mode="outlined" label="Judul materi" value={form.judul || ''} onChangeText={(value) => setField('judul', value)} style={styles.input} /><TextInput mode="outlined" label="Subject ID dari jadwal" value={form.subject_id || ''} onChangeText={(value) => setField('subject_id', value)} style={styles.input} /><TextInput mode="outlined" label="Class ID dari jadwal" value={form.class_id || ''} onChangeText={(value) => setField('class_id', value)} style={styles.input} /><TextInput mode="outlined" label="Ringkasan" value={form.ringkasan || ''} onChangeText={(value) => setField('ringkasan', value)} style={styles.input} /><TextInput mode="outlined" label="Isi materi" value={form.isi || ''} onChangeText={(value) => setField('isi', value)} multiline numberOfLines={5} style={styles.input} /><TextInput mode="outlined" label="Status: draft atau published" value={form.status || ''} onChangeText={(value) => setField('status', value)} style={styles.input} /></>}{formError ? <HelperText type="error" visible style={styles.formError}>{formError}</HelperText> : null}<Button mode="contained" loading={saving} disabled={saving} onPress={() => void saveForm()} style={styles.saveButton}>Simpan</Button><Button mode="outlined" disabled={saving} onPress={() => setFormVisible(false)} style={styles.cancelButton}>Batal</Button></ScrollView></View></Modal>
    </View>
  );
}

function ScheduleList({ items }: { items: any[] }) {
  if (!items.length) return <Empty text="Belum ada jadwal dari server." />;
  return <>{items.map((item, index) => <Card key={String(item.id || index)} style={styles.listCard}><Card.Content style={styles.row}><View style={styles.timeBox}><Text style={styles.time}>{item.time_start || item.start_time || '-'}</Text><Text style={styles.timeDash}>-</Text><Text style={styles.time}>{item.time_end || item.end_time || '-'}</Text></View><View style={styles.rowCopy}><Text style={styles.itemTitle}>{item.subject?.name || item.subject?.nama_mapel || item.subject_name || 'Mata pelajaran'}</Text><Text style={styles.itemMeta}>{item.kelas?.nama_kelas || item.kelas?.name || item.class?.name || 'Kelas belum terhubung'}</Text></View></Card.Content></Card>)}</>;
}

function Empty({ text }: { text: string }) {
  return <Card style={styles.emptyCard}><Card.Content><Text style={styles.empty}>{text}</Text></Card.Content></Card>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F9FC' },
  content: { padding: 16, paddingBottom: 32 },
  hero: { backgroundColor: '#0E5C44', borderRadius: 20, padding: 20 },
  eyebrow: { color: '#6EE7B7', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  heroTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginTop: 5 },
  heroSubtitle: { color: '#D1FAE5', fontSize: 12, marginTop: 4 },
  tabs: { gap: 8, paddingVertical: 16 },
  tab: { backgroundColor: '#FFFFFF', borderRadius: 11, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  tabActive: { backgroundColor: '#0E5C44', borderColor: '#0E5C44' },
  tabText: { color: '#64748B', fontSize: 11, fontWeight: '800' },
  tabTextActive: { color: '#FFFFFF' },
  errorCard: { backgroundColor: '#FEF2F2', borderRadius: 14 },
  errorText: { color: '#B91C1C', fontSize: 12, lineHeight: 18 },
  loader: { marginVertical: 22 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpiCard: { width: '31.8%', minWidth: 100, backgroundColor: '#FFFFFF', borderRadius: 14 },
  kpiValue: { color: '#0F172A', fontSize: 20, fontWeight: '900', marginTop: 6 },
  kpiLabel: { color: '#64748B', fontSize: 10, marginTop: 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: '#0F172A', fontSize: 15, fontWeight: '800', marginTop: 18, marginBottom: 10 },
  addButton: { backgroundColor: '#0E5C44', borderRadius: 9 },
  listCard: { backgroundColor: '#FFFFFF', borderRadius: 15, marginBottom: 9 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowCopy: { flex: 1, marginLeft: 11 },
  smallIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#ECFDF5', justifyContent: 'center', alignItems: 'center' },
  itemTitle: { color: '#0F172A', fontSize: 13, fontWeight: '800' },
  itemMeta: { color: '#64748B', fontSize: 11, marginTop: 3 },
  noteText: { color: '#475569', fontSize: 12, lineHeight: 18, marginTop: 9 },
  timeBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 8 },
  time: { color: '#047857', fontSize: 10, fontWeight: '800' },
  timeDash: { color: '#6B7280', fontSize: 10, marginHorizontal: 3 },
  emptyCard: { backgroundColor: '#FFFFFF', borderRadius: 15 },
  empty: { color: '#94A3B8', fontSize: 12 },
  modal: { flex: 1, backgroundColor: '#F7F9FC' },
  modalHeader: { backgroundColor: '#FFFFFF', padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  modalTitle: { color: '#0F172A', fontWeight: '800' },
  modalContent: { padding: 16, paddingBottom: 40 },
  input: { backgroundColor: '#FFFFFF', marginBottom: 10 },
  formError: { paddingHorizontal: 0 },
  saveButton: { backgroundColor: '#0E5C44', borderRadius: 12, marginTop: 8 },
  cancelButton: { borderRadius: 12, marginTop: 10 },
});

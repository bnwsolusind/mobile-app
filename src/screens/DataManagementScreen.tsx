import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Divider,
  HelperText,
  Surface,
  Text,
  TextInput,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getApiErrorMessage } from '../services/api';
import {
  mobileApiService,
  unwrapCollection,
} from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import {
  isFoundationRole,
  isTeacherRole,
  isSuperAdminRole,
} from '../utils/roles';

type Resource = 'employees' | 'students' | 'units' | 'classes';
type FormState = Record<string, string | boolean>;

const resourceLabels: Record<Resource, string> = {
  employees: 'Pegawai',
  students: 'Siswa',
  units: 'Unit',
  classes: 'Kelas',
};

const asText = (value: unknown): string => (value === null || value === undefined ? '' : String(value));

const nestedName = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const item = value as { name?: string; nama?: string; nama_kelas?: string };
    return item.name || item.nama || item.nama_kelas || '';
  }
  return '';
};

const normalizedGender = (value: unknown, resource: Resource): string => {
  const gender = asText(value).toLowerCase();
  if (!gender) return resource === 'employees' ? 'L' : '';
  if (resource === 'employees') return ['p', 'female', 'perempuan'].includes(gender) ? 'P' : 'L';
  return ['l', 'male', 'laki-laki', 'laki laki'].includes(gender) ? 'male' : 'female';
};

export default function DataManagementScreen() {
  const roles = useAuthStore((state) => state.roles);
  const permissions = useAuthStore((state) => state.permissions);
  const scope = useAuthStore((state) => state.scope);
  const foundation = isFoundationRole(roles);
  const teacher = isTeacherRole(roles);
  const superAdmin = isSuperAdminRole(roles);

  const hasPermission = (...items: string[]) => superAdmin || items.some((item) => permissions.includes(item));
  const canReadMaster = hasPermission(
    'employee.view', 'employee.view_all', 'student.view', 'student.view_all',
    'unit.view', 'unit.view_all', 'master.view', 'sistem.master_data',
  );

  const resources: Resource[] = foundation
    ? ['units', 'employees', 'students', 'classes']
    : teacher && !canReadMaster
      ? ['students']
      : ['employees', 'students', 'units', 'classes'];

  const [resource, setResource] = useState<Resource>(resources[0] || 'employees');
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const canCreate = resource === 'employees'
    ? hasPermission('employee.create', 'sistem.master_data')
    : resource === 'students'
      ? hasPermission('student.create', 'sistem.master_data')
      : resource === 'units'
        ? hasPermission('unit.create', 'sistem.master_data')
        : hasPermission('master.create', 'academic.schedule.create', 'sistem.master_data');
  const canUpdate = resource === 'employees'
    ? hasPermission('employee.update', 'sistem.master_data')
    : resource === 'students'
      ? hasPermission('student.update', 'student.edit', 'academic.manage', 'sistem.master_data')
      : resource === 'units'
        ? hasPermission('unit.update', 'sistem.master_data')
        : hasPermission('master.update', 'academic.schedule.update', 'sistem.master_data');
  const canDelete = resource === 'employees'
    ? hasPermission('employee.delete', 'sistem.master_data')
    : resource === 'students'
      ? hasPermission('student.delete', 'sistem.master_data')
      : resource === 'units'
        ? hasPermission('unit.delete', 'sistem.master_data')
        : hasPermission('master.delete', 'academic.schedule.delete', 'sistem.master_data');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { search: query, per_page: 30 };
      let response: any;

      if (resource === 'employees') {
        response = foundation
          ? await mobileApiService.getFoundationEmployees(params)
          : await mobileApiService.getEmployees(params);
      } else if (resource === 'students') {
        response = teacher && !canReadMaster
          ? await mobileApiService.getTeacherStudents(params)
          : foundation
            ? await mobileApiService.getFoundationStudents(params)
            : await mobileApiService.getStudents({ ...params, unit_id: scope?.unit_id || undefined });
      } else if (resource === 'units') {
        response = foundation
          ? await mobileApiService.getFoundationUnits(params)
          : await mobileApiService.getEducationUnits(params);
      } else {
        response = foundation
          ? await mobileApiService.getFoundationClasses(params)
          : await mobileApiService.getClasses(params);
      }

      setItems(unwrapCollection(response));
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Data belum berhasil dimuat. Periksa permission akun Anda.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canReadMaster, foundation, query, resource, scope?.unit_id, teacher]);

  useEffect(() => {
    void load();
  }, [load]);

  const setField = (key: string, value: string | boolean) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const openForm = (item?: any) => {
    setEditingId(item?.id ? String(item.id) : null);
    setFormError('');

    if (resource === 'employees') {
      setForm({
        niy: asText(item?.niy),
        nama_lengkap: asText(item?.nama_lengkap || item?.name),
        jenis_kelamin: normalizedGender(item?.jenis_kelamin || item?.gender, resource),
        unit_id: asText(item?.unit_id),
        jabatan_id: asText(item?.jabatan_id),
        status_pegawai: asText(item?.status_pegawai || 'Tetap'),
        status: asText(item?.status || 'Aktif'),
        no_hp: asText(item?.no_hp || item?.phone),
        email: asText(item?.email),
        alamat: asText(item?.alamat || item?.address),
      });
    } else if (resource === 'students') {
      setForm({
        nis: asText(item?.nis),
        nisn: asText(item?.nisn),
        full_name: asText(item?.full_name || item?.nama),
        gender: normalizedGender(item?.gender || item?.jenis_kelamin, resource),
        unit_id: asText(item?.unit_id),
        kelas_id: asText(item?.kelas_id),
        birth_place: asText(item?.birth_place),
        birth_date: asText(item?.birth_date),
        address: asText(item?.address),
        is_active: item?.is_active !== false,
      });
    } else if (resource === 'units') {
      setForm({
        code: asText(item?.code),
        name: asText(item?.name),
        level: asText(item?.level),
        description: asText(item?.description),
        is_active: item?.is_active !== false,
      });
    } else {
      setForm({
        nama_kelas: asText(item?.nama_kelas || item?.name),
        kode_kelas: asText(item?.kode_kelas || item?.code),
        tingkat: asText(item?.tingkat),
        jenjang: asText(item?.jenjang),
        kapasitas: asText(item?.kapasitas || 30),
        status: asText(item?.status || 'Aktif'),
      });
    }

    setModalVisible(true);
  };

  const textField = (key: string): string => asText(form[key]);

  const submitForm = async () => {
    setFormError('');
    if (resource === 'employees' && !textField('nama_lengkap').trim()) {
      setFormError('Nama lengkap pegawai wajib diisi.');
      return;
    }
    if (resource === 'students' && (!textField('nis').trim() || !textField('full_name').trim() || !['male', 'female'].includes(textField('gender')))) {
      setFormError('NIS, nama lengkap, dan jenis kelamin male/female wajib diisi.');
      return;
    }
    if (resource === 'units' && !textField('name').trim()) {
      setFormError('Nama unit pendidikan wajib diisi.');
      return;
    }

    setSaving(true);
    try {
      if (resource === 'employees') {
        const payload = {
          niy: textField('niy') || undefined,
          nama_lengkap: textField('nama_lengkap').trim(),
          jenis_kelamin: textField('jenis_kelamin') === 'P' ? 'P' : 'L',
          unit_id: textField('unit_id') || undefined,
          jabatan_id: textField('jabatan_id') || undefined,
          status_pegawai: textField('status_pegawai') || undefined,
          status: textField('status') || 'Aktif',
          no_hp: textField('no_hp') || undefined,
          email: textField('email') || undefined,
          alamat: textField('alamat') || undefined,
        };
        if (editingId) await mobileApiService.updateEmployee(editingId, payload);
        else await mobileApiService.createEmployee(payload);
      } else if (resource === 'students') {
        const payload = {
          nis: textField('nis').trim(),
          nisn: textField('nisn') || undefined,
          full_name: textField('full_name').trim(),
          gender: textField('gender') === 'male' ? 'male' : 'female',
          unit_id: textField('unit_id') || undefined,
          kelas_id: textField('kelas_id') || undefined,
          birth_place: textField('birth_place') || undefined,
          birth_date: textField('birth_date') || undefined,
          address: textField('address') || undefined,
          is_active: form.is_active !== false,
        };
        if (editingId) await mobileApiService.updateStudent(editingId, payload);
        else await mobileApiService.createStudent(payload);
      } else if (resource === 'units') {
        const payload = {
          code: textField('code') || undefined,
          name: textField('name').trim(),
          level: textField('level') || undefined,
          description: textField('description') || undefined,
          is_active: form.is_active !== false,
        };
        if (editingId) await mobileApiService.updateEducationUnit(editingId, payload);
        else await mobileApiService.createEducationUnit(payload);
      } else {
        setFormError('Pembuatan kelas melalui mobile membutuhkan pilihan tahun ajaran dan semester dari master data.');
        return;
      }

      setModalVisible(false);
      await load();
    } catch (requestError) {
      setFormError(getApiErrorMessage(requestError, 'Perubahan data belum berhasil disimpan.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = (item: any) => {
    if (!item?.id) return;
    Alert.alert(
      `Hapus ${resourceLabels[resource].toLowerCase()}`,
      `Data ${displayName(item)} akan dihapus dari sistem.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            try {
              if (resource === 'employees') await mobileApiService.deleteEmployee(String(item.id));
              else if (resource === 'students') await mobileApiService.deleteStudent(String(item.id));
              else if (resource === 'units') await mobileApiService.deleteEducationUnit(String(item.id));
              else return;
              await load();
            } catch (requestError) {
              Alert.alert('Gagal menghapus', getApiErrorMessage(requestError, 'Data belum berhasil dihapus.'));
            }
          },
        },
      ],
    );
  };

  const displayName = (item: any): string => {
    if (resource === 'employees') return item?.nama_lengkap || item?.name || 'Pegawai';
    if (resource === 'students') return item?.full_name || item?.nama || 'Siswa';
    if (resource === 'units') return item?.name || 'Unit pendidikan';
    return item?.nama_kelas || item?.name || 'Kelas';
  };

  const secondaryText = (item: any): string => {
    if (resource === 'employees') {
      return [item?.niy || item?.nik, nestedName(item?.position || item?.jabatan), nestedName(item?.unit)].filter(Boolean).join(' · ');
    }
    if (resource === 'students') {
      return [item?.nis, nestedName(item?.kelas), nestedName(item?.education_unit || item?.educationUnit || item?.unit)].filter(Boolean).join(' · ');
    }
    if (resource === 'units') return [item?.code, item?.level, item?.is_active === false ? 'Nonaktif' : 'Aktif'].filter(Boolean).join(' · ');
    return [item?.kode_kelas || item?.code, item?.tingkat, item?.students_count ? `${item.students_count} siswa` : ''].filter(Boolean).join(' · ');
  };

  const renderFields = () => {
    const fields: Array<{ key: string; label: string; keyboard?: 'default' | 'email-address' | 'numeric'; multiline?: boolean }> = resource === 'employees'
      ? [
        { key: 'niy', label: 'NIY / NIP (opsional)' },
        { key: 'nama_lengkap', label: 'Nama lengkap' },
        { key: 'jenis_kelamin', label: 'Jenis kelamin: L atau P' },
        { key: 'unit_id', label: 'ID unit pendidikan (UUID)' },
        { key: 'jabatan_id', label: 'ID jabatan (UUID)' },
        { key: 'status_pegawai', label: 'Status pegawai' },
        { key: 'no_hp', label: 'Nomor HP' },
        { key: 'email', label: 'Email', keyboard: 'email-address' },
        { key: 'alamat', label: 'Alamat', multiline: true },
      ]
      : resource === 'students'
        ? [
          { key: 'nis', label: 'NIS' },
          { key: 'nisn', label: 'NISN (opsional)' },
          { key: 'full_name', label: 'Nama lengkap' },
          { key: 'gender', label: 'Jenis kelamin: male atau female' },
          { key: 'unit_id', label: 'ID unit pendidikan (UUID)' },
          { key: 'kelas_id', label: 'ID kelas / rombel (UUID)' },
          { key: 'birth_place', label: 'Tempat lahir' },
          { key: 'birth_date', label: 'Tanggal lahir: YYYY-MM-DD' },
          { key: 'address', label: 'Alamat', multiline: true },
        ]
        : [
          { key: 'code', label: 'Kode unit (opsional)' },
          { key: 'name', label: 'Nama unit' },
          { key: 'level', label: 'Jenjang: TK, SD, SMP, atau SMA' },
          { key: 'description', label: 'Keterangan', multiline: true },
        ];

    return fields.map((field) => (
      <TextInput
        key={field.key}
        mode="outlined"
        label={field.label}
        value={textField(field.key)}
        onChangeText={(value) => setField(field.key, value)}
        keyboardType={field.keyboard || 'default'}
        multiline={field.multiline}
        numberOfLines={field.multiline ? 3 : 1}
        style={styles.formInput}
      />
    ));
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} colors={['#0E5C44']} />}
      >
        <Surface style={styles.hero} elevation={1}>
          <View style={styles.heroIcon}><MaterialCommunityIcons name={foundation ? 'office-building-outline' : 'database-outline'} size={28} color="#FFFFFF" /></View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>{foundation ? 'MONITORING YAYASAN' : 'MASTER DATA SEKOLAH'}</Text>
            <Text variant="titleLarge" style={styles.heroTitle}>Kelola data terhubung</Text>
            <Text style={styles.heroSubtitle}>Perubahan diproses langsung oleh API Laravel sesuai cakupan akun.</Text>
          </View>
        </Surface>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {resources.map((item) => (
            <TouchableOpacity key={item} onPress={() => { setResource(item); setQuery(''); setSearch(''); }} style={[styles.tab, resource === item && styles.tabActive]}>
              <Text style={[styles.tabText, resource === item && styles.tabTextActive]}>{resourceLabels[item]}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.toolbar}>
          <TextInput
            mode="outlined"
            dense
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => setQuery(search.trim())}
            placeholder={`Cari ${resourceLabels[resource].toLowerCase()}...`}
            left={<TextInput.Icon icon="magnify" />}
            style={styles.search}
          />
          <Button mode="contained" icon="magnify" onPress={() => setQuery(search.trim())} style={styles.searchButton}>Cari</Button>
        </View>

        {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text><Button compact onPress={() => void load()}>Coba lagi</Button></View> : null}
        {loading ? <ActivityIndicator style={styles.loader} color="#0E5C44" /> : null}

        {!loading && !items.length ? (
          <Card style={styles.emptyCard}><Card.Content><Text style={styles.emptyTitle}>Belum ada data</Text><Text style={styles.emptyText}>Tidak ada {resourceLabels[resource].toLowerCase()} yang cocok dengan pencarian.</Text></Card.Content></Card>
        ) : null}

        {items.map((item) => (
          <Card key={String(item.id || displayName(item))} style={styles.itemCard}>
            <Card.Content>
              <View style={styles.itemRow}>
                <View style={styles.itemIcon}><MaterialCommunityIcons name={resource === 'employees' ? 'account-tie-outline' : resource === 'students' ? 'account-school-outline' : resource === 'units' ? 'domain' : 'google-classroom'} size={22} color="#0E5C44" /></View>
                <View style={styles.itemCopy}><Text style={styles.itemTitle}>{displayName(item)}</Text><Text style={styles.itemMeta}>{secondaryText(item) || 'Detail belum tersedia'}</Text></View>
                {(canUpdate || canDelete) && item?.id ? <MaterialCommunityIcons name="dots-vertical" size={22} color="#64748B" /> : null}
              </View>
              {(canUpdate || canDelete) && item?.id ? <>
                <Divider style={styles.divider} />
                <View style={styles.itemActions}>
                  {canUpdate && resource !== 'classes' ? <Button compact icon="pencil-outline" onPress={() => openForm(item)}>Ubah</Button> : null}
                  {canDelete && resource !== 'classes' ? <Button compact icon="delete-outline" textColor="#B91C1C" onPress={() => remove(item)}>Hapus</Button> : null}
                </View>
              </> : null}
            </Card.Content>
          </Card>
        ))}
      </ScrollView>

      {canCreate && resource !== 'classes' ? <Button mode="contained" icon="plus" onPress={() => openForm()} style={styles.fab}>Tambah {resourceLabels[resource]}</Button> : null}

      <Modal visible={modalVisible} animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalScreen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalHeader}><Text variant="titleLarge" style={styles.modalTitle}>{editingId ? 'Ubah' : 'Tambah'} {resourceLabels[resource]}</Text><TouchableOpacity onPress={() => setModalVisible(false)}><MaterialCommunityIcons name="close" size={26} color="#0F172A" /></TouchableOpacity></View>
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            {renderFields()}
            {resource !== 'employees' && resource !== 'classes' ? <View style={styles.switchRow}><Text style={styles.switchLabel}>Data aktif</Text><Switch value={form.is_active !== false} onValueChange={(value) => setField('is_active', value)} trackColor={{ false: '#CBD5E1', true: '#A7F3D0' }} thumbColor={form.is_active !== false ? '#0E5C44' : '#64748B'} /></View> : null}
            {formError ? <HelperText type="error" visible style={styles.formError}>{formError}</HelperText> : null}
            <Button mode="contained" loading={saving} disabled={saving} onPress={() => void submitForm()} style={styles.saveButton}>Simpan perubahan</Button>
            <Button mode="outlined" disabled={saving} onPress={() => setModalVisible(false)} style={styles.cancelButton}>Batal</Button>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F9FC' },
  content: { padding: 16, paddingBottom: 100 },
  hero: { backgroundColor: '#0E5C44', borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center' },
  heroIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: '#1E8E5A', alignItems: 'center', justifyContent: 'center' },
  heroCopy: { flex: 1, marginLeft: 12 },
  heroEyebrow: { color: '#6EE7B7', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  heroTitle: { color: '#FFFFFF', fontWeight: '800', marginTop: 3 },
  heroSubtitle: { color: '#D1FAE5', fontSize: 11, lineHeight: 16, marginTop: 3 },
  tabs: { gap: 8, paddingVertical: 16 },
  tab: { backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  tabActive: { backgroundColor: '#0E5C44', borderColor: '#0E5C44' },
  tabText: { color: '#64748B', fontSize: 12, fontWeight: '700' },
  tabTextActive: { color: '#FFFFFF' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  search: { flex: 1, height: 48, backgroundColor: '#FFFFFF' },
  searchButton: { borderRadius: 10, backgroundColor: '#0E5C44' },
  error: { backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12, marginBottom: 12 },
  errorText: { color: '#B91C1C', fontSize: 12, lineHeight: 18 },
  loader: { marginVertical: 28 },
  emptyCard: { backgroundColor: '#FFFFFF', borderRadius: 16 },
  emptyTitle: { color: '#0F172A', fontWeight: '800' },
  emptyText: { color: '#64748B', fontSize: 12, marginTop: 4 },
  itemCard: { backgroundColor: '#FFFFFF', borderRadius: 16, marginBottom: 10 },
  itemRow: { flexDirection: 'row', alignItems: 'center' },
  itemIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' },
  itemCopy: { flex: 1, marginLeft: 11 },
  itemTitle: { color: '#0F172A', fontSize: 14, fontWeight: '800' },
  itemMeta: { color: '#64748B', fontSize: 11, marginTop: 4 },
  divider: { marginVertical: 10 },
  itemActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  fab: { position: 'absolute', right: 16, bottom: 16, borderRadius: 14, backgroundColor: '#0E5C44' },
  modalScreen: { flex: 1, backgroundColor: '#F7F9FC' },
  modalHeader: { backgroundColor: '#FFFFFF', padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  modalTitle: { color: '#0F172A', fontWeight: '800' },
  modalContent: { padding: 16, paddingBottom: 40 },
  formInput: { backgroundColor: '#FFFFFF', marginBottom: 10 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 5, marginBottom: 12 },
  switchLabel: { color: '#334155', fontWeight: '700' },
  formError: { paddingHorizontal: 0, marginBottom: 6 },
  saveButton: { backgroundColor: '#0E5C44', borderRadius: 12, marginTop: 4 },
  cancelButton: { borderRadius: 12, marginTop: 10 },
});

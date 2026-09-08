import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Image, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getApiErrorMessage } from '../services/api';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import {
  getProfileImageUrl,
  DEFAULT_STUDENT_BOY_AVATAR,
  DEFAULT_STUDENT_GIRL_AVATAR,
} from '../utils/profile';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CATEGORIES = ['Semua', 'Akademik', 'Perilaku', 'Kedisiplinan', 'Prestasi', 'Konseling', 'Tahfizh', 'Ibadah', 'Kesehatan'];

const formatDate = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
};

const childName = (child: any) => child?.full_name || child?.nama_lengkap || child?.name || 'Siswa';
const childClass = (child: any) => child?.kelas?.nama_kelas || child?.kelas?.name || child?.class_name || 'Kelas belum ditentukan';
const childUnit = (child: any) => child?.kelas?.unit_pendidikan?.name || child?.education_unit?.name || child?.unit_name || child?.unit?.name || 'Unit belum tersedia';

export default function StudentNotesScreen({ route }: any) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 36 : 16);
  const studentScrollRef = useRef<ScrollView>(null);
  const [children, setChildren] = useState<any[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(route?.params?.child_id);
  const [notes, setNotes] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>({ current_page: 1, last_page: 1 });
  const [category, setCategory] = useState('Semua');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [signing, setSigning] = useState(false);

  const loadChildren = useCallback(async () => {
    const targetChildId = route?.params?.child_id;
    const response = await mobileApiService.getPortalChildren();
    const list = unwrapApiData<any[]>(response);
    const safeList = Array.isArray(list) ? list : [];
    const filteredList = targetChildId
      ? safeList.filter((c) => String(c.id) === String(targetChildId))
      : safeList;
    setChildren(filteredList.length > 0 ? filteredList : safeList);
    if (targetChildId) {
      setSelectedChildId((prev) => (prev !== String(targetChildId) ? String(targetChildId) : prev));
    } else if (safeList[0]?.id) {
      setSelectedChildId((prev) => (prev ? prev : String(safeList[0].id)));
    }
  }, [route?.params?.child_id]);

  const loadNotes = useCallback(async (page = 1, append = false) => {
    if (!selectedChildId) return;
    const response = await mobileApiService.getPortalStudentNotes(selectedChildId, page);
    const payload = unwrapApiData<any>(response) || {};
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    setNotes((current) => append ? [...current, ...rows] : rows);
    setMeta(payload);
  }, [selectedChildId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await loadChildren();
      if (selectedChildId) await loadNotes();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Komentar guru belum berhasil dimuat.'));
    } finally {
      setLoading(false);
    }
  }, [loadChildren, loadNotes, selectedChildId]);

  useEffect(() => { void load(); }, [load]);

  const selectChildWithScroll = (id: string, index: number) => {
    setSelectedChildId(id);
    setNotes([]);
    setReplyFor(null);
    const cardWidth = SCREEN_WIDTH - 50;
    const gap = 12;
    studentScrollRef.current?.scrollTo({ x: index * (cardWidth + gap), animated: true });
  };

  const handleStudentScrollEnd = (e: any) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const cardWidth = SCREEN_WIDTH - 50;
    const gap = 12;
    const idx = Math.round(offsetX / (cardWidth + gap));
    if (idx >= 0 && idx < children.length) {
      const child = children[idx];
      if (child && String(child.id) !== selectedChildId) {
        setSelectedChildId(String(child.id));
        setNotes([]);
        setReplyFor(null);
      }
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try { await loadNotes(); } catch (requestError) { setError(getApiErrorMessage(requestError, 'Komentar guru belum berhasil dimuat.')); }
    finally { setRefreshing(false); }
  };

  const loadMore = async () => {
    const current = Number(meta?.current_page || 1);
    const last = Number(meta?.last_page || 1);
    if (loadingMore || current >= last) return;
    setLoadingMore(true);
    try { await loadNotes(current + 1, true); } finally { setLoadingMore(false); }
  };

  const signNote = async (note: any) => {
    if (!selectedChildId) return;
    setSigning(true);
    try {
      await mobileApiService.signPortalStudentNote(String(note.id), selectedChildId, reply);
      setReply('');
      setReplyFor(null);
      await loadNotes();
      Alert.alert('Berhasil', 'Catatan dan persetujuan orang tua berhasil disimpan.');
    } catch (requestError) {
      Alert.alert('Belum berhasil', getApiErrorMessage(requestError, 'Catatan belum berhasil ditandatangani.'));
    } finally { setSigning(false); }
  };

  const filtered = useMemo(() => notes.filter((note) => {
    const matchesCategory = category === 'Semua' || String(note.category || '').toLowerCase() === category.toLowerCase();
    const keyword = search.trim().toLowerCase();
    const teacher = note.teacher?.full_name || '';
    return matchesCategory && (!keyword || [note.title, note.content, teacher].some((value) => String(value || '').toLowerCase().includes(keyword)));
  }), [notes, category, search]);

  return <View style={styles.rootContainer}><View style={styles.sheetContainer}>
    <LinearGradient colors={['#FFFFFF', '#F2FAF6', '#DDF5EB']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill}/>
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 30 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} colors={['#18A165']}/>}>
      {children.length > 0 && (
        <View style={[styles.containerBlock, styles.studentContainerBlock]}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionHeaderTitleWrap}>
              <MaterialCommunityIcons name="account-school" size={18} color="#18A165" />
              <Text style={styles.sectionTitle}>Data Ananda</Text>
            </View>
            {children.length > 1 && (
              <View style={styles.studentCardCountBadge}>
                <Text style={styles.studentCardCountBadgeText}>
                  {Math.max(1, children.findIndex((c) => String(c.id) === selectedChildId) + 1)} dari {children.length} Ananda
                </Text>
              </View>
            )}
          </View>

          <ScrollView
            ref={studentScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={SCREEN_WIDTH - 50 + 12}
            decelerationRate="fast"
            snapToAlignment="start"
            onMomentumScrollEnd={handleStudentScrollEnd}
            style={styles.heroCardScrollContainer}
            contentContainerStyle={styles.heroCardScroll}
          >
            {children.map((child, index) => {
              const isSelected = String(child.id) === selectedChildId;
              const photo = getProfileImageUrl(child);
              const fullName = childName(child);
              const className = childClass(child);
              const unitTitle = childUnit(child);
              const jenjang = child?.kelas?.jenjang || child?.education_unit?.level || 'Terpadu';
              const cardStyle = children.length === 1 ? styles.childCardHeroSizeSingle : styles.childCardHeroSize;

              return (
                <TouchableOpacity
                  key={String(child.id)}
                  activeOpacity={0.88}
                  onPress={() => selectChildWithScroll(String(child.id), index)}
                >
                  <LinearGradient
                    colors={['#0D6B42', '#18A165', '#2BD988']}
                    locations={[0, 0.55, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[cardStyle, !isSelected && { opacity: 0.9 }]}
                  >
                    <View style={styles.cardDecorCircle} />
                    <View style={styles.childHeroTopRow}>
                      <View style={styles.avatarBorderWrapHero}>
                        {photo ? (
                          <Image source={{ uri: photo }} style={styles.childAvatarImgHero} resizeMode="cover" />
                        ) : (
                          <Image
                            source={
                              child?.gender === 'female' ||
                              child?.jenis_kelamin === 'P' ||
                              child?.jenis_kelamin === 'female' ||
                              child?.gender === 'P'
                                ? DEFAULT_STUDENT_GIRL_AVATAR
                                : DEFAULT_STUDENT_BOY_AVATAR
                            }
                            style={styles.childAvatarImgHero}
                            resizeMode="cover"
                          />
                        )}
                      </View>
                      <View style={styles.childInfoCol}>
                        <View style={styles.studentNameBadgeRow}>
                          <Text numberOfLines={1} style={styles.studentFullName}>
                            {fullName}
                          </Text>
                        </View>
                        <Text style={styles.studentNisText}>
                          NIS: {child.nis || '-'} {child.nisn ? `· NISN: ${child.nisn}` : ''}
                        </Text>
                        <View style={styles.studentUnitBadge}>
                          <MaterialCommunityIcons name="school" size={11} color="#FFFFFF" style={{ marginRight: 4 }} />
                          <Text numberOfLines={1} style={styles.studentUnitText}>
                            {unitTitle}
                          </Text>
                        </View>
                      </View>
                      <View style={[styles.selectedActionBtnRight, !isSelected && styles.selectedActionBtnRightInactive]}>
                        <MaterialCommunityIcons name={isSelected ? 'check-circle' : 'gesture-tap'} size={16} color={isSelected ? '#18A165' : '#FFFFFF'} />
                        <Text style={[styles.selectedActionBtnText, !isSelected && styles.selectedActionBtnTextInactive]}>
                          {isSelected ? 'Terpilih' : 'Pilih'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.studentAttributesGrid}>
                      <View style={styles.studentAttrBox}>
                        <View style={styles.studentAttrLabelRow}>
                          <MaterialCommunityIcons name="school" size={13} color="#A7F3D0" style={{ marginRight: 3 }} />
                          <Text style={styles.studentAttrLabel}>Kelas</Text>
                        </View>
                        <Text numberOfLines={1} style={styles.studentAttrValue}>
                          {className || '—'}
                        </Text>
                      </View>
                      <View style={styles.studentAttrDivider} />
                      <View style={styles.studentAttrBox}>
                        <View style={styles.studentAttrLabelRow}>
                          <MaterialCommunityIcons name="domain" size={13} color="#A7F3D0" style={{ marginRight: 3 }} />
                          <Text style={styles.studentAttrLabel}>Jenjang</Text>
                        </View>
                        <Text numberOfLines={1} style={styles.studentAttrValue}>
                          {jenjang}
                        </Text>
                      </View>
                      <View style={styles.studentAttrDivider} />
                      <View style={styles.studentAttrBox}>
                        <View style={styles.studentAttrLabelRow}>
                          <MaterialCommunityIcons name="account-group" size={13} color="#A7F3D0" style={{ marginRight: 3 }} />
                          <Text style={styles.studentAttrLabel}>Presensi</Text>
                        </View>
                        <View style={styles.studentPresensiValueRow}>
                          <Text numberOfLines={1} style={[styles.studentAttrValue, { color: '#DEF7EC' }]}>
                            Hadir
                          </Text>
                          <View style={styles.presensiGreenDot} />
                        </View>
                      </View>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {children.length > 1 && (
            <View style={styles.paginationDotsRow}>
              {children.map((child, index) => (
                <TouchableOpacity
                  key={String(child.id)}
                  onPress={() => selectChildWithScroll(String(child.id), index)}
                  style={[styles.paginationDot, String(child.id) === selectedChildId && styles.paginationDotActive]}
                />
              ))}
            </View>
          )}
        </View>
      )}

      <View style={styles.containerBlock}>
        <View style={styles.sectionHeader}><MaterialCommunityIcons name="comment-text-multiple-outline" size={19} color="#18A165"/><View><Text style={styles.sectionTitle}>Komentar & Catatan Guru</Text><Text style={styles.sectionSub}>Catatan resmi yang dibagikan guru kepada orang tua.</Text></View></View>
        <View style={styles.searchBox}><MaterialCommunityIcons name="magnify" size={20} color="#94A3B8"/><TextInput value={search} onChangeText={setSearch} placeholder="Cari catatan atau nama guru..." placeholderTextColor="#94A3B8" style={styles.searchInput}/></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{CATEGORIES.map((item) => <TouchableOpacity key={item} onPress={() => setCategory(item)} style={[styles.filter, category === item && styles.filterActive]}><Text style={[styles.filterText, category === item && styles.filterTextActive]}>{item}</Text></TouchableOpacity>)}</ScrollView>
      </View>

      {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}
      {loading ? <ActivityIndicator color="#18A165" style={{ marginVertical: 36 }}/> : filtered.length === 0 ? <View style={styles.empty}><MaterialCommunityIcons name="comment-alert-outline" size={38} color="#CBD5E1"/><Text style={styles.emptyTitle}>Belum Ada Komentar</Text><Text style={styles.emptyText}>Belum ada catatan guru yang dipublikasikan untuk kategori ini.</Text></View> : filtered.map((note) => {
        const status = note.signature_status || 'unsigned';
        const signed = status === 'signed';
        return <View key={String(note.id)} style={styles.noteCard}>
          <View style={styles.noteHead}><View style={styles.teacherIcon}><MaterialCommunityIcons name="account-tie-outline" size={21} color="#047857"/></View><View style={{ flex: 1 }}><Text style={styles.teacherName}>{note.teacher?.full_name || 'Guru Pengampu'}</Text><Text style={styles.noteDate}>{formatDate(note.date || note.created_at)}</Text></View><View style={styles.categoryBadge}><Text style={styles.categoryText}>{note.category || '-'}</Text></View></View>
          <Text style={styles.noteTitle}>{note.title || 'Catatan Guru'}</Text><Text style={styles.noteContent}>{note.content || '-'}</Text>
          {note.follow_up ? <View style={styles.followUp}><Text style={styles.followUpLabel}>Tindak lanjut orang tua</Text><Text style={styles.followUpText}>{note.follow_up}</Text></View> : null}
          <View style={styles.noteFooter}><View style={[styles.statusBadge, signed ? styles.signed : status === 'signed_updated' ? styles.stale : styles.unsigned]}><MaterialCommunityIcons name={signed ? 'check-decagram' : status === 'signed_updated' ? 'alert-decagram' : 'draw-pen'} size={15} color={signed ? '#047857' : status === 'signed_updated' ? '#B45309' : '#475569'}/><Text style={styles.statusText}>{signed ? 'Sudah ditandatangani' : status === 'signed_updated' ? 'Perlu tanda tangan ulang' : 'Belum ditandatangani'}</Text></View>{!signed && <TouchableOpacity onPress={() => { setReplyFor(String(note.id)); setReply(note.follow_up || ''); }} style={styles.signButton}><Text style={styles.signButtonText}>Tanggapi & Tanda Tangan</Text></TouchableOpacity>}</View>
          {replyFor === String(note.id) && <View style={styles.replyBox}><TextInput value={reply} onChangeText={setReply} multiline maxLength={5000} placeholder="Tulis tindak lanjut orang tua (opsional)..." placeholderTextColor="#94A3B8" style={styles.replyInput}/><View style={styles.replyActions}><TouchableOpacity disabled={signing} onPress={() => { setReplyFor(null); setReply(''); }} style={styles.cancelButton}><Text style={styles.cancelText}>Batal</Text></TouchableOpacity><TouchableOpacity disabled={signing} onPress={() => void signNote(note)} style={styles.confirmButton}>{signing ? <ActivityIndicator size="small" color="#FFF"/> : <Text style={styles.confirmText}>Setujui & Tanda Tangan</Text>}</TouchableOpacity></View></View>}
        </View>;
      })}
      {Number(meta?.current_page || 1) < Number(meta?.last_page || 1) && <TouchableOpacity disabled={loadingMore} onPress={() => void loadMore()} style={styles.moreButton}>{loadingMore ? <ActivityIndicator color="#047857"/> : <Text style={styles.moreText}>Muat komentar berikutnya</Text>}</TouchableOpacity>}
    </ScrollView>
  </View></View>;
}

const styles = StyleSheet.create({
  rootContainer: { flex: 1, backgroundColor: '#FFFFFF' },
  sheetContainer: { flex: 1, overflow: 'hidden' },
  screen: { flex: 1 },
  content: { padding: 16, gap: 14 },
  containerBlock: { backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 20, borderWidth: 1, borderColor: '#DDEBE4', padding: 14 },
  studentContainerBlock: { marginBottom: 10, backgroundColor: 'transparent', borderWidth: 0, padding: 0 },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionHeaderTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  studentCardCountBadge: {
    backgroundColor: '#EBF8F2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  studentCardCountBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#084835',
  },
  heroCardScrollContainer: {
    marginHorizontal: -16,
  },
  heroCardScroll: {
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 4,
  },
  childCardHeroSize: {
    width: SCREEN_WIDTH - 50,
    minHeight: 148,
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#0D6B42',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  childCardHeroSizeSingle: {
    width: '100%',
    minHeight: 148,
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#0D6B42',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  childCardHeroSizeInactive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    shadowOpacity: 0.06,
    elevation: 2,
  },
  cardDecorCircle: {
    position: 'absolute',
    top: -24,
    right: -24,
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    zIndex: 0,
  },
  childHeroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1,
  },
  avatarBorderWrapHero: {
    width: 62,
    height: 62,
    borderRadius: 22,
    borderWidth: 2.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  avatarBorderWrapHeroInactive: {
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
  childAvatarImgHero: {
    width: '100%',
    height: '100%',
  },
  avatarInitialText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#084835',
  },
  childInfoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  studentNameBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  studentFullName: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  studentNisText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '600',
    marginTop: 1,
  },
  childNameHero: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  childSubInfoHero: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 1,
    fontWeight: '600',
  },
  studentUnitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 3,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  studentUnitBadgeInactive: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  studentUnitText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    maxWidth: SCREEN_WIDTH - 220,
  },
  selectedActionBtnRight: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
    marginLeft: 8,
    minWidth: 46,
  },
  selectedActionBtnRightInactive: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    elevation: 0,
  },
  selectedActionBtnText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#18A165',
    marginTop: 2,
  },
  selectedActionBtnTextInactive: {
    color: '#FFFFFF',
  },
  studentAttributesGrid: {
    flexDirection: 'row',
    backgroundColor: 'rgba(4, 47, 30, 0.35)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginTop: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: 1,
  },
  studentAttributesGridInactive: {
    backgroundColor: 'rgba(4, 47, 30, 0.35)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  studentAttrBox: {
    flex: 1,
    alignItems: 'center',
  },
  studentAttrLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  studentAttrLabel: {
    fontSize: 9.5,
    color: '#A7F3D0',
    fontWeight: '700',
  },
  studentAttrValue: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  studentPresensiValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  presensiGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34D399',
  },
  studentAttrDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  inactiveText: {
    color: '#0F172A',
  },
  inactiveSubText: {
    color: '#64748B',
  },
  paginationDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  paginationDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#CBD5E1',
  },
  paginationDotActive: {
    width: 16,
    backgroundColor: '#18A165',
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 12 },
  sectionSub: { fontSize: 10.5, color: '#64748B', marginTop: 2 },
  searchBox: { flexDirection: 'row', alignItems: 'center', height: 42, borderRadius: 13, paddingHorizontal: 12, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
  searchInput: { flex: 1, color: '#0F172A', fontSize: 12, marginLeft: 7 },
  filters: { gap: 7, paddingTop: 11 },
  filter: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: '#F1F5F9' },
  filterActive: { backgroundColor: '#0E5C44' },
  filterText: { fontSize: 10.5, fontWeight: '800', color: '#64748B' },
  filterTextActive: { color: '#FFF' },
  errorBox: { borderRadius: 14, padding: 12, backgroundColor: '#FFF1F2', borderWidth: 1, borderColor: '#FECDD3' },
  errorText: { color: '#BE123C', fontSize: 11 },
  empty: { alignItems: 'center', borderRadius: 20, padding: 34, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DDEBE4' },
  emptyTitle: { fontSize: 14, fontWeight: '900', color: '#334155', marginTop: 8 },
  emptyText: { fontSize: 11, color: '#94A3B8', textAlign: 'center', marginTop: 4 },
  noteCard: { borderRadius: 20, padding: 15, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DDEBE4' },
  noteHead: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingBottom: 11, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  teacherIcon: { width: 39, height: 39, borderRadius: 12, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' },
  teacherName: { fontSize: 12, fontWeight: '900', color: '#0F172A' },
  noteDate: { fontSize: 9.5, color: '#94A3B8', marginTop: 2 },
  categoryBadge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: '#D1FAE5' },
  categoryText: { color: '#047857', fontSize: 9.5, fontWeight: '900' },
  noteTitle: { fontSize: 14, fontWeight: '900', color: '#0F172A', marginTop: 13 },
  noteContent: { fontSize: 12, lineHeight: 19, color: '#475569', marginTop: 7 },
  followUp: { backgroundColor: '#F8FAFC', borderRadius: 11, padding: 10, marginTop: 11 },
  followUpLabel: { fontSize: 9.5, fontWeight: '900', color: '#64748B', textTransform: 'uppercase' },
  followUpText: { fontSize: 11, lineHeight: 17, color: '#334155', marginTop: 4 },
  noteFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 14 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 6, flexShrink: 1 },
  signed: { backgroundColor: '#D1FAE5' },
  stale: { backgroundColor: '#FEF3C7' },
  unsigned: { backgroundColor: '#F1F5F9' },
  statusText: { fontSize: 9, fontWeight: '800', color: '#475569' },
  signButton: { backgroundColor: '#0E5C44', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8 },
  signButtonText: { color: '#FFF', fontSize: 9.5, fontWeight: '900' },
  replyBox: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  replyInput: { minHeight: 84, borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1', padding: 11, fontSize: 11, color: '#0F172A', textAlignVertical: 'top' },
  replyActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 9 },
  cancelButton: { borderRadius: 9, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: '#F1F5F9' },
  cancelText: { color: '#475569', fontSize: 10, fontWeight: '800' },
  confirmButton: { minWidth: 144, alignItems: 'center', borderRadius: 9, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: '#18A165' },
  confirmText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  moreButton: { alignItems: 'center', borderRadius: 13, padding: 13, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#A7F3D0' },
  moreText: { color: '#047857', fontSize: 11, fontWeight: '900' },
});

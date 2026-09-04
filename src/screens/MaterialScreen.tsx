import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { isParentRole } from '../utils/roles';
import { getProfileImageUrl } from '../utils/profile';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Child = Record<string, any>;
type MaterialItem = Record<string, any>;

export default function MaterialScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 36 : 16);
  const user = useAuthStore((state) => state.user);
  const isParent = isParentRole(user?.roles || []);

  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(route?.params?.child_id);
  const studentScrollRef = useRef<ScrollView>(null);

  // States
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [studentInfo, setStudentInfo] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('all');
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialItem | null>(null);
  const [activeAttachment, setActiveAttachment] = useState<any>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);

  // 1. Fetch children
  const loadChildren = useCallback(async () => {
    if (!isParent) return;
    try {
      const res = await mobileApiService.getPortalChildren();
      const list = unwrapApiData<Child[]>(res) || [];
      setChildren(list);
      if (list.length > 0 && !selectedChildId) {
        setSelectedChildId(String(list[0].id));
      }
    } catch {
      // safe fallback
    }
  }, [isParent, selectedChildId]);

  useEffect(() => {
    void loadChildren();
  }, [loadChildren]);

  // 2. Fetch materials
  const loadMaterials = useCallback(async () => {
    try {
      const params: Record<string, any> = {
        child_id: selectedChildId,
        search: searchQuery.trim() || undefined,
        subject_id: selectedSubjectId === 'all' ? undefined : selectedSubjectId,
      };

      const res = await mobileApiService.getPortalMaterials(params);
      const data = unwrapApiData<any>(res) || {};
      const list = Array.isArray(data?.data) ? data.data : Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      setMaterials(list);
      if (res?.student || data?.student) {
        setStudentInfo(res?.student || data?.student);
      }
    } catch {
      setMaterials([]);
    }
  }, [selectedChildId, searchQuery, selectedSubjectId]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await loadMaterials();
    setLoading(false);
  }, [loadMaterials]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMaterials();
    setRefreshing(false);
  };

  // Scroll handlers for auto-color swipe
  const handleStudentScrollEnd = (e: any) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const cardWidth = SCREEN_WIDTH - 32 + 12;
    const index = Math.round(offsetX / cardWidth);
    if (index >= 0 && index < children.length) {
      const targetChild = children[index];
      if (targetChild && String(targetChild.id) !== selectedChildId) {
        setSelectedChildId(String(targetChild.id));
      }
    }
  };

  const selectChildWithScroll = (childId: string, index: number) => {
    setSelectedChildId(childId);
    studentScrollRef.current?.scrollTo({
      x: index * (SCREEN_WIDTH - 32 + 12),
      animated: true,
    });
  };

  // Extract unique subjects for filtering
  const subjectsList = useMemo(() => {
    const map = new Map<string, string>();
    materials.forEach((m) => {
      if (m.subject?.id && m.subject?.name) {
        map.set(String(m.subject.id), m.subject.name);
      } else if (m.subject?.nama_mapel) {
        map.set(String(m.mata_pelajaran_id || m.subject?.id), m.subject.nama_mapel);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [materials]);

  // Tampilkan berkas lampiran langsung di dalam aplikasi (In-App Modal Viewer)
  const handleOpenMedia = (mediaItem: any) => {
    if (!mediaItem) {
      Alert.alert('Informasi', 'Tautan berkas lampiran tidak tersedia.');
      return;
    }
    setActiveAttachment(mediaItem);
    setIsPlayingAudio(false);
  };

  const handleOpenExternal = async (url?: string) => {
    if (!url) {
      Alert.alert('Informasi', 'Tautan berkas tidak tersedia.');
      return;
    }
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Gagal', 'Tautan tidak dapat dibuka di perangkat ini.');
      }
    } catch {
      Alert.alert('Gagal', 'Tidak dapat membuka tautan eksternal.');
    }
  };

  return (
    <View style={styles.rootContainer}>
      <View style={styles.sheetContainer}>
        <LinearGradient
          colors={['#FFFFFF', '#F2FAF6', '#DDF5EB']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {loading && !refreshing ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color="#18A165" />
            <Text style={styles.loadingText}>Memuat materi pembelajaran...</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.screen}
            contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 30 }]}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#18A165']} />
            }
          >
          {/* 1. CONTAINER DATA SISWA & UNIT PENDIDIKAN */}
          {children.length > 0 ? (
            <View style={styles.containerBlock}>
              <View style={styles.sectionHeaderRow}>
                <MaterialCommunityIcons name="account-school" size={18} color="#18A165" />
                <Text style={styles.sectionTitle}>Data Siswa & Unit Pendidikan</Text>
              </View>

              <ScrollView
                ref={studentScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={SCREEN_WIDTH - 32 + 12}
                decelerationRate="fast"
                onMomentumScrollEnd={handleStudentScrollEnd}
                onScrollEndDrag={handleStudentScrollEnd}
                contentContainerStyle={styles.heroCardScroll}
              >
                {children.map((child, idx) => {
                  const isSelected = String(child.id) === selectedChildId;
                  const childFullName = child.full_name || child.nama_lengkap || child.name || 'Siswa';
                  const unitTitle = child.education_unit?.name || child.unit_name || 'Unit Sekolah';
                  const className = child.kelas?.name || child.kelas?.nama_kelas || child.classroom?.name || '';
                  const avatarUri =
                    getProfileImageUrl(child) ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(childFullName)}&background=${isSelected ? 'FFFFFF' : '18A165'}&color=${isSelected ? '18A165' : 'FFFFFF'}&bold=true&size=128`;

                  return (
                    <TouchableOpacity
                      key={String(child.id)}
                      activeOpacity={0.88}
                      onPress={() => selectChildWithScroll(String(child.id), idx)}
                      style={[styles.childCardHeroSize, isSelected && styles.childCardHeroSizeActive]}
                    >
                      <View style={styles.childHeroTopRow}>
                        <View style={[styles.avatarBorderWrapHero, isSelected && styles.avatarBorderWrapHeroActive]}>
                          <Image
                            source={{ uri: avatarUri }}
                            style={styles.childAvatarImgHero}
                            resizeMode="cover"
                          />
                        </View>
                        <View style={{ flex: 1, marginLeft: 14 }}>
                          <View style={styles.childHeroTitleRow}>
                            <Text numberOfLines={1} style={[styles.childNameHero, isSelected && styles.childTextActive]}>
                              {childFullName}
                            </Text>
                            <View style={[styles.childStatusBadgeHero, isSelected && styles.childStatusBadgeHeroActive]}>
                              <MaterialCommunityIcons
                                name={isSelected ? 'check-circle' : 'gesture-tap'}
                                size={12}
                                color={isSelected ? '#FFFFFF' : '#059669'}
                              />
                              <Text style={[styles.childStatusBadgeTextHero, isSelected && styles.childStatusBadgeTextHeroActive]}>
                                {isSelected ? 'Terpilih' : 'Pilih'}
                              </Text>
                            </View>
                          </View>
                          <Text numberOfLines={1} style={[styles.childClassHero, isSelected && styles.childTextActive]}>
                            {className ? `${className} · ${unitTitle}` : unitTitle}
                          </Text>
                          <Text style={[styles.childSubInfoHero, isSelected && styles.childSubInfoHeroActive]}>
                            {child.nis ? `NIS: ${child.nis} · ` : ''}Materi Pembelajaran Aktif
                          </Text>
                        </View>
                      </View>

                      <View style={[styles.childCardBottomBar, isSelected && styles.childCardBottomBarActive]}>
                        <View style={[styles.childInfoPill, isSelected && styles.childInfoPillActive]}>
                          <MaterialCommunityIcons
                            name="school-outline"
                            size={12}
                            color={isSelected ? '#FFFFFF' : '#18A165'}
                          />
                          <Text numberOfLines={1} style={[styles.childInfoPillText, isSelected && styles.childTextActive]}>
                            {unitTitle}
                          </Text>
                        </View>

                        <View style={[styles.childInfoPill, isSelected && styles.childInfoPillActive]}>
                          <MaterialCommunityIcons
                            name="badge-account-outline"
                            size={12}
                            color={isSelected ? '#FFFFFF' : '#18A165'}
                          />
                          <Text numberOfLines={1} style={[styles.childInfoPillText, isSelected && styles.childTextActive]}>
                            {child.nis ? `NIS: ${child.nis}` : 'Terdaftar Aktif'}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* DOT INDIKATOR SCROLL SISWA */}
              {children.length > 1 && (
                <View style={styles.paginationDotsRow}>
                  {children.map((c, i) => {
                    const isDotActive = String(c.id) === selectedChildId;
                    return (
                      <TouchableOpacity
                        key={String(c.id || i)}
                        onPress={() => selectChildWithScroll(String(c.id), i)}
                        style={[
                          styles.paginationDot,
                          isDotActive && styles.paginationDotActive,
                        ]}
                      />
                    );
                  })}
                </View>
              )}
            </View>
          ) : studentInfo ? (
            <View style={styles.containerBlock}>
              <View style={styles.sectionHeaderRow}>
                <MaterialCommunityIcons name="account-school" size={18} color="#18A165" />
                <Text style={styles.sectionTitle}>Data Siswa & Unit Pendidikan</Text>
              </View>

              {(() => {
                const s = studentInfo;
                const studentName = s.name || 'Siswa Aktif';
                const studentClass = s.class || '';
                const studentUnit = s.unit || '';
                const avatarUri =
                  getProfileImageUrl(s) ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(studentName)}&background=FFFFFF&color=18A165&bold=true&size=128`;

                return (
                  <View style={[styles.childCardHeroSize, styles.childCardHeroSizeActive]}>
                    <View style={styles.childHeroTopRow}>
                      <View style={[styles.avatarBorderWrapHero, styles.avatarBorderWrapHeroActive]}>
                        <Image
                          source={{ uri: avatarUri }}
                          style={styles.childAvatarImgHero}
                          resizeMode="cover"
                        />
                      </View>
                      <View style={{ flex: 1, marginLeft: 14 }}>
                        <View style={styles.childHeroTitleRow}>
                          <Text numberOfLines={1} style={[styles.childNameHero, styles.childTextActive]}>
                            {studentName}
                          </Text>
                          <View style={[styles.childStatusBadgeHero, styles.childStatusBadgeHeroActive]}>
                            <MaterialCommunityIcons name="check-circle" size={12} color="#FFFFFF" />
                            <Text style={[styles.childStatusBadgeTextHero, styles.childStatusBadgeTextHeroActive]}>
                              Siswa
                            </Text>
                          </View>
                        </View>
                        <Text numberOfLines={1} style={[styles.childClassHero, styles.childTextActive]}>
                          {studentClass ? `${studentClass} · ${studentUnit}` : (studentUnit || 'Siswa Terdaftar')}
                        </Text>
                        <Text style={[styles.childSubInfoHero, styles.childSubInfoHeroActive]}>
                          {s.nis ? `NIS: ${s.nis} · ` : ''}Katalog Materi Pembelajaran
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.childCardBottomBar, styles.childCardBottomBarActive]}>
                      <View style={[styles.childInfoPill, styles.childInfoPillActive]}>
                        <MaterialCommunityIcons name="school-outline" size={12} color="#FFFFFF" />
                        <Text style={[styles.childInfoPillText, styles.childTextActive]}>
                          {studentUnit || 'Unit Sekolah'}
                        </Text>
                      </View>
                      <View style={[styles.childInfoPill, styles.childInfoPillActive]}>
                        <MaterialCommunityIcons name="badge-account-outline" size={12} color="#FFFFFF" />
                        <Text style={[styles.childInfoPillText, styles.childTextActive]}>
                          {s.nis ? `NIS: ${s.nis}` : 'Terdaftar Aktif'}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })()}
            </View>
          ) : user ? (
            <View style={styles.containerBlock}>
              <View style={styles.sectionHeaderRow}>
                <MaterialCommunityIcons name="account-school" size={18} color="#18A165" />
                <Text style={styles.sectionTitle}>Data Pengguna & Unit Pendidikan</Text>
              </View>

              {(() => {
                const userName = String(user?.name || user?.full_name || user?.nama_lengkap || 'Pengguna');
                const userRole = typeof user?.role === 'string' ? user.role : (Array.isArray(user?.roles) && user.roles[0] ? String(user.roles[0]) : 'Siswa');
                const avatarUri =
                  getProfileImageUrl(user) ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=FFFFFF&color=18A165&bold=true&size=128`;

                return (
                  <View style={[styles.childCardHeroSize, styles.childCardHeroSizeActive]}>
                    <View style={styles.childHeroTopRow}>
                      <View style={[styles.avatarBorderWrapHero, styles.avatarBorderWrapHeroActive]}>
                        <Image
                          source={{ uri: avatarUri }}
                          style={styles.childAvatarImgHero}
                          resizeMode="cover"
                        />
                      </View>
                      <View style={{ flex: 1, marginLeft: 14 }}>
                        <View style={styles.childHeroTitleRow}>
                          <Text numberOfLines={1} style={[styles.childNameHero, styles.childTextActive]}>
                            {userName}
                          </Text>
                          <View style={[styles.childStatusBadgeHero, styles.childStatusBadgeHeroActive]}>
                            <MaterialCommunityIcons name="check-circle" size={12} color="#FFFFFF" />
                            <Text style={[styles.childStatusBadgeTextHero, styles.childStatusBadgeTextHeroActive]}>
                              {userRole}
                            </Text>
                          </View>
                        </View>
                        <Text numberOfLines={1} style={[styles.childClassHero, styles.childTextActive]}>
                          Portal Terpadu Mahad Abu Ja'far
                        </Text>
                        <Text style={[styles.childSubInfoHero, styles.childSubInfoHeroActive]}>
                          Katalog Materi Terpadu
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.childCardBottomBar, styles.childCardBottomBarActive]}>
                      <View style={[styles.childInfoPill, styles.childInfoPillActive]}>
                        <MaterialCommunityIcons name="school-outline" size={12} color="#FFFFFF" />
                        <Text style={[styles.childInfoPillText, styles.childTextActive]}>
                          Mahad Abu Ja'far
                        </Text>
                      </View>
                      <View style={[styles.childInfoPill, styles.childInfoPillActive]}>
                        <MaterialCommunityIcons name="badge-account-outline" size={12} color="#FFFFFF" />
                        <Text style={[styles.childInfoPillText, styles.childTextActive]}>
                          Akun Terverifikasi
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })()}
            </View>
          ) : null}

          {/* 2. SEARCH BAR & FILTER SUBJECT */}
          <View style={styles.searchFilterBlock}>
            <View style={styles.searchBar}>
              <MaterialCommunityIcons name="magnify" size={20} color="#64748B" />
              <TextInput
                placeholder="Cari materi atau mata pelajaran..."
                placeholderTextColor="#94A3B8"
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={styles.searchInput}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            {subjectsList.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subjectChipsRow}>
                <TouchableOpacity
                  onPress={() => setSelectedSubjectId('all')}
                  style={[styles.subjectChip, selectedSubjectId === 'all' && styles.subjectChipActive]}
                >
                  <Text style={[styles.subjectChipText, selectedSubjectId === 'all' && styles.subjectChipTextActive]}>
                    Semua Mapel ({materials.length})
                  </Text>
                </TouchableOpacity>
                {subjectsList.map((sub) => (
                  <TouchableOpacity
                    key={sub.id}
                    onPress={() => setSelectedSubjectId(sub.id)}
                    style={[styles.subjectChip, selectedSubjectId === sub.id && styles.subjectChipActive]}
                  >
                    <Text style={[styles.subjectChipText, selectedSubjectId === sub.id && styles.subjectChipTextActive]}>
                      {sub.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          {/* 3. CONTAINER DAFTAR MATERI */}
          <View style={styles.containerBlock}>
            <View style={styles.sectionHeaderRow}>
              <MaterialCommunityIcons name="book-open-page-variant-outline" size={18} color="#18A165" />
              <Text style={styles.sectionTitle}>
                Daftar Materi Pembelajaran ({materials.length})
              </Text>
            </View>

            {materials.length === 0 ? (
              <View style={styles.emptyCard}>
                <MaterialCommunityIcons name="book-outline" size={48} color="#94A3B8" />
                <Text style={styles.emptyTitle}>Belum Ada Materi</Text>
                <Text style={styles.emptyDesc}>
                  Materi pembelajaran untuk kelas dan kurikulum ini belum dipublikasikan oleh dewan guru.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {materials.map((item, idx) => {
                  const subjectName = item.subject?.name || item.subject?.nama_mapel || 'Pelajaran';
                  const teacherName = item.guru?.nama_lengkap || item.teacher?.name || 'Dewan Guru';
                  const mediaCount = Array.isArray(item.media) ? item.media.length : 0;
                  const hasPdf = item.media?.some((m: any) => m.tipe_file === 'pdf');
                  const hasVideo = item.media?.some((m: any) => m.tipe_file === 'video');
                  const hasAudio = item.media?.some((m: any) => m.tipe_file === 'audio');

                  return (
                    <TouchableOpacity
                      key={item.id || idx}
                      activeOpacity={0.88}
                      onPress={() => setSelectedMaterial(item)}
                      style={styles.materialCard}
                    >
                      <View style={styles.materialCardHeader}>
                        <View style={styles.subjectBadge}>
                          <Text style={styles.subjectBadgeText}>{subjectName}</Text>
                        </View>
                        <Text style={styles.materialDateText}>
                          {item.created_at ? new Date(item.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : 'Terbaru'}
                        </Text>
                      </View>

                      <Text numberOfLines={2} style={styles.materialTitle}>
                        {item.judul || item.title || 'Materi Pembelajaran'}
                      </Text>

                      <Text numberOfLines={2} style={styles.materialSnippet}>
                        {item.konten || item.isi || item.deskripsi || 'Pembahasan materi pembelajaran terpadu.'}
                      </Text>

                      <View style={styles.materialFooter}>
                        <View style={styles.teacherInfoRow}>
                          <MaterialCommunityIcons name="account-tie" size={14} color="#64748B" />
                          <Text numberOfLines={1} style={styles.teacherNameText}>{teacherName}</Text>
                        </View>

                        <View style={styles.mediaPillsRow}>
                          {hasPdf && (
                            <View style={[styles.mediaPill, { backgroundColor: '#FEE2E2' }]}>
                              <MaterialCommunityIcons name="file-pdf-box" size={13} color="#EF4444" />
                              <Text style={[styles.mediaPillText, { color: '#B91C1C' }]}>PDF</Text>
                            </View>
                          )}
                          {hasVideo && (
                            <View style={[styles.mediaPill, { backgroundColor: '#FFEDD5' }]}>
                              <MaterialCommunityIcons name="youtube" size={13} color="#EA580C" />
                              <Text style={[styles.mediaPillText, { color: '#C2410C' }]}>Video</Text>
                            </View>
                          )}
                          {hasAudio && (
                            <View style={[styles.mediaPill, { backgroundColor: '#F3E8FF' }]}>
                              <MaterialCommunityIcons name="headphones" size={13} color="#9333EA" />
                              <Text style={[styles.mediaPillText, { color: '#7E22CE' }]}>Audio</Text>
                            </View>
                          )}
                          {mediaCount === 0 && (
                            <View style={[styles.mediaPill, { backgroundColor: '#F1F5F9' }]}>
                              <MaterialCommunityIcons name="text-box-outline" size={13} color="#64748B" />
                              <Text style={[styles.mediaPillText, { color: '#475569' }]}>Ringkasan</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* DETAIL MATERI MODAL */}
      <Modal
        visible={!!selectedMaterial}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedMaterial(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: Math.max(bottomInset, 36) + 16 }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <View style={styles.subjectBadge}>
                  <Text style={styles.subjectBadgeText}>
                    {selectedMaterial?.subject?.name || selectedMaterial?.subject?.nama_mapel || 'Pelajaran'}
                  </Text>
                </View>
                <Text style={styles.modalTitle}>
                  {selectedMaterial?.judul || selectedMaterial?.title}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedMaterial(null)}
                style={styles.modalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <View style={styles.modalTeacherBox}>
                <MaterialCommunityIcons name="account-tie-outline" size={20} color="#18A165" />
                <View style={{ marginLeft: 8 }}>
                  <Text style={styles.modalTeacherTitle}>
                    {selectedMaterial?.guru?.nama_lengkap || selectedMaterial?.teacher?.name || 'Dewan Guru'}
                  </Text>
                  <Text style={styles.modalTeacherSub}>
                    {selectedMaterial?.guru?.jabatan?.nama_jabatan || 'Guru Pengampu'}
                  </Text>
                </View>
              </View>

              <Text style={styles.modalSectionHeading}>Deskripsi / Isi Materi</Text>
              <Text style={styles.modalText}>
                {selectedMaterial?.konten || selectedMaterial?.isi || selectedMaterial?.deskripsi || 'Tidak ada konten deskripsi tertulis.'}
              </Text>

              {Array.isArray(selectedMaterial?.media) && selectedMaterial.media.length > 0 && (
                <View style={{ marginTop: 16 }}>
                  <Text style={styles.modalSectionHeading}>Lampiran Media & Berkas ({selectedMaterial.media.length})</Text>
                  <View style={{ gap: 8, marginTop: 8 }}>
                    {selectedMaterial.media.map((med: any, mIdx: number) => {
                      const isPdf = med.tipe_file === 'pdf';
                      const isVideo = med.tipe_file === 'video';
                      const iconName = isPdf ? 'file-pdf-box' : isVideo ? 'play-circle-outline' : 'headphones';
                      const iconColor = isPdf ? '#EF4444' : isVideo ? '#EA580C' : '#9333EA';

                      return (
                        <TouchableOpacity
                          key={med.id || mIdx}
                          activeOpacity={0.8}
                          onPress={() => handleOpenMedia(med)}
                          style={styles.attachmentItem}
                        >
                          <MaterialCommunityIcons name={iconName} size={24} color={iconColor} />
                          <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text numberOfLines={1} style={styles.attachmentName}>
                              {med.nama_file || 'Lampiran Berkas'}
                            </Text>
                            <Text style={styles.attachmentDesc}>
                              {med.deskripsi || (isPdf ? 'Dokumen PDF' : isVideo ? 'Video Pembelajaran' : 'Audio Podcast')}
                            </Text>
                          </View>
                          <View style={styles.openInAppBadge}>
                            <MaterialCommunityIcons name="eye-outline" size={14} color="#18A165" />
                            <Text style={styles.openInAppText}>Lihat</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
            </ScrollView>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setSelectedMaterial(null)}
              style={[styles.modalDismissBtn, { marginBottom: Platform.OS === 'android' ? 10 : 4 }]}
            >
              <Text style={styles.modalDismissBtnText}>Tutup Materi</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* IN-APP ATTACHMENT VIEWER MODAL */}
      <Modal
        visible={!!activeAttachment}
        animationType="slide"
        transparent
        onRequestClose={() => setActiveAttachment(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: Math.max(bottomInset, 36) + 16, maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <View style={[styles.subjectBadge, {
                  backgroundColor: activeAttachment?.tipe_file === 'pdf' ? '#FEE2E2' : activeAttachment?.tipe_file === 'video' ? '#FFEDD5' : '#F3E8FF',
                  borderColor: activeAttachment?.tipe_file === 'pdf' ? '#FECACA' : activeAttachment?.tipe_file === 'video' ? '#FED7AA' : '#E9D5FF'
                }]}>
                  <Text style={[styles.subjectBadgeText, {
                    color: activeAttachment?.tipe_file === 'pdf' ? '#DC2626' : activeAttachment?.tipe_file === 'video' ? '#EA580C' : '#9333EA'
                  }]}>
                    {activeAttachment?.tipe_file === 'pdf' ? 'DOKUMEN PDF LENGKAP' : activeAttachment?.tipe_file === 'video' ? 'VIDEO PEMBELAJARAN' : 'AUDIO KAJIAN & PODCAST'}
                  </Text>
                </View>
                <Text numberOfLines={2} style={styles.modalTitle}>
                  {activeAttachment?.nama_file || 'Lampiran Berkas'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setActiveAttachment(null)}
                style={styles.modalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* JIKA BERKAS PDF */}
              {activeAttachment?.tipe_file === 'pdf' && (
                <View style={styles.inAppViewerContainer}>
                  <View style={styles.pdfHeroBox}>
                    <View style={styles.pdfIconCircle}>
                      <MaterialCommunityIcons name="file-pdf-box" size={42} color="#DC2626" />
                    </View>
                    <Text style={styles.pdfHeroTitle}>{activeAttachment?.nama_file || 'Dokumen Panduan PDF'}</Text>
                    <Text style={styles.pdfHeroSize}>
                      {activeAttachment?.ukuran_bytes ? `Ukuran Berkas: ${(activeAttachment.ukuran_bytes / (1024 * 1024)).toFixed(2)} MB` : 'Format Dokumen Terverifikasi SIT'}
                    </Text>
                  </View>

                  <View style={styles.inAppPreviewCard}>
                    <View style={styles.inAppPreviewHeader}>
                      <MaterialCommunityIcons name="text-box-search-outline" size={18} color="#18A165" />
                      <Text style={styles.inAppPreviewHeading}>Ringkasan Dokumen & Panduan:</Text>
                    </View>
                    <Text style={styles.inAppPreviewText}>
                      {activeAttachment?.deskripsi || 'Dokumen panduan materi lengkap beserta latihan soal terpadu untuk pembelajaran mandiri santri.'}
                    </Text>
                    <View style={styles.inAppGuideBox}>
                      <MaterialCommunityIcons name="check-decagram" size={16} color="#059669" />
                      <Text style={styles.inAppGuideText}>
                        Modul ini telah divalidasi oleh dewan guru dan siap dipelajari santri serta dipantau wali murid.
                      </Text>
                    </View>
                  </View>

                  {(activeAttachment?.url_eksternal || activeAttachment?.path_file) && (
                    <TouchableOpacity
                      activeOpacity={0.88}
                      onPress={() => handleOpenExternal(activeAttachment?.url_eksternal || activeAttachment?.path_file)}
                      style={styles.openExternalBtn}
                    >
                      <MaterialCommunityIcons name="file-download-outline" size={18} color="#DC2626" />
                      <Text style={styles.openExternalBtnText}>Buka Dokumen Lengkap di Perangkat</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* JIKA BERKAS VIDEO */}
              {activeAttachment?.tipe_file === 'video' && (
                <View style={styles.inAppViewerContainer}>
                  <View style={styles.videoPlayerCard}>
                    <LinearGradient colors={['#1E293B', '#0F172A']} style={styles.videoPlaceholder}>
                      <View style={styles.videoPlayCircle}>
                        <MaterialCommunityIcons name="play" size={32} color="#FFFFFF" />
                      </View>
                      <Text style={styles.videoDurationBadge}>
                        {activeAttachment?.durasi_detik ? `${Math.floor(activeAttachment.durasi_detik / 60)}:${String(activeAttachment.durasi_detik % 60).padStart(2, '0')}` : '10:20 Menit'}
                      </Text>
                    </LinearGradient>
                  </View>

                  <View style={styles.inAppPreviewCard}>
                    <View style={styles.inAppPreviewHeader}>
                      <MaterialCommunityIcons name="movie-open-outline" size={18} color="#EA580C" />
                      <Text style={[styles.inAppPreviewHeading, { color: '#C2410C' }]}>Sinopsis & Pembahasan Video:</Text>
                    </View>
                    <Text style={styles.inAppPreviewText}>
                      {activeAttachment?.deskripsi || 'Video tutorial penjelasan bab 1 oleh tim pengajar SIT.'}
                    </Text>
                  </View>

                  {(activeAttachment?.url_eksternal || activeAttachment?.path_file) && (
                    <TouchableOpacity
                      activeOpacity={0.88}
                      onPress={() => handleOpenExternal(activeAttachment?.url_eksternal || activeAttachment?.path_file)}
                      style={[styles.openExternalBtn, { borderColor: '#FED7AA', backgroundColor: '#FFF7ED' }]}
                    >
                      <MaterialCommunityIcons name="youtube" size={20} color="#EA580C" />
                      <Text style={[styles.openExternalBtnText, { color: '#C2410C' }]}>Tonton Video Pembelajaran</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* JIKA BERKAS AUDIO / PODCAST */}
              {activeAttachment?.tipe_file === 'audio' && (
                <View style={styles.inAppViewerContainer}>
                  <View style={styles.audioPlayerCard}>
                    <LinearGradient colors={['#7E22CE', '#581C87']} style={styles.audioArtwork}>
                      <MaterialCommunityIcons name="waveform" size={48} color="#E9D5FF" />
                    </LinearGradient>

                    <Text style={styles.audioTrackTitle}>{activeAttachment?.nama_file || 'Audio Podcast Kajian'}</Text>
                    <Text style={styles.audioTrackSub}>
                      {activeAttachment?.deskripsi || 'Rangkuman materi audio singkat'}
                    </Text>

                    <View style={styles.audioProgressBarWrap}>
                      <View style={[styles.audioProgressBarFill, { width: isPlayingAudio ? '45%' : '0%' }]} />
                    </View>
                    <View style={styles.audioTimeRow}>
                      <Text style={styles.audioTimeText}>{isPlayingAudio ? '02:45' : '00:00'}</Text>
                      <Text style={styles.audioTimeText}>
                        {activeAttachment?.durasi_detik ? `${Math.floor(activeAttachment.durasi_detik / 60)}:${String(activeAttachment.durasi_detik % 60).padStart(2, '0')}` : '06:12'}
                      </Text>
                    </View>

                    <View style={styles.audioControlsRow}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setIsPlayingAudio(!isPlayingAudio)}
                        style={styles.audioPlayBtn}
                      >
                        <MaterialCommunityIcons name={isPlayingAudio ? 'pause' : 'play'} size={28} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {(activeAttachment?.url_eksternal || activeAttachment?.path_file) && (
                    <TouchableOpacity
                      activeOpacity={0.88}
                      onPress={() => handleOpenExternal(activeAttachment?.url_eksternal || activeAttachment?.path_file)}
                      style={[styles.openExternalBtn, { borderColor: '#E9D5FF', backgroundColor: '#FAF5FF', marginTop: 14 }]}
                    >
                      <MaterialCommunityIcons name="headphones" size={18} color="#9333EA" />
                      <Text style={[styles.openExternalBtnText, { color: '#7E22CE' }]}>Buka File Audio di Perangkat</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </ScrollView>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setActiveAttachment(null)}
              style={[styles.modalDismissBtn, { marginBottom: Platform.OS === 'android' ? 10 : 4 }]}
            >
              <Text style={styles.modalDismissBtnText}>Kembali ke Materi</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  sheetContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  screen: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: 16, paddingTop: Platform.OS === 'android' ? 20 : 16 },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { marginTop: 12, fontSize: 13, color: '#64748B', fontWeight: '600' },

  containerBlock: { marginBottom: 16 },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  heroCardScroll: {
    gap: 12,
    paddingRight: 10,
  },
  childCardHeroSize: {
    width: SCREEN_WIDTH - 32,
    minHeight: 148,
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#18A165',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  childCardHeroSizeActive: {
    backgroundColor: '#18A165',
    borderColor: '#18A165',
  },
  childHeroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarBorderWrapHero: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: '#A7F3D0',
    overflow: 'hidden',
    backgroundColor: '#EBF8F2',
  },
  avatarBorderWrapHeroActive: {
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  childAvatarImgHero: {
    width: '100%',
    height: '100%',
  },
  childHeroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  childNameHero: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    flex: 1,
  },
  childClassHero: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#18A165',
    marginTop: 2,
  },
  childSubInfoHero: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  childSubInfoHeroActive: {
    color: 'rgba(255, 255, 255, 0.85)',
  },
  childStatusBadgeHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  childStatusBadgeHeroActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  childStatusBadgeTextHero: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
  childStatusBadgeTextHeroActive: {
    color: '#FFFFFF',
  },
  childCardBottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  childCardBottomBarActive: {
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  childInfoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
  },
  childInfoPillActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  childInfoPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  childTextActive: {
    color: '#FFFFFF',
  },
  paginationDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#CBD5E1',
  },
  paginationDotActive: {
    width: 22,
    backgroundColor: '#18A165',
  },

  searchFilterBlock: {
    marginBottom: 16,
    gap: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 12.5,
    color: '#0F172A',
  },
  subjectChipsRow: {
    gap: 8,
    paddingRight: 10,
  },
  subjectChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  subjectChipActive: {
    backgroundColor: '#18A165',
    borderColor: '#18A165',
  },
  subjectChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  subjectChipTextActive: {
    color: '#FFFFFF',
  },

  materialCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  materialCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  subjectBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignSelf: 'flex-start',
  },
  subjectBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#2563EB',
  },
  materialDateText: {
    fontSize: 10.5,
    color: '#94A3B8',
    fontWeight: '600',
  },
  materialTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 18,
  },
  materialSnippet: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 16,
    marginTop: 4,
  },
  materialFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  teacherInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  teacherNameText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  mediaPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mediaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  mediaPillText: {
    fontSize: 9.5,
    fontWeight: '800',
  },

  openInAppBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  openInAppText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#059669',
  },

  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 10,
  },
  emptyDesc: {
    fontSize: 11.5,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    padding: 18,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 6,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    paddingVertical: 14,
  },
  modalTeacherBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    padding: 10,
    borderRadius: 12,
    marginBottom: 14,
  },
  modalTeacherTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#064E3B',
  },
  modalTeacherSub: {
    fontSize: 10,
    color: '#047857',
  },
  modalSectionHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  modalText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 18,
  },
  attachmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  attachmentName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  attachmentDesc: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  modalDismissBtn: {
    backgroundColor: '#18A165',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  modalDismissBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  inAppViewerContainer: {
    paddingVertical: 6,
  },
  pdfHeroBox: {
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#FEE2E2',
    marginBottom: 14,
  },
  pdfIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#DC2626',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  pdfHeroTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  pdfHeroSize: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '700',
    marginTop: 4,
  },
  inAppPreviewCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  inAppPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  inAppPreviewHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  inAppPreviewText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 18,
  },
  inAppGuideBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  inAppGuideText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#059669',
    flex: 1,
  },
  openExternalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  openExternalBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#DC2626',
  },

  videoPlayerCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 14,
  },
  videoPlaceholder: {
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlayCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#EA580C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoDurationBadge: {
    position: 'absolute',
    bottom: 10,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },

  audioPlayerCard: {
    backgroundColor: '#FAF5FF',
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E9D5FF',
    marginBottom: 6,
  },
  audioArtwork: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  audioTrackTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  audioTrackSub: {
    fontSize: 11,
    color: '#7E22CE',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 14,
  },
  audioProgressBarWrap: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E9D5FF',
    overflow: 'hidden',
  },
  audioProgressBarFill: {
    height: '100%',
    backgroundColor: '#9333EA',
    borderRadius: 3,
  },
  audioTimeRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 10,
  },
  audioTimeText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '700',
  },
  audioControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioPlayBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#9333EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

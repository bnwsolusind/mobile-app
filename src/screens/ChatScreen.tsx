import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  LayoutChangeEvent,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { API_BASE_URL } from '../services/api';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { mobileApiService } from '../services/mobileApiService';
import { useChatBadgeStore } from '../stores/chatBadgeStore';
import {
  getProfileImageUrl,
  DEFAULT_STUDENT_BOY_AVATAR,
  DEFAULT_STUDENT_GIRL_AVATAR,
} from '../utils/profile';

type Contact = {
  user_id: string;
  name: string;
  role: string;
  teacher_type: string;
  subject: string;
  class_name: string;
  unit_name: string;
  student_name: string;
  photo?: string;
  avatar_url?: string;
  unread_count?: number;
  last_message?: string;
  last_message_at?: string;
  is_online?: boolean;
  status?: string;
};

type Attachment = {
  id?: string;
  url?: string;
  path?: string;
  original_name?: string;
  mime_type?: string;
  file_size?: number;
  formatted_size?: string;
  file_type?: string;
};

type StagedAttachment = {
  uri: string;
  name: string;
  type: string;
  size?: string;
  isImage: boolean;
};

type Message = {
  id: string;
  sender_user_id: string;
  recipient_user_id: string;
  message: string;
  created_at: string;
  read_at?: string | null;
  attachments?: Attachment[];
};

const unwrap = <T,>(response: any): T => response?.data?.data ?? response?.data ?? response;

export default function ChatScreen({ navigation, route }: any) {
  const targetTeacherId = route?.params?.teacherId;
  const targetStudentId = route?.params?.studentId;

  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 16);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 14);

  const [children, setChildren] = useState<any[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState<StagedAttachment | null>(null);
  const [showAttachSheet, setShowAttachSheet] = useState(false);
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [rootLayoutHeight, setRootLayoutHeight] = useState(0);
  const maxRootHeightRef = useRef(0);

  const handleRootLayout = useCallback((e: LayoutChangeEvent) => {
    const { height } = e.nativeEvent.layout;
    if (height > maxRootHeightRef.current) {
      maxRootHeightRef.current = height;
    }
    setRootLayoutHeight(height);
  }, []);

  // Dynamically hide bottom navigation tab bar while inside 1-on-1 chat room
  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: selectedContact ? { display: 'none' } : undefined,
    });
    return () => {
      navigation.setOptions({
        tabBarStyle: undefined,
      });
    };
  }, [navigation, selectedContact]);

  const flatListRef = useRef<FlatList>(null);
  const childrenCacheRef = useRef<any[]>([]);
  const messagesCacheRef = useRef<Record<string, Message[]>>({});

  const loadContacts = useCallback(async (targetChildId?: string, silent = false) => {
    if (!silent) setLoading(true);
    try {
      // 1. Only fetch children list if not already cached in memory
      let availableChildren = childrenCacheRef.current;
      if (availableChildren.length === 0) {
        const childRes = await mobileApiService.getPortalChildren();
        availableChildren = unwrap<any[]>(childRes) || [];
        childrenCacheRef.current = availableChildren;
        setChildren(availableChildren);
      }

      const activeChildId = targetChildId || selectedChildId || availableChildren[0]?.id;
      if (activeChildId) {
        setSelectedChildId(String(activeChildId));
        const contactRes = await mobileApiService.getChatContacts(String(activeChildId));
        const rawList = unwrap<Contact[]>(contactRes) || [];

        // Strictly keep ONLY Wali Kelas and Guru Mata Pelajaran
        const filtered = rawList.filter((c) => {
          const role = (c.role || '').toLowerCase();
          const type = (c.teacher_type || '').toLowerCase();
          return role.includes('wali kelas') || role.includes('guru') || type === 'wali_kelas' || type === 'guru_mapel';
        });

        // Sort so Wali Kelas appears first, followed by subject teachers
        filtered.sort((a, b) => {
          if (a.teacher_type === 'wali_kelas' || a.role.toLowerCase().includes('wali')) return -1;
          if (b.teacher_type === 'wali_kelas' || b.role.toLowerCase().includes('wali')) return 1;
          return a.name.localeCompare(b.name);
        });

        setContacts(filtered);

        const totalUnread = filtered.reduce((sum, c) => sum + (c.unread_count || 0), 0);
        useChatBadgeStore.getState().setUnreadChatCount(totalUnread);

        // Auto-select contact if targetTeacherId was passed via notification
        if (targetTeacherId) {
          const directMatch = filtered.find((c) => String(c.user_id) === String(targetTeacherId));
          if (directMatch) {
            setSelectedContact(directMatch);
          }
        } else {
          // Keep selected contact presence state up-to-date in real-time
          setSelectedContact((current) => {
            if (!current) return null;
            const fresh = filtered.find((c) => String(c.user_id) === String(current.user_id));
            return fresh ? { ...current, ...fresh } : current;
          });
        }
      }
    } catch (err) {
      if (!silent) console.log('Error loading chat contacts:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedChildId, targetTeacherId]);

  useEffect(() => {
    if (targetStudentId && String(targetStudentId) !== String(selectedChildId)) {
      setSelectedChildId(String(targetStudentId));
      loadContacts(String(targetStudentId), false);
    } else {
      loadContacts(undefined, false);
    }

    // Only poll contacts list when user is NOT currently inside an active 1-on-1 chat room
    const contactPoll = setInterval(() => {
      if (!selectedContact) {
        loadContacts(undefined, true);
      }
    }, 10000);

    return () => clearInterval(contactPoll);
  }, [loadContacts, targetStudentId, selectedContact]);

  // If targetTeacherId changes and contacts already loaded, auto-open conversation
  useEffect(() => {
    if (!targetTeacherId || contacts.length === 0) return;
    const match = contacts.find((c) => String(c.user_id) === String(targetTeacherId));
    if (match && selectedContact?.user_id !== match.user_id) {
      setSelectedContact(match);
    }
  }, [targetTeacherId, contacts]);

  const handleSelectChild = (childId: string) => {
    setSelectedChildId(childId);
    setSelectedContact(null);
    loadContacts(childId, false);
  };

  const loadMessages = useCallback(async (silent = false) => {
    if (!selectedContact || !selectedChildId) return;
    const targetId = selectedContact.user_id;
    const cacheKey = `${selectedChildId}_${targetId}`;
    const cached = messagesCacheRef.current[cacheKey];

    // Instant render from in-memory cache (0ms perceived latency)
    if (cached && cached.length > 0) {
      setMessages(cached);
      setMessagesLoading(false);
    } else if (!silent) {
      setMessagesLoading(true);
    }

    try {
      const res = await mobileApiService.getChatMessages(targetId, selectedChildId);
      const freshMessages = unwrap<Message[]>(res) || [];
      setMessages((prev) => {
        if (silent && prev.length === freshMessages.length) {
          const lastPrev = prev[prev.length - 1];
          const lastFresh = freshMessages[freshMessages.length - 1];
          if (
            lastPrev?.id === lastFresh?.id &&
            lastPrev?.read_at === lastFresh?.read_at &&
            lastPrev?.message === lastFresh?.message
          ) {
            return prev; // Skip FlatList re-layout when unchanged
          }
        }
        messagesCacheRef.current[cacheKey] = freshMessages;
        return freshMessages;
      });
    } catch (err) {
      if (!silent) console.log('Error loading messages:', err);
    } finally {
      if (!silent) setMessagesLoading(false);
    }
  }, [selectedContact, selectedChildId]);

  useEffect(() => {
    loadMessages(false);

    if (!selectedContact) return;

    // Fast-poll active conversation messages every 2s for optimal responsiveness and low CPU
    const msgPoll = setInterval(() => {
      loadMessages(true);
    }, 2000);

    return () => clearInterval(msgPoll);
  }, [loadMessages, selectedContact]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      const kh = e?.endCoordinates?.height || 0;
      setKeyboardHeight(kh);
      setIsKeyboardVisible(true);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      setIsKeyboardVisible(false);
      setInputFocused(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const isKeyboardActive = isKeyboardVisible || inputFocused || keyboardHeight > 0;

  // Exact bottom margin required to keep card and input composer above keyboard or tab bar
  const chatCardBottomMargin = useMemo(() => {
    if (isKeyboardActive) {
      // Calculate how much the OS already shrank the root container (if any)
      const shrinkage =
        maxRootHeightRef.current > 0 && rootLayoutHeight > 0 && maxRootHeightRef.current > rootLayoutHeight
          ? maxRootHeightRef.current - rootLayoutHeight
          : 0;

      // Modern Android keyboards (e.g. Gboard with number row & shortcut toolbar strip)
      // are typically between 330dp and 365dp in height.
      const defaultKbHeight = Platform.OS === 'android' ? 340 : 320;
      const effectiveKbHeight = keyboardHeight > 100 ? keyboardHeight : defaultKbHeight;

      // On Android with windowFullscreen: true or translucent system navigation,
      // the 3-button navigation bar (48-52dp) sits at the bottom of the window.
      // We must account for this offset so the composer is never submerged behind the keyboard.
      const navOffset = Platform.OS === 'android' ? Math.max(insets.bottom, 48) : insets.bottom;

      // Remaining keyboard height not compensated by OS window shrinkage
      const uncompensatedKb = Math.max(0, effectiveKbHeight - shrinkage);

      return uncompensatedKb + navOffset + 12;
    }

    // When inside 1-on-1 chat room, bottom tabs are hidden, so we only need safe bottom padding
    if (selectedContact) {
      return Math.max(bottomInset, 16);
    }

    return bottomInset + 75;
  }, [isKeyboardActive, rootLayoutHeight, keyboardHeight, selectedContact, bottomInset, insets.bottom]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 80);
    }
  }, [messages.length]);

  const resolveAttachmentUrl = (urlOrPath?: string) => {
    if (!urlOrPath) return '';
    if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
      const apiHost = API_BASE_URL.replace(/\/api\/?$/, '');
      try {
        const parsed = new URL(urlOrPath);
        if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
          return `${apiHost}${parsed.pathname}${parsed.search}`;
        }
      } catch {}
      return urlOrPath;
    }
    if (urlOrPath.startsWith('file://') || urlOrPath.startsWith('content://')) {
      return urlOrPath;
    }
    const apiHost = API_BASE_URL.replace(/\/api\/?$/, '');
    const clean = urlOrPath.startsWith('/') ? urlOrPath : `/${urlOrPath}`;
    if (clean.startsWith('/storage/')) {
      return `${apiHost}${clean}`;
    }
    return `${apiHost}/storage${clean}`;
  };

  const handlePickCamera = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Izin Ditolak', 'Aplikasi memerlukan izin akses kamera untuk mengambil foto.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: false,
      });
      if (!res.canceled && res.assets && res.assets[0]) {
        const asset = res.assets[0];
        const name = asset.fileName || `foto_${Date.now()}.jpg`;
        setSelectedAttachment({
          uri: asset.uri,
          name,
          type: asset.mimeType || 'image/jpeg',
          isImage: true,
        });
        setShowAttachSheet(false);
      }
    } catch (err) {
      console.log('Camera error:', err);
    }
  };

  const handlePickGallery = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Izin Ditolak', 'Aplikasi memerlukan izin akses galeri foto.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: false,
      });
      if (!res.canceled && res.assets && res.assets[0]) {
        const asset = res.assets[0];
        const name = asset.fileName || `gambar_${Date.now()}.jpg`;
        setSelectedAttachment({
          uri: asset.uri,
          name,
          type: asset.mimeType || 'image/jpeg',
          isImage: true,
        });
        setShowAttachSheet(false);
      }
    } catch (err) {
      console.log('Gallery error:', err);
    }
  };

  const handlePickDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'text/plain',
        ],
        copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets && res.assets[0]) {
        const asset = res.assets[0];
        const isImg = (asset.mimeType || '').startsWith('image/');
        setSelectedAttachment({
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType || 'application/octet-stream',
          size: asset.size ? (asset.size > 1048576 ? `${(asset.size / 1048576).toFixed(1)} MB` : `${(asset.size / 1024).toFixed(0)} KB`) : undefined,
          isImage: isImg,
        });
        setShowAttachSheet(false);
      }
    } catch (err) {
      console.log('Doc picker error:', err);
    }
  };

  const handleSend = async () => {
    if ((!inputText.trim() && !selectedAttachment) || !selectedContact || !selectedChildId || sending) return;
    const msgToSend = inputText.trim();
    const tempId = `temp-${Date.now()}`;
    const cacheKey = `${selectedChildId}_${selectedContact.user_id}`;

    const attToSend = selectedAttachment;
    const tempAttachments: Attachment[] = attToSend ? [{
      id: `temp-att-${Date.now()}`,
      url: attToSend.uri,
      original_name: attToSend.name,
      file_type: attToSend.isImage ? 'image' : 'file',
      formatted_size: attToSend.size,
    }] : [];

    // 1. Optimistic Message Created Immediately (0ms Perceived Latency)
    const optimisticMsg: Message = {
      id: tempId,
      sender_user_id: 'own_user',
      recipient_user_id: selectedContact.user_id,
      message: msgToSend,
      attachments: tempAttachments,
      created_at: new Date().toISOString(),
    };

    // 2. Instantly clear input & render new message bubble
    setInputText('');
    setSelectedAttachment(null);
    setMessages((prev) => [...prev, optimisticMsg]);
    messagesCacheRef.current[cacheKey] = [...(messagesCacheRef.current[cacheKey] || []), optimisticMsg];
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 40);

    setSending(true);
    try {
      const res = await mobileApiService.sendChatMessage(selectedContact.user_id, selectedChildId, msgToSend, attToSend);
      const savedMsg = unwrap<Message>(res);
      if (savedMsg && savedMsg.id) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? savedMsg : m))
        );
        if (messagesCacheRef.current[cacheKey]) {
          messagesCacheRef.current[cacheKey] = messagesCacheRef.current[cacheKey].map((m) =>
            m.id === tempId ? savedMsg : m
          );
        }
      }
    } catch (err) {
      console.log('Error sending message:', err);
      // Reload on error to ensure sync
      loadMessages(true);
    } finally {
      setSending(false);
    }
  };

  const currentChild = children.find((c) => String(c.id) === String(selectedChildId)) || children[0];

  const handleBackPress = () => {
    if (selectedContact) {
      setSelectedContact(null);
      if (navigation?.setParams) {
        try {
          navigation.setParams({ teacherId: undefined, studentId: undefined });
        } catch {}
      }
    } else {
      if (navigation?.canGoBack?.() && navigation?.getState?.()?.index > 0) {
        navigation.goBack();
      } else {
        navigation?.navigate('Beranda');
      }
    }
  };

  const handleNotificationPress = () => {
    navigation?.navigate('Notifikasi');
  };

  const isSelectedContactWali = Boolean(
    selectedContact &&
      (selectedContact.teacher_type === 'wali_kelas' || selectedContact.role.toLowerCase().includes('wali'))
  );

  const selectedTeacherAvatarUri = selectedContact
    ? getProfileImageUrl(selectedContact) ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedContact.name || 'Guru')}&background=${isSelectedContactWali ? '18A165' : '0284C7'}&color=FFFFFF&bold=true&size=128`
    : '';

  return (
    <View style={styles.rootContainer} onLayout={handleRootLayout}>
      {/* 1. STANDAR HEADER KONSISTEN DENGAN HALAMAN LAINNYA */}
      <View style={styles.headerWrapper}>
        <LinearGradient
          colors={['#0D6B42', '#18A165', '#2BD988']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.headerGradient, { paddingTop: topInset + 6 }]}
        >
          {/* Organic Background Shapes */}
          <View style={styles.decorWave} />
          <View style={styles.decorCircle} />

          {/* Top Bar Navigation Row */}
          <View style={styles.headerNavRow}>
            {/* Roundcube Back Button */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleBackPress}
              accessibilityRole="button"
              accessibilityLabel="Kembali"
              style={styles.roundcubeBtn}
            >
              <MaterialCommunityIcons name="arrow-left" size={20} color="#18A165" />
            </TouchableOpacity>

            {/* Header Titles */}
            <View style={styles.headerCenterInfo}>
              {!selectedContact ? (
                <>
                  <Text style={styles.headerEyebrow}>KOMUNIKASI PENDIDIK</Text>
                  <Text numberOfLines={1} style={styles.headerMainTitle}>Komunikasi Guru</Text>
                </>
              ) : (
                <View style={styles.headerTeacherRow}>
                  <View style={[styles.headerTeacherAvatarBox, isSelectedContactWali && styles.avatarBoxWali]}>
                    <Image
                      source={{ uri: selectedTeacherAvatarUri }}
                      style={styles.headerTeacherAvatarImg}
                      resizeMode="cover"
                    />
                    <View
                      style={[
                        styles.headerStatusDot,
                        selectedContact.is_online ? styles.dotOnline : styles.dotOffline,
                      ]}
                    />
                  </View>
                  <View style={styles.headerTeacherTextCol}>
                    <Text style={styles.headerEyebrow}>
                      {isSelectedContactWali ? 'WALI KELAS' : 'GURU MAPEL'}
                    </Text>
                    <Text numberOfLines={1} style={styles.headerTeacherTitle}>
                      {selectedContact.name}
                    </Text>
                    <Text numberOfLines={1} style={styles.headerPresenceText}>
                      {selectedContact.is_online ? 'Online' : 'Offline'}
                      {selectedContact.subject ? ` · ${selectedContact.subject}` : ''}
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* Roundcube Bell Button */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleNotificationPress}
              accessibilityRole="button"
              accessibilityLabel="Notifikasi"
              style={styles.roundcubeBtn}
            >
              <MaterialCommunityIcons name="bell-outline" size={20} color="#18A165" />
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>

      {/* 2. BODY DENGAN SHEET CONTAINER & PASTEL GRADIENT (TIDAK FULLSCREEN) */}
      <View style={styles.sheetContainer}>
        <LinearGradient
          colors={['#FFFFFF', '#F2FAF6', '#DDF5EB']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {!selectedContact ? (
          /* ================= LIST KONTAK GURU ================= */
          <View style={styles.contentWrapper}>
            {/* Multi-child Switcher Card with Student Avatar */}
            {children.length > 0 && (
              <View style={styles.childSelectorCard}>
                <View style={styles.childCardTitleRow}>
                  <MaterialCommunityIcons name="account-school" size={16} color="#18A165" />
                  <Text style={styles.childCardTitle}>Pilih Ananda:</Text>
                  <Text style={styles.childActiveInfo}>
                    {currentChild?.kelas?.nama_kelas ? `Kelas ${currentChild.kelas.nama_kelas}` : ''}
                  </Text>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.childChipsScroll}
                >
                  {children.map((c) => {
                    const active = String(selectedChildId) === String(c.id);
                    const childName = c.full_name || c.name || 'Santri';
                    const childPhotoUri = getProfileImageUrl(c);
                    const isFemale =
                      c?.gender === 'female' ||
                      c?.jenis_kelamin === 'P' ||
                      c?.jenis_kelamin === 'female' ||
                      c?.gender === 'P' ||
                      (c?.gender || c?.jenis_kelamin || '').toString().toLowerCase().startsWith('p');
                    const studentDefaultAvatar = isFemale ? DEFAULT_STUDENT_GIRL_AVATAR : DEFAULT_STUDENT_BOY_AVATAR;

                    return (
                      <TouchableOpacity
                        key={c.id}
                        activeOpacity={0.8}
                        onPress={() => handleSelectChild(String(c.id))}
                        style={[styles.childChip, active && styles.childChipActive]}
                      >
                        {/* Student Avatar */}
                        <View style={[styles.childChipAvatarWrap, active && styles.childChipAvatarWrapActive]}>
                          <Image
                            source={childPhotoUri ? { uri: childPhotoUri } : studentDefaultAvatar}
                            style={styles.childChipAvatar}
                            resizeMode="cover"
                          />
                        </View>
                        <Text numberOfLines={1} style={[styles.childChipText, active && styles.childChipTextActive]}>
                          {childName}
                        </Text>
                        {active && (
                          <MaterialCommunityIcons name="check-circle" size={13} color="#FFFFFF" style={{ marginLeft: 5 }} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* List of Guru Contacts with Teacher Avatars */}
            <FlatList
              data={contacts}
              keyExtractor={(item) => String(item.user_id)}
              contentContainerStyle={[styles.listContainer, { paddingBottom: bottomInset + 80 }]}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={loading}
                  onRefresh={() => loadContacts(selectedChildId)}
                  tintColor="#18A165"
                  colors={['#18A165']}
                />
              }
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <View style={styles.emptyIconCircle}>
                    <MaterialCommunityIcons name="account-search-outline" size={42} color="#94A3B8" />
                  </View>
                  <Text style={styles.emptyTitle}>Belum Ada Kontak Guru</Text>
                  <Text style={styles.emptySubtitle}>
                    Kontak wali kelas dan guru mata pelajaran untuk ananda sedang diselaraskan dengan jadwal akademik.
                  </Text>
                </View>
              }
              renderItem={({ item }) => {
                const isWali = item.teacher_type === 'wali_kelas' || item.role.toLowerCase().includes('wali');
                const isOnline = Boolean(item.is_online);
                const teacherPhotoUri =
                  getProfileImageUrl(item) ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name || 'Guru')}&background=${isWali ? '18A165' : '0284C7'}&color=FFFFFF&bold=true&size=128`;

                return (
                  <TouchableOpacity
                    activeOpacity={0.88}
                    style={[styles.contactCard, isWali && styles.contactCardWali]}
                    onPress={() => setSelectedContact(item)}
                  >
                    {/* Teacher Avatar Box */}
                    <View style={styles.avatarContainer}>
                      <View style={[styles.avatarBox, isWali && styles.avatarBoxWali]}>
                        <Image
                          source={{ uri: teacherPhotoUri }}
                          style={styles.avatarImg}
                          resizeMode="cover"
                        />
                      </View>
                      {/* Online/Offline Dot Indicator */}
                      <View style={[styles.statusDot, isOnline ? styles.dotOnline : styles.dotOffline]} />
                    </View>

                    <View style={styles.contactInfo}>
                      <View style={styles.contactNameRow}>
                        <Text numberOfLines={1} style={styles.contactName}>{item.name}</Text>
                        <View style={styles.badgeRow}>
                          {isOnline ? (
                            <View style={styles.onlineBadge}>
                              <View style={styles.miniDotOnline} />
                              <Text style={styles.onlineBadgeText}>Online</Text>
                            </View>
                          ) : (
                            <View style={styles.offlineBadge}>
                              <View style={styles.miniDotOffline} />
                              <Text style={styles.offlineBadgeText}>Offline</Text>
                            </View>
                          )}
                          {isWali ? (
                            <View style={styles.waliBadge}>
                              <MaterialCommunityIcons name="star" size={11} color="#FFFFFF" style={{ marginRight: 3 }} />
                              <Text style={styles.waliBadgeText}>Wali Kelas</Text>
                            </View>
                          ) : (
                            <View style={styles.mapelBadge}>
                              <Text style={styles.mapelBadgeText}>Guru Mapel</Text>
                            </View>
                          )}
                        </View>
                      </View>

                      <Text numberOfLines={1} style={styles.contactSubject}>
                        {item.subject || 'Mata Pelajaran'} · {item.class_name || 'Kelas'}
                      </Text>

                      {item.last_message ? (
                        <Text style={styles.lastMsg} numberOfLines={1}>
                          {item.last_message}
                        </Text>
                      ) : (
                        <Text style={styles.tapToChatText}>Ketuk untuk kirim pesan...</Text>
                      )}
                    </View>

                    <MaterialCommunityIcons name="chevron-right" size={22} color="#94A3B8" />
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        ) : (
          /* ================= ROOM CHAT 1-ON-1 (KOTAK KARTU ELEGAN TIDAK FULLSCREEN) ================= */
          <View
            style={[
              styles.chatRoomCardWrapper,
              { marginBottom: chatCardBottomMargin },
            ]}
          >
            <View style={styles.chatCard}>
              {/* Context bar inside card with Teacher & Student Context */}
              <View style={styles.chatRoomContextHeader}>
                <View style={[styles.roomHeaderAvatarWrap, isSelectedContactWali && styles.avatarBoxWali]}>
                  <Image
                    source={{ uri: selectedTeacherAvatarUri }}
                    style={styles.roomHeaderAvatarImg}
                    resizeMode="cover"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={styles.roomHeaderTeacherName}>
                    {selectedContact.name}
                  </Text>
                  <Text numberOfLines={1} style={styles.chatRoomContextText}>
                    Percakapan tentang <Text style={styles.boldText}>{currentChild?.full_name || 'Santri'}</Text>
                    {currentChild?.kelas?.nama_kelas ? ` (${currentChild.kelas.nama_kelas})` : ''}
                  </Text>
                </View>
              </View>

              {/* Messages Area */}
              {messagesLoading ? (
                <View style={styles.messagesLoadingBox}>
                  <ActivityIndicator color="#18A165" size="small" />
                  <Text style={styles.messagesLoadingText}>Memuat percakapan...</Text>
                </View>
              ) : (
                <FlatList
                  ref={flatListRef}
                  data={messages}
                  keyExtractor={(item) => String(item.id)}
                  style={{ flex: 1 }}
                  contentContainerStyle={styles.msgList}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
                  onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
                  ListEmptyComponent={
                    <View style={styles.emptyChatBox}>
                      <View style={[styles.emptyChatAvatarWrap, isSelectedContactWali && styles.avatarBoxWali]}>
                        <Image
                          source={{ uri: selectedTeacherAvatarUri }}
                          style={styles.emptyChatTeacherAvatar}
                          resizeMode="cover"
                        />
                      </View>
                      <Text style={styles.emptyChatTitle}>Mulai Percakapan</Text>
                      <Text style={styles.emptyChatSub}>
                        Kirimkan pesan langsung kepada {selectedContact.name} perihal ananda {currentChild?.full_name || 'Santri'}.
                      </Text>
                    </View>
                  }
                  renderItem={({ item }) => {
                    const isOwn = item.sender_user_id !== selectedContact.user_id;
                    return (
                      <View style={[styles.msgBubble, isOwn ? styles.ownBubble : styles.otherBubble]}>
                        {/* Render Attachments (Images & Files) */}
                        {Array.isArray(item.attachments) && item.attachments.length > 0 && (
                          <View style={styles.bubbleAttachmentsWrap}>
                            {item.attachments.map((att: Attachment, attIdx: number) => {
                              const isImg = att.file_type === 'image' || (att.mime_type && att.mime_type.startsWith('image/'));
                              const resolvedUrl = resolveAttachmentUrl(att.url || att.path);
                              if (isImg) {
                                return (
                                  <TouchableOpacity
                                    key={att.id || attIdx}
                                    activeOpacity={0.9}
                                    onPress={() => setPreviewImageUri(resolvedUrl)}
                                    style={styles.bubbleImageContainer}
                                  >
                                    <Image
                                      source={{ uri: resolvedUrl }}
                                      style={styles.bubbleImage}
                                      resizeMode="cover"
                                    />
                                    <View style={styles.bubbleImageOverlay}>
                                      <MaterialCommunityIcons name="magnify-plus-outline" size={16} color="#FFFFFF" />
                                    </View>
                                  </TouchableOpacity>
                                );
                              }
                              return (
                                <TouchableOpacity
                                  key={att.id || attIdx}
                                  activeOpacity={0.8}
                                  onPress={() => Linking.openURL(resolvedUrl).catch(() => {})}
                                  style={[styles.bubbleDocCard, isOwn ? styles.ownDocCard : styles.otherDocCard]}
                                >
                                  <View style={[styles.docIconCircle, isOwn ? styles.ownDocIconCircle : styles.otherDocIconCircle]}>
                                    <MaterialCommunityIcons name="file-document-outline" size={20} color={isOwn ? '#0E5C44' : '#1E293B'} />
                                  </View>
                                  <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text numberOfLines={1} style={[styles.docName, isOwn && styles.ownDocName]}>
                                      {att.original_name || 'Dokumen Lampiran'}
                                    </Text>
                                    <Text style={[styles.docSize, isOwn && styles.ownDocSize]}>
                                      {att.formatted_size || (att.file_size ? `${(att.file_size / 1024).toFixed(0)} KB` : 'Buka Berkas')}
                                    </Text>
                                  </View>
                                  <MaterialCommunityIcons name="download" size={18} color={isOwn ? '#0E5C44' : '#64748B'} />
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        )}

                        {Boolean(item.message && item.message.trim()) && (
                          <Text style={[styles.msgText, isOwn && styles.ownMsgText]}>{item.message}</Text>
                        )}

                        <Text style={[styles.msgTime, isOwn && styles.ownMsgTime]}>
                          {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                    );
                  }}
                />
              )}

              {/* Staged Attachment Preview Chip */}
              {selectedAttachment && (
                <View style={styles.stagedChipContainer}>
                  {selectedAttachment.isImage ? (
                    <Image source={{ uri: selectedAttachment.uri }} style={styles.stagedThumb} resizeMode="cover" />
                  ) : (
                    <View style={styles.stagedDocIcon}>
                      <MaterialCommunityIcons name="file-document-outline" size={20} color="#0E5C44" />
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={styles.stagedFileName}>{selectedAttachment.name}</Text>
                    <Text style={styles.stagedFileSubtitle}>{selectedAttachment.size ? `${selectedAttachment.size} • ` : ''}Siap dikirim</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setSelectedAttachment(null)}
                    style={styles.stagedRemoveBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialCommunityIcons name="close-circle" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              )}

              {/* Contained Composer Bar Inside Card */}
              <View style={styles.cardComposer}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setShowAttachSheet(true)}
                  style={styles.cardAttachBtn}
                >
                  <MaterialCommunityIcons name="paperclip" size={22} color="#0E5C44" />
                </TouchableOpacity>

                <TextInput
                  style={styles.cardInput}
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder={selectedAttachment ? "Keterangan tambahan (opsional)..." : "Tulis pesan untuk guru..."}
                  placeholderTextColor="#94A3B8"
                  multiline
                  blurOnSubmit={false}
                  onFocus={() => {
                    setInputFocused(true);
                    setTimeout(() => {
                      flatListRef.current?.scrollToEnd({ animated: true });
                    }, 120);
                  }}
                  onBlur={() => setInputFocused(false)}
                />
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handleSend}
                  disabled={(!inputText.trim() && !selectedAttachment) || sending}
                  style={[styles.cardSendBtn, ((!inputText.trim() && !selectedAttachment) || sending) && styles.disabledBtn]}
                >
                  <MaterialCommunityIcons name="send" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>
      {/* ATTACHMENT ACTION SHEET MODAL */}
      <Modal
        visible={showAttachSheet}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAttachSheet(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowAttachSheet(false)}
          style={styles.actionSheetBackdrop}
        >
          <View style={styles.actionSheetCard}>
            <View style={styles.actionSheetHandle} />
            <Text style={styles.actionSheetTitle}>Pilih Jenis Lampiran</Text>
            <Text style={styles.actionSheetSub}>Kirim foto tugas, bukti belajar, atau berkas konsultasi</Text>

            <View style={styles.actionOptionsRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handlePickCamera}
                style={styles.actionOptionBtn}
              >
                <View style={[styles.actionIconCircle, { backgroundColor: '#E0F2FE' }]}>
                  <MaterialCommunityIcons name="camera" size={26} color="#0284C7" />
                </View>
                <Text style={styles.actionOptionLabel}>Kamera</Text>
                <Text style={styles.actionOptionSub}>Foto Langsung</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handlePickGallery}
                style={styles.actionOptionBtn}
              >
                <View style={[styles.actionIconCircle, { backgroundColor: '#ECFDF5' }]}>
                  <MaterialCommunityIcons name="image" size={26} color="#0E5C44" />
                </View>
                <Text style={styles.actionOptionLabel}>Galeri</Text>
                <Text style={styles.actionOptionSub}>Foto / Gambar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handlePickDocument}
                style={styles.actionOptionBtn}
              >
                <View style={[styles.actionIconCircle, { backgroundColor: '#FEF3C7' }]}>
                  <MaterialCommunityIcons name="file-document" size={26} color="#D97706" />
                </View>
                <Text style={styles.actionOptionLabel}>Dokumen</Text>
                <Text style={styles.actionOptionSub}>PDF / Berkas</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setShowAttachSheet(false)}
              style={styles.actionCancelBtn}
            >
              <Text style={styles.actionCancelText}>Batal</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* FULLSCREEN IMAGE VIEWER MODAL */}
      <Modal
        visible={Boolean(previewImageUri)}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImageUri(null)}
      >
        <View style={styles.imageViewerBackdrop}>
          <TouchableOpacity
            style={styles.imageViewerCloseBtn}
            onPress={() => setPreviewImageUri(null)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          {previewImageUri && (
            <Image
              source={{ uri: previewImageUri }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  headerWrapper: {
    backgroundColor: '#FFFFFF',
  },
  headerGradient: {
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    paddingHorizontal: 14,
    paddingBottom: 14,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#0D6B42',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  decorWave: {
    position: 'absolute',
    top: -40,
    right: -20,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    transform: [{ scaleX: 1.3 }, { rotate: '-25deg' }],
  },
  decorCircle: {
    position: 'absolute',
    bottom: -20,
    left: 40,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  roundcubeBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  headerCenterInfo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEyebrow: {
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#D4F5E6',
    textAlign: 'center',
  },
  headerMainTitle: {
    fontSize: 15.5,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 1,
  },
  headerTeacherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTeacherAvatarBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    position: 'relative',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  headerTeacherAvatarImg: {
    width: '100%',
    height: '100%',
  },
  headerStatusDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  headerTeacherTextCol: {
    flex: 1,
    justifyContent: 'center',
  },
  headerTeacherTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  headerPresenceText: {
    fontSize: 9.5,
    color: '#D4F5E6',
    fontWeight: '700',
    marginTop: 1,
  },
  sheetContainer: {
    flex: 1,
  },
  contentWrapper: {
    flex: 1,
  },
  childSelectorCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 14,
    marginTop: 12,
    marginBottom: 4,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  childCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  childCardTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
  },
  childActiveInfo: {
    fontSize: 11,
    color: '#64748B',
    marginLeft: 'auto',
    fontWeight: '600',
  },
  childChipsScroll: {
    flexDirection: 'row',
    gap: 8,
  },
  childChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 4,
    paddingRight: 12,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  childChipActive: {
    backgroundColor: '#18A165',
    borderColor: '#18A165',
    shadowColor: '#18A165',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  childChipAvatarWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    overflow: 'hidden',
    marginRight: 7,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#E2E8F0',
  },
  childChipAvatarWrapActive: {
    borderColor: '#FFFFFF',
  },
  childChipAvatar: {
    width: '100%',
    height: '100%',
  },
  childChipText: {
    fontSize: 11.5,
    color: '#475569',
    fontWeight: '700',
  },
  childChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  listContainer: {
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  emptyContainer: {
    padding: 36,
    alignItems: 'center',
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#334155',
  },
  emptySubtitle: {
    fontSize: 11.5,
    color: '#94A3B8',
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 18,
  },
  contactCard: {
    flexDirection: 'row',
    padding: 13,
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
    borderRadius: 16,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1.5,
  },
  contactCardWali: {
    borderColor: '#18A165',
    backgroundColor: '#F7FCF9',
  },
  avatarContainer: {
    position: 'relative',
  },
  avatarBox: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: '#E2E8F0',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBoxWali: {
    borderColor: '#18A165',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  statusDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  dotOnline: {
    backgroundColor: '#10B981',
  },
  dotOffline: {
    backgroundColor: '#EF4444',
  },
  contactInfo: {
    flex: 1,
  },
  contactNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  contactName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 4,
  },
  onlineBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#15803D',
  },
  miniDotOnline: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 4,
  },
  offlineBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#B91C1C',
  },
  miniDotOffline: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },
  waliBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18A165',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  waliBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  mapelBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  mapelBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#0284C7',
  },
  contactSubject: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  lastMsg: {
    fontSize: 11,
    color: '#475569',
    marginTop: 4,
  },
  tapToChatText: {
    fontSize: 10.5,
    color: '#94A3B8',
    marginTop: 4,
    fontStyle: 'italic',
  },
  /* Chat Room Card Container - TIDAK FULLSCREEN */
  chatRoomCardWrapper: {
    flex: 1,
    marginTop: 10,
    marginHorizontal: 14,
  },
  chatCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  chatRoomContextHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  roomHeaderAvatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  roomHeaderAvatarImg: {
    width: '100%',
    height: '100%',
  },
  roomHeaderTeacherName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  chatRoomContextText: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  boldText: {
    fontWeight: '800',
    color: '#0F172A',
  },
  messagesLoadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  messagesLoadingText: {
    fontSize: 12,
    color: '#64748B',
  },
  msgList: {
    padding: 14,
    paddingBottom: 16,
    gap: 8,
  },
  emptyChatBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    gap: 8,
  },
  emptyChatAvatarWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    marginBottom: 6,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  emptyChatTeacherAvatar: {
    width: '100%',
    height: '100%',
  },
  emptyChatTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#334155',
  },
  emptyChatSub: {
    fontSize: 11.5,
    color: '#94A3B8',
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 17,
  },
  msgBubble: {
    maxWidth: '82%',
    padding: 11,
    borderRadius: 16,
  },
  ownBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#18A165',
    borderBottomRightRadius: 3,
  },
  otherBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderBottomLeftRadius: 3,
  },
  msgText: {
    fontSize: 13,
    color: '#0F172A',
    lineHeight: 18,
  },
  ownMsgText: {
    color: '#FFFFFF',
  },
  msgTime: {
    fontSize: 9,
    color: '#64748B',
    marginTop: 4,
    textAlign: 'right',
  },
  ownMsgTime: {
    color: 'rgba(255,255,255,0.75)',
  },
  cardComposer: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
    alignItems: 'center',
  },
  cardInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 90,
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A',
  },
  cardSendBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#18A165',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#18A165',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  disabledBtn: {
    opacity: 0.45,
  },

  cardAttachBtn: {
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stagedChipContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F0FDF4',
    borderTopWidth: 1,
    borderTopColor: '#BBF7D0',
  },
  stagedThumb: {
    width: 38,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  stagedDocIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stagedFileName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  stagedFileSubtitle: {
    fontSize: 10,
    fontWeight: '500',
    color: '#0E5C44',
  },
  stagedRemoveBtn: {
    padding: 4,
  },
  bubbleAttachmentsWrap: {
    marginBottom: 6,
    gap: 6,
  },
  bubbleImageContainer: {
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    maxWidth: 240,
  },
  bubbleImage: {
    width: 220,
    height: 160,
    borderRadius: 14,
  },
  bubbleImageOverlay: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderRadius: 12,
    padding: 4,
  },
  bubbleDocCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    borderRadius: 12,
    maxWidth: 240,
  },
  ownDocCard: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  otherDocCard: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  docIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownDocIconCircle: {
    backgroundColor: '#BBF7D0',
  },
  otherDocIconCircle: {
    backgroundColor: '#E2E8F0',
  },
  docName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  ownDocName: {
    color: '#0E5C44',
  },
  docSize: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '500',
  },
  ownDocSize: {
    color: '#15803D',
  },
  actionSheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  actionSheetCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
    alignItems: 'center',
  },
  actionSheetHandle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    marginBottom: 14,
  },
  actionSheetTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  actionSheetSub: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    marginBottom: 20,
    textAlign: 'center',
  },
  actionOptionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 20,
    gap: 12,
  },
  actionOptionBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  actionIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  actionOptionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  actionOptionSub: {
    fontSize: 10,
    fontWeight: '500',
    color: '#94A3B8',
    marginTop: 2,
  },
  actionCancelBtn: {
    width: '100%',
    paddingVertical: 13,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  actionCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  imageViewerBackdrop: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerCloseBtn: {
    position: 'absolute',
    top: 48,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenImage: {
    width: '100%',
    height: '80%',
  },

});

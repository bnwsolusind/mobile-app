import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
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
import { useAuthStore } from '../stores/authStore';
import { realtimeWs } from '../services/websocketService';
import { useChatBadgeStore } from '../stores/chatBadgeStore';
import { useActiveChildStore } from '../stores/activeChildStore';
import { useNotificationBadgeStore } from '../stores/notificationBadgeStore';
import { useNavigationHistoryStore } from '../stores/navigationHistoryStore';
import { StudentHeroCard } from '../components/StudentHeroCard';
import { StudentStickyHeader, useStickyScroll } from '../components/StudentStickyHeader';
import { StudentIdCardModal } from '../components/StudentIdCardModal';
import { StudentQrModal } from '../components/StudentQrModal';
import { StudentMenuModal } from '../components/StudentMenuModal';
import { StudentWeeklyReportModal } from '../components/StudentWeeklyReportModal';
import AppFeedbackModal, { FeedbackType } from '../components/AppFeedbackModal';
import EmptyStateCard from '../components/EmptyStateCard';
import {
  getProfileImageUrl,
  getStudentAvatarSource,
  DEFAULT_PARENT_AVATAR,
  DEFAULT_STUDENT_BOY_AVATAR,
  DEFAULT_STUDENT_GIRL_AVATAR,
} from '../utils/profile';
import { getStudentAttendanceStatus } from '../utils/studentAttendanceHelper';
import { isTeacherRole, isParentRole, isStaffRole, isTuRole, isPrincipalRole, isStudentRole } from '../utils/roles';
import TeacherChatWorkspace from '../components/teacher/TeacherChatWorkspace';

const PARENT_HOME_BG = require('../../assets/parent_home_bg.jpg');

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

function ParentChatScreen({ navigation, route }: any) {
  const targetTeacherId = route?.params?.teacherId;
  const targetStudentId = route?.params?.studentId;

  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 16);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 36 : 16);
  const user = useAuthStore((state) => state.user);
  const unreadNotificationCount = useNotificationBadgeStore((state) => state.unreadNotificationCount);

  const [children, setChildren] = useState<any[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>(() => {
    return targetStudentId ? String(targetStudentId) : useActiveChildStore.getState().activeChildId || '';
  });
  const selectedChildIdRef = useRef<string | undefined>(selectedChildId);
  selectedChildIdRef.current = selectedChildId;

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const selectedContactRef = useRef<Contact | null>(selectedContact);
  selectedContactRef.current = selectedContact;

  const targetTeacherHandledRef = useRef<string | null>(null);
  const heroScrollRef = useRef<ScrollView>(null);

  // ── Sticky header bersama (StudentStickyHeader, sama dengan halaman lain) ──
  // Catatan: daftar di halaman ini memakai FlatList biasa (bukan Animated),
  // jadi scroll diteruskan via JS-driver (FlatList polos + useNativeDriver
  // wajib dibungkus animated component — dihindari agar tidak crash).
  const { scrollY } = useStickyScroll();
  const handleChatScroll = useCallback((e: any) => {
    scrollY.setValue(e?.nativeEvent?.contentOffset?.y ?? 0);
  }, [scrollY]);

  const [selectedIdCardStudent, setSelectedIdCardStudent] = useState<any>(null);
  const [selectedQrStudent, setSelectedQrStudent] = useState<any>(null);
  const [selectedMenuStudent, setSelectedMenuStudent] = useState<any>(null);
  const [selectedWeeklyStudent, setSelectedWeeklyStudent] = useState<any>(null);

  // Tombol Kartu Siswa -> modal KTS; tombol QR -> modal QR khusus
  const openIdCard = (student: any) => {
    setSelectedIdCardStudent(student);
  };
  const openQrCard = (student: any) => {
    setSelectedQrStudent(student);
  };

  // Tombol Jadwal pada sticky header & body card (disamakan dengan halaman Jadwal)
  const openScheduleForStudent = useCallback((student: any) => {
    const sid = student?.id || student?.student_id;
    if (sid) {
      const idStr = String(sid);
      navigation?.navigate('Jadwal', { child_id: idStr, student_id: idStr });
    } else {
      navigation?.navigate('Jadwal');
    }
  }, [navigation]);

  // Siswa aktif untuk sticky header (anak terpilih -> profil -> user)
  const headerStudent = useMemo(() => {
    if (children && children.length > 0) {
      const found = children.find(
        (c) => String(c.id || c.student_id) === String(selectedChildId)
      );
      if (found) return found;
      return children[0];
    }
    return (user as any)?.student || user || null;
  }, [children, selectedChildId, user]);

  const studentFullName = useMemo(() => {
    return (
      (typeof headerStudent?.name === 'string' && headerStudent.name) ||
      (typeof headerStudent?.nama_lengkap === 'string' && headerStudent.nama_lengkap) ||
      (typeof headerStudent?.full_name === 'string' && headerStudent.full_name) ||
      'Ananda'
    );
  }, [headerStudent]);

  const studentUnit = useMemo(() => {
    return (
      headerStudent?.educationUnit?.name ||
      headerStudent?.education_unit?.name ||
      headerStudent?.unit_name ||
      headerStudent?.education_unit_name ||
      headerStudent?.kelas?.unitPendidikan?.name ||
      (typeof headerStudent?.unit === 'string' ? headerStudent.unit : '') ||
      ''
    );
  }, [headerStudent]);

  const studentClass = useMemo(() => {
    return (
      headerStudent?.kelas?.nama_kelas ||
      headerStudent?.kelas?.name ||
      headerStudent?.class?.name ||
      headerStudent?.class_name ||
      (typeof headerStudent?.kelas === 'string' ? headerStudent.kelas : '') ||
      ''
    );
  }, [headerStudent]);

  const studentAvatarSource = useMemo(() => {
    return getStudentAvatarSource(headerStudent);
  }, [headerStudent]);

  const attendanceStatus = useMemo(() => {
    return getStudentAttendanceStatus(headerStudent);
  }, [headerStudent]);

  const [showChildSelectorModal, setShowChildSelectorModal] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState<StagedAttachment | null>(null);
  const [showAttachSheet, setShowAttachSheet] = useState(false);
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
  } | null>(null);
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


  const flatListRef = useRef<FlatList>(null);
  const childrenCacheRef = useRef<any[]>([]);
  const messagesCacheRef = useRef<Record<string, Message[]>>({});

  const loadContacts = useCallback(async (targetChildId?: string, silent = false) => {
    // Guard: hanya role Orang Tua/Wali & Siswa yang memanggil endpoint portal children & chat contacts
    const currentRoles = useAuthStore.getState().roles;
    if (!isParentRole(currentRoles) && !isStudentRole(currentRoles)) {
      if (!silent) setLoading(false);
      return;
    }

    if (!silent) setLoading(true);
    try {
      // 1. Only fetch children list if not already cached in memory
      let availableChildren = childrenCacheRef.current;
      if (availableChildren.length === 0) {
        if (isParentRole(currentRoles)) {
          const childRes = await mobileApiService.getPortalChildren();
          availableChildren = unwrap<any[]>(childRes) || [];
        } else if (isStudentRole(currentRoles)) {
          const me = useAuthStore.getState().user;
          const st = (me as any)?.student || me;
          availableChildren = st ? [st] : [];
        }
        childrenCacheRef.current = availableChildren;
        setChildren(availableChildren);
      }

      const globalActiveId = useActiveChildStore.getState().activeChildId;
      const activeChildId = targetChildId || selectedChildIdRef.current || globalActiveId || availableChildren[0]?.id;
      if (activeChildId) {
        const activeChildIdStr = String(activeChildId);
        if (selectedChildIdRef.current !== activeChildIdStr) {
          setSelectedChildId(activeChildIdStr);
        }
        const contactRes = await mobileApiService.getChatContacts(activeChildIdStr);
        const rawList = unwrap<Contact[]>(contactRes) || [];

        // Keep Wali Kelas, Guru Mapel, Guru Tahfizh, Guru BK, and Musyrif contacts
        const filtered = rawList.filter((c) => {
          const role = (c.role || '').toLowerCase();
          const type = (c.teacher_type || '').toLowerCase();
          return (
            role.includes('wali') ||
            role.includes('guru') ||
            role.includes('musyrif') ||
            role.includes('pembina') ||
            role.includes('pembimbing') ||
            role.includes('ustadz') ||
            role.includes('ustazah') ||
            role.includes('ustad') ||
            role.includes('pengajar') ||
            role.includes('pendidik') ||
            role.includes('pengasuh') ||
            type.includes('wali') ||
            type.includes('guru') ||
            type.includes('musyrif') ||
            type.includes('tahfizh') ||
            type.includes('bk') ||
            type === 'wali_kelas' ||
            type === 'guru_mapel' ||
            type === 'guru_tahfizh' ||
            type === 'guru_bk'
          );
        });

        const finalContacts = filtered.length > 0 ? filtered : rawList;

        // Sort so Wali Kelas appears first, followed by other teachers
        finalContacts.sort((a, b) => {
          const isAWali = a.teacher_type === 'wali_kelas' || (a.role || '').toLowerCase().includes('wali');
          const isBWali = b.teacher_type === 'wali_kelas' || (b.role || '').toLowerCase().includes('wali');
          if (isAWali && !isBWali) return -1;
          if (!isAWali && isBWali) return 1;
          return (a.name || '').localeCompare(b.name || '');
        });

        setContacts(finalContacts);

        const totalUnread = filtered.reduce((sum, c) => sum + (c.unread_count || 0), 0);
        useChatBadgeStore.getState().setUnreadChatCount(totalUnread);

        // Auto-select contact if targetTeacherId was passed via route and not yet handled
        if (targetTeacherId && targetTeacherHandledRef.current !== String(targetTeacherId)) {
          const directMatch = filtered.find((c) => String(c.user_id) === String(targetTeacherId));
          if (directMatch) {
            targetTeacherHandledRef.current = String(targetTeacherId);
            setSelectedContact(directMatch);
          }
        } else {
          // Keep selected contact presence state up-to-date in real-time without breaking reference identity
          setSelectedContact((current) => {
            if (!current) return null;
            const fresh = filtered.find((c) => String(c.user_id) === String(current.user_id));
            if (!fresh) return current;
            if (
              current.is_online === fresh.is_online &&
              current.name === fresh.name &&
              current.unread_count === fresh.unread_count &&
              current.status === fresh.status &&
              current.avatar_url === fresh.avatar_url &&
              current.photo === fresh.photo &&
              current.last_message === fresh.last_message
            ) {
              return current;
            }
            return { ...current, ...fresh };
          });
        }
      }
    } catch (err) {
      if (!silent) console.log('Error loading chat contacts:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [targetTeacherId]);

  useEffect(() => {
    if (targetStudentId && String(targetStudentId) !== selectedChildIdRef.current) {
      setSelectedChildId(String(targetStudentId));
      loadContacts(String(targetStudentId), false);
    } else {
      loadContacts(undefined, false);
    }

    // Only poll contacts list when user is NOT currently inside an active 1-on-1 chat room
    const contactPoll = setInterval(() => {
      if (!selectedContactRef.current) {
        loadContacts(undefined, true);
      }
    }, 10000);

    return () => clearInterval(contactPoll);
  }, [loadContacts, targetStudentId]);

  // If targetTeacherId changes and contacts already loaded, auto-open conversation
  useEffect(() => {
    if (!targetTeacherId) return;
    if (targetTeacherHandledRef.current === String(targetTeacherId)) return;

    const match = contacts.find((c) => String(c.user_id) === String(targetTeacherId));
    if (match) {
      targetTeacherHandledRef.current = String(targetTeacherId);
      setSelectedContact(match);
    } else if (route?.params?.targetUser || route?.params?.name) {
      const virtMatch = {
        user_id: String(targetTeacherId),
        name: route.params.name || route.params.targetUser?.nama || 'Guru',
        role: route.params.targetUser?.jabatan || 'Guru',
        teacher_type: 'guru',
        subject: route.params.targetUser?.jabatan || 'Guru',
        class_name: '-',
        unit_name: '-',
        student_name: '-',
        is_online: Boolean(route.params.targetUser?.is_online),
      };
      targetTeacherHandledRef.current = String(targetTeacherId);
      setSelectedContact(virtMatch);
    }
  }, [targetTeacherId, contacts, route?.params]);

  const handleSelectChild = (childId: string) => {
    setSelectedChildId(childId);
    setSelectedContact(null);
    targetTeacherHandledRef.current = null;
    loadContacts(childId, false);
  };

  const handleStudentScrollEnd = (e: any) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const cardWidth = SCREEN_WIDTH - 50 + 12;
    const index = Math.round(offsetX / cardWidth);
    if (index >= 0 && index < children.length) {
      const targetChild = children[index];
      if (targetChild && String(targetChild.id) !== selectedChildIdRef.current) {
        handleSelectChild(String(targetChild.id));
      }
    }
  };

  const activeTeacherUserId = selectedContact?.user_id;

  const loadMessages = useCallback(async (silent = false) => {
    const teacherId = selectedContactRef.current?.user_id;
    const childId = selectedChildIdRef.current;
    if (!teacherId || !childId) return;

    const cacheKey = `${childId}_${teacherId}`;
    const cached = messagesCacheRef.current[cacheKey];

    // Instant render from in-memory cache (0ms perceived latency)
    if (cached !== undefined) {
      setMessages(cached);
      setMessagesLoading(false);
    } else if (!silent) {
      setMessagesLoading(true);
    }

    try {
      const res = await mobileApiService.getChatMessages(teacherId, childId);
      const freshMessages = unwrap<Message[]>(res) || [];
      setMessages((prev) => {
        // Prevent layout thrashing if both empty
        if (prev.length === 0 && freshMessages.length === 0) {
          messagesCacheRef.current[cacheKey] = [];
          return prev;
        }
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
  }, []);

  useEffect(() => {
    if (!activeTeacherUserId || !selectedChildId) {
      setMessages([]);
      setMessagesLoading(false);
      return;
    }

    // Load initial messages for active conversation
    loadMessages(false);

    // Fast-poll active conversation messages as safe fallback every 8s
    const msgPoll = setInterval(() => {
      if (selectedContactRef.current?.user_id === activeTeacherUserId) {
        loadMessages(true);
      }
    }, 8000);

    return () => clearInterval(msgPoll);
  }, [activeTeacherUserId, selectedChildId, loadMessages]);

  const myUserId = useAuthStore((state) => state.user?.id);

  // Realtime WebSocket Subscription untuk Chat Zero-Delay
  useEffect(() => {
    if (!myUserId) return;

    const channel = `user.${myUserId}`;
    const unsubscribe = realtimeWs.subscribe(channel, (eventData) => {
      if (eventData.event === 'chat.message.sent') {
        const msg = eventData.payload;
        if (!msg) return;

        // 1. Jika pesan dari kontak yang sedang dibuka, langsung sisipkan ke daftar pesan
        const currentContact = selectedContactRef.current;
        if (currentContact && String(currentContact.user_id) === String(msg.sender_user_id)) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [
              ...prev,
              {
                id: String(msg.id),
                sender_user_id: String(msg.sender_user_id),
                recipient_user_id: String(msg.recipient_user_id),
                message: String(msg.message || ''),
                created_at: String(msg.created_at || new Date().toISOString()),
                read_at: null,
                attachments: Array.isArray(msg.attachments) ? msg.attachments : [],
              },
            ];
          });
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 60);
        } else {
          // Jika pesan dari orang lain, refresh kontak agar counter badge bertambah
          loadContacts(undefined, true);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [myUserId, loadContacts]);

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

  const isKeyboardActive = isKeyboardVisible || keyboardHeight > 0;

  // Handle Android hardware back press when room is open
  useEffect(() => {
    if (!selectedContact) return;
    const onBackPress = () => {
      setSelectedContact(null);
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [selectedContact]);

  // Exact bottom padding to keep composer above keyboard or tab bar
  const composerBottomPadding = useMemo(() => {
    if (Platform.OS === 'web') {
      return Math.max(bottomInset + 64, 80);
    }
    if (Platform.OS === 'ios') {
      if (isKeyboardActive) {
        return Math.max(bottomInset, 14);
      }
      return Math.max(bottomInset + 70, 96);
    }
    if (isKeyboardActive && keyboardHeight > 0) {
      const shrinkage =
        maxRootHeightRef.current > 0 && rootLayoutHeight > 0 && maxRootHeightRef.current > rootLayoutHeight
          ? maxRootHeightRef.current - rootLayoutHeight
          : 0;
      const effectiveKb = keyboardHeight;
      const navOffset = Math.max(insets.bottom, 24);
      const uncompensated = Math.max(0, effectiveKb - shrinkage);
      return uncompensated + navOffset + 8;
    }
    // When keyboard is closed, tab bar is visible: height ~70 + bottomInset
    return Math.max(bottomInset + 70, 96);
  }, [isKeyboardActive, rootLayoutHeight, keyboardHeight, bottomInset, insets.bottom]);

  useEffect(() => {
    if (messages.length > 0) {
      const t = setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 80);
      return () => clearTimeout(t);
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
        setFeedbackModal({
          visible: true,
          type: 'warning',
          title: 'Izin Kamera Ditolak',
          message: 'Aplikasi memerlukan izin akses kamera untuk mengambil foto.',
        });
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
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Membuka Kamera',
        message: 'Terjadi kendala saat mengakses kamera perangkat Anda.',
      });
    }
  };

  const handlePickGallery = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setFeedbackModal({
          visible: true,
          type: 'warning',
          title: 'Izin Galeri Ditolak',
          message: 'Aplikasi memerlukan izin akses galeri foto untuk memilih berkas gambar.',
        });
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
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Mengirim Pesan',
        message: 'Pesan gagal terkirim. Silakan periksa koneksi internet Anda dan coba lagi.',
      });
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
      const handled = useNavigationHistoryStore.getState().goBackDynamic(navigation);
      if (!handled) {
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

  const selectedTeacherAvatarSource = selectedContact
    ? (getProfileImageUrl(selectedContact)
        ? { uri: getProfileImageUrl(selectedContact)! }
        : DEFAULT_PARENT_AVATAR)
    : DEFAULT_PARENT_AVATAR;

  // ================= VIEW: CHAT ROOM DETAIL (1-on-1 dengan Guru) =================
  if (selectedContact) {
    return (
      <View style={styles.chatRoomRootContainer} onLayout={handleRootLayout}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? topInset : 0}
        >
          {/* Header Chat Room */}
          <View style={[styles.chatRoomHeaderBar, { paddingTop: topInset + 6 }]}>
            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.chatRoomBackBtn}
              onPress={handleBackPress}
            >
              <MaterialCommunityIcons name="arrow-left" size={24} color="#0F172A" />
            </TouchableOpacity>

            <View style={[styles.chatRoomHeaderAvatarWrap, isSelectedContactWali && styles.avatarBoxWali]}>
              <Image
                source={selectedTeacherAvatarSource}
                style={styles.chatRoomHeaderAvatarImg}
                resizeMode="cover"
              />
            </View>

            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text numberOfLines={1} style={styles.chatRoomHeaderName}>
                {selectedContact.name}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1 }}>
                <MaterialCommunityIcons name="account-school" size={12} color="#059669" style={{ marginRight: 3 }} />
                <Text numberOfLines={1} style={styles.chatRoomHeaderSub}>
                  {currentChild?.full_name || 'Santri'}{currentChild?.kelas?.nama_kelas ? ` (${currentChild.kelas.nama_kelas})` : ''} • {selectedContact.subject || selectedContact.role}
                </Text>
              </View>
            </View>

            <View style={[styles.chatRoomRoleBadge, isSelectedContactWali ? styles.chatRoomRoleBadgeWali : styles.chatRoomRoleBadgeMapel]}>
              <Text style={[styles.chatRoomRoleBadgeText, isSelectedContactWali ? styles.chatRoomRoleBadgeTextWali : styles.chatRoomRoleBadgeTextMapel]}>
                {isSelectedContactWali ? 'Wali Kelas' : 'Guru Mapel'}
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
              onContentSizeChange={() => {
                if (messages.length > 0) {
                  flatListRef.current?.scrollToEnd({ animated: false });
                }
              }}
              onLayout={() => {
                if (messages.length > 0) {
                  flatListRef.current?.scrollToEnd({ animated: false });
                }
              }}
              ListEmptyComponent={
                <View style={styles.emptyChatBox}>
                  <View style={[styles.emptyChatAvatarWrap, isSelectedContactWali && styles.avatarBoxWali]}>
                    <Image
                      source={selectedTeacherAvatarSource}
                      style={styles.emptyChatTeacherAvatar}
                      resizeMode="cover"
                    />
                    <View style={[styles.emptyChatBadgeWrap, isSelectedContactWali && styles.emptyChatBadgeWrapWali]}>
                      <MaterialCommunityIcons
                        name={isSelectedContactWali ? 'star' : 'chat-processing-outline'}
                        size={12}
                        color="#FFFFFF"
                      />
                    </View>
                  </View>
                  <Text style={styles.emptyChatTitle}>Mulai Percakapan</Text>
                  <Text style={styles.emptyChatSub}>
                    Kirimkan pesan langsung kepada {selectedContact.name} perihal ananda {currentChild?.full_name || 'Santri'}.
                  </Text>
                  <View style={styles.emptyChatPromptChip}>
                    <MaterialCommunityIcons name="shield-check" size={13} color="#059669" />
                    <Text style={styles.emptyChatPromptText}>Percakapan privat & terenkripsi</Text>
                  </View>
                </View>
              }
              renderItem={({ item }) => {
                const isOwn = item.sender_user_id !== selectedContact.user_id;
                const senderDisplayName = isOwn
                  ? 'Anda'
                  : (item.sender?.name || selectedContact.name || 'Guru / Musyrif');
                return (
                  <View style={[styles.msgBubble, isOwn ? styles.ownBubble : styles.otherBubble]}>
                    {/* Header Label Nama pada Isi Chat */}
                    <View style={[styles.msgHeaderRow, isOwn ? styles.msgHeaderRowOwn : styles.msgHeaderRowOther]}>
                      {!isOwn && (
                        <Text style={styles.senderNameOther}>
                          {senderDisplayName}
                        </Text>
                      )}
                      <View style={[styles.msgBadge, isOwn ? styles.msgBadgeOwn : styles.msgBadgeOther]}>
                        <Text style={[styles.msgBadgeText, isOwn ? styles.msgBadgeTextOwn : styles.msgBadgeTextOther]}>
                          {isOwn ? 'Balasan' : 'Pesan Masuk'}
                        </Text>
                      </View>
                      {isOwn && (
                        <Text style={styles.senderNameOwn}>
                          {senderDisplayName}
                        </Text>
                      )}
                    </View>

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
                                <MaterialCommunityIcons name="file-document-outline" size={20} color={isOwn ? '#0E5C44' : '#2563EB'} />
                              </View>
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <Text numberOfLines={1} style={[styles.docName, isOwn ? styles.ownDocName : styles.otherDocName]}>
                                  {att.original_name || 'Dokumen Lampiran'}
                                </Text>
                                <Text style={[styles.docSize, isOwn ? styles.ownDocSize : styles.otherDocSize]}>
                                  {att.formatted_size || (att.file_size ? `${(att.file_size / 1024).toFixed(0)} KB` : 'Buka Berkas')}
                                </Text>
                              </View>
                              <MaterialCommunityIcons name="download" size={18} color={isOwn ? '#0E5C44' : '#2563EB'} />
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}

                    {(() => {
                      const msgContent = item.message ?? (item as any).content ?? (item as any).pesan ?? (item as any).text ?? '';
                      return Boolean(msgContent && msgContent.trim()) ? (
                        <Text style={[styles.msgText, isOwn ? styles.ownMsgText : styles.otherMsgText]}>{msgContent}</Text>
                      ) : null;
                    })()}

                    <Text style={[styles.msgTime, isOwn ? styles.ownMsgTime : styles.otherMsgTime]}>
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

          {/* Bottom Composer Bar - Always visible above soft keyboard */}
          <View style={[styles.chatRoomComposer, { paddingBottom: composerBottomPadding }]}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setShowAttachSheet(true)}
              style={styles.chatRoomAttachBtn}
            >
              <MaterialCommunityIcons name="paperclip" size={22} color="#0E5C44" />
            </TouchableOpacity>

            <TextInput
              style={styles.chatRoomInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder={selectedAttachment ? "Keterangan tambahan (opsional)..." : "Tulis pesan untuk guru..."}
              placeholderTextColor="#94A3B8"
              selectionColor="#059669"
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
              style={[
                styles.chatRoomSendBtn,
                ((!inputText.trim() && !selectedAttachment) || sending) && styles.disabledBtn
              ]}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <MaterialCommunityIcons name="send" size={18} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>

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
            <View style={[styles.actionSheetCard, { paddingBottom: Math.max(bottomInset + 16, 40) }]}>
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

        {feedbackModal && (
          <AppFeedbackModal
            visible={feedbackModal.visible}
            type={feedbackModal.type || 'info'}
            title={feedbackModal.title}
            message={feedbackModal.message}
            onClose={() => setFeedbackModal(null)}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.rootContainer} onLayout={handleRootLayout}>
      {/* ── LATAR GAMBAR ILUSTRASI SEKOLAH DENGAN GRADASI EMERALD BERSIH ── */}
      <View style={[styles.topFoliageWrapper, { height: 480 }]} pointerEvents="none">
        <Image source={PARENT_HOME_BG} style={[styles.topFoliageBgImage, { opacity: 0.45 }]} resizeMode="cover" />
        <LinearGradient
          colors={[
            'rgba(24, 161, 101, 0.18)',
            'rgba(24, 161, 101, 0.40)',
            'rgba(240, 253, 244, 0.95)',
            '#F0FDF4',
          ]}
          locations={[0, 0.28, 0.65, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* ── TOP HEADER IDENTIK HALAMAN UTAMA & TAGIHAN ── */}
      <View style={[styles.cleanTopHeader, { paddingTop: topInset + 6 }]}>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={handleBackPress}
          style={styles.cleanHeaderIconBtn}
          accessibilityRole="button"
          accessibilityLabel="Kembali"
        >
          <MaterialCommunityIcons name="arrow-left" size={22} color="#004D32" />
        </TouchableOpacity>

        <Text numberOfLines={1} style={styles.cleanHeaderTitle}>
          Komunikasi Guru
        </Text>

        <TouchableOpacity
          activeOpacity={0.75}
          onPress={handleNotificationPress}
          style={styles.cleanHeaderIconBtn}
          accessibilityRole="button"
          accessibilityLabel="Notifikasi"
        >
          <MaterialCommunityIcons name="bell-outline" size={20} color="#004D32" />
          {unreadNotificationCount > 0 && <View style={styles.cleanBellDot} />}
        </TouchableOpacity>
      </View>

      {/* ── 2. BODY DENGAN SHEET CONTAINER ── */}
      <View style={styles.sheetContainer}>
        <FlatList
          data={contacts}
          keyExtractor={(item) => String(item.user_id)}
          contentContainerStyle={[styles.listContainer, { paddingBottom: Math.max(bottomInset + 76, 112) }]}
          showsVerticalScrollIndicator={false}
          onScroll={handleChatScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => loadContacts(selectedChildId, false)}
              tintColor="#059669"
              colors={['#059669', '#10B981']}
            />
          }
          ListHeaderComponent={
            <View style={styles.listHeaderWrapper}>
              {/* ── 0. STUDENT PROFILE SECTION (PERSIS MENIRU HALAMAN JADWAL PELAJARAN) ── */}
              <View style={styles.studentProfileRow}>
                {/* Circular Avatar dengan mint ring (Klik untuk Buka KTS Siswa) */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setSelectedIdCardStudent(headerStudent)}
                  style={styles.studentAvatarRing}
                  accessibilityRole="button"
                  accessibilityLabel="Lihat Kartu Pelajar"
                >
                  <Image
                    source={studentAvatarSource}
                    style={styles.studentAvatarImg}
                    resizeMode="cover"
                  />
                </TouchableOpacity>

                {/* Profile Info */}
                <View style={styles.studentProfileInfoCol}>
                  <TouchableOpacity
                    activeOpacity={children && children.length > 1 ? 0.75 : 1}
                    onPress={children && children.length > 1 ? () => setShowChildSelectorModal(true) : undefined}
                    style={styles.studentNameRow}
                  >
                    <Text numberOfLines={1} style={styles.studentProfileName}>
                      {studentFullName}
                    </Text>
                  </TouchableOpacity>

                  {/* Baris 2: Unit Pendidikan */}
                  {studentUnit ? (
                    <View style={styles.studentMetaRow}>
                      <MaterialCommunityIcons name="school-outline" size={12} color="#047857" style={{ marginRight: 4 }} />
                      <Text numberOfLines={1} style={styles.studentProfileUnitText}>
                        {studentUnit}
                      </Text>
                    </View>
                  ) : null}

                  {/* Baris 3: Kelas Siswa tepat di bawah Unit Pendidikan */}
                  {studentClass ? (
                    <View style={styles.studentMetaRow}>
                      <MaterialCommunityIcons name="door-open" size={12} color="#065F46" style={{ marginRight: 4 }} />
                      <Text numberOfLines={1} style={styles.studentProfileClassText}>
                        {studentClass}
                      </Text>
                    </View>
                  ) : null}

                  {/* Baris Aksi: Tombol Ganti Siswa + Lencana Status Kehadiran di Sebelahnya */}
                  <View style={styles.studentActionBadgeRow}>
                    {children && children.length > 1 && (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setShowChildSelectorModal(true)}
                        style={styles.parentGantiAnakBtn}
                        accessibilityRole="button"
                        accessibilityLabel="Ganti Siswa"
                      >
                        <Text style={styles.parentGantiAnakBtnText}>Ganti Siswa</Text>
                        <MaterialCommunityIcons name="chevron-down" size={15} color="#FFFFFF" />
                      </TouchableOpacity>
                    )}

                    <View
                      style={[
                        styles.attendanceStatusBadge,
                        { backgroundColor: attendanceStatus.bg, borderColor: attendanceStatus.border },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={attendanceStatus.icon}
                        size={12}
                        color={attendanceStatus.color}
                        style={{ marginRight: 4 }}
                      />
                      <Text style={[styles.attendanceStatusText, { color: attendanceStatus.color }]}>
                        {attendanceStatus.label}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* ── 1. CARD DAFTAR GURU PENGAJAR & WALI KELAS: UKURAN LEBAR SAMA PERSIS DENGAN CARD KONTAK ── */}
              <View style={styles.contactsSectionHeader}>
                <View style={styles.contactsSectionIconBox}>
                  <MaterialCommunityIcons name="chat-processing-outline" size={20} color="#004D32" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contactsSectionTitle}>Daftar Guru Pengajar & Wali Kelas</Text>
                  <Text style={styles.contactsSectionSub}>
                    Pilih pendidik untuk memulai konsultasi & komunikasi langsung perihal ananda.
                  </Text>
                </View>
              </View>
            </View>
          }
          ListEmptyComponent={
            <EmptyStateCard
              icon="account-search-outline"
              title="Belum Ada Kontak Guru"
              description="Kontak wali kelas dan guru mata pelajaran untuk ananda sedang diselaraskan dengan jadwal akademik."
              actionLabel="Muat Ulang"
              onAction={() => loadContacts(selectedChildId, false)}
              style={{ marginTop: 24, marginHorizontal: 16 }}
            />
          }
          renderItem={({ item }) => {
            const isWali = item.teacher_type === 'wali_kelas' || item.role.toLowerCase().includes('wali');
            const isOnline = Boolean(item.is_online);
            const photoUrl = getProfileImageUrl(item);
            const teacherPhotoSource = photoUrl ? { uri: photoUrl } : DEFAULT_PARENT_AVATAR;
            const unread = Number(item.unread_count || 0);

            return (
              <TouchableOpacity
                activeOpacity={0.85}
                style={[
                  styles.contactCard,
                  isWali ? styles.contactCardWali : styles.contactCardMapel,
                  unread > 0 && styles.contactCardUnread,
                ]}
                onPress={() => setSelectedContact(item)}
              >
                {/* Teacher Avatar Box with Squircle & Online/Offline Dot Indicator */}
                <View style={styles.avatarContainer}>
                  <View style={[styles.avatarBox, isWali ? styles.avatarBoxWali : styles.avatarBoxMapel]}>
                    <Image
                      source={teacherPhotoSource}
                      style={styles.avatarImg}
                      resizeMode="cover"
                    />
                  </View>
                  <View style={[styles.statusDot, isOnline ? styles.dotOnline : styles.dotOffline]} />
                </View>

                {/* Contact Info (Clean 3-row hierarchy with vibrant semantic colors) */}
                <View style={styles.contactInfo}>
                  {/* Baris 1: Nama Guru & Badge Peran (Wali Kelas / Guru Mapel) */}
                  <View style={styles.contactNameRow}>
                    <Text numberOfLines={1} style={[styles.contactName, isWali ? styles.contactNameWali : styles.contactNameMapel, unread > 0 && styles.contactNameUnread]}>
                      {item.name}
                    </Text>
                    {isWali ? (
                      <View style={styles.waliBadge}>
                        <MaterialCommunityIcons name="star" size={11} color="#FFFFFF" style={{ marginRight: 3 }} />
                        <Text style={styles.waliBadgeText}>Wali Kelas</Text>
                      </View>
                    ) : (
                      <View style={styles.mapelBadge}>
                        <MaterialCommunityIcons name="book-education-outline" size={11} color="#FFFFFF" style={{ marginRight: 3 }} />
                        <Text style={styles.mapelBadgeText}>Guru Mapel</Text>
                      </View>
                    )}
                  </View>

                  {/* Baris 2: Mata Pelajaran & Kelas */}
                  <View style={styles.contactMetaRow}>
                    <MaterialCommunityIcons
                      name="book-open-variant"
                      size={13}
                      color={isWali ? '#059669' : '#0284C7'}
                      style={{ marginRight: 4 }}
                    />
                    <Text numberOfLines={1} style={[styles.contactSubject, isWali ? styles.contactSubjectWali : styles.contactSubjectMapel]}>
                      {item.subject || 'Mata Pelajaran'} • {item.class_name || 'Kelas'}{item.unit_name && item.unit_name !== '-' ? ` • ${item.unit_name}` : ''}
                    </Text>
                  </View>

                  {/* Baris 3: Cuplikan Pesan Terakhir */}
                  <View style={styles.contactBottomRow}>
                    <Text
                      style={[styles.lastMsg, unread > 0 ? styles.lastMsgUnread : null]}
                      numberOfLines={1}
                    >
                      {item.last_message || 'Belum ada pesan. Ketuk untuk mulai konsultasi.'}
                    </Text>
                  </View>
                </View>

                {/* Right Action: Unread Count Badge or Vibrant Colored Chevron Action Box */}
                <View style={styles.contactRightCol}>
                  {unread > 0 ? (
                    <View style={styles.contactUnreadBadge}>
                      <Text style={styles.contactUnreadBadgeText}>{unread > 99 ? '99+' : unread}</Text>
                    </View>
                  ) : (
                    <View style={[styles.contactChevronBox, isWali ? styles.contactChevronBoxWali : styles.contactChevronBoxMapel]}>
                      <MaterialCommunityIcons
                        name="chat-outline"
                        size={15}
                        color={isWali ? '#D97706' : '#0284C7'}
                      />
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
            />
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
          <View style={[styles.actionSheetCard, { paddingBottom: Math.max(bottomInset + 16, 40) }]}>
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

      {/* MODAL PILIH ANANDA */}
      <Modal
        visible={showChildSelectorModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowChildSelectorModal(false)}
      >
        <View style={styles.childModalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowChildSelectorModal(false)}
          />
          <View style={styles.childModalSheet}>
            <View style={styles.childModalHeader}>
              <Text style={styles.childModalTitle}>Pilih Ananda</Text>
              <TouchableOpacity onPress={() => setShowChildSelectorModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 320 }}>
              {children.map((c: any, idx: number) => {
                const cId = String(c.id || c.student_id);
                const isSelected = cId === String(selectedChildId);
                const cName =
                  (typeof c.name === 'string' && c.name) ||
                  (typeof c.nama_lengkap === 'string' && c.nama_lengkap) ||
                  (typeof c.full_name === 'string' && c.full_name) ||
                  'Ananda';
                const cUnit =
                  c.educationUnit?.name ||
                  c.education_unit?.name ||
                  c.unit_name ||
                  c.education_unit_name ||
                  c.kelas?.unitPendidikan?.name ||
                  '';
                const cClass =
                  c.kelas?.nama_kelas ||
                  c.kelas?.name ||
                  c.class?.name ||
                  c.class_name ||
                  '';

                return (
                  <TouchableOpacity
                    key={cId || idx}
                    activeOpacity={0.8}
                    onPress={() => {
                      setShowChildSelectorModal(false);
                      handleSelectChild(cId);
                      useActiveChildStore.getState().setActiveChildId(cId);
                    }}
                    style={[
                      styles.childModalItem,
                      isSelected && styles.childModalItemActive,
                    ]}
                  >
                    <Image
                      source={getStudentAvatarSource(c)}
                      style={styles.childModalAvatar}
                      resizeMode="cover"
                    />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text
                        style={[
                          styles.childModalItemName,
                          isSelected && { color: '#004D32', fontWeight: '800' },
                        ]}
                      >
                        {cName}
                      </Text>
                      <Text style={styles.childModalItemSub}>
                        {cUnit ? `${cUnit} • ` : ''}{cClass || 'Siswa'}
                      </Text>
                    </View>
                    {isSelected && (
                      <MaterialCommunityIcons name="check-circle" size={20} color="#004D32" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL KARTU SISWA / QR / MENU / LAPORAN (dibuka dari header & card bodi) */}
      <StudentIdCardModal
        visible={Boolean(selectedIdCardStudent)}
        student={selectedIdCardStudent}
        onClose={() => setSelectedIdCardStudent(null)}
      />
      <StudentQrModal
        visible={Boolean(selectedQrStudent)}
        student={selectedQrStudent}
        onClose={() => setSelectedQrStudent(null)}
      />
      <StudentMenuModal
        visible={Boolean(selectedMenuStudent)}
        student={selectedMenuStudent}
        onClose={() => setSelectedMenuStudent(null)}
        navigation={navigation}
      />
      <StudentWeeklyReportModal
        visible={Boolean(selectedWeeklyStudent)}
        student={selectedWeeklyStudent}
        onClose={() => setSelectedWeeklyStudent(null)}
      />

      {feedbackModal && (
        <AppFeedbackModal
          visible={feedbackModal.visible}
          type={feedbackModal.type || 'info'}
          title={feedbackModal.title}
          message={feedbackModal.message}
          onClose={() => setFeedbackModal(null)}
        />
      )}
    </View>
  );
}

export default function ChatScreen({ navigation, route }: any) {
  const roles = useAuthStore((state) => state.roles);
  const isTeacher = isTeacherRole(roles);
  const isStaff = isStaffRole(roles) || isTuRole(roles) || isPrincipalRole(roles);
  const isParent = isParentRole(roles);

  // If user is Teacher, Staff, TU, or Principal:
  // Render TeacherChatWorkspace directly to handle employee and teacher communication safely.
  if (isTeacher || isStaff) {
    // Only fall back to ParentChatScreen if user has parent role AND specifically targeted a student chat
    if (isParent && route?.params?.studentId && !route?.params?.teacherId) {
      return <ParentChatScreen navigation={navigation} route={route} />;
    }
    return <TeacherChatWorkspace navigation={navigation} route={route} />;
  }

  return <ParentChatScreen navigation={navigation} route={route} />;
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#ECFDF5',
  },
  topFoliageWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  topFoliageBgImage: {
    width: '100%',
    height: '100%',
  },
  cleanTopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  cleanHeaderIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  cleanHeaderTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#004D32',
    letterSpacing: -0.2,
  },
  cleanBellDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  listHeaderWrapper: {
    width: '100%',
    paddingTop: 4,
    paddingBottom: 6,
  },
  studentProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 12,
    marginBottom: 4,
  },
  studentAvatarRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#A7F3D0',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 3,
  },
  studentAvatarImg: {
    width: '100%',
    height: '100%',
  },
  studentProfileInfoCol: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
  },
  studentNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
  },
  studentProfileName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#004D32',
    letterSpacing: -0.2,
    lineHeight: 24,
    flexShrink: 1,
  },
  studentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  studentProfileUnitText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#047857',
    flexShrink: 1,
  },
  studentProfileClassText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#065F46',
    flexShrink: 1,
  },
  studentActionBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  parentGantiAnakBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#004D32',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    gap: 4,
    shadowColor: '#004D32',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  parentGantiAnakBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  attendanceStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 10,
    borderWidth: 1.2,
  },
  attendanceStatusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  contactsSectionHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 13,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  contactsSectionIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#D1FAE5',
  },
  contactsSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#004D32',
    letterSpacing: -0.2,
  },
  contactsSectionSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 15,
  },
  childModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  childModalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
  },
  childModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  childModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#004D32',
  },
  childModalCloseBtn: {
    padding: 4,
  },
  childModalScroll: {
    maxHeight: 320,
  },
  childModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    shadowColor: '#004D32',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  childModalItemActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#004D32',
  },
  childModalAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
  },
  childModalItemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  childModalItemName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#004D32',
  },
  childModalItemSub: {
    fontSize: 11.5,
    color: '#047857',
    marginTop: 2,
  },
  childModalCheckCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#004D32',
    alignItems: 'center',
    justifyContent: 'center',
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
  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
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
    marginBottom: 10,
    borderRadius: 18,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  contactCardWali: {
    backgroundColor: '#F0FDF4', // Soft emerald mint tint
    borderColor: '#10B981',
    shadowColor: '#059669',
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  contactCardMapel: {
    backgroundColor: '#F0F9FF', // Soft sapphire sky blue tint
    borderColor: '#BAE6FD',
    shadowColor: '#0284C7',
    shadowOpacity: 0.08,
    shadowRadius: 5,
  },
  contactCardUnread: {
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
    borderWidth: 2,
    shadowOpacity: 0.18,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatarBox: {
    width: 48,
    height: 48,
    borderRadius: 15,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBoxWali: {
    backgroundColor: '#FEF3C7',
    borderWidth: 2,
    borderColor: '#F59E0B',
  },
  avatarBoxMapel: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1.8,
    borderColor: '#0284C7',
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
    backgroundColor: '#CBD5E1',
  },
  contactInfo: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  contactNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 3,
  },
  contactName: {
    fontSize: 13.5,
    fontWeight: '800',
    flex: 1,
  },
  contactNameWali: {
    color: '#064E3B',
    fontWeight: '900',
  },
  contactNameMapel: {
    color: '#0F172A',
    fontWeight: '800',
  },
  contactNameUnread: {
    color: '#064E3B',
    fontWeight: '900',
  },
  waliBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D97706',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    flexShrink: 0,
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 1,
  },
  waliBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  mapelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284C7',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    flexShrink: 0,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 1,
  },
  mapelBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  contactMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  contactSubject: {
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  contactSubjectWali: {
    color: '#047857',
    fontWeight: '700',
  },
  contactSubjectMapel: {
    color: '#0369A1',
    fontWeight: '700',
  },
  contactBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lastMsg: {
    fontSize: 11.5,
    color: '#64748B',
    flex: 1,
    lineHeight: 16,
  },
  lastMsgUnread: {
    color: '#047857',
    fontWeight: '700',
  },
  contactRightCol: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  contactChevronBox: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  contactChevronBoxWali: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  contactChevronBoxMapel: {
    backgroundColor: '#E0F2FE',
    borderColor: '#BAE6FD',
  },
  contactUnreadBadge: {
    backgroundColor: '#EF4444',
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  contactUnreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  /* Chat Room Card Container - TIDAK FULLSCREEN */
  chatRoomCardWrapper: {
    flex: 1,
    marginTop: 12,
    marginHorizontal: 16,
  },
  chatCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
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
    paddingVertical: 32,
    paddingHorizontal: 20,
    gap: 8,
  },
  emptyChatAvatarWrap: {
    width: 68,
    height: 68,
    borderRadius: 22,
    overflow: 'visible',
    position: 'relative',
    backgroundColor: '#E2E8F0',
    borderWidth: 2.5,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  emptyChatBadgeWrap: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: '#18A165',
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    elevation: 3,
  },
  emptyChatBadgeWrapWali: {
    backgroundColor: '#F59E0B',
  },
  emptyChatTeacherAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  emptyChatTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
  },
  emptyChatSub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 18,
  },
  emptyChatPromptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginTop: 6,
  },
  emptyChatPromptText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#065F46',
  },
  msgBubble: {
    maxWidth: '82%',
    padding: 11,
    borderRadius: 16,
  },
  ownBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#059669',
    borderBottomRightRadius: 3,
    borderWidth: 1,
    borderColor: '#047857',
  },
  otherBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderBottomLeftRadius: 3,
  },
  msgHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    gap: 6,
  },
  msgHeaderRowOwn: {
    justifyContent: 'flex-end',
    borderBottomColor: 'rgba(255,255,255,0.2)',
  },
  msgHeaderRowOther: {
    justifyContent: 'flex-start',
    borderBottomColor: '#DBEAFE',
  },
  senderNameOwn: {
    fontSize: 11,
    fontWeight: '800',
    color: '#D1FAE5',
  },
  senderNameOther: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  msgBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 8,
  },
  msgBadgeOwn: {
    backgroundColor: '#047857',
  },
  msgBadgeOther: {
    backgroundColor: '#DBEAFE',
  },
  msgBadgeText: {
    fontSize: 8.5,
    fontWeight: '700',
  },
  msgBadgeTextOwn: {
    color: '#D1FAE5',
  },
  msgBadgeTextOther: {
    color: '#1D4ED8',
  },
  msgText: {
    fontSize: 13,
    color: '#0F172A',
    lineHeight: 18,
  },
  ownMsgText: {
    color: '#FFFFFF',
  },
  otherMsgText: {
    color: '#1E293B',
  },
  msgTime: {
    fontSize: 9,
    color: '#64748B',
    marginTop: 4,
    textAlign: 'right',
  },
  ownMsgTime: {
    color: '#D1FAE5',
  },
  otherMsgTime: {
    color: '#3B82F6',
  },
  cardComposer: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
    alignItems: 'center',
  },
  cardInput: {
    flex: 1,
    minHeight: 46,
    maxHeight: 110,
    backgroundColor: '#F1F5F9',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
  },
  cardSendBtn: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: '#18A165',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#18A165',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  disabledBtn: {
    opacity: 0.45,
  },

  cardAttachBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
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
    backgroundColor: '#DBEAFE',
    borderWidth: 1,
    borderColor: '#BFDBFE',
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
    backgroundColor: '#EFF6FF',
  },
  docName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  ownDocName: {
    color: '#0E5C44',
  },
  otherDocName: {
    color: '#1E3A8A',
  },
  docSize: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  ownDocSize: {
    color: '#065F46',
  },
  otherDocSize: {
    color: '#3B82F6',
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
    paddingTop: 14,
    paddingBottom: 40,
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
  chatRoomRootContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  chatRoomHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    zIndex: 10,
  },
  chatRoomBackBtn: {
    padding: 6,
    marginRight: 6,
    marginLeft: -6,
    borderRadius: 12,
  },
  chatRoomHeaderAvatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  chatRoomHeaderAvatarImg: {
    width: '100%',
    height: '100%',
  },
  chatRoomHeaderName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  chatRoomHeaderSub: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
  },
  chatRoomRoleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  chatRoomRoleBadgeWali: {
    backgroundColor: '#FEF3C7',
  },
  chatRoomRoleBadgeMapel: {
    backgroundColor: '#F1F5F9',
  },
  chatRoomRoleBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  chatRoomRoleBadgeTextWali: {
    color: '#D97706',
  },
  chatRoomRoleBadgeTextMapel: {
    color: '#64748B',
  },
  chatRoomComposer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 8,
  },
  chatRoomAttachBtn: {
    padding: 8,
    marginBottom: 2,
  },
  chatRoomInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 110,
    backgroundColor: '#F1F5F9',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 8,
    fontSize: 13.5,
    lineHeight: 18,
    color: '#0F172A',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  chatRoomSendBtn: {
    backgroundColor: '#059669',
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
    shadowColor: '#059669',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});

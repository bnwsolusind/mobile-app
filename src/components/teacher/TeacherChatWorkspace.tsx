import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  LayoutChangeEvent,
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
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { API_BASE_URL } from '../../services/api';
import { mobileApiService, unwrapApiData } from '../../services/mobileApiService';
import { useAuthStore } from '../../stores/authStore';
import { realtimeWs } from '../../services/websocketService';
import { useChatBadgeStore } from '../../stores/chatBadgeStore';
import AppFeedbackModal, { FeedbackType } from '../AppFeedbackModal';
import EmptyStateCard from '../EmptyStateCard';
import { isTuRole, isPrincipalRole } from '../../utils/roles';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PARENT_HOME_BG = require('../../../assets/parent_home_bg.jpg');

export interface TeacherConversation {
  id: string;
  student_id: string;
  student_name: string;
  parent_user_id: string;
  parent_name: string;
  class_name: string;
  unit_name: string;
  unit_id?: string;
  teacher_type: string;
  role_label: string;
  last_message?: string | null;
  last_message_at?: string | null;
  unread_count?: number;
  is_online?: boolean;
  is_employee?: boolean;
}

interface Attachment {
  id?: string;
  url?: string;
  path?: string;
  original_name?: string;
  mime_type?: string;
  file_size?: number;
  formatted_size?: string;
  file_type?: string;
}

interface StagedAttachment {
  uri: string;
  name: string;
  type: string;
  size?: string;
  isImage: boolean;
}

interface ChatMessage {
  id: string;
  student_id?: string;
  sender_user_id: string;
  recipient_user_id: string;
  message: string;
  content?: string;
  pesan?: string;
  text?: string;
  created_at: string;
  read_at?: string | null;
  attachments?: Attachment[];
  sender?: { id?: string; name?: string; email?: string };
}

const formatChatTime = (timestamp?: string | null): string => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
};

export default function TeacherChatWorkspace({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 16);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 16);

  const user = useAuthStore((state) => state.user);
  const roles = useAuthStore((state) => state.roles);
  const userRoles = useMemo(() => (roles?.length ? roles : user?.roles || []), [roles, user?.roles]);
  const isPrincipal = isPrincipalRole(userRoles);
  const isTu = isTuRole(userRoles);
  const myUserId = user?.id;

  const [conversations, setConversations] = useState<TeacherConversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<TeacherConversation | null>(null);
  const selectedConvRef = useRef<TeacherConversation | null>(selectedConv);
  selectedConvRef.current = selectedConv;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [tabFilter, setTabFilter] = useState<'all' | 'employees' | 'parents' | 'unread'>('all');
  const [selectedUnitFilter, setSelectedUnitFilter] = useState<string>('all');
  const [availableUnits, setAvailableUnits] = useState<Array<{ id: string; name: string }>>([]);

  const [inputText, setInputText] = useState('');
  const [selectedAttachment, setSelectedAttachment] = useState<StagedAttachment | null>(null);
  const [showAttachModal, setShowAttachModal] = useState(false);
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // New Chat / Directory state (Tendik, Guru & Santri/Wali)
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [studentsDirectory, setStudentsDirectory] = useState<any[]>([]);
  const [employeesDirectory, setEmployeesDirectory] = useState<any[]>([]);
  const [directoryTab, setDirectoryTab] = useState<'employees' | 'students'>(isPrincipal ? 'employees' : 'students');
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directorySearch, setDirectorySearch] = useState('');

  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
  } | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const messagesCacheRef = useRef<Record<string, ChatMessage[]>>({});

  // Keyboard avoidance and visibility tracking
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
    // When keyboard is closed, floating bottom tab bar is visible (height ~72) -> keep composer cleanly above it
    return Math.max(bottomInset + 70, 96);
  }, [isKeyboardActive, keyboardHeight, rootLayoutHeight, bottomInset, insets.bottom]);

  // 1. Load Teacher Conversations, Employee Conversations & Education Units
  const loadConversations = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [teacherRes, empRes, empContactsRes] = await Promise.all([
        mobileApiService.getTeacherChatConversations().catch(() => []),
        mobileApiService.getEmployeeChatConversations().catch(() => []),
        mobileApiService.getEmployeeChatContacts().catch(() => []),
      ]);

      const rawTeacherList = unwrapApiData<TeacherConversation[]>(teacherRes) || (teacherRes as any)?.data || [];
      const cleanTeacherList: TeacherConversation[] = Array.isArray(rawTeacherList) ? rawTeacherList : [];

      const rawEmpList = unwrapApiData<any[]>(empRes) || (empRes as any)?.data || [];
      const cleanEmpList: TeacherConversation[] = Array.isArray(rawEmpList)
        ? rawEmpList.map((emp: any) => ({
            id: String(emp.user_id || emp.id),
            student_id: emp.student_id ? String(emp.student_id) : '',
            student_name: emp.student_name || '',
            parent_user_id: String(emp.user_id || emp.id),
            parent_name: emp.name || emp.parent_name || 'Rekan Pegawai',
            class_name: emp.position_name || emp.role || 'Pegawai',
            unit_name: emp.unit_name || '-',
            unit_id: emp.unit_id,
            teacher_type: 'pegawai',
            role_label: emp.position_name || emp.role || 'Pegawai',
            last_message: emp.last_message,
            last_message_at: emp.last_message_at,
            unread_count: emp.unread_count || 0,
            is_online: Boolean(emp.is_online),
            is_employee: true,
          }))
        : [];

      // Combine both lists with deduplication
      const combinedMap = new Map<string, TeacherConversation>();
      cleanEmpList.forEach((c) => combinedMap.set(c.id, c));

      // Also merge employee contacts from education unit so they are immediately available
      const rawContactsList = unwrapApiData<any[]>(empContactsRes) || (empContactsRes as any)?.data || [];
      const cleanContactsList = Array.isArray(rawContactsList) ? rawContactsList : [];
      setEmployeesDirectory(cleanContactsList);

      cleanContactsList.forEach((emp: any) => {
        const empId = String(emp.user_id || emp.id);
        if (!combinedMap.has(empId)) {
          combinedMap.set(empId, {
            id: empId,
            student_id: '',
            student_name: '',
            parent_user_id: empId,
            parent_name: emp.nama_lengkap || emp.name || 'Rekan Pegawai',
            class_name: emp.position_name || emp.position || emp.role || 'Tendik / Guru',
            unit_name: emp.unit_name || emp.unit?.name || '-',
            unit_id: emp.unit_id,
            teacher_type: 'pegawai',
            role_label: emp.position_name || emp.position || emp.role || 'Pegawai',
            last_message: emp.last_message || null,
            last_message_at: emp.last_message_at || null,
            unread_count: emp.unread_count || 0,
            is_online: Boolean(emp.is_online),
            is_employee: true,
          });
        }
      });

      cleanTeacherList.forEach((c) => {
        const key = c.student_id ? `${c.student_id}_${c.parent_user_id}` : c.id;
        combinedMap.set(key, c);
      });

      const cleanList = Array.from(combinedMap.values());
      cleanList.sort((a, b) => {
        const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
        const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
        if (timeA && timeB) return timeB - timeA;
        if (timeA) return -1;
        if (timeB) return 1;
        return (a.parent_name || '').localeCompare(b.parent_name || '');
      });

      setConversations(cleanList);

      const totalUnread = cleanList.reduce((sum, c) => sum + (c.unread_count || 0), 0);
      useChatBadgeStore.getState().setUnreadChatCount(totalUnread);

      // Collect unique Education Units from conversations
      const unitMap = new Map<string, string>();
      cleanList.forEach((c) => {
        if (c.unit_name && c.unit_name !== '-') {
          unitMap.set(c.unit_name, c.unit_name);
        }
      });

      // Also supplement from master education units if available
      try {
        const unitsRes = await mobileApiService.getEducationUnits();
        const unitsList = unwrapApiData<any[]>(unitsRes) || (unitsRes as any)?.data || [];
        if (Array.isArray(unitsList)) {
          unitsList.forEach((u) => {
            const uName = u.name || u.nama_unit || u.nama;
            if (uName) unitMap.set(uName, uName);
          });
        }
      } catch {
        // use derived units
      }

      setAvailableUnits(Array.from(unitMap.entries()).map(([k, v]) => ({ id: k, name: v })));
    } catch {
      // ignore
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  // Periodic polling for conversations list every 12 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      if (!selectedConvRef.current) {
        loadConversations(true);
      }
    }, 12000);
    return () => clearInterval(timer);
  }, [loadConversations]);

  // Load teacher students directory and employee contacts for "+ Chat Baru"
  const loadDirectory = useCallback(async () => {
    setDirectoryLoading(true);
    try {
      const [studentRes, empRes] = await Promise.all([
        mobileApiService.getTeacherStudents({ per_page: 250 }).catch(() => []),
        mobileApiService.getEmployeeChatContacts().catch(() => []),
      ]);

      const rawStudents = unwrapApiData<any>(studentRes) || (studentRes as any)?.data || [];
      const studentList = Array.isArray(rawStudents) ? rawStudents : (Array.isArray(rawStudents?.data) ? rawStudents.data : []);
      setStudentsDirectory(studentList);

      const rawEmployees = unwrapApiData<any>(empRes) || (empRes as any)?.data || [];
      const empList = Array.isArray(rawEmployees) ? rawEmployees : (Array.isArray(rawEmployees?.data) ? rawEmployees.data : []);
      setEmployeesDirectory(empList);
    } catch (err) {
      console.warn('Load directory error:', err);
    } finally {
      setDirectoryLoading(false);
    }
  }, []);

  const filteredDirectory = useMemo(() => {
    if (!directorySearch.trim()) return studentsDirectory;
    const q = directorySearch.toLowerCase();
    return studentsDirectory.filter((s: any) => {
      const sName = (s.full_name || s.nama_lengkap || s.name || '').toLowerCase();
      const pName = (s.parent?.full_name || s.parent?.name || s.nama_wali || '').toLowerCase();
      const cName = (s.kelas?.nama_kelas || s.kelas?.name || '').toLowerCase();
      return sName.includes(q) || pName.includes(q) || cName.includes(q);
    });
  }, [studentsDirectory, directorySearch]);

  const filteredEmployees = useMemo(() => {
    if (!directorySearch.trim()) return employeesDirectory;
    const q = directorySearch.toLowerCase();
    return employeesDirectory.filter((e: any) => {
      const name = (e.nama_lengkap || e.name || '').toLowerCase();
      const pos = (e.position_name || e.position || e.role || '').toLowerCase();
      const unit = (e.unit_name || e.unit?.name || '').toLowerCase();
      return name.includes(q) || pos.includes(q) || unit.includes(q);
    });
  }, [employeesDirectory, directorySearch]);

  const handleSelectEmployeeForChat = (employee: any) => {
    const empUserId = String(employee.user_id || employee.id);
    const empName = employee.nama_lengkap || employee.name || 'Rekan Pegawai';
    const posName = employee.position_name || employee.position || employee.role || 'Tendik / Guru';
    const unitName = employee.unit_name || employee.unit?.name || '-';

    const existing = conversations.find(
      (c) => (c.is_employee || !c.student_id) && String(c.parent_user_id || c.id) === String(empUserId)
    );

    if (existing) {
      setSelectedConv(existing);
    } else {
      const newConv: TeacherConversation = {
        id: empUserId,
        student_id: '',
        student_name: '',
        parent_user_id: empUserId,
        parent_name: empName,
        class_name: posName,
        unit_name: unitName,
        unit_id: employee.unit_id,
        teacher_type: 'pegawai',
        role_label: posName,
        last_message: null,
        last_message_at: null,
        unread_count: 0,
        is_online: Boolean(employee.is_online),
        is_employee: true,
      };
      setConversations((prev) => [newConv, ...prev.filter((c) => String(c.id) !== String(empUserId))]);
      setSelectedConv(newConv);
    }
    setShowNewChatModal(false);
  };

  const handleSelectStudentForChat = (student: any) => {
    const parent = student.parent || (student.parents && student.parents[0]) || (student.parents_pivot && student.parents_pivot[0]) || null;
    const parentUserId = parent?.user_id || parent?.user?.id || student.parent_user_id || null;
    const parentName = parent?.full_name || parent?.name || student.nama_wali || 'Orang Tua / Wali';
    const studentName = student.full_name || student.nama_lengkap || student.name || 'Santri';
    const className = student.kelas?.nama_kelas || student.kelas?.name || '-';
    const unitName = student.educationUnit?.name || student.kelas?.unitPendidikan?.name || '-';

    if (!parentUserId) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Akun Wali Belum Terhubung',
        message: `Data orang tua/wali dari santri ${studentName} belum memiliki akun portal pengguna yang aktif. Hubungi staf Tata Usaha untuk aktivasi akun orang tua.`,
      });
      return;
    }

    const existing = conversations.find(
      (c) => String(c.student_id) === String(student.id) && String(c.parent_user_id) === String(parentUserId)
    );

    if (existing) {
      setSelectedConv(existing);
    } else {
      const newConv: TeacherConversation = {
        id: `${student.id}_${parentUserId}`,
        student_id: String(student.id),
        student_name: studentName,
        parent_user_id: String(parentUserId),
        parent_name: parentName,
        class_name: className,
        unit_name: unitName,
        teacher_type: isPrincipal ? 'kepala_sekolah' : 'wali_kelas',
        role_label: isPrincipal ? 'Kepala Sekolah' : 'Wali Kelas',
        last_message: null,
        last_message_at: null,
        unread_count: 0,
      };
      setSelectedConv(newConv);
    }
    setShowNewChatModal(false);
  };

  // Auto-select conversation if navigated with params (e.g. from Notifications, Student profile, or Employee Attendance)
  useEffect(() => {
    const targetParentId = route?.params?.parentId || route?.params?.parent_user_id || route?.params?.targetParentId;
    const targetStudentId = route?.params?.studentId || route?.params?.student_id || route?.params?.targetStudentId;
    const targetTeacherId =
      route?.params?.teacherId ||
      route?.params?.recipientId ||
      route?.params?.targetUser?.user_id ||
      route?.params?.targetUser?.id ||
      route?.params?.contact?.user_id;

    // 1. Kasus Direct Chat ke Rekan Guru / Tendik / Pegawai (Tanpa konteks student)
    if (targetTeacherId && !targetStudentId) {
      if (conversations.length > 0) {
        const directMatch = conversations.find(
          (c: any) =>
            String(c.parent_user_id) === String(targetTeacherId) ||
            String(c.id) === String(targetTeacherId)
        );
        if (directMatch) {
          setSelectedConv(directMatch);
          return;
        }
      }

      const targetName =
        route?.params?.name ||
        route?.params?.targetUser?.nama ||
        route?.params?.targetUser?.name ||
        'Rekan Pegawai';
      const targetRole =
        route?.params?.targetUser?.jabatan ||
        route?.params?.targetUser?.role_type ||
        'Pegawai';
      const targetUnit =
        route?.params?.targetUser?.unit_name ||
        route?.params?.unitName ||
        '-';

      const virtualEmpConv: TeacherConversation = {
        id: String(targetTeacherId),
        student_id: '',
        student_name: '',
        parent_user_id: String(targetTeacherId),
        parent_name: targetName,
        class_name: targetRole,
        unit_name: targetUnit,
        teacher_type: 'pegawai',
        role_label: targetRole,
        is_employee: true,
        last_message: null,
        last_message_at: null,
        unread_count: 0,
      };
      setSelectedConv(virtualEmpConv);
      return;
    }

    // 2. Kasus Chat Guru ke Orang Tua Santri
    if (targetParentId || targetStudentId) {
      if (conversations.length > 0) {
        const match = conversations.find(
          (c) =>
            (targetStudentId && String(c.student_id) === String(targetStudentId)) ||
            (targetParentId && String(c.parent_user_id) === String(targetParentId))
        );
        if (match) {
          setSelectedConv(match);
          return;
        }
      }

      if (targetParentId && targetStudentId) {
        const virtualConv: TeacherConversation = {
          id: `${targetStudentId}_${targetParentId}`,
          student_id: String(targetStudentId),
          student_name: route?.params?.studentName || route?.params?.student_name || 'Santri',
          parent_user_id: String(targetParentId),
          parent_name: route?.params?.parentName || route?.params?.parent_name || 'Orang Tua / Wali',
          class_name: route?.params?.className || route?.params?.class_name || '-',
          unit_name: route?.params?.unitName || route?.params?.unit_name || '-',
          teacher_type: 'wali_kelas',
          role_label: 'Guru',
          last_message: null,
          last_message_at: null,
          unread_count: 0,
        };
        setSelectedConv(virtualConv);
      }
    }
  }, [route?.params, conversations]);

  // 2. Load Messages for Active Conversation
  const loadMessages = useCallback(async (silent = false) => {
    const active = selectedConvRef.current;
    if (!active) return;
    const isEmployeeChat = active.is_employee || !active.student_id;
    const recipientId = active.parent_user_id || active.id;
    if (!recipientId) return;

    const cacheKey = isEmployeeChat ? `emp_${recipientId}` : `${active.student_id}_${recipientId}`;
    const cached = messagesCacheRef.current[cacheKey];

    if (cached && cached.length > 0) {
      setMessages(cached);
      setMessagesLoading(false);
    } else if (!silent) {
      setMessagesLoading(true);
    }

    try {
      let incoming: any[] = [];
      if (isEmployeeChat) {
        const res = await mobileApiService.getEmployeeChatMessages(recipientId);
        incoming = Array.isArray(res)
          ? res
          : Array.isArray((res as any)?.data)
            ? (res as any).data
            : [];
      } else {
        const res = await mobileApiService.getTeacherChatMessages(active.parent_user_id, active.student_id);
        incoming = Array.isArray(res)
          ? res
          : Array.isArray((res as any)?.data)
            ? (res as any).data
            : Array.isArray((res as any)?.data?.data)
              ? (res as any).data.data
              : [];
      }
      const fresh: ChatMessage[] = incoming;

      setMessages(fresh);
      messagesCacheRef.current[cacheKey] = fresh;
    } catch (err) {
      console.warn('Load chat messages error:', err);
    } finally {
      if (!silent) setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedConv) {
      loadMessages(false);
      const msgTimer = setInterval(() => {
        loadMessages(true);
      }, 6000);
      return () => clearInterval(msgTimer);
    } else {
      setMessages([]);
    }
  }, [selectedConv, loadMessages]);

  // Handle Android hardware back press when room is open
  useEffect(() => {
    if (!selectedConv) return;
    const onBackPress = () => {
      setSelectedConv(null);
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [selectedConv]);

  // 3. Realtime WebSocket Listener
  useEffect(() => {
    if (!myUserId) return;
    const channel = `user.${myUserId}`;

    const unsubscribe = realtimeWs.subscribe(channel, (eventData) => {
      if (eventData.event === 'chat.message.sent') {
        const msg = eventData.payload;
        if (!msg) return;

        const currentActive = selectedConvRef.current;
        if (currentActive) {
          const isEmployeeChat = currentActive.is_employee || !currentActive.student_id;
          const targetId = currentActive.parent_user_id || currentActive.id;
          const isMatch = isEmployeeChat
            ? String(targetId) === String(msg.sender_user_id)
            : (String(currentActive.parent_user_id) === String(msg.sender_user_id) &&
               String(currentActive.student_id) === String(msg.student_id));

          if (isMatch) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
            setTimeout(() => {
              flatListRef.current?.scrollToEnd({ animated: true });
            }, 60);
          } else {
            loadConversations(true);
          }
        } else {
          loadConversations(true);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [myUserId, loadConversations]);

  // 4. Send Message
  const handleSend = async () => {
    if ((!inputText.trim() && !selectedAttachment) || !selectedConv || sending) return;
    const textToSend = inputText.trim();
    const attToSend = selectedAttachment;
    const tempId = `temp-${Date.now()}`;
    const isEmployeeChat = selectedConv.is_employee || !selectedConv.student_id;
    const recipientId = selectedConv.parent_user_id || selectedConv.id;
    const cacheKey = isEmployeeChat ? `emp_${recipientId}` : `${selectedConv.student_id}_${recipientId}`;

    const tempAtt: Attachment[] = attToSend ? [{
      id: `temp-att-${Date.now()}`,
      url: attToSend.uri,
      original_name: attToSend.name,
      file_type: attToSend.isImage ? 'image' : 'file',
      formatted_size: attToSend.size,
    }] : [];

    const optimistic: ChatMessage = {
      id: tempId,
      student_id: selectedConv.student_id || undefined,
      sender_user_id: String(myUserId || 'me'),
      recipient_user_id: recipientId,
      message: textToSend,
      attachments: tempAtt,
      created_at: new Date().toISOString(),
    };

    setInputText('');
    setSelectedAttachment(null);
    setMessages((prev) => [...prev, optimistic]);
    messagesCacheRef.current[cacheKey] = [...(messagesCacheRef.current[cacheKey] || []), optimistic];

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 40);

    setSending(true);
    try {
      let res: any;
      if (isEmployeeChat) {
        res = await mobileApiService.sendEmployeeChatMessage(
          recipientId,
          textToSend,
          attToSend
        );
      } else {
        res = await mobileApiService.sendTeacherChatMessage(
          selectedConv.parent_user_id,
          selectedConv.student_id,
          textToSend,
          attToSend
        );
      }

      const saved = unwrapApiData<ChatMessage>(res) || (res as any)?.data;
      if (saved && saved.id) {
        setMessages((prev) => prev.map((m) => (m.id === tempId ? saved : m)));
        if (messagesCacheRef.current[cacheKey]) {
          messagesCacheRef.current[cacheKey] = messagesCacheRef.current[cacheKey].map((m) =>
            m.id === tempId ? saved : m
          );
        }
      }
      loadConversations(true);
    } catch {
      loadMessages(true);
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Mengirim Pesan',
        message: 'Pesan gagal dikirim. Silakan cek koneksi internet Anda.',
      });
    } finally {
      setSending(false);
    }
  };

  // Attachment Pickers
  const handlePickCamera = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setFeedbackModal({
          visible: true,
          type: 'warning',
          title: 'Izin Kamera Diperlukan',
          message: 'Mohon izinkan akses kamera untuk mengambil gambar.',
        });
        return;
      }
      const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!res.canceled && res.assets && res.assets[0]) {
        const a = res.assets[0];
        setSelectedAttachment({
          uri: a.uri,
          name: a.fileName || `foto_${Date.now()}.jpg`,
          type: a.mimeType || 'image/jpeg',
          isImage: true,
        });
        setShowAttachModal(false);
      }
    } catch {}
  };

  const handlePickGallery = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setFeedbackModal({
          visible: true,
          type: 'warning',
          title: 'Izin Galeri Diperlukan',
          message: 'Mohon izinkan akses galeri untuk memilih gambar.',
        });
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!res.canceled && res.assets && res.assets[0]) {
        const a = res.assets[0];
        setSelectedAttachment({
          uri: a.uri,
          name: a.fileName || `gambar_${Date.now()}.jpg`,
          type: a.mimeType || 'image/jpeg',
          isImage: true,
        });
        setShowAttachModal(false);
      }
    } catch {}
  };

  const handlePickDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
        copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets && res.assets[0]) {
        const a = res.assets[0];
        setSelectedAttachment({
          uri: a.uri,
          name: a.name,
          type: a.mimeType || 'application/octet-stream',
          size: a.size ? `${(a.size / 1024).toFixed(0)} KB` : undefined,
          isImage: (a.mimeType || '').startsWith('image/'),
        });
        setShowAttachModal(false);
      }
    } catch {}
  };

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
    return `${apiHost}/storage${clean}`;
  };

  // Filtered list by search, unread, category, and unit pendidikan
  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (tabFilter === 'unread' && (!c.unread_count || c.unread_count <= 0)) {
        return false;
      }
      if (tabFilter === 'employees' && !c.is_employee) {
        return false;
      }
      if (tabFilter === 'parents' && c.is_employee) {
        return false;
      }
      if (selectedUnitFilter !== 'all') {
        const uName = (c.unit_name || '').toLowerCase();
        const sel = selectedUnitFilter.toLowerCase();
        if (uName !== sel && !uName.includes(sel)) {
          return false;
        }
      }
      if (!q) return true;
      const str = `${c.parent_name} ${c.student_name} ${c.class_name} ${c.unit_name || ''} ${c.last_message || ''}`.toLowerCase();
      return str.includes(q);
    });
  }, [conversations, search, tabFilter, selectedUnitFilter]);

  const employeeCount = useMemo(() => conversations.filter((c) => c.is_employee).length, [conversations]);
  const parentCount = useMemo(() => conversations.filter((c) => !c.is_employee).length, [conversations]);

  const totalUnreadCount = useMemo(() => {
    return conversations.reduce((acc, item) => acc + (item.unread_count || 0), 0);
  }, [conversations]);

  // ================= VIEW: CHAT ROOM DETAIL =================
  if (selectedConv) {
    return (
      <View style={styles.rootContainer} onLayout={handleRootLayout}>
        {/* ── Background Mosque & School (Identik Halaman Utama & Jadwal Pelajaran) ── */}
        <View style={styles.bgBackdrop} pointerEvents="none">
          <Image
            source={PARENT_HOME_BG}
            style={styles.bgImage}
            resizeMode="cover"
          />
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

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? topInset : 0}
        >
        {/* Chat Room Top Bar */}
        <View style={[styles.chatRoomHeader, { paddingTop: topInset + 6 }]}>
          <TouchableOpacity
            activeOpacity={0.75}
            style={styles.backButton}
            onPress={() => setSelectedConv(null)}
            accessibilityRole="button"
            accessibilityLabel="Kembali"
          >
            <MaterialCommunityIcons name="arrow-left" size={20} color="#064E3B" />
          </TouchableOpacity>

          <View style={styles.headerAvatarSquircle}>
            <Text style={styles.headerAvatarText}>
              {(selectedConv.parent_name || 'O')[0].toUpperCase()}
            </Text>
          </View>

          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text numberOfLines={1} style={styles.chatRoomTitle}>
              {selectedConv.parent_name || 'Rekan Pegawai'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1 }}>
              <MaterialCommunityIcons
                name={selectedConv.student_id ? 'school' : 'briefcase-outline'}
                size={12}
                color="#059669"
                style={{ marginRight: 3 }}
              />
              <Text numberOfLines={1} style={styles.chatRoomSubtitle}>
                {selectedConv.student_id
                  ? `${selectedConv.student_name} (${selectedConv.class_name}) • ${selectedConv.unit_name && selectedConv.unit_name !== '-' ? selectedConv.unit_name : 'Unit Pendidikan'}`
                  : `${selectedConv.class_name || 'Pegawai'} • ${selectedConv.unit_name && selectedConv.unit_name !== '-' ? selectedConv.unit_name : 'Civitas Sekolah'}`}
              </Text>
            </View>
          </View>

          <View style={styles.roleTagPill}>
            <Text style={styles.roleTagText}>
              {selectedConv.role_label || (selectedConv.student_id ? 'Guru' : 'Pegawai')}
            </Text>
          </View>
        </View>

        {/* Message Stream */}
        {messagesLoading && messages.length === 0 ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="small" color="#059669" />
            <Text style={styles.mutedLoadingText}>Memuat percakapan...</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            style={{ flex: 1 }}
            contentContainerStyle={styles.messagesList}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item, index }) => {
              const isOwn = String(item.sender_user_id) === String(myUserId);
              const senderDisplayName = isOwn
                ? 'Anda'
                : (item.sender?.name || selectedConv.parent_name || 'Orang Tua');
              return (
                <View
                  style={[
                    styles.messageRow,
                    isOwn ? styles.messageRowOwn : styles.messageRowOther,
                  ]}
                >
                  <View
                    style={[
                      styles.bubbleBox,
                      isOwn ? styles.bubbleOwn : styles.bubbleOther,
                    ]}
                  >
                    {/* Header Label Nama pada Isi Chat */}
                    <View style={[styles.senderLabelRow, isOwn ? styles.senderLabelRowOwn : styles.senderLabelRowOther]}>
                      {!isOwn && (
                        <Text style={styles.senderLabelOther}>
                          {senderDisplayName}
                        </Text>
                      )}
                      <View style={[styles.statusBadge, isOwn ? styles.statusBadgeOwn : styles.statusBadgeOther]}>
                        <Text style={[styles.statusBadgeText, isOwn ? styles.statusBadgeTextOwn : styles.statusBadgeTextOther]}>
                          {isOwn ? 'Balasan' : 'Pesan Masuk'}
                        </Text>
                      </View>
                      {isOwn && (
                        <Text style={styles.senderLabelOwn}>
                          {senderDisplayName}
                        </Text>
                      )}
                    </View>

                    {/* Attachments */}
                    {item.attachments && item.attachments.length > 0 && (
                      <View style={{ marginBottom: 6 }}>
                        {item.attachments.map((att: Attachment, aIdx: number) => {
                          const fullUrl = resolveAttachmentUrl(att.url || att.path);
                          const isImg = att.file_type === 'image' || (att.mime_type && att.mime_type.startsWith('image/'));
                          if (isImg) {
                            return (
                              <TouchableOpacity
                                key={att.id || aIdx}
                                activeOpacity={0.85}
                                onPress={() => setPreviewImageUri(fullUrl)}
                                style={styles.attImageWrapper}
                              >
                                <Image source={{ uri: fullUrl }} style={styles.attImage} resizeMode="cover" />
                              </TouchableOpacity>
                            );
                          }
                          return (
                            <View key={att.id || aIdx} style={[styles.attDocBox, isOwn ? styles.attDocBoxOwn : styles.attDocBoxOther]}>
                              <MaterialCommunityIcons
                                name="file-document-outline"
                                size={20}
                                color={isOwn ? '#FFFFFF' : '#2563EB'}
                              />
                              <Text numberOfLines={1} style={[styles.attDocName, { color: isOwn ? '#FFFFFF' : '#1E3A8A' }]}>
                                {att.original_name || 'Lampiran Berkas'}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {(() => {
                      const messageText = item.message ?? (item as any).content ?? (item as any).pesan ?? (item as any).text ?? '';
                      return Boolean(messageText && String(messageText).trim()) ? (
                        <Text style={[styles.messageText, isOwn ? styles.messageTextOwn : styles.messageTextOther]}>
                          {messageText}
                        </Text>
                      ) : null;
                    })()}

                    <View style={styles.messageFooterRow}>
                      <Text style={[styles.timeText, isOwn ? styles.timeTextOwn : styles.timeTextOther]}>
                        {formatChatTime(item.created_at)}
                      </Text>
                      {isOwn && (
                        <MaterialCommunityIcons
                          name={item.read_at ? 'check-all' : 'check'}
                          size={14}
                          color={item.read_at ? '#93C5FD' : '#A7F3D0'}
                          style={{ marginLeft: 4 }}
                        />
                      )}
                    </View>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyChatBox}>
                <MaterialCommunityIcons name="chat-outline" size={44} color="#94A3B8" />
                <Text style={styles.emptyChatTitle}>Mulai Percakapan Baru</Text>
                <Text style={styles.emptyChatDesc}>
                  Belum ada pesan tercatat dengan wali santri ini. Kirimkan pesan konsultasi atau informasi akademik pertama Anda.
                </Text>
              </View>
            }
          />
        )}

        {/* Selected Attachment Preview Bar */}
        {selectedAttachment && (
          <View style={styles.stagedAttBar}>
            <MaterialCommunityIcons
              name={selectedAttachment.isImage ? 'image' : 'file-document'}
              size={20}
              color="#059669"
            />
            <Text numberOfLines={1} style={styles.stagedAttText}>
              {selectedAttachment.name}
            </Text>
            <TouchableOpacity onPress={() => setSelectedAttachment(null)}>
              <MaterialCommunityIcons name="close-circle" size={18} color="#EF4444" />
            </TouchableOpacity>
          </View>
        )}

        {/* Input Composer */}
        <View style={[styles.composerContainer, { paddingBottom: composerBottomPadding }]}>
          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.attachBtn}
            onPress={() => setShowAttachModal(true)}
          >
            <MaterialCommunityIcons name="paperclip" size={22} color="#64748B" />
          </TouchableOpacity>

          <TextInput
            style={styles.textInput}
            placeholder="Tulis pesan untuk orang tua..."
            placeholderTextColor="#94A3B8"
            selectionColor="#059669"
            value={inputText}
            onChangeText={setInputText}
            multiline
            blurOnSubmit={false}
            maxLength={2000}
            onFocus={() => {
              setInputFocused(true);
              setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
              }, 120);
            }}
            onBlur={() => setInputFocused(false)}
          />

          <TouchableOpacity
            activeOpacity={0.8}
            style={[
              styles.sendBtn,
              (!inputText.trim() && !selectedAttachment) || sending ? styles.sendBtnDisabled : null,
            ]}
            disabled={(!inputText.trim() && !selectedAttachment) || sending}
            onPress={handleSend}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <MaterialCommunityIcons name="send" size={18} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

        {/* Attachment Picker Sheet Modal */}
        <Modal visible={showAttachModal} transparent animationType="fade" onRequestClose={() => setShowAttachModal(false)}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowAttachModal(false)}
          >
            <View style={styles.sheetBox}>
              <Text style={styles.sheetTitle}>Pilih Lampiran Berkas</Text>
              <View style={styles.sheetOptionsRow}>
                <TouchableOpacity style={styles.sheetOptionItem} onPress={handlePickCamera}>
                  <View style={[styles.sheetIconBox, { backgroundColor: '#ECFDF5' }]}>
                    <MaterialCommunityIcons name="camera" size={24} color="#059669" />
                  </View>
                  <Text style={styles.sheetOptionLabel}>Kamera</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.sheetOptionItem} onPress={handlePickGallery}>
                  <View style={[styles.sheetIconBox, { backgroundColor: '#EFF6FF' }]}>
                    <MaterialCommunityIcons name="image" size={24} color="#2563EB" />
                  </View>
                  <Text style={styles.sheetOptionLabel}>Galeri</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.sheetOptionItem} onPress={handlePickDocument}>
                  <View style={[styles.sheetIconBox, { backgroundColor: '#FEF3C7' }]}>
                    <MaterialCommunityIcons name="file-document" size={24} color="#D97706" />
                  </View>
                  <Text style={styles.sheetOptionLabel}>Dokumen</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Lightbox Image Preview Modal */}
        <Modal visible={Boolean(previewImageUri)} transparent animationType="fade" onRequestClose={() => setPreviewImageUri(null)}>
          <View style={styles.lightboxBackdrop}>
            <TouchableOpacity style={styles.lightboxCloseBtn} onPress={() => setPreviewImageUri(null)}>
              <MaterialCommunityIcons name="close" size={28} color="#FFFFFF" />
            </TouchableOpacity>
            {Boolean(previewImageUri) && (
              <Image source={{ uri: previewImageUri! }} style={styles.lightboxImage} resizeMode="contain" />
            )}
          </View>
        </Modal>
      </View>
    );
  }

  // ================= VIEW: CONVERSATIONS LIST =================
  return (
    <View style={styles.rootContainer}>
      {/* ── Background Mosque & School (Identik Halaman Utama & Jadwal Pelajaran) ── */}
      <View style={styles.bgBackdrop} pointerEvents="none">
        <Image
          source={PARENT_HOME_BG}
          style={styles.bgImage}
          resizeMode="cover"
        />
        {/* Overlay gradien berbasis warna #18A165 identik dengan Jadwal Pelajaran & Halaman Utama */}
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

      {/* ── TOP HEADER IDENTIK HALAMAN JADWAL PELAJARAN TU & KISI-KISI UJIAN ── */}
      <View style={[styles.headerContainer, { paddingTop: topInset + 6 }]}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            activeOpacity={0.75}
            style={styles.backButton}
            onPress={() => {
              if (navigation?.canGoBack?.()) {
                navigation.goBack();
              } else {
                navigation?.navigate?.('Beranda');
              }
            }}
            accessibilityRole="button"
            accessibilityLabel="Kembali"
          >
            <MaterialCommunityIcons name="arrow-left" size={20} color="#064E3B" />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <View style={styles.headerBadge}>
              <View style={styles.pulseDot} />
              <Text style={styles.headerBadgeText} numberOfLines={1} ellipsizeMode="tail">
                {isPrincipal
                  ? 'KEPALA SEKOLAH • KOMUNIKASI TENDIK'
                  : isTu
                  ? 'TATA USAHA • LAYANAN ADMINISTRASI'
                  : 'GURU PENGAMPU • RUANG KONSULTASI'}
              </Text>
            </View>
            <Text style={styles.headerMainTitle} numberOfLines={1}>
              {isPrincipal ? 'Pusat Komunikasi & Tendik' : isTu ? 'Layanan Administrasi & Staf' : 'Komunikasi Orang Tua'}
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {isPrincipal
                ? 'Koordinasi Tendik & Wali Santri'
                : isTu
                ? 'Layanan Administrasi & Koordinasi Staf'
                : 'Konsultasi Belajar Santri'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.newChatHeaderBtn}
              onPress={() => {
                setShowNewChatModal(true);
                void loadDirectory();
              }}
              accessibilityRole="button"
              accessibilityLabel="Chat Baru"
            >
              <MaterialCommunityIcons name="chat-plus" size={16} color="#059669" style={{ marginRight: 4 }} />
              <Text style={styles.newChatHeaderBtnText}>+ Chat</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.refreshButton}
              onPress={() => {
                void loadConversations();
              }}
              accessibilityRole="button"
              accessibilityLabel="Muat Ulang"
            >
              <MaterialCommunityIcons name="refresh" size={20} color="#064E3B" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={20} color="#059669" />
          <TextInput
            style={styles.searchInput}
            placeholder={
              isPrincipal
                ? 'Cari guru, tendik, wali santri, atau kelas...'
                : 'Cari wali santri, anak, atau kelas...'
            }
            placeholderTextColor="#94A3B8"
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Filter Pills with Horizontal Scroll */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
        >
          <TouchableOpacity
            style={[styles.tabBtn, tabFilter === 'all' && styles.tabBtnActive]}
            onPress={() => setTabFilter('all')}
          >
            <Text style={[styles.tabBtnText, tabFilter === 'all' && styles.tabBtnTextActive]}>
              Semua ({conversations.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, tabFilter === 'employees' && styles.tabBtnActive]}
            onPress={() => setTabFilter('employees')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <MaterialCommunityIcons
                name="badge-account-outline"
                size={13}
                color={tabFilter === 'employees' ? '#FFFFFF' : '#047857'}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.tabBtnText, tabFilter === 'employees' && styles.tabBtnTextActive]}>
                Tendik & Guru ({employeeCount})
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, tabFilter === 'parents' && styles.tabBtnActive]}
            onPress={() => setTabFilter('parents')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <MaterialCommunityIcons
                name="school-outline"
                size={13}
                color={tabFilter === 'parents' ? '#FFFFFF' : '#047857'}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.tabBtnText, tabFilter === 'parents' && styles.tabBtnTextActive]}>
                Wali Santri ({parentCount})
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, tabFilter === 'unread' && styles.tabBtnActive]}
            onPress={() => setTabFilter('unread')}
          >
            <Text style={[styles.tabBtnText, tabFilter === 'unread' && styles.tabBtnTextActive]}>
              Belum Dibaca {totalUnreadCount > 0 ? `(${totalUnreadCount})` : ''}
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Horizontal Unit Pendidikan Filter Chips */}
        {availableUnits.length > 0 && (
          <View style={styles.unitFilterContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.unitFilterScroll}
            >
              <TouchableOpacity
                activeOpacity={0.75}
                style={[
                  styles.unitChip,
                  selectedUnitFilter === 'all' && styles.unitChipActive,
                ]}
                onPress={() => setSelectedUnitFilter('all')}
              >
                <MaterialCommunityIcons
                  name="domain"
                  size={13}
                  color={selectedUnitFilter === 'all' ? '#FFFFFF' : '#0284C7'}
                  style={{ marginRight: 4 }}
                />
                <Text
                  style={[
                    styles.unitChipText,
                    selectedUnitFilter === 'all' && styles.unitChipTextActive,
                  ]}
                >
                  Semua Unit
                </Text>
              </TouchableOpacity>

              {availableUnits.map((u) => {
                const isActive = selectedUnitFilter === u.name;
                return (
                  <TouchableOpacity
                    key={u.id}
                    activeOpacity={0.75}
                    style={[
                      styles.unitChip,
                      isActive && styles.unitChipActive,
                    ]}
                    onPress={() => setSelectedUnitFilter(isActive ? 'all' : u.name)}
                  >
                    <MaterialCommunityIcons
                      name="school-outline"
                      size={13}
                      color={isActive ? '#FFFFFF' : '#475569'}
                      style={{ marginRight: 4 }}
                    />
                    <Text
                      style={[
                        styles.unitChipText,
                        isActive && styles.unitChipTextActive,
                      ]}
                    >
                      {u.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Guidance Info Banner */}
        <View style={styles.infoBanner}>
          <MaterialCommunityIcons name="information-outline" size={15} color="#047857" style={{ marginRight: 6 }} />
          <Text style={styles.infoBannerText}>
            Ketuk kontak untuk membuka obrolan & mulai koordinasi pesan.
          </Text>
        </View>
      </View>

      {/* Conversations List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#059669" />
          <Text style={styles.mutedLoadingText}>Memuat daftar kontak orang tua...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredConversations}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void loadConversations();
              }}
              colors={['#059669']}
            />
          }
          contentContainerStyle={[styles.convListContent, { paddingBottom: bottomInset + 80 }]}
          renderItem={({ item }) => {
            const hasUnread = (item.unread_count || 0) > 0;
            return (
              <TouchableOpacity
                activeOpacity={0.82}
                style={[styles.convCard, hasUnread ? styles.convCardUnread : null]}
                onPress={() => setSelectedConv(item)}
              >
                <View style={[styles.avatarSquircle, item.is_employee ? { backgroundColor: '#F0FDF4' } : null, hasUnread ? styles.avatarSquircleUnread : null]}>
                  <Text style={[styles.avatarText, item.is_employee ? { color: '#059669' } : null]}>
                    {(item.parent_name || 'O')[0].toUpperCase()}
                  </Text>
                  {item.is_online && (
                    <View style={styles.onlineDotIndicator} />
                  )}
                </View>

                <View style={styles.convMainInfo}>
                  <View style={styles.cardHeaderRow}>
                    <Text numberOfLines={1} style={[styles.parentName, hasUnread && styles.parentNameBold]}>
                      {item.parent_name}
                    </Text>
                    <Text style={[styles.msgTime, hasUnread && styles.msgTimeUnread]}>
                      {formatChatTime(item.last_message_at)}
                    </Text>
                  </View>

                  <View style={styles.studentBadgeRow}>
                    {item.is_employee ? (
                      <View style={[styles.miniStudentPill, { backgroundColor: '#F0FDF4' }]}>
                        <MaterialCommunityIcons name="briefcase-outline" size={11} color="#059669" style={{ marginRight: 3 }} />
                        <Text numberOfLines={1} style={[styles.miniStudentText, { color: '#047857' }]}>
                          {item.class_name || 'Tendik / Guru'}
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.miniStudentPill}>
                        <MaterialCommunityIcons name="account-child" size={11} color="#059669" style={{ marginRight: 3 }} />
                        <Text numberOfLines={1} style={styles.miniStudentText}>
                          {item.student_name} • {item.class_name}
                        </Text>
                      </View>
                    )}
                    {item.unit_name && item.unit_name !== '-' && (
                      <View style={styles.miniUnitPill}>
                        <MaterialCommunityIcons name="office-building" size={10} color="#0284C7" style={{ marginRight: 3 }} />
                        <Text numberOfLines={1} style={styles.miniUnitText}>
                          {item.unit_name}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.lastMsgRow}>
                    <Text numberOfLines={1} style={[styles.lastMsgText, hasUnread && styles.lastMsgUnread]}>
                      {item.last_message || 'Belum ada pesan. Ketuk untuk mulai obrolan.'}
                    </Text>
                  </View>
                </View>

                <View style={styles.convRightAction}>
                  {hasUnread ? (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>
                        {(item.unread_count ?? 0) > 99 ? '99+' : item.unread_count}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.convChevronBox}>
                      <MaterialCommunityIcons name="chevron-right" size={18} color="#94A3B8" />
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 16 }}>
              <EmptyStateCard
                icon="account-group-outline"
                title={
                  tabFilter === 'employees'
                    ? 'Tidak ada kontak tendik & guru'
                    : tabFilter === 'parents'
                    ? 'Tidak ada kontak wali santri'
                    : 'Tidak ada kontak obrolan'
                }
                description={
                  search
                    ? 'Tidak ditemukan kontak dengan kata kunci pencarian tersebut.'
                    : isPrincipal
                    ? 'Belum ada kontak guru, tendik, atau wali santri pada unit ini.'
                    : 'Belum ada obrolan aktif dengan wali santri.'
                }
              />
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.emptyActionBtn}
                onPress={() => {
                  setShowNewChatModal(true);
                  void loadDirectory();
                }}
              >
                <MaterialCommunityIcons name="chat-plus" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.emptyActionBtnText}>Mulai Chat Baru dengan Wali Santri</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {feedbackModal && (
        <AppFeedbackModal
          visible={feedbackModal.visible}
          type={feedbackModal.type}
          title={feedbackModal.title}
          message={feedbackModal.message}
          onClose={() => setFeedbackModal(null)}
        />
      )}

      {/* Modal: Mulai Chat Baru / Pilih Santri & Wali */}
      <Modal
        visible={showNewChatModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNewChatModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.newChatSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.newChatHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.newChatTitle}>Mulai Percakapan Baru</Text>
                <Text style={styles.newChatSubtitle}>
                  {isPrincipal
                    ? 'Pilih tendik, guru unit, atau wali santri untuk membuka obrolan'
                    : 'Pilih rekan kerja atau wali santri untuk membuka obrolan'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowNewChatModal(false)}
                style={styles.closeModalBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Segmented Tab: Tendik & Guru vs Wali Santri */}
            <View style={styles.directoryTabRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                style={[
                  styles.directoryTabBtn,
                  directoryTab === 'employees' && styles.directoryTabBtnActive,
                ]}
                onPress={() => setDirectoryTab('employees')}
              >
                <MaterialCommunityIcons
                  name="badge-account-outline"
                  size={15}
                  color={directoryTab === 'employees' ? '#059669' : '#64748B'}
                  style={{ marginRight: 5 }}
                />
                <Text
                  style={[
                    styles.directoryTabBtnText,
                    directoryTab === 'employees' && styles.directoryTabBtnTextActive,
                  ]}
                >
                  Tendik & Guru ({filteredEmployees.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                style={[
                  styles.directoryTabBtn,
                  directoryTab === 'students' && styles.directoryTabBtnActive,
                ]}
                onPress={() => setDirectoryTab('students')}
              >
                <MaterialCommunityIcons
                  name="school-outline"
                  size={15}
                  color={directoryTab === 'students' ? '#059669' : '#64748B'}
                  style={{ marginRight: 5 }}
                />
                <Text
                  style={[
                    styles.directoryTabBtnText,
                    directoryTab === 'students' && styles.directoryTabBtnTextActive,
                  ]}
                >
                  Wali Santri ({filteredDirectory.length})
                </Text>
              </TouchableOpacity>
            </View>

            {/* Search Input for Directory */}
            <View style={styles.directorySearchBar}>
              <MaterialCommunityIcons name="magnify" size={18} color="#94A3B8" />
              <TextInput
                style={styles.directorySearchInput}
                placeholder={
                  directoryTab === 'employees'
                    ? 'Cari nama tendik, guru, jabatan, atau unit...'
                    : 'Cari santri, kelas, atau orang tua...'
                }
                placeholderTextColor="#94A3B8"
                value={directorySearch}
                onChangeText={setDirectorySearch}
              />
              {directorySearch ? (
                <TouchableOpacity onPress={() => setDirectorySearch('')}>
                  <MaterialCommunityIcons name="close-circle" size={16} color="#94A3B8" />
                </TouchableOpacity>
              ) : null}
            </View>

            {directoryLoading ? (
              <View style={styles.directoryLoadingBox}>
                <ActivityIndicator size="small" color="#059669" />
                <Text style={styles.directoryLoadingText}>
                  {directoryTab === 'employees' ? 'Memuat direktori tendik & guru...' : 'Memuat direktori santri...'}
                </Text>
              </View>
            ) : directoryTab === 'employees' ? (
              filteredEmployees.length === 0 ? (
                <View style={styles.directoryEmptyBox}>
                  <MaterialCommunityIcons name="account-search-outline" size={36} color="#94A3B8" />
                  <Text style={styles.directoryEmptyTitle}>Tendik / Guru Tidak Ditemukan</Text>
                  <Text style={styles.directoryEmptySub}>
                    {directorySearch
                      ? 'Coba kata kunci pencarian yang lain.'
                      : 'Belum ada data tenaga kependidikan atau guru di unit ini.'}
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={filteredEmployees}
                  keyExtractor={(item) => String(item.user_id || item.id)}
                  keyboardShouldPersistTaps="handled"
                  style={{ maxHeight: 360 }}
                  renderItem={({ item }) => {
                    const empName = item.nama_lengkap || item.name || 'Pegawai';
                    const posName = item.position_name || item.position || item.role || 'Tendik / Guru';
                    const unitName = item.unit_name || item.unit?.name || '-';
                    const isOnline = Boolean(item.is_online);

                    return (
                      <TouchableOpacity
                        activeOpacity={0.7}
                        style={styles.directoryItem}
                        onPress={() => handleSelectEmployeeForChat(item)}
                      >
                        <View style={[styles.directoryAvatar, { backgroundColor: '#F0FDF4' }]}>
                          <Text style={[styles.directoryAvatarText, { color: '#059669' }]}>
                            {(empName || 'P')[0].toUpperCase()}
                          </Text>
                          {isOnline && <View style={styles.onlineDotIndicator} />}
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text numberOfLines={1} style={styles.directoryStudentName}>
                              {empName}
                            </Text>
                            <View style={[styles.miniStatusBadge, { backgroundColor: isOnline ? '#DEF7EC' : '#F1F5F9' }]}>
                              <Text style={[styles.miniStatusText, { color: isOnline ? '#059669' : '#94A3B8' }]}>
                                {isOnline ? 'Online' : 'Offline'}
                              </Text>
                            </View>
                          </View>
                          <Text numberOfLines={1} style={styles.directoryParentName}>
                            Jabatan: <Text style={{ fontWeight: '700', color: '#0F172A' }}>{posName}</Text>
                          </Text>
                          <Text numberOfLines={1} style={styles.directoryClassText}>
                            Unit: {unitName}
                          </Text>
                        </View>
                        <View style={styles.directorySelectBtn}>
                          <MaterialCommunityIcons name="chat-outline" size={14} color="#059669" />
                          <Text style={styles.directorySelectBtnText}>Pilih</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                />
              )
            ) : filteredDirectory.length === 0 ? (
              <View style={styles.directoryEmptyBox}>
                <MaterialCommunityIcons name="account-search-outline" size={36} color="#94A3B8" />
                <Text style={styles.directoryEmptyTitle}>Santri Tidak Ditemukan</Text>
                <Text style={styles.directoryEmptySub}>
                  {directorySearch
                    ? 'Coba kata kunci pencarian yang lain.'
                    : isPrincipal
                      ? 'Belum ada data santri atau orang tua di unit pendidikan ini.'
                      : 'Belum ada data santri pada kelas yang diampu.'}
                </Text>
              </View>
            ) : (
              <FlatList
                data={filteredDirectory}
                keyExtractor={(item) => String(item.id || item.student_id)}
                keyboardShouldPersistTaps="handled"
                style={{ maxHeight: 360 }}
                renderItem={({ item }) => {
                  const parent = item.parent || (item.parents && item.parents[0]);
                  const parentName = parent?.full_name || parent?.name || item.nama_wali || 'Orang Tua / Wali';
                  const studentName = item.full_name || item.nama_lengkap || item.name || 'Santri';
                  const className = item.kelas?.nama_kelas || item.kelas?.name || '-';
                  const unitName = item.educationUnit?.name || item.kelas?.unitPendidikan?.name || '-';

                  return (
                    <TouchableOpacity
                      activeOpacity={0.7}
                      style={styles.directoryItem}
                      onPress={() => handleSelectStudentForChat(item)}
                    >
                      <View style={styles.directoryAvatar}>
                        <Text style={styles.directoryAvatarText}>
                          {(studentName || 'S')[0].toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text numberOfLines={1} style={styles.directoryStudentName}>
                          {studentName}
                        </Text>
                        <Text numberOfLines={1} style={styles.directoryParentName}>
                          Wali: <Text style={{ fontWeight: '700', color: '#0F172A' }}>{parentName}</Text>
                        </Text>
                        <Text numberOfLines={1} style={styles.directoryClassText}>
                          {className} • {unitName}
                        </Text>
                      </View>
                      <View style={styles.directorySelectBtn}>
                        <MaterialCommunityIcons name="chat-outline" size={14} color="#059669" />
                        <Text style={styles.directorySelectBtnText}>Pilih</Text>
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#F0FDF4',
  },
  container: {
    flex: 1,
    backgroundColor: '#F0FDF4',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  mutedLoadingText: {
    marginTop: 10,
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
  },

  /* ── Background Mosque & School (Identik Halaman Utama, Jadwal & Kisi-Kisi) ── */
  bgBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 480,
    width: '100%',
  },
  bgImage: {
    width: '100%',
    height: '100%',
    opacity: 0.45,
  },

  // ── Top Header Identik Jadwal Pelajaran & LMS Nilai/Rapor ──
  headerContainer: {
    zIndex: 10,
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: 'transparent',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: 5,
    marginBottom: 2,
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
  },
  headerBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#047857',
    letterSpacing: 0.3,
  },
  headerMainTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#064E3B',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
    marginTop: 1,
    textAlign: 'center',
  },
  newChatHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  newChatHeaderBtnText: {
    color: '#059669',
    fontSize: 11.5,
    fontWeight: '800',
  },
  refreshButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 12,
    height: 42,
    shadowColor: '#064E3B',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 12.5,
    color: '#0F172A',
    marginLeft: 6,
    paddingVertical: 0,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 8,
    paddingBottom: 2,
  },
  tabBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  tabBtnActive: {
    backgroundColor: '#059669',
    borderColor: '#047857',
    shadowColor: '#059669',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tabBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },
  tabBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  unitFilterContainer: {
    marginTop: 6,
  },
  unitFilterScroll: {
    flexDirection: 'row',
    gap: 6,
    paddingRight: 10,
  },
  unitChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  unitChipActive: {
    backgroundColor: '#059669',
    borderColor: '#047857',
  },
  unitChipText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#065F46',
  },
  unitChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  convListContent: {
    padding: 14,
    gap: 10,
  },
  convCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
    marginBottom: 4,
  },
  convCardUnread: {
    borderColor: '#6EE7B7',
    backgroundColor: '#F0FDF4',
  },
  avatarSquircle: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: '#059669',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarSquircleUnread: {
    backgroundColor: '#047857',
    borderWidth: 2,
    borderColor: '#A7F3D0',
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 18,
  },
  convMainInfo: {
    flex: 1,
    marginLeft: 12,
    minWidth: 0,
    justifyContent: 'center',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  parentName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
    marginRight: 8,
  },
  parentNameBold: {
    fontWeight: '900',
    color: '#064E3B',
  },
  msgTime: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
  },
  msgTimeUnread: {
    color: '#059669',
    fontWeight: '800',
  },
  studentBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  miniStudentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 7,
    borderWidth: 0.5,
    borderColor: '#A7F3D0',
    maxWidth: '85%',
  },
  miniStudentText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#047857',
  },
  miniUnitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 7,
    borderWidth: 0.5,
    borderColor: '#BAE6FD',
    maxWidth: '50%',
  },
  miniUnitText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#0284C7',
  },
  lastMsgRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lastMsgText: {
    fontSize: 11.5,
    color: '#94A3B8',
    flex: 1,
    lineHeight: 16,
  },
  lastMsgUnread: {
    color: '#047857',
    fontWeight: '700',
  },
  convRightAction: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  convChevronBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadge: {
    backgroundColor: '#EF4444',
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  // Chat Room Detail Styles
  chatRoomHeader: {
    width: '100%',
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#A7F3D0',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 10,
  },
  heroSquircleBtn: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    shadowColor: '#064E3B',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginRight: 8,
  },
  headerAvatarSquircle: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAvatarText: {
    color: '#047857',
    fontWeight: '900',
    fontSize: 17,
  },
  chatRoomTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#064E3B',
    letterSpacing: -0.2,
  },
  chatRoomSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
  },
  roleTagPill: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  roleTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
  },
  messagesList: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  messageRowOwn: {
    justifyContent: 'flex-end',
  },
  messageRowOther: {
    justifyContent: 'flex-start',
  },
  bubbleBox: {
    maxWidth: '82%',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  bubbleOwn: {
    backgroundColor: '#059669',
    borderTopRightRadius: 2,
    borderWidth: 1,
    borderColor: '#047857',
  },
  bubbleOther: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderTopLeftRadius: 2,
  },
  senderLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    gap: 6,
  },
  senderLabelRowOwn: {
    justifyContent: 'flex-end',
    borderBottomColor: 'rgba(255,255,255,0.2)',
  },
  senderLabelRowOther: {
    justifyContent: 'flex-start',
    borderBottomColor: '#DBEAFE',
  },
  senderLabelOwn: {
    fontSize: 11,
    fontWeight: '800',
    color: '#D1FAE5',
  },
  senderLabelOther: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 8,
  },
  statusBadgeOwn: {
    backgroundColor: '#047857',
  },
  statusBadgeOther: {
    backgroundColor: '#DBEAFE',
  },
  statusBadgeText: {
    fontSize: 8.5,
    fontWeight: '700',
  },
  statusBadgeTextOwn: {
    color: '#D1FAE5',
  },
  statusBadgeTextOther: {
    color: '#1D4ED8',
  },
  messageText: {
    fontSize: 13,
    lineHeight: 18,
  },
  messageTextOwn: {
    color: '#FFFFFF',
  },
  messageTextOther: {
    color: '#1E293B',
  },
  messageFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  timeText: {
    fontSize: 9.5,
  },
  timeTextOwn: {
    color: '#D1FAE5',
  },
  timeTextOther: {
    color: '#3B82F6',
  },
  attImageWrapper: {
    borderRadius: 10,
    overflow: 'hidden',
    maxHeight: 180,
    maxWidth: 240,
  },
  attImage: {
    width: 220,
    height: 150,
  },
  attDocBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  attDocBoxOwn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  attDocBoxOther: {
    backgroundColor: '#DBEAFE',
  },
  attDocName: {
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  emptyChatBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    paddingHorizontal: 24,
  },
  emptyChatTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 10,
  },
  emptyChatDesc: {
    fontSize: 11.5,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
  stagedAttBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#BBF7D0',
    gap: 8,
  },
  stagedAttText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#065F46',
  },
  composerContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 8,
    flexShrink: 0,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 12,
    zIndex: 99,
  },
  attachBtn: {
    padding: 8,
    marginBottom: 2,
  },
  textInput: {
    flex: 1,
    minHeight: 42,
    backgroundColor: '#F1F5F9',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 8,
    fontSize: 13,
    lineHeight: 18,
    color: '#0F172A',
    maxHeight: 100,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  sendBtn: {
    backgroundColor: '#059669',
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  sendBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
  // Sheet Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheetBox: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
  },
  sheetTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 16,
  },
  sheetOptionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  sheetOptionItem: {
    alignItems: 'center',
  },
  sheetIconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  sheetOptionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  // Lightbox
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxCloseBtn: {
    position: 'absolute',
    top: 48,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  lightboxImage: {
    width: SCREEN_WIDTH - 24,
    height: '75%',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 8,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 11,
    color: '#065F46',
    fontWeight: '600',
    lineHeight: 15,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    marginTop: 14,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  emptyActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },
  newChatSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 12,
    maxHeight: '85%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#CBD5E1',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  newChatHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  newChatTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  newChatSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  closeModalBtn: {
    padding: 6,
  },
  directoryTabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 3,
    marginBottom: 10,
    gap: 4,
  },
  directoryTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 9,
    gap: 6,
  },
  directoryTabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  directoryTabBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
  },
  directoryTabBtnTextActive: {
    color: '#059669',
    fontWeight: '800',
  },
  directorySearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 38,
    marginBottom: 12,
  },
  directorySearchInput: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
    marginLeft: 6,
  },
  directoryLoadingBox: {
    paddingVertical: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  directoryLoadingText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 8,
    fontWeight: '600',
  },
  directoryEmptyBox: {
    paddingVertical: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  directoryEmptyTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
    marginTop: 8,
  },
  directoryEmptySub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 3,
  },
  directoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  directoryAvatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  directoryAvatarText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0369A1',
  },
  directoryStudentName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  directoryParentName: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  directoryClassText: {
    fontSize: 10,
    color: '#059669',
    fontWeight: '600',
    marginTop: 1,
  },
  directorySelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    gap: 4,
  },
  directorySelectBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
  },
  onlineDotIndicator: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  miniStatusBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  miniStatusText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
});

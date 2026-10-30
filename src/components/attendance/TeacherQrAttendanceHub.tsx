import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AttendancePayload, mobileApiService, unwrapApiData, unwrapCollection } from '../../services/mobileApiService';
import { getApiErrorMessage } from '../../services/api';
import { getProfileImageUrl, DEFAULT_PARENT_AVATAR, DEFAULT_STUDENT_BOY_AVATAR, DEFAULT_STUDENT_GIRL_AVATAR, isGirlStudent } from '../../utils/profile';
import { getDynamicAcademicYear } from '../../utils/academicYear';
import { AppFeedbackModal, FeedbackType } from '../AppFeedbackModal';
import { AttendanceRejectedModal, AttendanceRejectionDetails } from './AttendanceRejectedModal';
import { useNavigationHistoryStore } from '../../stores/navigationHistoryStore';
import { useMobileConfigStore } from '../../stores/mobileConfigStore';
import { resolveUnitName } from '../../utils/employeeUtils';
import { isTeacherRole, isTuRole } from '../../utils/roles';

// Safe dynamic loader for expo-location to prevent crashing if native module ExpoLocation is unlinked
const getLocationModule = (): any => {
  try {
    return require('expo-location');
  } catch {
    return null;
  }
};

let CameraViewComponent: any = null;
let useCameraPermissionsHook: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cam = require('expo-camera');
  CameraViewComponent = cam.CameraView || null;
  useCameraPermissionsHook = cam.useCameraPermissions || null;
} catch {
  CameraViewComponent = null;
  useCameraPermissionsHook = null;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type TeacherMode = 'mandiri' | 'manual' | 'scan' | 'qr';
type AttendanceStatus = 'present' | 'permission' | 'sick' | 'absent' | 'late';

const formatTanggalIndo = (val: unknown): string => {
  if (!val) return '-';
  const str = String(val);
  const d = new Date(str.includes('T') ? str : `${str}T00:00:00`);
  if (Number.isNaN(d.getTime())) return str;
  return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
};

const formatJamIndo = (val: unknown): string => {
  if (!val) return '-';
  const str = String(val);
  if (str.length === 5 || str.length === 8) return str.slice(0, 5) + ' WIB';
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return str;
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':') + ' WIB';
};

interface TeacherQrAttendanceHubProps {
  navigation: any;
  route?: any;
  user: any;
}

export default function TeacherQrAttendanceHub({
  navigation,
  route,
  user,
}: TeacherQrAttendanceHubProps) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 14);
  const bottomTabBarHeight = 58 + Math.max(insets.bottom, Platform.OS === 'android' ? 14 : 8);

  // Role detection: guru vs tu/staff
  const roles = user?.roles || [];
  const isTeacher = isTeacherRole(roles);
  const isTu = isTuRole(roles);
  const canAccessGate = !isTeacher || isTu;

  // Mode: mandiri (presensi mandiri pegawai), manual (presensi checklist), scan (kamera KBM/gerbang), qr (ID guru)
  const incomingMode = route?.params?.mode || route?.params?.tab;
  const incomingSchedId = route?.params?.schedule_id ? String(route.params.schedule_id) : undefined;
  const incomingClassId = (route?.params?.kelas_id || route?.params?.class_id) ? String(route?.params?.kelas_id || route?.params?.class_id) : undefined;
  const incomingClassName = route?.params?.class_name ? String(route.params.class_name) : undefined;
  const isCorrectionMode = Boolean(route?.params?.is_correction);

  const [activeMode, setActiveMode] = useState<TeacherMode>(() => {
    if (incomingMode === 'mandiri' || incomingMode === 'attendance' || incomingMode === 'self') return 'mandiri';
    if (incomingMode === 'manual') return 'manual';
    if (incomingMode === 'qr') return 'qr';
    if (incomingMode === 'scan' || incomingMode === 'gate') {
      return canAccessGate ? 'scan' : 'mandiri';
    }
    return 'mandiri';
  });

  useEffect(() => {
    const rawMode = incomingMode || route?.params?.mode || route?.params?.tab;
    let targetMode = (rawMode === 'attendance' || rawMode === 'self') ? 'mandiri' : rawMode;
    if (targetMode === 'scan' && !canAccessGate) {
      targetMode = 'mandiri';
    }
    if (targetMode && ['mandiri', 'scan', 'manual', 'qr'].includes(targetMode)) {
      setActiveMode(targetMode as TeacherMode);
    }
  }, [incomingMode, route?.params?.mode, route?.params?.tab, canAccessGate]);

  // Schedules state
  const [activeSchedules, setActiveSchedules] = useState<any[]>([]);
  const [allClasses, setAllClasses] = useState<any[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<any>(() => {
    if (incomingSchedId || incomingClassId) {
      return {
        id: incomingSchedId || (incomingClassId ? `virtual-${incomingClassId}` : 'virtual-sched'),
        is_virtual: !incomingSchedId,
        kelas_id: incomingClassId,
        class_id: incomingClassId,
        class_name: incomingClassName || 'Rombel Kelas',
        kelas: {
          id: incomingClassId,
          nama_kelas: incomingClassName || 'Rombel Kelas',
        },
        subject: {
          name: route?.params?.subject_name || 'Presensi KBM',
        },
      };
    }
    return null;
  });
  const [loadingSchedules, setLoadingSchedules] = useState<boolean>(true);

  // Sinkronisasi instan saat navigasi masuk membawa jadwal atau rombel kelas spesifik
  useEffect(() => {
    if (!incomingSchedId && !incomingClassId) return;

    setSelectedSchedule((prev: any) => {
      if (incomingSchedId && activeSchedules.length > 0) {
        const found = activeSchedules.find((s) => String(s.id) === incomingSchedId);
        if (found) return found;
      }
      if (incomingClassId && activeSchedules.length > 0) {
        const foundClass = activeSchedules.find(
          (s) => String(s.kelas_id || s.class_id || s.kelas?.id) === incomingClassId
        );
        if (foundClass) return foundClass;
      }
      if (prev && incomingSchedId && String(prev.id) === incomingSchedId) {
        return prev;
      }
      return {
        id: incomingSchedId || (incomingClassId ? `virtual-${incomingClassId}` : 'virtual-sched'),
        is_virtual: !incomingSchedId,
        kelas_id: incomingClassId,
        class_id: incomingClassId,
        class_name: incomingClassName || 'Rombel Kelas',
        kelas: {
          id: incomingClassId,
          nama_kelas: incomingClassName || 'Rombel Kelas',
        },
        subject: {
          name: route?.params?.subject_name || 'Presensi KBM',
        },
      };
    });
  }, [incomingSchedId, incomingClassId, incomingClassName, route?.params?.subject_name, activeSchedules]);

  // Buka bottom sheet pemilihan rombel jika dipicu dari aksi Presensi KBM
  useEffect(() => {
    if (route?.params?.open_rombel) {
      setShowRombelSheet(true);
    }
  }, [route?.params?.open_rombel]);

  // Manual Roster state
  const [students, setStudents] = useState<any[]>([]);
  const [studentStatuses, setStudentStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [studentNotes, setStudentNotes] = useState<Record<string, string>>({});
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [loadingStudents, setLoadingStudents] = useState<boolean>(false);
  const [submittingManual, setSubmittingManual] = useState<boolean>(false);

  // Camera & Scan state
  const [lastScannedStudent, setLastScannedStudent] = useState<any>(null);
  const [recentScans, setRecentScans] = useState<any[]>([]);
  const [isScanningLocked, setIsScanningLocked] = useState<boolean>(false);
  const [scanMessage, setScanMessage] = useState<string>('');
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);

  // Camera permissions hook
  const [camPermission, requestCamPermission] = useCameraPermissionsHook ? useCameraPermissionsHook() : [null, async () => ({ granted: true })];

  // Laser animation for viewfinder
  const scanLaserAnim = useRef(new Animated.Value(0)).current;

  // Feedback Modal
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
    itemName?: string;
    category?: string;
    dateStr?: string;
    actionLabel?: string;
    cancelLabel?: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
    onClose?: () => void;
  } | null>(null);

  // Approval state
  const [approvingPermissionId, setApprovingPermissionId] = useState<string | number | null>(null);

  const handleApprovePermission = useCallback(async (permissionId: string | number, studentId: string, recType: string = 'izin') => {
    try {
      setApprovingPermissionId(permissionId);
      await mobileApiService.reviewPermission(permissionId, 'approve', 'Disetujui oleh Guru Pengampu');

      setStudents((prev) =>
        prev.map((s) => {
          if (String(s.id || s.student_id) === String(studentId)) {
            return {
              ...s,
              permission_status: 'approved',
              recommendation_verified: true,
            };
          }
          return s;
        })
      );

      const isSick = String(recType || '').toLowerCase().includes('sakit');
      setStudentStatuses((prev) => ({
        ...prev,
        [studentId]: isSick ? 'sick' : 'permission',
      }));

      setFeedbackModal({
        visible: true,
        type: 'success',
        title: 'Izin Santri Disetujui',
        message: 'Pengajuan perizinan orang tua berhasil disetujui dan status presensi santri telah diperbarui menjadi ' + (isSick ? 'Sakit' : 'Izin') + '.',
      });
    } catch (err: any) {
      console.warn('[TeacherQrAttendanceHub] approve error:', err);
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Menyetujui',
        message: err?.response?.data?.message || 'Terjadi kesalahan saat menyetujui izin santri.',
      });
    } finally {
      setApprovingPermissionId(null);
    }
  }, []);

  // Pending permissions dari ortu (untuk ditampilkan di kartu siswa)
  const [pendingPermissions, setPendingPermissions] = useState<Record<string, any>>({});

  const fetchPendingPermissions = useCallback(async (classId?: string | number) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const params: Record<string, any> = { date: today, per_page: 0 };
      if (classId) params.class_id = classId;
      const res = await mobileApiService.getTeacherPermissions(params).catch(() => null);
      const list: any[] = unwrapApiData<any[]>(res) || res?.data?.data || res?.data || [];
      if (Array.isArray(list)) {
        const map: Record<string, any> = {};
        list.forEach((p) => {
          if (p.student_id) {
            const sid = String(p.student_id);
            // Simpan semua permission (prioritaskan pending/submitted)
            if (!map[sid] || ['submitted', 'waiting_verification'].includes(p.status)) {
              map[sid] = p;
            }
          }
        });
        setPendingPermissions(map);
      }
    } catch (err) {
      console.warn('[TeacherQrAttendanceHub] fetchPendingPermissions error:', err);
    }
  }, []);


  useEffect(() => {
    if (activeMode === 'scan') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scanLaserAnim, {
            toValue: 1,
            duration: 2200,
            useNativeDriver: true,
          }),
          Animated.timing(scanLaserAnim, {
            toValue: 0,
            duration: 2200,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [activeMode, scanLaserAnim]);

  // 1. Fetch Teacher Active Schedules & General Schedules & Classes
  const fetchSchedules = useCallback(async () => {
    try {
      setLoadingSchedules(true);

      // Ambil jadwal aktif, seluruh jadwal mengajar guru/staf, dan daftar kelas secara paralel
      const [activeRes, mySchedRes, classesRes] = await Promise.all([
        mobileApiService.getActiveLessonSchedules().catch(() => null),
        mobileApiService.getMyLessonSchedules().catch(() => null),
        mobileApiService.getTeacherClasses().catch(() => null),
      ]);

      // Ekstraksi tepat schedules dari activeRes (baik bentuk objek { server_time, schedules } maupun array)
      const activeSchedulesRaw = activeRes?.data?.schedules || activeRes?.schedules || (Array.isArray(activeRes?.data) ? activeRes.data : Array.isArray(activeRes) ? activeRes : []);
      const activeList = Array.isArray(activeSchedulesRaw) ? activeSchedulesRaw : [];

      const rawMyList: any = unwrapApiData<any>(mySchedRes) || mySchedRes?.data || [];
      const myList: any[] = Array.isArray(rawMyList) ? rawMyList : Array.isArray(rawMyList?.data) ? rawMyList.data : [];

      const rawClasses: any = unwrapApiData<any>(classesRes) || classesRes?.data || [];
      const classesList: any[] = Array.isArray(rawClasses) ? rawClasses : Array.isArray(rawClasses?.data) ? rawClasses.data : [];
      setAllClasses(classesList);

      // Gabungkan jadwal: prioritaskan activeList (sedang aktif jam ini) lalu myList tanpa duplikasi
      const schedMap = new Map<string, any>();
      activeList.forEach((s: any) => { if (s?.id) schedMap.set(String(s.id), s); });
      myList.forEach((s: any) => { if (s?.id && !schedMap.has(String(s.id))) schedMap.set(String(s.id), s); });
      let list = Array.from(schedMap.values());

      // Jika ada incomingClassId dan belum ada jadwal kelas tersebut di list, fetch jadwal kelas itu
      if (incomingClassId && (!Array.isArray(list) || !list.some((s) => String(s.kelas_id || s.class_id || s.kelas?.id) === incomingClassId))) {
        const classSchedRes = await mobileApiService.getTeacherSchedules({ class_id: incomingClassId }).catch(() => null);
        const rawClassSched: any = unwrapApiData<any>(classSchedRes) || classSchedRes?.data || [];
        const classSchedList = Array.isArray(rawClassSched) ? rawClassSched : Array.isArray(rawClassSched?.data) ? rawClassSched.data : [];
        if (classSchedList.length > 0) {
          classSchedList.forEach((cs: any) => { if (cs?.id && !schedMap.has(String(cs.id))) schedMap.set(String(cs.id), cs); });
          list = Array.from(schedMap.values());
        }
      }

      // Jika ada incomingSchedId spesifik tapi belum ada di list (misal jadwal hari lain), tambahkan
      if (incomingSchedId && !schedMap.has(incomingSchedId)) {
        if (incomingClassId) {
          const directItem = {
            id: incomingSchedId,
            kelas_id: incomingClassId,
            class_id: incomingClassId,
            class_name: incomingClassName || 'Rombel Kelas',
            kelas: { id: incomingClassId, nama_kelas: incomingClassName || 'Rombel Kelas' },
            subject: { name: route?.params?.subject_name || 'Presensi KBM' },
          };
          list.unshift(directItem);
        }
      }

      // Fallback: Jika belum ada jadwal terdaftar, gunakan daftar rombel kelas agar guru/TU tetap dapat melakukan presensi KBM
      if (list.length === 0 && classesList.length > 0) {
        list = classesList.map((cls: any) => ({
          id: `virtual-${cls.id}`,
          is_virtual: true,
          kelas_id: cls.id,
          class_id: cls.id,
          class_name: cls.nama_kelas || cls.name || 'Rombel Kelas',
          kelas: cls,
          subject: { name: 'Presensi KBM Rombel' },
        }));
      }

      if (Array.isArray(list) && list.length > 0) {
        setActiveSchedules(list);
        setSelectedSchedule((prev: any) => {
          // Prioritas 1: Sesuai incomingSchedId spesifik yang dikirim lewat navigasi
          if (incomingSchedId) {
            const matched = list.find((s) => String(s.id) === incomingSchedId);
            if (matched) return matched;
          }
          // Prioritas 2: Sesuai incomingClassId yang dikirim lewat navigasi
          if (incomingClassId) {
            const matchedClass = list.find(
              (s) => String(s.kelas_id || s.class_id || s.kelas?.id) === incomingClassId
            );
            if (matchedClass) return matchedClass;
          }
          // Prioritas 3: Pertahankan pilihan prev jika ada di list
          if (prev && list.some((s) => String(s.id) === String(prev.id))) {
            const currentObj = list.find((s) => String(s.id) === String(prev.id));
            if (currentObj) return currentObj;
          }
          // Prioritas 4: Jadwal yang aktif hari ini
          const currentDayOfWeek = new Date().getDay() || 7;
          const todayMatch = list.find((s) => Number(s.day_of_week) === currentDayOfWeek);
          if (todayMatch) return todayMatch;

          return list[0];
        });
      } else {
        setActiveSchedules([]);
        if (incomingClassId) {
          setSelectedSchedule((prev: any) => prev || {
            id: incomingSchedId || `virtual-${incomingClassId}`,
            is_virtual: !incomingSchedId,
            kelas_id: incomingClassId,
            class_id: incomingClassId,
            class_name: incomingClassName || 'Rombel Kelas',
            kelas: {
              id: incomingClassId,
              nama_kelas: incomingClassName || 'Rombel Kelas',
            },
            subject: {
              name: route?.params?.subject_name || 'Presensi Rombel Kelas',
            },
          });
        }
      }
    } catch (err) {
      console.warn('[TeacherQrAttendanceHub] fetchSchedules error:', err);
    } finally {
      setLoadingSchedules(false);
    }
  }, [incomingSchedId, incomingClassId, incomingClassName, route?.params?.subject_name]);

  useEffect(() => {
    void fetchSchedules();
  }, [fetchSchedules]);

  // 2. Fetch Students for Selected Schedule or Class (Manual Attendance)
  const fetchScheduleStudents = useCallback(async (schedId?: string | number, targetClassId?: string) => {
    try {
      setLoadingStudents(true);
      let list: any[] = [];
      const isVirtualSched = typeof schedId === 'string' && schedId.startsWith('virtual-');

      if (schedId && !isVirtualSched) {
        const res = await mobileApiService.getLessonScheduleStudents(schedId).catch(() => null);
        list = unwrapApiData<any[]>(res) || res?.data || [];
      }

      // Fallback jika belum ada siswa lewat jadwal (atau di luar jam KBM / virtual), ambil langsung seluruh siswa rombel
      if ((!Array.isArray(list) || list.length === 0) && targetClassId) {
        const teacherStudentsRes = await mobileApiService.getTeacherStudents({
          class_id: targetClassId,
          per_page: 100,
        }).catch(() => null);
        const rawTList = unwrapApiData<any>(teacherStudentsRes) || teacherStudentsRes?.data || [];
        const tList = Array.isArray(rawTList) ? rawTList : Array.isArray(rawTList?.data) ? rawTList.data : [];
        if (tList.length > 0) {
          list = tList;
        } else {
          const classStudentsRes = await mobileApiService.getClassStudents(targetClassId).catch(() => null);
          const cData = unwrapApiData<any>(classStudentsRes) || classStudentsRes?.data;
          const cList = Array.isArray(cData?.siswa) ? cData.siswa : Array.isArray(cData) ? cData : [];
          if (cList.length > 0) list = cList;
        }
      }

      if (Array.isArray(list)) {
        setStudents(list);
        // User request: Kosongkan semua status kehadiran awal secara default (tidak default ke 'H' atau auto-fill hadir).
        // Guru / TU menandai kehadiran santri/siswa secara manual atau memindai kartu QR.
        setStudentStatuses((prev) => {
          const preserved: Record<string, AttendanceStatus> = {};
          list.forEach((st) => {
            const sId = String(st.id || st.student_id);
            if (prev[sId]) {
              preserved[sId] = prev[sId];
            } else if (isCorrectionMode && (st.status || st.status_hadir || st.recommended_status)) {
              // Mode koreksi: Muat status kehadiran lampau agar guru dapat langsung mengoreksi santri yang salah input
              const raw = String(st.status || st.status_hadir || st.recommended_status).toLowerCase();
              if (raw.includes('hadir') || raw === 'present') preserved[sId] = 'present';
              else if (raw.includes('terlambat') || raw === 'late') preserved[sId] = 'late';
              else if (raw.includes('sakit') || raw === 'sick') preserved[sId] = 'sick';
              else if (raw.includes('izin') || raw.includes('permission') || raw.includes('permit')) preserved[sId] = 'permission';
              else if (raw.includes('alpha') || raw.includes('alpa') || raw === 'absent') preserved[sId] = 'absent';
            }
          });
          return preserved;
        });
      }
    } catch (err) {
      console.warn('[TeacherQrAttendanceHub] fetchScheduleStudents error:', err);
    } finally {
      setLoadingStudents(false);
    }
  }, []);

  const currentScheduleId = selectedSchedule?.id ? String(selectedSchedule.id) : undefined;
  const currentClassId = (selectedSchedule?.kelas_id || selectedSchedule?.class_id || selectedSchedule?.kelas?.id || incomingClassId)
    ? String(selectedSchedule?.kelas_id || selectedSchedule?.class_id || selectedSchedule?.kelas?.id || incomingClassId)
    : undefined;

  // Lacak target jadwal/kelas terakhir agar tidak memicu fetch berulang dan mereset santri saat ganti kelas
  const lastFetchedTargetRef = useRef<string>('');

  // Fetch daftar santri HANYA saat schedule atau class berubah — BUKAN saat toggle mode tab (scan <-> manual)
  useEffect(() => {
    const targetKey = `${currentScheduleId || ''}_${currentClassId || ''}`;
    if ((currentScheduleId || currentClassId) && targetKey !== lastFetchedTargetRef.current) {
      lastFetchedTargetRef.current = targetKey;
      // Bersihkan roster dan status santri dari kelas sebelumnya
      setStudents([]);
      setStudentStatuses({});
      void fetchScheduleStudents(currentScheduleId, currentClassId);
      if (currentClassId) {
        void fetchPendingPermissions(currentClassId);
      }
    }
  }, [currentScheduleId, currentClassId, fetchScheduleStudents, fetchPendingPermissions]);


  // Handle QR Barcode Scan (Mode 1)
  const handleBarcodeScanned = useCallback(async (scannedData: string) => {
    if (isScanningLocked || !scannedData) return;
    setIsScanningLocked(true);

    try {
      if (Platform.OS !== 'web') {
        Vibration.vibrate(120);
      }

      const scheduleId = selectedSchedule?.id;
      if (!scheduleId && !currentClassId) {
        setScanMessage('Silakan pilih jadwal KBM atau kelas terlebih dahulu.');
        setFeedbackModal({
          visible: true,
          type: 'warning',
          title: 'Jadwal Belum Dipilih',
          message: 'Silakan pilih jadwal KBM atau rombel kelas terlebih dahulu sebelum memindai kartu.',
          actionLabel: 'Mengerti',
          onClose: () => {
            setFeedbackModal(null);
            setIsScanningLocked(false);
          },
          onConfirm: () => {
            setFeedbackModal(null);
            setIsScanningLocked(false);
          },
        });
        return;
      }

      setScanMessage('Memproses identifikasi kartu santri...');

      const cleanRaw = (scannedData || '').trim();
      let parsedNis = '';
      let parsedName = '';
      if (cleanRaw.startsWith('STUDENT_CARD:')) {
        const parts = cleanRaw.split(':');
        parsedNis = (parts[1] || '').trim();
        parsedName = (parts[2] || '').trim();
      }

      // Resolusi effectiveScheduleId (hindari ID virtual dikirim ke API backend)
      const isVirtual = typeof scheduleId === 'string' && scheduleId.startsWith('virtual-');
      let effectiveScheduleId = !isVirtual ? scheduleId : null;

      if (!effectiveScheduleId && currentClassId) {
        const foundInActive = activeSchedules.find(
          (s) => String(s.kelas_id || s.class_id || s.kelas?.id) === currentClassId && !String(s.id).startsWith('virtual-')
        );
        if (foundInActive) effectiveScheduleId = foundInActive.id;
      }

      let studentData: any = null;

      // 1. Coba identifikasi via Backend API jika ada schedule resmi
      if (effectiveScheduleId) {
        try {
          const res = await mobileApiService.identifyStudentCard('qr', {
            schedule_id: effectiveScheduleId,
            identifier: cleanRaw,
          });
          studentData = res?.data?.student || res?.student || null;
        } catch (apiErr: any) {
          // Jika API gagal (misal jadwal/roster berbeda), lanjut ke pencocokan roster lokal
          const errMsg = apiErr?.response?.data?.message || apiErr?.message || 'status 422';
          console.log('[QR Camera] Backend identifyCard notice (using local roster):', errMsg);
        }
      }

      // 2. Cocokkan dengan data santri lengkap di rombel (lokal / fallback)
      let matchedStudent = null;
      if (studentData) {
        matchedStudent = students.find(
          (st) => String(st.id) === String(studentData.id) ||
                  String(st.student_id) === String(studentData.id) ||
                  (st.nis && st.nis === studentData.nis)
        ) || studentData;
      } else {
        // Cari di daftar siswa rombel yang sedang dibuka
        matchedStudent = students.find((st) => {
          const stId = String(st.id || st.student_id || '');
          const stNis = String(st.nis || st.nomor_induk || '');
          const stNisn = String(st.nisn || '');
          const stName = String(st.full_name || st.nama_lengkap || st.name || '').toLowerCase();

          if (parsedNis && (stNis === parsedNis || stNisn === parsedNis || stId === parsedNis)) {
            return true;
          }
          if (cleanRaw && (stNis === cleanRaw || stNisn === cleanRaw || stId === cleanRaw)) {
            return true;
          }
          if (parsedName && stName.length > 0 && (stName.includes(parsedName.toLowerCase()) || parsedName.toLowerCase().includes(stName))) {
            return true;
          }
          return false;
        });
      }

      // 3. Fallback jika mode gerbang atau belum ada jadwal KBM aktif
      if (!matchedStudent && !effectiveScheduleId) {
        try {
          const studentRes = await mobileApiService.getStudents({ search: parsedNis || cleanRaw, per_page: 5 }).catch(() => null);
          const studentList = studentRes?.data?.data || studentRes?.data || [];
          if (Array.isArray(studentList) && studentList.length > 0) {
            matchedStudent = studentList[0];
          }
        } catch (searchErr) {
          console.log('[QR Camera] Student lookup notice:', searchErr);
        }
      }

      if (!matchedStudent) {
        const displayId = parsedNis || (cleanRaw.length > 25 ? cleanRaw.substring(0, 25) + '...' : cleanRaw);
        throw new Error(
          effectiveScheduleId
            ? `Kartu santri (${displayId}) tidak terdaftar pada rombel ini.`
            : `Kartu santri (${displayId}) tidak terdaftar di sistem sekolah.`
        );
      }

      const studentName = matchedStudent.full_name || matchedStudent.nama_lengkap || matchedStudent.name || 'Santri';
      const studentNis = matchedStudent.nis || studentData?.nis || parsedNis || '-';
      const className = selectedSchedule?.kelas?.nama_kelas || selectedSchedule?.class_name || route?.params?.class_name || matchedStudent?.kelas?.nama_kelas || 'Rombel';

      // ── PRESENSI OTOMATIS TERSIMPAN KE DATABASE ──
      if (effectiveScheduleId && matchedStudent.id) {
        try {
          const sessionRes = await mobileApiService.startLessonAttendanceSession({
            schedule_id: effectiveScheduleId,
          }).catch(() => null);
          const sessionId = sessionRes?.data?.id || sessionRes?.id;
          if (sessionId) {
            await mobileApiService.submitManualLessonAttendance(sessionId, {
              student_id: matchedStudent.id,
              status: 'present',
              notes: 'Presensi Otomatis Scan QR Kamera',
            }).catch(() => null);
          }
        } catch (autoSaveErr) {
          console.warn('[QR Scan Auto-Save]', autoSaveErr);
        }
      } else {
        // Presensi Gerbang Sekolah Masuk (Gate In)
        try {
          const gatePayload: any = {
            qr_token: cleanRaw,
            attendance_method: 'QRCODE',
          };
          if (matchedStudent?.id && !String(matchedStudent.id).startsWith('scan-')) {
            gatePayload.student_id = matchedStudent.id;
          }
          const validNis = parsedNis || matchedStudent?.nis;
          if (validNis && !String(validNis).startsWith('scan-') && !String(validNis).startsWith('stuqr:') && !String(validNis).startsWith('STUDENT_CARD:')) {
            gatePayload.nis = validNis;
          }
          await mobileApiService.scanGateIn(gatePayload).catch(() => null);
        } catch (gateErr) {
          console.warn('[Gate Scan Auto-Save]', gateErr);
        }
      }

      const scanTime = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

      const newScanRecord = {
        id: matchedStudent.id || Date.now(),
        name: studentName,
        nis: studentNis,
        className,
        avatar: getProfileImageUrl(matchedStudent),
        gender: matchedStudent.gender || matchedStudent.jenis_kelamin,
        time: scanTime,
        status: 'Hadir',
        raw: scannedData,
      };

      // Set hasil scan terakhir
      setLastScannedStudent(newScanRecord);

      // Masukkan ke log list presensi QR (tanpa duplikasi)
      setRecentScans((prev) => {
        const filtered = prev.filter((p) => String(p.id) !== String(newScanRecord.id));
        return [newScanRecord, ...filtered];
      });

      // Tandai juga di state checklist manual (baik dengan id maupun student_id)
      const stIdKey = String(matchedStudent.id || matchedStudent.student_id);
      setStudentStatuses((prev) => ({
        ...prev,
        [stIdKey]: 'present',
        ...(matchedStudent.id ? { [String(matchedStudent.id)]: 'present' } : {}),
        ...(matchedStudent.student_id ? { [String(matchedStudent.student_id)]: 'present' } : {}),
      }));

      // Sinkronkan status pada item list students agar tab manual langsung terisi Hadir
      setStudents((prev) =>
        prev.map((s) => {
          if (String(s.id || s.student_id) === stIdKey || String(s.id) === String(matchedStudent.id)) {
            return { ...s, status: 'present' };
          }
          return s;
        })
      );

      setScanMessage(`✅ Presensi otomatis tersimpan: ${studentName} tercatat Hadir.`);

      // POP UP MODAL: Presensi Berhasil di-Scan
      setFeedbackModal({
        visible: true,
        type: 'success',
        title: 'Presensi Scan Berhasil',
        message: `Presensi otomatis tersimpan: ${studentName} (${studentNis}) tercatat Hadir pada ${scanTime} WIB.`,
        itemName: studentName,
        category: `Rombel: ${className} • NIS: ${studentNis}`,
        actionLabel: 'Lanjut Scan',
        onClose: () => {
          setFeedbackModal(null);
          setIsScanningLocked(false);
          setScanMessage('');
        },
        onConfirm: () => {
          setFeedbackModal(null);
          setIsScanningLocked(false);
          setScanMessage('');
        },
      });
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || err?.message || 'Kartu santri tidak terdaftar pada rombel ini.';
      setScanMessage(`Gagal: ${errMsg}`);

      // POP UP MODAL: Presensi Gagal di-Scan
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Scan Presensi Gagal',
        message: errMsg,
        actionLabel: 'Coba Lagi',
        onClose: () => {
          setFeedbackModal(null);
          setIsScanningLocked(false);
          setScanMessage('');
        },
        onConfirm: () => {
          setFeedbackModal(null);
          setIsScanningLocked(false);
          setScanMessage('');
        },
      });
    } finally {
      // Pembukaan lock dilakukan saat guru menutup / menekan aksi pada pop-up modal
    }
  }, [isScanningLocked, selectedSchedule, students, currentClassId, activeSchedules, route?.params?.class_name]);

  // Quick action: Tandai Semua Hadir
  const handleMarkAllPresent = () => {
    const updated: Record<string, AttendanceStatus> = {};
    students.forEach((st) => {
      const sid = String(st.id || st.student_id);
      updated[sid] = 'present';
    });
    setStudentStatuses(updated);
    setFeedbackModal({
      visible: true,
      type: 'success',
      title: 'Semua Santri/Siswa Hadir',
      message: `Seluruh santri/siswa (${students.length} orang) berhasil ditandai Hadir. Tekan tombol "Simpan" di bagian bawah untuk menyimpan ke sistem.`,
      actionLabel: 'Mengerti',
      onClose: () => setFeedbackModal(null),
      onConfirm: () => setFeedbackModal(null),
    });
  };

  // Submit Presensi Manual KBM
  const handleSubmitManual = async () => {
    const isVirtual = typeof selectedSchedule?.id === 'string' && selectedSchedule.id.startsWith('virtual-');
    let effectiveScheduleId = !isVirtual ? selectedSchedule?.id : null;

    if (!effectiveScheduleId && currentClassId) {
      const foundInActive = activeSchedules.find(
        (s) => String(s.kelas_id || s.class_id || s.kelas?.id) === currentClassId && !String(s.id).startsWith('virtual-')
      );
      if (foundInActive) {
        effectiveScheduleId = foundInActive.id;
      } else {
        const cRes = await mobileApiService.getTeacherSchedules({ class_id: currentClassId }).catch(() => null);
        const cList: any = unwrapApiData<any>(cRes) || cRes?.data || [];
        const validC = Array.isArray(cList) ? cList[0] : (Array.isArray(cList?.data) ? cList.data[0] : null);
        if (validC?.id) {
          effectiveScheduleId = validC.id;
        }
      }
    }

    if (!effectiveScheduleId) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Jadwal Belum Dipilih',
        message: 'Silakan pilih jadwal KBM terlebih dahulu atau pastikan rombel memiliki jadwal aktif.',
      });
      return;
    }

    const markedStudents = students.filter((st) => {
      const sId = String(st.id || st.student_id);
      return Boolean(studentStatuses[sId]);
    });

    if (markedStudents.length === 0) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Presensi Belum Dipilih',
        message: 'Silakan pilih status kehadiran santri (Hadir, Izin, Sakit, atau Alpha) terlebih dahulu, atau tekan tombol "Semua Hadir".',
      });
      return;
    }

    try {
      setSubmittingManual(true);

      // Pastikan sesi KBM ada atau buat sesi baru
      const sessionRes = await mobileApiService.startLessonAttendanceSession({
        schedule_id: effectiveScheduleId,
      }).catch(() => null);

      const sessionId = sessionRes?.data?.id || sessionRes?.id;

      if (sessionId) {
        // Submit checklist setiap siswa yang telah ditandai
        const promises = markedStudents.map((st) => {
          const sId = String(st.id || st.student_id);
          const stStatus = studentStatuses[sId];
          const stNote = studentNotes[sId] || '';
          return mobileApiService.submitManualLessonAttendance(sessionId, {
            student_id: sId,
            status: stStatus,
            notes: stNote,
          }).catch(() => null);
        });

        await Promise.all(promises);
      }

      // Persistensi ganda ke backend modul Guru (LmsPresensi) selaras web-dashboard
      if (effectiveScheduleId && !String(effectiveScheduleId).startsWith('virtual-')) {
        const statusMapForBackend: Record<string, string> = {
          present: 'Hadir',
          late: 'Terlambat',
          sick: 'Sakit',
          permission: 'Izin',
          absent: 'Alpha',
        };
        const studentPayload = markedStudents.map((st) => {
          const sId = String(st.id || st.student_id);
          const rawSt = studentStatuses[sId] || 'present';
          return {
            student_id: sId,
            status: statusMapForBackend[rawSt] || 'Hadir',
            notes: studentNotes[sId] || (isCorrectionMode ? 'Koreksi presensi KBM mobile oleh guru' : undefined),
          };
        });

        await mobileApiService.saveTeacherAttendance?.({
          class_schedule_id: effectiveScheduleId,
          date: new Date().toISOString().slice(0, 10),
          meeting_number: Number(kbmMeetingNumber) || 1,
          topic: kbmTopic.trim() || selectedSchedule?.subject?.name || 'Presensi KBM Terpadu',
          meeting_notes: kbmJournalNotes.trim() || undefined,
          students: studentPayload,
        }).catch(() => null);
      }

      setFeedbackModal({
        visible: true,
        type: 'success',
        title: isCorrectionMode ? 'Koreksi Presensi Disimpan' : 'Presensi Disimpan',
        message: isCorrectionMode
          ? `Koreksi presensi KBM ${selectedSchedule?.subject?.name || 'Mata Pelajaran'} (${markedStudents.length} santri) berhasil disimpan dan diperbarui di sistem.`
          : `Presensi KBM ${selectedSchedule?.subject?.name || 'Mata Pelajaran'} (${markedStudents.length} santri) berhasil disimpan dan disinkronkan ke sistem.`,
      });
    } catch (err) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Menyimpan',
        message: 'Terjadi kendala saat menyimpan presensi manual. Silakan coba kembali.',
      });
    } finally {
      setSubmittingManual(false);
    }
  };

  // Filtered Students for Manual Mode
  const filteredStudents = useMemo(() => {
    if (!studentSearch.trim()) return students;
    const q = studentSearch.toLowerCase();
    return students.filter((st) => {
      const name = String(st.full_name || st.nama_lengkap || '').toLowerCase();
      const nis = String(st.nis || '').toLowerCase();
      return name.includes(q) || nis.includes(q);
    });
  }, [students, studentSearch]);

  // Status counts
  const statusCounts = useMemo(() => {
    let p = 0, i = 0, s = 0, a = 0, t = 0;
    Object.values(studentStatuses).forEach((st) => {
      if (st === 'present') p++;
      else if (st === 'permission') i++;
      else if (st === 'sick') s++;
      else if (st === 'absent') a++;
      else if (st === 'late') t++;
    });
    return { p, i, s, a, t, total: students.length };
  }, [studentStatuses, students.length]);

  // Tanggal & Hari Dinamis Bahasa Indonesia (Zero Hardcode)
  const dynamicKbmDateText = useMemo(() => {
    let target = new Date();
    if (selectedSchedule?.attendance_date) {
      const parsed = new Date(selectedSchedule.attendance_date);
      if (!isNaN(parsed.getTime())) target = parsed;
    }
    const day = target.toLocaleDateString('id-ID', { weekday: 'long' });
    const formattedDate = target.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return `${day}, ${formattedDate}`;
  }, [selectedSchedule?.attendance_date]);

  // Teacher Profile Data
  const remoteTeacherPhoto = getProfileImageUrl(user);
  const teacherAvatar = remoteTeacherPhoto ? { uri: remoteTeacherPhoto } : DEFAULT_PARENT_AVATAR;
  const teacherName = user?.name || user?.fullName || 'Pendidik';
  const teacherNip = user?.nip || user?.employee?.nip || user?.username || '-';
  const teacherUnit =
    resolveUnitName(user?.unit) ||
    resolveUnitName(user?.education_unit) ||
    resolveUnitName((user?.metadata as any)?.unit) ||
    resolveUnitName((user?.metadata as any)?.unit_name) ||
    (typeof user?.unit_name === 'string' ? user.unit_name : null) ||
    'Madrasah Terpadu';
  const teacherRole =
    (typeof user?.roles?.[0] === 'object' ? (user?.roles?.[0]?.label || user?.roles?.[0]?.name) : null) ||
    (typeof user?.roles?.[0] === 'string' ? user?.roles?.[0] : null) ||
    user?.role_label ||
    'Guru / Pengajar';
  const teacherQrData = JSON.stringify({
    type: 'TEACHER_ID',
    id: user?.id,
    nip: teacherNip,
    name: teacherName,
    unit: teacherUnit,
    valid_until: getDynamicAcademicYear(),
  });

  // ── EXTRA STATE: Scan mode active toggle, Detail Scan, Rekap, Sheets ──
  const [isScanActive, setIsScanActive] = useState<boolean>(false);

  // Auto request camera permission when active on scan mode
  useEffect(() => {
    if (activeMode === 'scan' && isScanActive && useCameraPermissionsHook && (!camPermission || !camPermission.granted)) {
      requestCamPermission();
    }
  }, [activeMode, isScanActive, camPermission, requestCamPermission]);

  const [scanDetailStudent, setScanDetailStudent] = useState<any>(null);
  const [showRekapView, setShowRekapView] = useState<boolean>(false);
  const [showRombelSheet, setShowRombelSheet] = useState<boolean>(false);
  const [showFilterSheet, setShowFilterSheet] = useState<boolean>(false);
  const [showUbahStatusSheet, setShowUbahStatusSheet] = useState<any>(null); // student obj or null
  const [showKonfirmasiModal, setShowKonfirmasiModal] = useState<boolean>(false);
  const [kbmMeetingNumber, setKbmMeetingNumber] = useState<string>('1');
  const [kbmTopic, setKbmTopic] = useState<string>('');
  const [kbmJournalNotes, setKbmJournalNotes] = useState<string>('');

  useEffect(() => {
    if (selectedSchedule?.subject?.name && !kbmTopic) {
      setKbmTopic(selectedSchedule.subject.name);
    }
  }, [selectedSchedule, kbmTopic]);
  const [statusFilterChip, setStatusFilterChip] = useState<string>('semua');
  const [showStatusDropdown, setShowStatusDropdown] = useState<boolean>(false);
  const [showRekapDropdown, setShowRekapDropdown] = useState<boolean>(false);
  const [rombelSearch, setRombelSearch] = useState<string>('');
  const [ubahStatusNote, setUbahStatusNote] = useState<string>('');
  const [ubahStatusSelected, setUbahStatusSelected] = useState<AttendanceStatus | null>(null);
  const [qrCountdown, setQrCountdown] = useState<number>(298);

  // Status filter dropdown options & current selected option
  const statusFilterOptions = useMemo(() => [
    { key: 'semua', label: 'Semua', count: students.length, icon: 'account-multiple', color: '#059669', bgColor: '#ECFDF5' },
    { key: 'belum', label: 'Belum Diisi', count: Math.max(0, students.length - (statusCounts.p + statusCounts.i + statusCounts.s + statusCounts.a + statusCounts.t)), icon: 'clock-outline', color: '#64748B', bgColor: '#F1F5F9' },
    { key: 'hadir', label: 'Hadir', count: statusCounts.p, icon: 'check-circle', color: '#059669', bgColor: '#ECFDF5' },
    { key: 'izin', label: 'Izin', count: statusCounts.i, icon: 'file-document-outline', color: '#2563EB', bgColor: '#EFF6FF' },
    { key: 'sakit', label: 'Sakit', count: statusCounts.s, icon: 'heart', color: '#D97706', bgColor: '#FFFBEB' },
    { key: 'alpha', label: 'Alpha', count: statusCounts.a, icon: 'close-circle-outline', color: '#DC2626', bgColor: '#FEF2F2' },
  ], [students.length, statusCounts]);

  const currentStatusOption = useMemo(() => {
    return statusFilterOptions.find((opt) => opt.key === statusFilterChip) || statusFilterOptions[0];
  }, [statusFilterOptions, statusFilterChip]);

  // QR Countdown timer
  React.useEffect(() => {
    if (activeMode !== 'qr') return;
    setQrCountdown(298);
    const t = setInterval(() => {
      setQrCountdown((prev) => {
        if (prev <= 1) { clearInterval(t); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [activeMode]);

  const qrCountdownDisplay = (() => {
    const m = Math.floor(qrCountdown / 60).toString().padStart(2, '0');
    const s = (qrCountdown % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  })();

  // ── PRESENSI MANDIRI PEGAWAI STATE & HANDLERS ──
  const [employeeHistory, setEmployeeHistory] = useState<any[]>([]);
  const [employeeStats, setEmployeeStats] = useState<any>(null);
  const [loadingEmpAttendance, setLoadingEmpAttendance] = useState<boolean>(false);
  const [savingEmpAttendance, setSavingEmpAttendance] = useState<boolean>(false);
  const [leaveModalOpen, setLeaveModalOpen] = useState<boolean>(false);
  const [leaveStatus, setLeaveStatus] = useState<'IZIN' | 'SAKIT' | 'DINAS_LUAR'>('IZIN');
  const [leaveDate, setLeaveDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [leaveReason, setLeaveReason] = useState<string>('');
  const [submittingLeave, setSubmittingLeave] = useState<boolean>(false);

  const effectiveEmployeeId = (user as any)?.employee_id || (user as any)?.employee?.id || (user as any)?.id;
  const effectiveUnitId = (user as any)?.unit_id || (user as any)?.education_unit_id || (user as any)?.unit?.id;
  const todayDateStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const todayEmpRecord = useMemo(() => {
    if (!employeeHistory || employeeHistory.length === 0) return null;
    return employeeHistory.find((item: any) => {
      const d = item.date || item.attendance_date || item.tanggal || '';
      return String(d).slice(0, 10) === todayDateStr;
    });
  }, [employeeHistory, todayDateStr]);

  const hasCheckIn = Boolean(todayEmpRecord?.check_in_time || todayEmpRecord?.check_in);
  const hasCheckOut = Boolean(todayEmpRecord?.check_out_time || (todayEmpRecord?.check_out && todayEmpRecord?.check_out !== '--:--'));
  const checkedIn = Boolean(hasCheckIn && !hasCheckOut);

  // ── Realtime Clock & Status Display untuk Mode Mandiri Pendidik ──
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDateText, setCurrentDateText] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace('.', ':') + ' WIB'
      );
      setCurrentDateText(
        now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const todayIn = todayEmpRecord?.check_in_time
    ? formatJamIndo(todayEmpRecord.check_in_time)
    : todayEmpRecord?.check_in
      ? todayEmpRecord.check_in
      : '--:--';

  const todayOut = todayEmpRecord?.check_out_time
    ? formatJamIndo(todayEmpRecord.check_out_time)
    : todayEmpRecord?.check_out && todayEmpRecord.check_out !== '--:--'
      ? todayEmpRecord.check_out
      : '--:--';

  const todayStatusLabel = checkedIn ? 'Sedang Bekerja' : hasCheckOut ? 'Selesai' : hasCheckIn ? 'Hadir' : 'Belum Presensi';
  const isStatusPositive = hasCheckIn || hasCheckOut;

  // ── GEOLOKASI & MAPBOX PRESENSI MANDIRI PENDIDIK ──
  const userAny = user as any;
  const storeMapboxToken = useMobileConfigStore(
    (state) => state.config?.mapbox_token || state.config?.system?.mapbox_token
  );
  const [mapboxToken, setMapboxToken] = useState<string | undefined>(storeMapboxToken);

  useEffect(() => {
    if (storeMapboxToken) {
      setMapboxToken(storeMapboxToken);
    }
  }, [storeMapboxToken]);

  // Modal Penolakan Presensi Geofence
  const [rejectionModal, setRejectionModal] = useState<{
    visible: boolean;
    title?: string;
    message?: string;
    details?: AttendanceRejectionDetails | null;
  } | null>(null);

  // Koordinat Unit Pendidikan Acuan
  const [unitLocation, setUnitLocation] = useState<{
    id?: string;
    name: string;
    latitude: number;
    longitude: number;
    radiusMeter: number;
  }>({
    name: teacherUnit,
    latitude: Number(userAny?.unit?.latitude ?? userAny?.education_unit?.latitude ?? -0.9242000),
    longitude: Number(userAny?.unit?.longitude ?? userAny?.education_unit?.longitude ?? 100.3621000),
    radiusMeter: Math.min(Number(userAny?.unit?.radius_meter ?? userAny?.education_unit?.radius_meter ?? 30), 30),
  });

  // Posisi Geolocation Pengguna (Live GPS)
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy?: number;
  } | null>(null);
  const [locatingUser, setLocatingUser] = useState<boolean>(false);

  // Sinkronisasi data unit dari server
  useEffect(() => {
    let isMounted = true;
    const fetchUnitDetails = async () => {
      try {
        const unitsRes = await mobileApiService.getEducationUnits?.({ per_page: 50 });
        const units = unwrapCollection<any>(unitsRes);
        if (isMounted && Array.isArray(units) && units.length > 0) {
          const targetId = userAny?.unit?.id ?? userAny?.unit_id ?? userAny?.scope?.unit_id ?? userAny?.education_unit_id;
          const matched = units.find(
            (u) =>
              (targetId && (String(u.id) === String(targetId) || String(u.code) === String(targetId))) ||
              (teacherUnit && (u.name?.toLowerCase().includes(teacherUnit.toLowerCase()) || teacherUnit.toLowerCase().includes(u.name?.toLowerCase())))
          ) || units[0];

          if (matched && matched.latitude && matched.longitude) {
            setUnitLocation({
              id: matched.id,
              name: matched.name || teacherUnit,
              latitude: Number(matched.latitude),
              longitude: Number(matched.longitude),
              radiusMeter: Math.min(Number(matched.radius_meter || 30), 30),
            });
          }
        }
      } catch (err) {
        console.warn('[TeacherQrAttendanceHub] fetchUnitDetails warning:', err);
      }
    };
    void fetchUnitDetails();
    return () => {
      isMounted = false;
    };
  }, [userAny, teacherUnit]);

  // Haversine Distance Formula (Meter)
  const calculateHaversineDistance = useCallback((lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }, []);

  // Jarak Live User ke Unit
  const distanceToUnit = useMemo(() => {
    if (!userLocation || !unitLocation.latitude || !unitLocation.longitude) return null;
    return calculateHaversineDistance(
      userLocation.latitude,
      userLocation.longitude,
      unitLocation.latitude,
      unitLocation.longitude
    );
  }, [userLocation, unitLocation, calculateHaversineDistance]);

  // Status Validasi Radius (Maks. 30 Meter)
  const isWithinRadius = useMemo(() => {
    if (distanceToUnit === null) return false;
    return distanceToUnit <= unitLocation.radiusMeter;
  }, [distanceToUnit, unitLocation.radiusMeter]);

  const formatDistance = (meters: number | null): string => {
    if (meters === null || meters === undefined || isNaN(meters)) return '-- m';
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(2)} km`;
  };

  // Mapbox Static Map Tile Generator
  const mapTileInfo = useMemo(() => {
    const uLat = unitLocation.latitude;
    const uLng = unitLocation.longitude;
    if (!uLat || !uLng) return null;

    const token = mapboxToken?.trim();
    const mapWidth = Math.min(Math.round(SCREEN_WIDTH - 58), 420);
    const mapHeight = 165;

    const activeToken = token;
    if (!activeToken) return null;

    if (userLocation && userLocation.latitude && userLocation.longitude) {
      const pUnit = `pin-s-school+059669(${uLng.toFixed(6)},${uLat.toFixed(6)})`;
      const pUser = `pin-s-circle+2563eb(${userLocation.longitude.toFixed(6)},${userLocation.latitude.toFixed(6)})`;
      const url = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${pUnit},${pUser}/auto/${mapWidth}x${mapHeight}@2x?padding=45,45,45,45&access_token=${activeToken}`;
      return { url, isMapbox: true };
    } else {
      const pUnit = `pin-s-school+059669(${uLng.toFixed(6)},${uLat.toFixed(6)})`;
      const url = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${pUnit}/${uLng.toFixed(6)},${uLat.toFixed(6)},16.5,0/${mapWidth}x${mapHeight}@2x?access_token=${activeToken}`;
      return { url, isMapbox: true };
    }
  }, [mapboxToken, unitLocation, userLocation]);

  // Request & Update User GPS Location
  const requestUserLocation = useCallback(async (silent = false): Promise<{ latitude: number; longitude: number } | null> => {
    setLocatingUser(true);
    try {
      const Location = getLocationModule();

      if (Location && typeof Location.requestForegroundPermissionsAsync === 'function') {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!silent) {
            setRejectionModal({
              visible: true,
              title: 'Izin Lokasi Diperlukan',
              message: 'Aplikasi membutuhkan izin GPS untuk memverifikasi jarak Anda ke unit pendidikan.',
            });
          }
          return null;
        }
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy?.High ?? 4,
        });
        if (loc?.coords?.latitude !== undefined && loc?.coords?.longitude !== undefined) {
          const coords = {
            latitude: Number(loc.coords.latitude),
            longitude: Number(loc.coords.longitude),
            accuracy: loc.coords.accuracy ? Number(loc.coords.accuracy) : undefined,
          };
          setUserLocation(coords);
          return coords;
        }
      }

      if (typeof navigator !== 'undefined' && (navigator as any)?.geolocation?.getCurrentPosition) {
        const navCoords = await new Promise<{ latitude: number; longitude: number; accuracy?: number } | null>((resolve) => {
          (navigator as any).geolocation.getCurrentPosition(
            (pos: any) => {
              if (pos?.coords?.latitude !== undefined && pos?.coords?.longitude !== undefined) {
                resolve({
                  latitude: Number(pos.coords.latitude),
                  longitude: Number(pos.coords.longitude),
                  accuracy: pos.coords.accuracy ? Number(pos.coords.accuracy) : undefined,
                });
              } else {
                resolve(null);
              }
            },
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
          );
        });
        if (navCoords) {
          setUserLocation(navCoords);
          return navCoords;
        }
      }

      if (silent) {
        return null;
      }

      return await new Promise<{ latitude: number; longitude: number } | null>((resolve) => {
        setFeedbackModal({
          visible: true,
          type: 'confirm',
          title: 'Modul GPS Native Belum Terpasang',
          message: 'Modul native GPS (ExpoLocation) belum terkompilasi di APK Android saat ini.\n\nApakah Anda ingin menggunakan koordinat simulasi area sekolah untuk pengujian jarak?',
          confirmText: 'Simulasi Area Unit',
          cancelText: 'Batal',
          onConfirm: () => {
            const fallbackLat = Number(unitLocation.latitude || -0.9242000);
            const fallbackLng = Number(unitLocation.longitude || 100.3621000);
            const simulated = { latitude: fallbackLat, longitude: fallbackLng, accuracy: 5 };
            setUserLocation(simulated);
            setFeedbackModal(null);
            resolve(simulated);
          },
          onClose: () => {
            setFeedbackModal(null);
            resolve(null);
          },
        });
      });
    } catch (e: any) {
      if (!silent) {
        setRejectionModal({
          visible: true,
          title: 'GPS Tidak Terdeteksi',
          message: 'Gagal membaca posisi GPS perangkat. Pastikan layanan lokasi pada smartphone Anda telah diaktifkan dengan akurasi tinggi.',
        });
      }
      return null;
    } finally {
      setLocatingUser(false);
    }
  }, [unitLocation]);

  useEffect(() => {
    if (activeMode === 'mandiri') {
      void requestUserLocation(true);
    }
  }, [activeMode, requestUserLocation]);

  const handleOpenNavigationMaps = () => {
    const uLat = unitLocation.latitude;
    const uLng = unitLocation.longitude;
    if (!uLat || !uLng) return;

    if (userLocation && userLocation.latitude && userLocation.longitude) {
      const url = `https://www.google.com/maps/dir/?api=1&origin=${userLocation.latitude},${userLocation.longitude}&destination=${uLat},${uLng}`;
      void Linking.openURL(url);
    } else {
      const url = `https://www.google.com/maps/search/?api=1&query=${uLat},${uLng}`;
      void Linking.openURL(url);
    }
  };

  const getDeviceLocation = async (): Promise<{ latitude: number; longitude: number } | null> => {
    if (userLocation && userLocation.latitude && userLocation.longitude) {
      return userLocation;
    }
    return await requestUserLocation(false);
  };

  const computedEmpStats = useMemo(() => {
    if (employeeStats && typeof employeeStats === 'object') {
      return {
        hadir: Number(employeeStats.hadir ?? employeeStats.present ?? 0),
        terlambat: Number(employeeStats.terlambat ?? employeeStats.late ?? 0),
        izin: Number(employeeStats.izin ?? employeeStats.permission ?? 0),
        sakit: Number(employeeStats.sakit ?? employeeStats.sick ?? 0),
        dinas_luar: Number(employeeStats.dinas_luar ?? employeeStats.official_duty ?? 0),
        alpa: Number(employeeStats.alpa ?? employeeStats.absent ?? 0),
      };
    }
    let hadir = 0; let terlambat = 0; let izin = 0; let sakit = 0; let dinas_luar = 0; let alpa = 0;
    employeeHistory.forEach((item: any) => {
      const st = String(item.status || '').toUpperCase();
      if (st === 'HADIR') hadir++;
      else if (st === 'TERLAMBAT') terlambat++;
      else if (st === 'IZIN') izin++;
      else if (st === 'SAKIT') sakit++;
      else if (st === 'DINAS_LUAR') dinas_luar++;
      else if (st === 'ALPHA' || st === 'ALPA') alpa++;
    });
    return { hadir, terlambat, izin, sakit, dinas_luar, alpa };
  }, [employeeStats, employeeHistory]);

  const fetchEmployeeAttendance = useCallback(async () => {
    if (!effectiveEmployeeId) return;
    setLoadingEmpAttendance(true);
    try {
      const [repRes, statsRes, teacherAttRes] = await Promise.allSettled([
        mobileApiService.getAttendanceReport({ employee_id: String(effectiveEmployeeId), tipe_presensi: 'Pegawai', per_page: 50 }),
        mobileApiService.getAttendanceStats({ employee_id: String(effectiveEmployeeId), tipe_presensi: 'Pegawai' }),
        mobileApiService.getTeacherAttendanceLogs(),
      ]);

      let history: any[] = [];
      if (repRes.status === 'fulfilled') {
        const res = repRes.value;
        history = Array.isArray(res?.records) ? res.records : (Array.isArray(res?.data) ? res.data : (Array.isArray(res?.data?.data) ? res.data.data : []));
      }
      if (history.length === 0 && teacherAttRes.status === 'fulfilled') {
        const res = teacherAttRes.value;
        const raw = res?.data || res || [];
        history = Array.isArray(raw?.data) ? raw.data : (Array.isArray(raw) ? raw : []);
      }
      setEmployeeHistory(history);

      if (statsRes.status === 'fulfilled') {
        const s = statsRes.value?.data || statsRes.value || null;
        setEmployeeStats(s);
      }
    } catch (e) {
      console.warn('[TeacherQrAttendanceHub] fetchEmployeeAttendance error:', e);
    } finally {
      setLoadingEmpAttendance(false);
    }
  }, [effectiveEmployeeId]);

  useEffect(() => {
    if (activeMode === 'mandiri') {
      void fetchEmployeeAttendance();
    }
  }, [activeMode, fetchEmployeeAttendance]);

  const handleEmployeeCheckIn = async () => {
    if (!effectiveEmployeeId) return;
    setSavingEmpAttendance(true);
    let capturedCoords: { latitude: number; longitude: number } | null = null;
    try {
      const coords = await getDeviceLocation();
      capturedCoords = coords;

      const payload: AttendancePayload = {
        tipe_presensi: 'Pegawai',
        employee_id: String(effectiveEmployeeId),
        unit_pendidikan_id: effectiveUnitId ? String(effectiveUnitId) : undefined,
        attendance_date: todayDateStr,
        status: 'HADIR',
        attendance_method: 'MOBILE',
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        location: coords ? 'Presensi Mandiri Mobile (GPS Terverifikasi)' : 'SIMS Mobile Android',
        keterangan: 'Presensi mandiri melalui aplikasi mobile (Radius Maksimal 30 Meter).',
      };
      await mobileApiService.checkIn(payload);
      setFeedbackModal({
        visible: true,
        type: 'success',
        title: 'Presensi Masuk Berhasil',
        message: 'Presensi masuk Anda berhasil dicatat di server sekolah.',
      });
      await fetchEmployeeAttendance();
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || err?.message || 'Presensi masuk belum berhasil dicatat.';
      const errData = err?.response?.data?.data;
      if (errData || errMsg.includes('radius') || errMsg.includes('di luar radius')) {
        setRejectionModal({
          visible: true,
          title: 'Presensi Masuk Ditolak',
          message: errMsg,
          details: errData
            ? {
                unitName: errData.unit_name,
                distanceMeter: errData.distance_meter,
                maxRadiusMeter: errData.max_radius_meter,
                userLatitude: errData.user_latitude,
                userLongitude: errData.user_longitude,
                unitLatitude: errData.unit_latitude,
                unitLongitude: errData.unit_longitude,
              }
            : {
                unitName: teacherUnit,
                userLatitude: capturedCoords?.latitude,
                userLongitude: capturedCoords?.longitude,
                unitLatitude: unitLocation.latitude,
                unitLongitude: unitLocation.longitude,
                maxRadiusMeter: unitLocation.radiusMeter,
                distanceMeter: distanceToUnit || undefined,
              },
        });
      } else {
        setFeedbackModal({
          visible: true,
          type: 'error',
          title: 'Presensi Masuk Gagal',
          message: getApiErrorMessage(err, 'Presensi masuk belum berhasil dicatat.'),
        });
      }
    } finally {
      setSavingEmpAttendance(false);
    }
  };

  const handleEmployeeCheckOut = async () => {
    if (!effectiveEmployeeId) return;
    setSavingEmpAttendance(true);
    let capturedCoords: { latitude: number; longitude: number } | null = null;
    try {
      const coords = await getDeviceLocation();
      capturedCoords = coords;

      await mobileApiService.checkOut({
        attendance_id: todayEmpRecord?.id ? String(todayEmpRecord.id) : undefined,
        employee_id: String(effectiveEmployeeId),
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        location: coords ? 'Presensi Mandiri Mobile (GPS Terverifikasi)' : 'SIMS Mobile Android',
      });
      setFeedbackModal({
        visible: true,
        type: 'success',
        title: 'Presensi Pulang Berhasil',
        message: 'Presensi pulang Anda berhasil dicatat di server sekolah.',
      });
      await fetchEmployeeAttendance();
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || err?.message || 'Presensi pulang belum berhasil dicatat.';
      const errData = err?.response?.data?.data;
      if (errData || errMsg.includes('radius') || errMsg.includes('di luar radius')) {
        setRejectionModal({
          visible: true,
          title: 'Presensi Pulang Ditolak',
          message: errMsg,
          details: errData
            ? {
                unitName: errData.unit_name,
                distanceMeter: errData.distance_meter,
                maxRadiusMeter: errData.max_radius_meter,
                userLatitude: errData.user_latitude,
                userLongitude: errData.user_longitude,
                unitLatitude: errData.unit_latitude,
                unitLongitude: errData.unit_longitude,
              }
            : {
                unitName: teacherUnit,
                userLatitude: capturedCoords?.latitude,
                userLongitude: capturedCoords?.longitude,
                unitLatitude: unitLocation.latitude,
                unitLongitude: unitLocation.longitude,
                maxRadiusMeter: unitLocation.radiusMeter,
                distanceMeter: distanceToUnit || undefined,
              },
        });
      } else {
        setFeedbackModal({
          visible: true,
          type: 'error',
          title: 'Presensi Pulang Gagal',
          message: getApiErrorMessage(err, 'Presensi pulang belum berhasil dicatat.'),
        });
      }
    } finally {
      setSavingEmpAttendance(false);
    }
  };

  const openLeaveModal = (type: 'IZIN' | 'SAKIT' | 'DINAS_LUAR') => {
    setLeaveStatus(type);
    setLeaveDate(todayDateStr);
    setLeaveReason('');
    setLeaveModalOpen(true);
  };

  const handleSubmitLeave = async () => {
    if (!effectiveEmployeeId) return;
    if (!leaveReason.trim()) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Keterangan Diperlukan',
        message: `Mohon tuliskan keterangan / alasan ${leaveStatus.toLowerCase().replace('_', ' ')} secara jelas.`,
      });
      return;
    }
    setSubmittingLeave(true);
    try {
      const payload: AttendancePayload = {
        tipe_presensi: 'Pegawai',
        employee_id: String(effectiveEmployeeId),
        unit_pendidikan_id: effectiveUnitId ? String(effectiveUnitId) : undefined,
        attendance_date: leaveDate,
        status: leaveStatus as any,
        attendance_method: 'MOBILE',
        location: 'SIMS Mobile Android',
        keterangan: leaveReason.trim(),
      };
      await mobileApiService.checkIn(payload);
      setLeaveModalOpen(false);
      setLeaveReason('');
      setFeedbackModal({
        visible: true,
        type: 'success',
        title: 'Pengajuan Berhasil',
        message: `Pengajuan ${leaveStatus.toLowerCase().replace('_', ' ')} Anda berhasil dicatat.`,
      });
      await fetchEmployeeAttendance();
    } catch (err) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Pengajuan Gagal',
        message: getApiErrorMessage(err, 'Pengajuan perizinan belum berhasil dikirim.'),
      });
    } finally {
      setSubmittingLeave(false);
    }
  };

  // Filtered students for Manual with chip filter
  const chipFilteredStudents = useMemo(() => {
    let base = filteredStudents;
    if (statusFilterChip === 'belum') base = base.filter((st) => !studentStatuses[String(st.id || st.student_id)]);
    else if (statusFilterChip === 'hadir') base = base.filter((st) => studentStatuses[String(st.id || st.student_id)] === 'present');
    else if (statusFilterChip === 'izin') base = base.filter((st) => studentStatuses[String(st.id || st.student_id)] === 'permission');
    else if (statusFilterChip === 'sakit') base = base.filter((st) => studentStatuses[String(st.id || st.student_id)] === 'sick');
    else if (statusFilterChip === 'alpha') base = base.filter((st) => studentStatuses[String(st.id || st.student_id)] === 'absent');
    return base;
  }, [filteredStudents, statusFilterChip, studentStatuses]);

  // Open detail after scan
  const handleScanSuccess = (newScanRecord: any, matchedStudent: any) => {
    setScanDetailStudent({ ...newScanRecord, student: matchedStudent });
  };

  const hasNoSchedule = !loadingSchedules && activeSchedules.length === 0 && !selectedSchedule;

  // ──── KBM Aktif Card (shared between Scan & Manual) ────
  const KBMCard = () => {
    const isGate = route?.params?.context === 'gate' || (activeMode === 'scan' && !selectedSchedule);
    return (
      <View style={s.activeScheduleCard}>
        <View style={s.activeScheduleHeaderRow}>
          <View style={s.liveBadgeWrap}>
            <View style={s.livePulseDot} />
            <Text style={s.liveBadgeText}>
              {isGate ? 'TERMINAL GERBANG' : (selectedSchedule ? 'KBM AKTIF' : 'SCAN SISWA')}
            </Text>
          </View>
          <Text style={s.activeScheduleTime}>
            {selectedSchedule?.time_start
              ? `${String(selectedSchedule.time_start).substring(0, 5)} - ${String(selectedSchedule.time_end || '').substring(0, 5)}`
              : '--:-- - --:--'}
          </Text>
        </View>
        <Text style={s.activeScheduleSubject}>
          {isGate
            ? 'Presensi Gerbang Masuk & Pulang'
            : (selectedSchedule?.subject?.name || selectedSchedule?.nama_mapel || 'Pilih Jadwal KBM')}
        </Text>

        {!isGate ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setShowRombelSheet(true)}
            style={s.kbmDropdownTrigger}
          >
            <View style={s.kbmDropdownTriggerLeft}>
              <View style={s.kbmDropdownIconBox}>
                <MaterialCommunityIcons name="google-classroom" size={18} color="#059669" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.kbmDropdownLabel}>PILIH ROMBEL & KELAS</Text>
                <Text style={s.kbmDropdownValue} numberOfLines={1}>
                  {selectedSchedule?.kelas?.nama_kelas || selectedSchedule?.class_name || 'Ketuk untuk Memilih Rombel / Kelas'}
                  {selectedSchedule?.subject?.name ? ` · ${selectedSchedule.subject.name}` : ''}
                </Text>
              </View>
            </View>
            <View style={s.kbmDropdownChevronBox}>
              <MaterialCommunityIcons name="chevron-down" size={18} color="#059669" />
            </View>
          </TouchableOpacity>
        ) : (
          <View style={s.activeScheduleClassRow}>
            <MaterialCommunityIcons name="door-open" size={17} color="#059669" />
            <Text style={s.activeScheduleClassName} numberOfLines={1}>
              Pemindai Kedatangan & Kepulangan Santri/Siswa
            </Text>
          </View>
        )}

        <View style={s.locationRow}>
          <MaterialCommunityIcons name="map-marker-outline" size={15} color="#059669" />
          <Text style={s.locationText} numberOfLines={1}>
            {resolveUnitName(selectedSchedule?.kelas?.unitPendidikan) ||
             resolveUnitName(selectedSchedule?.kelas?.unit_pendidikan) ||
             resolveUnitName(selectedSchedule?.unit) ||
             (typeof selectedSchedule?.unit_name === 'string' ? selectedSchedule.unit_name : null) ||
             teacherUnit}
          </Text>
        </View>

      {/* Tanggal & Sesi Hari Ini dipindahkan ke Card KBM Aktif */}
      <View style={s.kbmCardDateRow}>
        <View style={s.kbmCardDateLeft}>
          <MaterialCommunityIcons name="calendar-clock-outline" size={14} color="#059669" />
          <Text style={s.kbmCardDateText} numberOfLines={1}>{dynamicKbmDateText}</Text>
        </View>
        <View style={s.sesiTag}>
          <View style={s.livePulseDot} />
          <Text style={s.sesiTagText}>Sesi Hari Ini</Text>
        </View>
      </View>

      {activeSchedules.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
          {activeSchedules.map((sc, idx) => {
            const isCur = sc.id === selectedSchedule?.id;
            return (
              <TouchableOpacity
                key={`chip-${sc.id || idx}`}
                onPress={() => setSelectedSchedule(sc)}
                style={[s.scheduleChip, isCur && s.scheduleChipActive]}
              >
                <Text style={[s.scheduleChipText, isCur && s.scheduleChipTextActive]}>
                  {sc.kelas?.nama_kelas || sc.class_name || `Jadwal ${idx + 1}`} – {sc.subject?.name || ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
    );
  };

  return (
    <View style={s.container}>

      {/* ── HEADER ── */}
      <LinearGradient
        colors={['#065F46', '#059669']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[s.headerGradient, { paddingTop: insets.top + 8 }]}
      >
        <View style={s.headerRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              if (scanDetailStudent) { setScanDetailStudent(null); return; }
              if (showRekapView) { setShowRekapView(false); return; }
              const handled = useNavigationHistoryStore.getState().goBackDynamic(navigation);
              if (!handled) navigation?.navigate('Beranda');
            }}
            style={s.headerIconBtn}
          >
            <MaterialCommunityIcons name="arrow-left" size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={s.headerCenterCol}>
            {activeMode === 'mandiri' && !scanDetailStudent && !showRekapView && (
              <View style={s.mandiriRoleTag}>
                <View style={s.mandiriPulseDot} />
                <Text style={s.mandiriRoleTagText}>PENDIDIK & GURU • PRESENSI TERPADU</Text>
              </View>
            )}
            <Text style={s.headerTitle}>
              {scanDetailStudent ? 'Detail Kehadiran' : showRekapView ? 'Rekap Presensi KBM' : activeMode === 'mandiri' ? 'Presensi Mandiri' : activeMode === 'scan' ? 'Presensi Scan Gerbang' : activeMode === 'manual' ? 'Presensi Kelas (KBM)' : 'Kartu & QR Pegawai'}
            </Text>
            <Text style={s.headerSubtitle}>
              {scanDetailStudent ? 'Informasi Riwayat Siswa' : showRekapView ? 'Ringkasan Kehadiran Rombel' : activeMode === 'mandiri' ? (currentDateText || 'Presensi Mandiri Pendidik & Tenaga Kependidikan') : activeMode === 'scan' ? 'Pemindai Kartu & QR Siswa Terpadu' : activeMode === 'manual' ? 'Checklist Roster & Jam Mengajar Siswa' : 'Identitas QR Resmi Pendidik / Staf'}
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => navigation?.navigate('Notifikasi')}
            style={s.headerIconBtn}
          >
            <MaterialCommunityIcons name="bell-outline" size={20} color="#FFFFFF" />
            <View style={s.bellBadge} />
          </TouchableOpacity>
        </View>

        {/* ── 4-TAB SEGMENTED SWITCHER (hidden on detail/rekap) ── */}
        {!scanDetailStudent && !showRekapView && (
          <View style={s.switcherWrap}>
            {([
              { key: 'mandiri' as const, label: 'Mandiri', icon: 'account-check-outline' },
              { key: 'manual' as const, label: 'KBM', icon: 'format-list-checks' },
              ...(canAccessGate ? [{ key: 'scan' as const, label: 'Gerbang', icon: 'camera-outline' }] : []),
              { key: 'qr' as const, label: 'Kartu QR', icon: 'qrcode' },
            ]).map((tab) => {
              const isActive = activeMode === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  activeOpacity={0.85}
                  onPress={() => {
                    setActiveMode(tab.key);
                    setScanDetailStudent(null);
                    setShowRekapView(false);
                    setShowStatusDropdown(false);
                    setShowRekapDropdown(false);
                  }}
                  style={[s.switcherTab, isActive && s.switcherTabActive]}
                >
                  <MaterialCommunityIcons
                    name={tab.icon as any}
                    size={14}
                    color={isActive ? '#FFFFFF' : 'rgba(255,255,255,0.7)'}
                  />
                  <Text style={[s.switcherTabText, isActive && s.switcherTabTextActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </LinearGradient>

      {/* ── BODY ── */}
      <View style={s.body}>

        {/* ======================================================= */}
        {/* SCREEN MANDIRI: PRESENSI MANDIRI PEGAWAI / GURU        */}
        {/* ======================================================= */}
        {!scanDetailStudent && !showRekapView && activeMode === 'mandiri' && (
          <ScrollView
            contentContainerStyle={[s.scrollContent, { paddingBottom: bottomTabBarHeight + 40 }]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={loadingEmpAttendance}
                onRefresh={fetchEmployeeAttendance}
                colors={['#059669']}
                tintColor="#059669"
              />
            }
          >
            {/* 1. HERO / LIVE CLOCK & STATUS CARD (Harmonized with Staff Attendance Style) */}
            <View style={s.mandiriLiveCard}>
              <LinearGradient colors={['#F0FDFA', '#CCFBF1']} style={s.mandiriLiveGradient}>
                <View style={s.mandiriLiveTopRow}>
                  <View style={s.mandiriUnitBadge}>
                    <MaterialCommunityIcons name="office-building-marker" size={13} color="#0D9488" />
                    <Text style={s.mandiriUnitBadgeText} numberOfLines={1}>{teacherUnit}</Text>
                  </View>
                  <View
                    style={[
                      s.mandiriStatusBadge,
                      {
                        backgroundColor: checkedIn ? '#ECFDF5' : hasCheckOut ? '#F1F5F9' : '#FFF7ED',
                        borderColor: checkedIn ? '#A7F3D0' : hasCheckOut ? '#CBD5E1' : '#FFEDD5',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        s.mandiriStatusBadgeText,
                        { color: checkedIn ? '#059669' : hasCheckOut ? '#475569' : '#EA580C' },
                      ]}
                    >
                      {checkedIn ? 'Sedang Bekerja' : hasCheckOut ? 'Selesai' : 'Belum Presensi'}
                    </Text>
                  </View>
                </View>

                {/* Digital Clock Realtime */}
                <Text style={s.mandiriClockDigits}>{currentTime || '--:--:-- WIB'}</Text>
                <Text style={s.mandiriDateSubText}>{currentDateText || formatTanggalIndo(new Date().toISOString())}</Text>

                {/* ── MAP LOKASI UNIT & POSISI PENDIDIK DENGAN INDIKATOR JARAK REALTIME ── */}
                <View style={s.liveMapContainer}>
                  {/* Map Image View (Mapbox Retina 2x) */}
                  <View style={s.mapFrame}>
                    {mapTileInfo?.url ? (
                      <Image
                        source={{ uri: mapTileInfo.url }}
                        style={s.mapImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={s.mapLoadingBox}>
                        <ActivityIndicator size="small" color="#0D9488" />
                        <Text style={s.mapLoadingText}>Memuat peta lokasi...</Text>
                      </View>
                    )}

                    {/* Gradient overlay to soften bottom & top edges */}
                    <LinearGradient
                      colors={['rgba(0,0,0,0.4)', 'transparent', 'rgba(0,0,0,0.55)']}
                      style={StyleSheet.absoluteFill}
                      pointerEvents="none"
                    />

                    {/* Top Row Badges over Map */}
                    <View style={s.mapTopBadgesRow}>
                      <View style={s.mapUnitBadge}>
                        <MaterialCommunityIcons name="office-building-marker" size={13} color="#059669" />
                        <Text style={s.mapUnitBadgeText} numberOfLines={1}>{unitLocation.name}</Text>
                      </View>
                      <View style={[
                        s.mapRadiusPill,
                        distanceToUnit !== null && (isWithinRadius ? s.mapRadiusPillSuccess : s.mapRadiusPillDanger)
                      ]}>
                        <MaterialCommunityIcons
                          name={distanceToUnit !== null ? (isWithinRadius ? 'check-circle' : 'alert-circle') : 'crosshairs-gps'}
                          size={12}
                          color="#FFFFFF"
                        />
                        <Text style={s.mapRadiusPillText}>
                          {distanceToUnit !== null
                            ? isWithinRadius
                              ? 'Dalam Radius'
                              : 'Di Luar Radius'
                            : `Maks. ${unitLocation.radiusMeter}m`}
                        </Text>
                      </View>
                    </View>

                    {/* Bottom Row inside Map: Legend & External Maps Button */}
                    <View style={s.mapBottomRow}>
                      <View style={s.mapLegendBox}>
                        <View style={s.legendItem}>
                          <View style={[s.legendDot, { backgroundColor: '#059669' }]} />
                          <Text style={s.legendText}>Unit</Text>
                        </View>
                        <View style={s.legendItem}>
                          <View style={[s.legendDot, { backgroundColor: '#2563EB' }]} />
                          <Text style={s.legendText}>Anda</Text>
                        </View>
                      </View>

                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={handleOpenNavigationMaps}
                        style={s.mapNavigateBtn}
                      >
                        <MaterialCommunityIcons name="google-maps" size={13} color="#0F172A" />
                        <Text style={s.mapNavigateBtnText}>Rute</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Distance & GPS Status Card */}
                  <View style={s.distanceInfoCard}>
                    <View style={s.distancePrimaryRow}>
                      {/* Left: Distance Value */}
                      <View style={s.distanceValueCol}>
                        <Text style={s.distanceLabel}>Jarak Anda ke Unit</Text>
                        <View style={s.distanceNumberRow}>
                          <MaterialCommunityIcons
                            name="map-marker-distance"
                            size={20}
                            color={distanceToUnit !== null ? (isWithinRadius ? '#059669' : '#E11D48') : '#64748B'}
                          />
                          <Text style={[
                            s.distanceNumberText,
                            distanceToUnit !== null && (isWithinRadius ? { color: '#047857' } : { color: '#E11D48' })
                          ]}>
                            {formatDistance(distanceToUnit)}
                          </Text>
                        </View>
                      </View>

                      {/* Middle: Status Note */}
                      <View style={s.distanceStatusCol}>
                        <View style={[
                          s.distanceStatusTag,
                          distanceToUnit !== null
                            ? isWithinRadius
                              ? s.distanceStatusTagSuccess
                              : s.distanceStatusTagDanger
                            : s.distanceStatusTagPending
                        ]}>
                          <Text style={[
                            s.distanceStatusTagText,
                            distanceToUnit !== null
                              ? isWithinRadius
                                ? { color: '#047857' }
                                : { color: '#BE123C' }
                              : { color: '#D97706' }
                          ]}>
                            {distanceToUnit !== null
                              ? isWithinRadius
                                ? '✓ Radius Aman'
                                : `✕ Lebih ${Math.round(distanceToUnit - unitLocation.radiusMeter)}m`
                              : 'Menunggu GPS'}
                          </Text>
                        </View>
                        <Text style={s.distanceSubHint}>
                          Toleransi: {unitLocation.radiusMeter} meter
                        </Text>
                      </View>

                      {/* Right: Refresh GPS Button */}
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => void requestUserLocation(false)}
                        disabled={locatingUser}
                        style={s.refreshGpsBtn}
                      >
                        {locatingUser ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <>
                            <MaterialCommunityIcons name="crosshairs-gps" size={15} color="#FFFFFF" />
                            <Text style={s.refreshGpsBtnText}>GPS</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>

                    {/* Bottom: Coords Strip */}
                    <View style={s.coordsStripRow}>
                      <Text style={s.coordsStripText} numberOfLines={1}>
                        GPS: {userLocation ? `${userLocation.latitude.toFixed(5)}, ${userLocation.longitude.toFixed(5)}` : 'Mencari...'}
                      </Text>
                      <Text style={s.coordsStripDivider}>•</Text>
                      <Text style={s.coordsStripText} numberOfLines={1}>
                        Unit: {unitLocation.latitude.toFixed(5)}, {unitLocation.longitude.toFixed(5)}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Status Box: 3 Kartu Terpisah (Masuk, Pulang, Status) Bebas Tumpang Tindih */}
                <View style={s.mandiriStatusPillsRow}>
                  {/* Card 1: Masuk */}
                  <View style={[s.mandiriPillBox, hasCheckIn ? s.mandiriPillActiveIn : s.mandiriPillNeutral]}>
                    <View style={s.mandiriPillHeader}>
                      <MaterialCommunityIcons name="login" size={13} color="#059669" />
                      <Text style={[s.mandiriPillLabel, hasCheckIn && { color: '#047857' }]}>MASUK</Text>
                    </View>
                    <Text style={s.mandiriPillValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                      {todayIn}
                    </Text>
                    <Text style={[s.mandiriPillSub, hasCheckIn && { color: '#059669' }]} numberOfLines={1}>
                      {hasCheckIn ? 'WIB • Tercatat' : 'Belum Absen'}
                    </Text>
                  </View>

                  {/* Card 2: Pulang */}
                  <View style={[s.mandiriPillBox, hasCheckOut ? s.mandiriPillActiveOut : s.mandiriPillNeutral]}>
                    <View style={s.mandiriPillHeader}>
                      <MaterialCommunityIcons name="logout" size={13} color="#0D9488" />
                      <Text style={[s.mandiriPillLabel, hasCheckOut && { color: '#0F766E' }]}>PULANG</Text>
                    </View>
                    <Text style={s.mandiriPillValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                      {todayOut}
                    </Text>
                    <Text style={[s.mandiriPillSub, hasCheckOut && { color: '#0D9488' }]} numberOfLines={1}>
                      {hasCheckOut ? 'WIB • Selesai' : 'Belum Absen'}
                    </Text>
                  </View>

                  {/* Card 3: Status */}
                  <View style={[
                    s.mandiriPillBox,
                    isStatusPositive ? s.mandiriPillSuccess : s.mandiriPillNeutral
                  ]}>
                    <View style={s.mandiriPillHeader}>
                      <MaterialCommunityIcons
                        name={isStatusPositive ? 'check-circle' : 'clock-outline'}
                        size={13}
                        color={isStatusPositive ? '#047857' : '#64748B'}
                      />
                      <Text style={[
                        s.mandiriPillLabel,
                        isStatusPositive ? { color: '#047857' } : { color: '#64748B' }
                      ]}>
                        STATUS
                      </Text>
                    </View>
                    <Text
                      style={[
                        s.mandiriPillValue,
                        isStatusPositive ? { color: '#047857' } : { color: '#64748B' }
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      {todayStatusLabel}
                    </Text>
                    <Text style={[
                      s.mandiriPillSub,
                      isStatusPositive ? { color: '#059669' } : { color: '#94A3B8' }
                    ]} numberOfLines={1}>
                      {hasCheckIn ? 'Tercatat' : 'Mandiri'}
                    </Text>
                  </View>
                </View>

                {/* Primary action button: Masuk / Pulang / Selesai */}
                <TouchableOpacity
                  activeOpacity={0.88}
                  disabled={savingEmpAttendance || hasCheckOut}
                  onPress={() => void (checkedIn ? handleEmployeeCheckOut() : handleEmployeeCheckIn())}
                  style={[
                    s.mandiriActionBtn,
                    checkedIn ? s.mandiriActionBtnOrange : s.mandiriActionBtnGreen,
                    (savingEmpAttendance || hasCheckOut) && { opacity: 0.6 },
                  ]}
                >
                  {savingEmpAttendance ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <MaterialCommunityIcons
                        name={checkedIn ? 'logout-variant' : hasCheckOut ? 'check-decagram' : 'login-variant'}
                        size={18}
                        color="#FFFFFF"
                        style={{ marginRight: 8 }}
                      />
                      <Text style={s.mandiriActionBtnText}>
                        {checkedIn ? 'Presensi Pulang Sekarang' : hasCheckOut ? 'Presensi Hari Ini Selesai' : 'Presensi Masuk Sekarang'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* 3 Quick Action buttons: Ajukan Izin / Lapor Sakit / Dinas Luar */}
                <View style={s.mandiriQuickBtnRow}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    disabled={savingEmpAttendance}
                    onPress={() => openLeaveModal('IZIN')}
                    style={[s.mandiriQuickBtn, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
                  >
                    <MaterialCommunityIcons name="file-document-edit-outline" size={15} color="#2563EB" />
                    <Text style={[s.mandiriQuickBtnText, { color: '#2563EB' }]}>Ajukan Izin</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    disabled={savingEmpAttendance}
                    onPress={() => openLeaveModal('SAKIT')}
                    style={[s.mandiriQuickBtn, { backgroundColor: '#FAF5FF', borderColor: '#E9D5FF' }]}
                  >
                    <MaterialCommunityIcons name="medical-bag" size={15} color="#7C3AED" />
                    <Text style={[s.mandiriQuickBtnText, { color: '#7C3AED' }]}>Lapor Sakit</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    disabled={savingEmpAttendance}
                    onPress={() => openLeaveModal('DINAS_LUAR')}
                    style={[s.mandiriQuickBtn, { backgroundColor: '#F0FDFA', borderColor: '#99F6E4' }]}
                  >
                    <MaterialCommunityIcons name="briefcase-check-outline" size={15} color="#0D9488" />
                    <Text style={[s.mandiriQuickBtnText, { color: '#0D9488' }]}>Dinas Luar</Text>
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </View>

            {/* 2. STATISTIK KPI KEHADIRAN PEGAWAI BULAN INI */}
            <View style={s.mandiriKpiSection}>
              <View style={s.mandiriSectionTitleRow}>
                <View style={[s.sectionIconBadge, { backgroundColor: '#CCFBF1' }]}>
                  <MaterialCommunityIcons name="chart-box-outline" size={15} color="#0D9488" />
                </View>
                <Text style={s.mandiriSectionTitle}>Ringkasan Kehadiran Saya</Text>
              </View>
              <View style={s.mandiriKpiGrid}>
                <View style={[s.mandiriKpiCard, { borderColor: '#A7F3D0', backgroundColor: '#ECFDF5' }]}>
                  <Text style={[s.mandiriKpiVal, { color: '#059669' }]}>{computedEmpStats.hadir}</Text>
                  <Text style={s.mandiriKpiLabel}>Hadir</Text>
                </View>
                <View style={[s.mandiriKpiCard, { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' }]}>
                  <Text style={[s.mandiriKpiVal, { color: '#D97706' }]}>{computedEmpStats.terlambat}</Text>
                  <Text style={s.mandiriKpiLabel}>Terlambat</Text>
                </View>
                <View style={[s.mandiriKpiCard, { borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' }]}>
                  <Text style={[s.mandiriKpiVal, { color: '#2563EB' }]}>{computedEmpStats.izin + computedEmpStats.sakit}</Text>
                  <Text style={s.mandiriKpiLabel}>Izin/Sakit</Text>
                </View>
                <View style={[s.mandiriKpiCard, { borderColor: '#99F6E4', backgroundColor: '#F0FDFA' }]}>
                  <Text style={[s.mandiriKpiVal, { color: '#0D9488' }]}>{computedEmpStats.dinas_luar}</Text>
                  <Text style={s.mandiriKpiLabel}>Dinas Luar</Text>
                </View>
                <View style={[s.mandiriKpiCard, { borderColor: '#FECDD3', backgroundColor: '#FFF1F2' }]}>
                  <Text style={[s.mandiriKpiVal, { color: '#E11D48' }]}>{computedEmpStats.alpa}</Text>
                  <Text style={s.mandiriKpiLabel}>Alpha</Text>
                </View>
              </View>
            </View>

            {/* 3. KARTU QR PEGAWAI SAYA (QUICK ACCESS) */}
            <View style={s.mandiriQrBox}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <MaterialCommunityIcons name="qrcode-scan" size={16} color="#059669" />
                  <Text style={s.mandiriQrBoxTitle}>Kartu QR Pegawai</Text>
                </View>
                <Text style={s.mandiriQrBoxSub}>Tunjukkan barcode ID ini ke scanner gerbang</Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setActiveMode('qr')}
                style={s.mandiriQrBoxBtn}
              >
                <Text style={s.mandiriQrBoxBtnText}>Buka QR</Text>
                <MaterialCommunityIcons name="chevron-right" size={16} color="#059669" />
              </TouchableOpacity>
            </View>

            {/* 4. RIWAYAT PRESENSI MANDIRI */}
            <View style={s.mandiriHistorySection}>
              <View style={s.mandiriSectionTitleRow}>
                <View style={[s.sectionIconBadge, { backgroundColor: '#E0F2FE' }]}>
                  <MaterialCommunityIcons name="history" size={15} color="#0284C7" />
                </View>
                <Text style={s.mandiriSectionTitle}>Riwayat Presensi Mandiri</Text>
              </View>
              {employeeHistory.length === 0 ? (
                <View style={s.mandiriEmptyBox}>
                  <MaterialCommunityIcons name="calendar-blank-outline" size={32} color="#CBD5E1" />
                  <Text style={s.mandiriEmptyText}>Belum ada riwayat presensi tercatat.</Text>
                </View>
              ) : (
                employeeHistory.slice(0, 10).map((item: any, idx: number) => {
                  const status = String(item.status || 'HADIR').toUpperCase();
                  const isHadir = status === 'HADIR';
                  const isTerlambat = status === 'TERLAMBAT';
                  const isIzin = status === 'IZIN';
                  const isSakit = status === 'SAKIT';
                  const isDinas = status === 'DINAS_LUAR';

                  const badgeBg = isHadir ? '#ECFDF5' : isTerlambat ? '#FFFBEB' : isDinas ? '#F0FDFA' : isIzin ? '#EFF6FF' : isSakit ? '#FAF5FF' : '#FFF1F2';
                  const badgeColor = isHadir ? '#059669' : isTerlambat ? '#D97706' : isDinas ? '#0D9488' : isIzin ? '#2563EB' : isSakit ? '#7C3AED' : '#E11D48';

                  const tglStr = item.date || item.attendance_date || item.tanggal || '';
                  const inTime = item.check_in_time ? formatJamIndo(item.check_in_time) : (item.check_in || '--:--');
                  const outTime = item.check_out_time ? formatJamIndo(item.check_out_time) : (item.check_out && item.check_out !== '--:--' ? item.check_out : '--:--');

                  return (
                    <View key={item.id || idx} style={s.mandiriHistoryItem}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.mandiriHistoryDate}>{formatTanggalIndo(tglStr)}</Text>
                        <View style={s.mandiriHistoryTimeRow}>
                          <View style={s.mandiriHistoryTimePill}>
                            <MaterialCommunityIcons name="login" size={12} color="#059669" />
                            <Text style={s.mandiriHistoryTimeVal}>{inTime}</Text>
                          </View>
                          <Text style={s.mandiriHistoryTimeDot}>•</Text>
                          <View style={s.mandiriHistoryTimePill}>
                            <MaterialCommunityIcons name="logout" size={12} color="#0D9488" />
                            <Text style={s.mandiriHistoryTimeVal}>{outTime}</Text>
                          </View>
                        </View>
                        {item.keterangan || item.location ? (
                          <View style={s.mandiriHistoryLocationRow}>
                            <MaterialCommunityIcons name="map-marker-outline" size={12} color="#64748B" />
                            <Text numberOfLines={1} style={s.mandiriHistoryKet}>
                              {item.location || item.keterangan}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={[s.mandiriHistoryBadge, { backgroundColor: badgeBg }]}>
                        <Text style={[s.mandiriHistoryBadgeText, { color: badgeColor }]}>{status}</Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>
        )}

        {/* ======================================================= */}
        {/* SCREEN 10: STATE KOSONG – TIDAK ADA KBM AKTIF (MANUAL)   */}
        {/* ======================================================= */}
        {hasNoSchedule && !scanDetailStudent && !showRekapView && activeMode === 'manual' && (
          <ScrollView contentContainerStyle={s.emptyStateContainer}>
            <View style={s.emptyIllustrationWrap}>
              <MaterialCommunityIcons name="calendar-blank-outline" size={80} color="#D1FAE5" />
              <View style={s.emptyIllustrationOverlay}>
                <MaterialCommunityIcons name="close-circle" size={28} color="#F87171" />
              </View>
            </View>
            <Text style={s.emptyStateTitle}>Belum ada KBM aktif</Text>
            <Text style={s.emptyStateDesc}>
              Tidak ada jadwal mengajar pada waktu ini.{'\n'}Silakan cek tanggal dan jadwal Anda.
            </Text>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => navigation?.navigate('Jadwal')}
              style={s.emptyStateBtnOutline}
            >
              <MaterialCommunityIcons name="calendar-clock-outline" size={16} color="#059669" style={{ marginRight: 6 }} />
              <Text style={s.emptyStateBtnOutlineText}>Lihat Jadwal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setShowRombelSheet(true)}
              style={s.emptyStateBtnFill}
            >
              <MaterialCommunityIcons name="google-classroom" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={s.emptyStateBtnFillText}>Pilih Rombel & Kelas</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* ======================================================= */}
        {/* SCREEN 4: DETAIL KEHADIRAN SETELAH SCAN                 */}
        {/* ======================================================= */}
        {scanDetailStudent && (
          <ScrollView
            contentContainerStyle={[s.scrollContent, { paddingBottom: bottomTabBarHeight + 30 }]}
            showsVerticalScrollIndicator={false}
          >
            {/* KBM Aktif Card */}
            <KBMCard />

            {/* Success Banner */}
            <View style={s.scanDetailSuccessCard}>
              <View style={s.scanDetailCheckCircle}>
                <MaterialCommunityIcons name="check-circle" size={52} color="#FFFFFF" />
              </View>
              <Text style={s.scanDetailSuccessTitle}>Presensi Berhasil!</Text>
              <Text style={s.scanDetailSuccessDesc}>
                <Text style={{ fontWeight: '700' }}>{scanDetailStudent.name}</Text>
                {'\n'}telah dicatat sebagai{' '}
                <Text style={{ color: '#059669', fontWeight: '800' }}>Hadir</Text>.
              </Text>
            </View>

            {/* Student Card */}
            <View style={s.scanDetailStudentCard}>
              <View style={s.scanDetailAvatarWrap}>
                <Image
                  source={
                    scanDetailStudent.avatar
                      ? { uri: scanDetailStudent.avatar }
                      : DEFAULT_STUDENT_BOY_AVATAR
                  }
                  style={s.scanDetailAvatarImg}
                  resizeMode="cover"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.scanDetailStudentName}>{scanDetailStudent.name}</Text>
                <Text style={s.scanDetailStudentNis}>NIS: {scanDetailStudent.nis || '-'}</Text>
                <Text style={s.scanDetailStudentClass}>{scanDetailStudent.className || ''}</Text>
              </View>
            </View>

            {/* Status Hadir Badge */}
            <View style={s.scanDetailHadirBadge}>
              <MaterialCommunityIcons name="check-circle" size={16} color="#059669" />
              <Text style={s.scanDetailHadirText}>
                Hadir – {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })} • {scanDetailStudent.time} WIB
              </Text>
            </View>

            {/* Catatan */}
            <View style={s.detailNoteBox}>
              <Text style={s.detailNoteLabel}>Catatan (Opsional)</Text>
              <TextInput
                style={s.detailNoteInput}
                placeholder="Tambahkan catatan..."
                placeholderTextColor="#CBD5E1"
                multiline
              />
            </View>

            {/* Selesai Button */}
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => setScanDetailStudent(null)}
              style={s.selesaiBtn}
            >
              <LinearGradient
                colors={['#059669', '#10B981']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.selesaiBtnGradient}
              >
                <MaterialCommunityIcons name="check-all" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={s.selesaiBtnText}>Selesai</Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* ======================================================= */}
        {/* SCREEN 5: REKAP PRESENSI                                */}
        {/* ======================================================= */}
        {showRekapView && !scanDetailStudent && (
          <View style={{ flex: 1 }}>
            <ScrollView
              contentContainerStyle={[s.scrollContent, { paddingBottom: bottomTabBarHeight + 100 }]}
              showsVerticalScrollIndicator={false}
            >
              {/* KBM Aktif Card */}
              <KBMCard />

              {/* 4 KPI Cards */}
              <View style={s.kpiRow}>
                {[
                  { label: 'Hadir', count: statusCounts.p, pct: students.length > 0 ? Math.round((statusCounts.p / students.length) * 100) : 0, color: '#059669', bg: '#ECFDF5', icon: 'account-check' },
                  { label: 'Izin', count: statusCounts.i, pct: students.length > 0 ? Math.round((statusCounts.i / students.length) * 100) : 0, color: '#2563EB', bg: '#EFF6FF', icon: 'file-document-outline' },
                  { label: 'Sakit', count: statusCounts.s, pct: students.length > 0 ? Math.round((statusCounts.s / students.length) * 100) : 0, color: '#D97706', bg: '#FFFBEB', icon: 'heart' },
                  { label: 'Alpha', count: statusCounts.a, pct: students.length > 0 ? Math.round((statusCounts.a / students.length) * 100) : 0, color: '#DC2626', bg: '#FEF2F2', icon: 'close-circle-outline' },
                ].map((kpi) => (
                  <View key={kpi.label} style={[s.kpiCard, { backgroundColor: kpi.bg }]}>
                    <MaterialCommunityIcons name={kpi.icon as any} size={20} color={kpi.color} />
                    <Text style={[s.kpiCount, { color: kpi.color }]}>{kpi.count}</Text>
                    <Text style={[s.kpiLabel, { color: kpi.color }]}>{kpi.label}</Text>
                    <Text style={[s.kpiPct, { color: kpi.color }]}>{kpi.pct}%</Text>
                  </View>
                ))}
              </View>

              {/* Search */}
              <View style={s.rekap_searchBar}>
                <MaterialCommunityIcons name="magnify" size={16} color="#94A3B8" />
                <TextInput
                  style={s.rekap_searchInput}
                  placeholder="Cari nama santri/siswa..."
                  placeholderTextColor="#94A3B8"
                  value={studentSearch}
                  onChangeText={setStudentSearch}
                />
              </View>

              {/* Header Bar with Title and Status Dropdown */}
              <View style={s.rekapFilterHeaderRow}>
                <View style={s.daftarHeaderTitleWrap}>
                  <Text style={s.daftarHeaderTitle}>Daftar Santri/Siswa</Text>
                  <View style={s.daftarCountBadge}>
                    <Text style={s.daftarCountBadgeText}>{chipFilteredStudents.length}</Text>
                  </View>
                </View>

                {/* Dropdown Button */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setShowRekapDropdown((p) => !p)}
                  style={[s.statusDropdownTrigger, showRekapDropdown && s.statusDropdownTriggerActive]}
                >
                  <View style={[s.statusDropdownTriggerIconWrap, { backgroundColor: currentStatusOption.bgColor }]}>
                    <MaterialCommunityIcons
                      name={currentStatusOption.icon as any}
                      size={13}
                      color={currentStatusOption.color}
                    />
                  </View>
                  <Text style={s.statusDropdownTriggerText}>
                    {currentStatusOption.label} ({currentStatusOption.count})
                  </Text>
                  <MaterialCommunityIcons
                    name={showRekapDropdown ? 'chevron-up' : 'chevron-down'}
                    size={15}
                    color="#475569"
                  />
                </TouchableOpacity>
              </View>

              {/* Rekap Dropdown Menu Items */}
              {showRekapDropdown && (
                <View style={[s.statusDropdownMenu, { marginBottom: 10 }]}>
                  {statusFilterOptions.map((opt) => {
                    const isSelected = statusFilterChip === opt.key;
                    return (
                      <TouchableOpacity
                        key={`rekap-drop-${opt.key}`}
                        activeOpacity={0.7}
                        onPress={() => {
                          setStatusFilterChip(opt.key);
                          setShowRekapDropdown(false);
                        }}
                        style={[s.statusDropdownItem, isSelected && s.statusDropdownItemActive]}
                      >
                        <View style={s.statusDropdownItemLeft}>
                          <View style={[s.statusDropdownIconWrap, { backgroundColor: opt.bgColor }]}>
                            <MaterialCommunityIcons name={opt.icon as any} size={15} color={opt.color} />
                          </View>
                          <Text style={[s.statusDropdownItemText, isSelected && s.statusDropdownItemTextActive]}>
                            {opt.label}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={[s.statusDropdownBadge, isSelected && s.statusDropdownBadgeActive]}>
                            <Text style={[s.statusDropdownBadgeText, isSelected && s.statusDropdownBadgeTextActive]}>
                              {opt.count}
                            </Text>
                          </View>
                          {isSelected ? (
                            <MaterialCommunityIcons name="check" size={17} color="#059669" />
                          ) : (
                            <View style={{ width: 17 }} />
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Rekap Table */}
              <View style={s.rekapTableCard}>
                {/* Table Header */}
                <View style={s.rekapTableHeader}>
                  <Text style={[s.rekapTHText, { width: 30 }]}>No</Text>
                  <Text style={[s.rekapTHText, { flex: 1 }]}>Nama Santri/Siswa</Text>
                  <Text style={[s.rekapTHText, { width: 64 }]}>Status</Text>
                  <Text style={[s.rekapTHText, { width: 50 }]}>Waktu</Text>
                </View>

                {/* Table Rows */}
                {chipFilteredStudents.map((st, idx) => {
                  const sId = String(st.id || st.student_id);
                  const curSt = studentStatuses[sId];
                  const sName = st.full_name || st.nama_lengkap || st.name || 'Santri';
                  const sNis = st.nis || '-';
                  const stImg = getProfileImageUrl(st);
                  const defAvatar = isGirlStudent(st) ? DEFAULT_STUDENT_GIRL_AVATAR : DEFAULT_STUDENT_BOY_AVATAR;

                  const statusCfg: Record<string, { label: string; color: string; bg: string }> = {
                    present: { label: 'Hadir', color: '#059669', bg: '#ECFDF5' },
                    permission: { label: 'Izin', color: '#2563EB', bg: '#EFF6FF' },
                    sick: { label: 'Sakit', color: '#D97706', bg: '#FFFBEB' },
                    absent: { label: 'Alpha', color: '#DC2626', bg: '#FEF2F2' },
                  };
                  const cfg = curSt ? statusCfg[curSt] : null;

                  return (
                    <View key={`rekap-${sId}`} style={[s.rekapTableRow, idx % 2 === 1 && s.rekapTableRowAlt]}>
                      <Text style={[s.rekapTDText, { width: 30 }]}>{idx + 1}</Text>
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={s.rekapAvatarBox}>
                          <Image source={stImg ? { uri: stImg } : defAvatar} style={s.rekapAvatarImg} resizeMode="cover" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.rekapStudentName} numberOfLines={1}>{sName}</Text>
                          <Text style={s.rekapStudentNis}>{sNis}</Text>
                        </View>
                      </View>
                      <View style={{ width: 64, alignItems: 'flex-start' }}>
                        {cfg ? (
                          <View style={[s.rekapStatusBadge, { backgroundColor: cfg.bg }]}>
                            <Text style={[s.rekapStatusText, { color: cfg.color }]}>{cfg.label}</Text>
                          </View>
                        ) : (
                          <Text style={{ fontSize: 10, color: '#94A3B8' }}>–</Text>
                        )}
                      </View>
                      <TouchableOpacity
                        style={{ width: 50, alignItems: 'center' }}
                        onPress={() => {
                          setUbahStatusSelected(curSt || null);
                          setUbahStatusNote('');
                          setShowUbahStatusSheet(st);
                        }}
                      >
                        <Text style={s.rekapTime}>
                          {recentScans.find((r) => String(r.id) === sId)?.time || '–'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}

                {chipFilteredStudents.length === 0 && (
                  <View style={s.rekapEmptyBox}>
                    <MaterialCommunityIcons name="account-search-outline" size={32} color="#CBD5E1" />
                    <Text style={s.rekapEmptyText}>Tidak ada data.</Text>
                  </View>
                )}
              </View>
            </ScrollView>

            {/* Rekap Bottom Bar */}
            <View style={[s.rekapBottomBar, { bottom: bottomTabBarHeight }]}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setShowUbahStatusSheet(chipFilteredStudents[0] || null)}
                style={s.ubahPresensiBtn}
              >
                <MaterialCommunityIcons name="pencil-outline" size={16} color="#059669" style={{ marginRight: 4 }} />
                <Text style={s.ubahPresensiBtnText}>Ubah Presensi</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => setShowKonfirmasiModal(true)}
                style={s.simpanSelesaiBtn}
              >
                <LinearGradient
                  colors={['#059669', '#10B981']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={s.simpanSelesaiBtnGradient}
                >
                  <MaterialCommunityIcons name="content-save" size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
                  <Text style={s.simpanSelesaiBtnText}>Simpan & Selesai</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ======================================================= */}
        {/* MODE 1: SCAN KAMERA                                      */}
        {/* ======================================================= */}
        {!scanDetailStudent && !showRekapView && activeMode === 'scan' && (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[s.scrollContent, { paddingBottom: bottomTabBarHeight + 40 }]}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={loadingSchedules} onRefresh={fetchSchedules} colors={['#059669']} tintColor="#059669" />}
          >
            {/* KBM Aktif Card */}
            <KBMCard />

            {/* Camera Viewfinder */}
            <View style={s.cameraContainer}>
              {isScanActive ? (
                CameraViewComponent && camPermission?.granted ? (
                  <View style={StyleSheet.absoluteFill}>
                    <CameraViewComponent
                      style={StyleSheet.absoluteFill}
                      enableTorch={isTorchOn}
                      barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'ean13', 'code39'] }}
                      onBarcodeScanned={({ data }: { data: string }) => void handleBarcodeScanned(data)}
                    />
                    {/* Instruction Pill */}
                    <View style={s.camInstructionPill}>
                      <Text style={s.camInstructionText}>
                        Arahkan kamera ke kartu santri hingga QR terlihat jelas
                      </Text>
                    </View>
                    {/* Torch Button */}
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setIsTorchOn((p) => !p)}
                      style={[s.torchBtn, isTorchOn && s.torchBtnActive]}
                    >
                      <MaterialCommunityIcons name={isTorchOn ? 'flash' : 'flash-outline'} size={20} color={isTorchOn ? '#FBBF24' : '#FFFFFF'} />
                    </TouchableOpacity>
                    {/* Gallery Button */}
                    <TouchableOpacity activeOpacity={0.8} style={s.galleryBtn}>
                      <MaterialCommunityIcons name="image-outline" size={20} color="#FFFFFF" />
                    </TouchableOpacity>
                    {/* Corner Guides */}
                    <View style={s.viewfinderBox}>
                      <View style={[s.corner, s.cornerTL]} />
                      <View style={[s.corner, s.cornerTR]} />
                      <View style={[s.corner, s.cornerBL]} />
                      <View style={[s.corner, s.cornerBR]} />
                      <Animated.View
                        style={[
                          s.laserLine,
                          {
                            transform: [{
                              translateY: scanLaserAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 140] }),
                            }],
                          },
                        ]}
                      />
                    </View>
                  </View>
                ) : (
                  <View style={s.camPermissionBox}>
                    <MaterialCommunityIcons name="camera-lock" size={44} color="#059669" />
                    <Text style={s.camPermTitle}>Akses Kamera Diperlukan</Text>
                    <Text style={s.camPermDesc}>Izinkan akses kamera untuk memindai kartu QR santri.</Text>
                    {!camPermission?.granted && (
                      <TouchableOpacity onPress={() => requestCamPermission()} style={s.camPermBtn}>
                        <Text style={s.camPermBtnText}>Izinkan Kamera</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )
              ) : (
                <View style={s.camIdleBox}>
                  <MaterialCommunityIcons name="qrcode-scan" size={60} color="rgba(255,255,255,0.3)" />
                  <Text style={s.camIdleText}>Kamera belum aktif</Text>
                  <Text style={s.camIdleSubtext}>Tekan tombol di bawah untuk mulai scan</Text>
                </View>
              )}
            </View>

            {/* Scan Status Toast */}
            {Boolean(scanMessage) && (
              <View style={[s.scanToast, scanMessage.includes('Gagal') ? s.scanToastError : s.scanToastSuccess]}>
                <MaterialCommunityIcons
                  name={scanMessage.includes('Gagal') ? 'alert-circle' : 'check-circle'}
                  size={16}
                  color={scanMessage.includes('Gagal') ? '#DC2626' : '#059669'}
                />
                <Text style={[s.scanToastText, scanMessage.includes('Gagal') && { color: '#DC2626' }]}>
                  {scanMessage}
                </Text>
              </View>
            )}

            {/* 4 KPI Status Boxes */}
            <View style={s.scan4KpiRow}>
              {[
                { label: 'Hadir', count: statusCounts.p + recentScans.length, color: '#059669', bg: '#ECFDF5', border: '#A7F3D0', icon: 'account-check' },
                { label: 'Izin', count: statusCounts.i, color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', icon: 'file-document-outline' },
                { label: 'Sakit', count: statusCounts.s, color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', icon: 'heart' },
                { label: 'Alpha', count: statusCounts.a, color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', icon: 'close-circle-outline' },
              ].map((k) => (
                <View key={k.label} style={[s.scan4KpiCard, { backgroundColor: k.bg, borderColor: k.border }]}>
                  <Text style={[s.scan4KpiCount, { color: k.color }]}>{k.count}</Text>
                  <Text style={[s.scan4KpiLabel, { color: k.color }]}>{k.label}</Text>
                </View>
              ))}
            </View>

            {/* Santri Terpindai Section */}
            <View style={s.scannedSection}>
              <View style={s.scannedSectionHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MaterialCommunityIcons name="account-multiple-check" size={17} color="#059669" />
                  <Text style={s.scannedSectionTitle}>Santri Terpindai</Text>
                </View>
                <View style={s.scannedCountBadge}>
                  <Text style={s.scannedCountText}>{recentScans.length} Santri</Text>
                </View>
              </View>

              {recentScans.length === 0 ? (
                <View style={s.scannedEmpty}>
                  <MaterialCommunityIcons name="qrcode-scan" size={30} color="#CBD5E1" />
                  <Text style={s.scannedEmptyText}>Belum ada santri yang terpindai.</Text>
                </View>
              ) : (
                recentScans.map((item, idx) => (
                  <View key={`scan-${item.id || idx}`} style={[s.scannedRow, idx < recentScans.length - 1 && s.scannedRowBorder]}>
                    <Text style={s.scannedIdx}>{idx + 1}</Text>
                    <View style={s.scannedAvatarBox}>
                      <Image
                        source={item.avatar ? { uri: item.avatar } : DEFAULT_STUDENT_BOY_AVATAR}
                        style={s.scannedAvatarImg}
                        resizeMode="cover"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.scannedName} numberOfLines={1}>{item.name}</Text>
                      <Text style={s.scannedMeta}>NIS: {item.nis} · {item.className}</Text>
                    </View>
                    <View style={s.scannedRight}>
                      <MaterialCommunityIcons name="check-circle" size={16} color="#059669" />
                      <Text style={s.scannedTime}>{item.time}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* Toggle Scan Button */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                if (!isScanActive && (!camPermission || !camPermission.granted)) {
                  requestCamPermission();
                }
                setIsScanActive((p) => !p);
              }}
              style={[s.scanToggleBtn, isScanActive ? s.scanToggleBtnStop : s.scanToggleBtnStart]}
            >
              <MaterialCommunityIcons
                name={isScanActive ? 'stop-circle-outline' : 'play-circle-outline'}
                size={20}
                color={isScanActive ? '#DC2626' : '#FFFFFF'}
                style={{ marginRight: 6 }}
              />
              <Text style={[s.scanToggleBtnText, isScanActive && { color: '#DC2626' }]}>
                {isScanActive ? 'Hentikan Scan' : 'Mulai Scan'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* ======================================================= */}
        {/* MODE 2: MANUAL KELAS                                     */}
        {/* ======================================================= */}
        {!scanDetailStudent && !showRekapView && !hasNoSchedule && activeMode === 'manual' && (
          <View style={{ flex: 1 }}>
            {/* KBM Card + Date + Search + Chips – Fixed header area */}
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={[s.scrollContent, { paddingBottom: bottomTabBarHeight + 100 }]}
              showsVerticalScrollIndicator={false}
              stickyHeaderIndices={[0]}
            >
              {/* Sticky toolbar block */}
              <View style={s.manualStickyHeader}>
                {isCorrectionMode && (
                  <View style={s.correctionBanner}>
                    <MaterialCommunityIcons name="clipboard-edit-outline" size={20} color="#B45309" />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={s.correctionBannerTitle}>Mode Koreksi Presensi (Human Error)</Text>
                      <Text style={s.correctionBannerSubtitle}>
                        Perubahan status kehadiran santri akan langsung memperbarui data sesi KBM ini di server.
                      </Text>
                    </View>
                  </View>
                )}

                {/* KBM Aktif Card */}
                <KBMCard />

                {/* Search Bar */}
                <View style={s.searchBarWrap}>
                  <MaterialCommunityIcons name="magnify" size={18} color="#94A3B8" />
                  <TextInput
                    style={s.searchInput}
                    placeholder="Cari nama santri/siswa / NIS..."
                    placeholderTextColor="#94A3B8"
                    value={studentSearch}
                    onChangeText={setStudentSearch}
                  />
                  {Boolean(studentSearch) && (
                    <TouchableOpacity onPress={() => setStudentSearch('')}>
                      <MaterialCommunityIcons name="close-circle" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setShowFilterSheet(true)}
                    style={s.filterIconBtn}
                  >
                    <MaterialCommunityIcons name="tune-variant" size={18} color="#475569" />
                  </TouchableOpacity>
                </View>

                {/* Section Header: Title & Dropdown Filter Status */}
                <View style={s.daftarHeaderRow}>
                  <View style={s.daftarHeaderTitleWrap}>
                    <Text style={s.daftarHeaderTitle}>Daftar Santri/Siswa</Text>
                    <View style={s.daftarCountBadge}>
                      <Text style={s.daftarCountBadgeText}>{chipFilteredStudents.length}</Text>
                    </View>
                  </View>

                  {/* Dropdown Button */}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setShowStatusDropdown((p) => !p)}
                    style={[s.statusDropdownTrigger, showStatusDropdown && s.statusDropdownTriggerActive]}
                  >
                    <View style={[s.statusDropdownTriggerIconWrap, { backgroundColor: currentStatusOption.bgColor }]}>
                      <MaterialCommunityIcons
                        name={currentStatusOption.icon as any}
                        size={13}
                        color={currentStatusOption.color}
                      />
                    </View>
                    <Text style={s.statusDropdownTriggerText}>
                      {currentStatusOption.label} ({currentStatusOption.count})
                    </Text>
                    <MaterialCommunityIcons
                      name={showStatusDropdown ? 'chevron-up' : 'chevron-down'}
                      size={15}
                      color="#475569"
                    />
                  </TouchableOpacity>
                </View>

                {/* Quick Action Bar: Checklist Hadir Semua & Reset Status */}
                <View style={s.hubQuickActionsRow}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={handleMarkAllPresent}
                    disabled={students.length === 0}
                    style={s.hubMarkAllBtn}
                  >
                    <MaterialCommunityIcons name="check-all" size={16} color="#FFFFFF" />
                    <Text style={s.hubMarkAllBtnText}>Checklist Hadir Semua ({students.length})</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setStudentStatuses({})}
                    disabled={students.length === 0}
                    style={s.hubResetAttendanceBtn}
                  >
                    <MaterialCommunityIcons name="backup-restore" size={15} color="#64748B" />
                    <Text style={s.hubResetAttendanceBtnText}>Reset</Text>
                  </TouchableOpacity>
                </View>

                {/* Status Dropdown Menu (Inline) */}
                {showStatusDropdown && (
                  <View style={s.statusDropdownMenu}>
                    {statusFilterOptions.map((opt) => {
                      const isSelected = statusFilterChip === opt.key;
                      return (
                        <TouchableOpacity
                          key={opt.key}
                          activeOpacity={0.7}
                          onPress={() => {
                            setStatusFilterChip(opt.key);
                            setShowStatusDropdown(false);
                          }}
                          style={[s.statusDropdownItem, isSelected && s.statusDropdownItemActive]}
                        >
                          <View style={s.statusDropdownItemLeft}>
                            <View style={[s.statusDropdownIconWrap, { backgroundColor: opt.bgColor }]}>
                              <MaterialCommunityIcons name={opt.icon as any} size={15} color={opt.color} />
                            </View>
                            <Text style={[s.statusDropdownItemText, isSelected && s.statusDropdownItemTextActive]}>
                              {opt.label}
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={[s.statusDropdownBadge, isSelected && s.statusDropdownBadgeActive]}>
                              <Text style={[s.statusDropdownBadgeText, isSelected && s.statusDropdownBadgeTextActive]}>
                                {opt.count}
                              </Text>
                            </View>
                            {isSelected ? (
                              <MaterialCommunityIcons name="check" size={17} color="#059669" />
                            ) : (
                              <View style={{ width: 17 }} />
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                    <View style={s.statusDropdownDivider} />
                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={() => {
                        handleMarkAllPresent();
                        setShowStatusDropdown(false);
                      }}
                      style={s.statusDropdownActionBtn}
                    >
                      <MaterialCommunityIcons name="check-all" size={15} color="#059669" />
                      <Text style={s.statusDropdownActionText}>Tandai Semua Hadir</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Student Roster */}
              {loadingStudents ? (
                <View style={s.loadingWrap}>
                  <ActivityIndicator size="small" color="#059669" />
                  <Text style={s.loadingText}>Memuat daftar santri/siswa...</Text>
                </View>
              ) : chipFilteredStudents.length === 0 ? (
                <View style={s.emptyListWrap}>
                  <MaterialCommunityIcons name="account-search-outline" size={36} color="#CBD5E1" />
                  <Text style={s.emptyListText}>Tidak ada santri/siswa yang cocok.</Text>
                </View>
              ) : (
                chipFilteredStudents.map((st, idx) => {
                  const sId = String(st.id || st.student_id);
                  const curStatus = studentStatuses[sId];
                  const sName = st.full_name || st.nama_lengkap || st.name || 'Santri';
                  const sNis = st.nis || '-';
                  const stImg = getProfileImageUrl(st);
                  const defAvatar = isGirlStudent(st) ? DEFAULT_STUDENT_GIRL_AVATAR : DEFAULT_STUDENT_BOY_AVATAR;
                  const perm = pendingPermissions[sId];
                  const isPending = perm && ['submitted', 'waiting_verification'].includes(perm.status);
                  const isApproved = perm && perm.status === 'approved';
                  const isApprovingThis = approvingPermissionId !== null && String(approvingPermissionId) === String(perm?.id);

                  return (
                    <View key={`st-${sId}`} style={s.studentCard}>
                      {/* Top row: Index + Avatar + Name/NIS */}
                      <View style={s.studentCardTop}>
                        <Text style={s.studentIdx}>{idx + 1}</Text>
                        <View style={s.studentAvatarBox}>
                          <Image
                            source={stImg ? { uri: stImg } : defAvatar}
                            style={s.studentAvatarImg}
                            resizeMode="cover"
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.studentName} numberOfLines={1}>{sName}</Text>
                          <Text style={s.studentNis}>NIS: {sNis}</Text>
                        </View>
                        {/* Current status mini badge */}
                        {curStatus && (
                          <View style={[
                            s.currentStatusDot,
                            curStatus === 'present' && { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
                            curStatus === 'permission' && { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
                            curStatus === 'sick' && { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
                            curStatus === 'absent' && { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
                          ]}>
                            <MaterialCommunityIcons
                              name={curStatus === 'present' ? 'check' : curStatus === 'permission' ? 'file-document-outline' : curStatus === 'sick' ? 'heart' : 'close'}
                              size={10}
                              color={curStatus === 'present' ? '#059669' : curStatus === 'permission' ? '#2563EB' : curStatus === 'sick' ? '#D97706' : '#DC2626'}
                            />
                          </View>
                        )}
                      </View>

                      {/* Izin/Perm Banner */}
                      {perm && (isPending || isApproved) && (
                        <View style={[s.permBanner, isPending ? s.permBannerPending : s.permBannerApproved]}>
                          <View style={{ flex: 1 }}>
                            <Text style={s.permBannerLabel}>
                              {isPending ? '⏳ Izin Pending dari Orang Tua' : '✅ Izin Disetujui'}{' · '}{String(perm.type || '').toUpperCase()}
                            </Text>
                            <Text style={s.permBannerRange} numberOfLines={1}>
                              {perm.start_date} s/d {perm.end_date}{perm.reason ? ` · ${perm.reason}` : ''}
                            </Text>
                          </View>
                          {isPending && (
                            <TouchableOpacity
                              activeOpacity={0.75}
                              disabled={isApprovingThis}
                              onPress={() => handleApprovePermission(perm.id, sId, perm.type)}
                              style={s.permApproveBtn}
                            >
                              {isApprovingThis
                                ? <ActivityIndicator size="small" color="#FFFFFF" />
                                : <Text style={s.permApproveBtnText}>Setujui</Text>
                              }
                            </TouchableOpacity>
                          )}
                        </View>
                      )}

                      {/* Student Late Reason Badge if exists */}
                      {curStatus === 'late' && studentNotes[sId] ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFBEB', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginBottom: 6, borderWidth: 1, borderColor: '#FDE68A' }}>
                          <MaterialCommunityIcons name="clock-alert-outline" size={12} color="#D97706" style={{ marginRight: 4 }} />
                          <Text style={{ fontSize: 11, color: '#B45309', fontWeight: '600' }} numberOfLines={1}>
                            Alasan Terlambat: "{studentNotes[sId]}"
                          </Text>
                        </View>
                      ) : null}

                      {/* 5 Quick Status Buttons (Hadir, Terlambat, Izin, Sakit, Alpha) */}
                      <View style={s.toggleRow}>
                        {([
                          { status: 'present' as AttendanceStatus, label: 'Hadir', icon: 'check', activeColor: '#059669', activeStyle: s.toggleHadir },
                          { status: 'late' as AttendanceStatus, label: 'Terlambat', icon: 'clock-alert-outline', activeColor: '#D97706', activeStyle: s.toggleTerlambat },
                          { status: 'permission' as AttendanceStatus, label: 'Izin', icon: 'file-document-outline', activeColor: '#2563EB', activeStyle: s.toggleIzin },
                          { status: 'sick' as AttendanceStatus, label: 'Sakit', icon: 'heart', activeColor: '#7C3AED', activeStyle: s.toggleSakit },
                          { status: 'absent' as AttendanceStatus, label: 'Alpha', icon: 'close', activeColor: '#DC2626', activeStyle: s.toggleAlpha },
                        ] as const).map((btn) => {
                          const isActive = curStatus === btn.status;
                          return (
                            <TouchableOpacity
                              key={btn.status}
                              activeOpacity={0.7}
                              onPress={() => {
                                if (btn.status === 'late') {
                                  setUbahStatusSelected('late');
                                  setUbahStatusNote(studentNotes[sId] || '');
                                  setShowUbahStatusSheet(st);
                                  return;
                                }
                                setStudentStatuses((prev) => ({
                                  ...prev,
                                  [sId]: prev[sId] === btn.status ? (undefined as any) : btn.status,
                                }));
                              }}
                              style={[s.toggleBtn, isActive && btn.activeStyle]}
                            >
                              <MaterialCommunityIcons
                                name={btn.icon as any}
                                size={12}
                                color={isActive ? '#FFFFFF' : btn.activeColor}
                                style={{ marginRight: 2 }}
                              />
                              <Text style={[s.toggleBtnText, isActive && s.toggleBtnTextActive]}>
                                {btn.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>

            {/* Floating Bottom Save Bar */}
            <View style={[s.manualBottomBar, { bottom: bottomTabBarHeight }]}>
              {/* Summary row */}
              <View style={s.manualBottomSummary}>
                <Text style={s.manualBottomSummaryItem}>
                  <Text style={{ color: '#059669' }}>✓ {statusCounts.p} Hadir</Text>
                  {'  '}<Text style={{ color: '#D97706' }}>⏱ {statusCounts.t} Terlambat</Text>
                  {'  '}<Text style={{ color: '#2563EB' }}>ℹ {statusCounts.i} Izin</Text>
                  {'  '}<Text style={{ color: '#7C3AED' }}>❤ {statusCounts.s} Sakit</Text>
                  {'  '}<Text style={{ color: '#DC2626' }}>✕ {statusCounts.a} Alpha</Text>
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => setShowKonfirmasiModal(true)}
                disabled={submittingManual}
                style={s.manualSaveBtn}
              >
                <LinearGradient
                  colors={['#059669', '#10B981']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={s.manualSaveBtnGradient}
                >
                  {submittingManual ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="content-save" size={17} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={s.manualSaveBtnText}>Simpan Presensi KBM ({statusCounts.p + statusCounts.t} Masuk)</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ======================================================= */}
        {/* MODE 3: QR ID GURU                                       */}
        {/* ======================================================= */}
        {!scanDetailStudent && !showRekapView && activeMode === 'qr' && (
          <ScrollView
            contentContainerStyle={[s.scrollContent, { paddingBottom: bottomTabBarHeight + 40 }]}
            showsVerticalScrollIndicator={false}
          >
            <View style={s.qrIdCard}>
              {/* Teacher Info */}
              <View style={s.qrIdTeacherRow}>
                <View style={s.qrIdAvatarWrap}>
                  <Image source={teacherAvatar} style={s.qrIdAvatarImg} resizeMode="cover" />
                  <View style={s.qrIdVerifiedBadge}>
                    <MaterialCommunityIcons name="check-decagram" size={13} color="#FFFFFF" />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.qrIdTeacherName} numberOfLines={2}>{teacherName}</Text>
                  <Text style={s.qrIdTeacherRole}>{teacherRole}</Text>
                  <View style={s.qrIdNipBadge}>
                    <Text style={s.qrIdNipText}>NIP. {teacherNip}</Text>
                  </View>
                </View>
              </View>

              {/* QR Code Box */}
              <View style={s.qrCodeBox}>
                <Image
                  source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(teacherQrData)}` }}
                  style={s.qrCodeImg}
                  resizeMode="contain"
                />
                {/* Islamic Logo Overlay */}
                <View style={s.qrOverlayBadge}>
                  <MaterialCommunityIcons name="star-crescent" size={18} color="#059669" />
                </View>
              </View>

              {/* Instruction */}
              <Text style={s.qrIdInstruction}>
                Tunjukkan QR ini ke petugas untuk presensi kehadiran guru.
              </Text>

              {/* Countdown */}
              <View style={s.countdownRow}>
                <MaterialCommunityIcons name="timer-outline" size={16} color="#64748B" />
                <Text style={s.countdownText}>Berlaku selama </Text>
                <Text style={s.countdownTimer}>{qrCountdownDisplay}</Text>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setQrCountdown(298)}
                  style={s.refreshQrBtn}
                >
                  <MaterialCommunityIcons name="refresh" size={16} color="#059669" />
                </TouchableOpacity>
              </View>

              {/* Download Button */}
              <TouchableOpacity activeOpacity={0.85} style={s.downloadQrBtn}>
                <MaterialCommunityIcons name="download" size={18} color="#059669" style={{ marginRight: 6 }} />
                <Text style={s.downloadQrBtnText}>Unduh QR</Text>
              </TouchableOpacity>

              {/* Switch to Presensi Mandiri Button */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setActiveMode('mandiri')}
                style={s.switchToMandiriBtn}
              >
                <MaterialCommunityIcons name="account-check-outline" size={18} color="#059669" style={{ marginRight: 6 }} />
                <Text style={s.switchToMandiriBtnText}>Buka Presensi Mandiri Pegawai</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </View>

      {/* ======================================================= */}
      {/* DROPDOWN MODAL: PILIH ROMBEL & KELAS                    */}
      {/* ======================================================= */}
      <Modal
        visible={showRombelSheet}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRombelSheet(false)}
        statusBarTranslucent
      >
        <TouchableOpacity
          activeOpacity={1}
          style={s.rombelDropdownBackdrop}
          onPress={() => setShowRombelSheet(false)}
        >
          <View
            style={s.rombelDropdownModalCard}
            onStartShouldSetResponder={() => true}
          >
            {/* Modal Header */}
            <View style={s.rombelDropdownModalHeader}>
              <View style={s.rombelDropdownHeaderLeft}>
                <View style={s.rombelDropdownHeaderIconWrap}>
                  <MaterialCommunityIcons name="google-classroom" size={18} color="#059669" />
                </View>
                <View>
                  <Text style={s.rombelDropdownModalTitle}>Pilih Rombel & Kelas</Text>
                  <Text style={s.rombelDropdownModalSubtitle}>Pilih rombel untuk presensi KBM siswa</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setShowRombelSheet(false)}
                style={s.rombelDropdownCloseBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialCommunityIcons name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Search Input */}
            <View style={s.rombelDropdownSearchWrap}>
              <MaterialCommunityIcons name="magnify" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
              <TextInput
                style={s.rombelDropdownSearchInput}
                placeholder="Cari rombel, nama kelas, atau mapel..."
                placeholderTextColor="#94A3B8"
                value={rombelSearch}
                onChangeText={setRombelSearch}
                autoCorrect={false}
              />
              {Boolean(rombelSearch) && (
                <TouchableOpacity onPress={() => setRombelSearch('')}>
                  <MaterialCommunityIcons name="close-circle" size={16} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            {/* Category / Unit Filter Chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 12 }}
              contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}
            >
              {['Semua', 'Kelas Reguler', 'Jadwal Aktif', 'Wali Kelas'].map((cat) => (
                <TouchableOpacity
                  key={cat}
                  activeOpacity={0.8}
                  style={[s.rombelCategoryChip, cat === 'Semua' && s.rombelCategoryChipActive]}
                >
                  <Text style={[s.rombelCategoryChipText, cat === 'Semua' && s.rombelCategoryChipTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Rombel / Schedule Items List */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: SCREEN_HEIGHT * 0.45 }}
              nestedScrollEnabled
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              {(() => {
                const itemsMap = new Map<string, any>();
                activeSchedules.forEach((sc, idx) => {
                  const key = String(sc.id || `sched-${idx}`);
                  itemsMap.set(key, sc);
                });
                allClasses.forEach((cls) => {
                  const classKey = `class-${cls.id}`;
                  const alreadyExists = Array.from(itemsMap.values()).some(
                    (item) => String(item.kelas_id || item.class_id || item.kelas?.id) === String(cls.id)
                  );
                  if (!alreadyExists) {
                    itemsMap.set(classKey, {
                      id: `virtual-${cls.id}`,
                      is_virtual: true,
                      kelas_id: cls.id,
                      class_id: cls.id,
                      class_name: cls.nama_kelas || cls.name || 'Rombel',
                      kelas: cls,
                      subject: { name: 'Presensi KBM Rombel' },
                    });
                  }
                });
                const combinedList = Array.from(itemsMap.values());
                const filtered = combinedList.filter((sc) => {
                  const nm = (sc.kelas?.nama_kelas || sc.class_name || sc.name || '').toLowerCase();
                  const subj = (sc.subject?.name || sc.nama_mapel || '').toLowerCase();
                  const query = rombelSearch.toLowerCase().trim();
                  return !query || nm.includes(query) || subj.includes(query);
                });

                if (filtered.length === 0) {
                  return (
                    <View style={s.rombelDropdownEmpty}>
                      <MaterialCommunityIcons name="google-classroom" size={32} color="#CBD5E1" />
                      <Text style={s.rombelDropdownEmptyText}>Tidak ada rombel atau kelas yang cocok.</Text>
                    </View>
                  );
                }

                return filtered.map((sc, idx) => {
                  const isSel =
                    selectedSchedule?.id === sc.id ||
                    (sc.kelas_id &&
                      (selectedSchedule?.kelas_id === sc.kelas_id || selectedSchedule?.class_id === sc.kelas_id));
                  const clsName = sc.kelas?.nama_kelas || sc.class_name || `Kelas ${idx + 1}`;
                  const mapelName = sc.subject?.name || 'Presensi KBM';
                  const unitName =
                    resolveUnitName(sc.kelas?.unit_pendidikan) ||
                    resolveUnitName(sc.kelas?.unitPendidikan) ||
                    resolveUnitName(sc.unit) ||
                    (typeof sc.unit_name === 'string' ? sc.unit_name : null) ||
                    teacherUnit;
                  const studentCount = sc.students_count !== undefined ? `${sc.students_count} Siswa` : null;

                  return (
                    <TouchableOpacity
                      key={`rombel-item-${sc.id || idx}`}
                      activeOpacity={0.75}
                      onPress={() => {
                        setSelectedSchedule(sc);
                        setShowRombelSheet(false);
                      }}
                      style={[s.rombelDropdownItem, isSel && s.rombelDropdownItemActive]}
                    >
                      <View style={[s.rombelDropdownItemIcon, isSel && s.rombelDropdownItemIconActive]}>
                        <MaterialCommunityIcons
                          name="google-classroom"
                          size={18}
                          color={isSel ? '#059669' : '#64748B'}
                        />
                      </View>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={[s.rombelDropdownItemTitle, isSel && s.rombelDropdownItemTitleActive]} numberOfLines={1}>
                          {clsName}
                        </Text>
                        <Text style={s.rombelDropdownItemSub} numberOfLines={1}>
                          {mapelName} · {unitName}{studentCount ? ` · ${studentCount}` : ''}
                        </Text>
                      </View>
                      {isSel ? (
                        <View style={s.rombelDropdownCheckBadge}>
                          <MaterialCommunityIcons name="check" size={14} color="#FFFFFF" />
                        </View>
                      ) : (
                        <MaterialCommunityIcons name="chevron-right" size={18} color="#CBD5E1" />
                      )}
                    </TouchableOpacity>
                  );
                });
              })()}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ======================================================= */}
      {/* BOTTOM SHEET: FILTER PRESENSI (Screen 7)                */}
      {/* ======================================================= */}
      {showFilterSheet && (
        <TouchableOpacity activeOpacity={1} style={s.sheetBackdrop} onPress={() => setShowFilterSheet(false)}>
          <TouchableOpacity activeOpacity={1} style={s.bottomSheet} onPress={() => {}}>
            <View style={s.sheetHandle} />
            <View style={s.sheetHeaderRow}>
              <Text style={s.sheetTitle}>Filter Presensi</Text>
              <TouchableOpacity onPress={() => setShowFilterSheet(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>

            {/* Rombel / Kelas Dropdown */}
            <Text style={s.sheetFieldLabel}>Rombel / Kelas</Text>
            <View style={s.sheetDropdown}>
              <Text style={s.sheetDropdownValue}>
                {selectedSchedule?.kelas?.nama_kelas || 'Pilih Kelas...'}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={18} color="#64748B" />
            </View>

            {/* Tanggal */}
            <Text style={s.sheetFieldLabel}>Tanggal</Text>
            <View style={s.sheetDropdown}>
              <MaterialCommunityIcons name="calendar" size={16} color="#059669" />
              <Text style={[s.sheetDropdownValue, { marginLeft: 8 }]}>{dynamicKbmDateText}</Text>
              <MaterialCommunityIcons name="chevron-down" size={18} color="#64748B" />
            </View>

            {/* Status Filter Chips */}
            <Text style={s.sheetFieldLabel}>Status Kehadiran</Text>
            <View style={s.sheetChipsRow}>
              {[
                { key: 'semua', label: 'Semua', color: '#059669' },
                { key: 'hadir', label: 'Hadir', color: '#059669' },
                { key: 'izin', label: 'Izin', color: '#2563EB' },
                { key: 'sakit', label: 'Sakit', color: '#D97706' },
                { key: 'alpha', label: 'Alpha', color: '#DC2626' },
              ].map((chip) => (
                <TouchableOpacity
                  key={chip.key}
                  onPress={() => setStatusFilterChip(chip.key)}
                  style={[s.statusChip, statusFilterChip === chip.key && s.statusChipActive]}
                >
                  <Text style={[s.statusChipText, statusFilterChip === chip.key && s.statusChipTextActive]}>
                    {chip.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Buttons */}
            <View style={s.sheetFilterBtnRow}>
              <TouchableOpacity
                onPress={() => { setStatusFilterChip('semua'); setStudentSearch(''); }}
                style={s.sheetResetBtn}
              >
                <Text style={s.sheetResetBtnText}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.85} onPress={() => setShowFilterSheet(false)} style={s.sheetApplyBtnSm}>
                <LinearGradient colors={['#059669', '#10B981']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.sheetApplyBtnSmGradient}>
                  <Text style={s.sheetApplyBtnText}>Terapkan Filter</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {/* ======================================================= */}
      {/* BOTTOM SHEET: UBAH STATUS KEHADIRAN (Screen 8)          */}
      {/* ======================================================= */}
      {showUbahStatusSheet && (
        <TouchableOpacity activeOpacity={1} style={s.sheetBackdrop} onPress={() => setShowUbahStatusSheet(null)}>
          <TouchableOpacity activeOpacity={1} style={[s.bottomSheet, { paddingBottom: insets.bottom + 24 }]} onPress={() => {}}>
            <View style={s.sheetHandle} />
            <View style={s.sheetHeaderRow}>
              <Text style={s.sheetTitle}>Ubah Status Kehadiran</Text>
              <TouchableOpacity onPress={() => setShowUbahStatusSheet(null)}>
                <MaterialCommunityIcons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>

            {/* Student Header */}
            <View style={s.ubahStudentRow}>
              <View style={s.ubahAvatarBox}>
                <Image
                  source={(() => {
                    const stImg = getProfileImageUrl(showUbahStatusSheet);
                    if (stImg) return { uri: stImg };
                    return isGirlStudent(showUbahStatusSheet)
                      ? DEFAULT_STUDENT_GIRL_AVATAR
                      : DEFAULT_STUDENT_BOY_AVATAR;
                  })()}
                  style={s.ubahAvatarImg}
                  resizeMode="cover"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.ubahStudentName} numberOfLines={1}>
                  {showUbahStatusSheet.full_name || showUbahStatusSheet.nama_lengkap || showUbahStatusSheet.name || 'Santri'}
                </Text>
                <Text style={s.ubahStudentNis}>
                  NIS: {showUbahStatusSheet.nis || '-'}  ·  {selectedSchedule?.kelas?.nama_kelas || ''}
                </Text>
              </View>
            </View>

            {/* 5 Status Cards */}
            <View style={s.ubahStatusGrid}>
              {([
                { status: 'present' as AttendanceStatus, label: 'Hadir', icon: 'check-circle', color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
                { status: 'late' as AttendanceStatus, label: 'Terlambat', icon: 'clock-alert-outline', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
                { status: 'permission' as AttendanceStatus, label: 'Izin', icon: 'file-document-outline', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
                { status: 'sick' as AttendanceStatus, label: 'Sakit', icon: 'heart', color: '#7C3AED', bg: '#FAF5FF', border: '#DDD6FE' },
                { status: 'absent' as AttendanceStatus, label: 'Alpha', icon: 'close-circle-outline', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
              ] as const).map((opt) => {
                const isActive = ubahStatusSelected === opt.status;
                return (
                  <TouchableOpacity
                    key={opt.status}
                    activeOpacity={0.85}
                    onPress={() => setUbahStatusSelected(opt.status)}
                    style={[
                      s.ubahStatusCard,
                      { backgroundColor: isActive ? opt.bg : '#F8FAFC', borderColor: isActive ? opt.border : '#E2E8F0' },
                    ]}
                  >
                    <MaterialCommunityIcons name={opt.icon as any} size={24} color={isActive ? opt.color : '#CBD5E1'} />
                    <Text style={[s.ubahStatusLabel, { color: isActive ? opt.color : '#94A3B8' }]}>{opt.label}</Text>
                    {isActive && <View style={[s.ubahStatusCheck, { backgroundColor: opt.color }]}>
                      <MaterialCommunityIcons name="check" size={10} color="#FFFFFF" />
                    </View>}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Catatan / Alasan Terlambat */}
            <Text style={s.sheetFieldLabel}>
              {ubahStatusSelected === 'late' ? 'Alasan Keterlambatan (Wajib Diisi)' : 'Catatan (Opsional)'}
            </Text>
            <TextInput
              style={[
                s.ubahCatatanInput,
                ubahStatusSelected === 'late' && !ubahStatusNote.trim() && { borderColor: '#F59E0B', borderWidth: 1.5 }
              ]}
              placeholder={ubahStatusSelected === 'late' ? 'Tuliskan alasan keterlambatan santri...' : 'Contoh: izin ada urusan, ada suhu, dll.'}
              placeholderTextColor="#94A3B8"
              value={ubahStatusNote}
              onChangeText={setUbahStatusNote}
              multiline
            />

            {/* Save Button */}
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => {
                if (ubahStatusSelected && showUbahStatusSheet) {
                  // Validasi wajib alasan jika status Terlambat
                  if (ubahStatusSelected === 'late' && (!ubahStatusNote || ubahStatusNote.trim().length < 3)) {
                    setFeedbackModal({
                      visible: true,
                      type: 'warning',
                      title: 'Alasan Terlambat Wajib',
                      message: 'Mohon isi catatan alasan keterlambatan santri (minimal 3 karakter) agar tersinkron ke orang tua.',
                      actionLabel: 'Mengerti',
                      onClose: () => setFeedbackModal(null),
                      onConfirm: () => setFeedbackModal(null),
                    });
                    return;
                  }

                  const sId = String(showUbahStatusSheet.id || showUbahStatusSheet.student_id);
                  const stName = showUbahStatusSheet.full_name || showUbahStatusSheet.nama_lengkap || showUbahStatusSheet.name || 'Santri/Siswa';
                  const statusMap: Record<string, string> = {
                    present: 'Hadir',
                    late: 'Terlambat',
                    permission: 'Izin',
                    sick: 'Sakit',
                    absent: 'Alpha',
                  };
                  setStudentStatuses((prev) => ({ ...prev, [sId]: ubahStatusSelected }));
                  if (ubahStatusNote) setStudentNotes((prev) => ({ ...prev, [sId]: ubahStatusNote }));
                  setShowUbahStatusSheet(null);
                  setFeedbackModal({
                    visible: true,
                    type: 'success',
                    title: 'Status Presensi Diperbarui',
                    message: `Status presensi untuk ${stName} berhasil diubah menjadi ${statusMap[ubahStatusSelected] || ubahStatusSelected}.`,
                    actionLabel: 'Mengerti',
                    onClose: () => setFeedbackModal(null),
                    onConfirm: () => setFeedbackModal(null),
                  });
                } else {
                  setShowUbahStatusSheet(null);
                }
              }}
              style={s.ubahSaveBtn}
            >
              <LinearGradient colors={['#059669', '#10B981']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.ubahSaveBtnGradient}>
                <MaterialCommunityIcons name="content-save" size={17} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={s.ubahSaveBtnText}>Simpan</Text>
              </LinearGradient>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {/* ======================================================= */}
      {/* MODAL: KONFIRMASI SIMPAN PRESENSI KBM (Screen 9)        */}
      {/* ======================================================= */}
      {showKonfirmasiModal && (
        <TouchableOpacity activeOpacity={1} style={s.sheetBackdrop} onPress={() => setShowKonfirmasiModal(false)}>
          <TouchableOpacity activeOpacity={1} style={s.konfirmasiModal} onPress={() => {}}>
            <View style={s.konfirmasiIconWrap}>
              <LinearGradient colors={['#059669', '#10B981']} style={s.konfirmasiIconBg}>
                <MaterialCommunityIcons name="content-save-check" size={30} color="#FFFFFF" />
              </LinearGradient>
            </View>
            <Text style={s.konfirmasiTitle}>Simpan Presensi KBM?</Text>
            <Text style={s.konfirmasiDesc}>
              Pastikan data presensi sudah sesuai.{'\n'}Setelah disimpan, data akan tercatat di sistem.
            </Text>

            {/* Stats */}
            <View style={s.konfirmasiStats}>
              <View style={s.konfirmasiStatRow}>
                <MaterialCommunityIcons name="check-circle" size={14} color="#059669" />
                <Text style={s.konfirmasiStatText}>{statusCounts.p} Hadir ({students.length > 0 ? Math.round((statusCounts.p / students.length) * 100) : 0}%)</Text>
              </View>
              <View style={s.konfirmasiStatRow}>
                <MaterialCommunityIcons name="clock-alert-outline" size={14} color="#D97706" />
                <Text style={s.konfirmasiStatText}>{statusCounts.t} Terlambat ({students.length > 0 ? Math.round((statusCounts.t / students.length) * 100) : 0}%)</Text>
              </View>
              <View style={s.konfirmasiStatRow}>
                <MaterialCommunityIcons name="file-document-outline" size={14} color="#2563EB" />
                <Text style={s.konfirmasiStatText}>{statusCounts.i} Izin ({students.length > 0 ? Math.round((statusCounts.i / students.length) * 100) : 0}%)</Text>
              </View>
              <View style={s.konfirmasiStatRow}>
                <MaterialCommunityIcons name="heart" size={14} color="#7C3AED" />
                <Text style={s.konfirmasiStatText}>{statusCounts.s} Sakit ({students.length > 0 ? Math.round((statusCounts.s / students.length) * 100) : 0}%)</Text>
              </View>
              <View style={s.konfirmasiStatRow}>
                <MaterialCommunityIcons name="close-circle-outline" size={14} color="#DC2626" />
                <Text style={s.konfirmasiStatText}>{statusCounts.a} Alpha ({students.length > 0 ? Math.round((statusCounts.a / students.length) * 100) : 0}%)</Text>
              </View>
            </View>

            {/* Jurnal & Capaian Pembelajaran */}
            <View style={s.konfirmasiJurnalBox}>
              <View style={s.konfirmasiJurnalHeader}>
                <MaterialCommunityIcons name="notebook-outline" size={15} color="#059669" />
                <Text style={s.konfirmasiJurnalTitle}>Jurnal Pembelajaran & Capaian KBM</Text>
              </View>

              <View style={s.konfirmasiJurnalRow}>
                <View style={s.konfirmasiMeetingCol}>
                  <Text style={s.konfirmasiInputLabel}>Pertemuan</Text>
                  <TextInput
                    style={s.konfirmasiInputSmall}
                    value={kbmMeetingNumber}
                    onChangeText={setKbmMeetingNumber}
                    keyboardType="numeric"
                    placeholder="1"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
                <View style={s.konfirmasiTopicCol}>
                  <Text style={s.konfirmasiInputLabel}>Materi / Pokok Bahasan</Text>
                  <TextInput
                    style={s.konfirmasiInputText}
                    value={kbmTopic}
                    onChangeText={setKbmTopic}
                    placeholder="Materi yang diajarkan..."
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>

              <View style={{ marginTop: 8 }}>
                <Text style={s.konfirmasiInputLabel}>Catatan Jurnal KBM / Capaian Siswa (Opsional)</Text>
                <TextInput
                  style={s.konfirmasiTextarea}
                  value={kbmJournalNotes}
                  onChangeText={setKbmJournalNotes}
                  placeholder="Ringkasan KBM, tugas kelas, atau catatan khusus murid..."
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                />
              </View>
            </View>

            {/* Buttons */}
            <View style={s.konfirmasi_btnRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setShowKonfirmasiModal(false)}
                style={s.konfirmasi_batalBtn}
              >
                <Text style={s.konfirmasi_batalBtnText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={async () => {
                  setShowKonfirmasiModal(false);
                  await handleSubmitManual();
                  setShowRekapView(true);
                }}
                style={s.konfirmasi_simpanBtn}
              >
                <LinearGradient colors={['#059669', '#10B981']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.konfirmasi_simpanBtnGradient}>
                  <Text style={s.konfirmasi_simpanBtnText}>Simpan</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {/* ── MODAL FORM PENGAJUAN IZIN / SAKIT / DINAS LUAR (MANDIRI) ── */}
      <Modal
        visible={leaveModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setLeaveModalOpen(false)}
        statusBarTranslucent
      >
        <View style={s.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setLeaveModalOpen(false)} />
          <View style={[s.modalCard, { paddingBottom: bottomInset + 16 }]}>
            <View style={s.modalDragHandle} />
            <View style={s.modalHeaderRow}>
              <Text style={s.modalHeaderTitle}>
                {leaveStatus === 'DINAS_LUAR' ? 'Laporan Dinas Luar' : leaveStatus === 'SAKIT' ? 'Laporan Sakit' : 'Pengajuan Izin Kerja'}
              </Text>
              <TouchableOpacity onPress={() => setLeaveModalOpen(false)} style={s.modalCloseBtn}>
                <MaterialCommunityIcons name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: SCREEN_HEIGHT * 0.65 }}>
              <View style={s.formContainer}>
                {/* Jenis Status Selector */}
                <Text style={s.formFieldLabel}>Status Presensi</Text>
                <View style={s.typeSelectorRow}>
                  {[
                    { key: 'IZIN', label: 'Izin' },
                    { key: 'SAKIT', label: 'Sakit' },
                    { key: 'DINAS_LUAR', label: 'Dinas Luar' },
                  ].map((t) => {
                    const isPicked = leaveStatus === t.key;
                    return (
                      <TouchableOpacity
                        key={t.key}
                        activeOpacity={0.8}
                        onPress={() => setLeaveStatus(t.key as any)}
                        style={[s.typePill, isPicked && s.typePillActive]}
                      >
                        <Text style={[s.typePillText, isPicked && s.typePillTextActive]}>{t.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Tanggal */}
                <Text style={[s.formFieldLabel, { marginTop: 14 }]}>Tanggal Presensi (YYYY-MM-DD)</Text>
                <TextInput
                  value={leaveDate}
                  onChangeText={setLeaveDate}
                  placeholder="YYYY-MM-DD"
                  style={s.formInput}
                />

                {/* Alasan / Catatan */}
                <Text style={[s.formFieldLabel, { marginTop: 12 }]}>
                  {leaveStatus === 'DINAS_LUAR' ? 'Keterangan Tugas / Lokasi Dinas' : 'Alasan / Keterangan'}
                </Text>
                <TextInput
                  value={leaveReason}
                  onChangeText={setLeaveReason}
                  placeholder={
                    leaveStatus === 'DINAS_LUAR'
                      ? 'Contoh: Menghadiri rapat koordinasi kurikulum di Dinas Pendidikan...'
                      : leaveStatus === 'SAKIT'
                        ? 'Contoh: Sakit demam dan anjuran istirahat dokter...'
                        : 'Contoh: Ada urusan keluarga mendesak...'
                  }
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={4}
                  style={[s.formInput, s.formInputArea]}
                />

                <TouchableOpacity
                  activeOpacity={0.88}
                  disabled={submittingLeave}
                  onPress={handleSubmitLeave}
                  style={[s.submitLeaveBtn, submittingLeave && { opacity: 0.6 }]}
                >
                  {submittingLeave ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={s.submitLeaveBtnText}>Kirim Pengajuan</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* FEEDBACK MODAL */}
      {feedbackModal && (
        <AppFeedbackModal
          visible={feedbackModal.visible}
          type={feedbackModal.type}
          title={feedbackModal.title}
          message={feedbackModal.message}
          onConfirm={() => setFeedbackModal(null)}
          onClose={() => setFeedbackModal(null)}
        />
      )}

      {/* GEOLOCATION ATTENDANCE REJECTION MODAL */}
      <AttendanceRejectedModal
        visible={Boolean(rejectionModal?.visible)}
        title={rejectionModal?.title}
        message={rejectionModal?.message}
        details={rejectionModal?.details}
        onClose={() => setRejectionModal(null)}
        onRetry={() => {
          setRejectionModal(null);
          void requestUserLocation(false);
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#065F46',
  },

  // ── HEADER ──
  headerGradient: {
    paddingHorizontal: 16,
    paddingBottom: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenterCol: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    color: '#D1FAE5',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  bellBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#F87171',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },

  // ── SWITCHER ──
  switcherWrap: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 14,
    padding: 3,
    marginBottom: 10,
  },
  switcherTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 11,
    gap: 5,
  },
  switcherTabActive: {
    backgroundColor: '#065F46',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 3,
  },
  switcherTabText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  switcherTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  // ── BODY ──
  body: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
  },
  scrollContent: {
    padding: 14,
  },

  // ── KBM AKTIF CARD ──
  activeScheduleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    marginBottom: 8,
    shadowColor: '#059669',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  activeScheduleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  liveBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    gap: 4,
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  liveBadgeText: {
    color: '#047857',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  activeScheduleTime: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  activeScheduleSubject: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
    letterSpacing: -0.2,
  },
  activeScheduleClassRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 4,
  },
  activeScheduleClassName: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#047857',
    flex: 1,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  locationText: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '700',
  },
  scheduleChip: {
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  scheduleChipActive: {
    backgroundColor: '#059669',
    borderColor: '#047857',
  },
  scheduleChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  scheduleChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // ── KBM CARD DATE ROW ──
  kbmCardDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
  },
  kbmCardDateLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: 6,
  },
  kbmCardDateText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#065F46',
  },

  // ── DATE ROW ──
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  dateRowText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
    flex: 1,
  },
  sesiTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  sesiTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803D',
  },

  // ── SCAN MODE ──
  cameraContainer: {
    height: 310,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#10B981',
    position: 'relative',
  },
  camInstructionPill: {
    position: 'absolute',
    top: 14,
    alignSelf: 'center',
    zIndex: 20,
    backgroundColor: 'rgba(15,23,42,0.78)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    maxWidth: '88%',
  },
  camInstructionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  torchBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 20,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(15,23,42,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  torchBtnActive: {
    backgroundColor: 'rgba(245,158,11,0.4)',
    borderColor: '#FBBF24',
  },
  galleryBtn: {
    position: 'absolute',
    bottom: 14,
    right: 14,
    zIndex: 20,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(15,23,42,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  viewfinderBox: {
    width: 230,
    height: 150,
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -75,
    marginLeft: -115,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.4)',
    overflow: 'hidden',
  },
  corner: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderColor: '#10B981',
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 4 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 4 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 4 },
  laserLine: {
    width: '100%',
    height: 2.5,
    backgroundColor: '#34D399',
    shadowColor: '#34D399',
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },
  camIdleBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  camIdleText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '700',
  },
  camIdleSubtext: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
  },
  camPermissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  camPermTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 10,
  },
  camPermDesc: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 14,
  },
  camPermBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  camPermBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  scanToast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
    marginBottom: 10,
  },
  scanToastSuccess: { backgroundColor: '#DCFCE7' },
  scanToastError: { backgroundColor: '#FEE2E2' },
  scanToastText: { fontSize: 12, fontWeight: '700', color: '#059669', flex: 1 },
  scan4KpiRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  scan4KpiCard: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  scan4KpiCount: {
    fontSize: 22,
    fontWeight: '900',
  },
  scan4KpiLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  scannedSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  scannedSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  scannedSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  scannedCountBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  scannedCountText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  scannedEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  scannedEmptyText: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
  },
  scannedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 8,
  },
  scannedRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  scannedIdx: {
    width: 20,
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textAlign: 'center',
  },
  scannedAvatarBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
  },
  scannedAvatarImg: { width: '100%', height: '100%' },
  scannedName: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  scannedMeta: { fontSize: 10, color: '#64748B', marginTop: 1 },
  scannedRight: { alignItems: 'flex-end', gap: 3 },
  scannedTime: { fontSize: 11, fontWeight: '600', color: '#64748B' },
  scanToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingVertical: 14,
    marginBottom: 4,
    borderWidth: 2,
  },
  scanToggleBtnStart: {
    backgroundColor: '#059669',
    borderColor: '#047857',
  },
  scanToggleBtnStop: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FCA5A5',
  },
  scanToggleBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ── MANUAL MODE ──
  manualStickyHeader: {
    backgroundColor: '#F1F5F9',
    paddingBottom: 4,
  },
  correctionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1.2,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
  },
  correctionBannerTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B45309',
  },
  correctionBannerSubtitle: {
    fontSize: 10.5,
    fontWeight: '500',
    color: '#92400E',
    marginTop: 1,
    lineHeight: 14,
  },
  searchBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
  },
  filterIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statusChipsScroll: {
    marginBottom: 10,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginRight: 7,
  },
  statusChipActive: {
    backgroundColor: '#059669',
    borderColor: '#047857',
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  statusChipTextActive: {
    color: '#FFFFFF',
  },
  daftarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    paddingVertical: 6,
    marginBottom: 4,
  },
  daftarHeaderTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  daftarHeaderTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  daftarCountBadge: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  daftarCountBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
  },
  hubQuickActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    marginTop: 4,
  },
  hubMarkAllBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    borderRadius: 11,
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 2,
  },
  hubMarkAllBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  hubResetAttendanceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
  },
  hubResetAttendanceBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
  },
  statusDropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    paddingHorizontal: 9,
    paddingVertical: 5.5,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  statusDropdownTriggerActive: {
    borderColor: '#059669',
    backgroundColor: '#F0FDF4',
  },
  statusDropdownTriggerIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDropdownTriggerText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  statusDropdownMenu: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    paddingVertical: 4,
    marginBottom: 8,
    shadowColor: '#059669',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  statusDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusDropdownItemActive: {
    backgroundColor: '#F0FDF4',
  },
  statusDropdownItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDropdownIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDropdownItemText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155',
  },
  statusDropdownItemTextActive: {
    fontWeight: '800',
    color: '#059669',
  },
  statusDropdownBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusDropdownBadgeActive: {
    backgroundColor: '#DCFCE7',
  },
  statusDropdownBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  statusDropdownBadgeTextActive: {
    color: '#059669',
    fontWeight: '800',
  },
  statusDropdownDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 4,
  },
  statusDropdownActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    gap: 6,
    backgroundColor: '#ECFDF5',
    marginHorizontal: 8,
    marginBottom: 4,
    borderRadius: 8,
  },
  statusDropdownActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  rekapFilterHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    marginTop: 4,
  },
  daftarHeaderSortPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  daftarHeaderSortText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  loadingText: {
    fontSize: 12,
    color: '#64748B',
  },
  emptyListWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  emptyListText: {
    fontSize: 13,
    color: '#94A3B8',
  },
  studentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: '#E8F5E9',
    shadowColor: '#059669',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  studentCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  studentIdx: {
    width: 20,
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    textAlign: 'center',
  },
  studentAvatarBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
  },
  studentAvatarImg: { width: '100%', height: '100%' },
  studentName: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  studentNis: { fontSize: 10, color: '#64748B', marginTop: 1 },
  currentStatusDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 6,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    gap: 3,
  },
  toggleHadir: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  toggleTerlambat: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  toggleIzin: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  toggleSakit: { backgroundColor: '#FAF5FF', borderColor: '#DDD6FE' },
  toggleAlpha: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  toggleBtnText: { fontSize: 11, fontWeight: '600', color: '#475569' },
  toggleBtnTextActive: { color: '#0F172A', fontWeight: '800' },
  permBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
    borderWidth: 1,
  },
  permBannerPending: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  permBannerApproved: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  permBannerLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0F172A',
  },
  permBannerRange: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  permApproveBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 8,
  },
  permApproveBtnText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  manualBottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    borderTopWidth: 0,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  manualBottomSummary: {
    marginBottom: 8,
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.85)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  manualBottomSummaryItem: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  manualSaveBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  manualSaveBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  manualSaveBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ── QR ID GURU MODE ──
  qrIdCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    marginVertical: 6,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
    alignItems: 'center',
  },
  qrIdTeacherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginBottom: 18,
    gap: 12,
  },
  qrIdAvatarWrap: {
    position: 'relative',
  },
  qrIdAvatarImg: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#E2E8F0',
    borderWidth: 2,
    borderColor: '#A7F3D0',
  },
  qrIdVerifiedBadge: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    backgroundColor: '#10B981',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  qrIdTeacherName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  qrIdTeacherRole: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 2,
  },
  qrIdNipBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  qrIdNipText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#047857',
  },
  qrCodeBox: {
    position: 'relative',
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 14,
  },
  qrCodeImg: {
    width: 220,
    height: 220,
  },
  qrOverlayBadge: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -16,
    marginLeft: -16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  qrIdInstruction: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 14,
    paddingHorizontal: 10,
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 16,
  },
  countdownText: {
    fontSize: 13,
    color: '#64748B',
  },
  countdownTimer: {
    fontSize: 18,
    fontWeight: '800',
    color: '#059669',
  },
  refreshQrBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginLeft: 4,
  },
  downloadQrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    backgroundColor: '#ECFDF5',
    alignSelf: 'stretch',
  },
  downloadQrBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#059669',
  },

  // ── STATE KOSONG ──
  emptyStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    minHeight: 400,
  },
  emptyIllustrationWrap: {
    position: 'relative',
    marginBottom: 20,
  },
  emptyIllustrationOverlay: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyStateDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
  emptyStateBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    backgroundColor: '#ECFDF5',
    width: '100%',
    marginBottom: 10,
  },
  emptyStateBtnOutlineText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#059669',
  },
  emptyStateBtnFill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#059669',
    width: '100%',
  },
  emptyStateBtnFillText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ── DETAIL SETELAH SCAN ──
  scanDetailSuccessCard: {
    backgroundColor: '#ECFDF5',
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
  },
  scanDetailCheckCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#059669',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  scanDetailSuccessTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#065F46',
    marginBottom: 6,
  },
  scanDetailSuccessDesc: {
    fontSize: 13,
    color: '#047857',
    textAlign: 'center',
    lineHeight: 19,
  },
  scanDetailStudentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  scanDetailAvatarWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#A7F3D0',
  },
  scanDetailAvatarImg: { width: '100%', height: '100%' },
  scanDetailStudentName: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  scanDetailStudentNis: { fontSize: 11, color: '#64748B', marginTop: 2 },
  scanDetailStudentClass: { fontSize: 12, color: '#059669', fontWeight: '600', marginTop: 2 },
  scanDetailHadirBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginBottom: 14,
  },
  scanDetailHadirText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
    flex: 1,
  },
  detailNoteBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  detailNoteLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 8,
  },
  detailNoteInput: {
    minHeight: 70,
    fontSize: 13,
    color: '#0F172A',
    textAlignVertical: 'top',
  },
  selesaiBtn: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  selesaiBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  selesaiBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ── REKAP PRESENSI ──
  rekap_dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  rekap_dateText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
    flex: 1,
  },
  rekap_sesiTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  rekap_sesiTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803D',
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  kpiCard: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 2,
  },
  kpiCount: { fontSize: 20, fontWeight: '900' },
  kpiLabel: { fontSize: 10, fontWeight: '700' },
  kpiPct: { fontSize: 9, fontWeight: '600' },
  rekap_searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  rekap_searchInput: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
  },
  rekap_chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginRight: 7,
  },
  rekap_chipActive: {
    backgroundColor: '#059669',
    borderColor: '#047857',
  },
  rekap_chipText: { fontSize: 11, fontWeight: '700', color: '#475569' },
  rekap_chipTextActive: { color: '#FFFFFF' },
  rekapTableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  rekapTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1.5,
    borderBottomColor: '#D1FAE5',
  },
  rekapTHText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
  },
  rekapTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  rekapTableRowAlt: {
    backgroundColor: '#FAFFFE',
  },
  rekapTDText: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  rekapAvatarBox: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  rekapAvatarImg: { width: '100%', height: '100%' },
  rekapStudentName: { fontSize: 12, fontWeight: '700', color: '#0F172A' },
  rekapStudentNis: { fontSize: 9, color: '#94A3B8' },
  rekapStatusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  rekapStatusText: { fontSize: 10, fontWeight: '700' },
  rekapTime: { fontSize: 11, fontWeight: '600', color: '#059669' },
  rekapEmptyBox: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  rekapEmptyText: { fontSize: 12, color: '#94A3B8' },
  rekapBottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 6,
  },
  ubahPresensiBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    backgroundColor: '#ECFDF5',
  },
  ubahPresensiBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#059669',
  },
  simpanSelesaiBtn: {
    flex: 1.4,
    borderRadius: 14,
    overflow: 'hidden',
  },
  simpanSelesaiBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
  },
  simpanSelesaiBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ── BOTTOM SHEETS ──
  sheetBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15,23,42,0.6)',
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  bottomSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 16,
  },
  sheetFieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
    marginTop: 8,
  },
  sheetDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  sheetDropdownValue: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '500',
  },
  sheetChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 8,
  },
  sheetFilterBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  sheetResetBtn: {
    flex: 0.6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  sheetResetBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  sheetApplyBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 12,
  },
  sheetApplyBtnSm: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  sheetApplyBtnGradient: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetApplyBtnSmGradient: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  sheetApplyBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  rombelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  rombelRowActive: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
  },
  rombelName: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  rombelMeta: { fontSize: 12, color: '#64748B', marginTop: 3 },

  // ── UBAH STATUS SHEET ──
  ubahStudentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  ubahAvatarBox: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
  },
  ubahAvatarImg: { width: '100%', height: '100%' },
  ubahStudentName: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  ubahStudentNis: { fontSize: 11, color: '#64748B', marginTop: 2 },
  ubahStatusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  ubahStatusCard: {
    width: '47%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 6,
    position: 'relative',
  },
  ubahStatusLabel: { fontSize: 13, fontWeight: '700' },
  ubahStatusCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ubahCatatanInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0F172A',
    minHeight: 70,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  ubahSaveBtn: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  ubahSaveBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  ubahSaveBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ── KONFIRMASI MODAL ──
  konfirmasiModal: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
  },
  konfirmasiIconWrap: {
    marginBottom: 16,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#059669',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  konfirmasiIconBg: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  konfirmasiTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  konfirmasiDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 18,
  },
  konfirmasiStats: {
    alignSelf: 'stretch',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    gap: 8,
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  konfirmasiStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  konfirmasiStatText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  konfirmasiJurnalBox: {
    alignSelf: 'stretch',
    backgroundColor: '#F0FDF4',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
  },
  konfirmasiJurnalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  konfirmasiJurnalTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#065F46',
  },
  konfirmasiJurnalRow: {
    flexDirection: 'row',
    gap: 8,
  },
  konfirmasiMeetingCol: {
    width: 78,
  },
  konfirmasiTopicCol: {
    flex: 1,
  },
  konfirmasiInputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
  },
  konfirmasiInputSmall: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  konfirmasiInputText: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    color: '#0F172A',
  },
  konfirmasiTextarea: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    color: '#0F172A',
    minHeight: 48,
  },
  konfirmasi_btnRow: {
    flexDirection: 'row',
    gap: 10,
    alignSelf: 'stretch',
  },
  konfirmasi_batalBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  konfirmasi_batalBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  konfirmasi_simpanBtn: {
    flex: 1.5,
    borderRadius: 14,
    overflow: 'hidden',
  },
  konfirmasi_simpanBtnGradient: {
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  konfirmasi_simpanBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ── PRESENSI MANDIRI STYLES (Harmonized with SIMSIT Emerald Design System) ──
  mandiriRoleTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    alignSelf: 'center',
  },
  mandiriPulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34D399',
    marginRight: 5,
  },
  mandiriRoleTagText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.6,
  },
  mandiriLiveCard: {
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#99F6E4',
    marginBottom: 16,
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  mandiriLiveGradient: {
    padding: 16,
  },
  mandiriLiveTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  mandiriUnitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#99F6E4',
    maxWidth: '65%',
  },
  mandiriUnitBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F766E',
    marginLeft: 5,
  },
  mandiriStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  mandiriStatusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  mandiriClockDigits: {
    fontSize: 32,
    fontWeight: '900',
    color: '#047857',
    textAlign: 'center',
    letterSpacing: 1.5,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  mandiriDateSubText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#0D9488',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 16,
  },
  liveMapContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#99F6E4',
    backgroundColor: '#FFFFFF',
    marginBottom: 16,
  },
  mapFrame: {
    width: '100%',
    height: 165,
    position: 'relative',
    backgroundColor: '#CCFBF1',
  },
  mapImage: {
    width: '100%',
    height: '100%',
  },
  mapLoadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0FDFA',
  },
  mapLoadingText: {
    fontSize: 11,
    color: '#0F766E',
    fontWeight: '600',
    marginTop: 6,
  },
  mapTopBadgesRow: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mapUnitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    maxWidth: '65%',
    gap: 4,
  },
  mapUnitBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#064E3B',
  },
  mapRadiusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D9488',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  mapRadiusPillSuccess: {
    backgroundColor: '#059669',
  },
  mapRadiusPillDanger: {
    backgroundColor: '#E11D48',
  },
  mapRadiusPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  mapBottomRow: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mapLegendBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  legendText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  mapNavigateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 3,
    elevation: 1,
  },
  mapNavigateBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0F172A',
  },
  distanceInfoCard: {
    padding: 10,
    backgroundColor: '#FFFFFF',
  },
  distancePrimaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  distanceValueCol: {
    flex: 1.1,
  },
  distanceLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  distanceNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 4,
  },
  distanceNumberText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  distanceStatusCol: {
    flex: 1.3,
    alignItems: 'center',
  },
  distanceStatusTag: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  distanceStatusTagSuccess: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  distanceStatusTagDanger: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
  },
  distanceStatusTagPending: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  distanceStatusTagText: {
    fontSize: 10,
    fontWeight: '800',
  },
  distanceSubHint: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  refreshGpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 10,
    gap: 4,
  },
  refreshGpsBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  coordsStripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 6,
  },
  coordsStripText: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '600',
  },
  coordsStripDivider: {
    fontSize: 10,
    color: '#CBD5E1',
  },
  mandiriStatusPillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  mandiriPillBox: {
    flex: 1,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 82,
  },
  mandiriPillNeutral: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  mandiriPillActiveIn: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  mandiriPillActiveOut: {
    backgroundColor: '#F0FDFA',
    borderColor: '#99F6E4',
  },
  mandiriPillSuccess: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  mandiriPillHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 3,
  },
  mandiriPillLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  mandiriPillValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    marginVertical: 1,
    textAlign: 'center',
  },
  mandiriPillSub: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#94A3B8',
    textAlign: 'center',
  },
  mandiriActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  mandiriActionBtnGreen: {
    backgroundColor: '#059669',
  },
  mandiriActionBtnOrange: {
    backgroundColor: '#EA580C',
  },
  mandiriActionBtnText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  mandiriQuickBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  mandiriQuickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 5,
  },
  mandiriQuickBtnText: {
    fontSize: 11,
    fontWeight: '800',
  },
  mandiriKpiSection: {
    marginBottom: 16,
  },
  mandiriSectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mandiriSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  mandiriKpiGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  mandiriKpiCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 11,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  mandiriKpiVal: {
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 2,
  },
  mandiriKpiLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#475569',
    textAlign: 'center',
  },
  mandiriQrBox: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1.5,
    borderColor: '#99F6E4',
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  mandiriQrBoxTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0D9488',
  },
  mandiriQrBoxSub: {
    fontSize: 11,
    color: '#475569',
    marginTop: 1,
  },
  mandiriQrBoxBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#99F6E4',
  },
  mandiriQrBoxBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0D9488',
  },
  mandiriHistorySection: {
    marginBottom: 24,
  },
  mandiriEmptyBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  mandiriEmptyText: {
    fontSize: 12.5,
    color: '#94A3B8',
    marginTop: 8,
    fontWeight: '600',
  },
  mandiriHistoryItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  mandiriHistoryDate: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  mandiriHistoryTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  mandiriHistoryTimePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  mandiriHistoryTimeVal: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
  },
  mandiriHistoryTimeDot: {
    fontSize: 10,
    color: '#CBD5E1',
  },
  mandiriHistoryLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 5,
  },
  mandiriHistoryKet: {
    fontSize: 11,
    color: '#64748B',
    flex: 1,
  },
  mandiriHistoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  mandiriHistoryBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  switchToMandiriBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    paddingVertical: 12,
    marginTop: 10,
  },
  switchToMandiriBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#059669',
  },
  submitLeaveBtn: {
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  submitLeaveBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
  },
  modalDragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formContainer: {
    paddingTop: 14,
    paddingBottom: 20,
  },
  formFieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  typeSelectorRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typePill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  typePillActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  typePillText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
  },
  typePillTextActive: {
    fontWeight: '800',
    color: '#059669',
  },
  formInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 13,
    color: '#0F172A',
  },
  formInputArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },

  // ── KBM DROPDOWN TRIGGER & MODAL STYLES ──
  kbmDropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
    marginBottom: 6,
  },
  kbmDropdownTriggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  kbmDropdownIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  kbmDropdownLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  kbmDropdownValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 1,
  },
  kbmDropdownChevronBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },

  rombelDropdownBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  rombelDropdownModalCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  rombelDropdownModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  rombelDropdownHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rombelDropdownHeaderIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  rombelDropdownModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  rombelDropdownModalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  rombelDropdownCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rombelDropdownSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 12,
  },
  rombelDropdownSearchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 0,
  },
  rombelCategoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  rombelCategoryChipActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  rombelCategoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  rombelCategoryChipTextActive: {
    color: '#059669',
    fontWeight: '800',
  },
  rombelDropdownEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  rombelDropdownEmptyText: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 8,
    textAlign: 'center',
  },
  rombelDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginBottom: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  rombelDropdownItemActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  rombelDropdownItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rombelDropdownItemIconActive: {
    backgroundColor: '#DCFCE7',
  },
  rombelDropdownItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  rombelDropdownItemTitleActive: {
    color: '#059669',
    fontWeight: '800',
  },
  rombelDropdownItemSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  rombelDropdownCheckBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

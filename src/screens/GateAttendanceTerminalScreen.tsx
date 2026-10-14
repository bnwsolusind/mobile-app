import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  Platform,
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
import { api } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { AppFeedbackModal, FeedbackType } from '../components/AppFeedbackModal';
import { getProfileImageUrl, DEFAULT_STUDENT_BOY_AVATAR } from '../utils/profile';

let CameraViewComponent: any = null;
let useCameraPermissionsHook: any = null;
try {
  const cam = require('expo-camera');
  CameraViewComponent = cam.CameraView || null;
  useCameraPermissionsHook = cam.useCameraPermissions || null;
} catch {
  CameraViewComponent = null;
  useCameraPermissionsHook = null;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type GateMode = 'in' | 'out';

export default function GateAttendanceTerminalScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 12);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 14);

  const user = useAuthStore((state) => state.user);

  // Camera permissions hook & auto-request
  const [camPermission, requestCamPermission] = useCameraPermissionsHook
    ? useCameraPermissionsHook()
    : [null, async () => ({ granted: true })];

  useEffect(() => {
    if (useCameraPermissionsHook && (!camPermission || !camPermission.granted)) {
      requestCamPermission();
    }
  }, [camPermission, requestCamPermission]);

  // Gate Mode: 'in' (Masuk) or 'out' (Pulang)
  const [gateMode, setGateMode] = useState<GateMode>('in');
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [isFacingBack, setIsFacingBack] = useState<boolean>(true);
  const [isScanningLocked, setIsScanningLocked] = useState<boolean>(false);

  // Manual Attendance Intake States
  const [manualSearchQuery, setManualSearchQuery] = useState<string>('');
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all');
  const [classesList, setClassesList] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(false);
  const [showClassDropdown, setShowClassDropdown] = useState<boolean>(false);

  // Schedule Info (Jam Masuk & Jam Pulang Sekolah dari Konfigurasi Operasional)
  const [scheduleConfig, setScheduleConfig] = useState<{
    jam_masuk: string;
    jam_pulang: string;
    toleransi_menit: number;
  }>({
    jam_masuk: '',
    jam_pulang: '',
    toleransi_menit: 0,
  });

  // Recent Scans Log
  const [recentScans, setRecentScans] = useState<any[]>([]);
  const [allStudents, setAllStudents] = useState<any[]>([]);

  // Early Departure Modal State (Pulang di Tengah Jam Pelajaran)
  const [earlyDepartureModalOpen, setEarlyDepartureModalOpen] = useState<boolean>(false);
  const [pendingStudent, setPendingStudent] = useState<any | null>(null);
  const [earlyReason, setEarlyReason] = useState<string>('');
  const [pickupPerson, setPickupPerson] = useState<string>('');
  const [pickupRelation, setPickupRelation] = useState<string>('Orang Tua');
  const [departureNotes, setDepartureNotes] = useState<string>('');
  const [submittingEarlyDeparture, setSubmittingEarlyDeparture] = useState<boolean>(false);

  // Feedback Modal
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
  } | null>(null);

  // 1. Fetch Students Roster, Classes, and Logs
  useEffect(() => {
    let isMounted = true;
    void (async () => {
      setLoadingData(true);
      try {
        const [studentRes, logRes, classRes, configRes] = await Promise.allSettled([
          mobileApiService.getStudents?.({ per_page: 300 })
            .catch(() => mobileApiService.getTeacherStudents?.({ per_page: 300 })) ?? Promise.resolve([]),
          mobileApiService.getGateLogs?.({ per_page: 30 }) ?? Promise.resolve([]),
          mobileApiService.getTeacherClasses?.() ?? Promise.resolve([]),
          api.get('/gate-attendance/schedule-config').catch(() => null),
        ]);

        if (!isMounted) return;

        if (configRes.status === 'fulfilled' && configRes.value) {
          const cfg = (configRes.value as any)?.data?.data || (configRes.value as any)?.data;
          if (cfg && (cfg.jam_masuk || cfg.jam_pulang)) {
            setScheduleConfig({
              jam_masuk: String(cfg.jam_masuk || ''),
              jam_pulang: String(cfg.jam_pulang || ''),
              toleransi_menit: Number(cfg.toleransi_menit ?? 0),
            });
          }
        }

        if (studentRes.status === 'fulfilled') {
          const raw = unwrapApiData<any[]>(studentRes.value) || [];
          const list = Array.isArray(raw) ? raw : ((raw as any)?.data ?? []);
          setAllStudents(Array.isArray(list) ? list : []);
        }

        if (classRes.status === 'fulfilled') {
          const raw = unwrapApiData<any[]>(classRes.value) || [];
          const list = Array.isArray(raw) ? raw : ((raw as any)?.data ?? []);
          setClassesList(Array.isArray(list) ? list : []);
        }

        if (logRes.status === 'fulfilled') {
          const raw = logRes.value;
          const list = Array.isArray(raw)
            ? raw
            : Array.isArray((raw as any)?.records)
              ? (raw as any).records
              : Array.isArray((raw as any)?.data)
                ? (raw as any).data
                : [];
          setRecentScans(list);
        }
      } catch (err) {
        console.warn('[GateAttendanceTerminal] fetch data error:', err);
      } finally {
        if (isMounted) setLoadingData(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  // Student Info Helpers
  const getStudentName = (st: any) => st?.nama_lengkap || st?.full_name || st?.name || 'Santri';
  const getStudentNis = (st: any) => st?.nis || st?.nisn || '-';
  const getStudentClassName = (st: any) => st?.kelas?.nama_kelas || st?.kelas_name || st?.school_class?.name || 'Rombel';
  const getStudentClassId = (st: any) => String(st?.kelas_id || st?.class_id || st?.kelas?.id || getStudentClassName(st));

  // Derive unique classes sorted
  const availableClasses = useMemo(() => {
    const classMap = new Map<string, string>();

    // From classesList
    classesList.forEach((c) => {
      const id = String(c.id);
      const name = c.nama_kelas || c.name || `Kelas ${id}`;
      classMap.set(id, name);
    });

    // From allStudents
    allStudents.forEach((st) => {
      const id = getStudentClassId(st);
      const name = getStudentClassName(st);
      if (id && name && name !== 'Rombel' && !classMap.has(id)) {
        classMap.set(id, name);
      }
    });

    return Array.from(classMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'id', { numeric: true }));
  }, [classesList, allStudents]);

  // Filter students based on Class and Name / NIS
  const filteredStudents = useMemo(() => {
    let list = allStudents;

    // Filter by Class
    if (selectedClassFilter !== 'all') {
      list = list.filter((st) => {
        const clsId = getStudentClassId(st);
        const clsName = getStudentClassName(st).toLowerCase();
        const target = selectedClassFilter.toLowerCase();
        return clsId === selectedClassFilter || clsName === target;
      });
    }

    // Filter by Search Query (Nama atau NIS)
    const q = manualSearchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((st) => {
        const name = getStudentName(st).toLowerCase();
        const nis = String(st.nis || '').toLowerCase();
        const nisn = String(st.nisn || '').toLowerCase();
        return name.includes(q) || nis.includes(q) || nisn.includes(q);
      });
    }

    return list;
  }, [allStudents, selectedClassFilter, manualSearchQuery]);

  // Check if student was recorded today
  const getStudentTodayStatus = useCallback((student: any) => {
    const stId = String(student.id || '');
    const stNis = String(student.nis || '');
    const stName = getStudentName(student).toLowerCase();

    return recentScans.find((sc) => {
      const scanId = String(sc.student_id || sc.id || '');
      const scanNis = String(sc.nis || '');
      const scanName = String(sc.student_name || sc.name || '').toLowerCase();
      return (
        (stId && scanId === stId) ||
        (stNis && scanNis === stNis) ||
        (stName && scanName === stName)
      );
    });
  }, [recentScans]);

  // Manual Attendance Intake Handler
  const handleManualAttendance = (student: any) => {
    if (isScanningLocked) return;

    if (gateMode === 'in') {
      void processCheckIn(student);
    } else {
      // Gate Mode 'out' (Pulang)
      if (isEarlyDepartureTime()) {
        // Pulang lebih awal di tengah jam pelajaran -> Buka Form Alasan Kepulangan
        setPendingStudent(student);
        setEarlyReason('');
        setPickupPerson('');
        setPickupRelation('Orang Tua');
        setDepartureNotes('');
        setEarlyDepartureModalOpen(true);
      } else {
        // Pulang normal sesuai jam kepulangan
        void processCheckOutNormal(student);
      }
    }
  };

  // Check if current time is before school dismissal (Early Departure)
  const isEarlyDepartureTime = useCallback(() => {
    if (!scheduleConfig.jam_pulang) {
      return false;
    }
    const now = new Date();
    const currentH = now.getHours();
    const currentM = now.getMinutes();
    const currentMinutes = currentH * 60 + currentM;

    const [dismissalH, dismissalM] = scheduleConfig.jam_pulang.split(':').map(Number);
    if (isNaN(dismissalH)) return false;
    const dismissalMinutes = dismissalH * 60 + (dismissalM || 0);

    // If current time is earlier than official dismissal time
    return currentMinutes < dismissalMinutes;
  }, [scheduleConfig.jam_pulang]);

  // Execute Check-In Scan
  const processCheckIn = async (student: any, qrToken?: string) => {
    setIsScanningLocked(true);
    try {
      const payload: any = {
        qr_token: qrToken || (student?.id && !String(student.id).startsWith('scan-') ? `STUDENT_CARD:${student.nis || student.id}:${student.nama_lengkap || student.name}` : undefined),
        attendance_method: 'QRCODE',
      };
      if (student?.id && !String(student.id).startsWith('scan-')) {
        payload.student_id = student.id;
      }
      if (student?.nis && !String(student.nis).startsWith('scan-') && !String(student.nis).startsWith('stuqr:') && !String(student.nis).startsWith('STUDENT_CARD:')) {
        payload.nis = student.nis;
      }

      const res = await mobileApiService.scanGateIn(payload);

      const returnedStudent = res?.data?.student || res?.data?.data?.student || (res as any)?.student;
      const finalStudent = returnedStudent || student;
      const studentName = finalStudent.nama_lengkap || finalStudent.full_name || finalStudent.name || 'Santri';
      const studentNis = finalStudent.nis || '-';
      const className = finalStudent.kelas?.nama_kelas || finalStudent.kelas_name || finalStudent.school_class?.name || 'Rombel';

      const nowTime = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
      const scanItem = {
        id: Date.now(),
        student_id: finalStudent.id,
        student_name: studentName,
        nis: studentNis,
        className,
        avatar: getProfileImageUrl(finalStudent),
        mode: 'in',
        time: nowTime,
        status: res?.data?.status || 'Hadir',
      };

      setRecentScans((prev) => [scanItem, ...prev.slice(0, 25)]);

      setFeedbackModal({
        visible: true,
        type: 'success',
        title: 'Presensi Masuk Berhasil',
        message: `${studentName} (NIS: ${studentNis}) berhasil check-in gerbang sekolah pada ${nowTime}.`,
      });
    } catch (err: any) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Presensi Gagal',
        message: err?.response?.data?.message || 'Gagal menyimpan presensi masuk gerbang.',
      });
    } finally {
      setTimeout(() => {
        setIsScanningLocked(false);
      }, 2500);
    }
  };

  // Execute Standard Check-Out Scan (On-time)
  const processCheckOutNormal = async (student: any, qrToken?: string) => {
    setIsScanningLocked(true);
    try {
      const payload: any = {
        qr_token: qrToken || (student?.id && !String(student.id).startsWith('scan-') ? `STUDENT_CARD:${student.nis || student.id}:${student.nama_lengkap || student.name}` : undefined),
        attendance_method: 'QRCODE',
        is_early: false,
      };
      if (student?.id && !String(student.id).startsWith('scan-')) {
        payload.student_id = student.id;
      }
      if (student?.nis && !String(student.nis).startsWith('scan-') && !String(student.nis).startsWith('stuqr:') && !String(student.nis).startsWith('STUDENT_CARD:')) {
        payload.nis = student.nis;
      }

      const res = await mobileApiService.scanGateOut(payload);

      const returnedStudent = res?.data?.student || res?.data?.data?.student || (res as any)?.student;
      const finalStudent = returnedStudent || student;
      const studentName = finalStudent.nama_lengkap || finalStudent.full_name || finalStudent.name || 'Santri';
      const studentNis = finalStudent.nis || '-';
      const className = finalStudent.kelas?.nama_kelas || finalStudent.kelas_name || finalStudent.school_class?.name || 'Rombel';

      const nowTime = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
      const scanItem = {
        id: Date.now(),
        student_id: finalStudent.id,
        student_name: studentName,
        nis: studentNis,
        className,
        avatar: getProfileImageUrl(finalStudent),
        mode: 'out',
        time: nowTime,
        status: 'Pulang Normal',
      };

      setRecentScans((prev) => [scanItem, ...prev.slice(0, 25)]);

      setFeedbackModal({
        visible: true,
        type: 'success',
        title: 'Presensi Pulang Berhasil',
        message: `${studentName} berhasil melakukan absensi pulang sekolah (${nowTime}). Notifikasi telah diteruskan ke orang tua.`,
      });
    } catch (err: any) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Absensi Pulang',
        message: err?.response?.data?.message || 'Gagal mencatat kepulangan siswa di gerbang.',
      });
    } finally {
      setTimeout(() => {
        setIsScanningLocked(false);
      }, 2500);
    }
  };

  // Triggered when a QR code or Barcode is detected
  const handleBarcodeScanned = (scannedData: string) => {
    if (isScanningLocked) return;

    // Resolve student from raw scanned barcode/QR
    const cleanData = scannedData.trim();
    let matchedStudent: any = null;

    // Pattern 1: STUDENT_CARD:{NIS_or_ID}:{NAME}
    if (cleanData.startsWith('STUDENT_CARD:')) {
      const parts = cleanData.split(':');
      const nisOrId = parts[1];
      matchedStudent = allStudents.find(
        (s) => String(s.nis) === String(nisOrId) || String(s.id) === String(nisOrId) || String(s.nisn) === String(nisOrId)
      );
    }

    // Pattern 2: JSON encoded QR: {"student_id": "...", "nis": "..."}
    if (!matchedStudent && cleanData.startsWith('{') && cleanData.endsWith('}')) {
      try {
        const json = JSON.parse(cleanData);
        const searchVal = json.student_id || json.id || json.nis || json.nisn;
        if (searchVal) {
          matchedStudent = allStudents.find(
            (s) => String(s.id) === String(searchVal) || String(s.nis) === String(searchVal) || String(s.nisn) === String(searchVal)
          );
        }
      } catch {}
    }

    // Pattern 3: direct NIS or ID matching
    if (!matchedStudent) {
      matchedStudent = allStudents.find(
        (s) => String(s.nis) === cleanData || String(s.id) === cleanData || String(s.nisn) === cleanData
      );
    }

    // Fallback if student is not yet cached in client local state (backend resolves it securely)
    if (!matchedStudent) {
      matchedStudent = {
        is_unresolved: true,
        raw_token: cleanData,
        nama_lengkap: cleanData.startsWith('stuqr:') ? 'Santri (Kartu Digital)' : `Santri (${cleanData.slice(0, 15)})`,
        nis: cleanData.startsWith('stuqr:') ? '-' : cleanData,
        kelas_name: 'Santri Terdaftar',
      };
    }

    if (gateMode === 'in') {
      void processCheckIn(matchedStudent, cleanData);
    } else {
      // Gate Mode is 'out' (Pulang)
      if (isEarlyDepartureTime()) {
        // Pulang lebih awal / di tengah jam pelajaran -> Buka Form Alasan Kepulangan
        setPendingStudent(matchedStudent);
        setEarlyReason('');
        setPickupPerson('');
        setPickupRelation('Orang Tua');
        setDepartureNotes('');
        setEarlyDepartureModalOpen(true);
      } else {
        // Pulang normal sesuai jam kepulangan
        void processCheckOutNormal(matchedStudent, cleanData);
      }
    }
  };

  // Submit Early Departure with Reason & Parent Notification
  const submitEarlyDeparture = async () => {
    if (!pendingStudent) return;
    if (!earlyReason) {
      Alert.alert('Perhatian', 'Harap pilih alasan kepulangan awal santri.');
      return;
    }
    if (!pickupPerson.trim()) {
      Alert.alert('Perhatian', 'Harap isi nama penjemput santri (ayah, ibu, supir, atau kerabat).');
      return;
    }

    setSubmittingEarlyDeparture(true);
    try {
      const nowTime = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
      const payload: any = {
        qr_token: pendingStudent.raw_token || pendingStudent.qr_token || (pendingStudent?.id && !String(pendingStudent.id).startsWith('scan-') ? `STUDENT_CARD:${pendingStudent.nis || pendingStudent.id}:${pendingStudent.nama_lengkap || pendingStudent.name}` : undefined),
        is_early: true,
        pickup_person: pickupPerson.trim(),
        pickup_relation: pickupRelation,
        notes: `[Pulang Awal] Alasan: ${earlyReason}. Penjemput: ${pickupPerson.trim()} (${pickupRelation}). Catatan: ${departureNotes || '-'}`,
      };
      if (pendingStudent?.id && !String(pendingStudent.id).startsWith('scan-')) {
        payload.student_id = pendingStudent.id;
      }
      if (pendingStudent?.nis && !String(pendingStudent.nis).startsWith('scan-') && !String(pendingStudent.nis).startsWith('stuqr:') && !String(pendingStudent.nis).startsWith('STUDENT_CARD:')) {
        payload.nis = pendingStudent.nis;
      }

      const res = await mobileApiService.scanGateOut(payload);

      const returnedStudent = res?.data?.student || res?.data?.data?.student || (res as any)?.student;
      const finalStudent = returnedStudent || pendingStudent;
      const studentName = finalStudent.nama_lengkap || finalStudent.full_name || finalStudent.name || 'Santri';
      const studentNis = finalStudent.nis || '-';
      const className = finalStudent.kelas?.nama_kelas || finalStudent.kelas_name || finalStudent.school_class?.name || 'Rombel';

      const scanItem = {
        id: Date.now(),
        student_id: finalStudent.id,
        student_name: studentName,
        nis: studentNis,
        className,
        avatar: getProfileImageUrl(finalStudent),
        mode: 'out',
        time: nowTime,
        status: `Pulang Awal (${earlyReason})`,
        pickup: `${pickupPerson} (${pickupRelation})`,
      };

      setRecentScans((prev) => [scanItem, ...prev.slice(0, 25)]);
      setEarlyDepartureModalOpen(false);
      setPendingStudent(null);

      setFeedbackModal({
        visible: true,
        type: 'success',
        title: 'Laporan Kepulangan Terkirim!',
        message: `Kepulangan santri ${studentName} di tengah jam pelajaran telah dicatat. Laporan & notifikasi resmi telah otomatis terkirim ke akses orang tua.`,
      });
    } catch (err: any) {
      Alert.alert('Gagal', err?.response?.data?.message || 'Gagal menyimpan laporan kepulangan santri.');
    } finally {
      setSubmittingEarlyDeparture(false);
    }
  };



  const currentHour = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';

  return (
    <View style={s.container}>
      {/* ── TOP HERO HEADER ── */}
      <View style={[s.topHeader, { paddingTop: topInset + 6 }]}>
        <LinearGradient
          colors={['#047857', '#059669', '#10B981']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={s.topHeaderRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => navigation?.goBack?.() || navigation?.navigate('Beranda')}
            style={s.headerSquircleBtn}
          >
            <MaterialCommunityIcons name="arrow-left" size={20} color="#059669" />
          </TouchableOpacity>
          <View style={s.headerTitleCol}>
            <View style={s.roleTag}>
              <View style={s.pulseDot} />
              <Text style={s.roleTagText}>TERMINAL GERBANG SEKOLAH</Text>
            </View>
            <Text style={s.headerTitle} numberOfLines={1}>Absensi Gerbang</Text>
            <Text style={s.headerSubtitle} numberOfLines={1}>
              Fungsi Opsional TU • Jam Sekarang {currentHour}
            </Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setIsTorchOn(!isTorchOn)}
            style={[s.headerSquircleBtn, isTorchOn && { backgroundColor: '#FDE68A' }]}
          >
            <MaterialCommunityIcons
              name={isTorchOn ? 'flashlight' : 'flashlight-off'}
              size={20}
              color={isTorchOn ? '#B45309' : '#059669'}
            />
          </TouchableOpacity>
        </View>

        {/* ── Mode Switch: Masuk (Check-In) vs Pulang (Check-Out) ── */}
        <View style={s.modeToggleBox}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setGateMode('in')}
            style={[s.modeToggleBtn, gateMode === 'in' && s.modeToggleBtnActiveIn]}
          >
            <MaterialCommunityIcons
              name="door-open"
              size={17}
              color={gateMode === 'in' ? '#047857' : '#FFFFFF'}
              style={{ marginRight: 6 }}
            />
            <Text style={[s.modeToggleText, gateMode === 'in' && s.modeToggleTextActiveIn]}>
              Gerbang Masuk (Pagi)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setGateMode('out')}
            style={[s.modeToggleBtn, gateMode === 'out' && s.modeToggleBtnActiveOut]}
          >
            <MaterialCommunityIcons
              name="door-closed"
              size={17}
              color={gateMode === 'out' ? '#B45309' : '#FFFFFF'}
              style={{ marginRight: 6 }}
            />
            <Text style={[s.modeToggleText, gateMode === 'out' && s.modeToggleTextActiveOut]}>
              Gerbang Pulang (Sore)
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scrollContent, { paddingBottom: bottomInset + 24 }]}
      >
        {/* ── NOTICE BOX: EARLY DEPARTURE WARNING (Jika Mode Pulang & Sebelum Jam Pulang) ── */}
        {gateMode === 'out' && isEarlyDepartureTime() && (
          <View style={s.earlyNoticeBanner}>
            <MaterialCommunityIcons name="alert-circle-outline" size={20} color="#D97706" style={{ marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={s.earlyNoticeTitle}>Deteksi Jam Belajar Aktif (Sebelum {scheduleConfig.jam_pulang})</Text>
              <Text style={s.earlyNoticeSub}>
                Santri yang discan pulang saat ini akan diverifikasi alasan kepulangan awal & otomatis dilaporkan ke orang tua.
              </Text>
            </View>
          </View>
        )}

        {/* ── SCANNER VIEWFINDER / CAMERA CONTAINER ── */}
        <View style={s.scannerCard}>
          <View style={s.scannerHeaderRow}>
            <View style={s.scannerTitleRow}>
              <MaterialCommunityIcons
                name="barcode-scan"
                size={18}
                color={gateMode === 'in' ? '#059669' : '#D97706'}
                style={{ marginRight: 6 }}
              />
              <Text style={s.scannerTitle}>
                {gateMode === 'in' ? 'Pemindai Kedatangan Santri' : 'Pemindai Kepulangan Santri'}
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setIsFacingBack(!isFacingBack)}
              style={s.switchCamBtn}
            >
              <MaterialCommunityIcons name="camera-flip-outline" size={17} color="#475569" />
              <Text style={s.switchCamText}>Kamera</Text>
            </TouchableOpacity>
          </View>

          {/* Camera Viewfinder */}
          <View style={s.viewfinderBox}>
            {CameraViewComponent && camPermission?.granted ? (
              <CameraViewComponent
                style={StyleSheet.absoluteFill}
                facing={isFacingBack ? 'back' : 'front'}
                enableTorch={isTorchOn}
                barcodeScannerSettings={{
                  barcodeTypes: ['qr', 'code128', 'ean13', 'code39'],
                }}
                onBarcodeScanned={
                  isScanningLocked
                    ? undefined
                    : (scanningResult: any) => {
                        const data = scanningResult?.data || scanningResult?.raw;
                        if (data) handleBarcodeScanned(String(data));
                      }
                }
              />
            ) : CameraViewComponent && !camPermission?.granted ? (
              <View style={s.camPermissionBox}>
                <View style={s.camPermIconWrap}>
                  <MaterialCommunityIcons name="camera-lock-outline" size={38} color="#10B981" />
                </View>
                <Text style={s.camPermTitle}>Akses Kamera Diperlukan</Text>
                <Text style={s.camPermDesc}>
                  Izinkan akses kamera di perangkat Anda untuk memindai QR Code kartu santri secara otomatis.
                </Text>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => requestCamPermission()}
                  style={s.camPermBtn}
                >
                  <MaterialCommunityIcons name="camera" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={s.camPermBtnText}>Aktifkan Kamera</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={s.simulatedCamBox}>
                <MaterialCommunityIcons name="camera-off-outline" size={48} color="#94A3B8" />
                <Text style={s.simulatedCamText}>Kamera Scanner Berjalan</Text>
                <Text style={s.simulatedCamSub}>Arahkan kartu QR / Barcode santri ke area scanner</Text>
              </View>
            )}

            {/* Target Reticle Overlay - Aktif saat izin kamera granted */}
            {Boolean(CameraViewComponent && camPermission?.granted) && (
              <View style={s.reticleFrame}>
                <View style={[s.reticleCorner, s.reticleTopLeft]} />
                <View style={[s.reticleCorner, s.reticleTopRight]} />
                <View style={[s.reticleCorner, s.reticleBottomLeft]} />
                <View style={[s.reticleCorner, s.reticleBottomRight]} />
                <View style={s.scanLaserLine} />
              </View>
            )}

            {isScanningLocked && (
              <View style={s.scanningLockOverlay}>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={s.scanningLockText}>Menyimpan presensi...</Text>
              </View>
            )}
          </View>

          <View style={s.scannerHintRow}>
            <MaterialCommunityIcons name="information-outline" size={14} color="#64748B" style={{ marginRight: 6 }} />
            <Text style={s.scannerHintText}>
              Arahkan kartu santri ke kamera untuk scan otomatis, atau gunakan presensi manual dengan filter nama & kelas di bawah.
            </Text>
          </View>
        </View>

        {/* ── CARD: PENGAMBILAN PRESENSI MANUAL SANTRI (NAMA & FILTER KELAS) ── */}
        <View style={s.manualCard}>
          <View style={s.manualHeaderRow}>
            <View style={s.manualHeaderLeft}>
              <View style={[s.manualHeaderIconWrap, { backgroundColor: gateMode === 'in' ? '#ECFDF5' : '#FFFBEB' }]}>
                <MaterialCommunityIcons
                  name="account-search-outline"
                  size={20}
                  color={gateMode === 'in' ? '#059669' : '#D97706'}
                />
              </View>
              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text style={s.manualHeaderTitle}>Presensi Manual Santri</Text>
                <Text style={s.manualHeaderSubtitle}>Cari nama santri & filter kelas/rombel</Text>
              </View>
            </View>
            <View style={[s.activeModeBadge, { backgroundColor: gateMode === 'in' ? '#ECFDF5' : '#FFFBEB' }]}>
              <MaterialCommunityIcons
                name={gateMode === 'in' ? 'door-open' : 'door-closed'}
                size={13}
                color={gateMode === 'in' ? '#047857' : '#B45309'}
                style={{ marginRight: 4 }}
              />
              <Text style={[s.activeModeBadgeText, { color: gateMode === 'in' ? '#047857' : '#B45309' }]}>
                {gateMode === 'in' ? 'Mode Masuk' : 'Mode Pulang'}
              </Text>
            </View>
          </View>

          {/* 1. Search Box (Nama Santri / NIS) */}
          <View style={s.searchBoxContainer}>
            <MaterialCommunityIcons name="magnify" size={20} color="#94A3B8" style={{ marginLeft: 12 }} />
            <TextInput
              placeholder="Cari nama santri atau NIS..."
              placeholderTextColor="#94A3B8"
              value={manualSearchQuery}
              onChangeText={setManualSearchQuery}
              style={s.searchInput}
              returnKeyType="search"
            />
            {manualSearchQuery.length > 0 && (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setManualSearchQuery('')}
                style={{ padding: 8, marginRight: 4 }}
              >
                <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          {/* 2. Class Filter Dropdown */}
          <View style={s.classFilterSection}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setShowClassDropdown(true)}
              style={s.classDropdownTrigger}
            >
              <View style={s.classDropdownLeft}>
                <MaterialCommunityIcons name="google-classroom" size={16} color="#059669" style={{ marginRight: 7 }} />
                <Text style={s.classDropdownLabel}>
                  {selectedClassFilter === 'all'
                    ? `Semua Kelas (${allStudents.length})`
                    : (() => {
                        const cls = availableClasses.find((c) => c.id === selectedClassFilter);
                        const count = cls
                          ? allStudents.filter((st) => {
                              const cId = getStudentClassId(st);
                              const cName = getStudentClassName(st).toLowerCase();
                              return cId === cls.id || cName === cls.name.toLowerCase();
                            }).length
                          : 0;
                        return `${cls?.name || 'Kelas Terpilih'}${count > 0 ? ` (${count})` : ''}`;
                      })()}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-down" size={20} color="#059669" />
            </TouchableOpacity>

            {/* Dropdown Modal */}
            <Modal
              visible={showClassDropdown}
              transparent
              animationType="fade"
              onRequestClose={() => setShowClassDropdown(false)}
            >
              <TouchableOpacity
                style={s.classDropdownBackdrop}
                activeOpacity={1}
                onPress={() => setShowClassDropdown(false)}
              >
                <View style={s.classDropdownModal}>
                  {/* Modal Header */}
                  <View style={s.classDropdownModalHeader}>
                    <MaterialCommunityIcons name="google-classroom" size={17} color="#059669" style={{ marginRight: 7 }} />
                    <Text style={s.classDropdownModalTitle}>Pilih Kelas / Rombel</Text>
                    <TouchableOpacity
                      onPress={() => setShowClassDropdown(false)}
                      style={s.classDropdownCloseBtn}
                    >
                      <MaterialCommunityIcons name="close" size={18} color="#64748B" />
                    </TouchableOpacity>
                  </View>

                  {/* Option: Semua Kelas */}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => { setSelectedClassFilter('all'); setShowClassDropdown(false); }}
                    style={[s.classDropdownItem, selectedClassFilter === 'all' && s.classDropdownItemActive]}
                  >
                    <View style={s.classDropdownItemLeft}>
                      <MaterialCommunityIcons
                        name="account-group-outline"
                        size={15}
                        color={selectedClassFilter === 'all' ? '#FFFFFF' : '#475569'}
                        style={{ marginRight: 8 }}
                      />
                      <Text style={[s.classDropdownItemText, selectedClassFilter === 'all' && s.classDropdownItemTextActive]}>
                        Semua Kelas
                      </Text>
                    </View>
                    <Text style={[s.classDropdownItemCount, selectedClassFilter === 'all' && { color: '#FFFFFF', backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                      {allStudents.length}
                    </Text>
                  </TouchableOpacity>

                  {/* Divider */}
                  <View style={s.classDropdownDivider} />

                  {/* Class Options */}
                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    style={{ maxHeight: 280 }}
                    contentContainerStyle={{ paddingBottom: 4 }}
                    nestedScrollEnabled
                  >
                    {availableClasses.map((cls) => {
                      const isSel = selectedClassFilter === cls.id;
                      const count = allStudents.filter((st) => {
                        const cId = getStudentClassId(st);
                        const cName = getStudentClassName(st).toLowerCase();
                        return cId === cls.id || cName === cls.name.toLowerCase();
                      }).length;
                      return (
                        <TouchableOpacity
                          key={cls.id}
                          activeOpacity={0.8}
                          onPress={() => { setSelectedClassFilter(cls.id); setShowClassDropdown(false); }}
                          style={[s.classDropdownItem, isSel && s.classDropdownItemActive]}
                        >
                          <View style={s.classDropdownItemLeft}>
                            <MaterialCommunityIcons
                              name="google-classroom"
                              size={14}
                              color={isSel ? '#FFFFFF' : '#059669'}
                              style={{ marginRight: 8 }}
                            />
                            <Text style={[s.classDropdownItemText, isSel && s.classDropdownItemTextActive]}>
                              {cls.name}
                            </Text>
                          </View>
                          <Text style={[s.classDropdownItemCount, isSel && { color: '#FFFFFF', backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                            {count}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                    {availableClasses.length === 0 && (
                      <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                        <MaterialCommunityIcons name="school-outline" size={32} color="#CBD5E1" />
                        <Text style={{ color: '#94A3B8', fontSize: 12, marginTop: 6 }}>Belum ada data kelas</Text>
                      </View>
                    )}
                  </ScrollView>
                </View>
              </TouchableOpacity>
            </Modal>
          </View>

          {/* 3. Filtered Students List */}
          <View style={s.manualListContainer}>
            <View style={s.manualListHeader}>
              <Text style={s.manualListCountText}>
                Ditemukan <Text style={{ fontWeight: '800', color: '#0F172A' }}>{filteredStudents.length}</Text> santri
              </Text>
              {(manualSearchQuery.length > 0 || selectedClassFilter !== 'all') && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    setManualSearchQuery('');
                    setSelectedClassFilter('all');
                  }}
                >
                  <Text style={s.resetFilterText}>Reset Filter</Text>
                </TouchableOpacity>
              )}
            </View>

            {loadingData ? (
              <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#059669" />
                <Text style={{ fontSize: 11, color: '#64748B', marginTop: 6 }}>Memuat data santri & kelas...</Text>
              </View>
            ) : filteredStudents.length === 0 ? (
              <View style={s.emptyFilterBox}>
                <MaterialCommunityIcons name="account-search-outline" size={36} color="#CBD5E1" />
                <Text style={s.emptyFilterTitle}>Santri Tidak Ditemukan</Text>
                <Text style={s.emptyFilterSub}>
                  Tidak ada santri yang cocok dengan filter kelas atau kata kunci "{manualSearchQuery}".
                </Text>
                {manualSearchQuery.trim().length > 0 && (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      handleBarcodeScanned(manualSearchQuery.trim());
                      setManualSearchQuery('');
                    }}
                    style={s.processRawInputBtn}
                  >
                    <MaterialCommunityIcons name="qrcode-scan" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={s.processRawInputBtnText}>
                      Proses Presensi Langsung: "{manualSearchQuery.trim()}"
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              filteredStudents.slice(0, 30).map((st) => {
                const todayScan = getStudentTodayStatus(st);
                const isIn = gateMode === 'in';
                const isAlreadyActioned = todayScan?.mode === gateMode;

                return (
                  <View key={st.id} style={s.studentListItem}>
                    <Image
                      source={st.avatar ? { uri: getProfileImageUrl(st) } : DEFAULT_STUDENT_BOY_AVATAR}
                      style={s.studentAvatar}
                    />
                    <View style={{ flex: 1, marginHorizontal: 10 }}>
                      <Text style={s.studentItemName} numberOfLines={1}>{getStudentName(st)}</Text>
                      <Text style={s.studentItemSub}>
                        NIS: {getStudentNis(st)} • {getStudentClassName(st)}
                      </Text>
                      {todayScan && (
                        <View style={s.todayScanRow}>
                          <View style={[s.todayScanDot, { backgroundColor: todayScan.mode === 'in' ? '#10B981' : '#F59E0B' }]} />
                          <Text style={s.todayScanText}>
                            Hari ini: {todayScan.status || (todayScan.mode === 'in' ? 'Masuk' : 'Pulang')} ({todayScan.time})
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Action Button: Catat Masuk / Catat Pulang */}
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => handleManualAttendance(st)}
                      disabled={isScanningLocked}
                      style={[
                        s.takeAttendanceBtn,
                        isIn ? s.takeAttendanceBtnIn : s.takeAttendanceBtnOut,
                        isAlreadyActioned && { opacity: 0.8 },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={isIn ? 'door-open' : 'door-closed'}
                        size={15}
                        color="#FFFFFF"
                        style={{ marginRight: 4 }}
                      />
                      <Text style={s.takeAttendanceBtnText}>
                        {isIn ? 'Catat Masuk' : 'Catat Pulang'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}

            {filteredStudents.length > 30 && (
              <Text style={s.moreStudentsNotice}>
                + Menampilkan 30 dari {filteredStudents.length} santri. Gunakan pencarian nama untuk hasil lebih spesifik.
              </Text>
            )}
          </View>
        </View>

        {/* ── LIVE RECENT SCANS LOG ── */}
        <View style={s.recentCard}>
          <View style={s.recentHeaderRow}>
            <MaterialCommunityIcons name="history" size={18} color="#059669" />
            <Text style={s.recentHeaderTitle}>Riwayat Log Gerbang Hari Ini</Text>
            <View style={s.logCountPill}>
              <Text style={s.logCountPillText}>{recentScans.length} Santri</Text>
            </View>
          </View>

          {recentScans.length === 0 ? (
            <View style={s.emptyRecentBox}>
              <MaterialCommunityIcons name="qrcode-scan" size={36} color="#CBD5E1" />
              <Text style={s.emptyRecentText}>Belum ada santri yang discan hari ini.</Text>
            </View>
          ) : (
            recentScans.map((scan, idx) => {
              const isIn = scan.mode === 'in';
              const isEarly = String(scan.status || '').includes('Awal');
              return (
                <View key={scan.id || idx} style={s.recentItemRow}>
                  <View style={[s.recentIconWrap, { backgroundColor: isIn ? '#ECFDF5' : isEarly ? '#FFFBEB' : '#EFF6FF' }]}>
                    <MaterialCommunityIcons
                      name={isIn ? 'door-open' : 'door-closed'}
                      size={18}
                      color={isIn ? '#059669' : isEarly ? '#D97706' : '#2563EB'}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={s.recentStudentName} numberOfLines={1}>{scan.student_name || scan.name}</Text>
                    <Text style={s.recentStudentSub}>NIS: {scan.nis || '-'} • {scan.className || 'Kelas'}</Text>
                    {scan.pickup ? (
                      <Text style={s.recentPickupText}>Penjemput: {scan.pickup}</Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.recentTimeText}>{scan.time}</Text>
                    <View style={[s.recentStatusBadge, { backgroundColor: isIn ? '#ECFDF5' : isEarly ? '#FFFBEB' : '#EFF6FF' }]}>
                      <Text style={[s.recentStatusBadgeText, { color: isIn ? '#059669' : isEarly ? '#D97706' : '#2563EB' }]}>
                        {scan.status || (isIn ? 'Masuk' : 'Pulang')}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* ── MODAL: FORM KEPULANGAN AWAL SANTRI (DI TENGAH JAM PELAJARAN) ── */}
      <Modal
        visible={earlyDepartureModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setEarlyDepartureModalOpen(false)}
      >
        <View style={s.modalBackdrop}>
          <View style={s.earlyModalSheet}>
            {/* Modal Top Bar */}
            <View style={s.modalTopBar}>
              <View style={s.warningSquircle}>
                <MaterialCommunityIcons name="clock-alert-outline" size={20} color="#D97706" />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={s.modalSheetTitle}>Verifikasi Pulang di Jam Belajar</Text>
                <Text style={s.modalSheetSub}>Laporan instan ke akses orang tua santri</Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setEarlyDepartureModalOpen(false)}
                style={s.modalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              {/* Target Student Identity Card */}
              {pendingStudent && (
                <View style={s.modalStudentCard}>
                  <Image
                    source={pendingStudent.avatar ? { uri: getProfileImageUrl(pendingStudent) } : DEFAULT_STUDENT_BOY_AVATAR}
                    style={s.modalStudentAvatar}
                  />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={s.modalStudentName}>{pendingStudent.nama_lengkap || pendingStudent.name}</Text>
                    <Text style={s.modalStudentClass}>NIS: {pendingStudent.nis || '-'} • {pendingStudent.kelas?.nama_kelas || pendingStudent.kelas_name || 'Santri'}</Text>
                    <Text style={s.modalDepartureTime}>Jam Pulang: {currentHour}</Text>
                  </View>
                </View>
              )}

              {/* Reason Selector */}
              <Text style={s.fieldLabel}>Alasan Kepulangan Santri *</Text>
              <View style={s.reasonChipsWrap}>
                {[
                  'Sakit (Rujukan UKS)',
                  'Izin Kepentingan Keluarga',
                  'Urusan Darurat / Mendesak',
                  'Dispensasi Pondok / Kegiatan',
                  'Lainnya',
                ].map((reasonItem) => {
                  const isChosen = earlyReason === reasonItem;
                  return (
                    <TouchableOpacity
                      key={reasonItem}
                      activeOpacity={0.8}
                      onPress={() => setEarlyReason(reasonItem)}
                      style={[s.reasonChip, isChosen && s.reasonChipChosen]}
                    >
                      <MaterialCommunityIcons
                        name={isChosen ? 'check-circle' : 'circle-outline'}
                        size={14}
                        color={isChosen ? '#059669' : '#64748B'}
                        style={{ marginRight: 4 }}
                      />
                      <Text style={[s.reasonChipText, isChosen && s.reasonChipTextChosen]}>{reasonItem}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Pickup Person Name */}
              <Text style={[s.fieldLabel, { marginTop: 12 }]}>Nama Penjemput *</Text>
              <TextInput
                placeholder="Contoh: Bapak Irwan (Ayah Kandung)"
                placeholderTextColor="#94A3B8"
                value={pickupPerson}
                onChangeText={setPickupPerson}
                style={s.modalInput}
              />

              {/* Pickup Relationship */}
              <Text style={[s.fieldLabel, { marginTop: 10 }]}>Hubungan Penjemput</Text>
              <View style={s.relationRow}>
                {['Orang Tua', 'Wali Santri', 'Supir Keluarga', 'Kerabat'].map((rel) => {
                  const isSel = pickupRelation === rel;
                  return (
                    <TouchableOpacity
                      key={rel}
                      activeOpacity={0.8}
                      onPress={() => setPickupRelation(rel)}
                      style={[s.relationChip, isSel && s.relationChipActive]}
                    >
                      <Text style={[s.relationChipText, isSel && s.relationChipTextActive]}>{rel}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Additional Notes */}
              <Text style={[s.fieldLabel, { marginTop: 10 }]}>Keterangan Tambahan (Opsional)</Text>
              <TextInput
                placeholder="Misal: Surat rujukan dokter terlampir di pos..."
                placeholderTextColor="#94A3B8"
                value={departureNotes}
                onChangeText={setDepartureNotes}
                style={[s.modalInput, { height: 60, textAlignVertical: 'top' }]}
                multiline
              />

              {/* Parent Notification Callout */}
              <View style={s.parentNotificationNotice}>
                <MaterialCommunityIcons name="bell-ring" size={16} color="#059669" style={{ marginRight: 6 }} />
                <Text style={s.parentNotificationNoticeText}>
                  Notifikasi kepulangan santri akan dikirimkan seketika ke ponsel orang tua ananda {pendingStudent?.nama_lengkap}.
                </Text>
              </View>
            </ScrollView>

            {/* Modal Actions */}
            <View style={s.modalActionsRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setEarlyDepartureModalOpen(false)}
                style={s.modalCancelBtn}
              >
                <Text style={s.modalCancelBtnText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={submitEarlyDeparture}
                disabled={submittingEarlyDeparture}
                style={s.modalSaveBtn}
              >
                {submittingEarlyDeparture ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="send-check" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={s.modalSaveBtnText}>Simpan & Kirim Notif</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Feedback Modal */}
      {feedbackModal && (
        <AppFeedbackModal
          visible={feedbackModal.visible}
          type={feedbackModal.type}
          title={feedbackModal.title}
          message={feedbackModal.message}
          onClose={() => setFeedbackModal(null)}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  topHeader: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  topHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerSquircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  headerTitleCol: { flex: 1, marginHorizontal: 10 },
  roleTag: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  pulseDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#34D399', marginRight: 5 },
  roleTagText: { fontSize: 9.5, fontWeight: '800', color: '#D1FAE5', letterSpacing: 0.5 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  headerSubtitle: { fontSize: 11, color: '#E6FFFA', fontWeight: '600' },

  modeToggleBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 14,
    padding: 3,
  },
  modeToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 11,
  },
  modeToggleBtnActiveIn: { backgroundColor: '#FFFFFF' },
  modeToggleBtnActiveOut: { backgroundColor: '#FFFFFF' },
  modeToggleText: { fontSize: 11.5, fontWeight: '700', color: '#FFFFFF' },
  modeToggleTextActiveIn: { color: '#047857' },
  modeToggleTextActiveOut: { color: '#B45309' },

  scrollContent: { padding: 14 },

  earlyNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: 10,
    marginBottom: 12,
  },
  earlyNoticeTitle: { fontSize: 12, fontWeight: '800', color: '#B45309' },
  earlyNoticeSub: { fontSize: 10.5, color: '#92400E', marginTop: 1 },

  scannerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  scannerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  scannerTitleRow: { flexDirection: 'row', alignItems: 'center' },
  scannerTitle: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  switchCamBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  switchCamText: { fontSize: 10.5, fontWeight: '700', color: '#475569' },

  viewfinderBox: {
    width: '100%',
    height: 220,
    backgroundColor: '#0F172A',
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  simulatedCamBox: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  simulatedCamText: { fontSize: 13, fontWeight: '800', color: '#F8FAFC', marginTop: 8 },
  simulatedCamSub: { fontSize: 10.5, color: '#94A3B8', textAlign: 'center', marginTop: 3 },

  camPermissionBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 18,
  },
  camPermIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  camPermTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 4,
  },
  camPermDesc: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 12,
  },
  camPermBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  camPermBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  reticleFrame: {
    width: 170,
    height: 170,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticleCorner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#34D399',
  },
  reticleTopLeft: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 6 },
  reticleTopRight: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 6 },
  reticleBottomLeft: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 6 },
  reticleBottomRight: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 6 },
  scanLaserLine: {
    width: 150,
    height: 2,
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },

  scanningLockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanningLockText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF', marginTop: 6 },

  scannerHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 8,
    marginTop: 10,
  },
  scannerHintText: { flex: 1, fontSize: 10.5, color: '#64748B', fontWeight: '600' },

  // Manual Attendance Section Card
  manualCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  manualHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  manualHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  manualHeaderIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualHeaderTitle: { fontSize: 13.5, fontWeight: '800', color: '#0F172A' },
  manualHeaderSubtitle: { fontSize: 10.5, color: '#64748B', fontWeight: '500', marginTop: 1 },
  activeModeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  activeModeBadgeText: { fontSize: 10.5, fontWeight: '800' },

  // Search Box
  searchBoxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    height: 40,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
    paddingHorizontal: 8,
    height: 40,
  },

  // Class Filter Dropdown
  classFilterSection: { marginBottom: 12 },

  classDropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  classDropdownLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  classDropdownLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#065F46',
    flex: 1,
  },

  // Dropdown Modal
  classDropdownBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  classDropdownModal: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingTop: 0,
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
    overflow: 'hidden',
  },
  classDropdownModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: '#F0FDF4',
    borderBottomWidth: 1,
    borderBottomColor: '#D1FAE5',
  },
  classDropdownModalTitle: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '800',
    color: '#064E3B',
  },
  classDropdownCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  classDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 11,
    marginHorizontal: 8,
    marginVertical: 2,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  classDropdownItemActive: {
    backgroundColor: '#059669',
  },
  classDropdownItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  classDropdownItemText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155',
    flex: 1,
  },
  classDropdownItemTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  classDropdownItemCount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    minWidth: 28,
    textAlign: 'center',
  },
  classDropdownDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginHorizontal: 8,
    marginVertical: 4,
  },

  // Manual List
  manualListContainer: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
  },
  manualListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  manualListCountText: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  resetFilterText: { fontSize: 11, color: '#059669', fontWeight: '700' },

  emptyFilterBox: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyFilterTitle: { fontSize: 12.5, fontWeight: '800', color: '#475569', marginTop: 6 },
  emptyFilterSub: { fontSize: 11, color: '#94A3B8', textAlign: 'center', marginTop: 2, paddingHorizontal: 20 },
  processRawInputBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 10,
  },
  processRawInputBtnText: { fontSize: 11.5, fontWeight: '800', color: '#FFFFFF' },

  studentListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  studentAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#E2E8F0' },
  studentItemName: { fontSize: 12.5, fontWeight: '800', color: '#0F172A' },
  studentItemSub: { fontSize: 10.5, color: '#64748B', fontWeight: '500', marginTop: 1 },
  todayScanRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  todayScanDot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
  todayScanText: { fontSize: 9.5, color: '#059669', fontWeight: '700' },

  takeAttendanceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  takeAttendanceBtnIn: { backgroundColor: '#059669' },
  takeAttendanceBtnOut: { backgroundColor: '#D97706' },
  takeAttendanceBtnText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },

  moreStudentsNotice: {
    fontSize: 10.5,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 10,
    fontStyle: 'italic',
  },

  recentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  recentHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  recentHeaderTitle: { fontSize: 13, fontWeight: '800', color: '#0F172A', marginLeft: 6, flex: 1 },
  logCountPill: { backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  logCountPillText: { fontSize: 10.5, fontWeight: '800', color: '#059669' },

  emptyRecentBox: { paddingVertical: 24, alignItems: 'center' },
  emptyRecentText: { fontSize: 11.5, color: '#94A3B8', marginTop: 6 },

  recentItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  recentIconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  recentStudentName: { fontSize: 12.5, fontWeight: '800', color: '#0F172A' },
  recentStudentSub: { fontSize: 10.5, color: '#64748B', fontWeight: '600' },
  recentPickupText: { fontSize: 10, color: '#D97706', fontWeight: '700', marginTop: 1 },
  recentTimeText: { fontSize: 11, fontWeight: '700', color: '#0F172A' },
  recentStatusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginTop: 2 },
  recentStatusBadgeText: { fontSize: 9.5, fontWeight: '800' },

  // Modal Early Departure
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'flex-end',
  },
  earlyModalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
  },
  modalTopBar: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  warningSquircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSheetTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  modalSheetSub: { fontSize: 11, color: '#64748B' },
  modalCloseBtn: { padding: 6 },

  modalStudentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  modalStudentAvatar: { width: 38, height: 38, borderRadius: 19 },
  modalStudentName: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  modalStudentClass: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  modalDepartureTime: { fontSize: 10.5, color: '#059669', fontWeight: '700', marginTop: 1 },

  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#334155', marginBottom: 4 },
  reasonChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  reasonChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  reasonChipChosen: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  reasonChipText: { fontSize: 11, color: '#475569', fontWeight: '600' },
  reasonChipTextChosen: { color: '#059669', fontWeight: '800' },

  modalInput: {
    height: 38,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    fontSize: 12,
    color: '#0F172A',
  },

  relationRow: { flexDirection: 'row', gap: 6 },
  relationChip: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  relationChipActive: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  relationChipText: { fontSize: 11, color: '#475569', fontWeight: '600' },
  relationChipTextActive: { color: '#059669', fontWeight: '800' },

  parentNotificationNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    padding: 8,
    marginTop: 10,
  },
  parentNotificationNoticeText: { flex: 1, fontSize: 10.5, color: '#065F46', fontWeight: '600' },

  modalActionsRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  modalCancelBtn: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtnText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  modalSaveBtn: {
    flex: 2,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveBtnText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
});

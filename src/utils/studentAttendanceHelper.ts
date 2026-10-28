/**
 * studentAttendanceHelper.ts
 * Single Source of Truth untuk Resolusi & Standarisasi Status Kehadiran Siswa
 * Digunakan seragam di seluruh halaman Mobile App (HomeScreen, AcademicCalendar, ExamGrids,
 * Schedule, BankSoal, CbtExams, Grade, Material, Assignment, Mutabaah, Tahfizh, Notes, dll).
 */

import { useActiveChildStore } from '../stores/activeChildStore';

export interface AttendanceBadgeStatus {
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: any;
  isHoliday?: boolean;
}

export function getStudentAttendanceStatus(
  student?: any,
  extraAttendanceSource?: any
): AttendanceBadgeStatus {
  const day = new Date().getDay();
  const isWeekend = day === 0 || day === 6;

  // Cek apakah ada data siswa dari activeChildStore jika parameter student belum lengkap
  const targetId = student?.id || student?.student_id;
  let storedChild: any = null;
  if (targetId) {
    const list = useActiveChildStore.getState().children || [];
    storedChild = list.find((c) => String(c.id || c.student_id) === String(targetId)) || null;
  }
  if (!storedChild) {
    storedChild = useActiveChildStore.getState().getActiveChild();
  }

  // 1. Ekstrak data mentah kehadiran dari berbagai kemungkinan properti
  const rawAtt =
    extraAttendanceSource?.attendance_today ||
    extraAttendanceSource?.presensi_hari_ini ||
    extraAttendanceSource?.summary?.attendance_status ||
    extraAttendanceSource?.attendance ||
    extraAttendanceSource ||
    student?.attendance_today ||
    student?.presensi_hari_ini ||
    student?.attendance_status ||
    student?.status_kehadiran ||
    student?.presensi_status ||
    student?.status_presensi ||
    storedChild?.attendance_today ||
    storedChild?.presensi_hari_ini ||
    storedChild?.attendance_status ||
    storedChild?.status_kehadiran ||
    null;

  const rawStatus = String(
    (typeof rawAtt === 'object' && rawAtt !== null
      ? rawAtt.status_label || rawAtt.label || rawAtt.status || rawAtt.attendance_status
      : rawAtt) || ''
  ).toLowerCase().trim();

  const isHoliday = Boolean(
    student?.is_holiday ||
    storedChild?.is_holiday ||
    (typeof rawAtt === 'object' && rawAtt?.is_holiday) ||
    rawStatus.includes('libur')
  );

  // 2. Evaluasi Libur (Akhir Pekan atau Libur Kalender Pendidikan)
  if (isWeekend || isHoliday) {
    let holidayLabel = 'Libur';
    if (rawStatus.includes('semester')) {
      holidayLabel = 'Libur Semester';
    } else if (
      rawStatus &&
      rawStatus !== 'libur' &&
      rawStatus !== 'libur akhir pekan' &&
      rawStatus !== 'libur sekolah' &&
      typeof rawAtt === 'object' &&
      rawAtt?.status_label
    ) {
      holidayLabel = rawAtt.status_label;
    }
    return {
      label: holidayLabel,
      color: '#D97706',
      bg: '#FFFBEB',
      border: '#FDE68A',
      icon: 'weather-sunny',
      isHoliday: true,
    };
  }

  // 3. Evaluasi Hadir (Present / Tepat Waktu / Masuk)
  if (
    rawStatus === 'hadir' ||
    rawStatus === 'present' ||
    rawStatus === 'tepat waktu' ||
    rawStatus === 'hadir tepat waktu' ||
    rawStatus.includes('hadir') ||
    rawStatus.includes('masuk') ||
    rawStatus === 'h'
  ) {
    return {
      label: 'Hadir',
      color: '#047857',
      bg: '#ECFDF5',
      border: '#A7F3D0',
      icon: 'check-circle',
    };
  }

  // 4. Evaluasi Terlambat (Late)
  if (
    rawStatus === 'terlambat' ||
    rawStatus === 'late' ||
    rawStatus.includes('terlambat') ||
    rawStatus === 't'
  ) {
    return {
      label: 'Terlambat',
      color: '#D97706',
      bg: '#FFFBEB',
      border: '#FDE68A',
      icon: 'clock-alert-outline',
    };
  }

  // 5. Evaluasi Sakit (Sick)
  if (
    rawStatus === 'sakit' ||
    rawStatus === 'sick' ||
    rawStatus.includes('sakit') ||
    rawStatus === 's'
  ) {
    return {
      label: 'Sakit',
      color: '#0284C7',
      bg: '#F0F9FF',
      border: '#BAE6FD',
      icon: 'hospital-box-outline',
    };
  }

  // 6. Evaluasi Izin (Permit / Leave)
  if (
    rawStatus === 'izin' ||
    rawStatus === 'permit' ||
    rawStatus === 'leave' ||
    rawStatus.includes('izin') ||
    rawStatus === 'i'
  ) {
    return {
      label: 'Izin',
      color: '#2563EB',
      bg: '#EFF6FF',
      border: '#BFDBFE',
      icon: 'clock-outline',
    };
  }

  // 7. Evaluasi Tidak Hadir / Alpa / Alpha (Absent)
  if (
    rawStatus === 'tidak hadir' ||
    rawStatus === 'tidak_hadir' ||
    rawStatus === 'alpa' ||
    rawStatus === 'alpha' ||
    rawStatus === 'absent' ||
    rawStatus.includes('alpa') ||
    rawStatus.includes('alpha') ||
    rawStatus.includes('tidak hadir') ||
    rawStatus === 'a'
  ) {
    return {
      label: 'Tidak Hadir',
      color: '#DC2626',
      bg: '#FEF2F2',
      border: '#FECACA',
      icon: 'close-circle',
    };
  }

  // 8. Fallback Terpadu: Belum Presensi (Hari aktif tapi belum tap/tercatat)
  return {
    label: 'Belum Presensi',
    color: '#64748B',
    bg: '#F8FAFC',
    border: '#E2E8F0',
    icon: 'help-circle-outline',
  };
}

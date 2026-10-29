/**
 * accessControl.ts - Unified Mobile Authorization & Capability Engine
 *
 * Enforces the authoritative access chain:
 * FEATURE FLAG ENABLED
 * + AUTHENTICATED USER
 * + CANONICAL ROLE ALLOWED
 * + REQUIRED PERMISSION PRESENT
 * + DATA/UNIT SCOPE ALLOWED
 */

import { AuthUser } from '../stores/authStore';
import { MobileAppConfig } from '../stores/mobileConfigStore';
import {
  ROLES,
  hasAnyRole,
  isSuperAdminRole,
  isFoundationRole,
  isDivisiRole,
  isPrincipalRole,
  isTeacherRole,
  isParentRole,
  isStudentRole,
  isTuRole,
  isOperatorRole,
  isMusyrifRole,
} from './roles';

export type ScreenKey =
  | 'home'
  | 'notifications'
  | 'qr'
  | 'profile'
  | 'more'
  | 'data'
  | 'teacher'
  | 'parent'
  | 'student'
  | 'attendance'
  | 'rekapPresensiGuru'
  | 'laporanBulanan'
  | 'prestasiSiswa'
  | 'monitoringSiswa'
  | 'alumniTracer'
  | 'mutasiSiswa';

export type ActionType = 'read' | 'create' | 'update' | 'delete' | 'verify' | 'export';
export type ResourceType = 'employees' | 'students' | 'units' | 'classes' | 'attendance' | 'tahfizh' | 'positions';

export interface AccessResult {
  allowed: boolean;
  reason?: string;
}

export const can = (user: AuthUser | null, ...requiredPermissions: string[]): boolean => {
  if (!user) return false;
  const roles = user.roles || [];
  if (isSuperAdminRole(roles)) return true;

  const permissions = user.permissions || [];
  if (permissions.length === 0) return false;

  return requiredPermissions.some((perm) => permissions.includes(perm));
};

/**
 * Screen Access Resolution Rule
 */
export const canAccessScreen = (
  screenKey: ScreenKey,
  user: AuthUser | null,
  config?: MobileAppConfig | null
): AccessResult => {
  if (!user) {
    return { allowed: false, reason: 'Pengguna belum terautentikasi.' };
  }

  const roles = user.roles || [];
  const permissions = user.permissions || [];
  const scope = user.scope || {};
  const isSuperAdmin = isSuperAdminRole(roles);
  const features = config?.features;

  switch (screenKey) {
    case 'home':
    case 'profile':
    case 'more':
      return { allowed: true };

    case 'notifications':
      if (features && features.notifications === false) {
        return { allowed: false, reason: 'Fitur notifikasi dinonaktifkan dari pengaturan server.' };
      }
      return { allowed: true };

    case 'qr':
      if (features && !features.qr_login && !features.qr_attendance) {
        return { allowed: false, reason: 'Fitur QR dinonaktifkan dari pengaturan server.' };
      }
      return { allowed: true };

    case 'data': {
      if (isSuperAdmin) return { allowed: true };

      const hasDataRole =
        isFoundationRole(roles) ||
        isPrincipalRole(roles) ||
        isDivisiRole(roles) ||
        isTuRole(roles) ||
        isOperatorRole(roles) ||
        hasAnyRole(roles, ROLES.ADMIN);

      const hasDataPermission = can(
        user,
        'sistem.master_data',
        'master.view',
        'unit.view',
        'unit.view_all',
        'employee.view',
        'employee.view_all',
        'student.view',
        'student.view_all',
        'foundation.unit.view',
        'foundation.employee.view',
        'foundation.student.view'
      );

      if (hasDataRole || hasDataPermission) {
        return { allowed: true };
      }
      return { allowed: false, reason: 'Akun Anda tidak memiliki izin untuk mengelola data master.' };
    }

    case 'teacher': {
      if (isSuperAdmin) return { allowed: true };

      const isTeacher = isTeacherRole(roles);
      const hasTeacherPermission = can(
        user,
        'teacher.dashboard.view',
        'academic.schedule.view',
        'lesson_attendance.view',
        'lesson_attendance.view_own'
      );

      if ((isTeacher || hasTeacherPermission) && scope.employee_id) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: 'Portal guru hanya diperuntukkan bagi pengajar dengan profil pegawai aktif.',
      };
    }

    case 'parent': {
      if (isSuperAdmin) return { allowed: true };

      const isParent = isParentRole(roles);
      const hasParentPermission = can(user, 'parent.portal.view');

      if (isParent || hasParentPermission) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: 'Portal orang tua hanya dapat diakses oleh akun wali murid terdaftar.',
      };
    }

    case 'student': {
      if (isSuperAdmin) return { allowed: true };

      const isStudent = isStudentRole(roles);
      const hasStudentPermission = can(user, 'student.portal.view');

      if (isStudent || hasStudentPermission) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: 'Portal siswa hanya dapat diakses oleh akun peserta didik terdaftar.',
      };
    }

    case 'attendance': {
      if (isSuperAdmin) return { allowed: true };

      const hasAttendanceRole =
        isTeacherRole(roles) ||
        isMusyrifRole(roles) ||
        isTuRole(roles) ||
        isOperatorRole(roles) ||
        isPrincipalRole(roles) ||
        isDivisiRole(roles) ||
        isParentRole(roles) ||
        isStudentRole(roles);

      const hasAttendancePermission = can(
        user,
        'attendance.view',
        'attendance.manage',
        'kehadiran.siswa.monitoring',
        'kehadiran.siswa.absensi_digital'
      );

      if (hasAttendanceRole || hasAttendancePermission) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: 'Akun Anda tidak memiliki hak akses untuk mencatat presensi mandiri.',
      };
    }

    case 'rekapPresensiGuru': {
      if (isSuperAdmin) return { allowed: true };

      const isAllowedRole =
        isPrincipalRole(roles) ||
        isTuRole(roles) ||
        isDivisiRole(roles) ||
        isFoundationRole(roles) ||
        hasAnyRole(roles, ROLES.ADMIN);

      const hasAttendancePermission = can(
        user,
        'attendance.view',
        'attendance.manage',
        'employee_attendance.view',
        'kehadiran.pegawai.monitoring'
      );

      if (isAllowedRole || hasAttendancePermission) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: 'Rekap presensi guru hanya dapat diakses oleh Kepala Sekolah, Divisi Pendidikan, Tata Usaha, dan Administrator.',
      };
    }

    case 'laporanBulanan': {
      if (isSuperAdmin || isPrincipalRole(roles) || isDivisiRole(roles) || isFoundationRole(roles) || can(user, 'divisi.laporan_bulanan', 'dashboard.kepala-sekolah.view')) {
        return { allowed: true };
      }
      return { allowed: false, reason: 'Laporan bulanan hanya dapat diakses oleh Kepala Sekolah, Divisi Pendidikan, dan Pimpinan Yayasan.' };
    }

    case 'prestasiSiswa': {
      if (isSuperAdmin || isPrincipalRole(roles) || isDivisiRole(roles) || isFoundationRole(roles) || isTeacherRole(roles) || can(user, 'dashboard.pemantauan.lihat', 'kesiswaan.prestasi_rekapitulasi', 'report.prestasi.view')) {
        return { allowed: true };
      }
      return { allowed: false, reason: 'Rekapitulasi prestasi siswa hanya dapat diakses oleh pengawas, pimpinan, dan guru.' };
    }

    case 'monitoringSiswa': {
      if (isSuperAdmin || isPrincipalRole(roles) || isDivisiRole(roles) || isFoundationRole(roles) || isTuRole(roles) || can(user, 'divisi.monitoring', 'kehadiran.siswa.monitoring')) {
        return { allowed: true };
      }
      return { allowed: false, reason: 'Monitoring siswa hanya dapat diakses oleh Kepala Sekolah, Divisi Pendidikan, dan Staf Berwenang.' };
    }

    case 'alumniTracer': {
      if (isSuperAdmin || isPrincipalRole(roles) || isDivisiRole(roles) || isFoundationRole(roles) || isTuRole(roles) || can(user, 'alumni.view', 'kesiswaan.alumni_tujuan_lanjut', 'kesiswaan.kelulusan_per_tahun')) {
        return { allowed: true };
      }
      return { allowed: false, reason: 'Data kelulusan dan tracer study alumni hanya dapat diakses oleh pimpinan dan TU.' };
    }

    case 'mutasiSiswa': {
      if (isSuperAdmin || isPrincipalRole(roles) || isDivisiRole(roles) || isFoundationRole(roles) || isTuRole(roles) || can(user, 'kesiswaan.laporan_mutasi', 'student.mutation.view')) {
        return { allowed: true };
      }
      return { allowed: false, reason: 'Data mutasi siswa masuk dan keluar hanya dapat diakses oleh pimpinan dan staf terkait.' };
    }

    default:
      return { allowed: false, reason: 'Layanan tidak dikenal atau tidak tersedia.' };
  }
};

/**
 * Action-level Capability Resolution
 */
export const canPerformAction = (
  action: ActionType,
  resource: ResourceType,
  user: AuthUser | null
): boolean => {
  if (!user) return false;
  const roles = user.roles || [];
  if (isSuperAdminRole(roles)) return true;
  const isPrincipal = isPrincipalRole(roles) || isDivisiRole(roles);

  switch (resource) {
    case 'employees':
      if (isPrincipal && ['read', 'create', 'update', 'delete'].includes(action)) return true;
      if (action === 'read') return can(user, 'employee.view', 'employee.view_all', 'sistem.master_data');
      if (action === 'create') return can(user, 'employee.create', 'sistem.master_data');
      if (action === 'update') return can(user, 'employee.update', 'employee.edit', 'sistem.master_data');
      if (action === 'delete') return can(user, 'employee.delete', 'sistem.master_data');
      return false;

    case 'students':
      if (isPrincipal && ['read', 'create', 'update', 'delete'].includes(action)) return true;
      if (action === 'read') return can(user, 'student.view', 'student.view_all', 'sistem.master_data', 'kesiswaan.data_lengkap_siswa');
      if (action === 'create') return can(user, 'student.create', 'sistem.master_data');
      if (action === 'update') return can(user, 'student.update', 'student.edit', 'sistem.master_data');
      if (action === 'delete') return can(user, 'student.delete', 'sistem.master_data');
      return false;

    case 'units':
      if (action === 'read') return can(user, 'unit.view', 'unit.view_all', 'sistem.master_data');
      if (action === 'create') return can(user, 'unit.create', 'sistem.master_data');
      if (action === 'update') return can(user, 'unit.update', 'sistem.master_data');
      if (action === 'delete') return can(user, 'unit.delete', 'sistem.master_data');
      return false;

    case 'classes':
      if (isPrincipal && ['read', 'create', 'update', 'delete'].includes(action)) return true;
      if (action === 'read') return can(user, 'master.view', 'academic.schedule.view', 'sistem.master_data');
      if (action === 'create') return can(user, 'master.create', 'academic.schedule.create', 'sistem.master_data');
      if (action === 'update') return can(user, 'master.update', 'academic.schedule.update', 'sistem.master_data');
      if (action === 'delete') return can(user, 'master.delete', 'academic.schedule.delete', 'sistem.master_data');
      return false;

    case 'positions':
      if (isPrincipal && action === 'read') return true;
      if (action === 'read') return can(user, 'master.view', 'employee.position.manage', 'sistem.master_data');
      if (action === 'create') return can(user, 'master.create', 'employee.position.manage', 'sistem.master_data');
      if (action === 'update') return can(user, 'master.update', 'employee.position.manage', 'sistem.master_data');
      if (action === 'delete') return can(user, 'master.delete', 'employee.position.manage', 'sistem.master_data');
      return false;

    case 'attendance':
      if (action === 'read') return can(user, 'attendance.view', 'kehadiran.siswa.monitoring');
      if (action === 'create' || action === 'update') return can(user, 'attendance.manage', 'kehadiran.siswa.absensi_digital');
      if (action === 'verify') return can(user, 'attendance.manage', 'worship_attendance.verify');
      if (action === 'export') return can(user, 'report.attendance.view', 'report.export');
      return false;

    case 'tahfizh':
      if (action === 'read') return can(user, 'tahfizh.view', 'tahfizh.deposit.view');
      if (action === 'create') return can(user, 'tahfizh.deposit.create', 'tahfizh.input_setoran_harian');
      if (action === 'verify') return can(user, 'tahfizh.deposit.create', 'dashboard.guru-tahfizh.view');
      return false;

    default:
      return false;
  }
};

/**
 * Parent Child Ownership Verification
 * Protects against arbitrary child IDs passed through state, params, or deep links.
 */
export const verifyChildOwnership = (
  childId: string | number | undefined,
  authorizedChildren: Array<any>
): boolean => {
  if (!childId || !Array.isArray(authorizedChildren) || authorizedChildren.length === 0) {
    return false;
  }
  const needle = String(childId).trim();
  return authorizedChildren.some((child) => child && String(child.id).trim() === needle);
};

/**
 * Unit Scope Verification
 * Ensures user operating within unit locks does not access another unit's scope.
 */
export const verifyUnitScope = (
  userUnitId: string | number | null | undefined,
  targetUnitId: string | number | null | undefined
): boolean => {
  // If user has no unit lock (e.g. Yayasan or Super Admin), access is unrestricted
  if (!userUnitId) return true;
  if (!targetUnitId) return true;
  return String(userUnitId).trim() === String(targetUnitId).trim();
};

/**
 * QR Attendance Action Guard
 * Evaluates whether QR scanning / QR beacon check-in action is enabled.
 */
export const canUseQrAttendance = (
  user: AuthUser | null,
  config?: MobileAppConfig | null
): boolean => {
  if (config?.features?.qr_attendance === false) return false;
  return can(user, 'attendance.manage', 'attendance.view', 'kehadiran.siswa.absensi_digital');
};

/**
 * Pre-authenticated QR Login Action Guard
 * Evaluates whether the pre-authenticated QR employee login entry is enabled.
 * Does NOT require attendance.view or any authenticated permissions.
 */
export const canUseQrLogin = (
  config?: MobileAppConfig | null
): boolean => {
  return config?.features?.qr_login !== false;
};

/**
 * School Info Action Guard
 * Evaluates whether school announcements and information modules are enabled.
 */
export const canAccessSchoolInfo = (
  config?: MobileAppConfig | null
): boolean => {
  return config?.features?.school_info !== false;
};

/**
 * Billing Access Guard
 * TU dapat mengakses ringkasan tagihan siswa (read-only monitoring).
 * Orang tua juga bisa akses tagihan anak mereka sendiri.
 */
export const canAccessBilling = (
  user: AuthUser | null,
  config?: MobileAppConfig | null
): boolean => {
  if (!user) return false;
  if (config?.features?.billing === false) return false;
  const roles = user.roles || [];
  if (isSuperAdminRole(roles)) return true;
  // TU dan Operator bisa lihat rekap tagihan (monitoring)
  if (isTuRole(roles) || isOperatorRole(roles)) return true;
  // Orang tua bisa lihat tagihan anak
  if (isParentRole(roles)) return true;
  // Permission-based fallback
  return can(user, 'billing.view', 'keuangan.tagihan.view', 'payment.view');
};

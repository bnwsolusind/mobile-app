/**
 * roles.ts - Canonical Role & Normalization Matrix for SIMSIT Mobile
 * Mirroring backend (PortalResolver.php) and web-dashboard (portalResolver.js).
 * Source of truth: PostgreSQL roles and permissions -> Laravel Sanctum -> GET /api/auth/me
 */

export const ROLES = {
  SUPER_ADMIN: ['Super Admin', 'Superadmin', 'super_admin'],
  ADMIN: ['Admin', 'admin'],
  YAYASAN: [
    'Yayasan',
    'Ketua Yayasan',
    'ketua_yayasan',
    'Pengurus Yayasan',
    'pengurus_yayasan',
    'Sekretaris Yayasan',
    'sekretaris_yayasan',
    'Bendahara Yayasan',
    'bendahara_yayasan',
    'Pengurus',
  ],
  DIVISI: [
    'Kepala Bidang Pendidikan',
    'Divisi Pendidikan',
    'divisi_pendidikan',
    'Divisi Kurikulum',
    'Divisi Kesiswaan',
    'Divisi Bahasa',
    'Divisi Program Khusus',
  ],
  KEPALA_SEKOLAH: ['Kepala Sekolah', 'kepala_sekolah', 'KepalaSekolah', 'kepsek'],
  WAKA_KURIKULUM: [
    'Wakil Kepala Sekolah',
    'Waka Kurikulum',
    'Wakil Kurikulum',
    'waka_kurikulum',
  ],
  WAKA_KESISWAAN: [
    'Waka Kesiswaan',
    'Wakil Kesiswaan',
    'waka_kesiswaan',
  ],
  TATA_USAHA: ['Tata Usaha', 'TU', 'tu', 'tata_usaha'],
  OPERATOR: ['Operator', 'operator'],
  GURU_TAHFIZH: ['Guru Tahfizh', 'guru_tahfizh'],
  MUSYRIF: [
    'Musyrif',
    'musyrif',
    'Musyrifah',
    'musyrifah',
    'Musyrif / Musyrifah',
    'Pengasuh',
    'Wali Asrama',
    'Pembimbing Asrama',
  ],
  GURU_BK: ['Guru BK', 'guru_bk'],
  WALI_KELAS: ['Wali Kelas', 'walas', 'wali_kelas'],
  GURU: [
    'Guru',
    'guru',
    'Guru Mata Pelajaran',
    'guru_mata_pelajaran',
    'Guru PAI',
    'Pembimbing',
    'Wali Kelas',
    'walas',
    'wali_kelas',
    'Guru Tahfizh',
    'guru_tahfizh',
    'Guru BK',
    'guru_bk',
    'Musyrif',
    'musyrif',
    'Musyrifah',
    'musyrifah',
    'Musyrif / Musyrifah',
  ],
  ORANG_TUA: ['Orang Tua', 'orang_tua', 'Orangtua', 'Wali Murid', 'parent'],
  SISWA: ['Siswa', 'siswa', 'student'],
  ALUMNI: ['Alumni', 'alumni'],
} as const;

export const normalizeRole = (role: unknown): string => {
  if (!role) return '';
  if (typeof role === 'object' && role !== null) {
    const item = role as { name?: string; nama?: string; role?: string };
    role = item.name || item.nama || item.role || '';
  }
  return String(role)
    .toLowerCase()
    .replace(/[\s_/-]+/g, '');
};

export const normalizedRoles = (roles: unknown[]): string[] =>
  (roles || []).map(normalizeRole).filter(Boolean);

export const hasAnyRole = (roles: unknown[], candidates: readonly string[] | string[]): boolean => {
  const normalizedUserRoles = new Set(normalizedRoles(roles));
  return candidates.some((candidate) => normalizedUserRoles.has(normalizeRole(candidate)));
};

// Role Predicates
export const isSuperAdminRole = (roles: unknown[]): boolean =>
  hasAnyRole(roles, ROLES.SUPER_ADMIN);

export const isAdminRole = (roles: unknown[]): boolean =>
  hasAnyRole(roles, ROLES.ADMIN);

export const isFoundationRole = (roles: unknown[]): boolean =>
  hasAnyRole(roles, ROLES.YAYASAN);

export const isDivisiRole = (roles: unknown[]): boolean =>
  hasAnyRole(roles, ROLES.DIVISI);

export const isPrincipalRole = (roles: unknown[]): boolean =>
  hasAnyRole(roles, ROLES.KEPALA_SEKOLAH);

export const isWakaKurikulumRole = (roles: unknown[]): boolean =>
  hasAnyRole(roles, ROLES.WAKA_KURIKULUM);

export const isWakaKesiswaanRole = (roles: unknown[]): boolean =>
  hasAnyRole(roles, ROLES.WAKA_KESISWAAN);

export const isTuRole = (roles: unknown[]): boolean =>
  hasAnyRole(roles, ROLES.TATA_USAHA);

export const isOperatorRole = (roles: unknown[]): boolean =>
  hasAnyRole(roles, ROLES.OPERATOR);

export const isTuOrKepsek = (roles: unknown[]): boolean =>
  hasAnyRole(roles, [...ROLES.TATA_USAHA, ...ROLES.KEPALA_SEKOLAH]);

export const isHomeroomRole = (roles: unknown[]): boolean =>
  hasAnyRole(roles, ROLES.WALI_KELAS);

export const isTahfizhTeacherRole = (roles: unknown[]): boolean =>
  hasAnyRole(roles, ROLES.GURU_TAHFIZH);

export const isMusyrifRole = (roles: unknown[]): boolean =>
  hasAnyRole(roles, ROLES.MUSYRIF);

export const isBkTeacherRole = (roles: unknown[]): boolean =>
  hasAnyRole(roles, ROLES.GURU_BK);

export const isTeacherRole = (roles: unknown[]): boolean =>
  hasAnyRole(roles, ROLES.GURU);

export const isParentRole = (roles: unknown[]): boolean =>
  hasAnyRole(roles, ROLES.ORANG_TUA);

export const isStudentRole = (roles: unknown[]): boolean =>
  hasAnyRole(roles, ROLES.SISWA);

export const isAlumniRole = (roles: unknown[]): boolean =>
  hasAnyRole(roles, ROLES.ALUMNI);

export const isStaffRole = (roles: unknown[]): boolean =>
  isSuperAdminRole(roles) ||
  isAdminRole(roles) ||
  isFoundationRole(roles) ||
  isDivisiRole(roles) ||
  isPrincipalRole(roles) ||
  isWakaKurikulumRole(roles) ||
  isWakaKesiswaanRole(roles) ||
  isTuRole(roles) ||
  isOperatorRole(roles) ||
  isTeacherRole(roles);

export const roleLabel = (roles: unknown[], fallback = 'Pengguna'): string => {
  if (isSuperAdminRole(roles)) return 'Super Admin';
  if (isFoundationRole(roles)) return 'Pengurus Yayasan';
  if (isPrincipalRole(roles)) return 'Kepala Sekolah';
  if (isDivisiRole(roles)) return 'Divisi Pendidikan';
  if (isWakaKurikulumRole(roles)) return 'Waka Kurikulum';
  if (isWakaKesiswaanRole(roles)) return 'Waka Kesiswaan';
  if (isTuRole(roles)) return 'Tata Usaha';
  if (isOperatorRole(roles)) return 'Operator';
  if (isHomeroomRole(roles)) return 'Wali Kelas';
  if (isTahfizhTeacherRole(roles)) return 'Guru Tahfizh';
  if (isMusyrifRole(roles)) return 'Musyrif / Pengasuh';
  if (isTeacherRole(roles)) return 'Guru / Pengajar';
  if (isParentRole(roles)) return 'Orang Tua';
  if (isStudentRole(roles)) return 'Siswa';
  if (isAlumniRole(roles)) return 'Alumni';

  const first = (roles || [])[0];
  if (first && typeof first === 'string') return first;
  return fallback;
};

export const homeLayoutKeyForRoles = (roles: unknown[]): string => {
  if (isSuperAdminRole(roles)) return 'super_admin';
  if (isFoundationRole(roles)) return 'foundation';
  if (isPrincipalRole(roles)) return 'principal';
  if (isTeacherRole(roles)) return 'teacher';
  if (isParentRole(roles)) return 'parent';
  if (isStudentRole(roles)) return 'student';
  return 'staff';
};

export const dashboardEndpointForRoles = (roles: unknown[]): string => {
  if (isSuperAdminRole(roles)) return '/dashboard/super-admin';
  if (isFoundationRole(roles)) return '/foundation/dashboard';
  if (isPrincipalRole(roles)) return '/dashboard/kepala-sekolah';
  if (isTeacherRole(roles)) return '/teacher/dashboard';
  if (hasAnyRole(roles, ROLES.TATA_USAHA)) return '/dashboard/tata-usaha';
  if (hasAnyRole(roles, ROLES.OPERATOR)) return '/dashboard/operator';
  if (hasAnyRole(roles, ROLES.WAKA_KURIKULUM)) return '/dashboard/waka-kurikulum';
  if (hasAnyRole(roles, ROLES.WAKA_KESISWAAN)) return '/dashboard/waka-kesiswaan';
  if (isParentRole(roles) || isStudentRole(roles)) return '/portal/dashboard';
  return '/employees/dashboard';
};

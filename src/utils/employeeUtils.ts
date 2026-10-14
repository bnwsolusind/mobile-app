/**
 * Utility functions for employee categorization in mobile-app.
 * Mirrors Laravel EmployeeService & KepalaSekolahDashboardService logic:
 * - Checks teacher relation, teachings array, metadata.teachings
 * - Checks status_pegawai for 'Guru' / 'Pendidik'
 * - Checks position name, jabatan, posisi for 'Guru', 'Pendidik', 'Wali Kelas', 'Pengajar', 'Tahfizh', 'Musyrif'
 * - Checks position level_jabatan (level 8 & 9 are teacher / academic levels in MasterJabatanSeeder)
 * - Checks roles and user.roles
 */

export const isEmployeeGuru = (item: any): boolean => {
  if (!item) return false;

  // Direct boolean/type indicators if available
  if (item.is_guru === true || item.is_guru === 1 || item.tipe_pegawai === 'guru') return true;

  // Model relations: teacher or teachings
  if (item.teacher || (Array.isArray(item.teachings) && item.teachings.length > 0)) return true;
  if (Array.isArray(item.metadata?.teachings) && item.metadata.teachings.length > 0) return true;

  // Employment status check
  const stPegawai = String(item.status_pegawai || '').toLowerCase();
  if (stPegawai.includes('guru') || stPegawai.includes('pendidik')) return true;

  // Position / Jabatan name check
  const posName = String(
    item.position?.name ||
    item.position?.nama ||
    item.jabatan?.nama ||
    item.jabatan ||
    item.posisi ||
    item.nama_jabatan ||
    ''
  ).toLowerCase();
  if (
    posName.includes('guru') ||
    posName.includes('pendidik') ||
    posName.includes('wali kelas') ||
    posName.includes('pengajar') ||
    posName.includes('tahfizh') ||
    posName.includes('musyrif')
  ) {
    return true;
  }

  // Level Jabatan (JBT-009, JBT-010, JBT-022, JBT-024, JBT-011, JBT-023 are level 8 & 9)
  const levelJabatan = Number(item.position?.level_jabatan ?? item.level_jabatan ?? 0);
  if (levelJabatan === 8 || levelJabatan === 9) {
    return true;
  }

  // Fallback name indicators
  const nama = String(item.nama_lengkap || item.name || '').toLowerCase();
  if (
    nama.includes('guru') ||
    nama.includes('wali kelas') ||
    nama.includes('ustadz') ||
    nama.includes('ustazah') ||
    nama.includes('ust.')
  ) {
    return true;
  }

  // Email indicators
  const email = String(item.email || item.user?.email || '').toLowerCase();
  if (email.includes('teacher') || email.includes('guru.')) return true;

  // Role checks
  if (Array.isArray(item.roles)) {
    if (
      item.roles.some((r: any) => {
        const rName = String(r.name || r).toLowerCase();
        return rName.includes('guru') || rName.includes('pendidik') || rName.includes('teacher');
      })
    ) {
      return true;
    }
  }
  if (Array.isArray(item.user?.roles)) {
    if (
      item.user.roles.some((r: any) => {
        const rName = String(r.name || r).toLowerCase();
        return rName.includes('guru') || rName.includes('pendidik') || rName.includes('teacher');
      })
    ) {
      return true;
    }
  }

  return false;
};

/**
 * Safely extracts a unit name string from an object, string, or mixed structure.
 * Prevents React rendering crashes when unit is an object (e.g. {id, name, code, level, ...}).
 */
export const resolveUnitName = (val: any): string | null => {
  if (!val) return null;
  if (typeof val === 'string' && val.trim().length > 0) return val.trim();
  if (typeof val === 'object') {
    if (typeof val.name === 'string' && val.name.trim().length > 0) return val.name.trim();
    if (typeof val.nama === 'string' && val.nama.trim().length > 0) return val.nama.trim();
    if (typeof val.nama_unit === 'string' && val.nama_unit.trim().length > 0) return val.nama_unit.trim();
    if (typeof val.unit_name === 'string' && val.unit_name.trim().length > 0) return val.unit_name.trim();
  }
  return null;
};

import { API_BASE_URL } from '../services/api';

export const DEFAULT_PARENT_AVATAR = require('../../assets/avatar_parent.jpg');
export const DEFAULT_STUDENT_BOY_AVATAR = require('../../assets/avatar_student_boy.png');
export const DEFAULT_STUDENT_GIRL_AVATAR = require('../../assets/avatar_student_girl.jpg');
export const SUPERVISI_GURU_ILLUSTRATION = require('../../assets/supervisi_guru.jpg');

export const resolveMediaUrl = (rawUrl?: string | null): string | null => {
  if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim() === '') return null;

  const cleanRawUrl = rawUrl.trim();
  const apiHost = API_BASE_URL.replace(/\/api\/?$/, '');

  if (cleanRawUrl.includes('data:image/')) {
    const idx = cleanRawUrl.indexOf('data:image/');
    return cleanRawUrl.slice(idx);
  }
  if (cleanRawUrl.startsWith('data:')) {
    return cleanRawUrl;
  }

  // Absolute URL (http:// or https://)
  if (cleanRawUrl.startsWith('http://') || cleanRawUrl.startsWith('https://')) {
    try {
      const parsed = new URL(cleanRawUrl);
      const isLocalOrPrivateHost =
        parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname === '10.0.2.2' ||
        parsed.hostname.startsWith('192.168.') ||
        parsed.hostname.startsWith('10.') ||
        parsed.hostname.startsWith('172.');

      // If pointing to local network / storage, map to current active apiHost
      if (isLocalOrPrivateHost || parsed.pathname.includes('/storage/')) {
        return `${apiHost}${parsed.pathname}${parsed.search}`;
      }
      return cleanRawUrl;
    } catch {
      return cleanRawUrl.replace(/^https?:\/\/[^/]+/i, apiHost);
    }
  }

  // Relative path stored in database (e.g. "students/photos/1.jpg" or "storage/..." or "/storage/...")
  let cleanPath = cleanRawUrl.startsWith('/') ? cleanRawUrl : `/${cleanRawUrl}`;
  if (!cleanPath.startsWith('/storage/')) {
    cleanPath = `/storage${cleanPath}`;
  }
  return `${apiHost}${cleanPath}`;
};

export const getProfileImageUrl = (user: any, dashboard?: any): string | null => {
  if (!user && !dashboard) return null;

  const rawUrl =
    user?.photo_url ||
    user?.avatar_url ||
    user?.profile_photo_url ||
    user?.avatar ||
    user?.foto_url ||
    user?.foto ||
    user?.photo ||
    user?.photo_thumb ||
    user?.image ||
    user?.metadata?.photo ||
    user?.metadata?.foto ||
    user?.metadata?.photo_url ||
    user?.metadata?.avatar_url ||
    user?.metadata?.avatar ||
    user?.employee?.foto_url ||
    user?.employee?.foto ||
    user?.employee?.avatar ||
    user?.parent?.photo_url ||
    user?.parent?.avatar_url ||
    user?.parent?.foto ||
    user?.parent?.photo ||
    user?.parent?.avatar ||
    user?.parent?.metadata?.photo ||
    user?.parent?.metadata?.foto ||
    user?.parent?.metadata?.avatar ||
    user?.student?.foto_url ||
    user?.student?.foto ||
    user?.student?.photo ||
    user?.student?.photo_url ||
    user?.student?.avatar ||
    user?.student?.metadata?.photo ||
    dashboard?.user?.photo_url ||
    dashboard?.user?.avatar_url ||
    dashboard?.user?.avatar ||
    dashboard?.parent?.photo_url ||
    dashboard?.parent?.avatar_url ||
    dashboard?.parent?.foto ||
    dashboard?.parent?.photo ||
    dashboard?.employee?.foto_url ||
    dashboard?.employee?.foto ||
    dashboard?.student?.foto_url ||
    dashboard?.student?.foto ||
    dashboard?.student?.photo ||
    dashboard?.student?.photo_url ||
    dashboard?.student?.metadata?.photo ||
    null;

  return resolveMediaUrl(rawUrl);
};

export const isGirlStudent = (student: any): boolean => {
  if (!student) return false;
  const rawGender = String(
    student.gender ||
    student.jenis_kelamin ||
    student.sex ||
    student.student?.gender ||
    student.student?.jenis_kelamin ||
    ''
  ).toLowerCase().trim();

  if (
    rawGender === 'p' ||
    rawGender === 'female' ||
    rawGender === 'perempuan' ||
    rawGender === 'wanita' ||
    rawGender.startsWith('peremp') ||
    rawGender.startsWith('fem')
  ) {
    return true;
  }

  if (
    rawGender === 'l' ||
    rawGender === 'male' ||
    rawGender === 'laki-laki' ||
    rawGender === 'pria' ||
    rawGender.startsWith('lak')
  ) {
    return false;
  }

  // Fallback deteksi nama santri perempuan Indonesia jika gender kosong / tidak terekam
  const name = String(
    student.name ||
    student.full_name ||
    student.nama_lengkap ||
    student.nama ||
    student.student?.full_name ||
    ''
  ).toLowerCase();

  const femaleKeywords = [
    'putri', 'alya', 'zahra', 'zahrah', 'siti', 'nur', 'aisyah', 'fatimah',
    'khadijah', 'anisa', 'annisa', 'safira', 'adiba', 'nayla', 'salma', 'azzahra',
    'cantika', 'bilqis', 'hana', 'hasna', 'nadia', 'syifa', 'rahma', 'ayu'
  ];

  return femaleKeywords.some((keyword) => name.includes(keyword));
};

export const getStudentAvatarSource = (student: any) => {
  const customPhoto = getProfileImageUrl(student);
  if (customPhoto) {
    return { uri: customPhoto };
  }
  return isGirlStudent(student) ? DEFAULT_STUDENT_GIRL_AVATAR : DEFAULT_STUDENT_BOY_AVATAR;
};

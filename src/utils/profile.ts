import { API_BASE_URL } from '../services/api';

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
    user?.image ||
    user?.metadata?.photo ||
    user?.metadata?.foto ||
    user?.metadata?.photo_url ||
    user?.metadata?.avatar_url ||
    user?.employee?.foto_url ||
    user?.employee?.foto ||
    user?.employee?.avatar ||
    user?.student?.foto_url ||
    user?.student?.foto ||
    user?.student?.photo ||
    user?.student?.photo_url ||
    user?.student?.avatar ||
    user?.student?.metadata?.photo ||
    dashboard?.user?.photo_url ||
    dashboard?.user?.avatar_url ||
    dashboard?.user?.avatar ||
    dashboard?.employee?.foto_url ||
    dashboard?.employee?.foto ||
    dashboard?.student?.foto_url ||
    dashboard?.student?.foto ||
    dashboard?.student?.photo ||
    dashboard?.student?.photo_url ||
    dashboard?.student?.metadata?.photo ||
    null;

  if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim() === '') return null;

  const cleanRawUrl = rawUrl.trim();
  const apiHost = API_BASE_URL.replace(/\/api\/?$/, '');

  // If already an absolute URL (http://, https://, or data URI)
  if (cleanRawUrl.startsWith('http://') || cleanRawUrl.startsWith('https://') || cleanRawUrl.startsWith('data:')) {
    // Replace localhost or 127.0.0.1 with API server host so Android device/emulator can resolve it
    return cleanRawUrl.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, apiHost);
  }

  // Relative path stored in database (e.g. "students/photos/1.jpg" or "storage/..." or "/storage/...")
  let cleanPath = cleanRawUrl.startsWith('/') ? cleanRawUrl : `/${cleanRawUrl}`;
  if (!cleanPath.startsWith('/storage/')) {
    cleanPath = `/storage${cleanPath}`;
  }
  return `${apiHost}${cleanPath}`;
};

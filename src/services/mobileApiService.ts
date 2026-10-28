import { api } from './api';
import { dashboardEndpointForRoles } from '../utils/roles';

export interface AttendancePayload {
  student_id?: string;
  employee_id?: string;
  tipe_presensi?: 'Siswa' | 'Pegawai';
  status?: string;
  attendance_method?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  keterangan?: string;
  attendance_date?: string;
  class_id?: string;
  unit_pendidikan_id?: string;
  academic_year_id?: string;
  semester_id?: string;
  metadata?: Record<string, unknown>;
}

export interface TahfizhPayload {
  student_id: string;
  juz: number;
  surah: string;
  ayat_mulai: number;
  ayat_selesai: number;
  nilai: 'Mumtaz' | 'Jayyid Jiddan' | 'Jayyid' | 'Maqbul';
  catatan?: string;
}

export type ListParams = Record<string, string | number | boolean | undefined>;

const childRequest = (childId?: string) => (childId ? {
  params: { child_id: childId },
  headers: { 'X-Child-Id': childId },
} : undefined);

export const unwrapApiData = <T = any>(response: any): T => (
  response?.data?.data ?? response?.data ?? response
);

export const unwrapCollection = <T = any>(response: any): T[] => {
  const payload = response?.data ?? response;
  if (Array.isArray(payload)) return payload as T[];
  if (Array.isArray(payload?.data)) return payload.data as T[];
  return [];
};

export const mobileApiService = {
  login: async (
    identifier: string,
    password: string,
  ) => {
    const trimmed = identifier.trim();
    return (await api.post('/auth/login', {
      identifier: trimmed,
      email: trimmed,
      password,
      device_name: 'sims-mobile',
    })).data;
  },

  logout: async () => (await api.post('/auth/logout')).data,

  getNotifications: async (params: ListParams = {}) => (
    await api.get('/notifications', { params })
  ).data,
  getUnreadNotificationCount: async () => (
    await api.get('/notifications/unread-count')
  ).data,
  markNotificationRead: async (id: string) => (
    await api.post(`/notifications/${id}/read`)
  ).data,
  markAllNotificationsRead: async (payload?: { child_id?: string }) => (
    await api.post('/notifications/mark-all-read', payload)
  ).data,

  getProfile: async () => (await api.get('/auth/profile')).data,
  getManagedProfile: async () => (await api.get('/profile')).data,
  updateProfile: async (payload: Record<string, unknown>) => (
    await api.put('/profile', payload)
  ).data,
  updateAvatar: async (formData: FormData) => (
    await api.post('/profile/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  ).data,
  changePassword: async (payload: {
    current_password: string;
    password: string;
    password_confirmation: string;
  }) => (await api.put('/profile/password', payload)).data,

  getRoleDashboard: async (roles: string[]) => {
    const response = await api.get(dashboardEndpointForRoles(roles));
    return response.data;
  },

  getDashboard: async () => (await api.get('/dashboard')).data,
  getFoundationDashboard: async (params: ListParams = {}) => (
    await api.get('/foundation/dashboard', { params })
  ).data,
  getPrincipalDashboard: async (params: ListParams = {}) => (
    await api.get('/dashboard/kepala-sekolah', { params })
  ).data,
  submitPrincipalMonthlyReport: async (payload: Record<string, unknown>) => (
    await api.post('/dashboard-pemantauan/laporan-bulanan', payload)
  ).data,
  getPrincipalMonthlyReports: async (params: ListParams = {}) => (
    await api.get('/dashboard-pemantauan/laporan-bulanan', { params })
  ).data,
  getStudentAchievements: async (params: ListParams = {}) => (
    await api.get('/dashboard-pemantauan/rekap-prestasi-siswa', { params })
  ).data,
  getRekapPrestasiSiswa: async (params: ListParams = {}) => (
    await api.get('/dashboard-pemantauan/rekap-prestasi-siswa', { params })
  ).data,
  getTeacherMonitoring: async (params: ListParams = {}) => (
    await api.get('/teacher-monitoring', { params })
  ).data,
  createStudentAchievement: async (payload: Record<string, unknown>) => (
    await api.post('/dashboard-pemantauan/rekap-prestasi-siswa', payload)
  ).data,
  verifyStudentAchievement: async (id: string, payload: Record<string, unknown>) => (
    await api.put(`/dashboard-pemantauan/rekap-prestasi-siswa/${id}`, payload)
  ).data,
  deleteStudentAchievement: async (id: string) => (
    await api.delete(`/dashboard-pemantauan/rekap-prestasi-siswa/${id}`)
  ).data,
  getTataUsahaDashboard: async (params: ListParams = {}) => (
    await api.get('/dashboard/tata-usaha', { params })
  ).data,
  getTataUsahaKpiDetail: async (type: string, params: ListParams = {}) => (
    await api.get(`/dashboard/tata-usaha/kpi/${type}`, { params })
  ).data,

  // Enterprise master data
  getEmployees: async (params: ListParams = {}) => (
    await api.get('/employees', { params })
  ).data,
  getEmployee: async (id: string) => (await api.get(`/employees/${id}`)).data,
  getEmployeeDashboard: async (params: ListParams = {}) => (
    await api.get('/employees/dashboard', { params })
  ).data,
  getEmployeePositions: async () => (await api.get('/employees/positions')).data,
  createEmployee: async (payload: Record<string, unknown>) => (
    await api.post('/employees', payload)
  ).data,
  updateEmployee: async (id: string, payload: Record<string, unknown>) => (
    await api.put(`/employees/${id}`, payload)
  ).data,
  deleteEmployee: async (id: string) => (await api.delete(`/employees/${id}`)).data,

  getStudents: async (params: ListParams = {}) => (
    await api.get('/students', { params })
  ).data,
  getStudent: async (id: string) => (await api.get(`/students/${id}`)).data,
  getStudentDashboard: async (params: ListParams = {}) => (
    await api.get('/students/dashboard', { params })
  ).data,
  createStudent: async (payload: Record<string, unknown>) => (
    await api.post('/students', payload)
  ).data,
  updateStudent: async (id: string, payload: Record<string, unknown>) => (
    await api.put(`/students/${id}`, payload)
  ).data,
  deleteStudent: async (id: string) => (await api.delete(`/students/${id}`)).data,

  // Alumni & Kelulusan
  getAlumni: async (params: ListParams = {}) => (
    await api.get('/alumni', { params })
  ).data,
  getAlumniStats: async () => (
    await api.get('/alumni/stats')
  ).data,

  // Academic Years
  getAcademicYears: async () => (await api.get('/tahun-ajaran/dropdown')).data,

  // Student Mutations (Two-Way Handshake Pindah Unit Internal & Pindah Keluar)
  getStudentMutations: async (params: ListParams = {}) => (
    await api.get('/student-mutations', { params })
  ).data,
  getIncomingMutations: async (params: ListParams = {}) => (
    await api.get('/student-mutations/incoming', { params })
  ).data,
  requestStudentMutation: async (payload: Record<string, unknown>) => (
    await api.post('/student-mutations', payload)
  ).data,
  approveStudentMutation: async (id: string, payload: Record<string, unknown>) => (
    await api.post(`/student-mutations/${id}/approve`, payload)
  ).data,
  rejectStudentMutation: async (id: string, payload: Record<string, unknown>) => (
    await api.post(`/student-mutations/${id}/reject`, payload)
  ).data,

  getEducationUnits: async (params: ListParams = {}) => (
    await api.get('/education-units', { params })
  ).data,
  createEducationUnit: async (payload: Record<string, unknown>) => (
    await api.post('/education-units', payload)
  ).data,
  updateEducationUnit: async (id: string, payload: Record<string, unknown>) => (
    await api.put(`/education-units/${id}`, payload)
  ).data,
  deleteEducationUnit: async (id: string) => (
    await api.delete(`/education-units/${id}`)
  ).data,

  getClasses: async (params: ListParams = {}) => (await api.get('/kelas', { params })).data,
  getClass: async (id: string) => (await api.get(`/kelas/${id}`)).data,
  getKelasOptions: async () => (await api.get('/kelas/options')).data,
  getClassStudents: async (id: string) => (await api.get(`/kelas/${id}/siswa`)).data,
  createClass: async (payload: Record<string, unknown>) => (await api.post('/kelas', payload)).data,
  updateClass: async (id: string, payload: Record<string, unknown>) => (await api.put(`/kelas/${id}`, payload)).data,
  deleteClass: async (id: string) => (await api.delete(`/kelas/${id}`)).data,

  // Master Jabatan (Posisi / Level Jabatan)
  getJabatanList: async (params: ListParams = {}) => (await api.get('/jabatan', { params })).data,
  getJabatan: async (id: string) => (await api.get(`/jabatan/${id}`)).data,
  createJabatan: async (payload: Record<string, unknown>) => (await api.post('/jabatan', payload)).data,
  updateJabatan: async (id: string, payload: Record<string, unknown>) => (await api.put(`/jabatan/${id}`, payload)).data,
  deleteJabatan: async (id: string) => (await api.delete(`/jabatan/${id}`)).data,

  // Foundation read-only monitoring endpoints
  getFoundationUnits: async (params: ListParams = {}) => (
    await api.get('/foundation/units', { params })
  ).data,
  getFoundationEmployees: async (params: ListParams = {}) => (
    await api.get('/foundation/employees', { params })
  ).data,
  getFoundationStudents: async (params: ListParams = {}) => (
    await api.get('/foundation/students', { params })
  ).data,
  getFoundationTeachers: async (params: ListParams = {}) => (
    await api.get('/foundation/teachers', { params })
  ).data,
  getFoundationClasses: async (params: ListParams = {}) => (
    await api.get('/foundation/classes', { params })
  ).data,
  getSchoolInformation: async (params: ListParams = {}) => (
    await api.get('/foundation/information', { params })
  ).data,

  // Attendance
  checkIn: async (payload: AttendancePayload | FormData) => {
    if (typeof FormData !== 'undefined' && payload instanceof FormData) {
      return (
        await api.post('/attendance/checkin', payload, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      ).data;
    }
    return (await api.post('/attendance/checkin', payload)).data;
  },
  checkOut: async (payload: AttendancePayload & { attendance_id?: string }) => (
    await api.post('/attendance/checkout', payload)
  ).data,
  getAttendanceReport: async (params: ListParams = {}) => (
    await api.get('/attendance/report', { params })
  ).data,
  getAttendanceStats: async (params: ListParams = {}) => (
    await api.get('/attendance/stats', { params })
  ).data,

  // Presensi Pembelajaran (Lesson Attendance KBM Guru)
  getActiveLessonSchedules: async () => (
    await api.get('/lesson-attendance/active-schedules')
  ).data,
  getMyLessonSchedules: async (params: ListParams = {}) => (
    await api.get('/lesson-attendance/my-schedules', { params })
  ).data,
  getLessonScheduleStudents: async (scheduleId: string | number, params: { date?: string } = {}) => (
    await api.get(`/lesson-attendance/my-schedules/${scheduleId}/students`, { params })
  ).data,
  startLessonAttendanceSession: async (payload: { schedule_id: string | number; attendance_date?: string }) => (
    await api.post('/lesson-attendance/sessions', payload)
  ).data,
  identifyStudentCard: async (method: 'qr' | 'rfid', payload: { schedule_id: string | number; identifier: string }) => (
    await api.post(`/lesson-attendance/identify-card/${method}`, payload)
  ).data,
  scanLessonAttendance: async (sessionId: string | number, method: 'qr' | 'barcode' | 'rfid', payload: { identifier: string }) => (
    await api.post(`/lesson-attendance/sessions/${sessionId}/scan/${method}`, payload)
  ).data,
  submitManualLessonAttendance: async (sessionId: string | number, payload: { student_id: string | number; status: string; notes?: string }) => (
    await api.post(`/lesson-attendance/sessions/${sessionId}/manual-check`, payload)
  ).data,

  // Gate attendance (Absensi Gerbang Masuk & Pulang)
  scanGateIn: async (payload: {
    qr_token?: string;
    nis?: string;
    student_id?: string;
    attendance_method?: string;
    latitude?: number;
    longitude?: number;
    location?: string;
    notes?: string;
  }) => (
    await api.post('/gate-attendance/scan-in', {
      attendance_method: 'QRCODE',
      ...payload,
    })
  ).data,
  scanGateOut: async (payload: {
    qr_token?: string;
    nis?: string;
    student_id?: string;
    attendance_method?: string;
    is_early?: boolean;
    pickup_person?: string;
    pickup_relation?: string;
    pickup_verification?: string;
    notes?: string;
    latitude?: number;
    longitude?: number;
    location?: string;
  }) => (
    await api.post('/gate-attendance/scan-out', {
      attendance_method: 'QRCODE',
      ...payload,
    })
  ).data,
  getGateLogs: async (params: ListParams = {}) => (
    await api.get('/gate-attendance/logs', { params })
  ).data,
  getGateStats: async (params: Record<string, any> = {}) => (
    await api.get('/gate-attendance/stats', { params })
  ).data,

  // Teacher & Unit portal
  getTeacherDashboard: async () => (await api.get('/teacher/dashboard')).data,
  getTeacherSchedules: async (params: ListParams = {}) => (
    await api.get('/teacher/schedules', { params })
  ).data,
  getUnitSchedules: async (params: ListParams = {}) => (
    await api.get('/schedules', { params })
  ).data,
  getScheduleOptions: async () => (
    await api.get('/schedules-options')
  ).data,
  createSchedule: async (payload: Record<string, unknown>) => (
    await api.post('/schedules', payload)
  ).data,
  updateSchedule: async (id: string, payload: Record<string, unknown>) => (
    await api.put(`/schedules/${id}`, payload)
  ).data,
  deleteSchedule: async (id: string) => (
    await api.delete(`/schedules/${id}`)
  ).data,
  checkScheduleConflict: async (payload: Record<string, unknown>) => (
    await api.post('/schedules/check-conflict', payload)
  ).data,
  getScheduleAvailability: async (params: Record<string, unknown> = {}) => (
    await api.get('/schedules/availability', { params })
  ).data,
  getExamSchedules: async (params: ListParams = {}) => (
    await api.get('/exam-schedules', { params })
  ).data,
  getExamCategories: async (params: ListParams = {}) => (
    await api.get('/exam-categories', { params })
  ).data,
  getExamScheduleOptions: async (params: Record<string, unknown> = {}) => (
    await api.get('/exam-schedules-options', { params })
  ).data,
  createExamSchedule: async (payload: Record<string, unknown>) => (
    await api.post('/exam-schedules', payload)
  ).data,
  updateExamSchedule: async (id: string, payload: Record<string, unknown>) => (
    await api.put(`/exam-schedules/${id}`, payload)
  ).data,
  deleteExamSchedule: async (id: string) => (
    await api.delete(`/exam-schedules/${id}`)
  ).data,
  getTeacherClasses: async () => (await api.get('/teacher/classes')).data,
  getTeacherStudents: async (params: ListParams = {}) => (
    await api.get('/teacher/students', { params })
  ).data,
  getTeacherMaterials: async (params: ListParams = {}) => (
    await api.get('/teacher/materials', { params })
  ).data,
  getTeacherModulAjar: async (params: ListParams = {}) => (
    await api.get('/lms/modul-ajar', { params })
  ).data,
  getTeacherModulAjarDetail: async (id: string) => (
    await api.get(`/lms/modul-ajar/${id}`)
  ).data,
  createTeacherMaterial: async (payload: Record<string, unknown> | FormData) => (
    await api.post('/teacher/materials', payload, {
      headers: payload instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : undefined,
    })
  ).data,
  updateTeacherMaterial: async (id: string, payload: Record<string, unknown> | FormData) => {
    if (payload instanceof FormData) {
      return (
        await api.post(`/teacher/materials/${id}?_method=PUT`, payload, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      ).data;
    }
    return (await api.put(`/teacher/materials/${id}`, payload)).data;
  },
  deleteTeacherMaterial: async (id: string) => (
    await api.delete(`/teacher/materials/${id}`)
  ).data,
  getTeacherAssignments: async (params: ListParams = {}) => (
    await api.get('/teacher/assignments', { params })
  ).data,
  createTeacherAssignment: async (payload: Record<string, unknown> | FormData) => (
    await api.post('/teacher/assignments', payload, {
      headers: payload instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : undefined,
    })
  ).data,
  updateTeacherAssignment: async (id: string, payload: Record<string, unknown> | FormData) => (
    await api.post(`/teacher/assignments/${id}`, payload, {
      headers: payload instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : undefined,
    })
  ).data,
  deleteTeacherAssignment: async (id: string) => (
    await api.delete(`/teacher/assignments/${id}`)
  ).data,
  getTeacherStudentNotes: async (params: ListParams = {}) => (
    await api.get('/teacher/student-notes', { params })
  ).data,
  getTeacherTahfizh: async (params: ListParams = {}) => (
    await api.get('/teacher/tahfizh', { params })
  ).data,
  createTeacherTahfizh: async (payload: Record<string, unknown>) => (
    await api.post('/teacher/tahfizh', payload)
  ).data,
  getLastHafalan: async (studentId: string) => (
    await api.get(`/tahfizh/last-hafalan/${studentId}`)
  ).data,
  getTahfizhWeeklySheet: async (studentId: string, startDate?: string) => (
    await api.get('/tahfizh/weekly-sheet', { params: { student_id: studentId, start_date: startDate } })
  ).data,
  getTahfizhStudentProgress: async (studentId: string) => (
    await api.get(`/tahfizh/student-progress/${studentId}`)
  ).data,
  getTeacherGrades: async (params: ListParams = {}) => (
    await api.get('/teacher/grades', { params })
  ).data,
  saveTeacherGrades: async (payload: Record<string, unknown>) => (
    await api.post('/teacher/grades', payload)
  ).data,
  getTeacherMutabaah: async (params: ListParams = {}) => (
    await api.get('/teacher/mutabaah', { params })
  ).data,
  verifyTeacherMutabaah: async (id: string) => (
    await api.post(`/teacher/mutabaah/${id}/verify`)
  ).data,
  getMutabaahDailyContext: async (params: Record<string, any> = {}) => (
    await api.get('/mutabaah/daily/context', { params })
  ).data,
  getMutabaahDailyStudents: async (params: Record<string, any> = {}) => (
    await api.get('/mutabaah/daily/students', { params })
  ).data,
  getMutabaahDailyStudentDetail: async (studentId: string, params: Record<string, any> = {}) => (
    await api.get(`/mutabaah/daily/${studentId}`, { params })
  ).data,
  saveMutabaahDailyCell: async (payload: Record<string, any>) => (
    await api.post('/mutabaah/daily/save-cell', payload)
  ).data,
  finalizeMutabaahDailyStudent: async (payload: Record<string, any>) => (
    await api.post('/mutabaah/daily/finalize-student', payload)
  ).data,
  verifyMutabaahHome: async (payload: Record<string, any>) => (
    await api.post('/mutabaah/daily/verify-home', payload)
  ).data,
  getTeacherSubmissions: async (params: ListParams = {}) => (
    await api.get('/teacher/submissions', { params })
  ).data,
  gradeTeacherSubmission: async (id: string, payload: Record<string, unknown>) => (
    await api.post(`/teacher/submissions/${id}/grade`, payload)
  ).data,
  createTeacherStudentNote: async (payload: Record<string, unknown>) => (
    await api.post('/teacher/student-notes', payload)
  ).data,
  updateTeacherStudentNote: async (id: string, payload: Record<string, unknown>) => (
    await api.put(`/teacher/student-notes/${id}`, payload)
  ).data,
  deleteTeacherStudentNote: async (id: string) => (
    await api.delete(`/teacher/student-notes/${id}`)
  ).data,

  // Student card settings from web-dashboard
  getStudentCardSetting: async (educationUnitId?: string) => (
    await api.get('/student-card-settings', {
      params: educationUnitId ? { education_unit_id: educationUnitId } : {},
    })
  ).data,

  // Parent and student portal
  getPortalChildren: async () => (await api.get('/portal/children')).data,
  getPortalDashboard: async (childId?: string) => (
    await api.get('/portal/dashboard', childRequest(childId))
  ).data,
  getTodayLiveTimeline: async (childId?: string, date?: string) => {
    const params: Record<string, string> = {};
    if (childId) params.child_id = childId;
    if (date) params.date = date;
    const headers: Record<string, string> = {};
    if (childId) headers['X-Child-Id'] = childId;
    return (await api.get('/portal/today-live-timeline', { params, headers })).data;
  },
  getPortalProfile: async (childId?: string) => (
    await api.get('/portal/profile', childRequest(childId))
  ).data,
  getPortalResource: async (resource: string, childId?: string) => (
    await api.get(`/portal/${resource}`, childRequest(childId))
  ).data,
  getPortalAttendance: async (childId?: string) => (
    await api.get('/portal/attendance', childRequest(childId))
  ).data,
  getPortalGateAttendanceToday: async (childId?: string) => (
    await api.get('/portal/gate-attendance/today', childRequest(childId))
  ).data,
  tapPortalGateAttendance: async (payload: {
    child_id?: string;
    type?: 'in' | 'out' | 'auto';
    latitude?: number;
    longitude?: number;
    location?: string;
    notes?: string;
  }) => (
    await api.post('/portal/gate-attendance/tap', payload)
  ).data,
  getPortalAttendanceQr: async (childId?: string) => (
    await api.get('/portal/attendance-qr', childRequest(childId))
  ).data,
  getPortalPermissions: async (childId?: string) => (
    await api.get('/portal/permissions', childRequest(childId))
  ).data,
  getDormitoryPermits: async (childId?: string) => (
    await api.get('/portal/dormitory-permits', childRequest(childId))
  ).data,
  applyDormitoryPermit: async (payload: {
    child_id: string;
    permit_type: string;
    scheduled_departure_at: string;
    scheduled_return_at: string;
    guardian_name: string;
    guardian_phone: string;
    guardian_relation: string;
    destination?: string;
    notes?: string;
    medical_complaint?: string;
    medical_destination?: string;
    medical_escort_name?: string;
  }) => (
    await api.post('/portal/dormitory-permits/apply', payload)
  ).data,
  requestDormitoryExtension: async (permitId: string, payload: { requested_return_at: string; reason: string }) => (
    await api.post(`/portal/dormitory-permits/${permitId}/request-extension`, payload)
  ).data,
  getAcademicCalendar: async (params?: { range?: string; date?: string; child_id?: string }) => (
    await api.get('/portal/academic-calendar', {
      params,
      headers: params?.child_id ? { 'X-Child-Id': params.child_id } : undefined,
    })
  ).data,
  getPortalSchedules: async (
    params: { child_id?: string; date?: string; month?: string; academic_year?: string } = {},
    options?: { signal?: AbortSignal },
  ) => (
    await api.get('/portal/schedules', {
      params,
      headers: params?.child_id ? { 'X-Child-Id': params.child_id } : undefined,
      signal: options?.signal,
    })
  ).data,
  getPortalGrades: async (
    childId?: string,
    params?: { semester?: string; academic_year?: string; semester_id?: string; academic_year_id?: string },
  ) => {
    const childConfig = childRequest(childId);
    return (await api.get('/portal/grades', {
      ...(childConfig || {}),
      params: {
        ...(childConfig?.params || {}),
        ...(params || {}),
      },
    })).data;
  },
  getPortalStudentNotes: async (childId?: string, page = 1) => {
    const childConfig = childRequest(childId);
    return (await api.get('/portal/student-notes', {
      ...(childConfig || {}),
      params: { ...(childConfig?.params || {}), page },
    })).data;
  },
  getPortalBills: async (childId?: string, page = 1) => {
    const childConfig = childRequest(childId);
    return (await api.get('/portal/bills', {
      ...(childConfig || {}),
      params: { ...(childConfig?.params || {}), page },
    })).data;
  },
  getFinanceStats: async (params?: Record<string, any>) => (
    await api.get('/finance/stats', { params })
  ).data,
  getFinanceBills: async (params?: Record<string, any>) => (
    await api.get('/finance/bills', { params })
  ).data,
  getFinanceFeeCategories: async () => (
    await api.get('/finance/fee-categories')
  ).data,
  signPortalStudentNote: async (noteId: string, childId: string, followUp?: string) => (
    await api.post(`/portal/student-notes/${noteId}/sign`, {
      child_id: childId,
      ...(followUp?.trim() ? { follow_up: followUp.trim() } : {}),
    }, childRequest(childId))
  ).data,
  getPortalTahfizhAchievement: async (studentId: string) => (
    await api.get(`/portal/children/${studentId}/tahfizh-achievement`)
  ).data,
  getPortalMutabaah: async (childId?: string, date?: string) => {
    const childConfig = childRequest(childId);

    return (await api.get('/portal/mutabaah', {
      ...(childConfig || {}),
      params: { ...(childConfig?.params || {}), ...(date ? { date } : {}) },
    })).data;
  },
  getParentMutabaahOverview: async (studentId: string, date?: string) => (
    await api.get(`/parent/mutabaah/${studentId}`, { params: date ? { date } : {} })
  ).data,
  getParentMutabaahHistory: async (studentId: string, params: Record<string, any> = {}) => (
    await api.get(`/parent/mutabaah/${studentId}/history`, { params })
  ).data,
  submitParentMutabaahSignature: async (dailyHeaderId: string, payload: { signature_status: string; comment?: string; pin?: string }) => (
    await api.post(`/parent/mutabaah/${dailyHeaderId}/signature`, payload)
  ).data,
  getParentWorshipInputContext: async (studentId: string, date?: string) => (
    await api.get(`/portal/children/${studentId}/worship-input`, { params: date ? { date } : {} })
  ).data,
  submitParentWorshipInput: async (studentId: string, payload: { date: string; items: any[] }) => (
    await api.post(`/portal/children/${studentId}/worship-input`, payload)
  ).data,
  getPortalMaterials: async (params: Record<string, any> = {}) => (
    await api.get('/portal/materials', { params })
  ).data,
  getPortalTahfizh: async (params: Record<string, any> = {}) => (
    await api.get('/portal/tahfizh', { params })
  ).data,
  getPortalExamGrids: async (childId?: string, params: Record<string, any> = {}) => {
    const childConfig = childRequest(childId);
    return (
      await api.get('/portal/exam-grids', {
        ...(childConfig || {}),
        params: { ...(childConfig?.params || {}), ...params },
      })
    ).data;
  },
  getPortalBankSoal: async (childId?: string, params: Record<string, any> = {}) => {
    const childConfig = childRequest(childId);
    return (
      await api.get('/portal/bank-soal', {
        ...(childConfig || {}),
        params: { ...(childConfig?.params || {}), ...params },
      })
    ).data;
  },
  getPortalCbtExams: async (childId?: string) => {
    const childConfig = childRequest(childId);
    return (
      await api.get('/portal/lms/exams', {
        ...(childConfig || {}),
      })
    ).data;
  },
  startPortalCbtExam: async (examId: string, childId?: string) => (
    await api.post(`/portal/lms/exams/${examId}/start`, { ...(childId ? { child_id: childId } : {}) })
  ).data,
  savePortalCbtAnswers: async (sessionId: string, answers: any[]) => (
    await api.post(`/portal/lms/exam-sessions/${sessionId}/answers`, { jawaban: answers })
  ).data,
  finishPortalCbtExam: async (sessionId: string, answers?: any[]) => (
    await api.post(`/portal/lms/exam-sessions/${sessionId}/finish`, { ...(answers ? { jawaban: answers } : {}) })
  ).data,
  getTeacherExamGrids: async (params: Record<string, any> = {}) => (
    await api.get('/lms/kisi-kisi', { params })
  ).data,
  getTeacherExamGridStats: async () => (
    await api.get('/lms/kisi-kisi/stats')
  ).data,
  getTeacherExamGridOptions: async (params: Record<string, any> = {}) => (
    await api.get('/lms/kisi-kisi/options', { params })
  ).data,
  createTeacherExamGrid: async (payload: Record<string, any>) => (
    await api.post('/lms/kisi-kisi', payload)
  ).data,
  updateTeacherExamGrid: async (id: string, payload: Record<string, any>) => (
    await api.put(`/lms/kisi-kisi/${id}`, payload)
  ).data,
  deleteTeacherExamGrid: async (id: string) => (
    await api.delete(`/lms/kisi-kisi/${id}`)
  ).data,
  duplicateTeacherExamGrid: async (id: string) => (
    await api.post(`/lms/kisi-kisi/${id}/duplicate`)
  ).data,
  getTeacherBankSoal: async (params: Record<string, any> = {}) => (
    await api.get('/lms/bank-soal', { params })
  ).data,
  getTeacherBankSoalOptions: async (params: Record<string, any> = {}) => (
    await api.get('/lms/bank-soal/options', { params })
  ).data,
  createTeacherBankSoal: async (payload: Record<string, any>) => (
    await api.post('/lms/bank-soal', payload)
  ).data,
  updateTeacherBankSoal: async (id: string, payload: Record<string, any>) => (
    await api.put(`/lms/bank-soal/${id}`, payload)
  ).data,
  deleteTeacherBankSoal: async (id: string) => (
    await api.delete(`/lms/bank-soal/${id}`)
  ).data,
  duplicateTeacherBankSoal: async (id: string) => (
    await api.post(`/lms/bank-soal/${id}/duplicate`)
  ).data,
  getTeacherCbtExams: async (params: Record<string, any> = {}) => (
    await api.get('/lms/ujian', { params })
  ).data,
  getTeacherCbtStats: async (params: Record<string, any> = {}) => (
    await api.get('/lms/ujian/stats', { params })
  ).data,
  getTeacherCbtOptions: async (params: Record<string, any> = {}) => (
    await api.get('/lms/ujian/options', { params })
  ).data,
  getTeacherCbtResults: async (id: string) => (
    await api.get(`/lms/ujian/${id}/results`)
  ).data,
  togglePublishTeacherCbt: async (id: string, status: string) => (
    await api.post(`/lms/ujian/${id}/toggle-publish`, { status })
  ).data,
  createTeacherCbtExam: async (payload: Record<string, any>) => (
    await api.post('/lms/ujian', payload)
  ).data,
  updateTeacherCbtExam: async (id: string, payload: Record<string, any>) => (
    await api.put(`/lms/ujian/${id}`, payload)
  ).data,
  deleteTeacherCbtExam: async (id: string) => (
    await api.delete(`/lms/ujian/${id}`)
  ).data,
  getTeacherAcademicCalendar: async (params: Record<string, any> = {}) => (
    await api.get('/teacher/academic-calendar', { params })
  ).data,
  createTeacherAcademicCalendar: async (payload: Record<string, any>) => (
    await api.post('/teacher/academic-calendar', payload)
  ).data,
  updateTeacherAcademicCalendar: async (id: string, payload: Record<string, any>) => (
    await api.put(`/teacher/academic-calendar/${id}`, payload)
  ).data,
  deleteTeacherAcademicCalendar: async (id: string) => (
    await api.delete(`/teacher/academic-calendar/${id}`)
  ).data,
  getTeacherAnnouncements: async (params: Record<string, any> = {}) => (
    await api.get('/teacher/announcements', { params })
  ).data,
  getTeacherAttendanceLogs: async (month?: string) => (
    await api.get('/teacher/attendance-logs', { params: month ? { month } : {} })
  ).data,
  saveTeacherAttendance: async (payload: {
    class_schedule_id?: string | number;
    schedule_id?: string | number;
    date: string;
    meeting_number: number;
    topic: string;
    method?: string;
    students: Array<{
      student_id: string | number;
      status: string;
      notes?: string;
    }>;
  }) => (
    await api.post('/teacher/attendance', payload)
  ).data,
  getTeacherAttendance: async (params: ListParams = {}) => (
    await api.get('/teacher/attendance', { params })
  ).data,
  submitPortalMurajaah: async (payload: {
    student_id: string;
    surah_number: number;
    ayat_start: number;
    ayat_end: number;
    record_date: string;
    record_time?: string;
    murajaah_lembar?: number;
    notes_parent?: string;
  }) => (
    await api.post('/portal/tahfizh/murajaah', payload)
  ).data,
  getQuranSurahs: async (search?: string, tempatTurun?: string) => (
    await api.get('/equran/surah', {
      params: {
        ...(search ? { search } : {}),
        ...(tempatTurun ? { tempat_turun: tempatTurun } : {}),
      },
    })
  ).data,
  getQuranSurahDetail: async (surahNumber: number | string) => (
    await api.get(`/equran/surah/${surahNumber}`)
  ).data,
  getDoaList: async (params: { search?: string; grup?: string; tag?: string } = {}) => (
    await api.get('/doa', { params })
  ).data,
  getDoaDetail: async (id: number | string) => (
    await api.get(`/doa/${id}`)
  ).data,
  getPortalSchoolInformation: async (params: Record<string, any> = {}) => (
    await api.get('/portal/school-information', { params })
  ).data,
  getPortalSchoolInformationSummary: async (params: Record<string, any> = {}) => (
    await api.get('/portal/school-information/summary', { params })
  ).data,
  markAllSchoolInformationRead: async (childId?: string) => (
    await api.patch('/portal/school-information/read-all', childId ? { child_id: childId } : {})
  ).data,
  updateSchoolInformationState: async (id: string, action: 'read' | 'bookmark' | 'unbookmark' | 'acknowledge', childId?: string) => (
    await api.patch(`/portal/school-information/${id}/state`, { action, ...(childId ? { child_id: childId } : {}) })
  ).data,
  submitPortalPermission: async (payload: {
    child_id?: string;
    type: 'Izin' | 'Sakit' | 'Keperluan keluarga' | 'Lainnya';
    start_date: string;
    end_date: string;
    reason: string;
  }) => (await api.post('/portal/permissions', payload)).data,
  getTeacherPermissions: async (params: Record<string, any> = {}) => (
    await api.get('/teacher/permissions', { params })
  ).data,
  reviewPermission: async (
    permissionId: string | number,
    action: 'approve' | 'reject' | 'revision' = 'approve',
    notes?: string
  ) => (
    await api.post(`/teacher/permissions/${permissionId}/${action}`, { review_notes: notes })
  ).data,
  getPortalAssignments: async (params: Record<string, any> = {}) => (
    await api.get('/portal/assignments', { params })
  ).data,
  submitPortalAssignment: async (
    assignmentId: string,
    jawaban_teks?: string,
    childId?: string,
    fileLampiran?: { uri: string; name: string; type: string } | null,
    urlLink?: string,
    metadata?: any
  ) => {
    if (fileLampiran) {
      const formData = new FormData();
      if (jawaban_teks) formData.append('jawaban_teks', jawaban_teks);
      if (childId) formData.append('child_id', childId);
      if (urlLink) {
        formData.append('url_link', urlLink);
        formData.append('link', urlLink);
      }
      if (metadata) {
        formData.append('metadata', typeof metadata === 'string' ? metadata : JSON.stringify(metadata));
      }
      formData.append('file_lampiran', {
        uri: fileLampiran.uri,
        name: fileLampiran.name,
        type: fileLampiran.type,
      } as any);
      return (
        await api.post(`/portal/assignments/${assignmentId}/submit`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      ).data;
    }
    return (
      await api.post(`/portal/assignments/${assignmentId}/submit`, {
        jawaban_teks,
        child_id: childId,
        url_link: urlLink,
        link: urlLink,
        metadata: metadata,
      })
    ).data;
  },

  // Communication
  getChatContacts: async (childId?: string) => (
    await api.get('/portal/chat/contacts', childRequest(childId))
  ).data,
  getChatMessages: async (teacherId: string, childId?: string) => (
    await api.get(`/portal/chat/${teacherId}`, childRequest(childId))
  ).data,
  sendChatMessage: async (
    teacherId: string,
    childId: string,
    message: string,
    attachment?: { uri: string; name: string; type: string } | null
  ) => {
    if (attachment) {
      const formData = new FormData();
      formData.append('child_id', childId);
      if (message) formData.append('message', message);
      formData.append('attachment', {
        uri: attachment.uri,
        name: attachment.name,
        type: attachment.type,
      } as any);
      return (
        await api.post(`/portal/chat/${teacherId}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      ).data;
    }
    return (
      await api.post(`/portal/chat/${teacherId}`, { child_id: childId, message })
    ).data;
  },

  // Teacher Communication (/api/teacher/chat/*)
  getTeacherChatConversations: async () => (
    await api.get('/teacher/chat/conversations')
  ).data,
  getTeacherChatMessages: async (parentUserId: string, studentId: string) => (
    await api.get(`/teacher/chat/parent/${parentUserId}/student/${studentId}`)
  ).data,
  sendTeacherChatMessage: async (
    parentUserId: string,
    studentId: string,
    message: string,
    attachment?: { uri: string; name: string; type: string } | null
  ) => {
    if (attachment) {
      const formData = new FormData();
      if (message) formData.append('message', message);
      formData.append('attachment', {
        uri: attachment.uri,
        name: attachment.name,
        type: attachment.type,
      } as any);
      return (
        await api.post(`/teacher/chat/parent/${parentUserId}/student/${studentId}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      ).data;
    }
    return (
      await api.post(`/teacher/chat/parent/${parentUserId}/student/${studentId}`, { message })
    ).data;
  },

  // Employee Chat Communication (/api/employee/chat/*)
  getEmployeeChatConversations: async () => (
    await api.get('/employee/chat/conversations')
  ).data,
  getEmployeeChatContacts: async (params?: Record<string, any>) => (
    await api.get('/employee/chat/contacts', { params })
  ).data,
  getEmployeeChatMessages: async (recipientUserId: string) => (
    await api.get(`/employee/chat/messages/${recipientUserId}`)
  ).data,
  sendEmployeeChatMessage: async (
    recipientUserId: string,
    message: string,
    attachment?: { uri: string; name: string; type: string } | null
  ) => {
    if (attachment) {
      const formData = new FormData();
      if (message) formData.append('message', message);
      formData.append('attachment', {
        uri: attachment.uri,
        name: attachment.name,
        type: attachment.type,
      } as any);
      return (
        await api.post(`/employee/chat/messages/${recipientUserId}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      ).data;
    }
    return (
      await api.post(`/employee/chat/messages/${recipientUserId}`, { message })
    ).data;
  },

  // Existing curriculum and tahfizh integrations
  submitTahfizh: async (payload: TahfizhPayload) => (
    await api.post('/tahfizh/store', payload)
  ).data,
  getTahfizhReport: async (params: ListParams = {}) => (
    await api.get('/tahfizh/report', { params })
  ).data,
  getKurikulumList: async (params: ListParams = {}) => (
    await api.get('/v1/kurikulum', { params })
  ).data,
  getKurikulumDropdown: async (unitPendidikanId?: string) => (
    await api.get('/v1/kurikulum/dropdown', {
      params: { unit_pendidikan_id: unitPendidikanId },
    })
  ).data,
  getKurikulumDetail: async (id: string) => (await api.get(`/v1/kurikulum/${id}`)).data,
  getSubjectList: async (params: ListParams = {}) => (
    await api.get('/master/subjects', { params })
  ).data,
  getSubjectDropdown: async (params: ListParams = {}) => (
    await api.get('/master/subjects/dropdown', { params })
  ).data,
  getLmsMateriList: async (params: ListParams = {}) => (
    await api.get('/lms/materi', { params })
  ).data,
  getLmsMateriStats: async (params: Record<string, unknown> = {}) => (
    await api.get('/lms/materi/stats', { params })
  ).data,
  getLmsMateriOptions: async (params: Record<string, unknown> = {}) => (
    await api.get('/lms/materi/options', { params })
  ).data,
  getLmsMateriDetail: async (id: string) => (
    await api.get(`/lms/materi/${id}`)
  ).data,
  createLmsMateri: async (payload: Record<string, unknown> | FormData) => (
    await api.post('/lms/materi', payload, {
      headers: payload instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : undefined,
    })
  ).data,
  updateLmsMateri: async (id: string, payload: Record<string, unknown> | FormData) => {
    if (payload instanceof FormData) {
      return (
        await api.post(`/lms/materi/${id}?_method=PUT`, payload, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      ).data;
    }
    return (await api.put(`/lms/materi/${id}`, payload)).data;
  },
  deleteLmsMateri: async (id: string) => (
    await api.delete(`/lms/materi/${id}`)
  ).data,
  restoreLmsMateri: async (id: string) => (
    await api.post(`/lms/materi/${id}/restore`)
  ).data,
  ajukanTelaahLmsMateri: async (id: string | number, catatan?: string) => (
    await api.post(`/lms/materi/${id}/ajukan-telaah`, { catatan })
  ).data,
  supervisiLmsMateri: async (id: string | number, payload: { status_supervisi: string; catatan_koreksi?: string }) => (
    await api.post(`/lms/materi/${id}/supervisi`, payload)
  ).data,
  getLmsMateriSupervisiLogs: async (id: string | number) => (
    await api.get(`/lms/materi/${id}/supervisi-logs`)
  ).data,
  getLmsModulAjarList: async (params: ListParams = {}) => (
    await api.get('/lms/modul-ajar', { params })
  ).data,
  getLmsModulAjarStats: async (params: Record<string, unknown> = {}) => (
    await api.get('/lms/modul-ajar/stats', { params })
  ).data,
  getLmsModulAjarDetail: async (id: string) => (
    await api.get(`/lms/modul-ajar/${id}`)
  ).data,
  // LMS Penugasan (Assignments) - Aligned with web-dashboard & LmsPenugasanController
  getLmsPenugasanList: async (params: ListParams = {}) => (
    await api.get('/lms/penugasan', { params })
  ).data,
  getLmsPenugasanStats: async (params: Record<string, unknown> = {}) => (
    await api.get('/lms/penugasan/stats', { params })
  ).data,
  getLmsPenugasanOptions: async (params: Record<string, unknown> = {}) => (
    await api.get('/lms/penugasan/options', { params })
  ).data,
  getLmsPenugasanDetail: async (id: string) => (
    await api.get(`/lms/penugasan/${id}`)
  ).data,
  createLmsPenugasan: async (payload: Record<string, unknown> | FormData) => (
    await api.post('/lms/penugasan', payload, {
      headers: payload instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : undefined,
    })
  ).data,
  updateLmsPenugasan: async (id: string, payload: Record<string, unknown> | FormData) => {
    if (payload instanceof FormData) {
      return (
        await api.post(`/lms/penugasan/${id}?_method=PUT`, payload, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      ).data;
    }
    return (await api.put(`/lms/penugasan/${id}`, payload)).data;
  },
  deleteLmsPenugasan: async (id: string) => (
    await api.delete(`/lms/penugasan/${id}`)
  ).data,
  restoreLmsPenugasan: async (id: string) => (
    await api.post(`/lms/penugasan/${id}/restore`)
  ).data,
  togglePublishLmsPenugasan: async (id: string) => (
    await api.post(`/lms/penugasan/${id}/toggle-publish`)
  ).data,
  gradeLmsPenugasan: async (id: string, payload: Record<string, unknown>) => (
    await api.post(`/lms/penugasan/${id}/nilai`, payload)
  ).data,
  submitLmsTugas: async (penugasanId: string, payload: Record<string, unknown>) => (
    await api.post(`/lms/penugasan/${penugasanId}/submit`, payload)
  ).data,

  // Prayer assessment (62 Daily Prayers)
  getParentPrayerAssessment: async (studentId: string) => (
    await api.get(`/parent/children/${studentId}/prayer-assessment`)
  ).data,

  // Master Dynamic Business Options & Code Generator (Single Source of Truth)
  getBusinessOptions: async (group: string) => (
    await api.get(`/master/options/dropdown/${group}`)
  ).data,
  getModaTransportasiOptions: async () => (
    await api.get('/master/moda-transportasi/dropdown')
  ).data,
  getCodeGeneratorPreview: async (params: { entity_type: string; unit_id?: string; extra?: string }) => (
    await api.get('/code-generator/preview', { params })
  ).data,

  // Teacher Discipline & Violations (Zero Hardcode - Dynamic Master Data)
  getDisciplineCategories: async (params: { type?: string } = {}) => (
    await api.get('/teacher/discipline-categories', { params })
  ).data,
  getDisciplineViolations: async (params: ListParams = {}) => (
    await api.get('/teacher/discipline-violations', { params })
  ).data,
  storeDisciplineViolation: async (payload: {
    student_id: string;
    category_id: string;
    points?: number;
    custom_points?: number;
    transaction_date: string;
    description: string;
    status?: string;
    follow_up?: string;
  }) => (
    await api.post('/teacher/discipline-violations', payload)
  ).data,

  // Site Settings & Portal FAQs
  getSiteSettings: async () => (
    await api.get('/site-settings')
  ).data,
};

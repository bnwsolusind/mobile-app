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

export const unwrapApiData = <T>(response: any): T => (
  response?.data?.data ?? response?.data ?? response
);

export const unwrapCollection = <T>(response: any): T[] => {
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
  markNotificationRead: async (id: string) => (
    await api.post(`/notifications/${id}/read`)
  ).data,
  markAllNotificationsRead: async () => (
    await api.post('/notifications/mark-all-read')
  ).data,

  getProfile: async () => (await api.get('/auth/profile')).data,
  getManagedProfile: async () => (await api.get('/profile')).data,
  updateProfile: async (payload: Record<string, unknown>) => (
    await api.put('/profile', payload)
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
  getClassStudents: async (id: string) => (await api.get(`/kelas/${id}/siswa`)).data,

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
  checkIn: async (payload: AttendancePayload) => (
    await api.post('/attendance/checkin', payload)
  ).data,
  checkOut: async (payload: AttendancePayload & { attendance_id?: string }) => (
    await api.post('/attendance/checkout', payload)
  ).data,
  getAttendanceReport: async (params: ListParams = {}) => (
    await api.get('/attendance/report', { params })
  ).data,
  getAttendanceStats: async (params: ListParams = {}) => (
    await api.get('/attendance/stats', { params })
  ).data,

  // Teacher portal
  getTeacherDashboard: async () => (await api.get('/teacher/dashboard')).data,
  getTeacherSchedules: async (params: ListParams = {}) => (
    await api.get('/teacher/schedules', { params })
  ).data,
  getTeacherClasses: async () => (await api.get('/teacher/classes')).data,
  getTeacherStudents: async (params: ListParams = {}) => (
    await api.get('/teacher/students', { params })
  ).data,
  getTeacherMaterials: async (params: ListParams = {}) => (
    await api.get('/teacher/materials', { params })
  ).data,
  createTeacherMaterial: async (payload: Record<string, unknown>) => (
    await api.post('/teacher/materials', payload)
  ).data,
  updateTeacherMaterial: async (id: string, payload: Record<string, unknown>) => (
    await api.put(`/teacher/materials/${id}`, payload)
  ).data,
  deleteTeacherMaterial: async (id: string) => (
    await api.delete(`/teacher/materials/${id}`)
  ).data,
  getTeacherAssignments: async (params: ListParams = {}) => (
    await api.get('/teacher/assignments', { params })
  ).data,
  getTeacherStudentNotes: async (params: ListParams = {}) => (
    await api.get('/teacher/student-notes', { params })
  ).data,
  createTeacherStudentNote: async (payload: Record<string, unknown>) => (
    await api.post('/teacher/student-notes', payload)
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
  getPortalAttendanceQr: async (childId?: string) => (
    await api.get('/portal/attendance-qr', childRequest(childId))
  ).data,
  getPortalPermissions: async (childId?: string) => (
    await api.get('/portal/permissions', childRequest(childId))
  ).data,
  getAcademicCalendar: async (params?: { range?: string; date?: string; child_id?: string }) => (
    await api.get('/portal/academic-calendar', { params })
  ).data,
  getPortalSchedules: async (params: { child_id?: string; date?: string; month?: string; academic_year?: string } = {}) => (
    await api.get('/portal/schedules', { params })
  ).data,
  getPortalGrades: async (childId?: string) => (
    await api.get('/portal/grades', childRequest(childId))
  ).data,
  getPortalStudentNotes: async (childId?: string, page = 1) => {
    const childConfig = childRequest(childId);
    return (await api.get('/portal/student-notes', {
      ...(childConfig || {}),
      params: { ...(childConfig?.params || {}), page },
    })).data;
  },
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
  getPortalCbtExams: async (childId?: string) => {
    const childConfig = childRequest(childId);
    return (
      await api.get('/portal/lms/exams', {
        ...(childConfig || {}),
      })
    ).data;
  },
  startPortalCbtExam: async (examId: string) => (
    await api.post(`/portal/lms/exams/${examId}/start`)
  ).data,
  savePortalCbtAnswers: async (sessionId: string, answers: any[]) => (
    await api.post(`/portal/lms/exam-sessions/${sessionId}/answers`, { jawaban: answers })
  ).data,
  finishPortalCbtExam: async (sessionId: string, answers?: any[]) => (
    await api.post(`/portal/lms/exam-sessions/${sessionId}/finish`, { ...(answers ? { jawaban: answers } : {}) })
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
  getPortalAssignments: async (params: Record<string, any> = {}) => (
    await api.get('/portal/assignments', { params })
  ).data,
  submitPortalAssignment: async (assignmentId: string, jawaban_teks: string, childId?: string) => (
    await api.post(`/portal/assignments/${assignmentId}/submit`, { jawaban_teks, child_id: childId })
  ).data,

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
  submitLmsTugas: async (penugasanId: string, payload: Record<string, unknown>) => (
    await api.post(`/lms/penugasan/${penugasanId}/submit`, payload)
  ).data,

  // Prayer assessment (62 Daily Prayers)
  getParentPrayerAssessment: async (studentId: string) => (
    await api.get(`/parent/children/${studentId}/prayer-assessment`)
  ).data,
};

/**
 * academicYear.ts
 * Utility terpusat untuk perhitungan Tahun Ajaran dan Semester secara dinamis (Zero Hardcoding).
 * Mengutamakan data dari backend/payload, dan jika tidak tersedia, menghitung secara cerdas dari kalender sistem.
 */

export interface AcademicYearInfo {
  year: string;
  semester: 'Ganjil' | 'Genap';
  semesterStr: string;
  academicInfo: string;
  months: string;
}

/**
 * Mendapatkan Tahun Ajaran (format "YYYY/YYYY") dari payload atau tanggal saat ini.
 */
export const getDynamicAcademicYear = (source?: any): string => {
  const yearName =
    source?.academic_year?.name ||
    source?.academic_year?.tahun ||
    source?.academic_year ||
    source?.active_academic_year?.name ||
    source?.kelas?.academic_year?.name ||
    source?.tahun_ajaran?.nama ||
    source?.tahun_ajaran ||
    source?.academicYear ||
    source?.year;

  if (typeof yearName === 'string') {
    const match = yearName.match(/\d{4}\/\d{4}/);
    if (match) return match[0];
    if (yearName.trim().length > 0) return yearName.trim();
  }

  // Fallback cerdas dari kalender sistem
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12
  const startYear = currentMonth >= 7 ? currentYear : currentYear - 1;
  const endYear = startYear + 1;
  return `${startYear}/${endYear}`;
};

/**
 * Mendapatkan Semester ('Ganjil' | 'Genap') dari payload atau tanggal saat ini.
 */
export const getDynamicAcademicSemester = (source?: any): 'Ganjil' | 'Genap' => {
  const rawSemester =
    source?.semester?.name ||
    source?.semester?.nama ||
    source?.semester ||
    source?.semesterName;

  if (rawSemester) {
    const semLower = String(rawSemester).toLowerCase();
    if (semLower.includes('genap') || semLower === '2') {
      return 'Genap';
    }
    if (semLower.includes('ganjil') || semLower === '1') {
      return 'Ganjil';
    }
  }

  // Kalender sistem: Juli-Desember = Ganjil, Januari-Juni = Genap
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  return currentMonth >= 7 ? 'Ganjil' : 'Genap';
};

/**
 * Menghasilkan rentang nama bulan berdasarkan semester & tahun ajaran.
 */
export const getDynamicAcademicMonths = (
  semester: 'Ganjil' | 'Genap',
  yearStr?: string
): string => {
  const yr = yearStr || getDynamicAcademicYear();
  const parts = yr.split('/');
  const startYear = parts[0] || String(new Date().getFullYear());
  const endYear = parts[1] || String(Number(startYear) + 1);

  if (semester === 'Ganjil') {
    return `Juli – Desember ${startYear}`;
  }
  return `Januari – Juni ${endYear}`;
};

/**
 * Mendapatkan ringkasan info tahun ajaran & semester lengkap (misal: "2026/2027 · Semester Ganjil").
 */
export const getDynamicAcademicInfo = (source?: any): string => {
  const yearName = getDynamicAcademicYear(source);
  const semester = getDynamicAcademicSemester(source);

  return `${yearName} · Semester ${semester}`;
};

/**
 * Menghasilkan daftar opsi semester dinamis untuk picker/filter modal.
 * Mencakup semester aktif saat ini dan beberapa semester sebelumnya.
 */
export const getDynamicSemesterOptions = (
  source?: any,
  pastSemestersCount = 5
): Array<{ label: string; year: string; semester: 'Ganjil' | 'Genap'; isCurrent: boolean }> => {
  const currentYearStr = getDynamicAcademicYear(source);
  const currentSemester = getDynamicAcademicSemester(source);

  const startYear = parseInt(currentYearStr.split('/')[0], 10) || new Date().getFullYear();
  const options: Array<{ label: string; year: string; semester: 'Ganjil' | 'Genap'; isCurrent: boolean }> = [];

  let curStart = startYear;
  let curSem: 'Ganjil' | 'Genap' = currentSemester;

  for (let i = 0; i < pastSemestersCount; i++) {
    const yrStr = `${curStart}/${curStart + 1}`;
    const label = `${yrStr} - Semester ${curSem}`;
    options.push({
      label,
      year: yrStr,
      semester: curSem,
      isCurrent: i === 0,
    });

    if (curSem === 'Genap') {
      curSem = 'Ganjil';
    } else {
      curSem = 'Genap';
      curStart -= 1;
    }
  }

  return options;
};

import { StyleSheet } from 'react-native';

/**
 * Token desain bodi bersama halaman portal (Tugas, Jadwal, Materi).
 * Nilai diambil dari bahasa desain halaman Tugas sebagai acuan tunggal —
 * layar lain memakai modul ini agar tidak ada warna/ukuran/label
 * yang di-hardcode tersebar di tiap screen.
 */

export const PORTAL_BODY_PALETTE = {
  cardBg: '#FFFFFF',
  cardBorder: '#E8F5EE',
  cardShadow: '#064E3B',
  sectionTitle: '#0F172A',
  bodyText: '#0F172A',
  mutedText: '#64748B',
  faintText: '#94A3B8',
  capsuleBg: '#FFFFFF',
  capsuleBorder: '#E2E8F0',
  capsuleText: '#475569',
  capsuleActiveBg: '#059669',
  capsuleActiveBorder: '#059669',
  capsuleActiveText: '#FFFFFF',
  capsuleActiveShadow: '#059669',
  searchIcon: '#94A3B8',
  searchPlaceholder: '#94A3B8',
  sortPillBg: '#F8FAFC',
  sortPillBorder: '#E2E8F0',
  sortPillText: '#1E293B',
  emptyBg: '#F8FAFC',
  emptyBorder: '#E2E8F0',
  emptyTitle: '#334155',
  emptyDesc: '#94A3B8',
  emptyIcon: '#CBD5E1',
  loadingIndicator: '#18A165',
  listHeaderIcon: '#059669',
} as const;

export const PORTAL_BODY_TEXTS = {
  sortLatest: 'Terbaru',
  sortTitle: 'Judul',
} as const;

/** Palet hero statis bodi (sama nilai dengan Tugas/Jadwal, terpusat di sini). */
export const PORTAL_HERO_PALETTE = {
  gradient: ['#047857', '#059669', '#10B981'],
  buttonIcon: '#059669',
  sectionIcon: '#18A165',
  cardChevron: '#3B82F6',
} as const;

export const portalBodyStyles = StyleSheet.create({
  // Header section daftar (ikon + judul + jumlah + pil sortir)
  sectionHeaderBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitleBold: {
    fontSize: 15,
    fontWeight: '800',
    color: PORTAL_BODY_PALETTE.sectionTitle,
    letterSpacing: -0.3,
  },
  sortPillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PORTAL_BODY_PALETTE.sortPillBg,
    borderWidth: 1.5,
    borderColor: PORTAL_BODY_PALETTE.sortPillBorder,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 6,
    gap: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  sortPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: PORTAL_BODY_PALETTE.sortPillText,
  },

  // Filter kapsul + pencarian
  filterSectionBlock: {
    marginBottom: 18,
    gap: 10,
  },
  filterPillsScroll: {
    gap: 8,
    paddingVertical: 3,
  },
  filterCapsuleBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 22,
    backgroundColor: PORTAL_BODY_PALETTE.capsuleBg,
    borderWidth: 1.5,
    borderColor: PORTAL_BODY_PALETTE.capsuleBorder,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  filterCapsuleBtnActive: {
    backgroundColor: PORTAL_BODY_PALETTE.capsuleActiveBg,
    borderColor: PORTAL_BODY_PALETTE.capsuleActiveBorder,
    shadowColor: PORTAL_BODY_PALETTE.capsuleActiveShadow,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  filterCapsuleText: {
    fontSize: 12,
    fontWeight: '600',
    color: PORTAL_BODY_PALETTE.capsuleText,
  },
  filterCapsuleTextActive: {
    color: PORTAL_BODY_PALETTE.capsuleActiveText,
    fontWeight: '800',
  },
  searchAndFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchBarContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PORTAL_BODY_PALETTE.cardBg,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: PORTAL_BODY_PALETTE.capsuleBorder,
    paddingHorizontal: 12,
    height: 44,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  searchInputField: {
    flex: 1,
    fontSize: 13,
    color: PORTAL_BODY_PALETTE.bodyText,
    paddingVertical: 0,
  },

  // Status memuat & kosong
  loadingBox: {
    padding: 40,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 12.5,
    color: PORTAL_BODY_PALETTE.mutedText,
    fontWeight: '600',
    marginTop: 4,
  },
  emptyCard: {
    backgroundColor: PORTAL_BODY_PALETTE.emptyBg,
    borderRadius: 22,
    paddingVertical: 38,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: PORTAL_BODY_PALETTE.emptyBorder,
    borderStyle: 'dashed',
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: PORTAL_BODY_PALETTE.emptyTitle,
    marginTop: 12,
    letterSpacing: -0.3,
  },
  emptySubtitle: {
    fontSize: 12,
    color: PORTAL_BODY_PALETTE.emptyDesc,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    fontWeight: '500',
  },

  // Bingkai kartu modern + kotak ikon mapel
  modernCard: {
    backgroundColor: PORTAL_BODY_PALETTE.cardBg,
    borderRadius: 20,
    padding: 0,
    borderWidth: 1.5,
    borderColor: PORTAL_BODY_PALETTE.cardBorder,
    marginBottom: 14,
    shadowColor: PORTAL_BODY_PALETTE.cardShadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    overflow: 'hidden',
  },
  cardHeaderFlex: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    paddingBottom: 10,
  },
  subjectIconBoxLarge: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
});

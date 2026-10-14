/**
 * Resolver tunggal pemilihan anak di semua halaman portal.
 *
 * Prinsip: orang tua memilih anak SATU KALI di halaman utama;
 * semua halaman turunan wajib mengikuti tanpa memilih ulang diam-diam.
 *
 * Urutan prioritas:
 *  1. child_id eksplisit dari route (deep-link / tombol menu),
 *  2. activeChildId global (pilihan di halaman utama),
 *  3. anak pertama (fallback terakhir).
 *
 * Pencocokan memakai `id || student_id` karena bentuk objek anak
 * tidak konsisten antar endpoint.
 */
export function resolveSelectedChildId(
  routeChildId: unknown,
  storeActiveChildId: unknown,
  children: Array<{ id?: unknown; student_id?: unknown }>
): string | undefined {
  const keyOf = (c: { id?: unknown; student_id?: unknown }): string =>
    String(c?.id ?? c?.student_id ?? '');

  const fromRoute = routeChildId ? String(routeChildId) : '';
  if (fromRoute) {
    const match = children.find((c) => keyOf(c) && keyOf(c) === fromRoute);
    if (match) return keyOf(match);
    return fromRoute;
  }

  const fromStore = storeActiveChildId ? String(storeActiveChildId) : '';
  if (fromStore) {
    const match = children.find((c) => keyOf(c) && keyOf(c) === fromStore);
    if (match) return keyOf(match);
    return fromStore;
  }

  const first = children[0];
  if (!first) return undefined;
  return keyOf(first) || undefined;
}

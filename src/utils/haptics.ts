import { Platform, Vibration } from 'react-native';

/**
 * Utility haptic feedback ringan & aman berbasis native Vibration API.
 * Kompatibel 100% di semua device Android & iOS tanpa dependensi eksternal.
 */
export const appHaptics = {
  /**
   * Sentuhan ringan saat klik tombol, tab navigasi, atau pemilihan item
   */
  selection: () => {
    try {
      if (Platform.OS === 'android') {
        Vibration.vibrate(20);
      } else if (Platform.OS === 'ios') {
        Vibration.vibrate(15);
      }
    } catch {
      // no-op jika device tidak mendukung getaran
    }
  },

  /**
   * Pola getaran sukses (misal: scan QR sukses, simpan berhasil)
   */
  success: () => {
    try {
      if (Platform.OS === 'android') {
        Vibration.vibrate([0, 25, 45, 25]);
      } else {
        Vibration.vibrate(25);
      }
    } catch {}
  },

  /**
   * Pola getaran peringatan (misal: validasi input kosong, konfirmasi dialog)
   */
  warning: () => {
    try {
      if (Platform.OS === 'android') {
        Vibration.vibrate([0, 35, 55, 35]);
      } else {
        Vibration.vibrate(35);
      }
    } catch {}
  },

  /**
   * Pola getaran penolakan atau kegagalan
   */
  error: () => {
    try {
      if (Platform.OS === 'android') {
        Vibration.vibrate([0, 50, 70, 50]);
      } else {
        Vibration.vibrate(50);
      }
    } catch {}
  },
};

export default appHaptics;

import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export type FeedbackType = 'success' | 'error' | 'warning' | 'info' | 'confirm';

export interface AppFeedbackModalProps {
  visible: boolean;
  type?: FeedbackType;
  title: string;
  message?: string;
  itemName?: string;
  category?: string;
  dateStr?: string;
  actionLabel?: string;
  cancelLabel?: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  asOverlay?: boolean;
  onConfirm?: () => void;
  onClose: () => void;
  containerStyle?: StyleProp<ViewStyle>;
}

const { width } = Dimensions.get('window');

export function AppFeedbackModal({
  visible,
  type = 'info',
  title,
  message,
  itemName,
  category,
  dateStr,
  actionLabel,
  cancelLabel = 'Batal',
  confirmText,
  cancelText,
  isDestructive = false,
  asOverlay = false,
  onConfirm,
  onClose,
  containerStyle,
}: AppFeedbackModalProps) {
  const isConfirm = type === 'confirm';
  const isError = type === 'error';
  const isSuccess = type === 'success';
  const isWarning = type === 'warning';

  const defaultActionLabel = isConfirm
    ? isDestructive
      ? 'Ya, Hapus'
      : 'Ya, Lanjutkan'
    : isError
    ? 'Tutup'
    : isSuccess
    ? 'Alhamdulillah'
    : 'Mengerti';

  const finalActionLabel = actionLabel || confirmText || defaultActionLabel;
  const finalCancelLabel = cancelText || cancelLabel || 'Batal';

  const iconName = isSuccess
    ? 'check-decagram'
    : isError
    ? 'alert-octagon'
    : isWarning
    ? 'alert'
    : isConfirm
    ? isDestructive
      ? 'trash-can-outline'
      : 'help-circle'
    : 'information';

  const iconColor = isSuccess
    ? '#059669'
    : isError || (isConfirm && isDestructive)
    ? '#E11D48'
    : isWarning
    ? '#D97706'
    : isConfirm
    ? '#0D9488'
    : '#0284C7';

  const gradientColors: [string, string] = isSuccess
    ? ['#059669', '#10B981']
    : isError || (isConfirm && isDestructive)
    ? ['#E11D48', '#BE123C']
    : isWarning
    ? ['#D97706', '#F59E0B']
    : isConfirm
    ? ['#0F766E', '#14B8A6']
    : ['#0284C7', '#38BDF8'];

  const cardContent = (
    <View
      style={[
            styles.feedbackCard,
            isSuccess && styles.feedbackCardSuccess,
            (isError || (isConfirm && isDestructive)) && styles.feedbackCardError,
            isWarning && styles.feedbackCardWarning,
            (!isDestructive && (type === 'info' || isConfirm)) && styles.feedbackCardInfo,
            containerStyle,
          ]}
        >
          {/* Top Accent Gradient Line */}
          <View
            style={[
              styles.feedbackAccentLine,
              isSuccess && styles.feedbackAccentLineSuccess,
              (isError || (isConfirm && isDestructive)) && styles.feedbackAccentLineError,
              isWarning && styles.feedbackAccentLineWarning,
              (!isDestructive && (type === 'info' || isConfirm)) && styles.feedbackAccentLineInfo,
            ]}
          />

          {/* Icon Badge */}
          <View
            style={[
              styles.feedbackIconBadge,
              isSuccess && styles.feedbackIconBadgeSuccess,
              (isError || (isConfirm && isDestructive)) && styles.feedbackIconBadgeError,
              isWarning && styles.feedbackIconBadgeWarning,
              (!isDestructive && (type === 'info' || isConfirm)) && styles.feedbackIconBadgeInfo,
            ]}
          >
            <MaterialCommunityIcons name={iconName} size={36} color={iconColor} />
          </View>

          {/* Status Pill Badge */}
          <View
            style={[
              styles.feedbackTypePill,
              isSuccess && styles.feedbackTypePillSuccess,
              (isError || (isConfirm && isDestructive)) && styles.feedbackTypePillError,
              isWarning && styles.feedbackTypePillWarning,
              (!isDestructive && (type === 'info' || isConfirm)) && styles.feedbackTypePillInfo,
            ]}
          >
            <Text
              style={[
                styles.feedbackTypePillText,
                isSuccess && styles.feedbackTypePillTextSuccess,
                (isError || (isConfirm && isDestructive)) && styles.feedbackTypePillTextError,
                isWarning && styles.feedbackTypePillTextWarning,
                (!isDestructive && (type === 'info' || isConfirm)) && styles.feedbackTypePillTextInfo,
              ]}
            >
              {isSuccess
                ? 'BERHASIL'
                : isError
                ? (title?.toLowerCase().includes('ditolak') || title?.toLowerCase().includes('presensi') ? 'PRESENSI DITOLAK' : 'PERHATIAN / KENDALA')
                : isWarning
                ? 'PERINGATAN'
                : isConfirm
                ? isDestructive
                  ? 'HAPUS PERMANEN'
                  : 'KONFIRMASI'
                : 'INFORMASI'}
            </Text>
          </View>

          {/* Title */}
          <Text style={styles.feedbackTitle}>{title}</Text>

          {/* Message */}
          {Boolean(message) && <Text style={styles.feedbackMessage}>{message}</Text>}

          {/* Geofence Alert Box for Attendance Rejections */}
          {isError && Boolean(message) && (message?.toLowerCase().includes('radius') || message?.toLowerCase().includes('jarak anda')) && (
            <View style={styles.geofenceNoticeBox}>
              <View style={styles.geofenceNoticeHeader}>
                <MaterialCommunityIcons name="crosshairs-gps" size={14} color="#E11D48" />
                <Text style={styles.geofenceNoticeTitle}>VERIFIKASI GEOFENCING LOKASI</Text>
              </View>
              <Text style={styles.geofenceNoticeDesc}>
                Presensi mandiri dibatasi maksimal 30 meter dari lokasi unit pendidikan. Silakan mendekat ke area sekolah.
              </Text>
            </View>
          )}

          {/* Item or Category summary card if provided */}
          {(itemName || category || dateStr) && (
            <View style={styles.feedbackItemSummary}>
              {Boolean(itemName) && (
                <View style={styles.feedbackItemRow}>
                  <MaterialCommunityIcons name="bookmark-check" size={16} color="#059669" />
                  <Text style={styles.feedbackItemName} numberOfLines={2}>
                    {itemName}
                  </Text>
                </View>
              )}
              {(category || dateStr) && (
                <View style={styles.feedbackItemMetaRow}>
                  {Boolean(category) && (
                    <View style={styles.feedbackCategoryBadge}>
                      <Text style={styles.feedbackCategoryBadgeText}>{category}</Text>
                    </View>
                  )}
                  {Boolean(dateStr) && (
                    <Text style={styles.feedbackDateText}>📅 {dateStr}</Text>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Button actions */}
          <View style={[styles.buttonRow, isConfirm && styles.buttonRowConfirm]}>
            {isConfirm && (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={onClose}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelButtonText}>{finalCancelLabel}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => {
                if (isConfirm && onConfirm) {
                  onConfirm();
                } else {
                  onClose();
                }
              }}
              style={[styles.feedbackActionBtn, isConfirm && { flex: 1.2 }]}
            >
              <LinearGradient
                colors={gradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.feedbackActionGradient}
              >
                <Text style={styles.feedbackActionText}>{finalActionLabel}</Text>
                <MaterialCommunityIcons
                  name={isConfirm ? 'arrow-right' : 'check'}
                  size={16}
                  color="#FFFFFF"
                />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
  );

  if (asOverlay) {
    if (!visible) return null;
    return (
      <View style={[StyleSheet.absoluteFill, styles.feedbackOverlay, { zIndex: 9999 }]}>
        {cardContent}
      </View>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.feedbackOverlay}>
        {cardContent}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  feedbackOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  feedbackCard: {
    width: '100%',
    maxWidth: 370,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
  },
  feedbackCardSuccess: {
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
  },
  feedbackCardError: {
    borderWidth: 1.5,
    borderColor: '#FECDD3',
  },
  feedbackCardWarning: {
    borderWidth: 1.5,
    borderColor: '#FDE68A',
  },
  feedbackCardInfo: {
    borderWidth: 1.5,
    borderColor: '#BAE6FD',
  },
  feedbackAccentLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 5,
  },
  feedbackAccentLineSuccess: {
    backgroundColor: '#059669',
  },
  feedbackAccentLineError: {
    backgroundColor: '#E11D48',
  },
  feedbackAccentLineWarning: {
    backgroundColor: '#D97706',
  },
  feedbackAccentLineInfo: {
    backgroundColor: '#0284C7',
  },
  feedbackIconBadge: {
    width: 66,
    height: 66,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 12,
    borderWidth: 2,
  },
  feedbackIconBadgeSuccess: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  feedbackIconBadgeError: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
  },
  feedbackIconBadgeWarning: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  feedbackIconBadgeInfo: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
  },
  feedbackTypePill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 8,
  },
  feedbackTypePillSuccess: {
    backgroundColor: '#D1FAE5',
  },
  feedbackTypePillError: {
    backgroundColor: '#FFE4E6',
  },
  feedbackTypePillWarning: {
    backgroundColor: '#FEF3C7',
  },
  feedbackTypePillInfo: {
    backgroundColor: '#E0F2FE',
  },
  feedbackTypePillText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  feedbackTypePillTextSuccess: {
    color: '#065F46',
  },
  feedbackTypePillTextError: {
    color: '#9F1239',
  },
  feedbackTypePillTextWarning: {
    color: '#92400E',
  },
  feedbackTypePillTextInfo: {
    color: '#075985',
  },
  feedbackTitle: {
    fontSize: 16.5,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 6,
  },
  feedbackMessage: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#475569',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 14,
  },
  feedbackItemSummary: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 16,
  },
  feedbackItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  feedbackItemName: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  feedbackItemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  feedbackCategoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#ECFDF5',
  },
  feedbackCategoryBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#059669',
  },
  feedbackDateText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  buttonRow: {
    width: '100%',
    marginTop: 4,
  },
  buttonRowConfirm: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  feedbackActionBtn: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 3,
  },
  feedbackActionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
  },
  feedbackActionText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  geofenceNoticeBox: {
    width: '100%',
    backgroundColor: '#FFF1F2',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FECDD3',
    padding: 10,
    marginBottom: 14,
  },
  geofenceNoticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  geofenceNoticeTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9F1239',
    letterSpacing: 0.5,
  },
  geofenceNoticeDesc: {
    fontSize: 11,
    fontWeight: '600',
    color: '#881337',
    lineHeight: 15,
  },
});

export default AppFeedbackModal;

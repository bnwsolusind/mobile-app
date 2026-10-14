import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface StudentQrModalProps {
  visible: boolean;
  student: any;
  onClose: () => void;
}

/**
 * Modal khusus QR Code siswa — dibuka dari tombol QR (bukan dari Kartu Siswa).
 * Memakai payload yang sama dengan sisi belakang KTS
 * (`STUDENT_CARD:NIS:NAMA`) agar tetap terbaca scanner gerbang.
 */
export const StudentQrModal: React.FC<StudentQrModalProps> = ({
  visible,
  student,
  onClose,
}) => {
  const [qrLoading, setQrLoading] = React.useState(true);

  React.useEffect(() => {
    if (visible) {
      setQrLoading(true);
    }
  }, [visible, student]);

  if (!student) return null;

  const sName =
    student?.full_name || student?.nama_lengkap || student?.name || 'Siswa';
  const sNis = student?.nis || student?.student_nis || '-';
  const kelasName =
    student?.kelas?.nama_kelas ||
    student?.kelas?.name ||
    student?.class_name ||
    student?.kelas ||
    '';

  const qrValue = student?.qr_token || `STUDENT_CARD:${sNis}:${sName}`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
    qrValue
  )}`;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconBadge}>
                <MaterialCommunityIcons name="qrcode-scan" size={20} color="#059669" />
              </View>
              <Text style={styles.headerTitle}>QR Code Siswa</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* QR */}
          <View style={styles.qrBox}>
            {qrLoading && (
              <View style={styles.qrLoader}>
                <ActivityIndicator size="large" color="#059669" />
              </View>
            )}
            <Image
              source={{ uri: qrImageUrl }}
              style={styles.qrImage}
              resizeMode="contain"
              onLoadEnd={() => setQrLoading(false)}
            />
          </View>

          {/* Identitas */}
          <Text numberOfLines={1} style={styles.studentName}>
            {sName}
          </Text>
          <Text style={styles.studentNis}>
            NIS: {sNis}{kelasName ? ` • ${kelasName}` : ''}
          </Text>
          <Text style={styles.hint}>
            Tunjukkan QR ini untuk absensi gerbang & verifikasi.
          </Text>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onClose}
            style={styles.closeActionBtn}
          >
            <Text style={styles.closeActionBtnText}>Tutup</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#064E3B',
    letterSpacing: -0.2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrBox: {
    width: 220,
    height: 220,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  qrLoader: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrImage: {
    width: 200,
    height: 200,
  },
  studentName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 14,
    letterSpacing: -0.2,
    maxWidth: '100%',
  },
  studentNis: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#059669',
    marginTop: 4,
  },
  hint: {
    fontSize: 11.5,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 17,
  },
  closeActionBtn: {
    width: '100%',
    marginTop: 16,
    borderRadius: 14,
    backgroundColor: '#059669',
    paddingVertical: 13,
    alignItems: 'center',
    shadowColor: '#059669',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  closeActionBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

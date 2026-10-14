import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  useServerConfigStore,
  SERVER_PRESETS,
  ServerEnvironment,
} from '../stores/serverConfigStore';

interface ServerSwitchModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: (newUrl: string) => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ServerSwitchModal({
  visible,
  onClose,
  onSuccess,
}: ServerSwitchModalProps) {
  const currentEnv = useServerConfigStore((state) => state.currentEnv);
  const activeUrl = useServerConfigStore((state) => state.activeUrl);
  const customUrlStore = useServerConfigStore((state) => state.customUrl);
  const isTesting = useServerConfigStore((state) => state.isTesting);
  const testResult = useServerConfigStore((state) => state.testResult);
  const setServer = useServerConfigStore((state) => state.setServer);
  const testConnection = useServerConfigStore((state) => state.testConnection);
  const resetToDefault = useServerConfigStore((state) => state.resetToDefault);

  const [selectedEnv, setSelectedEnv] = useState<ServerEnvironment>(currentEnv);
  const [inputCustomUrl, setInputCustomUrl] = useState<string>(customUrlStore || activeUrl);
  const [isApplying, setIsApplying] = useState(false);
  const [localFeedback, setLocalFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (visible) {
      setSelectedEnv(currentEnv);
      setInputCustomUrl(customUrlStore || activeUrl);
      setLocalFeedback(null);
    }
  }, [visible, currentEnv, customUrlStore, activeUrl]);

  const getEffectiveUrlForEnv = (env: ServerEnvironment): string => {
    if (env === 'custom') {
      return inputCustomUrl.trim();
    }
    const preset = SERVER_PRESETS.find((p) => p.id === env);
    return preset ? preset.getUrl() : '';
  };

  const handleTest = async () => {
    const targetUrl = getEffectiveUrlForEnv(selectedEnv);
    if (!targetUrl) {
      setLocalFeedback({
        ok: false,
        message: 'Mohon masukkan alamat URL terlebih dahulu.',
      });
      return;
    }
    const res = await testConnection(targetUrl);
    setLocalFeedback(res);
  };

  const handleApply = async () => {
    const targetUrl = getEffectiveUrlForEnv(selectedEnv);
    if (!targetUrl) {
      Alert.alert('Perhatian', 'Alamat URL server tidak boleh kosong.');
      return;
    }

    try {
      setIsApplying(true);
      await setServer(selectedEnv, selectedEnv === 'custom' ? targetUrl : undefined);
      setIsApplying(false);
      if (onSuccess) {
        onSuccess(targetUrl);
      }
      onClose();
    } catch (err: any) {
      setIsApplying(false);
      Alert.alert('Gagal Mengubah Server', err.message || 'Format URL tidak valid.');
    }
  };

  const handleReset = async () => {
    Alert.alert(
      'Reset Server',
      'Kembalikan pengaturan koneksi server ke pengaturan default awal?',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await resetToDefault();
            setSelectedEnv('local');
            setLocalFeedback(null);
            onClose();
          },
        },
      ]
    );
  };

  const currentPreviewUrl = getEffectiveUrlForEnv(selectedEnv);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardContainer}
        >
          <View style={styles.modalCard}>
            {/* Header Accent Line */}
            <View style={styles.topAccentBar} />

            {/* Header Title */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.headerIconBadge}>
                  <MaterialCommunityIcons name="server-network" size={22} color="#059669" />
                </View>
                <View style={styles.headerTexts}>
                  <Text style={styles.title}>Pengaturan Server API</Text>
                  <Text style={styles.subtitle}>Ganti target environment server secara dinamis</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              {/* Preset List */}
              <Text style={styles.sectionLabel}>PILIH ENVIRONMENT SERVER</Text>
              <View style={styles.presetsList}>
                {SERVER_PRESETS.map((preset) => {
                  const isSelected = selectedEnv === preset.id;
                  const presetUrl = preset.id === 'custom' ? inputCustomUrl : preset.getUrl();

                  return (
                    <TouchableOpacity
                      key={preset.id}
                      activeOpacity={0.8}
                      onPress={() => {
                        setSelectedEnv(preset.id);
                        setLocalFeedback(null);
                      }}
                      style={[
                        styles.presetCard,
                        isSelected && styles.presetCardActive,
                      ]}
                    >
                      <View style={styles.presetRow}>
                        <View
                          style={[
                            styles.radioCircle,
                            isSelected && styles.radioCircleActive,
                          ]}
                        >
                          {isSelected && <View style={styles.radioInnerDot} />}
                        </View>

                        <View style={styles.presetInfo}>
                          <View style={styles.presetHeaderRow}>
                            <Text style={[styles.presetTitle, isSelected && styles.presetTitleActive]}>
                              {preset.title}
                            </Text>
                            <View
                              style={[
                                styles.badgePill,
                                { backgroundColor: `${preset.badgeColor}18` },
                              ]}
                            >
                              <Text style={[styles.badgeText, { color: preset.badgeColor }]}>
                                {preset.badge}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.presetSub}>{preset.subtitle}</Text>
                          {presetUrl ? (
                            <Text numberOfLines={1} style={styles.presetUrlText}>
                              {presetUrl}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Custom URL Input (if custom selected) */}
              {selectedEnv === 'custom' && (
                <View style={styles.customInputBox}>
                  <Text style={styles.customInputLabel}>
                    Masukkan URL / IP Backend Lengkap:
                  </Text>
                  <View style={styles.inputWrapper}>
                    <MaterialCommunityIcons
                      name="link-variant"
                      size={18}
                      color="#059669"
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.inputField}
                      placeholder="http://192.168.1.10:8000/api"
                      placeholderTextColor="#94A3B8"
                      value={inputCustomUrl}
                      onChangeText={(t) => {
                        setInputCustomUrl(t);
                        setLocalFeedback(null);
                      }}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                    />
                  </View>
                  <Text style={styles.customHelperText}>
                    * Pastikan menyertakan http:// atau https:// serta akhiran /api
                  </Text>
                </View>
              )}

              {/* Active URL Target Preview & Ping Tester */}
              <View style={styles.testerContainer}>
                <View style={styles.testerHeader}>
                  <Text style={styles.testerLabel}>TARGET URL YANG AKAN DIGUNAKAN:</Text>
                  <TouchableOpacity
                    style={styles.pingButton}
                    onPress={handleTest}
                    disabled={isTesting}
                  >
                    {isTesting ? (
                      <ActivityIndicator size="small" color="#059669" />
                    ) : (
                      <>
                        <MaterialCommunityIcons
                          name="radar"
                          size={15}
                          color="#059669"
                          style={{ marginRight: 4 }}
                        />
                        <Text style={styles.pingButtonText}>Tes Koneksi (Ping)</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                <View style={styles.previewUrlBox}>
                  <Text numberOfLines={2} style={styles.previewUrlText}>
                    {currentPreviewUrl || '(Belum ditentukan)'}
                  </Text>
                </View>

                {/* Feedback Result Banner */}
                {localFeedback && (
                  <View
                    style={[
                      styles.feedbackBox,
                      localFeedback.ok ? styles.feedbackBoxSuccess : styles.feedbackBoxError,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={localFeedback.ok ? 'check-circle' : 'alert-circle'}
                      size={18}
                      color={localFeedback.ok ? '#059669' : '#DC2626'}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[
                        styles.feedbackText,
                        localFeedback.ok ? styles.feedbackTextSuccess : styles.feedbackTextError,
                      ]}
                    >
                      {localFeedback.message}
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>

            {/* Footer Buttons */}
            <View style={styles.footer}>
              <TouchableOpacity
                onPress={handleReset}
                style={styles.resetButton}
                disabled={isApplying}
              >
                <Text style={styles.resetButtonText}>Reset Default</Text>
              </TouchableOpacity>

              <View style={styles.footerActionRow}>
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.cancelButton}
                  disabled={isApplying}
                >
                  <Text style={styles.cancelButtonText}>Batal</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleApply}
                  style={styles.applyButton}
                  disabled={isApplying || !currentPreviewUrl}
                >
                  {isApplying ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <MaterialCommunityIcons
                        name="check"
                        size={18}
                        color="#FFFFFF"
                        style={{ marginRight: 6 }}
                      />
                      <Text style={styles.applyButtonText}>Terapkan</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  keyboardContainer: {
    width: '100%',
    maxWidth: 520,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
    maxHeight: '90%',
  },
  topAccentBar: {
    height: 4,
    backgroundColor: '#059669',
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerIconBadge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  headerTexts: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  scrollContent: {
    padding: 20,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: '#64748B',
    marginBottom: 10,
  },
  presetsList: {
    gap: 10,
  },
  presetCard: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  presetCardActive: {
    backgroundColor: '#F0FDF4',
    borderColor: '#10B981',
  },
  presetRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    marginRight: 12,
  },
  radioCircleActive: {
    borderColor: '#059669',
  },
  radioInnerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#059669',
  },
  presetInfo: {
    flex: 1,
  },
  presetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  presetTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
    flex: 1,
  },
  presetTitleActive: {
    color: '#065F46',
  },
  badgePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  presetSub: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 4,
  },
  presetUrlText: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#059669',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 2,
  },
  customInputBox: {
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  customInputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    paddingHorizontal: 12,
    height: 44,
  },
  inputIcon: {
    marginRight: 8,
  },
  inputField: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  customHelperText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 6,
    fontStyle: 'italic',
  },
  testerContainer: {
    marginTop: 18,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  testerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  testerLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: '#475569',
  },
  pingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  pingButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  previewUrlBox: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  previewUrlText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  feedbackBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
  },
  feedbackBoxSuccess: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  feedbackBoxError: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  feedbackText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  feedbackTextSuccess: {
    color: '#065F46',
  },
  feedbackTextError: {
    color: '#991B1B',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#F8FAFC',
  },
  resetButton: {
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  resetButtonText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  footerActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  cancelButton: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  applyButton: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

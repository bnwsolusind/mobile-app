import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Lazy-resolve WebView without crashing the app at start if native RNCWebViewModule is not compiled in
let cachedWebView: any = undefined;
function getWebViewComponent(): any {
  if (cachedWebView !== undefined) return cachedWebView;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rnw = require('react-native-webview');
    cachedWebView = rnw.WebView || rnw.default || null;
  } catch (_e) {
    cachedWebView = null;
  }
  return cachedWebView;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface InAppEmbedModalProps {
  visible: boolean;
  url: string | null;
  title?: string;
  onClose: () => void;
}

export function parseEmbedUrl(rawUrl: string | null): {
  type: 'youtube' | 'google_docs' | 'image' | 'webview';
  embedUrl: string;
  label: string;
  icon: string;
} {
  if (!rawUrl) {
    return { type: 'webview', embedUrl: '', label: 'Tautan', icon: 'web' };
  }
  const cleanUrl = rawUrl.trim();

  // YouTube
  const ytMatch = cleanUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  if (ytMatch && ytMatch[1]) {
    return {
      type: 'youtube',
      embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&playsinline=1`,
      label: 'YouTube Video',
      icon: 'youtube',
    };
  }

  // Google Drive & Docs Preview
  if (cleanUrl.includes('drive.google.com') || cleanUrl.includes('docs.google.com')) {
    let previewUrl = cleanUrl;
    if (previewUrl.includes('/view')) {
      previewUrl = previewUrl.replace(/\/view(\?.*)?$/, '/preview');
    } else if (previewUrl.includes('/edit')) {
      previewUrl = previewUrl.replace(/\/edit(\?.*)?$/, '/preview');
    } else if (!previewUrl.includes('/preview')) {
      previewUrl = previewUrl.includes('?') ? `${previewUrl}&embedded=true` : `${previewUrl}?embedded=true`;
    }
    return {
      type: 'google_docs',
      embedUrl: previewUrl,
      label: 'Google Dokumen',
      icon: 'file-document-outline',
    };
  }

  // Direct Image
  if (/\.(jpeg|jpg|png|gif|webp|bmp)(\?.*)?$/i.test(cleanUrl)) {
    return {
      type: 'image',
      embedUrl: cleanUrl,
      label: 'Gambar / Foto',
      icon: 'image-outline',
    };
  }

  return {
    type: 'webview',
    embedUrl: cleanUrl,
    label: 'Tautan Berkas',
    icon: 'open-in-app',
  };
}

export default function InAppEmbedModal({
  visible,
  url,
  title = 'Pratinjau Berkas & Tautan',
  onClose,
}: InAppEmbedModalProps) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const embedInfo = useMemo(() => parseEmbedUrl(url), [url]);

  if (!visible || !url) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
        {/* Header Bar */}
        <LinearGradient
          colors={['#047857', '#059669', '#10B981']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.header}
        >
          <View style={styles.headerLeft}>
            <View style={styles.iconCircle}>
              <MaterialCommunityIcons name={embedInfo.icon as any} size={18} color="#047857" />
            </View>
            <View style={styles.headerTitleWrap}>
              <Text numberOfLines={1} style={styles.headerTitle}>
                {title || 'Pratinjau Berkas'}
              </Text>
              <View style={styles.badgeRow}>
                <View style={styles.typeBadge}>
                  <Text style={styles.typeBadgeText}>{embedInfo.label}</Text>
                </View>
                <Text numberOfLines={1} style={styles.headerSubUrl}>
                  {url.replace(/^https?:\/\//, '')}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.headerRight}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                void Linking.openURL(embedInfo.embedUrl || url).catch(() => {});
              }}
              style={styles.headerBtn}
              accessibilityLabel="Buka di Peramban"
            >
              <MaterialCommunityIcons name="open-in-new" size={18} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                setLoading(true);
                setHasError(false);
                setReloadKey((k) => k + 1);
              }}
              style={styles.headerBtn}
              accessibilityLabel="Muat Ulang"
            >
              <MaterialCommunityIcons name="refresh" size={20} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onClose}
              style={[styles.headerBtn, styles.closeBtn]}
              accessibilityLabel="Tutup Pratinjau"
            >
              <MaterialCommunityIcons name="close" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Content Body */}
        <View style={styles.body}>
          {embedInfo.type === 'image' ? (
            <View style={styles.imageContainer}>
              {loading && (
                <View style={styles.loadingOverlay}>
                  <ActivityIndicator size="large" color="#059669" />
                  <Text style={styles.loadingText}>Memuat gambar...</Text>
                </View>
              )}
              <Image
                source={{ uri: embedInfo.embedUrl }}
                style={styles.fullImage}
                resizeMode="contain"
                onLoadStart={() => setLoading(true)}
                onLoadEnd={() => setLoading(false)}
                onError={() => {
                  setLoading(false);
                  setHasError(true);
                }}
              />
            </View>
          ) : getWebViewComponent() ? (
            (() => {
              const WebViewComponent = getWebViewComponent();
              return (
                <View style={styles.webViewWrap}>
                  <WebViewComponent
                    key={reloadKey}
                    source={{ uri: embedInfo.embedUrl }}
                    style={styles.webView}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    allowsInlineMediaPlayback={true}
                    mediaPlaybackRequiresUserAction={false}
                    startInLoadingState={true}
                    renderLoading={() => (
                      <View style={styles.loadingOverlay}>
                        <ActivityIndicator size="large" color="#059669" />
                        <Text style={styles.loadingText}>Memuat pratinjau in-app...</Text>
                      </View>
                    )}
                    onError={() => {
                      setLoading(false);
                      setHasError(true);
                    }}
                    onLoadEnd={() => setLoading(false)}
                  />
                </View>
              );
            })()
          ) : (
            <View style={styles.fallbackContainer}>
              <View style={styles.fallbackIconCircle}>
                <MaterialCommunityIcons name={embedInfo.icon as any} size={44} color="#059669" />
              </View>
              <Text style={styles.fallbackTitle}>{title || embedInfo.label}</Text>
              <Text numberOfLines={2} style={styles.fallbackUrl}>
                {url}
              </Text>
              <Text style={styles.fallbackDesc}>
                Pratinjau internal membutuhkan modul WebView native. Anda dapat membuka berkas atau tautan ini langsung melalui peramban atau aplikasi eksternal.
              </Text>
              <TouchableOpacity
                style={styles.openExternalActionBtn}
                activeOpacity={0.8}
                onPress={() => {
                  void Linking.openURL(embedInfo.embedUrl || url).catch(() => {});
                }}
              >
                <MaterialCommunityIcons name="open-in-new" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.openExternalActionBtnText}>Buka di Peramban Eksternal</Text>
              </TouchableOpacity>
            </View>
          )}

          {hasError && (
            <View style={styles.errorOverlay}>
              <MaterialCommunityIcons name="alert-circle-outline" size={44} color="#DC2626" />
              <Text style={styles.errorTitle}>Pratinjau Tidak Dapat Dimuat</Text>
              <Text style={styles.errorSubtitle}>
                Tautan mungkin membutuhkan izin akses akun atau pembatasan privasi server.
              </Text>
              <TouchableOpacity
                style={styles.retryBtn}
                activeOpacity={0.8}
                onPress={() => {
                  setHasError(false);
                  setLoading(true);
                  setReloadKey((k) => k + 1);
                }}
              >
                <MaterialCommunityIcons name="reload" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.retryBtnText}>Coba Lagi</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Safe Area Bottom Bar */}
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.bottomBarLeft}>
            <MaterialCommunityIcons name="shield-check-outline" size={16} color="#059669" />
            <Text style={styles.bottomBarText}>Pratinjau Aman Dalam Aplikasi (In-App Sandbox)</Text>
          </View>
          <TouchableOpacity
            style={styles.bottomCloseBtn}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <Text style={styles.bottomCloseBtnText}>Tutup</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.15)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 6,
  },
  typeBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerSubUrl: {
    fontSize: 10,
    color: '#D1FAE5',
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    backgroundColor: 'rgba(225, 29, 72, 0.85)',
  },
  body: {
    flex: 1,
    backgroundColor: '#0F172A',
    position: 'relative',
  },
  webViewWrap: {
    flex: 1,
  },
  webView: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  imageContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#020617',
  },
  fullImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.75,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
  },
  errorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 20,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 12,
    marginBottom: 6,
  },
  errorSubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  bottomBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
    gap: 6,
  },
  bottomBarText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  bottomCloseBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  bottomCloseBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  fallbackContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  fallbackIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#059669',
  },
  fallbackTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 8,
  },
  fallbackUrl: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 16,
  },
  fallbackDesc: {
    fontSize: 13,
    color: '#CBD5E1',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    maxWidth: 340,
  },
  openExternalActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  openExternalActionBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

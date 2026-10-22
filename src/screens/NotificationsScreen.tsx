import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileApiService, unwrapCollection } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { useNotificationBadgeStore } from '../stores/notificationBadgeStore';
import { offlineCache } from '../utils/offlineCache';
import { AppFeedbackModal, FeedbackType } from '../components/AppFeedbackModal';
import { EmptyStateCard } from '../components/EmptyStateCard';

export default function NotificationsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 0);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [filterMode, setFilterMode] = useState<'unread' | 'all'>('unread');
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
  } | null>(null);
  const userId = useAuthStore((state) => state.user?.id);

  const load = useCallback(async () => {
    setLoading(true);
    // 1. Baca cache dulu — tampil instan saat offline
    const cacheKey = offlineCache.buildKey('notifications', userId);
    const cached = await offlineCache.get<any[]>(cacheKey);
    if (cached && cached.length > 0) {
      setItems(cached);
    }
    // 2. Fetch dari backend
    try {
      const res = await mobileApiService.getNotifications({ per_page: 50 });
      const fresh = unwrapCollection(res);
      const list = Array.isArray(fresh) ? fresh : [];
      setItems(list);
      const unread = list.filter((item: any) => !item.read_at && !item.is_read).length;
      try {
        const countRes: any = await mobileApiService.getUnreadNotificationCount();
        const serverCount = Number(
          countRes?.data?.unread_count ??
          countRes?.unread_count ??
          (typeof countRes === 'number' ? countRes : 0)
        );
        useNotificationBadgeStore.getState().setUnreadNotificationCount(Math.max(unread, serverCount));
      } catch {
        useNotificationBadgeStore.getState().setUnreadNotificationCount(unread);
      }
      // 3. Simpan ke cache
      if (list.length > 0) {
        void offlineCache.set(cacheKey, list);
      }
    } catch {
      // Fetch daftar gagal: validasi ulang badge langsung dari endpoint count server
      try {
        const countRes: any = await mobileApiService.getUnreadNotificationCount();
        const count =
          countRes?.unread_count ?? (typeof countRes === 'number' ? countRes : null);
        if (typeof count === 'number') {
          useNotificationBadgeStore.getState().setUnreadNotificationCount(count);
        }
      } catch {
        // Offline: tetap tampilkan cache dari step 1
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Muat ulang setiap kali tab dibuka (bottom-tab tidak me-remount screen)
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const unreadCount = items.filter((item) => !item.read_at && !item.is_read).length;

  const handleMarkAllRead = async () => {
    if (unreadCount === 0 || markingAll) return;
    setMarkingAll(true);
    try {
      await mobileApiService.markAllNotificationsRead();
      // Also try marking school announcements if available
      try {
        await mobileApiService.markAllSchoolInformationRead();
      } catch {}

      // Update all items locally to read
      const updated = items.map((item) => ({
        ...item,
        read_at: item.read_at || new Date().toISOString(),
        is_read: true,
      }));
      setItems(updated);
      const cacheKey = offlineCache.buildKey('notifications', userId);
      void offlineCache.set(cacheKey, updated);
      useNotificationBadgeStore.getState().clearUnread();
    } catch (err) {
      console.log('Error marking all notifications as read:', err);
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Menandai Dibaca',
        message: 'Gagal menandai semua notifikasi. Silakan periksa koneksi internet Anda dan coba lagi.',
      });
    } finally {
      setMarkingAll(false);
    }
  };

  const markItemAsReadLocallyAndRemote = async (item: any) => {
    if (item.read_at || item.is_read) return;
    try {
      await mobileApiService.markNotificationRead(item.id);
    } catch (err) {
      console.log('Error marking item as read on backend:', err);
    }

    setItems((prev) => {
      const updated = prev.map((i) =>
        i.id === item.id
          ? { ...i, read_at: new Date().toISOString(), is_read: true }
          : i
      );
      const cacheKey = offlineCache.buildKey('notifications', userId);
      void offlineCache.set(cacheKey, updated);
      return updated;
    });

    const cur = useNotificationBadgeStore.getState().unreadNotificationCount;
    useNotificationBadgeStore.getState().setUnreadNotificationCount(Math.max(0, cur - 1));
  };

  const handleDismissItem = async (item: any) => {
    await markItemAsReadLocallyAndRemote(item);
  };

  const handleItemPress = async (item: any) => {
    // 1. Mark this specific item as read (sehingga otomatis hilang jika di tab Belum Dibaca)
    await markItemAsReadLocallyAndRemote(item);

    // 2. If it's a chat notification, navigate directly to Chat Guru screen
    const isChat =
      item.type?.includes('chat') ||
      item.channel === 'chat' ||
      item.data?.screen === 'Chat' ||
      item.metadata?.screen === 'Chat' ||
      item.data?.teacherId ||
      item.metadata?.teacherId ||
      (item.title && item.title.toLowerCase().includes('pesan'));

    if (isChat) {
      const teacherId = item.data?.teacherId || item.metadata?.teacherId;
      const studentId = item.data?.studentId || item.metadata?.studentId;
      navigation?.navigate('Chat Guru', { teacherId, studentId });
    }
  };

  const getIconName = (item: any) => {
    const type = (item.type || item.channel || '').toLowerCase();
    if (type.includes('chat') || item.data?.teacherId || (item.title && item.title.toLowerCase().includes('pesan'))) {
      return 'chat-processing-outline';
    }
    if (type.includes('attendance') || type.includes('presensi')) {
      return 'calendar-check-outline';
    }
    if (type.includes('finance') || type.includes('bill') || type.includes('tagihan')) {
      return 'cash-multiple';
    }
    return 'bell-outline';
  };

  const displayedItems = filterMode === 'unread'
    ? items.filter((item) => !item.read_at && !item.is_read)
    : items;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: topInset + 18 }]}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={load}
          colors={['#059669']}
          progressViewOffset={topInset + 10}
        />
      }
    >
      {/* Header with Title and "Baca Semua" Action */}
      <View style={styles.headerRow}>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>PUSAT INFORMASI</Text>
          <Text style={styles.title}>Notifikasi</Text>
          <Text style={styles.subtitle}>
            {unreadCount > 0
              ? `${unreadCount} notifikasi baru belum dibuka.`
              : 'Semua notifikasi telah dibaca.'}
          </Text>
        </View>

        {unreadCount > 0 && (
          <TouchableOpacity
            style={styles.markAllBtn}
            onPress={handleMarkAllRead}
            disabled={markingAll}
            activeOpacity={0.8}
          >
            {markingAll ? (
              <ActivityIndicator size="small" color="#059669" />
            ) : (
              <>
                <MaterialCommunityIcons name="check-all" size={16} color="#059669" />
                <Text style={styles.markAllBtnText}>Baca Semua</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Tabs: Belum Dibaca vs Semua */}
      <View style={styles.tabFilterBar}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setFilterMode('unread')}
          style={[styles.tabFilterBtn, filterMode === 'unread' && styles.tabFilterBtnActive]}
        >
          <MaterialCommunityIcons
            name="bell-ring-outline"
            size={14}
            color={filterMode === 'unread' ? '#FFFFFF' : '#059669'}
          />
          <Text style={[styles.tabFilterText, filterMode === 'unread' && styles.tabFilterTextActive]}>
            Belum Dibaca
          </Text>
          {unreadCount > 0 && (
            <View style={[styles.tabBadge, filterMode === 'unread' && styles.tabBadgeActive]}>
              <Text style={[styles.tabBadgeText, filterMode === 'unread' && styles.tabBadgeTextActive]}>
                {unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setFilterMode('all')}
          style={[styles.tabFilterBtn, filterMode === 'all' && styles.tabFilterBtnActive]}
        >
          <MaterialCommunityIcons
            name="format-list-bulleted"
            size={14}
            color={filterMode === 'all' ? '#FFFFFF' : '#64748B'}
          />
          <Text style={[styles.tabFilterText, filterMode === 'all' && styles.tabFilterTextActive]}>
            Semua
          </Text>
          <View style={[styles.tabBadge, filterMode === 'all' && styles.tabBadgeActive]}>
            <Text style={[styles.tabBadgeText, filterMode === 'all' && styles.tabBadgeTextActive]}>
              {items.length}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Notifications List */}
      {loading && !items.length ? (
        <ActivityIndicator color="#059669" style={styles.loader} />
      ) : displayedItems.length ? (
        displayedItems.map((item, index) => {
          const isUnread = !item.read_at && !item.is_read;
          const isChat =
            item.type?.includes('chat') ||
            item.channel === 'chat' ||
            item.data?.teacherId ||
            (item.title && item.title.toLowerCase().includes('pesan'));

          return (
            <TouchableOpacity
              key={String(item.id || index)}
              activeOpacity={0.85}
              onPress={() => handleItemPress(item)}
            >
              <View
                style={[styles.card, isUnread && styles.cardUnread]}
              >
                <View style={[styles.icon, isUnread && styles.iconUnread]}>
                  <MaterialCommunityIcons
                    name={getIconName(item)}
                    size={22}
                    color={isUnread ? '#059669' : '#64748B'}
                  />
                </View>
                <View style={styles.copy}>
                  <View style={styles.row}>
                    <Text
                      style={[styles.itemTitle, isUnread && styles.itemTitleUnread]}
                      numberOfLines={1}
                    >
                      {item.title || item.judul || 'Informasi Sekolah'}
                    </Text>
                    {isUnread && <View style={styles.dot} />}
                  </View>

                  <Text style={styles.message} numberOfLines={2}>
                    {item.message ||
                      item.body ||
                      item.data?.message ||
                      'Ada pembaruan informasi untuk Anda.'}
                  </Text>

                  <View style={styles.metaRow}>
                    <Text style={styles.date}>
                      {item.created_at
                        ? new Date(item.created_at).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Hari ini'}
                    </Text>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {isChat && (
                        <View style={styles.chatBadge}>
                          <MaterialCommunityIcons
                            name="chat-outline"
                            size={11}
                            color="#059669"
                          />
                          <Text style={styles.chatBadgeText}>Buka Chat</Text>
                        </View>
                      )}

                      {/* Tombol Cepat Selesai/Tandai Dibaca agar langsung hilang */}
                      {isUnread && (
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => void handleDismissItem(item)}
                          style={styles.quickCheckBtn}
                          accessibilityLabel="Tandai dibaca"
                        >
                          <MaterialCommunityIcons name="check" size={13} color="#059669" />
                          <Text style={styles.quickCheckText}>Selesai</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          );
        })
      ) : filterMode === 'unread' ? (
        <View style={styles.allReadCard}>
          <View style={styles.allReadIconCircle}>
            <MaterialCommunityIcons name="check-decagram" size={34} color="#059669" />
          </View>
          <Text style={styles.allReadTitle}>Semua Notifikasi Telah Dibuka</Text>
          <Text style={styles.allReadDesc}>
            Alhamdulillah, seluruh notifikasi telah Anda lihat. Tidak ada pemberitahuan baru yang tertunda.
          </Text>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setFilterMode('all')}
            style={styles.allReadHistoryBtn}
          >
            <MaterialCommunityIcons name="history" size={16} color="#059669" />
            <Text style={styles.allReadHistoryBtnText}>Lihat Riwayat Semua Notifikasi</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <EmptyStateCard
          icon="bell-sleep-outline"
          title="Belum Ada Notifikasi"
          description="Informasi terbaru dan pengumuman sekolah akan muncul di halaman ini."
        />
      )}

      {feedbackModal && (
        <AppFeedbackModal
          visible={feedbackModal.visible}
          type={feedbackModal.type || 'info'}
          title={feedbackModal.title}
          message={feedbackModal.message}
          onClose={() => setFeedbackModal(null)}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  heading: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#059669',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 3,
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    marginTop: 10,
    gap: 4,
  },
  markAllBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#059669',
  },
  loader: {
    marginTop: 44,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardUnread: {
    borderColor: '#A7F3D0',
    backgroundColor: '#F0FDF4',
    borderLeftWidth: 4,
    borderLeftColor: '#059669',
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconUnread: {
    backgroundColor: '#DEF7EC',
  },
  copy: {
    flex: 1,
    marginLeft: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  itemTitleUnread: {
    fontWeight: '800',
    color: '#0F172A',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    marginLeft: 6,
  },
  message: {
    fontSize: 12,
    lineHeight: 17,
    color: '#64748B',
    marginTop: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  date: {
    fontSize: 10.5,
    color: '#94A3B8',
    fontWeight: '600',
  },
  chatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: 3,
  },
  chatBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 70,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#273B35',
    marginTop: 14,
  },
  emptyText: {
    fontSize: 12,
    color: '#82908C',
    marginTop: 4,
  },
  tabFilterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    backgroundColor: '#F1F5F9',
    padding: 4,
    borderRadius: 14,
  },
  tabFilterBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 11,
    backgroundColor: 'transparent',
  },
  tabFilterBtnActive: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tabFilterText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  tabFilterTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  tabBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
  },
  tabBadgeActive: {
    backgroundColor: '#047857',
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
  },
  tabBadgeTextActive: {
    color: '#ECFDF5',
  },
  quickCheckBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  quickCheckText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#059669',
  },
  allReadCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    marginVertical: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  allReadIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#ECFDF5',
    borderWidth: 2,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  allReadTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
  },
  allReadDesc: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  allReadHistoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
  },
  allReadHistoryBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#059669',
  },
});

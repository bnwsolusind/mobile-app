import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Surface, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { mobileApiService, unwrapCollection } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { offlineCache } from '../utils/offlineCache';

export default function NotificationsScreen({ navigation }: any) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
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
      setItems(Array.isArray(fresh) ? fresh : []);
      // 3. Simpan ke cache
      if (Array.isArray(fresh) && fresh.length > 0) {
        void offlineCache.set(cacheKey, fresh);
      }
    } catch {
      // Offline: tetap tampilkan cache dari step 1
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

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
      setItems((prev) =>
        prev.map((item) => ({
          ...item,
          read_at: item.read_at || new Date().toISOString(),
          is_read: true,
        }))
      );
    } catch (err) {
      console.log('Error marking all notifications as read:', err);
      Alert.alert('Info', 'Gagal menandai semua notifikasi. Silakan coba lagi.');
    } finally {
      setMarkingAll(false);
    }
  };

  const handleItemPress = async (item: any) => {
    // 1. Mark this specific item as read if unread
    if (!item.read_at && !item.is_read) {
      try {
        await mobileApiService.markNotificationRead(item.id);
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, read_at: new Date().toISOString(), is_read: true }
              : i
          )
        );
      } catch (err) {
        console.log('Error marking item as read:', err);
      }
    }

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

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={load} colors={['#087A5A']} />
      }
    >
      {/* Header with Title and "Baca Semua" Action */}
      <View style={styles.headerRow}>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>PUSAT INFORMASI</Text>
          <Text style={styles.title}>Notifikasi</Text>
          <Text style={styles.subtitle}>
            {unreadCount > 0
              ? `${unreadCount} notifikasi belum dibaca.`
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
              <ActivityIndicator size="small" color="#087A5A" />
            ) : (
              <>
                <MaterialCommunityIcons name="check-all" size={16} color="#087A5A" />
                <Text style={styles.markAllBtnText}>Baca Semua</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Notifications List */}
      {loading && !items.length ? (
        <ActivityIndicator color="#087A5A" style={styles.loader} />
      ) : items.length ? (
        items.map((item, index) => {
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
              <Surface
                style={[styles.card, isUnread && styles.cardUnread]}
                elevation={0}
              >
                <View style={[styles.icon, isUnread && styles.iconUnread]}>
                  <MaterialCommunityIcons
                    name={getIconName(item)}
                    size={22}
                    color={isUnread ? '#087A5A' : '#71807C'}
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

                    {isChat && (
                      <View style={styles.chatBadge}>
                        <MaterialCommunityIcons
                          name="chat-outline"
                          size={11}
                          color="#087A5A"
                        />
                        <Text style={styles.chatBadgeText}>Buka Chat</Text>
                      </View>
                    )}
                  </View>
                </View>
              </Surface>
            </TouchableOpacity>
          );
        })
      ) : (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="bell-sleep-outline" size={48} color="#A7B5B1" />
          <Text style={styles.emptyTitle}>Belum ada notifikasi</Text>
          <Text style={styles.emptyText}>Informasi terbaru akan muncul di halaman ini.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7FAF9',
  },
  content: {
    padding: 18,
    paddingBottom: 34,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  heading: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: '#087A5A',
  },
  title: {
    fontSize: 27,
    fontWeight: '900',
    color: '#10231E',
    marginTop: 3,
  },
  subtitle: {
    fontSize: 12,
    color: '#71807C',
    marginTop: 4,
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6F4F0',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C2E5D9',
    marginTop: 14,
    gap: 4,
  },
  markAllBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#087A5A',
  },
  loader: {
    marginTop: 44,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E7EEEB',
  },
  cardUnread: {
    borderColor: '#A4E0CA',
    backgroundColor: '#FAFCFB',
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#F1F5F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconUnread: {
    backgroundColor: '#DDF7EC',
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
    color: '#273B35',
  },
  itemTitleUnread: {
    fontWeight: '800',
    color: '#10231E',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    marginLeft: 6,
  },
  message: {
    fontSize: 11.5,
    lineHeight: 17,
    color: '#63716D',
    marginTop: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  date: {
    fontSize: 10,
    color: '#9AA7A3',
  },
  chatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6F4F0',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 3,
  },
  chatBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#087A5A',
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
});

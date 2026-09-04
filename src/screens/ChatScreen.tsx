import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { mobileApiService } from '../services/mobileApiService';

type Contact = {
  user_id: string;
  name: string;
  role: string;
  teacher_type: string;
  subject: string;
  class_name: string;
  unit_name: string;
  student_name: string;
  unread_count?: number;
  last_message?: string;
  last_message_at?: string;
  is_online?: boolean;
  status?: string;
};

type Message = {
  id: string;
  sender_user_id: string;
  recipient_user_id: string;
  message: string;
  created_at: string;
};

const unwrap = <T,>(response: any): T => response?.data?.data ?? response?.data ?? response;

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 16);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 18 : 10);
  // Tab bar acts as grounded footer

  const [children, setChildren] = useState<any[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const loadContacts = useCallback(async (targetChildId?: string) => {
    setLoading(true);
    try {
      const childRes = await mobileApiService.getPortalChildren();
      const availableChildren = unwrap<any[]>(childRes) || [];
      setChildren(availableChildren);

      const activeChildId = targetChildId || selectedChildId || availableChildren[0]?.id;
      if (activeChildId) {
        setSelectedChildId(String(activeChildId));
        const contactRes = await mobileApiService.getChatContacts(String(activeChildId));
        const rawList = unwrap<Contact[]>(contactRes) || [];

        // Strictly keep ONLY Wali Kelas and Guru Mata Pelajaran
        const filtered = rawList.filter((c) => {
          const role = (c.role || '').toLowerCase();
          const type = (c.teacher_type || '').toLowerCase();
          return role.includes('wali kelas') || role.includes('guru') || type === 'wali_kelas' || type === 'guru_mapel';
        });

        // Sort so Wali Kelas appears first, followed by subject teachers
        filtered.sort((a, b) => {
          if (a.teacher_type === 'wali_kelas' || a.role.toLowerCase().includes('wali')) return -1;
          if (b.teacher_type === 'wali_kelas' || b.role.toLowerCase().includes('wali')) return 1;
          return a.name.localeCompare(b.name);
        });

        setContacts(filtered);
      }
    } catch (err) {
      console.log('Error loading chat contacts:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedChildId]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const handleSelectChild = (childId: string) => {
    setSelectedChildId(childId);
    setSelectedContact(null);
    loadContacts(childId);
  };

  const loadMessages = useCallback(async () => {
    if (!selectedContact || !selectedChildId) return;
    setMessagesLoading(true);
    try {
      const targetId = selectedContact.user_id;
      const res = await mobileApiService.getChatMessages(targetId, selectedChildId);
      setMessages(unwrap<Message[]>(res) || []);
    } catch (err) {
      console.log('Error loading messages:', err);
    } finally {
      setMessagesLoading(false);
    }
  }, [selectedContact, selectedChildId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const handleSend = async () => {
    if (!inputText.trim() || !selectedContact || !selectedChildId || sending) return;
    setSending(true);
    try {
      await mobileApiService.sendChatMessage(selectedContact.user_id, selectedChildId, inputText.trim());
      setInputText('');
      loadMessages();
      loadContacts(selectedChildId);
    } catch (err) {
      console.log('Error sending message:', err);
    } finally {
      setSending(false);
    }
  };

  const currentChild = children.find((c) => String(c.id) === String(selectedChildId)) || children[0];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Emerald Header with Safe Area Insets */}
      <View style={[styles.header, { paddingTop: topInset + 10 }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerBadge}>
            <MaterialCommunityIcons name="chat-processing" size={20} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Komunikasi Guru</Text>
            <Text style={styles.headerSubtitle}>Wali Kelas & Guru Mata Pelajaran Santri</Text>
          </View>
        </View>

        {/* Multi-child Switcher Bar */}
        {children.length > 0 && (
          <View style={styles.childSelectorRow}>
            {children.map((c) => {
              const active = String(selectedChildId) === String(c.id);
              return (
                <TouchableOpacity
                  key={c.id}
                  activeOpacity={0.8}
                  onPress={() => handleSelectChild(String(c.id))}
                  style={[styles.childChip, active && styles.childChipActive]}
                >
                  <MaterialCommunityIcons
                    name="account-circle"
                    size={15}
                    color={active ? '#084835' : '#D1FAE5'}
                    style={{ marginRight: 5 }}
                  />
                  <Text numberOfLines={1} style={[styles.childChipText, active && styles.childChipTextActive]}>
                    {c.full_name || c.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* Main Layout: Contacts List or 1-on-1 Chat Room */}
      {!selectedContact ? (
        <View style={{ flex: 1 }}>
          {/* Subheader info showing active child context */}
          <View style={styles.contextBar}>
            <MaterialCommunityIcons name="account-school" size={18} color="#084835" />
            <Text style={styles.contextBarText}>
              Kontak Pendidik untuk: <Text style={{ fontWeight: '900', color: '#084835' }}>{currentChild?.full_name || 'Santri'}</Text> ({currentChild?.kelas?.nama_kelas || 'Kelas'})
            </Text>
          </View>

          <FlatList
            data={contacts}
            keyExtractor={(item) => String(item.user_id)}
            contentContainerStyle={[styles.listContainer, { paddingBottom: 24 }]}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={() => loadContacts(selectedChildId)} tintColor="#084835" />}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <MaterialCommunityIcons name="account-search-outline" size={56} color="#CBD5E1" />
                <Text style={styles.emptyTitle}>Belum Ada Kontak Guru</Text>
                <Text style={styles.emptySubtitle}>
                  Kontak wali kelas dan guru mata pelajaran untuk ananda sedang diselaraskan dengan jadwal akademik.
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const isWali = item.teacher_type === 'wali_kelas' || item.role.toLowerCase().includes('wali');
              const isOnline = Boolean(item.is_online);
              return (
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[styles.contactCard, isWali && styles.contactCardWali]}
                  onPress={() => setSelectedContact(item)}
                >
                  <View style={styles.avatarContainer}>
                    <View style={[styles.avatar, isWali && styles.avatarWali]}>
                      <Text style={styles.avatarText}>{(item.name || 'G')[0].toUpperCase()}</Text>
                    </View>
                    {/* Online (Hijau) / Offline (Merah) Status Dot */}
                    <View style={[styles.statusDot, isOnline ? styles.dotOnline : styles.dotOffline]} />
                  </View>
                  <View style={styles.contactInfo}>
                    <View style={styles.contactNameRow}>
                      <Text numberOfLines={1} style={styles.contactName}>{item.name}</Text>
                      <View style={styles.badgeRow}>
                        {isOnline ? (
                          <View style={styles.onlineBadge}>
                            <View style={styles.miniDotOnline} />
                            <Text style={styles.onlineBadgeText}>Online</Text>
                          </View>
                        ) : (
                          <View style={styles.offlineBadge}>
                            <View style={styles.miniDotOffline} />
                            <Text style={styles.offlineBadgeText}>Offline</Text>
                          </View>
                        )}
                        {isWali ? (
                          <View style={styles.waliBadge}>
                            <MaterialCommunityIcons name="star" size={11} color="#FFFFFF" style={{ marginRight: 3 }} />
                            <Text style={styles.waliBadgeText}>Wali Kelas</Text>
                          </View>
                        ) : (
                          <View style={styles.mapelBadge}>
                            <Text style={styles.mapelBadgeText}>Guru Mapel</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <Text numberOfLines={1} style={styles.contactSubject}>
                      {item.subject || 'Mata Pelajaran'} · {item.class_name || 'Kelas'}
                    </Text>

                    {item.last_message ? (
                      <Text style={styles.lastMsg} numberOfLines={1}>
                        {item.last_message}
                      </Text>
                    ) : (
                      <Text style={styles.tapToChatText}>Ketuk untuk kirim pesan...</Text>
                    )}
                  </View>

                  <MaterialCommunityIcons name="chevron-right" size={22} color="#94A3B8" />
                </TouchableOpacity>
              );
            }}
          />
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
          style={styles.chatRoom}
        >
          {/* Chat Room Top Navigation Header */}
          <View style={styles.roomHeader}>
            <TouchableOpacity onPress={() => setSelectedContact(null)} style={styles.backButton}>
              <MaterialCommunityIcons name="arrow-left" size={22} color="#084835" />
            </TouchableOpacity>
            <View style={styles.roomInfo}>
              <View style={styles.roomNameRow}>
                <Text numberOfLines={1} style={styles.roomName}>{selectedContact.name}</Text>
                <View style={[styles.statusDotHeader, selectedContact.is_online ? styles.dotOnline : styles.dotOffline]} />
              </View>
              <View style={styles.roomSubRow}>
                <Text numberOfLines={1} style={styles.roomSub}>
                  {selectedContact.role} · {selectedContact.subject}
                </Text>
                <Text style={[styles.roomPresenceText, selectedContact.is_online ? styles.textOnline : styles.textOffline]}>
                  {selectedContact.is_online ? ' · Online' : ' · Offline'}
                </Text>
              </View>
            </View>
          </View>

          {/* Messages Area */}
          {messagesLoading ? (
            <View style={styles.messagesLoadingBox}>
              <ActivityIndicator color="#084835" size="small" />
              <Text style={styles.messagesLoadingText}>Memuat percakapan...</Text>
            </View>
          ) : (
            <FlatList
              data={messages}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.msgList}
              ListEmptyComponent={
                <View style={styles.emptyChatBox}>
                  <MaterialCommunityIcons name="chat-processing-outline" size={48} color="#CBD5E1" />
                  <Text style={styles.emptyChatTitle}>Mulai Percakapan</Text>
                  <Text style={styles.emptyChatSub}>
                    Kirimkan pesan langsung kepada {selectedContact.name} perihal ananda {currentChild?.full_name}.
                  </Text>
                </View>
              }
              renderItem={({ item }) => {
                const isOwn = item.sender_user_id !== selectedContact.user_id;
                return (
                  <View style={[styles.msgBubble, isOwn ? styles.ownBubble : styles.otherBubble]}>
                    <Text style={[styles.msgText, isOwn && styles.ownMsgText]}>{item.message}</Text>
                    <Text style={[styles.msgTime, isOwn && styles.ownMsgTime]}>
                      {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                );
              }}
            />
          )}

          {/* Composer Input Bar - Positioned Safely Above Floating Bottom Tabs */}
          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Tulis pesan untuk guru..."
              placeholderTextColor="#94A3B8"
              multiline
            />
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleSend}
              disabled={!inputText.trim() || sending}
              style={[styles.sendBtn, (!inputText.trim() || sending) && styles.disabledBtn]}
            >
              <MaterialCommunityIcons name="send" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAF9' },
  header: {
    backgroundColor: '#084835',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#FFFFFF' },
  headerSubtitle: { fontSize: 11, color: '#D1FAE5', marginTop: 2 },
  childSelectorRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  childChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  childChipActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  childChipText: { fontSize: 11, color: '#D1FAE5', fontWeight: '700' },
  childChipTextActive: { color: '#084835', fontWeight: '900' },
  contextBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E6F4EA',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#D1EAE2',
  },
  contextBarText: { fontSize: 11, color: '#334155' },
  listContainer: { padding: 14, paddingBottom: 100 },
  emptyContainer: { padding: 40, alignItems: 'center' },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: '#475569', marginTop: 12 },
  emptySubtitle: { fontSize: 11, color: '#94A3B8', marginTop: 4, textAlign: 'center', lineHeight: 17 },
  contactCard: {
    flexDirection: 'row',
    padding: 14,
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
    borderRadius: 16,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  contactCardWali: {
    borderColor: '#059669',
    backgroundColor: '#F0FDF4',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#0D9488',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
  },
  statusDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  dotOnline: {
    backgroundColor: '#10B981',
  },
  dotOffline: {
    backgroundColor: '#EF4444',
  },
  statusDotHeader: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginLeft: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 4,
  },
  onlineBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#15803D',
  },
  miniDotOnline: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 4,
  },
  offlineBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#B91C1C',
  },
  miniDotOffline: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },
  roomNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  roomSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  roomPresenceText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  textOnline: {
    color: '#059669',
  },
  textOffline: {
    color: '#DC2626',
  },
  avatarWali: {
    backgroundColor: '#059669',
  },
  avatarText: { color: '#FFFFFF', fontWeight: '900', fontSize: 18 },
  contactInfo: { flex: 1 },
  contactNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  contactName: { fontSize: 13.5, fontWeight: '800', color: '#0F172A', flex: 1 },
  waliBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  waliBadgeText: { fontSize: 9.5, fontWeight: '800', color: '#FFFFFF' },
  mapelBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  mapelBadgeText: { fontSize: 9.5, fontWeight: '700', color: '#0284C7' },
  contactSubject: { fontSize: 11, color: '#64748B', fontWeight: '600', marginTop: 2 },
  lastMsg: { fontSize: 11, color: '#475569', marginTop: 4 },
  tapToChatText: { fontSize: 10.5, color: '#94A3B8', marginTop: 4, fontStyle: 'italic' },
  chatRoom: { flex: 1 },
  roomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E6F4EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomInfo: { flex: 1 },
  roomName: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  roomSub: { fontSize: 11, color: '#64748B', marginTop: 1 },
  messagesLoadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  messagesLoadingText: { fontSize: 12, color: '#64748B' },
  msgList: { padding: 16, paddingBottom: 24, gap: 8 },
  emptyChatBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 8 },
  emptyChatTitle: { fontSize: 14, fontWeight: '800', color: '#475569' },
  emptyChatSub: { fontSize: 11, color: '#94A3B8', textAlign: 'center', paddingHorizontal: 24, lineHeight: 16 },
  msgBubble: { maxWidth: '80%', padding: 12, borderRadius: 16 },
  ownBubble: { alignSelf: 'flex-end', backgroundColor: '#084835', borderBottomRightRadius: 3 },
  otherBubble: { alignSelf: 'flex-start', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderBottomLeftRadius: 3 },
  msgText: { fontSize: 13, color: '#0F172A', lineHeight: 18 },
  ownMsgText: { color: '#FFFFFF' },
  msgTime: { fontSize: 9, color: '#64748B', marginTop: 4, textAlign: 'right' },
  ownMsgTime: { color: 'rgba(255,255,255,0.7)' },
  composer: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 90,
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0F172A',
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#084835',
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledBtn: { opacity: 0.5 },
});

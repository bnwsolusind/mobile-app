import React, { useState, useRef, useEffect } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface PrincipalChatUser {
  id?: string | number;
  nama?: string;
  name?: string;
  role?: string;
  jabatan?: string;
  dept?: string;
  phone?: string;
  is_online?: boolean;
}

interface PrincipalChatModalProps {
  visible: boolean;
  onClose: () => void;
  targetUser: PrincipalChatUser | null;
}

interface ChatMessage {
  id: string | number;
  text: string;
  isMe: boolean;
  time: string;
}

export default function PrincipalChatModal({
  visible,
  onClose,
  targetUser,
}: PrincipalChatModalProps) {
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (visible) {
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 250);
    }
  }, [visible, messages]);

  if (!visible || !targetUser) return null;

  const displayName = targetUser.nama || targetUser.name || 'Rekan Kerja';
  const roleName = targetUser.role || targetUser.jabatan || 'Guru / Staf';
  const isOnline = Boolean(targetUser.is_online);

  const handleSendMessage = () => {
    if (!inputText.trim()) return;
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const newMsg: ChatMessage = {
      id: Date.now(),
      text: inputText.trim(),
      isMe: true,
      time: timeStr,
    };

    setMessages((prev) => [...prev, newMsg]);
    setInputText('');
  };

  const handleWhatsApp = () => {
    if (!targetUser.phone) return;
    const cleanPhone = String(targetUser.phone).replace(/\D/g, '').replace(/^0/, '62');
    Linking.openURL(`https://wa.me/${cleanPhone}`).catch(() => {});
  };

  const quickPrompts = [
    "Assalamu'alaikum",
    'Bisa koordinasi sebentar?',
    'Mohon konfirmasi presensi hari ini',
    'Terima kasih laporannya',
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <View style={styles.sheetContainer}>
          {/* Header */}
          <LinearGradient
            colors={['#047857', '#059669', '#0D9488']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.sheetHeader}
          >
            <View style={styles.headerLeft}>
              <View style={styles.avatarWrap}>
                <Text style={styles.avatarText}>{displayName.substring(0, 2).toUpperCase()}</Text>
                {isOnline && <View style={styles.onlineDot} />}
              </View>

              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.userName} numberOfLines={1}>{displayName}</Text>
                  <View style={[styles.badgeOnline, { backgroundColor: isOnline ? '#DEF7EC' : 'rgba(255,255,255,0.2)' }]}>
                    <Text style={[styles.badgeOnlineText, { color: isOnline ? '#059669' : '#FFFFFF' }]}>
                      {isOnline ? 'Online' : 'Offline'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.userRole} numberOfLines={1}>{roleName}</Text>
              </View>
            </View>

            <View style={styles.headerRightActions}>
              {targetUser.phone ? (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={handleWhatsApp}
                  style={styles.waIconBtn}
                  accessibilityLabel="WhatsApp"
                >
                  <MaterialCommunityIcons name="whatsapp" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity activeOpacity={0.7} onPress={onClose} style={styles.closeBtn}>
                <MaterialCommunityIcons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </LinearGradient>

          {/* Chat Messages */}
          <ScrollView
            ref={scrollRef}
            style={styles.messagesScroll}
            contentContainerStyle={styles.messagesContent}
          >
            {messages.length === 0 ? (
              <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 40, paddingHorizontal: 20 }}>
                <MaterialCommunityIcons name="chat-outline" size={40} color="#94A3B8" />
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748B', marginTop: 10 }}>Belum Ada Pesan</Text>
                <Text style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 4, lineHeight: 18 }}>
                  Mulai percakapan koordinasi dengan {displayName} menggunakan pesan di bawah.
                </Text>
              </View>
            ) : (
              messages.map((m) => (
                <View
                  key={m.id}
                  style={[styles.msgRow, m.isMe ? styles.msgRowMe : styles.msgRowThem]}
                >
                  <View
                    style={[
                      styles.msgBubble,
                      m.isMe ? styles.msgBubbleMe : styles.msgBubbleThem,
                    ]}
                  >
                    <Text style={[styles.msgSenderLabel, m.isMe ? { color: '#D1FAE5' } : { color: '#0369A1' }]}>
                      {m.isMe ? 'Anda (Kepala Sekolah)' : displayName}
                    </Text>
                    <Text style={[styles.msgText, m.isMe ? styles.msgTextMe : styles.msgTextThem]}>
                      {m.text}
                    </Text>
                    <Text style={[styles.msgTime, m.isMe ? styles.msgTimeMe : styles.msgTimeThem]}>
                      {m.time}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </ScrollView>

          {/* Quick Prompts Bar */}
          <View style={styles.quickPromptBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickPromptsRow}>
              {quickPrompts.map((q, idx) => (
                <TouchableOpacity
                  key={idx}
                  activeOpacity={0.7}
                  onPress={() => setInputText(q)}
                  style={styles.quickPromptPill}
                >
                  <Text style={styles.quickPromptPillText}>{q}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Input Box */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.inputField}
              placeholder={`Tulis pesan untuk ${displayName}...`}
              placeholderTextColor="#94A3B8"
              value={inputText}
              onChangeText={setInputText}
              multiline
            />
            <TouchableOpacity
              activeOpacity={0.8}
              disabled={!inputText.trim()}
              onPress={handleSendMessage}
              style={[styles.sendBtn, !inputText.trim() && { opacity: 0.5 }]}
            >
              <LinearGradient
                colors={['#059669', '#10B981']}
                style={styles.sendGradient}
              >
                <MaterialCommunityIcons name="send" size={18} color="#FFFFFF" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  avatarWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#059669',
  },
  onlineDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  userName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    flex: 1,
  },
  badgeOnline: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  badgeOnlineText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  userRole: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '600',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  waIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#25D366',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  messagesScroll: {
    maxHeight: 340,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 16,
  },
  messagesContent: {
    paddingVertical: 14,
    gap: 10,
  },
  msgRow: {
    flexDirection: 'row',
    width: '100%',
  },
  msgRowMe: {
    justifyContent: 'flex-end',
  },
  msgRowThem: {
    justifyContent: 'flex-start',
  },
  msgBubble: {
    maxWidth: '82%',
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  msgBubbleMe: {
    backgroundColor: '#059669',
    borderBottomRightRadius: 2,
  },
  msgBubbleThem: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderBottomLeftRadius: 2,
  },
  msgSenderLabel: {
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 2,
  },
  msgText: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  msgTextMe: {
    color: '#FFFFFF',
  },
  msgTextThem: {
    color: '#1E293B',
  },
  msgTime: {
    fontSize: 9.5,
    marginTop: 4,
    textAlign: 'right',
  },
  msgTimeMe: {
    color: 'rgba(255, 255, 255, 0.75)',
  },
  msgTimeThem: {
    color: '#94A3B8',
  },
  quickPromptBar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingVertical: 8,
  },
  quickPromptsRow: {
    paddingHorizontal: 16,
    gap: 8,
  },
  quickPromptPill: {
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 8,
  },
  quickPromptPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  inputField: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 12.5,
    color: '#1E293B',
    maxHeight: 80,
  },
  sendBtn: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  sendGradient: {
    width: 42,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

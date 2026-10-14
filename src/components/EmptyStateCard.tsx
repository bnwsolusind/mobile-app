import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export interface EmptyStateCardProps {
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  iconColor?: string;
  iconBgColor?: string;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}

export function EmptyStateCard({
  icon = 'folder-open-outline',
  title,
  description,
  actionLabel,
  onAction,
  iconColor = '#059669',
  iconBgColor = '#ECFDF5',
  style,
  compact = false,
}: EmptyStateCardProps) {
  if (compact) {
    return (
      <View style={[styles.compactContainer, style]}>
        <View style={[styles.compactIconWrap, { backgroundColor: iconBgColor }]}>
          <MaterialCommunityIcons name={icon} size={20} color={iconColor} />
        </View>
        <View style={styles.compactContent}>
          <Text style={styles.compactTitle}>{title}</Text>
          {Boolean(description) && (
            <Text style={styles.compactDesc} numberOfLines={2}>
              {description}
            </Text>
          )}
        </View>
        {Boolean(actionLabel && onAction) && (
          <TouchableOpacity activeOpacity={0.8} onPress={onAction} style={styles.compactActionBtn}>
            <Text style={styles.compactActionText}>{actionLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.iconCircle, { backgroundColor: iconBgColor }]}>
        <MaterialCommunityIcons name={icon} size={36} color={iconColor} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {Boolean(description) && (
        <Text style={styles.description}>{description}</Text>
      )}
      {Boolean(actionLabel && onAction) && (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onAction}
          style={styles.actionButton}
        >
          <MaterialCommunityIcons name="refresh" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.actionText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
    shadowColor: '#0E5C44',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 6,
  },
  description: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 290,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 16,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 2,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },

  // Compact variant
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginVertical: 4,
    gap: 12,
  },
  compactIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactContent: {
    flex: 1,
  },
  compactTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  compactDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  compactActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  compactActionText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#059669',
  },
});

export default EmptyStateCard;

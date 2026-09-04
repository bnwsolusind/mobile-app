import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

type Props = {
  title: string;
};

export default function SimpleScreen({ title }: Props) {
  return (
    <View style={styles.container}>
      <Text variant="headlineMedium" style={styles.title}>{title}</Text>
      <Text variant="bodyMedium" style={styles.subtitle}>Modul sedang disiapkan bertahap.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f4faf6',
    padding: 24,
  },
  title: {
    color: '#0f5132',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    color: '#334155',
    textAlign: 'center',
  },
});

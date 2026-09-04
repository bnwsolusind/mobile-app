import React, { Component, ErrorInfo, ReactNode } from 'react';
import { StyleSheet, Text, View, Image } from 'react-native';
import { Button } from 'react-native-paper';

type Props = {
  children: ReactNode;
  onReset?: () => void;
};

type State = {
  hasError: boolean;
  errorSnippet: string | null;
};

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorSnippet: null };
  }

  static getDerivedStateFromError(error: Error): State {
    // Sanitize error message to avoid exposing secrets, tokens, or paths
    let safeMessage = error.message || 'Terjadi kesalahan internal pada aplikasi.';
    safeMessage = safeMessage.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***');
    safeMessage = safeMessage.replace(/\/Applications\/[^\s]+/gi, '[internal path]');

    return {
      hasError: true,
      errorSnippet: safeMessage.slice(0, 150),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Silent safe log in development
    if (__DEV__) {
      console.warn('ErrorBoundary captured:', error.message, errorInfo.componentStack);
    }
  }

  handleReload = () => {
    this.setState({ hasError: false, errorSnippet: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Image
            source={require('../../assets/icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>Terjadi Kendala Sistem</Text>
          <Text style={styles.subtitle}>
            Aplikasi mengalami kendala saat memuat tampilan. Silakan coba muat ulang aplikasi.
          </Text>

          {this.state.errorSnippet && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{this.state.errorSnippet}</Text>
            </View>
          )}

          <Button
            mode="contained"
            buttonColor="#0E5C44"
            textColor="#FFFFFF"
            style={styles.button}
            onPress={this.handleReload}
          >
            Muat Ulang Aplikasi
          </Button>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  logo: {
    width: 80,
    height: 80,
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  errorBox: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 12,
    marginBottom: 24,
    width: '100%',
  },
  errorText: {
    fontSize: 12,
    color: '#475569',
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  button: {
    borderRadius: 12,
    paddingHorizontal: 16,
  },
});

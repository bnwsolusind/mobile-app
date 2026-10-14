import { SafeAreaProvider } from 'react-native-safe-area-context';
import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider, MD3LightTheme, configureFonts } from 'react-native-paper';
import { useFonts } from 'expo-font';
import * as ExpoSplashScreen from 'expo-splash-screen';
import { Poppins_400Regular } from '@expo-google-fonts/poppins/400Regular';
import { Poppins_600SemiBold } from '@expo-google-fonts/poppins/600SemiBold';
import { Poppins_700Bold } from '@expo-google-fonts/poppins/700Bold';
import { Nunito_400Regular } from '@expo-google-fonts/nunito/400Regular';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import BottomTabs from './src/navigation/BottomTabs';
import LoginScreen from './src/screens/LoginScreen';
import SplashScreen from './src/screens/SplashScreen';
import MaintenanceScreen from './src/screens/MaintenanceScreen';
import UpdateRequiredScreen from './src/screens/UpdateRequiredScreen';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import NetworkStatusBar from './src/components/NetworkStatusBar';
import { useAuthStore } from './src/stores/authStore';
import { useMobileConfigStore } from './src/stores/mobileConfigStore';
import { useServerConfigStore } from './src/stores/serverConfigStore';
import { isForceUpdateRequired } from './src/utils/semver';

const CURRENT_APP_VERSION = '1.0.0';

function isValidHex(color: string | undefined): boolean {
  if (!color || typeof color !== 'string') return false;
  return /^#[0-9A-Fa-f]{6}$/.test(color.trim());
}

export default function App() {
  const token = useAuthStore((state) => state.token);
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const hydrateAuth = useAuthStore((state) => state.hydrate);

  const [splashFinished, setSplashFinished] = useState(false);
  const handleSplashFinish = React.useCallback(() => {
    setSplashFinished(true);
  }, []);
  const [fontTimeout, setFontTimeout] = useState(false);
  const [forceHideSplash, setForceHideSplash] = useState(false);

  const config = useMobileConfigStore((state) => state.config);
  const configHydrated = useMobileConfigStore((state) => state.isHydrated);
  const hydrateConfig = useMobileConfigStore((state) => state.hydrate);
  const refreshConfig = useMobileConfigStore((state) => state.refresh);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
  });

  useEffect(() => {
    // 1. Hydrate auth session from storage
    void hydrateAuth();

    // 2. Hydrate dynamic server config, then hydrate & refresh app config
    void useServerConfigStore.getState().hydrate().then(() => {
      void hydrateConfig().then(() => {
        void refreshConfig();
      });
    });

    // 3. Pastikan splash screen native OS segera tertutup jika masih aktif
    void ExpoSplashScreen.hideAsync().catch(() => {});

    // 4. Font fallback timeout: batas cepat 1.2 detik agar tidak menghambat pembukaan aplikasi
    const fontTimer = setTimeout(() => setFontTimeout(true), 1200);

    // 5. Maximum splash timeout guard: jaminan transisi maksimal 2.2 detik (mencegah stuck)
    const maxSplashTimer = setTimeout(() => {
      setForceHideSplash(true);
      void ExpoSplashScreen.hideAsync().catch(() => {});
    }, 2200);

    return () => {
      clearTimeout(fontTimer);
      clearTimeout(maxSplashTimer);
    };
  }, []);

  const fontsReady = fontsLoaded || fontTimeout;
  const showingSplash = !forceHideSplash && (!isHydrated || !configHydrated || !splashFinished || !fontsReady);

  useEffect(() => {
    if (!showingSplash) {
      void ExpoSplashScreen.hideAsync().catch(() => {});
    }
  }, [showingSplash]);

  // Runtime Guards: Maintenance & Force Update
  const isMaintenance = Boolean(config.system?.maintenance_mode);
  const isForceUpdate = isForceUpdateRequired(
    CURRENT_APP_VERSION,
    config.system?.min_app_version || '1.0.0',
    Boolean(config.system?.force_update)
  );

  // Dynamic Theme & Safe Fallbacks
  const theme = config.theme;
  const primaryColor = isValidHex(theme.primary_color) ? theme.primary_color : '#0E5C44';
  const secondaryColor = isValidHex(theme.secondary_color) ? theme.secondary_color : '#10B981';
  const accentColor = isValidHex(theme.accent_color) ? theme.accent_color : '#F59E0B';
  const backgroundColor = isValidHex(theme.background_color) ? theme.background_color : '#F7F9FC';
  const surfaceColor = isValidHex(theme.surface_color) ? theme.surface_color : '#FFFFFF';
  const textColor = isValidHex(theme.text_color) ? theme.text_color : '#0F172A';

  const fontFamily =
    fontsLoaded && theme.font_family === 'Poppins'
      ? 'Poppins_400Regular'
      : fontsLoaded && theme.font_family === 'Nunito'
      ? 'Nunito_400Regular'
      : undefined;

  const baseFonts = (() => {
    try {
      return fontFamily ? configureFonts({ config: { fontFamily } as any }) : MD3LightTheme.fonts;
    } catch {
      // Fallback aman: jangan biarkan configureFonts melempar
      // "Object is not a function" dan meruntuhkan seluruh App.
      return MD3LightTheme.fonts;
    }
  })();
  const typeScale =
    theme.font_scale === 'compact' ? 0.92 : theme.font_scale === 'large' ? 1.1 : 1;

  const fonts = (() => {
    try {
      return Object.fromEntries(
        Object.entries(baseFonts).map(([name, value]) => [
          name,
          value && typeof value === 'object' && 'fontSize' in (value as object)
            ? {
                ...(value as Record<string, unknown>),
                fontSize: (value as any).fontSize * typeScale,
                lineHeight: (value as any).lineHeight * typeScale,
              }
            : value,
        ])
      ) as unknown as typeof MD3LightTheme.fonts;
    } catch {
      return MD3LightTheme.fonts;
    }
  })();

  return (
    <SafeAreaProvider>
      <ErrorBoundary onReset={() => void refreshConfig()}>
      <PaperProvider
        theme={{
          ...MD3LightTheme,
          fonts,
          colors: {
            ...MD3LightTheme.colors,
            primary: primaryColor,
            secondary: secondaryColor,
            tertiary: accentColor,
            background: backgroundColor,
            surface: surfaceColor,
            onSurface: textColor,
          },
        }}
      >
        {showingSplash ? (
          <SplashScreen onFinish={handleSplashFinish} />
        ) : isMaintenance ? (
          <MaintenanceScreen />
        ) : isForceUpdate ? (
          <UpdateRequiredScreen currentVersion={CURRENT_APP_VERSION} />
        ) : token ? (
          <BottomTabs />
        ) : (
          <LoginScreen />
        )}
        {!showingSplash && <NetworkStatusBar />}
        <StatusBar hidden={true} style={showingSplash ? 'light' : (!token || isMaintenance ? 'light' : 'dark')} />
      </PaperProvider>
    </ErrorBoundary>
    </SafeAreaProvider>
  );
}

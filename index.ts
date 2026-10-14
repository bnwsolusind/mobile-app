import 'react-native-gesture-handler';
import { Platform } from 'react-native';
import { registerRootComponent } from 'expo';

import App from './App';

// Suppress common noisy dev warnings in React Native LogBox
import { LogBox } from 'react-native';

LogBox.ignoreLogs([
  'Gagal memuat Dashboard',
  'Network Error',
  'AxiosError',
  '[API_FALLBACK]',
  'is not a valid icon name',
  'teach',
  'VirtualizedLists should never be nested',
  'props.pointerEvents is deprecated',
  '"shadow*" style props are deprecated',
  '"textShadow*" style props are deprecated',
  'useNativeDriver` is not supported',
  'Listening to push token changes',
  'Non-serializable values were found in the navigation state',
  'Sending `onAnimatedValueUpdate` with no listeners registered',
]);

// Safely filter console.warn so benign operational/network logs don't pop up the yellow LogBox banner
if (typeof console !== 'undefined') {
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    const msg = typeof args[0] === 'string' ? args[0] : '';
    if (
      msg.includes('"shadow*" style props are deprecated') ||
      msg.includes('"textShadow*" style props are deprecated') ||
      msg.includes('props.pointerEvents is deprecated') ||
      msg.includes('Listening to push token changes is not yet fully supported on web') ||
      msg.includes('useNativeDriver` is not supported') ||
      msg.includes('Gagal memuat Dashboard') ||
      msg.includes('Network Error') ||
      msg.includes('[API_FALLBACK]') ||
      msg.includes('is not a valid icon name')
    ) {
      console.log('[LOGBOX_SUPPRESSED_WARN]', ...args);
      return;
    }
    originalWarn(...args);
  };
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

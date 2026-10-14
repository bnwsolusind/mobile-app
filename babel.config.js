module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // WAJIB untuk react-native-reanimated v4 + react-native-worklets.
    // Tanpa plugin ini, worklet runtime gagal dengan "Object is not a function"
    // yang di-spam puluhan kali oleh LogBox di setiap render BottomTabs.
    // Plugin harus diletakkan terakhir.
    plugins: ['react-native-worklets/plugin'],
  };
};

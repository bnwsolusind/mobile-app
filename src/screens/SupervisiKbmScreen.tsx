import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../stores/authStore';
import PrincipalTeacherMonitoringModal from '../components/dashboard/PrincipalTeacherMonitoringModal';

export default function SupervisiKbmScreen({ navigation }: any) {
  const localNav = useNavigation<any>();
  const nav = navigation || localNav;
  const user = useAuthStore((state) => state.user);
  const unitName =
    (user?.metadata as any)?.education_unit?.name ||
    (user?.metadata as any)?.unit_name ||
    (user?.metadata as any)?.unit ||
    'Unit Sekolah';

  const handleClose = () => {
    if (nav.canGoBack()) {
      nav.goBack();
    } else {
      nav.navigate('HomeScreen');
    }
  };

  return (
    <View style={styles.container}>
      <PrincipalTeacherMonitoringModal
        visible={true}
        onClose={handleClose}
        unitName={unitName}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#064E3B',
  },
});

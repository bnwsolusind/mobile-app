import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text } from 'react-native-paper';

export default function QrCodeScreen() {
  return <View style={styles.screen}><View style={styles.scanBox}><View style={styles.qr}><MaterialCommunityIcons name="qrcode-scan" size={112} color="#087A5A" /></View><Text style={styles.title}>Pindai QR Code</Text><Text style={styles.text}>Arahkan kode presensi pegawai atau pembelajaran ke area pemindai.</Text><View style={styles.notice}><MaterialCommunityIcons name="information-outline" size={18} color="#8A6500" /><Text style={styles.noticeText}>Kamera aktif pada perangkat fisik. Preview web ini menampilkan desain dan alur aplikasi.</Text></View></View></View>;
}
const styles=StyleSheet.create({screen:{flex:1,backgroundColor:'#F7FAF9',alignItems:'center',justifyContent:'center',padding:24},scanBox:{width:'100%',maxWidth:420,alignItems:'center'},qr:{width:230,height:230,borderRadius:32,borderWidth:2,borderColor:'#B9D9CE',backgroundColor:'#FFF',alignItems:'center',justifyContent:'center'},title:{fontSize:23,fontWeight:'900',color:'#112720',marginTop:26},text:{fontSize:13,lineHeight:20,textAlign:'center',color:'#667570',marginTop:7},notice:{marginTop:24,flexDirection:'row',gap:9,backgroundColor:'#FFF8DF',borderRadius:14,padding:13},noticeText:{flex:1,fontSize:11,lineHeight:17,color:'#745A0B'}});

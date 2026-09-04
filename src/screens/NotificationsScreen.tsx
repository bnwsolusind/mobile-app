import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Surface, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { mobileApiService, unwrapCollection } from '../services/mobileApiService';

export default function NotificationsScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(unwrapCollection(await mobileApiService.getNotifications({ per_page: 30 }))); }
    catch { setItems([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} colors={['#087A5A']} />}>
    <View style={styles.heading}><Text style={styles.eyebrow}>PUSAT INFORMASI</Text><Text style={styles.title}>Notifikasi</Text><Text style={styles.subtitle}>Pembaruan akademik dan aktivitas sekolah Anda.</Text></View>
    {loading && !items.length ? <ActivityIndicator color="#087A5A" style={styles.loader} /> : items.length ? items.map((item, index) => <Surface key={String(item.id || index)} style={styles.card} elevation={0}>
      <View style={[styles.icon, !item.read_at && styles.iconUnread]}><MaterialCommunityIcons name={item.type?.includes('attendance') ? 'calendar-check-outline' : 'bell-outline'} size={21} color="#087A5A" /></View>
      <View style={styles.copy}><View style={styles.row}><Text style={styles.itemTitle}>{item.title || item.judul || 'Informasi sekolah'}</Text>{!item.read_at ? <View style={styles.dot} /> : null}</View><Text style={styles.message}>{item.message || item.body || item.data?.message || 'Ada pembaruan informasi untuk Anda.'}</Text><Text style={styles.date}>{item.created_at ? new Date(item.created_at).toLocaleDateString('id-ID') : 'Hari ini'}</Text></View>
    </Surface>) : <View style={styles.empty}><MaterialCommunityIcons name="bell-sleep-outline" size={44} color="#A7B5B1" /><Text style={styles.emptyTitle}>Belum ada notifikasi</Text><Text style={styles.emptyText}>Informasi terbaru akan muncul di halaman ini.</Text></View>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen:{flex:1,backgroundColor:'#F7FAF9'},content:{padding:18,paddingBottom:34},heading:{marginBottom:18},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.2,color:'#087A5A'},title:{fontSize:27,fontWeight:'900',color:'#10231E',marginTop:3},subtitle:{fontSize:12,color:'#71807C',marginTop:4},loader:{marginTop:44},card:{flexDirection:'row',backgroundColor:'#FFF',borderRadius:18,padding:14,marginBottom:10,borderWidth:1,borderColor:'#E7EEEB'},icon:{width:44,height:44,borderRadius:14,backgroundColor:'#F1F5F4',alignItems:'center',justifyContent:'center'},iconUnread:{backgroundColor:'#DDF7EC'},copy:{flex:1,marginLeft:12},row:{flexDirection:'row',alignItems:'center'},itemTitle:{flex:1,fontSize:13,fontWeight:'800',color:'#172B25'},dot:{width:7,height:7,borderRadius:4,backgroundColor:'#EF4444'},message:{fontSize:11,lineHeight:17,color:'#63716D',marginTop:4},date:{fontSize:10,color:'#9AA7A3',marginTop:7},empty:{alignItems:'center',paddingVertical:70},emptyTitle:{fontSize:16,fontWeight:'800',color:'#273B35',marginTop:14},emptyText:{fontSize:12,color:'#82908C',marginTop:4},
});

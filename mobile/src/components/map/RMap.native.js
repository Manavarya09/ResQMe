import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import MapView, { Marker, Polyline, Circle } from 'react-native-maps';
import { markerStyle } from './markers';

// Unified map API shared with RMap.web.js:
//   center {lat,lng}, user {lat,lng,accuracy}, markers [{id,lat,lng,kind,color,title,onPress?}],
//   circles [{id,lat,lng,radiusM,color}], polylines [{id,coords,color,width,dashed}], onPress({lat,lng})
export default function RMap({ center, user, markers = [], circles = [], polylines = [], onPress, follow = false, zoom = 15, style }) {
  const ref = useRef(null);
  const delta = 0.012 * Math.pow(2, 15 - zoom);

  useEffect(() => {
    if (follow && center && ref.current) {
      ref.current.animateCamera({ center: { latitude: center.lat, longitude: center.lng } }, { duration: 500 });
    }
  }, [follow, center?.lat, center?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={[{ flex: 1 }, style]}>
      <MapView
        ref={ref}
        style={{ flex: 1 }}
        initialRegion={{ latitude: center.lat, longitude: center.lng, latitudeDelta: delta, longitudeDelta: delta }}
        showsUserLocation={false}
        showsCompass={false}
        toolbarEnabled={false}
        onPress={(e) => onPress?.({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })}
      >
        {circles.map((c) => (
          <Circle key={c.id} center={{ latitude: c.lat, longitude: c.lng }} radius={c.radiusM} strokeColor={`${c.color}aa`} fillColor={`${c.color}22`} strokeWidth={1.5} />
        ))}
        {polylines.map((p) => (
          <Polyline
            key={p.id}
            coordinates={p.coords.map((c) => ({ latitude: c.lat, longitude: c.lng }))}
            strokeColor={p.color}
            strokeWidth={p.width || 5}
            lineDashPattern={p.dashed ? [10, 8] : undefined}
            lineCap="round"
          />
        ))}
        {markers.map((m) => {
          const s = markerStyle(m);
          return (
            <Marker key={m.id} coordinate={{ latitude: m.lat, longitude: m.lng }} title={m.title} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} onCalloutPress={m.onPress} onPress={m.onPress && !m.title ? m.onPress : undefined}>
              <View style={{ width: s.size, height: s.size, borderRadius: s.size / 2, backgroundColor: s.bg, borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', elevation: 4 }}>
                {s.inner ? <View style={{ width: s.size / 3, height: s.size / 3, borderRadius: s.size, backgroundColor: '#fff' }} /> : null}
              </View>
            </Marker>
          );
        })}
        {user ? (
          <Marker coordinate={{ latitude: user.lat, longitude: user.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} zIndex={999}>
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(244,140,37,0.25)', alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#f48c25', borderWidth: 2.5, borderColor: '#fff' }} />
            </View>
          </Marker>
        ) : null}
      </MapView>
    </View>
  );
}

import React from 'react';
import { View } from 'react-native';

export default function YouTubeEmbed({ videoId }) {
  return (
    <View style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 20, overflow: 'hidden', backgroundColor: '#000' }}>
      <iframe
        title="First aid video"
        src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`}
        style={{ border: 0, width: '100%', height: '100%' }}
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
      />
    </View>
  );
}

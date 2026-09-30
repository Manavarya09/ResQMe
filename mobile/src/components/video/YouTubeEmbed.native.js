import React from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

export default function YouTubeEmbed({ videoId }) {
  return (
    <View style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 20, overflow: 'hidden', backgroundColor: '#000' }}>
      <WebView
        source={{ uri: `https://www.youtube-nocookie.com/embed/${videoId}?playsinline=1&rel=0&modestbranding=1` }}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo
        style={{ flex: 1, backgroundColor: '#000' }}
      />
    </View>
  );
}

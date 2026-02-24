import "./global.css";
import { StatusBar } from 'expo-status-bar';
import Navigation from './Navigation';
import { View } from 'react-native';

export default function App() {
  return (
    <View className="flex-1 bg-bg-base">
      <StatusBar style="auto" />
      <Navigation />
    </View>
  );
}

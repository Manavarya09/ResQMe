import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ImageBackground, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Defs, Filter, FeDropShadow, G, Ellipse } from 'react-native-svg';
import {
  ArrowLeft,
  Shield,
  Activity, // as Sensors
  Locate,
  Edit3,
  Hourglass,
  Play,
  MoreHorizontal
} from 'lucide-react-native';

const { width, height } = Dimensions.get('window');

const NeumorphicPanel = ({ children, className = "", style = {} }) => (
    <View
        className={`bg-bg-base rounded-t-[40px] shadow-2xl ${className}`}
        style={[{
            shadowColor: '#a3b1c6',
            shadowOffset: { width: 0, height: -10 },
            shadowOpacity: 0.2,
            shadowRadius: 20,
            elevation: 20,
            borderTopWidth: 1,
            borderTopColor: 'rgba(255,255,255,0.5)'
        }, style]}
    >
        {children}
    </View>
);

const GlassPanel = ({ children, className = "" }) => (
    <View
        className={`bg-white/70 rounded-2xl p-3 border border-white/60 shadow-sm backdrop-blur-md ${className}`}
        style={{
            shadowColor: '#1f2687',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.1,
            shadowRadius: 32,
            elevation: 5,
        }}
    >
        {children}
    </View>
);

export default function TactileTrackingScreen() {
  const [duration, setDuration] = useState(25);

  return (
    <View className="flex-1 bg-slate-200">
      <SafeAreaView className="absolute top-0 left-0 right-0 z-30 bg-bg-base/90 p-4 pb-2 shadow-sm flex-row justify-between items-center">
        <TouchableOpacity className="w-10 h-10 rounded-full bg-bg-base items-center justify-center shadow-sm border border-white" style={{ elevation: 3 }}>
            <ArrowLeft color="#64748b" size={20} />
        </TouchableOpacity>

        <View className="items-center">
            <Text className="text-sm font-bold text-slate-700 tracking-wider uppercase">Tactile Path</Text>
            <View className="flex-row gap-1 mt-1">
                <View className="w-1.5 h-1.5 rounded-full bg-primary shadow-sm" />
                <View className="w-1.5 h-1.5 rounded-full bg-slate-300 shadow-inner" />
                <View className="w-1.5 h-1.5 rounded-full bg-slate-300 shadow-inner" />
            </View>
        </View>

        <TouchableOpacity className="w-10 h-10 rounded-full bg-bg-base items-center justify-center shadow-sm border border-white" style={{ elevation: 3 }}>
            <Shield color="#f48c25" size={20} />
        </TouchableOpacity>
      </SafeAreaView>

      {/* Map Area */}
      <View className="flex-1 relative">
        <ImageBackground
            source={{ uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBfQJQZfvQxegnbT3x7WvFURnPfLSwhPxzk8m9QSnMablkIlVz83BS8RCkD8Wes0i0BToULYAp99b627eFy1DiSzkSfN-jN4-fse86b-BQerGgJdTmvEvCYmEyWtZQxHLnHjdgj7rFT8S1tquPYSIZY81BwPOFCEnFBMSlOWk3_6_DYwClcoeGFa8lBhDi6hIlv-YC9rUXZSklopvZIV2w0KXuuEw1cLnRQMS5Sjn9s7GSOysIlIZNgy_2QV3Yh2R7CILTDP2rgITVI' }}
            className="flex-1 opacity-40"
            resizeMode="cover"
        >
            <Svg height="100%" width="100%" viewBox={`0 0 ${width} ${height * 0.7}`}>
                <Defs>
                    <Filter id="shadow-line">
                        <FeDropShadow dx="2" dy="2" stdDeviation="2" floodColor="rgba(0,0,0,0.15)" />
                    </Filter>
                </Defs>
                <Path
                    d="M 80 450 Q 120 400 150 350 T 220 250 T 280 150"
                    fill="none"
                    stroke="white"
                    strokeWidth="10"
                    filter="url(#shadow-line)"
                    strokeLinecap="round"
                />
                <Path
                    d="M 80 450 Q 120 400 150 350 T 220 250 T 280 150"
                    fill="none"
                    stroke="#f48c25"
                    strokeWidth="6"
                    strokeLinecap="round"
                />
                <Path
                    d="M 80 450 Q 120 400 150 350 T 220 250 T 280 150"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                    strokeDasharray="0 12"
                    strokeLinecap="round"
                />

                {/* User Marker */}
                <G x="80" y="450">
                    <Circle cx="0" cy="0" r="14" fill="#eef0f4" stroke="#cbd5e1" strokeWidth="1" />
                    <Circle cx="0" cy="0" r="7" fill="#f48c25" />
                </G>

                {/* Destination Marker */}
                <G x="280" y="150">
                     <Ellipse cx="2" cy="0" rx="8" ry="4" fill="#94a3b8" opacity="0.3" />
                     {/* Simplified pin shape */}
                     <Path d="M0 -5 L-12 -35 C-12 -48 0 -58 0 -58 C0 -58 12 -48 12 -35 Z" fill="#ef4444" stroke="#dc2626" strokeWidth="1" />
                     <Circle cx="0" cy="-35" r="5" fill="white" stroke="#b91c1c" strokeWidth="1" />
                </G>
            </Svg>
        </ImageBackground>

        {/* Top Overlays */}
        <View className="absolute top-24 left-4 right-4 flex-row gap-3">
            <GlassPanel className="flex-1 flex-row items-center gap-3">
                <View className="w-10 h-10 rounded-full bg-bg-base items-center justify-center border border-white/50 shadow-inner">
                    <Activity color="#22c55e" size={20} />
                </View>
                <View>
                    <Text className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-0.5">Gyro Status</Text>
                    <View className="flex-row items-center gap-1.5">
                        <View className="w-2 h-2 rounded-full bg-green-500 shadow-sm" />
                        <Text className="text-xs font-bold text-slate-600">Calibrated</Text>
                    </View>
                </View>
            </GlassPanel>

            <GlassPanel className="items-end justify-center min-w-[100px]">
                <Text className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Timer</Text>
                <Text className="text-lg font-mono font-bold text-primary tracking-wider">00:00</Text>
            </GlassPanel>
        </View>

        {/* Floating Controls */}
        <View className="absolute right-4 bottom-36 flex-col gap-4">
            <TouchableOpacity className="w-12 h-12 rounded-2xl bg-bg-base items-center justify-center shadow-lg border border-white" style={{ elevation: 5 }}>
                <Locate color="#475569" size={24} />
            </TouchableOpacity>
            <TouchableOpacity className="w-12 h-12 rounded-2xl bg-bg-base items-center justify-center shadow-lg border border-white" style={{ elevation: 5 }}>
                <Edit3 color="#475569" size={24} />
            </TouchableOpacity>
        </View>
      </View>

      {/* Bottom Panel */}
      <NeumorphicPanel className="-mt-8 pb-10 pt-2 px-6 space-y-6">
        <View className="w-full items-center py-4">
            <View className="w-12 h-1.5 rounded-full bg-slate-300/60" />
        </View>

        <View className="flex-row items-center justify-between">
            <View>
                <Text className="text-slate-700 text-xl font-bold tracking-tight">Route Controls</Text>
                <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mt-1">Safety Corridor</Text>
            </View>
            <TouchableOpacity className="px-4 py-2 rounded-xl bg-bg-base shadow-sm border border-white" style={{ elevation: 2 }}>
                <Text className="text-xs font-bold text-slate-500">EDIT PATH</Text>
            </TouchableOpacity>
        </View>

        {/* Duration Slider Control */}
        <View className="bg-bg-base rounded-2xl p-5 border border-white/50 shadow-inner">
             <View className="flex-row items-center justify-between mb-6">
                <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider flex-row items-center gap-2">
                    <Hourglass color="#94a3b8" size={14} /> Duration Limit
                </Text>
                <View className="px-4 py-1.5 rounded-lg bg-bg-base shadow-inner border border-white/50">
                    <Text className="text-primary font-mono font-bold text-xl">{duration} min</Text>
                </View>
             </View>

             {/* Simulated Slider */}
             <View className="relative h-12 justify-center px-1">
                {/* Ticks */}
                <View className="absolute top-1/2 left-0 w-full flex-row justify-between px-1 -translate-y-1/2 pointer-events-none">
                    {[...Array(9)].map((_, i) => (
                        <View key={i} className={`w-px bg-slate-300 ${i % 4 === 0 ? 'h-3' : 'h-1.5'}`} />
                    ))}
                </View>
                {/* Track */}
                <View className="h-2 bg-bg-base rounded-full shadow-inner w-full" />
                {/* Thumb */}
                <View className="absolute left-[40%] w-7 h-7 rounded-full bg-bg-base border border-white shadow-lg items-center justify-center" style={{ elevation: 4 }}>
                    <View className="w-2 h-2 rounded-full bg-primary" />
                </View>
             </View>

             <View className="flex-row justify-between text-[10px] mt-2 px-1">
                <Text className="text-[10px] font-bold text-slate-400">MIN</Text>
                <Text className="text-[10px] font-bold text-slate-400">MAX</Text>
             </View>
        </View>

        {/* Action Buttons */}
        <View className="flex-row gap-5 items-center mt-2">
            <TouchableOpacity className="flex-1 h-20 rounded-2xl bg-bg-base shadow-lg border border-white flex-row items-center p-2" style={{ elevation: 5 }}>
                <View className="w-16 h-16 rounded-xl bg-primary items-center justify-center shadow-lg shadow-orange-500/30">
                    <Play color="white" size={32} fill="white" />
                </View>
                <View className="flex-1 items-center pr-4">
                    <Text className="text-slate-600 font-bold text-lg tracking-wide uppercase">Start Tracking</Text>
                </View>
            </TouchableOpacity>

            <TouchableOpacity className="h-20 w-20 rounded-2xl bg-bg-base shadow-lg border border-white items-center justify-center" style={{ elevation: 5 }}>
                <MoreHorizontal color="#94a3b8" size={32} />
            </TouchableOpacity>
        </View>

      </NeumorphicPanel>
    </View>
  );
}

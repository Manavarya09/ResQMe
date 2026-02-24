import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  QrCode,
  Radio,
  AlertTriangle,
  Activity,
  Pill,
  Phone,
  ChevronRight,
  CheckCircle2,
  Droplet
} from 'lucide-react-native';
import ScreenWrapper from '../components/ScreenWrapper';

const NeumorphicCard = ({ children, className = "", style = {} }) => (
  <View
    className={`bg-bg-base rounded-3xl p-5 border border-white/40 mb-5 ${className}`}
    style={[
      {
        shadowColor: '#a3b1c6',
        shadowOffset: { width: 6, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
        elevation: 5,
      },
      style
    ]}
  >
    {children}
  </View>
);

const InnerShadowView = ({ children, className = "", style = {} }) => (
  <View
    className={`bg-bg-base rounded-2xl p-4 border border-white/40 ${className}`}
    style={[
        // React native doesn't support inset shadows easily. using normal shadow for now or flattened look.
        // We can simulate inset by darker background or border.
        {
            backgroundColor: '#eef0f5',
            borderWidth: 1,
            borderColor: '#e5e7eb',
        },
        style
    ]}
  >
    {children}
  </View>
);

export default function MedicalIDScreen() {
  const [autoTransmit, setAutoTransmit] = useState(true);

  return (
    <ScreenWrapper>
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 py-4 bg-bg-base z-20 sticky top-0">
        <TouchableOpacity className="w-10 h-10 rounded-full bg-bg-base items-center justify-center shadow-sm border border-white" style={{ elevation: 3 }}>
          <ArrowLeft color="#6b7280" size={20} />
        </TouchableOpacity>
        <Text className="text-xl font-extrabold text-slate-700">Medical ID</Text>
        <TouchableOpacity className="px-4 py-2 rounded-xl bg-bg-base border border-white shadow-sm" style={{ elevation: 2 }}>
          <Text className="text-primary font-bold text-sm">Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-5 py-2" contentContainerStyle={{ paddingBottom: 100 }}>

        {/* Profile Card */}
        <NeumorphicCard className="flex-row items-center gap-5">
          <View className="relative w-20 h-20 rounded-full p-1 bg-bg-base shadow-inner items-center justify-center border border-white">
            <Image
              source={{ uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBAAC-rEbN4Wxeni7gl63SB5Py1_GT6fDt55kXojGV2Dr0kQOvlIll6AcF7Nkuswi3J7bRPnr-FERLarg4VucLO2mbXfxnd9gfb1frh2wsEXZ89jv1AjQTiteVcR1t84cFU8f6LTxNX4y0_otieuqOOM1MiHwXhvRG7NIksdkQzLZ0l_34O9-XVxqhjkgdTF-wOkpEJ_W7s5f9RTwMP-mXCIPTimxpY8p2Haf_hwV2k7UekLNLiqsIaXDdFM6YuphkZu5CyYqeC8I4E' }}
              className="w-full h-full rounded-full"
            />
            <View className="absolute bottom-0 right-0 bg-bg-base rounded-full p-1 border border-white shadow-sm">
              <CheckCircle2 color="#f48c25" size={14} fill="#f48c25" className="text-white" />
            </View>
          </View>
          <View className="flex-1">
            <Text className="text-2xl font-bold text-slate-800">Alex Morgan</Text>
            <Text className="text-sm text-slate-500 font-mono tracking-wide mt-1 mb-2">ID: <Text className="font-semibold text-slate-700">#8821-XM-99</Text></Text>
            <View className="self-start flex-row items-center gap-2 px-3 py-1 rounded-full bg-bg-base shadow-sm border border-white/50" style={{ elevation: 1 }}>
              <View className="w-2 h-2 rounded-full bg-primary" />
              <Text className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Active Profile</Text>
            </View>
          </View>
          <TouchableOpacity className="w-12 h-12 rounded-xl bg-bg-base items-center justify-center shadow-sm border border-white" style={{ elevation: 3 }}>
            <QrCode color="#64748b" size={24} />
          </TouchableOpacity>
        </NeumorphicCard>

        {/* Auto Transmit */}
        <NeumorphicCard className="flex-row items-center justify-between p-1">
          <View className="flex-row items-center gap-4 p-4 flex-1">
            <View className="w-14 h-14 rounded-full bg-bg-base items-center justify-center border border-white shadow-sm" style={{ elevation: 2 }}>
              <Radio color="#f48c25" size={28} />
            </View>
            <View>
              <Text className="text-slate-800 font-bold text-lg">Auto-transmit</Text>
              <Text className="text-slate-500 text-xs mt-1 font-medium">Instant NFC/Bluetooth beacon.</Text>
            </View>
          </View>
          <Switch
            value={autoTransmit}
            onValueChange={setAutoTransmit}
            trackColor={{ false: "#eef0f5", true: "#f48c25" }}
            thumbColor={autoTransmit ? "#ffffff" : "#f4f3f4"}
            ios_backgroundColor="#eef0f5"
            className="mr-4"
          />
        </NeumorphicCard>

        {/* Emergency Access Scan */}
        <View className="bg-bg-base rounded-2xl p-6 border border-white/40 mb-5 items-center justify-center" style={{ elevation: 2 }}>
            <View className="p-2 rounded-xl bg-bg-base shadow-sm border border-white mb-3">
                <View className="bg-white p-1 rounded-lg">
                    <Image
                        source={{ uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCkKPrCGni_Lgi5tVhW5mMAL9j68AnsTrEimihHRojH_M5KKXOj-dFBeg4NJwNXabVlo7MXQd2nLSVTLIxTyXh4_yPy4BiSotkfMHyl-7MtGmGggyw1OY1rFCZJv400cKNkSxACCSIrpv-PBq0F3hqwjjPA00w0RZfgbx4VZ25Uw59yFGfQ4NuLzUvEeBddSx7WT3K6EfF8J5jl5C1uPeDRDL1Z90UdYOJRQhTKS1VA3duYB7vJAiHy_F5hKapt6agmY4tqu3lyWX6f' }}
                        className="w-32 h-32 rounded-md opacity-90"
                    />
                </View>
            </View>
            <Text className="text-base font-bold text-slate-700 tracking-wide">Emergency Access Scan</Text>
            <Text className="text-xs text-slate-400 mt-1 uppercase font-bold tracking-wider">Authorized personnel only</Text>
        </View>

        {/* Critical Info Header */}
        <View className="mb-4 px-1 flex-row items-center gap-3">
             <View className="p-1.5 rounded-lg bg-bg-base shadow-sm border border-white">
                <Activity color="#ef4444" size={16} />
             </View>
             <Text className="uppercase tracking-widest text-xs font-bold text-slate-400">Critical Info</Text>
        </View>

        {/* Info Grid */}
        <View className="flex-row gap-4 mb-4">
             {/* Blood Type */}
             <NeumorphicCard className="flex-1 mb-0 min-h-[140px] justify-between">
                <View className="w-10 h-10 rounded-full bg-bg-base items-center justify-center border border-white/50 shadow-inner">
                    <Droplet color="#ef4444" size={20} fill="#ef4444" />
                </View>
                <View className="mt-4">
                    <Text className="text-4xl font-extrabold text-slate-700">A+</Text>
                    <Text className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Blood Type</Text>
                </View>
             </NeumorphicCard>

             {/* Allergies */}
             <NeumorphicCard className="flex-1 mb-0 min-h-[140px] justify-between">
                <View className="w-10 h-10 rounded-full bg-bg-base items-center justify-center border border-white/50 shadow-inner">
                    <AlertTriangle color="#f48c25" size={20} />
                </View>
                <View className="mt-4">
                    <View className="flex-row flex-wrap gap-1 mb-2">
                        <View className="px-2 py-1 rounded-md bg-bg-base border border-white shadow-sm">
                            <Text className="text-[10px] font-bold text-red-500">Peanuts</Text>
                        </View>
                        <View className="px-2 py-1 rounded-md bg-bg-base border border-white shadow-sm">
                            <Text className="text-[10px] font-bold text-red-500">Penicillin</Text>
                        </View>
                    </View>
                    <Text className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Allergies</Text>
                </View>
             </NeumorphicCard>
        </View>

        {/* Medical Conditions */}
        <NeumorphicCard className="flex-row items-center gap-5 border-l-4 border-l-red-500">
            <View className="w-14 h-14 rounded-full bg-bg-base items-center justify-center border border-white shadow-sm" style={{ elevation: 2 }}>
                <Activity color="#ef4444" size={24} />
            </View>
            <View>
                <Text className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Medical Conditions</Text>
                <Text className="text-xl font-bold text-slate-800 tracking-tight">Type 1 Diabetes, Asthma</Text>
                <View className="flex-row items-center gap-1.5 mt-1.5">
                    <View className="w-2 h-2 rounded-full bg-green-500 shadow-sm" />
                    <Text className="text-[10px] text-slate-500 font-medium">Updated: 2d ago</Text>
                </View>
            </View>
        </NeumorphicCard>

        {/* Current Medications */}
        <NeumorphicCard>
            <View className="flex-row items-start justify-between mb-4">
                <View className="flex-row items-center gap-3">
                    <View className="w-10 h-10 rounded-full bg-bg-base items-center justify-center border border-white shadow-sm">
                        <Pill color="#3b82f6" size={20} />
                    </View>
                    <Text className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Current Medications</Text>
                </View>
                <TouchableOpacity className="px-4 py-2 rounded-lg bg-bg-base border border-white shadow-sm">
                    <Text className="text-xs text-primary font-bold">View All</Text>
                </TouchableOpacity>
            </View>

            <InnerShadowView className="space-y-4">
                <View className="flex-row justify-between items-center py-2 border-b border-gray-200/50">
                    <View className="flex-row items-center gap-3">
                        <View className="w-1.5 h-8 bg-blue-400 rounded-full" />
                        <Text className="font-bold text-slate-700 text-sm">Insulin Glargine</Text>
                    </View>
                    <View className="px-2 py-1 rounded border border-white bg-bg-base shadow-sm">
                        <Text className="text-slate-500 text-[10px] font-bold">DAILY</Text>
                    </View>
                </View>
                <View className="flex-row justify-between items-center py-2">
                    <View className="flex-row items-center gap-3">
                        <View className="w-1.5 h-8 bg-slate-400 rounded-full" />
                        <Text className="font-bold text-slate-700 text-sm">Albuterol Inhaler</Text>
                    </View>
                    <View className="px-2 py-1 rounded border border-white bg-bg-base shadow-sm">
                        <Text className="text-slate-500 text-[10px] font-bold">PRN</Text>
                    </View>
                </View>
            </InnerShadowView>
        </NeumorphicCard>

        {/* Emergency Contacts Button */}
        <NeumorphicCard className="flex-row items-center justify-between mt-2 border-l-4 border-l-green-500 active:bg-gray-50">
            <View className="flex-row items-center gap-4">
                <View className="w-12 h-12 rounded-full bg-bg-base items-center justify-center border border-white shadow-inner">
                    <Phone color="#16a34a" size={24} />
                </View>
                <View>
                    <Text className="text-base font-bold text-slate-800 block">Emergency Contacts</Text>
                    <View className="bg-green-100 px-2 py-0.5 rounded-full mt-0.5 self-start">
                        <Text className="text-xs text-green-600 font-bold">3 Active</Text>
                    </View>
                </View>
            </View>
            <View className="w-10 h-10 rounded-full bg-bg-base items-center justify-center border border-white shadow-sm">
                <ChevronRight color="#94a3b8" size={20} />
            </View>
        </NeumorphicCard>

      </ScrollView>
    </ScreenWrapper>
  );
}

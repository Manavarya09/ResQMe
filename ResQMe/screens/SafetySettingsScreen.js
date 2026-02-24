import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  ShieldCheck,
  Mail,
  Smartphone,
  Lock,
  Satellite,
  Fingerprint,
  LogOut,
  MoreVertical,
  Plus,
  Edit3
} from 'lucide-react-native';
import ScreenWrapper from '../components/ScreenWrapper';

const NeumorphicListItem = ({ icon: Icon, title, subtitle, action, className = "" }) => (
    <View className={`flex-row items-center justify-between py-3 border-b border-gray-200/50 ${className}`}>
        <View className="flex-row items-center gap-4">
            <View className="w-10 h-10 rounded-full bg-bg-base items-center justify-center shadow-sm border border-white" style={{ elevation: 2 }}>
                <Icon color="#f48c25" size={20} />
            </View>
            <View className="flex-1 pr-4">
                <Text className="text-sm font-bold text-slate-600">{title}</Text>
                {subtitle}
            </View>
        </View>
        {action}
    </View>
);

const NeumorphicContactCard = ({ initial, name, role, isPrimary }) => (
    <View className="bg-bg-base rounded-2xl p-3 flex-row items-center justify-between mb-4 border border-white shadow-sm" style={{ elevation: 3 }}>
        <View className="flex-row items-center gap-4 relative z-10">
            <View className="w-12 h-12 rounded-full bg-bg-base items-center justify-center border border-white shadow-inner">
                <Text className="text-slate-500 font-bold text-sm">{initial}</Text>
            </View>
            <View>
                <Text className="text-sm font-bold text-slate-700">{name}</Text>
                {isPrimary ? (
                    <View className="flex-row items-center gap-1.5 mt-0.5">
                        <View className="w-1.5 h-1.5 rounded-full bg-primary shadow-sm" />
                        <Text className="text-xs text-slate-400 font-medium">{role}</Text>
                    </View>
                ) : (
                    <Text className="text-xs text-slate-400 font-medium mt-0.5">{role}</Text>
                )}
            </View>
        </View>
        <TouchableOpacity className="w-9 h-9 rounded-full bg-bg-base items-center justify-center shadow-sm border border-white" style={{ elevation: 2 }}>
            <MoreVertical color="#94a3b8" size={18} />
        </TouchableOpacity>
    </View>
);

export default function SafetySettingsScreen() {
  const [satellite, setSatellite] = useState(true);
  const [biometric, setBiometric] = useState(true);

  return (
    <ScreenWrapper>
        {/* Header */}
        <View className="flex-row items-center justify-between px-6 py-4 bg-bg-base/90 z-30 sticky top-0 shadow-sm">
            <TouchableOpacity className="w-10 h-10 rounded-full bg-bg-base items-center justify-center shadow-sm border border-white" style={{ elevation: 3 }}>
                <ArrowLeft color="#64748b" size={20} />
            </TouchableOpacity>
            <Text className="text-xl font-extrabold text-slate-700">Safety Settings</Text>
            <View className="w-10" />
        </View>

        <ScrollView className="flex-1 px-6 pt-4 pb-2" contentContainerStyle={{ paddingBottom: 100 }}>
            {/* Profile Card */}
            <View className="bg-bg-base rounded-3xl p-6 border border-white shadow-lg mb-8 items-center gap-5" style={{ elevation: 5 }}>
                <View className="relative">
                    <View className="h-28 w-28 rounded-full p-2 bg-bg-base shadow-xl items-center justify-center border border-white">
                        <Image
                            source={{ uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBuybXmlBY2dk4SgXQ6JwZBDFpB8Ui7Q-BKUGwNpRKYa1JcjIsXlxSFhk8xaH4i6NJjQf_AcydLs8SZHHWNoBW_2keosD8g-nKZH6BqaniMhlhSerbTWFe02qUY3Th1sPOJYyqJ-o0LLQW9fNyc8UBl5X6BaaufVxSs8R2fJOpdE1Yy8ZEMTRfkRefnW5bhSGWsRnqLKSg5SVl-Z5WMIuEn7JlND5mKlsVULFkzHi2p2_grp_-NF3nglDJG6QeUsypELq_5fkZxla-s' }}
                            className="h-full w-full rounded-full border-4 border-bg-base"
                        />
                    </View>
                    <View className="absolute bottom-1 right-1 bg-bg-base rounded-full p-2 shadow-sm border border-white items-center justify-center">
                        <ShieldCheck color="#f48c25" size={16} />
                    </View>
                </View>
                <View className="items-center w-full px-4">
                    <Text className="text-2xl font-extrabold text-slate-700">Alex Mercer</Text>
                    <Text className="text-xs font-bold tracking-widest text-slate-400 mt-1 uppercase">ID: 8829-RESQ-AI</Text>
                    <View className="mt-4 flex-row items-center gap-2 px-5 py-2 rounded-full bg-bg-base border border-white shadow-inner">
                        <View className="w-2 h-2 rounded-full bg-green-500 shadow-sm" />
                        <Text className="text-green-600 text-[10px] font-bold tracking-wider">VERIFIED AGENT</Text>
                    </View>
                </View>
            </View>

            {/* Account & Security */}
            <View className="mb-8">
                <Text className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4 ml-3">Account & Security</Text>
                <View className="bg-bg-base rounded-2xl p-1 border border-white shadow-inner">
                    <NeumorphicListItem
                        icon={Mail}
                        title="Email Address"
                        subtitle={<Text className="text-xs text-slate-400 font-medium mt-0.5">alex.mercer@email.com</Text>}
                        action={
                            <TouchableOpacity className="w-8 h-8 rounded-full items-center justify-center bg-bg-base border border-white shadow-sm" style={{ elevation: 2 }}>
                                <Edit3 color="#94a3b8" size={16} />
                            </TouchableOpacity>
                        }
                    />
                    <NeumorphicListItem
                        icon={Smartphone}
                        title="Phone Number"
                        subtitle={<Text className="text-xs text-slate-400 font-medium mt-0.5">+1 (555) 019-2834</Text>}
                        action={
                            <TouchableOpacity className="w-8 h-8 rounded-full items-center justify-center bg-bg-base border border-white shadow-sm" style={{ elevation: 2 }}>
                                <Edit3 color="#94a3b8" size={16} />
                            </TouchableOpacity>
                        }
                    />
                    <NeumorphicListItem
                        icon={Lock}
                        title="Data Encryption"
                        subtitle={
                            <View className="flex-row items-center gap-1.5 mt-0.5">
                                <Lock color="#22c55e" size={12} />
                                <Text className="text-[10px] font-mono font-bold text-green-600/70">AES-256 ACTIVATED</Text>
                            </View>
                        }
                        className="border-b-0"
                    />
                </View>
            </View>

            {/* Emergency Contacts */}
            <View className="mb-8">
                <View className="flex-row items-center justify-between mb-4 ml-3">
                    <Text className="text-xs font-bold uppercase tracking-widest text-slate-400">Emergency Contacts</Text>
                    <TouchableOpacity className="w-7 h-7 rounded-full bg-bg-base items-center justify-center shadow-sm border border-white" style={{ elevation: 2 }}>
                        <Plus color="#f48c25" size={18} />
                    </TouchableOpacity>
                </View>
                <View className="space-y-4">
                    <NeumorphicContactCard initial="SJ" name="Sarah Jenkins" role="Primary Contact" isPrimary />
                    <NeumorphicContactCard initial="DR" name="Dr. Reynolds" role="Physician" />
                </View>
            </View>

            {/* Advanced Connectivity */}
            <View className="mb-8">
                <Text className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4 ml-3">Advanced Connectivity</Text>
                <View className="bg-bg-base rounded-2xl p-1 border border-white shadow-inner">
                    <NeumorphicListItem
                        icon={Satellite}
                        title="Satellite Uplink"
                        subtitle={<Text className="text-[10px] text-slate-400 mt-0.5 font-medium leading-tight">Fallback connection</Text>}
                        action={
                            <Switch
                                value={satellite}
                                onValueChange={setSatellite}
                                trackColor={{ false: "#eef0f5", true: "#f48c25" }}
                                thumbColor={satellite ? "#ffffff" : "#f4f3f4"}
                            />
                        }
                    />
                    <NeumorphicListItem
                        icon={Fingerprint}
                        title="Biometric Auth"
                        subtitle={<Text className="text-[10px] text-slate-400 mt-0.5 font-medium leading-tight">Authorize tracking</Text>}
                        action={
                            <Switch
                                value={biometric}
                                onValueChange={setBiometric}
                                trackColor={{ false: "#eef0f5", true: "#f48c25" }}
                                thumbColor={biometric ? "#ffffff" : "#f4f3f4"}
                            />
                        }
                        className="border-b-0"
                    />
                </View>
            </View>

            {/* Logout */}
            <View className="items-center pb-6">
                <TouchableOpacity className="flex-row items-center gap-2 px-8 py-3.5 rounded-2xl bg-bg-base shadow-sm border border-white active:bg-red-50" style={{ elevation: 3 }}>
                    <LogOut color="#ef4444" size={20} />
                    <Text className="text-red-500 font-bold text-sm uppercase tracking-wide">Sign Out</Text>
                </TouchableOpacity>
            </View>

        </ScrollView>
    </ScreenWrapper>
  );
}

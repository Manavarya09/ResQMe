import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  MoreVertical,
  Video,
  Bot,
  User as UserIcon,
  PlusCircle,
  Mic,
  Send,
  Droplet,
  HeartPulse,
  Frown,
  Skull,
  HelpCircle
} from 'lucide-react-native';
import ScreenWrapper from '../components/ScreenWrapper';

const MessageBubble = ({ text, isUser, children }) => {
  return (
    <View className={`flex-row items-end gap-3 mb-6 ${isUser ? 'justify-end' : ''}`}>
      {!isUser && (
        <View className="w-10 h-10 rounded-full bg-bg-base items-center justify-center shadow-sm border border-white">
          <Bot color="#f48c25" size={24} />
        </View>
      )}

      <View className={`max-w-[85%] flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        <Text className="text-text-sub text-[10px] font-bold mb-1 uppercase tracking-wide px-1">
          {isUser ? 'You' : 'ResQMe AI'}
        </Text>
        <View
          className={`p-4 rounded-2xl shadow-sm border ${
            isUser
              ? 'bg-primary rounded-br-sm border-orange-400'
              : 'bg-bg-base rounded-bl-sm border-white/50'
          }`}
          style={!isUser ? {
            shadowColor: '#d1d5db',
            shadowOffset: { width: 5, height: 5 },
            shadowOpacity: 0.5,
            shadowRadius: 10,
            elevation: 5,
          } : {
            shadowColor: '#ff9c29',
            shadowOffset: { width: 5, height: 5 },
            shadowOpacity: 0.3,
            shadowRadius: 10,
            elevation: 5,
          }}
        >
          <Text className={`text-sm leading-relaxed font-medium ${isUser ? 'text-white' : 'text-text-main'}`}>
            {text}
          </Text>
          {children}
        </View>
      </View>

      {isUser && (
        <View className="w-10 h-10 rounded-full bg-gray-200 border-2 border-white items-center justify-center overflow-hidden">
          {/* Placeholder Avatar */}
          <UserIcon color="#9ca3af" size={24} />
        </View>
      )}
    </View>
  );
};

const QuickOptionButton = ({ icon: Icon, label, color }) => (
  <TouchableOpacity
    className="bg-bg-base border border-white rounded-xl p-3 flex-row items-center justify-center gap-2 mb-2 mr-2 shadow-sm"
    style={{
        shadowColor: '#d1d5db',
        shadowOffset: { width: 4, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 3,
    }}
  >
    <Icon color={color} size={20} />
    <Text className="text-text-sub text-xs font-bold">{label}</Text>
  </TouchableOpacity>
);

export default function CrisisSupportScreen() {
  const [inputText, setInputText] = useState('');

  return (
    <ScreenWrapper className="pb-0">
      {/* Header */}
      <View className="flex-row items-center justify-between p-4 pt-2 bg-bg-base z-20">
        <View className="flex-row items-center gap-4">
          <View className="relative">
            <View className="w-12 h-12 rounded-full bg-bg-base items-center justify-center shadow-sm border border-white" style={{ elevation: 5 }}>
              <HeartPulse color="#f48c25" size={24} />
            </View>
            <View className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-bg-base shadow-sm" />
          </View>
          <View>
            <Text className="text-text-main text-lg font-bold">ResQMe AI</Text>
            <View className="flex-row items-center gap-1.5">
              <View className="w-2 h-2 rounded-full bg-green-500" />
              <Text className="text-text-sub text-xs font-medium">Online • Ready to assist</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity className="w-10 h-10 rounded-full bg-bg-base items-center justify-center shadow-sm border border-white" style={{ elevation: 3 }}>
          <MoreVertical color="#6b7280" size={20} />
        </TouchableOpacity>
      </View>

      {/* Video Support Button */}
      <View className="px-4 py-2 z-10">
        <TouchableOpacity
          className="w-full flex-row items-center justify-center gap-3 h-14 rounded-lg bg-bg-base border border-gray-100 shadow-sm active:opacity-90"
          style={{
            shadowColor: '#d1d5db',
            shadowOffset: { width: 4, height: 4 },
            shadowOpacity: 0.4,
            shadowRadius: 5,
            elevation: 4,
          }}
        >
          <View className="w-8 h-8 rounded-full bg-red-50 items-center justify-center">
            <Video color="#ef4444" size={18} />
          </View>
          <Text className="uppercase text-accent-red text-sm font-bold tracking-wide">Start Video Support</Text>
        </TouchableOpacity>
      </View>

      {/* Chat Area */}
      <ScrollView
        className="flex-1 px-4 py-2"
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center my-4">
          <Text className="text-[10px] font-bold tracking-wider text-text-sub bg-bg-base px-3 py-1 rounded-full shadow-sm" style={{ elevation: 1 }}>
            TODAY, 10:23 AM
          </Text>
        </View>

        <MessageBubble isUser={false} text="Hello. I am here to assist you with your emergency. Please describe the situation or select an option below. Is everyone safe right now?" />

        <MessageBubble isUser={true} text="My friend fell and is hurt." />

        <MessageBubble isUser={false} text="I understand. Staying calm is key. Where are they hurt? Tap one of the quick options below or type it out.">
             <View className="flex-row flex-wrap mt-4">
                <QuickOptionButton icon={Droplet} label="Severe Bleeding" color="#ef4444" />
                <QuickOptionButton icon={HeartPulse} label="Chest Pain" color="#f48c25" />
                <QuickOptionButton icon={Frown} label="Choking" color="#ca8a04" />
                <QuickOptionButton icon={Skull} label="Head Injury" color="#3b82f6" />
                <QuickOptionButton icon={HelpCircle} label="Other" color="#6b7280" />
             </View>
        </MessageBubble>
      </ScrollView>

      {/* Input Area */}
      <View className="absolute bottom-0 left-0 right-0 p-4 bg-bg-base/90 border-t border-gray-200/50">
        <View className="flex-row items-center gap-2 bg-bg-base p-2 rounded-full border border-white shadow-sm" style={{ elevation: 2 }}>
            <TouchableOpacity className="w-10 h-10 items-center justify-center rounded-full active:bg-gray-200">
                <PlusCircle color="#6b7280" size={24} />
            </TouchableOpacity>

            <TextInput
                className="flex-1 text-text-main text-sm font-medium h-10 px-2"
                placeholder="Type emergency details..."
                placeholderTextColor="#9ca3af"
                value={inputText}
                onChangeText={setInputText}
            />

            <TouchableOpacity className="w-10 h-10 items-center justify-center rounded-full active:bg-gray-200">
                <Mic color="#6b7280" size={24} />
            </TouchableOpacity>

            <TouchableOpacity className="w-10 h-10 bg-primary rounded-full items-center justify-center shadow-md active:scale-95" style={{ shadowColor: '#f48c25', elevation: 5 }}>
                <Send color="white" size={20} />
            </TouchableOpacity>
        </View>
      </View>
    </ScreenWrapper>
  );
}

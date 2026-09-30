import React from 'react';
import { View, Text, ScrollView, Image } from 'react-native';
import { PlayCircle, Clock } from 'lucide-react-native';
import { Screen, Header, Card } from '../components/ui';
import { TRAINING } from '../lib/training';

export default function TrainingScreen({ navigation }) {
  const groups = TRAINING.reduce((acc, t) => ({ ...acc, [t.category]: [...(acc[t.category] || []), t] }), {});
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="First-aid training" subtitle="2-minute lessons that save lives" onBack={() => navigation.goBack()} />
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40 }}>
        <Card className="mb-2 bg-primary border-0 p-5">
          <Text className="text-white text-lg font-extrabold">Be the first responder</Text>
          <Text className="text-orange-100 text-xs font-semibold mt-1 leading-5">
            Most emergencies are witnessed by bystanders. A few minutes of practice now means you know what to do when seconds count.
          </Text>
        </Card>
        {Object.entries(groups).map(([cat, items]) => (
          <View key={cat}>
            <Text className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400 mb-3 mt-6 px-1">{cat}</Text>
            {items.map((t) => (
              <Card key={t.id} onPress={() => navigation.navigate('TrainingDetail', { id: t.id })} className="p-3 mb-3 flex-row items-center gap-3">
                <View className="w-24 h-16 rounded-xl overflow-hidden bg-slate-200">
                  <Image source={{ uri: `https://i.ytimg.com/vi/${t.youtubeId}/mqdefault.jpg` }} style={{ width: '100%', height: '100%' }} />
                  <View className="absolute inset-0 items-center justify-center bg-black/20">
                    <PlayCircle color="#fff" size={24} />
                  </View>
                </View>
                <View className="flex-1">
                  <Text className="text-[15px] font-extrabold text-slate-700">{t.title}</Text>
                  <Text className="text-[11px] text-slate-400 font-medium mt-0.5" numberOfLines={2}>{t.summary}</Text>
                  <View className="flex-row items-center gap-1 mt-1">
                    <Clock color={t.color} size={11} />
                    <Text className="text-[10px] font-extrabold" style={{ color: t.color }}>{t.minutes} MIN · {t.steps.length} STEPS</Text>
                  </View>
                </View>
              </Card>
            ))}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

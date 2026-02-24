import React from 'react';
import { Pressable, View, Text, Animated, Platform } from 'react-native';

export default function NeumorphicButton({ children, onPress, className = "", style = {} }) {
  const scale = React.useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View
        className={`bg-bg-base rounded-xl items-center justify-center ${className}`}
        style={[
          {
            transform: [{ scale }],
            shadowColor: '#a3b1c6',
            shadowOffset: { width: 6, height: 6 },
            shadowOpacity: 0.5,
            shadowRadius: 10,
            elevation: 5,
            backgroundColor: '#eef0f5', // bg-base
          },
          style,
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}

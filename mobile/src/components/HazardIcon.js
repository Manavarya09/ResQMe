import React from 'react';
import { ShieldAlert, CloudRain, Thermometer, CloudFog, CloudLightning, Car, AlertTriangle, Waves } from 'lucide-react-native';

const ICONS = {
  crime: ShieldAlert,
  weather: CloudRain,
  flood: Waves,
  heat: Thermometer,
  fog: CloudFog,
  storm: CloudLightning,
  accident: Car,
  other: AlertTriangle,
};

export const hazardLabel = {
  crime: 'Crime alert',
  weather: 'Weather',
  flood: 'Flood risk',
  heat: 'Heatwave',
  fog: 'Dense fog',
  storm: 'Storm / hail',
  accident: 'Accident zone',
  other: 'Hazard',
};

export default function HazardIcon({ type, ...props }) {
  const Icon = ICONS[type] || AlertTriangle;
  return <Icon {...props} />;
}

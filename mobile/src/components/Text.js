import React, { createContext, forwardRef, useContext } from 'react';
import { Text as RNText, StyleSheet } from 'react-native';

// Custom fonts load as one family per weight (e.g. "Manrope_800ExtraBold") and native platforms
// ignore fontWeight for them — so this Text reads the weight (from `font-*` classes or style) and the
// role (`font-mono`) and applies the matching font file. Nested Text inherits its parent's font
// unless it asks for a different weight, mirroring how fontWeight cascades on the web.
const MANROPE = {
  400: 'Manrope_400Regular', 500: 'Manrope_500Medium', 600: 'Manrope_600SemiBold',
  700: 'Manrope_700Bold', 800: 'Manrope_800ExtraBold', 900: 'Manrope_800ExtraBold',
};
const MONO = {
  400: 'JetBrainsMono_500Medium', 500: 'JetBrainsMono_500Medium', 600: 'JetBrainsMono_700Bold',
  700: 'JetBrainsMono_700Bold', 800: 'JetBrainsMono_700Bold', 900: 'JetBrainsMono_700Bold',
};

const CLASS_WEIGHT = {
  'font-thin': 400, 'font-extralight': 400, 'font-light': 400, 'font-normal': 400,
  'font-medium': 500, 'font-semibold': 600, 'font-bold': 700, 'font-extrabold': 800, 'font-black': 900,
};
const STYLE_WEIGHT = { normal: 400, bold: 700 };

const FontContext = createContext({ role: 'body', weight: 400 });

export function resolveFont(className = '', style, parent = { role: 'body', weight: 400 }) {
  const tokens = className ? className.split(/\s+/) : [];
  const flat = StyleSheet.flatten(style) || {};
  if (flat.fontFamily && !['mono', 'body', 'display'].includes(flat.fontFamily)) return null; // explicit real font

  let role = parent.role;
  if (tokens.includes('font-mono') || flat.fontFamily === 'mono') role = 'mono';
  else if (['font-body', 'font-display'].some((t) => tokens.includes(t)) || ['body', 'display'].includes(flat.fontFamily)) role = 'body';

  let weight = parent.weight;
  for (const t of tokens) if (CLASS_WEIGHT[t]) weight = CLASS_WEIGHT[t];
  if (flat.fontWeight != null) weight = STYLE_WEIGHT[flat.fontWeight] ?? Number(flat.fontWeight);
  weight = Math.min(900, Math.max(400, Math.round(weight / 100) * 100));

  return { role, weight, fontFamily: (role === 'mono' ? MONO : MANROPE)[weight] };
}

export const Text = forwardRef(function Text({ className, style, ...props }, ref) {
  const parent = useContext(FontContext);
  const font = resolveFont(className, style, parent);
  if (!font) return <RNText ref={ref} className={className} style={style} {...props} />;
  return (
    <FontContext.Provider value={font}>
      <RNText ref={ref} className={className} {...props} style={[style, { fontFamily: font.fontFamily, fontWeight: 'normal' }]} />
    </FontContext.Provider>
  );
});

export default Text;

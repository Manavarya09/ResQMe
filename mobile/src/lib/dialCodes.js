// Emergency quick-dial presets per country. `primary` is what the big SOS call button dials.
export const COUNTRIES = {
  IN: {
    name: 'India',
    flag: '🇮🇳',
    primary: '112',
    numbers: [
      { key: 'police', label: 'Police', number: '100' },
      { key: 'ambulance', label: 'Ambulance', number: '108' },
      { key: 'fire', label: 'Fire', number: '101' },
      { key: 'women', label: 'Women Helpline', number: '1091' },
    ],
  },
  AE: {
    name: 'UAE',
    flag: '🇦🇪',
    primary: '999',
    numbers: [
      { key: 'police', label: 'Police', number: '999' },
      { key: 'ambulance', label: 'Ambulance', number: '998' },
      { key: 'fire', label: 'Fire', number: '997' },
      { key: 'women', label: 'Women & Child', number: '800111' },
    ],
  },
  US: {
    name: 'United States',
    flag: '🇺🇸',
    primary: '911',
    numbers: [
      { key: 'police', label: 'Police', number: '911' },
      { key: 'ambulance', label: 'Ambulance', number: '911' },
      { key: 'fire', label: 'Fire', number: '911' },
      { key: 'women', label: 'DV Hotline', number: '18007997233' },
    ],
  },
  GB: {
    name: 'United Kingdom',
    flag: '🇬🇧',
    primary: '999',
    numbers: [
      { key: 'police', label: 'Police', number: '999' },
      { key: 'ambulance', label: 'Ambulance', number: '999' },
      { key: 'fire', label: 'Fire', number: '999' },
      { key: 'women', label: 'DA Helpline', number: '08082000247' },
    ],
  },
  RW: {
    name: 'Rwanda',
    flag: '🇷🇼',
    primary: '112',
    numbers: [
      { key: 'police', label: 'Police', number: '112' },
      { key: 'ambulance', label: 'Ambulance', number: '912' },
      { key: 'fire', label: 'Fire', number: '111' },
      { key: 'women', label: 'GBV Helpline', number: '3512' },
    ],
  },
  EU: {
    name: 'Europe (112)',
    flag: '🇪🇺',
    primary: '112',
    numbers: [
      { key: 'police', label: 'Police', number: '112' },
      { key: 'ambulance', label: 'Ambulance', number: '112' },
      { key: 'fire', label: 'Fire', number: '112' },
      { key: 'women', label: 'Emergency', number: '112' },
    ],
  },
};

export const getCountry = (code) => COUNTRIES[code] || COUNTRIES.IN;

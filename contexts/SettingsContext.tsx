import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../services/api';

export interface AppSettings {
  // Plataforma
  platform_tagline: string;
  bunny_cdn_base: string;
  // Preços
  premium_price_display: string;
  premium_cpm_rate: number;
  // Anúncios
  ad_skip_seconds: number;
  ad_frequency_feed: number;
  ad_frequency_webtoon: number;
  // AdSense
  adsense_client_id: string;
  adsense_slot_id: string;
}

export const SETTINGS_DEFAULTS: AppSettings = {
  platform_tagline:      'Cinematic Comics. O futuro é aqui.',
  bunny_cdn_base:        'https://vz-fbaa1d24-d2c.b-cdn.net',
  premium_price_display: 'R$ 3,99',
  premium_cpm_rate:      15.00,
  ad_skip_seconds:       5,
  ad_frequency_feed:     4,
  ad_frequency_webtoon:  7,
  adsense_client_id:     'ca-pub-5972610130504852',
  adsense_slot_id:       '',
};

const SettingsContext = createContext<AppSettings>(SETTINGS_DEFAULTS);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(SETTINGS_DEFAULTS);

  useEffect(() => {
    api.getPublicSettings().then(raw => {
      setSettings({
        platform_tagline:      raw.platform_tagline      || SETTINGS_DEFAULTS.platform_tagline,
        bunny_cdn_base:        raw.bunny_cdn_base        || SETTINGS_DEFAULTS.bunny_cdn_base,
        premium_price_display: raw.premium_price_display || SETTINGS_DEFAULTS.premium_price_display,
        premium_cpm_rate:      parseFloat(raw.premium_cpm_rate) || SETTINGS_DEFAULTS.premium_cpm_rate,
        ad_skip_seconds:       parseInt(raw.ad_skip_seconds)    || SETTINGS_DEFAULTS.ad_skip_seconds,
        ad_frequency_feed:     parseInt(raw.ad_frequency_feed)  || SETTINGS_DEFAULTS.ad_frequency_feed,
        ad_frequency_webtoon:  parseInt(raw.ad_frequency_webtoon) || SETTINGS_DEFAULTS.ad_frequency_webtoon,
        adsense_client_id:     raw.adsense_client_id     || SETTINGS_DEFAULTS.adsense_client_id,
        adsense_slot_id:       raw.adsense_slot_id       || SETTINGS_DEFAULTS.adsense_slot_id,
      });
    });
  }, []);

  return (
    <SettingsContext.Provider value={settings}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface LogoPreset {
  label:      string;
  iconSize:   number;
  fontSize:   number;
  lineHeight: number; // 0 = auto (unitless 1), >0 = exact px value
}

export const MD_PRESETS: LogoPreset[] = [
  { label: 'Small',   iconSize: 24, fontSize: 22, lineHeight: 0 },
  { label: 'Default', iconSize: 32, fontSize: 30, lineHeight: 0 },
  { label: 'Large',   iconSize: 40, fontSize: 38, lineHeight: 0 },
];

export const MC_PRESETS: LogoPreset[] = [
  { label: 'Small',   iconSize: 24, fontSize: 22, lineHeight: 0 },
  { label: 'Default', iconSize: 32, fontSize: 30, lineHeight: 0 },
  { label: 'Large',   iconSize: 40, fontSize: 38, lineHeight: 0 },
];

type MDField = 'mdIconSize' | 'mdFontSize' | 'mdLineHeight';
type MCField = 'mcIconSize' | 'mcFontSize' | 'mcLineHeight';

export interface BrandingConfig {
  md_icon_size:   number;
  md_font_size:   number;
  md_line_height: number;
  mc_icon_size:   number;
  mc_font_size:   number;
  mc_line_height: number;
  md_custom_text: string;
  mc_custom_text: string;
  md_logo_url:    string;
  mc_logo_url:    string;
  md_logo_variant?: string;
  md_logo_theme_aware?: boolean;
}

interface LogoSizeStore {
  mdIconSize:   number;
  mdFontSize:   number;
  mdLineHeight: number;
  mcIconSize:   number;
  mcFontSize:   number;
  mcLineHeight: number;
  mdCustomText: string;
  mcCustomText: string;
  mdLogoUrl:    string;
  mcLogoUrl:    string;
  mdLogoVariant: string;
  mdLogoThemeAware: boolean;
  setMD:             (iconSize: number, fontSize: number, lineHeight?: number) => void;
  setMC:             (iconSize: number, fontSize: number, lineHeight?: number) => void;
  setMDField:        (field: MDField, value: number) => void;
  setMCField:        (field: MCField, value: number) => void;
  initFromBranding:  (cfg: BrandingConfig) => void;
}

export const useLogoSizeStore = create<LogoSizeStore>()(
  persist(
    (set) => ({
      mdIconSize:   24,
      mdFontSize:   19,
      mdLineHeight: 0,
      mcIconSize:   32,
      mcFontSize:   30,
      mcLineHeight: 0,
      mdCustomText: '',
      mcCustomText: '',
      mdLogoUrl:    '',
      mcLogoUrl:    '',
      mdLogoVariant: '',
      mdLogoThemeAware: false,
      setMD: (iconSize, fontSize, lineHeight = 0) =>
        set({ mdIconSize: iconSize, mdFontSize: fontSize, mdLineHeight: lineHeight }),
      setMC: (iconSize, fontSize, lineHeight = 0) =>
        set({ mcIconSize: iconSize, mcFontSize: fontSize, mcLineHeight: lineHeight }),
      setMDField: (field, value) => set({ [field]: value }),
      setMCField: (field, value) => set({ [field]: value }),
      initFromBranding: (cfg) => set({
        mdIconSize:   cfg.md_icon_size,
        mdFontSize:   cfg.md_font_size,
        mdLineHeight: cfg.md_line_height,
        mcIconSize:   cfg.mc_icon_size,
        mcFontSize:   cfg.mc_font_size,
        mcLineHeight: cfg.mc_line_height,
        mdCustomText: cfg.md_custom_text ?? '',
        mcCustomText: cfg.mc_custom_text ?? '',
        mdLogoUrl:        cfg.md_logo_url ?? '',
        mcLogoUrl:        cfg.mc_logo_url ?? '',
        mdLogoVariant:    cfg.md_logo_variant ?? '',
        mdLogoThemeAware: cfg.md_logo_theme_aware ?? false,
      }),
    }),
    { name: 'matedesk-logo-sizes', version: 6 }
  )
);

/** Converts stored lineHeight number to a CSS-compatible value */
export function resolveLH(lh: number): number | string {
  return lh > 0 ? `${lh}px` : 1;
}

/**
 * Theme Configuration System
 *
 * Supports multiple themes for different professional contexts:
 * - Terminal (developer-focused, original)
 * - Professional (business, consulting, legal)
 * - Financial (finance, audit)
 * - Campaign (political, advocacy)
 * - Custom (user-defined)
 */

export type ThemeMode = 'light' | 'dark';
export type ThemeName = 'terminal' | 'professional' | 'financial' | 'campaign' | 'custom';

export interface ThemeColors {
  // Backgrounds
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;

  // Foregrounds (text)
  fgPrimary: string;
  fgSecondary: string;
  fgTertiary: string;

  // Accents
  accentPrimary: string;   // Main brand color
  accentSuccess: string;   // Success states
  accentWarning: string;   // Warning states
  accentDanger: string;    // Error/danger states
  accentInfo: string;      // Info/neutral

  // Borders
  border: string;
  borderFocus: string;

  // Semantic colors
  link: string;
  linkHover: string;
}

export interface ThemeTypography {
  fontFamily: string;
  fontFamilyMono: string;
  fontSizeBase: string;
  fontSizeSmall: string;
  fontSizeLarge: string;
  fontSizeXLarge: string;
  lineHeight: string;
}

export interface ThemeSpacing {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
}

export interface Theme {
  name: ThemeName;
  mode: ThemeMode;
  colors: ThemeColors;
  typography: ThemeTypography;
  spacing: ThemeSpacing;
  borderRadius: string;
}

/**
 * Terminal Theme (Original)
 * For developers and technical users
 */
const terminalDark: Theme = {
  name: 'terminal',
  mode: 'dark',
  colors: {
    bgPrimary: '#0a0e14',
    bgSecondary: '#111822',
    bgTertiary: '#1a1f2e',
    fgPrimary: '#e6e6e6',
    fgSecondary: '#b0b0b0',
    fgTertiary: '#808080',
    accentPrimary: '#00ff88',
    accentSuccess: '#00ff88',
    accentWarning: '#ffcc00',
    accentDanger: '#ff6b6b',
    accentInfo: '#00d4ff',
    border: '#2a2f3e',
    borderFocus: '#00ff88',
    link: '#00d4ff',
    linkHover: '#00ffff',
  },
  typography: {
    fontFamily: 'JetBrains Mono, monospace',
    fontFamilyMono: 'JetBrains Mono, monospace',
    fontSizeBase: '14px',
    fontSizeSmall: '12px',
    fontSizeLarge: '16px',
    fontSizeXLarge: '20px',
    lineHeight: '1.6',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
  },
  borderRadius: '4px',
};

/**
 * Professional Theme
 * For business, consulting, legal contexts
 */
const professionalLight: Theme = {
  name: 'professional',
  mode: 'light',
  colors: {
    bgPrimary: '#ffffff',
    bgSecondary: '#f8f9fa',
    bgTertiary: '#e9ecef',
    fgPrimary: '#212529',
    fgSecondary: '#6c757d',
    fgTertiary: '#adb5bd',
    accentPrimary: '#0066cc',
    accentSuccess: '#28a745',
    accentWarning: '#ffc107',
    accentDanger: '#dc3545',
    accentInfo: '#17a2b8',
    border: '#dee2e6',
    borderFocus: '#0066cc',
    link: '#0066cc',
    linkHover: '#0052a3',
  },
  typography: {
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontFamilyMono: 'Monaco, "Courier New", monospace',
    fontSizeBase: '15px',
    fontSizeSmall: '13px',
    fontSizeLarge: '17px',
    fontSizeXLarge: '22px',
    lineHeight: '1.7',
  },
  spacing: {
    xs: '6px',
    sm: '12px',
    md: '20px',
    lg: '32px',
    xl: '48px',
  },
  borderRadius: '6px',
};

const professionalDark: Theme = {
  ...professionalLight,
  mode: 'dark',
  colors: {
    bgPrimary: '#1a1d23',
    bgSecondary: '#23262d',
    bgTertiary: '#2c2f38',
    fgPrimary: '#e8eaed',
    fgSecondary: '#9aa0a6',
    fgTertiary: '#5f6368',
    accentPrimary: '#4d94ff',
    accentSuccess: '#34c759',
    accentWarning: '#ffcc00',
    accentDanger: '#ff453a',
    accentInfo: '#5ac8fa',
    border: '#3c3f44',
    borderFocus: '#4d94ff',
    link: '#4d94ff',
    linkHover: '#66a3ff',
  },
};

/**
 * Financial Theme
 * For finance, audit, and investment contexts
 */
const financialLight: Theme = {
  name: 'financial',
  mode: 'light',
  colors: {
    bgPrimary: '#ffffff',
    bgSecondary: '#f5f7fa',
    bgTertiary: '#e4e9f0',
    fgPrimary: '#1a1f36',
    fgSecondary: '#697386',
    fgTertiary: '#8792a2',
    accentPrimary: '#1a5490',
    accentSuccess: '#00875a',
    accentWarning: '#ff991f',
    accentDanger: '#de350b',
    accentInfo: '#0065ff',
    border: '#dfe1e6',
    borderFocus: '#1a5490',
    link: '#0065ff',
    linkHover: '#0747a6',
  },
  typography: {
    fontFamily: 'IBM Plex Sans, -apple-system, sans-serif',
    fontFamilyMono: 'IBM Plex Mono, monospace',
    fontSizeBase: '15px',
    fontSizeSmall: '13px',
    fontSizeLarge: '17px',
    fontSizeXLarge: '22px',
    lineHeight: '1.6',
  },
  spacing: {
    xs: '6px',
    sm: '12px',
    md: '20px',
    lg: '32px',
    xl: '48px',
  },
  borderRadius: '4px',
};

const financialDark: Theme = {
  ...financialLight,
  mode: 'dark',
  colors: {
    bgPrimary: '#0d1117',
    bgSecondary: '#161b22',
    bgTertiary: '#21262d',
    fgPrimary: '#c9d1d9',
    fgSecondary: '#8b949e',
    fgTertiary: '#6e7681',
    accentPrimary: '#3d8fd1',
    accentSuccess: '#2ea44f',
    accentWarning: '#f0883e',
    accentDanger: '#f85149',
    accentInfo: '#58a6ff',
    border: '#30363d',
    borderFocus: '#3d8fd1',
    link: '#58a6ff',
    linkHover: '#79c0ff',
  },
};

/**
 * Campaign Theme
 * For political campaigns, advocacy, and public affairs
 */
const campaignLight: Theme = {
  name: 'campaign',
  mode: 'light',
  colors: {
    bgPrimary: '#ffffff',
    bgSecondary: '#f7f8fa',
    bgTertiary: '#edf0f5',
    fgPrimary: '#1c2127',
    fgSecondary: '#5c7080',
    fgTertiary: '#8a9ba8',
    accentPrimary: '#db3737',
    accentSuccess: '#0f9960',
    accentWarning: '#f29d49',
    accentDanger: '#c23030',
    accentInfo: '#2b95d6',
    border: '#d8e1e8',
    borderFocus: '#db3737',
    link: '#2b95d6',
    linkHover: '#1f6fb1',
  },
  typography: {
    fontFamily: 'Roboto, -apple-system, sans-serif',
    fontFamilyMono: 'Roboto Mono, monospace',
    fontSizeBase: '15px',
    fontSizeSmall: '13px',
    fontSizeLarge: '17px',
    fontSizeXLarge: '22px',
    lineHeight: '1.7',
  },
  spacing: {
    xs: '6px',
    sm: '12px',
    md: '20px',
    lg: '32px',
    xl: '48px',
  },
  borderRadius: '8px',
};

const campaignDark: Theme = {
  ...campaignLight,
  mode: 'dark',
  colors: {
    bgPrimary: '#1e1e1e',
    bgSecondary: '#252525',
    bgTertiary: '#2d2d2d',
    fgPrimary: '#e1e4e8',
    fgSecondary: '#959da5',
    fgTertiary: '#6a737d',
    accentPrimary: '#fa5252',
    accentSuccess: '#51cf66',
    accentWarning: '#fcc419',
    accentDanger: '#ff6b6b',
    accentInfo: '#4dabf7',
    border: '#3a3a3a',
    borderFocus: '#fa5252',
    link: '#4dabf7',
    linkHover: '#74c0fc',
  },
};

/**
 * Theme Registry
 */
export const themes: Record<string, Theme> = {
  'terminal-dark': terminalDark,
  'professional-light': professionalLight,
  'professional-dark': professionalDark,
  'financial-light': financialLight,
  'financial-dark': financialDark,
  'campaign-light': campaignLight,
  'campaign-dark': campaignDark,
};

/**
 * Get theme by name and mode
 */
export function getTheme(name: ThemeName, mode: ThemeMode): Theme {
  const key = `${name}-${mode}`;
  return themes[key] || terminalDark;
}

/**
 * Apply theme to DOM
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;

  // Colors
  Object.entries(theme.colors).forEach(([key, value]) => {
    root.style.setProperty(`--color-${kebabCase(key)}`, value);
  });

  // Typography
  Object.entries(theme.typography).forEach(([key, value]) => {
    root.style.setProperty(`--${kebabCase(key)}`, value);
  });

  // Spacing
  Object.entries(theme.spacing).forEach(([key, value]) => {
    root.style.setProperty(`--spacing-${key}`, value);
  });

  // Border radius
  root.style.setProperty('--border-radius', theme.borderRadius);

  // Store current theme
  localStorage.setItem('theme-name', theme.name);
  localStorage.setItem('theme-mode', theme.mode);
}

/**
 * Get current theme from storage
 */
export function getCurrentTheme(): Theme {
  if (typeof window === 'undefined') return terminalDark;

  const name = (localStorage.getItem('theme-name') as ThemeName) || 'terminal';
  const mode = (localStorage.getItem('theme-mode') as ThemeMode) || 'dark';

  return getTheme(name, mode);
}

/**
 * Utility: Convert camelCase to kebab-case
 */
function kebabCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Industry-to-theme mapping
 */
export const industryThemes: Record<string, ThemeName> = {
  developer: 'terminal',
  software: 'terminal',
  legal: 'professional',
  consulting: 'professional',
  'management-consulting': 'professional',
  finance: 'financial',
  'financial-services': 'financial',
  audit: 'financial',
  investment: 'financial',
  political: 'campaign',
  'public-affairs': 'campaign',
  advocacy: 'campaign',
  government: 'campaign',
};

/**
 * Get recommended theme for industry
 */
export function getThemeForIndustry(industry: string): ThemeName {
  return industryThemes[industry.toLowerCase()] || 'professional';
}

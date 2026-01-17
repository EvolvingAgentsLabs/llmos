/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Modern color system using RGB for opacity support
        bg: {
          primary: 'rgb(var(--bg-primary) / <alpha-value>)',
          secondary: 'rgb(var(--bg-secondary) / <alpha-value>)',
          tertiary: 'rgb(var(--bg-tertiary) / <alpha-value>)',
          elevated: 'rgb(var(--bg-elevated) / <alpha-value>)',
        },
        fg: {
          primary: 'rgb(var(--fg-primary) / <alpha-value>)',
          secondary: 'rgb(var(--fg-secondary) / <alpha-value>)',
          tertiary: 'rgb(var(--fg-tertiary) / <alpha-value>)',
          muted: 'rgb(var(--fg-muted) / <alpha-value>)',
        },
        accent: {
          primary: 'rgb(var(--accent-primary) / <alpha-value>)',
          secondary: 'rgb(var(--accent-secondary) / <alpha-value>)',
          success: 'rgb(var(--accent-success) / <alpha-value>)',
          warning: 'rgb(var(--accent-warning) / <alpha-value>)',
          error: 'rgb(var(--accent-error) / <alpha-value>)',
          info: 'rgb(var(--accent-info) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--border-primary) / <alpha-value>)',
          primary: 'rgb(var(--border-primary) / <alpha-value>)',
          secondary: 'rgb(var(--border-secondary) / <alpha-value>)',
          focus: 'rgb(var(--border-focus) / <alpha-value>)',
        },
        'glass-bg': 'rgb(var(--glass-bg))',
        'glass-border': 'rgb(var(--glass-border))',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['SF Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.125rem', { lineHeight: '1.75rem' }],
        xl: ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      animation: {
        'pulse-smooth': 'pulse-smooth 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fade-in 0.3s ease-out',
        'fade-out': 'fade-out 0.2s ease-in',
        'slide-in-from-right': 'slide-in-from-right 0.3s ease-out',
        'slide-in-from-left': 'slide-in-from-left 0.3s ease-out',
        'slide-in-from-bottom': 'slide-in-from-bottom 0.3s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
        'spin-slow': 'spin 3s linear infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'expand': 'expand 0.3s ease-out',
        'collapse': 'collapse 0.2s ease-in',
      },
      keyframes: {
        'pulse-smooth': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-out': {
          from: { opacity: '1' },
          to: { opacity: '0' },
        },
        'slide-in-from-right': {
          from: { transform: 'translateX(100%)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        'slide-in-from-left': {
          from: { transform: 'translateX(-100%)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        'slide-in-from-bottom': {
          from: { transform: 'translateY(20px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        'scale-in': {
          from: { transform: 'scale(0.9)', opacity: '0' },
          to: { transform: 'scale(1)', opacity: '1' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 20px rgb(var(--accent-primary) / 0.2)' },
          '50%': { boxShadow: '0 0 40px rgb(var(--accent-primary) / 0.4)' },
        },
        'expand': {
          from: { width: '0', opacity: '0' },
          to: { width: 'var(--panel-width)', opacity: '1' },
        },
        'collapse': {
          from: { width: 'var(--panel-width)', opacity: '1' },
          to: { width: '0', opacity: '0' },
        },
      },
      boxShadow: {
        'glow': '0 0 20px rgb(var(--accent-primary) / 0.3)',
        'glow-lg': '0 0 30px rgb(var(--accent-primary) / 0.4)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    // Custom plugin for utilities
    function({ addUtilities }) {
      addUtilities({
        // Scrollbar utilities
        '.scrollbar-hide': {
          '-ms-overflow-style': 'none',
          'scrollbar-width': 'none',
          '&::-webkit-scrollbar': {
            display: 'none',
          },
        },
        '.scrollbar-thin': {
          'scrollbar-width': 'thin',
        },

        // Panel utilities for adaptive layout
        '.panel-transition': {
          'transition-property': 'width, opacity, transform',
          'transition-duration': '200ms',
          'transition-timing-function': 'cubic-bezier(0.4, 0, 0.2, 1)',
        },
        '.panel-collapsed': {
          width: '0',
          opacity: '0',
          overflow: 'hidden',
        },

        // Focus ring for panel focus indicator
        '.focus-ring-panel': {
          '&:focus-within': {
            'box-shadow': 'inset 0 0 0 2px rgb(var(--accent-primary) / 0.3)',
          },
        },

        // Glass panel effect
        '.glass-panel': {
          'background': 'rgb(var(--bg-secondary) / 0.8)',
          'backdrop-filter': 'blur(12px)',
          '-webkit-backdrop-filter': 'blur(12px)',
          'border': '1px solid rgb(var(--border-primary) / 0.5)',
        },

        // Resize handle
        '.resize-handle': {
          cursor: 'col-resize',
          'user-select': 'none',
          'touch-action': 'none',
        },
        '.resize-handle-vertical': {
          cursor: 'row-resize',
          'user-select': 'none',
          'touch-action': 'none',
        },

        // Cortex glow effect
        '.cortex-glow': {
          'box-shadow': '0 0 30px rgb(var(--accent-primary) / 0.3), 0 0 60px rgb(var(--accent-primary) / 0.1)',
        },
      });
    },
  ],
}

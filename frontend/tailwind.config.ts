import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      // ShadCN CSS variable color mappings
      colors: {
        border:     'hsl(var(--border))',
        input:      'hsl(var(--input))',
        ring:       'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT:    'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT:    'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT:    'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT:    'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT:    'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT:    'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT:    'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // MateDesk design tokens
        md: {
          bg:              '#0a0d14',
          sidebar:         '#070a11',
          surface:         '#0f1320',
          'surface-hover': '#131a2e',
          'surface-active':'#162036',
          'border-subtle': '#1a2035',
          'border-base':   '#1e2640',
          'border-strong': '#2a3352',
          indigo:          '#6366f1',
          'indigo-hover':  '#4f46e5',
          'indigo-muted':  'rgba(99,102,241,0.12)',
          'text-base':     '#f1f5f9',
          'text-soft':     '#94a3b8',
          'text-muted':    '#64748b',
          'text-dim':      '#475569',
          // Ticket status
          's-open':        '#3b82f6',
          's-pending':     '#f59e0b',
          's-progress':    '#6366f1',
          's-actioned':    '#8b5cf6',
          's-solved':      '#10b981',
          's-closed':      '#6b7280',
          // Priority
          'p-low':         '#22c55e',
          'p-medium':      '#3b82f6',
          'p-high':        '#f59e0b',
          'p-critical':    '#ef4444',
        },
      },
      borderRadius: {
        lg:   'var(--radius)',
        md:   'calc(var(--radius) - 2px)',
        sm:   'calc(var(--radius) - 4px)',
        none: '0px',
      },
      fontFamily: {
        sans:  ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        mono:  ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
        saira: ['var(--font-saira)', 'Saira', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.65rem', { lineHeight: '1rem' }],
        xs:    ['0.7rem',  { lineHeight: '1rem' }],
        sm:    ['0.8rem',  { lineHeight: '1.25rem' }],
        base:  ['0.875rem',{ lineHeight: '1.5rem' }],
        lg:    ['1rem',    { lineHeight: '1.5rem' }],
        xl:    ['1.125rem',{ lineHeight: '1.75rem' }],
        '2xl': ['1.25rem', { lineHeight: '1.75rem' }],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to:   { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to:   { height: '0' },
        },
        fadeIn: {
          '0%':   { opacity: '0', transform: 'translateY(-4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%':   { opacity: '0', transform: 'translateX(8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideDown: {
          '0%':   { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        skeleton: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.5' },
        },
      },
      animation: {
        'accordion-down':  'accordion-down 0.2s ease-out',
        'accordion-up':    'accordion-up 0.2s ease-out',
        'fade-in':         'fadeIn 0.15s ease-out',
        'slide-in-right':  'slideInRight 0.2s ease-out',
        'slide-down':      'slideDown 0.2s ease-out',
        'skeleton':        'skeleton 1.5s infinite',
        'pulse-soft':      'pulseSoft 2s infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;

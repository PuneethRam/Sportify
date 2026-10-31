import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      fontFamily: {
        display: ['Rajdhani', 'system-ui', 'sans-serif'],
        body:    ['Inter',    'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow-violet':    '0 0 24px rgba(59, 130, 246, 0.28)',
        'glow-violet-sm': '0 0 12px rgba(59, 130, 246, 0.18)',
        'glow-sky':       '0 0 24px rgba(59, 130, 246, 0.28)',
        'glow-sky-sm':    '0 0 12px rgba(59, 130, 246, 0.18)',
        'glow-blue':      '0 0 24px rgba(59, 130, 246, 0.28)',
        'glow-blue-sm':   '0 0 12px rgba(59, 130, 246, 0.18)',
        'glow-gold':      '0 0 24px rgba(251, 191, 36, 0.25)',
        'glow-gold-sm':   '0 0 12px rgba(251, 191, 36, 0.15)',
        'glow-green':     '0 0 16px rgba(52, 211, 153, 0.22)',
        'sport':          '0 4px 32px rgba(0, 0, 0, 0.45)',
      },
      animation: {
        'blob':       'blob 7s infinite',
        'fade-up':    'fadeInUp 0.4s ease-out both',
        'pulse-glow': 'pulseGlow 2.5s infinite',
        'shimmer':    'shimmer 3s linear infinite',
        'count-up':   'countUp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both',
      },
      keyframes: {
        blob: {
          '0%, 100%': { transform: 'translate(0,0) scale(1)' },
          '33%':      { transform: 'translate(30px,-50px) scale(1.1)' },
          '66%':      { transform: 'translate(-20px,20px) scale(0.9)' },
        },
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          from: { backgroundPosition: '-200% center' },
          to:   { backgroundPosition:  '200% center' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(59,130,246,0)' },
          '50%':      { boxShadow: '0 0 20px 6px rgba(59,130,246,0.20)' },
        },
        countUp: {
          from: { opacity: '0', transform: 'scale(0.75)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;

import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: '#0f0f0f', secondary: '#1a1a1a', card: '#212121', hover: '#2a2a2a', elevated: '#181818' },
        accent: { DEFAULT: '#3ea6ff', hover: '#65b8ff', glow: 'rgba(62,166,255,0.15)' },
        danger: '#ff4444',
        success: '#2ba640',
        warn: '#f0b90b',
        muted: '#8a8a8a',
        subtle: '#aaaaaa',
        border: '#333333',
      },
      borderRadius: { DEFAULT: '8px', lg: '12px', xl: '16px' },
      animation: {
        'fade-in': 'fadeIn 0.3s ease',
        'slide-up': 'slideUp 0.3s ease',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
};
export default config;

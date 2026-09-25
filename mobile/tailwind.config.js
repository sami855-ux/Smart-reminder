/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        ink: '#1C1D21',
        canvas: '#F7F6F3',
        paper: '#FFFFFF',
        intelligence: '#5B5FEF',
        success: '#2E9E6C',
        urgent: '#E4572E',
        taupe: '#B8B4AA',
        'muted-ink': '#6F6B63',
      },
      fontFamily: {
        inter: ['Inter_400Regular'],
        'inter-medium': ['Inter_500Medium'],
        'inter-semibold': ['Inter_600SemiBold'],
        mono: ['IBMPlexMono_400Regular'],
        'mono-medium': ['IBMPlexMono_500Medium'],
      },
    },
  },
  plugins: [],
};

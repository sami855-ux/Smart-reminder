/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        ink: '#000000',
        canvas: '#F2F2F7',
        paper: '#FFFFFF',
        intelligence: '#007AFF',
        'intelligence-dark': '#0062CC',
        'intelligence-soft': '#EAF4FF',
        'secondary-fill': '#E5E5EA',
        success: '#248A3D',
        'success-soft': '#ECF8EE',
        urgent: '#FF3B30',
        'urgent-soft': '#FFF0EF',
        taupe: '#C6C6C8',
        'muted-ink': '#3C3C43',
        'subtle-ink': '#8E8E93',
      },
    },
  },
  plugins: [],
};

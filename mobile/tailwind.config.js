/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        ink: '#20201E',
        canvas: '#F3F3F0',
        paper: '#FCFCFA',
        intelligence: '#343431',
        'intelligence-dark': '#20201E',
        'intelligence-soft': '#E9E9E5',
        'secondary-fill': '#E8E8E3',
        success: '#248A3D',
        'success-soft': '#ECF8EE',
        urgent: '#C73E35',
        'urgent-soft': '#F9E9E7',
        taupe: '#D3D3CD',
        'muted-ink': '#555550',
        'subtle-ink': '#85857E',
      },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        ink: '#17171A',
        canvas: '#F7F7F8',
        paper: '#FFFFFF',
        intelligence: '#2764E7',
        'intelligence-dark': '#1649B8',
        'intelligence-soft': '#E9F0FF',
        'secondary-fill': '#EEEFF2',
        success: '#248A3D',
        'success-soft': '#ECF8EE',
        urgent: '#D63B32',
        'urgent-soft': '#FDECEA',
        warning: '#A85E00',
        'warning-soft': '#FFF3DE',
        scheduled: '#6B55D9',
        'scheduled-soft': '#F0ECFF',
        completed: '#257A52',
        'completed-soft': '#E8F6EF',
        taupe: '#DADCE2',
        'muted-ink': '#55565C',
        'subtle-ink': '#85868D',
      },
    },
  },
  plugins: [],
};

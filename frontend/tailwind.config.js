/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        ink: '#121212',
        surface: '#1A1A1A',
        surfaceLight: '#FFFFFF',
        catYellow: '#FFCD11',
        ok: '#2E9E44',
        warn: '#F2A900',
        danger: '#D62828',
        border: '#3A3A3A',
      },
      fontFamily: {
        condensed: ['"Barlow Condensed"', 'sans-serif'],
        body: ['Barlow', 'sans-serif'],
      },
      fontSize: {
        base: '18px',
        label: ['20px', { fontWeight: '700' }],
        figure: ['56px', { fontWeight: '700', lineHeight: '1' }],
        'figure-lg': ['64px', { fontWeight: '700', lineHeight: '1' }],
      },
      borderRadius: {
        DEFAULT: '6px',
      },
      spacing: {
        touch: '64px',
        btn: '72px',
      },
    },
  },
  plugins: [],
};

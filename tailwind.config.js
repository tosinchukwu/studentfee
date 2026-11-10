/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', 'ui-sans-serif', 'sans-serif'],
        display: ['"Space Grotesk"', '"DM Sans"', 'ui-sans-serif', 'sans-serif'],
      },
      colors: {
        canvas: '#F4F7FA',
        ink: '#17243B',
        brand: {
          50: '#EAF7F5',
          100: '#D1EEE9',
          500: '#279B91',
          600: '#168176',
          700: '#0F665F',
          800: '#0B504B',
        },
      },
      boxShadow: {
        card: '0 2px 5px rgba(16,29,53,0.035), 0 12px 32px rgba(16,29,53,0.055)',
      },
    },
  },
  plugins: [],
}

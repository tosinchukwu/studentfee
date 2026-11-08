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
        canvas: '#F6F4EE',
        ink: '#1A2233',
        brand: {
          50: '#EEF6F5',
          100: '#D6EBE8',
          500: '#1F8A83',
          600: '#177872',
          700: '#0F5F5B',
          800: '#0C4A47',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(26,34,51,0.05), 0 6px 20px rgba(26,34,51,0.06)',
      },
    },
  },
  plugins: [],
}

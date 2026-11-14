/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: {
    fontFamily: { sans:['"DM Sans"','ui-sans-serif','sans-serif'], display:['"Space Grotesk"','"DM Sans"','ui-sans-serif','sans-serif'] },
    colors: {
      canvas:'#FFF8F0', ink:'#17243B',
      brand:{50:'#FFF1E4',100:'#FFE1C5',500:'#FF922E',600:'#FF7900',700:'#E66D00',800:'#C85B00'},
      ember:'#FF7900', facebook:'#1877F2', navy:'#172B4D'
    },
    boxShadow:{card:'0 2px 5px rgba(23,43,77,.035),0 12px 32px rgba(23,43,77,.07)'}
  }},
  plugins:[],
}

/** @type {import('tailwindcss').Config} */
export default {
 content: ['./index.html','./src/**/*.{js,ts,jsx,tsx}'],
 theme: { extend: {
  fontFamily: { sans:['Inter','ui-sans-serif','sans-serif'], display:['"Space Grotesk"','Inter','ui-sans-serif','sans-serif'], script:['"Great Vibes"','cursive'] },
  colors: { canvas:'#FFF4E9', ink:'#202B3A', mint:'#159B79', ember:'#FF7900', 'ember-soft':'#FFAD68', facebook:'#1877F2', muted:'#647184', brand:{50:'#FFF0E3',100:'#FFE0C2',500:'#FF7900',600:'#F06D00',700:'#FF7900',800:'#E96800'} },
  borderRadius:{glass:'20px'},
  boxShadow:{card:'0 18px 50px rgba(104,67,30,.09)',glow:'0 0 60px rgba(255,121,0,.18)'},
  animation:{'sf-float':'sf-float 7s ease-in-out infinite','sf-rise':'sf-rise .7s cubic-bezier(.2,.7,.2,1) both'}
 }},
 plugins:[]
}

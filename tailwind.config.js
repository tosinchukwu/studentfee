/** @type {import('tailwindcss').Config} */
export default {
 content: ['./index.html','./src/**/*.{js,ts,jsx,tsx}'],
 theme: { extend: {
  fontFamily: { sans:['Inter','ui-sans-serif','sans-serif'], display:['"Space Grotesk"','Inter','ui-sans-serif','sans-serif'] },
  colors: { canvas:'#05070A', ink:'#EDF2F7', mint:'#5EF2C4', muted:'#A6B3C0', brand:{50:'#10251f',100:'#17372e',500:'#5EF2C4',600:'#5EF2C4',700:'#5EF2C4',800:'#37dcae'} },
  borderRadius:{glass:'20px'},
  boxShadow:{card:'0 18px 60px rgba(0,0,0,.25)',glow:'0 0 60px rgba(45,212,191,.22)'},
  animation:{'sf-float':'sf-float 7s ease-in-out infinite','sf-rise':'sf-rise .7s cubic-bezier(.2,.7,.2,1) both'}
 }},
 plugins:[]
}

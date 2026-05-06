/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        cream:   '#FAF6EF',
        warm:    '#F5ECD7',
        charcoal:'#1C1C1C',
        walnut:  '#5C3D2E',
        terra:   '#C4622D',
        mustard: '#D4A853',
        sage:    '#7D9B76',
        'terra-light': '#E8845A',
        'terra-dark':  '#A0501F',
        'cream-dark':  '#EDE4D2',
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        sans:    ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'warm-sm': '0 1px 3px rgba(92,61,46,0.12)',
        'warm':    '0 4px 16px rgba(92,61,46,0.12)',
        'warm-lg': '0 8px 32px rgba(92,61,46,0.16)',
      },
    },
  },
  plugins: [],
}

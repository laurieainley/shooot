// Shooot Tailwind preset — pair with tokens.css (which defines the CSS variables).
// tailwind.config.js:  module.exports = { presets: [require('./brand/shooot/tailwind.preset.js')], ... }
// Theme-aware colours read CSS variables, so dark/light switching is handled by tokens.css.
module.exports = {
  theme: {
    extend: {
      colors: {
        lime: '#A8F03C',
        rec: '#FF3D2E',
        'on-lime': '#0A0D12',
        ground: 'var(--sh-ground)',
        surface: 'var(--sh-surface)',
        'surface-2': 'var(--sh-surface-2)',
        line: 'var(--sh-line)',
        ink: 'var(--sh-text)',
        muted: 'var(--sh-muted)',
        'lime-text': 'var(--sh-lime-text)',
        kit: {
          white: '#F3F1EA', black: '#1B1F24', blue: '#2F6BDB', red: '#D7263D', yellow: '#F2C230',
          green: '#1E9E58', orange: '#F07A1A', purple: '#7E4BD6', sky: '#5DC8E8',
        },
      },
      fontFamily: {
        sans: ['Archivo', 'system-ui', 'sans-serif'],
        shirt: ['"Big Shoulders Display"', 'Archivo', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontStretch: {
        stadium: '125%',
        heading: '85%',
        scoreboard: '72%',
      },
      borderRadius: { sm: '6px', md: '10px', lg: '16px' },
      skew: { brand: '-10deg' },
      transitionTimingFunction: {
        'sh-out': 'cubic-bezier(.2,.7,.2,1)',
        'sh-net': 'cubic-bezier(.3,.6,.3,1)',
      },
    },
  },
  plugins: [
    // font-stretch utilities: font-stretch-stadium / -heading / -scoreboard
    function ({ matchUtilities, theme }) {
      matchUtilities({ 'font-stretch': (v) => ({ fontStretch: v }) }, { values: theme('fontStretch') });
    },
  ],
};

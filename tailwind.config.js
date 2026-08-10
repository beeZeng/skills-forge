/** @type {import('tailwindcss').Config} */
/** Grafana-aligned typography: Inter + Roboto Mono, 14px base, medium=500 */

const grafanaSans = [
  'Inter',
  'Helvetica',
  'Arial',
  '"PingFang SC"',
  '"Hiragino Sans GB"',
  '"Microsoft YaHei"',
  'sans-serif',
]

const grafanaMono = ['"Roboto Mono"', 'monospace']

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        mesh: {
          bg: 'var(--mesh-bg)',
          panel: 'var(--mesh-panel)',
          card: 'var(--mesh-card)',
          cardHover: 'var(--mesh-card-hover)',
          border: 'var(--mesh-border)',
          borderBright: 'var(--mesh-border-bright)',
          text: 'var(--mesh-text)',
          muted: 'var(--mesh-muted)',
          dim: 'var(--mesh-dim)',
          accent: 'var(--mesh-accent)',
          accentSoft: 'var(--mesh-accent-soft)',
          success: 'var(--mesh-success)',
          warning: 'var(--mesh-warning)',
          danger: 'var(--mesh-danger)',
        },
      },
      borderRadius: {
        mesh: '4px',
      },
      boxShadow: {
        mesh: 'var(--mesh-shadow)',
      },
      fontFamily: {
        sans: grafanaSans,
        mono: grafanaMono,
      },
      // Grafana weights: light 300 / regular 400 / medium&semibold&bold 500
      fontWeight: {
        light: '300',
        normal: '400',
        medium: '500',
        semibold: '500',
        bold: '500',
      },
      // Grafana size scale (approx): xs 10 / sm 12 / base 14 / lg 18 / h*
      fontSize: {
        xs: ['0.7142857rem', { lineHeight: '1.25' }], // ~10px @ 14 root
        sm: ['0.8571429rem', { lineHeight: '1.4' }], // ~12px
        base: ['1rem', { lineHeight: '1.5' }], // 14px
        lg: ['1.2857143rem', { lineHeight: '1.4' }], // ~18px
        xl: ['1.5714286rem', { lineHeight: '1.35' }], // ~22px
        '2xl': ['1.7142857rem', { lineHeight: '1.3' }], // ~24px
        '3xl': ['2rem', { lineHeight: '1.25' }], // 28px
      },
    },
  },
  plugins: [],
}

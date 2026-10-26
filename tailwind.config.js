module.exports = {
  darkMode: 'class',
  content: [
    "./src/**/*.{html,ts}"
  ],
  theme: {
    extend: {
      colors: {
        'wb-gold': 'var(--wb-gold)',
        'wb-obsidian-navy': 'var(--wb-obsidian-navy)',
        'wb-intelligence-emerald': 'var(--wb-intelligence-emerald)',
        'wb-ice-white': 'var(--wb-ice-white)',
        'wb-slate': 'var(--wb-slate)',
        'wb-muted': 'var(--wb-muted)',
        'wb-mist': 'var(--wb-mist)',
        'wb-action-primary': 'var(--wb-action-primary)',
        primary: "#2563EB",
        stable: "#22C55E",
        low: "#F97316",
        fatigue: "#EAB308",
        risk: "#EF4444",
      }
    }
  },
  plugins: []
}

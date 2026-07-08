import { createTheme, type MantineColorsTuple } from '@mantine/core'

// Spotify brand green (#1DB954 at index 5).
const spotify: MantineColorsTuple = [
  '#e3fbec',
  '#c9f3d8',
  '#93e8b1',
  '#5cdc8a',
  '#2ed167',
  '#1db954',
  '#14a348',
  '#0c8c3c',
  '#047530',
  '#005e24',
]

// Brutal Assault poster gold (the logo's gradient runs roughly gold[2] → gold[6]).
const gold: MantineColorsTuple = [
  '#fff8e1',
  '#fbedc2',
  '#f8dd8d',
  '#f5cd57',
  '#f2c02c',
  '#eda812',
  '#d38f06',
  '#b87800',
  '#9d6600',
  '#845500',
]

// Mantine's stock dark palette, warm-shifted so surfaces sit naturally under the gold glow.
const dark: MantineColorsTuple = [
  '#cbc7bf',
  '#b1ada4',
  '#94918a',
  '#615e57',
  '#3d3a34',
  '#2a2723',
  '#211e1a',
  '#151310',
  '#0f0d0a',
  '#0a0806',
]

export const theme = createTheme({
  colors: { spotify, gold, dark },
  primaryColor: 'spotify',
  primaryShade: 5,
  // Dark text on gold/green filled buttons (Spotify's own buttons are black-on-green).
  autoContrast: true,
  luminanceThreshold: 0.45,
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  headings: {
    fontFamily: "'Anton', 'Arial Narrow', sans-serif",
    fontWeight: '400',
  },
  defaultRadius: 'md',
})

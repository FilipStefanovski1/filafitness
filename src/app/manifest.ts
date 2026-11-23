import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'FilaFitness',
    short_name: 'FilaFitness',
    description: 'Calorie and protein diary for two.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    categories: ['health', 'fitness', 'food'],
    icons: [
      { src: '/icons/192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Add food', url: '/add', icons: [{ src: '/icons/192.png', sizes: '192x192' }] },
      { name: 'Paste GPT estimate', url: '/estimate' },
      { name: 'Log weight', url: '/weight' },
    ],
  };
}

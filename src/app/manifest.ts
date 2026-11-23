import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FilaFitness',
    short_name: 'FilaFitness',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#1f5fe0',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}

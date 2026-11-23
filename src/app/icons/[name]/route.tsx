import { ImageResponse } from 'next/og';
import { brandDataUri } from '@/lib/brand';

const VARIANTS: Record<string, { size: number; maskable: boolean }> = {
  '192.png': { size: 192, maskable: false },
  '512.png': { size: 512, maskable: false },
  'maskable-512.png': { size: 512, maskable: true },
};

export const dynamic = 'force-static';
export function generateStaticParams() {
  return Object.keys(VARIANTS).map((name) => ({ name }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const v = VARIANTS[(await params).name];
  if (!v) return new Response('Not found', { status: 404 });
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img src={brandDataUri({ maskable: v.maskable })} width={v.size} height={v.size} />,
    { width: v.size, height: v.size, headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } },
  );
}

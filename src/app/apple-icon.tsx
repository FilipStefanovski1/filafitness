import { ImageResponse } from 'next/og';
import { brandDataUri } from '@/lib/brand';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** iOS applies its own corner mask, so the tile is full-bleed. */
export default function AppleIcon() {
  // eslint-disable-next-line jsx-a11y/alt-text
  return new ImageResponse(<img src={brandDataUri({ rounded: false })} width={180} height={180} />, size);
}

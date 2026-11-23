import { ImageResponse } from 'next/og';
import { brandDataUri } from '@/lib/brand';

export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default function Icon() {
  // eslint-disable-next-line jsx-a11y/alt-text
  return new ImageResponse(<img src={brandDataUri()} width={64} height={64} />, size);
}

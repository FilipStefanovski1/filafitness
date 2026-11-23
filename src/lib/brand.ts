/** FilaFitness mark: a blue tile with a 78% progress ring and a geometric "F". */
export function brandSvg({ maskable = false, rounded = true }: { maskable?: boolean; rounded?: boolean } = {}): string {
  const s = maskable ? 0.72 : 1; // keep the mark inside the maskable safe zone
  const t = `translate(256 256) scale(${s}) translate(-256 -256)`;
  const r = 168;
  const c = 2 * Math.PI * r;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b7bff"/><stop offset="1" stop-color="#1546c4"/></linearGradient></defs>
<rect width="512" height="512" rx="${rounded && !maskable ? 116 : 0}" fill="url(#g)"/>
<g transform="${t}">
<circle cx="256" cy="256" r="${r}" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="44"/>
<circle cx="256" cy="256" r="${r}" fill="none" stroke="#ffffff" stroke-width="44" stroke-linecap="round" stroke-dasharray="${(c * 0.78).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 256 256)"/>
<path d="M210 172h100v42h-56v26h50v40h-50v60h-44z" fill="#ffffff"/>
</g></svg>`;
}

export const brandDataUri = (o?: Parameters<typeof brandSvg>[0]) =>
  `data:image/svg+xml;base64,${Buffer.from(brandSvg(o)).toString('base64')}`;

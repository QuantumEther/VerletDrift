// Bump when shared shader interfaces change so cached fragments cannot mix releases.
export const LIQUID_SHADER_REVISION = 'wet-tire-optics-2';
export async function liquidShaderSource(name) {
  const url = new URL(`../shaders/liquid/${name}.wgsl`, import.meta.url);
  url.searchParams.set('v', LIQUID_SHADER_REVISION);
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw Error(`Liquid ${name}: HTTP ${response.status}`);
  return response.text();
}

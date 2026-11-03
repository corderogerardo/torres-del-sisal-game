// Shared game data: run collectibles, spawn maps, floor plans and themes.
// Frozen so callers cannot mutate configuration shared by all floors.

function deepFreeze(value) {
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return Object.freeze(value);
}

export const MEMENTOS = deepFreeze([
  { name: 'La foto de tu madre', mem: 'Su risa en la cocina. El olor a café con leche.' },
  { name: 'El dibujo de tu hija', mem: '«PAPÁ» escrito con crayón rojo, todo torcido.' },
  { name: 'La carta de un amigo', mem: '«Aguanta, hermano. Voy en camino.»' },
  { name: 'El anillo de bodas', mem: '«Hasta que la muerte…» — todavía no.' },
  { name: 'Un mensaje de voz', mem: '«Vuelve a casa. Te estamos esperando.»' },
  { name: 'El rosario de tu abuela', mem: 'Cuentas gastadas de tanto rezar por ti.' },
]);

// Plan codes map to bestiary kinds; unknown spawn codes retain the Silbon fallback.
export const SPAWN_FACTORY = deepFreeze({
  s: 'sombra',
  d: 'duende',
  y: 'sayona',
  l: 'llorona',
  b: 'silbon',
  m: 'manguanguas',
});

export const RESPAWN_FACTORY = deepFreeze({
  sayona: 'sayona',
  silbon: 'silbon',
  duende: 'duende',
  manguanguas: 'manguanguas',
});

export const FLOOR_PLANS = deepFreeze({
  1: ['s'],
  2: ['s', 's'],
  3: ['s', 'd', 'd'],
  4: ['l', 'm', 'd'],
  5: ['y', 's', 'd'],
  6: ['b', 'd', 'd', 's'],
  7: ['y', 'l', 'b', 's'],
});

export const THEMES = deepFreeze([
  { name: 'EL VESTÍBULO', wall: 0x474d54, floor: 0x2d3238, fog: 0x05070a, fogD: 0.044, accent: 0x8fb3d9, props: 9, tall: 0.25 },
  { name: 'PISO INUNDADO', wall: 0x39505a, floor: 0x142830, fog: 0x03151c, fogD: 0.056, accent: 0x4a9ab0, props: 7, tall: 0.15 },
  { name: 'LA CAPILLA ROTA', wall: 0x4c4238, floor: 0x2a231c, fog: 0x0a0704, fogD: 0.05, accent: 0xd9a441, props: 12, tall: 0.55 },
  { name: 'LA GUARDERÍA', wall: 0x54444c, floor: 0x2e2329, fog: 0x0a0509, fogD: 0.055, accent: 0xc77d92, props: 10, tall: 0.2 },
  { name: 'SALA DE ESPEJOS', wall: 0x3c4450, floor: 0x1d222a, fog: 0x05070d, fogD: 0.066, accent: 0x9fc4e8, props: 13, tall: 0.6 },
  { name: 'EL MATADERO', wall: 0x4c2f33, floor: 0x271719, fog: 0x0a0405, fogD: 0.07, accent: 0xE63946, props: 11, tall: 0.35 },
  { name: 'LA AZOTEA', wall: 0x272d36, floor: 0x21252b, fog: 0x060a12, fogD: 0.03, accent: 0x8fb3d9, props: 5, tall: 0.1 },
]);

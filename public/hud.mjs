// Hud render seam: pure ESM, no window/document/THREE imports.
// The caller injects DOM nodes via { el }; all nodes are optional.
export function createHud({ el } = {}) {
  const nodes = el ?? {};
  const cache = {
    banner: undefined,
    statLine: undefined,
    dread: undefined,
    timeText: undefined,
  };

  function writeText(key, value) {
    if (cache[key] === value) return;
    cache[key] = value;
    const node = nodes[key];
    if (!node) return;
    node.textContent = value;
    if (key === 'banner' && node.classList) {
      if (value) {
        node.classList.remove?.('hidden');
      } else {
        node.classList.add?.('hidden');
      }
    }
  }

  function render(state) {
    const s = state ?? {};
    writeText('banner', String(s.banner ?? ''));
    writeText('statLine', String(s.statLine ?? ''));
    writeText('dread', String(s.dread ?? ''));
    writeText('timeText', String(s.timeText ?? ''));
  }

  return { render };
}

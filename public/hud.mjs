// Hud render seam: a pure HUD view model with no browser or renderer imports.
// The caller injects DOM nodes via { el }; every node is optional and every write is
// dirty-checked, so an unchanged state never touches the DOM.

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toCount(value) {
  return Math.max(0, Math.floor(toNumber(value)));
}

function toText(value) {
  return value === undefined || value === null ? '' : String(value);
}

export function createHud({ el } = {}) {
  const nodes = el ?? {};
  const cache = Object.create(null);

  function writeText(key, name, value) {
    if (cache[key] === value) return;
    const node = nodes[name];
    if (!node) return;
    cache[key] = value;
    node.textContent = value;
  }

  function writeStyle(key, name, property, value) {
    if (cache[key] === value) return;
    const node = nodes[name];
    if (!node) return;
    cache[key] = value;
    node.style[property] = value;
  }

  function writeHidden(key, name, hidden) {
    if (cache[key] === hidden) return;
    const node = nodes[name];
    if (!node) return;
    cache[key] = hidden;
    node.classList?.toggle?.('hidden', hidden);
  }

  // Restarting a CSS animation requires resetting it, forcing layout, and
  // re-applying it; keeping that sequence here preserves the banner contract.
  function writeBanner(value) {
    if (cache.banner === value) return;
    const node = nodes.banner;
    if (!node) return;
    cache.banner = value;
    if (value) {
      node.textContent = value;
      node.classList?.remove?.('hidden');
      node.style.animation = 'none';
      void node.offsetWidth;
      node.style.animation = 'bannerIn 2.4s ease forwards';
      return;
    }
    node.classList?.add?.('hidden');
  }

  function render(state) {
    const s = state ?? {};

    writeHidden('introHidden', 'intro', s.phase !== 'intro');
    writeHidden('hudHidden', 'hud', s.phase !== 'playing');
    writeStyle('endDisplay', 'end', 'display', s.phase === 'end' ? 'flex' : 'none');
    writeHidden('endHidden', 'end', s.phase !== 'end');
    writeHidden('pauseHidden', 'pause', !(s.phase === 'playing' && s.paused));
    writeHidden('hiddenOverlayHidden', 'hiddenOverlay', !s.hiddenView);
    writeStyle(
      'reticleDisplay',
      'reticle',
      'display',
      s.phase === 'playing' && !s.paused && !s.hiddenView ? 'block' : 'none',
    );

    writeStyle('redveilOpacity', 'redveil', 'opacity', Math.min(0.62, (toNumber(s.dread) / 100) * 0.68));
    writeText('floorText', 'floorText', String(s.floor ?? 0).padStart(2, '0'));
    writeText('floorName', 'floorName', toText(s.floorName));
    writeText('dreadPct', 'dreadPct', `${Math.round(toNumber(s.dread))}%`);
    writeStyle('dreadBarWidth', 'dreadBar', 'width', `${Math.round(toNumber(s.dread))}%`);
    writeText('timeText', 'timeText', toText(s.timeText));
    writeStyle('timeTextColor', 'timeText', 'color', toText(s.timerColor));
    writeText('objective', 'objective', toText(s.objective));
    writeStyle('compassTransform', 'compass', 'transform', `rotate(${s.compassRot ?? 0}deg)`);
    writeStyle('battBarWidth', 'battBar', 'width', `${Math.round(toNumber(s.batt))}%`);
    writeStyle(
      'battBarBackground',
      'battBar',
      'background',
      toNumber(s.batt) < 25 ? '#E63946' : '#A8DADC',
    );
    writeStyle('stamBarWidth', 'stamBar', 'width', `${Math.round(toNumber(s.stam))}%`);
    writeText('ammo', 'ammo', toText(s.ammo ?? 0));

    const mementos = toCount(s.mementos);
    const lifelines = toCount(s.lifelines);
    writeText('mementoCount', 'mementoCount', `${mementos} / 6`);
    writeText(
      'lifelineDots',
      'lifelineDots',
      '♥'.repeat(lifelines) + '♡'.repeat(Math.max(0, mementos - lifelines)),
    );

    writeHidden('resistWrapHidden', 'resistWrap', !s.showResist);
    writeStyle('resistBarWidth', 'resistBar', 'width', `${Math.round(toNumber(s.temptation))}%`);
    writeText('resistNarr', 'resistNarr', toText(s.resistNarr));

    writeBanner(toText(s.banner));

    if (s.phase === 'end' && s.ending) {
      writeText('endTitle', 'endTitle', toText(s.ending.title));
      writeStyle('endTitleColor', 'endTitle', 'color', s.ending.bad ? '#E63946' : '#A8DADC');
      writeText('endSub', 'endSub', toText(s.ending.sub));
      writeText('endStats', 'endStats', toText(s.ending.stats));
    }

    // Legacy single-line fields kept for callers that still inject these nodes.
    writeText('statLine', 'statLine', toText(s.statLine));
    writeText('dread', 'dread', toText(s.dread));
  }

  return { render };
}

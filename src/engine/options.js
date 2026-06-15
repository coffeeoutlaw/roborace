// Simplified classic Option cards. Baseline rule: ANY option may be discarded at the
// moment damage is received to prevent 1 damage. These six also have a passive effect.
export const OPTIONS = {
  'extra-memory': { name: 'Extra Memory', desc: 'You are dealt 1 extra Program card each turn.' },
  'double-laser': { name: 'Double-Barreled Laser', desc: 'Your main laser deals 2 damage.' },
  'rear-laser': { name: 'Rear-Firing Laser', desc: 'You also fire a 1-damage laser backward.' },
  'ablative-coat': { name: 'Ablative Coat', desc: 'Absorbs the next 3 damage, then is discarded.', uses: 3 },
  'superior-archive': { name: 'Superior Archive', desc: 'You re-enter play with no damage.' },
  'pd-shield': { name: 'Power-Down Shield', desc: 'While powered down, prevent 1 damage from each attack.' },
};

export function buildOptionDeck() {
  // Two copies of each of the six options.
  const deck = [];
  for (const id of Object.keys(OPTIONS)) {
    for (let i = 0; i < 2; i++) {
      deck.push({ id, name: OPTIONS[id].name, uses: OPTIONS[id].uses ?? null });
    }
  }
  return deck;
}

// The classic 84-card program deck. Every priority is a unique multiple of 10 in 10..840.
export const UTURN = 'uturn';
export const LEFT = 'left';
export const RIGHT = 'right';
export const BACKUP = 'backup';
export const MOVE1 = 'move1';
export const MOVE2 = 'move2';
export const MOVE3 = 'move3';

export const CARD_LABELS = {
  [UTURN]: 'U-Turn',
  [LEFT]: 'Rotate Left',
  [RIGHT]: 'Rotate Right',
  [BACKUP]: 'Back Up',
  [MOVE1]: 'Move 1',
  [MOVE2]: 'Move 2',
  [MOVE3]: 'Move 3',
};

export function buildDeck() {
  const deck = [];
  const add = (type, priority) => deck.push({ type, priority });
  for (let p = 10; p <= 60; p += 10) add(UTURN, p);
  for (let p = 70; p <= 410; p += 20) add(LEFT, p);
  for (let p = 80; p <= 420; p += 20) add(RIGHT, p);
  for (let p = 430; p <= 480; p += 10) add(BACKUP, p);
  for (let p = 490; p <= 660; p += 10) add(MOVE1, p);
  for (let p = 670; p <= 780; p += 10) add(MOVE2, p);
  for (let p = 790; p <= 840; p += 10) add(MOVE3, p);
  return deck; // 6+18+18+6+18+12+6 = 84
}

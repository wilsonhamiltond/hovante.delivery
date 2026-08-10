// Business categories come from the ERP with only a name, so pick an icon by keyword. Shared by
// the Explorar catalogue (category row and product thumbnails) and the home carousel, which would
// otherwise each carry their own copy of the table and drift apart.
const CATEGORY_EMOJI: { kw: string; emoji: string }[] = [
  { kw: 'restaur', emoji: '🍽️' }, { kw: 'comida', emoji: '🍽️' }, { kw: 'pizz', emoji: '🍕' },
  { kw: 'farmac', emoji: '💊' }, { kw: 'salud', emoji: '💊' },
  { kw: 'super', emoji: '🛒' }, { kw: 'mercado', emoji: '🛒' }, { kw: 'vivere', emoji: '🛒' },
  { kw: 'cafe', emoji: '☕' }, { kw: 'café', emoji: '☕' }, { kw: 'belle', emoji: '💄' },
  { kw: 'licor', emoji: '🍷' }, { kw: 'bebid', emoji: '🍷' }, { kw: 'ferret', emoji: '🔧' },
  { kw: 'ropa', emoji: '👕' }, { kw: 'tecno', emoji: '💻' }, { kw: 'flor', emoji: '💐' },
  { kw: 'postre', emoji: '🍰' }, { kw: 'pollo', emoji: '🍗' },
];

export const emojiFor = (name?: string): string => {
  const n = (name ?? '').toLowerCase();
  return CATEGORY_EMOJI.find((e) => n.includes(e.kw))?.emoji ?? '🏪';
};

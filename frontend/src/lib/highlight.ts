// Plages [début, fin) du texte d'origine qui correspondent à la recherche,
// avec la même tolérance que matchesText (casse et accents ignorés). Le texte
// est normalisé caractère par caractère en gardant, pour chaque caractère
// normalisé, l'indice du caractère d'origine : la suppression des accents
// change la longueur, et un surlignage calculé sur le texte normalisé
// tomberait à côté.
function foldChar(char: string): string {
  return char
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function highlightRanges(text: string, query: string): Array<[number, number]> {
  const needle = [...query.trim()].map(foldChar).join('');
  if (!needle) return [];

  let folded = '';
  const origin: number[] = [];
  let index = 0;
  for (const char of text) {
    const part = foldChar(char);
    folded += part;
    for (let i = 0; i < part.length; i += 1) origin.push(index);
    index += char.length;
  }

  const ranges: Array<[number, number]> = [];
  let from = folded.indexOf(needle);
  while (from !== -1) {
    const last = from + needle.length - 1;
    // Fin = début du caractère d'origine suivant, pour inclure ses accents
    // décomposés (« e » + accent combinant) dans le surlignage.
    const end = last + 1 < origin.length ? origin[last + 1]! : text.length;
    ranges.push([origin[from]!, end]);
    from = folded.indexOf(needle, last + 1);
  }
  return ranges;
}

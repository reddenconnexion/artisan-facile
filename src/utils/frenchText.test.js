import { describe, it, expect } from 'vitest';
import { pluralizeFrenchHead } from './frenchText';

describe('pluralizeFrenchHead', () => {
  it('accorde le nom de tête au pluriel régulier (+s)', () => {
    expect(pluralizeFrenchHead('Disjoncteur 16A')).toBe('Disjoncteurs 16A');
    expect(pluralizeFrenchHead('Câble 3G2.5')).toBe('Câbles 3G2.5');
    expect(pluralizeFrenchHead('Prise encastrée')).toBe('Prises encastrée');
    expect(pluralizeFrenchHead('Goulotte')).toBe('Goulottes');
  });

  it('gère -eau / -au / -eu → +x', () => {
    expect(pluralizeFrenchHead('Tableau divisionnaire')).toBe('Tableaux divisionnaire');
    expect(pluralizeFrenchHead('Tuyau PER')).toBe('Tuyaux PER');
    expect(pluralizeFrenchHead('Disjoncteur')).toBe('Disjoncteurs');
  });

  it('gère -al → -aux', () => {
    expect(pluralizeFrenchHead('Signal lumineux')).toBe('Signaux lumineux');
  });

  it('laisse invariable un mot déjà terminé par s/x/z', () => {
    expect(pluralizeFrenchHead('Vis inox')).toBe('Vis inox');
    expect(pluralizeFrenchHead('Flux thermique')).toBe('Flux thermique');
  });

  it('n\'accorde que le premier mot, pas les spécifications', () => {
    // « LED encastré » reste tel quel — seul le nom de tête « Spot » est accordé.
    expect(pluralizeFrenchHead('Spot LED encastré')).toBe('Spots LED encastré');
  });

  it('robuste aux entrées vides ou non-string', () => {
    expect(pluralizeFrenchHead('')).toBe('');
    expect(pluralizeFrenchHead(null)).toBe(null);
    expect(pluralizeFrenchHead(undefined)).toBe(undefined);
  });
});

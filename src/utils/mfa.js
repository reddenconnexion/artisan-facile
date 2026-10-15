// Double authentification (TOTP) — fonctions pures, testées sans navigateur.

// Un code de connexion TOTP fait 6 chiffres. On tolère les espaces que les
// applications d'authentification affichent (« 123 456 »).
export const sanitizeTotpCode = (value) => String(value ?? '').replace(/\D/g, '').slice(0, 6);

export const isValidTotpCode = (value) => /^\d{6}$/.test(value);

// Niveau d'assurance renvoyé par supabase.auth.mfa.getAuthenticatorAssuranceLevel() :
// un code est à saisir quand un facteur vérifié existe (nextLevel = aal2)
// mais que la session n'est encore qu'en aal1.
export const needsMfaChallenge = (aal) =>
    aal?.nextLevel === 'aal2' && aal?.currentLevel !== 'aal2';

// Premier facteur TOTP vérifié, ou null.
export const pickVerifiedTotpFactor = (factors) =>
    (factors?.totp ?? []).find((f) => f.status === 'verified') ?? null;

// Facteurs TOTP commencés mais jamais confirmés (QR scanné puis abandonné) :
// à supprimer avant une nouvelle activation, sinon Supabase refuse le doublon.
export const unverifiedTotpFactors = (factors) =>
    (factors?.all ?? []).filter((f) => f.factor_type === 'totp' && f.status !== 'verified');

// Clé secrète groupée par 4 pour la saisie manuelle (« ABCD EFGH … »).
export const formatTotpSecret = (secret) =>
    String(secret ?? '').replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();

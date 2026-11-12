import { describe, it, expect } from 'vitest';
import {
    attestationDownloadUrl,
    attestationFileName,
    attestationStoragePath,
    attestationValidity,
    buildAttestationPath,
} from './insuranceAttestation';

const PUBLIC_URL = 'https://xyz.supabase.co/storage/v1/object/public/quote_files/attestations/user-1/attestation-decennale-abc.pdf';

describe('buildAttestationPath', () => {
    it('range le fichier dans le dossier de l\'artisan, sous un nom imprévisible', () => {
        const a = buildAttestationPath('user-1');
        const b = buildAttestationPath('user-1');
        expect(a).toMatch(/^attestations\/user-1\/attestation-decennale-[0-9a-f]{32}\.pdf$/);
        expect(a).not.toBe(b);
    });
});

describe('attestationStoragePath', () => {
    it('retrouve le chemin du fichier à partir de l\'URL publique', () => {
        expect(attestationStoragePath(PUBLIC_URL)).toBe('attestations/user-1/attestation-decennale-abc.pdf');
        expect(attestationStoragePath(`${PUBLIC_URL}?download=x.pdf`)).toBe('attestations/user-1/attestation-decennale-abc.pdf');
    });

    it('renvoie null pour une URL absente ou étrangère au bucket', () => {
        expect(attestationStoragePath('')).toBeNull();
        expect(attestationStoragePath(null)).toBeNull();
        expect(attestationStoragePath('https://exemple.fr/attestation.pdf')).toBeNull();
    });
});

describe('attestationFileName', () => {
    it('nomme le fichier d\'après l\'entreprise, sans accents ni espaces', () => {
        expect(attestationFileName('Red Den Connexion')).toBe('Attestation-decennale-Red-Den-Connexion.pdf');
        expect(attestationFileName('Électricité Générale & Fils')).toBe('Attestation-decennale-Electricite-Generale-Fils.pdf');
    });

    it('reste lisible sans nom d\'entreprise', () => {
        expect(attestationFileName('')).toBe('Attestation-decennale.pdf');
        expect(attestationFileName(undefined)).toBe('Attestation-decennale.pdf');
    });
});

describe('attestationDownloadUrl', () => {
    it('ajoute le paramètre qui force le téléchargement sous un nom lisible', () => {
        expect(attestationDownloadUrl(PUBLIC_URL, 'Red Den Connexion'))
            .toBe(`${PUBLIC_URL}?download=Attestation-decennale-Red-Den-Connexion.pdf`);
    });

    it('renvoie null sans attestation', () => {
        expect(attestationDownloadUrl('', 'Red Den Connexion')).toBeNull();
    });
});

describe('attestationValidity', () => {
    const today = new Date(2026, 10, 12); // 12 novembre 2026

    it('ne dit rien quand la date n\'est pas renseignée', () => {
        expect(attestationValidity('', today).status).toBe('unknown');
        expect(attestationValidity(null, today).status).toBe('unknown');
        expect(attestationValidity('31/12/2026', today).status).toBe('unknown');
    });

    it('est valide loin de l\'échéance', () => {
        expect(attestationValidity('2027-12-31', today)).toEqual({ status: 'valid', daysLeft: 414 });
    });

    it('prévient dans les 30 jours avant l\'échéance', () => {
        expect(attestationValidity('2026-12-12', today)).toEqual({ status: 'expiring', daysLeft: 30 });
        expect(attestationValidity('2026-12-13', today).status).toBe('valid');
    });

    it('reste valide le dernier jour, expirée le lendemain', () => {
        expect(attestationValidity('2026-11-12', today)).toEqual({ status: 'expiring', daysLeft: 0 });
        expect(attestationValidity('2026-11-11', today)).toEqual({ status: 'expired', daysLeft: -1 });
    });
});

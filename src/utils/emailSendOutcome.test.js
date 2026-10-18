import { describe, it, expect } from 'vitest';
import { classifyEmailSendResponse } from './emailSendOutcome';

describe('classifyEmailSendResponse', () => {
    it('confirme un envoi réussi', () => {
        expect(classifyEmailSendResponse({ ok: true, result: { success: true } })).toBe('sent');
    });

    it("signale un échec quand le serveur explique l'erreur", () => {
        expect(classifyEmailSendResponse({ ok: false, result: { error: "Échec de l'envoi : auth failed" } })).toBe('failed');
    });

    it('reste prudent quand la connexion a été coupée', () => {
        expect(classifyEmailSendResponse({ networkError: true })).toBe('unknown');
    });

    it("reste prudent devant une réponse illisible d'une passerelle (5xx sans JSON)", () => {
        expect(classifyEmailSendResponse({ ok: false, result: null })).toBe('unknown');
    });

    it('reste prudent devant un 200 sans confirmation', () => {
        expect(classifyEmailSendResponse({ ok: true, result: null })).toBe('unknown');
    });
});

import { useState } from 'react';
import { supabase } from '../../utils/supabase';
import { toast } from 'sonner';
import { validateFileForUpload, UPLOAD_PRESETS } from '../../utils/uploadValidation';
import { checkSiret, normalizeSiret } from '../../utils/siret';

// État du formulaire entreprise (formData) partagé par les sections de
// l'onglet « entreprise » et par les paramètres avancés (IA, zones).
export const useProfileForm = ({ user, invalidateProfile, b2bReceiverStatus, registerB2BReceiver }) => {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        company_name: '',
        full_name: '',
        email: '',
        professional_email: '',
        website: '',
        logo_url: '',
        phone: '',
        address: '',
        city: '',
        postal_code: '',

        siret: '',
        insurance_company: '',
        insurance_contract_number: '',
        insurance_company_address: '',
        insurance_coverage_area: '',
        google_review_url: '',
        facebook_review_url: '',
        pages_jaunes_review_url: '',
        trade: 'general',
        brand_color: '',
        iban: '',
        artisan_status: 'micro_entreprise',
        activity_type: 'services'
    });

    // Initialisation depuis la RPC `get_my_profile_safe`
    const loadFromProfile = (data) => {
        // Préférences IA (clé déjà strippée par get_my_profile_safe)
        const aiPrefs = data.ai_preferences || {};

        setFormData({
            company_name: data.company_name || '',
            full_name: data.full_name || '',
            email: user.email || '',
            professional_email: data.professional_email || '',
            website: data.website || '',
            logo_url: data.logo_url || '',
            phone: data.phone || '',
            address: data.address || '',
            city: data.city || '',
            postal_code: data.postal_code || '',

            siret: data.siret || '',
            insurance_company: data.insurance_company || '',
            insurance_contract_number: data.insurance_contract_number || '',
            insurance_company_address: data.insurance_company_address || '',
            insurance_coverage_area: data.insurance_coverage_area || '',
            google_review_url: data.google_review_url || '',
            facebook_review_url: data.facebook_review_url || '',
            pages_jaunes_review_url: data.pages_jaunes_review_url || '',
            trade: data.trade || 'general',
            brand_color: data.brand_color || '',
            iban: data.iban || '',
            wero_phone: data.wero_phone || '',
            artisan_status: aiPrefs.artisan_status || 'micro_entreprise',
            activity_type: aiPrefs.activity_type || 'services',
            ai_provider: aiPrefs.ai_provider || 'openai',
            ai_hourly_rate: aiPrefs.ai_hourly_rate || '',
            default_margin_coefficient: aiPrefs.default_margin_coefficient || '',
            // Zones
            zone1_radius: aiPrefs.zone1_radius || '',
            zone1_price: aiPrefs.zone1_price || '',
            zone2_radius: aiPrefs.zone2_radius || '',
            zone2_price: aiPrefs.zone2_price || '',
            zone3_radius: aiPrefs.zone3_radius || '',
            zone3_price: aiPrefs.zone3_price || '',

            ai_instructions: aiPrefs.ai_instructions || '',
            quote_system_prompt: aiPrefs.quote_system_prompt || ''
        });
    };

    const handleLogoUpload = async (e) => {
        try {
            setLoading(true);
            const file = e.target.files[0];
            if (!file) return;

            // Validation stricte : magic bytes + taille + type MIME réel
            // (SVG retiré pour des raisons de sécurité — risque XSS via <script> embarqué)
            const validation = await validateFileForUpload(file, UPLOAD_PRESETS.logo);
            if (!validation.ok) {
                toast.error(validation.error);
                return;
            }

            const fileExt = file.name.split('.').pop().toLowerCase();

            // Use cryptographically secure random filename to prevent guessing
            const randomBytes = new Uint8Array(16);
            crypto.getRandomValues(randomBytes);
            const randomHex = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
            const fileName = `${user.id}-${randomHex}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('logos')
                .upload(filePath, file, { contentType: file.type });

            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('logos').getPublicUrl(filePath);
            const publicUrl = data.publicUrl;

            setFormData(prev => ({ ...prev, logo_url: publicUrl }));
            toast.success('Logo uploadé avec succès');
        } catch (error) {
            console.error('Error uploading logo:', error);
            toast.error('Erreur lors de l\'upload du logo');
        } finally {
            setLoading(false);
        }
    };

    // Le SIRET part tel quel en pied de devis et dans le XML Factur-X : une
    // saisie fausse ne se découvre qu'une fois le document chez le client. On
    // refuse donc de l'enregistrer — un champ laissé vide reste possible, c'est
    // le bandeau « profil incomplet » qui s'en charge.
    const siretCheck = checkSiret(formData.siret);

    const updateProfile = async (e) => {
        e.preventDefault();
        if (siretCheck.level === 'error') {
            toast.error(siretCheck.message);
            document.querySelector('input[name="siret"]')?.focus();
            return;
        }
        try {
            setLoading(true);
            // Préférences actuelles (ligne brute) : le formulaire ne connaît
            // qu'une partie des clés de ai_preferences (pas la référence de la
            // clé API, ni le coût horaire, ni le seuil d'alerte de marge…) —
            // les réécrire à partir de lui seul les effacerait.
            const { data: current, error: readError } = await supabase
                .from('profiles')
                .select('ai_preferences')
                .eq('id', user.id)
                .single();
            if (readError) throw readError;
            const { error } = await supabase
                .from('profiles')
                .update({
                    company_name: formData.company_name,
                    full_name: formData.full_name,
                    professional_email: formData.professional_email,
                    website: formData.website,
                    logo_url: formData.logo_url,
                    phone: formData.phone,
                    address: formData.address,
                    city: formData.city,
                    postal_code: formData.postal_code,

                    // Chiffres seuls : des espaces seraient rejetés dans le
                    // XML Factur-X (schemeID 0009).
                    siret: normalizeSiret(formData.siret),
                    insurance_company: formData.insurance_company,
                    insurance_contract_number: formData.insurance_contract_number,
                    insurance_company_address: formData.insurance_company_address,
                    insurance_coverage_area: formData.insurance_coverage_area,
                    google_review_url: formData.google_review_url,
                    facebook_review_url: formData.facebook_review_url,
                    pages_jaunes_review_url: formData.pages_jaunes_review_url,
                    trade: formData.trade,
                    brand_color: formData.brand_color || null,
                    iban: formData.iban,
                    wero_phone: formData.wero_phone,

                    ai_preferences: {
                        ...(current?.ai_preferences || {}),
                        // La clé API est gérée séparément via l'Edge Function save-openai-key
                        ai_provider: formData.ai_provider,
                        ai_hourly_rate: formData.ai_hourly_rate,
                        default_margin_coefficient: formData.default_margin_coefficient,
                        zone1_radius: formData.zone1_radius,
                        zone1_price: formData.zone1_price,
                        zone2_radius: formData.zone2_radius,
                        zone2_price: formData.zone2_price,
                        zone3_radius: formData.zone3_radius,
                        zone3_price: formData.zone3_price,
                        ai_instructions: formData.ai_instructions,
                        quote_system_prompt: formData.quote_system_prompt || null,
                        artisan_status: formData.artisan_status,
                        activity_type: formData.activity_type
                    },

                    updated_at: new Date(),
                })
                .eq('id', user.id);

            if (error) throw error;
            // Rafraîchit le cache react-query du profil (coefficient de marge,
            // taux horaire…) pour les pages qui le consomment via useUserProfile.
            invalidateProfile();
            toast.success('Profil mis à jour avec succès');

            // SIRET complet et valide : enregistrer le SIREN dans l'annuaire DGFIP via B2BRouter
            if (siretCheck.level === 'ok' && b2bReceiverStatus !== 'registered') {
                registerB2BReceiver();
            }
        } catch (error) {
            console.error('Error updating profile:', error);
            toast.error('Erreur lors de la mise à jour du profil');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    return {
        loading,
        setLoading,
        formData,
        setFormData,
        handleChange,
        siretCheck,
        updateProfile,
        handleLogoUpload,
        loadFromProfile,
    };
};

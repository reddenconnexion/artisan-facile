import { sanitizeSignatureHtml } from '../../utils/sanitizeHtml';
import { Save, FileText, RotateCcw, Loader2, Upload } from 'lucide-react';
import { Button } from '../../components/ui';

const EmailSignatureSection = ({
    emailSignatureHtml,
    setEmailSignatureHtml,
    savingSignature,
    signaturePreview,
    setSignaturePreview,
    signatureImageWidth,
    setSignatureImageWidth,
    handleSaveSignature,
    handleSignatureImageUpload,
}) => {
    return (
        <div className="mt-8 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
            <div className="p-8">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 flex items-center">
                    <FileText className="w-5 h-5 mr-2 text-blue-600" />
                    Signature email
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Signature HTML ajoutée automatiquement à la fin de chaque mail envoyé via SMTP direct. Si vide, une signature est générée automatiquement à partir de votre profil (logo, nom, téléphone, email, site, avis Google).
                </p>

                <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Signature personnalisée (HTML)
                    </label>
                    <textarea
                        value={emailSignatureHtml}
                        onChange={(e) => setEmailSignatureHtml(e.target.value)}
                        rows={8}
                        placeholder={'Exemple :\n<strong>Jean Dupont</strong><br>\nÉlectricien certifié<br>\n<a href="tel:0612345678">06 12 34 56 78</a><br>\n<a href="https://mon-site.fr">mon-site.fr</a>'}
                        className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500 font-mono text-xs"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        Balises HTML autorisées : &lt;strong&gt;, &lt;em&gt;, &lt;br&gt;, &lt;a href&gt;, &lt;img src&gt;, &lt;span style&gt;, etc.
                    </p>

                    <div>
                        <div className="flex flex-wrap items-center gap-3">
                            <label className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm font-medium cursor-pointer text-gray-900 dark:text-gray-100">
                                <Upload className="w-4 h-4" />
                                Importer une image
                                <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp,image/gif"
                                    onChange={handleSignatureImageUpload}
                                    className="hidden"
                                />
                            </label>

                            <div className="flex items-center gap-2">
                                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                    Largeur :
                                </label>
                                <select
                                    value={['150', '200', '300', '400', '500', '600', 'full'].includes(signatureImageWidth) ? signatureImageWidth : 'custom'}
                                    onChange={(e) => {
                                        if (e.target.value !== 'custom') setSignatureImageWidth(e.target.value);
                                    }}
                                    className="text-sm px-2 py-1.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg"
                                >
                                    <option value="150">Petite (150 px)</option>
                                    <option value="200">Moyenne (200 px)</option>
                                    <option value="300">Standard (300 px)</option>
                                    <option value="400">Grande (400 px)</option>
                                    <option value="500">Très grande (500 px)</option>
                                    <option value="600">XL (600 px)</option>
                                    <option value="full">Pleine largeur (100%)</option>
                                    <option value="custom">Personnalisée…</option>
                                </select>
                                {!['150', '200', '300', '400', '500', '600', 'full'].includes(signatureImageWidth) && (
                                    <div className="flex items-center gap-1">
                                        <input
                                            type="number"
                                            min="50"
                                            max="800"
                                            value={signatureImageWidth}
                                            onChange={(e) => setSignatureImageWidth(e.target.value)}
                                            className="w-20 text-sm px-2 py-1.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg"
                                        />
                                        <span className="text-xs text-gray-500 dark:text-gray-400">px</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            JPG / PNG / WebP / GIF, 8 Mo max. Choisissez la largeur avant d'importer. Pour redimensionner une image déjà insérée, modifiez la valeur <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">width:Xpx</code> dans le HTML.
                        </p>
                    </div>

                    {emailSignatureHtml.trim() && (
                        <div>
                            <button
                                type="button"
                                onClick={() => setSignaturePreview(v => !v)}
                                className="text-sm text-blue-600 hover:text-blue-700 mb-2"
                            >
                                {signaturePreview ? 'Masquer l\'aperçu' : 'Afficher l\'aperçu'}
                            </button>
                            {signaturePreview && (
                                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                                    <div className="px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Aperçu (ce que verront vos clients dans leur mail) :</p>
                                    </div>
                                    {/* Fond blanc forcé : simule le rendu réel dans la plupart des
                                        clients mail. La signature HTML utilisateur n'a pas de dark
                                        mode — sur fond sombre, du texte noir devient illisible. */}
                                    <div className="bg-white p-4 text-gray-900">
                                        {/* white-space:pre-wrap pour refléter EXACTEMENT le rendu
                                            du mail : les sauts de ligne et lignes vides saisis sont
                                            préservés (l'edge function applique le même style). */}
                                        <div style={{ whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: sanitizeSignatureHtml(emailSignatureHtml) }} />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2 pt-2">
                        <Button type="button" onClick={handleSaveSignature} disabled={savingSignature}>
                            {savingSignature ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Enregistrer la signature
                        </Button>
                        {emailSignatureHtml.trim() && (
                            <button
                                type="button"
                                onClick={() => { setEmailSignatureHtml(''); }}
                                className="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
                            >
                                <RotateCcw className="w-4 h-4" />
                                Revenir à la signature auto
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EmailSignatureSection;

// Shared media → base64 converters used by the site-visit and voice flows.
// Kept here (not duplicated per component) so the bundle ships a single copy.

export async function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Redimensionne (max `maxDim` px) et ré-encode une image en JPEG, en renvoyant
// un nouveau File. Sert à faire passer les très grosses photos (ex. captures
// DJI Mimo / images de vidéo HD) sous la limite d'upload et à uniformiser le
// format. Si le navigateur ne sait pas décoder le fichier (ex. HEIC) ou en cas
// d'erreur, on renvoie le fichier d'origine inchangé.
export async function compressImageFile(file, { maxDim = 2048, quality = 0.85, maxSizeBytes = 0 } = {}) {
    if (!file.type?.startsWith('image/') || file.type === 'image/gif') return file;
    try {
        const compressed = await new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                let w = img.naturalWidth, h = img.naturalHeight;
                if (!w || !h) { URL.revokeObjectURL(url); return reject(new Error('no-dimensions')); }
                if (w > maxDim || h > maxDim) {
                    if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
                    else { w = Math.round(w * maxDim / h); h = maxDim; }
                }
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                URL.revokeObjectURL(url);
                canvas.toBlob(blob => {
                    if (!blob) return reject(new Error('toBlob-failed'));
                    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
                    resolve(new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() }));
                }, 'image/jpeg', quality);
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode-failed')); };
            img.src = url;
        });
        // Si l'original dépasse la limite, on force la version compressée ;
        // sinon on garde la plus légère des deux.
        if (maxSizeBytes && file.size > maxSizeBytes) return compressed;
        return compressed.size < file.size ? compressed : file;
    } catch {
        return file;
    }
}

export async function imageFileToBase64(file, maxDim = 1024) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            let w = img.naturalWidth, h = img.naturalHeight;
            if (w > maxDim || h > maxDim) {
                if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
                else { w = Math.round(w * maxDim / h); h = maxDim; }
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            URL.revokeObjectURL(url);
            canvas.toBlob(blob => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            }, 'image/jpeg', 0.85);
        };
        img.onerror = reject;
        img.src = url;
    });
}

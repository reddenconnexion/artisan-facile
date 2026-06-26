import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';

/**
 * Pad de signature manuscrite basé sur les **Pointer Events**.
 *
 * Remplace `react-signature-canvas` (verrouillé sur l'antique `signature_pad@2`,
 * qui ne gère que `mouse`+`touch` et signe mal sur mobile/iOS). Les Pointer
 * Events unifient souris, doigt et stylet et sont fiables sur Safari iOS 13+,
 * Chrome Android et tous les navigateurs desktop.
 *
 * API compatible avec l'usage qui était fait de react-signature-canvas :
 *   ref.clear()
 *   ref.isEmpty()
 *   ref.getCanvas()           → l'élément <canvas>
 *   ref.getTrimmedCanvas()    → un <canvas> rogné autour du tracé
 *
 * Props :
 *   - penColor   couleur du trait (défaut 'black')
 *   - canvasProps { width, height, style }  largeur/hauteur en px CSS + style
 *
 * Le canvas est dimensionné en tenant compte du devicePixelRatio pour un rendu
 * net sur écrans Retina / mobiles haute densité.
 */
const SignaturePad = forwardRef(({ penColor = 'black', canvasProps = {} }, ref) => {
    const canvasRef = useRef(null);
    const drawingRef = useRef(false);
    const lastRef = useRef({ x: 0, y: 0 });
    const emptyRef = useRef(true);

    const { width, height, style } = canvasProps;

    // (Re)configure le contexte quand les dimensions changent. Réécrire
    // canvas.width/height efface le canvas : on ne le fait donc que sur un vrai
    // changement de taille, jamais à chaque rendu.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !width || !height) return;
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = Math.floor(width * ratio);
        canvas.height = Math.floor(height * ratio);
        const ctx = canvas.getContext('2d');
        ctx.scale(ratio, ratio);
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = penColor;
        emptyRef.current = true;
    }, [width, height, penColor]);

    const pointFromEvent = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        // On ramène les coordonnées dans le repère CSS du canvas (le contexte
        // est déjà mis à l'échelle du devicePixelRatio).
        return {
            x: ((e.clientX - rect.left) / rect.width) * width,
            y: ((e.clientY - rect.top) / rect.height) * height,
        };
    };

    const handlePointerDown = (e) => {
        e.preventDefault();
        const canvas = canvasRef.current;
        canvas.setPointerCapture?.(e.pointerId);
        drawingRef.current = true;
        const p = pointFromEvent(e);
        lastRef.current = p;
        // Un simple appui dépose un point (signature « point »).
        const ctx = canvas.getContext('2d');
        ctx.beginPath();
        ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fillStyle = penColor;
        ctx.fill();
        emptyRef.current = false;
    };

    const handlePointerMove = (e) => {
        if (!drawingRef.current) return;
        e.preventDefault();
        const ctx = canvasRef.current.getContext('2d');
        // getCoalescedEvents : tous les points intermédiaires du geste, pour un
        // tracé fluide même quand les pointermove sont throttlés.
        const events = typeof e.getCoalescedEvents === 'function'
            ? e.getCoalescedEvents()
            : [e];
        ctx.beginPath();
        ctx.moveTo(lastRef.current.x, lastRef.current.y);
        for (const ev of (events.length ? events : [e])) {
            const p = pointFromEvent(ev);
            ctx.lineTo(p.x, p.y);
            lastRef.current = p;
        }
        ctx.stroke();
        emptyRef.current = false;
    };

    const endStroke = (e) => {
        if (!drawingRef.current) return;
        drawingRef.current = false;
        canvasRef.current?.releasePointerCapture?.(e.pointerId);
    };

    useImperativeHandle(ref, () => ({
        clear() {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            emptyRef.current = true;
        },
        isEmpty() {
            return emptyRef.current;
        },
        getCanvas() {
            return canvasRef.current;
        },
        getTrimmedCanvas() {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            const { width: cw, height: ch } = canvas;
            const { data } = ctx.getImageData(0, 0, cw, ch);
            let top = null, bottom = null, left = null, right = null;
            for (let y = 0; y < ch; y++) {
                for (let x = 0; x < cw; x++) {
                    if (data[(y * cw + x) * 4 + 3] !== 0) {
                        if (top === null) top = y;
                        bottom = y;
                        if (left === null || x < left) left = x;
                        if (right === null || x > right) right = x;
                    }
                }
            }
            const out = document.createElement('canvas');
            if (top === null) {
                // Canvas vide : on renvoie un 1x1 transparent (comportement sûr).
                out.width = 1;
                out.height = 1;
                return out;
            }
            const tw = right - left + 1;
            const th = bottom - top + 1;
            out.width = tw;
            out.height = th;
            out.getContext('2d').drawImage(canvas, left, top, tw, th, 0, 0, tw, th);
            return out;
        },
    }), []);

    return (
        <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
            onPointerLeave={endStroke}
            style={{ touchAction: 'none', ...style }}
        />
    );
});

SignaturePad.displayName = 'SignaturePad';

export default SignaturePad;

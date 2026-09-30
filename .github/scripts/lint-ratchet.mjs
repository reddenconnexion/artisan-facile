// Lint « à cliquet » des pull requests : échoue seulement si la PR ajoute des
// erreurs ESLint dans les fichiers qu'elle modifie. On compare la PR à sa base,
// lintée avec la MÊME config (celle de la PR) pour qu'un durcissement de config
// ne compte pas comme régression. Une erreur est identifiée par fichier + règle
// + première ligne du message (qui porte le nom de la variable…), sans numéro
// de ligne ni extrait de code : des lignes décalées par la PR ne comptent pas,
// une nouvelle erreur si.
//
// Usage : node .github/scripts/lint-ratchet.mjs <dossier-de-la-base> <fichier>...
import { ESLint } from 'eslint';
import { existsSync } from 'node:fs';
import path from 'node:path';

const [baseDir, ...files] = process.argv.slice(2);
const headDir = process.cwd();
const configFile = path.join(headDir, 'eslint.config.js');

const countErrors = async (cwd, list) => {
    const eslint = new ESLint({ cwd, overrideConfigFile: configFile, warnIgnored: false });
    const results = await eslint.lintFiles(list);
    const counts = new Map();
    const messages = new Map();
    for (const r of results) {
        const file = path.relative(cwd, r.filePath);
        for (const m of r.messages) {
            if (m.severity !== 2) continue;
            const key = `${file}\t${m.ruleId ?? 'parse'}\t${m.message.split('\n')[0]}`;
            counts.set(key, (counts.get(key) ?? 0) + 1);
            if (!messages.has(key)) messages.set(key, []);
            messages.get(key).push(`${file}:${m.line}:${m.column}  ${m.message.split('\n')[0]}  (${m.ruleId ?? 'parse'})`);
        }
    }
    return { counts, messages };
};

const head = await countErrors(headDir, files);
const baseFiles = files.filter(f => existsSync(path.join(baseDir, f)));
const base = baseFiles.length ? await countErrors(baseDir, baseFiles) : { counts: new Map() };

let regressions = 0;
for (const [key, n] of head.counts) {
    const before = base.counts.get(key) ?? 0;
    if (n <= before) continue;
    regressions += n - before;
    const [file, rule] = key.split('\t');
    console.log(`\n✗ ${file} — ${rule} (${before} → ${n})`);
    for (const line of head.messages.get(key)) console.log(`    ${line}`);
}

const total = m => [...m.values()].reduce((a, b) => a + b, 0);
console.log(`\nErreurs dans les fichiers modifiés : ${total(base.counts)} avant → ${total(head.counts)} après.`);
if (regressions) {
    console.log(`${regressions} nouvelle(s) erreur(s) de lint : à corriger avant fusion.`);
    process.exit(1);
}
console.log('Aucune nouvelle erreur de lint.');

#!/usr/bin/env node
import build from './core.js';
import path from 'node:path';


function parseArgs() {
    let inDir = 'unset';
    let outDir = 'unset';
    process.argv.forEach((arg) => {
        if (arg.startsWith('--in='))
            inDir = arg.slice('--in='.length);
        if (arg.startsWith('--out='))
            outDir = arg.slice('--out='.length);
    });
    if (outDir === 'unset')
        outDir = path.join(inDir, '../build');
    if (inDir === 'unset') {
        console.error('Error: input directory not spicified, use --in=dir_path');
        process.exit(1);
    } else {
        console.log(`input dir: ${inDir}`);
        console.log(`output dir: ${outDir}`);
    }
    return {inDir: inDir, outDir: outDir};
}



async function main() {
    const {inDir, outDir} = parseArgs();
    await build(inDir, outDir);
    console.log('build done');
}
main();

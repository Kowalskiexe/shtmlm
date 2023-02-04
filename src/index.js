#!/usr/bin/env node

import path from 'node:path';
import { open, opendir, mkdir } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { htmlTags } from './tags.js';


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
    console.error('input directory not spicified, use --in=dir_path');
    process.exit(1);
} else {
    console.log(`input dir: ${inDir}`);
    console.log(`output dir: ${outDir}`);
}

async function parseDir(dirPath, inDir, digraph, tagFileMap) {
    try {
        const dir = await opendir(dirPath);
        for await (const dirent of dir) {
            const direntPath = path.join(dirPath, dirent.name);
            if (dirent.isDirectory()) {
                await parseDir(direntPath, inDir, digraph, tagFileMap);
            } else {
                await parseFile(direntPath, inDir, digraph, tagFileMap);
            }
        }
    } catch (err) {
        console.error(err);
    }
}

// <name atrributes> -> name
function getTagName(tag) {
    const space = tag.indexOf(' ');
    const bracket = tag.indexOf('>');
    let end = bracket;
    if (space !== -1)
        end = Math.min(end, space);
    return tag.slice(1, end);
}

function getCustomTags(html) {
    const tagRegex = /<.*>/g;
    const tags = html.match(tagRegex);
    const customTags = new Set();
    if (!tags)
        return new customTags;
    tags.forEach(tag => {
        if (htmlTags.every(v => getTagName(tag) !== getTagName(v)))
            customTags.add(getTagName(tag));
    });
    return customTags;
}

function isCustomTag(tag) {
    return htmlTags.every(v => getTagName(tag) !== getTagName(v));
}

async function parseFile(filePath, inDir, digraph, tagFileMap) {
    const file = await open(filePath);
    const customTags = new Set()
    for await (const line of file.readLines()) {
        const tagRegex = /<.*>/g;
        const tags = line.match(tagRegex);
        if (!tags)
            continue;
        for (const tag of tags) {
            if (isCustomTag(tag))
                customTags.add(getTagName(tag));
        }
    }
    // remove .html from file name
    const tag = path.basename(filePath).slice(0, -5);
    digraph.set(tag, customTags);
    // file path relative to inDir
    const tagPath = './' + filePath.slice(inDir.length + 1, -5);
    tagFileMap.set(tag, tagPath);
}


function sortTopologically(digraph) {
    const states = new Map();
    for (const key of digraph.keys())
        states.set(key, 'unvisited');

    const output = []
    for (const vertex of digraph.keys()) {
        if (states.get(vertex) === 'unvisited')
            visit(vertex, digraph, states, output);
    }
    return output.reverse();
}

function visit(vertex, digraph, states, output) {
    states.set(vertex, 'processed');
    for (const next of digraph.get(vertex)) {
        if (states.get(next) === 'processed')
            throw new Error('The graph isn\'t acyclic!');
        if (states.get(next) === 'unvisited')
            visit(next, digraph, states, output);
    }
    states.set(vertex, 'visited');
    output.push(vertex);
}

const digraph = new Map();
const tagFileMap = new Map();
await parseDir(inDir, inDir, digraph, tagFileMap);

console.log('digraph');
console.log(digraph);

console.log('tagFileMap');
console.log(tagFileMap);

console.log('sorted');
const sorted = sortTopologically(digraph);
console.log(sorted);

sorted.reverse();
for (const tag of sorted) {
    await buildTag(tag);
}
async function buildTag(tagName) {
    const inPath = path.join(inDir, tagFileMap.get(tagName)) + '.html';
    const outPath = path.join(outDir, tagFileMap.get(tagName)) + '.html';
    console.log(`build ${tagName} at ${inPath}, into ${outPath}`);
    const inFile = await open(inPath);
    await mkdir(path.dirname(outPath), { recursive: true });
    const outFile = await open(outPath, 'w');
    for await (const line of inFile.readLines()) {
        // TODO: total remake
        const tagRegex = /<.*>/g;
        const tags = line.match(tagRegex);
        if (tags) {
            for (const tag of tags) {
                if (!isCustomTag(tag))
                    continue;
                // paste custom tag
                console.log(`pasting ${tag}`);
                const customPath = path.join(inDir, tagFileMap.get(getTagName(tag))) + '.html';
                const customFile = await open(customPath);
                const content = await customFile.readFile();
                console.log(content);
                await outFile.write(content);
                await customFile.close();
            }
        }
        // TODO: dont just paste
        await outFile.write(line + '\n');
    }
    await outFile.close();
}


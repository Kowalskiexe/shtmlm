#!/usr/bin/env node

import path from 'node:path';
import { open, opendir, mkdir } from 'node:fs/promises';
import { htmlTags } from './tags.js';


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
        if (isCustomTag(tag))
            customTags.add(getTagName(tag));
    });
    return customTags;
}

function isCustomTag(tag) {
    return htmlTags.every(v => getTagName(tag) !== getTagName(v));
}

async function parseFile(filePath, inDir, digraph, tagFileMap) {
    const file = await open(filePath);
    const content = await file.readFile({encoding: 'UTF-8'});
    const customTags = getCustomTags(content);
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
            visit(next, digraph, states, output); }
    states.set(vertex, 'visited');
    output.push(vertex);
}

async function build(inDir, outDir) {
    const digraph = new Map();
    const tagFileMap = new Map();
    await parseDir(inDir, inDir, digraph, tagFileMap);
    
    const sorted = sortTopologically(digraph);
    
    sorted.reverse();
    for (const tag of sorted) {
        await buildTag(tag, tagFileMap, inDir, outDir);
    }
}

function getInPath(inDir, relativePath) {
    return path.join(inDir, relativePath + '.html');
}

function getOutPath(outDir, relativePath) {
    return path.join(outDir, relativePath + '.html');
}

async function buildTag(tagName, tagFileMap, inDir, outDir) {
    const inPath = getInPath(inDir, tagFileMap.get(tagName));
    const outPath = getOutPath(outDir, tagFileMap.get(tagName));
    const inFile = await open(inPath);
    await mkdir(path.dirname(outPath), { recursive: true });
    const outFile = await open(outPath, 'w');
    let content = await inFile.readFile({encoding: 'UTF-8'});
    for (const [tag, path] of tagFileMap) {
        if (!content.includes(`<${tag}>`))
            continue;
        if (tag === tagName) {
            // prevent recursion
            console.error('Error: recursion is not allowed');
            continue;
        }
        const fullPath = getInPath(inDir, path);
        const foreignFile = await open(fullPath);
        const foreignContent = await foreignFile.readFile({encoding: 'UTF-8'});
        content = content.replaceAll(`<${tag}>`, foreignContent);
    }
    outFile.writeFile(content, {encoding: 'UTF-8'});
    await outFile.close();
}

async function main() {
    const {inDir, outDir} = parseArgs();
    await build(inDir, outDir);
    console.log('build done');
}
main();

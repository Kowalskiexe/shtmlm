import { open, opendir, mkdir } from 'node:fs/promises';
import { htmlTags } from './tags.js';
import path from 'node:path';


export async function parseDir(dirPath, inDir, digraph, tagFileMap) {
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
export function getTagName(tag) {
    const space = tag.indexOf(' ');
    const bracket = tag.indexOf('>');
    let end = bracket;
    if (space !== -1)
        end = Math.min(end, space);
    return tag.slice(1, end);
}

export function getCustomTags(html) {
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

export function isCustomTag(tag) {
    return htmlTags.every(v => getTagName(tag) !== getTagName(v));
}

export async function parseFile(filePath, inDir, digraph, tagFileMap) {
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


export function sortTopologically(digraph) {
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

export function visit(vertex, digraph, states, output) {
    states.set(vertex, 'processed');
    for (const next of digraph.get(vertex)) {
        if (states.get(next) === 'processed')
            throw new Error('The graph isn\'t acyclic!');
        if (states.get(next) === 'unvisited')
            visit(next, digraph, states, output); }
    states.set(vertex, 'visited');
    output.push(vertex);
}

export default async function build(inDir, outDir) {
    const digraph = new Map();
    const tagFileMap = new Map();
    await parseDir(inDir, inDir, digraph, tagFileMap);
    
    const sorted = sortTopologically(digraph);
    
    sorted.reverse();
    for (const tag of sorted) {
        await buildTag(tag, tagFileMap, inDir, outDir);
    }
}

export function getInPath(inDir, relativePath) {
    return path.join(inDir, relativePath + '.html');
}

export function getOutPath(outDir, relativePath) {
    return path.join(outDir, relativePath + '.html');
}

export async function buildTag(tagName, tagFileMap, inDir, outDir) {
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

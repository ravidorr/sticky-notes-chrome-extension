/**
 * Extra markdown lint checks for em dashes and emojis
 * 
 * Usage:
 *   node scripts/lint-md-extra.js           # Check all markdown files
 *   node scripts/lint-md-extra.js file.md   # Check specific files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Emoji regex pattern (covers most common emoji ranges)
const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/gu;

// Em dash
const emDashRegex = /—/g;

function findMarkdownFiles(dir, files = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        // Skip node_modules
        if (entry.name === 'node_modules') continue;
        
        if (entry.isDirectory()) {
            findMarkdownFiles(fullPath, files);
        } else if (entry.name.endsWith('.md')) {
            files.push(fullPath);
        }
    }
    
    return files;
}

function checkFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const errors = [];
    const relativePath = path.relative(rootDir, filePath);
    
    lines.forEach((line, index) => {
        const lineNum = index + 1;
        
        // Check for em dashes
        if (emDashRegex.test(line)) {
            errors.push(`${relativePath}:${lineNum}: Em dash found`);
        }
        emDashRegex.lastIndex = 0;
        
        // Check for emojis
        const emojiMatch = line.match(emojiRegex);
        if (emojiMatch) {
            errors.push(`${relativePath}:${lineNum}: Emoji found: ${emojiMatch.join(', ')}`);
        }
    });
    
    return errors;
}

function main() {
    // If files are passed as arguments, check only those
    // Otherwise, find all markdown files in the project
    const args = process.argv.slice(2);
    const files = args.length > 0 
        ? args.filter(f => f.endsWith('.md') && fs.existsSync(f))
        : findMarkdownFiles(rootDir);
    
    const allErrors = [];
    
    for (const file of files) {
        const errors = checkFile(file);
        allErrors.push(...errors);
    }
    
    if (allErrors.length > 0) {
        console.error('Markdown style errors found:\n');
        allErrors.forEach(error => console.error(error));
        console.error(`\n${allErrors.length} error(s) found`);
        process.exit(1);
    }
}

main();

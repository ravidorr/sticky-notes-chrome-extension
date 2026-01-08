/**
 * Site Build Script
 * 
 * Combines HTML partials with page templates to generate the final site files.
 * 
 * Usage: node scripts/build-site.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SITE_DIR = path.join(__dirname, '..', 'site');
const PARTIALS_DIR = path.join(SITE_DIR, 'partials');
const TEMPLATES_DIR = path.join(SITE_DIR, 'templates');

/**
 * Read a file and return its contents
 */
function readFile(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
        console.error(`Error reading file: ${filePath}`);
        throw error;
    }
}

/**
 * Write content to a file
 */
function writeFile(filePath, content) {
    try {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`  Generated: ${path.basename(filePath)}`);
    } catch (error) {
        console.error(`Error writing file: ${filePath}`);
        throw error;
    }
}

/**
 * Load all partials from the partials directory
 */
function loadPartials() {
    return {
        head: readFile(path.join(PARTIALS_DIR, 'head.html')),
        header: readFile(path.join(PARTIALS_DIR, 'header.html')),
        footer: readFile(path.join(PARTIALS_DIR, 'footer.html'))
    };
}

/**
 * Get list of template files
 */
function getTemplateFiles() {
    const files = fs.readdirSync(TEMPLATES_DIR);
    return files.filter(file => file.endsWith('.html'));
}

/**
 * Process a template by replacing placeholders with partials
 */
function processTemplate(template, partials, options = {}) {
    const { baseUrl = '' } = options;
    
    let result = template;
    
    // Replace partial placeholders
    result = result.replace(/\{\{HEAD\}\}/g, partials.head);
    result = result.replace(/\{\{HEADER\}\}/g, partials.header);
    result = result.replace(/\{\{FOOTER\}\}/g, partials.footer);
    
    // Replace BASE_URL placeholder
    // For index.html, links should be "#section"
    // For other pages, links should be "index.html#section"
    result = result.replace(/\{\{BASE_URL\}\}/g, baseUrl);
    
    return result;
}

/**
 * Main build function
 */
function build() {
    console.log('\nBuilding site...\n');
    
    // Load partials
    const partials = loadPartials();
    console.log('  Loaded partials');
    
    // Get template files
    const templateFiles = getTemplateFiles();
    console.log(`  Found ${templateFiles.length} templates\n`);
    
    // Process each template
    templateFiles.forEach(templateFile => {
        const templatePath = path.join(TEMPLATES_DIR, templateFile);
        const outputPath = path.join(SITE_DIR, templateFile);
        
        // Read template
        const template = readFile(templatePath);
        
        // Determine base URL based on file
        // For index.html, use empty string (same page anchors)
        // For other pages, use "index.html" to link back to home
        const isIndex = templateFile === 'index.html';
        const baseUrl = isIndex ? '' : 'index.html';
        
        // Process template
        const output = processTemplate(template, partials, { baseUrl });
        
        // Write output
        writeFile(outputPath, output);
    });
    
    console.log('\nSite build complete!\n');
}

// Run build
build();

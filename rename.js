import fs from 'fs';
import path from 'path';

const SKIP_DIRS = ['node_modules', 'dist', '.git', 'icons', 'target'];
const SKIP_FILES = ['CHANGELOG.md', 'logo.png', 'screenshot.png'];

function walk(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        if (isDirectory) {
            if (!SKIP_DIRS.includes(f)) {
                walk(dirPath, callback);
            }
        } else {
            if (!SKIP_FILES.includes(f)) {
                callback(dirPath);
            }
        }
    });
}

function processFile(filePath) {
    // Only process text files basically
    // Skip binary extensions
    const ext = path.extname(filePath);
    const binaryExts = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.icns', '.lock', '.zip', '.tar', '.gz'];
    if (binaryExts.includes(ext)) return;

    try {
        let content = fs.readFileSync(filePath, 'utf8');
        let newContent = content;

        // Perform replacements
        // 1. UsageLeft -> UsageLeft
        newContent = newContent.replace(/UsageLeft/g, 'UsageLeft');
        // 2. usageleft -> usageleft
        newContent = newContent.replace(/usageleft/g, 'usageleft');
        // 3. UsageLeft -> UsageLeft
        newContent = newContent.replace(/UsageLeft/g, 'UsageLeft');
        // 4. usageleft -> usageleft
        newContent = newContent.replace(/usageleft/g, 'usageleft');

        if (content !== newContent) {
            fs.writeFileSync(filePath, newContent, 'utf8');
            console.log(`Updated ${filePath}`);
        }
    } catch (e) {
        console.error(`Error processing ${filePath}:`, e);
    }
}

walk('.', processFile);

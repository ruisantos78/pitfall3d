// scripts/bundle-singlefile.mjs
// Bundles the Vite production output into a single, completely self-contained HTML file.
import fs from 'fs';
import path from 'path';

const distDir = path.resolve('dist');
const htmlPath = path.join(distDir, 'index.html');

if (!fs.existsSync(htmlPath)) {
  console.error('❌ Erro: dist/index.html não encontrado. Execute o build primeiro.');
  process.exit(1);
}

let html = fs.readFileSync(htmlPath, 'utf-8');

// 1. Remove modulepreload links
html = html.replace(/<link\s+rel=["']modulepreload["'][^>]*>\s*/gi, '');

// 2. Extract and inline all CSS stylesheets into <head>
const cssRegex = /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
const cssChunks = [];

html = html.replace(cssRegex, (match, href) => {
  // If remote URL (e.g. Google Fonts), preserve it
  if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
    return match;
  }
  const relativePath = href.replace(/^\.?\//, '');
  const cssFilePath = path.join(distDir, relativePath);
  if (fs.existsSync(cssFilePath)) {
    const cssContent = fs.readFileSync(cssFilePath, 'utf-8');
    cssChunks.push({ file: relativePath, content: cssContent });
    return ''; // Remove link tag, we will inject a consolidated style block in <head>
  }
  return match;
});

// Inject inlined CSS before </head> (via replacer function: CSS/JS podem
// conter sequências `$` como `$'`, `$&` ou `$`` que o String.replace
// interpretaria como padrões especiais, corrompendo o bundle)
if (cssChunks.length > 0) {
  const combinedCss = cssChunks.map(c => `/* Inlined: ${c.file} */\n${c.content}`).join('\n\n');
  html = html.replace('</head>', () => `  <style>\n${combinedCss}\n  </style>\n</head>`);
  cssChunks.forEach(c => {
    console.log(`  📄 Inlining CSS: ${c.file} (${(c.content.length / 1024).toFixed(1)} KB)`);
  });
}

// 3. Extract and inline all JavaScript script tags right before </body>
const jsRegex = /<script\s+[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi;
const jsChunks = [];

html = html.replace(jsRegex, (match, src) => {
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//')) {
    return match;
  }
  const relativePath = src.replace(/^\.?\//, '');
  const jsFilePath = path.join(distDir, relativePath);
  if (fs.existsSync(jsFilePath)) {
    let jsContent = fs.readFileSync(jsFilePath, 'utf-8');
    // Escape any premature closing script tags
    jsContent = jsContent.replace(/<\/script/gi, '<\\/script');
    jsChunks.push({ file: relativePath, content: jsContent });
    return ''; // Remove script tag from <head>, we will inject right before </body>
  }
  return match;
});

// Inject inlined JS before </body> (replacer function pelo mesmo motivo do
// CSS acima; type="module" preserva a semântica do bundle do Vite)
if (jsChunks.length > 0) {
  const combinedJs = jsChunks.map(j => `/* Inlined: ${j.file} */\n${j.content}`).join('\n\n');
  html = html.replace('</body>', () => `  <script type="module">\n${combinedJs}\n  </script>\n</body>`);
  jsChunks.forEach(j => {
    console.log(`  📦 Inlining JS: ${j.file} (${(j.content.length / 1024).toFixed(1)} KB)`);
  });
}

// 4. Save both dist/index.html and dist/pitfall.html
fs.writeFileSync(htmlPath, html, 'utf-8');

const standalonePath = path.join(distDir, 'pitfall.html');
fs.writeFileSync(standalonePath, html, 'utf-8');

const stats = fs.statSync(standalonePath);
const sizeKb = (stats.size / 1024).toFixed(1);

console.log(`\n==================================================`);
console.log(`  🚀 DEPLOY CONCLUÍDO: HTML ÚNICO GERADO COM SUCESSO`);
console.log(`==================================================`);
console.log(`  📍 Arquivo Standalone: ${standalonePath} (${sizeKb} KB)`);
console.log(`  📍 Arquivo Web Index: ${htmlPath} (${sizeKb} KB)`);
console.log(`  ✨ JS/CSS locais embutidos: abra com duplo clique ou via file://`);
console.log(`  ℹ️  A fonte Google Fonts continua remota (com fallback offline).`);
console.log(`==================================================\n`);

/**
 * Post-build checks — catches missing Lucide imports before deploy.
 * Run: yarn build:verify
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src");

const lucide = require("lucide-react");
const LUCIDE_ICONS = new Set(
  Object.keys(lucide).filter((k) => /^[A-Z]/.test(k) && typeof lucide[k] === "object")
);

function collectFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(full));
    else if (/\.(jsx|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function parseNamedImports(content) {
  const map = new Map();
  for (const m of content.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)) {
    const source = m[2];
    for (const part of m[1].split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const [orig, alias] = trimmed.split(/\s+as\s+/).map((s) => s.trim());
      map.set(alias || orig, source);
    }
  }
  for (const m of content.matchAll(/import\s+(\w+)\s+from\s*["']([^"']+)["']/g)) {
    map.set(m[1], m[2]);
  }
  return map;
}

function lucideImports(content) {
  const block = content.match(/import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/);
  if (!block) return new Set();
  return new Set(
    block[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean)
  );
}

function jsxComponents(content) {
  const found = new Set();
  const re = /<([A-Z][A-Za-z0-9]*)\b/g;
  let m;
  while ((m = re.exec(content))) found.add(m[1]);
  return found;
}

function localComponents(content) {
  const defs = new Set();
  for (const m of content.matchAll(/(?:function|const)\s+([A-Z][A-Za-z0-9]*)/g)) defs.add(m[1]);
  return defs;
}

const errors = [];
for (const file of collectFiles(SRC)) {
  const content = fs.readFileSync(file, "utf8");
  const importedLucide = lucideImports(content);
  if (!importedLucide.size) continue;

  const allImports = parseNamedImports(content);
  const local = localComponents(content);

  for (const comp of jsxComponents(content)) {
    if (!LUCIDE_ICONS.has(comp)) continue;
    if (importedLucide.has(comp)) continue;
    if (local.has(comp)) continue;
    if (comp === "Icon" && /icon:\s*Icon\b/.test(content)) continue;

    const source = allImports.get(comp);
    if (source && source !== "lucide-react") continue;

    errors.push(`${path.relative(ROOT, file)}: <${comp}> used but not imported from lucide-react`);
  }
}

const buildDir = path.join(ROOT, "build", "static", "js");
if (!fs.existsSync(buildDir)) {
  console.error("verify-build: run yarn build first — build/ not found");
  process.exit(1);
}

const mainJs = fs.readdirSync(buildDir).find((f) => /^main\.[a-f0-9]+\.js$/.test(f));
if (!mainJs) {
  console.error("verify-build: main.*.js bundle not found");
  process.exit(1);
}

if (errors.length) {
  console.error("verify-build FAILED — missing icon imports:\n");
  errors.forEach((e) => console.error("  •", e));
  process.exit(1);
}

console.log(`verify-build OK (${mainJs})`);

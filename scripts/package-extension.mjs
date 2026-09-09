import { spawnSync } from 'node:child_process';
import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDirectory = join(projectDirectory, 'dist');
const extensionDirectory = join(projectDirectory, 'extension-dist');
const archiveName = 'zelender-extension.zip';
const archivePath = join(distDirectory, archiveName);

// Resolve paths from this script so packaging also works from another directory.
await access(join(distDirectory, 'index.html'));
const manifest = JSON.parse(
  await readFile(join(projectDirectory, 'extension', 'manifest.json'), 'utf8'),
);
const { version } = JSON.parse(
  await readFile(join(projectDirectory, 'package.json'), 'utf8'),
);

await mkdir(join(distDirectory, 'licenses'), { recursive: true });
await cp(join(projectDirectory, 'LICENSE'), join(distDirectory, 'licenses', 'zelender.txt'));
await cp(
  join(projectDirectory, 'node_modules', 'three', 'LICENSE'),
  join(distDirectory, 'licenses', 'three.txt'),
);

await rm(extensionDirectory, { recursive: true, force: true });
await cp(distDirectory, extensionDirectory, {
  recursive: true,
  // A second packaging run must never embed the previous downloadable archive.
  filter: (source) => ![archiveName, '.DS_Store'].includes(basename(source)),
});
await writeFile(
  join(extensionDirectory, 'manifest.json'),
  `${JSON.stringify({ ...manifest, version }, null, 2)}\n`,
);

// zip stores paths relative to extension-dist, with manifest.json at archive root.
await rm(archivePath, { force: true });
const archive = spawnSync('zip', ['-q', '-r', archivePath, '.'], {
  cwd: extensionDirectory,
  stdio: 'inherit',
});
if (archive.error) {
  throw new Error('Extension packaging requires the zip command (available on macOS and Ubuntu).', {
    cause: archive.error,
  });
}
if (archive.status !== 0) {
  throw new Error(`Extension archive creation failed with exit code ${archive.status}.`);
}

console.log('Chrome extension: extension-dist/');
console.log('Download archive: dist/zelender-extension.zip');

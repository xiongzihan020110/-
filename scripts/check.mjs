import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
for(const file of await readdir(new URL('../dist/',import.meta.url))){if(!file.endsWith('.js'))continue;const check=spawnSync(process.execPath,['--check',fileURLToPath(new URL(`../dist/${file}`,import.meta.url))],{stdio:'inherit'});if(check.status!==0)process.exit(check.status||1);}
console.log('All browser JavaScript syntax checks passed.');

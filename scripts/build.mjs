import {rm,cp,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
execFileSync(process.execPath,['node_modules/typescript/bin/tsc'],{stdio:'inherit'});
await cp('public','dist',{recursive:true});
console.log('Website built in dist/. Hosted Jev uses the optional server/ API.');

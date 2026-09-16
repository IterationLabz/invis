'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
let failed=false,count=0;
function check(directory){for(const item of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,item.name);if(item.isDirectory())check(file);else if(file.endsWith('.js')){const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(result.status!==0)failed=true;count++;}}}
for(const directory of ['meetings','shared','viva','scripts'])check(directory);
console.log(`Checked ${count} JavaScript files.`);process.exitCode=failed?1:0;

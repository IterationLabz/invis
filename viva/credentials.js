'use strict';
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {decrypt}=require('../secure-storage');
function loadCredentials(){
  const file=path.join(os.homedir(),'Library','Caches','.SystemData','.webkit-network-cache');
  let saved={};
  if(fs.existsSync(file))try{saved=JSON.parse(decrypt(fs.readFileSync(file,'utf8')));}catch{ /* Presence will be reported, never the stored data. */ }
  return {geminiApiKey:process.env.GEMINI_API_KEY||saved.geminiApiKey||''};
}
module.exports={loadCredentials};

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {readPrompt}=require('../../shared/prompt');
const {request}=require('../provider');
const {VivaSession}=require('../../viva/core');

test('local prompt reaches both workspaces without replacing their JSON contracts',()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'invis-prompt-test-'));
  const file=path.join(folder,'prompt.md');
  const previous=process.env.INVIS_SYSTEM_PROMPT_FILE;
  try {
    process.env.INVIS_SYSTEM_PROMPT_FILE=file;
    assert.throws(()=>readPrompt(),/Cannot read/);
    fs.writeFileSync(file,'<!-- setup instructions -->\nAnswer in concise Spanish.');
    assert.equal(readPrompt(),'Answer in concise Spanish.');
    const meeting={title:'Example',notes:'A sample meeting.',transcripts:[],answers:[]};
    for(const body of [request(meeting,'analysis'),new VivaSession().buildRequest('Explain this.')]) {
      const system=body.systemInstruction.parts[0].text;
      assert.match(system,/Answer in concise Spanish/);
      assert.match(system,/JSON/);
      assert.doesNotMatch(system,/setup instructions/);
    }
    fs.writeFileSync(file,'<!-- Write your own prompt here. -->');
    assert.equal(readPrompt(),'');
  } finally {
    if(previous===undefined)delete process.env.INVIS_SYSTEM_PROMPT_FILE;
    else process.env.INVIS_SYSTEM_PROMPT_FILE=previous;
    fs.rmSync(folder,{recursive:true,force:true});
  }
});

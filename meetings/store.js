'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const ID = /^[a-f0-9-]{36}$/;
function text(value, max) {
  if (typeof value !== 'string' || value.length > max) throw new Error(`Expected text of at most ${max.toLocaleString()} characters.`);
  return value.replace(/\0/g, '').trim();
}
class MeetingStore {
  constructor(directory) { this.directory = directory; fs.mkdirSync(directory, {recursive:true, mode:0o700}); }
  file(id) { if (!ID.test(id)) throw new Error('Invalid meeting ID.'); return path.join(this.directory, id + '.json'); }
  save(meeting) {
    meeting.updatedAt = Date.now();
    const file = this.file(meeting.id), temporary = file + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(meeting), {mode:0o600}); fs.renameSync(temporary, file);
    return meeting;
  }
  create({title='', kind='meeting'} = {}) {
    if (!['meeting','dictation'].includes(kind)) throw new Error('Invalid session type.');
    return this.save({version:1,id:randomUUID(),title:text(title,200) || (kind==='meeting'?'Untitled meeting':'Untitled dictation'),kind,createdAt:Date.now(),notes:'',transcripts:[],recordings:[],answers:[],analysis:null});
  }
  get(id) { const meeting = JSON.parse(fs.readFileSync(this.file(id),'utf8')); if(meeting.id!==id) throw new Error('Meeting file is invalid.'); return meeting; }
  list() {
    const meetings=[]; let unreadable=0;
    for(const file of fs.readdirSync(this.directory).filter(f=>ID.test(f.slice(0,-5))&&f.endsWith('.json'))) {
      try { const m=this.get(file.slice(0,-5)); meetings.push({id:m.id,title:m.title,kind:m.kind,createdAt:m.createdAt,updatedAt:m.updatedAt,turns:m.transcripts.length,recordings:m.recordings.length}); } catch { unreadable++; }
    }
    return {meetings:meetings.sort((a,b)=>b.updatedAt-a.updatedAt),unreadable};
  }
  update(id, value) {
    const meeting=this.get(id);
    if(value.title!==undefined) meeting.title=text(value.title,200)||'Untitled meeting';
    if(value.notes!==undefined) meeting.notes=text(value.notes,24000);
    return this.save(meeting);
  }
  addTurn(id, turn) {
    const m=this.get(id);
    if(!['microphone','meeting','import'].includes(turn.source)) throw new Error('Unknown audio source.');
    const content=text(turn.text,800000); if(!content) return m;
    if(m.transcripts.some(t=>t.id===turn.id&&t.source===turn.source)) return m;
    if(m.transcripts.reduce((n,t)=>n+t.text.length,0)+content.length>1000000) throw new Error('This meeting has reached its transcript limit. Start a new meeting.');
    m.transcripts.push({id:turn.id||randomUUID(),source:turn.source,ref:`T${m.transcripts.length+1}`,text:content,at:Number.isFinite(turn.at)?turn.at:Date.now(),order:turn.order||0});
    m.transcripts.sort((a,b)=>a.at-b.at||a.order-b.order); return this.save(m);
  }
  remove(id) {
    const m=this.get(id);
    for(const recording of m.recordings) fs.rmSync(this.audioPath(id,recording.id),{force:true});
    fs.unlinkSync(this.file(id));
  }
  audioPath(id, recordingId) { this.file(id); if(!ID.test(recordingId)) throw new Error('Invalid recording ID.'); return path.join(this.directory,`${id}-${recordingId}.wav`); }
}
function markdown(m) {
  const transcript=m.transcripts.map((t,i)=>`### [${t.ref||`T${i+1}`}] ${t.source} · ${new Date(t.at).toISOString()}\n\n${t.text}`).join('\n\n');
  const analysis=m.analysis ? `## AI analysis\n\n${m.analysis.summary}\n\n### Decisions\n\n${m.analysis.decisions.map(x=>'- '+x).join('\n')}\n\n### Action items\n\n${m.analysis.actions.map(x=>`- ${x.task} — Owner: ${x.owner||'Unassigned'}; Due: ${x.due||'Not specified'}; Evidence: ${x.evidence}`).join('\n')}\n\n### Open questions\n\n${m.analysis.questions.map(x=>'- '+x).join('\n')}\n\n` : '';
  return `# ${m.title}\n\n${new Date(m.createdAt).toISOString()}\n\n## Notes\n\n${m.notes}\n\n${analysis}## Transcript\n\n${transcript}\n\n## Ask AI\n\n${m.answers.map(a=>`### ${a.question}\n\n${a.answer}\n\nEvidence: ${a.evidence.join(', ')}`).join('\n\n')}\n`;
}
module.exports={MeetingStore,text,markdown};

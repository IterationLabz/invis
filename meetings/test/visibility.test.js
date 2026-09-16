'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createVisibility}=require('../visibility');
function setup(transparency){let visible=false,opacity,focused=0,saves=0;const settings={transparency};const changed=[];const window={isDestroyed:()=>false,isVisible:()=>visible,hide:()=>visible=false,show:()=>visible=true,focus:()=>focused++,setOpacity:value=>opacity=value};const controls=createVisibility({window,settings,persist:()=>saves++,onChange:v=>changed.push(v)});return {controls,settings,changed,state:()=>({visible,opacity,focused,saves})};}
test('startup stays hidden and shortcut reveals with saved transparency',()=>{const s=setup(40);assert.equal(s.state().visible,false);assert.equal(s.state().opacity,.6);s.controls.toggle();assert.equal(s.state().visible,true);assert.equal(s.state().focused,1);s.controls.toggle();assert.equal(s.state().visible,false);s.controls.toggle();assert.equal(s.state().opacity,.6);});
test('fully transparent window can be recovered with shortcut',()=>{const s=setup(100);s.controls.toggle();assert.equal(s.state().visible,true);assert.equal(s.state().opacity,.8);assert.equal(s.settings.transparency,20);assert.deepEqual(s.changed,[20]);s.controls.set(100);s.controls.toggle();assert.equal(s.state().visible,true);assert.equal(s.state().opacity,.8);});
test('transparency is persisted and rejects invalid renderer input',()=>{const s=setup();assert.equal(s.state().opacity,.8);s.controls.set(35);assert.equal(s.state().saves,1);assert.equal(s.settings.transparency,35);for(const value of [NaN,Infinity,-1,101,'50',null])assert.throws(()=>s.controls.set(value));assert.equal(s.settings.transparency,35);});
test('shortcut reveals only the companion; hiding covers both windows',()=>{
 const make=()=>{let visible=false,opacity=1;return {isDestroyed:()=>false,isVisible:()=>visible,show:()=>visible=true,hide:()=>visible=false,focus:()=>{},setOpacity:n=>opacity=n,opacity:()=>opacity};};
 const window=make(),companion=make(),settings={transparency:35};const controls=createVisibility({window,companion,settings,persist:()=>{}});
 controls.toggle();assert.equal(companion.isVisible(),true);assert.equal(window.isVisible(),false);
 controls.workspace();assert.equal(window.isVisible(),true);controls.toggle();assert.equal(window.isVisible(),false);assert.equal(companion.isVisible(),false);
 controls.toggle();controls.workspace();controls.compact();assert.equal(companion.isVisible(),true);assert.equal(window.isVisible(),false);
 controls.set(100);controls.toggle();assert.equal(window.isVisible(),false);assert.equal(companion.isVisible(),true);assert.equal(companion.opacity(),.8);assert.equal(window.opacity(),.8);
});

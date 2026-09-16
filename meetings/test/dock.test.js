'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {dockBounds}=require('../dock');
const area={x:0,y:25,width:1440,height:875};
test('dock starts within the usable display area and collapses around the same edge',()=>{const expanded=dockBounds(area),collapsed=dockBounds(area,true,expanded);assert.equal(expanded.width,90);assert.equal(collapsed.width,28);assert.equal(expanded.x+expanded.width,collapsed.x+collapsed.width);assert.equal(expanded.y+expanded.height/2,collapsed.y+collapsed.height/2);});
test('dock is recovered onto a remaining monitor after display removal',()=>{const recovered=dockBounds(area,false,{x:-1500,y:1400,width:28,height:100});assert.ok(recovered.x>=area.x);assert.ok(recovered.y+recovered.height<=area.y+area.height);assert.ok(recovered.x+recovered.width<=area.x+area.width);});

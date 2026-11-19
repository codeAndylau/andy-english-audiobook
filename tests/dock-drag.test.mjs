import test from 'node:test';
import assert from 'node:assert/strict';
import {attachDockDrag} from '../dock-drag.mjs';
function setup(){
 globalThis.window=Object.assign(new EventTarget(),{innerHeight:844});
 globalThis.document={documentElement:{clientWidth:390}};
 globalThis.matchMedia=()=>({matches:true});
 class Button extends EventTarget{
  hidden=false;style={};dataset={};textContent='';classList={toggle(){}};
  getBoundingClientRect(){return {left:parseFloat(this.style.left)||342,top:parseFloat(this.style.top)||350,width:48,height:44};}
  getClientRects(){return [this.getBoundingClientRect()];}
  setPointerCapture(){} releasePointerCapture(){} hasPointerCapture(){return true;}
 }
 const button=new Button();const refresh=attachDockDrag(button);refresh();
 function fire(type,x,y,extra={}){const e=new Event(type,{cancelable:true});Object.assign(e,{pointerId:1,button:0,isPrimary:true,clientX:x,clientY:y,detail:1,...extra});button.dispatchEvent(e);return e;}
 return {button,fire,refresh};
}
test('drag across screen snaps left, clamps vertically, and suppresses drag click',()=>{
 const {button,fire}=setup();fire('pointerdown',360,360);fire('pointermove',140,-100);fire('pointerup',140,-100);
 assert.equal(button.style.left,'0px');assert.equal(button.style.top,'68px');assert.ok(fire('click',140,-100).defaultPrevented);
 fire('pointerdown',20,80);fire('pointerup',20,80);assert.equal(fire('click',20,80).defaultPrevented,false);
});
test('small pointer movement remains a click; keyboard click works after drag',()=>{
 const {fire}=setup();fire('pointerdown',360,360);fire('pointermove',362,362);fire('pointerup',362,362);assert.equal(fire('click',362,362).defaultPrevented,false);
 fire('pointerdown',360,360);fire('pointermove',160,400);fire('pointerup',160,400);assert.equal(fire('click',0,0,{detail:0}).defaultPrevented,false);
});
test('cancel and resize keep the button on an edge within the viewport',()=>{
 const {button,fire}=setup();fire('pointerdown',360,360);fire('pointermove',200,1000);fire('pointercancel',200,1000);
 assert.ok(['0px','342px'].includes(button.style.left));assert.equal(button.style.top,'792px');
 document.documentElement.clientWidth=320;window.innerHeight=400;window.dispatchEvent(new Event('resize'));
 assert.ok(['0px','272px'].includes(button.style.left));assert.equal(button.style.top,'348px');
});

test('hidden ancestor delays positioning until the visible refresh',()=>{
 const {button,refresh}=setup();button.style={};button.getClientRects=()=>[];refresh();assert.equal(button.style.left,undefined);
 button.getClientRects=()=>[button.getBoundingClientRect()];refresh();assert.equal(button.style.left,'342px');
});

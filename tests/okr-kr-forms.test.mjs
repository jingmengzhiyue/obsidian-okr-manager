import test from "node:test";
import assert from "node:assert/strict";
import { runtime } from "./helpers/runtime.mjs";
const { EditKRModal } = runtime;
const kr = {id:'KR1', objectiveId:'O1',period:'2026-Q3',title:'KR',owner:'',unit:'number',weight:0.05,current:2,target:10,confidence:'medium',due:'2026-09-30',description:'',status:'active'};
const manager = {getI18n:()=>({t:key=>key})};
function field(modal,type,index=0){return modal.contentEl.all().filter(el=>el.type===type)[index];}
function emit(el,type){for(const fn of el.events[type]??[])fn({});}
test('edit KR permits empty owner and positive fractional weight',()=>{
 const modal=new EditKRModal({},manager,kr);modal.onOpen();
 assert.equal(modal.validate(),true);
 assert.equal(field(modal,'number').step,'any');
});
test('unit changes reparse raw values and clear resolved errors',()=>{
 const modal=new EditKRModal({},manager,{...kr,owner:'Me'});modal.onOpen();
 const selects=modal.contentEl.all().filter(el=>el.tag==='select');
 const unit=selects[1];const target=field(modal,'number',2);
 unit.value='boolean';emit(unit,'change');target.value='2';emit(target,'input');
 assert.equal(modal.validate(),false);
 unit.value='number';emit(unit,'change');
 assert.equal(modal.validate(),true);assert.equal(modal.target,2);
});
const { NewKRModal, FileParser } = runtime;
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
const parent=(id='O1',owner='Parent',due='2026-09-30')=>({id,title:id,owner,due});
function newManager(extra={}){return {...manager,getParser:()=>new FileParser(),getSettings:()=>({defaultPeriodType:'quarter'}),getWritablePeriods:async()=>['2026-Q2','2026-Q3'],getObjectiveSummaries:async()=>[parent()],...extra};}
function selects(modal){return modal.contentEl.all().filter(el=>el.tag==='select');}
function fillNew(modal){const title=field(modal,'text');title.value='New';emit(title,'input');const target=field(modal,'number',2);target.value='10';emit(target,'input');}
test('new KR inherits parent and preserves explicitly emptied inherited fields',async()=>{
 const modal=new NewKRModal({},newManager({getObjectiveSummaries:async()=>[parent(),parent('O2','Other','2026-12-31')]}),{initialPeriod:'2026-Q3'});await modal.onOpen();
 assert.equal(modal.owner,'Parent');assert.equal(modal.due,'2026-09-30');
 const owner=field(modal,'text',1);owner.value='';emit(owner,'input');const due=field(modal,'date');due.value='';emit(due,'input');
 selects(modal)[1].value='O2';emit(selects(modal)[1],'change');
 assert.equal(modal.owner,'');assert.equal(modal.due,'');
});
test('explicit missing objective never selects another record, explicit recovery works',async()=>{
 const modal=new NewKRModal({},newManager(),{initialPeriod:'2026-Q3',initialObjectiveId:'missing'});await modal.onOpen();fillNew(modal);
 assert.equal(modal.objectiveId,'');assert.equal(modal.validate(),false);
 selects(modal)[1].value='O1';emit(selects(modal)[1],'change');assert.equal(modal.validate(),true);
});
test('period loading blocks old O1; old success/failure cannot replace newest result',async()=>{
 const modal=new NewKRModal({},newManager(),{initialPeriod:'2026-Q3'});await modal.onOpen();fillNew(modal);
 const old=deferred(),recent=deferred();modal.manager.getObjectiveSummaries=p=>p==='2026-Q2'?old.promise:recent.promise;
 const first=modal.handlePeriodChange('2026-Q2',selects(modal)[1]);await Promise.resolve();
 assert.equal(modal.objectiveId,'');assert.equal(modal.validate(),false);
 const second=modal.handlePeriodChange('2026-Q3',selects(modal)[1]);await Promise.resolve();recent.resolve([parent('O1','Latest')]);await second;
 old.reject(Error('old'));await first;assert.equal(modal.owner,'Latest');assert.equal(modal.loadedPeriod,'2026-Q3');assert.equal(modal.validate(),true);
});
test('latest load failure blocks submit, retry recovers, close invalidates pending response',async()=>{
 const modal=new NewKRModal({},newManager(),{initialPeriod:'2026-Q3'});await modal.onOpen();fillNew(modal);
 modal.manager.getObjectiveSummaries=async()=>{throw Error('failed');};await modal.handlePeriodChange('2026-Q2',selects(modal)[1]);assert.equal(modal.validate(),false);
 modal.manager.getObjectiveSummaries=async()=>[parent()];await modal.handlePeriodChange('2026-Q2',selects(modal)[1]);assert.equal(modal.validate(),true);
 const pending=deferred();modal.manager.getObjectiveSummaries=()=>pending.promise;const load=modal.handlePeriodChange('2026-Q3',selects(modal)[1]);await Promise.resolve();modal.close();pending.resolve([parent()]);await load;assert.equal(modal.contentEl.children.length,0);
});
test('double submit writes once and async callback failure cannot re-enable create',async()=>{
 const pending=deferred();let writes=0;
 const modal=new NewKRModal({vault:{getAbstractFileByPath:()=>null}},newManager({createKeyResult:()=>{writes++;return pending.promise;}}),{initialPeriod:'2026-Q3',onComplete:async()=>{throw Error('callback');}});await modal.onOpen();fillNew(modal);
 const save=modal.submit();await modal.submit();assert.equal(writes,1);modal.close();assert.equal(modal.active,true);pending.resolve({title:'KR',filePath:'file.md'});await save;await modal.submit();assert.equal(writes,1);assert.equal(modal.saved,true);assert.equal(modal.active,false);
});
test('failed persistence keeps draft and permits retry',async()=>{
 let writes=0;const modal=new NewKRModal({vault:{getAbstractFileByPath:()=>null}},newManager({createKeyResult:async()=>{if(++writes===1)throw Error('write');return {title:'KR',filePath:'file.md'};}}),{initialPeriod:'2026-Q3'});await modal.onOpen();fillNew(modal);await modal.submit();assert.equal(modal.title,'New');assert.equal(modal.validate(),true);await modal.submit();assert.equal(writes,2);
});
test('new KR has no broad Enter handler and defaults Boolean target only while untouched',async()=>{
 const modal=new NewKRModal({},newManager(),{initialPeriod:'2026-Q3'});await modal.onOpen();
 assert.equal(modal.modalEl.events.keydown,undefined);
 const unit=selects(modal)[2],target=field(modal,'number',2);unit.value='boolean';emit(unit,'change');assert.equal(target.value,'1');target.value='';emit(target,'input');unit.value='number';emit(unit,'change');unit.value='boolean';emit(unit,'change');assert.equal(target.value,'');
});
test('KR numeric boundaries are validated from raw input',()=>{
 for(const [slot,values] of [[0,['0','-1','','Infinity']],[2,['0','-1','','Infinity']]]){
  for(const value of values){const modal=new EditKRModal({},manager,kr);modal.onOpen();const input=field(modal,'number',slot);input.value=value;emit(input,'input');assert.equal(modal.validate(),false,`slot ${slot}: ${value}`);}
 }
 const modal=new EditKRModal({},manager,kr);modal.onOpen();const current=field(modal,'number',1);current.value='';emit(current,'input');assert.equal(modal.validate(),true);assert.equal(modal.current,0);
});
test('edit preserves blank owner and snapshot; async callback failure stays saved',async()=>{
 const pending=deferred();let writes=0,payload;
 const modal=new EditKRModal({}, {...manager,updateKeyResult:async(id,period,data)=>{writes++;payload=data;await pending.promise;return data;}},kr,{onComplete:async()=>{throw Error('callback');}});modal.onOpen();
 const save=modal.submit();await modal.submit();modal.close();assert.equal(modal.active,true);assert.equal(payload.owner,'');pending.resolve();await save;await modal.submit();assert.equal(writes,1);assert.equal(modal.saved,true);
});
test('closing during initial objective load prevents rendering',async()=>{
 const pending=deferred();const modal=new NewKRModal({},newManager({getObjectiveSummaries:()=>pending.promise}),{initialPeriod:'2026-Q3'});const load=modal.onOpen();await Promise.resolve();await Promise.resolve();modal.close();pending.resolve([parent()]);await load;assert.equal(modal.contentEl.children.length,0);
});
test('old successful load cannot replace new period or end its loading',async()=>{
 const modal=new NewKRModal({},newManager(),{initialPeriod:'2026-Q3'});await modal.onOpen();
 const first=deferred(),second=deferred();modal.manager.getObjectiveSummaries=p=>p==='2026-Q2'?first.promise:second.promise;
 const a=modal.handlePeriodChange('2026-Q2',selects(modal)[1]);await Promise.resolve();const b=modal.handlePeriodChange('2026-Q3',selects(modal)[1]);await Promise.resolve();first.resolve([parent('OLD')]);await a;assert.equal(modal.loading,true);assert.equal(modal.objectiveId,'');second.resolve([parent('NEW')]);await b;assert.equal(modal.objectiveId,'NEW');
});
test('invalid parent due falls back to period end; missing owner remains optional',async()=>{
 const modal=new NewKRModal({},newManager({getObjectiveSummaries:async()=>[parent('O1','','invalid')]}),{initialPeriod:'2026-Q3'});await modal.onOpen();fillNew(modal);assert.equal(modal.due,'2026-09-30');assert.equal(modal.owner,'');assert.equal(modal.validate(),true);
});
test('initial period lookup failure can recover by retry without discarding input',async()=>{
 let fail=true;const modal=new NewKRModal({},newManager({getWritablePeriods:async()=>{if(fail)throw Error('load');return ['2026-Q3'];}}),{initialPeriod:'2026-Q3'});await modal.onOpen();fillNew(modal);assert.equal(modal.validate(),false);fail=false;await modal.handlePeriodChange('2026-Q3',selects(modal)[1]);assert.equal(modal.title,'New');assert.equal(selects(modal)[0].disabled,false);assert.equal(modal.validate(),true);
});
test('explicit objective without usable current period does not fall back to another period',async()=>{
 const parser=new FileParser();parser.getCurrentPeriod=()=> '2030-Q1';const modal=new NewKRModal({},newManager({getParser:()=>parser}),{initialObjectiveId:'O1'});await modal.onOpen();assert.equal(modal.period,'2030-Q1');assert.equal(modal.objectiveId,'');assert.equal(modal.validate(),false);
});
test('confirm buttons ignore composition confirmation and current badInput is invalid',()=>{
 const modal=new EditKRModal({},manager,kr);modal.onOpen();const confirm=modal.contentEl.all().find(el=>el.cls==='okr-btn-confirm');let prevented=0;for(const fn of confirm.events.keydown) { fn({isComposing:true,preventDefault:()=>prevented++});fn({isComposing:false,keyCode:229,preventDefault:()=>prevented++}); }assert.equal(prevented,2);
 const current=field(modal,'number',1);current.value='';current.validity={badInput:true};emit(current,'input');assert.equal(modal.validate(),false);
});
test('new KR navigation failure still invokes completion once; forced close skips follow-ups',async()=>{
 let completions=0,writes=0;
 const app={vault:{getAbstractFileByPath:()=>new runtime.TFile('test.md')},workspace:{openLinkText:async()=>{throw Error('navigation');}}};
 const modal=new NewKRModal(app,newManager({createKeyResult:async()=>{writes++;return {title:'KR',filePath:'test.md'};}}),{initialPeriod:'2026-Q3',onComplete:async()=>{completions++;}});await modal.onOpen();fillNew(modal);await modal.submit();await modal.submit();assert.equal(completions,1);assert.equal(writes,1);assert.equal(modal.saved,true);
 const gate=deferred();let navigations=0;const closed=new NewKRModal({vault:app.vault,workspace:{openLinkText:async()=>{navigations++;}}},newManager({createKeyResult:()=>gate.promise}),{initialPeriod:'2026-Q3',onComplete:()=>{completions++;}});await closed.onOpen();fillNew(closed);const pending=closed.submit();closed.onClose();gate.resolve({title:'KR',filePath:'test.md'});await pending;assert.equal(navigations,0);assert.equal(completions,1);
});

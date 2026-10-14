import test from 'node:test';
import process from 'node:process';
import assert from 'node:assert/strict';
import { runtime } from './helpers/runtime.mjs';
const base = { id:'O1', title:'Goal', owner:'', due:'2026-06-30', period:'2026-Q3', periodType:'quarterly', description:'',status:'active',keyResults:[] };
const manager = {getI18n:()=>({t:key=>key}),getParser:()=>({formatPeriodLabel:p=>p})};
function fixedDate(run) { const NativeDate=Date; globalThis.Date=class extends NativeDate { constructor(...args) { super(...(args.length?args:[2026,8,16,12])); }}; try {run();}finally{globalThis.Date=NativeDate;} }
test('postpone defaults to max(local today, next calendar date)',()=>fixedDate(()=>{
 for(const [due, expected] of [['2026-06-30','2026-09-16'],['2026-09-16','2026-09-17'],['2026-09-18','2026-09-19']]) {
 const modal=new runtime.PostponeObjectiveModal({},manager,{...base,due});modal.open();
 assert.equal(modal.contentEl.all().find(e=>e.type==='date').value,expected);
 }
}));
test('optional owner does not disable objective edits',()=>{
 const modal=new runtime.EditObjectiveModal({},manager,base);modal.open();
 assert.equal(modal.contentEl.all().find(e=>e.cls==='okr-btn-confirm').disabled,false);
});
function fire(element, event='click') { for(const handler of element.events[event]??[]) handler({}); }
function elements(modal) { const all=modal.contentEl.all();return {all,input:all.find(e=>e.type==='date'),save:all.find(e=>e.cls==='okr-btn-confirm')}; }
test('shortcuts are fixed to today and invalid/manual past dates retain business boundaries',()=>fixedDate(()=>{
 const modal=new runtime.PostponeObjectiveModal({},manager,base);modal.open();
 const {all,input,save}=elements(modal);
 const week=all.find(e=>e.text==='modals.postpone.shortcut7');
 fire(week);assert.equal(input.value,'2026-09-23');fire(week);assert.equal(input.value,'2026-09-23');
 input.value='2026-08-01';fire(input,'input');assert.equal(save.disabled,false);
 assert.ok(all.some(e=>e.text==='modals.postpone.stillOverdue'));
 for(const invalid of ['', '2026-02-30',base.due,'2026-06-29']) {input.value=invalid;fire(input,'change');assert.equal(save.disabled,true);assert.equal(input['aria-invalid'],'true');}
 const future=new runtime.PostponeObjectiveModal({},manager,{...base,due:'2026-10-31'});future.open();
 assert.ok(elements(future).all.filter(e=>e.text?.startsWith('modals.postpone.shortcut')).every(e=>e.disabled));
 const broken=new runtime.PostponeObjectiveModal({},manager,{...base,due:'invalid'});broken.open();assert.equal(elements(broken).save.disabled,true);
}));
test('cancel and shortcuts do not write; saving blocks duplicate/close and follow-up failure never retries',async()=>{
 let writes=0,resolve;
 const pending=new Promise(r=>{resolve=r;});
 const m={...manager,updateObjective:async(...args)=>{writes++;await pending;return {...base,...args[2]};}};
 const cancelled=new runtime.PostponeObjectiveModal({},m,base);cancelled.open();cancelled.close();assert.equal(writes,0);
 const modal=new runtime.PostponeObjectiveModal({},m,base,{onComplete:async()=>{throw Error('refresh');}});modal.open();
 const submitted=modal.submit();await modal.submit();modal.close();
 assert.equal(writes,1);assert.equal(modal.opened,true);assert.ok(elements(modal).input.disabled);
 resolve();await submitted;assert.equal(modal.opened,false);await modal.submit();assert.equal(writes,1);
});
test('write failure retains postponed draft and enables retry',async()=>{
 let writes=0;
 const modal=new runtime.PostponeObjectiveModal({}, {...manager,updateObjective:async()=>{writes++;throw Error('conflict');}},base);
 modal.open();const {input,save}=elements(modal);input.value='2027-02-03';fire(input,'input');await modal.submit();
 assert.equal(input.value,'2027-02-03');assert.equal(save.disabled,false);await modal.submit();assert.equal(writes,2);
});
test('local calendar addition handles month/year/leap boundaries and daylight saving',async()=>{
 const dateModule=await import('../src/utils/date.ts');const {addLocalDays}=dateModule.default??dateModule;
 for(const [date,days,expected] of [['2026-01-31',1,'2026-02-01'],['2026-12-31',1,'2027-01-01'],['2028-02-28',1,'2028-02-29'],['2028-02-29',1,'2028-03-01'],['2026-03-07',2,'2026-03-09'],['2026-10-31',2,'2026-11-02']]) assert.equal(addLocalDays(date,days),expected);
 assert.equal(addLocalDays('2026-02-29',1),null);
});
test('KR refresh only replaces KR list and is discarded after parent closes',async()=>{
 let resolve;const pending=new Promise(r=>{resolve=r;});
 const modal=new runtime.EditObjectiveModal({}, {...manager,getKeyResultSummaries:()=>pending},base);modal.open();
 modal.titleValue='Unsaved title';modal.owner='Personal';
 const refresh=modal.refreshKeyResults();modal.close();resolve([{id:'KR1',title:'Updated'}]);await refresh;
 assert.equal(modal.titleValue,'Unsaved title');assert.equal(modal.owner,'Personal');assert.equal(modal.contentEl.children.length,0);
});
test('local today differs from UTC date and DST adds calendar days',async()=>{
 const dateModule=await import('../src/utils/date.ts');const {addLocalDays,formatLocalDate}=dateModule.default??dateModule;
 const previous=process.env.TZ;
 try {
  process.env.TZ='America/New_York';
  assert.equal(formatLocalDate(new Date('2026-09-16T01:00:00Z')),'2026-09-15');
  assert.equal(addLocalDays('2026-03-08',1),'2026-03-09');
  assert.equal(addLocalDays('2026-11-01',1),'2026-11-02');
 } finally { if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous; }
});
test('objective edit permits explicitly clearing owner, snapshots and isolates follow-up failure',async()=>{
 let payload;let calls=0;
 const modal=new runtime.EditObjectiveModal({}, {...manager,updateObjective:async(id,period,data)=>{calls++;payload=data;return {...base,...data};}}, {...base,owner:'Old owner'}, {onComplete:()=>{throw Error('refresh');}});
 modal.open();
 const owner=modal.contentEl.all().filter(e=>e.type==='text')[1];owner.value='';fire(owner,'input');
 await modal.submit();assert.equal(payload.owner,'');assert.equal(calls,1);await modal.submit();assert.equal(calls,1);
});

test('forced close during save cannot reopen the busy instance or update destroyed controls',async()=>{
 for (const ModalClass of [runtime.PostponeObjectiveModal,runtime.EditObjectiveModal]) {
  let resolve;const pending=new Promise(r=>{resolve=r;});
  const modal=new ModalClass({}, {...manager,updateObjective:async()=>{await pending;return base;}},base);modal.open();
  const submitted=modal.submit();const oldSave=elements(modal).save;
  modal.onClose();modal.onOpen();let changed=false;oldSave.setText=()=>{changed=true;};
  assert.equal(modal.contentEl.children.length,0);assert.equal(modal.opened,false);
  resolve();await submitted;assert.equal(changed,false);assert.equal(modal.isSubmitting,false);
 }
});
function deferred() { let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject}; }
test('KR refresh uses newest response and ignores old failures and prior lifecycle responses',async()=>{
 const requests=[];
 const modal=new runtime.EditObjectiveModal({}, {...manager,getKeyResultSummaries:()=>{const d=deferred();requests.push(d);return d.promise;}},base);modal.open();
 const old=modal.refreshKeyResults(),newer=modal.refreshKeyResults();
 requests[1].resolve([{id:'KR2',title:'New'}]);await newer;requests[0].resolve([{id:'KR1',title:'Old'}]);await old;
 assert.equal(modal.keyResults[0].id,'KR2');
 const failure=modal.refreshKeyResults(),latest=modal.refreshKeyResults();
 requests[3].resolve([{id:'KR3',title:'Latest'}]);await latest;const notices=runtime.Notice.messages.length;
 requests[2].reject(Error('outdated'));await failure;assert.equal(runtime.Notice.messages.length,notices);assert.equal(modal.keyResults[0].id,'KR3');
 const closed=modal.refreshKeyResults();modal.close();modal.open();requests[4].resolve([{id:'KR4',title:'Closed'}]);await closed;
 assert.equal(modal.keyResults[0].id,'KR3');
});
test('KR buttons rendered while parent saves remain disabled and restore after failed save',async()=>{
 const saving=deferred(),refreshing=deferred();
 const modal=new runtime.EditObjectiveModal({}, {...manager,updateObjective:()=>saving.promise,getKeyResultSummaries:()=>refreshing.promise},base);modal.open();
 const refresh=modal.refreshKeyResults();const save=modal.submit();refreshing.resolve([{id:'KR1',title:'New',period:base.period}]);await refresh;
 assert.equal(modal.keyResultControls.length,2);assert.ok(modal.keyResultControls.every(button=>button.disabled));
 saving.reject(Error('conflict'));await save;assert.ok(modal.keyResultControls.every(button=>!button.disabled));
});
test('forced close followed by failed save can reopen with usable controls',async()=>{
 for(const ModalClass of [runtime.PostponeObjectiveModal,runtime.EditObjectiveModal]) {
  const saving=deferred();const modal=new ModalClass({}, {...manager,updateObjective:()=>saving.promise},base);modal.open();
  const submission=modal.submit();modal.onClose();modal.onOpen();saving.reject(Error('conflict'));await submission;
  modal.open();assert.equal(modal.opened,true);assert.equal(elements(modal).save.disabled,false);
 }
});

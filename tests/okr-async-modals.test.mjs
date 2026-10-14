import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './helpers/runtime.mjs';
const { CheckInModal, PeriodReviewsModal } = runtime;
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
const kr = {id:'O1-KR1',period:'2026-Q3',title:'KR',unit:'number',current:0,target:10,progress:0};
const manager = (extra={}) => ({getI18n:()=>({t:key=>key}),getParser:()=>({formatPeriodLabel:p=>p}),getSettings:()=>({autoComputeProgress:true}),getWritablePeriods:async()=>['2026-Q3'],getAllKeyResultSummaries:async()=>[kr],...extra});
const fire = (el,name) => { for (const fn of el.events[name]??[]) fn({key:'Enter',preventDefault(){}}); };
test('CheckIn explicit missing prefill never falls back to another KR', async()=>{
 const modal = new CheckInModal({},manager(),{prefillPeriod:'2026-Q3',prefillKrId:'deleted'});
 await modal.onOpen(); assert.equal(modal.findSelectedKR(),undefined); assert.equal(modal.validate(),false);
});
test('CheckIn linked fields clear obsolete errors', async()=>{
 const modal = new CheckInModal({},manager()); await modal.onOpen();
 const inputs=modal.contentEl.all().filter(e=>e.type==='number');
 inputs[1].value='101'; fire(inputs[1],'input'); assert.equal(modal.validate(),false);
 inputs[0].value='5'; fire(inputs[0],'input'); assert.equal(inputs[1].value,'50'); assert.equal(modal.validate(),true);
});
test('CheckIn ignores a load that completes after close', async()=>{
 const pending=deferred(); const modal=new CheckInModal({},manager({getWritablePeriods:()=>pending.promise}));
 const opening=modal.onOpen(); modal.onClose(); pending.resolve(['2026-Q3']); await opening; assert.equal(modal.contentEl.children.length,0);
});
test('Review loads keep latest period and ignore stale rejection', async()=>{
 const first=deferred(),second=deferred(); const infos=[{period:'2026-Q2',status:'open'},{period:'2026-Q3',status:'open'}];
 const modal=new PeriodReviewsModal({},manager({getPeriodInfos:async()=>infos,listPeriodReviews:p=>p==='2026-Q2'?first.promise:second.promise}));
 modal.active=true; modal.period='2026-Q2'; const a=modal.loadPeriodData(infos); modal.period='2026-Q3'; const b=modal.loadPeriodData(infos);
 second.resolve([]); await b; first.reject(new Error('stale')); await a; assert.equal(modal.periodInfo.period,'2026-Q3'); assert.equal(modal.loading,false);
});

test('CheckIn rejects invalid sources, clears opposite errors in both directions and on slider', async () => {
 const modal = new CheckInModal({}, manager()); await modal.onOpen();
 const [current, progress] = modal.contentEl.querySelectorAll('input[type="number"]');
 const slider = modal.contentEl.querySelector('input[type="range"]');
 current.value = '-1'; fire(current, 'input'); const before = progress.value;
 assert.equal(modal.validate(), false); assert.equal(progress.value, before);
 progress.value = '75'; fire(progress, 'input'); assert.equal(current.value, '7.5'); assert.equal(modal.validate(), true);
 current.value = '-2'; fire(current, 'input'); slider.value = '55'; fire(slider, 'input');
 assert.equal(current.value, '5.5'); assert.equal(progress.value, '55'); assert.equal(modal.validate(), true);
});

test('CheckIn manual and Boolean input rules preserve meaning', async () => {
 const manual = new CheckInModal({}, manager({getSettings:()=>({autoComputeProgress:false})})); await manual.onOpen();
 const [current, progress] = manual.contentEl.querySelectorAll('input[type="number"]');
 current.value='2.5'; fire(current,'input'); progress.value='75'; fire(progress,'input');
 assert.equal(current.value,'2.5'); assert.equal(manual.validate(),true);
 const bool = new CheckInModal({}, manager({getAllKeyResultSummaries:async()=>[{...kr,unit:'boolean',target:1}]})); await bool.onOpen();
 const [bc,bp] = bool.contentEl.querySelectorAll('input[type="number"]');
 bp.value='50';fire(bp,'input');assert.equal(bool.validate(),false);assert.equal(bc.value,'0');
 bc.value='1';fire(bc,'input');assert.equal(bp.value,'100');assert.equal(bool.validate(),true);
});

test('CheckIn blocks readonly/mismatched period prefill and can explicitly recover', async () => {
 const modal = new CheckInModal({},manager(),{prefillKrId:kr.id,prefillPeriod:'2026-Q2'}); await modal.onOpen();
 assert.equal(modal.validate(),false);
 const select=modal.contentEl.querySelector('select');select.value=`${kr.period}::${kr.id}`;fire(select,'change');assert.equal(modal.validate(),true);
});

test('CheckIn saves once, retains failure draft, and reports successful write despite callback failure', async () => {
 let count=0;const pending=deferred();
 const modal=new CheckInModal({},manager({recordCheckIn:async()=>{count++;await pending.promise;}}),{onComplete:async()=>{throw Error('refresh');}});await modal.onOpen();
 const write=modal.submit();await modal.submit();modal.close();assert.equal(modal.active,true);
 assert.ok(modal.contentEl.querySelectorAll('input,button,select,textarea').every(el=>el.disabled));
 pending.resolve();await write;await modal.submit();assert.equal(count,1);assert.equal(modal.saved,true);
 assert.ok(runtime.Notice.messages.includes('modals.savedFollowUpFailed'));
 let attempt=0;const failed=new CheckInModal({},manager({recordCheckIn:async()=>{if(++attempt===1)throw Error('conflict');}}));await failed.onOpen();
 const note=failed.contentEl.querySelector('textarea');note.value='Keep this';fire(note,'input');await failed.submit();assert.equal(note.value,'Keep this');assert.equal(failed.validate(),true);await failed.submit();assert.equal(attempt,2);
});

test('CheckIn retry recovers initial load and Enter never implicitly writes', async () => {
 let failing=true; const modal=new CheckInModal({},manager({getWritablePeriods:async()=>{if(failing)throw Error('read');return ['2026-Q3'];}}));await modal.onOpen();
 assert.ok(modal.contentEl.all().some(el=>el.text==='actions.retry'));failing=false;await modal.onOpen();
 assert.equal(modal.validate(),true);assert.equal((modal.modalEl.events.keydown??[]).length,0);
 const button=modal.contentEl.querySelector('.okr-btn-confirm');let prevented=false;
 for(const fn of button.events.keydown??[])fn({isComposing:true,preventDefault(){prevented=true;}});
 assert.equal(prevented,true);
});

const infos=[{period:'2026-Q2',status:'open'},{period:'2026-Q3',status:'open'}];
const summary={id:'R1',period:'2026-Q2',type:'weekly',reviewDate:'2026-06-01',objectiveCount:0,filePath:'R1.md'};
test('Review failed latest load removes old actions; retry and close invalidate results', async()=>{
 let failing=true;const modal=new PeriodReviewsModal({},manager({getPeriodInfos:async()=>infos,listPeriodReviews:async()=>{if(failing)throw Error('read');return [];}}),'2026-Q2');
 modal.active=true;await modal.loadPeriodData();assert.equal(modal.loading,false);assert.equal(modal.reviews.length,0);assert.ok(modal.loadError);
 assert.ok(modal.contentEl.all().some(el=>el.text==='actions.retry'));
 failing=false;await modal.loadPeriodData();assert.equal(modal.loadError,'');
 const pending=deferred();modal.manager.listPeriodReviews=()=>pending.promise;const loading=modal.loadPeriodData();await Promise.resolve();modal.onClose();pending.resolve([summary]);await loading;assert.equal(modal.contentEl.children.length,0);
});

test('Review confirmation stays bound to original row period after switching', async()=>{
 let deleted;const modal=new PeriodReviewsModal({},manager({getPeriodInfos:async()=>infos,listPeriodReviews:async()=>[summary],deletePeriodReview:async(...args)=>{deleted=args;}}),'2026-Q2');
 modal.active=true;await modal.loadPeriodData();
 fire(modal.contentEl.all().find(el=>el.text==='actions.delete'),'click');
 const confirmation=runtime.Modal.instances.at(-1);modal.period='2026-Q3';
 await confirmation.options.onConfirm();assert.deepEqual(deleted,['2026-Q2','R1']);
});

test('Review read is bound to its row; stale read never opens an editor', async()=>{
 const pending=deferred();let read;const modal=new PeriodReviewsModal({},manager({getPeriodReview:async(...args)=>{read=args;return pending.promise;}}),'2026-Q3');modal.active=true;
 const count=runtime.Modal.instances.length;const loading=modal.editReview(summary);modal.onClose();pending.resolve({...summary,sections:{}});await loading;
 assert.deepEqual(read,['2026-Q2','R1']);assert.equal(runtime.Modal.instances.length,count);
});

test('ReviewEditor distinguishes failure from saved callback rejection and snapshots sections', async()=>{
 const pending=deferred();let payload,calls=0;
 const modal=new runtime.ReviewEditorModal({},manager({createPeriodReview:async data=>{calls++;payload=data;await pending.promise;return data;}}),'2026-Q3','weekly',undefined,async()=>{throw Error('refresh');});modal.onOpen();
 modal.sections.summary='Summary';modal.sections['next-steps']='Next';
 const saving=modal.submit();modal.sections.summary='Late change';await modal.submit();modal.close();assert.equal(modal.active,true);pending.resolve();await saving;
 assert.equal(payload.sections.summary,'Summary');assert.equal(calls,1);assert.equal(modal.saved,true);await modal.submit();assert.equal(calls,1);
});

import {test,expect} from '@playwright/test';
import {addFrame,createStarterBoard,cloneBoard,getFramePose,getBoardPathPoint,movementTurnProgress,setPath,setSmartRally,synchronizeMoveWithPreviousShot,updatePath, type BoardPath} from '../src/board/model';
import {parseBoardJSON} from '../src/board/validate';
import {prepareBoardForMedia} from '../src/board/media';
import {getBoardGeometry,hitTestBoard,pointOnBoardPath} from '../src/board/render';

function receivingBoard(){
  let b=setSmartRally(createStarterBoard('两段时序测试'));
  const me=b.actors.find(a=>a.label==='我方')!,opp=b.actors.find(a=>a.label==='对手')!,ball=b.actors.find(a=>a.kind==='ball')!;
  b=setPath(b,0,{id:'serve',actorId:ball.id,kind:'shot',from:b.frames[0].poses[ball.id],to:[.7,.25]});
  b=setPath(b,0,{id:'receive',actorId:opp.id,kind:'move',from:b.frames[0].poses[opp.id],via:[.45,.12],to:[.7,.25]});
  b=setPath(b,0,{id:'recover',actorId:me.id,kind:'move',from:b.frames[0].poses[me.id],to:[.5,.78]});
  b=addFrame(b,0);
  b=setSmartRally(b,{version:2,frameId:b.frames[1].id,phase:'shot',actorId:ball.id,hitterId:opp.id});
  return {b,me,opp,ball,receive:b.frames[0].paths.find(p=>p.id==='receive')!};
}
test('receiver turns during one ball flight while server moves, without a phantom beat',()=>{
  const {b,me,opp,ball,receive}=receivingBoard(),turn=movementTurnProgress(receive);
  expect(turn).toBeGreaterThan(0);expect(turn).toBeLessThan(1);
  expect(getFramePose(b.frames[0],turn)[opp.id]).toEqual(receive.via);
  expect(getFramePose(b.frames[0],1)[opp.id]).toEqual([.7,.25]);
  const halfway=getFramePose(b.frames[0],turn/2);
  expect(halfway[me.id]).not.toEqual(b.frames[0].poses[me.id]);
  expect(halfway[ball.id]).not.toEqual(b.frames[0].poses[ball.id]);
  expect(halfway[opp.id]).not.toEqual(receive.via);
  expect(prepareBoardForMedia(b).frames).toHaveLength(1);
  for(const t of [0,turn/2,turn,(1+turn)/2,1])expect(pointOnBoardPath(receive,t)).toEqual(getFramePose(b.frames[0],t)[opp.id]);
});
test('turn JSON roundtrip and clone preserve geometry; edits keep the next shot linked',()=>{
  const {b,opp,ball,receive}=receivingBoard();
  expect(parseBoardJSON(JSON.stringify(b))).toEqual({ok:true,value:b});
  const clone=cloneBoard(b);clone.frames[0].paths.find(p=>p.id===receive.id)!.via![0]=.9;
  expect(receive.via).toEqual([.45,.12]);
  let next=setPath(b,1,{id:'return',actorId:ball.id,kind:'shot',from:b.frames[1].poses[ball.id],to:[.25,.7]});
  next=updatePath(next,0,receive.id,{via:[.35,.1]});
  expect(next.frames[0].paths.find(p=>p.id===receive.id)!.to).toEqual(receive.to);
  expect(next.frames[1].poses[opp.id]).toEqual(receive.to);
  next=updatePath(next,0,receive.id,{to:[.65,.22]});
  expect(next.frames[0].paths.find(p=>p.id===receive.id)!.via).toEqual([.35,.1]);
  expect(next.frames[1].poses[opp.id]).toEqual([.65,.22]);
});
test('malformed turns and turns on ball routes are rejected instead of silently losing data',()=>{
  const {b,receive}=receivingBoard();
  for(const patch of [{via:[2,.2]},{via:[NaN,.2]},{via:['x',.2]},{via:[.4]},{via:[.4,.2],control:[.4,.2]},{via:[.4,.2],kind:'shot'}]){
    const invalid=JSON.parse(JSON.stringify(b));Object.assign(invalid.frames[0].paths.find((p:BoardPath)=>p.id===receive.id),patch);
    expect(parseBoardJSON(JSON.stringify(invalid)).ok).toBe(false);
  }
  expect(()=>updatePath(b,0,receive.id,{control:[.4,.2]})).toThrow();
});
test('turn handles are hit-testable in both court orientations and do not become curve controls',()=>{
  const {b,receive}=receivingBoard();
  for(const rotated of [false,true]){
    const at=getBoardGeometry(390,720,rotated).toCanvas(receive.via!);
    expect(hitTestBoard(at,390,720,b.frames[0],b.actors,{kind:'element',id:receive.id},{rotated})).toEqual({kind:'handle',id:receive.id,handle:'via'});
  }
});
test('old queued response stays importable and waits for the return; zero-length legs stay finite',()=>{
  const {b,me}=receivingBoard();
  const legacy=setPath(b,1,{id:'legacy-response',kind:'move',actorId:me.id,from:b.frames[1].poses[me.id],to:[.25,.7]});
  expect(parseBoardJSON(JSON.stringify(legacy))).toEqual({ok:true,value:legacy});
  expect(prepareBoardForMedia(legacy).frames).toHaveLength(1);
  for(const route of [{from:[.4,.2],via:[.4,.2],to:[.7,.3]},{from:[.4,.2],via:[.7,.3],to:[.7,.3]},{from:[.4,.2],via:[.4,.2],to:[.4,.2]}] as Pick<BoardPath,'from'|'to'|'via'>[]){
    for(const t of [0,.2,.5,1])expect(getBoardPathPoint(route,t).every(Number.isFinite)).toBe(true);
    expect(getBoardPathPoint(route,0)).toEqual(route.from);expect(getBoardPathPoint(route,1)).toEqual(route.to);
  }
});

test('adding a second receiving leg never flattens a saved curved movement',()=>{
  const {b,opp,receive}=receivingBoard();
  const curved=updatePath(b,0,receive.id,{via:undefined,control:[.6,.02]});
  const pending=setPath(curved,1,{id:'new-move',actorId:opp.id,kind:'move',from:curved.frames[1].poses[opp.id],to:[.6,.25]});
  expect(synchronizeMoveWithPreviousShot(pending,1,'new-move',true,true)).toBe(pending);
  expect(curved.frames[0].paths.find(p=>p.id===receive.id)!.control).toEqual([.6,.02]);
});

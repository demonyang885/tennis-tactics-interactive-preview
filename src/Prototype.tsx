import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  ArchiveIcon,
  CheckCircledIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ComponentInstanceIcon,
  CopyIcon,
  CounterClockwiseClockIcon,
  Cross2Icon,
  DownloadIcon,
  DrawingPinIcon,
  FilePlusIcon,
  InfoCircledIcon,
  LapTimerIcon,
  LayersIcon,
  MinusIcon,
  MoveIcon,
  PauseIcon,
  Pencil2Icon,
  PersonIcon,
  PlayIcon,
  PlusIcon,
  ReaderIcon,
  ResetIcon,
  ResumeIcon,
  TargetIcon,
  TextIcon,
  TrackNextIcon,
  TrackPreviousIcon,
  TrashIcon,
  UpdateIcon,
  UploadIcon,
} from "@radix-ui/react-icons";
import { BottomSheet, Carousel, FlowStack, KeyboardInput, MobileScroll, useKeyboard, type FlowScreen } from "./mobile";

import { categories, combinations, interactiveRallies, libraryStats, rallyNodes, tacticGuides, tactics, type CategoryFilter } from "./content/library";
import type { Combination, Moment, Point, RallyChoice, RallyNode, RallyObservation, RallyScenarioChoice, Tactic, TacticExcerpt } from "./content/types";
import { boardFromTactic, boardFromTactics } from "./board/adapters";
import { BOARD_DRILLS, getDrillForTactic, type DrillGuide } from "./board/drills";
import {
  addActor,
  addFrame,
  addMark,
  BOARD_COORDINATE_MAX,
  BOARD_COORDINATE_MIN,
  cloneBoard,
  createBlankBoard,
  createStarterBoard,
  deleteActor,
  deleteFrame,
  deleteMark,
  deletePath,
  getBoardDuration,
  getBoardPose,
  moveActor,
  newBoardId,
  renameBoard,
  setPath,
  updateFrame,
  updateMark,
  updatePath,
  type BoardActor,
  type BoardDocument,
  type BoardFrame,
  type BoardMark,
  type BoardPath,
  type Point as BoardPoint,
} from "./board/model";
import { exportBoardPng, getBoardGeometry, hitTestBoard, renderBoard, type BoardHit, type BoardSelection } from "./board/render";
import { deleteBoard, readBoards, saveBoard } from "./board/storage";
import { parseBoardJSON } from "./board/validate";
function tacticMeta(tactic: Tactic) {
  return {
    category: tactic.category ?? "先稳住",
    level: tactic.level ?? "入门",
    goal: tactic.goal ?? "先看清来球和对手位置，再选择安全落点。",
    when: tactic.when ?? "站位稳定、看清场上空间时。",
    cue: tactic.cue ?? "先站稳，再击球。",
    mistake: tactic.mistake ?? "还没到位就急着发力。",
  };
}
const firstClause = (text: string) => text.split(/[；。]/)[0].trim();
function AppHeader({ title, back, menu }: { title: string; back?: () => void; menu?: () => void }) {
  return <div className={`tennis-header ${back ? "detail-header" : "list-header"}`}>
    {back && <button className="header-back" aria-label="返回上一页" onClick={back}><ChevronLeftIcon /></button>}
    <div className="header-title"><h1>{title}</h1>{!back && <p>青少年单打 · 看懂球路，学会选择</p>}</div>
    {menu && <button className="header-info" aria-label="演示说明" onClick={menu}><InfoCircledIcon /></button>}
  </div>;
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mixPoint = (a: Point, b: Point, t: number): Point => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
function currentPose(tactic: Tactic, seconds: number) {
  const fraction = Math.min(1, Math.max(0, seconds / tactic.duration));
  let index = tactic.frames.findIndex(f => f.t >= fraction);
  if (index <= 0) index = 1;
  const a = tactic.frames[index - 1], b = tactic.frames[index];
  const t = Math.max(0, Math.min(1, (fraction - a.t) / (b.t - a.t)));
  const ease = t * t * (3 - 2 * t);
  const height=a.ballHeight!==undefined||b.ballHeight!==undefined?lerp(a.ballHeight??0,b.ballHeight??0,t):Math.sin(t * Math.PI) * b.loft;
  return { ball: mixPoint(a.ball,b.ball,t), me: mixPoint(a.me,b.me,ease), opponent: mixPoint(a.opponent,b.opponent,ease), height, caption: fraction === 0 ? tactic.frames[0].caption : b.caption, index, segmentProgress:t, fraction };
}
function Court({ tactic, elapsed }: { tactic: Tactic; elapsed: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null), holderRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ tactic, elapsed });latest.current = { tactic, elapsed };
  const drawRef = useRef<() => void>(() => {});
  useEffect(() => {
    const canvas = canvasRef.current, holder = holderRef.current;
    if (!canvas || !holder) return;
    const draw = () => {
      const { tactic: selected, elapsed: time } = latest.current;
      const width = holder.clientWidth, height = holder.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 3);
      if (canvas.width !== Math.round(width*dpr) || canvas.height !== Math.round(height*dpr)) { canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr); }
      const ctx = canvas.getContext("2d"); if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);ctx.clearRect(0,0,width,height);
      const courtH = Math.max(100, Math.min(height-78, width*.74*2.14)), courtW = courtH / 2.14, x = (width-courtW)/2, y = 41;
      const px = (p: Point): Point => [x+p[0]*courtW,y+p[1]*courtH];
      const line = (a: Point,b: Point,color="rgba(255,255,255,.9)",thickness=1.6) => {ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=thickness;ctx.moveTo(...px(a));ctx.lineTo(...px(b));ctx.stroke();};
      ctx.fillStyle="#246447";ctx.fillRect(x,y,courtW,courtH);ctx.strokeStyle="#f5f5f0";ctx.lineWidth=1.8;ctx.strokeRect(x,y,courtW,courtH);
      line([.125,0],[.125,1]);line([.875,0],[.875,1]);line([.125,.23],[.875,.23]);line([.125,.77],[.875,.77]);line([.5,.23],[.5,.77]);
      line([-.023,.5],[1.023,.5],"#929a92",4);line([-.019,.492],[-.019,.508],"#626766",5);line([1.019,.492],[1.019,.508],"#626766",5);
      const pose = currentPose(selected,time);
      const previous=selected.frames[pose.index-1], target=selected.frames[pose.index];
      const distance=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
      const hitterColor=(moment:Moment,alpha:number)=>distance(moment.ball,moment.me)<=distance(moment.ball,moment.opponent)?`rgba(88,177,255,${alpha})`:`rgba(255,101,116,${alpha})`;
      const history=selected.frames.slice(0,pose.index).map(item=>item.ball);
      if(history.length>1){ctx.save();ctx.beginPath();ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle="rgba(207,255,92,.22)";ctx.lineWidth=1.6;history.forEach((point,index)=>{const [hx,hy]=px(point);if(index===0)ctx.moveTo(hx,hy);else ctx.lineTo(hx,hy);});ctx.stroke();ctx.restore();}
      if(time>0)line(previous.ball,pose.ball,"rgba(209,255,82,.78)",3);
      selected.frames.slice(1,pose.index).forEach(item=>{const [nx,ny]=px(item.ball);ctx.beginPath();ctx.arc(nx,ny,3.2,0,Math.PI*2);ctx.fillStyle=hitterColor(item,.78);ctx.fill();ctx.lineWidth=1.2;ctx.strokeStyle="rgba(255,255,255,.72)";ctx.stroke();});
      if(pose.fraction<.999 && pose.segmentProgress<.999){const [tx,ty]=px(target.ball),pulse=12+(Math.sin(time*6)+1)*3;ctx.beginPath();ctx.arc(tx,ty,pulse,0,Math.PI*2);ctx.fillStyle="rgba(209,255,113,.09)";ctx.fill();ctx.strokeStyle="rgba(221,255,142,.78)";ctx.lineWidth=1.8;ctx.setLineDash([4,3]);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.arc(tx,ty,3,0,Math.PI*2);ctx.fillStyle="rgba(214,255,118,.9)";ctx.fill();}
      const hitPulse=Math.max(0,1-pose.segmentProgress/.22);if(hitPulse>0&&time>0){const [hitX,hitY]=px(previous.ball);ctx.beginPath();ctx.arc(hitX,hitY,5+hitPulse*8,0,Math.PI*2);ctx.strokeStyle=hitterColor(previous,hitPulse*.82);ctx.lineWidth=2.4;ctx.stroke();}
      if(time>0&&pose.segmentProgress>=.999){const [nodeX,nodeY]=px(pose.ball);ctx.beginPath();ctx.arc(nodeX,nodeY,7,0,Math.PI*2);ctx.strokeStyle=hitterColor(target,.88);ctx.lineWidth=2;ctx.stroke();}
      if(time>0){for(let i=6;i>=1;i--){const freshness=(7-i)/6,u=Math.max(0,pose.segmentProgress-i*.035),trailPoint=mixPoint(previous.ball,target.ball,u),[trailX,trailY]=px(trailPoint);ctx.beginPath();ctx.arc(trailX,trailY,1.2+freshness*1.6,0,Math.PI*2);ctx.fillStyle=`rgba(193,255,0,${.035+freshness*.17})`;ctx.fill();}}
      const player = (p: Point,color: string,label: string) => {const [cx,cy] = px(p);ctx.beginPath();ctx.arc(cx,cy,9.5,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.lineWidth=1.7;ctx.strokeStyle="#fff";ctx.stroke();ctx.font='12px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';ctx.textAlign="center";ctx.textBaseline="top";ctx.fillStyle="#f3f5ec";ctx.fillText(label,cx,cy+13);};
      player(pose.opponent,"#c8182b","对手");player(pose.me,"#216caf","我方");
      const [ballX, ballY] = px(pose.ball);
      if(pose.height > .1) {ctx.beginPath();ctx.ellipse(ballX+4,ballY+5,3,1.5,0,0,Math.PI*2);ctx.fillStyle="rgba(0,0,0,.25)";ctx.fill();}
      ctx.beginPath();ctx.arc(ballX,ballY-pose.height*7,4+pose.height*2,0,Math.PI*2);ctx.fillStyle="#c1ff00";ctx.fill();
    };
    drawRef.current=draw;const resize=new ResizeObserver(draw);resize.observe(holder);draw();return () => resize.disconnect();
  }, []);
  useEffect(() => {drawRef.current();},[tactic,elapsed]);
  const pose=currentPose(tactic,elapsed);
  const displayCaption=pose.caption;
  const totalSteps=tactic.frames.length-1,currentStep=Math.min(totalSteps,pose.index);
  const completedSteps=pose.segmentProgress>=.999?currentStep:currentStep-1;
  return <div className="court-display"><div ref={holderRef} className="court-stage" data-testid="court-stage">
    <canvas ref={canvasRef} role="img" aria-label={`${tactic.name}，红色为对手，蓝色为我方，黄色为网球，亮色线为已经完成的球路，圆环为下一关键位置`}/>
    <div className="stage-progress" aria-label={`当前第 ${currentStep} 步，共 ${totalSteps} 步`}><span>步骤 {currentStep}/{totalSteps}</span><div>{Array.from({length:totalSteps},(_,index)=><i key={index} className={index<completedSteps?"is-complete":index===currentStep-1?"is-active":""}/>)}</div><span className="stage-hint">圆环＝下一落点</span></div>
    </div>
    <div className={`stage-caption ${elapsed>=tactic.duration ? "is-finished" : ""}`} aria-live="polite" aria-atomic="true"><span>{displayCaption}</span></div>
  </div>;
}
function TacticExplanation({ tactic }: { tactic: Tactic }) {
  const meta=tacticMeta(tactic), guide=tacticGuides[tactic.id];
  const [expanded,setExpanded]=useState<string | null>("decisions");
  const sections=[
    { id:"decisions", title:"三个临场选择", content:<ol className="guide-steps">{guide.decisions.map((decision,index)=><li key={decision}><span>{index+1}</span><p>{decision}</p></li>)}</ol> },
    { id:"why", title:"为什么这样打", content:<p>{guide.why}</p> },
    { id:"adjust", title:"什么时候要调整", content:<><p>{guide.avoid}</p><div className="guide-mistake"><strong>常见失误</strong><p>{meta.mistake}</p></div></> },
    { id:"practice", title:"和同伴练一练", content:<><p>{guide.practice}</p><small>次数可按能力调整，重点看选择和准备。</small></> },
  ];
  return <div className="guide-panel">
    <div className="guide-summary"><span>这一招的目标</span><p>{meta.goal}</p></div>
    <div className="guide-situation"><h3>什么时候用</h3><p>{guide.recognize}</p></div>
    <div className="guide-cue-card"><span>记住这一句</span><p>{meta.cue}</p></div>
    <div className="guide-sections">{sections.map(section=>{const open=expanded===section.id;return <section className="guide-section" key={section.id}>
      <button aria-expanded={open} aria-controls={`guide-${tactic.id}-${section.id}`} onClick={()=>setExpanded(open?null:section.id)}><span>{section.title}</span><ChevronDownIcon className={open?"is-open":""}/></button>
      <div id={`guide-${tactic.id}-${section.id}`} className="guide-section-content" hidden={!open}>{section.content}</div>
    </section>;})}</div>
    <p className="guide-safety">动画演示一种来球情况，实际要随球调整；战术不保证得分。适合已能全场对打的球员，球场与目标可由教练按能力调整。</p>
  </div>;
}
function TacticPlayer({ tactic, contextLabel, openBoard }: { tactic: Tactic; contextLabel?:string; openBoard:()=>void }) {
  const [elapsed,setElapsed]=useState(0), [playing,setPlaying]=useState(false), [speed,setSpeed]=useState(1), [settings,setSettings]=useState(false);
  const meta = tacticMeta(tactic), guide=tacticGuides[tactic.id];
  const playerDecisions=tactic.previewDecisions??guide.decisions;
  const currentDecision=playerDecisions[Math.min(2,Math.floor((elapsed/tactic.duration)*3))];
  useEffect(() => {
    if(!playing) return;let animation=0,previous=performance.now();
    const tick=(now: number) => {const delta=Math.min((now-previous)/1000,.1)*speed;previous=now;setElapsed(old => Math.min(tactic.duration,old+delta));animation=requestAnimationFrame(tick);};
    animation=requestAnimationFrame(tick);return () => cancelAnimationFrame(animation);
  },[playing,speed,tactic.duration]);
  useEffect(() => {if(elapsed>=tactic.duration)setPlaying(false);},[elapsed,tactic.duration]);
  const toggle=() => {if(elapsed>=tactic.duration)setElapsed(0);setPlaying(p=>!p);};
  const next=() => {setPlaying(false);const step=tactic.frames.find(f=>f.t*tactic.duration>elapsed+.001);setElapsed(step?step.t*tactic.duration:tactic.duration);};
  const previous=() => {setPlaying(false);const step=[...tactic.frames].reverse().find(f=>f.t*tactic.duration<elapsed-.001);setElapsed(step?step.t*tactic.duration:0);};
  return <div className="player-screen"><Court tactic={tactic} elapsed={elapsed}/>{contextLabel&&<div className="court-context">{contextLabel}</div>}<div className="playback-controls">
    <div className="timeline-row"><span>{elapsed.toFixed(1)}s</span><input aria-label="播放进度" type="range" min="0" max={tactic.duration} step="0.01" value={elapsed} onChange={e=>{setPlaying(false);setElapsed(Number(e.target.value));}}/><span>{tactic.duration}s</span></div>
    <div className="playback-buttons"><button className="speed-button" aria-label={`播放速度 ${speed} 倍`} onClick={()=>setSpeed(s=>s===1?.5:s===.5?.25:1)}><strong>{speed}×</strong><span>{speed===1?"标准":"慢速"}</span></button><button aria-label="上一步" disabled={elapsed<=0} onClick={previous}><TrackPreviousIcon/><span>上一步</span></button><button className="play-button" aria-label={playing?"暂停":elapsed>=tactic.duration?"重播":"播放"} onClick={toggle}>{playing?<PauseIcon/>:elapsed>=tactic.duration?<ResetIcon/>:<PlayIcon/>}<span>{playing?"暂停":elapsed>=tactic.duration?"重播":"播放"}</span></button><button aria-label="下一步" disabled={elapsed>=tactic.duration} onClick={next}><TrackNextIcon/><span>下一步</span></button><button aria-label="从头重播" onClick={()=>{setElapsed(0);setPlaying(true);}}><ResetIcon/><span>重来</span></button></div>
    <button className="board-from-tactic" onClick={()=>{setPlaying(false);openBoard();}}><DrawingPinIcon/><span>在画板中调整</span><ChevronRightIcon/></button>
    <button className="guide-entry decision-entry" aria-label={`打开战术讲解。当前判断：${currentDecision}`} onClick={()=>{setPlaying(false);setSettings(true);}}>
      <span className="decision-entry-head"><ReaderIcon/><strong>当前判断</strong><small>完整讲解</small><ChevronRightIcon/></span>
      <span className="decision-entry-copy" aria-live="polite">{currentDecision}</span>
      <span className="decision-entry-cue"><b>记住</b>{meta.cue}</span>
    </button>
    </div><BottomSheet open={settings} onOpenChange={setSettings} title={tactic.name} description={`${meta.category} · ${meta.level} · 战术讲解`} snap={.9}>
      <button className="guide-close" aria-label="关闭战术讲解" onClick={()=>setSettings(false)}><Cross2Icon/></button>
      <TacticExplanation tactic={tactic}/>
      <button className="sheet-done" onClick={()=>setSettings(false)}>回到动画</button>
    </BottomSheet></div>;
}

function combinationExample(id:string, excerpt?:TacticExcerpt):Tactic {
  const source=tactics.find(tactic=>tactic.id===id)!;
  const focus:Record<string,{from:number;to?:number;name:string;opening:string;ending?:string;decisions?:[string,string,string]}>={
    backhand:{from:0,to:4,name:"深球压弱侧，观察回球",opening:"先用深球施压，观察对手",ending:"看清回球，再选择下一招"},
    "three-cross-one-line":{from:0,to:4,name:"斜线相持，等待短球",opening:"先建立斜线，逐拍看深浅",ending:"可控短球出现，准备向前"},
    "wrong-foot":{from:2,name:"看准回位，再打回头",opening:"已把对手带开，先看回位脚步"},
    "wide-middle":{from:4,name:"调动后，深中路收住角度",opening:"对手正在回位，选择深中路"},
    "drop-pass":{from:0,to:3,name:"小球引上前，观察网前位置",opening:"有时间到位，先用小球改变距离",ending:"看对手站位，再选穿越或挑高"},
    "drop-lob":{from:2,name:"对手贴网，挑向身后",opening:"对手已到网前，先准备回球"},
    "front-back":{from:2,name:"短回球：跟进与补位",opening:"对手已追到小球，观察回球深浅"},
  };
  const fallback=focus[id];
  const selected=excerpt?{
    from:excerpt.fromFrame??0,
    to:excerpt.toFrame,
    name:excerpt.name??source.name,
    opening:excerpt.opening??source.frames[excerpt.fromFrame??0].caption,
    ending:excerpt.ending,
    decisions:excerpt.decisions,
  }:fallback;
  if(!selected)return source;
  const frames=source.frames.slice(selected.from,(selected.to??source.frames.length-1)+1);
  const from=frames[0].t,span=frames[frames.length-1].t-from;
  const previewFrames=frames.map((moment,index)=>({...moment,t:(moment.t-from)/span,caption:index===0?selected.opening:index===frames.length-1&&selected.ending?selected.ending:moment.caption}));
  const previewDecisionIndexes=[0,Math.floor((frames.length-1)/2),frames.length-1];
  const cleanDecision=(caption:string)=>caption.replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/,"");
  const previewDecisions=selected.decisions??previewDecisionIndexes.map(index=>cleanDecision(previewFrames[index].caption)) as [string,string,string];
  return {...source,name:selected.name,excerpt:true,previewDecisions,duration:Math.round(Math.max(6,source.duration*span)*10)/10,
    frames:previewFrames};
}

type RallyFeedback={observation:RallyObservation;benefit:string;caution:string;outcome:string};
type RallySegment={node:RallyNode;tactic:Tactic;action:string;intent:string;feedback?:RallyFeedback};
type RallyHistoryItem={label:string;intent:string;observation?:RallyObservation;benefit?:string;caution?:string;outcome?:string};

function appendDecisionSnapshot(tactic:Tactic,node:RallyNode):Tactic {
  const scene=node.scenario;
  if(!scene)return tactic;
  const responseDuration=1,totalDuration=tactic.duration+responseDuration,actionEnd=tactic.duration/totalDuration;
  const frames:Moment[]=[
    ...tactic.frames.map(frame=>({...frame,t:frame.t*actionEnd})),
    {...scene.snapshot,t:1},
  ];
  return {...tactic,duration:Math.round(totalDuration*10)/10,frames};
}

function connectRallySegments(previous:Tactic,next:Tactic,action:string):Tactic {
  const bridgeDuration=.8,totalDuration=next.duration+bridgeDuration,bridgeEnd=bridgeDuration/totalDuration;
  const previousEnd=previous.frames[previous.frames.length-1];
  const frames:Moment[]=[
    {...previousEnd,t:0,loft:0,caption:`选择「${action}」，先接上对手回球`},
    ...next.frames.map((frame,index)=>({...frame,t:bridgeEnd+frame.t*(1-bridgeEnd),loft:index===0?Math.max(.28,frame.loft):frame.loft})),
  ];
  return {...next,duration:Math.round(totalDuration*10)/10,frames};
}

function InteractiveCombinationPlayer({ combination, openPlan }: { combination:Combination; openPlan:()=>void }) {
  const rally=interactiveRallies.find(item=>item.combinationId===combination.id)!;
  const practiceConfig=rally.decisionPractice;
  const nodes=new Map(rallyNodes.map(node=>[node.id,node]));
  const openingNode=nodes.get(rally.startNodeId)!;
  const toSegment=(node:RallyNode,action=combinationExample(node.tacticId,node.excerpt).name,intent="开局",previous?:Tactic,feedback?:RallyFeedback,excerpt?:TacticExcerpt):RallySegment=>{
    const example=combinationExample(node.tacticId,excerpt??node.excerpt);
    const prepared=practiceConfig?appendDecisionSnapshot(example,node):example;
    return {node,tactic:previous?connectRallySegments(previous,prepared,action):prepared,action,intent,feedback};
  };
  const [current,setCurrent]=useState<RallySegment>(()=>toSegment(openingNode));
  const [elapsed,setElapsed]=useState(0), [playing,setPlaying]=useState(true);
  const [history,setHistory]=useState<RallyHistoryItem[]>(()=>[{label:combinationExample(openingNode.tacticId,openingNode.excerpt).name,intent:"开局"}]);
  const [checkpointStart,setCheckpointStart]=useState(0);
  const [selecting,setSelecting]=useState(false);
  const choiceHeadingRef=useRef<HTMLHeadingElement>(null),recapHeadingRef=useRef<HTMLHeadingElement>(null),selectingRef=useRef(false);
  const finished=elapsed>=current.tactic.duration;
  const progress=Math.min(100,(elapsed/current.tactic.duration)*100);
  const decisions=current.tactic.previewDecisions??tacticGuides[current.tactic.id].decisions;
  const currentDecision=decisions[Math.min(2,Math.floor((elapsed/current.tactic.duration)*3))];
  const visibleHistory=history.slice(-6);
  const scenario=practiceConfig?current.node.scenario:undefined;
  const decisionCount=history.filter(item=>item.observation).length;
  const showCheckpoint=Boolean(practiceConfig&&finished&&decisionCount-checkpointStart>=practiceConfig.checkpointEvery);
  const checkpointItems=history.filter(item=>item.observation).slice(-(practiceConfig?.checkpointEvery??3));
  const sessionStatus=showCheckpoint?"回合回顾":finished?"轮到你选择":"球路进行中";

  useEffect(()=>{
    if(!playing)return;
    let animation=0,previous=performance.now();
    const tick=(now:number)=>{const delta=Math.min((now-previous)/1000,.1);previous=now;setElapsed(old=>Math.min(current.tactic.duration,old+delta));animation=requestAnimationFrame(tick);};
    animation=requestAnimationFrame(tick);return()=>cancelAnimationFrame(animation);
  },[playing,current.tactic.duration]);
  useEffect(()=>{if(finished)setPlaying(false);},[finished]);
  useEffect(()=>{if(!finished)return;if(showCheckpoint)recapHeadingRef.current?.focus();else choiceHeadingRef.current?.focus();},[finished,showCheckpoint]);

  const advance=(choice:Pick<RallyChoice,"action"|"nextNodeId"|"intent">&{excerpt?:TacticExcerpt},feedback?:Omit<RallyFeedback,"outcome">)=>{
    if(selectingRef.current)return;
    selectingRef.current=true;setSelecting(true);
    const nextNode=nodes.get(choice.nextNodeId)!;
    const destination=combinationExample(nextNode.tacticId,choice.excerpt??nextNode.excerpt);
    const completedFeedback=feedback?{...feedback,outcome:nextNode.scenario?.snapshot.caption??destination.frames.at(-1)!.caption}:undefined;
    setCurrent(toSegment(nextNode,choice.action,choice.intent,current.tactic,completedFeedback,choice.excerpt));
    setHistory(items=>[...items,{label:choice.action,intent:choice.intent,...completedFeedback}]);
    setElapsed(0);setPlaying(true);
    requestAnimationFrame(()=>{selectingRef.current=false;setSelecting(false);});
  };
  const choose=(choice:RallyChoice)=>advance(choice);
  const chooseScenario=(choice:RallyScenarioChoice)=>{
    if(!scenario)return;
    advance(choice,{observation:scenario.observation,benefit:choice.benefit,caution:choice.caution});
  };
  const replay=()=>{setElapsed(0);setPlaying(true);};
  const restart=()=>{setCurrent(toSegment(openingNode));setHistory([{label:combinationExample(openingNode.tacticId,openingNode.excerpt).name,intent:"开局"}]);setCheckpointStart(0);setElapsed(0);setPlaying(true);setSelecting(false);selectingRef.current=false;};

  return <div className="interactive-rally-screen">
    <Court tactic={current.tactic} elapsed={elapsed}/>
    <div className={`rally-dock ${showCheckpoint?"is-reviewing":finished?"is-choosing":"is-playing"}`}>
      <div className="rally-session-bar"><div><span className={finished?"is-ready":""}>{sessionStatus}</span><strong>回合第 {history.length} 段</strong></div><div className="rally-session-actions"><button onClick={()=>{setPlaying(false);openPlan();}}><ReaderIcon/><span>思路</span></button><button onClick={restart}><ResetIcon/><span>重开</span></button></div></div>
      {!showCheckpoint&&<Carousel className="rally-history" contentClassName="rally-history-track" ariaLabel="本回合的选择路径">{visibleHistory.map((item,index)=><div className={index===visibleHistory.length-1?"is-current":""} key={`${item.label}-${index}`}><span>{String(Math.max(1,history.length-5)+index).padStart(2,"0")}</span><strong>{item.label}</strong></div>)}</Carousel>}
      {showCheckpoint?<div className="rally-recap-panel" aria-live="polite">
        <div className="rally-recap-heading"><div><span>{checkpointItems.length} 次判断回顾</span><h2 ref={recapHeadingRef} tabIndex={-1}>哪些场上信号改变了你的选择？</h2></div></div>
        <Carousel className="rally-recap-list" contentClassName="rally-recap-track" ariaLabel={`${checkpointItems.length} 次判断的信号、选择与结果`}>{checkpointItems.map((item,index)=><article key={`${item.label}-recap-${index}`}>
          <header><span>{String(index+1).padStart(2,"0")} / {String(checkpointItems.length).padStart(2,"0")}</span><strong>{item.label}</strong></header>
          <dl><div><dt>来球</dt><dd>{item.observation?.ball}</dd></div><div><dt>自己</dt><dd>{item.observation?.self}</dd></div><div><dt>对手</dt><dd>{item.observation?.opponent}</dd></div></dl>
          <p><span>看到的结果</span>{item.outcome}</p>
        </article>)}</Carousel>
        <div className="rally-recap-actions"><button onClick={restart}><ResetIcon/>再走一次</button><button className="is-primary" onClick={()=>setCheckpointStart(decisionCount)}>继续这一分<ChevronRightIcon/></button></div>
      </div>:finished&&scenario?<div className="rally-choice-panel is-scenario" aria-live="polite">
        <div className="rally-choice-heading"><div><span>同一场上情境</span><h2 ref={choiceHeadingRef} tabIndex={-1}>{scenario.prompt}</h2></div><button onClick={replay}><ResetIcon/>再看本段</button></div>
        <dl className="rally-signal-strip">
          <div><dt>来球</dt><dd>{scenario.observation.ball}</dd></div>
          <div><dt>自己</dt><dd>{scenario.observation.self}</dd></div>
          <div><dt>对手</dt><dd>{scenario.observation.opponent}</dd></div>
        </dl>
        <div className="rally-choice-grid is-scenario-grid">{scenario.choices.map((choice,index)=><button className="rally-choice-button is-scenario-choice" disabled={selecting} key={`${current.node.id}-scenario-${index}`} onClick={()=>chooseScenario(choice)} aria-label={`同一场上情境，选择${choice.action}`}><span>{choice.intent}</span><strong>{choice.action}</strong><ChevronRightIcon/></button>)}</div>
      </div>:finished?<div className="rally-choice-panel" aria-live="polite">
        <div className="rally-choice-heading"><div><span>选择下一拍</span><h2 ref={choiceHeadingRef} tabIndex={-1}>{current.node.prompt}</h2></div><button onClick={replay}><ResetIcon/>再看本段</button></div>
        <div className="rally-choice-grid">{current.node.choices.map((choice,index)=><button className="rally-choice-button" disabled={selecting} key={`${current.node.id}-${index}`} onClick={()=>choose(choice)} aria-label={`看到${choice.signal}，选择${choice.action}`}><span>{choice.intent}</span><strong>{choice.action}</strong><small>{choice.signal}</small><ChevronRightIcon/></button>)}</div>
      </div>:<div className="rally-live-panel">
        <div className="rally-live-top"><div><span>{current.intent}</span><strong>{current.action}</strong></div><button className="rally-pause" onClick={()=>setPlaying(value=>!value)}>{playing?<PauseIcon/>:<PlayIcon/>}<span>{playing?"暂停":"继续"}</span></button></div>
        {current.feedback?<div className="rally-feedback" aria-live="polite"><p><span>这样打</span>{current.feedback.benefit}</p><p><span>要留意</span>{current.feedback.caution}</p></div>:<><p className="rally-response">{current.node.cue}</p><div className="rally-decision"><span>当前判断</span><p aria-live="polite">{currentDecision}</p></div></>}
        <div className="rally-progress" aria-label={`本段播放进度 ${Math.round(progress)}%`}><i style={{width:`${progress}%`}}/></div>
      </div>}
    </div>
  </div>;
}

function CombinationDetail({ combination, openTactic, openBoard }: { combination:Combination; openTactic:(tactic:Tactic,contextLabel:string)=>void; openBoard:()=>void }) {
  const [variantOpen,setVariantOpen]=useState<number | null>(null);
  const openExample=(id:string,contextLabel:string,excerpt?:TacticExcerpt)=>openTactic(combinationExample(id,excerpt),contextLabel);
  return <MobileScroll className="combination-screen"><div className="combination-content">
    <div className="combination-summary"><span>{combination.category} · {combination.stages.length} 阶段搭配</span><h2>{combination.goal}</h2><p>{combination.when}</p></div>
    <button className="combination-board-entry" onClick={openBoard}><LayersIcon/><span><strong>整套放入画板</strong><small>逐拍调整球路、跑位和标记</small></span><ChevronRightIcon/></button>
    <div className="combination-route" aria-label={`${combination.name}的比赛路径`}>
      <div className="combination-route-title"><strong>比赛路径</strong><span>先读信号，再进下一招</span></div>
      <ol>{combination.stages.map((stage,index)=>{const tactic=combinationExample(stage.tacticId,stage.excerpt);return <li key={`${stage.tacticId}-route`}><span>{index+1}</span><strong>{tactic.name}</strong></li>;})}</ol>
    </div>
    <div className="combination-section-title"><h2>按来球，一步步搭配</h2><p>每招可单独看球路，不必按固定拍数完成。</p></div>
    <ol className="combination-stages">{combination.stages.map((stage,index)=>{const tactic=combinationExample(stage.tacticId,stage.excerpt);return <li className="combination-stage" key={`${stage.tacticId}-${index}`}>
      <div className="combination-stage-top"><span>{String(index+1).padStart(2,"0")}</span><h3>{tactic.name}</h3></div>
      <div className="combination-cue"><strong>先执行</strong><p>{stage.cue}</p></div><div className="combination-transition"><strong>{index===combination.stages.length-1?"打完继续判断":"看到这个，再进下一招"}</strong><p>{stage.transition}</p></div>
      <button className="watch-example" onClick={()=>openExample(stage.tacticId,`${combination.name} · 阶段 ${index+1}`,stage.excerpt)} aria-label={`观看阶段 ${index+1}：${tactic.name}`}><PlayIcon/>看这一招的球路<ChevronRightIcon/></button>
    </li>;})}</ol>
    <div className="combination-section-title variant-title"><h2>对手变了，换一招</h2><p>出现下面的信号，就在当下调整。</p></div>
    <div className="combination-variants">{combination.variants.map((variant,index)=>{const open=variantOpen===index;return <section className="combination-variant" key={variant.name}>
      <button className="variant-trigger" aria-expanded={open} aria-controls={`variant-${combination.id}-${index}`} onClick={()=>setVariantOpen(open?null:index)}><span><strong>{variant.name}</strong><small>{variant.trigger}</small></span><ChevronDownIcon className={open?"is-open":""}/></button>
      <div className="variant-response" id={`variant-${combination.id}-${index}`} hidden={!open}><p>{variant.response}</p><button className="watch-example" onClick={()=>openExample(variant.tacticId,`${combination.name} · 应变：${variant.name}`,variant.excerpt)} aria-label={`观看衍生打法：${variant.name}`}><PlayIcon/>看对应打法<ChevronRightIcon/></button></div>
    </section>;})}</div>
    <p className="combination-note">先看来球深浅、自己的平衡和对手站位。条件不合适，就回到安全相持。</p>
  </div></MobileScroll>;
}
function TacticsList({ openTactic, openCombination, openBoardHome }: { openTactic: (tactic: Tactic, event: React.MouseEvent<HTMLButtonElement>) => void; openCombination:(combination:Combination)=>void; openBoardHome:()=>void }) {
  const [category, setCategory] = useState<CategoryFilter>("全部");
  const [mode,setMode]=useState<"tactics" | "combinations">("tactics");
  const visibleTactics = category === "全部" ? tactics : tactics.filter(tactic => tactic.category === category);
  const visibleCombinations = category === "全部" ? combinations : combinations.filter(combination=>combination.category===category);
  return <section className="tactic-catalogue" aria-label="青少年比赛战术">
      <button className="catalogue-board-entry" onClick={openBoardHome}><span><DrawingPinIcon/><strong>战术画板</strong><small>画球路 · 排拍次 · 带到训练场</small></span><ChevronRightIcon/></button>
      <div className="catalogue-modes" role="group" aria-label="查看单项或组合"><button aria-pressed={mode==="tactics"} className={mode==="tactics"?"is-selected":""} onClick={()=>setMode("tactics")}>单项战术 <span>{tactics.length}</span></button><button aria-pressed={mode==="combinations"} className={mode==="combinations"?"is-selected":""} onClick={()=>setMode("combinations")}>组合打法 <span>{combinations.length}</span></button></div>
      <Carousel className="category-carousel" contentClassName="category-track" ariaLabel="按比赛情境筛选">
        {categories.map(option => <button key={option} className={`category-chip ${category === option ? "is-selected" : ""}`} aria-pressed={category === option} onClick={() => setCategory(option)}>{option}</button>)}
      </Carousel>
      <div className="catalogue-count"><span>{mode==="combinations"?"组合＋衍生选择":category === "全部" ? "全部战术" : category}</span><span>{mode==="combinations"?`${visibleCombinations.length} 组搭配`: `${visibleTactics.length} 个战术`}</span></div>
      <MobileScroll className="tactic-list-screen" key={`${mode}-${category}`}>
      <main className="tactics-grid" aria-label={`${category}${mode==="tactics"?"战术":"组合"}列表`}>
        {mode==="combinations"?visibleCombinations.map((combination)=>{const isPractice=Boolean(interactiveRallies.find(item=>item.combinationId===combination.id)?.decisionPractice);return <button className={`tactic-card combo-card ${isPractice?"is-decision-practice":""}`} key={combination.id} onClick={()=>openCombination(combination)} aria-label={isPractice?`开始${combination.name}决策演练，在同一场上情境选择不同战术`:`开始${combination.name}互动对打，自动播放第一段，每段提供二到三个现场选择`}><div className="card-copy"><div className="combo-card-label">{isPractice?"新 · 同一情境决策演练":`${combination.series??combination.category} · 互动对打`}</div><h2>{combination.name}</h2><p className="card-purpose">{combination.goal}</p><div className="card-meta"><span>{isPractice?"先看来球／自己／对手":"自动播放首段"}</span><span>{isPractice?"选择后看收益与风险":"每段 2–3 个选择"}</span></div></div><ChevronRightIcon className="card-arrow"/></button>}):visibleTactics.map(tactic => {
          const meta = tacticMeta(tactic);
          return <button key={tactic.id} className="tactic-card" onClick={event => openTactic(tactic,event)} aria-label={`${tactic.name}，${tactic.duration}秒，${meta.category}，${meta.level}`}>
            <div className="card-picture" aria-hidden="true"><img src="/assets/tennis/tennis-ball.png" alt="" draggable={false}/><span>{String(tactics.indexOf(tactic)+1).padStart(2,"0")}</span></div>
            <div className="card-copy">{tactic.series&&<span className="card-series">{tactic.series}</span>}<h2>{tactic.name}</h2><p className="card-purpose">{meta.goal}</p><div className="card-meta"><span>{meta.category}</span><span>{meta.level}</span><span>{tactic.duration} 秒演示</span></div></div><ChevronRightIcon className="card-arrow"/>
          </button>;
        })}
      </main>
      </MobileScroll>
    </section>;
}

type BoardSaveState = "dirty" | "saving" | "saved" | "error";
type BoardHeaderState = { boardId:string; title:string; saveState:BoardSaveState; canUndo:boolean; canRedo:boolean };
type BoardActionName = "undo" | "redo" | "save" | "files" | "back";
const BOARD_HEADER_STATE_EVENT = "tennis-board-header-state";
const BOARD_ACTION_EVENT = "tennis-board-action";
const BOARD_DRAFTS_EVENT = "tennis-board-drafts-changed";

function emitBoardHeaderState(detail:BoardHeaderState) {
  window.dispatchEvent(new CustomEvent<BoardHeaderState>(BOARD_HEADER_STATE_EVENT,{detail}));
}

function sendBoardAction(boardId:string,action:BoardActionName) {
  window.dispatchEvent(new CustomEvent(BOARD_ACTION_EVENT,{detail:{boardId,action}}));
}

function BoardHeader({ boardId, initialTitle }:{boardId:string;initialTitle:string}) {
  const [state,setState]=useState<BoardHeaderState>({boardId,title:initialTitle,saveState:"dirty",canUndo:false,canRedo:false});
  useEffect(()=>{
    const update=(event:Event)=>{const detail=(event as CustomEvent<BoardHeaderState>).detail;if(detail.boardId===boardId)setState(detail);};
    window.addEventListener(BOARD_HEADER_STATE_EVENT,update);return()=>window.removeEventListener(BOARD_HEADER_STATE_EVENT,update);
  },[boardId]);
  const saveLabel=state.saveState==="saving"?"保存中":state.saveState==="saved"?"已保存":state.saveState==="error"?"未保存":"保存";
  return <div className="tennis-header board-header">
    <button className="header-back" aria-label="返回画板列表" onClick={()=>sendBoardAction(boardId,"back")}><ChevronLeftIcon/></button>
    <button className="board-header-title" aria-label={`打开${state.title}的文件选项`} onClick={()=>sendBoardAction(boardId,"files")}><strong>{state.title}</strong><ChevronDownIcon/></button>
    <div className="board-header-actions">
      <button aria-label="撤销" disabled={!state.canUndo} onClick={()=>sendBoardAction(boardId,"undo")}><CounterClockwiseClockIcon/></button>
      <button aria-label="重做" disabled={!state.canRedo} onClick={()=>sendBoardAction(boardId,"redo")}><UpdateIcon/></button>
      <button className={`board-save-status is-${state.saveState}`} aria-label={saveLabel} onClick={()=>sendBoardAction(boardId,"save")}><CheckCircledIcon/><span>{saveLabel}</span></button>
    </div>
  </div>;
}

function saveDownload(blob:Blob,name:string) {
  const url=URL.createObjectURL(blob),anchor=document.createElement("a");anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),0);
}

function safeFilename(title:string,extension:string) {
  return `${title.trim().replace(/[\\/:*?"<>|]+/g,"-").slice(0,48)||"tennis-board"}.${extension}`;
}

function withBoundedSuffix(value:string,suffix:string,maxLength:number,fallback:string) {
  let stem=value.trim().slice(0,Math.max(0,maxLength-suffix.length)).trimEnd();
  const lastCode=stem.charCodeAt(stem.length-1);
  if(lastCode>=0xd800&&lastCode<=0xdbff)stem=stem.slice(0,-1);
  return `${stem||fallback}${suffix}`.slice(0,maxLength);
}

function clampBoardPoint(point:BoardPoint):BoardPoint {
  return [
    Math.max(BOARD_COORDINATE_MIN,Math.min(BOARD_COORDINATE_MAX,point[0])),
    Math.max(BOARD_COORDINATE_MIN,Math.min(BOARD_COORDINATE_MAX,point[1])),
  ];
}

function curveControl(from:BoardPoint,to:BoardPoint):BoardPoint {
  return clampBoardPoint([
    ((from[0]+to[0])/2)+Math.max(-.12,Math.min(.12,(to[1]-from[1])*.16)),
    ((from[1]+to[1])/2)-Math.max(-.08,Math.min(.08,(to[0]-from[0])*.12)),
  ]);
}

function decorateDrillBoard(guide:DrillGuide) {
  const tactic=tactics.find(item=>item.id===guide.tacticId);
  let board=tactic?boardFromTactic(tactic):createBlankBoard(guide.title);
  board={...board,title:`${guide.title} · 训练画板`,drillId:guide.id};
  const frameIndex=0;
  board=addMark(board,frameIndex,{id:newBoardId("mark"),kind:"target",position:[.5,.18],size:[.46,.11],text:"目标区"});
  board=addMark(board,frameIndex,{id:newBoardId("mark"),kind:"cone",position:[.27,.24]});
  board=addMark(board,frameIndex,{id:newBoardId("mark"),kind:"cone",position:[.73,.24]});
  return board;
}

function BoardHome({ openBoard }:{openBoard:(board:BoardDocument)=>void}) {
  const [drafts,setDrafts]=useState<BoardDocument[]>([]),[storageError,setStorageError]=useState("");
  const importRef=useRef<HTMLInputElement>(null);
  const refresh=useCallback(()=>{const result=readBoards();if(result.ok){setDrafts(result.value);setStorageError("");}else setStorageError(result.error);},[]);
  useEffect(()=>{refresh();window.addEventListener(BOARD_DRAFTS_EVENT,refresh);return()=>window.removeEventListener(BOARD_DRAFTS_EVENT,refresh);},[refresh]);
  const removeDraft=(id:string)=>{const result=deleteBoard(id);if(result.ok)refresh();else setStorageError(result.error);};
  const importBoard=async(file:File|undefined)=>{
    if(!file)return;const parsed=parseBoardJSON(await file.text());
    if(!parsed.ok){setStorageError(parsed.error);return;}
    openBoard({...parsed.value,id:newBoardId(),title:withBoundedSuffix(parsed.value.title,"（导入）",120,"导入画板"),updatedAt:new Date().toISOString()});
  };
  return <MobileScroll className="board-home-scroll"><main className="board-home">
    <section className="board-home-hero"><span className="board-kicker"><DrawingPinIcon/> COURT CANVAS</span><h2>把想法画成下一拍</h2><p>拖动球员，画出球路和跑位，再按拍次连续播放。</p><div className="board-home-primary"><button onClick={()=>openBoard(createBlankBoard("我的空白战术"))}><PlusIcon/>新建纯空白画板</button><button aria-label="导入画板 JSON" onClick={()=>importRef.current?.click()}><UploadIcon/></button></div><input ref={importRef} className="board-hidden-file" hidden tabIndex={-1} aria-hidden="true" type="file" accept="application/json,.json" onChange={event=>{void importBoard(event.currentTarget.files?.[0]);event.currentTarget.value="";}}/></section>
    {storageError&&<p className="board-error" role="alert">{storageError}</p>}
    <section className="board-home-section"><div className="board-section-heading"><div><span>本机草稿</span><h3>继续上次的画板</h3></div><small>{drafts.length} 份</small></div>
      {drafts.length?<div className="board-draft-list">{drafts.map(board=><article key={board.id}><button className="board-draft-open" onClick={()=>openBoard(board)}><span className="board-draft-icon"><LayersIcon/></span><span><strong>{board.title}</strong><small>{board.frames.length} 拍 · {new Date(board.updatedAt).toLocaleDateString("zh-CN",{month:"numeric",day:"numeric"})}</small></span><ChevronRightIcon/></button><button className="board-draft-delete" aria-label={`删除${board.title}`} onClick={()=>removeDraft(board.id)}><TrashIcon/></button></article>)}</div>:<div className="board-empty"><FilePlusIcon/><p>还没有本机草稿。新建后会自动保存在这台设备。</p></div>}
    </section>
    <section className="board-home-section"><div className="board-section-heading"><div><span>带到训练场</span><h3>从完整练习路线开始</h3></div><small>3 条</small></div><div className="drill-card-list">{BOARD_DRILLS.map((guide,index)=><button key={guide.id} onClick={()=>openBoard(decorateDrillBoard(guide))}><span className="drill-card-number">0{index+1}</span><span><strong>{guide.title}</strong><small>{guide.goal}</small><b>4 阶段 · 逐步加难</b></span><ChevronRightIcon/></button>)}</div></section>
    <p className="board-home-note">画板用于沟通站位和选择，不替代教练对球速、场地与安全的现场判断。</p>
  </main></MobileScroll>;
}

type BoardTool = "select" | "actor" | "shot" | "move" | "mark";
type ActorPreset = "me" | "opponent" | "ball";
type MarkPreset = BoardMark["kind"];
type BoardDrag = {
  pointerId:number;
  base:BoardDocument;
  kind:"actor"|"mark"|"handle"|"path"|"freehand";
  id:string;
  handle?:"from"|"to"|"control";
  points?:BoardPoint[];
  startClient:BoardPoint;
  offset?:BoardPoint;
  moved:boolean;
  selectionBefore:BoardSelection|null;
  path?:{kind:"shot"|"feed"|"move";actorId:string;from:BoardPoint};
};

function BoardCanvas({board,frameIndex,selection,setSelection,tool,actorPreset,pathKind,markPreset,curved,previewing,elapsed,preview,commit,finishPreview,onComplete,onNudge,onDelete,onError}:{
  board:BoardDocument;
  frameIndex:number;
  selection:BoardSelection|null;
  setSelection:(selection:BoardSelection|null)=>void;
  tool:BoardTool;
  actorPreset:ActorPreset;
  pathKind:"shot"|"feed";
  markPreset:MarkPreset;
  curved:boolean;
  previewing:boolean;
  elapsed:number;
  preview:(next:BoardDocument)=>void;
  commit:(next:BoardDocument)=>void;
  finishPreview:(base:BoardDocument,cancel?:boolean)=>void;
  onComplete:(selection:BoardSelection)=>void;
  onNudge:(dx:number,dy:number)=>void;
  onDelete:()=>void;
  onError:(message:string)=>void;
}) {
  const holderRef=useRef<HTMLDivElement>(null),canvasRef=useRef<HTMLCanvasElement>(null),drawRef=useRef<()=>void>(()=>{}),dragRef=useRef<BoardDrag|null>(null);
  const latest=useRef({board,frameIndex,selection,previewing,elapsed});latest.current={board,frameIndex,selection,previewing,elapsed};
  useEffect(()=>{
    const canvas=canvasRef.current,holder=holderRef.current;if(!canvas||!holder)return;
    const draw=()=>{
      const current=latest.current,width=holder.clientWidth,height=holder.clientHeight,dpr=Math.min(window.devicePixelRatio||1,3);
      if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
      const ctx=canvas.getContext("2d");if(!ctx)return;ctx.setTransform(dpr,0,0,dpr,0,0);
      const pose=current.previewing?getBoardPose(current.board,current.elapsed):null;
      const targetIndex=pose?.frameIndex??current.frameIndex,frame=current.board.frames[targetIndex];if(!frame)return;
      renderBoard(ctx,width,height,frame,current.board.actors,{progress:pose?.progress??0,playing:current.previewing,selection:current.selection,showLegend:true});
    };
    drawRef.current=draw;const resize=new ResizeObserver(draw);resize.observe(holder);draw();return()=>resize.disconnect();
  },[]);
  useEffect(()=>drawRef.current(),[board,frameIndex,selection,previewing,elapsed]);

  const toCanvasPoint=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const target=event.currentTarget,bounds=target.getBoundingClientRect();
    return [(event.clientX-bounds.left)*target.clientWidth/Math.max(1,bounds.width),(event.clientY-bounds.top)*target.clientHeight/Math.max(1,bounds.height)] as BoardPoint;
  };
  const toBoardPoint=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const target=event.currentTarget,geometry=getBoardGeometry(target.clientWidth,target.clientHeight);
    return geometry.clampPoint(geometry.fromCanvas(toCanvasPoint(event)));
  };
  const chooseActor=(kind:"shot"|"feed"|"move",hit:BoardHit|null)=>{
    const needsBall=kind!=="move";
    if(hit?.kind==="actor"){
      const hitActor=board.actors.find(actor=>actor.id===hit.id);
      if(hitActor&&(needsBall?hitActor.kind==="ball":hitActor.kind==="player"))return hitActor;
    }
    const selected=selection?.kind==="actor"?board.actors.find(actor=>actor.id===selection.id):undefined;
    if(selected&&(needsBall?selected.kind==="ball":selected.kind==="player"))return selected;
    const compatible=board.actors.filter(actor=>actor.kind===(needsBall?"ball":"player"));
    return compatible.length===1?compatible[0]:undefined;
  };
  const actorFromPreset=(preset:ActorPreset):BoardActor=>preset==="ball"
    ?{id:newBoardId("ball"),label:"网球",kind:"ball",color:"#d8ef72"}
    :preset==="me"?{id:newBoardId("player"),label:"我方",kind:"player",color:"#3e8ad6"}:{id:newBoardId("player"),label:"对手",kind:"player",color:"#dc4151"};
  const markFromPreset=(preset:MarkPreset,point:BoardPoint):BoardMark=>({id:newBoardId("mark"),kind:preset,position:point,...(preset==="target"?{size:[.34,.1] as BoardPoint,text:"目标区"}:preset==="text"?{text:"提示"}:{})});

  const onPointerDown=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(previewing||(event.pointerType==="mouse"&&event.button!==0))return;
    const frame=board.frames[frameIndex];if(!frame)return;
    const point=toBoardPoint(event),pixel=toCanvasPoint(event);
    try{
      const hit=hitTestBoard(pixel,event.currentTarget.clientWidth,event.currentTarget.clientHeight,frame,board.actors,selection);
      if(hit?.kind==="handle"){
        const path=frame.paths.find(item=>item.id===hit.id),handlePoint=path?.[hit.handle];
        if(!handlePoint)return;
        dragRef.current={pointerId:event.pointerId,base:board,kind:"handle",id:hit.id,handle:hit.handle,startClient:[event.clientX,event.clientY],offset:[handlePoint[0]-point[0],handlePoint[1]-point[1]],moved:false,selectionBefore:selection};
        setSelection({kind:"element",id:hit.id});event.currentTarget.setPointerCapture(event.pointerId);return;
      }
      if(tool==="actor"){
        const actor=actorFromPreset(actorPreset),next=addActor(board,actor,point),nextSelection={kind:"actor",id:actor.id} as const;commit(next);onComplete(nextSelection);return;
      }
      if(tool==="mark"){
        const mark=markFromPreset(markPreset,point);
        if(markPreset!=="freehand"){const nextSelection={kind:"element",id:mark.id} as const;commit(addMark(board,frameIndex,mark));onComplete(nextSelection);return;}
        dragRef.current={pointerId:event.pointerId,base:board,kind:"freehand",id:mark.id,points:[point],startClient:[event.clientX,event.clientY],moved:false,selectionBefore:selection};event.currentTarget.setPointerCapture(event.pointerId);return;
      }
      if(tool==="shot"||tool==="move"){
        const kind=tool==="move"?"move":pathKind,actor=chooseActor(kind,hit);if(!actor){onError(kind==="move"?"请先点选要跑位的球员":"请先点选要击球的网球");return;}
        const from=frame.poses[actor.id];if(!from){onError("这个角色在当前拍次没有站位");return;}
        const id=newBoardId("path");
        dragRef.current={pointerId:event.pointerId,base:board,kind:"path",id,startClient:[event.clientX,event.clientY],moved:false,selectionBefore:selection,path:{kind,actorId:actor.id,from}};event.currentTarget.setPointerCapture(event.pointerId);return;
      }
      if(!hit){setSelection(null);return;}
      if(hit.kind==="actor"){
        const pose=frame.poses[hit.id];if(!pose)return;
        dragRef.current={pointerId:event.pointerId,base:board,kind:"actor",id:hit.id,startClient:[event.clientX,event.clientY],offset:[pose[0]-point[0],pose[1]-point[1]],moved:false,selectionBefore:selection};
      }
      else {
        const mark=frame.marks.find(item=>item.id===hit.id);
        if(mark)dragRef.current={pointerId:event.pointerId,base:board,kind:"mark",id:hit.id,startClient:[event.clientX,event.clientY],offset:[mark.position[0]-point[0],mark.position[1]-point[1]],moved:false,selectionBefore:selection};
      }
      setSelection(hit);event.currentTarget.setPointerCapture(event.pointerId);
    }catch(error){onError(error instanceof Error?error.message:"画板操作失败");}
  };
  const onPointerMove=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const drag=dragRef.current;if(!drag||drag.pointerId!==event.pointerId)return;const point=toBoardPoint(event),pixel=toCanvasPoint(event);
    if(!drag.moved&&Math.hypot(event.clientX-drag.startClient[0],event.clientY-drag.startClient[1])<5)return;
    drag.moved=true;
    const withOffset=(value:BoardPoint):BoardPoint=>clampBoardPoint([value[0]+(drag.offset?.[0]??0),value[1]+(drag.offset?.[1]??0)]);
    try{
      if(drag.kind==="actor")preview(moveActor(drag.base,frameIndex,drag.id,withOffset(point)));
      else if(drag.kind==="mark")preview(updateMark(drag.base,frameIndex,drag.id,{position:withOffset(point)}));
      else if(drag.kind==="handle")preview(updatePath(drag.base,frameIndex,drag.id,{[drag.handle!]:withOffset(point)}));
      else if(drag.kind==="path"){
        const path=drag.path;if(path){const control=curved?curveControl(path.from,point):undefined;preview(setPath(drag.base,frameIndex,{id:drag.id,kind:path.kind,actorId:path.actorId,from:path.from,to:point,...(control?{control}:{})}));setSelection({kind:"element",id:drag.id});}
      }else if(drag.kind==="freehand"){
        const points=[...(drag.points??[]),point];drag.points=points;const mark=markFromPreset("freehand",points[0]);mark.id=drag.id;mark.points=points;preview(addMark(drag.base,frameIndex,mark));
        setSelection({kind:"element",id:drag.id});
      }
    }catch(error){onError(error instanceof Error?error.message:"无法拖动画板元素");}
  };
  const endPointer=(event:ReactPointerEvent<HTMLDivElement>,cancel=false)=>{
    const drag=dragRef.current;if(!drag||drag.pointerId!==event.pointerId)return;dragRef.current=null;
    try{event.currentTarget.releasePointerCapture(event.pointerId);}catch{/* pointer may already be released */}
    if(cancel){finishPreview(drag.base,true);setSelection(drag.selectionBefore);return;}
    if(!drag.moved)return;
    finishPreview(drag.base);
    onComplete({kind:drag.kind==="actor"?"actor":"element",id:drag.id});
  };
  const onKeyDown=(event:React.KeyboardEvent<HTMLDivElement>)=>{
    if(previewing||!selection)return;
    const step=event.shiftKey?.05:.02;
    const delta:Partial<Record<string,BoardPoint>>={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]};
    if(delta[event.key]){event.preventDefault();onNudge(...delta[event.key]!);}
    else if(event.key==="Delete"||event.key==="Backspace"){event.preventDefault();onDelete();}
  };
  return <div ref={holderRef} className="board-canvas" data-testid="board-canvas" data-scroll-drag="ignore" tabIndex={0} role="application" aria-label="可编辑网球战术画板。使用下方工具添加或选择对象；选中后可用方向键微调，Delete 键删除。" onKeyDown={onKeyDown} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={event=>endPointer(event)} onPointerCancel={event=>endPointer(event,true)}><canvas ref={canvasRef}/></div>;
}

function BoardEditor({ initialBoard, back, openLibrary }:{initialBoard:BoardDocument;back:()=>void;openLibrary:()=>void}) {
  const keyboard=useKeyboard();
  const [board,setBoardState]=useState(initialBoard),[frameIndex,setFrameIndex]=useState(0),[selection,setSelection]=useState<BoardSelection|null>(null),[committedRevision,setCommittedRevision]=useState(0);
  const [past,setPast]=useState<BoardDocument[]>([]),[future,setFuture]=useState<BoardDocument[]>([]),[saveState,setSaveState]=useState<BoardSaveState>("dirty"),[error,setError]=useState("");
  const [tool,setTool]=useState<BoardTool>("select"),[actorPreset,setActorPreset]=useState<ActorPreset>("me"),[pathKind,setPathKind]=useState<"shot"|"feed">("shot"),[markPreset,setMarkPreset]=useState<MarkPreset>("target"),[curved,setCurved]=useState(true);
  const [viewMode,setViewMode]=useState<"edit"|"preview">("edit"),[isPlaying,setIsPlaying]=useState(false),[elapsed,setElapsed]=useState(0),[speed,setSpeed]=useState(1);
  const [filesOpen,setFilesOpen]=useState(false),[frameOpen,setFrameOpen]=useState(false),[objectsOpen,setObjectsOpen]=useState(false),[drillOpen,setDrillOpen]=useState(false),[objectOpen,setObjectOpen]=useState(false),[addOpen,setAddOpen]=useState(false);
  const [titleDraft,setTitleDraft]=useState(board.title),[frameLabel,setFrameLabel]=useState(board.frames[0]?.label??""),[frameDuration,setFrameDuration]=useState(String(board.frames[0]?.duration??1.5)),[textDraft,setTextDraft]=useState("");
  const editorRef=useRef<HTMLDivElement>(null),importRef=useRef<HTMLInputElement>(null),boardRef=useRef(board),committedBoardRef=useRef(board),needsSaveRef=useRef(true);boardRef.current=board;
  const totalDuration=getBoardDuration(board),frame=board.frames[frameIndex]??board.frames[0];
  const selectedActor=selection?.kind==="actor"?board.actors.find(actor=>actor.id===selection.id):undefined;
  const selectedPath=selection?.kind==="element"?frame?.paths.find(path=>path.id===selection.id):undefined;
  const selectedMark=selection?.kind==="element"?frame?.marks.find(mark=>mark.id===selection.id):undefined;
  const drill=BOARD_DRILLS.find(item=>item.id===board.drillId)??getDrillForTactic(board.sourceTacticId);
  const setSheetVisibility=useCallback((setter:(open:boolean)=>void,nextOpen:boolean)=>{if(!nextOpen)keyboard.hide();setter(nextOpen);},[keyboard]);

  const setBoard=useCallback((next:BoardDocument)=>{boardRef.current=next;setBoardState(next);},[]);
  const markCommitted=useCallback((next:BoardDocument)=>{committedBoardRef.current=next;needsSaveRef.current=true;setBoard(next);setCommittedRevision(value=>value+1);},[setBoard]);
  const resetTransientEditorState=useCallback((next:BoardDocument)=>{setFrameIndex(index=>Math.max(0,Math.min(index,next.frames.length-1)));setSelection(null);setViewMode("edit");setIsPlaying(false);setElapsed(0);setObjectOpen(false);},[]);
  const commit=useCallback((next:BoardDocument)=>{const current=committedBoardRef.current;if(next===current)return;setPast(items=>[...items,current].slice(-50));setFuture([]);markCommitted(next);setSaveState("dirty");setError("");},[markCommitted]);
  const preview=useCallback((next:BoardDocument)=>setBoard(next),[setBoard]);
  const finishPreview=useCallback((base:BoardDocument,cancel=false)=>{if(cancel){setBoard(committedBoardRef.current);return;}const current=boardRef.current;if(current===base)return;const previous=committedBoardRef.current;setPast(items=>[...items,previous].slice(-50));setFuture([]);markCommitted(current);setSaveState("dirty");setError("");},[markCommitted,setBoard]);
  const undo=useCallback(()=>{const previous=past[past.length-1];if(!previous)return;const current=committedBoardRef.current;setPast(past.slice(0,-1));setFuture(items=>[current,...items].slice(0,50));markCommitted(previous);resetTransientEditorState(previous);setSaveState("dirty");},[markCommitted,past,resetTransientEditorState]);
  const redo=useCallback(()=>{const next=future[0];if(!next)return;const current=committedBoardRef.current;setFuture(future.slice(1));setPast(items=>[...items,current].slice(-50));markCommitted(next);resetTransientEditorState(next);setSaveState("dirty");},[future,markCommitted,resetTransientEditorState]);
  const saveNow=useCallback(()=>{setSaveState("saving");const candidate=committedBoardRef.current,result=saveBoard(candidate);if(result.ok){const showingCommitted=boardRef.current===candidate;committedBoardRef.current=result.value;needsSaveRef.current=false;if(showingCommitted)setBoard(result.value);setSaveState("saved");setError("");window.dispatchEvent(new Event(BOARD_DRAFTS_EVENT));}else{setSaveState("error");setError(result.error);}return result;},[setBoard]);

  useEffect(()=>{if(saveState!=="dirty")return;const timer=window.setTimeout(saveNow,700);return()=>window.clearTimeout(timer);},[committedRevision,saveNow,saveState]);
  useEffect(()=>{const flush=()=>{if(!needsSaveRef.current)return;const result=saveBoard(committedBoardRef.current);if(result.ok){committedBoardRef.current=result.value;needsSaveRef.current=false;window.dispatchEvent(new Event(BOARD_DRAFTS_EVENT));}};window.addEventListener("pagehide",flush);return()=>{window.removeEventListener("pagehide",flush);flush();};},[]);
  useEffect(()=>emitBoardHeaderState({boardId:initialBoard.id,title:board.title,saveState,canUndo:past.length>0,canRedo:future.length>0}),[board.title,future.length,initialBoard.id,past.length,saveState]);
  useEffect(()=>{
    const act=(event:Event)=>{const detail=(event as CustomEvent<{boardId:string;action:BoardActionName}>).detail;if(detail.boardId!==initialBoard.id||editorRef.current?.closest<HTMLElement>(".flow-screen")?.dataset.flowCurrent!=="true")return;if(detail.action==="undo")undo();else if(detail.action==="redo")redo();else if(detail.action==="save")saveNow();else if(detail.action==="back"){const result=saveNow();if(result.ok)back();}else setFilesOpen(true);};
    window.addEventListener(BOARD_ACTION_EVENT,act);return()=>window.removeEventListener(BOARD_ACTION_EVENT,act);
  },[back,initialBoard.id,redo,saveNow,undo]);
  useEffect(()=>{if(!isPlaying)return;let request=0,last=performance.now();const tick=(now:number)=>{const delta=Math.min((now-last)/1000,.1)*speed;last=now;setElapsed(value=>Math.min(totalDuration,value+delta));request=requestAnimationFrame(tick);};request=requestAnimationFrame(tick);return()=>cancelAnimationFrame(request);},[isPlaying,speed,totalDuration]);
  useEffect(()=>{if(isPlaying&&elapsed>=totalDuration)setIsPlaying(false);},[elapsed,isPlaying,totalDuration]);
  useEffect(()=>{setSelection(null);setFrameLabel(frame?.label??"");setFrameDuration(String(frame?.duration??0));},[frame?.id]);

  const deleteSelection=()=>{
    if(!selection)return;let next=board;
    if(selection.kind==="actor")next=deleteActor(board,selection.id);
    else if(selectedPath)next=deletePath(board,frameIndex,selection.id);
    else if(selectedMark)next=deleteMark(board,frameIndex,selection.id);
    commit(next);setSelection(null);setObjectOpen(false);keyboard.hide();
  };
  const nudge=(dx:number,dy:number)=>{
    const clamp=(point:BoardPoint):BoardPoint=>clampBoardPoint([point[0]+dx,point[1]+dy]);
    if(selectedActor&&frame.poses[selectedActor.id])commit(moveActor(board,frameIndex,selectedActor.id,clamp(frame.poses[selectedActor.id])));
    else if(selectedMark)commit(updateMark(board,frameIndex,selectedMark.id,{position:clamp(selectedMark.position)}));
    else if(selectedPath)commit(updatePath(board,frameIndex,selectedPath.id,{to:clamp(selectedPath.to)}));
  };
  const addNextFrame=(duplicate=false)=>{try{const next=addFrame(board,frameIndex,duplicate);commit(next);setFrameIndex(frameIndex+1);setSelection(null);}catch(reason){setError(reason instanceof Error?reason.message:"无法添加拍次");}};
  const applyFrame=()=>{const duration=Number(frameDuration);try{commit(updateFrame(board,frameIndex,{label:frameLabel,duration}));setFrameOpen(false);keyboard.hide();}catch(reason){setError(reason instanceof Error?reason.message:"无法更新拍次");}};
  const deleteCurrentFrame=()=>{const next=deleteFrame(board,frameIndex);commit(next);setFrameIndex(Math.max(0,Math.min(frameIndex,next.frames.length-1)));setFrameOpen(false);keyboard.hide();};
  const openFrameSheet=()=>{setFrameLabel(frame.label);setFrameDuration(String(frame.duration));setFrameOpen(true);};
  const frameStart=(index:number)=>board.frames.slice(0,index).reduce((sum,item)=>sum+item.duration,0);
  const nextPlaybackFrame=()=>{const pose=getBoardPose(board,elapsed),next=Math.min(board.frames.length-1,pose.frameIndex+1);setElapsed(frameStart(next));setIsPlaying(false);};
  const previousPlaybackFrame=()=>{const pose=getBoardPose(board,elapsed),terminal=pose.frameIndex===board.frames.length-1&&board.frames[pose.frameIndex]?.duration===0&&elapsed>=totalDuration;const previous=terminal||pose.progress<.08?Math.max(0,pose.frameIndex-1):pose.frameIndex;setElapsed(frameStart(previous));setIsPlaying(false);};
  const startPlayback=()=>{setTool("select");setSelection(null);setElapsed(0);setViewMode("preview");setIsPlaying(true);};
  const applyRename=()=>{try{commit(renameBoard(board,titleDraft));keyboard.hide();}catch(reason){setError(reason instanceof Error?reason.message:"无法重命名");}};
  const duplicateDraft=()=>{const copy=cloneBoard(board);const result=saveBoard(copy);if(result.ok){setError(`已保存副本「${result.value.title}」`);window.dispatchEvent(new Event(BOARD_DRAFTS_EVENT));}else setError(result.error);};
  const exportJson=()=>saveDownload(new Blob([JSON.stringify(board,null,2)],{type:"application/json"}),safeFilename(board.title,"json"));
  const exportPng=async()=>{try{saveDownload(await exportBoardPng(board,frameIndex),safeFilename(`${board.title}-第${frameIndex+1}拍`,"png"));}catch(reason){setError(reason instanceof Error?reason.message:"无法导出图片");}};
  const importJson=async(file:File|undefined)=>{if(!file)return;const parsed=parseBoardJSON(await file.text());if(!parsed.ok){setError(parsed.error);return;}const imported={...parsed.value,id:initialBoard.id,updatedAt:new Date().toISOString()};commit(imported);setTitleDraft(imported.title);setFrameIndex(0);setFrameLabel(imported.frames[0]?.label??"");setFrameDuration(String(imported.frames[0]?.duration??0));setSelection(null);setViewMode("edit");setIsPlaying(false);setElapsed(0);setTool("select");setFilesOpen(false);keyboard.hide();};
  const chooseTool=(next:BoardTool)=>{
    setTool(next);setViewMode("edit");setIsPlaying(false);
    const selected=selection?.kind==="actor"?board.actors.find(actor=>actor.id===selection.id):undefined;
    const canCarryActor=(next==="shot"&&selected?.kind==="ball")||(next==="move"&&selected?.kind==="player");
    if(next!=="select"&&!canCarryActor)setSelection(null);
  };
  const openSelectedObject=()=>{if(!selection)return;setTextDraft(selectedMark?.text??selectedActor?.label??"");setObjectOpen(true);};
  const toggleCurve=()=>{if(selectedPath){const midpoint=(selectedPath.from[0]+selectedPath.to[0])/2;const control=selectedPath.control?undefined:[Math.max(-.15,Math.min(1.15,midpoint+.16)),(selectedPath.from[1]+selectedPath.to[1])/2] as BoardPoint;commit(updatePath(board,frameIndex,selectedPath.id,{control}));}else setCurved(value=>!value);};
  const resizeTarget=(scale:number)=>{if(selectedMark?.kind!=="target")return;const size=selectedMark.size??[.28,.12];commit(updateMark(board,frameIndex,selectedMark.id,{size:[Math.max(.08,Math.min(.8,size[0]*scale)),Math.max(.04,Math.min(.5,size[1]*scale))]}));};
  const applyObjectText=()=>{if(selectedMark&&(selectedMark.kind==="text"||selectedMark.kind==="target")){commit(updateMark(board,frameIndex,selectedMark.id,{text:textDraft.trim()||undefined}));setObjectOpen(false);keyboard.hide();}};
  const completeCanvasAction=(nextSelection:BoardSelection)=>{setSelection(nextSelection);setTool("select");};
  const chooseAdd=(next:BoardTool,preset?:ActorPreset|MarkPreset)=>{if(next==="actor"&&preset)setActorPreset(preset as ActorPreset);if(next==="mark"&&preset)setMarkPreset(preset as MarkPreset);chooseTool(next);setAddOpen(false);};

  const previewing=viewMode==="preview",activePose=previewing?getBoardPose(board,elapsed):null,currentPlaybackFrame=activePose?.frameIndex??frameIndex;
  const selectedLabel=selectedActor?.label??(selectedPath?selectedPath.kind==="move"?"跑位路线":selectedPath.kind==="feed"?"喂球路线":"击球路线":selectedMark?selectedMark.kind==="target"?"目标区":selectedMark.kind==="cone"?"标志碟":selectedMark.kind==="basket"?"球篮":selectedMark.kind==="text"?"文字提示":"手绘线":"");
  return <div ref={editorRef} className={`board-editor ${previewing?"is-previewing":"is-editing"}`}>
    <div className="board-canvas-shell">
      <div className="board-canvas-meta"><span>{previewing?`预览 · 第 ${currentPlaybackFrame+1} 拍`:`第 ${frameIndex+1} 拍`}</span><strong>{board.frames[currentPlaybackFrame]?.label}</strong>{drill&&<button onClick={()=>{setIsPlaying(false);setDrillOpen(true);}}><TargetIcon/>练到场上</button>}</div>
      <BoardCanvas board={board} frameIndex={frameIndex} selection={selection} setSelection={setSelection} tool={tool} actorPreset={actorPreset} pathKind={pathKind} markPreset={markPreset} curved={curved} previewing={previewing} elapsed={elapsed} preview={preview} commit={commit} finishPreview={finishPreview} onComplete={completeCanvasAction} onNudge={nudge} onDelete={deleteSelection} onError={setError}/>
      {error&&<button className="board-toast" onClick={()=>setError("")} aria-label="关闭提示"><span>{error}</span><Cross2Icon/></button>}
    </div>
    {previewing?<div className="board-playback-dock">
      <div className="board-playback-progress"><span>{elapsed.toFixed(1)}s</span><input type="range" aria-label="画板播放进度" min="0" max={Math.max(.01,totalDuration)} step=".01" value={elapsed} onChange={event=>{setIsPlaying(false);setElapsed(Number(event.currentTarget.value));}}/><span>{totalDuration.toFixed(1)}s</span></div>
      <div className="board-playback-actions"><button onClick={previousPlaybackFrame}><TrackPreviousIcon/><span>上一拍</span></button><button className="board-play-toggle" onClick={()=>{if(isPlaying){setIsPlaying(false);return;}if(elapsed>=totalDuration)setElapsed(0);setIsPlaying(true);}}>{isPlaying?<PauseIcon/>:<PlayIcon/>}<span>{isPlaying?"暂停":elapsed>=totalDuration?"重播":"继续"}</span></button><button onClick={nextPlaybackFrame}><TrackNextIcon/><span>下一拍</span></button><button onClick={()=>setSpeed(value=>value===1?.5:value===.5?.25:1)}><LapTimerIcon/><span>{speed}×</span></button></div>
      <button className="board-return-edit" onClick={()=>{setIsPlaying(false);const pose=getBoardPose(board,elapsed);setFrameIndex(pose.frameIndex);setViewMode("edit");setElapsed(0);}}>完成 · 回到编辑</button>
    </div>:<>
      <div className="board-frame-rail"><Carousel className="board-frame-carousel" contentClassName="board-frame-track" ariaLabel="战术拍次">{board.frames.map((item,index)=><button key={item.id} className={index===frameIndex?"is-active":""} aria-pressed={index===frameIndex} onClick={()=>{setFrameIndex(index);setSelection(null);setTool("select");}}><span>{index+1}</span><strong>{item.label}</strong></button>)}</Carousel><button className="board-frame-menu" aria-label="编辑当前拍次" onClick={openFrameSheet}><Pencil2Icon/></button><button className="board-add-frame" aria-label="＋新增一拍" onClick={()=>addNextFrame(false)}><PlusIcon/><span>新增一拍</span></button></div>
      <div className="board-command-slot" role="toolbar" aria-label={selection?`已选中${selectedLabel}`:"画板操作"}>
        {tool!=="select"?<><div className="board-command-copy"><strong>{tool==="actor"?`点球场放置${actorPreset==="me"?"我方":actorPreset==="opponent"?"对手":"网球"}`:tool==="mark"?"点球场放置标记":`从${tool==="move"?"球员":"网球"}拖到终点`}</strong><small>{tool==="shot"&&pathKind==="feed"?"喂球路线":curved?"当前为曲线":"当前为直线"}</small></div>{(tool==="shot"||tool==="move")&&<button className={curved?"is-active":""} onClick={()=>setCurved(value=>!value)}>{curved?"曲线":"直线"}</button>}<button onClick={()=>chooseTool("select")}>取消</button></>:
        selectedActor?<><strong className="board-selection-name" aria-live="polite">{selectedLabel}</strong><button className="board-command-primary" onClick={()=>{if(selectedActor.kind==="ball"){setPathKind("shot");chooseTool("shot");}else chooseTool("move");}}>{selectedActor.kind==="ball"?<ResumeIcon/>:<MoveIcon/>}{selectedActor.kind==="ball"?"画球路":"画跑位"}</button><button onClick={openSelectedObject}>更多</button><button className="is-danger" aria-label="删除所选对象" onClick={deleteSelection}><TrashIcon/></button></>:
        selectedPath?<><div className="board-command-copy"><strong className="board-selection-name" aria-live="polite">{selectedLabel}</strong><small>拖白色控制点微调路线</small></div><button onClick={toggleCurve}>{selectedPath.control?"拉直":"变曲线"}</button><button onClick={openSelectedObject}>更多</button><button className="is-danger" aria-label="删除所选对象" onClick={deleteSelection}><TrashIcon/></button></>:
        selectedMark?<><strong className="board-selection-name" aria-live="polite">{selectedLabel}</strong><button className="board-command-primary" onClick={openSelectedObject}>调整标记</button><button className="is-danger" aria-label="删除所选对象" onClick={deleteSelection}><TrashIcon/></button></>:
        <div className="board-command-copy"><strong>点选场上对象开始</strong><small>拖中心移动；选中后画球路或跑位</small></div>}
      </div>
      <nav className="board-main-actions" aria-label="画板主要操作"><button onClick={()=>setObjectsOpen(true)}><LayersIcon/><span>对象</span></button><button onClick={()=>setAddOpen(true)}><PlusIcon/><span>添加</span></button><button className="board-primary-play" disabled={totalDuration<=0} onClick={startPlayback}><PlayIcon/><span>播放</span><small>{board.frames.length} 拍 · {totalDuration.toFixed(1)} 秒</small></button></nav>
    </>}

    <BottomSheet open={addOpen} onOpenChange={open=>setSheetVisibility(setAddOpen,open)} title="添加到球场" description="选一种对象，再点球场放置；喂球和标记收在这里。" snap={.78}><div className="board-sheet"><div className="board-file-actions">
      <button onClick={()=>chooseAdd("actor","me")}><PersonIcon/><span><strong>我方球员</strong><small>点球场放置</small></span></button><button onClick={()=>chooseAdd("actor","opponent")}><PersonIcon/><span><strong>对手球员</strong><small>点球场放置</small></span></button><button onClick={()=>chooseAdd("actor","ball")}><ComponentInstanceIcon/><span><strong>网球</strong><small>点球场放置</small></span></button><button onClick={()=>{setPathKind("feed");chooseTool("shot");setAddOpen(false);}}><ResumeIcon/><span><strong>画喂球路线</strong><small>从网球拖到落点</small></span></button>
      <button onClick={()=>chooseAdd("mark","target")}><TargetIcon/><span><strong>目标区</strong><small>落点范围</small></span></button><button onClick={()=>chooseAdd("mark","cone")}><DrawingPinIcon/><span><strong>标志碟</strong><small>场上器材</small></span></button><button onClick={()=>chooseAdd("mark","basket")}><ArchiveIcon/><span><strong>球篮</strong><small>喂球位置</small></span></button><button onClick={()=>chooseAdd("mark","text")}><TextIcon/><span><strong>文字提示</strong><small>教练口令</small></span></button><button onClick={()=>chooseAdd("mark","freehand")}><Pencil2Icon/><span><strong>手绘线</strong><small>拖动画线</small></span></button>
    </div></div></BottomSheet>
    <BottomSheet open={filesOpen} onOpenChange={open=>setSheetVisibility(setFilesOpen,open)} title="画板文件" description="保存在本机，也可带走 PNG 或完整 JSON。" snap={.78}><div className="board-sheet">
      <label className="board-field"><span>画板名称</span><KeyboardInput value={titleDraft} maxLength={60} onChange={event=>setTitleDraft(event.currentTarget.value)}/></label><button className="sheet-done" onClick={applyRename}>更新名称</button>
      <div className="board-file-actions"><button onClick={saveNow}><CheckCircledIcon/><span><strong>立即保存</strong><small>写入这台设备</small></span></button><button onClick={duplicateDraft}><CopyIcon/><span><strong>保存副本</strong><small>保留独立草稿</small></span></button><button onClick={()=>void exportPng()}><DownloadIcon/><span><strong>当前拍 PNG</strong><small>不含控制柄</small></span></button><button onClick={exportJson}><ArchiveIcon/><span><strong>完整 JSON</strong><small>可继续编辑</small></span></button><button onClick={()=>importRef.current?.click()}><UploadIcon/><span><strong>导入 JSON</strong><small>替换当前内容</small></span></button><button onClick={()=>{const result=saveNow();if(result.ok){keyboard.hide();setFilesOpen(false);openLibrary();}}}><LayersIcon/><span><strong>草稿与模板</strong><small>也可新建纯空白</small></span></button></div>
      <input ref={importRef} className="board-hidden-file" hidden tabIndex={-1} aria-hidden="true" type="file" accept="application/json,.json" onChange={event=>{void importJson(event.currentTarget.files?.[0]);event.currentTarget.value="";}}/>
      {saveState==="error"&&<p className="board-export-warning">本机保存失败。请先导出 JSON，避免丢失本次编辑。</p>}
    </div></BottomSheet>
    <BottomSheet open={frameOpen} onOpenChange={open=>setSheetVisibility(setFrameOpen,open)} title={`第 ${frameIndex+1} 拍`} description="每拍是一段同步球路与跑位。" snap={.66}><div className="board-sheet"><label className="board-field"><span>拍次口令</span><KeyboardInput value={frameLabel} maxLength={42} onChange={event=>setFrameLabel(event.currentTarget.value)}/></label><label className="board-field"><span>时长（秒）</span><KeyboardInput inputMode="decimal" value={frameDuration} onChange={event=>setFrameDuration(event.currentTarget.value)}/></label><button className="sheet-done" onClick={applyFrame}>完成</button><div className="board-sheet-row"><button onClick={()=>{addNextFrame(true);setFrameOpen(false);keyboard.hide();}}><CopyIcon/>沿用布置到下一拍</button><button className="is-danger" disabled={board.frames.length===1} onClick={deleteCurrentFrame}><TrashIcon/>删除此拍</button></div></div></BottomSheet>
    <BottomSheet open={objectsOpen} onOpenChange={open=>setSheetVisibility(setObjectsOpen,open)} title="当前拍对象" description="画布拖动不方便时，也可以从列表准确选择。" snap={.72}><div className="board-object-list">{board.actors.map(actor=><button key={actor.id} onClick={()=>{setSelection({kind:"actor",id:actor.id});setTool("select");setObjectsOpen(false);}}><span className="object-swatch" style={{background:actor.color}}/><span><strong>{actor.label}</strong><small>{actor.kind==="ball"?"网球":"球员"}</small></span><ChevronRightIcon/></button>)}{frame.paths.map(path=><button key={path.id} onClick={()=>{setSelection({kind:"element",id:path.id});setTool("select");setObjectsOpen(false);}}><ResumeIcon/><span><strong>{path.kind==="move"?"跑位路线":path.kind==="feed"?"喂球路线":"击球路线"}</strong><small>{board.actors.find(actor=>actor.id===path.actorId)?.label}</small></span><ChevronRightIcon/></button>)}{frame.marks.map(mark=><button key={mark.id} onClick={()=>{setSelection({kind:"element",id:mark.id});setTool("select");setObjectsOpen(false);}}><DrawingPinIcon/><span><strong>{mark.text||selectedLabel||"场上标记"}</strong><small>{mark.kind}</small></span><ChevronRightIcon/></button>)}</div></BottomSheet>
    <BottomSheet open={objectOpen} onOpenChange={open=>setSheetVisibility(setObjectOpen,open)} title={selectedLabel||"编辑对象"} description="用按钮微调，适合触控和键盘操作。" snap={.62}><div className="board-sheet"><div className="object-nudge-grid"><button onClick={()=>nudge(0,-.02)}><ChevronLeftIcon/>向上</button><button onClick={()=>nudge(-.02,0)}><ChevronLeftIcon/>向左</button><button onClick={()=>nudge(.02,0)}>向右<ChevronRightIcon/></button><button onClick={()=>nudge(0,.02)}>向下<ChevronRightIcon/></button></div>{selectedMark&&(selectedMark.kind==="text"||selectedMark.kind==="target")&&<><label className="board-field"><span>显示文字</span><KeyboardInput value={textDraft} maxLength={28} onChange={event=>setTextDraft(event.currentTarget.value)}/></label><button className="sheet-done" onClick={applyObjectText}>更新文字</button></>}{selectedMark?.kind==="target"&&<div className="board-sheet-row"><button onClick={()=>resizeTarget(.84)}><MinusIcon/>缩小目标</button><button onClick={()=>resizeTarget(1.18)}><PlusIcon/>放大目标</button></div>}{selectedPath&&<button className="sheet-done is-secondary" onClick={toggleCurve}>{selectedPath.control?"改为直线":"改为曲线"}</button>}<button className="board-delete-wide" onClick={deleteSelection}><TrashIcon/>删除这个对象</button></div></BottomSheet>
    <BottomSheet open={drillOpen} onOpenChange={open=>setSheetVisibility(setDrillOpen,open)} title={drill?.title??"练到场上"} description={drill?.goal} snap={.9}>{drill&&<div className="drill-guide"><div className="drill-setup"><p><strong>人员</strong>{drill.people}</p><p><strong>器材</strong>{drill.equipment.join("、")}</p><ol>{drill.setup.map(item=><li key={item}>{item}</li>)}</ol></div><div className="drill-stages">{drill.stages.map(stage=><details key={stage.id}><summary><span>{stage.title}</span><ChevronDownIcon/></summary><div><p><strong>任务</strong>{stage.task}</p><p><strong>喂球</strong>{stage.feed}</p><blockquote>{stage.cue}</blockquote><p><strong>观察</strong>{stage.check}</p><p><strong>简单一点</strong>{stage.easier}</p><p><strong>进阶一点</strong>{stage.harder}</p><small>{stage.reps}</small></div></details>)}</div><p className="drill-progression">{drill.progression}</p><button className="sheet-done" onClick={()=>{setDrillOpen(false);keyboard.hide();}}>带着画板去练</button></div>}</BottomSheet>
  </div>;
}

function useFlowAccessibilityIsolation() {
  useEffect(()=>{
    const flowStack=document.querySelector<HTMLElement>(".tennis-app .flow-stack");if(!flowStack)return;
    const sync=()=>flowStack.querySelectorAll<HTMLElement>(".flow-screen").forEach(screen=>{
      const current=screen.dataset.flowCurrent==="true";
      if(!current&&screen.contains(document.activeElement)){(document.activeElement as HTMLElement|null)?.blur();}
      screen.toggleAttribute("inert",!current);
      if(current)screen.removeAttribute("aria-hidden");else screen.setAttribute("aria-hidden","true");
    });
    const observer=new MutationObserver(sync);observer.observe(flowStack,{subtree:true,childList:true,attributes:true,attributeFilter:["data-flow-current"]});sync();
    return()=>observer.disconnect();
  },[]);
}

export default function Prototype() {
  useFlowAccessibilityIsolation();
  const [info,setInfo]=useState(false);
  function makeBoard(board:BoardDocument):FlowScreen {return {id:`board-${board.id}`,title:board.title,headerHeight:62,header:()=><BoardHeader boardId={board.id} initialTitle={board.title}/>,render:flow=> <BoardEditor initialBoard={board} back={flow.pop} openLibrary={()=>flow.previous?.id==="board-home"?flow.pop():flow.replace(makeBoardHome())}/>};}
  function makeBoardHome():FlowScreen {return {id:"board-home",title:"战术画板",headerHeight:62,header:flow=><AppHeader title="战术画板" back={flow.pop}/>,render:flow=><BoardHome openBoard={board=>flow.push(makeBoard(board))}/>};}
  const makeDetail=(tactic:Tactic,contextLabel?:string):FlowScreen=>({id:tactic.id,title:tactic.name,headerHeight:62,header:flow=><AppHeader title={tactic.name} back={flow.pop}/>,render:flow=> <TacticPlayer tactic={tactic} contextLabel={contextLabel} openBoard={()=>flow.push(makeBoard(boardFromTactic(tactic)))}/>});
  function makeCombination(combination:Combination):FlowScreen {return {id:`${combination.id}-plan`,title:combination.name,headerHeight:62,header:flow=><AppHeader title={`${combination.name} · 思路`} back={flow.pop} menu={()=>setInfo(true)}/>,render:flow=><CombinationDetail combination={combination} openTactic={(tactic,contextLabel)=>flow.push(makeDetail(tactic,contextLabel))} openBoard={()=>flow.push(makeBoard(boardFromTactics(combination.stages.map(stage=>combinationExample(stage.tacticId,stage.excerpt)),combination.name)))}/>};}
  function makeInteractive(combination:Combination):FlowScreen {return {id:`${combination.id}-rally`,title:combination.name,headerHeight:62,header:flow=><AppHeader title={combination.name} back={flow.pop} menu={()=>setInfo(true)}/>,render:flow=><InteractiveCombinationPlayer combination={combination} openPlan={()=>flow.push(makeCombination(combination))}/>};}
  const initial:FlowScreen={id:"tactics",title:"网球战术",headerHeight:82,header:()=> <AppHeader title="网球战术" menu={()=>setInfo(true)}/>,render:flow=><TacticsList openTactic={(tactic,event)=>{event.currentTarget.blur();flow.push(makeDetail(tactic));}} openCombination={combination=>flow.push(makeInteractive(combination))} openBoardHome={()=>{const drafts=readBoards();flow.push(drafts.ok?makeBoard(drafts.value[0]??createStarterBoard("我的战术板")):makeBoardHome());}}/>};
  return <div className="tennis-app"><FlowStack initial={initial}/><BottomSheet open={info} onOpenChange={setInfo} title="网球战术演示" description="用球路和跑位，看懂青少年单打战术。" snap={.56}><div className="about-demo"><p><strong>{libraryStats.tactics} 个单项战术、{libraryStats.combinations} 组互动对打、{libraryStats.variants} 种应变</strong>。单项战术聚焦一招；组合模式会在每段球路后让你选择下一拍，并持续这一回合。</p><p>“发球后抢先手”已加入同一情境决策演练：先看来球、自己和对手，再比较不同战术的收益与风险。</p><p>蓝色是我方，红色是对手，黄色是网球；亮线为当前一拍，淡线为已完成球路，圆环提示下一落点。</p><p className="about-note">内容适合已能进行全场对打的青少年。若仍使用红、橙或绿球，请按球场大小和实际能力调整目标；战术示意不保证得分，也不能替代教练现场判断。</p><p className="about-source">教学原则参考 ITF、LTA 和 USTA 公开资料；战术组合与练习为教学化编排。</p><button className="sheet-done" onClick={()=>setInfo(false)}>知道了</button></div></BottomSheet></div>;
}

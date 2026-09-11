import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  ArchiveIcon,
  ArrowTopRightIcon,
  CheckCircledIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ComponentInstanceIcon,
  CopyIcon,
  CornerTopRightIcon,
  CounterClockwiseClockIcon,
  Cross2Icon,
  DownloadIcon,
  DrawingPinIcon,
  FilePlusIcon,
  InfoCircledIcon,
  LapTimerIcon,
  LayersIcon,
  MinusIcon,
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
import { getScoreBounceMotion } from "./content/effects";
import { boardFromTactic, boardFromTactics } from "./board/adapters";
import { BOARD_DRILLS, getDrillForTactic, type DrillGuide } from "./board/drills";
import {
  addActor,
  addFrame,
  addMark,
  armBlankRally,
  BOARD_COORDINATE_MAX,
  BOARD_COORDINATE_MIN,
  cloneBoard,
  createBlankBoard,
  createBlankRallyBoard,
  createStarterBoard,
  deleteActor,
  deleteFrame,
  deleteMark,
  deletePath,
  getBoardDuration,
  getBoardPose,
  moveActor,
  newBoardId,
  prepareBlankRallyBoard,
  renameBoard,
  setPath,
  setSmartRally,
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
const BOARD_MARK_NAMES:Record<BoardMark["kind"],string>={target:"目标区",cone:"标志碟",basket:"球筐",text:"文字提示",freehand:"自由笔"};
function numberedActorLabel(actors:BoardActor[],actor:BoardActor) {
  const matches=actors.filter(item=>item.kind===actor.kind&&item.label===actor.label);
  if(matches.length<2)return actor.label;
  const index=matches.findIndex(item=>item.id===actor.id);
  return `${actor.label} ${Math.max(0,index)+1}/${matches.length}`;
}
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
      const scoreBounce=getScoreBounceMotion(selected,time);
      const distance=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
      const hitterColor=(moment:Moment,alpha:number)=>distance(moment.ball,moment.me)<=distance(moment.ball,moment.opponent)?`rgba(88,177,255,${alpha})`:`rgba(255,101,116,${alpha})`;
      const history=selected.frames.slice(0,pose.index).map(item=>item.ball);
      if(history.length>1){ctx.save();ctx.beginPath();ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle="rgba(207,255,92,.22)";ctx.lineWidth=1.6;history.forEach((point,index)=>{const [hx,hy]=px(point);if(index===0)ctx.moveTo(hx,hy);else ctx.lineTo(hx,hy);});ctx.stroke();ctx.restore();}
      if(time>0&&!scoreBounce)line(previous.ball,pose.ball,"rgba(209,255,82,.78)",3);
      if(scoreBounce){
        const incoming=selected.frames.at(-3)?.ball;
        if(incoming)line(incoming,scoreBounce.landing,"rgba(209,255,82,.78)",3);
        const [landingX,landingY]=px(scoreBounce.landing),[currentX,currentY]=px(scoreBounce.position);
        ctx.save();ctx.beginPath();ctx.moveTo(landingX,landingY);ctx.lineTo(currentX,currentY);ctx.strokeStyle=`rgba(209,255,82,${.28+.2*(1-scoreBounce.flightProgress)})`;ctx.lineWidth=2;ctx.setLineDash([3,5]);ctx.stroke();ctx.setLineDash([]);
        if(scoreBounce.impactStrength>0){for(let ring=0;ring<2;ring+=1){const radius=7+ring*7+(1-scoreBounce.impactStrength)*8;ctx.beginPath();ctx.ellipse(landingX,landingY,radius,radius*.38,0,0,Math.PI*2);ctx.strokeStyle=`rgba(215,255,103,${scoreBounce.impactStrength*(.62-ring*.2)})`;ctx.lineWidth=1.8;ctx.stroke();}ctx.beginPath();ctx.ellipse(landingX,landingY,7,2.3,0,0,Math.PI*2);ctx.fillStyle=`rgba(208,255,74,${.18+.45*scoreBounce.impactStrength})`;ctx.fill();}
        scoreBounce.ghosts.forEach(ghost=>{const [ghostX,ghostY]=px(ghost.position);ctx.beginPath();ctx.arc(ghostX,ghostY-ghost.lift*10,4.2,0,Math.PI*2);ctx.fillStyle=`rgba(193,255,0,${ghost.opacity})`;ctx.fill();});ctx.restore();
      }
      selected.frames.slice(1,pose.index).forEach(item=>{if(scoreBounce&&distance(item.ball,scoreBounce.landing)<.035)return;const [nx,ny]=px(item.ball);ctx.beginPath();ctx.arc(nx,ny,3.2,0,Math.PI*2);ctx.fillStyle=hitterColor(item,.78);ctx.fill();ctx.lineWidth=1.2;ctx.strokeStyle="rgba(255,255,255,.72)";ctx.stroke();});
      if(!scoreBounce&&pose.fraction<.999 && pose.segmentProgress<.999){const [tx,ty]=px(target.ball),pulse=12+(Math.sin(time*6)+1)*3;ctx.beginPath();ctx.arc(tx,ty,pulse,0,Math.PI*2);ctx.fillStyle="rgba(209,255,113,.09)";ctx.fill();ctx.strokeStyle="rgba(221,255,142,.78)";ctx.lineWidth=1.8;ctx.setLineDash([4,3]);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.arc(tx,ty,3,0,Math.PI*2);ctx.fillStyle="rgba(214,255,118,.9)";ctx.fill();}
      const hitPulse=Math.max(0,1-pose.segmentProgress/.22);if(!scoreBounce&&hitPulse>0&&time>0){const [hitX,hitY]=px(previous.ball);ctx.beginPath();ctx.arc(hitX,hitY,5+hitPulse*8,0,Math.PI*2);ctx.strokeStyle=hitterColor(previous,hitPulse*.82);ctx.lineWidth=2.4;ctx.stroke();}
      if(!scoreBounce&&time>0&&pose.segmentProgress>=.999){const [nodeX,nodeY]=px(pose.ball);ctx.beginPath();ctx.arc(nodeX,nodeY,7,0,Math.PI*2);ctx.strokeStyle=hitterColor(target,.88);ctx.lineWidth=2;ctx.stroke();}
      if(!scoreBounce&&time>0){for(let i=6;i>=1;i--){const freshness=(7-i)/6,u=Math.max(0,pose.segmentProgress-i*.035),trailPoint=mixPoint(previous.ball,target.ball,u),[trailX,trailY]=px(trailPoint);ctx.beginPath();ctx.arc(trailX,trailY,1.2+freshness*1.6,0,Math.PI*2);ctx.fillStyle=`rgba(193,255,0,${.035+freshness*.17})`;ctx.fill();}}
      const player = (p: Point,color: string,label: string) => {const [cx,cy] = px(p);ctx.beginPath();ctx.arc(cx,cy,9.5,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.lineWidth=1.7;ctx.strokeStyle="#fff";ctx.stroke();ctx.font='12px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';ctx.textAlign="center";ctx.textBaseline="top";ctx.fillStyle="#f3f5ec";ctx.fillText(label,cx,cy+13);};
      player(pose.opponent,"#c8182b","对手");player(pose.me,"#216caf","我方");
      const visualBall=scoreBounce?.position??pose.ball,[ballX, ballY] = px(visualBall),visualLift=scoreBounce?scoreBounce.lift*10:pose.height*7;
      if(scoreBounce||pose.height > .1) {ctx.beginPath();ctx.ellipse(ballX+3,ballY+4,4-(scoreBounce?.squash??0),1.6,0,0,Math.PI*2);ctx.fillStyle="rgba(0,0,0,.25)";ctx.fill();}
      ctx.beginPath();if(scoreBounce?.phase==="impact")ctx.ellipse(ballX,ballY,5.3+scoreBounce.squash*2.2,Math.max(2.2,4.2-scoreBounce.squash*2),0,0,Math.PI*2);else ctx.arc(ballX,ballY-visualLift,scoreBounce?4.8:4+pose.height*2,0,Math.PI*2);ctx.fillStyle="#c1ff00";ctx.fill();
    };
    drawRef.current=draw;const resize=new ResizeObserver(draw);resize.observe(holder);draw();return () => resize.disconnect();
  }, []);
  useEffect(() => {drawRef.current();},[tactic,elapsed]);
  const pose=currentPose(tactic,elapsed);
  const scoreBounce=getScoreBounceMotion(tactic,elapsed),displayCaption=scoreBounce?.phase==="scored"?"落地后继续向外弹开，对手无法触球":pose.caption;
  const totalSteps=tactic.frames.length-1,currentStep=Math.min(totalSteps,pose.index);
  const completedSteps=pose.segmentProgress>=.999?currentStep:currentStep-1;
  return <div className="court-display"><div ref={holderRef} className="court-stage" data-testid="court-stage" data-ball-phase={scoreBounce?.phase??"flight"}>
    <canvas ref={canvasRef} role="img" aria-label={scoreBounce?(scoreBounce.phase==="scored"?`${tactic.name}，网球落地后沿实际方向弹出对手可触及范围，完成这一分`:`${tactic.name}，网球已经落地，正沿实际方向弹离对手；此时不显示下一落点圆环`):`${tactic.name}，红色为对手，蓝色为我方，黄色为网球，亮色线为已经完成的球路，圆环为下一关键位置`}/>
    <div className="stage-progress" aria-label={`当前第 ${currentStep} 步，共 ${totalSteps} 步`}><span>步骤 {currentStep}/{totalSteps}</span><div>{Array.from({length:totalSteps},(_,index)=><i key={index} className={index<completedSteps?"is-complete":index===currentStep-1?"is-active":""}/>)}</div><span className="stage-hint">{scoreBounce?(scoreBounce.phase==="scored"?"已弹出触球范围":"落地→弹出得分"):"圆环＝下一落点"}</span></div>
    </div>
    <div className={`stage-caption ${scoreBounce?.phase==="scored"||elapsed>=tactic.duration ? "is-finished" : ""}`} aria-live="polite" aria-atomic="true"><span>{displayCaption}</span></div>
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
      <span className="board-sr-only" data-testid="board-save-live" role="status" aria-live="polite" aria-atomic="true">{`画板${saveLabel}`}</span>
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
    <section className="board-home-hero"><span className="board-kicker"><DrawingPinIcon/> COURT CANVAS</span><h2>把想法画成下一拍</h2><p>两位球员和网球已经就位，直接拖出第一条球路。</p><div className="board-home-primary"><button onClick={()=>openBoard(createStarterBoard("我的新战术"))}><PlusIcon/>新建战术画板</button><button aria-label="导入画板 JSON" onClick={()=>importRef.current?.click()}><UploadIcon/></button></div><button className="board-home-blank" onClick={()=>openBoard(createBlankRallyBoard("我的空白战术"))}><FilePlusIcon/>新建纯空白画板</button><input ref={importRef} className="board-hidden-file" hidden tabIndex={-1} aria-hidden="true" type="file" accept="application/json,.json" onChange={event=>{void importBoard(event.currentTarget.files?.[0]);event.currentTarget.value="";}}/></section>
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
type SmartBoardContinuation = {
  frameIndex:number;
  phase:"shot"|"move";
  hitterId:string;
  actorId:string;
};
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

/**
 * Smart continuation is explicit document state. Shape alone never opts an
 * imported or tactic-derived board into guided authoring.
 */
function getSmartBoardContinuation(board:BoardDocument):SmartBoardContinuation|null {
  const smart=board.smartRally;if(!smart)return null;
  const frameIndex=board.frames.findIndex(frame=>frame.id===smart.frameId);
  if(frameIndex<0||frameIndex!==board.frames.length-1)return null;
  const players=board.actors.filter(actor=>actor.kind==="player"),balls=board.actors.filter(actor=>actor.kind==="ball");
  if(players.length!==2||balls.length!==1||!players.some(player=>player.id===smart.hitterId))return null;
  const frame=board.frames[frameIndex],actor=board.actors.find(item=>item.id===smart.actorId);
  if(!actor||!frame.poses[actor.id]||frame.paths.some(path=>path.actorId===balls[0].id))return null;
  if(smart.phase==="shot"&&actor.kind!=="ball")return null;
  if(smart.phase==="move"&&(actor.kind!=="player"||actor.id!==smart.hitterId||frame.paths.some(path=>path.kind==="move"&&path.actorId===actor.id)))return null;
  return {frameIndex,phase:smart.phase,hitterId:smart.hitterId,actorId:smart.actorId};
}

type BoardCanvasCompletion = {
  selection:BoardSelection;
  created:boolean;
  gesture:BoardDrag["kind"];
  base:BoardDocument;
  path?:BoardDrag["path"];
};

function BoardCanvas({board,frameIndex,selection,setSelection,tool,actorPreset,pathKind,markPreset,curved,smartEnabled,contextPaths,previewing,elapsed,preview,commit,finishPreview,onComplete,onOverride,onCancel,onNudge,onDelete,onError}:{
  board:BoardDocument;
  frameIndex:number;
  selection:BoardSelection|null;
  setSelection:(selection:BoardSelection|null)=>void;
  tool:BoardTool;
  actorPreset:ActorPreset;
  pathKind:"shot"|"feed";
  markPreset:MarkPreset;
  curved:boolean;
  smartEnabled:boolean;
  contextPaths:BoardPath[];
  previewing:boolean;
  elapsed:number;
  preview:(next:BoardDocument)=>void;
  commit:(next:BoardDocument)=>void;
  finishPreview:(base:BoardDocument,cancel?:boolean)=>void;
  onComplete:(completion:BoardCanvasCompletion)=>void;
  onOverride:(actor:BoardActor)=>void;
  onCancel:(base:BoardDocument,selectionBefore:BoardSelection|null)=>void;
  onNudge:(dx:number,dy:number)=>void;
  onDelete:()=>void;
  onError:(message:string)=>void;
}) {
  const holderRef=useRef<HTMLDivElement>(null),canvasRef=useRef<HTMLCanvasElement>(null),drawRef=useRef<()=>void>(()=>{}),dragRef=useRef<BoardDrag|null>(null);
  const latest=useRef({board,frameIndex,selection,contextPaths,previewing,elapsed});latest.current={board,frameIndex,selection,contextPaths,previewing,elapsed};
  useLayoutEffect(()=>{
    const canvas=canvasRef.current,holder=holderRef.current;if(!canvas||!holder)return;
    const draw=()=>{
      const current=latest.current,width=holder.clientWidth,height=holder.clientHeight,dpr=Math.min(window.devicePixelRatio||1,3);
      if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
      const ctx=canvas.getContext("2d");if(!ctx)return;ctx.setTransform(dpr,0,0,dpr,0,0);
      const pose=current.previewing?getBoardPose(current.board,current.elapsed):null;
      const targetIndex=pose?.frameIndex??current.frameIndex,frame=current.board.frames[targetIndex];if(!frame)return;
      renderBoard(ctx,width,height,frame,current.board.actors,{progress:pose?.progress??0,playing:current.previewing,selection:current.selection,showLegend:true,contextPaths:current.contextPaths});
    };
    drawRef.current=draw;const resize=new ResizeObserver(draw);resize.observe(holder);draw();return()=>resize.disconnect();
  },[]);
  useEffect(()=>drawRef.current(),[board,contextPaths,frameIndex,selection,previewing,elapsed]);

  const toCanvasPoint=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const target=event.currentTarget,bounds=target.getBoundingClientRect();
    return [(event.clientX-bounds.left)*target.clientWidth/Math.max(1,bounds.width),(event.clientY-bounds.top)*target.clientHeight/Math.max(1,bounds.height)] as BoardPoint;
  };
  const toBoardPoint=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const target=event.currentTarget,geometry=getBoardGeometry(target.clientWidth,target.clientHeight);
    return geometry.clampPoint(geometry.fromCanvas(toCanvasPoint(event)));
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
      // A shot can end on the receiver, so the ball and player may share the
      // same frame-start point. Keep the actor armed by the guided flow (or by
      // a manual path tool) as the preferred hit target in that overlap.
      const preferredSelection=selection?.kind==="actor"?selection:tool==="select"?selection:null;
      const hit=hitTestBoard(pixel,event.currentTarget.clientWidth,event.currentTarget.clientHeight,frame,board.actors,preferredSelection);
      if(hit?.kind==="handle"){
        const path=frame.paths.find(item=>item.id===hit.id),handlePoint=path?.[hit.handle];
        if(!handlePoint)return;
        dragRef.current={pointerId:event.pointerId,base:board,kind:"handle",id:hit.id,handle:hit.handle,startClient:[event.clientX,event.clientY],offset:[handlePoint[0]-point[0],handlePoint[1]-point[1]],moved:false,selectionBefore:selection};
        setSelection({kind:"element",id:hit.id});event.currentTarget.setPointerCapture(event.pointerId);return;
      }
      if(tool==="actor"){
        const actor=actorFromPreset(actorPreset),next=addActor(board,actor,point),nextSelection={kind:"actor",id:actor.id} as const;commit(next);onComplete({selection:nextSelection,created:true,gesture:"actor",base:board});return;
      }
      if(tool==="mark"){
        const mark=markFromPreset(markPreset,point);
        if(markPreset!=="freehand"){const nextSelection={kind:"element",id:mark.id} as const;commit(addMark(board,frameIndex,mark));onComplete({selection:nextSelection,created:true,gesture:"mark",base:board});return;}
        dragRef.current={pointerId:event.pointerId,base:board,kind:"freehand",id:mark.id,points:[point],startClient:[event.clientX,event.clientY],moved:false,selectionBefore:selection};event.currentTarget.setPointerCapture(event.pointerId);return;
      }
      if(tool==="shot"||tool==="move"){
        let actor:BoardActor|undefined,kind:"shot"|"feed"|"move";
        if(smartEnabled){
          if(hit?.kind!=="actor"){if(hit)setSelection(hit);onError("请从球员或网球按住并拖动");return;}
          actor=board.actors.find(item=>item.id===hit.id);if(!actor)return;
          kind=actor.kind==="ball"?(tool==="shot"?pathKind:"shot"):"move";
          onOverride(actor);
        }else{
          const selected=selection?.kind==="actor"?board.actors.find(item=>item.id===selection.id):undefined;
          const expectsBall=tool==="shot";
          if(!selected||(expectsBall?selected.kind!=="ball":selected.kind!=="player")||hit?.kind!=="actor"||hit.id!==selected.id){onError(expectsBall?"请从已选中的网球开始拖动":"请从已选中的球员开始拖动");return;}
          actor=selected;kind=tool==="move"?"move":pathKind;
        }
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
    if(cancel){finishPreview(drag.base,true);onCancel(drag.base,drag.selectionBefore);return;}
    if(!drag.moved)return;
    finishPreview(drag.base);
    onComplete({selection:{kind:drag.kind==="actor"?"actor":"element",id:drag.id},created:drag.kind==="path"||drag.kind==="freehand",gesture:drag.kind,base:drag.base,path:drag.path});
  };
  const onKeyDown=(event:React.KeyboardEvent<HTMLDivElement>)=>{
    if(previewing||!selection)return;
    const step=event.shiftKey?.05:.02;
    const delta:Partial<Record<string,BoardPoint>>={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]};
    if(delta[event.key]){event.preventDefault();onNudge(...delta[event.key]!);}
    else if(event.key==="Delete"||event.key==="Backspace"){event.preventDefault();onDelete();}
  };
  return <div ref={holderRef} className="board-canvas" data-testid="board-canvas" data-scroll-drag="ignore" tabIndex={0} role="application" aria-label="可编辑网球战术画板。标准双人画板可直接从网球拖出球路，放开后会自动接续对手跑位与下一拍；点选任一球员或网球可随时改写当前操作。方向键可微调，Delete 键删除。" onKeyDown={onKeyDown} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={event=>endPointer(event)} onPointerCancel={event=>endPointer(event,true)}><canvas ref={canvasRef}/></div>;
}

function BoardEditor({ initialBoard, back, openLibrary }:{initialBoard:BoardDocument;back:()=>void;openLibrary:()=>void}) {
  const keyboard=useKeyboard();
  const initialSmart=getSmartBoardContinuation(initialBoard);
  const [board,setBoardState]=useState(initialBoard),[frameIndex,setFrameIndex]=useState(initialSmart?.frameIndex??0),[selection,setSelection]=useState<BoardSelection|null>(initialSmart?{kind:"actor",id:initialSmart.actorId}:null),[committedRevision,setCommittedRevision]=useState(0);
  const [past,setPast]=useState<BoardDocument[]>([]),[future,setFuture]=useState<BoardDocument[]>([]),[saveState,setSaveState]=useState<BoardSaveState>("dirty"),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [tool,setTool]=useState<BoardTool>(initialSmart?.phase??"select"),[actorPreset,setActorPreset]=useState<ActorPreset>("me"),[pathKind,setPathKind]=useState<"shot"|"feed">("shot"),[markPreset,setMarkPreset]=useState<MarkPreset>("target"),[curved,setCurved]=useState(true);
  const [viewMode,setViewMode]=useState<"edit"|"preview">("edit"),[isPlaying,setIsPlaying]=useState(false),[elapsed,setElapsed]=useState(0),[speed,setSpeed]=useState(1);
  const [filesOpen,setFilesOpen]=useState(false),[historyOpen,setHistoryOpen]=useState(false),[frameOpen,setFrameOpen]=useState(false),[objectsOpen,setObjectsOpen]=useState(false),[drillOpen,setDrillOpen]=useState(false),[objectOpen,setObjectOpen]=useState(false),[toolPalette,setToolPalette]=useState<"add"|"marks"|null>(null);
  const [titleDraft,setTitleDraft]=useState(board.title),[frameLabel,setFrameLabel]=useState(board.frames[0]?.label??""),[frameDuration,setFrameDuration]=useState(String(board.frames[0]?.duration??1.5)),[textDraft,setTextDraft]=useState("");
  const editorRef=useRef<HTMLDivElement>(null),selectToolRef=useRef<HTMLButtonElement>(null),playbackToggleRef=useRef<HTMLButtonElement>(null),sheetOpenerRef=useRef<HTMLElement|null>(null),sheetFocusTimerRef=useRef<number|null>(null),importRef=useRef<HTMLInputElement>(null),boardRef=useRef(board),committedBoardRef=useRef(board),needsSaveRef=useRef(true),focusPlaybackEntryRef=useRef(false),focusPlaybackExitRef=useRef(false),playbackReturnFrameIdRef=useRef<string|null>(null),playbackResumeSmartRef=useRef(false);boardRef.current=board;
  const smartContinuation=getSmartBoardContinuation(board);
  const playbackBoard=useMemo(()=>{
    const smart=getSmartBoardContinuation(board),last=board.frames[board.frames.length-1];
    const trimsGeneratedTail=!!smart&&smart.phase==="move"&&smart.frameIndex===board.frames.length-1&&last.paths.length===0;
    const frames=trimsGeneratedTail?board.frames.slice(0,-1):board.frames;
    return frames.some(item=>item.paths.length)?{...board,frames}:{...board,frames:frames.slice(0,1).map(item=>({...item,duration:0}))};
  },[board]);
  const hasPlayablePath=playbackBoard.frames.some(item=>item.paths.length>0);
  const playbackFrameCount=hasPlayablePath?playbackBoard.frames.length:0;
  const totalDuration=getBoardDuration(playbackBoard),frame=board.frames[frameIndex]??board.frames[0];
  const selectedActor=selection?.kind==="actor"?board.actors.find(actor=>actor.id===selection.id):undefined;
  const selectedPath=selection?.kind==="element"?frame?.paths.find(path=>path.id===selection.id):undefined;
  const selectedMark=selection?.kind==="element"?frame?.marks.find(mark=>mark.id===selection.id):undefined;
  const drill=BOARD_DRILLS.find(item=>item.id===board.drillId)??getDrillForTactic(board.sourceTacticId);
  const setSheetVisibility=useCallback((setter:(open:boolean)=>void,nextOpen:boolean)=>{if(!nextOpen)keyboard.hide();setter(nextOpen);},[keyboard]);
  const rememberSheetOpener=useCallback((opener:HTMLElement)=>{if(sheetFocusTimerRef.current!==null)window.clearTimeout(sheetFocusTimerRef.current);sheetOpenerRef.current=opener;},[]);
  const restoreSheetFocus=useCallback((destination:"opener"|"canvas")=>{if(sheetFocusTimerRef.current!==null)window.clearTimeout(sheetFocusTimerRef.current);const opener=sheetOpenerRef.current;sheetFocusTimerRef.current=window.setTimeout(()=>{const canvas=editorRef.current?.querySelector<HTMLElement>('[data-testid="board-canvas"]');const target=destination==="canvas"?canvas:opener?.isConnected?opener:selectToolRef.current;(target??selectToolRef.current)?.focus();sheetOpenerRef.current=null;sheetFocusTimerRef.current=null;},360);},[]);

  const setBoard=useCallback((next:BoardDocument)=>{boardRef.current=next;setBoardState(next);},[]);
  const markCommitted=useCallback((next:BoardDocument)=>{committedBoardRef.current=next;needsSaveRef.current=true;setBoard(next);setCommittedRevision(value=>value+1);},[setBoard]);
  const resetTransientEditorState=useCallback((next:BoardDocument,followSmart:boolean,preferredFrameId?:string)=>{const smart=getSmartBoardContinuation(next),preferredIndex=preferredFrameId?next.frames.findIndex(item=>item.id===preferredFrameId):-1,targetIndex=followSmart&&smart?smart.frameIndex:preferredIndex>=0?preferredIndex:smart?.frameIndex??0,resumeSmart=!!smart&&followSmart&&targetIndex===smart.frameIndex;setFrameIndex(Math.max(0,Math.min(targetIndex,next.frames.length-1)));setSelection(resumeSmart?{kind:"actor",id:smart.actorId}:null);setTool(resumeSmart?smart.phase:"select");setViewMode("edit");setIsPlaying(false);setElapsed(0);setObjectOpen(false);},[]);
  const commit=useCallback((next:BoardDocument)=>{const current=committedBoardRef.current;if(next===current)return;setPast(items=>[...items,current].slice(-50));setFuture([]);markCommitted(next);setSaveState("dirty");setError("");},[markCommitted]);
  const preview=useCallback((next:BoardDocument)=>setBoard(next),[setBoard]);
  const finishPreview=useCallback((base:BoardDocument,cancel=false)=>{if(cancel){setBoard(committedBoardRef.current);return;}const current=boardRef.current;if(current===base)return;const previous=committedBoardRef.current;setPast(items=>[...items,previous].slice(-50));setFuture([]);markCommitted(current);setSaveState("dirty");setError("");},[markCommitted,setBoard]);
  const undo=useCallback(()=>{const previous=past[past.length-1];if(!previous)return;const current=committedBoardRef.current,currentSmart=getSmartBoardContinuation(current),currentFrameId=current.frames[frameIndex]?.id,followSmart=!!currentSmart&&currentSmart.frameIndex===frameIndex&&tool===currentSmart.phase&&selection?.kind==="actor"&&selection.id===currentSmart.actorId;setPast(past.slice(0,-1));setFuture(items=>[current,...items].slice(0,50));markCommitted(previous);resetTransientEditorState(previous,followSmart,currentFrameId);setSaveState("dirty");},[frameIndex,markCommitted,past,resetTransientEditorState,selection,tool]);
  const redo=useCallback(()=>{const next=future[0];if(!next)return;const current=committedBoardRef.current,currentSmart=getSmartBoardContinuation(current),currentFrameId=current.frames[frameIndex]?.id,followSmart=!!currentSmart&&currentSmart.frameIndex===frameIndex&&tool===currentSmart.phase&&selection?.kind==="actor"&&selection.id===currentSmart.actorId;setFuture(future.slice(1));setPast(items=>[...items,current].slice(-50));markCommitted(next);resetTransientEditorState(next,followSmart,currentFrameId);setSaveState("dirty");},[frameIndex,future,markCommitted,resetTransientEditorState,selection,tool]);
  const saveNow=useCallback(()=>{setSaveState("saving");const candidate=committedBoardRef.current,result=saveBoard(candidate);if(result.ok){const showingCommitted=boardRef.current===candidate;committedBoardRef.current=result.value;needsSaveRef.current=false;if(showingCommitted)setBoard(result.value);setSaveState("saved");setError("");window.dispatchEvent(new Event(BOARD_DRAFTS_EVENT));}else{setSaveState("error");setError(result.error);}return result;},[setBoard]);

  useEffect(()=>{if(saveState!=="dirty")return;const timer=window.setTimeout(saveNow,700);return()=>window.clearTimeout(timer);},[committedRevision,saveNow,saveState]);
  useLayoutEffect(()=>{const screen=editorRef.current?.closest<HTMLElement>(".flow-screen");if(!screen)return;screen.classList.add("board-enter-immediate");const timer=window.setTimeout(()=>screen.classList.remove("board-enter-immediate"),600);return()=>{window.clearTimeout(timer);screen.classList.remove("board-enter-immediate");};},[]);
  useEffect(()=>()=>{if(sheetFocusTimerRef.current!==null)window.clearTimeout(sheetFocusTimerRef.current);},[]);
  useEffect(()=>{const flush=()=>{if(!needsSaveRef.current)return;const result=saveBoard(committedBoardRef.current);if(result.ok){committedBoardRef.current=result.value;needsSaveRef.current=false;window.dispatchEvent(new Event(BOARD_DRAFTS_EVENT));}};window.addEventListener("pagehide",flush);return()=>{window.removeEventListener("pagehide",flush);flush();};},[]);
  useEffect(()=>emitBoardHeaderState({boardId:initialBoard.id,title:board.title,saveState,canUndo:past.length>0,canRedo:future.length>0}),[board.title,future.length,initialBoard.id,past.length,saveState]);
  useEffect(()=>{
    const act=(event:Event)=>{const detail=(event as CustomEvent<{boardId:string;action:BoardActionName}>).detail;if(detail.boardId!==initialBoard.id||editorRef.current?.closest<HTMLElement>(".flow-screen")?.dataset.flowCurrent!=="true")return;if(detail.action==="undo")undo();else if(detail.action==="redo")redo();else if(detail.action==="save")saveNow();else if(detail.action==="back"){const result=saveNow();if(result.ok)back();}else{const active=document.activeElement;if(active instanceof HTMLElement)rememberSheetOpener(active);setFilesOpen(true);}};
    window.addEventListener(BOARD_ACTION_EVENT,act);return()=>window.removeEventListener(BOARD_ACTION_EVENT,act);
  },[back,initialBoard.id,redo,rememberSheetOpener,saveNow,undo]);
  useEffect(()=>{if(!isPlaying)return;let request=0,last=performance.now();const tick=(now:number)=>{const delta=Math.min((now-last)/1000,.1)*speed;last=now;setElapsed(value=>Math.min(totalDuration,value+delta));request=requestAnimationFrame(tick);};request=requestAnimationFrame(tick);return()=>cancelAnimationFrame(request);},[isPlaying,speed,totalDuration]);
  useEffect(()=>{if(isPlaying&&elapsed>=totalDuration){setIsPlaying(false);setNotice("战术播放完成。可重播，或回到编辑继续调整。");}},[elapsed,isPlaying,totalDuration]);
  useEffect(()=>{const smart=getSmartBoardContinuation(board);if(smart?.frameIndex===frameIndex){setSelection({kind:"actor",id:smart.actorId});setTool(smart.phase);}else setSelection(null);setFrameLabel(frame?.label??"");setFrameDuration(String(frame?.duration??0));},[frame?.id,frameIndex]);
  useEffect(()=>{if(error)setNotice("");},[error]);
  useEffect(()=>{if(!notice)return;const timer=window.setTimeout(()=>setNotice(""),3200);return()=>window.clearTimeout(timer);},[notice]);
  useEffect(()=>{
    const request=window.requestAnimationFrame(()=>{
      if(viewMode==="preview"){
        if(focusPlaybackEntryRef.current){playbackToggleRef.current?.focus();focusPlaybackEntryRef.current=false;}
        return;
      }
      if(focusPlaybackExitRef.current){editorRef.current?.querySelector<HTMLElement>('[data-testid="board-canvas"]')?.focus();focusPlaybackExitRef.current=false;}
    });
    return()=>window.cancelAnimationFrame(request);
  },[frameIndex,viewMode,board.frames.length]);

  const deleteSelection=()=>{
    if(!selection)return;let next=board;
    if(selection.kind==="actor")next=deleteActor(board,selection.id);
    else if(selectedPath)next=deletePath(board,frameIndex,selection.id);
    else if(selectedMark)next=deleteMark(board,frameIndex,selection.id);
    if(selection.kind==="actor")next=armBlankRally(next);
    const removedLabel=selectedActor?numberedActorLabel(board.actors,selectedActor):selectedPath?selectedPath.kind==="move"?"跑位路线":selectedPath.kind==="feed"?"喂球路线":"击球路线":selectedMark?BOARD_MARK_NAMES[selectedMark.kind]:"对象";
    const resumed=selection.kind==="actor"?getSmartBoardContinuation(next):null;
    commit(next);setObjectOpen(false);keyboard.hide();
    if(resumed){setFrameIndex(resumed.frameIndex);setSelection({kind:"actor",id:resumed.actorId});setTool(resumed.phase);setPathKind("shot");setNotice(`已删除${removedLabel}，双人回合已恢复。现在从网球拖出发球线路。`);return;}
    setSelection(null);setNotice(selectedActor?`已从整套战术的所有拍次删除${removedLabel}。`:`已从第 ${frameIndex+1} 拍删除${removedLabel}。`);
  };
  const nudge=(dx:number,dy:number)=>{
    const clamp=(point:BoardPoint):BoardPoint=>clampBoardPoint([point[0]+dx,point[1]+dy]);
    if(selectedActor&&frame.poses[selectedActor.id])commit(moveActor(board,frameIndex,selectedActor.id,clamp(frame.poses[selectedActor.id])));
    else if(selectedMark)commit(updateMark(board,frameIndex,selectedMark.id,{position:clamp(selectedMark.position)}));
    else if(selectedPath)commit(updatePath(board,frameIndex,selectedPath.id,{to:clamp(selectedPath.to)}));
  };
  const addNextFrame=(duplicate=false)=>{try{const nextIndex=frameIndex+1,generated=addFrame(board,frameIndex,duplicate),next=generated.smartRally?setSmartRally(generated):generated;commit(next);setFrameIndex(nextIndex);setSelection(null);setTool("select");setViewMode("edit");setIsPlaying(false);setError("");setNotice(`已新增第 ${nextIndex+1} 拍，从上一拍结束位置开始。`);}catch(reason){setError(reason instanceof Error?reason.message:"无法添加拍次");}};
  const applyFrame=()=>{const duration=Number(frameDuration);try{commit(updateFrame(board,frameIndex,{label:frameLabel,duration}));setFrameOpen(false);keyboard.hide();restoreSheetFocus("opener");}catch(reason){setError(reason instanceof Error?reason.message:"无法更新拍次");}};
  const deleteCurrentFrame=()=>{const next=deleteFrame(board,frameIndex);commit(next);setFrameIndex(Math.max(0,Math.min(frameIndex,next.frames.length-1)));setFrameOpen(false);keyboard.hide();restoreSheetFocus("opener");};
  const openFrameSheet=()=>{setFrameLabel(frame.label);setFrameDuration(String(frame.duration));setFrameOpen(true);};
  const openFrameFromHistory=(index:number)=>{const nextFrame=board.frames[index];if(!nextFrame)return;setFrameIndex(index);setFrameLabel(nextFrame.label);setFrameDuration(String(nextFrame.duration));setHistoryOpen(false);setFrameOpen(true);};
  const frameStart=(index:number)=>board.frames.slice(0,index).reduce((sum,item)=>sum+item.duration,0);
  const nextPlaybackFrame=()=>{const pose=getBoardPose(playbackBoard,elapsed);if(pose.frameIndex>=playbackBoard.frames.length-1)return;const next=pose.frameIndex+1;setElapsed(frameStart(next));setIsPlaying(false);setNotice(`已跳到第 ${next+1} 拍。`);};
  const previousPlaybackFrame=()=>{if(elapsed<=0)return;const pose=getBoardPose(playbackBoard,elapsed),terminal=pose.frameIndex===playbackBoard.frames.length-1&&playbackBoard.frames[pose.frameIndex]?.duration===0&&elapsed>=totalDuration;const previous=terminal||pose.progress<.08?Math.max(0,pose.frameIndex-1):pose.frameIndex;setElapsed(frameStart(previous));setIsPlaying(false);setNotice(`已跳到第 ${previous+1} 拍。`);};
  const startPlayback=()=>{if(!hasPlayablePath){setError("请先画一条球路或跑位路线，再播放战术。");return;}focusPlaybackEntryRef.current=true;playbackReturnFrameIdRef.current=frame.id;playbackResumeSmartRef.current=smartContinuation?.frameIndex===frameIndex&&tool===smartContinuation.phase;setTool("select");setSelection(null);setElapsed(0);setViewMode("preview");setIsPlaying(true);setError("");setNotice(`开始播放战术，共 ${playbackFrameCount} 拍、${totalDuration.toFixed(1)} 秒。`);};
  const returnToEditing=()=>{setIsPlaying(false);const pose=getBoardPose(playbackBoard,elapsed),smart=getSmartBoardContinuation(board),resumeSmart=playbackResumeSmartRef.current&&!!smart;setViewMode("edit");setElapsed(0);if(resumeSmart&&smart){setFrameIndex(smart.frameIndex);setSelection({kind:"actor",id:smart.actorId});setTool(smart.phase);setNotice(`已回到第 ${smart.frameIndex+1} 拍继续编辑。`);}else{const returnIndex=board.frames.findIndex(item=>item.id===playbackReturnFrameIdRef.current),targetIndex=returnIndex>=0?returnIndex:pose.frameIndex;setFrameIndex(targetIndex);setTool("select");setSelection(null);setNotice(`已回到第 ${targetIndex+1} 拍编辑。`);}playbackReturnFrameIdRef.current=null;playbackResumeSmartRef.current=false;focusPlaybackExitRef.current=true;};
  const applyRename=()=>{try{commit(renameBoard(board,titleDraft));keyboard.hide();}catch(reason){setError(reason instanceof Error?reason.message:"无法重命名");}};
  const duplicateDraft=()=>{const copy=cloneBoard(board);const result=saveBoard(copy);if(result.ok){setError("");setNotice(`已保存副本「${result.value.title}」。`);window.dispatchEvent(new Event(BOARD_DRAFTS_EVENT));}else setError(result.error);};
  const exportJson=()=>saveDownload(new Blob([JSON.stringify(board,null,2)],{type:"application/json"}),safeFilename(board.title,"json"));
  const exportPng=async()=>{try{saveDownload(await exportBoardPng(board,frameIndex),safeFilename(`${board.title}-第${frameIndex+1}拍`,"png"));}catch(reason){setError(reason instanceof Error?reason.message:"无法导出图片");}};
  const importJson=async(file:File|undefined)=>{if(!file)return;const parsed=parseBoardJSON(await file.text());if(!parsed.ok){setError(parsed.error);return;}const imported={...parsed.value,id:initialBoard.id,updatedAt:new Date().toISOString()};commit(imported);setTitleDraft(imported.title);resetTransientEditorState(imported,true,imported.frames[0]?.id);setFrameLabel(imported.frames[0]?.label??"");setFrameDuration(String(imported.frames[0]?.duration??0));setFilesOpen(false);keyboard.hide();restoreSheetFocus("canvas");};
  const chooseTool=(next:BoardTool)=>{
    setTool(next);setViewMode("edit");setIsPlaying(false);
    const selected=selection?.kind==="actor"?board.actors.find(actor=>actor.id===selection.id):undefined;
    const canCarryActor=(next==="shot"&&selected?.kind==="ball")||(next==="move"&&selected?.kind==="player");
    if(next!=="select"&&!canCarryActor)setSelection(null);
  };
  const openSelectedObject=()=>{if(!selection)return;setTextDraft(selectedMark?.text??selectedActor?.label??"");setObjectOpen(true);};
  const toggleCurve=()=>{if(selectedPath){const midpoint=(selectedPath.from[0]+selectedPath.to[0])/2;const control=selectedPath.control?undefined:[Math.max(-.15,Math.min(1.15,midpoint+.16)),(selectedPath.from[1]+selectedPath.to[1])/2] as BoardPoint;commit(updatePath(board,frameIndex,selectedPath.id,{control}));}else setCurved(value=>!value);};
  const resizeTarget=(scale:number)=>{if(selectedMark?.kind!=="target")return;const size=selectedMark.size??[.28,.12];commit(updateMark(board,frameIndex,selectedMark.id,{size:[Math.max(.08,Math.min(.8,size[0]*scale)),Math.max(.04,Math.min(.5,size[1]*scale))]}));};
  const applyObjectText=()=>{if(selectedMark&&(selectedMark.kind==="text"||selectedMark.kind==="target")){commit(updateMark(board,frameIndex,selectedMark.id,{text:textDraft.trim()||undefined}));setObjectOpen(false);keyboard.hide();restoreSheetFocus("opener");}};
  const applySmartContinuation=(next:BoardDocument)=>{const smart=getSmartBoardContinuation(next);if(!smart)return false;setFrameIndex(smart.frameIndex);setSelection({kind:"actor",id:smart.actorId});setTool(smart.phase);setPathKind("shot");return true;};
  const completeCanvasAction=(completion:BoardCanvasCompletion)=>{
    const smartBefore=getSmartBoardContinuation(completion.base);
    if(completion.gesture==="path"&&completion.path&&smartBefore?.frameIndex===frameIndex){
      const current=committedBoardRef.current,players=current.actors.filter(actor=>actor.kind==="player"),ball=current.actors.find(actor=>actor.kind==="ball");
      const completesShot=!!ball&&completion.path.kind==="shot"&&completion.path.actorId===ball.id&&(smartBefore.phase==="shot"||smartBefore.phase==="move");
      const completesExpectedMove=completion.path.kind==="move"&&smartBefore.phase==="move"&&completion.path.actorId===smartBefore.actorId;
      if(completesShot&&ball){
        try{
          const nextHitter=players.find(player=>player.id!==smartBefore.hitterId);if(!nextHitter)throw new Error("找不到下一位击球者");
          let next=addFrame(current,frameIndex,false),nextFrame=next.frames[frameIndex+1];
          next=setSmartRally(next,{version:1,frameId:nextFrame.id,phase:"move",hitterId:nextHitter.id,actorId:nextHitter.id});
          markCommitted(next);
          if(applySmartContinuation(next)){navigator.vibrate?.(8);setNotice(`第 ${frameIndex+1} 拍已完成。现在拖动接球方跑位。`);return;}
        }catch(reason){setError(reason instanceof Error?reason.message:"无法自动接续下一拍");}
      }else if(completesExpectedMove&&ball){
        try{
          const next=setSmartRally(current,{version:1,frameId:current.frames[frameIndex].id,phase:"shot",hitterId:smartBefore.hitterId,actorId:ball.id});
          markCommitted(next);
          if(applySmartContinuation(next)){navigator.vibrate?.(8);setNotice("跑位已记录。现在从网球拖出下一拍。");return;}
        }catch(reason){setError(reason instanceof Error?reason.message:"无法接续下一拍");}
      }else if(completion.path.kind==="move"&&applySmartContinuation(current)){
        setNotice("额外跑位已记录；智慧流程仍等待指定球员。");return;
      }else{
        const manual=setSmartRally(current);markCommitted(manual);setSelection(completion.selection);setTool("select");setNotice("这项操作已保留，并切换为手动编辑。");return;
      }
    }
    if(smartBefore&&completion.gesture==="mark"&&applySmartContinuation(committedBoardRef.current)){setNotice("标记已添加，继续当前回合。");return;}
    if(completion.created&&completion.gesture==="actor"){
      const current=committedBoardRef.current,armed=armBlankRally(current);
      if(armed!==current){markCommitted(armed);if(applySmartContinuation(armed)){setNotice("两位球员和网球已就位。现在从网球拖出第一条球路。");return;}}
    }
    setSelection(completion.selection);
    if(completion.created){setTool("select");setNotice("已添加并选中，可直接拖动调整位置。");}
  };
  const overrideSmartActor=(actor:BoardActor)=>{setSelection({kind:"actor",id:actor.id});if(actor.kind==="ball"){if(tool==="move")setPathKind("shot");setTool("shot");setNotice("已改为网球。按住并拖到下一落点。");}else{setTool("move");setNotice(`已改为${numberedActorLabel(board.actors,actor)}。按住并拖动跑位。`);}setError("");};
  const cancelCanvasAction=(base:BoardDocument,selectionBefore:BoardSelection|null)=>{const smart=getSmartBoardContinuation(base);if(smart){setFrameIndex(smart.frameIndex);setSelection({kind:"actor",id:smart.actorId});setTool(smart.phase);}else{setSelection(selectionBefore);setTool("select");}};
  const chooseAdd=(next:BoardTool,preset?:ActorPreset|MarkPreset)=>{if(next==="actor"&&preset)setActorPreset(preset as ActorPreset);if(next==="mark"&&preset)setMarkPreset(preset as MarkPreset);chooseTool(next);setToolPalette(null);restoreSheetFocus("canvas");};
  const beginSelectedPath=(kind:"shot"|"feed"|"move")=>{const actor=selectedActor;if(!actor||(kind==="move"?actor.kind!=="player":actor.kind!=="ball")){setError(kind==="move"?"请先选择一名球员。":"请先选择网球。");return;}setPathKind(kind==="feed"?"feed":"shot");chooseTool(kind==="move"?"move":"shot");setObjectOpen(false);setToolPalette(null);keyboard.hide();restoreSheetFocus("canvas");};
  const openObjects=(opener:HTMLElement)=>{rememberSheetOpener(opener);chooseTool("select");setObjectsOpen(true);};

  const previewing=viewMode==="preview",activePose=previewing?getBoardPose(playbackBoard,elapsed):null,currentPlaybackFrame=activePose?.frameIndex??frameIndex;
  const selectedActorLabel=selectedActor?numberedActorLabel(board.actors,selectedActor):"";
  const selectedLabel=selectedActorLabel||(selectedPath?selectedPath.kind==="move"?"跑位路线":selectedPath.kind==="feed"?"喂球路线":"击球路线":selectedMark?BOARD_MARK_NAMES[selectedMark.kind]:"");
  const activeSmart=smartContinuation?.frameIndex===frameIndex?smartContinuation:null;
  const previousBeatPaths=useMemo(()=>{
    if(previewing||frameIndex<=0||board.smartRally?.frameId!==frame?.id)return [];
    return board.frames[frameIndex-1].paths;
  },[board,frame?.id,frameIndex,previewing]);
  const smartActor=activeSmart?board.actors.find(actor=>actor.id===activeSmart.actorId):undefined;
  const smartActorLabel=smartActor?numberedActorLabel(board.actors,smartActor):"";
  const toolStatus=activeSmart?.phase==="shot"?(frameIndex===0?"拖出发球线路":"从网球拖出下一拍"):activeSmart?.phase==="move"?`现在拖动${smartActorLabel||"接球方"}跑位`:tool==="actor"?`点球场一次，放置${actorPreset==="me"?"我方球员":actorPreset==="opponent"?"对手球员":"网球"}`:tool==="shot"?`按住网球拖到落点 · ${pathKind==="feed"?"喂球":"球路"}${curved?"曲线":"直线"}`:tool==="move"?`按住已选球员拖到跑位终点 · ${curved?"曲线":"直线"}`:tool==="mark"?`${markPreset==="freehand"?"按住球场并拖动绘制":"点球场一次放置"}${BOARD_MARK_NAMES[markPreset]}`:"";
  const toolHint=activeSmart?.phase==="shot"?(frameIndex===0?"从网球按住，拖到发球落点后放开":"不需跑位时，也可直接从网球继续拖"):activeSmart?.phase==="move"?"跑位后放开，系统会自动切到下一拍":tool==="actor"||tool==="mark"?"完成一次后自动回到对象模式":"必须从已选对象按住并拖动";
  const addToolActive=toolPalette!==null||tool==="actor"||tool==="mark";
  const canGoPrevious=elapsed>0;
  const canGoNext=currentPlaybackFrame<playbackBoard.frames.length-1;
  const sheetOpen=toolPalette!==null||filesOpen||historyOpen||frameOpen||objectsOpen||drillOpen||objectOpen;
  const sheetFeedback=(error||notice)&&<p className={`board-sheet-feedback ${error?"is-error":"is-status"}`} role={error?"alert":"status"} aria-live={error?"assertive":"polite"} aria-atomic="true">{error||notice}</p>;
  return <div ref={editorRef} className={`board-editor ${previewing?"is-previewing":"is-editing"}`}>
    <div className="board-canvas-shell">
      {previewing&&<div className="board-preview-meta"><span>{`预览 · 第 ${currentPlaybackFrame+1} 拍`}</span><strong>{board.frames[currentPlaybackFrame]?.label}</strong>{drill&&<button onClick={event=>{rememberSheetOpener(event.currentTarget);setIsPlaying(false);setDrillOpen(true);}}><TargetIcon/>练到场上</button>}</div>}
      {!previewing&&<button className="board-history-chip" aria-label={`打开拍次历史，当前第 ${frameIndex+1} 拍，共 ${board.frames.length} 拍`} onClick={event=>{rememberSheetOpener(event.currentTarget);setHistoryOpen(true);}}><ReaderIcon/><span>第 {frameIndex+1} 拍</span></button>}
      <BoardCanvas board={previewing?playbackBoard:board} frameIndex={frameIndex} selection={selection} setSelection={setSelection} tool={tool} actorPreset={actorPreset} pathKind={pathKind} markPreset={markPreset} curved={curved} smartEnabled={!!activeSmart} contextPaths={previousBeatPaths} previewing={previewing} elapsed={elapsed} preview={preview} commit={commit} finishPreview={finishPreview} onComplete={completeCanvasAction} onOverride={overrideSmartActor} onCancel={cancelCanvasAction} onNudge={nudge} onDelete={deleteSelection} onError={setError}/>
      {!sheetOpen&&(error||notice)&&<div className={`board-toast ${error?"is-error":"is-status"}`} role={error?"alert":"status"} aria-live={error?"assertive":"polite"} aria-atomic="true"><span>{error||notice}</span><button aria-label="关闭提示" onClick={()=>{setError("");setNotice("");}}><Cross2Icon/></button></div>}
    </div>
    {previewing?<div className="board-playback-dock" data-testid="board-playback-dock">
      <div className="board-playback-progress"><span>{elapsed.toFixed(1)}s</span><input type="range" aria-label="画板播放进度" min="0" max={Math.max(.01,totalDuration)} step=".01" value={elapsed} onChange={event=>{setIsPlaying(false);setElapsed(Number(event.currentTarget.value));}}/><span>{totalDuration.toFixed(1)}s</span></div>
      <div className="board-playback-actions"><button disabled={!canGoPrevious} onClick={previousPlaybackFrame}><TrackPreviousIcon/><span>上一拍</span></button><button ref={playbackToggleRef} className="board-play-toggle" onClick={()=>{if(isPlaying){setIsPlaying(false);setNotice("已暂停播放。");return;}const restarting=elapsed>=totalDuration;if(restarting)setElapsed(0);setIsPlaying(true);setNotice(restarting?"从第 1 拍重新播放。":"继续播放战术。");}}>{isPlaying?<PauseIcon/>:<PlayIcon/>}<span>{isPlaying?"暂停":elapsed>=totalDuration?"重播":"继续"}</span></button><button disabled={!canGoNext} onClick={nextPlaybackFrame}><TrackNextIcon/><span>下一拍</span></button><button onClick={()=>setSpeed(value=>value===1?.5:value===.5?.25:1)}><LapTimerIcon/><span>{speed}×</span></button></div>
      <button className="board-return-edit" onClick={returnToEditing}>完成 · 回到编辑</button>
    </div>:<>
      <div className="board-canvas-meta board-interaction-guide">{tool!=="select"?<><div className="board-guide-copy" role="status" aria-live="polite" aria-atomic="true"><strong>{toolStatus}</strong><small>{toolHint}</small></div><button aria-label="取消当前操作，回到对象模式" onClick={()=>chooseTool("select")}><Cross2Icon/>取消</button></>:selection?<><div className="board-guide-copy" role="status" aria-live="polite" aria-atomic="true"><strong>已选中{selectedLabel||"场上对象"}</strong><small>拖动中心调整位置；路线端点也可直接拖动</small></div><div className="board-canvas-context-actions">{selectedActor&&<button className="board-context-draw" aria-label={selectedActor.kind==="ball"?`用${selectedLabel}画球路`:`用${selectedLabel}画跑位`} onClick={event=>{rememberSheetOpener(event.currentTarget);beginSelectedPath(selectedActor.kind==="ball"?"shot":"move");}}>{selectedActor.kind==="ball"?<ArrowTopRightIcon/>:<CornerTopRightIcon/>}{selectedActor.kind==="ball"?"画球路":"画跑位"}</button>}<button aria-label={`调整${selectedLabel||"场上对象"}`} onClick={event=>{rememberSheetOpener(event.currentTarget);openSelectedObject();}}><Pencil2Icon/>调整</button></div></>:<><div className="board-guide-copy"><strong>点选场上对象开始</strong><small>拖中心移动；选中后画球路或跑位</small></div>{drill&&<button onClick={event=>{rememberSheetOpener(event.currentTarget);setDrillOpen(true);}}><TargetIcon/>练到场上</button>}</>}</div>
      <nav className="board-edit-dock" aria-label="画板编辑工具">
        <div className="board-tool-rail" role="toolbar" aria-label="画板主要操作">
          <button ref={selectToolRef} className={tool==="select"?"is-active":""} aria-label="对象" aria-pressed={tool==="select"} aria-haspopup="dialog" aria-expanded={objectsOpen} onClick={event=>openObjects(event.currentTarget)}><LayersIcon/><span>对象</span></button>
          <button className={addToolActive?"is-active":""} aria-label="添加" aria-pressed={addToolActive} aria-haspopup="dialog" aria-expanded={toolPalette!==null} onClick={event=>{rememberSheetOpener(event.currentTarget);chooseTool("select");setToolPalette("add");}}><PlusIcon/><span>添加</span></button>
        </div>
        <button className="board-primary-play" aria-label={`播放战术，${playbackFrameCount} 拍，共 ${totalDuration.toFixed(1)} 秒`} disabled={!hasPlayablePath} onClick={startPlayback}><PlayIcon/><span><strong>播放</strong><small>{playbackFrameCount} 拍 · {totalDuration.toFixed(1)} 秒</small></span></button>
      </nav>
    </>}

    <BottomSheet open={toolPalette!==null} onOpenChange={open=>{if(!open){keyboard.hide();setToolPalette(null);restoreSheetFocus("opener");}}} title={toolPalette==="marks"?"标记与器材":"添加到球场"} description={toolPalette==="marks"?"这些辅助内容也都是一次添加。":"选择一次操作，完成后自动回到对象模式。"} snap={toolPalette==="marks"?.78:.68}><div className="board-sheet"><button className="guide-close" aria-label="关闭添加面板" onClick={()=>{setToolPalette(null);keyboard.hide();restoreSheetFocus("opener");}}><Cross2Icon/></button>{sheetFeedback}{toolPalette==="marks"&&<button className="sheet-done is-secondary" onClick={()=>setToolPalette("add")}><ChevronLeftIcon/>返回添加</button>}<div className="board-file-actions">
      {toolPalette==="add"?<><button onClick={()=>chooseAdd("actor","me")}><PersonIcon/><span><strong>我方球员</strong><small>点球场一次放置</small></span></button><button onClick={()=>chooseAdd("actor","opponent")}><PersonIcon/><span><strong>对手球员</strong><small>点球场一次放置</small></span></button><button onClick={()=>chooseAdd("actor","ball")}><ComponentInstanceIcon/><span><strong>网球</strong><small>点球场一次放置</small></span></button><button disabled={selectedActor?.kind!=="ball"} onClick={()=>beginSelectedPath("shot")}><ArrowTopRightIcon/><span><strong>画球路</strong><small>{selectedActor?.kind==="ball"?`从${selectedLabel}按住拖到落点`:"先在场上选择网球"}</small></span></button><button disabled={selectedActor?.kind!=="player"} onClick={()=>beginSelectedPath("move")}><CornerTopRightIcon/><span><strong>画跑位</strong><small>{selectedActor?.kind==="player"?`从${selectedLabel}按住拖到终点`:"先在场上选择球员"}</small></span></button><button onClick={()=>setToolPalette("marks")}><DrawingPinIcon/><span><strong>标记与器材</strong><small>目标区、球筐、文字与更多</small></span></button></>:<><button onClick={()=>chooseAdd("mark","target")}><TargetIcon/><span><strong>目标区</strong><small>点球场一次放置</small></span></button><button onClick={()=>chooseAdd("mark","cone")}><DrawingPinIcon/><span><strong>标志碟</strong><small>点球场一次放置</small></span></button><button onClick={()=>chooseAdd("mark","basket")}><ArchiveIcon/><span><strong>球筐</strong><small>点球场一次放置</small></span></button><button onClick={()=>chooseAdd("mark","text")}><TextIcon/><span><strong>文字提示</strong><small>点球场一次放置</small></span></button><button onClick={()=>chooseAdd("mark","freehand")}><Pencil2Icon/><span><strong>自由笔</strong><small>按住球场并拖动绘制</small></span></button><button disabled={selectedActor?.kind!=="ball"} onClick={()=>beginSelectedPath("feed")}><ResumeIcon/><span><strong>喂球路线</strong><small>{selectedActor?.kind==="ball"?`从${selectedLabel}按住拖到落点`:"先在场上选择网球"}</small></span></button></>}
    </div></div></BottomSheet>
    <BottomSheet open={filesOpen} onOpenChange={open=>{setSheetVisibility(setFilesOpen,open);if(!open)restoreSheetFocus("opener");}} title="画板文件" description="保存在本机，也可带走 PNG 或完整 JSON。" snap={.78}><div className="board-sheet"><button className="guide-close" aria-label="关闭画板文件" onClick={()=>{setFilesOpen(false);keyboard.hide();restoreSheetFocus("opener");}}><Cross2Icon/></button>{sheetFeedback}
      <label className="board-field"><span>画板名称</span><KeyboardInput value={titleDraft} maxLength={60} onChange={event=>setTitleDraft(event.currentTarget.value)}/></label><button className="sheet-done" onClick={applyRename}>更新名称</button>
      <div className="board-file-actions"><button onClick={saveNow}><CheckCircledIcon/><span><strong>立即保存</strong><small>写入这台设备</small></span></button><button onClick={duplicateDraft}><CopyIcon/><span><strong>保存副本</strong><small>保留独立草稿</small></span></button><button onClick={()=>{setFilesOpen(false);setHistoryOpen(true);}}><ReaderIcon/><span><strong>拍次历史</strong><small>回看或精修任一拍</small></span></button><button onClick={()=>void exportPng()}><DownloadIcon/><span><strong>当前拍 PNG</strong><small>不含控制柄</small></span></button><button onClick={exportJson}><ArchiveIcon/><span><strong>完整 JSON</strong><small>可继续编辑</small></span></button><button onClick={()=>importRef.current?.click()}><UploadIcon/><span><strong>导入 JSON</strong><small>替换当前内容</small></span></button><button onClick={()=>{const result=saveNow();if(result.ok){keyboard.hide();setFilesOpen(false);openLibrary();}}}><LayersIcon/><span><strong>草稿与模板</strong><small>也可新建纯空白</small></span></button></div>
      <input ref={importRef} className="board-hidden-file" hidden tabIndex={-1} aria-hidden="true" type="file" accept="application/json,.json" onChange={event=>{void importJson(event.currentTarget.files?.[0]);event.currentTarget.value="";}}/>
      {saveState==="error"&&<p className="board-export-warning">本机保存失败。请先导出 JSON，避免丢失本次编辑。</p>}
    </div></BottomSheet>
    <BottomSheet open={historyOpen} onOpenChange={open=>{setSheetVisibility(setHistoryOpen,open);if(!open)restoreSheetFocus("opener");}} title="拍次历史" description="日常编排会自动接续；只在需要回看或精修时进入这里。" snap={.72}><div className="board-sheet"><button className="guide-close" aria-label="关闭拍次历史" onClick={()=>{setHistoryOpen(false);keyboard.hide();restoreSheetFocus("opener");}}><Cross2Icon/></button>{sheetFeedback}<div className="board-object-list board-history-list">{board.frames.map((item,index)=>{const isCurrent=index===frameIndex,isContinuation=smartContinuation?.frameIndex===index&&smartContinuation.phase==="move"&&item.paths.length===0;return <button key={item.id} aria-current={isCurrent?"step":undefined} aria-label={`编辑第 ${index+1} 拍：${item.label}`} onClick={()=>openFrameFromHistory(index)}><span className="board-history-number">{index+1}</span><span><strong>{item.label}</strong><small>{isContinuation?"等待下一拍":`${item.paths.length} 条轨迹 · ${item.duration.toFixed(1)} 秒`}</small></span>{isCurrent?<CheckCircledIcon/>:<ChevronRightIcon/>}</button>;})}</div></div></BottomSheet>
    <BottomSheet open={frameOpen} onOpenChange={open=>{setSheetVisibility(setFrameOpen,open);if(!open)restoreSheetFocus("opener");}} title={`第 ${frameIndex+1} 拍`} description="每拍是一段同步球路与跑位。" snap={.66}><div className="board-sheet"><button className="guide-close" aria-label="取消编辑拍次" onClick={()=>{setFrameOpen(false);keyboard.hide();restoreSheetFocus("opener");}}><Cross2Icon/></button>{sheetFeedback}<label className="board-field"><span>拍次口令</span><KeyboardInput value={frameLabel} maxLength={42} onChange={event=>setFrameLabel(event.currentTarget.value)}/></label><label className="board-field"><span>时长（秒）</span><KeyboardInput inputMode="decimal" value={frameDuration} onChange={event=>setFrameDuration(event.currentTarget.value)}/></label><button className="sheet-done" onClick={applyFrame}>完成</button><div className="board-sheet-row"><button onClick={()=>{addNextFrame(true);setFrameOpen(false);keyboard.hide();restoreSheetFocus("canvas");}}><CopyIcon/>沿用标记到新增一拍</button><button className="is-danger" disabled={board.frames.length===1} onClick={deleteCurrentFrame}><TrashIcon/>删除此拍</button></div></div></BottomSheet>
    <BottomSheet open={objectsOpen} onOpenChange={open=>{setSheetVisibility(setObjectsOpen,open);if(!open)restoreSheetFocus("opener");}} title="当前拍对象" description="选择后可在球场直接拖动，也可打开调整面板。" snap={.72}><div className="board-sheet"><button className="guide-close" aria-label="关闭对象列表" onClick={()=>{setObjectsOpen(false);keyboard.hide();restoreSheetFocus("opener");}}><Cross2Icon/></button>{sheetFeedback}<div className="board-object-list">{board.actors.map(actor=>{const entryLabel=numberedActorLabel(board.actors,actor);return <button key={actor.id} aria-label={`选择${entryLabel}`} onClick={()=>{setSelection({kind:"actor",id:actor.id});setTool("select");setObjectsOpen(false);restoreSheetFocus("canvas");}}><span className="object-swatch" style={{background:actor.color}}/><span><strong>{entryLabel}</strong><small>{actor.kind==="ball"?"网球 · 可画球路":"球员 · 可画跑位"}</small></span><ChevronRightIcon/></button>;})}{frame.paths.map(path=>{const actor=board.actors.find(item=>item.id===path.actorId);return <button key={path.id} onClick={()=>{setSelection({kind:"element",id:path.id});setTool("select");setObjectsOpen(false);restoreSheetFocus("canvas");}}><ResumeIcon/><span><strong>{path.kind==="move"?"跑位路线":path.kind==="feed"?"喂球路线":"击球路线"}</strong><small>{actor?numberedActorLabel(board.actors,actor):"未关联对象"}</small></span><ChevronRightIcon/></button>;})}{frame.marks.map((mark,index)=>{const typeLabel=BOARD_MARK_NAMES[mark.kind],sameTypeCount=frame.marks.filter(item=>item.kind===mark.kind).length,sameTypeIndex=frame.marks.slice(0,index).filter(item=>item.kind===mark.kind).length+1,baseLabel=mark.text?.trim()||typeLabel,entryLabel=sameTypeCount>1?`${baseLabel} ${sameTypeIndex}/${sameTypeCount}`:baseLabel;return <button key={mark.id} aria-label={`选择${entryLabel}`} onClick={()=>{setSelection({kind:"element",id:mark.id});setTool("select");setObjectsOpen(false);restoreSheetFocus("canvas");}}><DrawingPinIcon/><span><strong>{entryLabel}</strong><small>{typeLabel}</small></span><ChevronRightIcon/></button>;})}</div></div></BottomSheet>
    <BottomSheet open={objectOpen} onOpenChange={open=>{setSheetVisibility(setObjectOpen,open);if(!open)restoreSheetFocus("opener");}} title={selectedLabel||"编辑对象"} description={selectedActor?"球员和网球贯穿所有拍次；移动会承接站位，删除会作用于整套战术。":"这里的路线或标记只属于当前拍。"} snap={.66}><div className="board-sheet"><button className="guide-close" aria-label="关闭对象调整" onClick={()=>{setObjectOpen(false);keyboard.hide();restoreSheetFocus("opener");}}><Cross2Icon/></button>{sheetFeedback}{selectedActor&&<button className="sheet-done" onClick={()=>beginSelectedPath(selectedActor.kind==="ball"?"shot":"move")}>{selectedActor.kind==="ball"?<ArrowTopRightIcon/>:<CornerTopRightIcon/>}{selectedActor.kind==="ball"?"画球路":"画跑位"}</button>}<div className="object-nudge-grid"><button onClick={()=>nudge(0,-.02)}><ChevronLeftIcon/>向上</button><button onClick={()=>nudge(-.02,0)}><ChevronLeftIcon/>向左</button><button onClick={()=>nudge(.02,0)}>向右<ChevronRightIcon/></button><button onClick={()=>nudge(0,.02)}>向下<ChevronRightIcon/></button></div>{selectedMark&&(selectedMark.kind==="text"||selectedMark.kind==="target")&&<><label className="board-field"><span>显示文字</span><KeyboardInput value={textDraft} maxLength={28} onChange={event=>setTextDraft(event.currentTarget.value)}/></label><button className="sheet-done" onClick={applyObjectText}>更新文字</button></>}{selectedMark?.kind==="target"&&<div className="board-sheet-row"><button onClick={()=>resizeTarget(.84)}><MinusIcon/>缩小目标</button><button onClick={()=>resizeTarget(1.18)}><PlusIcon/>放大目标</button></div>}{selectedPath&&<button className="sheet-done is-secondary" onClick={toggleCurve}>{selectedPath.control?"改为直线":"改为曲线"}</button>}<button className="board-delete-wide" aria-label={selectedActor?`从整套战术所有拍次删除${selectedLabel}`:`仅从第 ${frameIndex+1} 拍删除${selectedLabel}`} onClick={()=>{deleteSelection();restoreSheetFocus("opener");}}><TrashIcon/>{selectedActor?`从整套战术删除${selectedLabel}`:`仅从本拍删除${selectedLabel}`}</button></div></BottomSheet>
    <BottomSheet open={drillOpen} onOpenChange={open=>{setSheetVisibility(setDrillOpen,open);if(!open)restoreSheetFocus("opener");}} title={drill?.title??"练到场上"} description={drill?.goal} snap={.9}>{drill&&<div className="drill-guide"><button className="guide-close" aria-label="关闭训练指南" onClick={()=>{setDrillOpen(false);keyboard.hide();restoreSheetFocus("opener");}}><Cross2Icon/></button>{sheetFeedback}<div className="drill-setup"><p><strong>人员</strong>{drill.people}</p><p><strong>器材</strong>{drill.equipment.join("、")}</p><ol>{drill.setup.map(item=><li key={item}>{item}</li>)}</ol></div><div className="drill-stages">{drill.stages.map(stage=><details key={stage.id}><summary><span>{stage.title}</span><ChevronDownIcon/></summary><div><p><strong>任务</strong>{stage.task}</p><p><strong>喂球</strong>{stage.feed}</p><blockquote>{stage.cue}</blockquote><p><strong>观察</strong>{stage.check}</p><p><strong>简单一点</strong>{stage.easier}</p><p><strong>进阶一点</strong>{stage.harder}</p><small>{stage.reps}</small></div></details>)}</div><p className="drill-progression">{drill.progression}</p><button className="sheet-done" onClick={()=>{setDrillOpen(false);keyboard.hide();restoreSheetFocus("opener");}}>带着画板去练</button></div>}</BottomSheet>
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
  function makeBoard(board:BoardDocument):FlowScreen {const prepared=prepareBlankRallyBoard(board);return {id:`board-${prepared.id}`,title:prepared.title,headerHeight:62,header:()=><BoardHeader boardId={prepared.id} initialTitle={prepared.title}/>,render:flow=> <BoardEditor initialBoard={prepared} back={flow.pop} openLibrary={()=>flow.previous?.id==="board-home"?flow.pop():flow.replace(makeBoardHome())}/>};}
  function makeBoardHome():FlowScreen {return {id:"board-home",title:"战术画板",headerHeight:62,header:flow=><AppHeader title="战术画板" back={flow.pop}/>,render:flow=><BoardHome openBoard={board=>flow.push(makeBoard(board))}/>};}
  const makeDetail=(tactic:Tactic,contextLabel?:string):FlowScreen=>({id:tactic.id,title:tactic.name,headerHeight:62,header:flow=><AppHeader title={tactic.name} back={flow.pop}/>,render:flow=> <TacticPlayer tactic={tactic} contextLabel={contextLabel} openBoard={()=>flow.push(makeBoard(boardFromTactic(tactic)))}/>});
  function makeCombination(combination:Combination):FlowScreen {return {id:`${combination.id}-plan`,title:combination.name,headerHeight:62,header:flow=><AppHeader title={`${combination.name} · 思路`} back={flow.pop} menu={()=>setInfo(true)}/>,render:flow=><CombinationDetail combination={combination} openTactic={(tactic,contextLabel)=>flow.push(makeDetail(tactic,contextLabel))} openBoard={()=>flow.push(makeBoard(boardFromTactics(combination.stages.map(stage=>combinationExample(stage.tacticId,stage.excerpt)),combination.name)))}/>};}
  function makeInteractive(combination:Combination):FlowScreen {return {id:`${combination.id}-rally`,title:combination.name,headerHeight:62,header:flow=><AppHeader title={combination.name} back={flow.pop} menu={()=>setInfo(true)}/>,render:flow=><InteractiveCombinationPlayer combination={combination} openPlan={()=>flow.push(makeCombination(combination))}/>};}
  const initial:FlowScreen={id:"tactics",title:"网球战术",headerHeight:82,header:()=> <AppHeader title="网球战术" menu={()=>setInfo(true)}/>,render:flow=><TacticsList openTactic={(tactic,event)=>{event.currentTarget.blur();flow.push(makeDetail(tactic));}} openCombination={combination=>flow.push(makeInteractive(combination))} openBoardHome={()=>{const drafts=readBoards();flow.push(drafts.ok?makeBoard(drafts.value[0]??createStarterBoard("我的战术板")):makeBoardHome());}}/>};
  return <div className="tennis-app"><FlowStack initial={initial}/><BottomSheet open={info} onOpenChange={setInfo} title="网球战术演示" description="用球路和跑位，看懂青少年单打战术。" snap={.56}><div className="about-demo"><p><strong>{libraryStats.tactics} 个单项战术、{libraryStats.combinations} 组互动对打、{libraryStats.variants} 种应变</strong>。单项战术聚焦一招；组合模式会在每段球路后让你选择下一拍，并持续这一回合。</p><p>“发球后抢先手”已加入同一情境决策演练：先看来球、自己和对手，再比较不同战术的收益与风险。</p><p>蓝色是我方，红色是对手，黄色是网球；亮线为当前一拍，淡线为已完成球路，圆环提示下一落点。</p><p className="about-note">内容适合已能进行全场对打的青少年。若仍使用红、橙或绿球，请按球场大小和实际能力调整目标；战术示意不保证得分，也不能替代教练现场判断。</p><p className="about-source">教学原则参考 ITF、LTA 和 USTA 公开资料；战术组合与练习为教学化编排。</p><button className="sheet-done" onClick={()=>setInfo(false)}>知道了</button></div></BottomSheet></div>;
}

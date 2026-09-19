import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArchiveIcon,
  ArrowTopRightIcon,
  CheckCircledIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CodeIcon,
  ComponentInstanceIcon,
  CopyIcon,
  CornerTopRightIcon,
  CounterClockwiseClockIcon,
  Cross2Icon,
  CrossCircledIcon,
  DownloadIcon,
  DotsHorizontalIcon,
  DrawingPinIcon,
  InfoCircledIcon,
  ImageIcon,
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
  Share2Icon,
  TargetIcon,
  TextIcon,
  TrackNextIcon,
  TrackPreviousIcon,
  TrashIcon,
  UpdateIcon,
  VideoIcon,
} from "@radix-ui/react-icons";
import { BottomSheet, Carousel, FlowStack, KeyboardInput, MobileScroll, useKeyboard, useMobileDevice, useScreenPortal, type FlowScreen } from "./mobile";

import { categories, combinations, interactiveRallies, libraryStats, rallyNodes, tacticGuides, tactics, type CategoryFilter } from "./content/library";
import type { Combination, Moment, Point, RallyChoice, RallyNode, RallyObservation, RallyScenarioChoice, Tactic, TacticExcerpt } from "./content/types";
import { getScoreBounceMotion } from "./content/effects";
import { boardFromTactic, boardFromTactics } from "./board/adapters";
import { BOARD_DRILLS, getDrillForTactic } from "./board/drills";
import {
  addActor,
  addFrame,
  addMark,
  applyShotPace,
  armBlankRally,
  BOARD_COORDINATE_MAX,
  BOARD_COORDINATE_MIN,
  cloneBoard,
  createStarterBoard,
  deleteActor,
  deleteFrame,
  deleteMark,
  deletePath,
  getBoardDuration,
  getBoardPose,
  getShotPaceForHold,
  isStarterBoardState,
  isUntouchedSmartTail,
  moveActor,
  newBoardId,
  prepareBlankRallyBoard,
  prepareSynchronizedRallyBoard,
  renameBoard,
  restoreStarterBoard,
  setPath,
  setSmartRally,
  synchronizeMoveWithPreviousShot,
  updateFrame,
  updateMark,
  updatePath,
  BOARD_PURPOSE_LABELS,
  getBoardPurpose,
  type BoardActor,
  type BoardDocument,
  type BoardFrame,
  type BoardMark,
  type BoardPath,
  type BoardPurpose,
  type BoardShotPace,
  type Point as BoardPoint,
} from "./board/model";
import { exportBoardPng, getBoardGeometry, hitTestBoard, renderBoard, type BoardHit, type BoardSelection } from "./board/render";
import { getBoardDisplayPreferences, setBoardDisplayPreferences, type BoardDisplayPreferences, type BoardSurface } from "./board/display";
import { exportBoardGif, exportBoardVideo, pickVideoEncoding, prepareBoardForMedia, type BoardMediaExport } from "./board/media";
import { readBoards, saveBoard } from "./board/storage";
import { BOARD_DRAFTS_EVENT, BoardLibrary } from "./home/BoardLibrary";
import { findLatestPlayableBoard, HomeBoardPlayback } from "./home/HomeBoardPlayback";
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
function ProductWordmark({ compact = false }: { compact?: boolean }) {
  return <span className={`product-wordmark${compact ? " is-compact" : ""}`} aria-label="RallyPath">
    <span className="product-wordmark-mark" aria-hidden="true" />
    {!compact && <span>RallyPath</span>}
  </span>;
}
function AppHeader({ title, back, menu }: { title: string; back?: () => void; menu?: () => void }) {
  return <div className={`tennis-header ${back ? "detail-header" : "list-header"}`}>
    {back && <button className="header-back" aria-label="返回上一页" onClick={back}><ChevronLeftIcon /></button>}
    <div className="header-title"><h1>{title}</h1>{!back && <p>画球路 · 做判断 · 带到训练场</p>}</div>
    {menu && <button className="header-info" aria-label="演示说明" onClick={menu}><InfoCircledIcon /></button>}
  </div>;
}
function HomeHeader({ menu }: { menu: () => void }) {
  return <div className="home-header">
    <ProductWordmark />
    <button aria-label="打开内容说明" onClick={menu}><InfoCircledIcon/></button>
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
    { id:"decisions", title:"这一拍怎么打？", content:<ol className="guide-steps">{guide.decisions.map((decision,index)=><li key={decision}><span>{index+1}</span><p>{decision}</p></li>)}</ol> },
    { id:"why", title:"为什么这样打？", content:<p>{guide.why}</p> },
    { id:"adjust", title:"什么时候要换个打法？", content:<><p>{guide.avoid}</p><div className="guide-mistake"><strong>常见失误</strong><p>{meta.mistake}</p></div></> },
    { id:"practice", title:"这一招怎么练？", content:<><p>{guide.practice}</p><small>次数可按能力调整，重点看选择和准备。</small></> },
  ];
  return <div className="guide-panel">
    <div className="guide-summary"><span>这样打，想换来什么？</span><p>{meta.goal}</p></div>
    <div className="guide-situation"><h3>什么时候用？</h3><p>{guide.recognize}</p></div>
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
  const finished=elapsed>=tactic.duration;
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
    <button className="board-from-tactic" onClick={()=>{setPlaying(false);openBoard();}}><DrawingPinIcon/><span>改成我的打法</span><ChevronRightIcon/></button>
    <button className="guide-entry decision-entry" aria-label={finished?"回到讲解，想想什么时候会用":`打开战术讲解。当前判断：${currentDecision}`} onClick={()=>{setPlaying(false);setSettings(true);}}>
      <span className="decision-entry-head"><ReaderIcon/><strong>{finished?"回到讲解":"当前判断"}</strong><small>{finished?"什么时候会用？":"完整讲解"}</small><ChevronRightIcon/></span>
      <span className="decision-entry-copy" aria-live="polite">{finished?"看完了，再想想什么时候会用":currentDecision}</span>
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
      <div className="combination-cue"><strong>先这样打</strong><p>{stage.cue}</p></div><div className="combination-transition"><strong>{index===combination.stages.length-1?"打完继续判断":"看到这个，再进下一招"}</strong><p>{stage.transition}</p></div>
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
function TacticsList({ openTactic, openCombination, initialMode="tactics", initialCategory="全部" }: { openTactic: (tactic: Tactic) => void; openCombination:(combination:Combination)=>void; initialMode?:"tactics" | "combinations"; initialCategory?:CategoryFilter }) {
  const [category, setCategory] = useState<CategoryFilter>(initialCategory);
  const [mode,setMode]=useState<"tactics" | "combinations">(initialMode);
  const visibleTactics = category === "全部" ? tactics : tactics.filter(tactic => tactic.category === category);
  const visibleCombinations = category === "全部" ? combinations : combinations.filter(combination=>combination.category===category);
  return <section className="tactic-catalogue" aria-label="青少年比赛战术">
      <div className="catalogue-modes" role="group" aria-label="查看单项或组合"><button aria-pressed={mode==="tactics"} className={mode==="tactics"?"is-selected":""} onClick={()=>setMode("tactics")}>单项打法 <span>{tactics.length}</span></button><button aria-pressed={mode==="combinations"} className={mode==="combinations"?"is-selected":""} onClick={()=>setMode("combinations")}>组合打法 <span>{combinations.length}</span></button></div>
      <Carousel className="category-carousel" contentClassName="category-track" ariaLabel="按比赛情境筛选">
        {categories.map(option => <button key={option} className={`category-chip ${category === option ? "is-selected" : ""}`} aria-pressed={category === option} onClick={() => setCategory(option)}>{option}</button>)}
      </Carousel>
      <div className="catalogue-count"><span>{mode==="combinations"?"组合＋衍生选择":category === "全部" ? "全部打法" : category}</span><span>{mode==="combinations"?`${visibleCombinations.length} 组搭配`: `${visibleTactics.length} 个打法`}</span></div>
      <MobileScroll className="tactic-list-screen" key={`${mode}-${category}`}>
      <main className="tactics-grid" aria-label={`${category}${mode==="tactics"?"战术":"组合"}列表`}>
        {mode==="combinations"?visibleCombinations.map((combination)=>{const isPractice=Boolean(interactiveRallies.find(item=>item.combinationId===combination.id)?.decisionPractice);return <button className={`tactic-card combo-card ${isPractice?"is-decision-practice":""}`} key={combination.id} onClick={()=>openCombination(combination)} aria-label={isPractice?`打开${combination.name}，在同一个场面试不同打法`:`打开${combination.name}互动对打，自动播放第一段，每段提供二到三个现场选择`}><div className="card-copy"><div className="combo-card-label">{isPractice?"新 · 同一个场面，试不同打法":`${combination.series??combination.category} · 互动对打`}</div><h2>{combination.name}</h2><p className="card-purpose">{combination.goal}</p><div className="card-meta"><span>{isPractice?"先看来球／自己／对手":"自动播放首段"}</span><span>{isPractice?"看这样打、要留意什么":"每段 2–3 个选择"}</span></div></div><ChevronRightIcon className="card-arrow"/></button>}):visibleTactics.map(tactic => {
          const meta = tacticMeta(tactic);
          return <button key={tactic.id} className="tactic-card" onClick={event => {event.currentTarget.blur();openTactic(tactic);}} aria-label={`${tactic.name}，${tactic.duration}秒，${meta.category}，${meta.level}`}>
            <div className="card-picture" aria-hidden="true"><img src="/assets/tennis/tennis-ball.png" alt="" draggable={false}/><span>{String(tactics.indexOf(tactic)+1).padStart(2,"0")}</span></div>
            <div className="card-copy">{tactic.series&&<span className="card-series">{tactic.series}</span>}<h2>{tactic.name}</h2><p className="card-purpose">{meta.goal}</p><div className="card-meta"><span>{meta.category}</span><span>{meta.level}</span><span>{tactic.duration} 秒演示</span></div></div><ChevronRightIcon className="card-arrow"/>
          </button>;
        })}
      </main>
      </MobileScroll>
    </section>;
}

type BoardSaveState = "clean" | "dirty" | "saving" | "saved" | "error";
type BoardHeaderState = { boardId:string; title:string; saveState:BoardSaveState; canUndo:boolean; canRedo:boolean; canRestore:boolean; immersive:boolean };
type BoardActionName = "undo" | "redo" | "save" | "files" | "rename" | "restore" | "fullscreen" | "back";
const BOARD_HEADER_STATE_EVENT = "tennis-board-header-state";
const BOARD_ACTION_EVENT = "tennis-board-action";
function emitBoardHeaderState(detail:BoardHeaderState) {
  window.dispatchEvent(new CustomEvent<BoardHeaderState>(BOARD_HEADER_STATE_EVENT,{detail}));
}

function sendBoardAction(boardId:string,action:BoardActionName) {
  window.dispatchEvent(new CustomEvent(BOARD_ACTION_EVENT,{detail:{boardId,action}}));
}

function BoardHeader({ boardId, initialTitle, initialSaveState }:{boardId:string;initialTitle:string;initialSaveState:BoardSaveState}) {
  const [state,setState]=useState<BoardHeaderState>({boardId,title:initialTitle,saveState:initialSaveState,canUndo:false,canRedo:false,canRestore:false,immersive:false});
  useEffect(()=>{
    const update=(event:Event)=>{const detail=(event as CustomEvent<BoardHeaderState>).detail;if(detail.boardId===boardId)setState(detail);};
    window.addEventListener(BOARD_HEADER_STATE_EVENT,update);return()=>window.removeEventListener(BOARD_HEADER_STATE_EVENT,update);
  },[boardId]);
  const saveLabel=state.saveState==="clean"?"修改后保存":state.saveState==="saving"?"保存中":state.saveState==="saved"?"已保存":state.saveState==="error"?"未保存":"待保存";
  return <div className="tennis-header board-header">
    <ProductWordmark compact />
    <button className="header-back" aria-label="返回上一页" onClick={()=>sendBoardAction(boardId,"back")}><ChevronLeftIcon/></button>
    <button className="board-header-title" aria-label={`修改${state.title}名称`} onClick={()=>sendBoardAction(boardId,"rename")}><span><strong>{state.title}</strong><Pencil2Icon/></span><small className={`board-save-status is-${state.saveState}`}><CheckCircledIcon/>{saveLabel}</small></button>
    <div className="board-header-actions">
      <button aria-label="撤销" disabled={!state.canUndo} onClick={()=>sendBoardAction(boardId,"undo")}><CounterClockwiseClockIcon/></button>
      <button aria-label="重做" disabled={!state.canRedo} onClick={()=>sendBoardAction(boardId,"redo")}><UpdateIcon/></button>
      <button className="board-header-restore" aria-label={state.canRestore?"还原标准发球站位，可撤销":"现在就是发球站位"} disabled={!state.canRestore} onClick={()=>sendBoardAction(boardId,"restore")}><ResetIcon/></button>
      <button aria-label={`打开${state.title}的画板菜单`} aria-haspopup="dialog" onClick={()=>sendBoardAction(boardId,"files")}><DotsHorizontalIcon/></button>
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

function curveControl(from:BoardPoint,to:BoardPoint,bendRight=true):BoardPoint {
  const dx=to[0]-from[0],dy=to[1]-from[1];
  const midpoint:BoardPoint=[(from[0]+to[0])/2,(from[1]+to[1])/2];
  if(bendRight){
    const xBend=Math.max(.05,Math.min(.12,Math.hypot(dx,dy)*.16));
    return clampBoardPoint([
      midpoint[0]+xBend,
      midpoint[1]+Math.max(-.08,Math.min(.08,dx*.12)),
    ]);
  }
  return clampBoardPoint([
    midpoint[0]+Math.max(-.12,Math.min(.12,dy*.16)),
    midpoint[1]-Math.max(-.08,Math.min(.08,dx*.12)),
  ]);
}

type HomeDraftsStatus = "loading" | "ready" | "error";

const HOME_BOARD_PURPOSES:BoardPurpose[]=["tactic","practice","review"];
const HOME_BOARD_PURPOSE_TITLES:Record<BoardPurpose,string>={
  tactic:"我的战术板",
  practice:"练习球路",
  review:"刚才那一分",
};
const HOME_BOARD_PURPOSE_ACTIONS:Record<BoardPurpose,string>={
  tactic:"画一条新球路",
  practice:"画练习球路",
  review:"记下一分",
};

function homeBoardDate(updatedAt:string) {
  return new Date(updatedAt).toLocaleDateString("zh-CN",{month:"numeric",day:"numeric"});
}

function BoardHome({ openBoard, openKnowledge, openLibrary }:{openBoard:(board:BoardDocument,persisted?:boolean,intent?:"review")=>void;openKnowledge:(mode:"tactics"|"combinations",category?:CategoryFilter)=>void;openLibrary:()=>void}) {
  const [drafts,setDrafts]=useState<BoardDocument[]>([]),[draftsStatus,setDraftsStatus]=useState<HomeDraftsStatus>("loading"),[storageError,setStorageError]=useState("");
  const [activePurpose,setActivePurpose]=useState<BoardPurpose>("tactic"),[historyRevealed,setHistoryRevealed]=useState(false);
  const historyHubRef=useRef<HTMLElement|null>(null),purposeTouchedRef=useRef(false);
  const refresh=useCallback(()=>{const result=readBoards();if(result.ok){setDrafts(result.value);setDraftsStatus("ready");setStorageError("");if(!purposeTouchedRef.current&&result.value[0])setActivePurpose(getBoardPurpose(result.value[0]));}else{setDraftsStatus("error");setStorageError("暂时读不到此浏览器里的画板，请重试");}},[]);
  useEffect(()=>{refresh();window.addEventListener(BOARD_DRAFTS_EVENT,refresh);return()=>window.removeEventListener(BOARD_DRAFTS_EVENT,refresh);},[refresh]);
  useEffect(()=>{const scroll=historyHubRef.current?.closest<HTMLElement>(".mobile-scroll");if(!scroll)return;const reveal=()=>{if(scroll.scrollTop>24)setHistoryRevealed(true);};scroll.addEventListener("scroll",reveal,{passive:true});reveal();return()=>scroll.removeEventListener("scroll",reveal);},[]);
  const latestPlayableBoard=useMemo(()=>findLatestPlayableBoard(drafts),[drafts]);
  const visibleHistory=useMemo(()=>drafts.filter(board=>getBoardPurpose(board)===activePurpose).slice(0,4),[activePurpose,drafts]);
  const draftsPending=drafts.length===0&&draftsStatus!=="ready";
  const openLatestBoard=()=>{if(draftsPending&&draftsStatus==="error"){refresh();return;}if(draftsPending)return;openBoard(latestPlayableBoard??{...createStarterBoard("我的战术板"),purpose:"tactic"},Boolean(latestPlayableBoard));};
  const openNewBoard=(purpose:BoardPurpose)=>{const board={...createStarterBoard(HOME_BOARD_PURPOSE_TITLES[purpose]),purpose};openBoard(board,false,purpose==="review"?"review":undefined);};
  const revealHistory=()=>{setHistoryRevealed(true);historyHubRef.current?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"});};
  const latestBoardAction=latestPlayableBoard?"接着画":"画第一拍";
  return <MobileScroll className="board-home-scroll"><main className="board-home board-home-portrait">
    <section className="home-primary-screen" aria-label="画板快捷入口">
      <h1 className="home-question">下一分，怎么打？</h1>
      {storageError&&<div className="board-error-action" role="alert"><span>{storageError}</span><button onClick={refresh}>重试</button></div>}
      <div className="home-preview-card">
        <div className="home-board-playback-slot"><div className={draftsPending?"home-board-playback-source is-concealed":"home-board-playback-source"} aria-hidden={draftsPending?"true":undefined} inert={draftsPending?true:undefined}><HomeBoardPlayback board={latestPlayableBoard} active={!draftsPending} showReplay={false} onOpenBoard={openBoard}/></div>{draftsPending&&<div className="home-board-playback-pending" role="status" aria-label={draftsStatus==="loading"?"正在打开你的画板":"暂时无法打开画板"}><UpdateIcon aria-hidden="true"/><span className="board-sr-only">{draftsStatus==="loading"?"正在打开你的画板":"暂时无法打开画板"}</span></div>}</div>
      </div>
      {!draftsPending&&<button className="home-plan-primary" aria-label={latestPlayableBoard?`接着画${latestPlayableBoard.title}`:"画第一拍"} onClick={openLatestBoard}><strong>{latestBoardAction}</strong></button>}
      <div className="home-intent-actions" aria-label="开始画板">
        <button onClick={()=>openNewBoard("tactic")}><Pencil2Icon/><span>想下一分</span></button>
        <button onClick={()=>openNewBoard("review")}><ReaderIcon/><span>记下刚才一分</span></button>
      </div>
      <button className={`home-scroll-cue${historyRevealed?" is-revealed":""}`} data-testid="home-scroll-cue" aria-label="上滑查看画板历史" aria-controls="home-history-hub" onClick={revealHistory}><span>上滑看我的画板</span><ChevronDownIcon aria-hidden="true"/></button>
    </section>
    <section ref={historyHubRef} id="home-history-hub" className="home-history-hub" data-testid="home-history-hub" aria-labelledby="home-history-title">
      <div className="home-history-heading"><h2 id="home-history-title">我的画板</h2>{draftsStatus==="ready"&&<span>{drafts.length} 份</span>}</div>
      <div className="home-purpose-filters" aria-label="按用途找画板">
        {HOME_BOARD_PURPOSES.map(purpose=><button key={purpose} aria-pressed={activePurpose===purpose} onClick={()=>{purposeTouchedRef.current=true;setActivePurpose(purpose);}}><span>{BOARD_PURPOSE_LABELS[purpose]}</span></button>)}
      </div>
      {draftsStatus==="loading"&&drafts.length===0?<div className="home-history-empty" role="status">正在打开你的画板…</div>:draftsStatus==="error"&&drafts.length===0?<div className="home-history-empty"><span>画板暂时打不开</span><button onClick={refresh}>重试</button></div>:visibleHistory.length?<div className="home-history-list">{visibleHistory.map(board=>{const purpose=getBoardPurpose(board);return <button key={board.id} data-testid="home-history-board" data-board-id={board.id} onClick={()=>openBoard(board,true)}><span className={`home-history-purpose is-${purpose}`}>{BOARD_PURPOSE_LABELS[purpose]}</span><span className="home-history-copy"><strong>{board.title}</strong><small>{board.frames.length} 拍 · {homeBoardDate(board.updatedAt)}</small></span><ChevronRightIcon aria-hidden="true"/></button>;})}</div>:<div className="home-history-empty">还没有{BOARD_PURPOSE_LABELS[activePurpose]}画板</div>}
      <div className="home-history-actions">
        <button className="home-history-new" onClick={()=>openNewBoard(activePurpose)}><PlusIcon/><span>{HOME_BOARD_PURPOSE_ACTIONS[activePurpose]}</span></button>
        {drafts.length>0&&<button className="home-history-all" onClick={openLibrary}><span>全部画板</span><ChevronRightIcon/></button>}
      </div>
    </section>
    <section className="home-knowledge-section" aria-label="战术知识库入口">
      <button className="home-knowledge-entry" onClick={()=>openKnowledge("tactics")}><TargetIcon/><span>找个打法</span><ChevronRightIcon/></button>
    </section>
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
type BoardMediaState =
  | { status:"idle" }
  | { status:"generating"; kind:"video"|"gif"; progress:number }
  | { status:"ready"; result:BoardMediaExport; url:string }
  | { status:"error"; kind:"video"|"gif"; message:string };
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
  sourceFrameIndex?:number;
  path?:{kind:"shot"|"feed"|"move";actorId:string;from:BoardPoint};
  latestBoard?:BoardDocument;
  lastPoint?:BoardPoint;
  stableClient?:BoardPoint;
  stableSince?:number;
  pace?:BoardShotPace;
};

type BoardChargeFeedback = {pathId:string;point:BoardPoint;pace:BoardShotPace;progress:number;marquee:number};
// An 0.8-second pause at the landing point is required before pace selection
// activates. A normal drag therefore stays on the default Control pace.
const BOARD_CHARGE_STABLE_DELAY_MS=800;
const BOARD_CHARGE_MAX_MS=700;
const BOARD_CHARGE_MARQUEE_PERIOD_MS:Record<BoardShotPace,number>={control:1100,drive:700,"put-away":380};

/**
 * Smart continuation is explicit document state. Shape alone never opts an
 * imported or tactic-derived board into guided authoring.
 */
function getSmartBoardContinuation(board:BoardDocument):SmartBoardContinuation|null {
  const smart=board.smartRally;if(!smart||smart.version!==2)return null;
  const frameIndex=board.frames.findIndex(frame=>frame.id===smart.frameId);
  if(frameIndex<0||frameIndex!==board.frames.length-1)return null;
  const players=board.actors.filter(actor=>actor.kind==="player"),balls=board.actors.filter(actor=>actor.kind==="ball");
  if(players.length!==2||balls.length!==1||!players.some(player=>player.id===smart.hitterId))return null;
  const frame=board.frames[frameIndex],actor=board.actors.find(item=>item.id===smart.actorId);
  if(!actor||!frame.poses[actor.id]||frame.paths.length>0)return null;
  const hasEarlierPaths=board.frames.slice(0,frameIndex).some(candidate=>candidate.paths.length>0);
  const previousHasShot=frameIndex>0&&board.frames[frameIndex-1].paths.some(path=>path.actorId===balls[0].id&&(path.kind==="shot"||path.kind==="feed"));
  if((smart.phase==="move"&&!previousHasShot)||(smart.phase==="shot"&&hasEarlierPaths&&!previousHasShot))return null;
  if(smart.phase==="shot"&&actor.kind!=="ball")return null;
  if(smart.phase==="move"&&(actor.kind!=="player"||actor.id!==smart.hitterId))return null;
  return {frameIndex,phase:smart.phase,hitterId:smart.hitterId,actorId:smart.actorId};
}

type BoardCanvasCompletion = {
  selection:BoardSelection;
  created:boolean;
  gesture:BoardDrag["kind"];
  base:BoardDocument;
  path?:BoardDrag["path"];
};

function BoardCanvas({board,frameIndex,selection,setSelection,tool,actorPreset,pathKind,markPreset,curved,smartEnabled,contextPaths,contextFrameIndex,previewing,elapsed,display,preview,commit,finishPreview,onComplete,onOverride,onCancel,onNudge,onDelete,onError,onTogglePathCurve}: {
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
  contextFrameIndex:number|null;
  previewing:boolean;
  elapsed:number;
  display:BoardDisplayPreferences;
  preview:(next:BoardDocument)=>void;
  commit:(next:BoardDocument)=>void;
  finishPreview:(base:BoardDocument,cancel?:boolean)=>void;
  onComplete:(completion:BoardCanvasCompletion)=>void;
  onOverride:(actor:BoardActor)=>void;
  onCancel:(base:BoardDocument,selectionBefore:BoardSelection|null)=>void;
  onNudge:(dx:number,dy:number)=>void;
  onDelete:()=>void;
  onError:(message:string)=>void;
  onTogglePathCurve:()=>void;
}) {
  const holderRef=useRef<HTMLDivElement>(null),canvasRef=useRef<HTMLCanvasElement>(null),drawRef=useRef<()=>void>(()=>{}),dragRef=useRef<BoardDrag|null>(null),chargeRef=useRef<BoardChargeFeedback|null>(null),chargeAnimationRef=useRef<number|null>(null),chargePaceRef=useRef<BoardShotPace>("control");
  const [canvasSize,setCanvasSize]=useState({width:0,height:0});
  const latest=useRef({board,frameIndex,selection,contextPaths,contextFrameIndex,previewing,elapsed,display});latest.current={board,frameIndex,selection,contextPaths,contextFrameIndex,previewing,elapsed,display};
  useLayoutEffect(()=>{
    const canvas=canvasRef.current,holder=holderRef.current;if(!canvas||!holder)return;
    const draw=()=>{
      const current=latest.current,width=holder.clientWidth,height=holder.clientHeight,dpr=Math.min(window.devicePixelRatio||1,3);
      if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
      setCanvasSize(size=>size.width===width&&size.height===height?size:{width,height});
      const ctx=canvas.getContext("2d");if(!ctx)return;ctx.setTransform(dpr,0,0,dpr,0,0);
      const pose=current.previewing?getBoardPose(current.board,current.elapsed):null;
      const targetIndex=pose?.frameIndex??current.frameIndex,frame=current.board.frames[targetIndex];if(!frame)return;
      renderBoard(ctx,width,height,frame,current.board.actors,{progress:pose?.progress??0,playing:current.previewing,selection:current.selection,showLegend:false,showLabels:true,showActorLabels:false,contextPaths:current.contextPaths,contextFrameIndex:current.contextFrameIndex??undefined,surface:current.display.surface,showZones:current.display.showZones,showZoneLabels:current.display.showZoneLabels,charge:current.previewing?null:chargeRef.current});
    };
    drawRef.current=draw;const resize=new ResizeObserver(draw);resize.observe(holder);draw();return()=>resize.disconnect();
  },[]);
  useEffect(()=>drawRef.current(),[board,contextFrameIndex,contextPaths,frameIndex,selection,previewing,elapsed,display]);

  const stopCharge=useCallback(()=>{
    if(chargeAnimationRef.current!==null)cancelAnimationFrame(chargeAnimationRef.current);
    chargeAnimationRef.current=null;chargeRef.current=null;chargePaceRef.current="control";drawRef.current();
  },[]);
  const keepCharging=useCallback(()=>{
    if(chargeAnimationRef.current!==null)return;
    const tick=(now:number)=>{
      const drag=dragRef.current;
      if(!drag||drag.kind!=="path"||!drag.path||drag.path.kind==="move"||drag.stableSince===undefined||!drag.lastPoint){stopCharge();return;}
      const hold=Math.max(0,now-drag.stableSince-BOARD_CHARGE_STABLE_DELAY_MS),pace=getShotPaceForHold(hold);
      if(pace!==chargePaceRef.current){chargePaceRef.current=pace;drag.pace=pace;navigator.vibrate?.(pace==="put-away"?18:10);}
      const progress=Math.min(1,hold/BOARD_CHARGE_MAX_MS);
      const marquee=(now/BOARD_CHARGE_MARQUEE_PERIOD_MS[pace])%1;
      chargeRef.current={pathId:drag.id,point:drag.lastPoint,pace,progress,marquee};
      drawRef.current();chargeAnimationRef.current=requestAnimationFrame(tick);
    };
    chargeAnimationRef.current=requestAnimationFrame(tick);
  },[stopCharge]);
  useEffect(()=>()=>{if(chargeAnimationRef.current!==null)cancelAnimationFrame(chargeAnimationRef.current);},[]);

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
      const preferredSelection=selection?.kind==="actor"||selection?.kind==="element"&&selection.frameIndex!==undefined?selection:tool==="select"?selection:null;
      const contextCanReceiveInput=tool!=="actor"&&tool!=="mark";
      const hit=hitTestBoard(pixel,event.currentTarget.clientWidth,event.currentTarget.clientHeight,frame,board.actors,preferredSelection,{contextPaths:contextCanReceiveInput?contextPaths:[],contextFrameIndex:contextCanReceiveInput?contextFrameIndex??undefined:undefined});
      if(hit?.kind==="handle"){
        const sourceFrameIndex=hit.frameIndex??frameIndex,path=board.frames[sourceFrameIndex]?.paths.find(item=>item.id===hit.id),handlePoint=hit.handle==="control"&&!path?.control&&path?[(path.from[0]+path.to[0])/2,(path.from[1]+path.to[1])/2] as BoardPoint:path?.[hit.handle];
        if(!handlePoint)return;
        dragRef.current={pointerId:event.pointerId,base:board,kind:"handle",id:hit.id,handle:hit.handle,sourceFrameIndex,startClient:[event.clientX,event.clientY],offset:[handlePoint[0]-point[0],handlePoint[1]-point[1]],moved:false,selectionBefore:selection};
        setSelection({kind:"element",id:hit.id,...(sourceFrameIndex===frameIndex?{}:{frameIndex:sourceFrameIndex})});event.currentTarget.setPointerCapture(event.pointerId);return;
      }
      if(hit?.kind==="element"&&hit.frameIndex!==undefined&&hit.frameIndex!==frameIndex){setSelection(hit);return;}
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
      else if(drag.kind==="handle"){
        const sourceIndex=drag.sourceFrameIndex??frameIndex;
        let next=updatePath(drag.base,sourceIndex,drag.id,{[drag.handle!]:withOffset(point)});
        const changedPath=next.frames[sourceIndex]?.paths.find(candidate=>candidate.id===drag.id);
        if(changedPath?.pace)next=applyShotPace(next,sourceIndex,drag.id,changedPath.pace);
        drag.latestBoard=next;preview(next);
      }
      else if(drag.kind==="path"){
        const path=drag.path;if(path){
          const control=curved?curveControl(path.from,point,path.kind!=="move"):undefined;
          const next=setPath(drag.base,frameIndex,{id:drag.id,kind:path.kind,actorId:path.actorId,from:path.from,to:point,...(control?{control}:{})});
          drag.latestBoard=next;drag.lastPoint=point;
          if(path.kind!=="move"){
            const movedFromStable=!drag.stableClient||Math.hypot(pixel[0]-drag.stableClient[0],pixel[1]-drag.stableClient[1])>4;
            if(movedFromStable){drag.stableClient=pixel;drag.stableSince=performance.now();drag.pace="control";chargePaceRef.current="control";}
            keepCharging();
          }
          preview(next);setSelection({kind:"element",id:drag.id});
        }
      }else if(drag.kind==="freehand"){
        const points=[...(drag.points??[]),point];drag.points=points;const mark=markFromPreset("freehand",points[0]);mark.id=drag.id;mark.points=points;preview(addMark(drag.base,frameIndex,mark));
        setSelection({kind:"element",id:drag.id});
      }
    }catch(error){onError(error instanceof Error?error.message:"无法拖动画板元素");}
  };
  const endPointer=(event:ReactPointerEvent<HTMLDivElement>,cancel=false)=>{
    const drag=dragRef.current;if(!drag||drag.pointerId!==event.pointerId)return;dragRef.current=null;
    try{event.currentTarget.releasePointerCapture(event.pointerId);}catch{/* pointer may already be released */}
    if(cancel){stopCharge();finishPreview(drag.base,true);onCancel(drag.base,drag.selectionBefore);return;}
    if(!drag.moved){stopCharge();return;}
    if(drag.kind==="path"&&drag.path&&drag.path.kind!=="move"){
      const held=Math.max(0,performance.now()-(drag.stableSince??performance.now())-BOARD_CHARGE_STABLE_DELAY_MS);
      const pace=getShotPaceForHold(held);
      try{
        const routed=drag.latestBoard??board;
        const paced=applyShotPace(routed,frameIndex,drag.id,pace);
        drag.latestBoard=paced;preview(paced);navigator.vibrate?.(pace==="put-away"?22:pace==="drive"?12:6);
      }catch(reason){onError(reason instanceof Error?reason.message:"无法保存球速");}
    }
    stopCharge();
    finishPreview(drag.base);
    onComplete({selection:drag.kind==="actor"?{kind:"actor",id:drag.id}:{kind:"element",id:drag.id,...(drag.sourceFrameIndex===undefined||drag.sourceFrameIndex===frameIndex?{}:{frameIndex:drag.sourceFrameIndex})},created:drag.kind==="path"||drag.kind==="freehand",gesture:drag.kind,base:drag.base,path:drag.path});
  };
  const onKeyDown=(event:React.KeyboardEvent<HTMLDivElement>)=>{
    if(previewing||!selection)return;
    const step=event.shiftKey?.05:.02;
    const delta:Partial<Record<string,BoardPoint>>={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]};
    if(delta[event.key]){event.preventDefault();onNudge(...delta[event.key]!);}
    else if(event.key==="Delete"||event.key==="Backspace"){event.preventDefault();onDelete();}
  };
  const selectedPathForToggle=selection?.kind==="element"
    ? board.frames[selection.frameIndex??frameIndex]?.paths.find(path=>path.id===selection.id)
      ?? (selection.frameIndex===contextFrameIndex?contextPaths.find(path=>path.id===selection.id):undefined)
    : undefined;
  const toggleGeometry=canvasSize.width>0?getBoardGeometry(canvasSize.width,canvasSize.height):null;
  const togglePoint=selectedPathForToggle&&selectedPathForToggle.kind!=="move"&&toggleGeometry
    ? (()=>{
      const from=toggleGeometry.toCanvas(selectedPathForToggle.from),to=toggleGeometry.toCanvas(selectedPathForToggle.to);
      const route=selectedPathForToggle.control?toggleGeometry.toCanvas([(selectedPathForToggle.from[0]+2*selectedPathForToggle.control[0]+selectedPathForToggle.to[0])/4,(selectedPathForToggle.from[1]+2*selectedPathForToggle.control[1]+selectedPathForToggle.to[1])/4]):[(from[0]+to[0])/2,(from[1]+to[1])/2];
      const dx=to[0]-from[0],dy=to[1]-from[1],length=Math.max(1,Math.hypot(dx,dy)),normal=[-dy/length,dx/length] as [number,number],offset=42;
      const clampPoint=(point:[number,number])=>[Math.max(20,Math.min(canvasSize.width-20,point[0])),Math.max(20,Math.min(canvasSize.height-20,point[1]))] as [number,number];
      const candidates=[clampPoint([route[0]+normal[0]*offset,route[1]+normal[1]*offset]),clampPoint([route[0]-normal[0]*offset,route[1]-normal[1]*offset])];
      if(!selectedPathForToggle.control)return candidates[0];
      const control=toggleGeometry.toCanvas(selectedPathForToggle.control);
      return candidates.sort((a,b)=>Math.hypot(b[0]-control[0],b[1]-control[1])-Math.hypot(a[0]-control[0],a[1]-control[1]))[0];
    })()
    : null;
  const directToggleLabel=selectedPathForToggle?.control?"一键改直线":"恢复曲线";
  return <div ref={holderRef} className="board-canvas" data-testid="board-canvas" data-scroll-drag="ignore" tabIndex={0} role="application" aria-label="可编辑网球战术画板。标准双人画板可直接从网球拖出球路，放开后会自动接续接球方跑位与下一拍；播放时，接球方跑位会与来球同步。点选任一球员或网球可随时改写当前操作。方向键可微调，Delete 键删除。" onKeyDown={onKeyDown} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={event=>endPointer(event)} onPointerCancel={event=>endPointer(event,true)}><canvas ref={canvasRef}/>{togglePoint&&<button type="button" className="board-path-direct-toggle" aria-label={directToggleLabel} title={directToggleLabel} style={{left:togglePoint[0],top:togglePoint[1]}} onPointerDown={event=>{event.preventDefault();event.stopPropagation();}} onClick={event=>{event.preventDefault();event.stopPropagation();onTogglePathCurve();}}>{selectedPathForToggle?.control?<MinusIcon aria-hidden="true"/>:<CornerTopRightIcon aria-hidden="true"/>}</button>}</div>;
}

function BoardRenameLayer({open,value,error,onChange,onCancel,onSubmit}:{open:boolean;value:string;error:string;onChange:(value:string)=>void;onCancel:()=>void;onSubmit:()=>void}) {
  const {screenRef}=useScreenPortal();
  const {device}=useMobileDevice();
  const inputRef=useRef<HTMLInputElement>(null);
  const cancel=()=>{inputRef.current?.blur();onCancel();};
  const submit=()=>{inputRef.current?.blur();onSubmit();};
  return <Dialog.Root open={open} onOpenChange={next=>{if(!next)onCancel();}}>
    <Dialog.Portal container={screenRef.current??undefined} forceMount>
      {open&&<Dialog.Content className="board-rename-layer" data-testid="board-rename-layer" style={{"--board-rename-safe-top":`${device.geometry.safeArea.top}px`} as CSSProperties} onOpenAutoFocus={event=>{event.preventDefault();window.setTimeout(()=>{inputRef.current?.focus();inputRef.current?.select();},0);}} onCloseAutoFocus={event=>event.preventDefault()}>
        <header className="board-rename-header">
          <button onClick={cancel}>取消</button>
          <Dialog.Title>修改名称</Dialog.Title>
          <button className="is-primary" onClick={submit}>完成</button>
        </header>
        <div className="board-rename-content">
          <div className="board-rename-field"><label htmlFor="board-rename-title">画板名称</label><div className="board-rename-input-wrap"><KeyboardInput id="board-rename-title" ref={inputRef} value={value} maxLength={60} autoComplete="off" enterKeyHint="done" onChange={event=>onChange(event.currentTarget.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.nativeEvent.isComposing){event.preventDefault();submit();}}}/><button type="button" aria-label="清空画板名称" disabled={!value} onPointerDown={event=>event.preventDefault()} onClick={()=>{onChange("");inputRef.current?.focus();}}><CrossCircledIcon/></button></div><small>1–60 个字</small></div>
          {error&&<p className="board-rename-error" role="alert">{error}</p>}
          <Dialog.Description className="board-sr-only">独立修改画板名称；键盘出现时画板不会缩放。</Dialog.Description>
        </div>
      </Dialog.Content>}
    </Dialog.Portal>
  </Dialog.Root>;
}

type BoardFileSurface = null | "menu" | "save-share" | "media" | "rename";
type WebkitFullscreenDocument = Document & {webkitFullscreenElement?:Element|null;webkitExitFullscreen?:()=>Promise<void>|void};
type WebkitFullscreenElement = HTMLElement & {webkitRequestFullscreen?:()=>Promise<void>|void};
let boardFullscreenSessionSequence=0;
const boardFullscreenOwners=new WeakMap<HTMLElement,string>();

function activeFullscreenElement() {
  return document.fullscreenElement??(document as WebkitFullscreenDocument).webkitFullscreenElement??null;
}

function screenOwnsFullscreen(screen: HTMLElement | null) {
  const fullscreen=activeFullscreenElement();
  return !!screen&&!!fullscreen&&(fullscreen===screen||screen.contains(fullscreen));
}

function boardFullscreenOwner(screen:HTMLElement|null) {
  return screen?boardFullscreenOwners.get(screen):undefined;
}

function boardSessionOwnsFullscreen(screen:HTMLElement|null,session:string) {
  return !!screen&&boardFullscreenOwners.get(screen)===session;
}

function claimBoardFullscreen(screen:HTMLElement,session:string) {
  boardFullscreenOwners.set(screen,session);
}

function releaseBoardFullscreen(screen:HTMLElement|null,session:string) {
  if(screen&&boardFullscreenOwners.get(screen)===session)boardFullscreenOwners.delete(screen);
}

function exitScreenFullscreenBestEffort(screen:HTMLElement|null) {
  if(!screenOwnsFullscreen(screen))return;
  const documentWithWebkit=document as WebkitFullscreenDocument;
  const exit=document.exitFullscreen?.bind(document)??documentWithWebkit.webkitExitFullscreen?.bind(documentWithWebkit);
  try{
    const result=exit?.();
    if(result instanceof Promise)result.catch(()=>undefined);
  }catch{/* browser exit is best effort after its owning editor has gone */}
}

function shouldRequestNativeBoardFullscreen() {
  return !window.matchMedia("(any-pointer: coarse)").matches;
}

function BoardEditor({ initialBoard, initialPersisted=false, migrationSource, legacyNeedsReview=false, entryIntent, entryNotice, back, openLibrary }:{initialBoard:BoardDocument;initialPersisted?:boolean;migrationSource?:BoardDocument;legacyNeedsReview?:boolean;entryIntent?:"review";entryNotice?:string;back:()=>void;openLibrary:()=>void}) {
  const keyboard=useKeyboard();
  const {screenRef}=useScreenPortal();
  const initialSmart=getSmartBoardContinuation(initialBoard);
  const [board,setBoardState]=useState(initialBoard),[frameIndex,setFrameIndex]=useState(initialSmart?.frameIndex??0),[selection,setSelection]=useState<BoardSelection|null>(initialSmart?{kind:"actor",id:initialSmart.actorId}:null),[committedRevision,setCommittedRevision]=useState(0);
  const [past,setPast]=useState<BoardDocument[]>(migrationSource?[migrationSource]:[]),[future,setFuture]=useState<BoardDocument[]>([]),[saveState,setSaveState]=useState<BoardSaveState>(migrationSource?"dirty":initialPersisted?"saved":"clean"),[error,setError]=useState(""),[notice,setNotice]=useState(migrationSource?"已将旧版跑位改为与来球同步；可撤销为手动时间线。":legacyNeedsReview?"这份旧版时间线无法安全自动同步，已切换为手动编辑，请检查拍次。":entryNotice??"");
  const [tool,setTool]=useState<BoardTool>(initialSmart?.phase??"select"),[actorPreset,setActorPreset]=useState<ActorPreset>("me"),[pathKind,setPathKind]=useState<"shot"|"feed">("shot"),[markPreset,setMarkPreset]=useState<MarkPreset>("target"),[curved,setCurved]=useState(true);
  const [viewMode,setViewMode]=useState<"edit"|"preview">("edit"),[isPlaying,setIsPlaying]=useState(false),[elapsed,setElapsed]=useState(0),[speed,setSpeed]=useState(1);
  const [fileSurface,setFileSurface]=useState<BoardFileSurface>(null),[historyOpen,setHistoryOpen]=useState(false),[frameOpen,setFrameOpen]=useState(false),[drillOpen,setDrillOpen]=useState(false),[helpOpen,setHelpOpen]=useState(false),[toolPalette,setToolPalette]=useState<"add"|null>(null),[immersive,setImmersive]=useState(true);
  const [display,setDisplay]=useState<BoardDisplayPreferences>(()=>getBoardDisplayPreferences());
  const [mediaState,setMediaState]=useState<BoardMediaState>({status:"idle"});
  const [titleDraft,setTitleDraft]=useState(board.title),[frameLabel,setFrameLabel]=useState(board.frames[0]?.label??"");
  const editorRef=useRef<HTMLDivElement>(null),selectToolRef=useRef<HTMLButtonElement>(null),playbackToggleRef=useRef<HTMLButtonElement>(null),sheetOpenerRef=useRef<HTMLElement|null>(null),sheetFocusTimerRef=useRef<number|null>(null),boardRef=useRef(board),committedBoardRef=useRef(board),needsSaveRef=useRef(Boolean(migrationSource)),focusPlaybackEntryRef=useRef(false),focusPlaybackExitRef=useRef(false),playbackReturnFrameIdRef=useRef<string|null>(null),playbackResumeSmartRef=useRef(false),mediaAbortRef=useRef<AbortController|null>(null),mediaUrlRef=useRef<string|null>(null),nativeFullscreenOwnedRef=useRef(false),immersiveDesiredRef=useRef(true),fullscreenOperationRef=useRef(0),fullscreenRequestPendingRef=useRef(false),fullscreenExitPendingRef=useRef(false),exitAnnouncementRef=useRef(true),afterImmersiveExitRef=useRef<null|(()=>void)>(null),fullscreenSessionRef=useRef("");boardRef.current=board;
  if(!fullscreenSessionRef.current)fullscreenSessionRef.current=`board-fullscreen-${++boardFullscreenSessionSequence}`;
  const smartContinuation=getSmartBoardContinuation(board);
  const playbackBoard=useMemo(()=>{
    const prepared=prepareBoardForMedia(board),frames=prepared.frames;
    return frames.some(item=>item.paths.length)?prepared:{...prepared,frames:frames.slice(0,1).map(item=>({...item,duration:0}))};
  },[board]);
  const hasPlayablePath=playbackBoard.frames.some(item=>item.paths.length>0);
  const boardAtStarter=isStarterBoardState(board);
  const playbackFrameCount=hasPlayablePath?playbackBoard.frames.length:0;
  const totalDuration=getBoardDuration(playbackBoard),frame=board.frames[frameIndex]??board.frames[0];
  const selectedActor=selection?.kind==="actor"?board.actors.find(actor=>actor.id===selection.id):undefined;
  const selectedElementFrameIndex=selection?.kind==="element"&&selection.frameIndex!==undefined?selection.frameIndex:frameIndex;
  const selectedElementFrame=board.frames[selectedElementFrameIndex];
  const selectedPath=selection?.kind==="element"?selectedElementFrame?.paths.find(path=>path.id===selection.id):undefined;
  const selectedMark=selection?.kind==="element"?selectedElementFrame?.marks.find(mark=>mark.id===selection.id):undefined;
  const drill=BOARD_DRILLS.find(item=>item.id===board.drillId)??getDrillForTactic(board.sourceTacticId);
  const setSheetVisibility=useCallback((setter:(open:boolean)=>void,nextOpen:boolean)=>{if(!nextOpen)keyboard.hide();setter(nextOpen);},[keyboard]);
  const rememberSheetOpener=useCallback((opener:HTMLElement)=>{if(sheetFocusTimerRef.current!==null)window.clearTimeout(sheetFocusTimerRef.current);sheetOpenerRef.current=opener;},[]);
  const restoreSheetFocus=useCallback((destination:"opener"|"canvas")=>{if(sheetFocusTimerRef.current!==null)window.clearTimeout(sheetFocusTimerRef.current);const opener=sheetOpenerRef.current;sheetFocusTimerRef.current=window.setTimeout(()=>{const canvas=editorRef.current?.querySelector<HTMLElement>('[data-testid="board-canvas"]');const target=destination==="canvas"?canvas:opener?.isConnected?opener:selectToolRef.current;(target??selectToolRef.current)?.focus();sheetOpenerRef.current=null;sheetFocusTimerRef.current=null;},360);},[]);
  const closeBoardSurfaces=useCallback(()=>{mediaAbortRef.current?.abort();mediaAbortRef.current=null;if(mediaUrlRef.current){URL.revokeObjectURL(mediaUrlRef.current);mediaUrlRef.current=null;}setMediaState({status:"idle"});setFileSurface(null);setHistoryOpen(false);setFrameOpen(false);setDrillOpen(false);setHelpOpen(false);setToolPalette(null);keyboard.hide();},[keyboard]);
  const finishImmersiveExit=useCallback((announce=exitAnnouncementRef.current,message="已退出全屏战术板。")=>{
    const screen=screenRef.current;
    const stage=screen?.closest<HTMLElement>(".phone-stage");
    const ownsSession=boardSessionOwnsFullscreen(screen,fullscreenSessionRef.current);
    const afterExit=ownsSession?afterImmersiveExitRef.current:null;
    afterImmersiveExitRef.current=null;
    releaseBoardFullscreen(screen,fullscreenSessionRef.current);
    fullscreenRequestPendingRef.current=false;
    fullscreenExitPendingRef.current=false;
    nativeFullscreenOwnedRef.current=false;
    immersiveDesiredRef.current=false;
    setImmersive(false);
    if(!ownsSession)return;
    if(afterExit){
      if(stage)delete stage.dataset.boardImmersive;
      afterExit();
      return;
    }
    window.requestAnimationFrame(()=>{
      if(announce){
        setNotice(message);
        screenRef.current?.querySelector<HTMLButtonElement>(".board-fullscreen-toggle")?.focus();
      }
    });
  },[screenRef]);
  const recoverNativeExit=useCallback(()=>{
    const screen=screenRef.current;
    fullscreenExitPendingRef.current=false;
    if(!boardSessionOwnsFullscreen(screen,fullscreenSessionRef.current)){
      afterImmersiveExitRef.current=null;
      fullscreenRequestPendingRef.current=false;
      nativeFullscreenOwnedRef.current=false;
      immersiveDesiredRef.current=false;
      setImmersive(false);
      return;
    }
    if(screenOwnsFullscreen(screen)){
      nativeFullscreenOwnedRef.current=true;
      immersiveDesiredRef.current=true;
      setImmersive(true);
      setNotice("系统仍在全屏中；请再点退出或按 Esc。");
      return;
    }
    finishImmersiveExit();
  },[finishImmersiveExit,screenRef]);
  const requestNativeExit=useCallback((announce=true)=>{
    exitAnnouncementRef.current=announce;
    const screen=screenRef.current;
    if(!boardSessionOwnsFullscreen(screen,fullscreenSessionRef.current))return;
    if(!screenOwnsFullscreen(screen)){
      finishImmersiveExit(announce);
      return;
    }
    if(fullscreenExitPendingRef.current)return;
    fullscreenRequestPendingRef.current=false;
    fullscreenExitPendingRef.current=true;
    nativeFullscreenOwnedRef.current=true;
    setImmersive(true);
    const operation=++fullscreenOperationRef.current;
    const documentWithWebkit=document as WebkitFullscreenDocument;
    const exit=document.exitFullscreen?.bind(document)??documentWithWebkit.webkitExitFullscreen?.bind(documentWithWebkit);
    if(!exit){
      recoverNativeExit();
      return;
    }
    try{
      const result=exit();
      if(result instanceof Promise){
        result.then(()=>{
          if(operation!==fullscreenOperationRef.current||!boardSessionOwnsFullscreen(screenRef.current,fullscreenSessionRef.current))return;
          if(screenOwnsFullscreen(screenRef.current))recoverNativeExit();
          else finishImmersiveExit(announce);
        },()=>{
          if(operation===fullscreenOperationRef.current)recoverNativeExit();
        });
      }else if(!screenOwnsFullscreen(screenRef.current))finishImmersiveExit(announce);
    }catch{
      recoverNativeExit();
    }
  },[finishImmersiveExit,recoverNativeExit,screenRef]);
  const exitImmersive=useCallback((announce=true)=>{
    closeBoardSurfaces();
    const screen=screenRef.current;
    if(!boardSessionOwnsFullscreen(screen,fullscreenSessionRef.current)){
      afterImmersiveExitRef.current=null;
      setImmersive(false);
      return;
    }
    immersiveDesiredRef.current=false;
    exitAnnouncementRef.current=announce;
    if(screenOwnsFullscreen(screen)){
      if(fullscreenExitPendingRef.current)return;
      requestNativeExit(announce);
      return;
    }
    if(fullscreenRequestPendingRef.current){
      setImmersive(true);
      if(announce)setNotice("正在退出全屏战术板…");
      return;
    }
    fullscreenOperationRef.current+=1;
    finishImmersiveExit(announce);
  },[closeBoardSurfaces,finishImmersiveExit,requestNativeExit,screenRef]);
  const enterImmersive=useCallback(()=>{
    closeBoardSurfaces();
    const screen=screenRef.current;
    if(!screen)return;
    claimBoardFullscreen(screen,fullscreenSessionRef.current);
    afterImmersiveExitRef.current=null;
    immersiveDesiredRef.current=true;
    fullscreenRequestPendingRef.current=false;
    fullscreenExitPendingRef.current=false;
    nativeFullscreenOwnedRef.current=false;
    setImmersive(true);
    setError("");
    setNotice("已进入全屏战术板；退出按钮会一直保留在顶部。");
    if(!shouldRequestNativeBoardFullscreen())return;
    const target=screen as WebkitFullscreenElement;
    const request=target.requestFullscreen
      ?()=>target.requestFullscreen({navigationUI:"hide"})
      :target.webkitRequestFullscreen
        ?()=>target.webkitRequestFullscreen!()
        :null;
    if(!request)return;
    const operation=++fullscreenOperationRef.current;
    fullscreenRequestPendingRef.current=true;
    try{
      const settleRequest=()=>{
        const currentScreen=screenRef.current;
        const owner=boardFullscreenOwner(currentScreen);
        if(owner!==fullscreenSessionRef.current){
          fullscreenRequestPendingRef.current=false;
          if(!owner&&screenOwnsFullscreen(currentScreen))exitScreenFullscreenBestEffort(currentScreen);
          return;
        }
        if(operation!==fullscreenOperationRef.current)return;
        fullscreenRequestPendingRef.current=false;
        if(!immersiveDesiredRef.current){
          if(screenOwnsFullscreen(currentScreen))requestNativeExit(exitAnnouncementRef.current);
          else finishImmersiveExit(exitAnnouncementRef.current);
          return;
        }
        if(screenOwnsFullscreen(currentScreen))nativeFullscreenOwnedRef.current=true;
        else{
          nativeFullscreenOwnedRef.current=false;
          setNotice("已进入沉浸模式；当前浏览器未开放系统全屏。");
        }
      };
      const result=request();
      if(result instanceof Promise)result.then(settleRequest,settleRequest);
      else settleRequest();
    }catch{
      fullscreenRequestPendingRef.current=false;
      if(!boardSessionOwnsFullscreen(screenRef.current,fullscreenSessionRef.current))return;
      if(!immersiveDesiredRef.current){
        finishImmersiveExit(exitAnnouncementRef.current);
        return;
      }
      if(screenOwnsFullscreen(screenRef.current))nativeFullscreenOwnedRef.current=true;
      else{
        nativeFullscreenOwnedRef.current=false;
        setNotice("已进入沉浸模式；当前浏览器未开放系统全屏。");
      }
    }
  },[closeBoardSurfaces,finishImmersiveExit,requestNativeExit,screenRef]);
  const toggleImmersive=useCallback(()=>{if(immersive)exitImmersive();else enterImmersive();},[enterImmersive,exitImmersive,immersive]);

  const setBoard=useCallback((next:BoardDocument)=>{boardRef.current=next;setBoardState(next);},[]);
  const updateDisplay=useCallback((patch:Partial<BoardDisplayPreferences>)=>{
    const next=setBoardDisplayPreferences(patch);setDisplay(next);return next;
  },[]);
  const markCommitted=useCallback((next:BoardDocument)=>{committedBoardRef.current=next;needsSaveRef.current=true;setBoard(next);setCommittedRevision(value=>value+1);},[setBoard]);
  const resetTransientEditorState=useCallback((next:BoardDocument,followSmart:boolean,preferredFrameId?:string)=>{const smart=getSmartBoardContinuation(next),preferredIndex=preferredFrameId?next.frames.findIndex(item=>item.id===preferredFrameId):-1,targetIndex=followSmart&&smart?smart.frameIndex:preferredIndex>=0?preferredIndex:smart?.frameIndex??0,resumeSmart=!!smart&&followSmart&&targetIndex===smart.frameIndex;setFrameIndex(Math.max(0,Math.min(targetIndex,next.frames.length-1)));setSelection(resumeSmart?{kind:"actor",id:smart.actorId}:null);setTool(resumeSmart?smart.phase:"select");setViewMode("edit");setIsPlaying(false);setElapsed(0);},[]);
  const commit=useCallback((next:BoardDocument)=>{const current=committedBoardRef.current;if(next===current)return;setPast(items=>[...items,current].slice(-50));setFuture([]);markCommitted(next);setSaveState("dirty");setError("");},[markCommitted]);
  const preview=useCallback((next:BoardDocument)=>setBoard(next),[setBoard]);
  const finishPreview=useCallback((base:BoardDocument,cancel=false)=>{if(cancel){setBoard(committedBoardRef.current);return;}const current=boardRef.current;if(current===base)return;const previous=committedBoardRef.current;setPast(items=>[...items,previous].slice(-50));setFuture([]);markCommitted(current);setSaveState("dirty");setError("");},[markCommitted,setBoard]);
  const undo=useCallback(()=>{const previous=past[past.length-1];if(!previous)return;const current=committedBoardRef.current,currentSmart=getSmartBoardContinuation(current),targetSmart=getSmartBoardContinuation(previous),currentFrameId=current.frames[frameIndex]?.id,editingSmartContext=!!currentSmart&&currentSmart.frameIndex===frameIndex&&selection?.kind==="element"&&selection.frameIndex===frameIndex-1,wasFollowing=!!currentSmart&&currentSmart.frameIndex===frameIndex&&(tool===currentSmart.phase&&selection?.kind==="actor"&&selection.id===currentSmart.actorId||editingSmartContext),followSmart=!!targetSmart&&(!currentSmart||wasFollowing);setPast(past.slice(0,-1));setFuture(items=>[current,...items].slice(0,50));markCommitted(previous);resetTransientEditorState(previous,followSmart,currentFrameId);setSaveState("dirty");},[frameIndex,markCommitted,past,resetTransientEditorState,selection,tool]);
  const redo=useCallback(()=>{const next=future[0];if(!next)return;const current=committedBoardRef.current,currentSmart=getSmartBoardContinuation(current),targetSmart=getSmartBoardContinuation(next),currentFrameId=current.frames[frameIndex]?.id,editingSmartContext=!!currentSmart&&currentSmart.frameIndex===frameIndex&&selection?.kind==="element"&&selection.frameIndex===frameIndex-1,wasFollowing=!!currentSmart&&currentSmart.frameIndex===frameIndex&&(tool===currentSmart.phase&&selection?.kind==="actor"&&selection.id===currentSmart.actorId||editingSmartContext),followSmart=!!targetSmart&&(!currentSmart||wasFollowing);setFuture(future.slice(1));setPast(items=>[...items,current].slice(-50));markCommitted(next);resetTransientEditorState(next,followSmart,currentFrameId);setSaveState("dirty");},[frameIndex,future,markCommitted,resetTransientEditorState,selection,tool]);
  const saveNow=useCallback(()=>{const candidate=committedBoardRef.current;if(!needsSaveRef.current)return {ok:true,value:candidate} as const;setSaveState("saving");const result=saveBoard(candidate);if(result.ok){const showingCommitted=boardRef.current===candidate;committedBoardRef.current=result.value;needsSaveRef.current=false;if(showingCommitted)setBoard(result.value);setSaveState("saved");setError("");window.dispatchEvent(new Event(BOARD_DRAFTS_EVENT));}else{setSaveState("error");setError("这次修改尚未保存，请重试");}return result;},[setBoard]);

  useEffect(()=>{if(saveState!=="dirty")return;const timer=window.setTimeout(saveNow,700);return()=>window.clearTimeout(timer);},[committedRevision,saveNow,saveState]);
  useLayoutEffect(()=>{const screen=editorRef.current?.closest<HTMLElement>(".flow-screen");if(!screen)return;screen.classList.add("board-enter-immediate");const timer=window.setTimeout(()=>screen.classList.remove("board-enter-immediate"),600);return()=>{window.clearTimeout(timer);screen.classList.remove("board-enter-immediate");};},[]);
  useLayoutEffect(()=>{const screen=screenRef.current,stage=screen?.closest<HTMLElement>(".phone-stage");if(!screen||!stage)return;const owner=boardFullscreenOwner(screen);if(immersive){if(!owner)claimBoardFullscreen(screen,fullscreenSessionRef.current);if(boardSessionOwnsFullscreen(screen,fullscreenSessionRef.current)){immersiveDesiredRef.current=true;stage.dataset.boardImmersive="true";}}else if(!owner||owner===fullscreenSessionRef.current)delete stage.dataset.boardImmersive;},[immersive,screenRef]);
  useEffect(()=>{
    const changed=()=>{
      const screen=screenRef.current;
      if(!boardSessionOwnsFullscreen(screen,fullscreenSessionRef.current))return;
      const ownsFullscreen=screenOwnsFullscreen(screen);
      if(ownsFullscreen){
        fullscreenRequestPendingRef.current=false;
        nativeFullscreenOwnedRef.current=true;
        setImmersive(true);
        if(!immersiveDesiredRef.current)requestNativeExit(exitAnnouncementRef.current);
        return;
      }
      if(!nativeFullscreenOwnedRef.current&&!fullscreenExitPendingRef.current)return;
      const exitedExternally=immersiveDesiredRef.current;
      fullscreenOperationRef.current+=1;
      closeBoardSurfaces();
      finishImmersiveExit(
        exitedExternally||exitAnnouncementRef.current,
        exitedExternally?"已退出系统全屏。":"已退出全屏战术板。",
      );
    };
    const failed=()=>{
      if(!boardSessionOwnsFullscreen(screenRef.current,fullscreenSessionRef.current))return;
      if(fullscreenExitPendingRef.current){
        recoverNativeExit();
        return;
      }
      if(!fullscreenRequestPendingRef.current)return;
      fullscreenRequestPendingRef.current=false;
      if(!immersiveDesiredRef.current){
        if(screenOwnsFullscreen(screenRef.current))requestNativeExit(exitAnnouncementRef.current);
        else finishImmersiveExit(exitAnnouncementRef.current);
        return;
      }
      if(screenOwnsFullscreen(screenRef.current)){
        nativeFullscreenOwnedRef.current=true;
        setImmersive(true);
        return;
      }
      nativeFullscreenOwnedRef.current=false;
      setNotice("已进入沉浸模式；当前浏览器未开放系统全屏。");
    };
    document.addEventListener("fullscreenchange",changed);
    document.addEventListener("webkitfullscreenchange",changed);
    document.addEventListener("fullscreenerror",failed);
    document.addEventListener("webkitfullscreenerror",failed);
    return()=>{
      document.removeEventListener("fullscreenchange",changed);
      document.removeEventListener("webkitfullscreenchange",changed);
      document.removeEventListener("fullscreenerror",failed);
      document.removeEventListener("webkitfullscreenerror",failed);
    };
  },[closeBoardSurfaces,finishImmersiveExit,recoverNativeExit,requestNativeExit,screenRef]);
  useEffect(()=>{if(!immersive)return;const onKeyDown=(event:KeyboardEvent)=>{if(event.key!=="Escape"||event.defaultPrevented)return;if(fileSurface!==null||historyOpen||frameOpen||drillOpen||toolPalette!==null||keyboard.visible)return;sendBoardAction(initialBoard.id,"back");};document.addEventListener("keydown",onKeyDown,true);return()=>document.removeEventListener("keydown",onKeyDown,true);},[drillOpen,fileSurface,frameOpen,historyOpen,immersive,initialBoard.id,keyboard.visible,toolPalette]);
  useEffect(()=>{
    const flowStack=editorRef.current?.closest<HTMLElement>(".flow-stack");
    if(!flowStack)return;
    let tracking=false,startX=0,startY=0,lastX=0,lastY=0;
    let resetTimer:number|null=null;
    const resetEdgeOffset=()=>{
      const editor=editorRef.current;
      if(!editor)return;
      editor.style.transition="translate 180ms ease";
      editor.style.translate="0 0";
      if(resetTimer!==null)window.clearTimeout(resetTimer);
      resetTimer=window.setTimeout(()=>{if(editor.isConnected){editor.style.removeProperty("transition");editor.style.removeProperty("translate");}resetTimer=null;},200);
    };
    const stopEdgeGesture=(event:TouchEvent)=>{
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const start=(event:TouchEvent)=>{
      if(editorRef.current?.closest<HTMLElement>(".flow-screen")?.dataset.flowCurrent!=="true")return;
      const touch=event.touches[0];
      if(!touch)return;
      const bounds=flowStack.getBoundingClientRect();
      if(touch.clientX-bounds.left>=28)return;
      tracking=true;
      startX=lastX=touch.clientX;
      startY=lastY=touch.clientY;
      if(editorRef.current){editorRef.current.style.transition="none";editorRef.current.style.translate="0 0";}
      stopEdgeGesture(event);
    };
    const move=(event:TouchEvent)=>{
      if(!tracking)return;
      const touch=event.touches[0]??event.changedTouches[0];
      if(touch){lastX=touch.clientX;lastY=touch.clientY;}
      if(editorRef.current)editorRef.current.style.translate=`${Math.min(80,Math.max(0,lastX-startX))}px 0`;
      stopEdgeGesture(event);
    };
    const end=(event:TouchEvent)=>{
      if(!tracking)return;
      const touch=event.changedTouches[0];
      if(touch){lastX=touch.clientX;lastY=touch.clientY;}
      tracking=false;
      stopEdgeGesture(event);
      const deltaX=lastX-startX,deltaY=Math.abs(lastY-startY);
      resetEdgeOffset();
      if(deltaX<=92||deltaX<=deltaY*1.15)return;
      sendBoardAction(initialBoard.id,"back");
    };
    const cancel=(event:TouchEvent)=>{if(!tracking)return;tracking=false;resetEdgeOffset();stopEdgeGesture(event);};
    const options:AddEventListenerOptions={capture:true,passive:false};
    flowStack.addEventListener("touchstart",start,options);
    flowStack.addEventListener("touchmove",move,options);
    flowStack.addEventListener("touchend",end,options);
    flowStack.addEventListener("touchcancel",cancel,options);
    return()=>{
      if(resetTimer!==null)window.clearTimeout(resetTimer);
      flowStack.removeEventListener("touchstart",start,true);
      flowStack.removeEventListener("touchmove",move,true);
      flowStack.removeEventListener("touchend",end,true);
      flowStack.removeEventListener("touchcancel",cancel,true);
    };
  },[initialBoard.id]);
  useEffect(()=>()=>{if(sheetFocusTimerRef.current!==null)window.clearTimeout(sheetFocusTimerRef.current);},[]);
  useEffect(()=>()=>{fullscreenOperationRef.current+=1;immersiveDesiredRef.current=false;fullscreenRequestPendingRef.current=false;afterImmersiveExitRef.current=null;const screen=screenRef.current,ownsSession=boardSessionOwnsFullscreen(screen,fullscreenSessionRef.current),stage=screen?.closest<HTMLElement>(".phone-stage");if(ownsSession){releaseBoardFullscreen(screen,fullscreenSessionRef.current);if(stage)delete stage.dataset.boardImmersive;exitScreenFullscreenBestEffort(screen);}mediaAbortRef.current?.abort();if(mediaUrlRef.current)URL.revokeObjectURL(mediaUrlRef.current);nativeFullscreenOwnedRef.current=false;fullscreenExitPendingRef.current=false;},[screenRef]);
  useEffect(()=>{const flush=()=>{if(!needsSaveRef.current)return;const result=saveBoard(committedBoardRef.current);if(result.ok){committedBoardRef.current=result.value;needsSaveRef.current=false;window.dispatchEvent(new Event(BOARD_DRAFTS_EVENT));}};window.addEventListener("pagehide",flush);return()=>{window.removeEventListener("pagehide",flush);flush();};},[]);
  useEffect(()=>emitBoardHeaderState({boardId:initialBoard.id,title:board.title,saveState,canUndo:past.length>0,canRedo:future.length>0,canRestore:!boardAtStarter,immersive}),[board.title,boardAtStarter,future.length,immersive,initialBoard.id,past.length,saveState]);
  useEffect(()=>{
    const act=(event:Event)=>{const detail=(event as CustomEvent<{boardId:string;action:BoardActionName}>).detail;if(detail.boardId!==initialBoard.id||editorRef.current?.closest<HTMLElement>(".flow-screen")?.dataset.flowCurrent!=="true")return;if(detail.action==="undo")undo();else if(detail.action==="redo")redo();else if(detail.action==="save")saveNow();else if(detail.action==="restore")restoreServePosition();else if(detail.action==="fullscreen")return;else if(detail.action==="rename"){const active=document.activeElement;if(active instanceof HTMLElement)rememberSheetOpener(active);setTitleDraft(committedBoardRef.current.title);setError("");setFileSurface("rename");}else if(detail.action==="back"){const result=saveNow();if(!result.ok)return;if(immersive){afterImmersiveExitRef.current=back;exitImmersive(false);return;}back();}else{const active=document.activeElement;if(active instanceof HTMLElement)rememberSheetOpener(active);setFileSurface("menu");}};
    window.addEventListener(BOARD_ACTION_EVENT,act);return()=>window.removeEventListener(BOARD_ACTION_EVENT,act);
  },[back,exitImmersive,immersive,initialBoard.id,redo,rememberSheetOpener,saveNow,undo]);
  useEffect(()=>{if(!isPlaying)return;let request=0,last=performance.now();const tick=(now:number)=>{const delta=Math.min((now-last)/1000,.1)*speed;last=now;setElapsed(value=>Math.min(totalDuration,value+delta));request=requestAnimationFrame(tick);};request=requestAnimationFrame(tick);return()=>cancelAnimationFrame(request);},[isPlaying,speed,totalDuration]);
  useEffect(()=>{if(isPlaying&&elapsed>=totalDuration){setIsPlaying(false);setNotice("球路播完了。");}},[elapsed,isPlaying,totalDuration]);
  useEffect(()=>{const smart=getSmartBoardContinuation(board);if(smart?.frameIndex===frameIndex){setSelection({kind:"actor",id:smart.actorId});setTool(smart.phase);}else setSelection(null);setFrameLabel(frame?.label??"");},[frame?.id,frameIndex]);
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
    const smartBefore=getSmartBoardContinuation(board),canRestartDeletedShot=selection.kind==="element"&&!!selectedPath&&(selectedPath.kind==="shot"||selectedPath.kind==="feed")&&smartBefore?.frameIndex===frameIndex&&selectedElementFrameIndex===frameIndex-1&&isUntouchedSmartTail(board);
    if(selection.kind==="actor")next=deleteActor(board,selection.id);
    else if(selectedPath)next=deletePath(board,selectedElementFrameIndex,selection.id);
    else if(selectedMark)next=deleteMark(board,selectedElementFrameIndex,selection.id);
    if(selection.kind==="actor")next=armBlankRally(next);
    const removedLabel=selectedActor?numberedActorLabel(board.actors,selectedActor):selectedPath?selectedPath.kind==="move"?"跑位路线":selectedPath.kind==="feed"?"喂球路线":"击球路线":selectedMark?BOARD_MARK_NAMES[selectedMark.kind]:"对象";
    if(canRestartDeletedShot&&smartBefore){
      const withoutTail=deleteFrame(next,next.frames.length-1),restartFrame=withoutTail.frames[selectedElementFrameIndex],ball=withoutTail.actors.find(actor=>actor.kind==="ball"),hitter=withoutTail.actors.find(actor=>actor.kind==="player"&&actor.id!==smartBefore.hitterId);
      if(restartFrame&&restartFrame.paths.length===0&&ball&&hitter){
        const restarted=setSmartRally(withoutTail,{version:2,frameId:restartFrame.id,phase:"shot",hitterId:hitter.id,actorId:ball.id});
        commit(restarted);keyboard.hide();applySmartContinuation(restarted);setNotice(`已删除击球路线，可以重新拖出${selectedElementFrameIndex===0?"发球线路":"下一拍球路"}。`);return;
      }
    }
    const resumed=selection.kind==="actor"?getSmartBoardContinuation(next):null;
    commit(next);keyboard.hide();
    if(resumed){setFrameIndex(resumed.frameIndex);setSelection({kind:"actor",id:resumed.actorId});setTool(resumed.phase);setPathKind("shot");setNotice("已恢复两位球员。现在从网球拖出去，画出发球路线。");return;}
    setSelection(null);setTool("select");setNotice(selectedActor?`已从整套战术的所有拍次删除${removedLabel}。`:`已从第 ${selectedElementFrameIndex+1} 拍删除${removedLabel}。`);
  };
  const nudge=(dx:number,dy:number)=>{
    const clamp=(point:BoardPoint):BoardPoint=>clampBoardPoint([point[0]+dx,point[1]+dy]);
    if(selectedActor&&frame.poses[selectedActor.id])commit(moveActor(board,frameIndex,selectedActor.id,clamp(frame.poses[selectedActor.id])));
    else if(selectedMark)commit(updateMark(board,selectedElementFrameIndex,selectedMark.id,{position:clamp(selectedMark.position)}));
    else if(selectedPath)commit(updatePath(board,selectedElementFrameIndex,selectedPath.id,{to:clamp(selectedPath.to)}));
  };
  const addNextFrame=(duplicate=false)=>{try{const nextIndex=frameIndex+1,generated=addFrame(board,frameIndex,duplicate),next=generated.smartRally?setSmartRally(generated):generated;commit(next);setFrameIndex(nextIndex);setSelection(null);setTool("select");setViewMode("edit");setIsPlaying(false);setError("");setNotice(`已新增第 ${nextIndex+1} 拍，从上一拍结束位置开始。`);}catch(reason){setError(reason instanceof Error?reason.message:"无法添加拍次");}};
  const applyFrame=()=>{try{commit(updateFrame(board,frameIndex,{label:frameLabel}));setFrameOpen(false);keyboard.hide();restoreSheetFocus("opener");}catch(reason){setError(reason instanceof Error?reason.message:"无法更新拍次");}};
  const deleteCurrentFrame=()=>{const next=deleteFrame(board,frameIndex);commit(next);setFrameIndex(Math.max(0,Math.min(frameIndex,next.frames.length-1)));setFrameOpen(false);keyboard.hide();restoreSheetFocus("opener");};
  const openFrameSheet=()=>{setFrameLabel(frame.label);setFrameOpen(true);};
  const openFrameFromHistory=(index:number)=>{const nextFrame=board.frames[index];if(!nextFrame)return;setFrameIndex(index);setFrameLabel(nextFrame.label);setHistoryOpen(false);setFrameOpen(true);};
  const frameStart=(index:number)=>board.frames.slice(0,index).reduce((sum,item)=>sum+item.duration,0);
  const nextPlaybackFrame=()=>{const pose=getBoardPose(playbackBoard,elapsed);if(pose.frameIndex>=playbackBoard.frames.length-1)return;const next=pose.frameIndex+1;setElapsed(frameStart(next));setIsPlaying(false);setNotice(`已跳到第 ${next+1} 拍。`);};
  const previousPlaybackFrame=()=>{if(elapsed<=0)return;const pose=getBoardPose(playbackBoard,elapsed),terminal=pose.frameIndex===playbackBoard.frames.length-1&&playbackBoard.frames[pose.frameIndex]?.duration===0&&elapsed>=totalDuration;const previous=terminal||pose.progress<.08?Math.max(0,pose.frameIndex-1):pose.frameIndex;setElapsed(frameStart(previous));setIsPlaying(false);setNotice(`已跳到第 ${previous+1} 拍。`);};
  const startPlayback=()=>{if(!hasPlayablePath){setError("画出一条球路，就能播放。");return;}focusPlaybackEntryRef.current=true;playbackReturnFrameIdRef.current=frame.id;playbackResumeSmartRef.current=smartContinuation?.frameIndex===frameIndex&&tool===smartContinuation.phase;setTool("select");setSelection(null);setElapsed(0);setViewMode("preview");setIsPlaying(true);setError("");setNotice(`开始播放，共 ${playbackFrameCount} 拍、${totalDuration.toFixed(1)} 秒。`);};
  const returnToEditing=()=>{setIsPlaying(false);const pose=getBoardPose(playbackBoard,elapsed),smart=getSmartBoardContinuation(board),resumeSmart=playbackResumeSmartRef.current&&!!smart;setViewMode("edit");setElapsed(0);if(resumeSmart&&smart){setFrameIndex(smart.frameIndex);setSelection({kind:"actor",id:smart.actorId});setTool(smart.phase);setNotice(`已回到第 ${smart.frameIndex+1} 拍继续编辑。`);}else{const returnIndex=board.frames.findIndex(item=>item.id===playbackReturnFrameIdRef.current),targetIndex=returnIndex>=0?returnIndex:pose.frameIndex;setFrameIndex(targetIndex);setTool("select");setSelection(null);setNotice(`已回到第 ${targetIndex+1} 拍编辑。`);}playbackReturnFrameIdRef.current=null;playbackResumeSmartRef.current=false;focusPlaybackExitRef.current=true;};
  const cancelRename=()=>{setTitleDraft(committedBoardRef.current.title);setError("");keyboard.hide();setFileSurface(null);restoreSheetFocus("opener");};
  const applyRename=()=>{if(!titleDraft.trim()){setError("画板名称不能留空");return;}try{const current=committedBoardRef.current,next=renameBoard(current,titleDraft),changed=next.title!==current.title;if(changed)commit(next);keyboard.hide();setFileSurface(null);setNotice(changed?"名称已更新。":"名称没有变化。");restoreSheetFocus("opener");}catch{setError("名称没有保存，请重试");}};
  const duplicateDraft=()=>{const current=committedBoardRef.current,copy=cloneBoard(current);const result=saveBoard(copy);if(result.ok){setError("");setNotice(`已另存为「${result.value.title}」。`);window.dispatchEvent(new Event(BOARD_DRAFTS_EVENT));}else setError("这份副本尚未保存，请重试");};
  const restoreServePosition=()=>{const current=committedBoardRef.current,next=restoreStarterBoard(current);setFileSurface(null);keyboard.hide();restoreSheetFocus("canvas");if(next===current){setNotice("现在就是发球站位。");return;}commit(next);resetTransientEditorState(next,true,next.frames[0]?.id);setTitleDraft(next.title);setNotice("已回到发球站位，可以撤销。");};
  const exportJson=()=>{const current=committedBoardRef.current;saveDownload(new Blob([JSON.stringify(current,null,2)],{type:"application/json"}),safeFilename(current.title,"json"));setNotice("已开始下载，请查看浏览器下载项。");};
  const exportPng=async()=>{const current=committedBoardRef.current;try{saveDownload(await exportBoardPng(current,Math.min(frameIndex,current.frames.length-1)),safeFilename(`${current.title}-第${frameIndex+1}拍`,"png"));setNotice("已开始下载，请查看浏览器下载项。");}catch{setError("这次图片没有生成，请重试");}};
  const clearMediaOutput=()=>{mediaAbortRef.current?.abort();mediaAbortRef.current=null;if(mediaUrlRef.current){URL.revokeObjectURL(mediaUrlRef.current);mediaUrlRef.current=null;}setMediaState({status:"idle"});};
  const closeShareSheet=()=>{clearMediaOutput();setFileSurface(null);keyboard.hide();restoreSheetFocus("opener");};
  const openMediaExport=(kind:"video"|"gif")=>{clearMediaOutput();setFileSurface("media");void beginMediaExport(kind);};
  const beginMediaExport=async(kind:"video"|"gif")=>{
    mediaAbortRef.current?.abort();if(mediaUrlRef.current){URL.revokeObjectURL(mediaUrlRef.current);mediaUrlRef.current=null;}
    const snapshot=prepareBoardForMedia(committedBoardRef.current);
    if(!snapshot.frames.some(candidate=>candidate.paths.length)){setMediaState({status:"error",kind,message:"先画一条球路，再生成分享动画"});return;}
    if(kind==="video"&&!pickVideoEncoding()){setMediaState({status:"error",kind,message:"此浏览器暂时不能生成视频，可以试试动态图"});return;}
    const controller=new AbortController();mediaAbortRef.current=controller;setMediaState({status:"generating",kind,progress:0});setError("");
    try{
      const options={signal:controller.signal,onProgress:(progress:number)=>{if(mediaAbortRef.current===controller)setMediaState({status:"generating",kind,progress});}};
      const result=kind==="video"?await exportBoardVideo(snapshot,options):await exportBoardGif(snapshot,options);
      if(mediaAbortRef.current!==controller){return;}
      const url=URL.createObjectURL(result.blob);mediaUrlRef.current=url;setMediaState({status:"ready",result,url});setNotice(`${kind==="video"?"球路视频":"动态图"}已生成`);
    }catch(reason){
      if(controller.signal.aborted||reason instanceof DOMException&&reason.name==="AbortError"){setMediaState({status:"idle"});return;}
      setMediaState({status:"error",kind,message:`这次${kind==="video"?"球路视频":"动态图"}没有生成，请重试`});
    }finally{if(mediaAbortRef.current===controller)mediaAbortRef.current=null;}
  };
  const downloadMedia=()=>{if(mediaState.status!=="ready")return;setError("");saveDownload(mediaState.result.blob,mediaState.result.name);setNotice("已开始下载，请查看浏览器下载项。");};
  const shareMedia=async()=>{
    if(mediaState.status!=="ready")return;
    setError("");
    const result=mediaState.result,file=new File([result.blob],result.name,{type:result.mimeType.split(";")[0]});
    try{
      if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:board.title,text:"RallyPath 战术动画"});setNotice("分享已完成。");}
      else downloadMedia();
    }catch(reason){if(reason instanceof DOMException&&reason.name==="AbortError"){setNotice("已取消分享，文件还可以下载");return;}setError("这次没有分享成功，请重试或下载到设备");}
  };
  const chooseTool=(next:BoardTool)=>{
    setTool(next);setViewMode("edit");setIsPlaying(false);
    const selected=selection?.kind==="actor"?board.actors.find(actor=>actor.id===selection.id):undefined;
    const canCarryActor=(next==="shot"&&selected?.kind==="ball")||(next==="move"&&selected?.kind==="player");
    if(next!=="select"&&!canCarryActor)setSelection(null);
  };
  const updateSelectedPath=(patch:Partial<Omit<BoardPath,"id">>)=>{if(!selectedPath)return;commit(updatePath(board,selectedElementFrameIndex,selectedPath.id,patch));};
  const toggleCurve=()=>{if(selectedPath)updateSelectedPath({control:selectedPath.control?undefined:curveControl(selectedPath.from,selectedPath.to,selectedPath.kind!=="move")});else setCurved(value=>!value);};
  const applySmartContinuation=(next:BoardDocument)=>{const smart=getSmartBoardContinuation(next);if(!smart)return false;setFrameIndex(smart.frameIndex);setSelection({kind:"actor",id:smart.actorId});setTool(smart.phase);setPathKind("shot");return true;};
  const synchronizeSmartMoves=(current:BoardDocument,index:number)=>{
    let synchronized=current;
    for(const move of current.frames[index].paths.filter(path=>path.kind==="move")){
      const next=synchronizeMoveWithPreviousShot(synchronized,index,move.id);
      if(next===synchronized)return current;
      synchronized=next;
    }
    return synchronized;
  };
  const completeCanvasAction=(completion:BoardCanvasCompletion)=>{
    const smartBefore=getSmartBoardContinuation(completion.base);
    if(completion.gesture==="path"&&completion.path&&smartBefore?.frameIndex===frameIndex){
      const current=committedBoardRef.current,players=current.actors.filter(actor=>actor.kind==="player"),ball=current.actors.find(actor=>actor.kind==="ball");
      const completesShot=!!ball&&completion.path.kind==="shot"&&completion.path.actorId===ball.id&&(smartBefore.phase==="shot"||smartBefore.phase==="move");
      const completesExpectedMove=completion.path.kind==="move"&&smartBefore.phase==="move"&&completion.path.actorId===smartBefore.actorId;
      if(completesShot&&ball){
        try{
          const nextHitter=players.find(player=>player.id!==smartBefore.hitterId);if(!nextHitter)throw new Error("找不到下一位击球者");
          const hasPendingMoves=current.frames[frameIndex].paths.some(path=>path.kind==="move");
          const shotBase=hasPendingMoves?synchronizeSmartMoves(current,frameIndex):current;
          if(hasPendingMoves&&shotBase===current){
            const manual=setSmartRally(current);markCommitted(manual);setSelection(completion.selection);setTool("select");
            setNotice("球路已保留。接下来请手动调整。");return;
          }
          let next=addFrame(shotBase,frameIndex,false),nextFrame=next.frames[frameIndex+1];
          next=setSmartRally(next,{version:2,frameId:nextFrame.id,phase:"move",hitterId:nextHitter.id,actorId:nextHitter.id});
          markCommitted(next);
          if(applySmartContinuation(next)){navigator.vibrate?.(8);setNotice("球路已记下。现在拖动接球球员。");return;}
        }catch{const manual=setSmartRally(current);markCommitted(manual);setSelection(completion.selection);setTool("select");setError("球路已保留。接下来请手动调整。");return;}
      }else if(completesExpectedMove&&ball){
        try{
          const synchronized=synchronizeSmartMoves(current,frameIndex);
          if(synchronized===current){
            const manual=setSmartRally(current);markCommitted(manual);setSelection(completion.selection);setTool("select");
            setNotice("跑位已保留。接下来请手动调整。");return;
          }
          const next=setSmartRally(synchronized,{version:2,frameId:synchronized.frames[frameIndex].id,phase:"shot",hitterId:smartBefore.hitterId,actorId:ball.id});
          markCommitted(next);
          if(applySmartContinuation(next)){navigator.vibrate?.(8);setNotice("跑位已记下。再拖动网球，画下一拍。");return;}
        }catch{const manual=setSmartRally(current);markCommitted(manual);setSelection(completion.selection);setTool("select");setError("跑位已保留。接下来请手动调整。");return;}
      }else if(completion.path.kind==="move"){
        const synchronized=synchronizeSmartMoves(current,frameIndex);
        if(synchronized!==current){
          const next=synchronized.smartRally?.version===1?setSmartRally(synchronized,{...synchronized.smartRally,version:2}):synchronized;
          markCommitted(next);
          if(applySmartContinuation(next)){setNotice("额外跑位已与上一条球路同步；继续拖动指定接球方。");return;}
        }
        const manual=setSmartRally(current);markCommitted(manual);setSelection(completion.selection);setTool("select");
        setNotice("跑位已保留。接下来请手动调整。");return;
      }else{
        const manual=setSmartRally(current);markCommitted(manual);setSelection(completion.selection);setTool("select");setNotice("操作已保留。接下来请手动调整。");return;
      }
    }
    if(smartBefore&&completion.gesture==="mark"&&applySmartContinuation(committedBoardRef.current)){setNotice("标记已添加，继续当前回合。");return;}
    if(completion.created&&completion.gesture==="actor"){
      const current=committedBoardRef.current,armed=armBlankRally(current);
      if(armed!==current){markCommitted(armed);if(applySmartContinuation(armed)){setNotice("两位球员和网球已就位");return;}}
    }
    setSelection(completion.selection);
    if(completion.created){setTool("select");setNotice("已添加到球场");}
  };
  const overrideSmartActor=(actor:BoardActor)=>{setSelection({kind:"actor",id:actor.id});if(actor.kind==="ball"){if(tool==="move")setPathKind("shot");setTool("shot");setNotice("已切换到网球");}else{setTool("move");setNotice(`已切换到${numberedActorLabel(board.actors,actor)}`);}setError("");};
  const cancelCanvasAction=(base:BoardDocument,selectionBefore:BoardSelection|null)=>{const smart=getSmartBoardContinuation(base);if(smart){setFrameIndex(smart.frameIndex);setSelection(selectionBefore?.kind==="element"&&selectionBefore.frameIndex!==undefined?selectionBefore:{kind:"actor",id:smart.actorId});setTool(smart.phase);}else{setSelection(selectionBefore);setTool("select");}};
  const chooseAdd=(next:BoardTool,preset?:ActorPreset|MarkPreset)=>{if(next==="actor"&&preset)setActorPreset(preset as ActorPreset);if(next==="mark"&&preset)setMarkPreset(preset as MarkPreset);chooseTool(next);setToolPalette(null);restoreSheetFocus("canvas");};
  const beginSelectedPath=(kind:"shot"|"feed"|"move")=>{const actor=selectedActor;if(!actor||(kind==="move"?actor.kind!=="player":actor.kind!=="ball")){setError(kind==="move"?"请先选择一名球员。":"请先选择网球。");return;}setPathKind(kind==="feed"?"feed":"shot");chooseTool(kind==="move"?"move":"shot");setToolPalette(null);keyboard.hide();restoreSheetFocus("canvas");};
  const previewing=viewMode==="preview",activePose=previewing?getBoardPose(playbackBoard,elapsed):null,currentPlaybackFrame=activePose?.frameIndex??frameIndex;
  const selectedActorLabel=selectedActor?numberedActorLabel(board.actors,selectedActor):"";
  const selectedLabel=selectedActorLabel||(selectedPath?selectedPath.kind==="move"?"跑位路线":selectedPath.kind==="feed"?"喂球路线":"击球路线":selectedMark?BOARD_MARK_NAMES[selectedMark.kind]:"");
  const activeSmart=smartContinuation?.frameIndex===frameIndex?smartContinuation:null;
  const previousBeatPaths=useMemo(()=>{
    if(previewing||frameIndex<=0||board.smartRally?.frameId!==frame?.id)return [];
    return board.frames[frameIndex-1].paths;
  },[board,frame?.id,frameIndex,previewing]);
  const contextFrameIndex=previousBeatPaths.length?frameIndex-1:null;
  const resumeSmartFlow=()=>{if(applySmartContinuation(board)){setError("");setNotice(smartContinuation?.phase==="move"?`继续拖动${smartActorLabel||"接球方"}跑位。`:"继续从网球拖出下一拍。");restoreSheetFocus("canvas");}else{setSelection(null);setTool("select");}};
  const smartActor=activeSmart?board.actors.find(actor=>actor.id===activeSmart.actorId):undefined;
  const smartActorLabel=smartActor?numberedActorLabel(board.actors,smartActor):"";
  const toolStatus=activeSmart?.phase==="shot"?(frameIndex===0?(entryIntent==="review"?"从网球拖出去，还原这一分":"从网球拖出去，画出发球路线"):"再拖动网球，画下一拍"):activeSmart?.phase==="move"?"拖动接球球员，画出跑位":tool==="actor"?`点一下球场，放置${actorPreset==="me"?"我方球员":actorPreset==="opponent"?"对手球员":"网球"}`:tool==="shot"?`从网球拖到落点，画出${pathKind==="feed"?"喂球路线":"球路"}${curved?"曲线":"直线"}`:tool==="move"?`拖动已选球员，画出跑位${curved?"曲线":"直线"}`:tool==="mark"?`${markPreset==="freehand"?"在球场上拖动，画出":"点一下球场，放置"}${BOARD_MARK_NAMES[markPreset]}`:"";
  const addToolActive=toolPalette!==null||tool==="actor"||tool==="mark";
  const canGoPrevious=elapsed>0;
  const canGoNext=currentPlaybackFrame<playbackBoard.frames.length-1;
  const videoEncoding=pickVideoEncoding();
  const canNativeShare=mediaState.status==="ready"&&!!navigator.share&&(()=>{try{const file=new File([mediaState.result.blob],mediaState.result.name,{type:mediaState.result.mimeType.split(";")[0]});return navigator.canShare?.({files:[file]})??false;}catch{return false;}})();
  const sheetOpen=toolPalette!==null||fileSurface!==null||historyOpen||frameOpen||drillOpen||helpOpen;
  const activeGuideMessage=error||notice;
  const sheetFeedback=(error||notice)&&<p className={`board-sheet-feedback ${error?"is-error":"is-status"}`} role={error?"alert":"status"} aria-live={error?"assertive":"polite"} aria-atomic="true">{error||notice}</p>;
  return <div ref={editorRef} className={`board-editor ${previewing?"is-previewing":"is-editing"} ${immersive?"is-immersive":""}`} data-immersive={immersive?"true":"false"}>
    <div className="board-canvas-shell">
      {immersive&&<div className="board-immersive-toolbar" role="toolbar" aria-label="战术板操作">
        <div className="board-immersive-leading">
          <button className="board-immersive-back" aria-label="返回上一页" onClick={()=>sendBoardAction(initialBoard.id,"back")}><ChevronLeftIcon/></button>
          <ProductWordmark compact />
        </div>
        <div className="board-immersive-actions">
          <button aria-label="撤销" disabled={previewing||past.length===0} onClick={undo}><CounterClockwiseClockIcon/></button>
          <button aria-label="重做" disabled={previewing||future.length===0} onClick={redo}><UpdateIcon/></button>
          <button aria-label="查看画板操作说明" aria-haspopup="dialog" aria-expanded={helpOpen} onClick={event=>{rememberSheetOpener(event.currentTarget);setHelpOpen(true);}}><InfoCircledIcon/></button>
          <button aria-label={`打开${board.title}的画板菜单`} aria-haspopup="dialog" aria-expanded={fileSurface==="menu"} onClick={event=>{rememberSheetOpener(event.currentTarget);setFileSurface("menu");}}><DotsHorizontalIcon/></button>
        </div>
      </div>}
      <BoardCanvas board={previewing?playbackBoard:board} frameIndex={frameIndex} selection={selection} setSelection={setSelection} tool={tool} actorPreset={actorPreset} pathKind={pathKind} markPreset={markPreset} curved={curved} smartEnabled={!!activeSmart} contextPaths={previousBeatPaths} contextFrameIndex={contextFrameIndex} previewing={previewing} elapsed={elapsed} display={display} preview={preview} commit={commit} finishPreview={finishPreview} onComplete={completeCanvasAction} onOverride={overrideSmartActor} onCancel={cancelCanvasAction} onNudge={nudge} onDelete={deleteSelection} onError={setError} onTogglePathCurve={toggleCurve}/>
      {!sheetOpen&&error&&<div className="board-toast is-error" role="alert" aria-live="assertive" aria-atomic="true"><span>{error}</span><button aria-label="关闭提示" onClick={()=>setError("")}><Cross2Icon/></button></div>}
      <span className="board-sr-only" role="status" aria-live="polite" aria-atomic="true">{error||notice||toolStatus}</span>
    </div>
    {previewing?<div className="board-playback-dock" data-testid="board-playback-dock">
      <input className="board-playback-progress" type="range" aria-label="画板播放进度" min="0" max={Math.max(.01,totalDuration)} step=".01" value={elapsed} onChange={event=>{setIsPlaying(false);setElapsed(Number(event.currentTarget.value));}}/>
      <div className="board-playback-actions"><button aria-label="上一拍" disabled={!canGoPrevious} onClick={previousPlaybackFrame}><TrackPreviousIcon/></button><button ref={playbackToggleRef} className="board-play-toggle" aria-label={isPlaying?"暂停":elapsed>=totalDuration?"重播":"继续播放"} onClick={()=>{if(isPlaying){setIsPlaying(false);setNotice("已暂停播放。");return;}const restarting=elapsed>=totalDuration;if(restarting)setElapsed(0);setIsPlaying(true);setNotice(restarting?"从第 1 拍重新播放。":"继续播放战术。");}}>{isPlaying?<PauseIcon/>:<PlayIcon/>}</button><button aria-label="下一拍" disabled={!canGoNext} onClick={nextPlaybackFrame}><TrackNextIcon/></button><button aria-label="继续修改" onClick={returnToEditing}><Pencil2Icon/></button></div>
    </div>:<>
      <nav className="board-edit-dock" aria-label="画板编辑工具">
        <button ref={selectToolRef} className="board-dock-side" aria-label="添加对象" aria-haspopup="dialog" onClick={event=>{rememberSheetOpener(event.currentTarget);chooseTool("select");setToolPalette("add");}}><PlusIcon/></button>
        <button className="board-primary-play" aria-label={hasPlayablePath?`播放战术，${playbackFrameCount} 拍，共 ${totalDuration.toFixed(1)} 秒`:"画出一条球路，就能播放"} disabled={!hasPlayablePath} onClick={startPlayback}><PlayIcon/></button>
        <button className={`board-dock-side${selection?" is-danger":""}`} aria-label={selection?`删除${selectedLabel||"选中对象"}`:`打开拍次，当前第 ${frameIndex+1} 拍`} onClick={event=>{if(selection){deleteSelection();return;}rememberSheetOpener(event.currentTarget);setHistoryOpen(true);}}>{selection?<TrashIcon/>:<LayersIcon/>}</button>
      </nav>
    </>}

    <BottomSheet open={helpOpen} onOpenChange={open=>{setSheetVisibility(setHelpOpen,open);if(!open)restoreSheetFocus("opener");}} title="画板操作" description="主画板保持纯净，需要时在这里查看。" snap={.72}><div className="board-sheet board-help-sheet"><button className="guide-close" aria-label="关闭画板操作说明" onClick={()=>{setHelpOpen(false);keyboard.hide();restoreSheetFocus("opener");}}><Cross2Icon/></button><div className="board-help-list">
      <div><ArrowTopRightIcon/><span><strong>画球路</strong><small>拖动时半透明球路上会有带阴影的网球移动；速度对应 Control、Drive、Put away，放开后会收起。</small></span></div>
      <div><CornerTopRightIcon/><span><strong>画跑位</strong><small>球路完成后，直接拖动接球球员；播放时会与来球同步。</small></span></div>
      <div><Pencil2Icon/><span><strong>直线／曲线</strong><small>点选球路旁的图标切换；白色菱形可继续调整弧度，新球路默认向右弯。</small></span></div>
      <div><ComponentInstanceIcon/><span><strong>切换场地</strong><small>打开画板菜单，再选择硬地、红土或草地。</small></span></div>
      <div><LayersIcon/><span><strong>找拍次</strong><small>底部右侧打开拍次；选中对象时，同一位置会变成删除。</small></span></div>
      <div className="board-help-icon-title">添加对象</div><div className="board-help-icon-grid" aria-label="添加对象图标说明">
        <div><PersonIcon/><span><strong>我方球员</strong><small>点一下放置</small></span></div><div><PersonIcon/><span><strong>对手球员</strong><small>点一下放置</small></span></div><div><ComponentInstanceIcon/><span><strong>网球</strong><small>点一下放置</small></span></div>
        <div><ArrowTopRightIcon/><span><strong>画球路</strong><small>从网球拖出</small></span></div><div><CornerTopRightIcon/><span><strong>画跑位</strong><small>拖动球员</small></span></div><div><ResumeIcon/><span><strong>喂球路线</strong><small>从网球拖出</small></span></div>
        <div><TargetIcon/><span><strong>目标区</strong><small>点一下放置</small></span></div><div><DrawingPinIcon/><span><strong>标志碟</strong><small>点一下放置</small></span></div><div><ArchiveIcon/><span><strong>球筐</strong><small>点一下放置</small></span></div>
        <div><TextIcon/><span><strong>文字提示</strong><small>点一下放置</small></span></div><div><Pencil2Icon/><span><strong>自由笔</strong><small>拖动绘制</small></span></div>
      </div>
    </div></div></BottomSheet>
    <BottomSheet open={toolPalette!==null} onOpenChange={open=>{if(!open){keyboard.hide();setToolPalette(null);restoreSheetFocus("opener");}}} title="添加对象" snap={.68}><div className="board-sheet"><button className="guide-close" aria-label="关闭添加面板" onClick={()=>{setToolPalette(null);keyboard.hide();restoreSheetFocus("opener");}}><Cross2Icon/></button>{sheetFeedback}<div className="board-file-actions board-icon-actions">
      <button aria-label="我方球员" onClick={()=>chooseAdd("actor","me")}><PersonIcon aria-hidden="true"/></button><button aria-label="对手球员" onClick={()=>chooseAdd("actor","opponent")}><PersonIcon aria-hidden="true"/></button><button aria-label="网球" onClick={()=>chooseAdd("actor","ball")}><ComponentInstanceIcon aria-hidden="true"/></button><button aria-label="画球路" disabled={selectedActor?.kind!=="ball"} onClick={()=>beginSelectedPath("shot")}><ArrowTopRightIcon aria-hidden="true"/></button><button aria-label="画跑位" disabled={selectedActor?.kind!=="player"} onClick={()=>beginSelectedPath("move")}><CornerTopRightIcon aria-hidden="true"/></button><button aria-label="喂球路线" disabled={selectedActor?.kind!=="ball"} onClick={()=>beginSelectedPath("feed")}><ResumeIcon aria-hidden="true"/></button><button aria-label="目标区" onClick={()=>chooseAdd("mark","target")}><TargetIcon aria-hidden="true"/></button><button aria-label="标志碟" onClick={()=>chooseAdd("mark","cone")}><DrawingPinIcon aria-hidden="true"/></button><button aria-label="球筐" onClick={()=>chooseAdd("mark","basket")}><ArchiveIcon aria-hidden="true"/></button><button aria-label="文字提示" onClick={()=>chooseAdd("mark","text")}><TextIcon aria-hidden="true"/></button><button aria-label="自由笔" onClick={()=>chooseAdd("mark","freehand")}><Pencil2Icon aria-hidden="true"/></button>
    </div></div></BottomSheet>
    <BottomSheet open={fileSurface==="menu"} onOpenChange={open=>{if(!open){setFileSurface(null);keyboard.hide();restoreSheetFocus("opener");}}} title="画板菜单" snap={.625}><div className="board-sheet board-menu-sheet">{sheetFeedback}

      <section className="board-menu-section board-menu-edit-section"><p>编辑</p><div className="board-menu-list board-menu-compact-list"><button onClick={()=>{setTitleDraft(committedBoardRef.current.title);setError("");setFileSurface("rename");}}><Pencil2Icon/><span><strong>修改名称</strong></span><ChevronRightIcon/></button><button disabled={future.length===0} aria-label="重做" onClick={()=>{redo();setFileSurface(null);}}><UpdateIcon/><span><strong>重做</strong></span>{future.length?<ChevronRightIcon/>:<CheckCircledIcon/>}</button><button className="board-menu-restore" aria-label={boardAtStarter?"现在就是发球站位":"一键还原发球站位，可撤销"} disabled={boardAtStarter} onClick={restoreServePosition}><ResetIcon/><span><strong>一键还原站位</strong></span>{boardAtStarter&&<CheckCircledIcon/>}</button></div></section><section className="board-menu-section board-menu-manage-section"><p>保存与管理</p><div className="board-menu-list board-menu-compact-list"><button onClick={()=>{clearMediaOutput();setFileSurface("save-share");}}><Share2Icon/><span><strong>保存与分享</strong></span><ChevronRightIcon/></button><button onClick={()=>{const result=saveNow();if(!result.ok)return;if(immersive){afterImmersiveExitRef.current=openLibrary;exitImmersive(false);return;}keyboard.hide();setFileSurface(null);openLibrary();}}><LayersIcon/><span><strong>草稿与模板</strong></span><ChevronRightIcon/></button></div></section>
      <p className={`board-autosave-note is-${saveState}`}>{saveState==="clean"?"修改后自动保存":saveState==="saving"?"保存中…":saveState==="saved"?"已保存":saveState==="error"?"保存失败":"等待保存"}</p>
      {saveState==="error"&&<div className="board-autosave-actions"><button onClick={()=>saveNow()}><UpdateIcon/>重试</button><button onClick={()=>{clearMediaOutput();setFileSurface("save-share");}}><CodeIcon/>备份</button></div>}
      <section className="board-menu-section board-theme-section" aria-label="场地设置"><div className="board-theme-heading"><p>场地</p><small>外观与辅助显示</small></div><div className="board-theme-group board-surface-choice"><p>地面</p><div className="board-menu-surface-picker" role="group" aria-label="球场主题">{(["hard","clay","grass"] as BoardSurface[]).map(surface=><button key={surface} className={`board-menu-surface is-${surface}`} aria-label={surface==="hard"?"硬地":surface==="clay"?"红土":"草地"} aria-pressed={display.surface===surface} onClick={()=>updateDisplay({surface})}><span className="board-surface-swatch" aria-hidden="true"/><span>{surface==="hard"?"硬地":surface==="clay"?"红土":"草地"}</span>{display.surface===surface&&<CheckCircledIcon aria-hidden="true"/>}</button>)}</div></div><div className="board-theme-group board-display-choice"><p>辅助显示</p><div className="board-display-toggle-row" aria-label="画板显示开关"><button className={`board-display-toggle${display.showZones?" is-on":""}`} aria-label={display.showZones?"关闭站位分区":"打开站位分区"} aria-pressed={display.showZones} onClick={()=>updateDisplay({showZones:!display.showZones})}><LayersIcon/><span>分区</span>{display.showZones&&<CheckCircledIcon aria-hidden="true"/>}</button><button className={`board-display-toggle${display.showZoneLabels?" is-on":""}`} aria-label={display.showZoneLabels?"关闭区域名称":"打开区域名称"} aria-pressed={display.showZoneLabels} disabled={!display.showZones} onClick={()=>updateDisplay({showZoneLabels:!display.showZoneLabels})}><ReaderIcon/><span>名称</span>{display.showZoneLabels&&<CheckCircledIcon aria-hidden="true"/>}</button></div></div></section>
    </div></BottomSheet>
    <BottomSheet open={fileSurface==="save-share"} onOpenChange={open=>{if(!open){setFileSurface(null);keyboard.hide();restoreSheetFocus("opener");}}} title="保存与分享" snap={.625}><div className="board-sheet board-save-share-sheet"><button className="board-sheet-back" aria-label="返回画板菜单" onClick={()=>setFileSurface("menu")}><ChevronLeftIcon/></button><button className="guide-close" aria-label="关闭保存与分享" onClick={()=>{setFileSurface(null);keyboard.hide();restoreSheetFocus("opener");}}><Cross2Icon/></button>{sheetFeedback}
      <section className="board-menu-section"><p>分享成品</p><div className="board-menu-list"><button disabled={!hasPlayablePath||totalDuration<=0||totalDuration>30||!videoEncoding} onClick={()=>openMediaExport("video")}><VideoIcon/><span><strong>分享球路视频 <b>推荐</b></strong><small>画质更清楚，适合保存和发布</small><em>{!hasPlayablePath?"先画一条球路":totalDuration>30?"球路超过 30 秒，请缩短后再试":!videoEncoding?"此浏览器暂时不能生成视频，改用动态图":`${totalDuration.toFixed(1)} 秒 · ${videoEncoding.extension.toUpperCase()}`}</em></span><ChevronRightIcon/></button><button disabled={!hasPlayablePath||totalDuration<=0||totalDuration>12} onClick={()=>openMediaExport("gif")}><ImageIcon/><span><strong>分享动态图</strong><small>适合聊天中快速查看</small><em>{!hasPlayablePath?"先画一条球路":totalDuration>12?"球路超过 12 秒，请缩短后再试":`${totalDuration.toFixed(1)} 秒 · 无声`}</em></span><ChevronRightIcon/></button><button onClick={()=>void exportPng()}><ImageIcon/><span><strong>保存这一拍图片</strong><small>静态图片 · 不含控制柄</small></span><DownloadIcon/></button></div></section>
      <section className="board-menu-section"><p>保留可编辑版本</p><div className="board-menu-list"><button onClick={duplicateDraft}><CopyIcon/><span><strong>另存一份</strong><small>保留一份可独立编辑的画板</small></span><ChevronRightIcon/></button><button onClick={exportJson}><CodeIcon/><span><strong>备份画板</strong><small>之后可导入，继续修改</small></span><DownloadIcon/></button></div></section>
      {saveState==="error"&&<p className="board-export-warning">这次修改尚未保存，请重试。也可以先备份画板。</p>}
    </div></BottomSheet>
    <BottomSheet open={fileSurface==="media"} onOpenChange={open=>{if(!open)closeShareSheet();}} title="分享战术动画" description="只在这台设备生成，不会上传战术内容。" snap={.88}><div className="board-sheet board-media-sheet"><button className="board-sheet-back" aria-label="返回保存与分享" onClick={()=>{clearMediaOutput();setFileSurface("save-share");}}><ChevronLeftIcon/></button><button className="guide-close" aria-label="关闭动画分享" onClick={closeShareSheet}><Cross2Icon/></button>{sheetFeedback}
      {mediaState.status==="generating"?<div className="board-media-progress" role="status" aria-live="polite"><span className="board-media-icon">{mediaState.kind==="video"?<VideoIcon/>:<ImageIcon/>}</span><strong>正在生成{mediaState.kind==="video"?"球路视频":"动态图"}</strong><small>{mediaState.kind==="video"?"会按球路实际时长录制，请暂时保持此页在前台。":"正在逐帧绘制动态图。"}</small><progress max="1" value={mediaState.progress}/><b>{Math.round(mediaState.progress*100)}%</b><button className="sheet-done is-secondary" onClick={clearMediaOutput}>取消</button></div>:mediaState.status==="ready"?<div className="board-media-result"><div className="board-media-preview">{mediaState.result.format==="video"?<video src={mediaState.url} autoPlay loop muted playsInline controls/>:<img src={mediaState.url} alt="战术动态图预览"/>}</div><div className="board-media-result-copy"><CheckCircledIcon/><span><strong>{mediaState.result.format==="video"?"球路视频":"动态图"}已生成</strong><small>{mediaState.result.duration.toFixed(1)} 秒 · {(mediaState.result.blob.size/1024/1024).toFixed(1)} MB</small></span></div><button className="sheet-done" onClick={()=>void shareMedia()}>{canNativeShare?<><Share2Icon/>分享{mediaState.result.format==="video"?"球路视频":"动态图"}</>:<><DownloadIcon/>下载到设备</>}</button>{canNativeShare&&<button className="sheet-done is-secondary" onClick={downloadMedia}><DownloadIcon/>下载到设备</button>}<button className="board-media-again" onClick={clearMediaOutput}>换一种格式</button></div>:<><p className="board-media-privacy"><InfoCircledIcon/><span><strong>画板与分享文件分开</strong><small>这里生成的是只读成品，不会改动画板。</small></span></p>{mediaState.status==="error"&&<p className="board-sheet-feedback is-error" role="alert">{mediaState.message}</p>}<div className="board-media-options"><button disabled={!hasPlayablePath||totalDuration<=0||totalDuration>30||!videoEncoding} onClick={()=>void beginMediaExport("video")}><VideoIcon/><span><strong>分享球路视频 <b>推荐</b></strong><small>画质更清楚，适合保存和发布</small><em>{!hasPlayablePath?"先画一条球路":totalDuration<=0?"球路时长要大于 0 秒":totalDuration>30?"球路超过 30 秒，请缩短后再试":!videoEncoding?"此浏览器暂时不能生成视频，改用动态图":`${totalDuration.toFixed(1)} 秒 · ${videoEncoding.extension.toUpperCase()}`}</em></span></button><button disabled={!hasPlayablePath||totalDuration<=0||totalDuration>12} onClick={()=>void beginMediaExport("gif")}><ImageIcon/><span><strong>分享动态图</strong><small>自动循环，适合聊天中快速查看</small><em>{!hasPlayablePath?"先画一条球路":totalDuration<=0?"球路时长要大于 0 秒":totalDuration>12?"球路超过 12 秒，请缩短后再试":`${totalDuration.toFixed(1)} 秒 · 无声`}</em></span></button></div><button className="sheet-done is-secondary" onClick={()=>{clearMediaOutput();setFileSurface("save-share");}}>返回保存与分享</button></>}
    </div></BottomSheet>
    <BoardRenameLayer open={fileSurface==="rename"} value={titleDraft} error={error} onChange={value=>{setTitleDraft(value);if(error)setError("");}} onCancel={cancelRename} onSubmit={applyRename}/>
    <BottomSheet open={historyOpen} onOpenChange={open=>{setSheetVisibility(setHistoryOpen,open);if(!open)restoreSheetFocus("opener");}} title="拍次" snap={.44}><div className="board-sheet"><button className="guide-close" aria-label="关闭拍次" onClick={()=>{setHistoryOpen(false);keyboard.hide();restoreSheetFocus("opener");}}><Cross2Icon/></button>{sheetFeedback}<div className="board-object-list board-history-list">{board.frames.map((item,index)=>{const isCurrent=index===frameIndex,isContinuation=smartContinuation?.frameIndex===index&&item.paths.length===0,continuationLabel=smartContinuation?.phase==="move"?"等待接球方跑位":index===0?"等待第一条球路":"等待下一拍球路";return <button key={item.id} aria-current={isCurrent?"step":undefined} aria-label={`编辑第 ${index+1} 拍：${item.label}`} onClick={()=>openFrameFromHistory(index)}><span className="board-history-number">{index+1}</span><span><strong>{item.label}</strong><small>{isContinuation?continuationLabel:`${item.paths.length} 条轨迹 · ${item.duration.toFixed(1)} 秒`}</small></span>{isCurrent?<CheckCircledIcon/>:<ChevronRightIcon/>}</button>;})}</div></div></BottomSheet>
    <BottomSheet open={frameOpen} onOpenChange={open=>{setSheetVisibility(setFrameOpen,open);if(!open)restoreSheetFocus("opener");}} title={`第 ${frameIndex+1} 拍`} description="球速由画球路时的蓄力决定，跑位与来球同步。" snap={.58}><div className="board-sheet"><button className="guide-close" aria-label="取消编辑拍次" onClick={()=>{setFrameOpen(false);keyboard.hide();restoreSheetFocus("opener");}}><Cross2Icon/></button>{sheetFeedback}<label className="board-field"><span>拍次口令</span><KeyboardInput value={frameLabel} maxLength={42} onChange={event=>setFrameLabel(event.currentTarget.value)}/></label><button className="sheet-done" onClick={applyFrame}>完成</button><div className="board-sheet-row"><button onClick={()=>{addNextFrame(true);setFrameOpen(false);keyboard.hide();restoreSheetFocus("canvas");}}><CopyIcon/>沿用标记到新增一拍</button><button className="is-danger" disabled={board.frames.length===1} onClick={deleteCurrentFrame}><TrashIcon/>删除此拍</button></div></div></BottomSheet>
    <BottomSheet open={drillOpen} onOpenChange={open=>{setSheetVisibility(setDrillOpen,open);if(!open)restoreSheetFocus("opener");}} title={drill?.title??"练到场上"} description={drill?.goal} snap={.9}>{drill&&<div className="drill-guide"><button className="guide-close" aria-label="关闭训练指南" onClick={()=>{setDrillOpen(false);keyboard.hide();restoreSheetFocus("opener");}}><Cross2Icon/></button>{sheetFeedback}<div className="drill-setup"><h3>开始前，准备这些</h3><p><strong>一起练</strong>{drill.people}</p><p><strong>准备</strong>{drill.equipment.join("、")}</p><ol>{drill.setup.map(item=><li key={item}>{item}</li>)}</ol></div><div className="drill-stages">{drill.stages.map(stage=><details key={stage.id}><summary><span>{stage.title}</span><ChevronDownIcon/></summary><div><p><strong>这一组怎么练</strong>{stage.task}</p><p><strong>怎么喂球</strong>{stage.feed}</p><blockquote>{stage.cue}</blockquote><p><strong>留意这一点</strong>{stage.check}</p><p><strong>简单一点</strong>{stage.easier}</p><p><strong>加点难度</strong>{stage.harder}</p><small>{stage.reps}</small></div></details>)}</div><p className="drill-progression">{drill.progression}</p><button className="sheet-done" onClick={()=>{setDrillOpen(false);keyboard.hide();restoreSheetFocus("opener");}}>回到画板</button></div>}</BottomSheet>
  </div>;
}

function useFlowAccessibilityIsolation(revision:number) {
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
  },[revision]);
}

export default function Prototype() {
  const [info,setInfo]=useState(false);
  useFlowAccessibilityIsolation(0);
  function makeBoardLibrary(activeBoardId:string):FlowScreen {
    return {
      id:"board-library",
      title:"草稿与模板",
      headerHeight:62,
      header:flow=><AppHeader title="草稿与模板" back={flow.pop}/>,
      render:flow=><BoardLibrary activeBoardId={activeBoardId} openBoard={(board,persisted,notice)=>flow.push(makeBoard(board,persisted,undefined,notice))}/>,
    };
  }
  function makeBoard(board:BoardDocument,initialPersisted=false,entryIntent?:"review",entryNotice?:string):FlowScreen {
    const categorized=board.purpose?board:{...board,purpose:getBoardPurpose(board)};
    const blankPrepared=prepareBlankRallyBoard(categorized);
    const synchronized=prepareSynchronizedRallyBoard(blankPrepared);
    const wasLegacy=blankPrepared.smartRally?.version===1;
    const migrated=wasLegacy&&synchronized!==blankPrepared;
    const legacyNeedsReview=wasLegacy&&!migrated;
    const prepared=legacyNeedsReview?setSmartRally(blankPrepared):synchronized;
    const migrationSource=migrated?setSmartRally(blankPrepared):undefined;
    return {
      id:`board-${prepared.id}`,
      title:prepared.title,
      headerHeight:62,
      header:()=><BoardHeader boardId={prepared.id} initialTitle={prepared.title} initialSaveState={migrationSource?"dirty":initialPersisted?"saved":"clean"}/>,
      render:flow=> <BoardEditor initialBoard={prepared} initialPersisted={initialPersisted} migrationSource={migrationSource} legacyNeedsReview={legacyNeedsReview} entryIntent={entryIntent} entryNotice={entryNotice} back={flow.pop} openLibrary={()=>flow.push(makeBoardLibrary(prepared.id))}/>,
    };
  }
  function makeDetail(tactic:Tactic,contextLabel?:string):FlowScreen {return {id:tactic.id,title:tactic.name,headerHeight:62,header:flow=><AppHeader title={tactic.name} back={flow.pop}/>,render:flow=> <TacticPlayer tactic={tactic} contextLabel={contextLabel} openBoard={()=>flow.push(makeBoard(boardFromTactic(tactic)))}/>};}
  function makeCombination(combination:Combination):FlowScreen {return {id:`${combination.id}-plan`,title:combination.name,headerHeight:62,header:flow=><AppHeader title={`${combination.name} · 思路`} back={flow.pop} menu={()=>setInfo(true)}/>,render:flow=><CombinationDetail combination={combination} openTactic={(tactic,contextLabel)=>flow.push(makeDetail(tactic,contextLabel))} openBoard={()=>flow.push(makeBoard(boardFromTactics(combination.stages.map(stage=>combinationExample(stage.tacticId,stage.excerpt)),combination.name)))}/>};}
  function makeInteractive(combination:Combination):FlowScreen {return {id:`${combination.id}-rally`,title:combination.name,headerHeight:62,header:flow=><AppHeader title={combination.name} back={flow.pop} menu={()=>setInfo(true)}/>,render:flow=><InteractiveCombinationPlayer combination={combination} openPlan={()=>flow.push(makeCombination(combination))}/>};}
  function makeKnowledge(initialMode:"tactics"|"combinations"="tactics",initialCategory:CategoryFilter="全部"):FlowScreen {return {id:`knowledge-${initialMode}-${initialCategory}`,title:"战术知识库",headerHeight:62,header:flow=><AppHeader title="战术知识库" back={flow.pop} menu={()=>setInfo(true)}/>,render:flow=><TacticsList initialMode={initialMode} initialCategory={initialCategory} openTactic={tactic=>flow.push(makeDetail(tactic))} openCombination={combination=>flow.push(makeInteractive(combination))}/>};}
  function makeHome():FlowScreen {return {id:"home",title:"RallyPath",headerHeight:62,header:()=> <HomeHeader menu={()=>setInfo(true)}/>,render:flow=><BoardHome openBoard={(board,persisted,intent)=>flow.push(makeBoard(board,persisted,intent))} openKnowledge={(mode,category)=>flow.push(makeKnowledge(mode,category))} openLibrary={()=>flow.push(makeBoardLibrary(""))}/>};}
  const initial:FlowScreen=makeHome();
  return <div className="tennis-app"><FlowStack initial={initial}/><BottomSheet open={info} onOpenChange={setInfo} title="关于 RallyPath" description="用球路和跑位，看懂青少年单打战术。" snap={.56}><div className="about-demo"><p><strong>{libraryStats.tactics} 个单项战术、{libraryStats.combinations} 组互动对打、{libraryStats.variants} 种应变</strong>。单项打法聚焦一招；组合打法会在每段球路后让你选择下一拍，并继续这一分。</p><p>“发球后抢先手”可以在同一个场面试不同打法：先看来球、自己和对手，再看这样打会换来什么、要留意什么。</p><p>蓝色是我方，红色是对手，黄色是网球；亮线为当前一拍，淡线为已完成球路，圆环提示下一落点。</p><p className="about-note">内容适合已能进行全场对打的青少年。若仍使用红、橙或绿球，请按球场大小和实际能力调整目标；战术示意不保证得分，也不能替代教练现场判断。</p><p className="about-source">教学原则参考 ITF、LTA 和 USTA 公开资料；战术组合与练习为教学化编排。</p><button className="sheet-done" onClick={()=>setInfo(false)}>知道了</button></div></BottomSheet></div>;
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import {
  ArchiveIcon,
  ArrowLeftIcon,
  ArrowTopRightIcon,
  CheckCircledIcon,
  ChevronLeftIcon,
  ChevronDownIcon,
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
  UploadIcon,
  VideoIcon,
} from "@radix-ui/react-icons";
import { BottomSheet, Carousel, FlowStack, KeyboardInput, MobileScroll, useKeyboard, useScreenPortal, type FlowScreen } from "./mobile";
import { BoardTextEditorLayer } from "./board/BoardTextEditorLayer";
import { createTwoStageDemo } from "./board/twoStageDemo";
import { OPENINGS, applyOpening, type OpeningId } from "./board/openings";
import { VersionBadge } from "./version/VersionBadge";

import { categories, combinations, interactiveRallies, rallyNodes, tacticGuides, tactics, type CategoryFilter } from "./content/library";
import { getCombinationThumbnailPlan, getTacticThumbnailPlan } from "./content/thumbnail";
import type { Combination, Moment, Point, RallyChoice, RallyNode, RallyObservation, RallyScenarioChoice, Tactic, TacticExcerpt } from "./content/types";
import { getScoreBounceMotion } from "./content/effects";
import { boardFromTactic, boardFromTactics } from "./board/adapters";
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
  type BoardMark,
  type BoardPath,
  type BoardPurpose,
  type BoardShotPace,
  type Point as BoardPoint,
} from "./board/model";
import { exportBoardPng, getBoardGeometry, hitTestBoard, renderBoard, type BoardSelection } from "./board/render";
import { BOARD_DISPLAY_EVENT, BOARD_DISPLAY_STORAGE_KEY, getBoardDisplayPreferences, setBoardDisplayPreferences, type BoardDisplayPreferences, type BoardSurface } from "./board/display";
import { readBoardEditorView, writeBoardEditorView } from "./board/editorView";
import { exportBoardGif, exportBoardVideo, pickVideoEncoding, prepareBoardForMedia, type BoardMediaExport } from "./board/media";
import { BOARD_STORAGE_KEY, checkBoardUnchanged, readBoards, saveBoardIfUnchanged, type BoardSaveConflict } from "./board/storage";
import { BOARD_DRAFTS_EVENT, BoardLibrary } from "./home/BoardLibrary";
import { findLatestPlayableBoard, HomeBoardPlayback } from "./home/HomeBoardPlayback";
import { FIXED_SKILLS, fixedSkillById, type BoardLearningChoice, type FixedSkillId } from "./learning/model";
import { skillPracticeById, visiblePracticeContextPaths, type SkillPracticePlan, type SkillPracticeStage } from "./learning/practice";
import { BOARD_FOLLOW_UP_EVENT, readBoardFollowUp, saveBoardFollowUp } from "./learning/followUp";
import { readBoardDiscovery, saveBoardDiscovery } from "./learning/discovery";
import {
  BOARD_LEARNING_EVENT,
  BOARD_LEARNING_STORAGE_KEY,
  createBoardBackupJSON,
  createAlternativeRecoveryBackupJSON,
  readLearningChoice,
  saveLearningChoice,
  saveSkillChoiceIfUnchanged,
  saveTacticChoiceIfUnchanged,
} from "./learning/storage";
import { BOARD_IMPORT_JOURNAL_KEY, readBoardImportJournal } from "./learning/importJournal";
import { BOARD_DELETE_JOURNAL_KEY, readBoardDeleteJournal, recoverPendingBoardDelete } from "./learning/deleteJournal";
import { BOARD_COPY_JOURNAL_KEY, BOARD_COPY_RECOVERY_EVENT, clearBoardCopyJournal, readBoardCopyJournal, recoverPendingBoardCopy, saveBoardCopyJournal } from "./learning/copyJournal";
import { BOARD_ALTERNATIVES_EVENT, BOARD_ALTERNATIVES_STORAGE_KEY, checkBoardAlternativeUnchanged, createAlternativeDraft, deleteBoardAlternativeIfUnchanged, readBoardAlternative, saveBoardAlternativeIfUnchanged, type BoardAlternative } from "./learning/alternative";
// FlowStack keeps screen descriptors in state. During a Vite hot update those
// descriptors can still contain the previous board header even after the new
// immersive editor renders. Remount the stack for each prototype revision.
const flowHotRevision = Number(import.meta.hot?.data.rallypathFlowRevision ?? 0);
import.meta.hot?.dispose((data) => {
  data.rallypathFlowRevision = flowHotRevision + 1;
});
const BOARD_MARK_NAMES:Record<BoardMark["kind"],string>={target:"目标区",cone:"标志碟",basket:"球筐",text:"文字备注",freehand:"自由笔"};
const COURT_NOTE_SUGGESTIONS=["先回位","看对手站位","落点再深一点","下一拍抢空当"] as const;
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
function ProductWordmark({ compact = false }: { compact?: boolean }) {
  return <span className={`product-wordmark${compact ? " is-compact" : ""}`} aria-label="RallyPath">
    <picture className="product-wordmark-mark" aria-hidden="true"><source media="(prefers-reduced-motion: reduce)" srcSet="/assets/branding/rallypath-logo-static.png"/><img src="/assets/branding/rallypath-logo-motion.png" alt="" draggable={false}/></picture>
    {!compact && <span>RallyPath</span>}
  </span>;
}
function localPreviewIdentity() {
  const hostname=window.location.hostname;
  if(hostname!=="localhost"&&hostname!=="127.0.0.1"&&hostname!=="[::1]"&&!/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname))return null;
  const scripts=Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'));
  const asset=scripts.at(-1)?.src.split("/").pop()??"未知資產";
  return {host:window.location.host,asset};
}
function RedoArrowIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 4 5 5-5 5"/><path d="M20 9H10a6 6 0 0 0-6 6v1"/></svg>;
}
function TacticFinderIcon() {
  return <span className="tactic-finder-route" aria-hidden="true"><img src="/assets/branding/rallypath-route-button-v2.png" alt="" draggable={false}/></span>;
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
    <button className="home-header-info" aria-label="打开内容说明" onClick={menu}><InfoCircledIcon/></button>
    <VersionBadge className="home-version-badge" /><span className="local-trial-badge">跑位试验版</span>
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
  const pose=currentPose(tactic,elapsed);
  const scoreBounce=getScoreBounceMotion(tactic,elapsed);
  const displayCaption=scoreBounce?.phase==="scored"?"落地后继续向外弹开，对手无法触球":pose.caption;
  return <div className="court-display">
    <CoreTacticCourt tactic={tactic} elapsed={elapsed}/>
    <div className={`stage-caption ${scoreBounce?.phase==="scored"||elapsed>=tactic.duration?"is-finished":""}`} aria-live="polite" aria-atomic="true"><span>{displayCaption}</span></div>
  </div>;
}
/** A library tactic uses the same court, positioning bands and route renderer as an authored board. */
function CoreTacticCourt({ tactic, elapsed }: { tactic: Tactic; elapsed: number }) {
  const canvasRef=useRef<HTMLCanvasElement>(null),holderRef=useRef<HTMLDivElement>(null);
  const board=useMemo(()=>prepareBoardForMedia(boardFromTactic(tactic)),[tactic]);
  const actors=useMemo(()=>board.actors.filter(actor=>actor.kind!=="ball").map(actor=>({...actor,label:""})),[board]);
  const latest=useRef({tactic,elapsed,board,actors});latest.current={tactic,elapsed,board,actors};
  const drawRef=useRef<()=>void>(()=>{});
  useEffect(()=>{
    const canvas=canvasRef.current,holder=holderRef.current;if(!canvas||!holder)return;
    const draw=()=>{
      const {tactic:current,elapsed:time,board:playbackBoard,actors:players}=latest.current;
      const width=holder.clientWidth,height=holder.clientHeight;if(width<=0||height<=0)return;
      const dpr=Math.min(window.devicePixelRatio||1,2),pixelWidth=Math.max(1,Math.round(width*dpr)),pixelHeight=Math.max(1,Math.round(height*dpr));
      if(canvas.width!==pixelWidth||canvas.height!==pixelHeight){canvas.width=pixelWidth;canvas.height=pixelHeight;}
      const ctx=canvas.getContext("2d");if(!ctx)return;
      const pose=getBoardPose(playbackBoard,time),frame=playbackBoard.frames[pose.frameIndex];if(!frame)return;
      const bounce=getScoreBounceMotion(current,time),geometry=getBoardGeometry(width,height);
      const history=playbackBoard.frames.slice(0,pose.frameIndex).flatMap(item=>item.paths);
      const visibleFrame=bounce?{...frame,paths:frame.paths.filter(path=>path.actorId!=="ball")}:frame;
      ctx.setTransform(dpr,0,0,dpr,0,0);
      renderBoard(ctx,width,height,visibleFrame,players,{progress:pose.progress,playing:true,contextPaths:history,showLegend:false,showLabels:false,showZoneLabels:false});
      const visual=currentPose(current,time),ball=bounce?.position??visual.ball;
      const [x,y]=geometry.toCanvas(ball),lift=bounce?bounce.lift*10:visual.height*7;
      if(bounce){
        const [startX,startY]=geometry.toCanvas(bounce.landing);
        ctx.save();ctx.lineWidth=2;ctx.strokeStyle="rgba(216,239,114,.64)";ctx.setLineDash([4,5]);ctx.beginPath();ctx.moveTo(startX,startY);ctx.lineTo(x,y);ctx.stroke();ctx.setLineDash([]);
        if(bounce.impactStrength>0){ctx.beginPath();ctx.ellipse(startX,startY,8+(1-bounce.impactStrength)*8,3+(1-bounce.impactStrength)*3,0,0,Math.PI*2);ctx.strokeStyle=`rgba(216,239,114,${bounce.impactStrength*.7})`;ctx.stroke();}
        for(const ghost of bounce.ghosts){const [gx,gy]=geometry.toCanvas(ghost.position);ctx.beginPath();ctx.arc(gx,gy-ghost.lift*10,3.2,0,Math.PI*2);ctx.fillStyle=`rgba(216,239,114,${ghost.opacity})`;ctx.fill();}
        ctx.restore();
      }
      if(lift>1){ctx.beginPath();ctx.ellipse(x+2,y+3,3.8,1.5,0,0,Math.PI*2);ctx.fillStyle="rgba(0,0,0,.24)";ctx.fill();}
      ctx.beginPath();
      if(bounce?.phase==="impact")ctx.ellipse(x,y,5.2+bounce.squash*1.5,Math.max(2.5,5.2-bounce.squash*2),0,0,Math.PI*2);
      else ctx.arc(x,y-lift,5.2,0,Math.PI*2);
      ctx.fillStyle="#d8ef72";ctx.fill();ctx.lineWidth=1.5;ctx.strokeStyle="#f1f5ed";ctx.stroke();
      if(!bounce&&time<current.duration){
        const target=current.frames[Math.min(current.frames.length-1,visual.index)].ball;
        const [tx,ty]=geometry.toCanvas(target);ctx.save();ctx.beginPath();ctx.arc(tx,ty,10+Math.sin(time*6)*2,0,Math.PI*2);ctx.setLineDash([4,3]);ctx.strokeStyle="rgba(216,239,114,.76)";ctx.lineWidth=1.6;ctx.stroke();ctx.restore();
      }
    };
    drawRef.current=draw;const resize=new ResizeObserver(draw);resize.observe(holder);draw();return()=>resize.disconnect();
  },[]);
  useEffect(()=>{drawRef.current();},[tactic,elapsed,board,actors]);
  const motion=getScoreBounceMotion(tactic,elapsed);
  const visual=currentPose(tactic,elapsed);
  const totalSteps=tactic.frames.length-1,currentStep=Math.min(totalSteps,visual.index);
  return <div ref={holderRef} className="core-tactic-court" data-testid="court-stage" data-renderer="core-board" data-ball-phase={motion?.phase??"flight"}>
    <canvas ref={canvasRef} role="img" aria-label={motion?(motion.phase==="scored"?`${tactic.name}，网球落地后沿实际方向弹出对手可触及范围，完成这一分`:`${tactic.name}，网球已经落地，正沿实际方向弹离对手；此时不显示下一落点圆环`):`${tactic.name}，红色为对手，蓝色为我方，黄色为网球，亮色线为已经完成的球路，圆环为下一关键位置`}/>
    <div className="stage-progress" aria-label={`当前第 ${currentStep} 步，共 ${totalSteps} 步`}><span>步骤 {currentStep}/{totalSteps}</span><div>{Array.from({length:totalSteps},(_,index)=><i key={index} className={index<currentStep-1?"is-complete":index===currentStep-1?"is-active":""}/>)}</div><span className="stage-hint">{motion?(motion.phase==="scored"?"已弹出触球范围":"落地后弹出得分"):"圆环＝下一落点"}</span></div>
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
function TacticPlayer({ tactic, contextLabel, openBoard, back, useForPoint, selectedForPoint=false }: { tactic: Tactic; contextLabel?:string; openBoard:()=>void; back:()=>void; useForPoint?:()=>{ok:true}|{ok:false;error:string}; selectedForPoint?:boolean }) {
  const [elapsed,setElapsed]=useState(0), [playing,setPlaying]=useState(false), [speed,setSpeed]=useState(1), [settings,setSettings]=useState(false);
  const [pointError,setPointError]=useState("");
  const {screenRef}=useScreenPortal();
  useLayoutEffect(()=>{
    const stage=screenRef.current?.closest<HTMLElement>(".phone-stage");if(!stage)return;
    const wasImmersive=stage.dataset.boardImmersive==="true";
    stage.dataset.boardImmersive="true";
    return()=>{if(!wasImmersive)delete stage.dataset.boardImmersive;};
  },[screenRef]);
  const meta = tacticMeta(tactic), guide=tacticGuides[tactic.id];
  const playerDecisions=tactic.previewDecisions??guide.decisions;
  const currentDecision=playerDecisions[Math.min(2,Math.floor((elapsed/tactic.duration)*3))];
  const finished=elapsed>=tactic.duration;
  const scored=getScoreBounceMotion(tactic,elapsed)?.phase==="scored";
  useEffect(() => {
    if(!playing) return;let animation=0,previous=performance.now();
    const tick=(now: number) => {const delta=Math.min((now-previous)/1000,.1)*speed;previous=now;setElapsed(old => Math.min(tactic.duration,old+delta));animation=requestAnimationFrame(tick);};
    animation=requestAnimationFrame(tick);return () => cancelAnimationFrame(animation);
  },[playing,speed,tactic.duration]);
  useEffect(() => {if(elapsed>=tactic.duration)setPlaying(false);},[elapsed,tactic.duration]);
  const toggle=() => {if(elapsed>=tactic.duration)setElapsed(0);setPlaying(p=>!p);};
  const next=() => {setPlaying(false);const step=tactic.frames.find(f=>f.t*tactic.duration>elapsed+.001);setElapsed(step?step.t*tactic.duration:tactic.duration);};
  const previous=() => {setPlaying(false);const step=[...tactic.frames].reverse().find(f=>f.t*tactic.duration<elapsed-.001);setElapsed(step?step.t*tactic.duration:0);};
  return <main className="tactic-showcase-screen">
    <header className="tactic-showcase-header">
      <button aria-label="返回上一页" onClick={()=>{setPlaying(false);back();}}><ChevronLeftIcon/></button>
      <ProductWordmark/><span/>
      <button aria-label="查看战术讲解" onClick={()=>{setPlaying(false);setSettings(true);}}><InfoCircledIcon/></button>
    </header>
    <h1 className="tactic-showcase-title">{tactic.name}</h1>
    <CoreTacticCourt tactic={tactic} elapsed={elapsed}/>
    <div className="tactic-showcase-control">
      <div className="tactic-showcase-timeline"><button aria-label="上一步" disabled={elapsed<=0} onClick={previous}><TrackPreviousIcon/></button><input aria-label="播放进度" type="range" min="0" max={tactic.duration} step="0.01" value={elapsed} onChange={e=>{setPlaying(false);setElapsed(Number(e.target.value));}}/><button aria-label="下一步" disabled={elapsed>=tactic.duration} onClick={next}><TrackNextIcon/></button></div>
      <div className="tactic-showcase-actions"><button aria-label={`播放速度 ${speed} 倍`} onClick={()=>setSpeed(s=>s===1?.5:s===.5?.25:1)}>{speed}×</button><button className="tactic-showcase-play" aria-label={playing?"暂停":elapsed>=tactic.duration?"重播":"播放"} onClick={toggle}>{playing?<PauseIcon/>:elapsed>=tactic.duration?<ResetIcon/>:<PlayIcon/>}</button><button aria-label="从头重播" onClick={()=>{setElapsed(0);setPlaying(true);}}><ResetIcon/></button></div>
    </div>
    <div className="tactic-showcase-bottom">
      <button className="tactic-showcase-peek" aria-label={`打开战术讲解。当前判断：${currentDecision}`} onClick={()=>{setPlaying(false);setSettings(true);}}><ReaderIcon/><strong>{scored?"落地后继续向外弹开，对手无法触球":finished?"这一分，怎么用？":currentDecision}</strong></button>
      {useForPoint?<button className="tactic-showcase-use" disabled={selectedForPoint} onClick={()=>{setPlaying(false);setPointError("");const result=useForPoint();if(!result.ok)setPointError(result.error);}}><TargetIcon/><span>{selectedForPoint?"已选打法":"选这个打法"}</span></button>:<button className="tactic-showcase-use" onClick={()=>{setPlaying(false);openBoard();}}><DrawingPinIcon/><span>改成我的打法</span></button>}
    </div>
    {pointError&&<p className="tactic-showcase-error" role="alert">{pointError}</p>}
    <BottomSheet open={settings} onOpenChange={setSettings} title={tactic.name} description={`${meta.category} · ${meta.level}`} snap={.6}>
      <button className="guide-close" aria-label="关闭战术讲解" onClick={()=>setSettings(false)}><Cross2Icon/></button>
      {contextLabel&&<p className="court-context">{contextLabel}</p>}
      <TacticExplanation tactic={tactic}/>
      <button className="sheet-done" onClick={()=>setSettings(false)}>回到动画</button>
    </BottomSheet>
  </main>;
}

type PracticePlaybackState = "playing" | "paused" | "finished";

function SkillPracticeBoard({ stage }: { stage: SkillPracticeStage }) {
  const canvasRef=useRef<HTMLCanvasElement>(null),stageRef=useRef<HTMLDivElement>(null),elapsedRef=useRef(0),animationRef=useRef<number|null>(null);
  const playbackBoard=useMemo(()=>prepareBoardForMedia(stage.board),[stage.board]);
  const duration=useMemo(()=>getBoardDuration(playbackBoard),[playbackBoard]);
  const actors=useMemo(()=>playbackBoard.actors.map(actor=>({...actor,label:""})),[playbackBoard.actors]);
  const [state,setState]=useState<PracticePlaybackState>("playing");
  const drawAt=useCallback((elapsed:number)=>{
    const canvas=canvasRef.current,stage=stageRef.current;if(!canvas||!stage)return;
    const width=stage.clientWidth,height=stage.clientHeight;if(width<=0||height<=0)return;
    const dpr=Math.min(window.devicePixelRatio||1,2),pixelWidth=Math.max(1,Math.round(width*dpr)),pixelHeight=Math.max(1,Math.round(height*dpr));
    if(canvas.width!==pixelWidth||canvas.height!==pixelHeight){canvas.width=pixelWidth;canvas.height=pixelHeight;}
    const context=canvas.getContext("2d");if(!context)return;
    const pose=getBoardPose(playbackBoard,elapsed),frame=playbackBoard.frames[pose.frameIndex];if(!frame)return;
    // A practice demo teaches one ball at a time. Drawing every future and
    // previous route at nearly full strength makes the active beat unreadable
    // on a phone; retain only the final route after playback stops.
    const contextPaths=visiblePracticeContextPaths(playbackBoard,pose.frameIndex);
    context.setTransform(dpr,0,0,dpr,0,0);context.clearRect(0,0,width,height);
    renderBoard(context,width,height,frame,actors,{progress:pose.progress,playing:true,contextPaths,showLegend:false,showLabels:false,showZoneLabels:false});
  },[actors,playbackBoard]);
  useLayoutEffect(()=>{
    const stage=stageRef.current;if(!stage)return;const redraw=()=>drawAt(elapsedRef.current);redraw();
    if(typeof ResizeObserver==="undefined")return;const observer=new ResizeObserver(redraw);observer.observe(stage);return()=>observer.disconnect();
  },[drawAt]);
  useEffect(()=>{
    if(state!=="playing"||duration<=0)return;
    if(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches){elapsedRef.current=duration;drawAt(duration);setState("finished");return;}
    const started=performance.now(),base=elapsedRef.current;
    const tick=(now:number)=>{const elapsed=Math.min(duration,base+(now-started)/1000);elapsedRef.current=elapsed;drawAt(elapsed);if(elapsed>=duration){animationRef.current=null;setState("finished");return;}animationRef.current=requestAnimationFrame(tick);};
    const timer=window.setTimeout(()=>{animationRef.current=requestAnimationFrame(tick);},260);
    return()=>{window.clearTimeout(timer);if(animationRef.current!==null)cancelAnimationFrame(animationRef.current);animationRef.current=null;};
  },[drawAt,duration,state]);
  const toggle=()=>{if(state==="playing"){setState("paused");return;}if(state==="finished")elapsedRef.current=0;setState("playing");};
  const demonstrationLabel=`网球场示范：${playbackBoard.frames.filter(frame=>frame.paths.length>0).map(frame=>frame.label).join("、")}。${stage.task}`;
  return <div className="skill-practice-board" data-testid="skill-practice-board">
    <div ref={stageRef} className="skill-practice-stage" role="img" aria-label={demonstrationLabel}><canvas ref={canvasRef} aria-hidden="true"/></div>
    <button className="skill-practice-play" aria-label={state==="playing"?"暂停练习示范":state==="finished"?"重新播放练习示范":"继续播放练习示范"} onClick={toggle}>{state==="playing"?<PauseIcon/>:state==="finished"?<ResetIcon/>:<PlayIcon/>}</button>
  </div>;
}

function SkillPracticePlayer({ plan, selectedForPoint, useForPoint, back }: { plan:SkillPracticePlan;selectedForPoint:boolean;useForPoint:()=>{ok:true}|{ok:false;error:string};back:()=>void }) {
  const skill=fixedSkillById(plan.id);
  const [error,setError]=useState(""),[guideOpen,setGuideOpen]=useState(false),[helpOpen,setHelpOpen]=useState(false);
  const {screenRef}=useScreenPortal();
  useLayoutEffect(()=>{
    const stage=screenRef.current?.closest<HTMLElement>(".phone-stage");
    if(!stage)return;
    stage.dataset.boardImmersive="true";
    // This screen is only entered from the immersive personal board. Keep the
    // shared shell immersive during the pop transition so the old white header
    // cannot flash before the board reclaims the surface.
  },[screenRef]);
  if(!skill)return null;
  const stage=plan.stages[0];
  if(!stage)return null;
  return <main className="skill-practice-screen">
    <header className="skill-practice-header">
      <button aria-label="返回上一页" onClick={back}><ChevronLeftIcon/></button>
      <ProductWordmark/>
      <span/>
      <button aria-label="查看画板操作说明" onClick={()=>setHelpOpen(true)}><InfoCircledIcon/></button>
    </header>
    <h1 className="skill-practice-title">{skill.label}</h1>
    <SkillPracticeBoard key={stage.id} stage={stage}/>
    <button className="skill-practice-peek" aria-label={`打开${skill.label}训练说明`} onClick={()=>setGuideOpen(true)}>
      <span className="skill-practice-peek-handle" aria-hidden="true"/>
      <TargetIcon/><strong>这次练：{plan.guide.peek}</strong><ChevronDownIcon className="skill-practice-peek-chevron"/>
    </button>
    <BottomSheet open={guideOpen} onOpenChange={setGuideOpen} title={skill.label} snap={.42}>
      <div className="skill-practice-guide" data-testid="skill-practice-guide">
        <section className="skill-practice-guide-row"><TargetIcon/><span><strong>为了解决</strong><p>{plan.guide.problem}</p></span></section>
        <section className="skill-practice-guide-row"><PersonIcon/><span><strong>这样摆</strong><div className="skill-practice-setup">{plan.guide.setup.map(item=><b key={item}>{item}</b>)}</div></span></section>
        <section className="skill-practice-guide-row"><DrawingPinIcon/><span><strong>这一组</strong><ol>{plan.guide.sequence.map(item=><li key={item}>{item}</li>)}</ol></span></section>
        <section className="skill-practice-guide-row is-focus"><CheckCircledIcon/><span><strong>只看一点</strong><p>{plan.guide.focus}</p></span><button className="skill-practice-use" disabled={selectedForPoint} onClick={()=>{setError("");const result=useForPoint();if(!result.ok)setError(result.error);}}>{selectedForPoint?<><CheckCircledIcon/>已接上</>:<><DrawingPinIcon/>练这个</>}</button></section>
        {error&&<p className="skill-practice-error" role="alert">{error}</p>}
      </div>
    </BottomSheet>
    <BottomSheet open={helpOpen} onOpenChange={setHelpOpen} title="画板说明" snap={.38}>
      <div className="skill-practice-help">
        <p><PlayIcon/><span><strong>播放示范</strong><small>再点一次暂停，播放结束后可重播。</small></span></p>
        <p><TargetIcon/><span><strong>先看球路</strong><small>绿色是球路，蓝色虚线是球员移动。</small></span></p>
        <p><DrawingPinIcon/><span><strong>再看场地</strong><small>目标区和标志桶告诉你落点与回位位置。</small></span></p>
      </div>
    </BottomSheet>
  </main>;
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
        <div className="rally-recap-actions"><button onClick={restart}><ResetIcon/>再走一次</button><button className="is-primary" onClick={()=>setCheckpointStart(decisionCount)}>继续这一分</button></div>
      </div>:finished&&scenario?<div className="rally-choice-panel is-scenario" aria-live="polite">
        <div className="rally-choice-heading"><div><span>同一场上情境</span><h2 ref={choiceHeadingRef} tabIndex={-1}>{scenario.prompt}</h2></div><button onClick={replay}><ResetIcon/>再看本段</button></div>
        <dl className="rally-signal-strip">
          <div><dt>来球</dt><dd>{scenario.observation.ball}</dd></div>
          <div><dt>自己</dt><dd>{scenario.observation.self}</dd></div>
          <div><dt>对手</dt><dd>{scenario.observation.opponent}</dd></div>
        </dl>
        <div className="rally-choice-grid is-scenario-grid">{scenario.choices.map((choice,index)=><button className="rally-choice-button is-scenario-choice" disabled={selecting} key={`${current.node.id}-scenario-${index}`} onClick={()=>chooseScenario(choice)} aria-label={`同一场上情境，选择${choice.action}`}><span>{choice.intent}</span><strong>{choice.action}</strong></button>)}</div>
      </div>:finished?<div className="rally-choice-panel" aria-live="polite">
        <div className="rally-choice-heading"><div><span>选择下一拍</span><h2 ref={choiceHeadingRef} tabIndex={-1}>{current.node.prompt}</h2></div><button onClick={replay}><ResetIcon/>再看本段</button></div>
        <div className="rally-choice-grid">{current.node.choices.map((choice,index)=><button className="rally-choice-button" disabled={selecting} key={`${current.node.id}-${index}`} onClick={()=>choose(choice)} aria-label={`看到${choice.signal}，选择${choice.action}`}><span>{choice.intent}</span><strong>{choice.action}</strong><small>{choice.signal}</small></button>)}</div>
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
    <button className="combination-board-entry" onClick={openBoard}><LayersIcon/><span><strong>整套放入画板</strong><small>逐拍调整球路、跑位和标记</small></span></button>
    <div className="combination-route" aria-label={`${combination.name}的比赛路径`}>
      <div className="combination-route-title"><strong>比赛路径</strong><span>先读信号，再进下一招</span></div>
      <ol>{combination.stages.map((stage,index)=>{const tactic=combinationExample(stage.tacticId,stage.excerpt);return <li key={`${stage.tacticId}-route`}><span>{index+1}</span><strong>{tactic.name}</strong></li>;})}</ol>
    </div>
    <div className="combination-section-title"><h2>按来球，一步步搭配</h2><p>每招可单独看球路，不必按固定拍数完成。</p></div>
    <ol className="combination-stages">{combination.stages.map((stage,index)=>{const tactic=combinationExample(stage.tacticId,stage.excerpt);return <li className="combination-stage" key={`${stage.tacticId}-${index}`}>
      <div className="combination-stage-top"><span>{String(index+1).padStart(2,"0")}</span><h3>{tactic.name}</h3></div>
      <div className="combination-cue"><strong>先这样打</strong><p>{stage.cue}</p></div><div className="combination-transition"><strong>{index===combination.stages.length-1?"打完继续判断":"看到这个，再进下一招"}</strong><p>{stage.transition}</p></div>
      <button className="watch-example" onClick={()=>openExample(stage.tacticId,`${combination.name} · 阶段 ${index+1}`,stage.excerpt)} aria-label={`观看阶段 ${index+1}：${tactic.name}`}><PlayIcon/>看这一招的球路</button>
    </li>;})}</ol>
    <div className="combination-section-title variant-title"><h2>对手变了，换一招</h2><p>出现下面的信号，就在当下调整。</p></div>
    <div className="combination-variants">{combination.variants.map((variant,index)=>{const open=variantOpen===index;return <section className="combination-variant" key={variant.name}>
      <button className="variant-trigger" aria-expanded={open} aria-controls={`variant-${combination.id}-${index}`} onClick={()=>setVariantOpen(open?null:index)}><span><strong>{variant.name}</strong><small>{variant.trigger}</small></span><ChevronDownIcon className={open?"is-open":""}/></button>
      <div className="variant-response" id={`variant-${combination.id}-${index}`} hidden={!open}><p>{variant.response}</p><button className="watch-example" onClick={()=>openExample(variant.tacticId,`${combination.name} · 应变：${variant.name}`,variant.excerpt)} aria-label={`观看衍生打法：${variant.name}`}><PlayIcon/>看对应打法</button></div>
    </section>;})}</div>
    <p className="combination-note">先看来球深浅、自己的平衡和对手站位。条件不合适，就回到安全相持。</p>
  </div></MobileScroll>;
}
function TacticThumbnail({ item }: { item: Tactic | Combination }) {
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const plan=useMemo(()=>"frames" in item?getTacticThumbnailPlan(item):getCombinationThumbnailPlan(item.stages.slice(0,2).map(stage=>combinationExample(stage.tacticId,stage.excerpt))),[item]);
  useLayoutEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    const dpr=Math.min(window.devicePixelRatio||1,2),width=160,height=220;
    canvas.width=width*dpr;canvas.height=height*dpr;
    const ctx=canvas.getContext("2d");if(!ctx)return;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const paths:BoardPath[]=[
      ...plan.meMove?[{id:"preview-me",kind:"move" as const,actorId:"me",from:plan.meMove.from,to:plan.meMove.to}]:[],
      ...plan.opponentMove?[{id:"preview-opponent",kind:"move" as const,actorId:"opponent",from:plan.opponentMove.from,to:plan.opponentMove.to}]:[],
      ...plan.shots.map((shot,index)=>({id:`preview-ball-${index}`,kind:"shot" as const,actorId:"ball",from:shot.from,to:shot.to})),
    ];
    renderBoard(ctx,width,height,{id:`preview-${item.id}`,label:"",duration:0,poses:{me:plan.me,opponent:plan.opponent,ball:plan.shots[0]?.from??[.5,.5]},paths,marks:[]},[
      {id:"me",label:"",kind:"player",color:"#398de0"},
      {id:"opponent",label:"",kind:"player",color:"#df4050"},
    ],{progress:1,playing:false,showLegend:false,showLabels:false,showActorLabels:false,showZones:true,showZoneLabels:false,surface:"hard"});
    // The full editor's route stroke is deliberately fine. At thumbnail scale,
    // reinforce only these same source-data routes so the decision reads at a glance.
    const geometry=getBoardGeometry(width,height);
    plan.shots.forEach((shot,index)=>{
      const from=geometry.toCanvas(shot.from),to=geometry.toCanvas(shot.to);
      const angle=Math.atan2(to[1]-from[1],to[0]-from[0]);
      ctx.save();ctx.globalAlpha=index<plan.shots.length-1?.82:1;
      ctx.strokeStyle="#d8ef72";ctx.lineWidth=4.4;ctx.lineCap="round";ctx.lineJoin="round";
      ctx.beginPath();ctx.moveTo(...from);ctx.lineTo(...to);ctx.stroke();
      ctx.beginPath();ctx.moveTo(to[0]-Math.cos(angle-.55)*9,to[1]-Math.sin(angle-.55)*9);
      ctx.lineTo(...to);ctx.lineTo(to[0]-Math.cos(angle+.55)*9,to[1]-Math.sin(angle+.55)*9);ctx.stroke();ctx.restore();
    });
    for(const [at,color] of [[plan.me,"#398de0"],[plan.opponent,"#df4050"]] as const){
      const point=geometry.toCanvas(at);ctx.beginPath();ctx.arc(...point,6.5,0,Math.PI*2);
      ctx.fillStyle=color;ctx.fill();ctx.strokeStyle="#f1f5ed";ctx.lineWidth=2;ctx.stroke();
    }
  },[item.id,plan]);
  return <canvas ref={canvasRef} className="card-picture" data-testid="tactic-thumbnail" aria-hidden="true"/>;
}

type CatalogueItem = { kind:"tactic"; value:Tactic; category:CategoryFilter } | { kind:"combination"; value:Combination; category:CategoryFilter };
const featuredTacticIds=["return-middle","defend-high-middle","wrong-foot","drop-lob"];
const previewPurpose:Record<string,string>={
  "return-middle":"先把球送深，争取回位",
  "defend-high-middle":"被拉出场外时，争取时间",
  "wrong-foot":"对手往一侧移动后，打向他身后",
  "drop-lob":"先引到网前，再挑到身后",
};
function orderedCatalogue(initialMode:"tactics"|"combinations"):CatalogueItem[] {
  return categories.filter(category=>category!=="全部").flatMap(category=>{
    const tacticEntries=tactics.filter(tactic=>tacticMeta(tactic).category===category)
      .sort((left,right)=>{
        const leftIndex=featuredTacticIds.indexOf(left.id),rightIndex=featuredTacticIds.indexOf(right.id);
        return (leftIndex<0?featuredTacticIds.length:leftIndex)-(rightIndex<0?featuredTacticIds.length:rightIndex);
      }).map(value=>({kind:"tactic" as const,value,category}));
    const combinationEntries=combinations.filter(combination=>combination.category===category)
      .map(value=>({kind:"combination" as const,value,category}));
    return initialMode==="combinations"?[...combinationEntries,...tacticEntries]:[...tacticEntries,...combinationEntries];
  });
}
function TacticsList({ openTactic, openCombination, initialMode="tactics", initialCategory="全部", jumpRef }: { openTactic: (tactic: Tactic) => void; openCombination:(combination:Combination)=>void; initialMode?:"tactics" | "combinations"; initialCategory?:CategoryFilter; choosingForPoint?:boolean; jumpRef?:{current:(category:CategoryFilter)=>void} }) {
  const catalogueRef=useRef<HTMLElement>(null);
  const entries=useMemo(()=>orderedCatalogue(initialMode),[initialMode]);
  const jumpToCategory=useCallback((category:CategoryFilter,behavior:ScrollBehavior="smooth")=>{
    const scroller=catalogueRef.current?.querySelector<HTMLElement>(".mobile-scroll");
    if(!scroller)return;
    if(category==="全部"){scroller.scrollTo({top:0,behavior});return;}
    const target=Array.from(scroller.querySelectorAll<HTMLElement>("[data-tactic-section]"))
      .find(section=>section.dataset.tacticSection===category);
    if(!target)return;
    const top=target.getBoundingClientRect().top-scroller.getBoundingClientRect().top+scroller.scrollTop-6;
    scroller.scrollTo({top,behavior});
  },[]);
  useLayoutEffect(()=>{
    if(!jumpRef)return;
    jumpRef.current=category=>jumpToCategory(category,window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth");
  },[jumpRef,jumpToCategory]);
  useLayoutEffect(()=>{
    if(initialCategory==="全部")return;
    const frame=window.requestAnimationFrame(()=>jumpToCategory(initialCategory,"instant"));
    return ()=>window.cancelAnimationFrame(frame);
  },[initialCategory,jumpToCategory]);
  return <section ref={catalogueRef} className="tactic-catalogue" aria-label="青少年比赛战术">
    <MobileScroll className="tactic-list-screen">
      <main className="tactics-grid" aria-label="打法总览">
      {categories.filter(category=>category!=="全部").map(category=><section key={category} className="tactic-section" data-tactic-section={category} role="region" aria-label={category}>
        <h2 className="tactic-section-heading">{category}</h2><div className="tactic-section-list">{entries.filter(entry=>entry.category===category).map(entry=>{
        if(entry.kind==="combination"){
          const combination=entry.value;
          const isPractice=Boolean(interactiveRallies.find(item=>item.combinationId===combination.id)?.decisionPractice);
          return <button className="tactic-card combo-card" key={`combination-${combination.id}`} onClick={event=>{event.currentTarget.blur();openCombination(combination);}} aria-label={isPractice?`打开${combination.name}，在同一个场面试不同打法`:`打开${combination.name}互动对打，自动播放第一段，每段提供二到三个现场选择`}>
            <TacticThumbnail item={combination}/><div className="card-copy"><h3>{combination.name}</h3><p className="card-purpose">{combination.goal}</p></div>
          </button>;
        }
        const tactic=entry.value,meta=tacticMeta(tactic);
        return <button key={`tactic-${tactic.id}`} className="tactic-card" onClick={event=>{event.currentTarget.blur();openTactic(tactic);}} aria-label={`${tactic.name}，${tactic.duration}秒，${meta.category}，${meta.level}`}>
          <TacticThumbnail item={tactic}/><div className="card-copy"><h3>{tactic.name}</h3><p className="card-purpose">{previewPurpose[tactic.id]??meta.goal}</p></div>
        </button>;
      })}</div></section>)}
    </main></MobileScroll>
  </section>;
}

function TacticCatalogueHeader({close,jump}:{close:()=>void;jump:(category:CategoryFilter)=>void}){
  const [indexOpen,setIndexOpen]=useState(false);
  const indexRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!indexOpen)return;
    const onKeyDown=(event:KeyboardEvent)=>{if(event.key==="Escape")setIndexOpen(false);};
    const onOutsideClick=(event:MouseEvent)=>{
      if(event.target instanceof Node&&!indexRef.current?.contains(event.target)){
        event.preventDefault();
        event.stopPropagation();
        setIndexOpen(false);
      }
    };
    document.addEventListener("keydown",onKeyDown);
    document.addEventListener("click",onOutsideClick,true);
    return ()=>{document.removeEventListener("keydown",onKeyDown);document.removeEventListener("click",onOutsideClick,true);};
  },[indexOpen]);
  return <div className="knowledge-header">
    <h1>找个打法</h1>
    <div className="knowledge-header-actions" ref={indexRef}>
      <button type="button" className="knowledge-index-trigger" aria-label="跳到打法段落" aria-expanded={indexOpen} aria-controls="tactic-section-index" onClick={()=>setIndexOpen(value=>!value)}><ReaderIcon/></button>
      {indexOpen&&<nav id="tactic-section-index" className="knowledge-index-menu" aria-label="跳转到打法分类">
        {categories.map(category=><button type="button" key={category} onClick={()=>{setIndexOpen(false);jump(category);}}>{category==="全部"?"顶部":category}</button>)}
      </nav>}
      <button type="button" className="knowledge-close" aria-label="关闭打法列表" onClick={close}><Cross2Icon/></button>
    </div>
  </div>;
}

type BoardSaveState = "clean" | "dirty" | "saving" | "saved" | "error";
type BoardActionName = "undo" | "redo" | "save" | "files" | "rename" | "restore" | "fullscreen" | "back";
const BOARD_ACTION_EVENT = "tennis-board-action";

function sendBoardAction(boardId:string,action:BoardActionName) {
  window.dispatchEvent(new CustomEvent(BOARD_ACTION_EVENT,{detail:{boardId,action}}));
}

function saveDownload(blob:Blob,name:string) {
  const url=URL.createObjectURL(blob),anchor=document.createElement("a");
  anchor.href=url;anchor.download=name;
  try{anchor.click();}finally{setTimeout(()=>URL.revokeObjectURL(url),0);}
}

function safeFilename(title:string,extension:string) {
  return `${title.trim().replace(/[\\/:*?"<>|]+/g,"-").slice(0,48)||"tennis-board"}.${extension}`;
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
  const [pendingImport,setPendingImport]=useState<{targetId?:string;message:string;damaged?:boolean}|null>(null);
  const [pendingDeleteMessage,setPendingDeleteMessage]=useState("");
  const [pendingCopyMessage,setPendingCopyMessage]=useState("");
  const [activePurpose,setActivePurpose]=useState<BoardPurpose>("tactic"),[historyRevealed,setHistoryRevealed]=useState(false);
  const historyHubRef=useRef<HTMLElement|null>(null),purposeTouchedRef=useRef(false);
  const refresh=useCallback(()=>{
    const journal=readBoardImportJournal();
    const pending=journal.ok?journal.value?{targetId:journal.value.targetId,message:"上次导入未完成"}:null:{message:"上次导入记录异常，画板仍在本机，请先查看恢复方式",damaged:true};
    const deletion=readBoardDeleteJournal();
    const copy=readBoardCopyJournal();
    const result=readBoards();
    const deleteNeedsHold=!deletion.ok||Boolean(deletion.value&&(!result.ok||result.value.some(board=>board.id===deletion.value?.boardId)));
    const deleteMessage=!deleteNeedsHold?"":deletion.ok?"上次删除尚未恢复，画板仍在本机，请先查看恢复方式":"上次删除记录异常，画板仍在本机，请先查看恢复方式";
    setPendingImport(pending);
    setPendingDeleteMessage(deleteMessage);
    setPendingCopyMessage(copy.ok?copy.value?"上次另存尚未整理完，请先查看恢复方式":"":"上次另存记录异常，画板仍在本机，请先查看恢复方式");
    if(result.ok){
      const complete=pending?.damaged||deleteNeedsHold||!copy.ok||copy.value?[]:result.value.filter(board=>board.id!==pending?.targetId);
      setDrafts(result.value);
      setDraftsStatus("ready");
      setStorageError("");
      if(!purposeTouchedRef.current&&complete[0])setActivePurpose(getBoardPurpose(complete[0]));
    }else{
      setDraftsStatus("error");
      setStorageError("暂时读不到此浏览器里的画板，请重试");
    }
  },[]);
  useEffect(()=>{refresh();const onStorage=(event:StorageEvent)=>{if(event.key===null||event.key===BOARD_STORAGE_KEY||event.key===BOARD_IMPORT_JOURNAL_KEY||event.key===BOARD_DELETE_JOURNAL_KEY||event.key===BOARD_COPY_JOURNAL_KEY)refresh();};window.addEventListener(BOARD_DRAFTS_EVENT,refresh);window.addEventListener(BOARD_COPY_RECOVERY_EVENT,refresh);window.addEventListener("storage",onStorage);return()=>{window.removeEventListener(BOARD_DRAFTS_EVENT,refresh);window.removeEventListener(BOARD_COPY_RECOVERY_EVENT,refresh);window.removeEventListener("storage",onStorage);};},[refresh]);
  useEffect(()=>{const scroll=historyHubRef.current?.closest<HTMLElement>(".mobile-scroll");if(!scroll)return;const reveal=()=>{if(scroll.scrollTop>24)setHistoryRevealed(true);};scroll.addEventListener("scroll",reveal,{passive:true});reveal();return()=>scroll.removeEventListener("scroll",reveal);},[]);
  const recoveryBlocked=Boolean(pendingImport?.damaged||pendingDeleteMessage||pendingCopyMessage);
  const completeDrafts=useMemo(()=>recoveryBlocked?[]:drafts.filter(board=>board.id!==pendingImport?.targetId),[drafts,pendingImport,recoveryBlocked]);
  const latestPlayableBoard=useMemo(()=>findLatestPlayableBoard(completeDrafts),[completeDrafts]);
  const visibleHistory=useMemo(()=>completeDrafts.filter(board=>getBoardPurpose(board)===activePurpose).slice(0,4),[activePurpose,completeDrafts]);
  const draftsPending=recoveryBlocked||(completeDrafts.length===0&&draftsStatus!=="ready");
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
      <button className="home-trial-demo" onClick={()=>openBoard(createTwoStageDemo(),false)}><PlayIcon/><span><strong>试看二段跑位</strong><small>打开后点播放，看蓝色球员先回位、再接球</small></span></button>
      <div className="home-intent-actions" aria-label="开始画板">
        <button disabled={recoveryBlocked} onClick={()=>openNewBoard("tactic")}><Pencil2Icon/><span>想下一分</span></button>
        <button disabled={recoveryBlocked} onClick={()=>openNewBoard("review")}><ReaderIcon/><span>回顾刚才一分</span></button>
      </div>
      <button className={`home-scroll-cue${historyRevealed?" is-revealed":""}`} data-testid="home-scroll-cue" aria-label="上滑查看画板历史" aria-controls="home-history-hub" onClick={revealHistory}><span>上滑看我的画板</span><ChevronDownIcon aria-hidden="true"/></button>
    </section>
    <section ref={historyHubRef} id="home-history-hub" className="home-history-hub" data-testid="home-history-hub" aria-labelledby="home-history-title">
      <div className="home-history-heading"><h2 id="home-history-title">我的画板</h2>{draftsStatus==="ready"&&<span>{recoveryBlocked?"待确认":`${completeDrafts.length} 份`}</span>}</div>
      {(pendingImport||pendingDeleteMessage||pendingCopyMessage)&&<div className="home-import-pending" role="status"><span>{[pendingImport?.message,pendingDeleteMessage,pendingCopyMessage].filter(Boolean).join("；")}</span><button onClick={openLibrary}>{recoveryBlocked?"查看恢复方式":"继续导入"}</button></div>}
      <div className="home-purpose-filters" aria-label="按用途找画板">
        {HOME_BOARD_PURPOSES.map(purpose=><button key={purpose} aria-pressed={activePurpose===purpose} onClick={()=>{purposeTouchedRef.current=true;setActivePurpose(purpose);}}><span>{BOARD_PURPOSE_LABELS[purpose]}</span></button>)}
      </div>
      {draftsStatus==="loading"&&drafts.length===0?<div className="home-history-empty" role="status">正在打开你的画板…</div>:draftsStatus==="error"&&drafts.length===0?<div className="home-history-empty"><span>画板暂时打不开</span><button onClick={refresh}>重试</button></div>:recoveryBlocked?<div className="home-history-empty">暂不打开画板，以免把未恢复的记录当成完整作品。原始资料仍保留。</div>:visibleHistory.length?<div className="home-history-list">{visibleHistory.map(board=>{const purpose=getBoardPurpose(board);return <button key={board.id} data-testid="home-history-board" data-board-id={board.id} onClick={()=>openBoard(board,true)}><span className={`home-history-purpose is-${purpose}`}>{BOARD_PURPOSE_LABELS[purpose]}</span><span className="home-history-copy"><strong>{board.title}</strong><small>{board.frames.length} 拍 · {homeBoardDate(board.updatedAt)}</small></span></button>;})}</div>:<div className="home-history-empty">还没有{BOARD_PURPOSE_LABELS[activePurpose]}画板</div>}
      <div className="home-history-actions">
        <button className="home-history-new" disabled={recoveryBlocked} onClick={()=>openNewBoard(activePurpose)}><PlusIcon/><span>{HOME_BOARD_PURPOSE_ACTIONS[activePurpose]}</span></button>
        {!recoveryBlocked&&(draftsStatus==="ready"&&completeDrafts.length===0?<button className="home-history-all" onClick={openLibrary}><UploadIcon/><span>导入备份</span></button>:completeDrafts.length>0&&<button className="home-history-all" onClick={openLibrary}><span>全部画板</span></button>)}
      </div>
    </section>
    <section className="home-knowledge-section" aria-label="战术知识库入口">
      <button className="home-knowledge-entry" onClick={()=>openKnowledge("tactics")}><TacticFinderIcon/><span>找个打法</span></button>
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
  automaticSelectionBefore:boolean;
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
  // A receiver who is already at the landing point can hit the next ball
  // directly. Derive this without adding a zero-length movement or changing
  // a saved document merely because it was opened.
  if(smart.phase==="move"){
    const receiverPoint=frame.poses[actor.id],ballPoint=frame.poses[balls[0].id];
    if(ballPoint&&Math.hypot(receiverPoint[0]-ballPoint[0],receiverPoint[1]-ballPoint[1])<=.015)
      return {frameIndex,phase:"shot",hitterId:smart.hitterId,actorId:balls[0].id};
  }
  return {frameIndex,phase:smart.phase,hitterId:smart.hitterId,actorId:smart.actorId};
}

type BoardCanvasCompletion = {
  selection:BoardSelection;
  created:boolean;
  gesture:BoardDrag["kind"];
  base:BoardDocument;
  path?:BoardDrag["path"];
};

function BoardCanvas({board,frameIndex,selection,setSelection,tool,actorPreset,pathKind,markPreset,curved,smartEnabled,protectPreviousEndpoints,preferredActorId,contextPaths,contextFrameIndex,previewing,elapsed,display,rotated,preview,commit,finishPreview,onComplete,onOverride,onCancel,onNudge,onDelete,onError,onTogglePathCurve,onPlaceText,onEditText}: {
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
  protectPreviousEndpoints:boolean;
  preferredActorId?:string;
  contextPaths:BoardPath[];
  contextFrameIndex:number|null;
  previewing:boolean;
  elapsed:number;
  display:BoardDisplayPreferences;
  rotated:boolean;
  preview:(next:BoardDocument)=>void;
  commit:(next:BoardDocument)=>void;
  finishPreview:(base:BoardDocument,cancel?:boolean)=>void;
  onComplete:(completion:BoardCanvasCompletion)=>void;
  onOverride:(actor:BoardActor)=>void;
  onCancel:(base:BoardDocument,selectionBefore:BoardSelection|null,automaticSelectionBefore:boolean)=>void;
  onNudge:(dx:number,dy:number)=>void;
  onDelete:()=>void;
  onError:(message:string)=>void;
  onTogglePathCurve:()=>void;
  onPlaceText:(point:BoardPoint)=>void;
  onEditText:(markId:string,markFrameIndex:number)=>void;
}) {
  const holderRef=useRef<HTMLDivElement>(null),canvasRef=useRef<HTMLCanvasElement>(null),drawRef=useRef<()=>void>(()=>{}),dragRef=useRef<BoardDrag|null>(null),chargeRef=useRef<BoardChargeFeedback|null>(null),chargeAnimationRef=useRef<number|null>(null),chargePaceRef=useRef<BoardShotPace>("control");
  const [canvasSize,setCanvasSize]=useState({width:0,height:0});
  const latest=useRef({board,frameIndex,selection,contextPaths,contextFrameIndex,previewing,elapsed,display,rotated});latest.current={board,frameIndex,selection,contextPaths,contextFrameIndex,previewing,elapsed,display,rotated};
  useLayoutEffect(()=>{
    const canvas=canvasRef.current,holder=holderRef.current;if(!canvas||!holder)return;
    const draw=()=>{
      const current=latest.current,width=holder.clientWidth,height=holder.clientHeight,dpr=Math.min(window.devicePixelRatio||1,3);
      if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
      setCanvasSize(size=>size.width===width&&size.height===height?size:{width,height});
      const ctx=canvas.getContext("2d");if(!ctx)return;ctx.setTransform(dpr,0,0,dpr,0,0);
      const pose=current.previewing?getBoardPose(current.board,current.elapsed):null;
      const targetIndex=pose?.frameIndex??current.frameIndex,frame=current.board.frames[targetIndex];if(!frame)return;
      const drag=dragRef.current;
      const draggingActor=drag?.kind==="path"&&drag.path?.kind==="move"&&drag.lastPoint?{actorId:drag.path.actorId,point:drag.lastPoint}:undefined;
      // During a guided move, show the same route origin that release will save.
      // Keep pending edits in the normal undo/cancel pipeline, with visual-only feedback.
      const guidedMove=draggingActor&&drag?.base.smartRally?.frameId===frame.id&&targetIndex>0;
      const visualFrame=guidedMove?{...frame,paths:frame.paths.map(path=>path.id===drag?.id?{...path,from:drag.base.frames[targetIndex-1].poses[path.actorId]}:path)}:frame;
      const visualContext=guidedMove?current.contextPaths.filter(path=>path.actorId!==draggingActor.actorId):current.contextPaths;
      renderBoard(ctx,width,height,visualFrame,current.board.actors,{draggingActor,rotated:current.rotated,progress:pose?.progress??0,playing:current.previewing,selection:current.selection,showLegend:false,showLabels:true,showActorLabels:false,contextPaths:visualContext,contextFrameIndex:current.contextFrameIndex??undefined,surface:current.display.surface,showZones:current.display.showZones,showZoneLabels:current.display.showZoneLabels,charge:current.previewing?null:chargeRef.current});
    };
    drawRef.current=draw;const resize=new ResizeObserver(draw);resize.observe(holder);draw();return()=>resize.disconnect();
  },[]);
  useEffect(()=>drawRef.current(),[board,contextFrameIndex,contextPaths,frameIndex,selection,previewing,elapsed,display,rotated]);

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
    const target=event.currentTarget,geometry=getBoardGeometry(target.clientWidth,target.clientHeight,rotated);
    return geometry.clampPoint(geometry.fromCanvas(toCanvasPoint(event)));
  };
  const actorFromPreset=(preset:ActorPreset):BoardActor=>preset==="ball"
    ?{id:newBoardId("ball"),label:"网球",kind:"ball",color:"#d8ef72"}
    :preset==="me"?{id:newBoardId("player"),label:"我方",kind:"player",color:"#3e8ad6"}:{id:newBoardId("player"),label:"对手",kind:"player",color:"#dc4151"};
  const markFromPreset=(preset:MarkPreset,point:BoardPoint):BoardMark=>({id:newBoardId("mark"),kind:preset,position:point,...(preset==="target"?{size:[.34,.1] as BoardPoint,text:"目标区"}:preset==="text"?{text:"备注"}:{})});

  const onPointerDown=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(previewing||(event.pointerType==="mouse"&&event.button!==0))return;
    const frame=board.frames[frameIndex];if(!frame)return;
    const point=toBoardPoint(event),pixel=toCanvasPoint(event);
    try{
      // A shot can end on the receiver, so the ball and player may share the
      // same frame-start point. Keep the actor armed by the guided flow (or by
      // a manual path tool) as the preferred hit target in that overlap.
      const armedSelection=preferredActorId?{kind:"actor" as const,id:preferredActorId}:null;
      // After creating a route, keep it selected for Delete while the next
      // gesture can still start from any actor, including its overlapping ball.
      const actorHit=armedSelection?hitTestBoard(pixel,event.currentTarget.clientWidth,event.currentTarget.clientHeight,frame,board.actors,armedSelection,{rotated}):null;
      const preferredSelection=actorHit?.kind==="actor"?armedSelection:selection?.kind==="actor"||selection?.kind==="element"&&selection.frameIndex!==undefined?selection:tool==="select"?selection:null;
      const contextCanReceiveInput=tool!=="actor"&&tool!=="mark";
      const hit=hitTestBoard(pixel,event.currentTarget.clientWidth,event.currentTarget.clientHeight,frame,board.actors,preferredSelection,{rotated,contextPaths:contextCanReceiveInput?contextPaths:[],contextFrameIndex:contextCanReceiveInput?contextFrameIndex??undefined:undefined});
      if(hit?.kind==="handle"){
        const sourceFrameIndex=hit.frameIndex??frameIndex,path=board.frames[sourceFrameIndex]?.paths.find(item=>item.id===hit.id),handlePoint=hit.handle==="control"&&!path?.control&&path?[(path.from[0]+path.to[0])/2,(path.from[1]+path.to[1])/2] as BoardPoint:path?.[hit.handle];
        if(!handlePoint)return;
        // The previous shot stays selected for Delete. Its old endpoints are
        // not a return-shot origin until the user deliberately selects it.
        if(protectPreviousEndpoints&&sourceFrameIndex!==frameIndex&&hit.handle!=="control"){
          onError("先拖动接球球员画跑位，再从当前网球画下一拍。要修改上一拍，请先点选那条球路。");return;
        }
        dragRef.current={pointerId:event.pointerId,base:board,kind:"handle",id:hit.id,handle:hit.handle,sourceFrameIndex,startClient:[event.clientX,event.clientY],offset:[handlePoint[0]-point[0],handlePoint[1]-point[1]],moved:false,selectionBefore:selection,automaticSelectionBefore:Boolean(preferredActorId&&selection?.kind==="element")};
        setSelection({kind:"element",id:hit.id,...(sourceFrameIndex===frameIndex?{}:{frameIndex:sourceFrameIndex})});event.currentTarget.setPointerCapture(event.pointerId);return;
      }
      if(hit?.kind==="element"&&hit.frameIndex!==undefined&&hit.frameIndex!==frameIndex){setSelection(hit);return;}
      if(tool==="actor"){
        const actor=actorFromPreset(actorPreset),next=addActor(board,actor,point),nextSelection={kind:"actor",id:actor.id} as const;commit(next);onComplete({selection:nextSelection,created:true,gesture:"actor",base:board});return;
      }
      if(tool==="mark"){
        if(markPreset==="text"){event.preventDefault();onPlaceText(point);return;}
        const mark=markFromPreset(markPreset,point);
        if(markPreset!=="freehand"){const nextSelection={kind:"element",id:mark.id} as const;commit(addMark(board,frameIndex,mark));onComplete({selection:nextSelection,created:true,gesture:"mark",base:board});return;}
        dragRef.current={pointerId:event.pointerId,base:board,kind:"freehand",id:mark.id,points:[point],startClient:[event.clientX,event.clientY],moved:false,selectionBefore:selection,automaticSelectionBefore:Boolean(preferredActorId&&selection?.kind==="element")};event.currentTarget.setPointerCapture(event.pointerId);return;
      }
      // Empty court deselects even while the next smart-rally tool is armed.
      // This exposes the dock's history button without cancelling continuation.
      if(!hit){setSelection(null);onError("");return;}
      const hitText=hit.kind==="element"?frame.marks.find(mark=>mark.id===hit.id&&mark.kind==="text"):undefined;
      if(hitText){
        dragRef.current={pointerId:event.pointerId,base:board,kind:"mark",id:hitText.id,startClient:[event.clientX,event.clientY],offset:[hitText.position[0]-point[0],hitText.position[1]-point[1]],moved:false,selectionBefore:selection,automaticSelectionBefore:Boolean(preferredActorId&&selection?.kind==="element")};
        setSelection(hit);event.currentTarget.setPointerCapture(event.pointerId);return;
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
        dragRef.current={pointerId:event.pointerId,base:board,kind:"path",id,startClient:[event.clientX,event.clientY],moved:false,selectionBefore:selection,automaticSelectionBefore:Boolean(preferredActorId&&selection?.kind==="element"),path:{kind,actorId:actor.id,from}};event.currentTarget.setPointerCapture(event.pointerId);return;
      }
      if(hit.kind==="actor"){
        const pose=frame.poses[hit.id];if(!pose)return;
        dragRef.current={pointerId:event.pointerId,base:board,kind:"actor",id:hit.id,startClient:[event.clientX,event.clientY],offset:[pose[0]-point[0],pose[1]-point[1]],moved:false,selectionBefore:selection,automaticSelectionBefore:Boolean(preferredActorId&&selection?.kind==="element")};
      }
      else {
        const mark=frame.marks.find(item=>item.id===hit.id);
        if(mark)dragRef.current={pointerId:event.pointerId,base:board,kind:"mark",id:hit.id,startClient:[event.clientX,event.clientY],offset:[mark.position[0]-point[0],mark.position[1]-point[1]],moved:false,selectionBefore:selection,automaticSelectionBefore:Boolean(preferredActorId&&selection?.kind==="element")};
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
          const control=curved&&path.kind!=="move"?curveControl(path.from,point,true):undefined;
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
    if(cancel){stopCharge();finishPreview(drag.base,true);onCancel(drag.base,drag.selectionBefore,drag.automaticSelectionBefore);return;}
    if(!drag.moved){
      stopCharge();
      if(drag.kind==="mark"&&drag.base.frames[frameIndex]?.marks.some(mark=>mark.id===drag.id&&mark.kind==="text"))onEditText(drag.id,frameIndex);
      return;
    }
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
    if(delta[event.key]){event.preventDefault();const [dx,dy]=delta[event.key]!;onNudge(rotated?-dx:dx,rotated?-dy:dy);}
    else if(event.key==="Delete"||event.key==="Backspace"){event.preventDefault();onDelete();}
  };
  const selectedPathForToggle=selection?.kind==="element"
    ? board.frames[selection.frameIndex??frameIndex]?.paths.find(path=>path.id===selection.id)
      ?? (selection.frameIndex===contextFrameIndex?contextPaths.find(path=>path.id===selection.id):undefined)
    : undefined;
  const toggleGeometry=canvasSize.width>0?getBoardGeometry(canvasSize.width,canvasSize.height,rotated):null;
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
  return <div ref={holderRef} className="board-canvas" data-testid="board-canvas" data-rotated={rotated} data-scroll-drag="ignore" tabIndex={0} role="application" aria-label="可编辑网球战术画板。标准双人画板可直接从网球拖出球路，放开后会自动接续接球方跑位与下一拍；播放时，接球方跑位会与来球同步。点选任一球员或网球可随时改写当前操作。方向键可微调，Delete 键删除。" onKeyDown={onKeyDown} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={event=>endPointer(event)} onPointerCancel={event=>endPointer(event,true)}><canvas ref={canvasRef}/>{togglePoint&&<button type="button" className="board-path-direct-toggle" aria-label={directToggleLabel} title={directToggleLabel} style={{left:togglePoint[0],top:togglePoint[1]}} onPointerDown={event=>{event.preventDefault();event.stopPropagation();}} onClick={event=>{event.preventDefault();event.stopPropagation();onTogglePathCurve();}}>{selectedPathForToggle?.control?<MinusIcon aria-hidden="true"/>:<CornerTopRightIcon aria-hidden="true"/>}</button>}</div>;
}

function BoardRenameLayer({open,value,error,onChange,onCancel,onSubmit}:{open:boolean;value:string;error:string;onChange:(value:string)=>void;onCancel:()=>void;onSubmit:()=>void}) {
  const inputRef=useRef<HTMLInputElement>(null);
  const submit=()=>{inputRef.current?.blur();onSubmit();};
  return <BoardTextEditorLayer open={open} title="修改名称" description="独立修改画板名称；键盘出现时画板不会缩放。" testId="board-rename-layer" initialFocusRef={inputRef} onCancel={onCancel} onSubmit={onSubmit}>
          <div className="board-rename-field"><label htmlFor="board-rename-title">画板名称</label><div className="board-rename-input-wrap"><KeyboardInput id="board-rename-title" ref={inputRef} value={value} maxLength={60} autoComplete="off" enterKeyHint="done" onChange={event=>onChange(event.currentTarget.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.nativeEvent.isComposing){event.preventDefault();submit();}}}/><button type="button" aria-label="清空画板名称" disabled={!value} onPointerDown={event=>event.preventDefault()} onClick={()=>{onChange("");inputRef.current?.focus();}}><CrossCircledIcon/></button></div><small>1–60 个字</small></div>
          {error&&<p className="board-rename-error" role="alert">{error}</p>}
  </BoardTextEditorLayer>;
}

type BoardFileSurface = null | "menu" | "learning" | "save-share" | "media" | "rename";
type BoardLearningSurface = "tactic" | "skill";
type CourtNoteEditor = { frameIndex:number; position:BoardPoint; markId?:string; saveStateBefore:BoardSaveState };
type WebkitFullscreenDocument = Document & {webkitFullscreenElement?:Element|null;webkitExitFullscreen?:()=>Promise<void>|void};
let boardFullscreenSessionSequence=0;
const boardFullscreenOwners=new WeakMap<HTMLElement,string>();

function activeFullscreenElement() {
  return document.fullscreenElement??(document as WebkitFullscreenDocument).webkitFullscreenElement??null;
}

function screenOwnsFullscreen(screen: HTMLElement | null) {
  const fullscreen=activeFullscreenElement();
  return !!screen&&!!fullscreen&&(fullscreen===screen||screen.contains(fullscreen));
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


function BoardEditor({ initialBoard, initialPersisted=false, initialStoredBoard, migrationSource, legacyNeedsReview=false, entryIntent, entryNotice, alternativeSeed, alternativePersisted=false, back, openLibrary, openTacticsForPoint, openTacticForPoint, openSkillForPoint, openAlternativeForPoint }:{initialBoard:BoardDocument;initialPersisted?:boolean;initialStoredBoard?:BoardDocument;migrationSource?:BoardDocument;legacyNeedsReview?:boolean;entryIntent?:"review";entryNotice?:string;alternativeSeed?:BoardAlternative;alternativePersisted?:boolean;back:()=>void;openLibrary:()=>void;openTacticsForPoint:(boardId:string,category:CategoryFilter)=>void;openTacticForPoint:(boardId:string,tactic:Tactic)=>void;openSkillForPoint:(boardId:string,skillId:FixedSkillId)=>void;openAlternativeForPoint?:(boardId:string,frameId:string,tacticId:string)=>{ok:true}|{ok:false;error:string}}) {
  const keyboard=useKeyboard();
  const {screenRef}=useScreenPortal();
  const initialSmart=getSmartBoardContinuation(initialBoard);
  const [initialView]=useState(()=>alternativeSeed?null:readBoardEditorView(initialBoard));
  const [automaticRouteSelection,setAutomaticRouteSelection]=useState(initialView?.automaticRouteSelection??false);
  const alternativeStartIndex=alternativeSeed?.sourceSnapshot.frames.findIndex(frame=>frame.id===alternativeSeed.startFrameId)??-1;
  const [board,setBoardState]=useState(initialBoard),[frameIndex,setFrameIndex]=useState(alternativeStartIndex>=0?alternativeStartIndex:initialView?.frameIndex??initialSmart?.frameIndex??0),[selection,setSelection]=useState<BoardSelection|null>(alternativeSeed?null:initialView?initialView.selection:initialSmart?{kind:"actor",id:initialSmart.actorId}:null),[committedRevision,setCommittedRevision]=useState(0);
  const frameContextRef=useRef(initialBoard.frames[frameIndex]?.id);
  const [past,setPast]=useState<BoardDocument[]>(migrationSource?[migrationSource]:[]),[future,setFuture]=useState<BoardDocument[]>([]),[saveState,setSaveState]=useState<BoardSaveState>(migrationSource?"dirty":initialPersisted?"saved":"clean"),[saveConflict,setSaveConflict]=useState<BoardSaveConflict|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState(migrationSource?"已将旧版跑位改为与来球同步；可撤销为手动时间线。":legacyNeedsReview?"这份旧版时间线无法安全自动同步，已切换为手动编辑，请检查拍次。":entryNotice??"");
  const [tool,setTool]=useState<BoardTool>(alternativeSeed?"select":initialView&&initialView.frameIndex!==initialSmart?.frameIndex?"select":initialSmart?.phase??"select"),[actorPreset,setActorPreset]=useState<ActorPreset>("me"),[pathKind,setPathKind]=useState<"shot"|"feed">("shot"),[markPreset,setMarkPreset]=useState<MarkPreset>("target"),[curved,setCurved]=useState(true);
  const [courtNoteEditor,setCourtNoteEditor]=useState<CourtNoteEditor|null>(null),[courtNoteDraft,setCourtNoteDraft]=useState("");
  const [noteBoardHeight,setNoteBoardHeight]=useState<number|null>(null),[noteViewport,setNoteViewport]=useState<{height:number;top:number}|null>(null);
  const noteViewportBeforeKeyboardRef=useRef(0);
  const [viewMode,setViewMode]=useState<"edit"|"preview">("edit"),[isPlaying,setIsPlaying]=useState(false),[elapsed,setElapsed]=useState(0),[speed]=useState(1);
  const [fileSurface,setFileSurface]=useState<BoardFileSurface>(null),[historyOpen,setHistoryOpen]=useState(false),[frameOpen,setFrameOpen]=useState(false),[helpOpen,setHelpOpen]=useState(false),[toolPalette,setToolPalette]=useState<"add"|null>(null),[immersive,setImmersive]=useState(true);
  const [learningSurface,setLearningSurface]=useState<BoardLearningSurface>("tactic"),[learningChoice,setLearningChoice]=useState<BoardLearningChoice|undefined>(()=>{const result=readLearningChoice(initialBoard.id);return result.ok?result.value:undefined;});
  const [alternative,setAlternative]=useState<BoardAlternative|undefined>(()=>{const result=readBoardAlternative(initialBoard.id);return result.ok?result.value:undefined;});
  const [compareMode,setCompareMode]=useState<"original"|"try">(alternativeSeed?"try":"original");
  const [confirmAlternativeDelete,setConfirmAlternativeDelete]=useState(false);
  const [rotated,setRotated]=useState(false),[openingChoice,setOpeningChoice]=useState<OpeningId|null>(null),[showMovementHint,setShowMovementHint]=useState(true);
  const [display,setDisplay]=useState<BoardDisplayPreferences>(()=>getBoardDisplayPreferences());
  useEffect(()=>{
    const sync=()=>setDisplay(getBoardDisplayPreferences());
    const stored=(event:StorageEvent)=>{if(event.key===BOARD_DISPLAY_STORAGE_KEY||event.key===null)sync();};
    window.addEventListener(BOARD_DISPLAY_EVENT,sync);window.addEventListener("storage",stored);window.addEventListener("focus",sync);
    return()=>{window.removeEventListener(BOARD_DISPLAY_EVENT,sync);window.removeEventListener("storage",stored);window.removeEventListener("focus",sync);};
  },[]);
  const [mediaState,setMediaState]=useState<BoardMediaState>({status:"idle"});
  const [titleDraft,setTitleDraft]=useState(board.title),[frameLabel,setFrameLabel]=useState(board.frames[frameIndex]?.label??"");
  const [savedRecoveryCopy,setSavedRecoveryCopy]=useState<{title:string;revision:number}|null>(null);
  const editorRef=useRef<HTMLDivElement>(null),selectToolRef=useRef<HTMLButtonElement>(null),playbackToggleRef=useRef<HTMLButtonElement>(null),sheetOpenerRef=useRef<HTMLElement|null>(null),sheetFocusTimerRef=useRef<number|null>(null),boardRef=useRef(board),committedBoardRef=useRef(board),persistedBoardRef=useRef<BoardDocument|null>(initialStoredBoard??null),needsSaveRef=useRef(Boolean(migrationSource)),focusPlaybackEntryRef=useRef(false),focusPlaybackExitRef=useRef(false),playbackReturnFrameIdRef=useRef<string|null>(null),playbackResumeSmartRef=useRef(false),mediaAbortRef=useRef<AbortController|null>(null),mediaUrlRef=useRef<string|null>(null),nativeFullscreenOwnedRef=useRef(false),immersiveDesiredRef=useRef(true),fullscreenOperationRef=useRef(0),fullscreenRequestPendingRef=useRef(false),fullscreenExitPendingRef=useRef(false),exitAnnouncementRef=useRef(true),afterImmersiveExitRef=useRef<null|(()=>void)>(null),resumeImmersiveOnReturnRef=useRef(false),fullscreenSessionRef=useRef("");boardRef.current=board;
  const persistedAlternativeRef=useRef<BoardAlternative|undefined>(alternativePersisted?alternativeSeed:undefined);
  useEffect(()=>{
    if(noteBoardHeight===null)return;
    const visual=window.visualViewport;
    const update=()=>{
      const height=visual?.height??window.innerHeight;
      setNoteViewport({height,top:visual?.offsetTop??0});
      if(!courtNoteEditor&&height>=noteViewportBeforeKeyboardRef.current-16)setNoteBoardHeight(null);
    };
    update();
    visual?.addEventListener("resize",update);
    visual?.addEventListener("scroll",update);
    window.addEventListener("resize",update);
    const fallback=!courtNoteEditor?window.setTimeout(()=>setNoteBoardHeight(null),1800):undefined;
    return()=>{visual?.removeEventListener("resize",update);visual?.removeEventListener("scroll",update);window.removeEventListener("resize",update);if(fallback!==undefined)window.clearTimeout(fallback);};
  },[courtNoteEditor,noteBoardHeight]);
  if(!fullscreenSessionRef.current)fullscreenSessionRef.current=`board-fullscreen-${++boardFullscreenSessionSequence}`;
  const smartContinuation=getSmartBoardContinuation(board);
  const alternativeSourceChanged=Boolean(!alternativeSeed&&alternative&&JSON.stringify({actors:board.actors,frames:board.frames})!==JSON.stringify({actors:alternative.sourceSnapshot.actors,frames:alternative.sourceSnapshot.frames}));
  const playbackBoard=useMemo(()=>{
    const displayed=alternativeSeed?(compareMode==="original"?alternativeSeed.sourceSnapshot:board)
      :alternative&&compareMode==="try"?alternative.board:alternative&&alternativeSourceChanged?alternative.sourceSnapshot:board;
    const prepared=prepareBoardForMedia(displayed),frames=prepared.frames;
    return frames.some(item=>item.paths.length)?prepared:{...prepared,frames:frames.slice(0,1).map(item=>({...item,duration:0}))};
  },[alternative,alternativeSeed,alternativeSourceChanged,board,compareMode]);
  const hasPlayablePath=playbackBoard.frames.some(item=>item.paths.length>0);
  const boardAtStarter=isStarterBoardState(board);
  const initialContentFingerprint=useMemo(()=>JSON.stringify({authoringMode:initialBoard.authoringMode,sourceTacticId:initialBoard.sourceTacticId,drillId:initialBoard.drillId,actors:initialBoard.actors,frames:initialBoard.frames,smartRally:initialBoard.smartRally}),[initialBoard]);
  const currentContentFingerprint=useMemo(()=>JSON.stringify({authoringMode:board.authoringMode,sourceTacticId:board.sourceTacticId,drillId:board.drillId,actors:board.actors,frames:board.frames,smartRally:board.smartRally}),[board]);
  const hasMeaningfulPoint=!boardAtStarter&&(initialPersisted||currentContentFingerprint!==initialContentFingerprint);
  const isAlternative=Boolean(alternativeSeed);
  const chosenTactic=learningChoice?.route==="tactic"?tactics.find(tactic=>tactic.id===learningChoice.tacticId):undefined;
  const chosenSkill=learningChoice?.route==="skill"?fixedSkillById(learningChoice.skillId):undefined;
  const playbackFrameCount=hasPlayablePath?playbackBoard.frames.length:0;
  const totalDuration=getBoardDuration(playbackBoard),frame=board.frames[frameIndex]??board.frames[0];
  const selectedActor=selection?.kind==="actor"?board.actors.find(actor=>actor.id===selection.id):undefined;
  const selectedElementFrameIndex=selection?.kind==="element"&&selection.frameIndex!==undefined?selection.frameIndex:frameIndex;
  const selectedElementFrame=board.frames[selectedElementFrameIndex];
  const selectedPath=selection?.kind==="element"?selectedElementFrame?.paths.find(path=>path.id===selection.id):undefined;
  const selectedMark=selection?.kind==="element"?selectedElementFrame?.marks.find(mark=>mark.id===selection.id):undefined;
  const setSheetVisibility=useCallback((setter:(open:boolean)=>void,nextOpen:boolean)=>{if(!nextOpen)keyboard.hide();setter(nextOpen);},[keyboard]);
  const rememberSheetOpener=useCallback((opener:HTMLElement)=>{if(sheetFocusTimerRef.current!==null)window.clearTimeout(sheetFocusTimerRef.current);sheetOpenerRef.current=opener;},[]);
  const restoreSheetFocus=useCallback((destination:"opener"|"canvas")=>{if(sheetFocusTimerRef.current!==null)window.clearTimeout(sheetFocusTimerRef.current);const opener=sheetOpenerRef.current;sheetFocusTimerRef.current=window.setTimeout(()=>{const canvas=editorRef.current?.querySelector<HTMLElement>('[data-testid="board-canvas"]');const target=destination==="canvas"?canvas:opener?.isConnected?opener:selectToolRef.current;(target??selectToolRef.current)?.focus();sheetOpenerRef.current=null;sheetFocusTimerRef.current=null;},360);},[]);
  const closeBoardSurfaces=useCallback(()=>{mediaAbortRef.current?.abort();mediaAbortRef.current=null;if(mediaUrlRef.current){URL.revokeObjectURL(mediaUrlRef.current);mediaUrlRef.current=null;}setMediaState({status:"idle"});setFileSurface(null);setHistoryOpen(false);setFrameOpen(false);setHelpOpen(false);setToolPalette(null);setCourtNoteEditor(null);keyboard.hide();},[keyboard]);
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
      afterExit();
      if(stage)delete stage.dataset.boardImmersive;
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
      const afterExit=afterImmersiveExitRef.current;
      afterImmersiveExitRef.current=null;
      setImmersive(false);
      const stage=screen?.closest<HTMLElement>(".phone-stage");
      if(stage)delete stage.dataset.boardImmersive;
      afterExit?.();
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
  const restoreImmersiveAfterChild=useCallback(()=>{
    const screen=screenRef.current,flowScreen=editorRef.current?.closest<HTMLElement>(".flow-screen");
    if(!screen||flowScreen?.dataset.flowCurrent!=="true"||!resumeImmersiveOnReturnRef.current)return;
    resumeImmersiveOnReturnRef.current=false;
    fullscreenOperationRef.current+=1;
    fullscreenRequestPendingRef.current=false;
    fullscreenExitPendingRef.current=false;
    nativeFullscreenOwnedRef.current=false;
    immersiveDesiredRef.current=true;
    claimBoardFullscreen(screen,fullscreenSessionRef.current);
    const stage=screen.closest<HTMLElement>(".phone-stage");
    if(stage)stage.dataset.boardImmersive="true";
    setImmersive(true);
  },[screenRef]);

  const setBoard=useCallback((next:BoardDocument)=>{boardRef.current=next;setBoardState(next);},[]);
  const prepareToLeave=useCallback(()=>{setIsPlaying(false);closeBoardSurfaces();},[closeBoardSurfaces]);
  const updateDisplay=useCallback((patch:Partial<BoardDisplayPreferences>)=>{
    const next=setBoardDisplayPreferences(patch);setDisplay(next);return next;
  },[]);
  const markCommitted=useCallback((next:BoardDocument)=>{committedBoardRef.current=next;needsSaveRef.current=true;setBoard(next);setCommittedRevision(value=>value+1);},[setBoard]);
  const preservesAlternativeStart=useCallback((candidate:BoardDocument)=>!alternativeSeed||alternativeStartIndex>=0&&JSON.stringify(candidate.actors)===JSON.stringify(alternativeSeed.sourceSnapshot.actors)&&JSON.stringify(candidate.frames.slice(0,alternativeStartIndex))===JSON.stringify(alternativeSeed.sourceSnapshot.frames.slice(0,alternativeStartIndex))&&JSON.stringify(candidate.frames[alternativeStartIndex]?.poses)===JSON.stringify(alternativeSeed.sourceSnapshot.frames[alternativeStartIndex]?.poses),[alternativeSeed,alternativeStartIndex]);
  const resetTransientEditorState=useCallback((next:BoardDocument,followSmart:boolean,preferredFrameId?:string)=>{const smart=getSmartBoardContinuation(next),preferredIndex=preferredFrameId?next.frames.findIndex(item=>item.id===preferredFrameId):-1,targetIndex=followSmart&&smart?smart.frameIndex:preferredIndex>=0?preferredIndex:smart?.frameIndex??0,resumeSmart=!!smart&&followSmart&&targetIndex===smart.frameIndex;setFrameIndex(Math.max(0,Math.min(targetIndex,next.frames.length-1)));setSelection(resumeSmart?{kind:"actor",id:smart.actorId}:null);setTool(resumeSmart?smart.phase:"select");setViewMode("edit");setIsPlaying(false);setElapsed(0);},[]);
  const commit=useCallback((next:BoardDocument)=>{const current=committedBoardRef.current;if(next===current)return;if(!preservesAlternativeStart(next)){setBoard(current);setError("试法要保留这一拍的起始站位；请改球路或画跑位。");return;}setPast(items=>[...items,current].slice(-50));setFuture([]);markCommitted(next);setSaveState("dirty");setSaveConflict(null);setError("");},[markCommitted,preservesAlternativeStart,setBoard]);
  const preview=useCallback((next:BoardDocument)=>setBoard(next),[setBoard]);
  const finishPreview=useCallback((base:BoardDocument,cancel=false)=>{if(cancel){setBoard(committedBoardRef.current);return;}const current=boardRef.current;if(current===base)return;const previous=committedBoardRef.current;if(!preservesAlternativeStart(current)){setBoard(previous);setError("试法要保留这一拍的起始站位；请改球路或画跑位。");return;}setPast(items=>[...items,previous].slice(-50));setFuture([]);markCommitted(current);setSaveState("dirty");setError("");},[markCommitted,preservesAlternativeStart,setBoard]);
  const undo=useCallback(()=>{const previous=past[past.length-1];if(!previous)return;const current=committedBoardRef.current,currentSmart=getSmartBoardContinuation(current),targetSmart=getSmartBoardContinuation(previous),currentFrameId=current.frames[frameIndex]?.id,editingSmartContext=!!currentSmart&&currentSmart.frameIndex===frameIndex&&selection?.kind==="element"&&selection.frameIndex===frameIndex-1,wasFollowing=!!currentSmart&&currentSmart.frameIndex===frameIndex&&(tool===currentSmart.phase&&selection?.kind==="actor"&&selection.id===currentSmart.actorId||editingSmartContext),followSmart=!!targetSmart&&(!currentSmart||wasFollowing);setPast(past.slice(0,-1));setFuture(items=>[current,...items].slice(0,50));markCommitted(previous);resetTransientEditorState(previous,followSmart,currentFrameId);setSaveState("dirty");},[frameIndex,markCommitted,past,resetTransientEditorState,selection,tool]);
  const redo=useCallback(()=>{const next=future[0];if(!next)return;const current=committedBoardRef.current,currentSmart=getSmartBoardContinuation(current),targetSmart=getSmartBoardContinuation(next),currentFrameId=current.frames[frameIndex]?.id,editingSmartContext=!!currentSmart&&currentSmart.frameIndex===frameIndex&&selection?.kind==="element"&&selection.frameIndex===frameIndex-1,wasFollowing=!!currentSmart&&currentSmart.frameIndex===frameIndex&&(tool===currentSmart.phase&&selection?.kind==="actor"&&selection.id===currentSmart.actorId||editingSmartContext),followSmart=!!targetSmart&&(!currentSmart||wasFollowing);setFuture(future.slice(1));setPast(items=>[...items,current].slice(-50));markCommitted(next);resetTransientEditorState(next,followSmart,currentFrameId);setSaveState("dirty");},[frameIndex,future,markCommitted,resetTransientEditorState,selection,tool]);
  const saveNow=useCallback((requireCurrent=false)=>{const candidate=committedBoardRef.current;
    if(alternativeSeed){
      if(!needsSaveRef.current){
        if(requireCurrent&&persistedAlternativeRef.current){const checked=checkBoardAlternativeUnchanged(persistedAlternativeRef.current);if(!checked.ok){setSaveState("error");setError(checked.error);return checked;}}
        return {ok:true,value:candidate} as const;
      }
      setSaveState("saving");
      const result=saveBoardAlternativeIfUnchanged({...alternativeSeed,board:candidate},persistedAlternativeRef.current);
      if(result.ok){const showingCommitted=boardRef.current===candidate;persistedAlternativeRef.current=result.value;committedBoardRef.current=result.value.board;needsSaveRef.current=false;if(showingCommitted)setBoard(result.value.board);setSaveState("saved");setError("");window.dispatchEvent(new Event(BOARD_ALTERNATIVES_EVENT));return {ok:true,value:result.value.board} as const;}
      setSaveState("error");setError(result.error);return result;
    }
    if(!needsSaveRef.current){if(requireCurrent&&persistedBoardRef.current){const checked=checkBoardUnchanged(persistedBoardRef.current);if(!checked.ok){setSaveState("error");setSaveConflict(checked.conflict??null);setError(checked.conflict==="deleted"?"原画板已删除，不能继续选技能或打法。可备份当前画面，或返回首页重新开始。":checked.conflict==="changed"?"原画板已在另一页修改。请返回首页重新打开，或备份当前画面。":checked.error);return checked;}}return {ok:true,value:candidate} as const;}setSaveState("saving");const result=saveBoardIfUnchanged(candidate,persistedBoardRef.current);if(result.ok){const showingCommitted=boardRef.current===candidate;persistedBoardRef.current=result.value;committedBoardRef.current=result.value;needsSaveRef.current=false;if(showingCommitted)setBoard(result.value);setSaveState("saved");setSaveConflict(null);setError("");window.dispatchEvent(new Event(BOARD_DRAFTS_EVENT));}else{setSaveState("error");setSaveConflict(result.conflict??null);setError(result.conflict?result.error:"这次修改尚未保存，请重试");}return result;},[alternativeSeed,setBoard]);

  const refreshLearningChoice=useCallback(()=>{const result=readLearningChoice(initialBoard.id);if(result.ok)setLearningChoice(result.value);},[initialBoard.id]);
  const refreshAlternative=useCallback(()=>{const result=readBoardAlternative(initialBoard.id);if(result.ok)setAlternative(result.value);},[initialBoard.id]);
  const openPointSkill=useCallback((skillId:FixedSkillId)=>{
    if(!hasMeaningfulPoint){setError("先画出这一分，再决定要练什么。");return;}
    const saved=saveNow(true);
    if(!saved.ok)return;
    const open=()=>openSkillForPoint(saved.value.id,skillId);
    if(immersive){resumeImmersiveOnReturnRef.current=true;afterImmersiveExitRef.current=open;exitImmersive(false);return;}
    setFileSurface(null);keyboard.hide();open();
  },[exitImmersive,hasMeaningfulPoint,immersive,keyboard,openSkillForPoint,saveNow]);
  const openPointTactics=useCallback((category:CategoryFilter)=>{
    if(!hasMeaningfulPoint){setError("先画出这一分，再去找打法。");return;}
    const saved=saveNow(true);
    if(!saved.ok)return;
    const open=()=>openTacticsForPoint(saved.value.id,category);
    if(immersive){resumeImmersiveOnReturnRef.current=true;afterImmersiveExitRef.current=open;exitImmersive(false);return;}
    setFileSurface(null);keyboard.hide();open();
  },[exitImmersive,hasMeaningfulPoint,immersive,keyboard,openTacticsForPoint,saveNow]);
  const openChosenPointTactic=useCallback(()=>{
    if(!chosenTactic)return;
    if(!saveNow(true).ok)return;
    const open=()=>openTacticForPoint(initialBoard.id,chosenTactic);
    if(immersive){resumeImmersiveOnReturnRef.current=true;afterImmersiveExitRef.current=open;exitImmersive(false);return;}
    setFileSurface(null);keyboard.hide();open();
  },[chosenTactic,exitImmersive,immersive,initialBoard.id,keyboard,openTacticForPoint,saveNow]);
  const openChosenPointSkill=useCallback(()=>{
    if(!chosenSkill)return;
    if(!saveNow(true).ok)return;
    const open=()=>openSkillForPoint(initialBoard.id,chosenSkill.id);
    if(immersive){resumeImmersiveOnReturnRef.current=true;afterImmersiveExitRef.current=open;exitImmersive(false);return;}
    setFileSurface(null);keyboard.hide();open();
  },[chosenSkill,exitImmersive,immersive,initialBoard.id,keyboard,openSkillForPoint,saveNow]);
  const openPointAlternative=useCallback(()=>{
    if(!openAlternativeForPoint||!hasMeaningfulPoint||(!alternative&&!chosenTactic))return;
    const selectedFrame=alternative?board.frames.find(item=>item.id===alternative.startFrameId):board.frames[frameIndex];
    if(!alternative&&(!selectedFrame||selectedFrame.paths.length===0)){setError("先在拍次里选一拍有球路的，再试另一种打法。");return;}
    const saved=saveNow(true);
    if(!saved.ok)return;
    const open=()=>{const result=openAlternativeForPoint(saved.value.id,selectedFrame!.id,alternative?.tacticId??chosenTactic!.id);if(!result.ok)setError(result.error);};
    if(immersive){resumeImmersiveOnReturnRef.current=true;afterImmersiveExitRef.current=open;exitImmersive(false);return;}
    setFileSurface(null);keyboard.hide();open();
  },[alternative,board.frames,chosenTactic,exitImmersive,frameIndex,hasMeaningfulPoint,immersive,keyboard,openAlternativeForPoint,saveNow]);
  const leaveAlternativeWithoutSaving=()=>{
    if(!alternativeSeed)return;
    needsSaveRef.current=false;
    prepareToLeave();
    if(immersive){afterImmersiveExitRef.current=back;exitImmersive(false);return;}
    back();
  };
  const removeAlternative=()=>{
    if(!alternativeSeed)return;
    const expected=persistedAlternativeRef.current;
    if(!expected){leaveAlternativeWithoutSaving();return;}
    const removed=deleteBoardAlternativeIfUnchanged(alternativeSeed.sourceBoardId,expected);
    if(!removed.ok){setError(removed.error);setConfirmAlternativeDelete(false);return;}
    needsSaveRef.current=false;
    window.dispatchEvent(new Event(BOARD_ALTERNATIVES_EVENT));
    leaveAlternativeWithoutSaving();
  };

  useEffect(()=>{if(saveState!=="dirty")return;const timer=window.setTimeout(saveNow,700);return()=>window.clearTimeout(timer);},[committedRevision,saveNow,saveState]);
  useEffect(()=>{window.addEventListener(BOARD_LEARNING_EVENT,refreshLearningChoice);return()=>window.removeEventListener(BOARD_LEARNING_EVENT,refreshLearningChoice);},[refreshLearningChoice]);
  useEffect(()=>{window.addEventListener(BOARD_ALTERNATIVES_EVENT,refreshAlternative);return()=>window.removeEventListener(BOARD_ALTERNATIVES_EVENT,refreshAlternative);},[refreshAlternative]);
  useEffect(()=>{const onStorage=(event:StorageEvent)=>{if(event.key===null||event.key===BOARD_LEARNING_STORAGE_KEY)refreshLearningChoice();if(event.key===null||event.key===BOARD_ALTERNATIVES_STORAGE_KEY)refreshAlternative();};window.addEventListener("storage",onStorage);return()=>window.removeEventListener("storage",onStorage);},[refreshLearningChoice,refreshAlternative]);
  useEffect(()=>{
    const flowScreen=editorRef.current?.closest<HTMLElement>(".flow-screen");
    if(!flowScreen)return;
    const sync=()=>{if(flowScreen.dataset.flowCurrent==="true"&&resumeImmersiveOnReturnRef.current)window.requestAnimationFrame(restoreImmersiveAfterChild);};
    const observer=new MutationObserver(sync);observer.observe(flowScreen,{attributes:true,attributeFilter:["data-flow-current"]});
    return()=>observer.disconnect();
  },[restoreImmersiveAfterChild]);
  useLayoutEffect(()=>{const screen=editorRef.current?.closest<HTMLElement>(".flow-screen");if(!screen)return;screen.classList.add("board-enter-immediate");const timer=window.setTimeout(()=>screen.classList.remove("board-enter-immediate"),600);return()=>{window.clearTimeout(timer);screen.classList.remove("board-enter-immediate");};},[]);
  useLayoutEffect(()=>{
    const screen=screenRef.current,stage=screen?.closest<HTMLElement>(".phone-stage"),flowScreen=editorRef.current?.closest<HTMLElement>(".flow-screen");
    if(!screen||!stage||!flowScreen)return;
    const sync=()=>{
      if(immersive&&flowScreen.dataset.flowCurrent==="true"){
        claimBoardFullscreen(screen,fullscreenSessionRef.current);
        immersiveDesiredRef.current=true;
        stage.dataset.boardImmersive="true";
      }else if(boardSessionOwnsFullscreen(screen,fullscreenSessionRef.current)){
        releaseBoardFullscreen(screen,fullscreenSessionRef.current);
        delete stage.dataset.boardImmersive;
      }
    };
    const observer=new MutationObserver(sync);
    observer.observe(flowScreen,{attributes:true,attributeFilter:["data-flow-current"]});
    sync();
    return()=>observer.disconnect();
  },[immersive,screenRef]);
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
  useEffect(()=>{if(!immersive)return;const onKeyDown=(event:KeyboardEvent)=>{if(event.key!=="Escape"||event.defaultPrevented)return;if(fileSurface!==null||historyOpen||frameOpen||toolPalette!==null||helpOpen||courtNoteEditor!==null||keyboard.visible)return;sendBoardAction(initialBoard.id,"back");};document.addEventListener("keydown",onKeyDown,true);return()=>document.removeEventListener("keydown",onKeyDown,true);},[courtNoteEditor,fileSurface,frameOpen,helpOpen,historyOpen,immersive,initialBoard.id,keyboard.visible,toolPalette]);
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
    const yieldNativeTouch=(event:TouchEvent)=>{
      if(event.touches.length===1&&!(event.target instanceof Element&&event.target.closest('.board-note-overlay,input,textarea,select,[contenteditable="true"]')))return false;
      if(tracking){tracking=false;resetEdgeOffset();}
      // Do not let the flow's swipe recognizer consume a native text/pinch
      // gesture. Stopping propagation leaves the browser default intact.
      event.stopImmediatePropagation();
      return true;
    };
    const start=(event:TouchEvent)=>{
      if(editorRef.current?.closest<HTMLElement>(".flow-screen")?.dataset.flowCurrent!=="true")return;
      // Text surfaces and multi-touch belong to the browser, including pinch
      // recovery after native focus zoom. Never turn them into edge-back.
      if(yieldNativeTouch(event))return;
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
      if(editorRef.current?.closest<HTMLElement>(".flow-screen")?.dataset.flowCurrent!=="true")return;
      if(yieldNativeTouch(event))return;
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
  useEffect(()=>{const flush=()=>{if(!needsSaveRef.current)return;if(alternativeSeed){const result=saveBoardAlternativeIfUnchanged({...alternativeSeed,board:committedBoardRef.current},persistedAlternativeRef.current);if(result.ok){persistedAlternativeRef.current=result.value;committedBoardRef.current=result.value.board;needsSaveRef.current=false;window.dispatchEvent(new Event(BOARD_ALTERNATIVES_EVENT));}return;}const result=saveBoardIfUnchanged(committedBoardRef.current,persistedBoardRef.current);if(result.ok){persistedBoardRef.current=result.value;committedBoardRef.current=result.value;needsSaveRef.current=false;window.dispatchEvent(new Event(BOARD_DRAFTS_EVENT));}};window.addEventListener("pagehide",flush);return()=>{window.removeEventListener("pagehide",flush);flush();};},[alternativeSeed]);
  useEffect(()=>{const saveWhenHidden=()=>{if(document.visibilityState==="hidden"&&needsSaveRef.current)saveNow();};document.addEventListener("visibilitychange",saveWhenHidden);return()=>document.removeEventListener("visibilitychange",saveWhenHidden);},[saveNow]);
  useEffect(()=>{
    const act=(event:Event)=>{const detail=(event as CustomEvent<{boardId:string;action:BoardActionName}>).detail;if(detail.boardId!==initialBoard.id||editorRef.current?.closest<HTMLElement>(".flow-screen")?.dataset.flowCurrent!=="true")return;if(detail.action==="undo")undo();else if(detail.action==="redo")redo();else if(detail.action==="save")saveNow();else if(detail.action==="restore")restoreServePosition();else if(detail.action==="fullscreen")return;else if(detail.action==="rename"){const active=document.activeElement;if(active instanceof HTMLElement)rememberSheetOpener(active);setTitleDraft(committedBoardRef.current.title);setError("");setFileSurface("rename");}else if(detail.action==="back"){prepareToLeave();const result=saveNow();if(!result.ok)return;if(immersive){afterImmersiveExitRef.current=back;exitImmersive(false);return;}back();}else{const active=document.activeElement;if(active instanceof HTMLElement)rememberSheetOpener(active);setFileSurface("menu");}};
    window.addEventListener(BOARD_ACTION_EVENT,act);return()=>window.removeEventListener(BOARD_ACTION_EVENT,act);
  },[back,exitImmersive,immersive,initialBoard.id,prepareToLeave,redo,rememberSheetOpener,saveNow,undo]);
  useEffect(()=>{if(!isPlaying)return;let request=0,last=performance.now();const tick=(now:number)=>{const delta=Math.min((now-last)/1000,.1)*speed;last=now;setElapsed(value=>Math.min(totalDuration,value+delta));request=requestAnimationFrame(tick);};request=requestAnimationFrame(tick);return()=>cancelAnimationFrame(request);},[isPlaying,speed,totalDuration]);
  useEffect(()=>{if(isPlaying&&elapsed>=totalDuration){setIsPlaying(false);setNotice("球路播完了。");}},[elapsed,isPlaying,totalDuration]);
  useEffect(()=>{
    if(frameContextRef.current===frame?.id)return;
    frameContextRef.current=frame?.id;
    const smart=getSmartBoardContinuation(board),selectedContext=selection?.kind==="element"&&selection.frameIndex===frameIndex-1&&board.frames[selection.frameIndex]?.paths.some(path=>path.id===selection.id);
    if(smart?.frameIndex===frameIndex){if(!selectedContext)setSelection({kind:"actor",id:smart.actorId});setTool(smart.phase);}else setSelection(null);
    setFrameLabel(frame?.label??"");
  },[frame?.id,frameIndex]);
  useEffect(()=>{
    if(!alternativeSeed&&viewMode==="edit")writeBoardEditorView(committedBoardRef.current,frameIndex,selection,automaticRouteSelection);
  },[alternativeSeed,automaticRouteSelection,committedRevision,frameIndex,selection,viewMode]);
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
  const openFrameFromHistory=(index:number)=>{const nextFrame=board.frames[index];if(!nextFrame)return;setFrameIndex(index);setFrameLabel(nextFrame.label);setHistoryOpen(false);setFrameOpen(true);};
  const frameStart=(index:number)=>playbackBoard.frames.slice(0,index).reduce((sum,item)=>sum+item.duration,0);
  const nextPlaybackFrame=()=>{const pose=getBoardPose(playbackBoard,elapsed);if(pose.frameIndex>=playbackBoard.frames.length-1)return;const next=pose.frameIndex+1;setElapsed(frameStart(next));setIsPlaying(false);setNotice(`已跳到第 ${next+1} 拍。`);};
  const previousPlaybackFrame=()=>{if(elapsed<=0)return;const pose=getBoardPose(playbackBoard,elapsed),terminal=pose.frameIndex===playbackBoard.frames.length-1&&playbackBoard.frames[pose.frameIndex]?.duration===0&&elapsed>=totalDuration;const previous=terminal||pose.progress<.08?Math.max(0,pose.frameIndex-1):pose.frameIndex;setElapsed(frameStart(previous));setIsPlaying(false);setNotice(`已跳到第 ${previous+1} 拍。`);};
  const startPlayback=()=>{if(!hasPlayablePath){setError("画出一条球路，就能播放。");return;}focusPlaybackEntryRef.current=true;playbackReturnFrameIdRef.current=frame.id;playbackResumeSmartRef.current=smartContinuation?.frameIndex===frameIndex&&tool===smartContinuation.phase;setTool("select");setSelection(null);setElapsed(0);setViewMode("preview");setIsPlaying(true);setError("");setNotice(`开始播放，共 ${playbackFrameCount} 拍、${totalDuration.toFixed(1)} 秒。`);};
  const returnToEditing=()=>{setIsPlaying(false);const pose=getBoardPose(playbackBoard,elapsed),smart=getSmartBoardContinuation(board),resumeSmart=playbackResumeSmartRef.current&&!!smart;setViewMode("edit");setElapsed(0);if(resumeSmart&&smart){setFrameIndex(smart.frameIndex);setSelection({kind:"actor",id:smart.actorId});setTool(smart.phase);setNotice(`已回到第 ${smart.frameIndex+1} 拍继续编辑。`);}else{const returnIndex=board.frames.findIndex(item=>item.id===playbackReturnFrameIdRef.current),targetIndex=returnIndex>=0?returnIndex:pose.frameIndex;setFrameIndex(targetIndex);setTool("select");setSelection(null);setNotice(`已回到第 ${targetIndex+1} 拍编辑。`);}playbackReturnFrameIdRef.current=null;playbackResumeSmartRef.current=false;focusPlaybackExitRef.current=true;};
  const cancelRename=()=>{setTitleDraft(committedBoardRef.current.title);setError("");keyboard.hide();setFileSurface(null);restoreSheetFocus("opener");};
  const applyRename=()=>{if(!titleDraft.trim()){setError("画板名称不能留空");return;}try{const current=committedBoardRef.current,next=renameBoard(current,titleDraft),changed=next.title!==current.title;if(changed)commit(next);keyboard.hide();setFileSurface(null);setNotice(changed?"名称已更新。":"名称没有变化。");restoreSheetFocus("opener");}catch{setError("名称没有保存，请重试");}};
  const duplicateDraft=()=>{
    const previousCopy=recoverPendingBoardCopy();
    if(!previousCopy.ok){setError("上次另存尚未整理完，原画板未改动。请先备份再重试");return;}
    window.dispatchEvent(new Event(BOARD_COPY_RECOVERY_EVENT));
    const current=committedBoardRef.current,copy=cloneBoard(current);
    const linked=readLearningChoice(current.id),observation=readBoardFollowUp(current.id),personal=readBoardDiscovery(current.id);
    if(!linked.ok||!observation.ok||!personal.ok){setError("暂时读不到原画板的关联记录，请重试");return;}
    const now=new Date().toISOString();
    const copiedLearning=linked.value?{...linked.value,boardId:copy.id,updatedAt:now}:undefined;
    const copiedObservation=observation.value?{...observation.value,id:newBoardId("observation"),boardId:copy.id,updatedAt:now}:undefined;
    const copiedDiscovery=personal.value?{...personal.value,id:newBoardId("discovery"),boardId:copy.id,updatedAt:now}:undefined;
    const hasRelationships=Boolean(copiedLearning||copiedObservation||copiedDiscovery);
    if(hasRelationships){
      const journal=saveBoardCopyJournal({version:1,sourceId:current.id,targetId:copy.id,...(copiedLearning?{learning:copiedLearning}:{}),...(copiedObservation?{followUp:copiedObservation}:{}),...(copiedDiscovery?{discovery:copiedDiscovery}:{})});
      if(!journal.ok){setError("暂时无法保护副本记录，未开始另存。请重试");return;}
    }
    const fail=()=>{
      setSavedRecoveryCopy(null);
      setNotice("");
      const recovery=hasRelationships?recoverPendingBoardCopy(undefined,{allowUnpublishedCleanup:true,expectedTargetId:copy.id}):{ok:true} as const;
      if(recovery.ok)window.dispatchEvent(new Event(BOARD_COPY_RECOVERY_EVENT));
      setError(recovery.ok?"副本尚未保存，原画板未改动，请重试":"副本尚未保存，但关联记录清理未完成。原画板未改动，请先备份再重试");
    };
    // Publish the board last: a failed relationship write must never leave a
    // visible copy that silently lacks its selected skill or observation.
    if(copiedLearning&&!saveLearningChoice(copiedLearning).ok){fail();return;}
    if(copiedObservation&&!saveBoardFollowUp(copiedObservation).ok){fail();return;}
    if(copiedDiscovery&&!saveBoardDiscovery(copiedDiscovery).ok){fail();return;}
    const saved=saveBoardIfUnchanged(copy,null);
    if(!saved.ok){fail();return;}
    setSavedRecoveryCopy({title:saved.value.title,revision:committedRevision});
    const cleared=hasRelationships?clearBoardCopyJournal(copy.id):{ok:true} as const;
    if(cleared.ok){window.dispatchEvent(new Event(BOARD_COPY_RECOVERY_EVENT));setError("");setNotice(`已另存为「${saved.value.title}」。`);}
    else{setNotice("");setError("副本已保存，但整理记录尚未清理。请先备份，重新打开后会重试。");}
    window.dispatchEvent(new Event(BOARD_DRAFTS_EVENT));
  };
  const chooseOpening=(id:OpeningId,confirmed=false)=>{
    const current=committedBoardRef.current;
    if(!confirmed&&(current.frames.length>1||current.frames.some(frame=>frame.paths.length||frame.marks.length))){setOpeningChoice(id);return;}
    const next=applyOpening(current,id);commit(next);resetTransientEditorState(next,true,next.frames[0].id);
    setOpeningChoice(null);setFileSurface(null);keyboard.hide();restoreSheetFocus("canvas");setNotice("开局站位已调整，可撤销。");
  };
  const restoreServePosition=()=>{const current=committedBoardRef.current,next=restoreStarterBoard(current);setFileSurface(null);keyboard.hide();restoreSheetFocus("canvas");if(next===current){setNotice("现在就是发球站位。");return;}commit(next);resetTransientEditorState(next,true,next.frames[0]?.id);setTitleDraft(next.title);setNotice("已回到发球站位，可以撤销。");};
  const exportJson=()=>{
    setNotice("");
    const current=committedBoardRef.current,backup=alternativeSeed
      ? createAlternativeRecoveryBackupJSON({...alternativeSeed,board:current})
      : createBoardBackupJSON(current);
    if(!backup.ok){setError(backup.error.includes("过大")?"画板内容过大，无法生成可重新导入的备份。请先减少标记。":"这次备份没有生成，请重试");return;}
    try{
      saveDownload(new Blob([backup.value],{type:"application/json"}),safeFilename(current.title,"json"));
      setNotice("已开始下载，请查看浏览器下载项。");
    }catch{
      setError("这次备份没有生成，请重试");
    }
  };
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
  const downloadMedia=()=>{
    if(mediaState.status!=="ready")return;
    setError("");setNotice("");
    try{
      saveDownload(mediaState.result.blob,mediaState.result.name);
      setNotice("已开始下载，请查看浏览器下载项。");
    }catch{
      setError(`这次${mediaState.result.format==="video"?"球路视频":"动态图"}没有下载，请重试`);
    }
  };
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
  const applySmartContinuation=(next:BoardDocument,nextSelection?:BoardSelection)=>{const smart=getSmartBoardContinuation(next);if(!smart)return false;setFrameIndex(smart.frameIndex);setSelection(nextSelection??{kind:"actor",id:smart.actorId});setAutomaticRouteSelection(Boolean(nextSelection));setTool(smart.phase);setPathKind("shot");return true;};
  const synchronizeSmartMoves=(current:BoardDocument,index:number)=>{
    let synchronized=current;
    for(const move of current.frames[index].paths.filter(path=>path.kind==="move")){
      const next=synchronizeMoveWithPreviousShot(synchronized,index,move.id,true);
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
          const receiverPoint=nextFrame.poses[nextHitter.id],ballPoint=nextFrame.poses[ball.id];
          const receiverReady=!!receiverPoint&&!!ballPoint&&Math.hypot(receiverPoint[0]-ballPoint[0],receiverPoint[1]-ballPoint[1])<=.015;
          next=setSmartRally(next,{version:2,frameId:nextFrame.id,phase:receiverReady?"shot":"move",hitterId:nextHitter.id,actorId:receiverReady?ball.id:nextHitter.id});
          markCommitted(next);
          if(applySmartContinuation(next,{kind:"element",id:completion.selection.id,frameIndex})){navigator.vibrate?.(8);setNotice(receiverReady?"球路已记下。接球方已在落点，再拖动网球画下一拍。":"球路已记下。现在拖动接球球员。");return;}
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
          if(applySmartContinuation(next,{kind:"element",id:completion.selection.id,frameIndex:frameIndex-1})){navigator.vibrate?.(8);setNotice("跑位已记下。再拖动网球，画下一拍。");return;}
        }catch{const manual=setSmartRally(current);markCommitted(manual);setSelection(completion.selection);setTool("select");setError("跑位已保留。接下来请手动调整。");return;}
      }else if(completion.path.kind==="move"){
        const synchronized=synchronizeSmartMoves(current,frameIndex);
        if(synchronized!==current){
          const next=synchronized.smartRally?.version===1?setSmartRally(synchronized,{...synchronized.smartRally,version:2}):synchronized;
          markCommitted(next);
          if(applySmartContinuation(next,{kind:"element",id:completion.selection.id,frameIndex:frameIndex-1})){setNotice("提前回位已记下。对手回球后，再拖动这位球员画接球跑位。");return;}
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
  const cancelCanvasAction=(base:BoardDocument,selectionBefore:BoardSelection|null,automaticSelectionBefore:boolean)=>{setAutomaticRouteSelection(automaticSelectionBefore);const smart=getSmartBoardContinuation(base);if(smart){setFrameIndex(smart.frameIndex);setSelection(selectionBefore?.kind==="element"&&selectionBefore.frameIndex!==undefined?selectionBefore:{kind:"actor",id:smart.actorId});setTool(smart.phase);}else{setSelection(selectionBefore);setTool("select");}};
  const chooseAdd=(next:BoardTool,preset?:ActorPreset|MarkPreset)=>{if(next==="actor"&&preset)setActorPreset(preset as ActorPreset);if(next==="mark"&&preset)setMarkPreset(preset as MarkPreset);chooseTool(next);setToolPalette(null);restoreSheetFocus("canvas");};
  const freezeCourtForNote=()=>{
    const shell=editorRef.current?.querySelector<HTMLElement>(".board-canvas-shell");
    if(shell)setNoteBoardHeight(shell.getBoundingClientRect().height);
    const visual=window.visualViewport;
    const height=visual?.height??window.innerHeight;
    noteViewportBeforeKeyboardRef.current=height;
    setNoteViewport({height,top:visual?.offsetTop??0});
  };
  const placeCourtNote=(position:BoardPoint)=>{freezeCourtForNote();setTool("select");setSelection(null);setCourtNoteDraft("");setCourtNoteEditor({frameIndex,position,saveStateBefore:saveState});setError("");};
  const editCourtNote=(markId:string,markFrameIndex:number)=>{const mark=committedBoardRef.current.frames[markFrameIndex]?.marks.find(item=>item.id===markId&&item.kind==="text");if(!mark)return;freezeCourtForNote();setTool("select");setCourtNoteDraft(mark.text??"");setCourtNoteEditor({frameIndex:markFrameIndex,position:mark.position,markId,saveStateBefore:saveState});setError("");};
  const closeCourtNote=(restoreAfterFailure=true)=>{if(restoreAfterFailure&&saveState==="error"&&!saveConflict&&courtNoteEditor)setSaveState(courtNoteEditor.saveStateBefore);setCourtNoteEditor(null);setCourtNoteDraft("");setError("");keyboard.hide();setTool("select");};
  const saveCourtNote=()=>{
    if(!courtNoteEditor)return;
    const text=courtNoteDraft.trim();if(!text){setError("先写一句备注，或点选常用语。");return;}
    try{
      const current=committedBoardRef.current;
      const id=courtNoteEditor.markId??newBoardId("mark");
      const next=courtNoteEditor.markId?updateMark(current,courtNoteEditor.frameIndex,id,{text}):addMark(current,courtNoteEditor.frameIndex,{id,kind:"text",position:courtNoteEditor.position,text});
      const wasDirty=needsSaveRef.current,previousFuture=future;
      if(next!==current){commit(next);if(committedBoardRef.current!==next)return;}
      const saved=saveNow();
      if(!saved.ok){
        if(next!==current){committedBoardRef.current=current;needsSaveRef.current=wasDirty;setBoard(current);setPast(items=>items.slice(0,-1));setFuture(previousFuture);}
        return;
      }
      setSelection({kind:"element",id});closeCourtNote(false);setNotice("备注已放到画板。");
    }catch(reason){setError(reason instanceof Error?reason.message:"备注没有保存，请重试");}
  };
  const beginSelectedPath=(kind:"shot"|"feed"|"move")=>{const actor=selectedActor;if(!actor||(kind==="move"?actor.kind!=="player":actor.kind!=="ball")){setError(kind==="move"?"请先选择一名球员。":"请先选择网球。");return;}setPathKind(kind==="feed"?"feed":"shot");chooseTool(kind==="move"?"move":"shot");setToolPalette(null);keyboard.hide();restoreSheetFocus("canvas");};
  const previewing=viewMode==="preview",currentPlaybackFrame=previewing?getBoardPose(playbackBoard,elapsed).frameIndex:frameIndex;
  const selectedActorLabel=selectedActor?numberedActorLabel(board.actors,selectedActor):"";
  const selectedLabel=selectedActorLabel||(selectedPath?selectedPath.kind==="move"?"跑位路线":selectedPath.kind==="feed"?"喂球路线":"击球路线":selectedMark?BOARD_MARK_NAMES[selectedMark.kind]:"");
  const activeSmart=smartContinuation?.frameIndex===frameIndex?smartContinuation:null;
  const previousBeatPaths=useMemo(()=>{
    if(previewing||frameIndex<=0||board.smartRally?.frameId!==frame?.id)return [];
    return board.frames[frameIndex-1].paths;
  },[board,frame?.id,frameIndex,previewing]);
  const contextFrameIndex=previousBeatPaths.length?frameIndex-1:null;
  const toolStatus=activeSmart?.phase==="shot"?(frameIndex===0?(entryIntent==="review"?"从网球拖出去，还原这一分":"从网球拖出去，画出发球路线"):"再拖动网球，画下一拍"):activeSmart?.phase==="move"?"拖动接球球员，画出跑位":tool==="actor"?`点一下球场，放置${actorPreset==="me"?"我方球员":actorPreset==="opponent"?"对手球员":"网球"}`:tool==="shot"?`从网球拖到落点，画出${pathKind==="feed"?"喂球路线":"球路"}${curved?"曲线":"直线"}`:tool==="move"?`拖动已选球员，画出跑位${curved?"曲线":"直线"}`:tool==="mark"?`${markPreset==="freehand"?"在球场上拖动，画出":"点一下球场，放置"}${BOARD_MARK_NAMES[markPreset]}`:"";
  const canGoPrevious=elapsed>0;
  const canGoNext=currentPlaybackFrame<playbackBoard.frames.length-1;
  const videoEncoding=pickVideoEncoding();
  const canNativeShare=mediaState.status==="ready"&&!!navigator.share&&(()=>{try{const file=new File([mediaState.result.blob],mediaState.result.name,{type:mediaState.result.mimeType.split(";")[0]});return navigator.canShare?.({files:[file]})??false;}catch{return false;}})();
  const sheetOpen=toolPalette!==null||fileSurface!==null||historyOpen||frameOpen||helpOpen;
  const sheetFeedback=(error||notice)&&<p className={`board-sheet-feedback ${error?"is-error":"is-status"}`} role={error?"alert":"status"} aria-live={error?"assertive":"polite"} aria-atomic="true">{error||notice}</p>;
  const saveLabel=saveState==="clean"?"修改后保存":saveState==="saving"?"保存中":saveState==="saved"?"已保存":saveState==="error"?"未保存":"待保存";
  // Board gestures own edge-back. Portal sheets still bubble through this
  // editor in React, so stop the flow recognizer without stopping native
  // touchstart/pointerdown: Radix's document listeners need swipe direction
  // and outside presses to scroll or dismiss the modal normally.
  // React checks this flag before dispatching to the next synthetic ancestor.
  return <div ref={editorRef} onTouchStart={event=>{event.isPropagationStopped=()=>true;}} onPointerDown={event=>{event.isPropagationStopped=()=>true;}} className={`board-editor ${previewing?"is-previewing":"is-editing"} ${immersive?"is-immersive":""} ${courtNoteEditor?"is-note-editing":""} ${noteBoardHeight!==null?"is-note-viewport-locked":""}`} data-immersive={immersive?"true":"false"} style={noteBoardHeight!==null?{"--board-note-frozen-height":`${noteBoardHeight}px`,"--board-note-visible-height":`${noteViewport?.height??window.innerHeight}px`,"--board-note-visible-top":`${noteViewport?.top??0}px`} as CSSProperties:undefined}>
    <span className={`board-save-live board-save-status is-${saveState}`} data-testid="board-save-live" role="status" aria-live="polite" aria-atomic="true">{`画板${saveLabel}`}</span>
    <div className="board-canvas-shell">
      <div className="board-immersive-toolbar" role="toolbar" aria-label="战术板操作">
        <div className="board-immersive-leading">
          <button className="board-immersive-back" aria-label="返回上一页" onClick={()=>sendBoardAction(initialBoard.id,"back")}><ArrowLeftIcon/></button>
          <ProductWordmark compact />
        </div>
        <div className="board-immersive-actions">
          <button aria-label="撤销" disabled={previewing||past.length===0} onClick={undo}><CounterClockwiseClockIcon/></button>
          <button aria-label="重做" disabled={previewing||future.length===0} onClick={redo}><RedoArrowIcon/></button>
          <button aria-label="调换视角 180 度" aria-pressed={rotated} onClick={()=>setRotated(value=>!value)}><UpdateIcon/></button>
          <button aria-label="查看画板操作说明" aria-haspopup="dialog" aria-expanded={helpOpen} onClick={event=>{rememberSheetOpener(event.currentTarget);setHelpOpen(true);}}><InfoCircledIcon/></button>
          <button aria-label={`打开${board.title}的画板菜单`} aria-haspopup="dialog" aria-expanded={fileSurface==="menu"} onClick={event=>{rememberSheetOpener(event.currentTarget);setOpeningChoice(null);setFileSurface("menu");}}><DotsHorizontalIcon/></button>
        </div>
      </div>
      <BoardCanvas board={previewing?playbackBoard:board} frameIndex={frameIndex} selection={selection} setSelection={next=>{setAutomaticRouteSelection(false);setSelection(next);}} tool={tool} actorPreset={actorPreset} pathKind={pathKind} markPreset={markPreset} curved={curved} smartEnabled={!!activeSmart} protectPreviousEndpoints={automaticRouteSelection&&activeSmart?.phase==="move"} preferredActorId={!selection||automaticRouteSelection&&selection.kind==="element"?activeSmart?.actorId:undefined} contextPaths={previousBeatPaths} contextFrameIndex={contextFrameIndex} previewing={previewing} elapsed={elapsed} display={display} rotated={rotated} preview={preview} commit={commit} finishPreview={finishPreview} onComplete={completeCanvasAction} onOverride={overrideSmartActor} onCancel={cancelCanvasAction} onNudge={nudge} onDelete={deleteSelection} onError={setError} onTogglePathCurve={toggleCurve} onPlaceText={placeCourtNote} onEditText={editCourtNote}/>
      {!previewing&&activeSmart&&showMovementHint&&<div className="board-local-hint"><span><strong>跑位试验版 · 二段跑位</strong><small>{activeSmart.phase==="move"?"拖接球方接球；也可先拖击球方提前回位。":frameIndex===0?"从网球拖出第一拍，开始试画。":"从网球画回球；随后拖原球员完成第二段跑位。"}</small></span><button aria-label="收起跑位提示" onClick={()=>setShowMovementHint(false)}><Cross2Icon/></button></div>}
      {isAlternative&&!previewing&&<div className="board-alternative-label" role="status">从第 {alternativeStartIndex+1} 拍试试 · {saveState==="saved"?"已保存":saveState==="error"?"未保存":"调整中"}</div>}
      {previewing&&(alternative||alternativeSeed&&saveState==="saved")&&<div className="board-compare-switch" role="group" aria-label="比较两条打法"><button aria-pressed={compareMode==="original"} onClick={()=>{setCompareMode("original");setElapsed(0);setIsPlaying(false);}}>原来</button><button aria-pressed={compareMode==="try"} onClick={()=>{setCompareMode("try");setElapsed(0);setIsPlaying(false);}}>试试</button>{alternativeSourceChanged&&<small>原分已改，按当时起点比较</small>}</div>}
      {previewing&&chosenSkill&&<div className="board-practice-context" aria-label={`正在观察${chosenSkill.label}`}>{chosenSkill.label}</div>}
      {hasMeaningfulPoint&&!isAlternative&&!previewing&&!courtNoteEditor&&selectedMark?.kind!=="text"&&<button className={`board-tactic-float${chosenTactic?" is-linked":""}`} data-testid="board-learning-entry" aria-label={chosenTactic?"查看或更换这一分的打法":"找打法"} aria-haspopup="dialog" aria-expanded={fileSurface==="learning"} onClick={event=>{rememberSheetOpener(event.currentTarget);setLearningSurface("tactic");setFileSurface("learning");}}><TacticFinderIcon/></button>}
      {!sheetOpen&&!courtNoteEditor&&error&&<div className="board-toast is-error" role="alert" aria-live="assertive" aria-atomic="true"><span>{error}</span><button aria-label="关闭提示" onClick={()=>setError("")}><Cross2Icon/></button></div>}
      <span className="board-sr-only" role="status" aria-live="polite" aria-atomic="true">{error||notice||toolStatus||(selectedLabel?`已选中${selectedLabel}`:"点选球员、网球或路线开始调整")}</span>
    </div>
    {courtNoteEditor&&!previewing&&<div className="board-note-overlay" data-testid="board-note-overlay">
      <div className="board-note-scrim" aria-hidden="true" />
      <form className="board-note-dialog" data-testid="board-inline-note-editor" role="dialog" aria-modal="true" aria-labelledby="board-note-title" onSubmit={event=>{event.preventDefault();saveCourtNote();}}>
        <h2 id="board-note-title">{courtNoteEditor.markId?"修改备注":"添加备注"}</h2>
        <KeyboardInput autoFocus aria-label="画板备注" value={courtNoteDraft} maxLength={40} enterKeyHint="done" autoComplete="off" placeholder="例如：看对手站位" onChange={event=>setCourtNoteDraft(event.currentTarget.value)} />
        <div className="board-note-suggestions" aria-label="常用语备注">{COURT_NOTE_SUGGESTIONS.map(suggestion=><button type="button" key={suggestion} onClick={()=>setCourtNoteDraft(suggestion)}>{suggestion}</button>)}</div>
        {error&&<span className="board-note-error" role="alert">{error}</span>}
        <div className="board-note-actions"><button type="button" aria-label="取消备注" onClick={()=>closeCourtNote()}>取消</button><button type="submit" data-note-save disabled={!courtNoteDraft.trim()}>保存</button></div>
      </form>
    </div>}
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
      <div><ArrowTopRightIcon/><span><strong>画球路</strong><small>拖动时半透明球路上会有网球移动；速度对应 Control、Drive、Put away，放开后会收起。</small></span></div>
      <div><CornerTopRightIcon/><span><strong>二段跑位（可选）</strong><small>画完球路，拖动刚击球的球员提前回位；再拖接球方并画回球，最后拖原球员接球。不画提前回位也能继续。两段在对手击球时衔接；重复拖动可调整终点。</small></span></div>
      <div><Pencil2Icon/><span><strong>直线／曲线</strong><small>点选球路旁的图标切换；白色菱形可继续调整弧度，新球路默认向右弯。</small></span></div>
      <div><TacticFinderIcon/><span><strong>找打法</strong><small>画出一分后，点画板右下角的分叉球路，查看战术示范。</small></span></div>
      <div><ComponentInstanceIcon/><span><strong>切换场地</strong><small>打开画板菜单，再选择硬地、红土或草地。</small></span></div>
      <div><LayersIcon/><span><strong>找拍次</strong><small>底部右侧打开拍次；选中对象时，同一位置会变成删除。</small></span></div>
      <div className="board-help-icon-title">添加对象</div><div className="board-help-icon-grid" aria-label="添加对象图标说明">
        <div><span className="board-add-player-badge is-me">我</span><span><strong>我方球员</strong><small>蓝色</small></span></div><div><span className="board-add-player-badge is-opponent">对</span><span><strong>对手球员</strong><small>红色</small></span></div><div><ComponentInstanceIcon/><span><strong>网球</strong><small>点一下放置</small></span></div>
        <div><ArrowTopRightIcon/><span><strong>画球路</strong><small>从网球拖出</small></span></div><div><CornerTopRightIcon/><span><strong>画跑位</strong><small>拖动球员</small></span></div><div><ResumeIcon/><span><strong>喂球路线</strong><small>从网球拖出</small></span></div>
        <div><TargetIcon/><span><strong>目标区</strong><small>点一下放置</small></span></div><div><DrawingPinIcon/><span><strong>标志碟</strong><small>点一下放置</small></span></div><div><ArchiveIcon/><span><strong>球筐</strong><small>点一下放置</small></span></div>
        <div><TextIcon/><span><strong>文字备注</strong><small>点位置后直接输入</small></span></div><div><Pencil2Icon/><span><strong>自由笔</strong><small>拖动绘制</small></span></div>
      </div>
    </div></div></BottomSheet>
    <BottomSheet open={toolPalette!==null} onOpenChange={open=>{if(!open){keyboard.hide();setToolPalette(null);restoreSheetFocus("opener");}}} title="添加对象" snap={.68}><div className="board-sheet"><button className="guide-close" aria-label="关闭添加面板" onClick={()=>{setToolPalette(null);keyboard.hide();restoreSheetFocus("opener");}}><Cross2Icon/></button>{sheetFeedback}<div className="board-file-actions board-icon-actions">
      <button className="is-me" aria-label="我方球员" onClick={()=>chooseAdd("actor","me")}><span className="board-add-player-badge is-me" aria-hidden="true">我</span><span>我方</span></button><button className="is-opponent" aria-label="对手球员" onClick={()=>chooseAdd("actor","opponent")}><span className="board-add-player-badge is-opponent" aria-hidden="true">对</span><span>对手</span></button><button aria-label="网球" onClick={()=>chooseAdd("actor","ball")}><ComponentInstanceIcon aria-hidden="true"/><span>网球</span></button><button aria-label="画球路" disabled={selectedActor?.kind!=="ball"} onClick={()=>beginSelectedPath("shot")}><ArrowTopRightIcon aria-hidden="true"/><span>球路</span></button><button aria-label="画跑位" disabled={selectedActor?.kind!=="player"} onClick={()=>beginSelectedPath("move")}><CornerTopRightIcon aria-hidden="true"/><span>跑位</span></button><button aria-label="喂球路线" disabled={selectedActor?.kind!=="ball"} onClick={()=>beginSelectedPath("feed")}><ResumeIcon aria-hidden="true"/><span>喂球</span></button><button aria-label="目标区" onClick={()=>chooseAdd("mark","target")}><TargetIcon aria-hidden="true"/><span>目标区</span></button><button aria-label="标志碟" onClick={()=>chooseAdd("mark","cone")}><DrawingPinIcon aria-hidden="true"/><span>标志碟</span></button><button aria-label="球筐" onClick={()=>chooseAdd("mark","basket")}><ArchiveIcon aria-hidden="true"/><span>球筐</span></button><button aria-label="文字备注" onClick={()=>chooseAdd("mark","text")}><TextIcon aria-hidden="true"/><span>备注</span></button><button aria-label="自由笔" onClick={()=>chooseAdd("mark","freehand")}><Pencil2Icon aria-hidden="true"/><span>自由笔</span></button>
    </div></div></BottomSheet>
    <BottomSheet open={fileSurface==="menu"} onOpenChange={open=>{if(!open){setOpeningChoice(null);setFileSurface(null);keyboard.hide();restoreSheetFocus("opener");}}} title="画板菜单" snap={.625}><div className="board-sheet board-menu-sheet">{sheetFeedback}
      {!isAlternative&&<section className="board-menu-section board-menu-opening-section" aria-label="开局站位"><p>开局站位</p>{openingChoice?<div className="board-opening-confirm" role="alert"><strong>改为{OPENINGS.find(item=>item.id===openingChoice)?.label}？</strong><p>会替换当前画板的所有拍次、路线和备注。需要保留两份，请先返回菜单另存一份；本次替换可以撤销。</p><button className="sheet-done" onClick={()=>chooseOpening(openingChoice,true)}>确认替换站位</button><button className="sheet-done is-secondary" onClick={()=>setOpeningChoice(null)}>取消</button></div>:<div className="board-opening-grid">{OPENINGS.map(opening=><button key={opening.id} onClick={()=>chooseOpening(opening.id)}><svg viewBox="0 0 100 140" aria-hidden="true"><rect x="16" y="14" width="68" height="112" rx="2" fill="#28684b" stroke="#dbe6dc"/><path d="M16 70H84 M24 14V126 M76 14V126 M24 44H76 M24 96H76 M50 44V96" fill="none" stroke="#dbe6dc"/>{[[opening.me,"#3e8ad6"],[opening.opponent,"#dc4151"]].map(([point,color],index)=><circle key={index} cx={16+(point as readonly number[])[0]*68} cy={14+(point as readonly number[])[1]*112} r="5" fill={color as string} stroke="white"/>)}<circle cx={16+(opening.server==="me"?opening.me[0]:opening.opponent[0])*68+7} cy={14+(opening.server==="me"?opening.me[1]:opening.opponent[1])*112} r="3" fill="#d8ef72"/></svg><strong>{opening.label}</strong></button>)}</div>}</section>}
      {!isAlternative&&<section className="board-menu-section board-menu-edit-section"><p>编辑</p><div className="board-menu-list board-menu-compact-list"><button onClick={()=>{setTitleDraft(committedBoardRef.current.title);setError("");setFileSurface("rename");}}><Pencil2Icon/><span><strong>修改名称</strong></span></button></div></section>}
      <section className="board-menu-section board-menu-manage-section"><p>{isAlternative?"试法":"保存与管理"}</p><div className="board-menu-list board-menu-compact-list"><button onClick={()=>{clearMediaOutput();setFileSurface("save-share");}}><Share2Icon/><span><strong>保存与分享</strong></span></button>{!isAlternative&&<button onClick={()=>{const result=saveNow();if(!result.ok)return;if(immersive){resumeImmersiveOnReturnRef.current=true;afterImmersiveExitRef.current=openLibrary;exitImmersive(false);return;}keyboard.hide();setFileSurface(null);openLibrary();}}><LayersIcon/><span><strong>草稿与模板</strong></span></button>}{isAlternative&&<button onClick={leaveAlternativeWithoutSaving}><ArrowLeftIcon/><span><strong>{persistedAlternativeRef.current?"返回上一页":"放弃未保存的试法"}</strong></span></button>}{isAlternative&&persistedAlternativeRef.current&&<button onClick={()=>setConfirmAlternativeDelete(value=>!value)}><TrashIcon/><span><strong>{confirmAlternativeDelete?"取消删除":"删除试法"}</strong></span></button>}{isAlternative&&confirmAlternativeDelete&&<button className="board-menu-delete-confirm" onClick={removeAlternative}>确认删除试法，原分保留</button>}</div></section>
      <p className={`board-autosave-note is-${saveState}`}>{saveState==="clean"?"修改后自动保存":saveState==="saving"?"保存中…":saveState==="saved"?"已保存":saveState==="error"?"保存失败":"等待保存"}</p>
      {saveState==="error"&&<div className="board-autosave-actions">{!saveConflict&&<button onClick={()=>saveNow()}><UpdateIcon/>重试</button>}<button onClick={()=>{clearMediaOutput();setFileSurface("save-share");}}><CodeIcon/>备份</button></div>}
      <section className="board-menu-section board-theme-section" aria-label="场地设置"><div className="board-theme-heading"><p>场地</p><small>外观与辅助显示</small></div><div className="board-theme-group board-surface-choice"><p>地面</p><div className="board-menu-surface-picker" role="group" aria-label="球场主题">{(["hard","clay","grass"] as BoardSurface[]).map(surface=><button key={surface} className={`board-menu-surface is-${surface}`} aria-label={surface==="hard"?"硬地":surface==="clay"?"红土":"草地"} aria-pressed={display.surface===surface} onClick={()=>updateDisplay({surface})}><span className="board-surface-swatch" aria-hidden="true"/><span>{surface==="hard"?"硬地":surface==="clay"?"红土":"草地"}</span>{display.surface===surface&&<CheckCircledIcon aria-hidden="true"/>}</button>)}</div></div><div className="board-theme-group board-display-choice"><p>辅助显示</p><div className="board-display-toggle-row" aria-label="画板显示开关"><button className={`board-display-toggle${display.showZones?" is-on":""}`} aria-label={`站位分区颜色，分区${display.showZones?"已开":"已关"}`} aria-pressed={display.showZones} onClick={()=>updateDisplay({showZones:!display.showZones})}><LayersIcon/><span>分区{display.showZones?"已开":"已关"}</span>{display.showZones&&<CheckCircledIcon aria-hidden="true"/>}</button><button className={`board-display-toggle${display.showZoneLabels?" is-on":""}`} aria-label="区域名称" aria-pressed={display.showZoneLabels} onClick={()=>updateDisplay({showZoneLabels:!display.showZoneLabels})}><ReaderIcon/><span>名称 {display.showZoneLabels?"已开":"已关"}</span>{display.showZoneLabels&&<CheckCircledIcon aria-hidden="true"/>}</button></div></div></section>
    </div></BottomSheet>
    <BottomSheet open={fileSurface==="learning"} onOpenChange={open=>{if(!open){setFileSurface(null);setLearningSurface("tactic");keyboard.hide();restoreSheetFocus("opener");}}} title={learningSurface==="tactic"?"这分卡在哪？":"这次先练好一件事"} snap={.625}><div className="board-sheet board-learning-sheet">
      {learningSurface==="skill"&&<button className="board-sheet-back" aria-label="返回问题分类" onClick={()=>setLearningSurface("tactic")}><ChevronLeftIcon/></button>}<button className="guide-close" aria-label="关闭下一步" onClick={()=>{setFileSurface(null);setLearningSurface("tactic");keyboard.hide();restoreSheetFocus("opener");}}><Cross2Icon/></button>{sheetFeedback}
            {learningSurface==="tactic"?<>{chosenTactic&&<button className="learning-current" onClick={openChosenPointTactic}><CheckCircledIcon/><span><small>已选打法</small><strong>{chosenTactic.name}</strong></span></button>}{(chosenTactic||alternative)&&<button className="learning-current learning-alternative-entry" onClick={openPointAlternative}><ArrowTopRightIcon/><span><small>{alternative?"已保存另一种打法":`从第 ${frameIndex+1} 拍开始`}</small><strong>{alternative?"查看／修改试法":"从这拍试试"}</strong></span></button>}<p className="learning-prompt">先选最接近的问题，再看对应打法。</p><div className="learning-choice-grid">{categories.filter(category=>category!=="全部").map(category=><button key={category} onClick={()=>openPointTactics(category)}><TargetIcon/><strong>{category}</strong></button>)}</div><button className="learning-skill-entry" aria-label="练一项" onClick={()=>setLearningSurface("skill")}><DrawingPinIcon/><span><strong>练一项</strong><small>挑一个固定技能，先看示范</small></span></button><button className="learning-all" onClick={()=>openPointTactics("全部")}>看看全部打法</button></>:<><p className="learning-prompt">先看画板示范，再决定这次练哪一项。</p>{chosenSkill&&<button className="learning-current" onClick={openChosenPointSkill}><CheckCircledIcon/><span><small>已保存的练习</small><strong>{chosenSkill.label}</strong></span></button>}<div className="learning-skill-list">{FIXED_SKILLS.map(skill=><button key={skill.id} aria-pressed={learningChoice?.route==="skill"&&learningChoice.skillId===skill.id} onClick={()=>openPointSkill(skill.id)}><span><strong>{skill.label}</strong><small>{skill.question}</small></span>{learningChoice?.route==="skill"&&learningChoice.skillId===skill.id?<CheckCircledIcon/>:null}</button>)}</div></>}
    </div></BottomSheet>
    <BottomSheet open={fileSurface==="save-share"} onOpenChange={open=>{if(!open){setFileSurface(null);keyboard.hide();restoreSheetFocus("opener");}}} title="保存与分享" snap={.625}><div className="board-sheet board-save-share-sheet"><button className="board-sheet-back" aria-label="返回画板菜单" onClick={()=>setFileSurface("menu")}><ChevronLeftIcon/></button><button className="guide-close" aria-label="关闭保存与分享" onClick={()=>{setFileSurface(null);keyboard.hide();restoreSheetFocus("opener");}}><Cross2Icon/></button>{sheetFeedback}
      <section className="board-menu-section"><p>分享成品</p><div className="board-menu-list"><button disabled={!hasPlayablePath||totalDuration<=0||totalDuration>30||!videoEncoding} onClick={()=>openMediaExport("video")}><VideoIcon/><span><strong>分享球路视频 <b>推荐</b></strong><small>画质更清楚，适合保存和发布</small><em>{!hasPlayablePath?"先画一条球路":totalDuration>30?"球路超过 30 秒，请缩短后再试":!videoEncoding?"此浏览器暂时不能生成视频，改用动态图":`${totalDuration.toFixed(1)} 秒 · ${videoEncoding.extension.toUpperCase()}`}</em></span></button><button disabled={!hasPlayablePath||totalDuration<=0||totalDuration>12} onClick={()=>openMediaExport("gif")}><ImageIcon/><span><strong>分享动态图</strong><small>适合聊天中快速查看</small><em>{!hasPlayablePath?"先画一条球路":totalDuration>12?"球路超过 12 秒，请缩短后再试":`${totalDuration.toFixed(1)} 秒 · 无声`}</em></span></button><button onClick={()=>void exportPng()}><ImageIcon/><span><strong>保存这一拍图片</strong><small>静态图片 · 不含控制柄</small></span><DownloadIcon/></button></div></section>
      <section className="board-menu-section"><p>保留可编辑版本</p><div className="board-menu-list"><button onClick={duplicateDraft}><CopyIcon/><span><strong>另存一份</strong><small>保留一份可独立编辑的画板</small></span></button><button onClick={exportJson}><CodeIcon/><span><strong>备份画板</strong><small>之后可导入，继续修改</small></span><DownloadIcon/></button></div></section>
      {saveState==="error"&&savedRecoveryCopy?.revision===committedRevision&&<p className="board-sheet-feedback is-status" role="status">副本「{savedRecoveryCopy.title}」已保存到此浏览器；当前原画板仍未保存。</p>}
      {saveState==="error"&&<p className="board-export-warning">{saveConflict==="deleted"?"原画板已在另一页删除。当前画面尚未保存，请另存一份或备份，再返回首页。":saveConflict==="changed"?"原画板已在另一页修改。当前画面尚未保存，请另存一份或备份。":"这次修改尚未保存，请重试。也可以先备份画板。"}</p>}
    </div></BottomSheet>
    <BottomSheet open={fileSurface==="media"} onOpenChange={open=>{if(!open)closeShareSheet();}} title="分享战术动画" description="只在这台设备生成，不会上传战术内容。" snap={.88}><div className="board-sheet board-media-sheet"><button className="board-sheet-back" aria-label="返回保存与分享" onClick={()=>{clearMediaOutput();setFileSurface("save-share");}}><ChevronLeftIcon/></button><button className="guide-close" aria-label="关闭动画分享" onClick={closeShareSheet}><Cross2Icon/></button>{sheetFeedback}
      {mediaState.status==="generating"?<div className="board-media-progress" role="status" aria-live="polite"><span className="board-media-icon">{mediaState.kind==="video"?<VideoIcon/>:<ImageIcon/>}</span><strong>正在生成{mediaState.kind==="video"?"球路视频":"动态图"}</strong><small>{mediaState.kind==="video"?"会按球路实际时长录制，请暂时保持此页在前台。":"正在逐帧绘制动态图。"}</small><progress max="1" value={mediaState.progress}/><b>{Math.round(mediaState.progress*100)}%</b><button className="sheet-done is-secondary" onClick={clearMediaOutput}>取消</button></div>:mediaState.status==="ready"?<div className="board-media-result"><div className="board-media-preview">{mediaState.result.format==="video"?<video src={mediaState.url} autoPlay loop muted playsInline controls/>:<img src={mediaState.url} alt="战术动态图预览"/>}</div><div className="board-media-result-copy"><CheckCircledIcon/><span><strong>{mediaState.result.format==="video"?"球路视频":"动态图"}已生成</strong><small>{mediaState.result.duration.toFixed(1)} 秒 · {(mediaState.result.blob.size/1024/1024).toFixed(1)} MB</small></span></div><button className="sheet-done" onClick={()=>void shareMedia()}>{canNativeShare?<><Share2Icon/>分享{mediaState.result.format==="video"?"球路视频":"动态图"}</>:<><DownloadIcon/>下载到设备</>}</button>{canNativeShare&&<button className="sheet-done is-secondary" onClick={downloadMedia}><DownloadIcon/>下载到设备</button>}<button className="board-media-again" onClick={clearMediaOutput}>换一种格式</button></div>:<><p className="board-media-privacy"><InfoCircledIcon/><span><strong>画板与分享文件分开</strong><small>这里生成的是只读成品，不会改动画板。</small></span></p>{mediaState.status==="error"&&<p className="board-sheet-feedback is-error" role="alert">{mediaState.message}</p>}<div className="board-media-options"><button disabled={!hasPlayablePath||totalDuration<=0||totalDuration>30||!videoEncoding} onClick={()=>void beginMediaExport("video")}><VideoIcon/><span><strong>分享球路视频 <b>推荐</b></strong><small>画质更清楚，适合保存和发布</small><em>{!hasPlayablePath?"先画一条球路":totalDuration<=0?"球路时长要大于 0 秒":totalDuration>30?"球路超过 30 秒，请缩短后再试":!videoEncoding?"此浏览器暂时不能生成视频，改用动态图":`${totalDuration.toFixed(1)} 秒 · ${videoEncoding.extension.toUpperCase()}`}</em></span></button><button disabled={!hasPlayablePath||totalDuration<=0||totalDuration>12} onClick={()=>void beginMediaExport("gif")}><ImageIcon/><span><strong>分享动态图</strong><small>自动循环，适合聊天中快速查看</small><em>{!hasPlayablePath?"先画一条球路":totalDuration<=0?"球路时长要大于 0 秒":totalDuration>12?"球路超过 12 秒，请缩短后再试":`${totalDuration.toFixed(1)} 秒 · 无声`}</em></span></button></div><button className="sheet-done is-secondary" onClick={()=>{clearMediaOutput();setFileSurface("save-share");}}>返回保存与分享</button></>}
    </div></BottomSheet>
    <BoardRenameLayer open={fileSurface==="rename"} value={titleDraft} error={error} onChange={value=>{setTitleDraft(value);if(error)setError("");}} onCancel={cancelRename} onSubmit={applyRename}/>
    <BottomSheet open={historyOpen} onOpenChange={open=>{setSheetVisibility(setHistoryOpen,open);if(!open)restoreSheetFocus("opener");}} title="拍次" snap={.44}><div className="board-sheet"><button className="guide-close" aria-label="关闭拍次" onClick={()=>{setHistoryOpen(false);keyboard.hide();restoreSheetFocus("opener");}}><Cross2Icon/></button>{sheetFeedback}<div className="board-object-list board-history-list">{board.frames.map((item,index)=>{const isCurrent=index===frameIndex,isContinuation=smartContinuation?.frameIndex===index&&item.paths.length===0,continuationLabel=smartContinuation?.phase==="move"?"等待接球方跑位":index===0?"等待第一条球路":"等待下一拍球路";return <button key={item.id} aria-current={isCurrent?"step":undefined} aria-label={`编辑第 ${index+1} 拍：${item.label}`} onClick={()=>openFrameFromHistory(index)}><span className="board-history-number">{index+1}</span><span><strong>{item.label}</strong><small>{isContinuation?continuationLabel:`${item.paths.length} 条轨迹 · ${item.duration.toFixed(1)} 秒`}</small></span>{isCurrent?<CheckCircledIcon/>:null}</button>;})}</div></div></BottomSheet>
    <BottomSheet open={frameOpen} onOpenChange={open=>{setSheetVisibility(setFrameOpen,open);if(!open)restoreSheetFocus("opener");}} title={`第 ${frameIndex+1} 拍`} description="球速由画球路时的蓄力决定，跑位与来球同步。" snap={.58}><div className="board-sheet"><button className="guide-close" aria-label="取消编辑拍次" onClick={()=>{setFrameOpen(false);keyboard.hide();restoreSheetFocus("opener");}}><Cross2Icon/></button>{sheetFeedback}<label className="board-field"><span>拍次口令</span><KeyboardInput value={frameLabel} maxLength={42} onChange={event=>setFrameLabel(event.currentTarget.value)}/></label><button className="sheet-done" onClick={applyFrame}>完成</button><div className="board-sheet-row"><button onClick={()=>{addNextFrame(true);setFrameOpen(false);keyboard.hide();restoreSheetFocus("canvas");}}><CopyIcon/>沿用标记到新增一拍</button><button className="is-danger" disabled={board.frames.length===1} onClick={deleteCurrentFrame}><TrashIcon/>删除此拍</button></div></div></BottomSheet>
  </div>;
}

function capturePointBoard(boardId:string) {
  const boards=readBoards();
  if(!boards.ok)return {ok:false,error:"暂时读不到原画板，未保存选择。请重试"} as const;
  const board=boards.value.find(item=>item.id===boardId);
  if(!board)return {ok:false,error:"原画板已删除，未保存选择。请返回首页重新开始。"} as const;
  return {ok:true,value:board} as const;
}

function requireLivePointBoard(opened:ReturnType<typeof capturePointBoard>) {
  if(!opened.ok)return opened;
  const current=checkBoardUnchanged(opened.value);
  if(!current.ok)return {ok:false,error:current.conflict==="changed"?"原画板已在另一页修改，未保存选择。请返回首页重新打开。":current.conflict==="deleted"?"原画板已删除，未保存选择。请返回首页重新开始。":current.error} as const;
  return {ok:true,value:undefined} as const;
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

function useBoardRoutePresentationIsolation(revision:number) {
  useLayoutEffect(()=>{
    const flowStack=document.querySelector<HTMLElement>(".tennis-app .flow-stack");
    const stage=flowStack?.closest<HTMLElement>(".phone-stage");
    if(!flowStack||!stage)return;
    const sync=()=>{
      const current=flowStack.querySelector<HTMLElement>('.flow-screen[data-flow-current="true"]:not(.flow-pop-exiting) .board-editor');
      if(current){
        if(stage.dataset.boardRouteActive!=="true")stage.dataset.boardRouteActive="true";
        flowStack.querySelectorAll<HTMLElement>(".flow-fixed-header").forEach(header=>header.style.setProperty("display","none","important"));
        flowStack.querySelector<HTMLElement>(".flow-scenes")?.style.setProperty("top","0px","important");
      }else{
        if(stage.dataset.boardRouteActive!==undefined)delete stage.dataset.boardRouteActive;
        flowStack.querySelectorAll<HTMLElement>(".flow-fixed-header").forEach(header=>header.style.removeProperty("display"));
        flowStack.querySelector<HTMLElement>(".flow-scenes")?.style.removeProperty("top");
      }
    };
    const observer=new MutationObserver(sync);
    const stageObserver=new MutationObserver(sync);
    observer.observe(flowStack,{subtree:true,childList:true,attributes:true,attributeFilter:["data-flow-current","class"]});
    // Fullscreen or hot-update transitions can retain an old FlowStack header.
    // Reassert the board layout from the current route, not from that header.
    stageObserver.observe(stage,{attributes:true,attributeFilter:["data-board-route-active"]});
    sync();
    return()=>{observer.disconnect();stageObserver.disconnect();delete stage.dataset.boardRouteActive;flowStack.querySelectorAll<HTMLElement>(".flow-fixed-header").forEach(header=>header.style.removeProperty("display"));flowStack.querySelector<HTMLElement>(".flow-scenes")?.style.removeProperty("top");};
  },[revision]);
}

export default function Prototype() {
  const previewIdentity=localPreviewIdentity();
  const [info,setInfo]=useState(false);
  const [copyRecoveryError,setCopyRecoveryError]=useState("");
  useFlowAccessibilityIsolation(0);
  useBoardRoutePresentationIsolation(flowHotRevision);
  useLayoutEffect(()=>{
    const copyRecovery=recoverPendingBoardCopy();
    if(!copyRecovery.ok)setCopyRecoveryError("上次另存尚未确认完。原画板仍在；首页上滑查看恢复方式。若另一页仍在另存，请先等它完成。");
    const recovered=recoverPendingBoardDelete();
    if(recovered.ok&&recovered.value==="restored"){
      window.dispatchEvent(new Event(BOARD_LEARNING_EVENT));
      window.dispatchEvent(new Event(BOARD_FOLLOW_UP_EVENT));
    }
  },[]);
  useEffect(()=>{const cleared=()=>setCopyRecoveryError("");window.addEventListener(BOARD_COPY_RECOVERY_EVENT,cleared);return()=>window.removeEventListener(BOARD_COPY_RECOVERY_EVENT,cleared);},[]);
  function makeBoardLibrary(activeBoardId:string):FlowScreen {
    return {
      id:"board-library",
      title:"草稿与模板",
      headerHeight:62,
      header:flow=><AppHeader title="草稿与模板" back={flow.pop}/>,
      render:flow=><BoardLibrary activeBoardId={activeBoardId} openBoard={(board,persisted,notice)=>flow.push(makeBoard(board,persisted,undefined,notice))} openAlternative={(record,sourceMissing)=>flow.push(makeAlternative(record,true,sourceMissing))}/>,
    };
  }
  function makeAlternative(record:BoardAlternative,persisted:boolean,sourceMissing=false):FlowScreen {
    return {
      id:`board-alternative-${record.id}`,
      title:"试试另一种打法",
      render:flow=><BoardEditor initialBoard={record.board} initialPersisted={persisted}
        alternativeSeed={record} alternativePersisted={persisted}
        entryNotice={sourceMissing?"原分已不在本机；这里保留了当时的起点。":"试法与原分分开保存；从选中的这拍改起。"}
        back={()=>{const current=document.querySelector<HTMLElement>('.tennis-app .flow-screen[data-flow-current="true"]');current?.classList.add("flow-pop-exiting");current?.previousElementSibling?.classList.add("flow-pop-destination");flow.pop();}}
        openLibrary={()=>{}} openTacticsForPoint={()=>{}} openTacticForPoint={()=>{}} openSkillForPoint={()=>{}}/>,
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
      render:flow=> <BoardEditor initialBoard={prepared} initialPersisted={initialPersisted} initialStoredBoard={initialPersisted?board:undefined} migrationSource={migrationSource} legacyNeedsReview={legacyNeedsReview} entryIntent={entryIntent} entryNotice={entryNotice} back={()=>{
        const flowStack=document.querySelector<HTMLElement>(".tennis-app .flow-stack");
        const currentScreen=flowStack?.querySelector<HTMLElement>('.flow-screen[data-flow-current="true"]');
        const previousScreen=currentScreen?.previousElementSibling;
        previousScreen?.classList.add("flow-pop-destination");
        currentScreen?.classList.add("flow-pop-exiting");
        flow.pop();
      }} openLibrary={()=>flow.push(makeBoardLibrary(prepared.id))} openTacticsForPoint={(boardId,category)=>flow.push(makeKnowledge("tactics",category,boardId))} openTacticForPoint={(boardId,tactic)=>flow.push(makeDetail(tactic,undefined,boardId,1))} openSkillForPoint={(boardId,skillId)=>flow.push(makeSkillPractice(skillId,boardId))} openAlternativeForPoint={(boardId,frameId,tacticId)=>{
        const boards=readBoards();
        if(!boards.ok)return {ok:false,error:"暂时读不到原画板，未打开试法"};
        const source=boards.value.find(item=>item.id===boardId);
        if(!source)return {ok:false,error:"原画板已不在本机，未打开新试法"};
        const stored=readBoardAlternative(boardId);
        if(!stored.ok)return {ok:false,error:stored.error};
        const draft=stored.value?{ok:true,value:stored.value} as const:createAlternativeDraft(source,frameId,tacticId);
        if(!draft.ok)return {ok:false,error:draft.error};
        flow.push(makeAlternative(draft.value,Boolean(stored.value)));
        return {ok:true};
      }}/>,
    };
  }
  function makeSkillPractice(skillId:FixedSkillId,pointBoardId:string,returnSteps=1):FlowScreen {
    const plan=skillPracticeById(skillId);
    const skill=fixedSkillById(skillId);
    const openedChoice=readLearningChoice(pointBoardId);
    const openedBoard=capturePointBoard(pointBoardId);
    const expectedChoice=openedChoice.ok?openedChoice.value:undefined;
    if(!plan||!skill)throw new Error(`找不到练习「${skillId}」`);
    return {
      id:`practice-${skillId}-for-${pointBoardId}`,
      title:skill.label,
      render:flow=>{
        const current=readLearningChoice(pointBoardId);
        const selected=Boolean(current.ok&&current.value?.route==="skill"&&current.value.skillId===skillId);
        const returnToBoard=()=>{
          const flowStack=document.querySelector<HTMLElement>(".tennis-app .flow-stack");
          const currentScreen=flowStack?.querySelector<HTMLElement>('.flow-screen[data-flow-current="true"]');
          const previousScreen=currentScreen?.previousElementSibling;
          if(previousScreen?.querySelector(".board-editor")){
            previousScreen.classList.add("flow-pop-destination");
            currentScreen?.classList.add("flow-pop-exiting");
          }
          flow.pop();
        };
        const useForPoint=()=>{
          const liveBoard=requireLivePointBoard(openedBoard);
          if(!liveBoard.ok)return liveBoard;
          const result=saveSkillChoiceIfUnchanged(pointBoardId,skillId,expectedChoice);
          if(!result.ok)return result;
          window.dispatchEvent(new Event(BOARD_LEARNING_EVENT));
          for(let index=0;index<returnSteps;index+=1)returnToBoard();
          return {ok:true} as const;
        };
        return <SkillPracticePlayer plan={plan} selectedForPoint={selected} useForPoint={useForPoint} back={returnToBoard}/>;
      },
    };
  }
  function makeDetail(tactic:Tactic,contextLabel?:string,pointBoardId?:string,returnSteps=1,sourceBoard?:ReturnType<typeof capturePointBoard>):FlowScreen {
    const openedChoice=pointBoardId?readLearningChoice(pointBoardId):undefined;
    const openedBoard=pointBoardId?(sourceBoard??capturePointBoard(pointBoardId)):undefined;
    const expectedChoice=openedChoice?.ok?openedChoice.value:undefined;
    return {
      id:`${tactic.id}${pointBoardId?`-for-${pointBoardId}`:""}`,
      title:tactic.name,
      headerHeight:0,
      render:flow=>{
        const current=pointBoardId?readLearningChoice(pointBoardId):undefined;
        const selected=Boolean(current?.ok&&current.value?.route==="tactic"&&current.value.tacticId===tactic.id);
        const useForPoint=pointBoardId?()=>{
          const liveBoard=requireLivePointBoard(openedBoard!);
          if(!liveBoard.ok)return liveBoard;
          const result=saveTacticChoiceIfUnchanged(pointBoardId,tactic.id,expectedChoice);
          if(!result.ok)return result;
          window.dispatchEvent(new Event(BOARD_LEARNING_EVENT));
          const flowStack=document.querySelector<HTMLElement>(".tennis-app .flow-stack");
          const currentScreen=flowStack?.querySelector<HTMLElement>('.flow-screen[data-flow-current="true"]');
          const exitingScreens:Element[]=[];
          let destination:Element|null=currentScreen??null;
          for(let index=0;index<returnSteps&&destination;index+=1){
            exitingScreens.push(destination);
            destination=destination.previousElementSibling;
          }
          if(destination?.querySelector(".board-editor")){
            destination.classList.add("flow-pop-destination");
            exitingScreens.forEach(screen=>screen.classList.add("flow-pop-exiting"));
          }
          for(let index=0;index<returnSteps;index+=1)flow.pop();
          return {ok:true} as const;
        }:undefined;
        return <TacticPlayer tactic={tactic} contextLabel={contextLabel} back={flow.pop} openBoard={()=>flow.push(makeBoard(boardFromTactic(tactic)))} selectedForPoint={selected} useForPoint={useForPoint}/>;
      },
    };
  }
  function makeCombination(combination:Combination):FlowScreen {return {id:`${combination.id}-plan`,title:combination.name,headerHeight:62,header:flow=><AppHeader title={`${combination.name} · 思路`} back={flow.pop} menu={()=>setInfo(true)}/>,render:flow=><CombinationDetail combination={combination} openTactic={(tactic,contextLabel)=>flow.push(makeDetail(tactic,contextLabel))} openBoard={()=>flow.push(makeBoard(boardFromTactics(combination.stages.map(stage=>combinationExample(stage.tacticId,stage.excerpt)),combination.name)))}/>};}
  function makeInteractive(combination:Combination,pointBoardId?:string):FlowScreen {
    return {id:`${combination.id}-rally${pointBoardId?`-for-${pointBoardId}`:""}`,title:combination.name,headerHeight:62,header:flow=><AppHeader title={combination.name} back={flow.pop} menu={()=>setInfo(true)}/>,render:flow=><InteractiveCombinationPlayer combination={combination} openPlan={()=>flow.push(makeCombination(combination))}/>};
  }
  function makeKnowledge(initialMode:"tactics"|"combinations"="tactics",initialCategory:CategoryFilter="全部",pointBoardId?:string):FlowScreen {
    const jumpRef:{current:(category:CategoryFilter)=>void}={current:()=>{}};
    const openedBoard=pointBoardId?capturePointBoard(pointBoardId):undefined;
    return {id:`knowledge-${initialMode}-${initialCategory}${pointBoardId?`-${pointBoardId}`:""}`,title:"找个打法",headerHeight:60,header:flow=><TacticCatalogueHeader jump={category=>jumpRef.current(category)} close={()=>{
    if(pointBoardId){
      const flowStack=document.querySelector<HTMLElement>(".tennis-app .flow-stack");
      const currentScreen=flowStack?.querySelector<HTMLElement>('.flow-screen[data-flow-current="true"]');
      const previousScreen=currentScreen?.previousElementSibling;
      if(previousScreen?.querySelector(".board-editor")){
        previousScreen.classList.add("flow-pop-destination");
        currentScreen?.classList.add("flow-pop-exiting");
      }
    }
    flow.pop();
  }}/>,render:flow=><TacticsList initialMode={initialMode} initialCategory={initialCategory} jumpRef={jumpRef} choosingForPoint={Boolean(pointBoardId)} openTactic={tactic=>flow.push(makeDetail(tactic,undefined,pointBoardId,pointBoardId?2:1,openedBoard))} openCombination={combination=>flow.push(makeInteractive(combination,pointBoardId))}/>};
  }
  function makeHome():FlowScreen {return {id:"home",title:"RallyPath",headerHeight:62,header:()=> <HomeHeader menu={()=>setInfo(true)}/>,render:flow=><BoardHome openBoard={(board,persisted,intent)=>flow.push(makeBoard(board,persisted,intent))} openKnowledge={(mode,category)=>flow.push(makeKnowledge(mode,category))} openLibrary={()=>flow.push(makeBoardLibrary(""))}/>};}
  const initial:FlowScreen=makeHome();
  return <div className="tennis-app"><FlowStack key={flowHotRevision} initial={initial}/>{copyRecoveryError&&<div className="copy-recovery-error" role="alert">{copyRecoveryError}</div>}<BottomSheet open={info} onOpenChange={setInfo} title="怎么用 RallyPath" description="画出自己的一分，再决定下一步。" snap={.54}><div className="about-demo">
    <ol className="about-steps">
      <li><span>01</span><div><strong>画一分</strong><p>想下一分，或记下训练、比赛里刚发生的一分。</p></div></li>
      <li><span>02</span><div><strong>再回看</strong><p>改动画板才会保存在此浏览器；首页上滑，就能找回来。</p></div></li>
      <li><span>03</span><div><strong>找打法</strong><p>去战术库看示范，再决定要不要改成自己的打法。</p></div></li>
    </ol>
    <details className="about-legend"><summary>画板颜色与线条</summary><div className="about-court-key" aria-label="画板颜色说明"><span><i className="is-me"/>我方</span><span><i className="is-opponent"/>对手</span><span><i className="is-ball"/>网球</span><span>亮线＝球路 · 虚线＝跑位</span></div><p className="about-note">战术示意不保证得分，场上仍要按实际情况判断。</p></details>
    {previewIdentity&&<details className="about-legend about-build"><summary>测试版本</summary><div className="about-build-identity"><code>{previewIdentity.host} · {previewIdentity.asset}</code></div></details>}
    <div className="about-version-actions">
      <p className="about-version"><VersionBadge showCommit /></p>
      <button className="sheet-done" onClick={()=>setInfo(false)}>知道了</button>
    </div>
  </div></BottomSheet></div>;
}

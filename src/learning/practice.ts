import { getShotDurationForPace, type BoardDocument, type BoardFrame, type BoardMark, type BoardPath, type BoardShotPace, type Point } from "../board/model";
import { fixedSkillById, type FixedSkillId } from "./model";

export type SkillPracticeStage = {
  id: "fixed" | "read" | "compete";
  label: string;
  board: BoardDocument;
  setup: string;
  task: string;
  focus: string;
  pass: string;
  reps: string;
};

export type SkillPracticeGuide = {
  problem: string;
  peek: string;
  setup: [string, string, string];
  sequence: [string, string, string];
  focus: string;
};

export type SkillPracticePlan = { id: FixedSkillId; guide: SkillPracticeGuide; stages: SkillPracticeStage[] };

/** Keep a live demonstration focused on its current beat; preserve the last
 * route only while the deliberately empty "ready for the next ball" frame is shown. */
export function visiblePracticeContextPaths(board: BoardDocument, frameIndex: number): BoardPath[] {
  const finalIndex = board.frames.length - 1;
  if (frameIndex !== finalIndex || board.frames[finalIndex]?.paths.length !== 0) return [];
  return board.frames[finalIndex - 1]?.paths ?? [];
}

type PracticePose = { me: Point; opponent: Point; ball: Point };
type PracticeBeat = {
  label: string;
  ballTo: Point;
  kind: "shot" | "feed";
  pace?: BoardShotPace;
  bend?: number;
  meTo?: Point;
  opponentTo?: Point;
};
type PracticeScene = {
  start: PracticePose;
  beats: PracticeBeat[];
  targets?: Array<{ position: Point; size: Point }>;
  cones?: Point[];
  baskets?: Point[];
};
type StageDefinition = Omit<SkillPracticeStage, "board"> & { scene: PracticeScene };

const PRACTICE_GUIDES: Record<FixedSkillId, SkillPracticeGuide> = {
  "serve-placement": {
    problem: "发球落点不稳定，第一拍容易被动",
    peek: "把发球送进画出的区域",
    setup: ["2人", "一筐球", "1目标区"],
    sequence: ["先说目标", "发球进区", "准备接回球 ×8"],
    focus: "先看发球是否落进目标区",
  },
  "return-depth": {
    problem: "接发太短，对手容易抢先",
    peek: "把接发球送过对方发球线",
    setup: ["2人", "一筐球", "1后场区"],
    sequence: ["搭档发球", "接发打深", "马上回位 ×8"],
    focus: "先看球有没有越过对方发球线",
  },
  "crosscourt-control": {
    problem: "斜线还没稳定，就急着改变方向",
    peek: "连续把斜线送进安全区域",
    setup: ["2人", "6球", "2目标区"],
    sequence: ["斜线送球", "回斜线", "连续完成 ×8"],
    focus: "先让落点稳定，再增加速度",
  },
  "direction-change": {
    problem: "没有站稳就变线，容易失去控制",
    peek: "站稳以后再把球改到另一边",
    setup: ["2人", "8球", "1目标区"],
    sequence: ["先打斜线", "站稳判断", "再变直线 ×6"],
    focus: "变线以前，身体有没有先停稳",
  },
  recovery: {
    problem: "打完球停住，下一拍来不及接",
    peek: "回深中路，准备下一拍",
    setup: ["2人", "一筐球", "2标志碟"],
    sequence: ["交替送左右", "回深中路", "站稳接下一球 ×8"],
    focus: "击球后先迈出回位第一步，准备下一拍",
  },
  "next-ball": {
    problem: "只顾这一拍，下一拍准备太慢",
    peek: "打完第一拍，继续准备下一拍",
    setup: ["2人", "8球", "2标志桶"],
    sequence: ["搭档送短球", "第一拍打深", "分腿后接下一拍 ×8"],
    focus: "对手触球时先分腿，再追下一拍",
  },
};

const point = ([x, y]: Point): Point => [x, y];

function curve(from: Point, to: Point, bend = 0): Point | undefined {
  return bend ? [(from[0] + to[0]) / 2 + bend, (from[1] + to[1]) / 2] : undefined;
}

function copyMark(mark: BoardMark): BoardMark {
  return { ...mark, position: point(mark.position), ...(mark.size ? { size: point(mark.size) } : {}) };
}

function sceneMarks(skillId: FixedSkillId, stageId: SkillPracticeStage["id"], scene: PracticeScene): BoardMark[] {
  return [
    ...(scene.targets ?? []).map((target, index): BoardMark => ({ id: `${skillId}-${stageId}-target-${index + 1}`, kind: "target", position: point(target.position), size: point(target.size) })),
    ...(scene.cones ?? []).map((position, index): BoardMark => ({ id: `${skillId}-${stageId}-cone-${index + 1}`, kind: "cone", position: point(position) })),
    ...(scene.baskets ?? []).map((position, index): BoardMark => ({ id: `${skillId}-${stageId}-basket-${index + 1}`, kind: "basket", position: point(position) })),
  ];
}

function buildPracticeBoard(skillId: FixedSkillId, stageId: SkillPracticeStage["id"], scene: PracticeScene): BoardDocument {
  const skill = fixedSkillById(skillId);
  if (!skill) throw new Error(`找不到练习「${skillId}」`);
  const marks = sceneMarks(skillId, stageId, scene);
  let pose: PracticePose = { me: point(scene.start.me), opponent: point(scene.start.opponent), ball: point(scene.start.ball) };
  const frames: BoardFrame[] = scene.beats.map((beat, index) => {
    const next: PracticePose = { me: point(beat.meTo ?? pose.me), opponent: point(beat.opponentTo ?? pose.opponent), ball: point(beat.ballTo) };
    const control = curve(pose.ball, next.ball, beat.bend);
    const pace = beat.pace ?? "control";
    const ballPath: BoardPath = {
      id: `${skillId}-${stageId}-ball-${index + 1}`,
      kind: beat.kind,
      actorId: "ball",
      from: point(pose.ball),
      to: point(next.ball),
      ...(control ? { control } : {}),
      pace,
    };
    const paths: BoardPath[] = [ballPath];
    if (beat.meTo && (beat.meTo[0] !== pose.me[0] || beat.meTo[1] !== pose.me[1])) paths.push({ id: `${skillId}-${stageId}-me-${index + 1}`, kind: "move", actorId: "me", from: point(pose.me), to: point(next.me) });
    if (beat.opponentTo && (beat.opponentTo[0] !== pose.opponent[0] || beat.opponentTo[1] !== pose.opponent[1])) paths.push({ id: `${skillId}-${stageId}-opponent-${index + 1}`, kind: "move", actorId: "opponent", from: point(pose.opponent), to: point(next.opponent) });
    const frame: BoardFrame = {
      id: `${skillId}-${stageId}-frame-${index + 1}`,
      label: beat.label,
      // The player routes in this frame stay synchronized with the ball, while
      // Control / Drive / Put away obey the same distance-based timing as the editor.
      duration: getShotDurationForPace(ballPath, pace),
      poses: { me: point(pose.me), opponent: point(pose.opponent), ball: point(pose.ball) },
      paths,
      marks: marks.map(copyMark),
    };
    pose = next;
    return frame;
  });
  frames.push({ id: `${skillId}-${stageId}-finish`, label: "准备下一球", duration: .55, poses: { me: point(pose.me), opponent: point(pose.opponent), ball: point(pose.ball) }, paths: [], marks: marks.map(copyMark) });
  return {
    version: 1,
    id: `skill-practice-${skillId}-${stageId}`,
    title: `${skill.label}练习`,
    purpose: "practice",
    drillId: `skill-${skillId}`,
    updatedAt: "2026-09-20T00:00:00.000Z",
    actors: [
      { id: "me", label: "我方", kind: "player", color: "#3e8ad6" },
      { id: "opponent", label: "对手", kind: "player", color: "#dc4151" },
      { id: "ball", label: "网球", kind: "ball", color: "#d8ef72" },
    ],
    frames,
  };
}

const STAGES: Record<FixedSkillId, StageDefinition[]> = {
  "serve-placement": [
    {
      id: "fixed", label: "定点", reps: "每侧 8 球",
      setup: "发球方正常站位；对角发球区放一个大目标，搭档接球。",
      task: "先说出目标，再发球；发完立刻回到下一拍准备位。",
      focus: "落点，不追求最快球速。",
      pass: "8 球进 5 球，再换另一个目标。",
      scene: { start: { me: [.64, 1.07], opponent: [.36, -.05], ball: [.64, 1.04] }, beats: [
        { label: "发向目标", kind: "shot", ballTo: [.28, .36], bend: .06, pace: "drive", meTo: [.55, .91], opponentTo: [.29, .08] },
        { label: "接发回中路", kind: "feed", ballTo: [.55, .8], bend: -.04, pace: "control", meTo: [.57, .88], opponentTo: [.4, .09] },
      ], targets: [{ position: [.28, .36], size: [.26, .17] }], cones: [[.17, .28], [.39, .28]], baskets: [[.9, 1.04]] },
    },
    {
      id: "read", label: "选择", reps: "两区各 6 球",
      setup: "发球区放宽、T 两个目标；搭档每球改变接发站位。",
      task: "抛球前看接发站位，自主选宽角或 T 点。",
      focus: "先看空档，再决定落点。",
      pass: "12 球中 8 球方向选择合理，至少 7 球进区。",
      scene: { start: { me: [.64, 1.07], opponent: [.63, -.04], ball: [.64, 1.04] }, beats: [
        { label: "看站位选目标", kind: "shot", ballTo: [.25, .35], bend: .08, pace: "drive", meTo: [.53, .91] },
        { label: "接发回中路", kind: "feed", ballTo: [.54, .8], bend: -.04, pace: "control", opponentTo: [.47, .08] },
      ], targets: [{ position: [.24, .36], size: [.24, .16] }, { position: [.47, .36], size: [.16, .16] }], cones: [[.14, .28], [.34, .28], [.55, .28]] },
    },
    {
      id: "compete", label: "发球+1", reps: "先赢 5 分",
      setup: "正常发接发；发球进区后继续打完整一分。",
      task: "发球先换来可预判回球，再用下一拍打向空档。",
      focus: "发球落点是否真的帮助了下一拍。",
      pass: "赢下 5 个由发球落点建立优势的分。",
      scene: { start: { me: [.64, 1.07], opponent: [.34, -.05], ball: [.64, 1.04] }, beats: [
        { label: "发球拉开", kind: "shot", ballTo: [.23, .35], bend: .07, pace: "drive", meTo: [.54, .91], opponentTo: [.23, .04] },
        { label: "接发回中", kind: "feed", ballTo: [.55, .78], bend: -.05, pace: "control", opponentTo: [.42, .08] },
        { label: "下一拍打空档", kind: "shot", ballTo: [.78, .18], bend: .04, pace: "drive", meTo: [.58, .82], opponentTo: [.5, .09] },
      ], targets: [{ position: [.23, .35], size: [.22, .16] }, { position: [.76, .17], size: [.28, .2] }] },
    },
  ],
  "return-depth": [
    {
      id: "fixed", label: "定点", reps: "每侧 8 球",
      setup: "搭档从发球位送中速球；后场中路放大目标。",
      task: "接发越过对方发球线，打进后场大区域，再回位。",
      focus: "深度优先，不抢小角度。",
      pass: "8 球中 5 球落进后场区域。",
      scene: { start: { me: [.63, 1.04], opponent: [.37, -.06], ball: [.37, -.04] }, beats: [
        { label: "可控发球", kind: "feed", ballTo: [.72, .75], bend: -.05, pace: "control", meTo: [.69, .88] },
        { label: "接发打深", kind: "shot", ballTo: [.5, .16], bend: -.05, pace: "control", meTo: [.55, .93], opponentTo: [.47, .08] },
      ], targets: [{ position: [.5, .14], size: [.56, .18] }], cones: [[.22, .23], [.78, .23]] },
    },
    {
      id: "read", label: "判断", reps: "随机 12 球",
      setup: "发球方随机发向身体或外角；后场保持一个大目标。",
      task: "先用脚找到击球空间，再把不同来球都送深。",
      focus: "先站稳，再改变拍面方向。",
      pass: "12 球中 8 球过发球线，至少 6 球进目标。",
      scene: { start: { me: [.5, 1.04], opponent: [.63, -.06], ball: [.63, -.04] }, beats: [
        { label: "外角发球", kind: "feed", ballTo: [.22, .75], bend: .05, pace: "drive", meTo: [.25, .87] },
        { label: "深中路接发", kind: "shot", ballTo: [.5, .15], bend: .06, pace: "control", meTo: [.5, .93], opponentTo: [.54, .08] },
      ], targets: [{ position: [.5, .14], size: [.56, .18] }] },
    },
    {
      id: "compete", label: "接发+1", reps: "先赢 5 分",
      setup: "正常发接发；接发进后场后继续打完整一分。",
      task: "用深接发争取回到中立，再根据下一球决定攻守。",
      focus: "接发后是否拿回准备时间。",
      pass: "赢下 5 个先靠深接发进入相持的分。",
      scene: { start: { me: [.65, 1.04], opponent: [.36, -.06], ball: [.36, -.04] }, beats: [
        { label: "发球到身体", kind: "feed", ballTo: [.61, .75], bend: -.03, pace: "drive", meTo: [.61, .88] },
        { label: "接发压深", kind: "shot", ballTo: [.47, .14], bend: -.04, pace: "control", meTo: [.53, .94], opponentTo: [.47, .08] },
        { label: "下一球进相持", kind: "feed", ballTo: [.33, .78], bend: -.03, pace: "drive", meTo: [.43, .92], opponentTo: [.5, .09] },
      ], targets: [{ position: [.5, .14], size: [.52, .17] }] },
    },
  ],
  "crosscourt-control": [
    {
      id: "fixed", label: "合作", reps: "连续 8 球",
      setup: "两人站在同一条对角线；双方后场各放安全目标。",
      task: "合作斜线对拉，留足过网高度，打进斜线大目标，不抢边线。",
      focus: "高度、深度和回位节奏。",
      pass: "连续 8 球不失误，再换另一条对角线。",
      scene: { start: { me: [.74, .96], opponent: [.25, .04], ball: [.25, .08] }, beats: [
        { label: "斜线来球", kind: "feed", ballTo: [.76, .8], bend: -.05, pace: "control", meTo: [.72, .9] },
        { label: "斜线回球", kind: "shot", ballTo: [.24, .18], bend: .06, pace: "control", meTo: [.62, .93], opponentTo: [.28, .1] },
        { label: "继续斜线", kind: "feed", ballTo: [.73, .79], bend: -.05, pace: "control", meTo: [.7, .9], opponentTo: [.38, .09] },
        { label: "回到安全区", kind: "shot", ballTo: [.27, .17], bend: .05, pace: "control", meTo: [.58, .93], opponentTo: [.3, .1] },
      ], targets: [{ position: [.25, .16], size: [.28, .2] }, { position: [.75, .84], size: [.28, .2] }] },
    },
    {
      id: "read", label: "守线", reps: "每边 10 球",
      setup: "仍打斜线；来球偏中时也必须回到斜线大目标。",
      task: "识别球深浅，深球拉高，短球加速，但不轻易变线。",
      focus: "用落点守住对角，不用蛮力。",
      pass: "10 球中 7 球进安全区，最多 2 次误变线。",
      scene: { start: { me: [.72, .95], opponent: [.29, .05], ball: [.29, .08] }, beats: [
        { label: "偏中来球", kind: "feed", ballTo: [.57, .76], bend: -.03, pace: "drive", meTo: [.58, .88] },
        { label: "仍回斜线", kind: "shot", ballTo: [.24, .18], bend: .08, pace: "drive", meTo: [.57, .93], opponentTo: [.27, .1] },
        { label: "再守一拍", kind: "feed", ballTo: [.72, .8], bend: -.05, pace: "control", meTo: [.69, .9], opponentTo: [.39, .09] },
        { label: "拉高回深", kind: "shot", ballTo: [.28, .15], bend: .06, pace: "control", meTo: [.59, .93], opponentTo: [.31, .09] },
      ], targets: [{ position: [.25, .16], size: [.3, .21] }] },
    },
    {
      id: "compete", label: "带分", reps: "先到 7 分",
      setup: "斜线喂球开局；只有短球出现后才可自由变线。",
      task: "先用斜线建立优势，错误变线直接丢分。",
      focus: "知道什么时候继续，什么时候变化。",
      pass: "先到 7 分，并把非受迫失误控制在 3 次内。",
      scene: { start: { me: [.73, .96], opponent: [.27, .05], ball: [.27, .08] }, beats: [
        { label: "斜线开局", kind: "feed", ballTo: [.74, .8], bend: -.05, pace: "control", meTo: [.7, .9] },
        { label: "斜线压深", kind: "shot", ballTo: [.25, .15], bend: .06, pace: "drive", meTo: [.59, .93], opponentTo: [.28, .1] },
        { label: "短球出现", kind: "feed", ballTo: [.64, .65], bend: -.04, pace: "control", meTo: [.62, .75], opponentTo: [.4, .1] },
      ], targets: [{ position: [.25, .16], size: [.3, .2] }] },
    },
  ],
  "direction-change": [
    {
      id: "fixed", label: "定式", reps: "完成 8 组",
      setup: "先接一记斜线来球并回斜线；另一侧后场放一个大目标。",
      task: "下一记来球变短且站稳后，再改直线。",
      focus: "短球、站稳、再变线。",
      pass: "8 组中 5 次变线进目标，且身体保持平衡。",
      scene: { start: { me: [.72, .96], opponent: [.28, .05], ball: [.28, .08] }, beats: [
        { label: "斜线来球", kind: "feed", ballTo: [.72, .79], bend: -.05, pace: "control", meTo: [.69, .9] },
        { label: "先回斜线", kind: "shot", ballTo: [.27, .18], bend: .06, pace: "control", meTo: [.59, .93], opponentTo: [.3, .1] },
        { label: "短球出现", kind: "feed", ballTo: [.66, .64], bend: -.04, pace: "control", meTo: [.64, .72], opponentTo: [.4, .1] },
        { label: "站稳再变线", kind: "shot", ballTo: [.76, .17], bend: -.02, pace: "drive", meTo: [.56, .76], opponentTo: [.52, .1] },
      ], targets: [{ position: [.76, .17], size: [.27, .2] }] },
    },
    {
      id: "read", label: "判断", reps: "随机 12 组",
      setup: "搭档随机送深球或短球；两侧后场各放目标。",
      task: "深球继续斜线，短球且站稳才允许变线。",
      focus: "由来球决定，不预先决定。",
      pass: "12 组中 9 次选择正确，再提高喂球速度。",
      scene: { start: { me: [.72, .96], opponent: [.28, .05], ball: [.28, .08] }, beats: [
        { label: "深球先守斜线", kind: "feed", ballTo: [.73, .83], bend: -.05, pace: "drive", meTo: [.7, .92] },
        { label: "安全回斜线", kind: "shot", ballTo: [.25, .17], bend: .06, pace: "control", meTo: [.59, .94], opponentTo: [.3, .1] },
        { label: "短球再向前", kind: "feed", ballTo: [.64, .61], bend: -.04, pace: "control", meTo: [.63, .7], opponentTo: [.42, .1] },
        { label: "变向空档", kind: "shot", ballTo: [.77, .18], bend: -.02, pace: "drive", meTo: [.56, .74], opponentTo: [.53, .1] },
      ], targets: [{ position: [.25, .16], size: [.27, .19] }, { position: [.76, .17], size: [.27, .19] }] },
    },
    {
      id: "compete", label: "带分", reps: "先到 7 分",
      setup: "斜线开局；短球前变线，对方直接得分。",
      task: "用斜线换来短球，再通过变线完成进攻。",
      focus: "变线是否来自真正的优势球。",
      pass: "先到 7 分，至少 4 分来自正确时机的变线。",
      scene: { start: { me: [.73, .96], opponent: [.28, .05], ball: [.28, .08] }, beats: [
        { label: "斜线建立", kind: "feed", ballTo: [.73, .8], bend: -.05, pace: "control", meTo: [.7, .9] },
        { label: "继续施压", kind: "shot", ballTo: [.24, .15], bend: .06, pace: "drive", meTo: [.59, .93], opponentTo: [.28, .09] },
        { label: "短回球", kind: "feed", ballTo: [.64, .6], bend: -.04, pace: "control", meTo: [.62, .69], opponentTo: [.45, .1] },
        { label: "直线完成", kind: "shot", ballTo: [.78, .15], bend: -.02, pace: "put-away", meTo: [.57, .73], opponentTo: [.55, .1] },
      ], targets: [{ position: [.77, .16], size: [.26, .19] }] },
    },
  ],
  recovery: [
    {
      id: "fixed", label: "脚步", reps: "左右各 8 球",
      setup: "搭档交替送向左右两侧；底线附近放两个准备位标志碟。",
      task: "回高深中路后立刻回位；对手触球时，站在能接下一拍的位置。",
      focus: "击球后先移动，别站在落点看球。",
      pass: "左右各 8 球，每侧至少 6 球能在对手触球前站稳。",
      scene: { start: { me: [.5, .97], opponent: [.45, .06], ball: [.45, .09] }, beats: [
        { label: "右侧来球", kind: "feed", ballTo: [.82, .78], bend: -.04, pace: "drive", meTo: [.78, .87] },
        { label: "回深中路，准备下一拍", kind: "shot", ballTo: [.5, .15], bend: -.06, pace: "control", meTo: [.57, .94], opponentTo: [.5, .1] },
        { label: "左侧来球", kind: "feed", ballTo: [.18, .79], bend: .05, pace: "drive", meTo: [.22, .88], opponentTo: [.45, .1] },
        { label: "再回深中路，准备下一拍", kind: "shot", ballTo: [.5, .15], bend: .06, pace: "control", meTo: [.46, .94], opponentTo: [.5, .1] },
      ], targets: [{ position: [.5, .15], size: [.4, .19] }], cones: [[.45, .94], [.57, .94]] },
    },
    {
      id: "read", label: "定位", reps: "随机 12 球",
      setup: "搭档随机送左右两侧；回位点随自己落点改变。",
      task: "打完先看球的方向，再回到能兼顾两边的位置。",
      focus: "回位不是永远回正中。",
      pass: "12 球中 9 球能在下一次击球前停稳。",
      scene: { start: { me: [.5, .97], opponent: [.45, .06], ball: [.45, .09] }, beats: [
        { label: "宽角来球", kind: "feed", ballTo: [.18, .79], bend: .05, pace: "drive", meTo: [.22, .88] },
        { label: "回深中路", kind: "shot", ballTo: [.5, .15], bend: .06, pace: "control", meTo: [.46, .94], opponentTo: [.5, .1] },
        { label: "下一球到另一侧", kind: "feed", ballTo: [.73, .77], bend: -.04, pace: "drive", meTo: [.69, .88], opponentTo: [.47, .1] },
      ], targets: [{ position: [.5, .15], size: [.4, .19] }], cones: [[.43, .94], [.57, .94]] },
    },
    {
      id: "compete", label: "带分", reps: "先到 7 分",
      setup: "搭档喂第一球到边线，之后开放打分。",
      task: "防守球先换回时间；完成回位后才允许主动进攻。",
      focus: "先活过下一拍，再抢回主动。",
      pass: "先到 7 分；因未回位直接丢分不超过 2 次。",
      scene: { start: { me: [.5, .97], opponent: [.4, .06], ball: [.4, .09] }, beats: [
        { label: "先被拉开", kind: "feed", ballTo: [.82, .8], bend: -.04, pace: "drive", meTo: [.78, .89] },
        { label: "高深争取时间", kind: "shot", ballTo: [.48, .14], bend: -.07, pace: "control", meTo: [.57, .95], opponentTo: [.49, .1] },
        { label: "回位接下一球", kind: "feed", ballTo: [.35, .76], bend: .03, pace: "drive", meTo: [.39, .87], opponentTo: [.52, .1] },
      ], targets: [{ position: [.5, .14], size: [.42, .18] }] },
    },
  ],
  "next-ball": [
    {
      id: "fixed", label: "两拍", reps: "完成 8 组",
      setup: "搭档先送短球，再送一记可控的下一球。",
      task: "第一拍打深并继续向前；对手触球时分腿，再接第二拍。",
      focus: "对手触球时分腿，准备下一拍。",
      pass: "8 组中 6 组两拍都能连上。",
      scene: { start: { me: [.5, .97], opponent: [.42, .07], ball: [.42, .1] }, beats: [
        { label: "短球出现", kind: "feed", ballTo: [.58, .61], bend: -.03, pace: "control", meTo: [.57, .69] },
        { label: "第一拍打深", kind: "shot", ballTo: [.73, .16], bend: .04, pace: "drive", meTo: [.54, .57], opponentTo: [.67, .1] },
        { label: "对手回下一球", kind: "feed", ballTo: [.47, .46], bend: -.03, pace: "control", meTo: [.48, .51], opponentTo: [.55, .12] },
        { label: "接上第二拍", kind: "shot", ballTo: [.3, .18], bend: -.03, pace: "drive", meTo: [.47, .48], opponentTo: [.47, .11] },
      ], targets: [{ position: [.72, .16], size: [.27, .2] }], cones: [[.45, .53], [.6, .53]] },
    },
    {
      id: "read", label: "选择", reps: "随机 10 组",
      setup: "搭档送短球后，随机把下一球回向左右。",
      task: "第一拍后持续看对手；分腿，再追第二拍方向。",
      focus: "不要猜下一拍，先看对手触球。",
      pass: "10 组中 7 组能先分腿再启动。",
      scene: { start: { me: [.5, .97], opponent: [.45, .07], ball: [.45, .1] }, beats: [
        { label: "短球出现", kind: "feed", ballTo: [.38, .61], bend: .03, pace: "control", meTo: [.4, .69] },
        { label: "第一拍压深", kind: "shot", ballTo: [.27, .16], bend: -.04, pace: "drive", meTo: [.47, .56], opponentTo: [.3, .1] },
        { label: "观察下一球", kind: "feed", ballTo: [.68, .45], bend: .04, pace: "drive", meTo: [.64, .5], opponentTo: [.43, .11] },
        { label: "追上第二拍", kind: "shot", ballTo: [.74, .18], bend: .02, pace: "drive", meTo: [.59, .48], opponentTo: [.52, .11] },
      ], targets: [{ position: [.27, .16], size: [.26, .2] }, { position: [.74, .18], size: [.26, .2] }] },
    },
    {
      id: "compete", label: "带分", reps: "先到 7 分",
      setup: "短球喂球开局；第一拍后开放打分。",
      task: "第一拍建立优势，但必须用下一拍完成这一分。",
      focus: "进攻是连续动作，不是一拍结束。",
      pass: "先到 7 分，至少 4 分由第二拍完成。",
      scene: { start: { me: [.5, .97], opponent: [.42, .07], ball: [.42, .1] }, beats: [
        { label: "短球开局", kind: "feed", ballTo: [.58, .6], bend: -.03, pace: "control", meTo: [.56, .68] },
        { label: "第一拍建立优势", kind: "shot", ballTo: [.75, .16], bend: .04, pace: "drive", meTo: [.54, .54], opponentTo: [.69, .1] },
        { label: "逼出防守回球", kind: "feed", ballTo: [.43, .43], bend: -.03, pace: "control", meTo: [.45, .49], opponentTo: [.57, .12] },
        { label: "第二拍完成", kind: "shot", ballTo: [.24, .17], bend: -.03, pace: "put-away", meTo: [.45, .47], opponentTo: [.49, .11] },
      ], targets: [{ position: [.74, .16], size: [.26, .19] }, { position: [.24, .17], size: [.25, .19] }] },
    },
  ],
};

export const SKILL_PRACTICES: SkillPracticePlan[] = Object.entries(STAGES).map(([id, definitions]) => ({
  id: id as FixedSkillId,
  guide: PRACTICE_GUIDES[id as FixedSkillId],
  stages: definitions.map((definition) => ({
    id: definition.id,
    label: definition.label,
    setup: definition.setup,
    task: definition.task,
    focus: definition.focus,
    pass: definition.pass,
    reps: definition.reps,
    board: buildPracticeBoard(id as FixedSkillId, definition.id, definition.scene),
  })),
}));

export function skillPracticeById(skillId: FixedSkillId | undefined) {
  return SKILL_PRACTICES.find((practice) => practice.id === skillId);
}

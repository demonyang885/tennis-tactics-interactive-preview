export type Point = [number, number];

export type Moment = {
  t: number;
  ball: Point;
  me: Point;
  opponent: Point;
  caption: string;
  loft: number;
  ballHeight?: number;
  ballMotion?: {
    kind: "score-bounce";
    direction?: Point;
  };
};

export type Category = "先稳住" | "拉开空档" | "改变节奏" | "把握机会";
export type Level = "入门" | "进阶";

export type Tactic = {
  id: string;
  name: string;
  duration: number;
  frames: Moment[];
  category?: Category;
  level?: Level;
  goal?: string;
  when?: string;
  cue?: string;
  mistake?: string;
  series?: string;
  youth?: boolean;
  excerpt?: boolean;
  previewDecisions?: [string, string, string];
};

export type TacticGuide = {
  why: string;
  recognize: string;
  avoid: string;
  decisions: [string, string, string];
  practice: string;
};

export type TacticExcerpt = {
  fromFrame?: number;
  toFrame?: number;
  name?: string;
  opening?: string;
  ending?: string;
  decisions?: [string, string, string];
};

export type CombinationStage = {
  tacticId: string;
  cue: string;
  transition: string;
  excerpt?: TacticExcerpt;
};

export type CombinationVariant = {
  name: string;
  trigger: string;
  response: string;
  tacticId: string;
  excerpt?: TacticExcerpt;
};

export type Combination = {
  id: string;
  name: string;
  category: Category;
  goal: string;
  when: string;
  series?: string;
  stages: CombinationStage[];
  variants: CombinationVariant[];
};

export type RallyChoice = {
  signal: string;
  action: string;
  nextNodeId: string;
  intent: "稳住" | "进攻" | "变化";
};

export type RallyObservation = {
  ball: string;
  self: string;
  opponent: string;
};

export type RallyScenarioChoice = {
  action: string;
  nextNodeId: string;
  intent: "稳住" | "进攻" | "变化";
  benefit: string;
  caution: string;
  excerpt: TacticExcerpt;
};

export type RallyScenario = {
  prompt: string;
  observation: RallyObservation;
  snapshot: Moment;
  choices: RallyScenarioChoice[];
};

export type RallyNode = {
  id: string;
  tacticId: string;
  excerpt?: TacticExcerpt;
  cue: string;
  prompt: string;
  choices: RallyChoice[];
  scenario?: RallyScenario;
};

export type InteractiveRally = {
  combinationId: string;
  startNodeId: string;
  decisionPractice?: {
    checkpointEvery: number;
  };
};

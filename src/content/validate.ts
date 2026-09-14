import type { Combination, InteractiveRally, RallyNode, Tactic, TacticGuide } from "./types";

const requiredText = ["goal", "when", "cue", "mistake"] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[tennis-content] ${message}`);
}

export function validateTennisLibrary(
  tactics: Tactic[],
  guides: Record<string, TacticGuide>,
  combinations: Combination[],
  rallyNodes: RallyNode[],
  interactiveRallies: InteractiveRally[],
) {
  const tacticIds = new Set<string>();

  for (const tactic of tactics) {
    assert(!tacticIds.has(tactic.id), `duplicate tactic id: ${tactic.id}`);
    tacticIds.add(tactic.id);
    assert(tactic.duration >= 5 && tactic.duration <= 20, `${tactic.id} duration must be 5–20 seconds`);
    assert(tactic.name.trim().length >= 3, `${tactic.id}.name is incomplete`);
    assert(tactic.frames.length >= 3, `${tactic.id} needs at least three animation frames`);
    assert(tactic.frames[0].t === 0, `${tactic.id} must start at t=0`);
    assert(tactic.frames.at(-1)?.t === 1, `${tactic.id} must end at t=1`);

    requiredText.forEach((field) => {
      assert(typeof tactic[field] === "string" && tactic[field]!.trim().length >= 6, `${tactic.id}.${field} is incomplete`);
    });

    tactic.frames.forEach((moment, index) => {
      if (index > 0) assert(moment.t > tactic.frames[index - 1].t, `${tactic.id} frame times must increase`);
      for (const [label, point] of [["ball", moment.ball], ["me", moment.me], ["opponent", moment.opponent]] as const) {
        assert(point.every((value) => value >= 0 && value <= 1), `${tactic.id} ${label} coordinate is outside the court`);
      }
      assert(moment.caption.trim().length >= 6, `${tactic.id} frame ${index + 1} needs a useful caption`);
      if (moment.ballMotion) {
        assert(moment.ballMotion.kind === "score-bounce", `${tactic.id} frame ${index + 1} has an unsupported ball motion`);
        assert(index === tactic.frames.length - 1, `${tactic.id} score bounce must be the final transition`);
        if (moment.ballMotion.direction) {
          const [x, y] = moment.ballMotion.direction;
          assert(Number.isFinite(x) && Number.isFinite(y) && Math.hypot(x, y) > .0001, `${tactic.id} score bounce direction must be finite and non-zero`);
        }
      }
    });

    assert(tactic.frames.filter((moment) => moment.ballMotion?.kind === "score-bounce").length <= 1, `${tactic.id} can only have one score bounce`);

    const guide = guides[tactic.id];
    assert(guide, `${tactic.id} has no tactical guide`);
    assert(guide.decisions.length === 3, `${tactic.id} guide must contain exactly three match decisions`);
    guide.decisions.forEach((decision, index) => {
      assert(decision.trim().length >= 10, `${tactic.id} decision ${index + 1} needs a clear action and signal`);
    });
    assert(guide.why.trim().length >= 16, `${tactic.id} guide needs a clear reason`);
    assert(guide.recognize.trim().length >= 16, `${tactic.id} guide needs a recognizable match signal`);
    assert(guide.avoid.trim().length >= 16, `${tactic.id} guide needs an adjustment condition`);
    assert(guide.practice.trim().length >= 20, `${tactic.id} guide needs a complete partner drill`);
  }

  const combinationIds = new Set<string>();
  for (const combination of combinations) {
    assert(!combinationIds.has(combination.id), `duplicate combination id: ${combination.id}`);
    combinationIds.add(combination.id);
    assert(combination.name.trim().length >= 4, `${combination.id}.name is incomplete`);
    assert(combination.goal.trim().length >= 12, `${combination.id}.goal is incomplete`);
    assert(combination.when.trim().length >= 12, `${combination.id}.when needs a recognizable match signal`);
    assert(combination.stages.length >= 2 && combination.stages.length <= 3, `${combination.id} needs two or three stages`);
    assert(combination.variants.length >= 2, `${combination.id} needs at least two opponent-response variants`);

    combination.stages.forEach((stage, index) => {
      assert(stage.cue.trim().length >= 12, `${combination.id} stage ${index + 1} needs an executable cue`);
      assert(stage.transition.trim().length >= 16, `${combination.id} stage ${index + 1} needs a transition signal`);
    });

    combination.variants.forEach((variant, index) => {
      assert(variant.name.trim().length >= 4, `${combination.id} variant ${index + 1} needs a useful name`);
      assert(variant.trigger.trim().length >= 12, `${combination.id} variant ${index + 1} needs an opponent signal`);
      assert(variant.response.trim().length >= 16, `${combination.id} variant ${index + 1} needs a complete response`);
    });

    [...combination.stages, ...combination.variants].forEach((entry) => {
      assert(tacticIds.has(entry.tacticId), `${combination.id} references missing tactic ${entry.tacticId}`);
      const tactic = tactics.find((item) => item.id === entry.tacticId)!;
      if (entry.excerpt) {
        const from = entry.excerpt.fromFrame ?? 0;
        const to = entry.excerpt.toFrame ?? tactic.frames.length - 1;
        assert(from >= 0 && to < tactic.frames.length && from < to, `${combination.id} has an invalid ${entry.tacticId} excerpt`);
        entry.excerpt.decisions?.forEach((decision, index) => {
          assert(decision.trim().length >= 10, `${combination.id} excerpt decision ${index + 1} is incomplete`);
        });
      }
    });
  }

  const rallyNodeIds = new Set<string>();
  for (const node of rallyNodes) {
    assert(!rallyNodeIds.has(node.id), `duplicate rally node id: ${node.id}`);
    rallyNodeIds.add(node.id);
    assert(tacticIds.has(node.tacticId), `${node.id} references missing tactic ${node.tacticId}`);
    assert(node.cue.trim().length >= 12, `${node.id}.cue needs an executable action`);
    assert(node.prompt.trim().length >= 8, `${node.id}.prompt needs a clear question`);
    assert(node.choices.length >= 2 && node.choices.length <= 3, `${node.id} needs two or three choices`);
    assert(node.choices.some(choice=>choice.intent==="稳住"), `${node.id} needs at least one steady option`);
    node.choices.forEach((choice,index)=>{
      assert(choice.signal.trim().length >= 10, `${node.id} choice ${index+1} needs a visible match signal`);
      assert(choice.action.trim().length >= 4, `${node.id} choice ${index+1} needs a clear action`);
    });
    if(node.scenario){
      const scenario=node.scenario;
      assert(scenario.prompt.trim().length >= 8, `${node.id}.scenario needs a clear decision question`);
      (["ball","self","opponent"] as const).forEach(field=>assert(scenario.observation[field].trim().length >= 6,`${node.id}.scenario.${field} needs a visible fact`));
      for(const [label,point] of [["ball",scenario.snapshot.ball],["me",scenario.snapshot.me],["opponent",scenario.snapshot.opponent]] as const){
        assert(point.every(value=>value>=0&&value<=1),`${node.id}.scenario snapshot ${label} is outside the court`);
      }
      if(scenario.snapshot.ballHeight!==undefined)assert(scenario.snapshot.ballHeight>=0&&scenario.snapshot.ballHeight<=1.5,`${node.id}.scenario snapshot ball height is outside the supported range`);
      assert(scenario.snapshot.caption.trim().length >= 8,`${node.id}.scenario snapshot needs a useful caption`);
      assert(scenario.choices.length >= 2 && scenario.choices.length <= 3,`${node.id}.scenario needs two or three actions`);
      assert(scenario.choices.some(choice=>choice.intent==="稳住"),`${node.id}.scenario needs at least one steady action`);
      const actions=new Set<string>();
      scenario.choices.forEach((choice,index)=>{
        assert(choice.action.trim().length >= 4,`${node.id}.scenario action ${index+1} needs a clear action`);
        assert(!actions.has(choice.action),`${node.id}.scenario has duplicate action ${choice.action}`);
        actions.add(choice.action);
        assert(choice.benefit.trim().length >= 12,`${node.id}.scenario action ${index+1} needs a useful benefit`);
        assert(choice.caution.trim().length >= 12,`${node.id}.scenario action ${index+1} needs a useful caution`);
        assert(Boolean(choice.excerpt),`${node.id}.scenario action ${index+1} needs a focused response excerpt`);
      });
    }
    if(node.excerpt){
      const tactic=tactics.find(item=>item.id===node.tacticId)!;
      const from=node.excerpt.fromFrame??0,to=node.excerpt.toFrame??tactic.frames.length-1;
      assert(from>=0&&to<tactic.frames.length&&from<to,`${node.id} has an invalid tactic excerpt`);
    }
  }
  for (const node of rallyNodes) {
    node.choices.forEach(choice=>assert(rallyNodeIds.has(choice.nextNodeId),`${node.id} points to missing rally node ${choice.nextNodeId}`));
    node.scenario?.choices.forEach(choice=>{
      assert(rallyNodeIds.has(choice.nextNodeId),`${node.id}.scenario points to missing rally node ${choice.nextNodeId}`);
      if(choice.excerpt){
        const destinationNode=rallyNodes.find(item=>item.id===choice.nextNodeId)!;
        const tactic=tactics.find(item=>item.id===destinationNode.tacticId)!;
        const from=choice.excerpt.fromFrame??0,to=choice.excerpt.toFrame??tactic.frames.length-1;
        assert(from>=0&&to<tactic.frames.length&&from<to,`${node.id}.scenario has an invalid ${destinationNode.tacticId} response excerpt`);
      }
    });
  }

  const interactiveCombinationIds=new Set<string>();
  interactiveRallies.forEach(rally=>{
    assert(!interactiveCombinationIds.has(rally.combinationId),`duplicate interactive rally for ${rally.combinationId}`);
    interactiveCombinationIds.add(rally.combinationId);
    assert(combinationIds.has(rally.combinationId),`interactive rally references missing combination ${rally.combinationId}`);
    assert(rallyNodeIds.has(rally.startNodeId),`${rally.combinationId} has missing start node ${rally.startNodeId}`);
    if(rally.decisionPractice){
      assert(rally.decisionPractice.checkpointEvery>=2&&rally.decisionPractice.checkpointEvery<=5,`${rally.combinationId} decision checkpoint must be 2–5 choices`);
      assert(rallyNodes.find(node=>node.id===rally.startNodeId)?.scenario,`${rally.combinationId} decision practice needs a scenario at its start node`);
      let frontier=new Set([rally.startNodeId]);
      for(let decision=1;decision<=rally.decisionPractice.checkpointEvery;decision+=1){
        const next=new Set<string>();
        frontier.forEach(nodeId=>{
          const node=rallyNodes.find(item=>item.id===nodeId)!;
          assert(node.scenario,`${rally.combinationId} decision ${decision} can reach ${nodeId} without a shared scenario`);
          node.scenario.choices.forEach(choice=>next.add(choice.nextNodeId));
        });
        frontier=next;
      }
    }
  });
  combinations.forEach(combination=>assert(interactiveCombinationIds.has(combination.id),`${combination.id} has no interactive rally`));

  const reachable=new Set<string>(), queue=interactiveRallies.map(rally=>rally.startNodeId);
  while(queue.length){const id=queue.shift()!;if(reachable.has(id))continue;reachable.add(id);const node=rallyNodes.find(node=>node.id===id)!;node.choices.forEach(choice=>queue.push(choice.nextNodeId));node.scenario?.choices.forEach(choice=>queue.push(choice.nextNodeId));}
  rallyNodes.forEach(node=>assert(reachable.has(node.id),`${node.id} is unreachable from every combination start`));

  return {
    tactics: tactics.length,
    combinations: combinations.length,
    variants: combinations.reduce((total, combination) => total + combination.variants.length, 0),
    rallyNodes: rallyNodes.length,
  };
}

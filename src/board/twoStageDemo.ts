import { addFrame, createStarterBoard, newBoardId, setPath, setSmartRally, updateFrame, type Point } from './model';

/** A disposable example: opening it never replaces an existing saved board. */
export function createTwoStageDemo() {
  let board = setSmartRally(createStarterBoard('二段跑位试验'));
  const me = board.actors.find(actor => actor.label === '我方')!;
  const opponent = board.actors.find(actor => actor.label === '对手')!;
  const ball = board.actors.find(actor => actor.kind === 'ball')!;
  const route = (index: number, actorId: string, kind: 'shot' | 'move', to: Point) => {
    board = setPath(board, index, { id: newBoardId('path'), actorId, kind, from: board.frames[index].poses[actorId], to });
  };
  route(0, ball.id, 'shot', [.72, .22]);
  route(0, me.id, 'move', [.5, .82]);
  route(0, opponent.id, 'move', [.72, .22]);
  board = updateFrame(board, 0, { label: '第一段 · 击球后提前回位', duration: 2.8 });
  board = addFrame(board, 0);
  route(1, ball.id, 'shot', [.24, .64]);
  route(1, me.id, 'move', [.24, .64]);
  route(1, opponent.id, 'move', [.5, .12]);
  board = updateFrame(board, 1, { label: '第二段 · 对手回球后接球', duration: 2.8 });
  board = addFrame(board, 1);
  return setSmartRally({ ...board, purpose: 'practice' }, {
    version: 2, frameId: board.frames[2].id, phase: 'shot', hitterId: me.id, actorId: ball.id,
  });
}

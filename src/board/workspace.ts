import type {BoardDocument} from './model';
export type WorkspaceView='serve'|'receive';
export const WORKSPACE_KEY='rallypath:workspace-views:v1';
type WorkspacePreferences={active:WorkspaceView;serve?:string;receive?:string};
export function readWorkspacePreferences():WorkspacePreferences|null {
  try {const value=JSON.parse(localStorage.getItem(WORKSPACE_KEY)??'null');
    if(!value||!['serve','receive'].includes(value.active))return null;
    return {active:value.active,...typeof value.serve==='string'&&{serve:value.serve},...typeof value.receive==='string'&&{receive:value.receive}};
  }catch{return null;}
}
/** Store document references only; the existing board store still owns all content. */
export function rememberWorkspaceView(view:WorkspaceView,board?:BoardDocument) {
  try {localStorage.setItem(WORKSPACE_KEY,JSON.stringify({...readWorkspacePreferences(),active:view,...board&&{[view]:board.id}}));return true;}catch{return false;}
}
export function hapticTap(){try{navigator.vibrate?.(10);}catch{/* Unsupported and restricted browsers keep the same interaction. */}}

import type { Agent, Item } from "./rules";
import type { Encounter, Participant } from "./model";
import { effectiveAttributes } from "./rules";
export type ActionCost="standard"|"move"|"free"|"full";
export type GrantKind="standard"|"move"|"attack"|"free";
export const actionLabels:Record<ActionCost,string>={standard:"Padrão",move:"Movimento",free:"Livre",full:"Completa"};
export type CombatRule={itemId:string;name:string;action:ActionCost;pe:number;effect:"heal"|"grant";formula?:string;grant?:GrantKind;target:"self"|"ally"|"any";timing:"now"|"next";limit:"turn"|"round"|"scene";consume:boolean;medicine:boolean;difficulty:number;noRitual:boolean;note:string};
export type Budget={key:string;standard:number;move:number;restricted:number;attack:number;spentPe:number;attacked:boolean;ended:boolean};
export type CombatEffect={id:string;sourceId:string;targetId:string;name:string;grant:GrantKind;noRitual:boolean;timing:"now"|"next"|"sustained";createdKey:string;appliedKey?:string;upkeepKey?:string};
export type CombatEvent={id:string;actorId:string;actor:string;targetIds:string[];label:string;text:string;round:number;secret:boolean;createdAt:string;rolls:{label:string;expression:string;dice:number[];total:number}[];pending?:"damage"|"interpretation";proposedDamage?:number;resolved?:boolean};
export type CombatLedger={budgets:Record<string,Budget>;uses:Record<string,string>;effects:CombatEffect[];events:CombatEvent[];stabilized:Record<string,number>};
export type CombatCommand={kind:"use"|"end"|"sustain"|"stopEffect"|"resolve";optionId?:string;targetIds?:string[];variant?:"base"|"discente";boost?:number;extraAttack?:boolean;accelerate?:boolean;grant?:GrantKind;eventId?:string;amount?:number;note?:string};
export type CombatOption={id:string;name:string;action:ActionCost;pe:number;item?:Item;effect:"attack"|"firstAid"|"heal"|"grant"|"ritual"|"generic"|"move"|"free";target:"self"|"ally"|"any"|"none";formula?:string;grant?:GrantKind;noRitual?:boolean;timing?:"now"|"next"|"sustained";limit?:"turn"|"round"|"scene";consume?:boolean;medicine?:boolean;difficulty?:number;description:string;rule?:CombatRule};
export const normalizeCombatName=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
const minimumNex:Record<string,number>={"paramedico":10,"surto de adrenalina":65,"estrategista":40,"oficial comandante":99,"ataque extra":40,"acelerar ritual":40,"iniciativa aprimorada":10,"sempre alerta":99};
function eligible(a:Agent,i:Item){return i.quantity>0 && Math.max(i.nex||0, i.kind==="Poder"?(minimumNex[normalizeCombatName(i.name)]||0):0)<=a.nex;}
export function hasPower(a:Agent,name:string){return a.inventory.some(i=>i.kind==="Poder"&&normalizeCombatName(i.name)===normalizeCombatName(name)&&eligible(a,i));}
export function hasMedicineKit(a:Agent){return a.inventory.some(i=>i.quantity>0&&i.kind==="Item"&&/kit/.test(normalizeCombatName(i.name))&&/medic/.test(normalizeCombatName(i.name+" "+i.notes)));}
export function combatFace(a:Agent,p:Pick<Participant,"face">):Agent{if(p.face!=="alternate")return a;if(!a.alternate||a.alternate.approvedCampaignId!==a.campaign_id)throw Error("Face alternativa não autorizada.");return {...a,...a.alternate.face};}
export function turnKey(e:Pick<Encounter,"round"|"turnSerial"|"turn"|"participants">){return `${e.round}:${e.participants[e.turn]?.id||""}:${e.turnSerial||0}`;}
export function emptyLedger():CombatLedger{return{budgets:{},uses:{},effects:[],events:[],stabilized:{}};}
export function budgetFor(e:Encounter,p:Participant,a?:Agent):Budget{
 const key=turnKey(e),old=e.combat?.budgets[p.id];const b:Budget=old?.key===key?{...old}:{key,standard:1,move:1,restricted:0,attack:0,spentPe:0,attacked:false,ended:false};
 if(old?.key!==key&&a&&e.round===1){if(hasPower(a,"Iniciativa Aprimorada"))b.move++;if(hasPower(a,"Sempre Alerta"))b.standard++;}
 for(const effect of e.combat?.effects||[]){if(effect.targetId!==p.id||effect.appliedKey===key||(effect.timing==="next"&&effect.createdKey===key))continue;if(effect.grant==="standard")b[effect.noRitual?"restricted":"standard"]++;if(effect.grant==="move")b.move++;if(effect.grant==="attack")b.attack++;}
 return b;
}
export function actionAvailable(b:Budget,cost:ActionCost,ritual=false,attack=false){if(b.ended)return false;const s=b.standard+(ritual?0:b.restricted);return cost==="free"|| (cost==="move"?b.move+s>0:cost==="full"?s>0&&b.move>0:s>0||(attack&&b.attack>0));}
export function executionCost(text=""):ActionCost|null{const n=normalizeCombatName(text);return /completa/.test(n)?"full":/padrao/.test(n)?"standard":/movimento/.test(n)?"move":/livre/.test(n)?"free":null;}
export function combatOptions(a:Agent,rules:Record<string,CombatRule>={}):CombatOption[]{
 const unarmed:Item={id:"unarmed",name:"Ataque desarmado",kind:"Arma",quantity:1,spaces:0,damage:hasPower(a,"Artista Marcial")?a.nex>=70?"1d10":a.nex>=35?"1d8":"1d6":"1d3",attackSkill:"Luta",weaponType:"Corpo a corpo",critical:"20/x2",notes:"Normalmente causa dano não letal. Artista Marcial permite dano letal e usa as regras de arma ágil."};
 const options:CombatOption[]=[
 {id:"unarmed",name:unarmed.name,item:unarmed,action:"standard",pe:0,effect:"attack",target:"any",description:unarmed.notes},
 {id:"move",name:"Deslocar / interagir",action:"move",pe:0,effect:"move",target:"none",description:"Uma ação de movimento. O mestre acompanha distância e posicionamento."},
 {id:"free",name:"Falar / ação livre",action:"free",pe:0,effect:"free",target:"none",description:"Ações livres não têm uma cota fixa. Limites específicos continuam valendo."},
 {id:"firstAid",name:"Primeiros socorros",action:"standard",pe:0,effect:"firstAid",target:"ally",description:`Medicina (INT), DT 20 + 5 por estabilização nesta cena. Retira morrendo e inconsciente e deixa com 1 PV. ${hasMedicineKit(a)?"Kit de Medicina disponível.":"Sem kit: −5 no teste."}`}];
 for(const item of a.inventory){if(!eligible(a,item))continue;const name=normalizeCombatName(item.name),custom=rules[item.id],base={id:item.id,name:item.name,item,pe:item.cost||0,description:item.notes};
 if(custom?.itemId===item.id){options.push({...base,...custom,id:item.id,rule:custom,description:custom.note||item.notes});continue;}
 if(item.kind==="Arma"){options.push({...base,action:"standard",effect:"attack",target:"any"});continue;}
 if(item.kind==="Item"&&name==="cicatrizante"){options.push({...base,action:"standard",effect:"heal",target:"any",formula:"2d8+2",consume:true,pe:0});continue;}
 if(item.kind==="Poder"&&name==="paramedico"){if(hasMedicineKit(a))options.push({...base,action:"standard",effect:"heal",target:"ally",formula:"2d10",pe:2});continue;}
 if(item.kind==="Poder"&&name==="surto temporal"){options.push({...base,action:"free",effect:"grant",target:"self",grant:"standard",timing:"now",pe:3,limit:item.attuned&&a.nex>=50?"turn":"scene"});continue;}
 if(item.kind==="Poder"&&name==="surto de adrenalina"){options.push({...base,action:"free",effect:"grant",target:"self",grant:"standard",timing:"now",pe:5,limit:"round"});continue;}
 if(item.kind==="Poder"&&(name==="estrategista"||name==="oficial comandante")){options.push({...base,action:"standard",effect:"grant",target:"ally",grant:name==="estrategista"?"move":"standard",timing:"next",pe:name==="estrategista"?1:5});continue;}
 if(item.kind==="Ritual"){const action=executionCost(item.execution);if(!action)continue;options.push({...base,action,target:normalizeCombatName(item.target||"")==="voce"?"self":"any",effect:name==="cicatrizacao"?"heal":name==="velocidade mortal"?"grant":"ritual",...(name==="cicatrizacao"?{pe:1,formula:"3d8+3"}:{}),...(name==="velocidade mortal"?{pe:3,grant:"move" as const,timing:"sustained" as const,noRitual:true}:{})});continue;}
 const action=executionCost(item.execution||item.notes.match(/(?:gastar|usar|gaste|use) (?:uma )?ação (padrão|de movimento|livre|completa)/i)?.[0]);if(action)options.push({...base,action,effect:"generic",target:"any"});
 }return options;
}
export function effortLimit(a:Agent){return(a.className==="Sobrevivente"?a.stage:a.nex===99?20:Math.max(1,Math.floor(a.nex/5)))+(hasPower(a,"Potencial Aprimorado")?1:0);}
export function medicBoostLimit(a:Agent){return[40,65,99].filter(n=>a.nex>=n).length;}
export function maxTargets(o:CombatOption,a:Agent){return normalizeCombatName(o.name)==="estrategista"?Math.max(1,effectiveAttributes(a).INT):normalizeCombatName(o.name)==="oficial comandante"?100:1;}

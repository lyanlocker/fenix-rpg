import raw from './data/book-catalog.json';
import options from './data/character-options.json';
import type {Agent,Item} from './rules';
import {normalize} from './catalog';
export type CharacterOption=Item & {subtype:'Origem'|'Trilha';skillsText?:string;grantName?:string;grantNotes?:string};
export const bookCatalog=raw as Item[];
export const characterOptions=options as CharacterOption[];
export const bookNames:Record<string,string>={'01':'Livro de Regras v1.3','07':'Sobrevivendo ao Horror','03':'EaF — Biblioteca Ritualística 0.7.5','05':'EaF — Arsenal dos Agentes 0.91','04':'Arquivos Secretos #7 v1.1','06':'Arquivos Secretos #6 v1.0'};
export function selectedOption(a:Agent,type:'Origem'|'Trilha') {
 const id=type==='Origem'?a.originId:a.trackId,name=type==='Origem'?a.origin:a.track;
 return characterOptions.find(o=>id?o.id===id:o.subtype===type&&o.name===name&&(!o.className||o.className===a.className));
}
export function trailPowers(o:CharacterOption) {return bookCatalog.filter(i=>i.subtype==='Habilidade de trilha'&&i.bookId===o.bookId&&i.track===o.name&&(!i.className||i.className===o.className)).sort((a,b)=>(a.nex||a.stage||0)-(b.nex||b.stage||0));}
export function originSkillsFor(a:Agent):string[] {const text=selectedOption(a,'Origem')?.skillsText||'';return /\bou\b|escolha|quaisquer/i.test(text)?[]:text.split(/\s+e\s+|,\s*/).map(s=>s.trim()).filter(Boolean);}
export function benefitsFor(a:Agent):Item[] {
 const origin=selectedOption(a,'Origem'),trail=selectedOption(a,'Trilha'),list:Item[]=[];
 if(origin)list.push({...origin,id:origin.id+'-power',name:origin.grantName||'Origem: '+origin.name,subtype:'Poder de origem',notes:origin.grantNotes||origin.notes});
 const base=a.className==='Combatente'?['Ataque Especial']:a.className==='Especialista'?['Eclético','Perito']:a.className==='Ocultista'?['Escolhido pelo Outro Lado']:[];
 list.push(...bookCatalog.filter(i=>i.bookId==='01'&&i.className===a.className&&base.includes(i.name)));
 if(trail)list.push(...trailPowers(trail).filter(i=>a.className==='Sobrevivente'?(i.stage||2)<=a.stage:(i.nex||10)<=a.nex));
 return list;
}
export function addBenefits(a:Agent):Agent {return {...a,inventory:[...a.inventory,...benefitsFor(a).filter(i=>!a.inventory.some(o=>o.catalogId===i.id||(normalize(o.name)===normalize(i.name)&&o.source===i.source))).map(i=>({...i,catalogId:i.id,id:crypto.randomUUID()}))]};}

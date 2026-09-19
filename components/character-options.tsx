'use client';
import {useState} from 'react';
import {bookNames,characterOptions,selectedOption,trailPowers,benefitsFor,addBenefits} from '@/lib/books';
import type {Agent} from '@/lib/rules';
import {normalize} from '@/lib/catalog';
export default function CharacterOptions({agent:a,onChange,editing=false}:{agent:Agent;onChange:(a:Agent)=>void;editing?:boolean}) {
 const [source,setSource]=useState(''),[search,setSearch]=useState(''),[applied,setApplied]=useState(false);
 return <div className="character-choices span-all"><div className="form-grid">
 <label>Buscar origem ou trilha<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nome da opção…"/></label>
 <label>Livro das opções<select value={source} onChange={e=>setSource(e.target.value)}><option value="">Todos os livros</option>{Object.entries(bookNames).filter(([id])=>id!=='03').map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label></div>
 <div className="form-grid">{(['Origem','Trilha'] as const).map(type=>{
 const selected=selectedOption(a,type),name=type==='Origem'?a.origin:a.track;
 const available=characterOptions.filter(o=>o.subtype===type&&(!o.className||o.className===a.className)&&(!source||o.bookId===source)&&normalize(o.name).includes(normalize(search)));
 if(selected&&!available.some(o=>o.id===selected.id))available.unshift(selected);
 return <div key={type}><label>{type}<select aria-label={type} value={selected?.id||(name?'custom':'')} onChange={e=>{const o=characterOptions.find(o=>o.id===e.target.value);setApplied(false);onChange(type==='Origem'?{...a,origin:o?.name||'',originId:o?.id}:{...a,track:o?.name||'',trackId:o?.id});}}><option value="">{type==='Origem'?'Selecione uma origem':'Escolher depois'}</option>{name&&!selected&&<option value="custom">{name} (personalizada)</option>}{Object.entries(bookNames).map(([id,title])=><optgroup key={id} label={title}>{available.filter(o=>o.bookId===id).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')).map(o=><option key={o.id} value={o.id}>{o.name}{o.className?' · '+o.className:''}</option>)}</optgroup>)}</select></label>
 <details className="custom-choice"><summary>{type} personalizada</summary><input aria-label={type+' personalizada'} value={selected?'':name} placeholder="Nome escolhido com o mestre" maxLength={100} onChange={e=>onChange(type==='Origem'?{...a,origin:e.target.value,originId:undefined}:{...a,track:e.target.value,trackId:undefined})}/></details>
 {selected&&<div className="choice-description"><strong>{selected.name}</strong><p className="hint">{selected.source} · PDF p. {selected.page}</p><p className="prose">{selected.notes}</p>{type==='Trilha'&&trailPowers(selected).map(i=><details key={i.id}><summary>{i.nex?'NEX '+i.nex+'% · ':i.stage?'Estágio '+i.stage+' · ':''}{i.name}</summary><p className="prose">{i.notes}</p></details>)}</div>}</div>;
 })}</div><div className="help"><strong>Poderes da ficha</strong><p>{benefitsFor(a).map(i=>i.name).join(' · ')||'Escolha a origem e a classe para consultar os benefícios.'}</p>{editing?<><button type="button" onClick={()=>{onChange(addBenefits(a));setApplied(true);}}>Adicionar benefícios disponíveis em Poderes</button>{applied&&<p role="status">Benefícios adicionados. Salve a ficha para confirmar.</p>}</>:<p>Os benefícios acima serão registrados em Poderes ao criar a ficha.</p>}<small>Escolhas de perícias, rituais, variantes e bônus condicionais são ajustadas na ficha conforme a descrição. Adicionar benefícios não remove poderes existentes.</small></div></div>;
}

"""Extract threat statistics from the user's local source PDFs (not distributed)."""
import fitz, re, json, unicodedata, argparse
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('sources',type=Path);a=p.parse_args()
base={192:'Aberração de Carne',196:'Aniquilação',198:'Carente',200:'Dama de Sangue',203:'Enpap-X',204:'Kerberos',207:'Minotauro',209:'Mulher Afogada',211:'Titã de Sangue',212:'Zumbi de Sangue',213:'Zumbi de Sangue Bestial',216:'O Diabo',219:'Aracnasita',221:'Carniçal Preto da Morte',223:'Ceifador Espiral',224:'Enraizado',226:'Escutado',227:'Esqueleto de Lodo',229:'Marionete',231:'Múmia Xipófaga',234:'Nidere',236:'Sempiternal',237:'Succ',240:'O Deus da Morte',244:'Anjo',247:'Bicho-Papão',248:'Espreitador',251:'Estrangeiro',252:'Existido',253:'Lembrado',254:'Ocioso',256:'Parasita de Culpa',258:'Rastejador Sombrio',260:'Silhueta',261:'Vulto',264:'Máscara do Desespero',267:'Anárquico',269:'Anárquico Descontrolado',273:'Anomiático',275:'Ciborgue',277:'Infecticídio',278:'Perturbado de Energia',279:'Sukkalgir',281:'Telopsia',283:'Tempestuoso',284:'Viajante',288:'O Anfitrião',292:'Degolificada'}
soh={128:'Sepultado',130:'Mescla',134:'Espectro Inesquecido',136:'O Uivar',138:'Derretido',141:'Melancolia',144:'Quibungo',148:'Profundo',150:'Memento Mori',152:'Rascunho',154:'Medusa',157:'Amigo Imaginário',219:'O Terminal'}
as6={28:'Alice Cruzes',33:'Ketan Arjuna',37:'Laila Verdante',41:'Dr. Neruda',56:'Cientista da Panacea',57:'Manda-Chuva da Panacea',58:'Segurança da Panacea',60:'Hikikomori',61:'Marca-Passo',62:'Estímulo',63:'Experimento Ssabáka'}
as7={40:'Raziel',41:'O Verdadeiro Raziel',42:'Alvira',43:'Sabara',44:'Velisar',45:'Zéfero',65:'Incinerado',67:'Strzyga',70:'Apóstata'}
elements=['Sangue','Morte','Conhecimento','Energia','Medo']
D=r'(?<!\w)(?:[–−-]?\d*)O(?!\w)(?:\s*[+]\s*\d+)?'
def clean(t):
 t=re.sub(r'(?m)^.*[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}.*$','',t)
 t=re.sub(r'(?<=\w)-\n(?=[a-záàãâéêíóôõúç])','',t)
 # Only dice glyphs at token boundaries; uppercase O inside words is ordinary text.
 t=re.sub(r'(?<!\w)(\d+)O(?!\w)',lambda m:m[1]+'d20',t)
 t=re.sub(r'(?<!\w)O(?=\s*\+\s*\d)', '1d20', t)
 t=re.sub(r'(\b(?:PERCEPÇÃO|INICIATIVA|FORTITUDE|REFLEXOS|VONTADE|TESTE)\s+)O(?!\w)',lambda m:m[1]+'1d20',t,flags=re.I)
 t=re.sub(r'(?m)^\s*O\s*$', '1d20', t)
 for old,new in [('',' · '),('',' — '),('',' — '),('',' alcance '),('',' quadrados')]:t=t.replace(old,new)
 return re.sub(r'[\ue000-\uf8ff]','',t).strip()
def slug(s):return re.sub(r'[^a-z0-9]+','-',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower()).strip('-')
def extract(t,name,book,page,offset,override=None):
 def number(p):
  m=re.search(p,t,re.I);return int(m[1].replace('.', '')) if m else None
 pv=number(r'(?:PONTOS DE VIDA|\bPV)\s+(\d[\d.]*)');defense=number(r'DEFESA\s+(\d+)')
 if pv is None or defense is None:return None
 attr={k:int(v) for k,v in re.findall(r'\b(AGI|FOR|INT|PRE|VIG)\s+(\d+)',t)}
 grouped=re.search(r'PERCEPÇÃO\s+INICIATIVA\s+('+D+r')\s+('+D+')',t,re.I)
 initiative=grouped[2] if grouped else (re.search(r'INICIATIVA\s+('+D+')',t,re.I)[1] if re.search(r'INICIATIVA\s+('+D+')',t,re.I) else '')
 tests={}
 grouped=re.search(r'FORTITUDE\s+REFLEXOS\s+VONTADE\s+('+D+r')\s+('+D+r')\s+('+D+')',t,re.I)
 for ix,key in enumerate(['Fortitude','Reflexos','Vontade']):
  m=re.search(key+r'\s+('+D+')',t,re.I);tests[key]=clean(grouped[ix+1] if grouped else m[1] if m else 'Veja a referência')
 primary='Realidade';secondary=[]
 if 'PRESENÇA PERTURBADORA' in t:
  head=t[:t.find('PRESENÇA PERTURBADORA')]
  # The stat header is at the end of this prefix; lore may precede it.
  matches=list(re.finditer(r'(?m)^\s*(SANGUE|MORTE|CONHECIMENTO|ENERGIA|MEDO)\b',head))
  if matches:
   segment=head[matches[-1].start():] if len(matches)==1 else head[matches[0].start():]
   found=re.findall(r'\b(SANGUE|MORTE|CONHECIMENTO|ENERGIA|MEDO)\b',segment)
   if found:primary=found[0].capitalize();secondary=list(dict.fromkeys(x.capitalize() for x in found[1:]))
 if override:primary=override
 kind='Pessoa' if re.search(r'PESSOA\s*[\uf077·]',t) else 'Animal' if re.search(r'ANIMAL\b',t) else 'Criatura'
 if kind!='Criatura':primary='Realidade';secondary=[]
 attacks=[]
 for m in re.finditer(r'(?:TESTE|Teste)\s+('+D+r')[^\n]*\s*(?:\|\s*)?(?:DANO|Dano)\s+(\d+d\d+(?:\s*[+]\s*\d+)?)',t):
  prefix=t[max(0,m.start()-150):m.start()].splitlines()
  label=next((x.strip() for x in reversed(prefix) if re.search(r'corpo a corpo|distância|Distância|Distância|Distancia|DISTÂNCIA',x,re.I)), 'Ataque')
  attacks.append({'name':clean(label),'test':clean(m[1]).replace(' ',''),'damage':m[2].replace(' ','')})
 vd=number(r'\bVD\s*(\d+)')
 if book=='01' and name=='O Anfitrião':vd=400
 return {'id':book+'-'+slug(name),'name':name,'element':primary,'secondaryElements':secondary,'kind':kind,'vd':vd,'pv':pv,'defense':defense,'initiative':clean(initiative).replace(' ',''),'attributes':attr,'tests':tests,'attacks':attacks,'details':clean(t),'bookId':book,'page':page-offset,'pdfPage':page}
entries=[]
for prefix,book,offset,mapping,realRange in [('livro','01',10,base,(294,299)),('sobrevivendo','07',1,soh,(159,166)),('Arquivos-Secretos-06','06',0,as6,None),('Arquivos-Secretos-07','04',0,as7,None)]:
 f=next(f for f in a.sources.rglob('*.pdf') if f.name.startswith(prefix));doc=fitz.open(f)
 for page,name in mapping.items():
  t=doc[page-1].get_text()
  # Retain continuation actions and the special transformation rules.
  if name in ['Apóstata']:t+='\n'+doc[page].get_text()+'\n'+doc[page+1].get_text()
  if name in ['Degolificada','Profundo','Amigo Imaginário']:t+='\n'+doc[page].get_text()
  e=extract(t,name,book,page,offset,{'O Diabo':'Sangue','O Deus da Morte':'Morte','Máscara do Desespero':'Conhecimento','O Anfitrião':'Energia','Degolificada':'Medo'}.get(name))
  if e:entries.append(e)
 if realRange:
  texts=[doc[i-1].get_text() for i in range(realRange[0],realRange[1]+1)];t='\n'.join(texts)
  headers=list(re.finditer(r'(?m)^([A-ZÀ-Ý][A-ZÀ-Ý0-9 \-—]+)\s*\t?\s*\n?VD\s+(\d+)',t))
  for i,m in enumerate(headers):
   end=headers[i+1].start() if i+1<len(headers) else len(t)
   name=m[1].strip().title();pos=m.start();page=realRange[0]
   if name=='De Aluguel':name='Soldado de Aluguel'
   if name=='De Elite':name='Policial de Elite'
   for text in texts:
    if pos<len(text)+1:break
    pos-=len(text)+1;page+=1
   e=extract(t[m.start():end],name,book,page,offset)
   if e:entries.append(e)
 # Anomalia uses a narrative encounter, without ordinary numeric combat statistics.
 if book=='01':
  t=doc[269].get_text()+'\n'+doc[270].get_text()
  entries.append({'id':'01-anomalia','name':'Anomalia','element':'Energia','secondaryElements':[],'kind':'Manifestação','vd':None,'pv':None,'defense':None,'initiative':'','attributes':{},'tests':{},'attacks':[],'details':clean(t),'bookId':book,'page':260,'pdfPage':270})
# Additional user-supplied homebrew supplement uses repeated headings and fixed-value annotations.
f=next((f for f in a.sources.rglob('*.pdf') if f.name.startswith('EaF - Guia')),None)
if f:
 doc=fitz.open(f)
 mapping={20:('Duoguinho','Sangue'),21:('Quibinho','Sangue'),23:('Enpapinha-Y','Sangue'),25:('Lobohni','Morte'),28:('Carniçalzinho Cinza do Mal-Estar','Morte'),29:('Succnho','Morte'),31:('Herdeiro Hipotético','Morte'),33:('Querubim','Conhecimento'),36:('Bicho-Papinho','Conhecimento'),38:('Espreitadinho','Conhecimento'),39:('Bate-Volta','Energia'),41:('Sukita','Energia'),43:('Tel-Alpha','Energia'),46:('Degolificadinha','Medo'),102:('Manifestação Inconclusiva','Conhecimento'),104:('Carcaça Quebrada','Energia'),105:('Fofoqueiro','Energia'),106:('Carrapacto','Morte'),108:('Lodinho','Morte'),124:('Explorador Espacial','Morte'),148:('Cavaleiro de Geena','Realidade'),155:('Dragão Amalgamado','Sangue'),162:('Núcleo de Vida','Sangue')}
 for page,(name,element) in mapping.items():
  t=doc[page-1].get_text()
  e=extract(t,name,'02',page,0,element)
  if not e:continue
  senses=t[t.find('INICIATIVA')+len('INICIATIVA'):];senses=senses[:senses.find('FORTITUDE')]
  values=re.findall(D,senses)
  if len(values)>=2:e['initiative']=clean(values[1]).replace(' ','')
  start=t.find('VONTADE')+len('VONTADE');values=re.findall(D,t[start:])[:3]
  if len(values)==3:e['tests']={key:clean(v).replace(' ','') for key,v in zip(['Fortitude','Reflexos','Vontade'],values)}
  e['secondaryElements']=[x for x in elements if x!=element and re.search(r'(?m)^\s*'+x.upper()+r'\b',t)]
  if name=='Cavaleiro de Geena':e['kind']='Pessoa';e['secondaryElements']=[]
  attr=re.search(r'((?:(?:AGI|FOR|INT|PRE|VIG)\s*){5})((?:\d+\s*){5})',t)
  if attr:e['attributes']=dict(zip(re.findall(r'AGI|FOR|INT|PRE|VIG',attr[1]),map(int,re.findall(r'\d+',attr[2]))))
  for ix,attack in enumerate(e['attacks']):
   if attack['name']=='Ataque':attack['name']='Ataque '+str(ix+1)
  entries.append(e)
entries.sort(key=lambda e:(e['element'],e['name']))
out=Path(__file__).resolve().parents[1]/'lib/data/threat-catalog.json';out.write_text(json.dumps(entries,ensure_ascii=False,indent=2)+'\n')
print('Threats:',len(entries))
for e in entries:print(e['bookId'],e['name'],e['element'],'VD',e['vd'],'PV',e['pv'],'Def',e['defense'],'Init',e['initiative'],len(e['attacks']))

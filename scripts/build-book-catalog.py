"""Build versioned player catalog from supplied PDFs. No image/watermark export."""
import fitz,json,re,pathlib,hashlib,unicodedata,collections
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/'fenix/lib/data'
SOURCES={'01':'Livro de Regras v1.3','02':'EaF — Guia das Marcas 0.6.7','03':'EaF — Biblioteca Ritualística 0.7.5','04':'Arquivos Secretos #7 v1.1','05':'EaF — Arsenal dos Agentes 0.91','06':'Arquivos Secretos #6 v1.0','07':'Sobrevivendo ao Horror'}
def norm(t):return re.sub('[^a-z0-9]','',unicodedata.normalize('NFD',t.lower()).encode('ascii','ignore').decode())
def clean(t):
 t=t.replace('\xad','').replace('\ufb01','fi').replace('\ufb02','fl');t=re.sub(r'(\w)-\s*\n\s*([a-záéíóúãõç])',r'\1\2',t);t=re.sub(r'\s+',' ',t).strip()
 return re.sub(r'\b([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9 !?,’–-]{2,100}[.:])\s+\1',r'\1',t)
def nice(t):return t if not t.isupper() or t=='T.I.' else ' '.join(w.lower() if w.lower() in ['de','da','do','das','dos','e','em','a','o'] else w.capitalize() for w in t.split())
ALL={}
for key in SOURCES:
 result=[]
 with fitz.open(next((ROOT/'project_sources').glob(key+'-*'))) as doc:
  for n,p in enumerate(doc,1):
   ls=[];seen=set()
   for b in p.get_text('dict',flags=fitz.TEXTFLAGS_TEXT)['blocks']:
    for l in b.get('lines',[]):
     ss=l['spans'];t=''.join(s['text'] for s in ss).strip();x,y,_,bottom=l['bbox'];size=max(s['size'] for s in ss)
     if not t or '@' in t or re.fullmatch(r'\d+',t) or 'CAPÍTULO' in t or 'Nome Apoiador' in t or y<25 or y>p.rect.height-40:continue
     if key in ['03','05'] and (size<11 or 'WideNoise' in ss[0]['font']):continue
     sig=(t,round(x),round(y))
     if sig in seen:continue
     seen.add(sig)
     head=any('Drukarnia' in s['font'] or 'DaisyWheel' in s['font'] and s['size']>=(14 if key=='01' and 158<=n<=162 else 19) or 'BurnetGothic' in s['font'] or 'Keyes' in s['font'] and 14<=s['size']<=17 for s in ss)
     col=0 if key=='03' or key=='05' and n>=250 else int(x>=(275 if key in ['01','07'] else p.rect.width/2))
     ls.append(dict(text=t,page=n,x=x,y=y,col=col,head=head,spans=ss))
   if not(key=='07' and 9<=n<=14):ls.sort(key=lambda l:(l['col'],round(l['y'],1),l['x']))
   joined=[]
   for l in ls:
    if joined and l['head'] and joined[-1]['head'] and (l['col']==joined[-1]['col'] or abs(l['x']-joined[-1]['x'])<30) and 0<=l['y']-joined[-1]['y']<=23:
     joined[-1]['text']+=' '+l['text'];joined[-1]['y']=l['y']
    else:joined.append(l)
   result+=joined
 ALL[key]=result
IGNORE=re.compile(r'^(TABELA|NOV[AO]S? |TRILHAS? (DE|OFICIAIS)|HABILIDADES|DE (COMBATENTE|OCULTISTA|ESPECIALISTA)|PODERES (DE|GERAIS|PARANORMAIS|EVOLUTIVOS)|EXEMPLO|CARACTERÍSTICAS|ORIGENS DA COMUNIDADE|RESPEITE|C A P|[0-9]+[ºo°]? CÍRCULO|LISTA DE|RITUAIS DE|MONSTRUOSA TRANSFORMAÇÃO|QUANDO JOGAR|TREINAMENTO ESPECIAL|JOGANDO DE)',re.I)
def section(k,p):
 if k=='01':
  if 26<=p<=31:return 'Origem',''
  if 34<=p<=45:return ('Trilha' if p in [36,37,40,41,44,45] else 'Poder de classe'),('Combatente' if p<=37 else 'Especialista' if p<=41 else 'Ocultista')
  if 124<=p<=126:return 'Poder paranormal',''
  if 134<=p<=153:return 'Ritual',''
  if 155<=p<=157:return 'Maldição',''
  if 158<=p<=162:return 'Item paranormal',''
 if k=='07':
  if 8<=p<=14:return 'Origem',''
  if 15<=p<=33:return ('Poder de classe' if p in [15,23,27,31] else 'Trilha'),('Combatente' if p<=22 else 'Especialista' if p<=26 else 'Ocultista' if p<=30 else 'Sobrevivente')
  if 34<=p<=37:return 'Poder geral',''
  if 47<=p<=48:return 'Poder paranormal',''
  if 49<=p<=57:return 'Ritual',''
 if k=='03' and any(a<=p<=b for a,b in [(19,51),(58,125),(132,191),(197,255),(260,295)]):return 'Ritual',''
 if k=='05':
  if 8<=p<=16:return 'Poder de origem',''
  if 17<=p<=49:return 'Origem',''
  if 52<=p<=63:return 'Poder geral',''
  if 68<=p<=109:return 'Trilha',('Sobrevivente' if 79<=p<=81 else 'Combatente' if 82<=p<=89 else 'Especialista' if 90<=p<=96 else 'Ocultista' if 97<=p<=107 else '')
  if 110<=p<=117:return 'Poder de classe',('Combatente' if p<=111 else 'Especialista' if p<=114 else 'Ocultista')
  if 158<=p<=178:return 'Poder paranormal',''
  if 180<=p<=189:return 'Maldição',''
  if 190<=p<=249:return 'Item paranormal',''
  if 261<=p<=515:return 'Ritual',''
 if k=='06':
  if p==66:return 'Origem',''
  if 67<=p<=70:return ('Poder geral' if p==70 else 'Poder de classe'),('Combatente' if p==67 else 'Especialista' if p==68 else 'Ocultista' if p==69 else '')
  if p==71:return 'Poder paranormal',''
  if p==72:return 'Ritual',''
  if p==73:return 'Item paranormal',''
 if k=='04':
  if p==76:return 'Ritual',''
  if 78<=p<=79:return 'Item paranormal',''
  if p==80:return 'Origem',''
  if 81<=p<=89:return 'Trilha',('Especialista' if p<=84 else 'Ocultista')
 return None,''
def heading(l,k,sec):
 t=l['text']
 if k=='05' and sec=='Trilha' and re.match(r'^(NEX\s*\d+%|ESTÁGIO\s*\d+)\s*[-–—]',t,re.I):return 'ability',clean(t.split('.')[0])
 if sec=='Maldição' and re.match(r'^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ ,]+\s[-–]',t):return 'title',nice(re.split(r'\s[-–]',t)[0])
 if l['head']:return ('boundary',t) if IGNORE.search(t) else ('title',nice(t))
 if sec in ['Poder de classe','Trilha'] or k=='01' and sec=='Maldição':
  bold=''
  for sp in l['spans']:
   if 'Semibold' in sp['font'] or 'Arpona-Bold' in sp['font'] or 'VeteranTypewriter' in sp['font']:bold+=sp['text']
   elif bold:break
  bold=bold.strip()
  if re.match(r'^(NEX|ESTÁGIO)\s*\d',bold,re.I):return 'ability',clean(bold.split('.')[0])
  if (sec in ['Poder de classe','Maldição'] or k=='01' and l['page'] in [36,40,44]) and '.' in bold:
   name=clean(bold.split('.')[0])
   if name not in ['Amplo','Destruidor','Letal','Perfurante','Pré-requisito','Pré-requisitos','Especial','Afinidade'] and len(name)>3:return 'classability',name
 return None,''
def entry(k,page,name,sub,raw,cl='',track=''):
 text=re.sub(r'^b\s+','',clean(raw));name=nice(clean(name))
 if (len(text)<25 and sub not in ['Origem','Trilha']) or len(name)>110 or re.match(r'^\d',name) or IGNORE.search(name):return None
 r=dict(id='book-'+hashlib.sha1(f'{k}/{page}/{name}/{sub}'.encode()).hexdigest()[:16],name=name,kind='Ritual' if sub=='Ritual' else 'Item' if sub in ['Item paranormal','Maldição'] else 'Poder',subtype=sub,source=SOURCES[k],bookId=k,page=page,className=cl,track=track,quantity=1,spaces=0,damage='',notes=text,requirements='',cost=0)
 m=re.search(r'Pré-requisitos?\s*[:.]\s*(.+?)(?:\.(?:\s|$)|$)',text,re.I)
 if m:r['requirements']=m[1]
 if sub=='Ritual':
  if not re.search(r'Execu[çc][ãa]o\s*[:.]?\s',text,re.I):return None
  e=re.search(r'\b(SANGUE|CONHECIMENTO|ENERGIA|MORTE|MEDO|VARIA|MÚLTIPLOS)\s*([1-4])?\b',text)
  r['element']=nice(e[1]) if e else '';r['circle']=int(e[2] or 0) if e else 0;r['cost']=[0,1,3,6,10][r['circle']]
  for field,label in [('execution','Execução'),('range','Alcance'),('target','(?:Alvo(?:s| ou Área)?|Área|Efeito)'),('duration','Duração'),('resistance','Resistência')]:
   m=re.search(r'(?:^|\n)\s*'+label+r'\s*[:.]\s*([^\n]+)',raw,re.I)
   if m:r[field]=clean(m[1])[:100]
  parts=re.split(r'(?i)\b(DISCENTE\s*\([^)]*\)\s*[:.]?|VERDADEIRO\s*\([^)]*\)\s*[:.]?)',text)
  if len(parts)>1:
   r['notes']=parts[0].strip()
   for j in range(1,len(parts)-1,2):r['discente' if parts[j].upper().startswith('DISCENTE') else 'verdadeiro']=clean(parts[j]+' '+parts[j+1])
 if sub=='Habilidade de trilha':
  text2=re.sub(r'^(NEX[^.]*?)(?=NEX\s*\d)','',text,flags=re.I);text2=re.sub(r'^(ESTÁGIO[^.]*?)(?=ESTÁGIO\s*\d)','',text2,flags=re.I)
  full=re.match(r'((?:NEX\s*\d+%|ESTÁGIO\s*\d+)\s*[-–—].*?)\.',text2,re.I)
  if full:name=nice(full[1])
  r['notes']=text2
  m=re.match(r'(NEX|ESTÁGIO)\s*(\d+)%?\s*[-–—.]?\s*(.*)',name,re.I)
  if m:r['nex' if m[1].upper()=='NEX' else 'stage']=int(m[2]);r['name']=m[3]
 return r
entries=[];choices=[]
for k,ls in ALL.items():
 current=None;track=''
 def flush():
  global current
  if current:
   r=entry(**current)
   if r:(choices if r['subtype'] in ['Origem','Trilha'] else entries).append(r)
  current=None
 for l in ls:
  sec,cl=section(k,l['page'])
  if not sec:flush();track='';continue
  typ,name=heading(l,k,sec)
  if typ:
   flush()
   if typ=='boundary':continue
   if sec=='Trilha' and typ=='title':track=name
   sub=('Maldição' if sec=='Maldição' else 'Poder de classe') if typ=='classability' else 'Habilidade de trilha' if sec=='Trilha' and typ=='ability' else sec
   current=dict(k=k,page=l['page'],name=name,sub=sub,raw=l['text'] if typ in ['ability','classability'] else '',cl=cl,track=track if sub=='Habilidade de trilha' else '')
  elif current:current['raw']+='\n'+l['text']
 flush()
legacy=json.load(open(ROOT/'fenix/scripts/legacy.json'));mapping={'Livro de Regras':'01','Livro de Regras v1.3':'01','Arsenal dos Agentes v0.91':'05','Sobrevivendo ao Horror':'07','Arquivos Secretos #6':'06'}
texts={k:{n:norm(' '.join(l['text'] for l in ls if l['page']==n)) for n in {l['page'] for l in ls}} for k,ls in ALL.items()}
for row in legacy:
 d=row['data'];k=mapping[d['source']];matches=[p for p,t in texts[k].items() if norm(d['name']) in t]
 if not matches:continue
 kind=d['kind'];existing=next((r for r in entries if r['bookId']==k and norm(r['name'])==norm(d['name'])),None)
 if existing:
  for prop in ['spaces','damage','critical','category']:
   if d.get(prop):existing[prop]=d[prop]
  if kind=='Arma':existing['kind']='Arma'
  continue
 if kind in ['Ritual','Poder paranormal']:continue
 page=next((p for p in sorted(matches) if p>={'01':65,'05':130,'07':38}.get(k,1)),min(matches))
 entries.append(dict(id='legacy-'+d['id'],name=d['name'],kind='Arma' if kind=='Arma' else 'Item',subtype='Item paranormal' if kind=='Item amaldiçoado' else 'Arma' if kind=='Arma' else 'Equipamento',source=SOURCES[k],bookId=k,page=page,quantity=1,spaces=d.get('spaces',0),damage=d.get('damage',''),notes=d.get('base') or d.get('description') or '',critical=d.get('critical',''),category=d.get('category',''),range=d.get('range','')))
for k,lo,hi in [('01',65,86),('05',118,155),('07',38,63)]:
 byname={norm(r['name']):r for r in entries if r['bookId']==k and r['kind'] in ['Arma','Item']};active=None;body=[];page=0
 def equipflush():
  global active,body
  if active and len(clean('\n'.join(body)))>30:active['notes']=clean('\n'.join(body));active['page']=page
  active=None;body=[]
 for l in ALL[k]:
  if not lo<=l['page']<=hi:continue
  t=l['text'];first=norm(t.split('.')[0]);bold=any('Semibold' in s['font'] or 'SpecialElite' in s['font'] for s in l['spans'])
  if (bold and '.' in t or l['head']) and first in byname:
   if active and active['id']==byname[first]['id'] and len(body)<2:body=[t];continue
   equipflush();active=byname[first];body=[t];page=l['page']
  elif active:
   if l['head'] or bold and re.match(r'^[^.:]{3,50}\.',t) and not re.match(r'^(Pré-requisito|Especial)',t):equipflush()
   else:body.append(t)
 equipflush()
animal=next(r for r in choices if r['bookId']=='07' and r['name']=='Amigo dos Animais');ls=[l for l in ALL['07'] if l['page']==8 and l['col']==1];start=next(i for i,l in enumerate(ls) if l['text'].startswith('Companheiro Animal.'));end=next((i for i in range(start+1,len(ls)) if ls[i]['head']),len(ls));animal['notes']+=' '+clean('\n'.join(l['text'] for l in ls[start:end]))
for pg,cl in [(81,'Especialista'),(85,'Ocultista')]:
 prose=[]
 for l in ALL['04']:
  if l['page']!=pg:continue
  if re.match(r'NEX\s*10',l['text'],re.I):break
  if not l['head'] and len(l['text'])>10:prose.append(l['text'])
 choices.append(entry('04',pg,'Monstruoso','Trilha','\n'.join(prose),cl))
exclude=['conteudosdocapitulo','afinidadeelemental','respeiteoutrolado','crieumconceito','escolhaseusatributos','escolhasuaorigem','escolhasuaclasse','poderdecombatente','poderdeespecialista','poderdeocultista','habilidadedetrilha']
entries=[r for r in entries if norm(r['name']) not in exclude]
for r in choices:
 if not r['notes']:r['notes']='Consulte as habilidades e os requisitos de progressão abaixo.'
 if r['subtype']!='Origem':continue
 m=re.search(r'Perícias treinadas?\s*[.:]\s*(.*?)[.]\s*([^.:]{3,100})[.:]\s*(.+)',r['notes'],re.I)
 if m:r['skillsText']=m[1];r['grantName']=nice(m[2]);r['grantNotes']=m[3]
 if r['name']=='Desgarrado':r.update(skillsText='Fortitude e Sobrevivência',grantName='Calejado',grantNotes='Você recebe +1 PV para cada 5% de NEX.')
 entries.append({**r,'id':r['id']+'-power','name':r.get('grantName') or 'Origem: '+r['name'],'subtype':'Poder de origem','notes':r.get('grantNotes') or r['notes'],'origin':r['name']})
weapons={'Arcabuz dos Moretti','Faca de Carne','Lâmina da Herança','Lança do Destino','Foice da Coleta e Martelo da Distribuição','Arco Divino','Cajado da Cruz de Sangue','Lança-nitrogênio','Punhos Enraivecidos'}
for r in entries:
 if r['bookId']=='04' and r['subtype']=='Habilidade de trilha':r['track']='Monstruoso'
 if r['bookId']=='01' and r['name']=='Sangue de Ferro':r['notes']='Você recebe +2 PV para cada 5% de NEX. Afinidade: você recebe +5 em Fortitude e se torna imune a venenos e doenças.'
 if r['subtype']=='Item paranormal' and (r['name'] in weapons or re.search(r'^(?:Uma? |Esta |Este |Essa |Esse )?(?:espada|fuzil|pistola|revólver|machado|adaga|lança|besta|arco|foice)\b',r['notes'],re.I)):r['kind']='Arma';r['subtype']='Arma paranormal'
 if r['kind']=='Arma':r['attackSkill']='Pontaria' if re.search(r'pistola|revólver|fuzil|rifle|arco|besta|arcabuz|submetralhadora|metralhadora|espingarda',r['name'],re.I) else 'Luta'
 if not r['notes']:r['notes']='Perfil da tabela de armas: dano '+str(r.get('damage') or 'conforme utilização')+'; crítico '+str(r.get('critical') or 'padrão')+'. Consulte as características especiais na página indicada.'
 r['notes']=re.sub(r'([+–−-])([O]{1,5})\b',lambda m:m[1]+str(len(m[2]))+'d20',r['notes'])
def dedup(arr):
 out={}
 for r in arr:
  key=(r['bookId'],norm(r['name']),r['subtype'],r.get('track',''),r.get('className',''))
  if key not in out or len(r['notes'])>len(out[key]['notes']):out[key]=r
 return list(out.values())
entries=dedup(entries);choices=dedup(choices)
for name,data in [('book-catalog',entries),('character-options',choices)]:
 (OUT/(name+'.json')).write_text(json.dumps(data,ensure_ascii=False,indent=2))
print('Entries',len(entries),'Choices',len(choices),collections.Counter(r['kind'] for r in entries))

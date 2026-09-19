from pathlib import Path
R=Path(__file__).resolve().parents[1]
p=R/'lib/rules.ts';s=p.read_text().replace('  attackSkill?: string;', '''  catalogId?: string;
  subtype?: string;
  bookId?: string;
  page?: number;
  requirements?: string;
  className?: string;
  track?: string;
  origin?: string;
  nex?: number;
  stage?: number;
  resistance?: string;
  attackSkill?: string;''').replace('  origin: string;','  origin: string;\n  originId?: string;\n  trackId?: string;');p.write_text(s)
p=R/'lib/validation.ts';s=p.read_text().replace('  origin: z.string().max(100),','  origin: z.string().max(150),\n  originId: z.string().optional(),\n  trackId: z.string().optional(),').replace('        attackSkill:', '''        catalogId: z.string().optional(),
        subtype: z.string().max(100).optional(),
        bookId: z.string().max(100).optional(),
        page: num.int().positive().optional(),
        requirements: z.string().max(2000).optional(),
        className: z.string().max(100).optional(),
        track: z.string().max(150).optional(),
        origin: z.string().max(150).optional(),
        nex: num.int().min(0).max(99).optional(),
        stage: num.int().min(1).max(5).optional(),
        resistance: z.string().max(300).optional(),
        attackSkill:''').replace('.max(10000)', '.max(50000)').replace('name: z.string().max(100)','name: z.string().max(150)');p.write_text(s)
p=R/'lib/catalog.ts';s=p.read_text().replace('raw.items.length > 500','raw.items.length > 5000').replace('até 500 registros','até 5.000 registros');a=s.index('  return validateAgentImport');b=s.index('\n}',a);s=s[:a]+'''  const items: Item[] = [];
  for (let offset=0;offset<raw.items.length;offset+=500) items.push(...validateAgentImport({version:1,agent:{...newAgent("Validação"),inventory:raw.items.slice(offset,offset+500)}}).inventory);
  return items;'''+s[b:];p.write_text(s)
p=R/'components/character-creator.tsx';s=p.read_text().replace('export default function CharacterCreator()', "import CharacterOptions from './character-options';\nimport {addBenefits,originSkillsFor} from '@/lib/books';\nexport default function CharacterCreator()")
s=s.replace('...a,\n        name: a.name.trim()', '...addBenefits(a),\n        name: a.name.trim()');a=s.index('              <label>\n                Trilha');b=s.index('              <div className="help span-all">',a);s=s[:a]+'              <CharacterOptions agent={a} onChange={setA} />\n'+s[b:]
s=s.replace('(originSkills[a.origin] || [])','(originSkills[a.origin] || originSkillsFor(a))').replace('originSkills[a.origin]?.join(" e ")','(originSkills[a.origin] || originSkillsFor(a)).join(" e ")').replace('track: "",','track: "", trackId: undefined,');p.write_text(s)
p=R/'components/agent-editor.tsx';s=p.read_text().replace('export default function AgentEditor(',"import CharacterOptions from './character-options';\nexport default function AgentEditor(");a=s.index('              <label>\n                Origem');b=s.index('              {a.className === "Sobrevivente"',a);s=s[:a]+s[b:];s=s.replace('className: cls,','className: cls,\n                      track: "", trackId: undefined,').replace('            <h3>Atributos</h3>','            <CharacterOptions agent={a} onChange={setA} editing />\n            <h3>Atributos</h3>');p.write_text(s)
p=R/'components/character-sheet.tsx';s=p.read_text().replace('import { useState', "import RuleDetails from './rule-details';\nimport { useState",1);a=s.index('                    <details>\n                      <summary>Descrição e efeitos</summary>');b=s.index('                    </details>',a)+len('                    </details>');s=s[:a]+'                    <RuleDetails item={i} />'+s[b:];p.write_text(s)

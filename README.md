# Fênix 0.6 — ficha primeiro, sem cadastro

Aplicação Next.js/React para fichas de Ordem Paranormal. Não exige conta, não inicia sessão e não consulta dados privados do Supabase.

## Rodar

Node 22+; `npm ci`, `npm run dev`. Produção: `npm run build`, `npm start`.

## Fluxos

- `/`: lista de agentes e importação de fichas.
- `/agentes/novo`: criação em cinco etapas, com distribuição básica de atributos e perícias.
- `/agentes/[id]`: tela própria do personagem, atributos, recursos, testes, armas e abas de jogo.
- `/biblioteca`: catálogo inicial de 14 perfis de armas; criação, importação e exportação de conteúdo próprio.
- `/campanhas`: organização local de personagens e anotações.

Ataques usam atributo e treinamento da perícia da arma. Dano usa a expressão cadastrada. Armas têm alcance, crítico e maldições vinculadas como aprimoramentos. Rituais e poderes têm custo e efeitos descritivos, com formas discente e verdadeira. O gasto de recurso exige confirmação. Condições ficam abaixo de Bloqueio e exibem seus efeitos durante a sessão.

## Dados e limites

Dados ficam em `fenix.workspace.v1` no armazenamento do navegador, compatível com fichas locais anteriores. Exportar fichas e biblioteca cria backups JSON. Limpar os dados do navegador pode apagar as fichas; exporte antes. Não há sincronização automática entre dispositivos ou sessões compartilhadas em tempo real nesta versão.

Catálogo inicial não é uma cópia integral dos livros. Rituais e poderes podem ser criados ou importados em bibliotecas próprias. Não há PDFs ou catálogo privado incorporados ao código. Banco anterior permanece inalterado e privado.

Poderes de origem/classe/trilha, pré-requisitos, bônus de dano, críticos e efeitos ainda têm resolução manual. Progressão avançada e sobrevivente exigem conferência com o mestre. Não há mesa virtual.

## Verificação

8 testes de regras e importação; compilação de produção com TypeScript. Testes de navegador registrados separadamente no andamento do projeto.

`database/schema.sql` e `tests/permissions.sql` são referências históricas da versão conectada, não necessárias para rodar a versão sem cadastro.

# Fênix — fichas compartilhadas e face alternativa NEX 35

Aplicação Next.js/React para fichas de Ordem Paranormal. Não exige conta, não inicia sessão e não consulta dados privados do Supabase.

## Rodar

Node 22+; `npm ci`, `npm run dev`. Produção: `npm run build`, `npm start`.

## Fluxos

- `/`: lista de agentes e importação de fichas.
- `/agentes/novo`: criação em cinco etapas, com distribuição básica de atributos e perícias.
- `/agentes/[id]`: tela própria do personagem, atributos, recursos, testes, armas e abas de jogo.
- `/biblioteca`: catálogo por livro e categoria; criação, importação e exportação de conteúdo próprio.
- `/campanhas`: organização local de personagens e anotações.

Ataques usam atributo e treinamento da perícia da arma. Dano usa a expressão cadastrada. Armas têm alcance, crítico, maldições e modificações vinculadas; cada modificação soma I à categoria, e modificações iguais não se acumulam. O seletor oferece somente modificações compatíveis com o tipo de arma: algumas alteram automaticamente ataque, dano, margem de ameaça, alcance ou espaços; efeitos condicionais são consultados na descrição. Modificações de munição pertencem à munição. Cada registro da ficha (arma, ritual, poder ou item) pode ser removido diretamente pelo botão no cartão, sem confirmação. Rituais e poderes têm custo e efeitos descritivos, com formas discente e verdadeira. O gasto de recurso exige confirmação. Condições ficam abaixo de Bloqueio e exibem seus efeitos durante a sessão.

Treinamento de perícia vai até Expert (+15). O editor separa bônus manuais de poderes do treinamento, e a aba Armas permite criar/configurar vestimentas e utensílios (+2 ou +5 se aprimorados), uma segunda função opcional e maldições de acessórios do Livro de Regras. Até duas vestimentas podem conceder bônus ao mesmo tempo; desativar um acessório remove os efeitos. Força de Pujança aumenta capacidade de carga, e as maldições numéricas de atributo, Defesa, Vitalidade e Esforço Adicional afetam os valores exibidos; as duas últimas exigem marcar que passou um dia de uso. Outros efeitos condicionais continuam descritivos e requerem arbitragem do mestre.

A aba Resumo reúne aparência, atributos, perícias, recursos e poderes. Retratos locais são reduzidos e salvos dentro da própria ficha, inclusive no JSON exportado. O rolador flutuante aceita de 1 a 100 dados com 2 a 1.000.000 lados.

### Face alternativa da campanha Apocalypsis

Na página **Campanhas**, vincule a ficha à campanha Apocalypsis e clique em **Liberar face NEX 35** para cada personagem autorizado. Somente o navegador que possui a chave de mestre daquela ficha consegue efetivar a liberação. Para quem tem a liberação, dois toques ou cliques rápidos sobre a aparência no Resumo alternam entre as faces; os mesmos gestos devolvem à ficha original. Cada face tem nome, aparência, recursos, perícias, equipamentos, rituais e poderes próprios. A segunda é derivada como cópia independente da ficha publicada, com NEX fixo em 35% e máximos de recursos recalculados.

Rituais de 3º círculo ou superior ficam fora da derivação; para outras classes além de Ocultista, os de 2º círculo também ficam fora em NEX 35. Itens e poderes com NEX exigido acima de 35 são omitidos. Rituais sem círculo definido exigem informar o círculo antes de entrar nessa face. O treinamento Expert (+15) é reduzido a Veterano (+10). Confira manualmente bônus, atributos, escolhas adquiridas em níveis posteriores e pré-requisitos descritos no livro, que não permitem derivação segura só pelo registro da ficha.

A campanha apresenta o registro de alterações da segunda face, com campo alterado, agente, autor e horário, atualizado a cada 10 segundos. Os avisos dependem das chaves de mestre salvas no navegador da campanha e do acesso ao banco; são visíveis **na tela Campanhas**, não são notificações por celular com o site fechado. A edição e a auditoria da face publicada exigem o SQL `database/alternate-face.sql` no mesmo projeto Supabase de compartilhamento. As migrações já foram aplicadas ao projeto configurado nesta instalação.

## Modo jogador e sincronização

O botão “Link do jogador” publica a ficha no banco e gera um endereço no formato `/agentes/ID?mode=player&agent=ID&share=CHAVE`. A chave de alta entropia autoriza somente aquela ficha. O jogador abre o endereço diretamente, sem importar JSON e sem preencher login. Ficha e histórico de rolagens são sincronizados entre os aparelhos aproximadamente a cada 2,5 segundos.

As chaves do mestre ficam somente no armazenamento local do navegador que publicou a ficha. O banco guarda apenas hashes dessas chaves. Clicar novamente em “Link do jogador” preserva o endereço enquanto as credenciais locais existirem.

## Dados e limites

Fichas não publicadas continuam em `fenix.workspace.v1` no armazenamento do navegador. Fichas publicadas também ficam no Supabase e podem ser abertas pelo link secreto. Exportar fichas e biblioteca continua criando backups JSON. Limpar os dados do navegador do mestre remove sua chave administrativa local; mantenha um backup da ficha e não compartilhe o endereço do mestre.

Rituais e poderes também podem ser criados ou importados em bibliotecas próprias. Os PDFs originais não são servidos pela aplicação. Banco anterior permanece privado.

Poderes de origem/classe/trilha, pré-requisitos, bônus de dano, críticos e efeitos condicionais ainda têm resolução manual. Progressão avançada e sobrevivente exigem conferência com o mestre. Não há mesa virtual.

## Verificação

Testes de regras, importação e equipamentos; compilação de produção com TypeScript. Testes de navegador registrados separadamente no andamento do projeto.

`database/schema.sql` e `tests/permissions.sql` são referências históricas da versão conectada, não necessárias para rodar a versão sem cadastro.

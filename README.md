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

Rituais de 3º círculo ou superior ficam fora da derivação; para outras classes além de Ocultista, os de 2º círculo também ficam fora em NEX 35. Rituais antigos sem círculo salvo são identificados pelo catálogo quando há correspondência inequívoca; os demais exigem classificar o círculo. Itens e habilidades de trilha com NEX exigido acima de 35 são omitidos. Entre os poderes e habilidades elegíveis, a derivação sorteia até metade da quantidade de poderes da ficha NEX 65 (arredondando para cima); quando há menos opções elegíveis, usa somente as disponíveis. O sorteio é salvo na ficha e não muda sozinho. O treinamento Expert (+15) é reduzido a Veterano (+10).

Se a ficha original recebeu rituais ou poderes depois da liberação da segunda face, o mestre usa **Atualizar herança NEX 35** na página Campanhas. A atualização consulta a versão publicada mais recente, inclui rituais elegíveis, sorteia os poderes faltantes e mantém as escolhas sorteadas anteriormente. Ela preserva nome, retrato, recursos e itens exclusivos; após a primeira atualização, também respeita rituais e poderes herdados que o jogador removeu. Na primeira atualização de uma face antiga, a seleção de poderes herdados é refeita uma vez para chegar à metade solicitada. Confira manualmente bônus, atributos, escolhas adquiridas em níveis posteriores e pré-requisitos descritos no livro, que não permitem derivação segura só pelo registro da ficha.

A campanha apresenta o registro de alterações da segunda face, com campo alterado, agente, autor e horário, atualizado a cada 10 segundos. Os avisos dependem das chaves de mestre salvas no navegador da campanha e do acesso ao banco; são visíveis **na tela Campanhas**, não são notificações por celular com o site fechado. A edição e a auditoria da face publicada exigem o SQL `database/alternate-face.sql` no mesmo projeto Supabase de compartilhamento. As migrações já foram aplicadas ao projeto configurado nesta instalação.

### Infecção

Na página **Campanhas**, o mestre pode clicar em **Liberar Infecção** para cada personagem NEX 35 vinculado à campanha (inclusive a face alternativa NEX 35). A barra começa em 0/100 e aparece sob os recursos da ficha, tanto no Resumo quanto nas outras abas. Jogador e mestre podem usar os botões − e + para ajustar de um em um; somente a chave de mestre pode liberar ou desativar a barra. Ao desativar e reativar, o valor anterior é preservado. O valor é sincronizado entre os aparelhos pelo banco, sem depender da exportação JSON, e cada alteração aparece no histórico privado da campanha. O SQL `database/infection.sql` cria esse recurso após as migrações de compartilhamento e de face alternativa; já foi aplicado ao projeto configurado nesta instalação.

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

## Ameaças e combate

- `/ameacas`: catálogo de 140 registros do Livro de Regras, Sobrevivendo ao Horror, Arquivos Secretos 06/07 e EaF — Guia das Marcas. Busca por nome, elemento principal/secundário, origem e VD máximo; referência do livro/página, estatísticas e texto de ações. Ameaças próprias podem ser criadas, editadas, removidas e importadas/exportadas. As fichas não numéricas permanecem como referência especial.
- `/campanhas`: selecione uma campanha e use **Combate → Criar combate**. Adicione personagens (face principal ou NEX 35 autorizada), ameaças do catálogo ou participantes avulsos. As cópias de criaturas têm PV independentes. Role ou edite iniciativas, inicie o combate e avance/retorne turnos, com rodadas automáticas, pausa e reinício.
- Ataques e dano das ameaças podem ser rolados com histórico na campanha. Ajuste o dano final após resistências, imunidades, críticos e efeitos especiais; essas regras não são automatizadas. Condições são selecionadas no encontro e seus efeitos podem ser consultados.
- Dano/cura em personagens vinculados lê a ficha compartilhada com a chave de mestre antes de atualizar somente os PV da face escolhida. A face principal permanece intacta ao ajustar NEX 35. **Atualizar fichas** recarrega PV, Defesa e iniciativa. As condições do encontro são anotações do combate; não alteram as condições da ficha.
- Combates e ameaças próprias são persistidos no navegador do mestre, preservando o armazenamento anterior. Turnos não são transmitidos aos jogadores nesta versão; o modo jogador bloqueia as telas de campanha e ameaças. A marca de oculto distingue participantes e rolagens privadas na preparação do mestre, sem criar um link público do combate.

O catálogo mantém as diferenças entre regras oficiais e o suplemento EaF por origem. Regras de metamorfose, hierarquias e ritos permanecem na referência da ameaça, com os valores da ficha inicial. Os PDFs originais não entram no repositório. Para regenerar o catálogo a partir das mesmas fontes locais: `python3 scripts/build-threat-catalog.py /caminho/das/fontes` (PyMuPDF).

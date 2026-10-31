# Fênix 2.4 — Combate nos links dos jogadores

A sala interativa abre no próprio navegador de cada jogador selecionado. O mestre também acessa a sala, e continua com os controles de ameaças, condições, dano final e andamento do encontro.

## Como usar

1. Em **Campanhas → Combate**, crie ou escolha um encontro e adicione personagens e ameaças.
2. Em cada personagem, marque **Liberar sala para este jogador**. O jogador acessa o **Link do jogador** da própria ficha, como já fazia.
3. Role/ajuste as iniciativas e clique em **Iniciar / liberar sala**. A sala aparece automaticamente para os selecionados em alguns segundos. Quem fechou a janela pode voltar pelo botão **Entrar no combate**.
4. Revele as ameaças pelo ícone de olho. Os tokens mostram a ordem e quem está agindo. Ameaças ocultas não revelam nome, imagem ou ações secretas aos jogadores.
5. No próprio turno, escolha **Padrão**, **Movimento**, **Livre** ou **Completa**, escolha uma ação disponível na ficha, selecione o alvo e confirme. O botão **Concluir meu turno** avança a ordem. Fora do turno, a sala fica disponível para acompanhar.
6. O mestre abre **Sala interativa** para acompanhar/agir pelo personagem atual. Em **Ações dos jogadores**, confirma acertos, reações, resistências e o dano final. Cada dano pendente só pode ser aplicado uma vez. Ataques de ameaças continuam nos controles da campanha.
7. **Pausar** suspende ações e permite ajustes na ficha. **Encerrar combate** fecha a sala dos jogadores. **Reiniciar rodadas** começa novamente o controle de ações e usos da cena.

A transmissão em tela separada continua disponível. Ela é opcional; cada jogador usa seu próprio link para participar. Não há cadastro novo.

## Regras automatizadas

- Uma ação padrão e uma de movimento por turno. A padrão pode ser usada como movimento; ação completa consome ambas. Ações livres não têm cota fixa, mas habilidades mantêm seus limites.
- Ataques com armas/desarmado: testes de Luta/FOR ou Pontaria/AGI, armas ágeis, dados de dano, crítico e modificadores conhecidos. O mestre confirma o acerto e o dano efetivo antes de alterar o alvo.
- **Cicatrizante:** ação padrão, 2d8+2 PV, consome uma unidade. Não inventa um teste de Medicina para o item.
- **Primeiros socorros:** Medicina com INT, DT 20 + 5 por estabilização anterior nesta cena. Sem kit, −5. Em sucesso, retira morrendo/inconsciente e deixa o aliado com 1 PV. O kit é ferramenta; sozinho não gera uma cura livre.
- **Paramédico:** exige kit, ação padrão, 2 PE e 2d10; ampliações de +1 PE/+1d10 nos patamares 40%, 65% e 99%.
- **Cicatrização:** básica e discente, custo, cura e registro do envelhecimento de um ano. Ritual Potente aplica o bônus conhecido.
- **Surto Temporal:** ação padrão adicional para si, 3 PE, uma vez por cena. A afinidade com Morte, marcada na edição do poder e com NEX mínimo 50%, permite uma vez por turno.
- **Surto de Adrenalina:** padrão ou movimento para si, 5 PE, uma vez por rodada.
- **Estrategista:** ação padrão, 1 PE por aliado até o limite de INT; concede movimento no próximo turno do alvo. **Oficial Comandante:** padrão, 5 PE, padrão no próximo turno dos aliados selecionados.
- **Ataque Extra:** 2 PE, após atacar, uma vez por rodada. **Acelerar Ritual:** +4 PE, ritual como ação livre, uma vez por rodada, com a habilidade na ficha.
- **Velocidade Mortal:** movimento adicional; discente concede padrão adicional. A ação adicional não permite ritual. Sustentação de 1 PE no início do turno do conjurador; é necessário sustentar ou encerrar antes de agir.
- Custos em PE ou PD conforme a ficha, limite por turno com a exceção de custo mínimo, Custo do Paranormal com Ocultismo/INT, perdas de SAN e SAN máxima (ou conversão em PD). Alterações ficam na face usada no combate, incluindo a alternativa NEX 35.

Referência: livros fornecidos pelo proprietário, principalmente Livro de Regras — Médico de Campo p. 31, Medicina p. 46, equipamentos p. 65–66, Custo do Paranormal p. 121, Cicatrização p. 126–127 e Velocidade Mortal p. 142–143. A numeração é a impressa no livro, não o índice do visualizador PDF.

## Efeitos que dependem da mesa

Em **Efeitos de itens e habilidades**, o mestre pode escolher um item realmente presente na ficha e definir cura ou ação adicional, alvo, custo, execução, limite, consumo e eventual Medicina/DT. Isso cobre bandagens personalizadas e regras de outras fontes sem inventar uma regra oficial. A configuração vale apenas para o encontro e pode ser restaurada ao padrão.

O sistema não interpreta automaticamente todo texto dos livros. Rituais/aprimoramentos não mapeados, reações fora do turno, efeitos circunstanciais, alcance, deslocamento no cenário, duração narrativa e resistências exigem conferência do mestre. Ações genéricas registram execução e custo declarados, e deixam o efeito pendente. Aprimoramentos verdadeiros e riscos diários de itens como **Crânio Espiral** precisam de resolução manual; configurar apenas a ação adicional não resolve o teste, envelhecimento ou bloqueio diário do item. Arremessos e modos alternativos de ataque devem ser conferidos pelo mestre.

O controle é uma sala de ações e tokens, sem mapa tático ou medição automática de distância. Um personagem incapacitado não pode agir; o mestre pode corrigir a condição ou avançar o turno.

## Persistência e permissões

Mantém `fenix.workspace.v1`, links, fichas, retratos, biblioteca de ameaças e imagens publicadas no GitHub. Não importa dados de exemplo sobre o espaço existente e não substitui fichas ao publicar. Ações alteram apenas recursos, ajustes, condições e inventário da face participante, quando necessário.

O servidor recebe uma intenção de ação, carrega a ficha autorizada, valida turno/itens/custos e realiza as rolagens. O banco confirma revisão do encontro e versão das fichas afetadas numa transação: conflito, envio repetido ou ficha editada aborta toda a gravação. O jogador não pode editar campos de combate pela ficha enquanto a sala está ativa; o mestre pode pausar para permitir ajustes.

O acesso é por capacidade: chave da sala para o mestre e link privado da ficha para o jogador. A identidade autenticada da aplicação é o link, não uma conta pessoal. O resultado enviado ao jogador contém seu próprio estado e somente os participantes/eventos visíveis; não envia as fichas completas dos demais.

## Operação

- Instalação incremental: `database/interactive-combat.sql`, após os scripts existentes de compartilhamento e combate. A produção já recebeu as migrações equivalentes.
- `FENIX_COMBAT_SERVER_SECRET`: segredo de alta entropia disponível **somente no servidor de produção**, com o SHA-256 correspondente em `fenix_private.combat_service`. Nenhum valor é incluído no código ou no cliente. Não se usa chave service-role no navegador.
- O schema privado e tabelas não possuem acesso direto de `anon`/`authenticated`. As RPCs com `SECURITY DEFINER` têm `search_path` vazio e verificam as capacidades. A rota de ações exige JSON da mesma origem; em previews, mutações são bloqueadas.
- Sincronização com pausa em abas ocultas, atualização incremental e imagens obtidas separadamente/cached por versão. Não retransmite retratos completos a cada consulta da sala.

## Validação

`npm test`, `npm run typecheck`, `npm run build` e testes SQL com fichas sintéticas e rollback. Os testes cobrem autorização, turno, consumo de ações, custos, curas, ações adicionais, sustentação, dano confirmado uma só vez, face alternativa, revisão/versão e privacidade.

A inspeção visual em navegador e uma sessão real com vários jogadores não foram realizadas nesta entrega: o acesso automatizado ao navegador foi bloqueado pela revisão automática. Os testes de lógica, integração e compilação não substituem essa conferência visual.

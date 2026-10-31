# Fênix 2.5 — Execução da ficha e rolagens por etapa

## Rituais, poderes e itens no combate

A sala lê o campo **Execução / ação** da ficha e coloca cada opção em **Padrão**, **Movimento**, **Livre** ou **Completa**. Armas usam padrão por padrão. O editor também permite informar a execução de itens comuns.

Fichas antigas recuperam campos ausentes de um registro inequívoco do catálogo. Uma execução explícita na descrição da ficha tem prioridade sobre esse preenchimento; campos já editados são preservados. Também são reconhecidas instruções claras, como “gastar uma ação de movimento”. A recuperação não substitui o inventário salvo nem altera os IDs dos itens.

Exemplo: **Eletrocussão**, mesmo em uma ficha antiga sem o campo separado de execução, aparece em **Padrão**. Executá-lo registra a ação, o custo e o teste de Custo do Paranormal. Em seguida, o jogador edita os dados de dano e clica em **Rolar dano**. Fortitude, vulnerável, alcance, objetos e aprimoramentos continuam sujeitos à resolução do mestre; não são automaticamente decididos pela rolagem de dano.

Poderes passivos, reações e execuções demoradas não viram ações comuns do turno. Para um efeito personalizado sem uma execução clara, edite o campo na ficha com o combate pausado ou use a ação avulsa. A lista de efeitos automatizados na 2.4 continua válida; reconhecer a execução não significa interpretar todo o texto de uma habilidade.

## Investigar e agir fora da lista

- **Completa → Investigar:** teste de Investigação com INT e treinamento. Procurar um objeto ou pista exige pelo menos uma ação completa, conforme o Livro de Regras, p. 46. O mestre determina a DT, o resultado narrativo e se a tarefa exige mais tempo. O campo dos dados também pode ser ajustado antes de rolar.
- **Ação avulsa:** existe em todas as quatro categorias. Escolha a categoria, descreva a ação e confirme. O custo da categoria é descontado; o efeito fica para o mestre resolver. Não é uma forma de conceder ações extras ou escrever resultados diretamente na ficha.

## Atrasar ação

O botão vermelho **Atrasar ação** abre uma seleção de aliados visíveis com iniciativa menor que ainda vão agir. A confirmação move o personagem para imediatamente depois do aliado, reduzindo sua iniciativa ao mesmo valor, com desempate depois do aliado. Essa ordem continua nas rodadas seguintes e ao pausar/retomar.

O atraso é do turno inteiro e deve acontecer **antes de qualquer ação ou sustentação no turno**. As ações não são gastas nem duplicadas: o próximo participante age agora e o personagem atrasado recebe seu turno na nova posição. O limite inferior é o negativo do bônus de Iniciativa, conforme a regra de atrasar, p. 87. O mestre ainda pode reorganizar a iniciativa pelos controles da campanha.

## Dados editáveis, sem rolagem ao selecionar

1. Selecione a arma/ataque e o alvo. Confira ou edite **Dados do ataque**, por exemplo `3d20+5`, e escolha maior/menor dado. Clique em **Rolar ataque**.
2. O resultado aparece em destaque. Surge uma etapa separada de dano, com uma expressão sugerida pela arma e pelo crítico, que pode ser editada: `2d6+3`, `3d8+1d4+2`, etc.
3. Clique em **Rolar dano**, ou em **Sem dano / não acertou**. Essa etapa não cobra a ação nem os pontos novamente. Cada rolagem de dano só pode ser feita uma vez, pelo participante autorizado no turno original.
4. O mestre confirma o valor final após resistências e reações. Também pode arbitrar o dano diretamente; essa intervenção fica identificada no histórico.

Selecionar uma opção ou editar os campos não rola dados. Os resultados são sorteados no servidor somente após a confirmação. A expressão informada e os dados individuais ficam no histórico; modificar a expressão é uma declaração do jogador sujeita à conferência do mestre, não uma comprovação automática de todos os bônus.

O turno não pode ser concluído com uma rolagem de dano visível pendente. O mestre pode avançar/corrigir a cena; rolagens antigas não podem ser repetidas em turnos posteriores.

## Compatibilidade e validação

Mantém as fichas, links, chaves de armazenamento, retratos e imagens do GitHub. Não requer migração adicional no banco nem novos segredos de produção: reutiliza a validação de acesso, revisão do encontro e gravação atômica já instalada na 2.4.

Testes cobrem recuperação de metadados, precedência das edições, execução por categoria, ação completa de Investigação, ações avulsas, ordem persistente do atraso, bloqueio após gastar ações, limite de iniciativa, rolagens em etapas, custos cobrados uma única vez, expressões limitadas, autorização e apresentação dos controles.

A conferência visual em navegador permanece pendente devido ao bloqueio de acesso automatizado anterior nesta sessão. Foram usados testes de lógica, renderização estática dos componentes, validação de tipos e build de produção.

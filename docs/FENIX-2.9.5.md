# Fênix 2.9.5 — Habilidades e poderes no combate

Estado: implementação em revisão. A versão não deve ser descrita como automação integral do catálogo.

## O que foi implementado

A sala ganhou a aba **Habilidades e poderes**, busca e filtros. Ela lista os poderes elegíveis da ficha, mostra a descrição, o custo, as escolhas e os efeitos aplicáveis. A ativação sem custo de ação declarado é livre. Ativações pagas descontam PE ou PD e a ação correspondente no servidor, na mesma transação que salva o combate.

Bônus são separados dos dados base editáveis. O resultado do ataque e os dados adicionais do dano são calculados pelo servidor. O dano preserva uma cópia dos bônus válidos no momento do ataque, mesmo após o efeito ser consumido. O jogador continua escolhendo e rolando o dano em uma etapa separada. O mestre continua confirmando acerto, resistências, imunidades e dano final.

Há regras específicas para Ataque Especial, Ataque Furtivo, Ataque Extra, Combater com Duas Armas, Combate Defensivo, Golpe Pesado, Golpe Demolidor, Ritual Potente, Tiro Certeiro, Técnica Secreta/Sublime, Potência Máxima, Perito, Sangue Fervente, Conjuração Marcial e outros modificadores. Ensaio e Mosh Pit também reconhecem as versões personalizadas presentes nas fichas, sem trocar suas descrições pelas entradas antigas usadas como base.

- Ataque Especial: distribuição de parcelas de +5 e custo conforme NEX.
- Arma de Sangue: criação por movimento e 2 PE, arma temporária de 1d6, ataque adicional de 1 PE após agredir e limite por turno. Com afinidade, a arma de 1d10 já fica disponível, sem criação paga. A arma temporária não altera o inventário permanente.
- Ataque Furtivo: confirmar o acerto, ativar antes do dano, pagar 1 PE; uma vez por rodada.
- Técnicas da arma favorita: selecionar arma e efeitos; custo de cada efeito; Letal simples e duplo são alternativas.
- Conjuração Marcial: crédito exclusivo de ataque corpo a corpo, após um ritual de ação padrão. Não serve para disparar ou conjurar outro ritual.
- Perito: perícia treinada, ampliação conforme NEX e consumo no teste correspondente. Escolhas anotadas no nome da ficha são respeitadas.
- Mosh Pit: selecionar o inimigo e os participantes que o cercam; bônus somente contra esse inimigo, limitado a 5d6. Como a sala não tem mapa de posições, o mestre/jogadores precisam encerrar o efeito quando a posição deixar de valer.
- Ensaio: registrar o benefício de um interlúdio já realizado e os personagens que participaram. Não realiza um interlúdio em pleno combate.
- Frase de Efeito: ampliar um crítico próprio antes do dano, pagando 2 PE. A reação ao crítico de um aliado fora do turno ainda exige resolução do mestre.
- Mestre em Elemento e Tatuagem Ritualística: desconto aplicado ao custo real do ritual, com mínimo de 1 quando havia custo. Especialista em Elemento e Rituais Eficientes alteram a DT exibida no evento.
- Especialista em Emergências: cicatrizante usa movimento; consumo e cura continuam atômicos.
- Eclético e Engenhosidade: treinamento temporário, com custos e graus permitidos pelo NEX; não soma +5 sobre um treinamento já existente.
- Ritual Predileto: escolha do ritual beneficiado, desconto de 1 PE apenas nele.
- Atirar para Matar: maximiza os dados do crítico com arma de fogo, inclusive os bônus rolados, preservando a confirmação do dano.
- Técnica Medicinal: INT na cura; Sensitivo e outros benefícios de perícia entram nos testes correspondentes. Racionalidade Inflexível e Olhar Sinistro usam o melhor atributo disponível nas sugestões e testes automáticos.
- Disparo Letal: expira no próximo ataque ou no fim do próximo turno, inclusive se o mestre avançar vários turnos.
- Ação avulsa: teste opcional de qualquer perícia; bônus de poderes são somados ao teste correspondente.
- Defesa temporária aparece para jogador e mestre; a ficha permanente não recebe alterações transitórias nos atributos/Defesa.

## Continuação de 19 de novembro

- **Segurar o Gatilho** aparece junto ao ataque da arma a partir de NEX 60%. Depois de rolar o dano, selecione a mesma arma e o mesmo alvo e confirme o acerto. Cada repetição custa 2 PE ou PD por ataque já efetuado no turno. O histórico vincula a confirmação ao último ataque e o servidor verifica o limite de esforço. **Ninja Urbano** acrescenta 2 ao dano corpo a corpo e de disparo. As duas descrições foram recuperadas a partir das páginas impressas 25–26 e 29–30 do Livro de Regras. Na sala, cópias antigas com o texto truncado exato exibem a correção.
- **Disparada** acrescenta 4,5 m por 1 PE ou PD até o fim da rodada. **Velocidade do Caos** considera a afinidade no deslocamento e reserva o movimento extra do primeiro turno para se deslocar. Interagir com o ambiente usa sua própria opção de movimento. **Correria Desesperada** mantém o deslocamento passivo enquanto o dado de fuga vale para um só teste.
- **Precisão** vincula a mira ao alvo e à arma durante a rodada. **Grudar o Cano** modifica o multiplicador de crítico contra o alvo indicado. **Conjuração Corporal** e **Letrado no Oculto** ajustam a DT conforme a resistência declarada no ritual. A descrição indica as cláusulas adicionais que exigem o mestre.
- Quinze poderes de treinamento de *Sobrevivendo ao Horror*, entre eles **Atlético** e **Observador**, permitem registrar em combate a parcela de treinamento ou bônus ainda ausente da ficha. A escolha depende do treinamento do personagem quando adquiriu o poder. Quem já registrou esse benefício na ficha usa os valores que ela já tem.
- A aba identifica 43 entradas destinadas à progressão, preparação ou interlúdio. A descrição permanece acessível e a sala impede uma ativação ou cobrança indevida. A classificação abrange somente as entradas conferidas.

## Cobertura real

O inventário contém **933 poderes**. O relatório reproduzível `AUDITORIA-PODERES-2.9.5.json` classifica cada entrada. No snapshot desta implementação:

| Classificação | Entradas |
|---|---:|
| Algum efeito estruturado | 118 |
| Integração com ações já existentes | 7 |
| Integração passiva sem modificador separado | 13 |
| Fora do combate (progressão, preparação ou interlúdio) | 43 |
| Conferir fonte ou execução | 38 |
| Resolução/configuração do mestre | 714 |

Essas categorias não significam que todos os poderes restantes sejam ações de combate: há benefícios permanentes, preparação em interlúdio, alterações de treinamento, narrativas e regras complexas. Mesmo um poder com efeito estruturado pode ter cláusulas narrativas ou efeitos secundários resolvidos pelo mestre. **Não anunciar que os 933 poderes estão automatizados.**

O pedido de automatizar integralmente todas as habilidades ainda não está concluído. O próximo trabalho é ampliar a revisão semântica, restaurar extrações incompletas e implementar as condições/tipos de efeito que ainda faltam. A leitura livre de todo o catálogo por expressões regulares foi rejeitada após encontrar bônus inventados ou associados à cláusula errada.

## Regras específicas da mesa

Em **Efeitos de itens e habilidades**, o mestre pode escolher **Bônus de habilidade / poder** e definir ação, PE, destinatário, duração, condição e modificadores. Os tipos disponíveis incluem resultado do ataque, quantidade de d20, dano, cura, Defesa, deslocamento, dados base/extras de arma, crítico, atributos, perícias, custo e DT de rituais.

Essas regras ficam no encontro, usam a ficha real do personagem e são validadas no servidor. Elas substituem a interpretação automática daquela instância do item. Nenhum comando do jogador pode enviar um valor arbitrário de bônus no lugar da regra salva pelo mestre.

Ainda dependem de resolução específica: reações fora do turno, substituições complexas de dados (como Destino Selado), muitos estilos do Arsenal, efeitos com testes opostos, resistências condicionais, mudanças permanentes da ficha e descrições incompletas. O botão de registro de uma regra não estruturada registra seus custos e uma pendência para o mestre; não concede bônus numéricos inventados.

## Compatibilidade e dados

Os efeitos usam campos opcionais no registro do combate. Não há migração destrutiva de fichas, inventário ou backups. A única alteração de banco é `database/combat-powers.sql`, que impede enviar aos jogadores referências de inimigos ocultos em efeitos específicos de alvo. Ela mantém os tokens, permissões e controles de revisão existentes.

Poderes renomeados com NEX ou escolhas são reconhecidos pelo identificador e conteúdo compatíveis. Quando uma entrada foi reaproveitada com outro nome e descrição, ela não é silenciosamente convertida de volta ao poder original. O reconhecimento do Instrumento Elétrico de Combate corrige Artes/PRE e sua natureza à distância, preservando o bônus já escrito na fórmula de dano.

## Verificação

A revisão passou em **197 testes**, na checagem TypeScript e na compilação de produção. A interação da arena também foi verificada em DOM simulado com fichas fictícias, desde a seleção do poder até a cobrança do segundo ataque. A inspeção visual em navegador continua pendente.

- Testes do motor: custos, escolhas, escopo de arma/alvo, crítico, consumo, duração, ações extras, impossibilidade de repetir dano, comandos fora do turno e ausência de mutação após erro.
- Regressões: dados editáveis, sustentação de Velocidade Mortal, criação livre de fichas, backups, imagens, proteção de dados ocultos e salvamento concorrente.
- `npm run audit:powers`: inventaria as 933 entradas e atualiza a cobertura; não substitui revisão semântica.
- `tests/combat-powers.sql`: verifica a projeção pública com dados sintéticos e reverte todos os registros de teste.
- A revisão de segurança do banco manteve os avisos conhecidos da arquitetura por tokens: tabelas fechadas por RLS e funções públicas com validação de acesso. Não foram abertas novas permissões.

## Continuação técnica

Arquivos principais: `lib/power-rules.ts`, `lib/power-catalog.ts`, `lib/power-effects.ts`, `lib/server/combat-engine.ts`, `lib/combat-actions.ts`, `components/combat-power-controls.tsx`, `components/power-modifier-editor.tsx` e `tests/combat-powers.test.ts`.

Adicionar cada nova regra junto com exemplos positivos e negativos. Tratar separadamente bônus ao resultado, quantidade de d20, dado base de arma e dano extra. Não multiplicar dano extra no crítico por padrão. Não conceder simultaneamente alternativas de uma descrição. Não inferir afinidade sem marcação explícita nem ignorar condições de alvo/arma. Preservar a confirmação manual dos dados e a autorização pelo turno no banco e no servidor.

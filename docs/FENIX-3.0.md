# Fênix 3.0

A ficha compartilhada mostra **Minha campanha** após a confirmação de participação no elenco ativo. A central do mestre fica em **Campanhas**, na campanha selecionada. O histórico da central registra ajustes individuais e em lote, compensações, ajuda a NPCs, uso de presentes e comandos de manifestação.

## Implantação

1. Preserve um ponto de recuperação do Neon e registre privadamente a visibilidade de reputação e os vínculos anteriores dos integrantes.
2. Aplique `database/act-two.sql` em uma transação como `fenix_owner` na branch de validação. Execute `tests/act-two.sql` nessa branch. A configuração começa vazia em uma base nova.
3. Configure a campanha e os IDs verificados em `fenix_private.act_two` e `fenix_private.act_cast`. Os dossiês e o elenco preparados para a mesa ficam na branch privada de validação. Confira a campanha de cada ficha. Sincronize apenas os integrantes ativos em `fenix_combat_members` e habilite a visibilidade de suas reputações existentes em `campaign_bonds`. Preserve o valor e o histórico de cada integrante. O gatilho começa desarmado.
4. Valide typecheck, testes, build de produção e sessões independentes de mestre e jogador. Após aprovação, aplique a mesma migração e a configuração conferida na base ativa antes de promover o aplicativo.

## Retorno de versão

Desative `enabled` para a campanha afetada e restaure a implantação anterior do aplicativo. As tabelas adicionais podem permanecer instaladas. A assinatura anterior de commit de combate continua exigindo o turno do personagem. Aplique o registro de visibilidades e vínculos pré-implantação para restaurar as configurações anteriores, preservando os gastos e ajustes efetivamente realizados na sessão.

## Manifestação na 3.0.1

Em **Central do Ato II → Manifestação**, escolha o agente e um dos três momentos do dossiê. A frase pode ser editada antes do envio. **Prévia local** apresenta a cena só ao mestre. **Direção de cena** reúne efeito, posição, intensidade e duração. Para interromper uma cena enviada, abra **Controlar a ficha** e use **Encerrar efeito**. **Restaurar ficha** também remove a sombra persistente.

A confirmação registra a entrega. A manifestação continua na ficha até o prazo ou o comando do mestre, inclusive após uma reconexão. A preferência de movimento reduzido do dispositivo apresenta a arte e o texto em composição estática.

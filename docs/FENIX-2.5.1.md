# Fênix 2.5.1 — Ações extras e vozes entre as faces

## Ações extras efetivas

A concessão de uma ação ao personagem que está agindo agora grava o bônus imediatamente no saldo do turno. Antes, a resposta deixava esse bônus em uma fila de efeitos, dependente de novo cálculo na tela e do comando seguinte. A aplicação única é compartilhada pela concessão, pelas ações seguintes e pela sustentação, sem duplicar bônus após sincronizar.

Velocidade Mortal básica concede +1 movimento por turno. A versão discente concede +1 padrão por turno. No turno da conjuração, a execução padrão é cobrada normalmente. Nos turnos seguintes, **Sustentar** custa apenas 1 PE/PD como ação livre: ficam disponíveis a ação padrão original, a padrão extra da versão discente e o movimento original. A ação adicional desse ritual não permite conjurar rituais, inclusive quando for uma ação de movimento. O gasto prioriza créditos restritos para preservar as ações originais.

A interface identifica os bônus ativos e distingue Básica (+1 movimento) de Discente (+1 padrão). Efeitos sustentados podem ser encerrados no turno do conjurador mesmo depois de pagar a manutenção. O limite é um ritual sustentado, ou dois com Fluxo de Poder elegível.

Surto Temporal, Surto de Adrenalina, Estrategista e Oficial Comandante têm testes de gasto real das ações concedidas. Crânio Espiral concede uma ação padrão, sem consumir o item, uma vez por rodada. É necessário estar empunhando o crânio; o teste de Vontade, a DT cumulativa por usos no mesmo dia, o envelhecimento e o impedimento de reutilização em caso de falha continuam sob conferência do mestre. O histórico deixa essa conferência pendente. O site não possui um calendário de dias da ficção que automatize esse último controle.

Descrições simples e incondicionais, como “Você recebe uma ação padrão adicional neste turno”, ou “Você recebe +1 ação padrão”, passam a conceder o crédito quando a execução estiver informada. Não se interpreta automaticamente texto condicional, modos especiais ou benefícios restritos a uma tarefa. Para essas regras, o mestre pode configurar **Efeitos de itens e habilidades → Conceder ação**. O editor oferece agora créditos por turno até encerrar o efeito ou enquanto sustentados, além da concessão única. A configuração substitui o efeito automático e deve refletir a regra da mesa.

Ações pontuais destinadas a um aliado expiram ao terminar o turno elegível, mesmo quando o mestre avança manualmente. Não reaparecem uma rodada depois. Duas ações padrão disponíveis também podem pagar uma ação completa, convertendo uma delas em movimento.

## Troca de face de NEX

Dezesseis frases ficcionais em latim se alternam entre entrada e retorno da face, como alguém tentando alcançar o personagem. A animação dura três segundos para permitir a leitura. Na preferência de movimento reduzido ou experiência simplificada, a mensagem aparece sem a animação. Nenhuma frase altera o cânone ou os dados da ficha.

## Compatibilidade e validação

Não exige migração do banco, mudança de credenciais, limpeza de fichas ou imagens. Campos novos do saldo são opcionais e os encontros existentes continuam sendo aceitos. Recarregue a página para que mestre e jogadores usem a versão 2.5.1.

Validação: 117 testes, incluindo sequências completas após serialização JSON e chamadas HTTP com persistência simulada; verificação de tipos e compilação de produção. A inspeção visual em navegador permanece pendente devido à restrição automática de acesso vigente nesta sessão.

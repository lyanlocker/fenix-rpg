# Fênix 2.6.1 — Qualidade e sincronização

Revisão de fichas, compartilhamento, combate, credenciais locais, imagens e saída de produção. Esta atualização corrige falhas reproduzidas e acrescenta testes de regressão. Mantém as escolhas da mesa da versão 2.6: criação livre, Veterano +10, rituais nas ações padrão extras e face NEX 35 desativada com os arquivos preservados.

## Correções

- **Fichas compartilhadas:** uma edição de anotações não reenvia os PV antigos. Somente os campos alterados desde a abertura da edição são enviados. O banco compara os valores anteriores sob bloqueio da linha e devolve a ficha canônica. Se o mesmo campo mudou, a operação é recusada com uma mensagem para reabrir a edição após sincronizar. Recursos e inventário são comparados como conjuntos.
- **Equipamentos em edição:** o editor não restaura um item removido ou consumido em outro aparelho. Alterações de outros itens já recebidas pela sincronização são preservadas, assim como a posição do item na lista.
- **Link do jogador:** copiar um link existente valida o acesso sem publicar novamente o conteúdo local. O banco também deixa de substituir a ficha ao republicar um link com credenciais existentes, protegendo esse caminho em clientes antigos.
- **Pendências de dano:** eventos ainda não resolvidos permanecem no histórico e na lista do mestre mesmo após muitas ações. O limite de 40 eventos passa a valer somente para o histórico concluído. Até 100 pendências podem ficar abertas; ao alcançar esse limite, é preciso resolvê-las antes de criar outra.
- **Participantes removidos:** efeitos e créditos de ações vinculados ao participante são retirados. Pendências que envolvem o participante são encerradas com uma explicação, sem aplicar dano ou cura. Outros participantes e suas fichas são preservados.
- **Sala do mestre:** encerrar ou substituir o combate em outro aparelho também encerra a cópia compartilhada antiga neste navegador. Rascunhos locais e o histórico dos encontros permanecem disponíveis.
- **Face antiga arquivada:** o mestre pode mudar a campanha da ficha original sem que a antiga aprovação da face desativada bloqueie a gravação. O conteúdo arquivado não é alterado, e o jogador continua sem permissão para trocar a campanha.
- **Credenciais locais danificadas:** JSON inválido ou mapas com valores incompatíveis não derrubam a tela de combate. As operações de gravação recusam substituir o mapa danificado, preservando as chaves armazenadas.
- **Remoção de retrato:** a interface aguarda a gravação e exibe a falha quando a remoção não pode ser concluída.
- **Prévia estática:** CSS e JavaScript são copiados para o caminho efetivamente referenciado pelo HTML, corrigindo os arquivos ausentes na prévia. A aplicação em produção continua usando Next.js e suas APIs.

## Banco e compatibilidade

Aplicar `database/quality-saves.sql` depois de `database/interactive-combat.sql` e antes de publicar o frontend. A migração já foi aplicada ao projeto configurado. Ela adiciona `fenix_patch_shared_agent` e ajusta as funções de gravação/publicação; não reescreve as linhas das fichas, não altera tabelas e não troca credenciais existentes.

A nova função valida a chave da ficha, os campos editáveis e os valores anteriores; a gravação passa pelas mesmas restrições de campanha e combate da função existente. As tabelas continuam privadas e sem acesso direto para jogadores. A revisão dos avisos do banco mostrou somente o acréscimo esperado da nova RPC com autenticação por chave; os avisos anteriores permanecem registrados.

Clientes já abertos precisam recarregar a página para usar a edição parcial. A função legada de gravação continua disponível por compatibilidade; clientes antigos ainda podem enviar fichas completas por esse caminho.

## Verificações

- 136 testes automatizados de regras, ações, sincronização, ameaças, importação, imagens e prévia, incluindo 12 novos casos de regressão.
- TypeScript e compilação de produção.
- Verificação dos arquivos CSS/JS referenciados na prévia gerada.
- `tests/quality-saves.sql`: link sem sobrescrita, edição parcial, conflito, autenticação, campanha e arquivo preservado; dados sintéticos revertidos ao final.
- `tests/interactive-combat.sql`: permissões do jogador/mestre, privacidade, revogação de acesso, turno, gravação atômica e proteção de recursos também pela nova RPC; dados e capacidade temporária revertidos ao final.
- `tests/alternate-security.sql`: permissões e preservação das faces históricas, com transação revertida.

A inspeção visual em navegador não foi executada nesta sessão: a revisão automática de aprovação bloqueou o acesso ao ambiente de navegação. Os testes automatizados não substituem uma sessão real com vários jogadores. Efeitos condicionais, alcance, resistências e outras regras já descritas como manuais continuam sob decisão do mestre.

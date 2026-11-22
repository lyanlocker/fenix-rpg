# Fênix 2.10.0 — O Último Pecado

## Catálogo

Na Biblioteca, selecione fonte **O Último Pecado · Jianghu** e categoria **Item paranormal**. Os seis presentes incluem as imagens WebP, categoria III, efeitos, custos, alcance e três cargas. Adicione ao Inventário de cada personagem. O contador de cargas fica no item, preservado pelo compartilhamento e pelo combate; não se recupera no descanso. Não remova e readicione o item para resetar cargas. O vínculo possuído é narrativo e deve ser administrado exclusivamente pelo mestre, sem texto secreto no material dos jogadores.

| Item | Ativação | Tratamento na sala de combate |
| --- | --- | --- |
| Carimbo do Esquecimento | Padrão, 4 PE/PD | Gasto registrado, mestre resolve ocultação e duração |
| Contador da Eternidade | Livre, 5 PE/PD | Concede uma ação padrão e uma de movimento |
| Luva da Dívida Carmesim | Reação, 4 PE/PD | Registra gatilho; mestre administra absorção, descarga e retorno |
| Chave do Entreposto | Padrão, 5 PE/PD | Rola 4d8, aplica indicador e -5 Defesa até o próximo turno do usuário; mestre confirma Reflexos, RD -10 e dano final |
| A Última Palavra | Reação, 4 PE/PD | Registra tentativa de retratação; mestre confirma Vontade e anulação |
| Dado do Destino | Reação, 3 PE/PD | Rola 1d6 (e 2d6 na face 1); mestre aplica a consequência ao teste original |

As reações ficam disponíveis também fora do turno. O mestre deve validar alcance, momento e demais requisitos que não são modelados no tabuleiro. O sistema de combate já depende de confirmação do mestre para dano final e efeitos narrativos. A ficha registra cargas e PE/PD, mas ainda permite ao mestre editar inventários e não estabelece custódia permanente de um item removido/reincluído. Os efeitos de possessão não são expostos no catálogo.

## Relações e reputação

1. Em **Campanhas**, selecione a mesa e clique em **Sincronizar elenco para relações**. Isso usa as chaves de mestre das fichas e da campanha; não inicia o combate. Outros personagens não autorizados não entram no elenco. A sincronização deve ser repetida quando novos personagens forem adicionados.
2. Na aba **Descrição**, cada personagem pode atribuir 0–3 corações aos aliados daquela campanha; os vínculos são direcionais. O token circular usa o retrato da ficha, com nome e corações abaixo.
3. Ativar uma relação dá 1d8, 1d10 ou 1d12 em todos os testes, incluindo iniciativa e combate, enquanto estiver ativa. A relação é consumida uma única vez por personagem/campanha: mudar os corações, fechar a cena ou recarregar não devolve a utilização. Dano e cura não ganham o dado.
4. O mestre clica em **Encerrar relações da cena** na campanha ao fim da cena narrativa. Também é possível encerrar voluntariamente apenas a própria relação pela ficha. A cena não é inferida automaticamente de uma mudança de turno.
5. A morte definitiva não é deduzida de PV 0. Na aba Descrição da ficha do falecido, o mestre registra **Falecimento** uma única vez; os personagens que possuem vínculo com ele perdem 2d8, 2d10 ou 2d12 de SAN conforme seus corações. Essa operação usa registro transacional e não confunde morrer com ficar inconsciente.
6. **Resumo** mostra a reputação de -100 a 100, inicialmente zero. O mestre ajusta o valor, libera ou oculta a visualização. A API não transmite a reputação oculta ao jogador. O valor persiste após ocultar e revelar.

## Implantação da versão

Aplicar `database/campaign-bonds.sql` **após** `quality-saves.sql` e `interactive-combat.sql`, no projeto Supabase correspondente à implantação, antes de liberar o novo site. A migração adiciona estado privado por personagem/campanha e RPCs com as chaves existentes como autoridade. Não muda os dados de fichas existentes até que o mestre ou jogador execute uma ação. É idempotente. Não substitui o backup das chaves da campanha.

Validação: `npm run typecheck`, `npm test`, `npm run build`. O arquivo `tests/campaign-bonds.sql` usa apenas fixtures sintéticas em transação e deve ser executado em ambiente isolado após a migração. Não executar os testes SQL no banco ativo da campanha. Rever as permissões e consultar os advisors de segurança antes da implantação em produção.

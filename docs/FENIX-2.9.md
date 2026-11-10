# Fênix 2.9 — Arquivo de fichas e símbolos

## Fichas e backups

Na tela **Agentes**, cada ficha do mestre tem os botões **Backup no GitHub** e **Excluir**. Os botões não aparecem no acesso do jogador.

Para guardar uma cópia:

1. Conecte a conta proprietária pelo painel **Conectar GitHub** em Agentes.
2. Clique em **Backup no GitHub** na ficha e defina uma senha com pelo menos 12 caracteres.
3. Confirme o envio e guarde a senha fora do site. Também é possível baixar a cópia protegida.

Cada envio cria uma versão independente. O backup é manual: alterações posteriores da ficha precisam de um novo envio. Se a ficha já for compartilhada, o site consulta os dados atuais do servidor antes de gerar a cópia. A cópia inclui os dois perfis arquivados, imagens incorporadas e chaves locais do mestre/jogador, quando disponíveis. Imagens hospedadas no repositório continuam referenciadas por seus caminhos ou commits.

O repositório é público, por isso a ficha e suas chaves são criptografadas **no navegador**, antes de sair do aparelho. A senha não é enviada ao servidor nem fica salva no site. Não existe recuperação da senha. Use uma frase longa e exclusiva; mantenha também uma cópia baixada. Nenhum serviço de armazenamento garante retenção eterna.

As cópias são gravadas em `fenix-backups`, uma branch separada do código, sem iniciar uma publicação do site. Nomes de personagens e chaves não aparecem nos arquivos públicos em texto aberto. A lista pode mostrar o nome no navegador que fez o backup; em outro aparelho, identifica a versão por data/hora até abrir com a senha.

### Recuperar uma ficha

Em **Agentes → Restaurar backup**, escolha uma versão do GitHub ou abra um arquivo protegido baixado, informe a senha e confira a ficha antes de restaurar:

- **Restaurar como nova ficha** cria uma cópia com outro identificador, sem substituir fichas existentes. O vínculo da cópia com campanhas precisa ser escolhido novamente.
- **Recuperar acesso à original** reaproveita as chaves guardadas e consulta a ficha compartilhada atual. Não substitui o servidor pelos dados antigos do backup. Essa opção exige que a original ainda exista e a chave de mestre continue válida.

Se a original tiver sido excluída, restaure uma nova ficha e gere outro link para o jogador.

### Excluir

Escolha entre excluir apenas a cópia do navegador ou excluir a ficha compartilhada junto com a cópia local. Digite o nome da ficha para confirmar. A exclusão compartilhada exige a chave de mestre daquela ficha; outra chave ou a chave de jogador não autoriza a operação.

A exclusão compartilhada encerra os links e remove o histórico compartilhado associado. Backups já enviados ao GitHub permanecem. Se a ficha participar de um combate compartilhado ainda aberto, inclusive pausado, remova-a do encontro ou encerre o combate antes de excluir. A exclusão local preserva o servidor e as chaves; outro navegador pode continuar mostrando sua própria cópia.

## Imagens e rituais

A biblioteca, a ficha e os detalhes da ação selecionada no combate exibem os símbolos disponíveis. Clique na miniatura para ampliar. A ampliação informa a fonte real da imagem, inclusive quando um ritual equivalente de outra edição reutiliza a arte do Arsenal.

- Há símbolos em **769 dos 1.000 registros de rituais** do catálogo. Os 231 restantes incluem duplicações entre livros; 115 nomes do Arsenal não têm ilustração associada nas páginas conferidas. Os PDFs da Biblioteca Ritualística e de Arquivos Secretos #6 não estavam disponíveis.
- As 788 imagens e miniaturas WebP somam **29.039.162 bytes (29,04 MB)**. O maior arquivo tem 887 KB. Miniaturas têm média de 25 KB, carregam sob demanda e usam cache; o visitante não baixa a coleção inteira na entrada.
- Nenhum símbolo substituto foi inventado. Imagens pequenas mantêm a resolução disponível no PDF original. Veja a [relação completa, equivalências e limites](RITUAIS-ILUSTRADOS.md).

Ao criar ou editar um ritual, arma ou equipamento, use **Adicionar imagem**. São aceitos PNG, JPEG e WebP de até 20 MB; o navegador reduz a imagem para até 640 px antes de salvar. Rituais próprios continuam disponíveis pela criação de conteúdo na biblioteca e pela ficha.

Com o GitHub conectado pelo proprietário, a opção **Salvar a imagem no GitHub ao concluir** publica a imagem e guarda apenas sua referência na ficha. Essa imagem será pública. Sem essa opção, a imagem compactada fica incorporada à ficha e ao backup. Jogadores não recebem a conexão administrativa do proprietário. Alterar uma imagem de ritual de livro na ficha personaliza aquela cópia; o catálogo original continua disponível.

## Instalação e validação

A migração `database/sheet-archive.sql` instala `fenix_delete_shared_agent`, sem excluir fichas existentes. Ela depende das migrações de compartilhamento e combate já presentes no projeto. Foi aplicada ao projeto configurado em 10/11/2026.

O teste transacional `tests/sheet-archive.sql` passou com fichas sintéticas e rollback: bloqueio de jogador, chave incorreta e chave ausente; proteção durante combate aberto; exclusão pelo mestre; limpeza de registros relacionados; revogação do link; preservação de outra ficha. Os dados reais não foram usados como fixtures.

Os 144 testes de código passaram. As verificações cobrem ida e volta da criptografia, senha incorreta, adulteração, preservação de versões, isolamento da branch de backups, conflitos no envio de imagens, importação com imagens, integridade de todos os WebPs e associação dos símbolos. A verificação de tipos e a compilação de produção, incluindo a prévia estática, também passaram. A inspeção interativa pelo navegador não esteve disponível nesta sessão; as folhas de contato dos símbolos foram conferidas visualmente.

### Limites operacionais

Backups aceitam até 16 MB de conteúdo antes da compactação e 2,7 MB de conteúdo criptografado, para respeitar o limite da requisição; fotos grandes podem exigir redução. A listagem aceita até 500 versões. O site não apaga versões automaticamente. Guarde cópias externas antes de organizar manualmente a branch. O formato usa AES-256-GCM, PBKDF2-SHA256 com 600.000 iterações, salt e IV aleatórios, gzip e autenticação do cabeçalho. A API recebe somente o envelope criptografado.

A conexão com GitHub continua exclusiva de `lyanlocker/fenix-rpg`, via sessão HttpOnly e validação do proprietário. As gravações preservam o estado mais recente da branch e não usam force push. Prévia e produção mantêm a separação de acesso administrativo já existente.

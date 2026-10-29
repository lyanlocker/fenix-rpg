# Fênix 2.3 — catálogo conectado ao GitHub

## Uso

Em **Ameaças**, use **Adicionar imagem** ou **Trocar imagem** em qualquer criatura, inclusive nos livros. A imagem personalizada prevalece na galeria, nos detalhes, no combate do mestre e na apresentação. **Restaurar imagem original** remove apenas a personalização: os dados do livro são preservados.

**Nova ameaça**, **Editar** e **Importar** publicam as criaturas próprias no repositório `lyanlocker/fenix-rpg`, branch `main`. Não enviam fichas de agentes, campanhas, chaves de compartilhamento ou o restante do armazenamento local. Ameaças locais antigas continuam acessíveis; para publicá-las, abra **Editar** e salve. O acervo publicado fica disponível a todos que usam este site. Importações grandes são enviadas em lotes de 20; a mensagem informa quantas criaturas já foram salvas se um lote falhar.

Antes de publicar, clique em **Conectar GitHub**. O proprietário deve criar uma autorização fine-grained, selecionar somente `fenix-rpg` e conceder **Contents: Read and write**. Cole o token somente no campo de senha do próprio site. Não é necessário enviá-lo por chat ou gravá-lo no código. A conexão dura até oito horas; **Desconectar** encerra a sessão local. A expiração ou revogação do token no GitHub também bloqueia novas gravações. As fichas e o jogo não exigem essa conexão.

Salvar faz um commit direto na `main`, autorizado pelo proprietário. A integração Git existente inicia uma publicação da Vercel. O dono vê as imagens já gravadas por URLs imutáveis do GitHub enquanto aguarda a publicação. As demais sessões recebem o novo acervo ao recarregar depois que a publicação estiver pronta. Em repositórios privados, essa visualização imediata é omitida e é necessário aguardar a publicação.

## Configuração do servidor

- `FENIX_GITHUB_SESSION_SECRET`: segredo aleatório de pelo menos 32 caracteres, armazenado somente no ambiente de produção da Vercel. Nunca usar prefixo `NEXT_PUBLIC_`.
- `FENIX_GITHUB_ORIGIN`: `https://fenix-rpg-pink.vercel.app`.
- O usuário permitido é verificado pelo ID imutável `250854113` e o repositório por `1377507508`. Destino e branch não vêm do navegador.
- Prévia da Vercel não aceita conexões nem gravações no repositório de produção.

O token pessoal pertence ao usuário, não ao aplicativo: não há token compartilhado embutido. Ele é validado no GitHub, cifrado com AES-256-GCM em cookie `__Host-`, `HttpOnly`, `Secure`, `SameSite=Strict`, vinculado à origem e com validade de oito horas. Todas as gravações validam origem, sessão, proprietário e permissão no GitHub. Nenhuma resposta ou log inclui o token. Um administrador pode revogar todas as sessões rotacionando o segredo e publicando novamente.

## Arquivos e limites

- Metadados: `lib/data/threat-library.json` (version 1, threats, art).
- Imagens: `public/art/custom/<sha256>.webp`.
- Entrada: PNG/JPEG/WebP de até 20 MB e 40 megapixels no navegador; enviada como WebP reduzido para até 1280 px. O servidor valida novamente o formato, limita pixels, remove metadados, reencoda para até 1024 px e gera miniatura de até 320 px.
- Requisição de gravação limitada a 3 MB; catálogo personalizado limitado a 2 MB e 1000 criaturas.
- Arquivos com hash têm cache imutável; a galeria continua paginada e carrega miniaturas sob demanda.
- A Vercel continua servindo as imagens estáticas do deploy. Armazená-las no GitHub não elimina tráfego ou armazenamento da hospedagem; reduzimos transferências com otimização e cache. O histórico Git guarda versões anteriores.

Imagem, miniatura e metadados entram em um único commit. A gravação usa a revisão do catálogo e atualização sem force da referência Git: conflitos são reportados, nunca substituídos silenciosamente. Alterações independentes de código podem ser reaplicadas sobre a nova base uma vez, preservando a árvore existente. Uma falha de rede de resultado desconhecido pede **Atualizar catálogo** antes da nova tentativa.

## Preservação e verificação

As chaves de armazenamento de fichas e os serviços de compartilhamento não mudam. Estatísticas oficiais são rejeitadas pela API de edição; apenas suas imagens recebem substituições. A publicação da apresentação continua filtrando participantes ocultos e estatísticas privadas.

Testes cobrem sessão cifrada, expiração/origem, autorização, entradas inválidas, imagens falsas, WebP e miniaturas, atomicidade do commit, concorrência e preservação dos livros/fichas. O envio real requer a autorização do proprietário no site; testes automatizados usam uma API Git simulada e não criam criaturas de teste na produção.

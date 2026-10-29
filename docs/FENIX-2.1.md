# Fênix 2.1 — Ameaças ilustradas

O catálogo e o combate do mestre passam a exibir as ilustrações das ameaças. Na aba de apresentação, o mestre pode escolher um participante revelado para ampliar sua imagem e voltar à visão geral a qualquer momento.

## O que foi incluído

- 74 artes originais extraídas dos PDFs fornecidos: 50 do Livro de Regras, 15 de Sobrevivendo ao Horror e 9 de Arquivos Secretos #7.
- Galeria paginada com miniaturas, filtro “Somente com ilustração” e ampliação por clique.
- Ilustração na consulta da ameaça, com referência da fonte, e miniaturas na iniciativa e nos participantes do painel do mestre.
- Controle “Destaque na apresentação”: amplia uma arte ou retrato na aba destinada à mesa.
- Ao ocultar ou remover o participante em destaque, sua imagem e identidade saem do quadro transmitido. Rolagens secretas e informações privadas continuam excluídas.
- Exportar/importar o catálogo preserva a associação da arte nas cópias próprias, por identificador, sem inserir a imagem no JSON.
- Ameaças sem arte confirmada e falhas de carregamento exibem um símbolo de reserva.

## Como usar na sessão

1. Abra **Ameaças**, ative **Somente com ilustração** e clique na imagem para ampliá-la.
2. Em **Campanhas → Combate**, adicione uma ameaça ilustrada. Encontros antigos que já usam seu identificador também passam a exibir a arte.
3. Clique em **Abrir apresentação**. Mantenha o painel do mestre aberto no mesmo navegador.
4. Use o olho do participante para revelá-lo. Só os participantes revelados aparecem na apresentação e no seletor de destaque.
5. Escolha o participante em **Destaque na apresentação**. Use **Voltar à visão geral** para recolher a imagem.
6. Compartilhe a aba de apresentação com a mesa. Ela continua sendo uma segunda aba do navegador do mestre; esta atualização não cria uma transmissão remota por link.

As ilustrações foram integradas ao catálogo, ao painel do mestre e à aba de apresentação. A tela compacta de combate dentro do link individual do jogador mantém seu funcionamento anterior; o protocolo do banco não foi alterado.

## Peso e carregamento

As 148 imagens WebP (uma miniatura e uma versão maior por ameaça) totalizam **8.185.334 bytes, cerca de 8,2 MB** no projeto. Esse total não é baixado ao abrir a página inicial. As imagens entram conforme são exibidas; a galeria mostra até 24 registros por página.

- Miniaturas: até 320 pixels no maior lado.
- Ampliações: até 1.024 pixels no maior lado, sem aumentar artificialmente fontes menores.
- Imagens maiores usadas na consulta/ampliação e no destaque; miniaturas na galeria e na ordem de combate.
- Arquivos em `public/art/threats`, servidos pelo próprio site. Nenhum link externo de imagem ou processamento pago de imagens é necessário para estas artes.
- Nomes incluem hash do conteúdo, com cache de um ano. Uma arte atualizada recebe uma URL diferente.
- Transparência original preservada quando disponível; composições com cenário ou texto da própria ilustração mantêm esses elementos.

## Compatibilidade com as fichas

A atualização não altera `fenix.workspace.v1`, o formato das fichas, seus identificadores, as chaves de compartilhamento, as funções do banco ou as migrações. Não há passo SQL. As imagens são arquivos do site e não ocupam o armazenamento das fichas.

Para manter acesso às fichas locais e às chaves do mestre, continue usando o mesmo endereço do site, navegador e perfil. Uma prévia em outro endereço possui armazenamento local separado e pode exibir somente os dados de exemplo. Isso não significa que os dados do endereço original foram apagados. Exporte suas fichas antes de aplicar a atualização e não limpe os dados do navegador.

## Cobertura e manutenção

O catálogo mantém seus 140 registros; 74 receberam arte confirmada. As outras 66 entradas continuam utilizáveis. Os PDFs de Guia das Marcas e Arquivos Secretos #6 não estavam disponíveis; nos demais casos não foi associada uma ilustração sem identificação segura. A lista completa está em [AMEACAS-ILUSTRADAS.md](AMEACAS-ILUSTRADAS.md).

O manifesto `lib/data/threat-art.json` relaciona cada ameaça às duas imagens e à página de origem. `scripts/threat-art-selection.json` registra a seleção revisada. Para regenerar as artes com as mesmas edições locais, use `python3 scripts/build-threat-art.py /caminho/dos/pdfs`, com PyMuPDF e Pillow instalados. Os hashes dos PDFs são verificados antes da extração. Os PDFs não são incluídos no site; Python e os livros não são necessários para instalar, compilar ou publicar esta atualização.

## Verificação desta entrega

- 48 testes automatizados aprovados, incluindo referências de imagens, importação de catálogos anteriores, preservação de participantes e fichas, retratos de agentes e bloqueio de destaque de ameaças ocultas/removidas.
- TypeScript e compilação de produção aprovados.
- As 148 imagens foram decodificadas e suas dimensões, hashes, caminhos e tamanhos conferidos. As 74 associações foram revisadas visualmente.
- Respostas HTTP locais de `/`, `/ameacas` e `/apresentacao` aprovadas; amostras de miniatura e ampliação retornaram o conteúdo esperado com o cabeçalho de cache.
- A navegação visual completa da versão 2.1 em navegador e celular ainda precisa ser conferida na sua prévia. O navegador de inspeção disponível não alcança o servidor local deste ambiente. Os testes de integração com o banco real não foram repetidos: esta entrega não muda o banco ou o compartilhamento.

## Conferência antes de publicar

Na cópia local ou prévia, confira busca/filtro, ampliação e fechamento por Escape, layout no celular, adição de ameaça, revelação/ocultação e troca do destaque. Confirme que a aba de apresentação não mostra PV, condições privadas ou rolagens secretas. No endereço original, após publicar, confira uma ficha antiga e sua face alternativa sem reimportar ou limpar o navegador.

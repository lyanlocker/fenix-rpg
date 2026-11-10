# Símbolos dos rituais — Fênix 2.9

Os símbolos foram extraídos das imagens embutidas nos PDFs fornecidos, com a máscara de transparência e a orientação da página preservadas. Não foram gerados desenhos, símbolos substitutos nem recortes de páginas completas. A associação foi revisada pelo título e pela posição da ilustração na fonte, incluindo páginas de continuação.

## Cobertura do catálogo

| Fonte do registro | Rituais | Com símbolo | Sem símbolo | Origem da imagem |
| --- | ---: | ---: | ---: | --- |
| Livro de Regras v1.3 (`01`) | 82 | 82 | 0 | PDF da própria fonte |
| EaF — Biblioteca Ritualística 0.7.5 (`03`) | 450 | 335 | 115 | Ritual equivalente no Arsenal; PDF da Biblioteca indisponível |
| Arquivos Secretos #7 (`04`) | 1 | 1 | 0 | Vampirismo, PDF 76 |
| EaF — Arsenal dos Agentes 0.91 (`05`) | 450 | 335 | 115 | PDF da própria fonte |
| Arquivos Secretos #6 (`06`) | 1 | 0 | 1 | PDF indisponível |
| Sobrevivendo ao Horror (`07`) | 16 | 16 | 0 | PDF da própria fonte |
| **Total** | **1.000** | **769** | **231** | **434 entradas com extração direta e 335 equivalências** |

As 231 ausências são registros de catálogo, não necessariamente rituais distintos: os mesmos 115 nomes aparecem nas duas coleções EaF. Não se afirma que a fonte Biblioteca não tenha arte; seu PDF não estava disponível para conferência.

## Peso dos arquivos

Medição final em 10/11/2026, antes do envio:

| Medida | Resultado |
| --- | ---: |
| Arquivos WebP únicos, incluindo miniaturas | 788 |
| Imagens maiores distintas | 433 |
| Tamanho total | 29.039.162 bytes (29,04 MB / 27,69 MiB) |
| Maior arquivo | 887.262 bytes (887 KB) |
| Miniaturas distintas | 433 |
| Média por miniatura | 24.903 bytes (25 KB) |
| Maior miniatura | 63.170 bytes (63 KB) |

434 entradas diretas compartilham 433 imagens distintas; uma imagem idêntica é reutilizada. Imagens nativas pequenas usam o mesmo arquivo para miniatura e ampliação. Os 335 vínculos da Biblioteca reutilizam os arquivos do Arsenal, sem duplicar bytes. A interface carrega as miniaturas sob demanda e abre a imagem maior apenas na ampliação; os 29 MB não são baixados de uma vez ao entrar no site. Os caminhos identificam o conteúdo, permitindo cache de longa duração.

## Qualidade, formatos e associação

- A imagem maior usa WebP sem perda, até 960 × 960 px; a miniatura usa WebP com qualidade 88, até 256 × 256 px.
- Imagens menores não são ampliadas artificialmente. Vários símbolos do PDF comprimido do Livro de Regras têm cerca de 154 px nativos; o limite vem da fonte disponível.
- A tinta e as cores da fonte são preservadas. A maioria é preta com fundo transparente; Vampirismo é vermelho. Um fundo claro na interface mantém a leitura.
- Rotação ortogonal não interpola os pixels. Quando a fonte tem transformação inclinada, como Vampirismo, ela é aplicada à imagem extraída.
- Nomes de arquivo são os 20 primeiros caracteres do SHA-256 do próprio WebP. Imagens idênticas são compartilhadas; o manifesto não incorpora dados base64.
- A revisão visual cobriu os 434 registros extraídos, em 13 folhas de contato, além da conferência das páginas com símbolos ambíguos e variantes.

O manifesto `lib/ritual-art.json` usa os IDs reais de `lib/data/book-catalog.json`. Cada registro contém caminho, miniatura, dimensões, bytes e referência à fonte da **imagem**. `pdfPage` é a página física do PDF, iniciando em 1; `page` é a numeração impressa. Os deslocamentos são 10 para Livro de Regras, 2 para Arsenal, 1 para Sobrevivendo ao Horror e 0 para AS07. Quando a arte está na continuação, o manifesto aponta a página efetiva da arte.

### Equivalências entre as coleções EaF

Foram conferidos 334 pares com o mesmo nome normalizado, elemento e círculo, comparando a descrição do efeito entre os registros. As descrições podem conter revisões de regras entre as edições; esta atualização associa apenas a ilustração e não altera essas regras. Um par adicional tem nome alterado: **Pacto Inconsciente** (Biblioteca, PDF 204) e **Passagem de Sangue** (Arsenal, PDF 329). Nesse caso, o texto do efeito, o texto de Verdadeiro e os metadados de execução, alvo, duração, resistência, elemento e círculo são idênticos no catálogo.

Todas essas 335 referências informam `bookId: "05"`, atribuindo a arte ao Arsenal. Elas não afirmam que a imagem foi extraída da Biblioteca. O mapeamento completo e a exceção de nome estão em `scripts/ritual-art-regions.json`.

### Rituais com variantes na fonte

As ilustrações separadas de um mesmo registro foram dispostas em uma única imagem transparente, na ordem em que aparecem na fonte, sem inventar legendas de elementos:

| Ritual | Ilustrações preservadas |
| --- | ---: |
| Amaldiçoar Arma | 4 |
| Portal Pessoal / 1º Círculo | 3 |
| Solas Deslizantes / 1º Círculo | 3 |
| Cordas de Contenção / 2º Círculo | 4 |
| Prisão do Ser / 3º Círculo | 2 |
| Véu Translúcido / 3º Círculo | 3 |
| Tempestade de Ideias / 4º Círculo | 2 |

Outras imagens já têm mais de um símbolo dentro do próprio arquivo da fonte; elas são preservadas integralmente.

## Rituais sem símbolo disponível

Os rituais abaixo não têm uma imagem associada à respectiva entrada ou continuação no PDF do Arsenal fornecido. O registro correspondente na Biblioteca também permanece sem imagem, pois seu PDF não foi fornecido. As páginas desta tabela são páginas físicas de PDF, conforme o catálogo, iniciando em 1.

| Ritual | Arsenal: página PDF | Biblioteca: página PDF |
| --- | ---: | ---: |
| Molde Capilar | 265 | 23 |
| Sangue Suculento | 267 | 25 |
| Alegoria das Sombras | 268 | 26 |
| Folhear | 270 | 28 |
| Máscara Quebrada | 271 | 29 |
| Saber Marcial | 274 | 32 |
| Cordas Mágicas | 276 | 34 |
| Emulsão Bélica | 277 | 35 |
| Estrutura de Distribuição | 278 | 36 |
| Não, Não! | 281 | 39 |
| Bafo Podre | 284 | 42 |
| Desligamento Total | 286 | 44 |
| Link Fotográfico | 287 | 45 |
| Exceder a Membrana | 292 | 50 |
| Esconderijo Interno | 298 | 62 |
| Escudo de Carne | 298 | 62 |
| Expansão Muscular | 299 | 63 |
| Poluição Mental | 303 | 67 |
| Possessividade Tóxica | 304 | 68 |
| Respiração Controlada | 306 | 70 |
| Sentir o Sangue | 308 | 72 |
| Coração de Pedra | 310 | 133 |
| Corpo Que Age | 311 | 134 |
| Frequência do Coração | 315 | 138 |
| Ilusões Agressivas | 316 | 139 |
| Mente Blindada | 316 | 139 |
| Sucção Sanguínea | 320 | 143 |
| Violência Pragmática | 321 | 144 |
| Área de Reação | 323 | 198 |
| Dor da Morte | 324 | 199 |
| Essência Impura | 325 | 200 |
| Mutualismo | 326 | 201 |
| Saliva Cicatrizante | 330 | 205 |
| Banho de Sangue | 336 | 260 |
| Crescer Para Evoluir | 337 | 261 |
| Fim Emocionante | 339 | 263 |
| Grunhido Enlouquecedor | 339 | 263 |
| Repulsa Desoladora | 342 | 266 |
| Sacrifício Conjunto | 342 | 266 |
| Cacos de Vidro | 345 | 74 |
| Caminhos Seguros | 346 | 75 |
| Figura Repulsiva | 348 | 77 |
| Frequências Individuais | 349 | 78 |
| Sigilo de Segurança | 355 | 84 |
| Sussurros da Vitória | 356 | 85 |
| Tesouro Vivo | 356 | 85 |
| Visão da Criação | 357 | 86 |
| Vozes Internas | 358 | 87 |
| Zooglosia | 359 | 88 |
| Palma Fractal | 366 | 151 |
| Precisamos Conversar | 366 | 151 |
| Prisão de Lembranças | 367 | 152 |
| Wom Wom Wom | 370 | 155 |
| Campo de Visão | 371 | 211 |
| Indagações Oníricas | 375 | 215 |
| Sombra Fatal | 379 | 219 |
| Verum Crucis | 379 | 219 |
| Mundo Plano | 384 | 271 |
| Tatuar Na Mente | 385 | 272 |
| Treinamento de Morfeu | 386 | 273 |
| Bloqueio | 387 | 89 |
| Catalisador Cósmico | 388 | 90 |
| Criação Sonora | 390 | 92 |
| Ilusões Espalhafatosas | 394 | 96 |
| Incômodo Padrão | 394 | 96 |
| Injeção Gasosa | 394 | 96 |
| Pareamento de Transporte | 397 | 99 |
| Reflexo Rochoso | 400 | 102 |
| Ventinho | 402 | 104 |
| Armas da Natureza | 404 | 157 |
| Capacete de Interferência | 408 | 161 |
| Conexão Acelerada | 408 | 161 |
| Correntes de Vento | 409 | 162 |
| Revolta da Natureza | 413 | 166 |
| Simplicidade Caótica | 414 | 167 |
| Cobrança de Energia | 423 | 225 |
| Eco Artificial | 427 | 229 |
| Expor Ao Ridículo | 429 | 231 |
| Propulsão a Jato | 433 | 235 |
| Manipular Densidade | 436 | 276 |
| Mudanças Inconsistentes | 436 | 276 |
| Repetição Fractal | 438 | 278 |
| Revisão | 438 | 278 |
| Santa Luz | 439 | 279 |
| Atrair o Fim | 441 | 105 |
| Bloqueio Parassocial | 441 | 105 |
| Coceira Óssea | 443 | 107 |
| Contato Morto | 444 | 108 |
| Convencimento Culposo | 444 | 108 |
| Erros do Passado | 446 | 110 |
| Espiral Crescrente | 447 | 111 |
| Golpe Atemporal | 449 | 113 |
| Gosma Obscura | 449 | 113 |
| Imersão Futura | 450 | 114 |
| Redemoinho da Morte | 452 | 116 |
| Revelação Cadavérica | 453 | 117 |
| Apagar Essência | 456 | 172 |
| Coluna Espiral | 457 | 173 |
| Contratempo | 458 | 174 |
| Cúpula de Lodo | 458 | 174 |
| Decomposição Proposital | 459 | 175 |
| Espiritualidade Onírica | 460 | 176 |
| Extração Existencial | 461 | 177 |
| Golpes Atrasados | 462 | 178 |
| Palma Pálida | 464 | 180 |
| Vómito Pútrido | 466 | 182 |
| Ataque Além do Tempo | 468 | 237 |
| Recuperação Forçada | 472 | 241 |
| Reprimir Sentidos | 472 | 241 |
| Selo de Sepultamento | 473 | 242 |
| Sinais do Futuro | 474 | 243 |
| Ascender | 486 | 120 |
| Recuperação Medonha | 488 | 122 |
| Saberes Proibidos | 488 | 122 |
| Geração Final | 498 | 251 |

**Hesitação Forçada**, Arquivos Secretos #6, página PDF 72 no catálogo, também permanece sem imagem porque o PDF dessa fonte não estava disponível.

O Arsenal contém a arte de **Características Inconvenientes** na página PDF 275, mas esse ritual não consta no catálogo atual. Ela não foi atribuída a outro nome nem incluída como conteúdo novo nesta atualização.

## Regeneração e verificação

Dependências: Python 3, PyMuPDF (`fitz`) e Pillow com suporte a WebP. Na raiz do repositório:

```bash
python scripts/build-ritual-art.py /caminho/para/os/pdfs
```

O script lê `scripts/ritual-art-regions.json`, confere o SHA-256 dos quatro PDFs e extrai cada imagem pelo `xref`, página e posição revisados. Uma edição diferente falha na verificação em vez de associar silenciosamente outra imagem. O script escreve apenas a pasta `public/art/rituals/` e o manifesto; não publica nem envia arquivos. O processamento sem perda de centenas de imagens pode levar alguns minutos.

A verificação final confere os IDs do catálogo, os arquivos referenciados, dimensões, limites de resolução, canais de transparência, bytes e hashes dos nomes, e a ausência de arquivos órfãos. Os PDFs de origem não são adicionados ao site.

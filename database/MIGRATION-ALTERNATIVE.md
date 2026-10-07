# Alternativa PostgreSQL para o Fênix

O site permanece no Supabase. Esta preparação fornece exportação e restauração
do backend compartilhado; ainda não configura um projeto Neon nem muda produção.

## Dados e compatibilidade

O pacote inclui as seis tabelas atualmente utilizadas: fichas, hashes das chaves
de jogador/mestre, rolagens, avisos NEX 35, Infecção, salas e membros de combate.
Os retratos embutidos também são preservados. As funções são exportadas do banco
atual, incluindo as validações de poderes e rituais, para evitar restaurar versões
antigas dos arquivos SQL do repositório. Não exporta funções legadas de autenticação.

Campanhas, encontros locais, ameaças próprias e as chaves em texto dos navegadores
continuam no `localStorage`. Antes de migrar, exportar o workspace local do mestre
e guardar também `fenix.share-links.v1` e `fenix.combat-keys.v1` em um backup privado.
Os hashes do banco não permitem recuperar essas chaves. Nunca salvar os backups
no GitHub, no diretório público do site ou no catálogo de ameaças.

O catálogo dos livros já está no repositório e não depende do banco. Preservar IDs
e hashes permite manter os links antigos quando a API alternativa estiver pronta.

## Exportação preparada

Requer Python 3 e utilitários PostgreSQL 17 ou superior. Configurar a conexão
direta ou o pooler de sessão em `FENIX_SOURCE_DATABASE_URL`, em ambiente privado.
O script opera com transações somente de leitura; não altera as fichas de origem.

```sh
python scripts/prepare_postgres_migration.py migration-backups/pre-cutover
```

O diretório deve ser novo. O pacote inclui `shared.dump`, `functions.sql`,
`archive-list.txt` e `manifest.json` com checksums. A contagem registrada é uma
observação posterior ao dump; pode variar se os jogadores estiverem editando.
O dump das tabelas é consistente. Para o corte definitivo, suspender brevemente
as gravações, gerar outro pacote e então conferir contagens exatas.

## Restauração preparada

Configurar `FENIX_ALTERNATIVE_DATABASE_URL` apontando para uma base PostgreSQL
vazia, como uma base de teste no Neon. A ferramenta recusa bases com tabelas
existentes, confere checksums e não apaga ou sobrescreve dados do destino.
O `pgcrypto` precisa estar no schema `extensions`, como na origem.

```sh
python scripts/restore-postgres-alternative.py migration-backups/pre-cutover
```

O script restaura tabelas com RLS e sem privilégios públicos. As funções ficam
reservadas ao proprietário do banco. A aplicação alternativa precisará de uma
API no servidor, com conexão privada ao PostgreSQL; nunca expor a connection
string ou uma chave administrativa em variáveis `NEXT_PUBLIC_*`.

Antes de apontar o site para a alternativa, implementar esse transporte no
servidor com uma lista explícita das RPCs exportadas e argumentos parametrizados.
Preservar a validação da chave em cada operação e usar `Cache-Control: no-store`.
O Neon não substitui automaticamente a URL REST do Supabase.

## Verificação antes da troca

Executar `tests/sync.sql`, `tests/shared-combat.sql`, `tests/infection-security.sql`
e `tests/alternate-security.sql` na base de teste. Todos usam fichas sintéticas e
rollback. Conferir também a impossibilidade de acessar tabelas diretamente.

Testar mestre e jogador em navegadores separados: link existente, retratos,
ambas as faces, herança, Infecção, rolagens, iniciativa, PV, turnos e ameaças ocultas.
Medir o tráfego após a correção antes de decidir sobre a migração. Manter o Supabase
preservado durante o teste e, em eventual retorno, levar de volta as gravações que
tenham ocorrido no destino, para não perder alterações dos jogadores.

## Sincronização otimizada

`database/sync.sql` acrescenta RPCs que verificam autorização a cada consulta.
Não altera tabelas, chaves ou dados de jogadores. A ficha só é enviada quando
seu `updated_at` muda; retratos só são enviados quando seu conteúdo muda.
Rolagens, avisos e Infecção têm versões independentes. Os avisos da campanha
nunca precisam baixar a ficha. O combate do mestre acompanha PV alterados na
ficha, além da revisão da sala; o jogador recebe somente a visão autorizada.

Os clientes consultam fichas/combate a cada 2,5 segundos **após a conclusão**
da consulta anterior, e avisos a cada 10 segundos. Abas ocultas não iniciam novos
pedidos; voltar à aba inicia uma verificação imediata. Falhas aumentam o intervalo
até 30 segundos. Links existentes e clientes antigos continuam compatíveis.

Esta mudança reduz o consumo futuro. Não cancela o consumo já contabilizado,
nem confirma por si só qual cota motivou o aviso de prazo de 9 de outubro.

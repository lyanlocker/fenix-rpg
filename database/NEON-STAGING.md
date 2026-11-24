# Transporte PostgreSQL alternativo (ambiente isolado)

O transporte alternativo é opt-in. Nenhuma configuração padrão do Supabase foi
alterada. A API utiliza uma lista fechada de RPCs e argumentos parametrizados;
as funções de contexto e commit de combate só podem ser chamadas no servidor.

## Configuração de teste

- `NEXT_PUBLIC_FENIX_BACKEND=neon` seleciona o transporte HTTP do próprio Fênix.
- `FENIX_DATABASE_URL` é uma variável exclusivamente de servidor. Use uma role
  dedicada com permissões mínimas para executar apenas as funções necessárias;
  nunca exponha a string ao navegador nem use a role proprietária em produção.
- Não configure essas variáveis no ambiente de produção antes dos testes de
  aceitação e do último backup. A API recusa acesso quando o backend alternativo
  não está habilitado. O frontend e a API precisam usar o mesmo sinalizador.

## O que foi validado no ambiente de migração

As tabelas foram reconstruídas com os tipos, restrições e índices da origem;
as cópias de registros foram verificadas por contagem e digest. O schema de
referências de identidades contém apenas IDs, não credenciais de login. O acesso
convencional por `auth.uid()` está desabilitado até a integração de identidade
ser implementada. As funções de negócio foram restauradas sem privilégios
públicos. RLS permanece habilitada.

Os testes transacionais de fichas, sincronização, infecção, combate,
reputação/vínculos, arquivo e poderes foram executados com fixtures sintéticas
e rollback. A suíte do frontend também deve passar antes de qualquer deploy.

## Pendências antes da troca

1. Implementar e validar as notificações privadas do Firebase (somente eventos
   de invalidação, sem fichas, chaves ou estados secretos). O PostgreSQL permanece
   como fonte autoritativa; notificações não substituem autorização.
2. Proteger e configurar o ambiente de preview, com credenciais limitadas e
   dados sintéticos. O modo de combate de produção não deve ser liberado em um
   preview público.
3. Testar o transporte na interface, com mestre e jogadores independentes.
4. Exportar o workspace local do mestre e as chaves de compartilhamento em um
   backup privado. Realizar um último snapshot consistente durante a breve
   interrupção das gravações; comparar as contagens e testar os links existentes.
5. Publicar somente depois da validação e manter a origem preservada para
   retorno, reconciliando alterações se houver rollback após o corte.

Não misture o arquivo de exportação, URLs de conexão, tokens ou dados da
campanha com o código-fonte público.

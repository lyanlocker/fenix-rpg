# Firebase Realtime Database — complemento do Neon

O Neon é a fonte autoritativa, inclusive para autorização. Nenhuma ficha, senha,
chave de compartilhamento, imagem, rolagem ou estado de combate é gravado no
Firebase. Apenas um identificador aleatório notifica a necessidade de atualizar.
O servidor valida a chave de ficha ou combate em `fenix_realtime_scope`; a
associação ao canal de campanha exige vínculo previamente autorizado pelo mestre.

1. Aplicar `firebase-realtime.sql` na branch Neon de validação e conceder `EXECUTE`
   somente à role de runtime correspondente. Manter privilégios públicos revogados.
2. Registrar um app web no projeto Firebase `fenix-rpg` e configurar a autenticação.
   Publicar `firebase.database.rules.json` no Realtime Database desse projeto.
3. Na Vercel, somente em Preview da branch revisada, configurar `FENIX_FIREBASE_ENV=preview`,
   `FENIX_FIREBASE_WEB_CONFIG` (JSON de configuração web), `FENIX_FIREBASE_SERVICE_ACCOUNT`
   (JSON da credencial, como Secret), e por último `NEXT_PUBLIC_FENIX_REALTIME=firebase`.
   A credencial deve permanecer apenas no servidor; não salvar no repositório.
4. Verificar recebimento de sinais em dois navegadores com fichas sintéticas,
   desconexão e retorno da consulta periódica, autorização por canal e nenhum dado
   pessoal transitando pelo Firebase. A API retorna apenas um token temporário e
   os canais autorizados. O fallback continua funcionando se Firebase falhar.
5. Somente após testes, aplicar a função na branch Neon de produção, conceder
   `EXECUTE` à role de produção, configurar as mesmas variáveis apenas em Production
   com `FENIX_FIREBASE_ENV=production` e publicar. Não reutilizar os segredos de preview.

Se houver falha na configuração ou quota do Firebase, a consulta periódica do
Neon continua disponível. Os canais de produção e preview são separados.

# Fênix 2.6 — Fichas livres e ações padrão

## Ações padrão

Toda ação padrão adicional permite executar rituais de execução padrão, ataques, investigação e outras ações compatíveis. Isso vale para Velocidade Mortal discente, poderes, itens e regras personalizadas do mestre. É uma regra da mesa solicitada pelo proprietário; a descrição original dos livros permanece como referência.

Sustentar continua custando 1 PE/PD como ação livre, sem consumir a ação padrão. Velocidade Mortal discente permite duas ações padrão por turno enquanto sustentado. Custos de PE/PD, limites de gasto do turno e disponibilidade de rituais na ficha continuam valendo. Bônus específicos de movimento ou apenas ataque mantêm o seu tipo.

Créditos padrão antigos gravados como “sem ritual” são convertidos ao calcular o saldo, sem conceder uma terceira ação nem reaplicar um efeito já creditado. Não é necessário recriar os encontros.

## Criação e edição

- Atributos: inteiros a partir de zero, sem soma obrigatória ou teto de regra por atributo. A distribuição é definida pelo mestre.
- Perícias: sem cota obrigatória, mínimos de classe ou seleção imposta pela origem. As sugestões da classe/origem são referências; aplicá-las é opcional e não reduz treinamentos existentes.
- Destreinado, Treinado +5, Veterano +10 e Expert +15 estão disponíveis na criação em qualquer NEX.
- Valores acima de 10 são preservados na edição, importação e rolagens. Por proteção operacional, cada teste/ataque aceita até 1.000 d20; exceder esse volume mostra erro, nunca reduz o atributo silenciosamente. Isso não limita a distribuição da ficha.

## Encerramento da face NEX 35

Controles de liberação, troca de face, herança e histórico da face foram retirados da interface. Fichas, retratos e recursos originais continuam disponíveis. Os dados das faces antigas permanecem arquivados no objeto da ficha e em seus backups.

Se um encontro antigo contiver participantes com a face alternativa, o mestre verá **Restaurar fichas originais**. O botão carrega as fichas originais, preserva IDs, iniciativa e seleção dos jogadores, encerra efeitos e ações pendentes relacionados à face antiga e pausa o encontro. Depois da conferência, use **Retomar**. A restauração não altera nenhuma ficha. O servidor rejeita ações nesse encontro até a restauração.

A ficha original pode continuar tendo NEX 35%; o recurso encerrado é a segunda face da sessão. Infecção nas fichas originais elegíveis continua funcionando.

## Instalação e validação

`database/free-creation.sql` substitui apenas as funções de rolagem compartilhada e autenticada para aceitar pools acima de 10. Autenticação, chaves, permissões, limites de frequência e tabelas permanecem iguais. Não modifica fichas ou imagens. Aplicar após as migrações existentes de compartilhamento.

Validação: `npm test`, `npm run typecheck`, `npm run build` e `tests/free-creation.sql` (dados sintéticos dentro de uma transação revertida). Há regressões para duas conjurações após sustentação, créditos salvos na versão anterior, recuperação de encontros antigos e fichas de todas as classes com distribuição livre.

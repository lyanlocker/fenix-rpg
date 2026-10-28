# Fênix 2.0 — primeira entrega

## Experiência implementada

- Identidade em carvão, azul profundo e cobre, com arte original no arquivo de agentes.
- Cartões com retratos transparentes inteiros, classe, NEX, recursos e filtros.
- PV, SAN, PE/PD em um painel fixo no topo da ficha, em todas as abas. Ajuste de um ponto ou valor personalizado; os limites e o fluxo de sincronização existentes são preservados.
- Resumo com defesas, perícias e retrato recolhível no celular.
- Botão explícito para alternar a face NEX 35 aprovada. A transição visual não altera permissões, regras ou os recursos da outra face.
- Resultado animado com dados individuais, expressão e total já confirmado pelo rolador.
- Preferências cinematográfica, discreta e sem movimento; preferência do sistema respeitada.
- Iniciativa visual no combate, com retratos e condições.
- Nova aba de apresentação para transmitir a mesa.

## Como transmitir

Na campanha, selecione um combate e clique em **Abrir apresentação**. Compartilhe a nova aba e mantenha o painel do combate aberto no mesmo navegador e dispositivo. A transmissão usa BroadcastChannel entre abas; não é um link remoto para jogadores. Abrir outra apresentação encerra a anterior. Ao sair do combate ou encerrar a transmissão, a tela é limpa. Sem comunicação por 12 segundos, a tela pausa.

A tela recebe somente nome da campanha, rodada, estado de pausa, identidades e retratos de participantes revelados e novas rolagens públicas da campanha. PV, defesa, iniciativa numérica, condições, notas, chaves e participantes ocultos ficam fora do payload. Rolagens de participantes ocultos são excluídas. As fichas não são carregadas pelo receptor. A tela é voltada a compartilhar uma aba do navegador do mestre; não substitui autorização de servidor para distribuição remota.

Rolagens compartilhadas são consultadas usando as chaves de mestre já presentes no navegador, somente durante a apresentação e para agentes visíveis. O polling existente pausa quando a aba fica oculta e retoma ao voltar. Para atualizar continuamente enquanto transmite outra janela, mantenha a janela do painel visível. A apresentação não muda o schema, RLS ou modelo de acesso do Supabase.

## Arte e tecnologia

Arte: `public/art/fenix-archive.webp`, 137.946 bytes, gerada com a ferramenta nativa ImageGen e otimizada para WebP. Prompt: composição panorâmica 3:1, escultura de fênix em obsidiana com bordas de cobre em arquivo circular em ruínas, halo âmbar, neblina azul-escura, detalhes à direita e espaço escuro à esquerda, sem texto, interface ou símbolos canônicos.

Motion for React para transições de componentes e resultados; CSS para estados, barras e apresentação. A versão exata está fixada no package-lock.json. A arquitetura permanece Next.js, React, Vercel e Supabase. Não há novo serviço, rastreamento ou coleta de dados.

## Verificações

- TypeScript, testes unitários e build de produção.
- Seis testes novos verificam a projeção pública, participantes ocultos, rolagens secretas/de outras campanhas/antigas, retrato alternativo e preservação dos dados de origem.
- A compatibilidade das regras, importação, faces, combate e sincronização continua coberta pela suíte existente.
- Não foi realizada uma sessão real com os seis jogadores; conferir os dispositivos usados pela mesa antes da publicação principal.

## Continuação do plano

Storage para mídia, Realtime privado e métricas PostHog exigem uma etapa própria de autorização e medição. Vídeos e arte individual de ameaças podem ser adicionados após a aprovação da direção visual. Esta entrega não requer trocar a infraestrutura nem migrar fichas.

# Blackjack Online

Um jogo de Blackjack (21) online multiplayer que permite jogar com amigos em diferentes locais.

## Funcionalidades

- Jogo de Blackjack completo com regras oficiais
- Suporte para 2 a 4 jogadores + Banca
- Modo local para jogar no mesmo dispositivo
- Modo online para jogar com amigos em diferentes locais
- Sistema de salas para criar e entrar em partidas
- Timer configurável para cada jogada
- Placar com pontuação acumulada (10 pontos por rodada)
- Interface moderna e responsiva
- Cartas com figuras e símbolos

## Como Jogar

### Modo Local

1. Abra o arquivo `index.html` em seu navegador
2. Selecione o número de jogadores (2-4)
3. Defina o número de rodadas (mínimo 3)
4. Configure o tempo para cada jogada
5. Digite os nomes dos jogadores
6. Clique em "Iniciar Jogo"
7. Siga as regras do Blackjack:
   - Tente chegar o mais próximo de 21 sem ultrapassar
   - Cartas com figuras (J, Q, K) valem 10
   - Ás vale 1 ou 11
   - Você pode Pedir Carta, Parar ou Dobrar

### Modo Online

#### Configuração do Servidor

1. Certifique-se de ter o Node.js instalado em seu computador
2. Abra um terminal na pasta do projeto
3. Execute `npm install` para instalar as dependências
4. Execute `npm start` para iniciar o servidor
5. O servidor estará rodando na porta 3000

#### Jogando Online

1. Abra o navegador e acesse `http://localhost:3000` (ou o endereço do servidor)
2. Para criar uma sala:
   - Digite seu nome
   - Selecione o número de jogadores
   - Configure o número de rodadas e o tempo
   - Clique em "Criar Sala"
   - Compartilhe o código da sala com seus amigos
3. Para entrar em uma sala:
   - Digite seu nome
   - Digite o código da sala
   - Clique em "Entrar na Sala"
4. Quando todos os jogadores entrarem, o jogo começará automaticamente
5. Cada jogador joga em sua vez, seguindo as regras do Blackjack

## Regras do Blackjack

- O objetivo é ter uma mão com valor mais próximo de 21 do que a banca, sem ultrapassar
- Cartas numeradas valem seu valor nominal
- Cartas com figuras (J, Q, K) valem 10
- Ás vale 1 ou 11, dependendo do que for melhor para a mão
- A banca deve pedir carta até ter 17 ou mais
- Se um jogador ultrapassar 21, perde automaticamente
- Se a banca ultrapassar 21, todos os jogadores que não ultrapassaram 21 ganham
- Em caso de empate, ninguém ganha a rodada

## Tecnologias Utilizadas

- HTML5, CSS3 e JavaScript
- Node.js para o servidor
- Socket.IO para comunicação em tempo real
- Express para servir os arquivos estáticos

## Estrutura do Projeto

- `index.html` - Interface do jogo
- `styles.css` - Estilos do jogo
- `game.js` - Lógica do jogo
- `server.js` - Servidor para modo online
- `package.json` - Dependências do projeto 
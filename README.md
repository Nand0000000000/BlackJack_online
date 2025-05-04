# Blackjack Online

Um jogo de Blackjack (21) online multiplayer que permite jogar com amigos em diferentes locais.

## Índice
- [Funcionalidades](#funcionalidades)
- [Como Jogar](#como-jogar)
  - [Modo Local](#modo-local)
  - [Modo Online](#modo-online)
- [Regras do Blackjack](#regras-do-blackjack)
- [Arquitetura do Sistema](#arquitetura-do-sistema)
  - [Estrutura de Classes](#estrutura-de-classes)
  - [Funcionamento do Servidor](#funcionamento-do-servidor)
  - [Fluxo do Jogo](#fluxo-do-jogo)
- [Tecnologias Utilizadas](#tecnologias-utilizadas)
- [Instalação e Configuração](#instalação-e-configuração)

## Funcionalidades

- Jogo de Blackjack completo com regras oficiais
- Suporte para 2 a 4 jogadores + Banca (Dealer)
- Modo local para jogar no mesmo dispositivo
- Modo online para jogar com amigos em diferentes locais
- Sistema de salas com código único para criar e entrar em partidas
- Timer configurável para cada jogada
- Placar com pontuação acumulada (10 pontos por rodada)
- Interface moderna e responsiva
- Cartas com figuras e símbolos
- Tratamento automático do valor do Ás (1 ou 11)
- Opções completas de jogo: Hit (pedir carta), Stand (parar) e Double (dobrar)

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
- Cartas numeradas (2-10) valem seu valor nominal
- Cartas com figuras (J, Q, K) valem 10
- Ás vale 1 ou 11, dependendo do que for melhor para a mão
- Cada jogador recebe 2 cartas inicialmente
- A banca recebe 2 cartas, mas apenas 1 fica visível até que todos os jogadores terminem seus turnos
- Em seu turno, o jogador pode:
  - **Hit (Pedir Carta)**: Receber mais uma carta
  - **Stand (Parar)**: Encerrar seu turno sem receber mais cartas
  - **Double (Dobrar)**: Dobrar a aposta inicial, receber exatamente uma carta e encerrar o turno
- A banca deve pedir carta até ter 17 ou mais pontos
- Se um jogador ultrapassar 21, perde automaticamente (bust)
- Se a banca ultrapassar 21, todos os jogadores que não ultrapassaram 21 ganham
- Caso contrário, ganha quem tiver a mão com valor mais próximo de 21
- Em caso de empate, ninguém ganha a rodada

## Arquitetura do Sistema

### Estrutura de Classes

#### Classe Card
- Representa uma carta do baralho
- Propriedades:
  - `suit`: Naipe da carta (♠, ♥, ♦, ♣)
  - `value`: Valor da carta (A, 2-10, J, Q, K)
- Métodos:
  - `toString()`: Retorna a representação da carta como string

#### Classe Deck
- Representa um baralho completo de 52 cartas
- Propriedades:
  - `cards`: Array de objetos Card
- Métodos:
  - `reset()`: Inicializa o baralho com 52 cartas e embaralha
  - `shuffle()`: Embaralha as cartas do baralho
  - `draw()`: Remove e retorna a carta do topo do baralho

#### Classe Player (no client)
- Representa um jogador do jogo
- Propriedades:
  - `name`: Nome do jogador
  - `id`: ID único do jogador (usado no modo online)
  - `hand`: Array de cartas do jogador
  - `score`: Pontuação total do jogador
  - `roundsWon`: Número de rodadas vencidas
  - `isHost`: Indica se o jogador é o criador da sala
- Métodos:
  - `addCard(card)`: Adiciona uma carta à mão do jogador
  - `getHandValue()`: Calcula o valor total da mão do jogador
  - `clearHand()`: Limpa a mão do jogador

#### Classe Game (no client)
- Controla a lógica do jogo no cliente
- Propriedades:
  - `deck`: Objeto Deck
  - `players`: Array de objetos Player
  - `dealer`: Objeto Player representando a banca
  - `currentPlayerIndex`: Índice do jogador atual
  - `currentRound`: Rodada atual
  - `totalRounds`: Número total de rodadas
  - `timeout`: Tempo limite para cada jogada
  - `timer`: Referência ao temporizador
  - `gameState`: Estado atual do jogo
  - `socket`: Conexão com o servidor (modo online)
  - `roomId`: ID da sala (modo online)
  - `playerId`: ID do jogador atual (modo online)
  - `isOnline`: Indica se o jogo está no modo online
- Métodos principais:
  - `connectToServer()`: Estabelece conexão com o servidor
  - `createRoom()`: Cria uma sala no servidor
  - `joinRoom()`: Entra em uma sala existente
  - `hit()`: Implementa a ação de pedir carta
  - `stand()`: Implementa a ação de parar
  - `double()`: Implementa a ação de dobrar
  - `dealerTurn()`: Executa o turno da banca
  - `endRound()`: Finaliza a rodada atual
  - `endGame()`: Finaliza o jogo
  - `updateUI()`: Atualiza a interface do jogo

### Funcionamento do Servidor

O servidor (`server.js`) é baseado em Node.js, Express e Socket.IO, responsável por:

1. **Gestão de Salas**:
   - Criação de salas com códigos únicos gerados aleatoriamente
   - Gestão de entrada e saída de jogadores
   - Configurações de jogo (número de jogadores, rodadas, timeout)

2. **Sincronização do Jogo**:
   - Distribuição de cartas para todos os jogadores
   - Controle de turnos dos jogadores
   - Processamento das ações dos jogadores (hit, stand, double)
   - Execução do turno da banca
   - Cálculo e anúncio dos vencedores de cada rodada

3. **Tratamento de Desconexões**:
   - Detecção de jogadores desconectados
   - Pausa do jogo quando um jogador se desconecta
   - Limpeza de salas vazias

4. **Eventos do Socket.IO**:
   - `createRoom`: Cria uma nova sala com um código único
   - `joinRoom`: Permite um jogador entrar em uma sala existente
   - `startGame`: Inicia o jogo quando todos os jogadores estão prontos
   - `dealInitialCards`: Distribui as cartas iniciais para todos os jogadores
   - `gameAction`: Processa as ações dos jogadores (hit, stand, double, dealerTurn)
   - `disconnect`: Trata a desconexão de jogadores

### Fluxo do Jogo

1. **Fase de Preparação**:
   - Criação da sala pelo jogador host
   - Entrada dos demais jogadores na sala
   - Configuração do jogo (número de jogadores, rodadas, timeout)

2. **Início do Jogo**:
   - Distribuição de 2 cartas para cada jogador
   - Distribuição de 2 cartas para a banca (apenas 1 é visível)
   - Determinação do primeiro jogador

3. **Turnos dos Jogadores**:
   - Cada jogador, em sua vez, pode escolher entre:
     - **Hit**: Pedir mais uma carta
     - **Stand**: Manter suas cartas e passar a vez
     - **Double**: Dobrar a aposta, receber uma carta e passar a vez
   - Se o valor da mão ultrapassar 21, o jogador perde automaticamente
   - Timer limita o tempo de decisão do jogador

4. **Turno da Banca**:
   - A segunda carta da banca é revelada
   - A banca compra cartas até atingir pelo menos 17 pontos
   - Se a banca ultrapassar 21, ela perde

5. **Finalização da Rodada**:
   - Cálculo dos vencedores da rodada
   - Atribuição de pontos (10 pontos por vitória)
   - Exibição dos resultados da rodada

6. **Finalização do Jogo**:
   - Após todas as rodadas, o jogo termina
   - Exibição do placar final e do vencedor geral

## Tecnologias Utilizadas

- **Frontend**:
  - HTML5, CSS3 e JavaScript
  - Bootstrap para componentes de interface
  - Socket.IO Client para comunicação em tempo real

- **Backend**:
  - Node.js para o runtime do servidor
  - Express.js para servir os arquivos estáticos
  - Socket.IO para comunicação em tempo real
  - HTTP para criação do servidor web

## Instalação e Configuração

1. **Pré-requisitos**:
   - Node.js (versão 14.x ou superior)
   - npm (versão 6.x ou superior)

2. **Instalação de Dependências**:
   ```bash
   npm install express socket.io http path
   ```

3. **Execução do Servidor**:
   ```bash
   node server.js
   ```

4. **Acesso ao Jogo**:
   - Acesse `http://localhost:3000` no navegador
   - Para jogos em rede local, outros jogadores podem acessar usando o IP da máquina: `http://[seu-ip]:3000`
   - Para disponibilizar online, configure um servidor web ou use serviços como Heroku, Vercel ou Netlify 
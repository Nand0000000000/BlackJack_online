class Card {
    constructor(suit, value) {
        this.suit = suit;
        this.value = value;
    }

    toString() {
        return `${this.value}${this.suit}`;
    }
}

class Deck {
    constructor() {
        this.reset();
    }

    reset() {
        const suits = ['♠', '♥', '♦', '♣'];
        const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        this.cards = [];

        for (let suit of suits) {
            for (let value of values) {
                this.cards.push(new Card(suit, value));
            }
        }

        this.shuffle();
    }

    shuffle() {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    draw() {
        return this.cards.pop();
    }
}

class Player {
    constructor(name, id = null) {
        this.name = name;
        this.id = id;
        this.hand = [];
        this.score = 0;
        this.roundsWon = 0;
        this.isHost = false;
    }

    addCard(card) {
        this.hand.push(card);
    }

    getHandValue() {
        let value = 0;
        let aces = 0;

        for (let card of this.hand) {
            if (card.value === 'A') {
                aces++;
            } else if (['K', 'Q', 'J'].includes(card.value)) {
                value += 10;
            } else {
                value += parseInt(card.value);
            }
        }

        for (let i = 0; i < aces; i++) {
            if (value + 11 <= 21) {
                value += 11;
            } else {
                value += 1;
            }
        }

        return value;
    }

    clearHand() {
        this.hand = [];
    }
}

class Game {
    constructor() {
        this.deck = new Deck();
        this.players = [];
        this.dealer = new Player('Banca');
        this.currentPlayerIndex = 0;
        this.currentRound = 1;
        this.totalRounds = 0;
        this.timeout = 0;
        this.timer = null;
        this.gameState = 'setup'; 
        this.socket = null;
        this.roomId = null;
        this.playerId = null;
        this.isOnline = false;
        this.dealerSecondCardVisible = false;
    }

    connectToServer() {
        this.socket = io();
        this.isOnline = true;
        
        this.socket.on('connect', () => {
            this.playerId = this.socket.id;
            console.log('Conectado ao servidor com ID:', this.playerId);
        });
        
        this.socket.on('roomCreated', (data) => {
            this.roomId = data.roomId;
            this.updatePlayersList(data.players);
            this.showRoomInfo();
        });
        
        this.socket.on('playerJoined', (data) => {
            this.updatePlayersList(data.players);
        });
        
        this.socket.on('gameStarted', (data) => {
            this.initializeOnlineGame(data);
        });
        
        this.socket.on('cardsDealt', (data) => {
            console.log("Cartas distribuídas pelo servidor:", data);
            
            // Atualizar as mãos dos jogadores
            data.players.forEach(playerData => {
                const player = this.players.find(p => p.id === playerData.id);
                if (player) {
                    player.hand = playerData.hand.map(cardData => new Card(cardData.suit, cardData.value));
                }
            });
            
            // Atualizar a mão do dealer
            this.dealer.hand = [];
            if (data.dealer.hand[0]) {
                this.dealer.addCard(new Card(data.dealer.hand[0].suit, data.dealer.hand[0].value));
            }
            
            // Atualizar a interface
            this.updateUI();
        });
        
        this.socket.on('currentPlayer', (data) => {
            console.log("Jogador atual:", data.playerId);
            
            // Limpar qualquer temporizador existente
            if (this.timer) {
                clearInterval(this.timer);
                this.timer = null;
            }
            
            // Encontrar o índice do jogador atual
            this.currentPlayerIndex = this.players.findIndex(p => p.id === data.playerId);
            
            // Atualizar o timeout se fornecido pelo servidor
            if (data.timeout) {
                this.timeout = data.timeout;
            }
            
            // Atualizar a interface
            this.updateUI();
            
            // Iniciar o turno do jogador atual
            this.startTurn();
        });
        
        this.socket.on('cardDrawn', (data) => {
            console.log("Carta comprada:", data);
            
            // Adicionar a carta à mão do jogador
            const player = this.players.find(p => p.id === data.playerId);
            if (player) {
                player.addCard(new Card(data.card.suit, data.card.value));
            }
            
            // Atualizar a interface
            this.updateUI();
        });
        
        this.socket.on('dealerTurn', () => {
            console.log("É a vez do dealer");
            
            // Limpar qualquer temporizador existente
            if (this.timer) {
                clearInterval(this.timer);
                this.timer = null;
            }
            
            // Revelar a segunda carta do dealer
            this.dealerSecondCardVisible = true;
            this.updateUI();
            
            // Notificar o servidor que o dealer está jogando
            this.socket.emit('gameAction', {
                roomId: this.roomId,
                action: 'dealerTurn'
            });
        });
        
        this.socket.on('dealerSecondCardRevealed', (data) => {
            console.log("Segunda carta do dealer revelada:", data);
            
            // Adicionar a segunda carta à mão do dealer
            this.dealer.addCard(new Card(data.card.suit, data.card.value));
            
            // Atualizar a interface
            this.updateUI();
        });
        
        this.socket.on('dealerCardDrawn', (data) => {
            console.log("Dealer comprou carta:", data);
            
            // Adicionar a carta à mão do dealer
            this.dealer.addCard(new Card(data.card.suit, data.card.value));
            
            // Atualizar a interface
            this.updateUI();
        });
        
        this.socket.on('roundEnded', (data) => {
            console.log("Rodada terminou:", data);
            
            // Limpar qualquer temporizador existente
            if (this.timer) {
                clearInterval(this.timer);
                this.timer = null;
            }
            
            // Atualizar a mão do dealer
            this.dealer.hand = data.dealer.hand.map(cardData => new Card(cardData.suit, cardData.value));
            
            // Calcular os vencedores da rodada
            const dealerValue = this.dealer.getHandValue();
            const winners = [];
            
            for (let player of this.players) {
                const playerValue = player.getHandValue();
                if (playerValue <= 21 && (dealerValue > 21 || playerValue > dealerValue)) {
                    winners.push(player);
                    player.roundsWon++;
                    player.score += 10;
                }
            }
            
            if (dealerValue <= 21 && winners.length === 0) {
                this.dealer.roundsWon++;
                this.dealer.score += 10;
            }
            
            // Mostrar os resultados da rodada
            this.showRoundResults(winners);
            
            // Atualizar a interface
            this.updateUI();
        });
        
        this.socket.on('nextRound', (data) => {
            console.log("Próxima rodada:", data);
            
            // Limpar qualquer temporizador existente
            if (this.timer) {
                clearInterval(this.timer);
                this.timer = null;
            }
            
            // Avançar para a próxima rodada
            this.currentRound = data.round;
            
            // Resetar o jogo para a próxima rodada
            this.deck.reset();
            for (let player of this.players) {
                player.clearHand();
            }
            this.dealer.clearHand();
            this.dealerSecondCardVisible = false;
            
            this.currentPlayerIndex = 0;
            this.gameState = 'playing';
            
            // Solicitar novas cartas ao servidor
            this.socket.emit('dealInitialCards', {
                roomId: this.roomId
            });
            
            // Mostrar a tela do jogo
            this.showScreen('game-screen');
        });
        
        this.socket.on('gameEnded', (data) => {
            console.log("Jogo terminou:", data);
            
            // Limpar qualquer temporizador existente
            if (this.timer) {
                clearInterval(this.timer);
                this.timer = null;
            }
            
            // Atualizar os jogadores com os dados finais
            data.players.forEach(playerData => {
                const player = this.players.find(p => p.id === playerData.id);
                if (player) {
                    player.score = playerData.score || 0;
                    player.roundsWon = playerData.roundsWon || 0;
                }
            });
            
            // Mostrar a tela final
            this.endGame();
        });
        
        this.socket.on('playerLeft', (data) => {
            console.log("Jogador saiu:", data);
            
            // Limpar qualquer temporizador existente
            if (this.timer) {
                clearInterval(this.timer);
                this.timer = null;
            }
            
            // Remover o jogador da lista
            this.players = this.players.filter(p => p.id !== data.playerId);
            
            // Atualizar a lista de jogadores
            this.updatePlayersList(data.players);
            
            // Atualizar a interface
            this.updateUI();
        });
        
        this.socket.on('gamePaused', (data) => {
            console.log("Jogo pausado:", data);
            
            // Limpar qualquer temporizador existente
            if (this.timer) {
                clearInterval(this.timer);
                this.timer = null;
            }
            
            this.gameState = 'paused';
            alert(data.message);
        });
        
        this.socket.on('error', (data) => {
            console.error("Erro:", data);
            alert(data.message);
        });
    }

    createRoom(playerName, playerCount, rounds, timeout) {
        if (!this.isOnline) {
            this.connectToServer();
        }
        
        this.socket.emit('createRoom', {
            playerName,
            playerCount,
            rounds,
            timeout
        });
        
        // Mostrar a tela de carregamento enquanto aguarda a resposta do servidor
        this.showScreen('loading-screen');
    }

    joinRoom(roomId, playerName) {
        if (!this.isOnline) {
            this.connectToServer();
        }
        
        this.socket.emit('joinRoom', {
            roomId,
            playerName
        });
    }

    updatePlayersList(playersList) {
        const playersListElement = document.getElementById('players-list');
        if (playersListElement) {
            playersListElement.innerHTML = '';
            
            playersList.forEach(player => {
                const playerElement = document.createElement('div');
                playerElement.className = 'player-item';
                playerElement.innerHTML = `
                    <span>${player.name}</span>
                    ${player.isHost ? '<span class="host-badge">Host</span>' : ''}
                `;
                playersListElement.appendChild(playerElement);
            });
        }
    }

    showRoomInfo() {
        const roomInfoElement = document.getElementById('room-info');
        if (roomInfoElement) {
            roomInfoElement.innerHTML = `
                <div class="room-code">
                    <h3>Código da Sala: <span class="code">${this.roomId}</span></h3>
                    <p>Compartilhe este código com seus amigos para jogarem juntos!</p>
                </div>
                <div id="players-list"></div>
                <div class="waiting-message">
                    <p>Aguardando mais jogadores para iniciar o jogo...</p>
                </div>
            `;
        }
        
        // Mostrar a tela da sala
        this.showScreen('room-screen');
    }

    initializeOnlineGame(data) {
        this.totalRounds = data.settings.rounds;
        this.timeout = data.settings.timeout;
        this.currentRound = 1;
        this.gameState = 'playing';
        
        this.players = [];
        
        // Adicionar os jogadores
        data.players.forEach(playerData => {
            const player = new Player(playerData.name, playerData.id);
            player.isHost = playerData.isHost;
            this.players.push(player);
        });
        
        // Adicionar o dealer
        this.dealer = new Player('Banca');
        
        // Solicitar cartas ao servidor
        this.socket.emit('dealInitialCards', {
            roomId: this.roomId
        });
        
        // Mostrar a tela do jogo
        this.showScreen('game-screen');
    }

    startTurn() {
        if (this.gameState !== 'playing') return;

        const currentPlayer = this.players[this.currentPlayerIndex];
        document.getElementById('current-player').textContent = `Vez de: ${currentPlayer.name}`;
        
        // No jogo online, verificar se é a vez do jogador atual
        const isMyTurn = !this.isOnline || currentPlayer.id === this.playerId;
        
        console.log("Iniciando turno:", {
            currentPlayerId: currentPlayer.id,
            myPlayerId: this.playerId,
            isMyTurn: isMyTurn,
            currentPlayerName: currentPlayer.name
        });
        
        // Habilitar os botões de ação apenas se for a vez do jogador
        document.getElementById('hit-btn').disabled = !isMyTurn;
        document.getElementById('stand-btn').disabled = !isMyTurn;
        document.getElementById('double-btn').disabled = !isMyTurn || currentPlayer.hand.length !== 2;
        
        // Iniciar o temporizador apenas se for a vez do jogador
        if (isMyTurn) {
            let timeLeft = this.timeout;
            this.updateTimer(timeLeft);
            
            // Limpar qualquer temporizador existente
            if (this.timer) {
                clearInterval(this.timer);
            }
            
            this.timer = setInterval(() => {
                timeLeft--;
                this.updateTimer(timeLeft);
                
                if (timeLeft <= 0) {
                    clearInterval(this.timer);
                    this.stand();
                }
            }, 1000);
        } else {
            // Se não for a vez do jogador, mostrar o temporizador como "Aguardando..."
            document.getElementById('timer').textContent = "Aguardando...";
        }
    }

    updateTimer(timeLeft) {
        document.getElementById('timer').textContent = `Tempo: ${timeLeft}s`;
    }

    hit() {
        if (this.gameState !== 'playing') return;

        const currentPlayer = this.players[this.currentPlayerIndex];
        
        console.log("Tentando hit:", {
            currentPlayerId: currentPlayer.id,
            myPlayerId: this.playerId,
            isMyTurn: currentPlayer.id === this.playerId
        });
        
        if (this.isOnline && currentPlayer.id !== this.playerId) {
            console.log("Não é sua vez de jogar!");
            return;
        }
        
        if (this.isOnline) {
            // No modo online, solicitar uma carta ao servidor
            console.log("Enviando ação 'hit' para o servidor");
            this.socket.emit('gameAction', {
                roomId: this.roomId,
                action: 'hit'
            });
        } else {
            // No modo local, comprar uma carta localmente
            const card = this.deck.draw();
            currentPlayer.addCard(card);
            
            // Verificar se o jogador estourou (mais de 21)
            if (currentPlayer.getHandValue() > 21) {
                // Passar para o próximo jogador
                this.currentPlayerIndex++;
                
                // Verificar se todos os jogadores já jogaram
                if (this.currentPlayerIndex >= this.players.length) {
                    // Todos os jogadores já jogaram, agora é a vez do dealer
                    this.dealerTurn();
                } else {
                    // Ainda há jogadores para jogar
                    this.startTurn();
                }
            }
            
            // Atualizar a interface
            this.updateUI();
        }
    }

    stand() {
        if (this.gameState !== 'playing') return;

        const currentPlayer = this.players[this.currentPlayerIndex];
        
        console.log("Tentando stand:", {
            currentPlayerId: currentPlayer.id,
            myPlayerId: this.playerId,
            isMyTurn: currentPlayer.id === this.playerId
        });
        
        if (this.isOnline && currentPlayer.id !== this.playerId) {
            console.log("Não é sua vez de jogar!");
            return;
        }
        
        clearInterval(this.timer);
        
        if (this.isOnline) {
            // No modo online, notificar o servidor que o jogador parou
            console.log("Enviando ação 'stand' para o servidor");
            this.socket.emit('gameAction', {
                roomId: this.roomId,
                action: 'stand'
            });
        } else {
            // No modo local, passar para o próximo jogador
            this.currentPlayerIndex++;
            
            // Verificar se todos os jogadores já jogaram
            if (this.currentPlayerIndex >= this.players.length) {
                // Todos os jogadores já jogaram, agora é a vez do dealer
                this.dealerTurn();
            } else {
                // Ainda há jogadores para jogar
                this.startTurn();
            }
            
            // Atualizar a interface
            this.updateUI();
        }
    }

    double() {
        if (this.gameState !== 'playing') return;

        const currentPlayer = this.players[this.currentPlayerIndex];
        
        console.log("Tentando double:", {
            currentPlayerId: currentPlayer.id,
            myPlayerId: this.playerId,
            isMyTurn: currentPlayer.id === this.playerId
        });
        
        if (this.isOnline && currentPlayer.id !== this.playerId) {
            console.log("Não é sua vez de jogar!");
            return;
        }
        
        if (currentPlayer.hand.length === 2) {
            if (this.isOnline) {
                // No modo online, solicitar uma carta ao servidor
                console.log("Enviando ação 'double' para o servidor");
                this.socket.emit('gameAction', {
                    roomId: this.roomId,
                    action: 'double'
                });
            } else {
                // No modo local, comprar uma carta localmente
                const card = this.deck.draw();
                currentPlayer.addCard(card);
                
                // Passar para o próximo jogador
                this.currentPlayerIndex++;
                
                // Verificar se todos os jogadores já jogaram
                if (this.currentPlayerIndex >= this.players.length) {
                    // Todos os jogadores já jogaram, agora é a vez do dealer
                    this.dealerTurn();
                } else {
                    // Ainda há jogadores para jogar
                    this.startTurn();
                }
                
                // Atualizar a interface
                this.updateUI();
            }
        }
    }

    dealerTurn() {
        console.log("Dealer turn iniciado");
        console.log("Cartas do dealer antes de revelar:", this.dealer.hand);
        
        // Revelar a segunda carta do dealer
        this.dealerSecondCardVisible = true;
        this.updateUI();
        
        console.log("Segunda carta do dealer revelada");
        console.log("Cartas do dealer após revelar:", this.dealer.hand);
        
        // Pequeno delay para que os jogadores possam ver a segunda carta antes do dealer começar a comprar
        setTimeout(() => {
            console.log("Dealer começando a comprar cartas");
            console.log("Valor atual do dealer:", this.dealer.getHandValue());
            
            // O dealer deve comprar cartas até ter pelo menos 17 pontos
            while (this.dealer.getHandValue() < 17) {
                const card = this.deck.draw();
                this.dealer.addCard(card);
                
                console.log("Dealer comprou carta:", card.toString());
                console.log("Novo valor do dealer:", this.dealer.getHandValue());
                
                // Atualizar a interface após cada carta comprada
                this.updateUI();
            }
            
            console.log("Dealer terminou de comprar cartas");
            console.log("Valor final do dealer:", this.dealer.getHandValue());
            
            // Finalizar a rodada
            this.endRound();
        }, 1000); // Delay de 1 segundo para melhor experiência do usuário
    }

    endRound() {
        this.gameState = 'roundEnd';
        
        // Calcular os vencedores da rodada
        const dealerValue = this.dealer.getHandValue();
        const winners = [];
        
        for (let player of this.players) {
            const playerValue = player.getHandValue();
            if (playerValue <= 21 && (dealerValue > 21 || playerValue > dealerValue)) {
                winners.push(player);
                player.roundsWon++;
                player.score += 10;
            }
        }
        
        if (dealerValue <= 21 && winners.length === 0) {
            this.dealer.roundsWon++;
            this.dealer.score += 10;
        }
        
        // Mostrar os resultados da rodada
        this.showRoundResults(winners);
        
        // No modo online, notificar o servidor que a rodada terminou
        if (this.isOnline) {
            this.socket.emit('gameAction', {
                roomId: this.roomId,
                action: 'roundEnd'
            });
        }
    }

    showRoundResults(winners) {
        const resultsDiv = document.getElementById('round-results');
        resultsDiv.innerHTML = '';
        
        if (winners.length > 0) {
            const winnerNames = winners.map(p => p.name).join(', ');
            resultsDiv.innerHTML += `<p>Vencedores da rodada: ${winnerNames}</p>`;
        } else {
            resultsDiv.innerHTML += `<p>Banca venceu a rodada!</p>`;
        }
        
        // Adicionar informações sobre a próxima rodada
        if (this.currentRound < this.totalRounds) {
            resultsDiv.innerHTML += `<p>Próxima rodada: ${this.currentRound + 1} de ${this.totalRounds}</p>`;
        } else {
            resultsDiv.innerHTML += `<p>Esta foi a última rodada!</p>`;
        }
        
        // Mostrar a tela de resultados
        this.showScreen('results-screen');
    }

    endGame() {
        this.gameState = 'gameEnd';
        
        const finalResults = document.getElementById('final-results');
        finalResults.innerHTML = '';
        
        // Ordenar os jogadores por pontuação (decrescente)
        const allPlayers = [...this.players, this.dealer].sort((a, b) => b.score - a.score);
        
        // Exibir os resultados finais
        allPlayers.forEach((player, index) => {
            finalResults.innerHTML += `
                <p>${index + 1}º Lugar: ${player.name} - ${player.score} pontos (${player.roundsWon} rodadas vencidas)</p>
            `;
        });
        
        // No modo online, notificar o servidor que o jogo terminou
        if (this.isOnline) {
            this.socket.emit('gameAction', {
                roomId: this.roomId,
                action: 'gameEnd'
            });
        }
        
        // Mostrar a tela final
        this.showScreen('final-screen');
    }

    updateUI() {
        console.log("Atualizando interface");
        console.log("dealerSecondCardVisible:", this.dealerSecondCardVisible);
        console.log("Cartas do dealer:", this.dealer.hand);
        
        const scoreboard = document.getElementById('scoreboard');
        scoreboard.innerHTML = '';
        
        [...this.players, this.dealer].forEach(player => {
            scoreboard.innerHTML += `
                <p>${player.name}: ${player.score} pontos</p>
            `;
        });
        
        document.getElementById('current-round').textContent = `Rodada ${this.currentRound}/${this.totalRounds}`;
        
        const dealerCards = document.getElementById('dealer-cards');
        dealerCards.innerHTML = '';
        
        // Mostrar apenas a primeira carta do dealer se a segunda ainda não estiver visível
        if (!this.dealerSecondCardVisible && this.dealer.hand.length > 1) {
            console.log("Mostrando apenas a primeira carta do dealer");
            // Mostrar a primeira carta
            dealerCards.innerHTML += `<div class="card">${this.dealer.hand[0].toString()}</div>`;
            // Mostrar a segunda carta como escondida
            dealerCards.innerHTML += `<div class="card hidden">🂠</div>`;
        } else {
            console.log("Mostrando todas as cartas do dealer");
            // Mostrar todas as cartas do dealer
            this.dealer.hand.forEach(card => {
                dealerCards.innerHTML += `<div class="card">${card.toString()}</div>`;
            });
        }
        
        const playersArea = document.getElementById('players-area');
        playersArea.innerHTML = '';
        
        this.players.forEach((player, index) => {
            const playerDiv = document.createElement('div');
            playerDiv.className = `player-area ${index === this.currentPlayerIndex ? 'active' : ''}`;
            playerDiv.innerHTML = `
                <h3>${player.name}</h3>
                <div class="cards">
                    ${player.hand.map(card => `<div class="card">${card.toString()}</div>`).join('')}
                </div>
                <p>Valor: ${player.getHandValue()}</p>
            `;
            playersArea.appendChild(playerDiv);
        });
        
        console.log("Interface atualizada");
    }

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }
}


const game = new Game();


document.getElementById('player-count').addEventListener('change', function() {
    game.initializeGame(
        parseInt(this.value),
        parseInt(document.getElementById('rounds').value),
        parseInt(document.getElementById('timeout').value)
    );
});

document.getElementById('start-game').addEventListener('click', () => {
    game.startGame();
    game.showScreen('game-screen');
});

document.getElementById('hit-btn').addEventListener('click', () => game.hit());
document.getElementById('stand-btn').addEventListener('click', () => game.stand());
document.getElementById('double-btn').addEventListener('click', () => game.double());
document.getElementById('next-round').addEventListener('click', () => game.nextRound());
document.getElementById('new-game').addEventListener('click', () => {
    game.showScreen('start-screen');
    game.initializeGame(
        parseInt(document.getElementById('player-count').value),
        parseInt(document.getElementById('rounds').value),
        parseInt(document.getElementById('timeout').value)
    );
});


document.addEventListener('DOMContentLoaded', () => {
    const startScreen = document.getElementById('start-screen');
    
    const onlineSection = document.createElement('div');
    onlineSection.className = 'online-section';
    onlineSection.innerHTML = `
        <h2>Jogar Online</h2>
        <div class="online-options">
            <div class="input-group">
                <label for="player-name">Seu Nome:</label>
                <input type="text" id="player-name" required>
            </div>
            <div class="input-group">
                <label for="online-player-count">Número de Jogadores (2-4):</label>
                <input type="number" id="online-player-count" min="2" max="4" value="2">
            </div>
            <div class="input-group">
                <label for="online-rounds">Número de Rodadas (mín. 3):</label>
                <input type="number" id="online-rounds" min="3" value="3">
            </div>
            <div class="input-group">
                <label for="online-timeout">Tempo por jogada (segundos):</label>
                <input type="number" id="online-timeout" min="10" value="30">
            </div>
            <button id="create-room" class="btn-primary">Criar Sala</button>
            <div class="join-room">
                <div class="input-group">
                    <label for="room-id">Código da Sala:</label>
                    <input type="text" id="room-id" placeholder="Digite o código da sala">
                </div>
                <button id="join-room" class="btn-primary">Entrar na Sala</button>
            </div>
        </div>
    `;
    
    
    const title = startScreen.querySelector('h1');
    title.parentNode.insertBefore(onlineSection, title.nextSibling);
    
    
    const roomScreen = document.createElement('div');
    roomScreen.id = 'room-screen';
    roomScreen.className = 'screen';
    roomScreen.innerHTML = `
        <h2>Sala de Jogo</h2>
        <div id="room-info"></div>
    `;
    
    document.querySelector('.container').appendChild(roomScreen);
    
    
    document.getElementById('create-room').addEventListener('click', () => {
        const playerName = document.getElementById('player-name').value.trim();
        if (!playerName) {
            alert('Por favor, insira seu nome.');
            return;
        }
        
        const playerCount = parseInt(document.getElementById('online-player-count').value);
        const rounds = parseInt(document.getElementById('online-rounds').value);
        const timeout = parseInt(document.getElementById('online-timeout').value);
        
        game.createRoom(playerName, playerCount, rounds, timeout);
    });
    
    document.getElementById('join-room').addEventListener('click', () => {
        const playerName = document.getElementById('player-name').value.trim();
        const roomId = document.getElementById('room-id').value.trim();
        
        if (!playerName) {
            alert('Por favor, insira seu nome.');
            return;
        }
        
        if (!roomId) {
            alert('Por favor, insira o código da sala.');
            return;
        }
        
        game.joinRoom(roomId, playerName);
    });
}); 
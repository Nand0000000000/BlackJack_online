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
        
        this.socket.on('gameAction', (data) => {
            this.handleGameAction(data);
        });
        
        this.socket.on('playerLeft', (data) => {
            this.handlePlayerLeft(data);
        });
        
        this.socket.on('gamePaused', (data) => {
            this.handleGamePaused(data);
        });
        
        this.socket.on('error', (data) => {
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
        
        // Distribuir as cartas iniciais
        this.dealInitialCards();
        
        // Atualizar a interface
        this.updateUI();
        
        // Iniciar o jogo com o primeiro jogador
        this.currentPlayerIndex = 0;
        this.startTurn();
        
        // Mostrar a tela do jogo
        this.showScreen('game-screen');
    }

    handleGameAction(data) {
        if (data.action === 'hit') {
            const player = this.players.find(p => p.id === data.playerId);
            if (player) {
                player.addCard(new Card(data.data.card.suit, data.data.card.value));
                this.updateUI();
            }
        } else if (data.action === 'stand') {
            this.currentPlayerIndex++;
            if (this.currentPlayerIndex >= this.players.length) {
                this.dealerTurn();
            } else {
                this.startTurn();
            }
            this.updateUI();
        } else if (data.action === 'double') {
            const player = this.players.find(p => p.id === data.playerId);
            if (player && player.hand.length === 2) {
                player.addCard(new Card(data.data.card.suit, data.data.card.value));
                this.currentPlayerIndex++;
                if (this.currentPlayerIndex >= this.players.length) {
                    this.dealerTurn();
                } else {
                    this.startTurn();
                }
                this.updateUI();
            }
        } else if (data.action === 'dealerHit') {
            // O dealer comprou uma carta
            this.dealer.addCard(new Card(data.data.card.suit, data.data.card.value));
            this.updateUI();
        } else if (data.action === 'roundEnd') {
            // Atualizar os vencedores da rodada
            if (data.data && data.data.winners) {
                for (let player of this.players) {
                    if (data.data.winners.includes(player.id)) {
                        player.roundsWon++;
                        player.score += 10;
                    }
                }
            }
            
            // Mostrar a tela de resultados
            this.showRoundResults(this.players.filter(p => p.roundsWon > 0));
        } else if (data.action === 'nextRound') {
            // Avançar para a próxima rodada
            this.nextRound();
        } else if (data.action === 'gameEnd') {
            // O jogo terminou
            this.endGame();
        }
    }

    handlePlayerLeft(data) {
        this.players = this.players.filter(p => p.id !== data.playerId);
        
        this.updateUI();
        
        if (this.gameState === 'playing') {
            this.gameState = 'paused';
            alert('Um jogador desconectou. O jogo foi pausado.');
        }
    }

    handleGamePaused(data) {
        this.gameState = 'paused';
        alert(data.message);
    }

    initializeGame(playerCount, rounds, timeout) {
        this.totalRounds = rounds;
        this.timeout = timeout;
        this.currentRound = 1;
        this.gameState = 'playing';
        this.deck.reset();
        
        this.players = [];
        this.dealer = new Player('Banca');
        
        // Para jogo local, sempre criamos apenas um jogador (o usuário)
        const container = document.getElementById('player-names-container');
        container.innerHTML = '';
        
        const input = document.createElement('div');
        input.className = 'input-group';
        input.innerHTML = `
            <label for="player0">Seu Nome:</label>
            <input type="text" id="player0" required>
        `;
        container.appendChild(input);
    }

    startGame() {
        // Para jogo local, sempre criamos apenas um jogador (o usuário)
        const name = document.getElementById('player0').value.trim();
        if (!name) {
            alert('Por favor, insira seu nome.');
            return;
        }
        
        // Criar apenas um jogador (o usuário)
        this.players = [new Player(name)];
        
        // Iniciar o jogo
        this.dealInitialCards();
        this.updateUI();
        this.startTurn();
        
        // Mostrar a tela do jogo
        this.showScreen('game-screen');
    }

    dealInitialCards() {
        console.log("Distribuindo cartas iniciais");
        
        // Distribuir 2 cartas para cada jogador
        for (let i = 0; i < 2; i++) {
            for (let player of this.players) {
                const card = this.deck.draw();
                player.addCard(card);
                
                console.log(`Jogador ${player.name} recebeu carta: ${card.toString()}`);
                
                // No modo online, notificar o servidor sobre a carta distribuída
                if (this.isOnline && player.id === this.playerId) {
                    this.socket.emit('gameAction', {
                        roomId: this.roomId,
                        action: 'hit',
                        data: { card }
                    });
                }
            }
            
            // Distribuir 2 cartas para o dealer
            const dealerCard = this.deck.draw();
            this.dealer.addCard(dealerCard);
            
            console.log(`Dealer recebeu carta: ${dealerCard.toString()}`);
            
            // No modo online, notificar o servidor sobre a carta do dealer
            if (this.isOnline && i === 0) {
                this.socket.emit('gameAction', {
                    roomId: this.roomId,
                    action: 'dealerHit',
                    data: { card: dealerCard }
                });
            }
        }
        
        console.log("Cartas iniciais distribuídas");
        console.log("Cartas do dealer:", this.dealer.hand);
    }

    startTurn() {
        if (this.gameState !== 'playing') return;

        const currentPlayer = this.players[this.currentPlayerIndex];
        document.getElementById('current-player').textContent = `Vez de: ${currentPlayer.name}`;
        
        // No jogo local, sempre é a vez do jogador
        const isMyTurn = !this.isOnline || currentPlayer.id === this.playerId;
        
        // Habilitar os botões de ação apenas se for a vez do jogador
        document.getElementById('hit-btn').disabled = !isMyTurn;
        document.getElementById('stand-btn').disabled = !isMyTurn;
        document.getElementById('double-btn').disabled = !isMyTurn || currentPlayer.hand.length !== 2;
        
        // Iniciar o temporizador apenas se for a vez do jogador
        if (isMyTurn) {
            let timeLeft = this.timeout;
            this.updateTimer(timeLeft);
            
            this.timer = setInterval(() => {
                timeLeft--;
                this.updateTimer(timeLeft);
                
                if (timeLeft <= 0) {
                    clearInterval(this.timer);
                    this.stand();
                }
            }, 1000);
        }
    }

    updateTimer(timeLeft) {
        document.getElementById('timer').textContent = `Tempo: ${timeLeft}s`;
    }

    hit() {
        if (this.gameState !== 'playing') return;

        const currentPlayer = this.players[this.currentPlayerIndex];
        
        if (this.isOnline && currentPlayer.id !== this.playerId) {
            return;
        }
        
        const card = this.deck.draw();
        currentPlayer.addCard(card);
        
        if (this.isOnline) {
            this.socket.emit('gameAction', {
                roomId: this.roomId,
                action: 'hit',
                data: { card }
            });
        }
        
        // Verificar se o jogador estourou (mais de 21)
        if (currentPlayer.getHandValue() > 21) {
            // No jogo local, após o jogador estourar, passar para o próximo jogador
            if (!this.isOnline) {
                this.currentPlayerIndex++;
                
                // Verificar se todos os jogadores já jogaram
                if (this.currentPlayerIndex >= this.players.length) {
                    // Todos os jogadores já jogaram, agora é a vez do dealer
                    this.dealerTurn();
                } else {
                    // Ainda há jogadores para jogar
                    this.startTurn();
                }
            } else {
                // No modo online, passar para o próximo jogador
                this.stand();
            }
        }
        
        this.updateUI();
    }

    stand() {
        if (this.gameState !== 'playing') return;

        const currentPlayer = this.players[this.currentPlayerIndex];
        
        if (this.isOnline && currentPlayer.id !== this.playerId) {
            return;
        }
        
        clearInterval(this.timer);
        
        if (this.isOnline) {
            this.socket.emit('gameAction', {
                roomId: this.roomId,
                action: 'stand'
            });
        }
        
        // No jogo local, após o jogador parar, é a vez do dealer
        if (!this.isOnline) {
            this.currentPlayerIndex++;
            
            // Verificar se todos os jogadores já jogaram
            if (this.currentPlayerIndex >= this.players.length) {
                // Todos os jogadores já jogaram, agora é a vez do dealer
                this.dealerTurn();
            } else {
                // Ainda há jogadores para jogar
                this.startTurn();
            }
        } else {
            // No modo online, avançar para o próximo jogador
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
        
        this.updateUI();
    }

    double() {
        if (this.gameState !== 'playing') return;

        const currentPlayer = this.players[this.currentPlayerIndex];
        
        if (this.isOnline && currentPlayer.id !== this.playerId) {
            return;
        }
        
        if (currentPlayer.hand.length === 2) {
            const card = this.deck.draw();
            currentPlayer.addCard(card);
            
            if (this.isOnline) {
                this.socket.emit('gameAction', {
                    roomId: this.roomId,
                    action: 'double',
                    data: { card }
                });
            }
            
            // No jogo local, após dobrar, passar para o próximo jogador
            if (!this.isOnline) {
                this.currentPlayerIndex++;
                
                // Verificar se todos os jogadores já jogaram
                if (this.currentPlayerIndex >= this.players.length) {
                    // Todos os jogadores já jogaram, agora é a vez do dealer
                    this.dealerTurn();
                } else {
                    // Ainda há jogadores para jogar
                    this.startTurn();
                }
            } else {
                // No modo online, passar para o próximo jogador
                this.stand();
            }
        }
        
        this.updateUI();
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
                
                // No modo online, notificar o servidor sobre a carta comprada pelo dealer
                if (this.isOnline) {
                    this.socket.emit('gameAction', {
                        roomId: this.roomId,
                        action: 'dealerHit',
                        data: { card }
                    });
                }
                
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
                action: 'roundEnd',
                data: { winners: winners.map(p => p.id) }
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

    nextRound() {
        this.currentRound++;
        
        if (this.currentRound > this.totalRounds) {
            this.endGame();
            return;
        }
        
        // Resetar o jogo para a próxima rodada
        this.deck.reset();
        for (let player of this.players) {
            player.clearHand();
        }
        this.dealer.clearHand();
        this.dealerSecondCardVisible = false;
        
        this.currentPlayerIndex = 0;
        this.gameState = 'playing';
        
        if (this.isOnline) {
            this.socket.emit('gameAction', {
                roomId: this.roomId,
                action: 'nextRound'
            });
        }
        
        // Distribuir as cartas iniciais
        this.dealInitialCards();
        
        // Atualizar a interface
        this.updateUI();
        this.startTurn();
        
        // Mostrar a tela do jogo
        this.showScreen('game-screen');
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
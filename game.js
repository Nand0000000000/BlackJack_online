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
            console.log('Sala criada:', this.roomId);
        });
        
        this.socket.on('playerJoined', (data) => {
            this.updatePlayersList(data.players);
            console.log('Jogador entrou na sala:', data.players);
        });
        
        this.socket.on('gameStarted', (data) => {
            console.log('Jogo iniciado:', data);
            this.roomId = data.roomId || this.roomId;
            this.initializeOnlineGame(data);
        });
        
        this.socket.on('gameAction', (data) => {
            console.log('Ação recebida:', data);
            this.handleGameAction(data);
        });

        this.socket.on('nextPlayer', (data) => {
            console.log('Próximo jogador:', data);
            this.currentPlayerIndex = data.currentPlayerIndex;
            const currentPlayer = this.players[this.currentPlayerIndex];
            document.getElementById('current-player').textContent = `Vez de: ${currentPlayer.name}`;
            this.updateUI();
            this.startTurn();
        });
        
        this.socket.on('playerLeft', (data) => {
            console.log('Jogador saiu:', data);
            this.handlePlayerLeft(data);
        });
        
        this.socket.on('gamePaused', (data) => {
            console.log('Jogo pausado:', data);
            this.handleGamePaused(data);
        });
        
        this.socket.on('error', (data) => {
            console.error('Erro:', data);
            alert(data.message);
        });

        this.socket.on('roundEnd', (data) => {
            console.log('Rodada finalizada:', data);
            this.gameState = 'roundEnd';
            
            if (data.dealer && data.dealer.hand) {
                this.dealer.hand = data.dealer.hand.map(card => new Card(card.suit, card.value));
            }
            
            this.updateUI();
            this.showRoundResults(data);
        });
        
        this.socket.on('newRound', (data) => {
            console.log('Nova rodada iniciada:', data);
            
            // Reseta o estado do jogo
            this.gameState = 'playing';
            this.currentPlayerIndex = data.currentPlayerIndex || 0;
            
            // Limpa as mãos dos jogadores
            this.players.forEach(player => {
                player.hand = [];
            });
            
            // Limpa a mão da banca
            this.dealer.hand = [];
            
            // Atualiza as mãos dos jogadores
            if (data.players) {
                data.players.forEach(playerData => {
                    const player = this.players.find(p => p.id === playerData.id);
                    if (player && playerData.hand) {
                        player.hand = playerData.hand.map(card => new Card(card.suit, card.value));
                    }
                });
            }
            
            // Atualiza a mão da banca
            if (data.dealer && data.dealer.hand) {
                this.dealer.hand = data.dealer.hand.map(card => new Card(card.suit, card.value));
            }
            
            // Fecha a tela de resultados se estiver aberta
            document.getElementById('round-results').style.display = 'none';
            
            // Mostra a tela do jogo
            this.showScreen('game-screen');
            
            // Atualiza a UI e inicia o turno
            this.updateUI();
            this.startTurn();
            
            console.log('Estado do jogo após nova rodada:', this.gameState);
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
    }

    joinRoom(roomId, playerName) {
        if (!this.isOnline) {
            this.connectToServer();
        }
        
        this.roomId = roomId;
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
                <h3>Sala: ${this.roomId}</h3>
                <p>Compartilhe este código com seus amigos para jogarem juntos!</p>
                <div id="players-list"></div>
                <button id="start-game-btn" class="btn-primary">Iniciar Jogo</button>
            `;
            
            document.getElementById('start-game-btn').addEventListener('click', () => {
                this.socket.emit('startGame', { roomId: this.roomId });
            });

            this.showScreen('room-screen');
        }
    }

    initializeOnlineGame(data) {
        this.totalRounds = data.settings.rounds;
        this.timeout = data.settings.timeout;
        this.currentRound = 1;
        this.gameState = 'playing';
        this.currentPlayerIndex = data.currentPlayerIndex;

        this.players = [];
        data.players.forEach(playerData => {
            const player = new Player(playerData.name, playerData.id);
            player.isHost = playerData.isHost;
            if (playerData.hand) {
                playerData.hand.forEach(cardData => {
                    player.addCard(new Card(cardData.suit, cardData.value));
                });
            }
            this.players.push(player);
        });
        
        this.dealer = new Player('Banca');
        if (data.dealer && data.dealer.hand) {
            data.dealer.hand.forEach(cardData => {
                this.dealer.addCard(new Card(cardData.suit, cardData.value));
            });
        }
        
        this.updateUI();
        this.startTurn();
        this.showScreen('game-screen');
    }

    handleGameAction(data) {
        if (!data) return;

        let player;
        if (data.playerId === 'dealer') {
            player = this.dealer;
        } else {
            player = this.players.find(p => p.id === data.playerId);
            if (!player) return;
        }

        switch (data.action) {
            case 'hit':
                if (data.data && data.data.card) {
                    player.addCard(new Card(data.data.card.suit, data.data.card.value));
                }
                break;
            case 'stand':
                // A lógica de stand é tratada pelo servidor
                break;
            case 'double':
                if (data.data && data.data.card) {
                    player.addCard(new Card(data.data.card.suit, data.data.card.value));
                }
                break;
        }
        
        this.updateUI();
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
        
        const container = document.getElementById('player-names-container');
        container.innerHTML = '';
        
        for (let i = 0; i < playerCount; i++) {
            const input = document.createElement('div');
            input.className = 'input-group';
            input.innerHTML = `
                <label for="player${i}">Nome do Jogador ${i + 1}:</label>
                <input type="text" id="player${i}" required>
            `;
            container.appendChild(input);
        }
    }

    startGame() {
        const playerCount = parseInt(document.getElementById('player-count').value);
        for (let i = 0; i < playerCount; i++) {
            const name = document.getElementById(`player${i}`).value.trim();
            if (!name) {
                alert('Por favor, insira o nome de todos os jogadores.');
                return;
            }
            this.players.push(new Player(name));
        }

        this.dealInitialCards();
        this.updateUI();
        this.startTurn();
    }

    dealInitialCards() {
        for (let i = 0; i < 2; i++) {
            for (let player of this.players) {
                const card = this.deck.draw();
                player.addCard(card);
                
                if (this.isOnline && player.id === this.playerId) {
                    this.socket.emit('gameAction', {
                        roomId: this.roomId,
                        action: 'hit',
                        data: { card }
                    });
                }
            }
            this.dealer.addCard(this.deck.draw());
        }
    }

    startTurn() {
        if (this.gameState !== 'playing') return;

        const currentPlayer = this.players[this.currentPlayerIndex];
        document.getElementById('current-player').textContent = `Vez de: ${currentPlayer.name}`;
        
        
        const isMyTurn = !this.isOnline || currentPlayer.id === this.playerId;
        
        
        document.getElementById('hit-btn').disabled = !isMyTurn;
        document.getElementById('stand-btn').disabled = !isMyTurn;
        document.getElementById('double-btn').disabled = !isMyTurn || currentPlayer.hand.length !== 2;
        
        
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

    updateTimer(timeLeft) {
        document.getElementById('timer').textContent = `Tempo: ${timeLeft}s`;
    }

    hit() {
        if (this.gameState !== 'playing') {
            console.log('Não é possível pedir carta. Estado do jogo:', this.gameState);
            return;
        }

        const currentPlayer = this.players[this.currentPlayerIndex];
        
        if (this.isOnline && currentPlayer.id !== this.playerId) {
            console.log('Não é sua vez de jogar');
            return;
        }
        
        if (this.isOnline) {
            if (!this.roomId) {
                console.error('roomId não definido');
                return;
            }
            console.log('Enviando ação hit para sala:', this.roomId);
            this.socket.emit('gameAction', {
                roomId: this.roomId,
                action: 'hit'
            });
        } else {
            const card = this.deck.draw();
            currentPlayer.addCard(card);
            
            if (currentPlayer.getHandValue() > 21) {
                this.stand();
            }
            
            this.updateUI();
        }
    }

    stand() {
        if (this.gameState !== 'playing') {
            console.log('Não é possível realizar stand. Estado do jogo:', this.gameState);
            return;
        }

        const currentPlayer = this.players[this.currentPlayerIndex];
        
        if (this.isOnline && currentPlayer.id !== this.playerId) {
            console.log('Não é sua vez de jogar');
            return;
        }
        
        clearInterval(this.timer);
        
        if (this.isOnline) {
            if (!this.roomId) {
                console.error('roomId não definido');
                return;
            }
            console.log('Enviando ação stand para sala:', this.roomId);
            this.socket.emit('gameAction', {
                roomId: this.roomId,
                action: 'stand'
            });
        } else {
            this.currentPlayerIndex++;
            
            if (this.currentPlayerIndex >= this.players.length) {
                this.dealerTurn();
            } else {
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
            if (this.isOnline) {
                if (!this.roomId) {
                    console.error('roomId não definido');
                    return;
                }
                console.log('Enviando ação double para sala:', this.roomId);
                this.socket.emit('gameAction', {
                    roomId: this.roomId,
                    action: 'double'
                });
            } else {
                const card = this.deck.draw();
                currentPlayer.addCard(card);
                this.stand();
            }
        }
    }

    dealerTurn() {
        while (this.dealer.getHandValue() < 17) {
            this.dealer.addCard(this.deck.draw());
        }
        
        this.endRound();
    }

    endRound() {
        this.gameState = 'roundEnd';
        
        
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
        
        this.showRoundResults(winners);
    }

    showRoundResults(data) {
        const resultsDiv = document.getElementById('round-results');
        resultsDiv.innerHTML = '';
        
        if (data.dealer) {
            resultsDiv.innerHTML += `
                <div class="dealer-result">
                    <h3>Banca</h3>
                    <p>Mão: ${data.dealer.value}</p>
                </div>
            `;
        }
        
        if (data.players) {
            data.players.forEach(playerData => {
                let resultText = '';
                switch (playerData.result) {
                    case 'win':
                        resultText = 'Ganhou!';
                        break;
                    case 'lose':
                        resultText = 'Perdeu!';
                        break;
                    case 'push':
                        resultText = 'Empatou!';
                        break;
                    case 'bust':
                        resultText = 'Estourou!';
                        break;
                }
                
                resultsDiv.innerHTML += `
                    <div class="player-result">
                        <h3>${playerData.name}</h3>
                        <p>Mão: ${playerData.value}</p>
                        <p>Resultado: ${resultText}</p>
                    </div>
                `;
            });
        }
        
        resultsDiv.style.display = 'block';
        this.showScreen('results-screen');
    }

    nextRound() {
        if (this.isOnline) {
            // No modo online, a troca de rodadas é controlada pelo servidor
            console.log('Aguardando servidor iniciar nova rodada...');
            return;
        }
        
        this.currentRound++;
        
        if (this.currentRound > this.totalRounds) {
            this.endGame();
            return;
        }
        
        this.deck.reset();
        for (let player of this.players) {
            player.clearHand();
        }
        this.dealer.clearHand();
        
        this.currentPlayerIndex = 0;
        this.gameState = 'playing';
        
        this.dealInitialCards();
        this.updateUI();
        this.startTurn();
    }

    endGame() {
        this.gameState = 'gameEnd';
        
        const finalResults = document.getElementById('final-results');
        finalResults.innerHTML = '';
        
        const allPlayers = [...this.players, this.dealer].sort((a, b) => b.score - a.score);
        
        allPlayers.forEach((player, index) => {
            finalResults.innerHTML += `
                <p>${index + 1}º Lugar: ${player.name} - ${player.score} pontos (${player.roundsWon} rodadas vencidas)</p>
            `;
        });
        
        this.showScreen('final-screen');
    }

    updateUI() {
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
        this.dealer.hand.forEach(card => {
            dealerCards.innerHTML += `<div class="card">${card.toString()}</div>`;
        });
        
        
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
    }

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }
}


const game = new Game();


document.addEventListener('DOMContentLoaded', () => {
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
}); 
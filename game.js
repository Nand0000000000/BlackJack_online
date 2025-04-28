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
        this.credits = 100;
        this.bet = 0;
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
        
        this.socket.on('bettingPhase', (data) => {
            console.log('Fase de apostas iniciada:', data);
            this.currentRound = data.currentRound;
            this.totalRounds = data.totalRounds;
            this.showBettingUI(data.players);
        });
        
        this.socket.on('betPlaced', (data) => {
            console.log('Aposta realizada:', data);
            this.updateBettingUI(data);
        });
        
        this.socket.on('gameStarted', (data) => {
            console.log('Jogo iniciado:', data);
            this.roomId = data.roomId || this.roomId;
            
            // Atualiza a contagem de rodadas
            if (data.currentRound) {
                this.currentRound = data.currentRound;
            }
            if (data.totalRounds) {
                this.totalRounds = data.totalRounds;
            }
            
            this.initializeOnlineGame(data);
        });
        
        this.socket.on('gameAction', (data) => {
            console.log('Ação recebida:', data);
            this.handleGameAction(data);
        });
        
        this.socket.on('revealDealerCard', (data) => {
            console.log('Carta da banca revelada:', data);
            if (data.card) {
                // Atualiza a segunda carta da banca
                this.dealer.hand[1] = new Card(data.card.suit, data.card.value);
                
                // Adiciona uma pequena animação para a revelação da carta
                const dealerCards = document.getElementById('dealer-cards');
                if (dealerCards) {
                    const secondCardElement = dealerCards.children[1];
                    if (secondCardElement) {
                        secondCardElement.classList.add('reveal-animation');
                        
                        // Atualiza o texto da carta
                        setTimeout(() => {
                            secondCardElement.textContent = `${data.card.value}${data.card.suit}`;
                            secondCardElement.classList.remove('card-back');
                        }, 500);
                    }
                }
                
                this.updateUI();
            }
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
            
            // Atualiza a contagem de rodadas
            if (data.currentRound) {
                this.currentRound = data.currentRound;
            }
            if (data.totalRounds) {
                this.totalRounds = data.totalRounds;
            }
            
            // Atualiza a mão da banca
            if (data.dealer && data.dealer.hand) {
                this.dealer.hand = data.dealer.hand.map(card => new Card(card.suit, card.value));
            }
            
            // Atualiza os créditos dos jogadores
            if (data.players) {
                data.players.forEach(playerData => {
                    const player = this.players.find(p => p.id === playerData.id);
                    if (player) {
                        player.credits = playerData.credits;
                    }
                });
            }
            
            this.updateUI();
            this.showRoundResults(data);
        });
        
        this.socket.on('gameEnd', (data) => {
            console.log('Jogo encerrado:', data);
            this.gameState = 'gameEnd';
            
            // Atualiza os créditos dos jogadores
            if (data.players) {
                data.players.forEach(playerData => {
                    const player = this.players.find(p => p.id === playerData.id);
                    if (player) {
                        player.credits = playerData.credits;
                    }
                });
            }
            
            this.showGameResults(data);
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
            player.credits = playerData.credits || 100;
            player.bet = playerData.bet || 0;
            if (playerData.hand) {
                playerData.hand.forEach(cardData => {
                    player.addCard(new Card(cardData.suit, cardData.value));
                });
            }
            this.players.push(player);
        });
        
        this.dealer = new Player('Banca');
        if (data.dealer) {
            if (data.dealer.hand) {
                data.dealer.hand.forEach(cardData => {
                    this.dealer.addCard(new Card(cardData.suit, cardData.value));
                });
            } else if (data.dealer.visibleCard) {
                // A primeira carta da banca é visível
                this.dealer.addCard(new Card(data.dealer.visibleCard.suit, data.dealer.visibleCard.value));
                // Adicione uma carta oculta como segunda carta
                this.dealer.addCard(new Card('?', '?'));
            }
        }
        
        // Fecha a tela de apostas se estiver aberta
        const bettingScreen = document.getElementById('betting-screen');
        if (bettingScreen) {
            bettingScreen.classList.remove('active');
        }
        
        this.updateUI();
        this.startTurn();
        this.showScreen('game-screen');
    }

    handleGameAction(data) {
        if (!data) return;

        // Encontra o jogador
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
                    // Atualiza a aposta se for o caso
                    if (data.data.bet && player.id === this.playerId) {
                        player.bet = data.data.bet;
                    }
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
        
        resultsDiv.innerHTML += `<h3>Rodada ${this.currentRound} de ${this.totalRounds}</h3>`;
        
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
                let resultClass = '';
                
                switch (playerData.result) {
                    case 'win':
                        resultText = 'Ganhou!';
                        resultClass = 'win';
                        break;
                    case 'lose':
                        resultText = 'Perdeu!';
                        resultClass = 'lose';
                        break;
                    case 'push':
                        resultText = 'Empatou!';
                        resultClass = 'push';
                        break;
                    case 'bust':
                        resultText = 'Estourou!';
                        resultClass = 'lose';
                        break;
                }
                
                resultsDiv.innerHTML += `
                    <div class="player-result ${resultClass}">
                        <h3>${playerData.name}</h3>
                        <p>Mão: ${playerData.value}</p>
                        <p>Aposta: ${playerData.bet}</p>
                        <p>Resultado: ${resultText}</p>
                        <p>${playerData.winnings > 0 ? `Ganhou ${playerData.winnings} créditos` : 'Perdeu a aposta'}</p>
                        <p>Créditos: ${playerData.credits}</p>
                    </div>
                `;
            });
        }
        
        // Se esta foi a última rodada, mostrar mensagem
        if (this.currentRound >= this.totalRounds) {
            resultsDiv.innerHTML += `
                <div class="final-message">
                    <h3>Final do Jogo</h3>
                    <p>Aguarde para ver os resultados finais...</p>
                </div>
            `;
        }
        
        resultsDiv.style.display = 'block';
        this.showScreen('results-screen');
    }

    showGameResults(data) {
        const finalScreen = document.getElementById('final-screen');
        const finalResults = document.getElementById('final-results');
        finalResults.innerHTML = '';
        
        finalResults.innerHTML += `<h3>Resultado Final</h3>`;
        
        if (data.players) {
            // Ordena os jogadores por créditos (do maior para o menor)
            const sortedPlayers = [...data.players].sort((a, b) => b.credits - a.credits);
            
            sortedPlayers.forEach((playerData, index) => {
                finalResults.innerHTML += `
                    <div class="player-final-result ${index === 0 ? 'winner' : ''}">
                        <h3>${index + 1}º Lugar: ${playerData.name}</h3>
                        <p>Créditos Finais: ${playerData.credits}</p>
                    </div>
                `;
            });
        }
        
        finalResults.innerHTML += `
            <button id="new-game-btn" class="btn-primary">Novo Jogo</button>
        `;
        
        this.showScreen('final-screen');
        
        // Adiciona o evento de clique para o botão de novo jogo
        document.getElementById('new-game-btn').addEventListener('click', () => {
            window.location.reload();
        });
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
        
        this.players.forEach(player => {
            scoreboard.innerHTML += `
                <p>${player.name}: ${player.credits || 0} créditos${player.bet ? ` (Aposta: ${player.bet})` : ''}</p>
            `;
        });
        
        document.getElementById('current-round').textContent = `Rodada ${this.currentRound}/${this.totalRounds}`;
        
        const dealerCards = document.getElementById('dealer-cards');
        dealerCards.innerHTML = '';
        this.dealer.hand.forEach((card, index) => {
            // Se for a segunda carta e a banca ainda não jogou, mostre-a como oculta
            if (index === 1 && this.gameState === 'playing' && card.suit === '?') {
                dealerCards.innerHTML += `<div class="card card-back">?</div>`;
            } else {
                dealerCards.innerHTML += `<div class="card">${card.toString()}</div>`;
            }
        });
        
        // Adiciona o valor das cartas da banca, mas apenas se a segunda carta for visível
        const shouldShowDealerValue = this.dealer.hand.length > 1 && this.dealer.hand[1].suit !== '?';
        const dealerArea = document.querySelector('.dealer-area');
        if (dealerArea) {
            const dealerValueElement = dealerArea.querySelector('.dealer-value');
            if (shouldShowDealerValue) {
                if (!dealerValueElement) {
                    const valueElement = document.createElement('p');
                    valueElement.className = 'dealer-value';
                    valueElement.textContent = `Valor: ${this.dealer.getHandValue()}`;
                    dealerArea.appendChild(valueElement);
                } else {
                    dealerValueElement.textContent = `Valor: ${this.dealer.getHandValue()}`;
                }
            } else if (dealerValueElement) {
                dealerValueElement.remove();
            }
        }
        
        const playersArea = document.getElementById('players-area');
        playersArea.innerHTML = '';
        
        this.players.forEach((player, index) => {
            const playerDiv = document.createElement('div');
            playerDiv.className = `player-area ${index === this.currentPlayerIndex ? 'active' : ''}`;
            playerDiv.innerHTML = `
                <h3>${player.name} ${player.bet ? `(Aposta: ${player.bet})` : ''}</h3>
                <div class="cards">
                    ${player.hand.map(card => `<div class="card">${card.toString()}</div>`).join('')}
                </div>
                <p>Valor: ${player.getHandValue()}</p>
                <p>Créditos: ${player.credits || 0}</p>
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

    showBettingUI(players) {
        const player = players.find(p => p.id === this.playerId);
        if (!player) return;
        
        // Muda o estado do jogo
        this.gameState = 'betting';
        
        // Remove a tela de apostas anterior se existir
        const oldBettingScreen = document.getElementById('betting-screen');
        if (oldBettingScreen) {
            oldBettingScreen.remove();
        }
        
        // Cria a interface de apostas
        const bettingScreen = document.createElement('div');
        bettingScreen.id = 'betting-screen';
        bettingScreen.className = 'screen';
        bettingScreen.innerHTML = `
            <h2>Fase de Apostas - Rodada ${this.currentRound} de ${this.totalRounds}</h2>
            <p>Seus créditos: <span id="player-credits">${player.credits}</span></p>
            <div class="betting-controls">
                <button id="decrease-bet">-10</button>
                <span id="current-bet">10</span>
                <button id="increase-bet">+10</button>
            </div>
            <button id="place-bet-btn" class="btn-primary">Apostar</button>
            <div id="betting-status"></div>
        `;
        
        document.body.appendChild(bettingScreen);
        
        // Fecha a tela de resultados se estiver aberta
        const resultsScreen = document.getElementById('results-screen');
        if (resultsScreen) {
            resultsScreen.classList.remove('active');
        }
        
        // Mostra a tela de apostas
        this.showScreen('betting-screen');
        
        // Inicializa o valor da aposta
        let betAmount = 10;
        document.getElementById('current-bet').textContent = betAmount;
        
        // Configura os eventos dos botões
        document.getElementById('decrease-bet').addEventListener('click', () => {
            if (betAmount > 10) {
                betAmount -= 10;
                document.getElementById('current-bet').textContent = betAmount;
            }
        });
        
        document.getElementById('increase-bet').addEventListener('click', () => {
            if (betAmount + 10 <= player.credits) {
                betAmount += 10;
                document.getElementById('current-bet').textContent = betAmount;
            }
        });
        
        document.getElementById('place-bet-btn').addEventListener('click', () => {
            this.placeBet(betAmount);
        });
        
        // Mostra as apostas dos outros jogadores
        const bettingStatus = document.getElementById('betting-status');
        bettingStatus.innerHTML = '';  // Limpa status anteriores
        players.forEach(p => {
            if (p.id !== this.playerId) {
                const playerElement = document.createElement('div');
                playerElement.id = `player-bet-${p.id}`;
                playerElement.innerHTML = `<p>${p.name}: Aguardando aposta...</p>`;
                bettingStatus.appendChild(playerElement);
            }
        });
        
        console.log('Tela de apostas exibida');
    }
    
    placeBet(amount) {
        if (this.gameState !== 'betting' || !this.isOnline) return;
        
        console.log('Enviando aposta:', amount);
        this.socket.emit('placeBet', {
            roomId: this.roomId,
            bet: amount
        });
        
        // Desabilita o botão de apostar
        document.getElementById('place-bet-btn').disabled = true;
        document.getElementById('decrease-bet').disabled = true;
        document.getElementById('increase-bet').disabled = true;
    }
    
    updateBettingUI(data) {
        const statusElement = document.getElementById(`player-bet-${data.playerId}`);
        if (statusElement) {
            statusElement.innerHTML = `<p>${data.playerName}: Apostou ${data.bet}</p>`;
        }
        
        // Se for a nossa aposta, atualize nossos créditos
        if (data.playerId === this.playerId) {
            const player = this.players.find(p => p.id === this.playerId);
            if (player) {
                player.bet = data.bet;
            }
        }
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
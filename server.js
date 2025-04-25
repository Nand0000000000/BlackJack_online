const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname)));

// Classe para representar uma carta
class Card {
    constructor(suit, value) {
        this.suit = suit;
        this.value = value;
    }

    toString() {
        return `${this.value}${this.suit}`;
    }
}

// Classe para representar um baralho
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

const rooms = {};

io.on('connection', (socket) => {
    console.log('Novo jogador conectado:', socket.id);

    socket.on('createRoom', (roomData) => {
        const roomId = generateRoomId();
        rooms[roomId] = {
            id: roomId,
            players: [{
                id: socket.id,
                name: roomData.playerName,
                isHost: true,
                hand: []
            }],
            dealer: {
                hand: []
            },
            deck: new Deck(),
            currentPlayerIndex: 0,
            gameState: 'waiting',
            settings: {
                playerCount: roomData.playerCount,
                rounds: roomData.rounds,
                timeout: roomData.timeout
            }
        };
        
        socket.join(roomId);
        socket.emit('roomCreated', { roomId, players: rooms[roomId].players });
        console.log(`Sala criada: ${roomId}`);
    });

    socket.on('joinRoom', (data) => {
        const room = rooms[data.roomId];
        
        if (!room) {
            socket.emit('error', { message: 'Sala não encontrada' });
            return;
        }
        
        if (room.players.length >= room.settings.playerCount) {
            socket.emit('error', { message: 'Sala cheia' });
            return;
        }
        
        if (room.gameState !== 'waiting') {
            socket.emit('error', { message: 'Jogo já em andamento' });
            return;
        }
        
        room.players.push({
            id: socket.id,
            name: data.playerName,
            isHost: false,
            hand: []
        });
        
        socket.join(data.roomId);
        io.to(data.roomId).emit('playerJoined', { players: room.players });
        
        if (room.players.length >= 2) {
            room.gameState = 'playing';
            io.to(data.roomId).emit('gameStarted', {
                settings: room.settings,
                players: room.players
            });
        }
    });

    socket.on('startGame', (data) => {
        const room = rooms[data.roomId];
        if (room && room.players.find(p => p.id === socket.id)?.isHost) {
            if (room.players.length < 2) {
                socket.emit('error', { message: 'É necessário pelo menos 2 jogadores para iniciar o jogo' });
                return;
            }
            
            room.gameState = 'playing';
            io.to(data.roomId).emit('gameStarted', {
                settings: room.settings,
                players: room.players
            });
        }
    });

    socket.on('dealInitialCards', (data) => {
        const room = rooms[data.roomId];
        if (room && room.gameState === 'playing') {
            // Resetar o baralho
            room.deck.reset();
            
            // Limpar as mãos dos jogadores e do dealer
            room.players.forEach(player => player.hand = []);
            room.dealer.hand = [];
            
            // Distribuir 2 cartas para cada jogador
            for (let i = 0; i < 2; i++) {
                for (let player of room.players) {
                    const card = room.deck.draw();
                    player.hand.push(card);
                }
                
                // Distribuir 2 cartas para o dealer
                const dealerCard = room.deck.draw();
                room.dealer.hand.push(dealerCard);
            }
            
            // Enviar as cartas para todos os jogadores
            io.to(data.roomId).emit('cardsDealt', {
                players: room.players,
                dealer: {
                    hand: [room.dealer.hand[0], null] // Enviar apenas a primeira carta do dealer
                }
            });
            
            // Definir o primeiro jogador
            room.currentPlayerIndex = 0;
            
            // Enviar o jogador atual para todos os jogadores
            io.to(data.roomId).emit('currentPlayer', { 
                playerId: room.players[0].id,
                timeout: room.settings.timeout
            });
        }
    });

    socket.on('gameAction', (data) => {
        const room = rooms[data.roomId];
        if (room && room.gameState === 'playing') {
            const currentPlayer = room.players[room.currentPlayerIndex];
            
            // Verificar se é a vez do jogador
            if (currentPlayer.id !== socket.id) {
                socket.emit('error', { message: 'Não é sua vez de jogar' });
                return;
            }
            
            if (data.action === 'hit') {
                // Comprar uma carta
                const card = room.deck.draw();
                currentPlayer.hand.push(card);
                
                // Enviar a carta para todos os jogadores
                io.to(data.roomId).emit('cardDrawn', {
                    playerId: socket.id,
                    card: card
                });
                
                // Verificar se o jogador estourou (mais de 21)
                if (calculateHandValue(currentPlayer.hand) > 21) {
                    // Passar para o próximo jogador
                    nextPlayer(room, data.roomId);
                }
            } else if (data.action === 'stand') {
                // Passar para o próximo jogador
                nextPlayer(room, data.roomId);
            } else if (data.action === 'double') {
                // Comprar uma carta
                const card = room.deck.draw();
                currentPlayer.hand.push(card);
                
                // Enviar a carta para todos os jogadores
                io.to(data.roomId).emit('cardDrawn', {
                    playerId: socket.id,
                    card: card
                });
                
                // Passar para o próximo jogador
                nextPlayer(room, data.roomId);
            } else if (data.action === 'dealerTurn') {
                // Revelar a segunda carta do dealer
                io.to(data.roomId).emit('dealerSecondCardRevealed', {
                    card: room.dealer.hand[1]
                });
                
                // O dealer deve comprar cartas até ter pelo menos 17 pontos
                while (calculateHandValue(room.dealer.hand) < 17) {
                    const card = room.deck.draw();
                    room.dealer.hand.push(card);
                    
                    // Enviar a carta para todos os jogadores
                    io.to(data.roomId).emit('dealerCardDrawn', {
                        card: card
                    });
                }
                
                // Finalizar a rodada
                endRound(room, data.roomId);
            } else if (data.action === 'roundEnd') {
                // Avançar para a próxima rodada
                room.currentRound = (room.currentRound || 1) + 1;
                
                if (room.currentRound > room.settings.rounds) {
                    // O jogo terminou
                    room.gameState = 'gameEnd';
                    io.to(data.roomId).emit('gameEnded', {
                        players: room.players
                    });
                } else {
                    // Distribuir novas cartas
                    io.to(data.roomId).emit('nextRound', {
                        round: room.currentRound
                    });
                }
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('Jogador desconectado:', socket.id);
        
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            
            if (playerIndex !== -1) {
                room.players.splice(playerIndex, 1);

                if (room.players.length === 0) {
                    delete rooms[roomId];
                    console.log(`Sala removida: ${roomId}`);
                } else {
                    io.to(roomId).emit('playerLeft', { 
                        playerId: socket.id,
                        players: room.players
                    });
                    
                    if (room.gameState === 'playing') {
                        room.gameState = 'paused';
                        io.to(roomId).emit('gamePaused', { message: 'Um jogador desconectou' });
                    }
                }
                break;
            }
        }
    });
});

// Função para calcular o valor da mão
function calculateHandValue(hand) {
    let value = 0;
    let aces = 0;

    for (let card of hand) {
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

// Função para passar para o próximo jogador
function nextPlayer(room, roomId) {
    room.currentPlayerIndex++;
    
    if (room.currentPlayerIndex >= room.players.length) {
        // Todos os jogadores já jogaram, agora é a vez do dealer
        io.to(roomId).emit('dealerTurn');
    } else {
        // Ainda há jogadores para jogar
        io.to(roomId).emit('currentPlayer', { 
            playerId: room.players[room.currentPlayerIndex].id,
            timeout: room.settings.timeout
        });
    }
}

// Função para finalizar a rodada
function endRound(room, roomId) {
    room.gameState = 'roundEnd';
    
    // Calcular os vencedores da rodada
    const dealerValue = calculateHandValue(room.dealer.hand);
    const winners = [];
    
    for (let player of room.players) {
        const playerValue = calculateHandValue(player.hand);
        if (playerValue <= 21 && (dealerValue > 21 || playerValue > dealerValue)) {
            winners.push(player);
        }
    }
    
    // Enviar os resultados para todos os jogadores
    io.to(roomId).emit('roundEnded', {
        dealer: room.dealer,
        winners: winners.map(p => p.id)
    });
}

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
}); 